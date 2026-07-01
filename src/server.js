import express from "express";
import helmet from "helmet";
import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";
import { config, assertRuntimeConfig } from "./config.js";
import { SOVENOK_SYSTEM_PROMPT } from "./sovenokPrompt.js";
import {
  accountSessionUsage,
  createActiveSession,
  getAccessInfo,
  getContentSettings,
  grantPremium,
  isAdmin,
  listUsers,
  revokePremium,
  updateContentSettings,
  upsertUser,
} from "./db.js";
import { makeSafetyIdentifier, requireTelegramUser } from "./telegramAuth.js";

assertRuntimeConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function secondsToText(seconds) {
  if (seconds === null || seconds === undefined) return "без лимита";
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  if (m <= 0) return `${s} сек.`;
  return `${m} мин. ${s.toString().padStart(2, "0")} сек.`;
}

function renderTemplate(template, user = {}) {
  const firstName = String(user.firstName || "").trim();
  const username = String(user.username || "").trim();
  const dailyMinutes = Math.round(config.product.dailyLimitSeconds / 60);
  const values = {
    name: firstName,
    firstName,
    username,
    nameSuffix: firstName ? `, ${firstName}` : "",
    price: config.product.priceRub.toLocaleString("ru-RU"),
    dailyMinutes: String(dailyMinutes),
    productName: config.product.name,
    appName: "Совёнок",
  };

  return String(template || "").replace(/{{\s*([\w]+)\s*}}/g, (_, key) => values[key] ?? "");
}

function appUrl(pathOrUrl = "/") {
  const raw = String(pathOrUrl || "/").trim();

  if (/^(https?:|tg:)/i.test(raw)) return raw;

  try {
    return new URL(raw.startsWith("/") ? raw : `/${raw}`, config.publicAppUrl).toString();
  } catch {
    return config.publicAppUrl;
  }
}

function makeInlineButton(buttonConfig = {}, fallbackText, fallbackUrl = "/") {
  const text = String(buttonConfig.text || fallbackText).trim() || fallbackText;
  const target = appUrl(buttonConfig.url || fallbackUrl);

  try {
    const targetUrl = new URL(target);
    const publicUrl = new URL(config.publicAppUrl);

    if (targetUrl.protocol === "https:" && targetUrl.origin === publicUrl.origin) {
      return { text, web_app: { url: targetUrl.toString() } };
    }
  } catch {
    return { text, web_app: { url: config.publicAppUrl } };
  }

  return { text, url: target };
}

function requireAdminUser(req, res, next) {
  const user = upsertUser(req.telegramUser);

  if (!isAdmin(user.telegramId)) {
    return res.status(403).json({ ok: false, error: "admin_required", message: "Админ-панель доступна только администраторам." });
  }

  req.currentUser = user;
  next();
}

function requireOpenAiKey(req, res, next) {
  if (!config.openai.apiKey) {
    return res.status(500).json({
      ok: false,
      error: "openai_key_missing",
      message: "OPENAI_API_KEY не задан в .env на сервере.",
    });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "sovenok-ai-bot", time: new Date().toISOString() });
});

app.get("/api/content", (req, res) => {
  res.json({ ok: true, content: getContentSettings() });
});

app.get("/api/me", requireTelegramUser, (req, res) => {
  const user = upsertUser(req.telegramUser);
  const access = getAccessInfo(user.telegramId);

  res.json({
    ok: true,
    user,
    access,
    content: getContentSettings().miniApp,
    product: {
      name: config.product.name,
      priceRub: config.product.priceRub,
      dailyLimitSeconds: config.product.dailyLimitSeconds,
      monthlyLimitSeconds: config.product.monthlyLimitSeconds,
      model: config.openai.model,
      voice: config.openai.voice,
    },
  });
});

app.get("/api/admin/content", requireTelegramUser, requireAdminUser, (req, res) => {
  res.json({ ok: true, content: getContentSettings() });
});

