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
  patientContactMutationAuditSnapshot,
  toPatientContactMutationDto,
  type PatientContactMutationDto,
} from '../patient.mutation.mapper.js';

import {
  patientContactChangedFields,
  patientContactLockKeys,
  patientContactRestoreSnapshot,
  protectedRestorePayload,
  requirePatientSnapshotCrypto,
} from '../patient.mutation.workflow-helpers.js';

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
  AddPatientContactInput,
  DeactivatePatientContactInput,
  UpdatePatientContactInput,
  VerifyPatientContactInput,
} from '../patient-profile.mutation.types.js';

import type {
  PatientActorContext,
  PatientContactRecord,
} from '../patient.types.js';

import type {
  PatientGuardianMutationRepository,
} from '../repositories/patient-guardian-mutation.repository.js';

import type {
  PatientProfileRepository,
} from '../repositories/patient-profile.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

function contactNotFound():
  ResourceNotFoundError {
  return new ResourceNotFoundError(
    'Patient contact was not found',
  );
}

function contactConcurrency():
  ConcurrencyConflictError {
  return new ConcurrencyConflictError(
    'The patient contact changed before the operation could be completed',
  );
}

async function assertRelatedGuardian(
  repository: PatientGuardianMutationRepository,
  facilityId: string,
  patientId: string,
  guardianId: string | null | undefined,
): Promise<void> {
  if (
    guardianId === undefined ||
    guardianId === null
  ) {
    return;
  }

  if (
    !await repository
      .hasActivePatientGuardian(
        facilityId,
        patientId,
        guardianId,
      )
  ) {
    throw new RequestValidationError([
      {
        code:
          'invalid_related_guardian',

        message:
          'The contact guardian must have an active relationship with the patient',

        path:
          'body.relatedGuardianId',
      },
    ]);
  }
}

function assertMutableContact(
  contact: PatientContactRecord,
): void {
  if (
    contact.status !== 'ACTIVE'
  ) {
    throw new ConflictError(
      'Only active patient contacts can be changed',
    );
  }
}

function assertContactUpdateConsistency(
  current: PatientContactRecord,
  update: UpdatePatientContactInput,
): void {
  if (
    update.contactType !== undefined &&
    update.value === undefined
  ) {
    throw new RequestValidationError([
      {
        code:
          'contact_value_required',

        message:
          'Changing contact type requires a replacement contact value',

        path:
          'body.value',
      },
    ]);
  }

  const emergency =
    update.isEmergencyContact ??
    current.isEmergencyContact;

  const contactName =
    update.contactName === undefined
      ? current.contactName
      : update.contactName;

  const guardianId =
    update.relatedGuardianId === undefined
      ? current.relatedGuardianId
          ?.toHexString() ??
        null
      : update.relatedGuardianId;

  if (
    emergency &&
    (
      contactName === null ||
      contactName.trim().length === 0
    ) &&
    guardianId === null
  ) {
    throw new RequestValidationError([
      {
        code:
          'emergency_contact_identity_required',

        message:
          'Emergency contacts require a contact name or linked guardian',

        path:
          'body.contactName',
      },
    ]);
  }
}

export interface AddPatientContactCommand {
  patientId: string;
  input: AddPatientContactInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface UpdatePatientContactCommand {
  contactId: string;
  input: UpdatePatientContactInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface VerifyPatientContactCommand {
  contactId: string;
  input: VerifyPatientContactInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export interface DeactivatePatientContactCommand {
  contactId: string;
  input: DeactivatePatientContactInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class AddPatientContactWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly profiles:
      PatientProfileRepository,

    private readonly patientGuardians:
      PatientGuardianMutationRepository,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: AddPatientContactCommand,
  ): Promise<PatientContactMutationDto> {
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
        'Contacts cannot be added to a merged patient',
      );
    }

    await assertRelatedGuardian(
      this.patientGuardians,
      command.actor.facilityId,
      command.patientId,
      command.input.relatedGuardianId,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .ADD_PATIENT_CONTACT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientContactLockKeys({
              patientId:
                command.patientId,

              contactType:
                command.input.contactType,

              value:
                command.input.value,
            }),

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
              'ADD_PATIENT_CONTACT',

            patientId:
              command.patientId,

            contactType:
              command.input.contactType,

            purpose:
              command.input.purpose,

            isPrimary:
              command.input.isPrimary ??
              false,

            isEmergencyContact:
              command.input
                .isEmergencyContact ??
              false,

            hasRelatedGuardian:
              command.input
                .relatedGuardianId != null,
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
                  'Contacts cannot be added to a merged patient',
                );
              }

