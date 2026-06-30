import crypto from "crypto";
import { config } from "./config.js";

function timingSafeEqualHex(a, b) {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyTelegramInitData(initDataRaw) {
  if (!initDataRaw || typeof initDataRaw !== "string") {
    return { ok: false, reason: "empty_init_data" };
  }

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.telegram.botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!timingSafeEqualHex(calculatedHash, hash)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const maxAgeSeconds = 60 * 60 * 24;
  const now = Math.floor(Date.now() / 1000);
  if (authDate && now - authDate > maxAgeSeconds) {
    return { ok: false, reason: "expired_init_data" };
  }

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    return { ok: false, reason: "bad_user_json" };
  }

  if (!user?.id) return { ok: false, reason: "missing_user" };

  return {
    ok: true,
    user: {
      id: String(user.id),
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      username: user.username || "",
      languageCode: user.language_code || "ru",
    },
  };
}

export function getTelegramUserFromRequest(req) {
  const initData = req.get("X-Telegram-Init-Data") || "";

  if (!config.telegram.requireAuth) {
    return {
      id: "demo-user",
      firstName: "Demo",
      lastName: "",
      username: "demo",
      languageCode: "ru",
    };
  }

  const result = verifyTelegramInitData(initData);
  if (!result.ok) {
    const error = new Error(`Telegram auth failed: ${result.reason}`);
    error.statusCode = 401;
    throw error;
  }

  return result.user;
}

export function requireTelegramUser(req, res, next) {
  try {
    req.telegramUser = getTelegramUserFromRequest(req);
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({
      ok: false,
      error: "telegram_auth_failed",
      message: "Откройте приложение через Telegram-бота.",
    });
  }
}

export function makeSafetyIdentifier(userId) {
  return crypto
    .createHash("sha256")
    .update(`telegram:${userId}`)
    .digest("hex")
    .slice(0, 64);
}
