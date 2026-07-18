const { evaluateOrder, isDelivered } = require("../alerts/rules");
const { escapeHtml, formatMoney, htmlCode, maskPhone } = require("../alerts/telegramMessage");
const { getStore } = require("../store");
const { sendTelegramMessage } = require("../telegram/client");
const { formatDateTime, nowDate } = require("../utils/time");
const { ViettelPostClient } = require("../viettelpost/client");

const TELEGRAM_LIMIT = 3900;

function shortText(value, maxLength = 42) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function sortUndelivered(left, right) {
  const leftTime = String(left.order.lastUpdatedAt || "");
  const rightTime = String(right.order.lastUpdatedAt || "");
  return leftTime.localeCompare(rightTime);
}

function buildUndeliveredReportMessages(rows, config, createdAt = new Date()) {
  const timezone = config.timezone;
  const header = [
    "<b>BÁO CÁO ĐƠN CHƯA GIAO THÀNH CÔNG</b>",
    `<b>Thời gian:</b> ${escapeHtml(formatDateTime(createdAt, timezone))}`,
    `<b>Tổng số đơn:</b> ${escapeHtml(rows.length)}`,
    ""
  ].join("\n");

  if (rows.length === 0) {
    return [
      [
        header,
        "Hiện không có đơn nào chưa giao thành công trong nguồn dữ liệu đang cấu hình."
      ].join("\n")
    ];
  }

  const messages = [];
  let current = header;

  rows.forEach((row, index) => {
    const order = row.order;
    const phone = maskPhone(order.receiverPhone, config.alerts.maskPhone);
    const line = [
      `<b>${index + 1}. Mã vận đơn:</b> ${htmlCode(order.trackingNumber)}`,
      `<b>Mã đơn shop:</b> ${htmlCode(order.orderCode)}`,
      `<b>Khách hàng:</b> ${escapeHtml(shortText(order.receiverName || "-"))}`,
      `<b>Số điện thoại:</b> ${htmlCode(phone || "-")}`,
      `COD: ${escapeHtml(formatMoney(order.codAmount))}`,
      `<b>Trạng thái:</b> ${escapeHtml(shortText(order.currentStatusName || order.currentStatusCode || "-"))}`,
      `<b>Ngày vận chuyển:</b> ${escapeHtml(row.metrics.deliveryDays)} | <b>Gọi nhỡ:</b> ${escapeHtml(row.metrics.missedCallCount)} | <b>Phiên:</b> ${escapeHtml(row.metrics.missedContactSessions)} | <b>Thất bại:</b> ${escapeHtml(row.metrics.deliveryAttempts)}`,
      `<b>Cập nhật cuối:</b> ${escapeHtml(formatDateTime(order.lastUpdatedAt, timezone) || "-")}`,
      row.metrics.failedDeliveryReason ? `<b>Lý do:</b> ${escapeHtml(shortText(row.metrics.failedDeliveryReason, 56))}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const next = `${current}${current.endsWith("\n\n") ? "" : "\n\n"}${line}`;
    if (next.length > TELEGRAM_LIMIT && current !== header) {
      messages.push(current);
      current = `${header}${line}`;
    } else {
      current = next;
    }
  });

  messages.push(current);
  return messages;
}

async function getUndeliveredRows(config) {
  const client = new ViettelPostClient(config);
  const now = nowDate(config);
  const baseOrders = await client.listOrders();
  const rows = [];

  for (const baseOrder of baseOrders) {
    const order = await client.hydrateOrder(baseOrder);
    if (isDelivered(order)) continue;
    const { metrics } = evaluateOrder(order, config, now);
    rows.push({ order, metrics });
  }

  return rows.sort(sortUndelivered);
}

async function sendUndeliveredReport(config) {
  const rows = await getUndeliveredRows(config);
  const messages = buildUndeliveredReportMessages(rows, config);
  const results = [];

  for (const message of messages) {
    results.push(await sendTelegramMessage(message, config));
  }

  const store = getStore(config);
  await store.load();
  await store.recordBotLog({
    type: "UNDELIVERED_REPORT",
    sentAt: new Date().toISOString(),
    undeliveredCount: rows.length,
    messageCount: messages.length,
    telegram: results
  });
  await store.save();

  return {
    undeliveredCount: rows.length,
    messageCount: messages.length,
    trackingNumbers: rows.map((row) => row.order.trackingNumber),
    telegram: results
  };
}

module.exports = {
  getUndeliveredRows,
  buildUndeliveredReportMessages,
  sendUndeliveredReport
};
