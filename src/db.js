import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.js";

const DATA_DIR = process.env.DATA_DIR || path.join("/tmp", "sovenok-ai-bot-data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function defaultContentSettings() {
  return {
    bot: {
      greetings: {
        user: [
          "🦉 Привет{{nameSuffix}}. Я Совёнок — голосовой AI-собеседник для спокойного разговора и поддержки.",
          "",
          "Premium: {{price}} ₽/мес, до {{dailyMinutes}} минут в день.",
          "Выберите действие ниже.",
        ].join("\n"),
        admin: [
          "🦉 Добро пожаловать{{nameSuffix}}.",
          "",
          "Совёнок узнал тебя и открыл администраторский доступ.",
          "Можно разговаривать без оплаты и дневного лимита, а также редактировать тексты проекта.",
          "",
          "Нажми кнопку ниже, чтобы открыть админ-панель.",
        ].join("\n"),
      },
      buttons: {
        payment: {
          text: "Оплатить подписку",
          url: "/?screen=subscription",
        },
        support: {
          text: "Чат с поддержкой",
          url: "/?screen=support",
        },
        talk: {
          text: "Поговорить с Совёнком",
          url: "/",
        },
        adminPanel: {
          text: "Админ-Панель",
          url: "/?admin=1",
        },
      },
    },
    miniApp: {
      title: "Совёнок",
      subtitle: "Тихое место, где тебя слышат. Голосовой AI-собеседник для спокойного разговора и поддержки.",
      statusDisconnected: "Не подключён",
      statusReady: "Готов",
      statusConnecting: "Подключение…",
      statusConnected: "Совёнок рядом",
      statusTalking: "Разговор идёт",
      statusError: "Ошибка",
      statusLoginError: "Ошибка входа",
      statusDailyLimit: "Лимит на сегодня",
      statusTrialEnded: "Пробный лимит окончен",
      timerLabel: "Осталось сегодня",
      startButton: "Поговорить с Совёнком",
      stopButton: "Завершить разговор",
      initialHint: "Нажмите кнопку, разрешите микрофон и говорите естественно.",
      readyHintPremium: "Нажмите кнопку, и Совёнок начнёт голосовой разговор.",
      readyHintTrial: "У вас есть пробные минуты для теста Совёнка.",
      readyHintAdmin: "Администраторский доступ активен. Можно разговаривать с Совёнком без оплаты и дневного лимита.",
      micHint: "Запрашиваю доступ к микрофону и создаю защищённую голосовую сессию.",
      talkingHint: "Говорите естественно. Совёнок услышит вас и ответит голосом.",
      sessionEndedHint: "Разговор завершён. Можно начать новую сессию, если лимит ещё остался.",
      limitTodayHint: "На сегодня лимит разговора закончился. Завтра снова будет до 60 минут.",
      trialEndedHint: "Пробный доступ закончился. Нужна подписка Совёнок Premium.",
      limitSoonHint: "Осталось около 10 минут. Совёнок поможет мягко подвести итог разговора.",
      limitEndedHint: "Лимит разговора закончился. Сессия будет завершена.",
      openViaTelegramHint: "Откройте приложение через Telegram-бота. В обычном браузере авторизация Telegram недоступна.",
      voiceSessionErrorHint: "Совёнок получил ошибку от голосовой сессии. Попробуйте завершить и начать снова.",
      connectErrorFallback: "Не удалось начать разговор.",
      premiumTitle: "Совёнок Premium",
      premiumDescription: "<b>12 990 ₽/мес</b> · до 60 минут голосового разговора в день.",
      premiumSmall: "Сейчас в MVP подписка выдаётся администратором вручную. Эквайринг можно подключить следующим этапом.",
      premiumAdminSmall: "Администраторский доступ активен: без оплаты и без дневного лимита.",
      premiumActiveSmall: "Premium активен. До 60 минут голосового разговора в день.",
      safetyTitle: "Важно",
      safetyText: "Совёнок — AI-помощник поддержки, а не врач и не замена психотерапевту. При угрозе жизни, самоповреждении или насилии обратитесь к близкому человеку, специалисту или в экстренную службу.",
      paymentTitle: "Оплата подписки",
      paymentText: "Оплата пока подключается. Напишите в поддержку, чтобы оформить доступ вручную.",
      supportTitle: "Поддержка",
      supportText: "Напишите администратору, если нужна помощь с оплатой, доступом или работой Совёнка.",
      adminPanelTitle: "Админ-Панель",
      adminPanelSubtitle: "Редактируйте приветствия, инлайн-кнопки и тексты Mini App без правки кода.",
      adminSaveButton: "Сохранить изменения",
      adminSaved: "Сохранено. Новые тексты применятся сразу.",
      adminForbidden: "Админ-панель доступна только администраторам.",
      adminLoadError: "Не удалось загрузить админ-панель.",
      adminSaveError: "Не удалось сохранить изменения.",
    },
  };
}

