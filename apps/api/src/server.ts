import 'dotenv/config';

import {
  createServer,
} from 'node:http';

import {
  loadApiConfig,
  loadAuthConfig,
} from '@hospital-mis/config';

import {
  loadFacilityConfigurationConfig,
} from '@hospital-mis/config/facility-configuration';

import {
  connectDatabase,
  disconnectDatabase,
  nativeDatabase,
} from '@hospital-mis/database';

import {
  createLogger,
} from '@hospital-mis/shared';

import {
  Server as SocketIoServer,
} from 'socket.io';

import {
  createApp,
} from './app.js';

import {
  createFacilityInfrastructure,
} from './infrastructure/facility-infrastructure.js';

import type {
  MongoCoherentConfigurationCacheAdapter,
} from './infrastructure/mongo-coherent-configuration-cache.adapter.js';

import {
  createOperationalInfrastructure,
} from './infrastructure/operational-infrastructure.js';

import {
  createPatientInfrastructure,
} from './infrastructure/patient-infrastructure.js';

import {
  registerOpenApi,
} from './infrastructure/openapi.js';

import {
  createReadinessProbe,
} from './infrastructure/readiness.js';

import {
  createAuditModule,
} from './modules/audit/index.js';

import {
  createAuthenticationModule,
} from './modules/auth/index.js';

import {
  createAuthorizationModule,
} from './modules/authorization/index.js';

import {
  createFacilityModule,
} from './modules/facility/index.js';

import {
  createIdentityInfrastructure,
  createIdentityModule,
} from './modules/identity/index.js';

import {
  createPatientModule,
} from './modules/patient/index.js';

const config =
  loadApiConfig();

const authConfig =
  loadAuthConfig();

const facilityConfiguration =
  loadFacilityConfigurationConfig();

const logger =
  createLogger(
    'hospital-mis-api-bootstrap',
    config.logLevel,
  );

await connectDatabase({
  uri:
    config.mongodbUri,

  appName:
    config.mongodbAppName,

  serverSelectionTimeoutMs:
    config.mongodbServerSelectionTimeoutMs,
});

const database =
  nativeDatabase();

let socketServer:
  SocketIoServer | undefined;

let facilityCache:
  MongoCoherentConfigurationCacheAdapter | undefined;

const authorizationModule =
  createAuthorizationModule(
    database,
  );

const auditModule =
  createAuditModule(
    database,
  );

const operationalInfrastructure =
  createOperationalInfrastructure({
    database,

    async publishEvent(
      event,
    ) {
      await facilityCache
        ?.handleOutboxEvent(
          event,
        );

      socketServer?.emit(
        event.eventType,
        {
          eventId:
            event.eventId,

          aggregateType:
            event.aggregateType,

          aggregateId:
            event.aggregateId,

          payload:
            event.payload,
        },
      );
    },
  });

const facilityInfrastructure =
  createFacilityInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    configuration:
      facilityConfiguration,
  });

facilityCache =
  facilityInfrastructure.cache;

const patientInfrastructure =
  createPatientInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,
  });

const authenticationModule =
  createAuthenticationModule({
    database,

    apiConfig:
      config,

    authConfig,

    facilityAccess:
      facilityInfrastructure
        .application
        .facilityService,
  });

const identityInfrastructure =
  createIdentityInfrastructure({
    database,
    authConfig,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,
  });

