import {
  IdentityNotFoundError,
} from '../identity.errors.js';
import {
  toStaffDto,
} from '../identity.mapper.js';
import type {
  CreateStaffInput,
  IdentityActorContext,
  IdentityPageResult,
  StaffDto,
  StaffListQuery,
  UpdateStaffInput,
} from '../identity.types.js';
import type {
  StaffRepository,
} from '../repositories/staff.repository.js';
import type {
  CreateStaffResult,
  CreateStaffWorkflow,
} from '../workflows/create-staff.workflow.js';
import type {
  UpdateStaffWorkflow,
} from '../workflows/update-staff.workflow.js';

export interface StaffMutationContext {
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export class StaffService {
  public constructor(
    private readonly staffRepository: StaffRepository,
    private readonly createStaffWorkflow:
      CreateStaffWorkflow,
    private readonly updateStaffWorkflow:
      UpdateStaffWorkflow,
  ) {}

  public async getById(
    staffId: string,
  ): Promise<StaffDto> {
    const staff =
      await this.staffRepository.findById(staffId);

    if (!staff) {
      throw new IdentityNotFoundError(
        'Staff',
        staffId,
      );
    }

    return toStaffDto(staff);
  }

  public async list(
    query: StaffListQuery,
  ): Promise<IdentityPageResult<StaffDto>> {
    const page =
      await this.staffRepository.list(query);

    return {
      ...page,
      items: page.items.map(toStaffDto),
    };
  }

  public async create(
    input: CreateStaffInput,
    context: StaffMutationContext,
  ): Promise<CreateStaffResult> {
    return this.createStaffWorkflow.execute({
      input,
      actor: context.actor,
      idempotencyKey:
        context.idempotencyKey,
    });
  }

  public async update(
    staffId: string,
    input: UpdateStaffInput,
    context: StaffMutationContext,
  ): Promise<StaffDto> {
    return this.updateStaffWorkflow.execute({
      staffId,
      input,
      actor: context.actor,
      idempotencyKey:
        context.idempotencyKey,
    });
  }
}