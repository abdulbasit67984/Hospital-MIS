import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_COMPENSATION_TYPES,
  PATIENT_OUTBOX_EVENTS,
  PATIENT_TRANSACTION_CHECKPOINTS,
  PATIENT_TRANSACTION_TYPES,
} from '../patient.transaction.constants.js';

import {
  buildPatientAuditActorFields,
  type PatientMutationDependencies,
  type PatientTransactionContext,
} from '../patient.ports.js';

import {
  patientRegistrationAuditSnapshot,
  patientRegistrationOutboxPayload,
  toPatientRegistrationResult,
  type PatientRegistrationResult,
} from '../patient.mapper.js';

import {
  assertDuplicateAssessmentAllowsRegistration,
  assertPatientRegistrationInput,
  assertRelatedGuardianReferences,
  patientRegistrationLockKeys,
  safePatientRegistrationJournalPayload,
  throwMappedPatientPersistenceError,
  toPatientDuplicateCheckInput,
} from '../patient.workflow-helpers.js';

import type {
  GuardianRecord,
  PatientActorContext,
  PatientAddressRecord,
  PatientContactRecord,
  PatientGuardianRecord,
  PatientIdentifierRecord,
  RegisterPatientInput,
} from '../patient.types.js';

import type {
  GuardianRepository,
} from '../repositories/guardian.repository.js';

import type {
  PatientIdentifierRepository,
} from '../repositories/patient-identifier.repository.js';

import type {
  PatientProfileRepository,
} from '../repositories/patient-profile.repository.js';

import type {
  PatientRepository,
} from '../repositories/patient.repository.js';

import type {
  MedicalRecordNumberService,
} from '../services/medical-record-number.service.js';

import type {
  PatientDuplicateMatcherService,
} from '../services/patient-duplicate-matcher.service.js';

export interface RegisterPatientCommand {
  input: RegisterPatientInput;
  actor: PatientActorContext;
  idempotencyKey: string;
}

export class RegisterPatientWorkflow {
  public constructor(
    private readonly patients:
      PatientRepository,

    private readonly identifiers:
      PatientIdentifierRepository,

    private readonly guardians:
      GuardianRepository,

    private readonly profiles:
      PatientProfileRepository,

    private readonly duplicateMatcher:
      PatientDuplicateMatcherService,

    private readonly medicalRecordNumbers:
      MedicalRecordNumberService,

    private readonly dependencies:
      PatientMutationDependencies,
  ) {}