              await assertRelatedGuardian(
                this.patientGuardians,
                command.actor.facilityId,
                command.patientId,
                command.input
                  .relatedGuardianId,
              );

              const created =
                await this.profiles
                  .createContact({
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
                    `delete-created-patient-contact:${created._id.toHexString()}`,

                  type:
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_PATIENT_CONTACT,

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
                  .PATIENT_CONTACT_CREATED,
                {
                  patientId:
                    command.patientId,

                  contactId:
                    created._id.toHexString(),

                  contactType:
                    created.contactType,

                  purpose:
                    created.purpose,
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
                    `${transaction.transactionId}:audit:patient-contact-added`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENT_CONTACT_ADDED,

                  entityType:
                    'PatientContact',

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
                    patientContactMutationAuditSnapshot(
                      created,
                    ),

                  metadata: {
                    idempotencyKey:
                      command.idempotencyKey,

                    patientId:
                      command.patientId,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  contactId:
                    created._id.toHexString(),
                },
              );

              await this.dependencies
                .outbox.enqueue({
                  transactionId:
                    transaction.transactionId,

                  deduplicationKey:
                    `${transaction.transactionId}:outbox:patient-contact-added`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENT_CONTACT_ADDED,

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

                    contactId:
                      created._id.toHexString(),

                    contactType:
                      created.contactType,

                    purpose:
                      created.purpose,

                    isPrimary:
                      created.isPrimary,

                    isEmergencyContact:
                      created.isEmergencyContact,

                    status:
                      created.status,

                    version:
                      created.version,
                  },
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  contactId:
                    created._id.toHexString(),
                },
              );

              return toPatientContactMutationDto(
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

abstract class ExistingContactWorkflow {
  protected constructor(
    protected readonly profiles:
      PatientProfileRepository,

    protected readonly patientGuardians:
      PatientGuardianMutationRepository,

    protected readonly dependencies:
      PatientMutationDependencies,
  ) {}

  protected async load(
    facilityId: string,
    contactId: string,
    expectedVersion: number,
  ): Promise<PatientContactRecord> {
    const contact =
      await this.profiles
        .findContactById(
          facilityId,
          contactId,
          true,
        );

    if (contact === null) {
      throw contactNotFound();
    }

    if (
      contact.version !==
      expectedVersion
    ) {
      throw contactConcurrency();
    }

    assertMutableContact(
      contact,
    );

    return contact;
  }

  protected async registerRestore(
    transaction:
      PatientTransactionContext,

    contact:
      PatientContactRecord,
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
          'patient-contact',

        entityId:
          contact._id.toHexString(),

        expectedPostVersion:
          contact.version + 1,

        snapshot:
          patientContactRestoreSnapshot(
            contact,
          ),
      });

    await transaction
      .registerCompensation({
        key:
          `restore-patient-contact:${contact._id.toHexString()}:v${contact.version}`,

        type:
          PATIENT_COMPENSATION_TYPES
            .RESTORE_PATIENT_CONTACT,

        payload: {
          ...restorePayload,

          transactionId:
            transaction.transactionId,
        },
      });
  }
}

export class UpdatePatientContactWorkflow
extends ExistingContactWorkflow {
  public constructor(
    profiles:
      PatientProfileRepository,

    patientGuardians:
      PatientGuardianMutationRepository,

    dependencies:
      PatientMutationDependencies,
  ) {
    super(
      profiles,
      patientGuardians,
      dependencies,
    );
  }

  public async execute(
    command:
      UpdatePatientContactCommand,
  ): Promise<PatientContactMutationDto> {
    const initial =
      await this.load(
        command.actor.facilityId,
        command.contactId,
        command.input.expectedVersion,
      );

    assertContactUpdateConsistency(
      initial,
      command.input,
    );

    await assertRelatedGuardian(
      this.patientGuardians,
      command.actor.facilityId,
      initial.patientId.toHexString(),
      command.input.relatedGuardianId,
    );

    const changedFields =
      patientContactChangedFields(
        command.input,
      );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .UPDATE_PATIENT_CONTACT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientContactLockKeys({
              patientId:
                initial.patientId
                  .toHexString(),

              contactId:
                command.contactId,

              contactType:
                command.input
                  .contactType ??
                initial.contactType,

              ...(command.input.value ===
              undefined
                ? {}
                : {
                    value:
                      command.input.value,
                  }),
            }),

          idempotencyPayload: {
            contactId:
              command.contactId,

            input:
              command.input,

            facilityId:
              command.actor.facilityId,
          },

          journalPayload: {
            operation:
              'UPDATE_PATIENT_CONTACT',

            contactId:
              command.contactId,

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
                  command.contactId,
                  command.input
                    .expectedVersion,
                );

              assertContactUpdateConsistency(
                current,
                command.input,
              );

              await assertRelatedGuardian(
                this.patientGuardians,
                command.actor.facilityId,
                current.patientId
                  .toHexString(),
                command.input
                  .relatedGuardianId,
              );

              await this.registerRestore(
                transaction,
                current,
              );

              const updated =
                await this.profiles
                  .updateContactWithVersion({
                    facilityId:
                      command.actor
                        .facilityId,

                    contactId:
                      command.contactId,

                    update:
                      command.input,

                    actorUserId:
                      command.actor.userId,
                  });

              if (updated === null) {
                throw contactConcurrency();
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_CONTACT_UPDATED,
                {
                  contactId:
                    command.contactId,

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
                    `${transaction.transactionId}:audit:patient-contact-updated`,

                  action:
                    PATIENT_AUDIT_ACTIONS
                      .PATIENT_CONTACT_UPDATED,

                  entityType:
                    'PatientContact',

                  entityId:
                    command.contactId,

                  ...buildPatientAuditActorFields(
                    command.actor,
                  ),

                  occurredAt:
                    now,

                  reason:
                    command.input.reason,

                  before:
                    patientContactMutationAuditSnapshot(
                      current,
                    ),

                  after:
                    patientContactMutationAuditSnapshot(
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
                    `${transaction.transactionId}:outbox:patient-contact-updated`,

                  eventType:
                    PATIENT_OUTBOX_EVENTS
                      .PATIENT_CONTACT_UPDATED,

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

                    contactId:
                      command.contactId,

                    contactType:
                      updated.contactType,

                    purpose:
                      updated.purpose,

                    isPrimary:
                      updated.isPrimary,

                    isEmergencyContact:
                      updated.isEmergencyContact,

                    consentToContact:
                      updated.consentToContact,

                    isVerified:
                      updated.isVerified,

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
                  contactId:
                    command.contactId,
                },
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  contactId:
                    command.contactId,
                },
              );

              return toPatientContactMutationDto(
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

export class VerifyPatientContactWorkflow
extends ExistingContactWorkflow {
  public constructor(
    profiles:
      PatientProfileRepository,

    patientGuardians:
      PatientGuardianMutationRepository,

    dependencies:
      PatientMutationDependencies,
  ) {
    super(
      profiles,
      patientGuardians,
      dependencies,
    );
  }

  public async execute(
    command:
      VerifyPatientContactCommand,
  ): Promise<PatientContactMutationDto> {
    const initial =
      await this.load(
        command.actor.facilityId,
        command.contactId,
        command.input.expectedVersion,
      );

    if (initial.isVerified) {
      throw new ConflictError(
        'The patient contact is already verified',
      );
    }

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          PATIENT_TRANSACTION_TYPES
            .VERIFY_PATIENT_CONTACT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          patientContactLockKeys({
            patientId:
              initial.patientId
                .toHexString(),

            contactId:
              command.contactId,
          }),

        idempotencyPayload: {
          contactId:
            command.contactId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'VERIFY_PATIENT_CONTACT',

          contactId:
            command.contactId,

          patientId:
            initial.patientId
              .toHexString(),

          expectedVersion:
            command.input.expectedVersion,

          contactType:
            initial.contactType,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.load(
                command.actor.facilityId,
                command.contactId,
                command.input
                  .expectedVersion,
              );

            if (current.isVerified) {
              throw new ConflictError(
                'The patient contact is already verified',
              );
            }

            await this.registerRestore(
              transaction,
              current,
            );

            const now =
              this.dependencies
                .clock.now();

            const updated =
              await this.profiles
                .verifyContactWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  contactId:
                    command.contactId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  verifiedBy:
                    command.actor.userId,

                  verifiedAt:
                    now,
                });

            if (updated === null) {
              throw contactConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .PATIENT_CONTACT_VERIFIED,
              {
                contactId:
                  command.contactId,

                patientId:
                  updated.patientId
                    .toHexString(),

                version:
                  updated.version,
              },
            );

            await this.dependencies
              .audit.append({
                transactionId:
                  transaction.transactionId,

                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-contact-verified`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_CONTACT_VERIFIED,

                entityType:
                  'PatientContact',

                entityId:
                  command.contactId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input.reason,

                before:
                  patientContactMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientContactMutationAuditSnapshot(
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
                  `${transaction.transactionId}:outbox:patient-contact-verified`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_CONTACT_VERIFIED,

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

                  contactId:
                    command.contactId,

                  contactType:
                    updated.contactType,

                  isVerified:
                    updated.isVerified,

                  version:
                    updated.version,
                },
              });

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .AUDIT_APPENDED,
              {
                contactId:
                  command.contactId,
              },
            );

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                contactId:
                  command.contactId,
              },
            );

            return toPatientContactMutationDto(
              updated,
            );
          },
      });
  }
}

export class DeactivatePatientContactWorkflow
extends ExistingContactWorkflow {
  public constructor(
    profiles:
      PatientProfileRepository,

    patientGuardians:
      PatientGuardianMutationRepository,

    dependencies:
      PatientMutationDependencies,
  ) {
    super(
      profiles,
      patientGuardians,
      dependencies,
    );
  }

  public async execute(
    command:
      DeactivatePatientContactCommand,
  ): Promise<PatientContactMutationDto> {
    const initial =
      await this.load(
        command.actor.facilityId,
        command.contactId,
        command.input.expectedVersion,
      );

    return this.dependencies
      .transactionManager
      .execute({
        transactionType:
          PATIENT_TRANSACTION_TYPES
            .DEACTIVATE_PATIENT_CONTACT,

        idempotencyKey:
          command.idempotencyKey,

        actorUserId:
          command.actor.userId,

        facilityId:
          command.actor.facilityId,

        correlationId:
          command.actor.correlationId,

        lockKeys:
          patientContactLockKeys({
            patientId:
              initial.patientId
                .toHexString(),

            contactId:
              command.contactId,
          }),

        idempotencyPayload: {
          contactId:
            command.contactId,

          input:
            command.input,

          facilityId:
            command.actor.facilityId,
        },

        journalPayload: {
          operation:
            'DEACTIVATE_PATIENT_CONTACT',

          contactId:
            command.contactId,

          patientId:
            initial.patientId
              .toHexString(),

          expectedVersion:
            command.input.expectedVersion,

          contactType:
            initial.contactType,
        },

        execute:
          async (
            transaction,
          ) => {
            const current =
              await this.load(
                command.actor.facilityId,
                command.contactId,
                command.input
                  .expectedVersion,
              );

            await this.registerRestore(
              transaction,
              current,
            );

            const updated =
              await this.profiles
                .deactivateContactWithVersion({
                  facilityId:
                    command.actor.facilityId,

                  contactId:
                    command.contactId,

                  expectedVersion:
                    command.input
                      .expectedVersion,

                  actorUserId:
                    command.actor.userId,
                });

            if (updated === null) {
              throw contactConcurrency();
            }

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .PATIENT_CONTACT_DEACTIVATED,
              {
                contactId:
                  command.contactId,

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
                  `${transaction.transactionId}:audit:patient-contact-deactivated`,

                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_CONTACT_DEACTIVATED,

                entityType:
                  'PatientContact',

                entityId:
                  command.contactId,

                ...buildPatientAuditActorFields(
                  command.actor,
                ),

                occurredAt:
                  now,

                reason:
                  command.input.reason,

                before:
                  patientContactMutationAuditSnapshot(
                    current,
                  ),

                after:
                  patientContactMutationAuditSnapshot(
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
                  `${transaction.transactionId}:outbox:patient-contact-deactivated`,

                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_CONTACT_DEACTIVATED,

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

                  contactId:
                    command.contactId,

                  contactType:
                    updated.contactType,

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
                contactId:
                  command.contactId,
              },
            );

            await transaction.checkpoint(
              PATIENT_TRANSACTION_CHECKPOINTS
                .OUTBOX_ENQUEUED,
              {
                contactId:
                  command.contactId,
              },
            );

            return toPatientContactMutationDto(
              updated,
            );
          },
      });
  }
}