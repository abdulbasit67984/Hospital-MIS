import {
  ConcurrencyConflictError,
  ConflictError,
  RequestValidationError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  PATIENT_ACCESS_LEVEL,
} from '../patient.constants.js';

import {
  patientAddressMutationAuditSnapshot,
  toPatientAddressMutationDto,
  type PatientAddressMutationDto,
} from '../patient.mutation.mapper.js';

import {
  patientAddressChangedFields,
  patientAddressLockKeys,
  patientAddressRestoreSnapshot,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

import {
  parseNullableDate,
} from '../patient.normalization.js';

import {
  buildPatientAuditActorFields,
  type PatientMutationDependencies,
  type PatientTransactionContext,
} from '../patient.ports.js';

import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_COMPENSATION_TYPES,
  PATIENT_OUTBOX_EVENTS,
  PATIENT_TRANSACTION_CHECKPOINTS,
  PATIENT_TRANSACTION_TYPES,
} from '../patient.transaction.constants.js';

import {
  throwMappedPatientPersistenceError,
} from '../patient.workflow-helpers.js';

import type {
  AddPatientAddressInput,
  DeactivatePatientAddressInput,
  UpdatePatientAddressInput,
} from '../patient-profile.mutation.types.js';

import type {
  PatientActorContext,
  PatientAddressRecord,
} from '../patient.types.js';

import type {
  PatientProfileRepository,
} from '../repositories/patient-profile.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

function addressNotFound():
  ResourceNotFoundError {
  return new ResourceNotFoundError(
    'Patient address was not found',
  );
}

function addressConcurrency():
  ConcurrencyConflictError {
  return new ConcurrencyConflictError(
    'The patient address changed before the operation could be completed',
  );
}

function assertMutableAddress(
  address: PatientAddressRecord,
): void {
  if (
    address.status !== 'ACTIVE'
  ) {
    throw new ConflictError(
      'Only active patient addresses can be changed',
    );
  }
}

function assertAddressValidity(
  current: PatientAddressRecord,
  update: UpdatePatientAddressInput,
): void {
  const validFrom =
    update.validFrom === undefined
      ? current.validFrom
      : parseNullableDate(
          update.validFrom,
          'body.validFrom',
        );

  const validTo =
    update.validTo === undefined
      ? current.validTo
      : parseNullableDate(
          update.validTo,
          'body.validTo',
        );

  if (
    validFrom !== null &&
    validTo !== null &&
    validTo.getTime() <=
      validFrom.getTime()
  ) {
    throw new RequestValidationError([
      {
        code:
          'invalid_address_validity',

        message:
          'Address validity end must be after validFrom',

        path:
          'body.validTo',
      },
    ]);
  }
}

