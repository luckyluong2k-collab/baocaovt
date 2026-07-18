const { getConfig } = require("../src/config");
const { sendUndeliveredReport } = require("../src/reports/undeliveredReport");
const { sanitizeError } = require("../src/utils/sanitize");

sendUndeliveredReport(getConfig())
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify(sanitizeError(error), null, 2));
    process.exit(1);
  });
