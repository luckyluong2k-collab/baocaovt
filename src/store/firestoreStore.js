const crypto = require("crypto");
const admin = require("firebase-admin");
const { sanitize } = require("../utils/sanitize");

function ensureFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();
  if (!ensureFirebaseAdmin.settingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    ensureFirebaseAdmin.settingsApplied = true;
  }
  return db;
}

function eventId(parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex");
}

function compactAlert(alert) {
  const order = alert.order || {};
  return sanitize({
    ...alert,
    order: {
      trackingNumber: order.trackingNumber,
      orderCode: order.orderCode,
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      codAmount: order.codAmount,
      acceptedAt: order.acceptedAt,
      lastUpdatedAt: order.lastUpdatedAt,
      currentStatusCode: order.currentStatusCode,
      currentStatusName: order.currentStatusName,
      postOfficeName: order.postOfficeName,
      shipperName: order.shipperName,
      shipperPhone: order.shipperPhone
    }
  });
}

class FirestoreStore {
  constructor() {
    this.db = ensureFirebaseAdmin();
  }

  async load() {
    return this;
  }

  async save() {
    return true;
  }

  async upsertOrder(order, metrics = {}) {
    const trackingNumber = order.trackingNumber;
    if (!trackingNumber) return null;

    const reference = this.db.collection("viettelpost_orders").doc(trackingNumber);
    const existing = await reference.get();
    const existingData = existing.exists ? existing.data() : {};
    const document = sanitize({
      ...existingData,
      trackingNumber,
      orderCode: order.orderCode || existingData.orderCode || "",
      receiverName: order.receiverName || existingData.receiverName || "",
      receiverPhone: order.receiverPhone || existingData.receiverPhone || "",
      codAmount: order.codAmount || existingData.codAmount || 0,
      acceptedAt: order.acceptedAt || existingData.acceptedAt || null,
      lastUpdatedAt: order.lastUpdatedAt || existingData.lastUpdatedAt || null,
      statusCode: order.currentStatusCode || existingData.statusCode || "",
      statusName: order.currentStatusName || existingData.statusName || "",
      deliveryDays: metrics.deliveryDays || 0,
      missedCallCount: metrics.missedCallCount || 0,
      missedContactSessions: metrics.missedContactSessions || 0,
      deliveryAttempts: metrics.deliveryAttempts || 0,
      lastAlertAt: existingData.lastAlertAt || null,
      lastCheckedAt: new Date().toISOString(),
      rawData: order.rawData || {}
    });

    await reference.set(document, { merge: true });
    return document;
  }

  async insertOrderEvents(order) {
    const events = Array.isArray(order.events) ? order.events : [];
    const batch = this.db.batch();
    for (const event of events) {
      const id = eventId([order.trackingNumber, event.time, event.statusCode, event.statusName, event.reason]);
      const reference = this.db.collection("viettelpost_order_events").doc(id);
      batch.set(
        reference,
        sanitize({
          trackingNumber: order.trackingNumber,
          ...event,
          rawData: event.rawData || {}
        }),
        { merge: true }
      );
    }
    if (events.length > 0) {
      await batch.commit();
    }
  }

  async recordWebhookEvent(event) {
    await this.db.collection("viettelpost_order_events").add(sanitize(event));
  }

  async getOrder(trackingNumber) {
    const snapshot = await this.db.collection("viettelpost_orders").doc(trackingNumber).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async listOrders() {
    const snapshot = await this.db.collection("viettelpost_orders").orderBy("lastCheckedAt", "desc").limit(500).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async listAlerts() {
    const snapshot = await this.db.collection("viettelpost_alerts").orderBy("sentAt", "desc").limit(500).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async upsertRevenueOrders(orders) {
    let insertedCount = 0;
    let updatedCount = 0;

    for (const order of orders || []) {
      const trackingNumber = order.trackingNumber;
      if (!trackingNumber) continue;
      const reference = this.db.collection("viettelpost_revenue_ledger").doc(trackingNumber);
      const existing = await reference.get();
      const existingData = existing.exists ? existing.data() : {};
      const document = sanitize({
        ...existingData,
        trackingNumber,
        orderCode: order.orderCode || existingData.orderCode || "",
        receiverName: order.receiverName || existingData.receiverName || "",
        receiverPhone: order.receiverPhone || existingData.receiverPhone || "",
        codAmount: Number(order.codAmount || existingData.codAmount || 0),
        deliveredAt: order.deliveredAt || existingData.deliveredAt || null,
        createdAt: order.createdAt || existingData.createdAt || null,
        acceptedAt: order.acceptedAt || existingData.acceptedAt || null,
        statusName: order.currentStatusName || existingData.statusName || "",
        firstRecordedAt: existingData.firstRecordedAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });

      await reference.set(document, { merge: true });
      if (existing.exists) updatedCount += 1;
      else insertedCount += 1;
    }

    return { insertedCount, updatedCount };
  }

  async getRevenueSummary() {
    const snapshot = await this.db.collection("viettelpost_revenue_ledger").limit(10000).get();
    const entries = snapshot.docs.map((doc) => doc.data());
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
    const snapshot = await this.db.collection("viettelpost_bot_state").doc("telegram").get();
    return snapshot.exists ? Number(snapshot.data().updateOffset || 0) : 0;
  }

  async setTelegramUpdateOffset(offset) {
    const document = {
      updateOffset: Number(offset || 0),
      updatedAt: new Date().toISOString()
    };
    await this.db.collection("viettelpost_bot_state").doc("telegram").set(document, { merge: true });
    return document;
  }

  async getLastAlert(trackingNumber, alertType) {
    const snapshot = await this.db.collection("viettelpost_alerts").doc(`${trackingNumber}:${alertType}`).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async saveAlert(alert, sendResult = {}) {
    const key = `${alert.trackingNumber}:${alert.alertType}`;
    const reference = this.db.collection("viettelpost_alerts").doc(key);
    const existing = await reference.get();
    const existingData = existing.exists ? existing.data() : {};
    const sentAt = new Date().toISOString();
    const document = compactAlert({
      ...existingData,
      ...alert,
      sentAt,
      telegram: sendResult,
      history: [
        ...((existingData.history || []).slice(-20)),
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
    });

    await reference.set(document, { merge: true });
    await this.db.collection("viettelpost_orders").doc(alert.trackingNumber).set({ lastAlertAt: sentAt }, { merge: true });
    return document;
  }

  async recordBotLog(log) {
    await this.db.collection("viettelpost_bot_logs").add(sanitize(log));
  }
}

module.exports = {
  FirestoreStore,
  ensureFirebaseAdmin
};