export interface AddPatientAddressCommand {
  patientId: string;
  input: AddPatientAddressInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface UpdatePatientAddressCommand {
  addressId: string;
  input: UpdatePatientAddressInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface DeactivatePatientAddressCommand {
  addressId: string;
  input: DeactivatePatientAddressInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class AddPatientAddressWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly profiles:
      PatientProfileRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command:
      AddPatientAddressCommand,
  ): Promise<PatientAddressMutationDto> {
    const patient =
      await this.patients.findById(
        command.actor.facilityId,
        command.patientId,
        PATIENT_ACCESS_LEVEL.STANDARD,
      );

    if (patient === null) {
      throw new ResourceNotFoundError(
        'Patient was not found',
      );
    }

    if (
      patient.status === 'MERGED'
    ) {
      throw new ConflictError(
        'Addresses cannot be added to a merged patient',
      );
    }

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .ADD_PATIENT_ADDRESS,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientAddressLockKeys(
              command.patientId,
            ),

          idempotencyPayload: {
            patientId:
              command.patientId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'ADD_PATIENT_ADDRESS',

            patientId:
              command.patientId,

            addressType:
              command.input.addressType,

            countryCode:
              command.input.countryCode,

            isPrimary:
              command.input.isPrimary ??
              false,
          },

          execute:
            async (
              transaction,
            ) => {
              const currentPatient =
                await this.patients.findById(
                  command.actor.facilityId,
                  command.patientId,
                  PATIENT_ACCESS_LEVEL.STANDARD,
                );

              if (
                currentPatient === null
              ) {
                throw new ResourceNotFoundError(
                  'Patient was not found',
                );
              }

              if (
                currentPatient.status ===
                'MERGED'
              ) {
                throw new ConflictError(
                  'Addresses cannot be added to a merged patient',
                );
              }

              const created =
                await this.profiles
                  .createAddress({
                    ...command.input,

                    facilityId:
                      command.actor
                        .facilityId,

                    patientId:
                      command.patientId,

                    createdBy:
                      command.actor.userId,
                  });

              await transaction
                .registerCompensation({
                  key:
                    `delete-created-patient-address:${created._id.toHexString()}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_ADDRESS,

                  payload: {
                    entityId:
                      created._id.toHexString(),

                    expectedVersion:
                      created.version,

                    transactionId:
                      transaction.transactionId,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_ADDRESS_CREATED,
                {
                  patientId:
                    command.patientId,

                  addressId:
                    created._id.toHexString(),

                  addressType:
                    created.addressType,

                  isPrimary:
                    created.isPrimary,
                },
              );

              const now =
                this.dependencies
                  .clock.now();

              await this.dependencies
                .audit.append({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:audit:patient-address-added`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENT_ADDRESS_ADDED,

                  entityType:
                    'PatientAddress',

                  entityId:
                    created._id.toHexString(),

                  ...buildPatientAuditActorFields(
                    command.actor,
                  ),

                  occurredAt:
                    now,

                  ...(command.input.reason ===
                  undefined
                    ? {}
                    : {
                        reason:
                          command.input.reason,
                      }),

                  before:
                    null,

                  after:
                    patientAddressMutationAuditSnapshot(
                      created,
                    ),

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    patientId:
                      command.patientId,
                  },
                });

              await this.dependencies
                .outbox.enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:patient-address-added`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENT_ADDRESS_ADDED,

                  aggregateType:
                    'Patient',

                  aggregateId:
                    command.patientId,

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    command.actor.facilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    patientId:
                      command.patientId,

                    addressId:
                      created._id.toHexString(),

                    addressType:
                      created.addressType,

                    countryCode:
                      created.countryCode,

                    isPrimary:
                      created.isPrimary,

                    status:
                      created.status,

                    version:
                      created.version,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  addressId:
                    created._id.toHexString(),
                },
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  addressId:
                    created._id.toHexString(),
                },
              );

              return toPatientAddressMutationDto(
                created,
              );
            },
        });
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }
}

abstract class ExistingAddressWorkflow {
  protected constructor(
    protected readonly profiles:
      PatientProfileRepository,

    protected readonly dependencies:
      PatientMutationDependencies,
  ) {}

  protected async load(
    facilityId: string,
    addressId: string,
    expectedVersion: number,
  ): Promise<PatientAddressRecord> {
    const address =
      await this.profiles
        .findAddressById(
          facilityId,
          addressId,
          true,
        );

    if (address === null) {
      throw addressNotFound();
    }

    if (
      address.version !==
      expectedVersion
    ) {
      throw addressConcurrency();
    }

    assertMutableAddress(
      address,
    );

    return address;
  }

  protected async registerRestore(
    transaction:
      PatientTransactionContext,

    address:
      PatientAddressRecord,
  ): Promise<void> {
    const restorePayload =
      protectedRestorePayload({
        crypto:
          requirePatientSnapshotCrypto(
            this.dependencies,
          ),

        transactionId:
          transaction.transactionId,

        entityType:
          'patient-address',

        entityId:
          address._id.toHexString(),

        expectedPostVersion:
          address.version + 1,

        snapshot:
          patientAddressRestoreSnapshot(
            address,
          ),
      });

    await transaction
      .registerCompensation({
        key:
          `restore-patient-address:${address._id.toHexString()}:v${address.version}`,

        type:
          PATIENT_COMPENSATION_TYPES
            .RESTORE_PATIENT_ADDRESS,

        payload: {
          ...restorePayload,

          transactionId:
            transaction.transactionId,
        },
      });
  }
}

export class UpdatePatientAddressWorkflow
extends ExistingAddressWorkflow {
  public constructor(
    profiles:
      PatientProfileRepository,

    dependencies:
      PatientMutationDependencies,
  ) {
    super(
      profiles,
      dependencies,
    );
  }

  public async execute(
    command:
      UpdatePatientAddressCommand,
  ): Promise<PatientAddressMutationDto> {
    const initial =
      await this.load(
        command.actor.facilityId,
        command.addressId,
        command.input.expectedVersion,
      );

    assertAddressValidity(
      initial,
      command.input,
    );

    const changedFields =
      patientAddressChangedFields(
        command.input,
      );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .UPDATE_PATIENT_ADDRESS,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientAddressLockKeys(
              initial.patientId
                .toHexString(),
              command.addressId,
            ),

          idempotencyPayload: {
            addressId:
              command.addressId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'UPDATE_PATIENT_ADDRESS',

            addressId:
              command.addressId,

            patientId:
              initial.patientId
                .toHexString(),

            expectedVersion:
              command.input.expectedVersion,

            changedFields,
          },

          execute:
            async (
              transaction,
            ) => {
              const current =
                await this.load(
                  command.actor.facilityId,
                  command.addressId,
                  command.input
                    .expectedVersion,
                );

              assertAddressValidity(
                current,
                command.input,
              );

              await this.registerRestore(
                transaction,
                current,
              );

              const updated =
                await this.profiles
                  .updateAddressWithVersion({
                    facilityId:
                      command.actor
                        .facilityId,

                    addressId:
                      command.addressId,

                    update:
                      command.input,

                    actorUserId:
                      command.actor.userId,
                  });

              if (updated === null) {
                throw addressConcurrency();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_ADDRESS_UPDATED,
                {
                  addressId:
                    command.addressId,

                  patientId:
                    updated.patientId
                      .toHexString(),

                  version:
                    updated.version,

                  changedFields,
                },
              );

              const now =
                this.dependencies
                  .clock.now();

              await this.dependencies
                .audit.append({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:audit:patient-address-updated`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENT_ADDRESS_UPDATED,

                  entityType:
                    'PatientAddress',

                  entityId:
                    command.addressId,

                  ...buildPatientAuditActorFields(
                    command.actor,
                  ),

                  occurredAt:
                    now,

                  reason:
                    command.input.reason,

                  before:
                    patientAddressMutationAuditSnapshot(
                      current,
                    ),

                  after:
                    patientAddressMutationAuditSnapshot(
                      updated,
                    ),

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    patientId:
                      updated.patientId
                        .toHexString(),

                    changedFields,
                  },
                });

              await this.dependencies
                .outbox.enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:patient-address-updated`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENT_ADDRESS_UPDATED,

                  aggregateType:
                    'Patient',

                  aggregateId:
                    updated.patientId
                      .toHexString(),

                  actorUserId:
                    command.actor.userId,

                  facilityId:
                    command.actor.facilityId,

                  correlationId:
                    command.actor.correlationId,

                  occurredAt:
                    now,

                  payload: {
                    patientId:
                      updated.patientId
                        .toHexString(),

                    addressId:
                      command.addressId,

                    addressType:
                      updated.addressType,

                    countryCode:
                      updated.countryCode,

                    isPrimary:
                      updated.isPrimary,

                    status:
                      updated.status,

                    version:
                      updated.version,

                    changedFields,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  addressId:
                    command.addressId,
                },
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  addressId:
                    command.addressId,
                },
              );

              return toPatientAddressMutationDto(
                updated,
              );
            },
        });
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }
}

export class DeactivatePatientAddressWorkflow
extends ExistingAddressWorkflow {
  public constructor(
    profiles:
      PatientProfileRepository,

    dependencies:
      PatientMutationDependencies,
  ) {
    super(
      profiles,
      dependencies,
    );
  }

  public async execute(
    command:
      DeactivatePatientAddressCommand,
  ): Promise<PatientAddressMutationDto> {
    const initial =
      await this.load(
        command.actor.facilityId,
        command.addressId,
        command.input.expectedVersion,
      );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          PATIENT_TRANSACTION_TYPES
            .DEACTIVATE_PATIENT_ADDRESS,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          patientAddressLockKeys(
            initial.patientId
              .toHexString(),
            command.addressId,
          ),

        idempotencyPayload: {
          addressId:
            command.addressId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'DEACTIVATE_PATIENT_ADDRESS',

          addressId:
            command.addressId,

          patientId:
            initial.patientId
              .toHexString(),

          expectedVersion:
            command.input.expectedVersion,

          addressType:
            initial.addressType,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.load(
                command.actor.facilityId,
                command.addressId,
                command.input
                  .expectedVersion,
              );

            await this.registerRestore(
              transaction,
              current,
            );

            const updated =
              await this.profiles
                .deactivateAddressWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  addressId:
                    command.addressId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  actorUserId:
                    command.actor.userId,
                });

            if (updated === null) {
              throw addressConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .PATIENT_ADDRESS_DEACTIVATED,
              {
                addressId:
                  command.addressId,

                patientId:
                  updated.patientId
                    .toHexString(),

                version:
                  updated.version,
              },
            );

            const now =
              this.dependencies
                .clock.now();

            await this.dependencies
              .audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-address-deactivated`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_ADDRESS_DEACTIVATED,

                entityType:
                  'PatientAddress',

                entityId:
                  command.addressId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input.reason,

                before:
                  patientAddressMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientAddressMutationAuditSnapshot(
                    updated,
                  ),

                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,

                  patientId:
                    updated.patientId
                      .toHexString(),
                },
              });

            await this.dependencies
              .outbox.enqueue({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-address-deactivated`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_ADDRESS_DEACTIVATED,

                aggregateType:
                  'Patient',

                aggregateId:
                  updated.patientId
                    .toHexString(),

                actorUserId:
                  command.actor.userId,

                facilityId:
                  command.actor.facilityId,

                correlationId:
                  command.actor.correlationId,

                occurredAt:
                  now,

                payload: {
                  patientId:
                    updated.patientId
                      .toHexString(),

                  addressId:
                    command.addressId,

                  addressType:
                    updated.addressType,

                  status:
                    updated.status,

                  version:
                    updated.version,
                },
              });

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                addressId:
                  command.addressId,
              },
            );

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                addressId:
                  command.addressId,
              },
            );

            return toPatientAddressMutationDto(
              updated,
            );
          },
      });
  }
}