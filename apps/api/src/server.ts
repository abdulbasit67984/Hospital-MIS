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

import {
  createFormularyPrescriptionInfrastructure,
} from './infrastructure/formulary-prescription-infrastructure.js';

import {
  type MongoCoherentConfigurationCacheAdapter,
} from './infrastructure/mongo-coherent-configuration-cache.adapter.js';

import {
  createOperationalInfrastructure,
} from './infrastructure/operational-infrastructure.js';

import {
  createNursingMedicationInfrastructure,
} from './infrastructure/nursing-medication-infrastructure.js';

import {
  createInventoryInfrastructure,
} from './infrastructure/inventory-infrastructure.js';

import {
  createPharmacyDispensingInfrastructure,
} from './infrastructure/pharmacy-dispensing-infrastructure.js';

import {
  createPaymentsCashierShiftsInfrastructure,
} from './infrastructure/payments-cashier-shifts-infrastructure.js';

import {
  createPanelsPackagesCoverageInfrastructure,
} from './infrastructure/panels-packages-coverage-infrastructure.js';

import {
  createClaimsInfrastructure,
} from './infrastructure/claims-infrastructure.js';

import {
  createWelfareZakatInfrastructure,
} from './infrastructure/welfare-zakat-infrastructure.js';

import {
  registerOpenApi,
} from './infrastructure/openapi.js';

import {
  createPatientInfrastructure,
} from './infrastructure/patient-infrastructure.js';

import {
  createReadinessProbe,
} from './infrastructure/readiness.js';

import {
  createRegistrationQueueInfrastructure,
} from './infrastructure/registration-queue-infrastructure.js';

import {
  startRecoveryLoop,
} from './infrastructure/recovery-loop.js';

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
  createClinicalEmrInfrastructure,
  createClinicalEmrModule,
} from './modules/clinical-emr/clinical-emr.module.js';

import {
  createFacilityModule,
} from './modules/facility/index.js';

import {
  createFormularyPrescriptionModule,
} from './modules/formulary-prescriptions/formulary-prescriptions.module.js';

import {
  createIdentityInfrastructure,
  createIdentityModule,
} from './modules/identity/index.js';

import {
  createPatientModule,
} from './modules/patient/index.js';

import {
  createNursingMedicationModule,
} from './modules/nursing-medication/index.js';

import {
  createInventoryModule,
} from './modules/inventory/index.js';

import {
  createPharmacyDispensingModule,
} from './modules/pharmacy-dispensing/index.js';

import {
  createPaymentsCashierShiftsModule,
} from './modules/payments-cashier-shifts/index.js';

import {
  createPanelsPackagesCoverageModule,
} from './modules/panels-packages-coverage/index.js';

import {
  createClaimsModule,
} from './modules/claims/index.js';

import {
  createWelfareZakatModule,
} from './modules/welfare-zakat/index.js';

import {
  createRegistrationQueueModule,
} from './modules/registration-queue/index.js';

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

const registrationQueueInfrastructure =
  createRegistrationQueueInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          queueDefinitionId:
            message.queueDefinitionId,

          serviceDate:
            message.serviceDate,

          payload:
            message.payload,
        },
      );
    },
  });

const clinicalEmrInfrastructure =
  createClinicalEmrInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          patientId:
            message.patientId,

          encounterId:
            message.encounterId,

          providerId:
            message.providerId,

          payload:
            message.payload,
        },
      );
    },
  });

const formularyPrescriptionInfrastructure =
  createFormularyPrescriptionInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,

    interactions:
      null,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          patientId:
            message.patientId,

          encounterId:
            message.encounterId,

          prescriptionId:
            message.prescriptionId,

          providerId:
            message.providerId,

          payload:
            message.payload,
        },
      );
    },
  });

const nursingMedicationInfrastructure =
  createNursingMedicationInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,

    clinicalEmrApplication:
      clinicalEmrInfrastructure.application,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          admissionId:
            message.admissionId,

          patientId:
            message.patientId,

          wardId:
            message.wardId,

          entityId:
            message.entityId,

          payload:
            message.payload,
        },
      );
    },
  });

const inventoryInfrastructure =
  createInventoryInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          locationId:
            message.locationId,

          supplierId:
            message.supplierId,

          requisitionId:
            message.requisitionId,

          purchaseOrderId:
            message.purchaseOrderId,

          goodsReceiptId:
            message.goodsReceiptId,

          supplierReturnId:
            message.supplierReturnId,

          payload:
            message.payload,
        },
      );
    },
  });

