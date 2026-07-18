const { getConfig } = require("./config");
const { runBotCheck } = require("./scheduler");
const { startServer } = require("./server");
const { sanitizeError } = require("./utils/sanitize");

async function main() {
  const config = getConfig();
  const server = startServer(config);
  console.log(`Viettel Post bot API dang chay tai http://localhost:${config.api.port}/api/viettelpost/health`);

  async function runSafely() {
    try {
      const summary = await runBotCheck(config);
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error(JSON.stringify(sanitizeError(error), null, 2));
    }
  }

  if (config.schedule.runOnStartup) {
    runSafely();
  }

  if (config.schedule.runCron) {
    const intervalMs = config.schedule.checkIntervalMinutes * 60 * 1000;
    setInterval(runSafely, intervalMs);
  }

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error(JSON.stringify(sanitizeError(error), null, 2));
  process.exit(1);
});
