import 'dotenv/config';
import { createServer } from 'node:http';
import { loadApiConfig } from '@hospital-mis/config';
import { connectDatabase, disconnectDatabase } from '@hospital-mis/database';
import { createLogger } from '@hospital-mis/shared';
import { Server as SocketIoServer } from 'socket.io';
import { createApp } from './app.js';
import { createReadinessProbe } from './infrastructure/readiness.js';

const config = loadApiConfig();
const logger = createLogger('hospital-mis-api-bootstrap', config.logLevel);

await connectDatabase({
  uri: config.mongodbUri,
  appName: config.mongodbAppName,
  serverSelectionTimeoutMs: config.mongodbServerSelectionTimeoutMs,
});

const readinessProbe = createReadinessProbe(config);
const app = createApp({ config, readinessProbe });
const httpServer = createServer(app);

const io = new SocketIoServer(httpServer, {
  path: config.socketIoPath,
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.emit('system.connected', {
    connectionId: socket.id,
    timestamp: new Date().toISOString(),
  });
});

httpServer.listen(config.apiPort, () => {
  logger.info(
    {
      port: config.apiPort,
      nodeEnv: config.nodeEnv,
      mongodbMode: 'standalone',
    },
    'Hospital MIS API started',
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  io.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await disconnectDatabase();
  logger.info('Graceful shutdown completed');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.fatal({ error }, 'Graceful shutdown failed');
        process.exit(1);
      });
  });
}
