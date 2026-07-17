import type {
  ConfigurationCachePort,
} from '../../../infrastructure/configuration-cache.port.js';

import {
  CONFIGURATION_CACHE_KEYS,
} from '../facility.constants.js';

import {
  DepartmentNotFoundError,
} from '../facility.errors.js';

import {
  toDepartmentDto,
} from '../facility.mapper.js';

import type {
  CreateDepartmentInput,
  DepartmentDto,
  DepartmentListQuery,
  FacilityActorContext,
  PageResult,
  UpdateDepartmentInput,
} from '../facility.types.js';

import type {
  DepartmentRepository,
} from '../repositories/department.repository.js';

import type {
  CreateDepartmentWorkflow,
} from '../workflows/create-department.workflow.js';

import type {
  UpdateDepartmentWorkflow,
} from '../workflows/update-department.workflow.js';

export interface DepartmentServiceOptions {
  cacheTtlSeconds: number;
}

export interface DepartmentMutationWorkflows {
  create:
    CreateDepartmentWorkflow;

  update:
    UpdateDepartmentWorkflow;
}

export class DepartmentService {
  public constructor(
    private readonly repository:
      DepartmentRepository,

    private readonly cache:
      ConfigurationCachePort,

    private readonly options:
      DepartmentServiceOptions,

    private readonly mutations:
      DepartmentMutationWorkflows,
  ) {
    if (
      !Number.isSafeInteger(
        options.cacheTtlSeconds,
      ) ||
      options.cacheTtlSeconds <= 0
    ) {
      throw new TypeError(
        'Department cache TTL must be a positive safe integer',
      );
    }
  }

  public async create(
    input: CreateDepartmentInput,
    actor: FacilityActorContext,
    idempotencyKey: string,
  ): Promise<DepartmentDto> {
    const department =
      await this.mutations.create.execute({
        input,
        actor,
        idempotencyKey,
      });

    await this.invalidate({
      departmentId:
        department.id,

      facilityId:
        department.facilityId,
    });

    return department;
  }

  public async update(
    facilityId: string,
    departmentId: string,
    input: UpdateDepartmentInput,
    actor: FacilityActorContext,
    idempotencyKey: string,
  ): Promise<DepartmentDto> {
    const department =
      await this.mutations.update.execute({
        facilityId,
        departmentId,
        input,
        actor,
        idempotencyKey,
      });

    await this.invalidate({
      departmentId:
        department.id,

      facilityId:
        department.facilityId,
    });

    return department;
  }

  public async getById(
    departmentId: string,
  ): Promise<DepartmentDto> {
    const cacheKey =
      CONFIGURATION_CACHE_KEYS.department(
        departmentId,
      );

    const cached =
      await this.cache.get<DepartmentDto>(
        cacheKey,
      );

    if (cached !== null) {
      return cached;
    }

    const record =
      await this.repository.findById(
        departmentId,
      );

    if (record === null) {
      throw new DepartmentNotFoundError();
    }

    const department =
      toDepartmentDto(
        record,
      );

    await this.cache.set(
      cacheKey,
      department,
      this.options.cacheTtlSeconds,
    );

    return department;
  }

  public async getByIdInFacility(
    departmentId: string,
    facilityId: string,
  ): Promise<DepartmentDto> {
    const department =
      await this.getById(
        departmentId,
      );

    if (
      department.facilityId !==
      facilityId
    ) {
      throw new DepartmentNotFoundError();
    }

    return department;
  }

  public async list(
    query: DepartmentListQuery,
  ): Promise<
    PageResult<DepartmentDto>
  > {
    const page =
      await this.repository.list(
        query,
      );

    return {
      ...page,

      items:
        page.items.map(
          toDepartmentDto,
        ),
    };
  }

  public async invalidate(
    input: Readonly<{
      departmentId: string;
      facilityId: string;
    }>,
  ): Promise<void> {
    await this.cache.deleteMany([
      CONFIGURATION_CACHE_KEYS.department(
        input.departmentId,
      ),

      CONFIGURATION_CACHE_KEYS.facilityDepartments(
        input.facilityId,
      ),
    ]);
  }
}