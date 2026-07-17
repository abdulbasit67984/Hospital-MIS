import type {
  ConfigurationCachePort,
} from '../../infrastructure/configuration-cache.port.js';

import type {
  FacilityAuditPort,
  FacilityClockPort,
  FacilityOutboxPort,
  FacilitySensitiveSettingCryptoPort,
  FacilityTransactionManagerPort,
} from './facility.ports.js';

import {
  DepartmentRepository,
} from './repositories/department.repository.js';

import {
  FacilityRepository,
} from './repositories/facility.repository.js';

import {
  SettingDefinitionRepository,
} from './repositories/setting-definition.repository.js';

import {
  SystemSettingRepository,
} from './repositories/system-setting.repository.js';

import {
  SystemSettingVersionRepository,
} from './repositories/system-setting-version.repository.js';

import {
  DepartmentService,
} from './services/department.service.js';

import {
  FacilityService,
} from './services/facility.service.js';

import {
  SettingDefinitionMutationService,
} from './services/setting-definition-mutation.service.js';

import {
  SettingDefinitionService,
} from './services/setting-definition.service.js';

import {
  SystemSettingService,
} from './services/system-setting.service.js';

import {
  CreateDepartmentWorkflow,
} from './workflows/create-department.workflow.js';

import {
  CreateFacilityWorkflow,
} from './workflows/create-facility.workflow.js';

import {
  CreateSettingDefinitionWorkflow,
} from './workflows/create-setting-definition.workflow.js';

import {
  UpdateDepartmentWorkflow,
} from './workflows/update-department.workflow.js';

import {
  UpdateFacilityWorkflow,
} from './workflows/update-facility.workflow.js';

import {
  UpdateSettingDefinitionWorkflow,
} from './workflows/update-setting-definition.workflow.js';

import {
  UpsertSystemSettingWorkflow,
} from './workflows/upsert-system-setting.workflow.js';

export interface CreateFacilityApplicationOptions {
  transactionManager:
    FacilityTransactionManagerPort;

  audit:
    FacilityAuditPort;

  outbox:
    FacilityOutboxPort;

  cache:
    ConfigurationCachePort;

  crypto:
    FacilitySensitiveSettingCryptoPort;

  cacheTtlSeconds:
    number;

  clock?:
    FacilityClockPort;
}

export interface FacilityApplication {
  facilityService:
    FacilityService;

  departmentService:
    DepartmentService;

  settingDefinitionService:
    SettingDefinitionService;

  settingDefinitionMutationService:
    SettingDefinitionMutationService;

  systemSettingService:
    SystemSettingService;

  repositories: {
    facilityRepository:
      FacilityRepository;

    departmentRepository:
      DepartmentRepository;

    settingDefinitionRepository:
      SettingDefinitionRepository;

    systemSettingRepository:
      SystemSettingRepository;

    systemSettingVersionRepository:
      SystemSettingVersionRepository;
  };

  workflows: {
    createFacility:
      CreateFacilityWorkflow;

    updateFacility:
      UpdateFacilityWorkflow;

    createDepartment:
      CreateDepartmentWorkflow;

    updateDepartment:
      UpdateDepartmentWorkflow;

    createSettingDefinition:
      CreateSettingDefinitionWorkflow;

    updateSettingDefinition:
      UpdateSettingDefinitionWorkflow;

    upsertSystemSetting:
      UpsertSystemSettingWorkflow;
  };
}

const systemClock:
  FacilityClockPort = {
  now(): Date {
    return new Date();
  },
};

export function createFacilityApplication(
  options:
    CreateFacilityApplicationOptions,
): FacilityApplication {
  const clock =
    options.clock ??
    systemClock;

  const facilityRepository =
    new FacilityRepository();

  const departmentRepository =
    new DepartmentRepository();

  const settingDefinitionRepository =
    new SettingDefinitionRepository();

  const systemSettingRepository =
    new SystemSettingRepository();

  const systemSettingVersionRepository =
    new SystemSettingVersionRepository();

  const mutationDependencies = {
    transactionManager:
      options.transactionManager,

    audit:
      options.audit,

    outbox:
      options.outbox,

    clock,
  };

  const createFacility =
    new CreateFacilityWorkflow(
      facilityRepository,
      mutationDependencies,
    );

  const updateFacility =
    new UpdateFacilityWorkflow(
      facilityRepository,
      mutationDependencies,
    );

  const createDepartment =
    new CreateDepartmentWorkflow(
      departmentRepository,
      facilityRepository,
      mutationDependencies,
    );

  const updateDepartment =
    new UpdateDepartmentWorkflow(
      departmentRepository,
      facilityRepository,
      mutationDependencies,
    );

  const createSettingDefinition =
    new CreateSettingDefinitionWorkflow(
      settingDefinitionRepository,
      mutationDependencies,
    );

  const updateSettingDefinition =
    new UpdateSettingDefinitionWorkflow(
      settingDefinitionRepository,
      systemSettingRepository,
      mutationDependencies,
    );

  const upsertSystemSetting =
    new UpsertSystemSettingWorkflow(
      settingDefinitionRepository,
      systemSettingRepository,
      systemSettingVersionRepository,
      facilityRepository,
      options.crypto,
      mutationDependencies,
    );

  const facilityService =
    new FacilityService(
      facilityRepository,
      options.cache,
      {
        cacheTtlSeconds:
          options.cacheTtlSeconds,
      },
      {
        create:
          createFacility,

        update:
          updateFacility,
      },
    );

  const departmentService =
    new DepartmentService(
      departmentRepository,
      options.cache,
      {
        cacheTtlSeconds:
          options.cacheTtlSeconds,
      },
      {
        create:
          createDepartment,

        update:
          updateDepartment,
      },
    );

  const settingDefinitionService =
    new SettingDefinitionService(
      settingDefinitionRepository,
      options.cache,
      {
        defaultCacheTtlSeconds:
          options.cacheTtlSeconds,
      },
    );

  const settingDefinitionMutationService =
    new SettingDefinitionMutationService({
      queryService:
        settingDefinitionService,

      createWorkflow:
        createSettingDefinition,

      updateWorkflow:
        updateSettingDefinition,

      cache:
        options.cache,
    });

  const systemSettingService =
    new SystemSettingService({
      settingRepository:
        systemSettingRepository,

      versionRepository:
        systemSettingVersionRepository,

      definitionRepository:
        settingDefinitionRepository,

      definitionService:
        settingDefinitionService,

      facilityService,

      upsertWorkflow:
        upsertSystemSetting,

      cache:
        options.cache,

      crypto:
        options.crypto,

      defaultCacheTtlSeconds:
        options.cacheTtlSeconds,
    });

  return {
    facilityService,
    departmentService,
    settingDefinitionService,
    settingDefinitionMutationService,
    systemSettingService,

    repositories: {
      facilityRepository,
      departmentRepository,
      settingDefinitionRepository,
      systemSettingRepository,
      systemSettingVersionRepository,
    },

    workflows: {
      createFacility,
      updateFacility,
      createDepartment,
      updateDepartment,
      createSettingDefinition,
      updateSettingDefinition,
      upsertSystemSetting,
    },
  };
}