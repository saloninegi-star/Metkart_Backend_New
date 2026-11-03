const { loadEnvironment } = require("./config/environment");
const { connectDatabase } = require("./config/database");
const { createApp } = require("./app");
const mongoose = require("mongoose");

async function startServer() {
  const config = loadEnvironment();
  await connectDatabase(config.mongodbUri);

  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`Metkart API listening on port ${config.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down`);

    server.close(async (error) => {
      if (error) {
        console.error("Failed to close HTTP server cleanly", error);
        process.exitCode = 1;
      }
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        console.error("Failed to disconnect from MongoDB", disconnectError);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Could not start Metkart API", error);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
