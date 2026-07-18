const path = require("path");
const { getConfig } = require("../src/config");
const { ViettelPostClient } = require("../src/viettelpost/client");
const { sanitizeError } = require("../src/utils/sanitize");

async function main() {
  const config = getConfig();
  const trackingNumber = process.argv[2] || "";
  const outputPath = process.env.CAPTURE_SAMPLE_OUTPUT
    ? path.resolve(process.env.CAPTURE_SAMPLE_OUTPUT)
    : path.join(config.projectRoot, "data", "viettelpost-sample.sanitized.json");
  const client = new ViettelPostClient(config);
  const savedAt = await client.captureSanitizedSample(trackingNumber, outputPath);
  console.log(`Da ghi JSON da an thong tin nhay cam: ${savedAt}`);
}

main().catch((error) => {
  console.error(JSON.stringify(sanitizeError(error), null, 2));
  process.exit(1);
});