const identityModule =
  createIdentityModule({
    application:
      identityInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const facilityModule =
  createFacilityModule({
    infrastructure:
      facilityInfrastructure,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const patientModule =
  createPatientModule({
    infrastructure:
      patientInfrastructure,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const readinessProbe =
  createReadinessProbe(
    config,
  );

const app =
  createApp({
    config,
    readinessProbe,

    registerRoutes(
      application,
    ) {
      registerOpenApi(
        application,
      );

      application.use(
        '/api/v1/auth',
        authenticationModule.router,
      );

      application.use(
        '/api/v1/identity',
        identityModule.router,
      );

      application.use(
        '/api/v1/facilities',
        facilityModule.router,
      );

      application.use(
        '/api/v1/configuration',
        facilityModule
          .configurationRouter,
      );

      application.use(
        '/api/v1/patients',
        patientModule.patientRouter,
      );

      application.use(
        '/api/v1/guardians',
        patientModule.guardianRouter,
      );
    },
  });

const httpServer =
  createServer(
    app,
  );

socketServer =
  new SocketIoServer(
    httpServer,
    {
      path:
        config.socketIoPath,

      cors: {
        origin:
          config.corsOrigins,

        credentials:
          true,
      },
    },
  );

socketServer.on(
  'connection',
  (
    socket,
  ) => {
    socket.emit(
      'system.connected',
      {
        connectionId:
          socket.id,

        timestamp:
          new Date()
            .toISOString(),
      },
    );
  },
);

let outboxDispatching =
  false;

async function dispatchOutboxBatch():
  Promise<void> {
  if (
    outboxDispatching
  ) {
    return;
  }

  outboxDispatching =
    true;

  try {
    for (
      let processed =
        0;

      processed <
      100;

      processed += 1
    ) {
      const found =
        await operationalInfrastructure
          .outboxDispatcher
          .runOnce(
            'api-outbox-dispatcher',
          );

      if (
        !found
      ) {
        break;
      }
    }
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Outbox dispatch cycle failed',
    );
  } finally {
    outboxDispatching =
      false;
  }
}

let identityRecoveryRunning =
  false;

async function recoverIdentityTransactions():
  Promise<void> {
  if (
    identityRecoveryRunning
  ) {
    return;
  }

  identityRecoveryRunning =
    true;

  try {
    const now =
      new Date();

    const staleBefore =
      new Date(
        now.getTime() -
          5 * 60 * 1000,
      );

    const markedStale =
      await identityInfrastructure
        .recovery
        .markStaleTransactions(
          staleBefore,
        );

    const result =
      await identityInfrastructure
        .recovery
        .recoverAvailable({
          workerId:
            `api-identity-recovery:${process.pid}`,

          maxTransactions:
            20,

          now,
        });

    if (
      markedStale >
        0 ||
      result.recovered >
        0 ||
      result.failed >
        0
    ) {
      logger.info(
        {
          markedStale,
          ...result,
        },
        'Identity recovery cycle completed',
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Identity recovery cycle failed',
    );
  } finally {
    identityRecoveryRunning =
      false;
  }
}

let facilityRecoveryRunning =
  false;

async function recoverFacilityTransactions():
  Promise<void> {
  if (
    facilityRecoveryRunning
  ) {
    return;
  }

  facilityRecoveryRunning =
    true;

  try {
    const now =
      new Date();

    const staleBefore =
      new Date(
        now.getTime() -
          5 * 60 * 1000,
      );

    const markedStale =
      await facilityInfrastructure
        .recovery
        .markStaleTransactions(
          staleBefore,
        );

    const result =
      await facilityInfrastructure
        .recovery
        .recoverAvailable({
          workerId:
            `api-facility-recovery:${process.pid}`,

          maxTransactions:
            20,

          now,
        });

    if (
      markedStale >
        0 ||
      result.recovered >
        0 ||
      result.failed >
        0
    ) {
      logger.info(
        {
          markedStale,
          ...result,
        },
        'Facility recovery cycle completed',
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Facility recovery cycle failed',
    );
  } finally {
    facilityRecoveryRunning =
      false;
  }
}

let patientRecoveryRunning =
  false;

async function recoverPatientTransactions():
  Promise<void> {
  if (
    patientRecoveryRunning
  ) {
    return;
  }

  patientRecoveryRunning =
    true;

  try {
    const now =
      new Date();

    const staleBefore =
      new Date(
        now.getTime() -
          5 * 60 * 1000,
      );

    const markedStale =
      await patientInfrastructure
        .recovery
        .markStaleTransactions(
          staleBefore,
        );

    const result =
      await patientInfrastructure
        .recovery
        .recoverAvailable({
          workerId:
            `api-patient-recovery:${process.pid}`,

          maxTransactions:
            20,

          now,
        });

    if (
      markedStale >
        0 ||
      result.recovered >
        0 ||
      result.failed >
        0
    ) {
      logger.info(
        {
          markedStale,
          ...result,
        },
        'Patient recovery cycle completed',
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Patient recovery cycle failed',
    );
  } finally {
    patientRecoveryRunning =
      false;
  }
}

const outboxInterval =
  setInterval(
    () => {
      void dispatchOutboxBatch();
    },
    1_000,
  );

outboxInterval.unref();

const identityRecoveryInterval =
  setInterval(
    () => {
      void recoverIdentityTransactions();
    },
    15_000,
  );

identityRecoveryInterval.unref();

const facilityRecoveryInterval =
  setInterval(
    () => {
      void recoverFacilityTransactions();
    },
    15_000,
  );

facilityRecoveryInterval.unref();

const patientRecoveryInterval =
  setInterval(
    () => {
      void recoverPatientTransactions();
    },
    15_000,
  );

patientRecoveryInterval.unref();

void recoverIdentityTransactions();
void recoverFacilityTransactions();
void recoverPatientTransactions();

httpServer.listen(
  config.apiPort,
  () => {
    logger.info(
      {
        port:
          config.apiPort,

        nodeEnv:
          config.nodeEnv,

        mongodbMode:
          'standalone',

        identityModule:
          'mounted',

        facilityModule:
          'mounted',

        configurationModule:
          'mounted',

        patientModule:
          'mounted',

        guardianModule:
          'mounted',

        identityRecovery:
          'enabled',

        facilityRecovery:
          'enabled',

        patientRecovery:
          'enabled',

        patientSensitiveSnapshotEncryption:
          'enabled',

        facilityAuthenticationEnforcement:
          'enabled',

        configurationCacheCoherence:
          'mongo-epoch-and-outbox',
      },
      'Hospital MIS API started',
    );
  },
);

let shuttingDown =
  false;

async function shutdown(
  signal:
    string,
): Promise<void> {
  if (
    shuttingDown
  ) {
    return;
  }

  shuttingDown =
    true;

  clearInterval(
    outboxInterval,
  );

  clearInterval(
    identityRecoveryInterval,
  );

  clearInterval(
    facilityRecoveryInterval,
  );

  clearInterval(
    patientRecoveryInterval,
  );

  logger.info(
    {
      signal,
    },
    'Graceful shutdown started',
  );

  await new Promise<void>(
    (
      resolve,
    ) => {
      if (
        socketServer ===
        undefined
      ) {
        resolve();
        return;
      }

      socketServer.close(
        () =>
          resolve(),
      );
    },
  );

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      httpServer.close(
        (
          error,
        ) => {
          if (
            error
          ) {
            reject(
              error,
            );

            return;
          }

          resolve();
        },
      );
    },
  );

  await disconnectDatabase();

  logger.info(
    'Graceful shutdown completed',
  );
}

for (
  const signal of
  [
    'SIGINT',
    'SIGTERM',
  ] as const
) {
  process.on(
    signal,
    () => {
      void shutdown(
        signal,
      )
        .then(
          () =>
            process.exit(
              0,
            ),
        )
        .catch(
          (
            error:
              unknown,
          ) => {
            logger.fatal(
              {
                error,
              },
              'Graceful shutdown failed',
            );

            process.exit(
              1,
            );
          },
        );
    },
  );
}