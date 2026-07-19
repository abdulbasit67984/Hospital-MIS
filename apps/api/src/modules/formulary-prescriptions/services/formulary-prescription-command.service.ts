import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import type {
  PrescriptionStatus,
  PrescriptionWarningSeverity,
} from '@hospital-mis/database';

import {
  BLOCKING_PRESCRIPTION_WARNING_SEVERITIES,
  DEFAULT_PRESCRIPTION_EXPIRY_DAYS,
  DEFAULT_PRESCRIPTION_NUMBER_WIDTH,
  PRESCRIPTION_NUMBER_SEQUENCE_NAMESPACE,
} from '../formulary-prescriptions.constants.js';

import {
  FormularyDoseUnitMismatchError,
  FormularyItemNotEffectiveError,
  FormularyItemNotFoundError,
  FormularyOnlyPrescribingError,
  FormularyPrescriptionMinimumNecessaryAccessError,
  FormularyQuantityUnitMismatchError,
  FormularyRouteNotAllowedError,
  InactiveFormularyItemError,
  InactiveMedicineError,
  InactiveMedicineFormError,
  InactiveMedicineRouteError,
  InactiveMedicineStrengthError,
  InactivePrescriptionFrequencyError,
  InactiveUnitOfMeasureError,
  MedicineFormNotFoundError,
  MedicineNotFoundError,
  MedicineRouteNotFoundError,
  MedicineStrengthNotFoundError,
  PrescriptionConcurrencyError,
  PrescriptionFrequencyNotFoundError,
  PrescriptionNoActiveItemsError,
  PrescriptionNotFoundError,
  UnitOfMeasureNotFoundError,
} from '../formulary-prescriptions.errors.js';

import {
  formularyPrescriptionDeduplicationKey,
  newFormularyPrescriptionObjectIdString,
  safePrescriptionAuditSnapshot,
  safePrescriptionEventPayload,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  prescriptionSnapshotAssociatedData,
} from '../formulary-prescriptions.normalization.js';

import type {
  FormularyPrescriptionAccessAction,
} from './formulary-prescription-access-policy.service.js';

import {
  FormularyPrescriptionAccessPolicyService,
} from './formulary-prescription-access-policy.service.js';

import {
  FormularyPrescriptionContextService,
} from './formulary-prescription-context.service.js';

import type {
  FormularyPrescriptionAuditEntry,
  FormularyPrescriptionAuditPort,
  FormularyPrescriptionCanonicalPatientPort,
  FormularyPrescriptionClockPort,
  FormularyPrescriptionOutboxPort,
  FormularyPrescriptionRealtimePort,
  FormularyPrescriptionSequencePort,
  FormularyPrescriptionSnapshotCryptoPort,
  FormularyPrescriptionTransactionContext,
  FormularyPrescriptionTransactionManagerPort,
} from '../formulary-prescriptions.ports.js';

import type {
  FormularyItemRecord,
  PrescriptionItemRecord,
  PrescriptionRecord,
  PrescriptionSafetyWarningRecord,
} from '../formulary-prescriptions.persistence.types.js';

import type {
  FormularyPrescriptionActorContext,
  PrescriptionClinicalContext,
  PrescriptionItemInput,
} from '../formulary-prescriptions.types.js';

import {
  FORMULARY_PRESCRIPTION_TRANSACTION_STATES,
} from '../formulary-prescriptions.transaction.constants.js';

import {
  MedicineFormularyRepository,
} from '../repositories/medicine-formulary.repository.js';

import {
  PrescriptionRepository,
} from '../repositories/prescription.repository.js';

export interface FormularyPrescriptionMutationDependencies {
  transactionManager:
    FormularyPrescriptionTransactionManagerPort;

  audit:
    FormularyPrescriptionAuditPort;

  outbox:
    FormularyPrescriptionOutboxPort;

  realtime:
    FormularyPrescriptionRealtimePort;

  clock:
    FormularyPrescriptionClockPort;

  sequence:
    FormularyPrescriptionSequencePort;

  canonicalPatient:
    FormularyPrescriptionCanonicalPatientPort;

  snapshotCrypto:
    FormularyPrescriptionSnapshotCryptoPort;
}

