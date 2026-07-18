const { evaluateOrder } = require("../alerts/rules");
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

const alertLabels = {
  LATE_DELIVERY: "Quá hạn giao theo vùng",
  COD_OVERDUE: "COD chưa đối soát",
  MISSED_CALLS: "Ship gọi nhỡ quá ngưỡng",
  FAILED_DELIVERY: "Giao thất bại",
  NO_UPDATE: "Không cập nhật trạng thái",
  RETURNING_RISK: "Nguy cơ hoàn"
};

function sortOperationalRows(left, right) {
  const leftTime = String(left.order.lastUpdatedAt || "");
  const rightTime = String(right.order.lastUpdatedAt || "");
  return leftTime.localeCompare(rightTime);
}

function reportAlertTypes(config) {
  return new Set((config.alerts.reportAlertTypes || []).map((type) => String(type).toUpperCase()));
}

function alertReasonText(alert) {
  const label = alertLabels[alert.alertType] || alert.alertType;
  return `${label}: ${alert.reason}`;
}

function buildUndeliveredReportMessages(rows, config, createdAt = new Date()) {
  const timezone = config.timezone;
  const header = [
    "<b>BÁO CÁO VẬN HÀNH VIETTEL POST</b>",
    `<b>Thời gian:</b> ${escapeHtml(formatDateTime(createdAt, timezone))}`,
    `<b>Tổng số đơn cần xử lý:</b> ${escapeHtml(rows.length)}`,
    ""
  ].join("\n");

  if (rows.length === 0) {
    return [
      [
        header,
        "Hiện không có đơn quá hạn giao, COD quá hạn đối soát hoặc ship gọi nhỡ quá ngưỡng trong nguồn dữ liệu đang cấu hình."
      ].join("\n")
    ];
  }

  const messages = [];
  let current = header;

  rows.forEach((row, index) => {
    const order = row.order;
    const phone = maskPhone(order.receiverPhone, config.alerts.maskPhone);
    const province = row.metrics.deliveryProvince || order.receiverProvince || "-";
    const codDays = order.deliveredAt ? row.metrics.daysSinceDelivered : 0;
    const reasons = (row.alerts || []).map(alertReasonText).map((text) => `- ${escapeHtml(shortText(text, 96))}`).join("\n");
    const line = [
      `<b>${index + 1}. Mã vận đơn:</b> ${htmlCode(order.trackingNumber)}`,
      `<b>Mã đơn shop:</b> ${htmlCode(order.orderCode)}`,
      `<b>Khách hàng:</b> ${escapeHtml(shortText(order.receiverName || "-"))}`,
      `<b>Số điện thoại:</b> ${htmlCode(phone || "-")}`,
      `<b>Vùng nhận:</b> ${escapeHtml(row.metrics.deliveryRegionName || "-")} - ${escapeHtml(province)}`,
      `COD: ${escapeHtml(formatMoney(order.codAmount))}`,
      `<b>Trạng thái:</b> ${escapeHtml(shortText(order.currentStatusName || order.currentStatusCode || "-"))}`,
      `<b>Ngày tính hạn:</b> ${escapeHtml(formatDateTime(row.metrics.deliveryStartAt, timezone) || "-")}`,
      `<b>Số ngày:</b> ${escapeHtml(row.metrics.deliveryDays)} | <b>Ngưỡng vùng:</b> ${escapeHtml(row.metrics.lateDeliveryThresholdDays)} | <b>Gọi nhỡ:</b> ${escapeHtml(row.metrics.missedCallCount)} | <b>COD chưa ĐS:</b> ${escapeHtml(codDays)}`,
      `<b>Cập nhật cuối:</b> ${escapeHtml(formatDateTime(order.lastUpdatedAt, timezone) || "-")}`,
      reasons ? `<b>Lý do báo cáo:</b>\n${reasons}` : "",
      row.metrics.failedDeliveryReason ? `<b>Lý do gần nhất:</b> ${escapeHtml(shortText(row.metrics.failedDeliveryReason, 56))}` : ""
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
  const selectedAlertTypes = reportAlertTypes(config);

  for (const baseOrder of baseOrders) {
    const order = await client.hydrateOrder(baseOrder);
    const { metrics, alerts } = evaluateOrder(order, config, now);
    const selectedAlerts = alerts.filter((alert) => selectedAlertTypes.has(String(alert.alertType).toUpperCase()));
    if (selectedAlerts.length > 0) {
      rows.push({ order, metrics, alerts: selectedAlerts });
    }
  }

  return rows.sort(sortOperationalRows);
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
