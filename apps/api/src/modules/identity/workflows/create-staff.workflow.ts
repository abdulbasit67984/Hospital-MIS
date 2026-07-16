import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityConflictError,
} from '../identity.errors.js';
import {
  buildStaffDisplayName,
  normalizeCnic,
  normalizeEmail,
  normalizeEmployeeNumber,
  normalizeOptionalText,
  parseOptionalDate,
  toNullableObjectId,
  toObjectId,
  toStaffDto,
} from '../identity.mapper.js';
import {
  throwMappedIdentityPersistenceError,
} from '../identity.persistence-errors.js';
import type {
  IdentityMutationDependencies,
} from '../identity.ports.js';
import {
  buildAuditActorFields,
} from '../identity.ports.js';
import {
  IDENTITY_ADDITIONAL_TRANSACTION_TYPES,
  IDENTITY_COMPENSATION_TYPES,
  IDENTITY_TRANSACTION_CHECKPOINTS,
} from '../identity.transaction.constants.js';
import type {
  CreateStaffInput,
  IdentityActorContext,
  StaffDto,
} from '../identity.types.js';
import type {
  StaffRepository,
} from '../repositories/staff.repository.js';

export interface CreateStaffCommand {
  input: CreateStaffInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export interface CreateStaffResult {
  staff: StaffDto;
}

export class CreateStaffWorkflow {
  public constructor(
    private readonly staffRepository: StaffRepository,
    private readonly dependencies:
      IdentityMutationDependencies,
  ) {}

