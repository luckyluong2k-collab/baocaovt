const fs = require("fs");
const path = require("path");
const { parseCsv, toNumber } = require("../utils/csv");
const { sanitize } = require("../utils/sanitize");
const { sleep } = require("../utils/time");
const { normalizeOrder, mergeOrder } = require("../order/normalize");
const { loadFieldMapping, listItemsFromResponse, getByPath } = require("./mapping");

function buildUrl(baseUrl, routePath, params = {}) {
  if (!baseUrl || !routePath) {
    throw new Error("Chua cau hinh VIETTELPOST_API_BASE_URL hoac endpoint Viettel Post.");
  }
  const expandedPath = Object.entries(params).reduce(
    (current, [key, value]) => current.replaceAll(`:${key}`, encodeURIComponent(value)),
    routePath
  );
  return new URL(expandedPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function requestJson(url, options, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.message || body.error || response.statusText}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(300 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

class ViettelPostClient {
  constructor(config) {
    this.config = config;
    this.mapping = loadFieldMapping(config.viettelPost.fieldMappingFile);
    this.sessionToken = "";
  }

  async authToken() {
    if (this.config.viettelPost.token) return this.config.viettelPost.token;
    if (this.sessionToken) return this.sessionToken;
    if (!this.config.viettelPost.username || !this.config.viettelPost.password || !this.config.viettelPost.loginPath) {
      return "";
    }

    const url = buildUrl(this.config.viettelPost.baseUrl, this.config.viettelPost.loginPath);
    const raw = await requestJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: this.config.viettelPost.username,
        password: this.config.viettelPost.password
      })
    });

    const tokenPath = this.mapping && this.mapping.auth && this.mapping.auth.tokenPath;
    this.sessionToken = tokenPath ? getByPath(raw, tokenPath) : raw.token || (raw.data && raw.data.token) || "";
    if (!this.sessionToken) {
      throw new Error("Dang nhap Viettel Post thanh cong nhung khong tim thay token trong JSON. Hay cap nhat mapping auth.tokenPath.");
    }
    return this.sessionToken;
  }

  async headers() {
    const token = await this.authToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(this.config.viettelPost.customerId ? { "X-Customer-Id": this.config.viettelPost.customerId } : {})
    };
  }

  async listOrdersFromApi() {
    if (!this.config.viettelPost.listOrdersPath) {
      throw new Error("Chua co endpoint lay danh sach don. Dien VIETTELPOST_LIST_ORDERS_PATH khi co tai lieu API that.");
    }
    const url = buildUrl(this.config.viettelPost.baseUrl, this.config.viettelPost.listOrdersPath);
    const method = this.config.viettelPost.listOrdersMethod.toUpperCase();
    const raw = await requestJson(url, {
      method,
      headers: await this.headers(),
      ...(method === "GET" ? {} : { body: JSON.stringify({ customerId: this.config.viettelPost.customerId || undefined }) })
    });
    return listItemsFromResponse(raw, this.mapping).map((item) => normalizeOrder(item, this.mapping));
  }

  async listOrdersFromCsv() {
    let text = "";
    if (this.config.sources.googleSheetCsvUrl) {
      const response = await fetch(this.config.sources.googleSheetCsvUrl);
      if (!response.ok) throw new Error(`Khong doc duoc Google Sheet CSV: HTTP ${response.status}`);
      text = await response.text();
    } else {
      const csvPath = this.config.sources.trackingCsvPath;
      if (!fs.existsSync(csvPath)) {
        throw new Error(`Khong tim thay file CSV: ${csvPath}`);
      }
      text = fs.readFileSync(csvPath, "utf8");
    }

    return parseCsv(text).map((record) =>
      normalizeOrder({
        ...record,
        codAmount: toNumber(record.codAmount)
      })
    );
  }

  async listOrdersFromFirestore() {
    let admin;
    try {
      admin = require("firebase-admin");
    } catch (error) {
      throw new Error("ORDER_SOURCE=firestore can cai package firebase-admin. Chay npm install truoc khi dung Firestore.");
    }

    if (!admin.apps.length) {
      admin.initializeApp();
    }

    const snapshot = await admin.firestore().collection(this.config.sources.firestoreOrdersCollection).get();
    return snapshot.docs.map((doc) => normalizeOrder({ trackingNumber: doc.id, ...doc.data() }, this.mapping));
  }

  async listOrdersFromMock() {
    const files = fs
      .readdirSync(this.config.mockDir)
      .filter((file) => file.endsWith(".json"))
      .sort();
    return files.map((file) => {
      const raw = JSON.parse(fs.readFileSync(path.join(this.config.mockDir, file), "utf8"));
      return normalizeOrder(raw, this.mapping);
    });
  }

  async listOrders() {
    if (this.config.useMockData) return this.listOrdersFromMock();
    if (this.config.orderSource === "csv") return this.listOrdersFromCsv();
    if (this.config.orderSource === "firestore") return this.listOrdersFromFirestore();
    return this.listOrdersFromApi();
  }

  async getOrderDetail(trackingNumber) {
    if (!trackingNumber) return null;
    if (this.config.useMockData) {
      const orders = await this.listOrdersFromMock();
      return orders.find((order) => order.trackingNumber === trackingNumber) || null;
    }

    if (!this.config.viettelPost.orderDetailPath) return null;
    const url = buildUrl(this.config.viettelPost.baseUrl, this.config.viettelPost.orderDetailPath, { trackingNumber });
    const method = this.config.viettelPost.orderDetailMethod.toUpperCase();
    const raw = await requestJson(url, {
      method,
      headers: await this.headers(),
      ...(method === "GET" ? {} : { body: JSON.stringify({ trackingNumber }) })
    });
    return normalizeOrder(raw, this.mapping);
  }

  async hydrateOrder(baseOrder) {
    if (this.config.useMockData || !baseOrder || !baseOrder.trackingNumber) return baseOrder;
    const detail = await this.getOrderDetail(baseOrder.trackingNumber);
    return detail ? mergeOrder(baseOrder, detail) : baseOrder;
  }

  async captureSanitizedSample(trackingNumber, outputPath) {
    if (this.config.useMockData) {
      throw new Error("Tat USE_MOCK_DATA=false truoc khi ghi sample JSON that.");
    }
    let raw;
    if (trackingNumber) {
      const url = buildUrl(this.config.viettelPost.baseUrl, this.config.viettelPost.orderDetailPath, { trackingNumber });
      raw = await requestJson(url, { method: this.config.viettelPost.orderDetailMethod, headers: await this.headers() });
    } else {
      const url = buildUrl(this.config.viettelPost.baseUrl, this.config.viettelPost.listOrdersPath);
      raw = await requestJson(url, { method: this.config.viettelPost.listOrdersMethod, headers: await this.headers() });
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(sanitize(raw), null, 2)}\n`, "utf8");
    return outputPath;
  }
}

module.exports = {
  ViettelPostClient,
  buildUrl,
  requestJson
};
