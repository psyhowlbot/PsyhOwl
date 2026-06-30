import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function emptyDb() {
  return {
    users: {},
    usage: {},
    sessions: {},
    events: [],
  };
}

function ensureDbFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2));
}

function readDb() {
  ensureDbFile();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  ensureDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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