export interface ResolvedPrescriptionItem {
  formularyItem:
    FormularyItemRecord;

  item:
    Omit<
      PrescriptionItemRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >;
}

function isBlockingSeverity(
  severity: PrescriptionWarningSeverity,
): boolean {
  return (
    BLOCKING_PRESCRIPTION_WARNING_SEVERITIES as
      readonly PrescriptionWarningSeverity[]
  ).includes(
    severity,
  );
}

function publicationActorFields(
  actor: FormularyPrescriptionActorContext,
): Pick<
  FormularyPrescriptionAuditEntry,
  | 'actorUserId'
  | 'facilityId'
  | 'correlationId'
  | 'ipAddress'
  | 'userAgent'
> {
  return {
    actorUserId:
      actor.userId,

    facilityId:
      actor.facilityId,

    correlationId:
      actor.correlationId,

    ...(actor.ipAddress === undefined
      ? {}
      : {
          ipAddress:
            actor.ipAddress,
        }),

    ...(actor.userAgent === undefined
      ? {}
      : {
          userAgent:
            actor.userAgent,
        }),
  };
}

export class FormularyPrescriptionCommandService {
  public constructor(
    public readonly catalog:
      MedicineFormularyRepository,

    public readonly prescriptions:
      PrescriptionRepository,

    public readonly context:
      FormularyPrescriptionContextService,

    public readonly accessPolicy:
      FormularyPrescriptionAccessPolicyService,

    public readonly dependencies:
      FormularyPrescriptionMutationDependencies,
  ) {}

  public newId(): string {
    return newFormularyPrescriptionObjectIdString();
  }

  public async requirePrescription(
    actor: FormularyPrescriptionActorContext,
    prescriptionId: string,
  ): Promise<PrescriptionRecord> {
    const prescription =
      await this.prescriptions.findById(
        actor.facilityId,
        prescriptionId,
      );

    if (prescription === null) {
      throw new PrescriptionNotFoundError();
    }

    return prescription;
  }

  public async resolveClinicalContext(
    actor: FormularyPrescriptionActorContext,
    encounterId: string,
    requestedPatientId: string,
    prescriberProviderId: string,
  ): Promise<PrescriptionClinicalContext> {
    const canonical =
      await this.dependencies
        .canonicalPatient
        .resolve(
          actor.facilityId,
          requestedPatientId,
        );

    const context =
      await this.context
        .resolveActiveEncounter(
          actor.facilityId,
          encounterId,
        );

    if (
      context.patientId !==
        canonical.canonicalPatientId ||
      context.requestedPatientId !==
        canonical.requestedPatientId
    ) {
      throw new FormularyOnlyPrescribingError();
    }

    this.context.assertPrescriberAssigned(
      context,
      prescriberProviderId,
    );

    return context;
  }

  public async assertAccess(
    actor: FormularyPrescriptionActorContext,
    action: FormularyPrescriptionAccessAction,
    options: Readonly<{
      clinicalContext?: PrescriptionClinicalContext;
      prescription?: PrescriptionRecord;
    }> = {},
  ): Promise<void> {
    const decision =
      await this.accessPolicy.authorize({
        actor,
        action,

        ...(options.clinicalContext === undefined
          ? {}
          : {
              clinicalContext:
                options.clinicalContext,
            }),

        ...(options.prescription === undefined
          ? {}
          : {
              prescription:
                options.prescription,
            }),
      });

    if (!decision.allowed) {
      throw new FormularyPrescriptionMinimumNecessaryAccessError();
    }
  }

