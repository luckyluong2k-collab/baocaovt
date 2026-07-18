const { evaluateOrder, shouldSendAlert } = require("./alerts/rules");
const { buildTelegramMessage } = require("./alerts/telegramMessage");
const { getStore } = require("./store");
const { sendSystemError, sendTelegramMessage } = require("./telegram/client");
const { sanitizeError } = require("./utils/sanitize");
const { nowDate } = require("./utils/time");
const { ViettelPostClient } = require("./viettelpost/client");

async function runBotCheck(config) {
  const startedAt = new Date().toISOString();
  const store = getStore(config);
  const client = new ViettelPostClient(config);
  await store.load();

  const summary = {
    startedAt,
    finishedAt: null,
    checkedOrders: 0,
    failedOrders: 0,
    sentAlerts: 0,
    skippedDuplicateAlerts: 0,
    errors: []
  };

  try {
    const baseOrders = await client.listOrders();
    summary.checkedOrders = baseOrders.length;
    const now = nowDate(config);

    for (const baseOrder of baseOrders) {
      try {
        const order = await client.hydrateOrder(baseOrder);
        const { metrics, alerts } = evaluateOrder(order, config, now);
        await store.upsertOrder(order, metrics);
        await store.insertOrderEvents(order);

        for (const alert of alerts) {
          const lastAlert = await store.getLastAlert(alert.trackingNumber, alert.alertType);
          if (!shouldSendAlert(alert, lastAlert)) {
            summary.skippedDuplicateAlerts += 1;
            continue;
          }
          const message = buildTelegramMessage(alert, config);
          const sendResult = await sendTelegramMessage(message, config);
          await store.saveAlert(alert, sendResult);
          summary.sentAlerts += 1;
        }
      } catch (error) {
        summary.failedOrders += 1;
        summary.errors.push(sanitizeError(error));
      }
    }
  } catch (error) {
    summary.errors.push(sanitizeError(error));
    try {
      await sendSystemError(error, config);
    } catch (telegramError) {
      summary.errors.push(sanitizeError(telegramError));
    }
  }

  summary.finishedAt = new Date().toISOString();
  await store.recordBotLog(summary);
  await store.save();
  return summary;
}

module.exports = {
  runBotCheck
};
