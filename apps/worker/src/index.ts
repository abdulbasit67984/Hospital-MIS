import 'dotenv/config';
import { loadWorkerConfig } from '@hospital-mis/config';
import { connectDatabase, disconnectDatabase, pingDatabase } from '@hospital-mis/database';
import { createLogger } from '@hospital-mis/shared';

const config = loadWorkerConfig();
const logger = createLogger('hospital-mis-worker', config.logLevel);

await connectDatabase({
  uri: config.mongodbUri,
  appName: `${config.mongodbAppName}-${config.workerId}`,
  serverSelectionTimeoutMs: config.mongodbServerSelectionTimeoutMs,
});

logger.info(
  {
    workerId: config.workerId,
    mongodbMode: 'standalone',
    healthIntervalMs: config.healthIntervalMs,
  },
  'Foundation worker started',
);

let running = true;
const healthTimer = setInterval(() => {
  void pingDatabase()
    .then((database) => {
      logger.info(
        {
          workerId: config.workerId,
          database,
        },
        'Worker dependency heartbeat',
      );
    })
    .catch((error: unknown) => {
      logger.error({ error, workerId: config.workerId }, 'Worker dependency heartbeat failed');
    });
}, config.healthIntervalMs);
healthTimer.unref();

async function shutdown(signal: string): Promise<void> {
  if (!running) return;
  running = false;
  logger.info({ signal, workerId: config.workerId }, 'Worker shutdown started');
  clearInterval(healthTimer);
  await disconnectDatabase();
  logger.info({ workerId: config.workerId }, 'Worker shutdown completed');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    const forcedExit = setTimeout(() => {
      logger.fatal({ signal }, 'Worker shutdown timed out');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    forcedExit.unref();

    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.fatal({ error, signal }, 'Worker shutdown failed');
        process.exit(1);
      });
  });
}