  public async execute(
    command: CreateStaffCommand,
  ): Promise<CreateStaffResult> {
    const input = this.normalizeInput(command.input);

    await this.assertEmployeeNumberIsAvailable(input);
    await this.assertCnicIsAvailable(input.cnic);

    const lockKeys = [
      `identity:staff-employee-number:${input.facilityId}:${input.employeeNumber}`,
    ];

    if (input.cnic) {
      lockKeys.push(
        `identity:staff-cnic:${input.cnic}`,
      );
    }

    try {
      return await this.dependencies.transactionManager.execute(
        {
          transactionType:
            IDENTITY_ADDITIONAL_TRANSACTION_TYPES
              .CREATE_STAFF,
          idempotencyKey: command.idempotencyKey,
          actorUserId: command.actor.userId,
          facilityId: input.facilityId,
          lockKeys,
          payload: {
            staff: {
              facilityId: input.facilityId,
              departmentId:
                input.departmentId ?? null,
              employeeNumber:
                input.employeeNumber,
              firstName: input.firstName,
              middleName:
                input.middleName ?? null,
              lastName: input.lastName,
              cnic: input.cnic ?? null,
              phone: input.phone ?? null,
              email: input.email ?? null,
              designation:
                input.designation ?? null,
              professionalType:
                input.professionalType ?? null,
              professionalRegistrationNumber:
                input.professionalRegistrationNumber ??
                null,
              joiningDate:
                input.joiningDate ?? null,
              employmentStatus:
                input.employmentStatus,
              isClinical: input.isClinical,
            },
          },
          execute: async (transaction) => {
            await this.assertEmployeeNumberIsAvailable(
              input,
            );

            await this.assertCnicIsAvailable(
              input.cnic,
            );

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .VALIDATED,
              {
                facilityId: input.facilityId,
                employeeNumber:
                  input.employeeNumber,
              },
            );

            const staff =
              await this.staffRepository.create({
                facilityId: toObjectId(
                  input.facilityId,
                  'facilityId',
                ),
                departmentId: toNullableObjectId(
                  input.departmentId,
                  'departmentId',
                ),
                employeeNumber:
                  input.employeeNumber,
                firstName: input.firstName,
                middleName:
                  input.middleName ?? null,
                lastName: input.lastName,
                displayName:
                  buildStaffDisplayName({
                    firstName: input.firstName,
                    middleName:
                      input.middleName,
                    lastName: input.lastName,
                  }),
                cnic: input.cnic ?? null,
                phone: input.phone ?? null,
                email: input.email ?? null,
                designation:
                  input.designation ?? null,
                professionalType:
                  input.professionalType ?? null,
                professionalRegistrationNumber:
                  input.professionalRegistrationNumber ??
                  null,
                joiningDate: parseOptionalDate(
                  input.joiningDate,
                ),
                employmentStatus:
                  input.employmentStatus!,
                isClinical:
                  input.isClinical ?? false,
                createdBy: toObjectId(
                  command.actor.userId,
                  'actor.userId',
                ),
              });

            const staffId =
              staff._id.toHexString();

            await transaction.registerCompensation({
              key: `delete-created-staff:${staffId}`,
              type:
                IDENTITY_COMPENSATION_TYPES
                  .DELETE_CREATED_STAFF,
              payload: {
                staffId,
                expectedVersion:
                  staff.version,
                transactionId:
                  transaction.transactionId,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .STAFF_CREATED,
              {
                staffId,
                version: staff.version,
              },
            );

            const now =
              this.dependencies.clock.now();
            const staffDto = toStaffDto(staff);

            await this.dependencies.audit.append({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:audit:staff-created`,
              action:
                IDENTITY_AUDIT_ACTIONS
                  .STAFF_CREATED,
              entityType: 'Staff',
              entityId: staffId,
              ...buildAuditActorFields(
                command.actor,
              ),
              facilityId: input.facilityId,
              occurredAt: now,
              before: null,
              after: staffDto,
              metadata: {
                idempotencyKey:
                  command.idempotencyKey,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                staffId,
              },
            );

            await this.dependencies.outbox.enqueue({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:outbox:staff-created`,
              eventType:
                IDENTITY_OUTBOX_EVENTS
                  .STAFF_CREATED,
              aggregateType: 'Staff',
              aggregateId: staffId,
              actorUserId:
                command.actor.userId,
              facilityId: input.facilityId,
              correlationId:
                command.actor.correlationId,
              occurredAt: now,
              payload: {
                staff: staffDto,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                staffId,
              },
            );

            return {
              staff: staffDto,
            };
          },
        },
      );
    } catch (error) {
      throwMappedIdentityPersistenceError(error, {
        entityName: 'Staff',
        fallbackMessage:
          'A staff record with the same employee number, CNIC, email, or registration number already exists',
        fallbackCode:
          'IDENTITY_STAFF_ALREADY_EXISTS',
      });
    }
  }

  private normalizeInput(
    input: CreateStaffInput,
  ): CreateStaffInput {
    return {
      ...input,
      employeeNumber:
        normalizeEmployeeNumber(
          input.employeeNumber,
        ),
      firstName: input.firstName.trim(),
      middleName:
        normalizeOptionalText(
          input.middleName,
        ),
      lastName: input.lastName.trim(),
      cnic: normalizeCnic(input.cnic),
      phone: normalizeOptionalText(
        input.phone,
      ),
      email: normalizeEmail(input.email),
      designation:
        normalizeOptionalText(
          input.designation,
        ),
      professionalType:
        normalizeOptionalText(
          input.professionalType,
        ),
      professionalRegistrationNumber:
        normalizeOptionalText(
          input.professionalRegistrationNumber,
        ),
      joiningDate:
        input.joiningDate ?? null,
      isClinical:
        input.isClinical ?? false,
    };
  }

  private async assertEmployeeNumberIsAvailable(
    input: Pick<
      CreateStaffInput,
      'facilityId' | 'employeeNumber'
    >,
  ): Promise<void> {
    const existing =
      await this.staffRepository.findByEmployeeNumber(
        {
          facilityId: input.facilityId,
          employeeNumber:
            input.employeeNumber,
        },
      );

    if (existing) {
      throw new IdentityConflictError(
        'The employee number is already assigned in this facility',
        'IDENTITY_EMPLOYEE_NUMBER_ALREADY_EXISTS',
        {
          facilityId: input.facilityId,
          employeeNumber:
            input.employeeNumber,
          existingStaffId:
            existing._id.toHexString(),
        },
      );
    }
  }

  private async assertCnicIsAvailable(
    cnic: string | null | undefined,
  ): Promise<void> {
    if (!cnic) {
      return;
    }

    const existing =
      await this.staffRepository.findByCnic(cnic);

    if (existing) {
      throw new IdentityConflictError(
        'The CNIC is already assigned to another staff member',
        'IDENTITY_STAFF_CNIC_ALREADY_EXISTS',
        {
          cnic,
          existingStaffId:
            existing._id.toHexString(),
        },
      );
    }
  }
}