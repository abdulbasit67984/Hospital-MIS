import type {
  DepartmentDto,
  FacilityActorContext,
  FacilityDto,
} from './facility.types.js';

import type {
  DepartmentService,
} from './services/department.service.js';

import type {
  FacilityService,
} from './services/facility.service.js';

import type {
  ActivateDepartmentWorkflow,
} from './workflows/activate-department.workflow.js';

import type {
  ActivateFacilityWorkflow,
} from './workflows/activate-facility.workflow.js';

import type {
  DeactivateDepartmentWorkflow,
} from './workflows/deactivate-department.workflow.js';

import type {
  DeactivateFacilityWorkflow,
} from './workflows/deactivate-facility.workflow.js';

export interface FacilityLifecycleServiceOptions {
  facilityService:
    FacilityService;

  departmentService:
    DepartmentService;

  activateFacility:
    ActivateFacilityWorkflow;

  deactivateFacility:
    DeactivateFacilityWorkflow;

  activateDepartment:
    ActivateDepartmentWorkflow;

  deactivateDepartment:
    DeactivateDepartmentWorkflow;
}

export class FacilityLifecycleService {
  public constructor(
    private readonly options:
      FacilityLifecycleServiceOptions,
  ) {}

  public async activateFacility(
    input: Readonly<{
      facilityId: string;
      expectedVersion: number;
      reason: string;
      actor: FacilityActorContext;
      idempotencyKey: string;
    }>,
  ): Promise<FacilityDto> {
    const facility =
      await this.options
        .activateFacility
        .execute(input);

    await this.options
      .facilityService
      .invalidate({
        facilityId:
          facility.id,

        code:
          facility.code,
      });

    return facility;
  }

  public async deactivateFacility(
    input: Readonly<{
      facilityId: string;
      expectedVersion: number;
      reason: string;
      actor: FacilityActorContext;
      idempotencyKey: string;
    }>,
  ): Promise<FacilityDto> {
    const facility =
      await this.options
        .deactivateFacility
        .execute(input);

    await this.options
      .facilityService
      .invalidate({
        facilityId:
          facility.id,

        code:
          facility.code,
      });

    return facility;
  }

  public async activateDepartment(
    input: Readonly<{
      facilityId: string;
      departmentId: string;
      expectedVersion: number;
      reason: string;
      actor: FacilityActorContext;
      idempotencyKey: string;
    }>,
  ): Promise<DepartmentDto> {
    const department =
      await this.options
        .activateDepartment
        .execute(input);

    await this.options
      .departmentService
      .invalidate({
        departmentId:
          department.id,

        facilityId:
          department.facilityId,
      });

    return department;
  }

  public async deactivateDepartment(
    input: Readonly<{
      facilityId: string;
      departmentId: string;
      expectedVersion: number;
      reason: string;
      actor: FacilityActorContext;
      idempotencyKey: string;
    }>,
  ): Promise<DepartmentDto> {
    const department =
      await this.options
        .deactivateDepartment
        .execute(input);

    await this.options
      .departmentService
      .invalidate({
        departmentId:
          department.id,

        facilityId:
          department.facilityId,
      });

    return department;
  }
}