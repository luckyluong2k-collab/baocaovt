const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateOrder, isDelivered, isReturningOrHighRisk, shouldSendAlert } = require("../src/alerts/rules");
const { normalizeOrder } = require("../src/order/normalize");
const { buildUndeliveredReportMessages } = require("../src/reports/undeliveredReport");
const { buildRevenueReportMessages, isInDelivery, isWaitingRedelivery, reportRowsForCode } = require("../src/reports/operationsReport");
const { parseCommand } = require("../src/telegram/commands");
const { sanitize, redactString } = require("../src/utils/sanitize");
const { diffWholeDays } = require("../src/utils/time");

const config = {
  timezone: "Asia/Ho_Chi_Minh",
  alerts: {
    lateDeliveryDays: 3,
    lateDeliveryDaysNorthCentral: 3,
    lateDeliveryDaysSouth: 4,
    lateDeliveryDaysUnknown: 3,
    lateDeliveryLevels: [3, 4, 5, 7, 10],
    noUpdateHours: 48,
    missedCallThreshold: 2,
    missedContactSessionThreshold: 2,
    missedCallDifferentDaysThreshold: 2,
    missedCallAlertMode: "COUNT",
    missedContactSessionMinutes: 5,
    failedDeliveryThreshold: 2,
    codOverdueDays: 3,
    maskPhone: true,
    reportAlertTypes: ["LATE_DELIVERY", "COD_OVERDUE", "MISSED_CALLS"]
  },
  reports: {
    maxRowsPerReport: 80,
    bc4OverDays: 4
  },
  revenue: {
    scanDaysBack: 3650
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

test("khong canh bao goi nho neu moi dung 2 cuoc", () => {
  const order = normalizeOrder({
    trackingNumber: "A",
    acceptedAt: "2026-07-16T08:00:00+07:00",
    currentStatusName: "Đang giao hàng",
    contactHistory: [
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:58:20" },
      { type: "MISSED_CALL", direction: "SHIPPER_TO_RECEIVER", time: "18/07/2026 15:59:18" }
    ]
  });
  const result = evaluateOrder(order, config, now);
  assert.equal(result.metrics.missedCallCount, 2);
  assert.equal(result.alerts.some((alert) => alert.alertType === "MISSED_CALLS"), false);
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

test("ap dung nguong giao cham theo mien nhan hang", () => {
  const northDay3 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "NORTH-3",
      receiverProvince: "Hà Nội",
      acceptedAt: "2026-07-15T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  );
  const northDay4 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "NORTH-4",
      receiverProvince: "Hà Nội",
      acceptedAt: "2026-07-14T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  );
  const southDay4 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "SOUTH-4",
      receiverProvince: "Hồ Chí Minh",
      acceptedAt: "2026-07-14T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  );
  const southDay5 = evaluateOrder(
    normalizeOrder({
      trackingNumber: "SOUTH-5",
      receiverProvince: "Hồ Chí Minh",
      acceptedAt: "2026-07-13T10:00:00+07:00",
      currentStatusName: "Đang vận chuyển"
    }),
    config,
    now
  );

  assert.equal(northDay3.alerts.some((alert) => alert.alertType === "LATE_DELIVERY"), false);
  assert.equal(northDay4.alerts.some((alert) => alert.alertType === "LATE_DELIVERY"), true);
  assert.equal(southDay4.alerts.some((alert) => alert.alertType === "LATE_DELIVERY"), false);
  assert.equal(southDay5.alerts.some((alert) => alert.alertType === "LATE_DELIVERY"), true);
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
  const { metrics, alerts } = evaluateOrder(order, config, now);
  const messages = buildUndeliveredReportMessages([{ order, metrics, alerts }], config, now);

  assert.equal(messages.length, 1);
  assert.match(messages[0], /\/BC2/);
  assert.match(messages[0], /VTP-MISSED-001/);
  assert.match(messages[0], /Gọi nhỡ:<\/b> 3/);
  assert.match(messages[0], /Ship gọi nhỡ quá ngưỡng/);
  assert.match(messages[0], /<code>SHOP-MISSED-001<\/code>/);
  assert.match(messages[0], /<code>092\*\*\*\*444<\/code>/);
});

test("phan loai cac bao cao bc1 bc3 bc4", () => {
  const delivering = normalizeOrder({
    trackingNumber: "BC1",
    acceptedAt: "2026-07-17T10:00:00+07:00",
    currentStatusName: "Đang giao hàng"
  });
  const redelivery = normalizeOrder({
    trackingNumber: "BC3",
    acceptedAt: "2026-07-17T10:00:00+07:00",
    currentStatusName: "Chờ phát lại",
    failedDeliveryReason: "Khách hẹn giao lại"
  });
  const late = normalizeOrder({
    trackingNumber: "BC4",
    acceptedAt: "2026-07-12T10:00:00+07:00",
    currentStatusName: "Đang vận chuyển"
  });
  const rows = [delivering, redelivery, late].map((order) => {
    const result = evaluateOrder(order, config, now);
    return { order, metrics: result.metrics, alerts: result.alerts };
  });

  assert.equal(isInDelivery(delivering), true);
  assert.equal(isWaitingRedelivery(redelivery), true);
  assert.ok(reportRowsForCode("bc1", rows, config).some((row) => row.order.trackingNumber === "BC1"));
  assert.ok(reportRowsForCode("bc3", rows, config).some((row) => row.order.trackingNumber === "BC3"));
  assert.ok(reportRowsForCode("bc4", rows, config).some((row) => row.order.trackingNumber === "BC4"));
});

test("bao cao doanh thu luy tien hien tong tien va so don", () => {
  const messages = buildRevenueReportMessages(
    {
      insertedCount: 2,
      updatedCount: 0,
      summary: {
        totalRevenue: 1500000,
        orderCount: 2,
        firstOrderAt: "2026-07-01T10:00:00+07:00",
        lastOrderAt: "2026-07-18T10:00:00+07:00"
      }
    },
    config,
    now
  );

  assert.equal(messages.length, 1);
  assert.match(messages[0], /\/BC5/);
  assert.match(messages[0], /1.500.000/);
  assert.match(messages[0], /Số đơn đã ghi:<\/b> 2/);
});

test("doc lenh telegram trong tin nhan nhieu dong", () => {
  assert.deepEqual(parseCommand("/bc1\n/bc2\n/bc3"), { command: "bc1", args: "" });
  assert.deepEqual(parseCommand("/BC2@baodonvtbot"), { command: "bc2", args: "" });
});
