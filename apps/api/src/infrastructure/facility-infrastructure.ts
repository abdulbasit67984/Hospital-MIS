import type {
  FacilityConfigurationConfig,
} from '@hospital-mis/config/facility-configuration';

import {
  toObjectId,
  type Db,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import {
  createFacilityApplication,
} from '../modules/facility/facility.application.js';

import {
  FacilityLifecycleService,
} from '../modules/facility/facility.lifecycle.service.js';

import type {
  FacilityMutationDependencies,
} from '../modules/facility/facility.ports.js';

import {
  ActivateDepartmentWorkflow,
} from '../modules/facility/workflows/activate-department.workflow.js';

import {
  ActivateFacilityWorkflow,
} from '../modules/facility/workflows/activate-facility.workflow.js';

import {
  DeactivateDepartmentWorkflow,
} from '../modules/facility/workflows/deactivate-department.workflow.js';

import {
  DeactivateFacilityWorkflow,
  type FacilitySessionRevocationPort,
  type FacilitySessionRevocationResult,
} from '../modules/facility/workflows/deactivate-facility.workflow.js';

import {
  FacilityCompensationExecutor,
} from './facility-compensation.executor.js';

import {
  FacilityRecoveryService,
} from './facility-recovery.service.js';

import {
  createFacilityRuntimeAdapters,
} from './facility-runtime.adapters.js';

import {
  FacilitySettingCompensationExecutor,
} from './facility-setting-compensation.executor.js';

import {
  MongoCoherentConfigurationCacheAdapter,
} from './mongo-coherent-configuration-cache.adapter.js';

import {
  MongoFacilityTransactionManagerAdapter,
} from './facility-transaction-manager.adapter.js';

import type {
  createOperationalInfrastructure,
} from './operational-infrastructure.js';

import {
  SensitiveSettingCryptoService,
} from './sensitive-setting-crypto.service.js';

export interface CreateFacilityInfrastructureOptions {
  database:
    Db;

  auditRepository:
    AuditRepository;

  operationalInfrastructure:
    ReturnType<
      typeof createOperationalInfrastructure
    >;

  configuration:
    FacilityConfigurationConfig;
}

export class MongoFacilitySessionRevocationAdapter
implements FacilitySessionRevocationPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async revokeFacilitySessions(
    input: Readonly<{
      facilityId:
        string;

      revokedBy:
        string;

      reason:
        string;

      revokedAt:
        Date;
    }>,
  ): Promise<FacilitySessionRevocationResult> {
    const facilityId =
      toObjectId(
        input.facilityId,
        'facilityId',
      );

    const revokedBy =
      toObjectId(
        input.revokedBy,
        'revokedBy',
      );

    const refreshTokens =
      await this.database
        .collection(
          'refreshTokens',
        )
        .updateMany(
          {
            facilityId,

            status: {
              $in: [
                'ACTIVE',
                'ROTATED',
              ],
            },
          },
          {
            $set: {
              status:
                'REVOKED',

              revokedAt:
                input.revokedAt,

              revokedBy,

              revokeReason:
                input.reason,
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

    const sessions =
      await this.database
        .collection(
          'sessions',
        )
        .updateMany(
          {
            facilityId,

            status:
              'ACTIVE',
          },
          {
            $set: {
              status:
                'REVOKED',

              revokedAt:
                input.revokedAt,

              revokedBy,

              revokeReason:
                input.reason,
            },

            $inc: {
              version:
                1,
            },

            $currentDate: {
              updatedAt:
                true,
            },
          },
        );

    return {
      sessionsRevoked:
        sessions.modifiedCount,

      refreshTokensRevoked:
        refreshTokens.modifiedCount,
    };
  }
}

export function createFacilityInfrastructure(
  options:
    CreateFacilityInfrastructureOptions,
) {
  const cache =
    new MongoCoherentConfigurationCacheAdapter(
      options.database,
      {
        maximumEntries:
          options.configuration
            .cacheMaximumEntries,

        epochRefreshMilliseconds:
          1_000,
      },
    );

  const crypto =
    new SensitiveSettingCryptoService({
      activeKeyVersion:
        options.configuration
          .activeEncryptionKeyVersion,

      keys:
        options.configuration
          .encryptionKeys,

      hashSecret:
        options.configuration
          .hashSecret,
    });

  const lifecycleCompensationExecutor =
    new FacilityCompensationExecutor();

  const compensationExecutor =
    new FacilitySettingCompensationExecutor(
      lifecycleCompensationExecutor,
    );

  const transactionManager =
    new MongoFacilityTransactionManagerAdapter({
      database:
        options.database,

      transactions:
        options.operationalInfrastructure
          .transactionRepository,

      idempotency:
        options.operationalInfrastructure
          .idempotency,

      locks:
        options.operationalInfrastructure
          .locks,

      outbox:
        options.operationalInfrastructure
          .outbox,

      compensationExecutor,
    });

  const recovery =
    new FacilityRecoveryService({
      database:
        options.database,

      idempotency:
        options.operationalInfrastructure
          .idempotency,

      outbox:
        options.operationalInfrastructure
          .outbox,

      compensationExecutor,
    });

  const runtimeAdapters =
    createFacilityRuntimeAdapters({
      database:
        options.database,

      auditRepository:
        options.auditRepository,
    });

  const application =
    createFacilityApplication({
      transactionManager,

      audit:
        runtimeAdapters.audit,

      outbox:
        runtimeAdapters.outbox,

      cache,

      crypto,

      cacheTtlSeconds:
        options.configuration
          .cacheDefaultTtlSeconds,
    });

  const sessions =
    new MongoFacilitySessionRevocationAdapter(
      options.database,
    );

  const mutationDependencies:
    FacilityMutationDependencies = {
    transactionManager,

    audit:
      runtimeAdapters.audit,

    outbox:
      runtimeAdapters.outbox,

    clock: {
      now:
        () =>
          new Date(),
    },
  };

  const activateFacility =
    new ActivateFacilityWorkflow(
      application.repositories
        .facilityRepository,

      mutationDependencies,
    );

  const deactivateFacility =
    new DeactivateFacilityWorkflow(
      application.repositories
        .facilityRepository,

      application.repositories
        .departmentRepository,

      sessions,

      mutationDependencies,
    );

  const activateDepartment =
    new ActivateDepartmentWorkflow(
      application.repositories
        .departmentRepository,

      application.repositories
        .facilityRepository,

      mutationDependencies,
    );

  const deactivateDepartment =
    new DeactivateDepartmentWorkflow(
      application.repositories
        .departmentRepository,

      application.repositories
        .facilityRepository,

      mutationDependencies,
    );

  const lifecycleService =
    new FacilityLifecycleService({
      facilityService:
        application.facilityService,

      departmentService:
        application.departmentService,

      activateFacility,

      deactivateFacility,

      activateDepartment,

      deactivateDepartment,
    });

  return {
    application,
    lifecycleService,

    workflows: {
      ...application.workflows,

      activateFacility,
      deactivateFacility,
      activateDepartment,
      deactivateDepartment,
    },

    cache,
    crypto,
    sessions,

    transactionManager,
    lifecycleCompensationExecutor,
    compensationExecutor,
    recovery,

    ...runtimeAdapters,
  };
}