const { getConfig } = require("../src/config");
const { telegramPoll } = require("../src/telegram/poller");
const { sanitizeError } = require("../src/utils/sanitize");

telegramPoll(getConfig())
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify(sanitizeError(error), null, 2));
    process.exit(1);
  });