  public async execute(
    command: RegisterPatientCommand,
  ): Promise<PatientRegistrationResult> {
    const now =
      this.dependencies.clock.now();

    assertPatientRegistrationInput(
      command.input,
      now,
    );

    const duplicateInput =
      toPatientDuplicateCheckInput(
        command.actor.facilityId,
        command.input,
      );

    const initialAssessment =
      await this.duplicateMatcher.assess(
        duplicateInput,
      );

    assertDuplicateAssessmentAllowsRegistration(
      initialAssessment,
    );

    try {
      return await this.dependencies
        .transactionManager
        .execute({
          transactionType:
            PATIENT_TRANSACTION_TYPES
              .REGISTER_PATIENT,

          idempotencyKey:
            command.idempotencyKey,

          actorUserId:
            command.actor.userId,

          facilityId:
            command.actor.facilityId,

          correlationId:
            command.actor.correlationId,

          lockKeys:
            patientRegistrationLockKeys(
              command.actor.facilityId,
              command.input,
            ),

          idempotencyPayload: {
            input:
              command.input,
            facilityId:
              command.actor.facilityId,
          },

          journalPayload:
            safePatientRegistrationJournalPayload(
              command.input,
            ),

          execute:
            async (
              transaction,
            ) => {
              const assessment =
                await this.duplicateMatcher.assess(
                  duplicateInput,
                );

              assertDuplicateAssessmentAllowsRegistration(
                assessment,
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .DUPLICATE_CHECK_COMPLETED,
                {
                  highestLevel:
                    assessment.highestLevel,
                  candidateCount:
                    assessment.candidates.length,
                },
              );

              let patient =
                await this.patients.create({
                  ...command.input,
                  facilityId:
                    command.actor.facilityId,
                  createdBy:
                    command.actor.userId,
                  registeredAt:
                    now,
                });

              await this.registerDeleteCompensation(
                transaction,
                PATIENT_COMPENSATION_TYPES
                  .DELETE_CREATED_PATIENT,
                'patient',
                patient._id.toHexString(),
                patient.version,
              );

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .PATIENT_CREATED,
                {
                  patientId:
                    patient._id.toHexString(),
                  version:
                    patient.version,
                },
              );

              if (
                assessment.candidates.length > 0
              ) {
                const reviewed =
                  await this.patients.setDuplicateReview({
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    expectedVersion:
                      patient.version,
                    required:
                      true,
                    actorUserId:
                      command.actor.userId,
                  });

                if (reviewed === null) {
                  throw new Error(
                    'Patient duplicate review state could not be applied',
                  );
                }

                patient = reviewed;

                await this.registerDeleteCompensation(
                  transaction,
                  PATIENT_COMPENSATION_TYPES
                    .DELETE_CREATED_PATIENT,
                  'patient',
                  patient._id.toHexString(),
                  patient.version,
                );

                await transaction.checkpoint(
                  PATIENT_TRANSACTION_CHECKPOINTS
                    .DUPLICATE_REVIEW_STATE_APPLIED,
                  {
                    patientId:
                      patient._id.toHexString(),
                    version:
                      patient.version,
                    candidateCount:
                      assessment.candidates.length,
                  },
                );
              }

              const mrnAllocation =
                await this.medicalRecordNumbers.allocate({
                  facilityId:
                    command.actor.facilityId,
                });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .MRN_ALLOCATED,
                {
                  patientId:
                    patient._id.toHexString(),
                  year:
                    mrnAllocation.year,
                  sequenceValue:
                    mrnAllocation.sequenceValue,
                },
              );

              const primaryMrn =
                await this.identifiers
                  .createMedicalRecordNumber({
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    mrn:
                      mrnAllocation.mrn,
                    createdBy:
                      command.actor.userId,
                  });

              await this.registerDeleteCompensation(
                transaction,
                PATIENT_COMPENSATION_TYPES
                  .DELETE_CREATED_PATIENT_IDENTIFIER,
                'patient-identifier',
                primaryMrn._id.toHexString(),
                primaryMrn.version,
              );

              const createdIdentifiers:
                PatientIdentifierRecord[] = [];

              for (
                const identifier of
                command.input.identifiers ?? []
              ) {
                const created =
                  await this.identifiers.createIdentity({
                    ...identifier,
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    createdBy:
                      command.actor.userId,
                  });

                createdIdentifiers.push(
                  created,
                );

                await this.registerDeleteCompensation(
                  transaction,
                  PATIENT_COMPENSATION_TYPES
                    .DELETE_CREATED_PATIENT_IDENTIFIER,
                  'patient-identifier',
                  created._id.toHexString(),
                  created.version,
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .IDENTIFIERS_CREATED,
                {
                  patientId:
                    patient._id.toHexString(),
                  identifierCount:
                    createdIdentifiers.length + 1,
                  identifierTypes: [
                    'MRN',
                    ...createdIdentifiers.map(
                      (identifier) =>
                        identifier.identifierType,
                    ),
                  ],
                },
              );

              let guardian:
                GuardianRecord | null = null;
              let guardianCreated = false;
              let relationship:
                PatientGuardianRecord | null = null;

              if (
                command.input.guardian !== undefined &&
                command.input.guardianRelationship !== undefined
              ) {
                guardian =
                  await this.guardians.findByCnic(
                    command.actor.facilityId,
                    command.input.guardian.cnic,
                  );

                if (guardian === null) {
                  guardian =
                    await this.guardians.create({
                      ...command.input.guardian,
                      facilityId:
                        command.actor.facilityId,
                      createdBy:
                        command.actor.userId,
                    });

                  guardianCreated = true;

                  await this.registerDeleteCompensation(
                    transaction,
                    PATIENT_COMPENSATION_TYPES
                      .DELETE_CREATED_GUARDIAN,
                    'guardian',
                    guardian._id.toHexString(),
                    guardian.version,
                  );
                }

                await transaction.checkpoint(
                  PATIENT_TRANSACTION_CHECKPOINTS
                    .GUARDIAN_RESOLVED,
                  {
                    patientId:
                      patient._id.toHexString(),
                    guardianId:
                      guardian._id.toHexString(),
                    guardianCreated,
                  },
                );

                relationship =
                  await this.guardians.linkToPatient({
                    ...command.input.guardianRelationship,
                    guardianId:
                      guardian._id.toHexString(),
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    createdBy:
                      command.actor.userId,
                  });

                await this.registerDeleteCompensation(
                  transaction,
                  PATIENT_COMPENSATION_TYPES
                    .DELETE_CREATED_PATIENT_GUARDIAN,
                  'patient-guardian',
                  relationship._id.toHexString(),
                  relationship.version,
                );

                await transaction.checkpoint(
                  PATIENT_TRANSACTION_CHECKPOINTS
                    .GUARDIAN_LINKED,
                  {
                    patientId:
                      patient._id.toHexString(),
                    guardianId:
                      guardian._id.toHexString(),
                    relationshipId:
                      relationship._id.toHexString(),
                    isPrimary:
                      relationship.isPrimary,
                  },
                );
              }

              assertRelatedGuardianReferences(
                command.input,
                guardian?._id.toHexString() ?? null,
              );

              const createdContacts:
                PatientContactRecord[] = [];

              for (
                const contact of
                command.input.contacts ?? []
              ) {
                const created =
                  await this.profiles.createContact({
                    ...contact,
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    createdBy:
                      command.actor.userId,
                  });

                createdContacts.push(
                  created,
                );

                await this.registerDeleteCompensation(
                  transaction,
                  PATIENT_COMPENSATION_TYPES
                    .DELETE_CREATED_PATIENT_CONTACT,
                  'patient-contact',
                  created._id.toHexString(),
                  created.version,
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .CONTACTS_CREATED,
                {
                  patientId:
                    patient._id.toHexString(),
                  contactCount:
                    createdContacts.length,
                  contactTypes:
                    createdContacts.map(
                      (contact) =>
                        contact.contactType,
                    ),
                },
              );

              const createdAddresses:
                PatientAddressRecord[] = [];

              for (
                const address of
                command.input.addresses ?? []
              ) {
                const created =
                  await this.profiles.createAddress({
                    ...address,
                    facilityId:
                      command.actor.facilityId,
                    patientId:
                      patient._id.toHexString(),
                    createdBy:
                      command.actor.userId,
                  });

                createdAddresses.push(
                  created,
                );

                await this.registerDeleteCompensation(
                  transaction,
                  PATIENT_COMPENSATION_TYPES
                    .DELETE_CREATED_PATIENT_ADDRESS,
                  'patient-address',
                  created._id.toHexString(),
                  created.version,
                );
              }

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .ADDRESSES_CREATED,
                {
                  patientId:
                    patient._id.toHexString(),
                  addressCount:
                    createdAddresses.length,
                  addressTypes:
                    createdAddresses.map(
                      (address) =>
                        address.addressType,
                    ),
                },
              );

              const occurredAt =
                this.dependencies.clock.now();

              const outboxPayload =
                patientRegistrationOutboxPayload({
                  patient,
                  primaryMrn,
                  identifiers:
                    createdIdentifiers,
                  guardian,
                  relationship,
                  duplicateAssessment:
                    assessment,
                });

              await this.dependencies.outbox.enqueue({
                transactionId:
                  transaction.transactionId,
                deduplicationKey:
                  `${transaction.transactionId}:outbox:patient-registered`,
                eventType:
                  PATIENT_OUTBOX_EVENTS
                    .PATIENT_REGISTERED,
                aggregateType:
                  'Patient',
                aggregateId:
                  patient._id.toHexString(),
                actorUserId:
                  command.actor.userId,
                facilityId:
                  command.actor.facilityId,
                correlationId:
                  command.actor.correlationId,
                occurredAt,
                payload:
                  outboxPayload,
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .OUTBOX_ENQUEUED,
                {
                  patientId:
                    patient._id.toHexString(),
                },
              );

              const auditSnapshot =
                patientRegistrationAuditSnapshot({
                  patient,
                  primaryMrn,
                  identifiers:
                    createdIdentifiers,
                  guardian,
                  relationship,
                  guardianCreated,
                  duplicateAssessment:
                    assessment,
                });

              await this.dependencies.audit.append({
                transactionId:
                  transaction.transactionId,
                deduplicationKey:
                  `${transaction.transactionId}:audit:patient-registered`,
                action:
                  PATIENT_AUDIT_ACTIONS
                    .PATIENT_REGISTERED,
                entityType:
                  'Patient',
                entityId:
                  patient._id.toHexString(),
                ...buildPatientAuditActorFields(
                  command.actor,
                ),
                occurredAt,
                before:
                  null,
                after:
                  auditSnapshot,
                metadata: {
                  idempotencyKey:
                    command.idempotencyKey,
                  identifierCount:
                    createdIdentifiers.length + 1,
                  contactCount:
                    createdContacts.length,
                  addressCount:
                    createdAddresses.length,
                },
              });

              await transaction.checkpoint(
                PATIENT_TRANSACTION_CHECKPOINTS
                  .AUDIT_APPENDED,
                {
                  patientId:
                    patient._id.toHexString(),
                },
              );

              return toPatientRegistrationResult({
                patient,
                primaryMrn,
                identifiers:
                  createdIdentifiers,
                guardian,
                relationship,
                guardianCreated,
                duplicateAssessment:
                  assessment,
              });
            },
        });
    } catch (error) {
      throwMappedPatientPersistenceError(
        error,
      );
    }
  }

  private async registerDeleteCompensation(
    transaction: PatientTransactionContext,
    type: string,
    entityType: string,
    entityId: string,
    expectedVersion: number,
  ): Promise<void> {
    await transaction.registerCompensation({
      key:
        `delete-created-${entityType}:${entityId}:v${expectedVersion}`,
      type,
      payload: {
        entityId,
        expectedVersion,
        transactionId:
          transaction.transactionId,
      },
    });
  }
}