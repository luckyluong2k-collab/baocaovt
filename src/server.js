const http = require("http");
const { URL } = require("url");
const { evaluateOrder, shouldSendAlert } = require("./alerts/rules");
const { buildTelegramMessage } = require("./alerts/telegramMessage");
const { getConfig } = require("./config");
const { normalizeOrder } = require("./order/normalize");
const { sendUndeliveredReport } = require("./reports/undeliveredReport");
const { runBotCheck } = require("./scheduler");
const { getStore } = require("./store");
const { sendTelegramMessage } = require("./telegram/client");
const { parseCsv, toNumber } = require("./utils/csv");
const { sanitize, sanitizeError } = require("./utils/sanitize");
const { nowDate } = require("./utils/time");

const rateState = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body qua lon."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseBody(request, text) {
  const contentType = request.headers["content-type"] || "";
  if (contentType.includes("text/csv")) return { csv: text };
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function isAuthorized(request, config) {
  if (!config.api.adminApiKey) return false;
  const headerKey = request.headers["x-admin-key"];
  const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return headerKey === config.api.adminApiKey || bearer === config.api.adminApiKey;
}

function requireAdmin(request, response, config) {
  if (isAuthorized(request, config)) return true;
  sendJson(response, 401, { ok: false, error: "Can x-admin-key hoac Authorization Bearer cua quan tri vien." });
  return false;
}

function checkRateLimit(key, seconds) {
  const now = Date.now();
  const last = rateState.get(key) || 0;
  if (now - last < seconds * 1000) {
    return false;
  }
  rateState.set(key, now);
  return true;
}

async function loadStore(config) {
  const store = getStore(config);
  await store.load();
  return store;
}

async function handleImport(request, response, config) {
  const bodyText = await readBody(request);
  const body = parseBody(request, bodyText);
  const store = await loadStore(config);
  let records = [];

  if (body.csv) {
    records = parseCsv(body.csv).map((record) => ({
      trackingNumber: record.trackingNumber,
      orderCode: record.orderCode,
      receiverName: record.receiverName,
      receiverPhone: record.receiverPhone,
      codAmount: toNumber(record.codAmount)
    }));
  } else if (Array.isArray(body)) {
    records = body;
  } else if (Array.isArray(body.orders)) {
    records = body.orders;
  }

  const imported = [];
  for (const record of records) {
    const order = normalizeOrder(record);
    if (!order.trackingNumber) continue;
    await store.upsertOrder(order, {});
    imported.push(order.trackingNumber);
  }
  await store.save();
  sendJson(response, 200, { ok: true, importedCount: imported.length, imported });
}

async function handleWebhook(request, response, config) {
  if (config.viettelPost.webhookSecret) {
    const secret = request.headers["x-viettelpost-secret"] || request.headers["x-webhook-secret"];
    if (secret !== config.viettelPost.webhookSecret) {
      sendJson(response, 401, { ok: false, error: "Webhook secret khong hop le." });
      return;
    }
  }

  const body = parseBody(request, await readBody(request));
  const store = await loadStore(config);
  await store.recordWebhookEvent({
    source: "viettelpost_webhook",
    receivedAt: new Date().toISOString(),
    rawData: sanitize(body)
  });

  const order = normalizeOrder(body);
  let sentAlerts = 0;
  if (order.trackingNumber) {
    const now = nowDate(config);
    const { metrics, alerts } = evaluateOrder(order, config, now);
    await store.upsertOrder(order, metrics);
    await store.insertOrderEvents(order);
    for (const alert of alerts) {
      const lastAlert = await store.getLastAlert(alert.trackingNumber, alert.alertType);
      if (!shouldSendAlert(alert, lastAlert)) continue;
      const message = buildTelegramMessage(alert, config);
      const result = await sendTelegramMessage(message, config);
      await store.saveAlert(alert, result);
      sentAlerts += 1;
    }
  }

  await store.save();
  sendJson(response, 200, { ok: true, accepted: true, trackingNumber: order.trackingNumber || "", sentAlerts });
}

async function router(request, response, config = getConfig()) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const method = request.method || "GET";
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (method === "GET" && path === "/api/viettelpost/health") {
      sendJson(response, 200, {
        ok: true,
        service: "viettelpost-telegram-bot",
        useMockData: config.useMockData,
        orderSource: config.orderSource,
        telegramMode: config.telegram.dryRun ? "dry-run" : "live",
        time: new Date().toISOString()
      });
      return;
    }

    const readEndpoint =
      method === "GET" &&
      (path === "/api/viettelpost/orders" ||
        path.startsWith("/api/viettelpost/orders/") ||
        path === "/api/viettelpost/alerts");
    if (readEndpoint && config.api.protectReadEndpoints && !requireAdmin(request, response, config)) return;

    if (method === "GET" && path === "/api/viettelpost/orders") {
      const store = await loadStore(config);
      sendJson(response, 200, { ok: true, orders: await store.listOrders() });
      return;
    }

    if (method === "GET" && path.startsWith("/api/viettelpost/orders/")) {
      const trackingNumber = decodeURIComponent(path.replace("/api/viettelpost/orders/", ""));
      const store = await loadStore(config);
      sendJson(response, 200, { ok: true, order: await store.getOrder(trackingNumber) });
      return;
    }

    if (method === "GET" && path === "/api/viettelpost/alerts") {
      const store = await loadStore(config);
      sendJson(response, 200, { ok: true, alerts: await store.listAlerts() });
      return;
    }

    if (method === "POST" && path === "/api/viettelpost/check-now") {
      if (!requireAdmin(request, response, config)) return;
      if (!checkRateLimit("check-now", config.api.adminRateLimitSeconds)) {
        sendJson(response, 429, { ok: false, error: "Dang goi qua nhanh, vui long thu lai sau." });
        return;
      }
      const summary = await runBotCheck(config);
      sendJson(response, 200, { ok: true, summary });
      return;
    }

    if (method === "POST" && path === "/api/viettelpost/test-telegram") {
      if (!requireAdmin(request, response, config)) return;
      if (!checkRateLimit("test-telegram", config.api.adminRateLimitSeconds)) {
        sendJson(response, 429, { ok: false, error: "Dang goi qua nhanh, vui long thu lai sau." });
        return;
      }
      const result = await sendTelegramMessage("<b>✅ Bot Viettel Post đã sẵn sàng.</b>", config);
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (method === "POST" && path === "/api/viettelpost/report-undelivered") {
      if (!requireAdmin(request, response, config)) return;
      if (!checkRateLimit("report-undelivered", config.api.adminRateLimitSeconds)) {
        sendJson(response, 429, { ok: false, error: "Dang goi qua nhanh, vui long thu lai sau." });
        return;
      }
      const summary = await sendUndeliveredReport(config);
      sendJson(response, 200, { ok: true, summary });
      return;
    }

    if (method === "POST" && path === "/api/viettelpost/import") {
      if (!requireAdmin(request, response, config)) return;
      await handleImport(request, response, config);
      return;
    }

    if (method === "POST" && path === "/api/viettelpost/webhook") {
      await handleWebhook(request, response, config);
      return;
    }

    sendJson(response, 404, { ok: false, error: "Endpoint khong ton tai." });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: sanitizeError(error) });
  }
}

function startServer(config = getConfig()) {
  const server = http.createServer((request, response) => {
    router(request, response, config);
  });
  server.listen(config.api.port);
  return server;
}

module.exports = {
  startServer,
  router
};
