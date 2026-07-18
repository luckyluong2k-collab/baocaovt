const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { getConfig } = require("./src/config");
const { sendUndeliveredReport } = require("./src/reports/undeliveredReport");
const { runBotCheck } = require("./src/scheduler");
const { router } = require("./src/server");

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const VIETTELPOST_TOKEN = defineSecret("VIETTELPOST_TOKEN");
const VIETTELPOST_PASSWORD = defineSecret("VIETTELPOST_PASSWORD");
const ADMIN_API_KEY = defineSecret("ADMIN_API_KEY");
const VIETTELPOST_WEBHOOK_SECRET = defineSecret("VIETTELPOST_WEBHOOK_SECRET");

const runtimeOptions = {
  region: "asia-southeast1",
  timeoutSeconds: 540,
  memory: "512MiB",
  secrets: [
    TELEGRAM_BOT_TOKEN,
    VIETTELPOST_TOKEN,
    VIETTELPOST_PASSWORD,
    ADMIN_API_KEY,
    VIETTELPOST_WEBHOOK_SECRET
  ]
};

function applyFirebaseRuntimeEnv() {
  process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || "firestore";
  process.env.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1003931579210";
  process.env.TELEGRAM_DRY_RUN = process.env.TELEGRAM_DRY_RUN || "false";
  process.env.TIMEZONE = process.env.TIMEZONE || "Asia/Ho_Chi_Minh";
  process.env.MASK_PHONE = process.env.MASK_PHONE || "false";
  process.env.TELEGRAM_BOT_TOKEN = TELEGRAM_BOT_TOKEN.value() || process.env.TELEGRAM_BOT_TOKEN || "";
  process.env.VIETTELPOST_TOKEN = VIETTELPOST_TOKEN.value() || process.env.VIETTELPOST_TOKEN || "";
  process.env.VIETTELPOST_PASSWORD = VIETTELPOST_PASSWORD.value() || process.env.VIETTELPOST_PASSWORD || "";
  process.env.ADMIN_API_KEY = ADMIN_API_KEY.value() || process.env.ADMIN_API_KEY || "";
  process.env.VIETTELPOST_WEBHOOK_SECRET =
    VIETTELPOST_WEBHOOK_SECRET.value() || process.env.VIETTELPOST_WEBHOOK_SECRET || "";
}

exports.api = onRequest(runtimeOptions, async (request, response) => {
  applyFirebaseRuntimeEnv();
  return router(request, response, getConfig());
});

exports.scheduledCheck = onSchedule(
  {
    ...runtimeOptions,
    schedule: "every 60 minutes",
    timeZone: "Asia/Ho_Chi_Minh"
  },
  async () => {
    applyFirebaseRuntimeEnv();
    if (String(process.env.ENABLE_SCHEDULED_CHECK || "false").toLowerCase() !== "true") {
      return;
    }
    await runBotCheck(getConfig());
  }
);

exports.scheduledUndeliveredReport = onSchedule(
  {
    ...runtimeOptions,
    schedule: "0 8 * * *",
    timeZone: "Asia/Ho_Chi_Minh"
  },
  async () => {
    applyFirebaseRuntimeEnv();
    if (String(process.env.SEND_DAILY_UNDELIVERED_REPORT || "false").toLowerCase() !== "true") {
      return;
    }
    await sendUndeliveredReport(getConfig());
  }
);
