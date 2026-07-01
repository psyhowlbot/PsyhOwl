import dotenv from "dotenv";

dotenv.config();

const TIMEWEB_APP_URL = "https://psyhowlbot-psyhowl-5f93.twc1.net";

const splitIds = (value = "") =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const splitUsernames = (value = "") =>
  value
    .split(",")
    .map((v) => v.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);

const unique = (values) => [...new Set(values.filter(Boolean))];

function publicAppUrl() {
  const value = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (!value) return TIMEWEB_APP_URL;
  if (value === "https://example.com") return TIMEWEB_APP_URL;
  if (value === "https://your-domain.com") return TIMEWEB_APP_URL;
  if (value === "http://localhost:3000" && process.env.NODE_ENV === "production") return TIMEWEB_APP_URL;
  return value;
}

const autoAdminIds = splitIds(process.env.AUTO_ADMIN_TELEGRAM_IDS || "8707664475");
const autoAdminUsernames = splitUsernames(
  process.env.AUTO_ADMIN_TELEGRAM_USERNAMES || "bo0odyaa,twystedgeniusbaby"
);

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  trustProxy: process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true",

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    adminIds: unique([...splitIds(process.env.ADMIN_TELEGRAM_IDS), ...autoAdminIds]),
    autoAdminIds,
    autoAdminUsernames,
    requireAuth: process.env.REQUIRE_TELEGRAM_AUTH !== "false",
  },

  publicAppUrl: publicAppUrl(),

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2",
    voice: process.env.OPENAI_REALTIME_VOICE || "marin",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
  },

  product: {
    name: process.env.PRODUCT_NAME || "Совёнок Premium",
    priceRub: Number(process.env.PRICE_RUB || 12990),
    dailyLimitSeconds: Number(process.env.DAILY_LIMIT_SECONDS || 3600),
    monthlyLimitSeconds: Number(process.env.MONTHLY_LIMIT_SECONDS || 108000),
    trialSeconds: Number(process.env.TRIAL_SECONDS || 600),
  },
};

export function assertRuntimeConfig() {
  const problems = [];

  if (!config.telegram.botToken) {
    problems.push("TELEGRAM_BOT_TOKEN is empty");
  }

  if (!config.openai.apiKey) {
    problems.push("OPENAI_API_KEY is empty");
  }

  if (config.nodeEnv === "production" && !config.publicAppUrl.startsWith("https://")) {
    problems.push("PUBLIC_APP_URL must be HTTPS in production for Telegram Mini Apps and microphone access");
  }

  if (problems.length) {
    console.warn("⚠️ Configuration warnings:\n- " + problems.join("\n- "));
  }
}
