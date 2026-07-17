import type {
  ConfigurationCachePort,
} from '../../../infrastructure/configuration-cache.port.js';

import {
  CONFIGURATION_CACHE_KEYS,
  FACILITY_STATUS,
} from '../facility.constants.js';

import {
  FacilityAuthenticationDisabledError,
  FacilityNotFoundError,
  InactiveFacilityError,
} from '../facility.errors.js';

import {
  normalizeFacilityCode,
  toFacilityDto,
} from '../facility.mapper.js';

import type {
  CreateFacilityInput,
  FacilityActorContext,
  FacilityDto,
  FacilityListQuery,
  PageResult,
  UpdateFacilityInput,
} from '../facility.types.js';

import type {
  FacilityRepository,
} from '../repositories/facility.repository.js';

import type {
  CreateFacilityWorkflow,
} from '../workflows/create-facility.workflow.js';

import type {
  UpdateFacilityWorkflow,
} from '../workflows/update-facility.workflow.js';

export interface FacilityServiceOptions {
  cacheTtlSeconds: number;
}

export interface FacilityMutationWorkflows {
  create:
    CreateFacilityWorkflow;

  update:
    UpdateFacilityWorkflow;
}

export class FacilityService {
  public constructor(
    private readonly repository:
      FacilityRepository,

    private readonly cache:
      ConfigurationCachePort,

    private readonly options:
      FacilityServiceOptions,

    private readonly mutations:
      FacilityMutationWorkflows,
  ) {
    if (
      !Number.isSafeInteger(
        options.cacheTtlSeconds,
      ) ||
      options.cacheTtlSeconds <= 0
    ) {
      throw new TypeError(
        'Facility cache TTL must be a positive safe integer',
      );
    }
  }

  public async create(
    input: CreateFacilityInput,
    actor: FacilityActorContext,
    idempotencyKey: string,
  ): Promise<FacilityDto> {
    const facility =
      await this.mutations.create.execute({
        input,
        actor,
        idempotencyKey,
      });

    await this.invalidate({
      facilityId:
        facility.id,

      code:
        facility.code,
    });

    return facility;
  }

  public async update(
    facilityId: string,
    input: UpdateFacilityInput,
    actor: FacilityActorContext,
    idempotencyKey: string,
  ): Promise<FacilityDto> {
    const facility =
      await this.mutations.update.execute({
        facilityId,
        input,
        actor,
        idempotencyKey,
      });

    await this.invalidate({
      facilityId:
        facility.id,

      code:
        facility.code,
    });

    return facility;
  }

  public async getById(
    facilityId: string,
  ): Promise<FacilityDto> {
    const cacheKey =
      CONFIGURATION_CACHE_KEYS.facility(
        facilityId,
      );

    const cached =
      await this.cache.get<FacilityDto>(
        cacheKey,
      );

    if (cached !== null) {
      return cached;
    }

    const record =
      await this.repository.findById(
        facilityId,
      );

    if (record === null) {
      throw new FacilityNotFoundError();
    }

    const facility =
      toFacilityDto(
        record,
      );

    await this.cache.set(
      cacheKey,
      facility,
      this.options.cacheTtlSeconds,
    );

    await this.cache.set(
      CONFIGURATION_CACHE_KEYS.facilityByCode(
        facility.code,
      ),
      facility,
      this.options.cacheTtlSeconds,
    );

    return facility;
  }

  public async getByCode(
    code: string,
  ): Promise<FacilityDto> {
    const normalizedCode =
      normalizeFacilityCode(
        code,
      );

    const cacheKey =
      CONFIGURATION_CACHE_KEYS.facilityByCode(
        normalizedCode,
      );

    const cached =
      await this.cache.get<FacilityDto>(
        cacheKey,
      );

    if (cached !== null) {
      return cached;
    }

    const record =
      await this.repository.findByCode(
        normalizedCode,
      );

    if (record === null) {
      throw new FacilityNotFoundError();
    }

    const facility =
      toFacilityDto(
        record,
      );

    await this.cache.set(
      cacheKey,
      facility,
      this.options.cacheTtlSeconds,
    );

    await this.cache.set(
      CONFIGURATION_CACHE_KEYS.facility(
        facility.id,
      ),
      facility,
      this.options.cacheTtlSeconds,
    );

    return facility;
  }

  public async list(
    query: FacilityListQuery,
  ): Promise<
    PageResult<FacilityDto>
  > {
    const page =
      await this.repository.list(
        query,
      );

    return {
      ...page,

      items:
        page.items.map(
          toFacilityDto,
        ),
    };
  }

  public async assertActive(
    facilityId: string,
  ): Promise<FacilityDto> {
    const facility =
      await this.getById(
        facilityId,
      );

    if (
      facility.status !==
      FACILITY_STATUS.ACTIVE
    ) {
      throw new InactiveFacilityError();
    }

    return facility;
  }

  public async assertAuthenticationAllowed(
    facilityId: string,
  ): Promise<FacilityDto> {
    const facility =
      await this.assertActive(
        facilityId,
      );

    if (
      !facility.allowsAuthentication
    ) {
      throw new FacilityAuthenticationDisabledError();
    }

    return facility;
  }

  public async invalidate(
    input: Readonly<{
      facilityId: string;
      code?: string;
    }>,
  ): Promise<void> {
    const keys = [
      CONFIGURATION_CACHE_KEYS.facility(
        input.facilityId,
      ),

      CONFIGURATION_CACHE_KEYS.facilityDepartments(
        input.facilityId,
      ),
    ];

    if (input.code !== undefined) {
      keys.push(
        CONFIGURATION_CACHE_KEYS.facilityByCode(
          normalizeFacilityCode(
            input.code,
          ),
        ),
      );
    }

    await this.cache.deleteMany(
      keys,
    );
  }
}