const pharmacyDispensingInfrastructure =
  createPharmacyDispensingInfrastructure({
    database,

    inventoryApplication:
      inventoryInfrastructure.application,

    operationalInfrastructure,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          pharmacyLocationId:
            message.pharmacyLocationId,

          payload:
            message.payload,
        },
      );
    },
  });

const paymentsCashierShiftsInfrastructure =
  createPaymentsCashierShiftsInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    async publishRealtime(
      message,
    ) {
      socketServer?.emit(
        message.eventType,
        {
          facilityId:
            message.facilityId,

          entityId:
            message.entityId,

          counterId:
            message.counterId,

          shiftId:
            message.shiftId,

          status:
            message.status,

          occurredAt:
            message.occurredAt,
        },
      );
    },
  });

const panelsPackagesCoverageInfrastructure =
  createPanelsPackagesCoverageInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,
  });


const claimsInfrastructure =
  createClaimsInfrastructure({
    database,

    auditRepository:
      auditModule.repository,

    operationalInfrastructure,

    snapshotCrypto:
      facilityInfrastructure.crypto,
  });


const welfareZakatInfrastructure =
  createWelfareZakatInfrastructure({
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

const registrationQueueModule =
  createRegistrationQueueModule({
    infrastructure:
      registrationQueueInfrastructure,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const clinicalEmrModule =
  createClinicalEmrModule({
    infrastructure:
      clinicalEmrInfrastructure,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const formularyPrescriptionModule =
  createFormularyPrescriptionModule({
    application:
      formularyPrescriptionInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const nursingMedicationModule =
  createNursingMedicationModule({
    application:
      nursingMedicationInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });

const inventoryModule =
  createInventoryModule({
    application:
      inventoryInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,

    actorResolver:
      inventoryInfrastructure.runtime.actorResolver,
  });

const pharmacyDispensingModule =
  createPharmacyDispensingModule({
    application:
      pharmacyDispensingInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,

    actorResolver:
      pharmacyDispensingInfrastructure.runtime.actorResolver,
  });

const paymentsCashierShiftsModule =
  createPaymentsCashierShiftsModule({
    application:
      paymentsCashierShiftsInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,

    actorResolver:
      paymentsCashierShiftsInfrastructure.actorResolver,
  });

const panelsPackagesCoverageModule =
  createPanelsPackagesCoverageModule({
    application:
      panelsPackagesCoverageInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });


const claimsModule =
  createClaimsModule({
    application:
      claimsInfrastructure.application,

    authenticationService:
      authenticationModule.service,

    authorizationService:
      authorizationModule.service,
  });


const welfareZakatModule =
  createWelfareZakatModule({
    application:
      welfareZakatInfrastructure.application,

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

      application.use(
        '/api/v1/opd',
        registrationQueueModule.router,
      );

      application.use(
        '/api/v1/clinical-emr',
        clinicalEmrModule.router,
      );

      application.use(
        '/api/v1/formulary-prescriptions',
        formularyPrescriptionModule.router,
      );


      application.use(
        '/api/v1/nursing-medication',
        nursingMedicationModule.router,
      );

      application.use(
        '/api/v1/inventory',
        inventoryModule.router,
      );

      application.use(
        '/api/v1/pharmacy-dispensing',
        pharmacyDispensingModule.router,
      );


      application.use(
        '/api/v1/payments-cashier-shifts',
        paymentsCashierShiftsModule.router,
      );

      application.use(
        '/api/v1/panels-packages-coverage',
        panelsPackagesCoverageModule.router,
      );


      application.use(
        '/api/v1/claims',
        claimsModule.router,
      );


      application.use(
        '/api/v1/welfare-zakat',
        welfareZakatModule.router,
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

      processed +=
      1
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

const outboxInterval =
  setInterval(
    () => {
      void dispatchOutboxBatch();
    },

    1_000,
  );

outboxInterval.unref();

const recoveryLoops = [
  startRecoveryLoop({
    name:
      'Identity',

    workerId:
      `api-identity-recovery:${process.pid}`,

    recovery:
      identityInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Facility',

    workerId:
      `api-facility-recovery:${process.pid}`,

    recovery:
      facilityInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Patient',

    workerId:
      `api-patient-recovery:${process.pid}`,

    recovery:
      patientInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Registration and OPD queue',

    workerId:
      `api-registration-queue-recovery:${process.pid}`,

    recovery:
      registrationQueueInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Clinical EMR',

    workerId:
      `api-clinical-emr-recovery:${process.pid}`,

    recovery:
      clinicalEmrInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Formulary and prescriptions',

    workerId:
      `api-formulary-prescription-recovery:${process.pid}`,

    recovery:
      formularyPrescriptionInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Nursing and medication administration',

    workerId:
      `api-nursing-medication-recovery:${process.pid}`,

    recovery:
      nursingMedicationInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Pharmacy dispensing',

    workerId:
      `api-pharmacy-dispensing-recovery:${process.pid}`,

    recovery:
      pharmacyDispensingInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Payments and cashier shifts',

    workerId:
      `api-payments-cashier-recovery:${process.pid}`,

    recovery:
      paymentsCashierShiftsInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Panels, packages, and coverage',

    workerId:
      `api-ppc-recovery:${process.pid}`,

    recovery:
      panelsPackagesCoverageInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Claims',

    workerId:
      `api-claims-recovery:${process.pid}`,

    recovery:
      claimsInfrastructure.recovery,

    logger,
  }),

  startRecoveryLoop({
    name:
      'Welfare and Zakat',

    workerId:
      `api-welfare-zakat-recovery:${process.pid}`,

    recovery:
      welfareZakatInfrastructure.recovery,

    logger,
  }),
];

inventoryInfrastructure.backgroundJobs.start();
pharmacyDispensingInfrastructure.backgroundJobs.start();
paymentsCashierShiftsInfrastructure.backgroundJobs.start();
panelsPackagesCoverageInfrastructure.backgroundJobs.start();
claimsInfrastructure.backgroundJobs.start();
welfareZakatInfrastructure.backgroundJobs.start();

void dispatchOutboxBatch();

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

        registrationQueueModule:
          'mounted',

        clinicalEmrModule:
          'mounted',

        formularyPrescriptionModule:
          'mounted',

        nursingMedicationModule:
          'mounted',

        inventoryModule:
          'mounted',

        pharmacyDispensingModule:
          'mounted',

        paymentsCashierShiftsModule:
          'mounted',

        panelsPackagesCoverageModule:
          'mounted',

        claimsModule:
          'mounted',

        transactionRecovery:
          'enabled',

        outboxDispatch:
          'enabled',

        inventoryBackgroundJobs:
          'enabled',

        pharmacyDispensingBackgroundJobs:
          'enabled',

        paymentsCashierShiftsBackgroundJobs:
          'enabled',

        panelsPackagesCoverageBackgroundJobs:
          'enabled',

        claimsBackgroundJobs:
          'enabled-with-report-export-submission-retry-and-dead-letter',

        claimsRecovery:
          'enabled-with-aging-refresh-and-transaction-evidence-recovery',

        panelsPackagesCoverageFinancialControls:
          'enabled-with-maker-checker-billing-refund-audit-outbox-reporting-and-recovery',

        paymentFinancialControls:
          'enabled-with-maker-checker-idempotency-ledger-audit-outbox-and-recovery',

        patientSensitiveSnapshotEncryption:
          'enabled',

        registrationQueueSnapshotEncryption:
          'enabled',

        clinicalEmrSnapshotEncryption:
          'enabled',

        formularyPrescriptionSnapshotEncryption:
          'enabled',

        nursingMedicationSnapshotEncryption:
          'enabled',

        medicationAdministrationInventoryMutation:
          'disabled',

        prescriptionInventoryMutation:
          'disabled',

        inventoryDispensingMutation:
          'enabled-through-inventory-ledger',

        pharmacyDispensingFinalization:
          'enabled-with-idempotency-audit-outbox-and-recovery',

        facilityAuthenticationEnforcement:
          'enabled',

        configurationCacheCoherence:
          'mongo-epoch-and-outbox',

        welfareZakatModule:
          'mounted-with-funds-applications-approvals-allocations-transfers-reports-and-recovery',

        welfareZakatBackgroundJobs:
          'enabled-with-expiry-reconciliation-and-report-exports',

        welfareZakatRecovery:
          'enabled-with-evidence-based-transaction-recovery',
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

  inventoryInfrastructure.backgroundJobs.stop();
  pharmacyDispensingInfrastructure.backgroundJobs.stop();
  paymentsCashierShiftsInfrastructure.backgroundJobs.stop();
  panelsPackagesCoverageInfrastructure.backgroundJobs.stop();
  claimsInfrastructure.backgroundJobs.stop();
  welfareZakatInfrastructure.backgroundJobs.stop();

  clearInterval(
    outboxInterval,
  );

  for (
    const recoveryLoop of
    recoveryLoops
  ) {
    recoveryLoop.stop();
  }

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
        () => {
          resolve();
        },
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
          () => {
            process.exit(
              0,
            );
          },
        )
        .catch(
          (
            error:
              unknown,
          ) => {
            logger.fatal(
              {
                error,

                signal,
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