  public async resolvePrescriptionItems(
    actor: FormularyPrescriptionActorContext,
    context: PrescriptionClinicalContext,
    prescriptionId: string,
    inputs: readonly PrescriptionItemInput[],
    transactionId: string,
    occurredAt: Date,
  ): Promise<ResolvedPrescriptionItem[]> {
    if (inputs.length === 0) {
      throw new PrescriptionNoActiveItemsError();
    }

    const resolved:
      ResolvedPrescriptionItem[] = [];

    for (
      const [
        index,
        input,
      ] of inputs.entries()
    ) {
      const formularyItem =
        await this.catalog.findFormularyItemById(
          actor.facilityId,
          input.formularyItemId,
        );

      if (formularyItem === null) {
        throw new FormularyItemNotFoundError();
      }

      if (formularyItem.status !== 'ACTIVE') {
        throw new InactiveFormularyItemError();
      }

      if (
        formularyItem.effectiveFrom >
          occurredAt ||
        (
          formularyItem.effectiveUntil !==
            null &&
          formularyItem.effectiveUntil <
            occurredAt
        )
      ) {
        throw new FormularyItemNotEffectiveError();
      }

      if (
        formularyItem.restrictionType ===
          'DEPARTMENT_ONLY' &&
        !formularyItem
          .restrictedDepartmentIds
          .some(
            (departmentId) =>
              departmentId.toHexString() ===
              context.departmentId,
          )
      ) {
        throw new FormularyOnlyPrescribingError();
      }

      if (
        !formularyItem.allowedRouteIds.some(
          (routeId) =>
            routeId.toHexString() ===
            input.routeId,
        )
      ) {
        throw new FormularyRouteNotAllowedError();
      }

      if (
        formularyItem.doseUnitId.toHexString() !==
        input.doseUnitId
      ) {
        throw new FormularyDoseUnitMismatchError();
      }

      if (
        formularyItem.quantityUnitId.toHexString() !==
        input.quantityUnitId
      ) {
        throw new FormularyQuantityUnitMismatchError();
      }

      const [
        medicine,
        medicineForm,
        medicineStrength,
        route,
        frequency,
        doseUnit,
        quantityUnit,
      ] =
        await Promise.all([
          this.catalog.findMedicineById(
            actor.facilityId,
            formularyItem.medicineId.toHexString(),
          ),

          this.catalog.findMedicineFormById(
            actor.facilityId,
            formularyItem.medicineFormId.toHexString(),
          ),

          this.catalog.findMedicineStrengthById(
            actor.facilityId,
            formularyItem.medicineStrengthId.toHexString(),
          ),

          this.catalog.findMedicineRouteById(
            actor.facilityId,
            input.routeId,
          ),

          this.catalog.findPrescriptionFrequencyById(
            actor.facilityId,
            input.frequencyId,
          ),

          this.catalog.findUnitOfMeasureById(
            actor.facilityId,
            input.doseUnitId,
          ),

          this.catalog.findUnitOfMeasureById(
            actor.facilityId,
            input.quantityUnitId,
          ),
        ]);

      if (medicine === null) {
        throw new MedicineNotFoundError();
      }

      if (medicine.status !== 'ACTIVE') {
        throw new InactiveMedicineError();
      }

      if (medicineForm === null) {
        throw new MedicineFormNotFoundError();
      }

      if (medicineForm.status !== 'ACTIVE') {
        throw new InactiveMedicineFormError();
      }

      if (medicineStrength === null) {
        throw new MedicineStrengthNotFoundError();
      }

      if (medicineStrength.status !== 'ACTIVE') {
        throw new InactiveMedicineStrengthError();
      }

      if (route === null) {
        throw new MedicineRouteNotFoundError();
      }

      if (route.status !== 'ACTIVE') {
        throw new InactiveMedicineRouteError();
      }

      if (frequency === null) {
        throw new PrescriptionFrequencyNotFoundError();
      }

      if (frequency.status !== 'ACTIVE') {
        throw new InactivePrescriptionFrequencyError();
      }

      if (
        doseUnit === null ||
        quantityUnit === null
      ) {
        throw new UnitOfMeasureNotFoundError();
      }

      if (
        doseUnit.status !== 'ACTIVE' ||
        quantityUnit.status !== 'ACTIVE'
      ) {
        throw new InactiveUnitOfMeasureError();
      }

      if (
        medicine._id.toHexString() !==
          formularyItem.medicineId.toHexString() ||
        medicineForm._id.toHexString() !==
          formularyItem.medicineFormId.toHexString() ||
        medicineStrength._id.toHexString() !==
          formularyItem.medicineStrengthId.toHexString() ||
        medicineStrength.medicineId.toHexString() !==
          medicine._id.toHexString() ||
        medicineStrength.medicineFormId.toHexString() !==
          medicineForm._id.toHexString()
      ) {
        throw new FormularyOnlyPrescribingError();
      }

      resolved.push({
        formularyItem,

        item: {
          facilityId:
            toObjectId(
              actor.facilityId,
              'facilityId',
            ),

          prescriptionId:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          patientId:
            toObjectId(
              context.patientId,
              'patientId',
            ),

          encounterId:
            toObjectId(
              context.encounterId,
              'encounterId',
            ),

          sequence:
            index + 1,

          formularyItemId:
            formularyItem._id,

          medicineId:
            medicine._id,

          medicineFormId:
            medicineForm._id,

          medicineStrengthId:
            medicineStrength._id,

          selectedBrandName:
            input.selectedBrandName ??
            formularyItem.brandName,

          genericNameSnapshot:
            medicine.genericName,

          medicineFormSnapshot:
            medicineForm.name,

          medicineStrengthSnapshot:
            medicineStrength.displayText,

          dose:
            Types.Decimal128.fromString(
              input.dose,
            ),

          doseUnitId:
            doseUnit._id,

          doseUnitSnapshot:
            doseUnit.symbol,

          routeId:
            route._id,

          routeSnapshot:
            route.name,

          frequencyId:
            frequency._id,

          frequencySnapshot:
            frequency.name,

          durationValue:
            input.durationValue == null
              ? null
              : Types.Decimal128.fromString(
                  input.durationValue,
                ),

          durationUnit:
            input.durationUnit,

          quantity:
            Types.Decimal128.fromString(
              input.quantity,
            ),

          quantityUnitId:
            quantityUnit._id,

          quantityUnitSnapshot:
            quantityUnit.symbol,

          instructions:
            input.instructions ??
            null,

          asNeeded:
            input.asNeeded ??
            false,

          asNeededReason:
            input.asNeededReason ??
            null,

          startDate:
            input.startDate,

          endDate:
            input.endDate ??
            null,

          status:
            'ACTIVE',

          cancelledAt:
            null,

          cancelledBy:
            null,

          cancellationReason:
            null,

          dispensedQuantity:
            Types.Decimal128.fromString('0'),

          lastDispensedAt:
            null,

          lastDispensationId:
            null,

          transactionId,

          correlationId:
            actor.correlationId,

          schemaVersion:
            1,

          version:
            0,

          createdBy:
            toObjectId(
              actor.userId,
              'actorUserId',
            ),

          updatedBy:
            toObjectId(
              actor.userId,
              'actorUserId',
            ),
        },
      });
    }

    return resolved;
  }

