const { getStore } = require("../store");
const { sanitizeError } = require("../utils/sanitize");
const { handleTelegramUpdate } = require("./commands");

async function fetchUpdates(config, offset) {
  const { botToken } = config.telegram;
  if (!botToken) {
    throw new Error("Chua cau hinh TELEGRAM_BOT_TOKEN.");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      offset: offset || undefined,
      limit: 20,
      timeout: 0,
      allowed_updates: ["message", "edited_message"]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`Khong doc duoc Telegram updates: ${body.description || response.statusText}`);
  }
  return Array.isArray(body.result) ? body.result : [];
}

async function telegramPoll(config) {
  const stateStore = getStore(config);
  await stateStore.load();
  const currentOffset = await stateStore.getTelegramUpdateOffset();
  const updates = await fetchUpdates(config, currentOffset);

  let nextOffset = currentOffset;
  const results = [];

  for (const update of updates) {
    nextOffset = Math.max(nextOffset || 0, Number(update.update_id || 0) + 1);
    try {
      results.push(await handleTelegramUpdate(update, config));
    } catch (error) {
      results.push({ ok: false, error: sanitizeError(error), updateId: update.update_id });
    }
  }

  const finalStore = getStore(config);
  await finalStore.load();
  if (nextOffset) {
    await finalStore.setTelegramUpdateOffset(nextOffset);
  }
  await finalStore.recordBotLog({
    type: "TELEGRAM_POLL",
    checkedAt: new Date().toISOString(),
    updateCount: updates.length,
    nextOffset,
    results
  });
  await finalStore.save();

  return {
    updateCount: updates.length,
    handledCount: results.filter((result) => result && result.ok && !result.ignored).length,
    ignoredCount: results.filter((result) => result && result.ignored).length,
    failedCount: results.filter((result) => result && result.ok === false).length,
    nextOffset,
    results
  };
}

module.exports = {
  fetchUpdates,
  telegramPoll
};
