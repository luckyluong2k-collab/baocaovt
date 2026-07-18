const SENSITIVE_KEY_PATTERN = /(token|password|authorization|secret|api[_-]?key|cookie|session)/i;
const TELEGRAM_TOKEN_PATTERN = /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

function redactString(value) {
  return String(value)
    .replace(TELEGRAM_TOKEN_PATTERN, "[REDACTED_TELEGRAM_TOKEN]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]");
}

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitize(item);
  }
  return output;
}

function sanitizeError(error) {
  return sanitize({
    name: error && error.name,
    message: error && error.message,
    stack: error && error.stack
  });
}

module.exports = {
  sanitize,
  sanitizeError,
  redactString
};
