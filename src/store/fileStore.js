const fs = require("fs");
const path = require("path");
const { sanitize } = require("../utils/sanitize");

function emptyDb() {
  return {
    viettelpost_orders: {},
    viettelpost_order_events: {},
    viettelpost_alerts: {},
    viettelpost_revenue_ledger: {},
    telegram_state: {},
    viettelpost_bot_logs: []
  };
}

class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = emptyDb();
  }

  async load() {
    if (!fs.existsSync(this.filePath)) {
      this.db = emptyDb();
      return this.db;
    }
    const content = fs.readFileSync(this.filePath, "utf8");
    this.db = content.trim() ? { ...emptyDb(), ...JSON.parse(content) } : emptyDb();
    return this.db;
  }

  async save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.db, null, 2)}\n`, "utf8");
  }

  async upsertOrder(order, metrics = {}) {
    const trackingNumber = order.trackingNumber;
    if (!trackingNumber) return null;

    const existing = this.db.viettelpost_orders[trackingNumber] || {};
    const document = {
      ...existing,
      trackingNumber,
      orderCode: order.orderCode || existing.orderCode || "",
      receiverName: order.receiverName || existing.receiverName || "",
      receiverPhone: order.receiverPhone || existing.receiverPhone || "",
      codAmount: order.codAmount || existing.codAmount || 0,
      acceptedAt: order.acceptedAt || existing.acceptedAt || null,
      lastUpdatedAt: order.lastUpdatedAt || existing.lastUpdatedAt || null,
      statusCode: order.currentStatusCode || existing.statusCode || "",
      statusName: order.currentStatusName || existing.statusName || "",
      deliveryDays: metrics.deliveryDays || 0,
      missedCallCount: metrics.missedCallCount || 0,
      missedContactSessions: metrics.missedContactSessions || 0,
      deliveryAttempts: metrics.deliveryAttempts || 0,
      lastAlertAt: existing.lastAlertAt || null,
      lastCheckedAt: new Date().toISOString(),
      rawData: sanitize(order.rawData || {})
    };

    this.db.viettelpost_orders[trackingNumber] = document;
    return document;
  }

  async insertOrderEvents(order) {
    const events = Array.isArray(order.events) ? order.events : [];
    for (const event of events) {
      const id = [
        order.trackingNumber,
        event.time || "",
        event.statusCode || "",
        event.statusName || "",
        event.reason || ""
      ]
        .join("|")
        .replace(/[^\p{L}\p{N}|:._-]+/gu, "-");

      this.db.viettelpost_order_events[id] = {
        trackingNumber: order.trackingNumber,
        ...event,
        rawData: sanitize(event.rawData || {})
      };
    }
  }

  async recordWebhookEvent(event) {
    const id = `webhook|${new Date().toISOString()}|${Math.random().toString(16).slice(2)}`;
    this.db.viettelpost_order_events[id] = sanitize(event);
  }

  async getOrder(trackingNumber) {
    return this.db.viettelpost_orders[trackingNumber] || null;
  }

  async listOrders() {
    return Object.values(this.db.viettelpost_orders);
  }

  async listAlerts() {
    return Object.values(this.db.viettelpost_alerts).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  }

  async upsertRevenueOrders(orders) {
    this.db.viettelpost_revenue_ledger = this.db.viettelpost_revenue_ledger || {};
    let insertedCount = 0;
    let updatedCount = 0;

    for (const order of orders || []) {
      const trackingNumber = order.trackingNumber;
      if (!trackingNumber) continue;
      const existing = this.db.viettelpost_revenue_ledger[trackingNumber] || null;
      const document = {
        ...(existing || {}),
        trackingNumber,
        orderCode: order.orderCode || (existing && existing.orderCode) || "",
        receiverName: order.receiverName || (existing && existing.receiverName) || "",
        receiverPhone: order.receiverPhone || (existing && existing.receiverPhone) || "",
        codAmount: Number(order.codAmount || (existing && existing.codAmount) || 0),
        deliveredAt: order.deliveredAt || (existing && existing.deliveredAt) || null,
        createdAt: order.createdAt || (existing && existing.createdAt) || null,
        acceptedAt: order.acceptedAt || (existing && existing.acceptedAt) || null,
        statusName: order.currentStatusName || (existing && existing.statusName) || "",
        firstRecordedAt: (existing && existing.firstRecordedAt) || new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };

      this.db.viettelpost_revenue_ledger[trackingNumber] = sanitize(document);
      if (existing) updatedCount += 1;
      else insertedCount += 1;
    }

    return { insertedCount, updatedCount };
  }

  async getRevenueSummary() {
    const entries = Object.values(this.db.viettelpost_revenue_ledger || {});
    const dates = entries
      .map((entry) => entry.deliveredAt || entry.createdAt || entry.acceptedAt)
      .filter(Boolean)
      .sort();
    return {
      orderCount: entries.length,
      totalRevenue: entries.reduce((total, entry) => total + Number(entry.codAmount || 0), 0),
      firstOrderAt: dates[0] || null,
      lastOrderAt: dates[dates.length - 1] || null,
      updatedAt: new Date().toISOString()
    };
  }

  async getTelegramUpdateOffset() {
    return Number((this.db.telegram_state && this.db.telegram_state.updateOffset) || 0);
  }

  async setTelegramUpdateOffset(offset) {
    this.db.telegram_state = {
      ...(this.db.telegram_state || {}),
      updateOffset: Number(offset || 0),
      updatedAt: new Date().toISOString()
    };
    return this.db.telegram_state;
  }

  getLastAlert(trackingNumber, alertType) {
    return this.db.viettelpost_alerts[`${trackingNumber}:${alertType}`] || null;
  }

  async saveAlert(alert, sendResult = {}) {
    const key = `${alert.trackingNumber}:${alert.alertType}`;
    const existing = this.db.viettelpost_alerts[key] || {};
    const sentAt = new Date().toISOString();
    const document = {
      ...existing,
      ...alert,
      sentAt,
      telegram: sanitize(sendResult),
      history: [
        ...(existing.history || []).slice(-20),
        {
          sentAt,
          alertLevel: alert.alertLevel,
          statusCode: alert.statusCode,
          missedCallCount: alert.missedCallCount,
          missedContactSessions: alert.missedContactSessions,
          deliveryAttempts: alert.deliveryAttempts,
          lastUpdatedAt: alert.lastUpdatedAt
        }
      ]
    };
    this.db.viettelpost_alerts[key] = document;

    if (this.db.viettelpost_orders[alert.trackingNumber]) {
      this.db.viettelpost_orders[alert.trackingNumber].lastAlertAt = sentAt;
    }
    return document;
  }

  async recordBotLog(log) {
    this.db.viettelpost_bot_logs.push(sanitize(log));
    this.db.viettelpost_bot_logs = this.db.viettelpost_bot_logs.slice(-500);
  }
}

module.exports = {
  FileStore,
  emptyDb
};
