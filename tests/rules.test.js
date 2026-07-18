const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateOrder, isDelivered, isReturningOrHighRisk, shouldSendAlert } = require("../src/alerts/rules");
const { normalizeOrder } = require("../src/order/normalize");
const { buildUndeliveredReportMessages } = require("../src/reports/undeliveredReport");
const { sanitize, redactString } = require("../src/utils/sanitize");
const { diffWholeDays } = require("../src/utils/time");

const config = {
  timezone: "Asia/Ho_Chi_Minh",
  alerts: {
    lateDeliveryDays: 5,
    lateDeliveryLevels: [5, 7, 10],
    noUpdateHours: 48,
    missedCallThreshold: 2,
    missedContactSessionThreshold: 2,
    missedCallDifferentDaysThreshold: 2,
    missedCallAlertMode: "COUNT",
    missedContactSessionMinutes: 5,
    failedDeliveryThreshold: 2,
    codOverdueDays: 3,
    maskPhone: true
  }
};

const now = new Date("2026-07-18T17:00:00+07:00");

test("tinh so ngay giao hang tu acceptedAt", () => {
  assert.equal(diffWholeDays("2026-07-13T08:00:00+07:00", now), 5);
});

test("nhan dien trang thai da giao thanh cong", () => {
  const order = normalizeOrder({
    trackingNumber: "A",
    currentStatusName: "Đã giao thành công",
    acceptedAt: "2026-07-10T08:00:00+07:00"
  });
  assert.equal(isDelivered(order), true);
});

test("nhan dien trang thai chuyen hoan hoac nguy co hoan", () => {
  const order = normalizeOrder({
    trackingNumber: "A",
    currentStatusName: "Chờ chuyển hoàn",
    failedDeliveryReason: "Khách từ chối nhận"
  });
  assert.equal(isReturningOrHighRisk(order), true);
});

test("dem so lan giao that bai tu lich su trang thai", () => {
  const order = normalizeOrder({
    trackingNumber: "A",
    acceptedAt: "2026-07-14T08:00:00+07:00",
    currentStatusName: "Giao không thành công",
    events: [
      { time: "2026-07-17T10:00:00+07:00", statusName: "Giao không thành công", reason: "Không liên lạc được" },
      { time: "2026-07-18T10:00:00+07:00", statusName: "Giao không thành công", reason: "Khách không nghe máy" }
    ]
  });
  const result = evaluateOrder(order, config, now);
  assert.equal(result.metrics.deliveryAttempts, 2);
  assert.ok(result.alerts.some((alert) => alert.alertType === "FAILED_DELIVERY"));
});

test("dem 3 cuoc goi nho lien tiep thanh 1 phien lien he", () => {
  const order = normalizeOrder({
    trackingNumber: "A",
    acceptedAt: "2026-07-16T08:00:00+07:00",
    currentStatusName: "Đang giao hàng",
    contactHistory: [
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:58:20" },
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:59:18" },
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 16:00:16" },
      { type: "ANSWERED_CALL", direction: "RECEIVER_TO_SHIPPER", time: "18/07/2026 16:03:00" }
    ]
  });
  const result = evaluateOrder(order, config, now);
  assert.equal(result.metrics.missedCallCount, 3);
  assert.equal(result.metrics.missedContactSessions, 1);
  assert.ok(result.alerts.some((alert) => alert.alertType === "MISSED_CALLS"));
});

test("khong gui canh bao trung neu chu ky canh bao khong doi", () => {
  const alert = {
    trackingNumber: "A",
    alertType: "NO_UPDATE",
    alertLevel: "60h",
    statusCode: "IN_TRANSIT",
    statusName: "Đang vận chuyển",
    missedCallCount: 0,
    missedContactSessions: 0,
    deliveryAttempts: 0,
    lastUpdatedAt: "2026-07-15T08:00:00.000Z"
  };
  assert.equal(shouldSendAlert(alert, { ...alert, sentAt: "2026-07-18T10:00:00.000Z" }), false);
});

test("tang cap canh bao ngay 5, ngay 7, ngay 10", () => {
  const day5 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "A",
      acceptedAt: "2026-07-13T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  ).alerts.find((alert) => alert.alertType === "LATE_DELIVERY");
  const day7 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "B",
      acceptedAt: "2026-07-11T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  ).alerts.find((alert) => alert.alertType === "LATE_DELIVERY");
  const day10 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "C",
      acceptedAt: "2026-07-08T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  ).alerts.find((alert) => alert.alertType === "LATE_DELIVERY");

  assert.equal(day5.alertLevel, "day-5");
  assert.equal(day7.alertLevel, "day-7");
  assert.equal(day10.alertLevel, "day-10");
});

test("khong canh bao giao cham cho don da giao thanh cong", () => {
  const result = evaluateOrder(
    normalizeOrder({
      trackingNumber: "A",
      acceptedAt: "2026-07-01T10:00:00+07:00",
      deliveredAt: "2026-07-03T10:00:00+07:00",
      codReconciledAt: "2026-07-04T10:00:00+07:00",
      currentStatusName: "Đã giao thành công"
    }),
    config,
    now
  );
  assert.equal(result.alerts.length, 0);
});

test("khong lam lo token trong log va loi", () => {
  const fakeToken = "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd";
  const output = sanitize({
    token: fakeToken,
    message: `Authorization Bearer ${fakeToken}`,
    nested: {
      TELEGRAM_BOT_TOKEN: fakeToken
    }
  });

  assert.equal(output.token, "[REDACTED]");
  assert.equal(output.nested.TELEGRAM_BOT_TOKEN, "[REDACTED]");
  assert.equal(redactString(output.message).includes(fakeToken), false);
});

test("bao cao don chua giao hien dung thong tin van hanh", () => {
  const order = normalizeOrder({
    trackingNumber: "VTP-MISSED-001",
    orderCode: "SHOP-MISSED-001",
    receiverName: "Le Van Goi Nho",
    receiverPhone: "0923333444",
    codAmount: 980000,
    acceptedAt: "2026-07-16T13:00:00+07:00",
    lastUpdatedAt: "2026-07-18T16:00:16+07:00",
    currentStatusName: "Đang giao hàng",
    contactHistory: [
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:58:20" },
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:59:18" },
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 16:00:16" }
    ]
  });
  const { metrics } = evaluateOrder(order, config, now);
  const messages = buildUndeliveredReportMessages([{ order, metrics }], config, now);

  assert.equal(messages.length, 1);
  assert.match(messages[0], /BÁO CÁO ĐƠN CHƯA GIAO THÀNH CÔNG/);
  assert.match(messages[0], /VTP-MISSED-001/);
  assert.match(messages[0], /Gọi nhỡ:<\/b> 3/);
  assert.match(messages[0], /Phiên:<\/b> 1/);
  assert.match(messages[0], /<code>SHOP-MISSED-001<\/code>/);
  assert.match(messages[0], /<code>092\*\*\*\*444<\/code>/);
});