function emptyDb() {
  return {
    users: {},
    usage: {},
    sessions: {},
    events: [],
    content: defaultContentSettings(),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeKnownSettings(defaults, source) {
  const result = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  if (!isPlainObject(source)) return result;

  for (const [key, value] of Object.entries(source)) {
    if (!(key in defaults)) continue;
    if (isPlainObject(defaults[key])) {
      result[key] = mergeKnownSettings(defaults[key], value);
    } else if (value !== undefined && value !== null) {
      result[key] = String(value).slice(0, 5000);
    }
  }

  return result;
}

function normalizeContentSettings(value) {
  return mergeKnownSettings(defaultContentSettings(), value);
}

function normalizeDb(raw) {
  const base = emptyDb();
  const db = isPlainObject(raw) ? raw : {};

  return {
    ...base,
    ...db,
    users: isPlainObject(db.users) ? db.users : base.users,
    usage: isPlainObject(db.usage) ? db.usage : base.usage,
    sessions: isPlainObject(db.sessions) ? db.sessions : base.sessions,
    events: Array.isArray(db.events) ? db.events : base.events,
    content: normalizeContentSettings(db.content),
  };
}

function ensureDbFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2));
}

function readDb() {
  ensureDbFile();
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  ensureDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(normalizeDb(db), null, 2));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function usageKey(userId, date = new Date()) {
  return `${userId}:${todayKey(date)}`;
}

function normalizeUsername(username = "") {
  return String(username).trim().replace(/^@/, "").toLowerCase();
}

function isConfiguredAdmin(tgUser = {}) {
  const id = String(tgUser.id || "");
  const username = normalizeUsername(tgUser.username);

  return (
    config.telegram.adminIds.includes(id) ||
    config.telegram.autoAdminIds.includes(id) ||
    (username && config.telegram.autoAdminUsernames.includes(username))
  );
}

export function getContentSettings() {
  const db = readDb();
  return db.content;
}

export function updateContentSettings(contentPatch = {}) {
  const db = readDb();
  const nextContent = normalizeContentSettings(mergeKnownSettings(db.content, contentPatch));

  db.content = nextContent;
  db.events.push({ type: "update_content", createdAt: new Date().toISOString() });
  writeDb(db);

  return nextContent;
}

