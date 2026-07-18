const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
let envLoaded = false;

function loadEnvFile(filePath = process.env.ENV_FILE || path.join(projectRoot, ".env")) {
  if (envLoaded || !fs.existsSync(filePath)) {
    envLoaded = true;
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  envLoaded = true;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function csvEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .sort((a, b) => a - b);
}

function stringCsvEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveProjectPath(value, fallback) {
  const chosen = value || fallback;
  if (!chosen) return "";
  return path.isAbsolute(chosen) ? chosen : path.join(projectRoot, chosen);
}

function getConfig() {
  loadEnvFile();

  return {
    projectRoot,
    useMockData: boolEnv("USE_MOCK_DATA", true),
    orderSource: process.env.ORDER_SOURCE || "api",
    timezone: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",
    nowOverride: process.env.NOW_OVERRIDE || "",

    viettelPost: {
      baseUrl: process.env.VIETTELPOST_API_BASE_URL || "",
      username: process.env.VIETTELPOST_USERNAME || "",
      password: process.env.VIETTELPOST_PASSWORD || "",
      token: process.env.VIETTELPOST_TOKEN || "",
      customerId: process.env.VIETTELPOST_CUSTOMER_ID || "",
      loginPath: process.env.VIETTELPOST_LOGIN_PATH || "",
      tokenLoginPath: process.env.VIETTELPOST_TOKEN_LOGIN_PATH || "",
      listOrdersPath: process.env.VIETTELPOST_LIST_ORDERS_PATH || "",
      listOrdersMethod: process.env.VIETTELPOST_LIST_ORDERS_METHOD || "GET",
      listOrdersBodyJson: process.env.VIETTELPOST_LIST_ORDERS_BODY_JSON || "",
      listOrdersDaysBack: numberEnv("VIETTELPOST_LIST_ORDERS_DAYS_BACK", 30),
      orderDetailPath: process.env.VIETTELPOST_ORDER_DETAIL_PATH || "",
      orderDetailMethod: process.env.VIETTELPOST_ORDER_DETAIL_METHOD || "GET",
      callLogPath: process.env.VIETTELPOST_CALL_LOG_PATH || "",
      callLogMethod: process.env.VIETTELPOST_CALL_LOG_METHOD || "GET",
      authHeader: process.env.VIETTELPOST_AUTH_HEADER || "Token",
      authScheme: process.env.VIETTELPOST_AUTH_SCHEME || "raw",
      webhookSecret: process.env.VIETTELPOST_WEBHOOK_SECRET || "",
      fieldMappingFile: resolveProjectPath(
        process.env.VIETTELPOST_FIELD_MAPPING_FILE,
        "viettelpost-field-mapping.example.json"
      )
    },

    sources: {
      trackingCsvPath: resolveProjectPath(process.env.TRACKING_CSV_PATH, "data/tracking-numbers.csv"),
      googleSheetCsvUrl: process.env.GOOGLE_SHEET_CSV_URL || "",
      firestoreOrdersCollection: process.env.FIRESTORE_ORDERS_COLLECTION || "viettelpost_orders"
    },

    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      chatId: process.env.TELEGRAM_CHAT_ID || "",
      dryRun: boolEnv("TELEGRAM_DRY_RUN", true),
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || ""
    },

    api: {
      port: numberEnv("PORT", 8787),
      adminApiKey: process.env.ADMIN_API_KEY || "",
      protectReadEndpoints: boolEnv("PROTECT_READ_ENDPOINTS", true),
      adminRateLimitSeconds: numberEnv("ADMIN_RATE_LIMIT_SECONDS", 60)
    },

    schedule: {
      runCron: boolEnv("RUN_CRON", false),
      runOnStartup: boolEnv("RUN_ON_STARTUP", false),
      checkIntervalMinutes: numberEnv("CHECK_INTERVAL_MINUTES", 60)
    },

    alerts: {
      lateDeliveryDays: numberEnv("LATE_DELIVERY_DAYS", 3),
      lateDeliveryDaysNorthCentral: numberEnv("LATE_DELIVERY_DAYS_NORTH_CENTRAL", 3),
      lateDeliveryDaysSouth: numberEnv("LATE_DELIVERY_DAYS_SOUTH", 4),
      lateDeliveryDaysUnknown: numberEnv("LATE_DELIVERY_DAYS_UNKNOWN", 3),
      lateDeliveryLevels: csvEnv("LATE_DELIVERY_LEVELS", [3, 4, 5, 7, 10]),
      noUpdateHours: numberEnv("NO_UPDATE_HOURS", 48),
      missedCallThreshold: numberEnv("MISSED_CALL_THRESHOLD", 2),
      missedContactSessionThreshold: numberEnv("MISSED_CONTACT_SESSION_THRESHOLD", 2),
      missedCallDifferentDaysThreshold: numberEnv("MISSED_CALL_DIFFERENT_DAYS_THRESHOLD", 2),
      missedCallAlertMode: process.env.MISSED_CALL_ALERT_MODE || "COUNT",
      missedContactSessionMinutes: numberEnv("MISSED_CONTACT_SESSION_MINUTES", 5),
      failedDeliveryThreshold: numberEnv("FAILED_DELIVERY_THRESHOLD", 2),
      codOverdueDays: numberEnv("COD_OVERDUE_DAYS", 3),
      maskPhone: boolEnv("MASK_PHONE", true),
      reportAlertTypes: stringCsvEnv("REPORT_ALERT_TYPES", ["LATE_DELIVERY", "COD_OVERDUE", "MISSED_CALLS"])
    },

    reports: {
      maxRowsPerReport: numberEnv("REPORT_MAX_ROWS", 80),
      bc4OverDays: numberEnv("BC4_OVER_DAYS", 4)
    },

    revenue: {
      scanDaysBack: numberEnv("REVENUE_SCAN_DAYS_BACK", 3650)
    },

    storageDriver:
      process.env.STORAGE_DRIVER ||
      (process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.FIREBASE_CONFIG ? "firestore" : "file"),
    storageFile: resolveProjectPath(process.env.STORAGE_FILE, "storage/viettelpost-db.json"),
    mockDir: path.join(projectRoot, "mocks", "viettelpost")
  };
}

module.exports = {
  getConfig,
  loadEnvFile,
  projectRoot
};
