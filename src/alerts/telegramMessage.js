const { formatDateTime } = require("../utils/time");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlCode(value, fallback = "-") {
  const text = String(value ?? "").trim() || fallback;
  return `<code>${escapeHtml(text)}</code>`;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(number);
}

function maskPhone(phone, enabled) {
  const text = String(phone || "");
  if (!enabled || text.length < 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-3)}`;
}

function titleForAlert(alert) {
  if (alert.alertType === "COD_OVERDUE") return "🚨 COD CHƯA ĐỐI SOÁT";
  if (alert.alertType === "NO_UPDATE") return "🚨 ĐƠN KHÔNG CẬP NHẬT";
  if (alert.alertType === "LATE_DELIVERY") return "🚨 ĐƠN GIAO CHẬM";
  if (alert.alertType === "MISSED_CALLS") return "🚨 SHIP GỌI NHỠ QUÁ NGƯỠNG";
  return "🚨 ĐƠN CÓ NGUY CƠ HOÀN";
}

function buildTelegramMessage(alert, config) {
  const order = alert.order || {};
  const timezone = config.timezone;
  const phone = maskPhone(order.receiverPhone, config.alerts.maskPhone);
  const shipperPhone = maskPhone(order.shipperPhone, config.alerts.maskPhone);

  const lines = [
    `<b>${escapeHtml(titleForAlert(alert))}</b>`,
    "",
    `<b>Mã vận đơn:</b> ${htmlCode(order.trackingNumber || alert.trackingNumber)}`,
    `<b>Mã đơn shop:</b> ${htmlCode(order.orderCode)}`,
    `<b>Khách hàng:</b> ${escapeHtml(order.receiverName)}`,
    `<b>Số điện thoại:</b> ${htmlCode(phone)}`,
    `<b>COD:</b> ${escapeHtml(formatMoney(order.codAmount))}`,
    `<b>Vùng nhận:</b> ${escapeHtml(alert.deliveryRegionName || "")}${alert.deliveryProvince ? ` - ${escapeHtml(alert.deliveryProvince)}` : ""}`,
    `<b>Trạng thái:</b> ${escapeHtml(order.currentStatusName || alert.statusName)}`,
    `<b>Ngày tính hạn:</b> ${escapeHtml(formatDateTime(alert.deliveryStartAt || order.acceptedAt, timezone))}`,
    `<b>Số ngày vận chuyển:</b> ${escapeHtml(alert.deliveryDays)}`,
    `<b>Ngưỡng quá hạn:</b> ${escapeHtml(alert.lateDeliveryThresholdDays || "")} ngày`,
    `<b>Cuộc gọi nhỡ:</b> ${escapeHtml(alert.missedCallCount)}`,
    `<b>Số phiên liên hệ thất bại:</b> ${escapeHtml(alert.missedContactSessions)}`,
    `<b>Số lần giao thất bại:</b> ${escapeHtml(alert.deliveryAttempts)}`,
    `<b>Lý do gần nhất:</b> ${escapeHtml(alert.failedDeliveryReason || order.failedDeliveryReason)}`,
    `<b>Cập nhật cuối:</b> ${escapeHtml(formatDateTime(order.lastUpdatedAt || alert.lastUpdatedAt, timezone))}`,
    `<b>Bưu tá:</b> ${escapeHtml(order.shipperName || "")}${shipperPhone ? ` - ${htmlCode(shipperPhone)}` : ""}`,
    `<b>Bưu cục:</b> ${escapeHtml(order.postOfficeName)}`,
    "",
    `<b>Lý do cảnh báo:</b> ${escapeHtml(alert.reason)}`,
    "",
    "✅ Sale cần gọi lại khách ngay để hỗ trợ nhận hàng."
  ];

  return lines.join("\n");
}

module.exports = {
  buildTelegramMessage,
  escapeHtml,
  htmlCode,
  formatMoney,
  maskPhone
};