  public async allocatePrescriptionNumber(
    facilityId: string,
    occurredAt: Date,
  ): Promise<string> {
    const year =
      occurredAt
        .getUTCFullYear();

    const allocation =
      await this.dependencies
        .sequence
        .next(
          facilityId,
          [
            PRESCRIPTION_NUMBER_SEQUENCE_NAMESPACE,
            year,
          ].join(':'),
        );

    return [
      'RX',
      year,
      String(
        allocation.value,
      ).padStart(
        DEFAULT_PRESCRIPTION_NUMBER_WIDTH,
        '0',
      ),
    ].join('-');
  }

  public defaultExpiry(
    issuedAt: Date,
  ): Date {
    return new Date(
      issuedAt.getTime() +
      DEFAULT_PRESCRIPTION_EXPIRY_DAYS *
        24 *
        60 *
        60 *
        1_000,
    );
  }

  public blockingWarnings(
    warnings:
      readonly PrescriptionSafetyWarningRecord[],
  ): PrescriptionSafetyWarningRecord[] {
    return warnings.filter(
      (warning) =>
        isBlockingSeverity(
          warning.severity,
        ) &&
        ![
          'OVERRIDDEN',
          'RESOLVED',
        ].includes(
          warning.status,
        ),
    );
  }

  public async appendStatusHistory(
    input: Readonly<{
      transaction:
        FormularyPrescriptionTransactionContext;

      actor:
        FormularyPrescriptionActorContext;

      prescription:
        PrescriptionRecord;

      items:
        readonly PrescriptionItemRecord[];

      warnings:
        readonly PrescriptionSafetyWarningRecord[];

      sequence:
        number;

      fromStatus:
        PrescriptionStatus | null;

      toStatus:
        PrescriptionStatus;

      changeType:
        'CREATED'
        | 'UPDATED'
        | 'ISSUED'
        | 'PARTIALLY_DISPENSED'
        | 'DISPENSED'
        | 'CANCELLED'
        | 'EXPIRED'
        | 'REPLACED';

      changeSource:
        'PROVIDER'
        | 'PHARMACY'
        | 'SYSTEM'
        | 'RECOVERY';

      occurredAt:
        Date;

      reason?:
        string;

      signedBy?:
        string;

      signatureMethod?:
        PrescriptionRecord['signatureMethod'];

      signatureDigest?:
        string;
    }>,
  ): Promise<void> {
    const prescriptionId =
      input.prescription._id.toHexString();

    const associatedData =
      prescriptionSnapshotAssociatedData(
        input.actor.facilityId,
        prescriptionId,
        input.sequence,
      );

    const protectedSnapshot =
      this.dependencies
        .snapshotCrypto
        .protect(
          {
            prescription:
              safePrescriptionAuditSnapshot(
                input.prescription,
              ),

            items:
              input.items.map(
                (item) => ({
                  prescriptionItemId:
                    item._id.toHexString(),

                  sequence:
                    item.sequence,

                  formularyItemId:
                    item.formularyItemId.toHexString(),

                  medicineId:
                    item.medicineId.toHexString(),

                  genericName:
                    item.genericNameSnapshot,

                  brandName:
                    item.selectedBrandName,

                  form:
                    item.medicineFormSnapshot,

                  strength:
                    item.medicineStrengthSnapshot,

                  dose:
                    item.dose.toString(),

                  doseUnit:
                    item.doseUnitSnapshot,

                  route:
                    item.routeSnapshot,

                  frequency:
                    item.frequencySnapshot,

                  durationValue:
                    item.durationValue?.toString() ??
                    null,

                  durationUnit:
                    item.durationUnit,

                  quantity:
                    item.quantity.toString(),

                  quantityUnit:
                    item.quantityUnitSnapshot,

                  instructions:
                    item.instructions,

                  asNeeded:
                    item.asNeeded,

                  asNeededReason:
                    item.asNeededReason,

                  startDate:
                    item.startDate,

                  endDate:
                    item.endDate,

                  status:
                    item.status,

                  dispensedQuantity:
                    item.dispensedQuantity.toString(),
                }),
              ),

            warnings:
              input.warnings.map(
                (warning) => ({
                  warningId:
                    warning._id.toHexString(),

                  warningType:
                    warning.warningType,

                  severity:
                    warning.severity,

                  status:
                    warning.status,

                  warningCode:
                    warning.warningCode,

                  message:
                    warning.message,
                }),
              ),
          },
          associatedData,
        );

    await input.transaction.checkpoint(
      FORMULARY_PRESCRIPTION_TRANSACTION_STATES.SNAPSHOT_ENCRYPTED,
      {
        prescriptionId,
        historySequence:
          input.sequence,
      },
    );

    await this.prescriptions.appendHistory({
      facilityId:
        input.prescription.facilityId,

      prescriptionId:
        input.prescription._id,

      patientId:
        input.prescription.patientId,

      sequence:
        input.sequence,

      fromStatus:
        input.fromStatus,

      toStatus:
        input.toStatus,

      changeType:
        input.changeType,

      changeSource:
        input.changeSource,

      reason:
        input.reason ??
        null,

      encryptedSnapshot:
        protectedSnapshot.encryptedValue,

      snapshotHash:
        protectedSnapshot.valueHash,

      signedBy:
        input.signedBy == null
          ? null
          : toObjectId(
              input.signedBy,
              'signedBy',
            ),

      signatureMethod:
        input.signatureMethod ??
        null,

      signatureDigest:
        input.signatureDigest ??
        null,

      occurredAt:
        input.occurredAt,

      changedBy:
        toObjectId(
          input.actor.userId,
          'actorUserId',
        ),

      transactionId:
        input.transaction.transactionId,

      correlationId:
        input.actor.correlationId,

      schemaVersion:
        1,

      version:
        0,

      createdBy:
        toObjectId(
          input.actor.userId,
          'actorUserId',
        ),

      updatedBy:
        toObjectId(
          input.actor.userId,
          'actorUserId',
        ),
    });

    await input.transaction.checkpoint(
      FORMULARY_PRESCRIPTION_TRANSACTION_STATES.STATUS_HISTORY_APPENDED,
      {
        prescriptionId,
        historySequence:
          input.sequence,
      },
    );
  }

