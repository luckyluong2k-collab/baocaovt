const { getConfig } = require("../src/config");
const { runBotCheck } = require("../src/scheduler");
const { sanitizeError } = require("../src/utils/sanitize");

runBotCheck(getConfig())
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify(sanitizeError(error), null, 2));
    process.exit(1);
  });
