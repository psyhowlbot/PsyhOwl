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
  grantPremium,
  isAdmin,
  listUsers,
  markAdminWelcomeSent,
  revokePremium,
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

function adminWelcomeText(user) {
  const name = user.firstName ? `, ${user.firstName}` : "";

  return [
    `🦉 Добро пожаловать${name}.`,
    "",
    "Совёнок узнал тебя и открыл администраторский доступ.",
    "Теперь ты можешь разговаривать со мной без оплаты и без дневного лимита.",
    "",
    "Рад, что ты здесь. Нажимай кнопку ниже — я рядом.",
  ].join("\n");
}

async function sendAdminWelcomeIfNeeded(bot, chatId, user, replyMarkup) {
  if (!user?.isAdmin || user.adminWelcomeSentAt) return;

  await bot.sendMessage(chatId, adminWelcomeText(user), { reply_markup: replyMarkup });
  markAdminWelcomeSent(user.telegramId);
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

app.get("/api/me", requireTelegramUser, (req, res) => {
  const user = upsertUser(req.telegramUser);
  const access = getAccessInfo(user.telegramId);

  res.json({
    ok: true,
    user,
    access,
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

  const appButton = {
    text: "Поговорить с Совёнком",
    web_app: { url: config.publicAppUrl },
  };

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

    const replyMarkup = {
      inline_keyboard: [[{ text: appButton.text, web_app: appButton.web_app }]],
    };

    await sendAdminWelcomeIfNeeded(bot, chatId, user, replyMarkup);

    const text = [
      "🦉 Привет. Я Совёнок — голосовой AI-собеседник для спокойного разговора и поддержки.",
      "",
      `Premium: ${config.product.priceRub.toLocaleString("ru-RU")} ₽/мес, до 60 минут в день.`,
      "Нажмите кнопку ниже, чтобы открыть Mini App.",
    ].join("\n");

    await bot.sendMessage(chatId, text, { reply_markup: replyMarkup });
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

  fetch(`https://api.telegram.org/bot${config.telegram.botToken}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Совёнок",
        web_app: { url: config.publicAppUrl },
      },
    }),
  }).catch((error) => console.warn("setChatMenuButton failed", error.message));

  bot.on("polling_error", (error) => console.error("Telegram polling error", error.message));
  console.log("Telegram bot started");
  return bot;
}

app.listen(config.port, () => {
  console.log(`HTTP server started on port ${config.port}`);
  console.log(`Mini App URL: ${config.publicAppUrl}`);
  startTelegramBot();
});