  public async publishPrescriptionMutation(
    input: Readonly<{
      transaction:
        FormularyPrescriptionTransactionContext;

      actor:
        FormularyPrescriptionActorContext;

      occurredAt:
        Date;

      auditAction:
        string;

      outboxEventType:
        string;

      realtimeEventTypes:
        readonly string[];

      before:
        PrescriptionRecord | null;

      after:
        PrescriptionRecord;

      reason?:
        string;

      metadata?:
        Record<string, unknown>;
    }>,
  ): Promise<void> {
    const prescriptionId =
      input.after._id.toHexString();

    await this.dependencies.audit.append({
      transactionId:
        input.transaction.transactionId,

      deduplicationKey:
        formularyPrescriptionDeduplicationKey(
          input.transaction.transactionId,
          input.auditAction,
          prescriptionId,
        ),

      action:
        input.auditAction,

      entityType:
        'Prescription',

      entityId:
        prescriptionId,

      ...publicationActorFields(
        input.actor,
      ),

      occurredAt:
        input.occurredAt,

      ...(input.reason === undefined
        ? {}
        : {
            reason:
              input.reason,
          }),

      ...(input.before === null
        ? {}
        : {
            before:
              safePrescriptionAuditSnapshot(
                input.before,
              ),
          }),

      after:
        safePrescriptionAuditSnapshot(
          input.after,
        ),

      ...(input.metadata === undefined
        ? {}
        : {
            metadata:
              input.metadata,
          }),
    });

    await input.transaction.checkpoint(
      FORMULARY_PRESCRIPTION_TRANSACTION_STATES.AUDIT_APPENDED,
      {
        prescriptionId,
      },
    );

    await this.dependencies.outbox.enqueue({
      transactionId:
        input.transaction.transactionId,

      deduplicationKey:
        formularyPrescriptionDeduplicationKey(
          input.transaction.transactionId,
          input.outboxEventType,
          prescriptionId,
        ),

      eventType:
        input.outboxEventType,

      aggregateType:
        'Prescription',

      aggregateId:
        prescriptionId,

      actorUserId:
        input.actor.userId,

      facilityId:
        input.actor.facilityId,

      correlationId:
        input.actor.correlationId,

      occurredAt:
        input.occurredAt,

      payload:
        safePrescriptionEventPayload(
          input.after,
        ),
    });

    await input.transaction.checkpoint(
      FORMULARY_PRESCRIPTION_TRANSACTION_STATES.OUTBOX_ENQUEUED,
      {
        prescriptionId,
      },
    );

    await Promise.all(
      input.realtimeEventTypes.map(
        async (eventType) =>
          this.dependencies.realtime.publish({
            eventType,

            facilityId:
              input.actor.facilityId,

            patientId:
              input.after.patientId.toHexString(),

            encounterId:
              input.after.encounterId.toHexString(),

            prescriptionId,

            providerId:
              input.after.prescriberProviderId.toHexString(),

            payload:
              safePrescriptionEventPayload(
                input.after,
              ),
          }),
      ),
    );

    await input.transaction.checkpoint(
      FORMULARY_PRESCRIPTION_TRANSACTION_STATES.REALTIME_PUBLISHED,
      {
        prescriptionId,
      },
    );
  }

  public assertExpectedVersion(
    prescription: PrescriptionRecord,
    expectedVersion: number,
  ): void {
    if (
      prescription.version !==
      expectedVersion
    ) {
      throw new PrescriptionConcurrencyError();
    }
  }
}