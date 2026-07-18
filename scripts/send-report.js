const { getConfig } = require("../src/config");
const { sendReport } = require("../src/reports/operationsReport");
const { sanitizeError } = require("../src/utils/sanitize");

const reportCode = String(process.argv[2] || "bc2").toLowerCase();

sendReport(reportCode, getConfig())
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify(sanitizeError(error), null, 2));
    process.exit(1);
  });