app.put("/api/admin/content", requireTelegramUser, requireAdminUser, (req, res) => {
  const content = updateContentSettings(req.body?.content || {});
  res.json({ ok: true, content });
});

app.post("/api/usage/heartbeat", requireTelegramUser, (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "missing_session_id" });
  }

  const result = accountSessionUsage(req.telegramUser.id, sessionId, false);
  res.json({ ok: true, ...result });
});

app.post("/api/usage/end", requireTelegramUser, (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "missing_session_id" });
  }

  const result = accountSessionUsage(req.telegramUser.id, sessionId, true);
  res.json({ ok: true, ...result });
});

app.post(
  "/api/realtime/session",
  express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }),
  requireTelegramUser,
  requireOpenAiKey,
  async (req, res) => {
    const user = upsertUser(req.telegramUser);
    const access = getAccessInfo(user.telegramId);

    if (!access.unlimited && access.allowedSeconds <= 0) {
      return res.status(429).json({
        ok: false,
        error: access.premium ? "daily_limit_exceeded" : "trial_limit_exceeded",
        message: access.premium
          ? "Лимит на сегодня закончился. Возвращайтесь завтра."
          : "Пробный лимит закончился. Нужна подписка Совёнок Premium.",
        access,
      });
    }

    if (!req.body || typeof req.body !== "string") {
      return res.status(400).json({ ok: false, error: "missing_sdp" });
    }

    let active;
    try {
      active = createActiveSession(user.telegramId);
    } catch (error) {
      return res.status(error.statusCode || 429).json({ ok: false, error: "limit_exceeded" });
    }

    const sessionConfig = JSON.stringify({
      type: "realtime",
      model: config.openai.model,
      instructions: SOVENOK_SYSTEM_PROMPT,
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            interrupt_response: true,
            create_response: true,
          },
        },
        output: {
          voice: config.openai.voice,
        },
      },
      reasoning: {
        effort: config.openai.reasoningEffort,
      },
      tracing: null,
    });

    try {
      const fd = new FormData();
      fd.set("sdp", req.body);
      fd.set("session", sessionConfig);

      const openAiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
          "OpenAI-Safety-Identifier": makeSafetyIdentifier(user.telegramId),
        },
        body: fd,
      });

      const answerSdp = await openAiResponse.text();

      if (!openAiResponse.ok) {
        accountSessionUsage(user.telegramId, active.sessionId, true);
        console.error("OpenAI Realtime error", openAiResponse.status, answerSdp);
        return res.status(502).json({
          ok: false,
          error: "openai_realtime_error",
          status: openAiResponse.status,
          message: answerSdp.slice(0, 500),
        });
      }

      res.setHeader("Content-Type", "application/sdp");
      res.setHeader("X-Sovenok-Session-Id", active.sessionId);
      res.setHeader("X-Sovenok-Unlimited", active.unlimited ? "1" : "0");
      if (!active.unlimited) {
        res.setHeader("X-Sovenok-Allowed-Seconds", String(active.allowedSeconds));
      }
      return res.send(answerSdp);
    } catch (error) {
      accountSessionUsage(user.telegramId, active.sessionId, true);
      console.error("Realtime session creation failed", error);
      return res.status(500).json({
        ok: false,
        error: "realtime_session_failed",
        message: "Не удалось создать голосовую сессию.",
      });
    }
  }
);

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function startTelegramBot() {
  if (!config.telegram.botToken) {
    console.warn("Telegram bot is not started: TELEGRAM_BOT_TOKEN is empty");
    return null;
  }

  const bot = new TelegramBot(config.telegram.botToken, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from || {};
    const user = upsertUser({
      id: String(from.id),
      firstName: from.first_name || "",
      lastName: from.last_name || "",
      username: from.username || "",
      languageCode: from.language_code || "ru",
    });
    const content = getContentSettings();

    if (user.isAdmin) {
      const replyMarkup = {
        inline_keyboard: [[makeInlineButton(content.bot.buttons.adminPanel, "Админ-Панель", "/?admin=1")]],
      };

      await bot.sendMessage(chatId, renderTemplate(content.bot.greetings.admin, user), { reply_markup: replyMarkup });
      return;
    }

    const replyMarkup = {
      inline_keyboard: [
        [makeInlineButton(content.bot.buttons.talk, "Поговорить с Совёнком", "/")],
        [
          makeInlineButton(content.bot.buttons.payment, "Оплатить подписку", "/?screen=subscription"),
          makeInlineButton(content.bot.buttons.support, "Чат с поддержкой", "/?screen=support"),
        ],
      ],
    };

    await bot.sendMessage(chatId, renderTemplate(content.bot.greetings.user, user), { reply_markup: replyMarkup });
  });

  bot.onText(/\/status/, async (msg) => {
    const from = msg.from || {};
    upsertUser({
      id: String(from.id),
      firstName: from.first_name || "",
      lastName: from.last_name || "",
      username: from.username || "",
      languageCode: from.language_code || "ru",
    });
    const access = getAccessInfo(String(from.id));
    await bot.sendMessage(
      msg.chat.id,
      [
        `Тариф: ${access.tariffName}`,
        `Осталось сегодня: ${secondsToText(access.dailyRemainingSeconds)}`,
        `Осталось в месяце: ${secondsToText(access.monthlyRemainingSeconds)}`,
      ].join("\n")
    );
  });

  bot.onText(/\/id/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `Ваш Telegram ID: ${msg.from?.id}`);
  });

  bot.onText(/\/grant\s+(\d+)\s*(\d+)?/, async (msg, match) => {
    const adminId = String(msg.from?.id || "");
    if (!isAdmin(adminId)) return bot.sendMessage(msg.chat.id, "Команда доступна только администратору.");
    const userId = match[1];
    const days = Number(match[2] || 30);
    const user = grantPremium(userId, days);
    await bot.sendMessage(msg.chat.id, `✅ Premium выдан пользователю ${userId} на ${days} дн.\nДо: ${user.premiumUntil}`);
  });

  bot.onText(/\/revoke\s+(\d+)/, async (msg, match) => {
    const adminId = String(msg.from?.id || "");
    if (!isAdmin(adminId)) return bot.sendMessage(msg.chat.id, "Команда доступна только администратору.");
    revokePremium(match[1]);
    await bot.sendMessage(msg.chat.id, `✅ Premium отключён у пользователя ${match[1]}`);
  });

  bot.onText(/\/users/, async (msg) => {
    const adminId = String(msg.from?.id || "");
    if (!isAdmin(adminId)) return bot.sendMessage(msg.chat.id, "Команда доступна только администратору.");
    const rows = listUsers(30).map((u) => {
      const access = getAccessInfo(u.telegramId);
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "без имени";
      const username = u.username ? `@${u.username}` : "";
      const badge = access.admin ? " 🛡️" : "";
      return `${u.telegramId} — ${name} ${username}${badge} — ${access.tariffName}`;
    });
    await bot.sendMessage(msg.chat.id, rows.length ? rows.join("\n") : "Пользователей пока нет.");
  });

  bot.setMyCommands([
    { command: "start", description: "Открыть Совёнка" },
    { command: "status", description: "Проверить лимиты" },
    { command: "id", description: "Показать мой Telegram ID" },
  ]).catch((error) => console.warn("setMyCommands failed", error.message));

  bot.on("polling_error", (error) => console.error("Telegram polling error", error.message));
  console.log("Telegram bot started");
  return bot;
}

app.listen(config.port, () => {
  console.log(`HTTP server started on port ${config.port}`);
  console.log(`Mini App URL: ${config.publicAppUrl}`);
  startTelegramBot();
});