export function upsertUser(tgUser) {
  const db = readDb();
  const now = new Date().toISOString();
  const id = String(tgUser.id);
  const existing = db.users[id] || {};
  const admin = Boolean(existing.isAdmin || isConfiguredAdmin(tgUser));

  const next = {
    telegramId: id,
    firstName: tgUser.firstName || existing.firstName || "",
    lastName: tgUser.lastName || existing.lastName || "",
    username: tgUser.username || existing.username || "",
    languageCode: tgUser.languageCode || existing.languageCode || "ru",
    premiumUntil: existing.premiumUntil || null,
    isAdmin: admin,
    adminGrantedAt: admin ? existing.adminGrantedAt || now : existing.adminGrantedAt || null,
    adminWelcomeSentAt: existing.adminWelcomeSentAt || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  db.users[id] = next;

  if (admin && !existing.isAdmin) {
    db.events.push({ type: "grant_admin", userId: id, username: next.username, createdAt: now });
  }

  writeDb(db);
  return next;
}

export function getUser(userId) {
  const db = readDb();
  return db.users[String(userId)] || null;
}

export function isAdmin(userId) {
  const id = String(userId);
  if (config.telegram.adminIds.includes(id) || config.telegram.autoAdminIds.includes(id)) return true;
  const user = getUser(id);
  return Boolean(user?.isAdmin);
}

export function markAdminWelcomeSent(userId) {
  const db = readDb();
  const id = String(userId);
  if (!db.users[id]) return null;

  db.users[id].adminWelcomeSentAt = new Date().toISOString();
  db.users[id].updatedAt = new Date().toISOString();
  writeDb(db);
  return db.users[id];
}

export function grantPremium(userId, days = 30) {
  const db = readDb();
  const id = String(userId);
  const now = Date.now();
  const currentUntil = db.users[id]?.premiumUntil ? Date.parse(db.users[id].premiumUntil) : 0;
  const base = Math.max(now, Number.isNaN(currentUntil) ? 0 : currentUntil);
  const premiumUntil = new Date(base + Number(days) * 24 * 60 * 60 * 1000).toISOString();

  db.users[id] = {
    telegramId: id,
    firstName: db.users[id]?.firstName || "",
    lastName: db.users[id]?.lastName || "",
    username: db.users[id]?.username || "",
    languageCode: db.users[id]?.languageCode || "ru",
    premiumUntil,
    isAdmin: Boolean(db.users[id]?.isAdmin),
    adminGrantedAt: db.users[id]?.adminGrantedAt || null,
    adminWelcomeSentAt: db.users[id]?.adminWelcomeSentAt || null,
    createdAt: db.users[id]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.events.push({ type: "grant_premium", userId: id, days: Number(days), createdAt: new Date().toISOString() });
  writeDb(db);
  return db.users[id];
}

export function revokePremium(userId) {
  const db = readDb();
  const id = String(userId);
  if (!db.users[id]) return null;
  db.users[id].premiumUntil = null;
  db.users[id].updatedAt = new Date().toISOString();
  db.events.push({ type: "revoke_premium", userId: id, createdAt: new Date().toISOString() });
  writeDb(db);
  return db.users[id];
}

export function isPremium(userId) {
  if (isAdmin(userId)) return true;
  const user = getUser(userId);
  if (!user?.premiumUntil) return false;
  return Date.parse(user.premiumUntil) > Date.now();
}

export function getDailyUsageSeconds(userId, date = new Date()) {
  const db = readDb();
  return Number(db.usage[usageKey(userId, date)]?.seconds || 0);
}

export function getMonthlyUsageSeconds(userId, date = new Date()) {
  const db = readDb();
  const prefix = `${userId}:${monthKey(date)}`;
  return Object.entries(db.usage)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((sum, [, value]) => sum + Number(value.seconds || 0), 0);
}

export function getTotalUsageSeconds(userId) {
  const db = readDb();
  const prefix = `${userId}:`;
  return Object.entries(db.usage)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((sum, [, value]) => sum + Number(value.seconds || 0), 0);
}

export function addUsageSeconds(userId, seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!safeSeconds) return;

  const db = readDb();
  const key = usageKey(userId);
  const current = db.usage[key] || { userId: String(userId), date: todayKey(), seconds: 0, updatedAt: null };
  current.seconds = Number(current.seconds || 0) + safeSeconds;
  current.updatedAt = new Date().toISOString();
  db.usage[key] = current;
  writeDb(db);
}

export function getAccessInfo(userId) {
  const admin = isAdmin(userId);
  const premium = isPremium(userId);
  const dailyUsed = getDailyUsageSeconds(userId);
  const monthlyUsed = getMonthlyUsageSeconds(userId);
  const totalUsed = getTotalUsageSeconds(userId);

  if (admin) {
    return {
      admin: true,
      unlimited: true,
      premium: true,
      tariffName: "Администратор Совёнка",
      priceRub: 0,
      dailyLimitSeconds: null,
      monthlyLimitSeconds: null,
      dailyUsedSeconds: dailyUsed,
      monthlyUsedSeconds: monthlyUsed,
      totalUsedSeconds: totalUsed,
      dailyRemainingSeconds: null,
      monthlyRemainingSeconds: null,
      allowedSeconds: null,
    };
  }

  const dailyLimit = premium ? config.product.dailyLimitSeconds : config.product.trialSeconds;
  const monthlyLimit = premium ? config.product.monthlyLimitSeconds : config.product.trialSeconds;

  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
  const trialRemaining = Math.max(0, config.product.trialSeconds - totalUsed);

  return {
    admin: false,
    unlimited: false,
    premium,
    tariffName: premium ? config.product.name : "Пробный доступ",
    priceRub: premium ? config.product.priceRub : 0,
    dailyLimitSeconds: dailyLimit,
    monthlyLimitSeconds: monthlyLimit,
    dailyUsedSeconds: dailyUsed,
    monthlyUsedSeconds: monthlyUsed,
    totalUsedSeconds: totalUsed,
    dailyRemainingSeconds: premium ? dailyRemaining : Math.min(dailyRemaining, trialRemaining),
    monthlyRemainingSeconds: premium ? monthlyRemaining : trialRemaining,
    allowedSeconds: premium ? Math.min(dailyRemaining, monthlyRemaining) : trialRemaining,
  };
}

export function createActiveSession(userId) {
  const access = getAccessInfo(userId);
  if (!access.unlimited && access.allowedSeconds <= 0) {
    const error = new Error("Daily or trial limit exceeded");
    error.statusCode = 429;
    throw error;
  }

  const db = readDb();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  db.sessions[sessionId] = {
    sessionId,
    userId: String(userId),
    startedAtMs: now,
    lastAccountedAtMs: now,
    closedAtMs: null,
    createdAt: new Date(now).toISOString(),
  };
  writeDb(db);
  return {
    sessionId,
    allowedSeconds: access.unlimited ? null : access.allowedSeconds,
    unlimited: access.unlimited,
  };
}

export function accountSessionUsage(userId, sessionId, close = false) {
  const db = readDb();
  const session = db.sessions[String(sessionId)];
  if (!session || session.userId !== String(userId) || session.closedAtMs) {
    return { ok: false, accountedSeconds: 0, shouldStop: false };
  }

  const accessBefore = getAccessInfo(userId);
  const now = Date.now();
  const elapsed = Math.max(0, Math.floor((now - Number(session.lastAccountedAtMs || session.startedAtMs)) / 1000));
  const accounted = accessBefore.unlimited ? elapsed : Math.min(elapsed, Math.max(0, accessBefore.allowedSeconds));

  if (accounted > 0) {
    const key = usageKey(userId);
    const current = db.usage[key] || { userId: String(userId), date: todayKey(), seconds: 0, updatedAt: null };
    current.seconds = Number(current.seconds || 0) + accounted;
    current.updatedAt = new Date().toISOString();
    db.usage[key] = current;
  }

  session.lastAccountedAtMs = now;
  if (close || (!accessBefore.unlimited && accessBefore.allowedSeconds <= accounted)) session.closedAtMs = now;
  db.sessions[String(sessionId)] = session;
  writeDb(db);

  const accessAfter = getAccessInfo(userId);
  return {
    ok: true,
    accountedSeconds: accounted,
    shouldStop: !accessAfter.unlimited && accessAfter.allowedSeconds <= 0,
    access: accessAfter,
  };
}

export function listUsers(limit = 20) {
  const db = readDb();
  return Object.values(db.users)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}
