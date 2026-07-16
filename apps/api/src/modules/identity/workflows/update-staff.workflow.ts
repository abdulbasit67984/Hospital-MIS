import {
  IDENTITY_AUDIT_ACTIONS,
  IDENTITY_OUTBOX_EVENTS,
} from '../identity.constants.js';
import {
  IdentityConflictError,
  IdentityNotFoundError,
  IdentityVersionConflictError,
} from '../identity.errors.js';
import {
  normalizeCnic,
  normalizeEmail,
  normalizeOptionalText,
  nullableObjectIdToString,
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
  IdentityActorContext,
  StaffDto,
  UpdateStaffInput,
} from '../identity.types.js';
import type {
  StaffRepository,
} from '../repositories/staff.repository.js';

export interface UpdateStaffCommand {
  staffId: string;
  input: UpdateStaffInput;
  actor: IdentityActorContext;
  idempotencyKey: string;
}

export class UpdateStaffWorkflow {
  public constructor(
    private readonly staffRepository: StaffRepository,
    private readonly dependencies:
      IdentityMutationDependencies,
  ) {}

  public async execute(
    command: UpdateStaffCommand,
  ): Promise<StaffDto> {
    const input = this.normalizeInput(
      command.input,
    );

    const lockKeys = [
      `identity:staff:${command.staffId}`,
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
              .UPDATE_STAFF,
          idempotencyKey: command.idempotencyKey,
          actorUserId: command.actor.userId,
          facilityId:
            command.actor.facilityId ?? null,
          lockKeys,
          payload: {
            staffId: command.staffId,
            input,
          },
          execute: async (transaction) => {
            const current =
              await this.staffRepository.findById(
                command.staffId,
              );

            if (!current) {
              throw new IdentityNotFoundError(
                'Staff',
                command.staffId,
              );
            }

            if (
              current.version !==
              input.expectedVersion
            ) {
              throw new IdentityVersionConflictError(
                'Staff',
                command.staffId,
                input.expectedVersion,
              );
            }

            if (
              input.cnic &&
              input.cnic !==
                (current.cnic ?? null)
            ) {
              const existing =
                await this.staffRepository.findByCnic(
                  input.cnic,
                );

              if (
                existing &&
                !existing._id.equals(current._id)
              ) {
                throw new IdentityConflictError(
                  'The CNIC is already assigned to another staff member',
                  'IDENTITY_STAFF_CNIC_ALREADY_EXISTS',
                  {
                    cnic: input.cnic,
                    existingStaffId:
                      existing._id.toHexString(),
                  },
                );
              }
            }

            await transaction.registerCompensation({
              key: `restore-staff:${command.staffId}`,
              type:
                IDENTITY_COMPENSATION_TYPES
                  .RESTORE_STAFF,
              payload: {
                staffId: command.staffId,
                expectedPostVersion:
                  current.version + 1,
                previous: {
                  departmentId:
                    nullableObjectIdToString(
                      current.departmentId,
                    ),
                  firstName:
                    current.firstName,
                  middleName:
                    current.middleName ?? null,
                  lastName:
                    current.lastName,
                  displayName:
                    current.displayName,
                  cnic: current.cnic ?? null,
                  phone:
                    current.phone ?? null,
                  email:
                    current.email ?? null,
                  designation:
                    current.designation ?? null,
                  professionalType:
                    current.professionalType ??
                    null,
                  professionalRegistrationNumber:
                    current
                      .professionalRegistrationNumber ??
                    null,
                  joiningDate:
                    current.joiningDate?.toISOString() ??
                    null,
                  employmentStatus:
                    current.employmentStatus,
                  isClinical:
                    current.isClinical,
                  isActive:
                    current.isActive,
                  version: current.version,
                  updatedBy:
                    nullableObjectIdToString(
                      current.updatedBy,
                    ),
                  updatedAt:
                    current.updatedAt.toISOString(),
                },
                transactionId:
                  transaction.transactionId,
              },
            });

            const updated =
              await this.staffRepository.updateWithVersion(
                command.staffId,
                input,
                command.actor.userId,
              );

            if (!updated) {
              throw new IdentityVersionConflictError(
                'Staff',
                command.staffId,
                input.expectedVersion,
              );
            }

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .STAFF_UPDATED,
              {
                staffId: command.staffId,
                version: updated.version,
              },
            );

            const now =
              this.dependencies.clock.now();
            const beforeDto =
              toStaffDto(current);
            const afterDto =
              toStaffDto(updated);

            const statusChanged =
              current.employmentStatus !==
                updated.employmentStatus ||
              current.isActive !==
                updated.isActive;

            const changedFields =
              this.getChangedFields(
                beforeDto,
                afterDto,
              );

            await this.dependencies.audit.append({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:audit:staff-updated`,
              action: statusChanged
                ? IDENTITY_AUDIT_ACTIONS
                    .STAFF_STATUS_CHANGED
                : IDENTITY_AUDIT_ACTIONS
                    .STAFF_UPDATED,
              entityType: 'Staff',
              entityId: command.staffId,
              ...buildAuditActorFields(
                command.actor,
              ),
              facilityId:
                updated.facilityId.toHexString(),
              occurredAt: now,
              before: beforeDto,
              after: afterDto,
              metadata: {
                idempotencyKey:
                  command.idempotencyKey,
                changedFields,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                staffId: command.staffId,
              },
            );

            await this.dependencies.outbox.enqueue({
              transactionId:
                transaction.transactionId,
              deduplicationKey:
                `${transaction.transactionId}:outbox:staff-updated`,
              eventType:
                statusChanged
                  ? IDENTITY_OUTBOX_EVENTS
                      .STAFF_STATUS_CHANGED
                  : IDENTITY_OUTBOX_EVENTS
                      .STAFF_UPDATED,
              aggregateType: 'Staff',
              aggregateId:
                command.staffId,
              actorUserId:
                command.actor.userId,
              facilityId:
                updated.facilityId.toHexString(),
              correlationId:
                command.actor.correlationId,
              occurredAt: now,
              payload: {
                before: beforeDto,
                after: afterDto,
                changedFields,
              },
            });

            await transaction.checkpoint(
              IDENTITY_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                staffId: command.staffId,
              },
            );

            return afterDto;
          },
        },
      );
    } catch (error) {
      throwMappedIdentityPersistenceError(error, {
        entityName: 'Staff',
        fallbackMessage:
          'The updated staff information conflicts with another staff record',
        fallbackCode:
          'IDENTITY_STAFF_UPDATE_CONFLICT',
      });
    }
  }

  private normalizeInput(
    input: UpdateStaffInput,
  ): UpdateStaffInput {
    return {
      ...input,
      firstName:
        input.firstName?.trim(),
      middleName:
        input.middleName !== undefined
          ? normalizeOptionalText(
              input.middleName,
            )
          : undefined,
      lastName:
        input.lastName?.trim(),
      cnic:
        input.cnic !== undefined
          ? normalizeCnic(input.cnic)
          : undefined,
      phone:
        input.phone !== undefined
          ? normalizeOptionalText(
              input.phone,
            )
          : undefined,
      email:
        input.email !== undefined
          ? normalizeEmail(input.email)
          : undefined,
      designation:
        input.designation !== undefined
          ? normalizeOptionalText(
              input.designation,
            )
          : undefined,
      professionalType:
        input.professionalType !== undefined
          ? normalizeOptionalText(
              input.professionalType,
            )
          : undefined,
      professionalRegistrationNumber:
        input.professionalRegistrationNumber !==
        undefined
          ? normalizeOptionalText(
              input.professionalRegistrationNumber,
            )
          : undefined,
    };
  }

  private getChangedFields(
    before: StaffDto,
    after: StaffDto,
  ): string[] {
    const mutableFields: Array<keyof StaffDto> = [
      'departmentId',
      'firstName',
      'middleName',
      'lastName',
      'displayName',
      'cnic',
      'phone',
      'email',
      'designation',
      'professionalType',
      'professionalRegistrationNumber',
      'joiningDate',
      'employmentStatus',
      'isClinical',
      'isActive',
      'version',
    ];

    return mutableFields.filter(
      (field) => before[field] !== after[field],
    );
  }
}