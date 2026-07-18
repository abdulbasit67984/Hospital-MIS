import {
  AllergyNotFoundError,
  ClinicalEncounterContextMismatchError,
  ClinicalNoKnownAllergyConflictError,
  PatientAllergyConcurrencyError,
  PatientAllergyNotFoundError,
} from '../clinical-emr.errors.js';

import {
  deleteCreatedClinicalRecordCompensation,
} from '../clinical-emr.mutation-snapshots.js';

import type {
  ClinicalEmrTransactionContext,
} from '../clinical-emr.ports.js';

import {
  CLINICAL_EMR_TRANSACTION_STATES,
} from '../clinical-emr.transaction.constants.js';

import type {
  AllergyReactionInput,
  ClinicalEmrActorContext,
  EncounterRecord,
  PatientAllergyRecord,
  RecordPatientAllergyInput,
} from '../clinical-emr.types.js';

import {
  normalizeClinicalDisplay,
  normalizeOptionalClinicalText,
} from '../clinical-emr.normalization.js';

import {
  patientAllergyVersionAssociatedData,
} from '../clinical-emr.workflow-helpers.js';

import type {
  AllergyRepository,
  PatientAllergyRepository,
  PatientAllergyVersionRepository,
  PersistedAllergyReactionInput,
} from '../repositories/allergy.repository.js';

import type {
  ClinicalListCommandService,
} from './clinical-list-command.service.js';

export interface PatientAllergyWriteContext {
  requestedPatientId: string;
  patientId: string;
  encounter: EncounterRecord;
}

export interface NormalizedPatientAllergyInput {
  recordType: PatientAllergyRecord['recordType'];
  allergyId: string | null;
  category: PatientAllergyRecord['category'];
  allergenText: string;
  verificationStatus: PatientAllergyRecord['verificationStatus'];
  severity: PatientAllergyRecord['severity'];
  reactions: PersistedAllergyReactionInput[];
  onsetDate: string | null;
  lastReactionAt: Date | null;
  clinicalNoteId: string | null;
  notes: string | null;
}

export interface PatientAllergyVersionAppendInput {
  versionId: string;
  allergy: PatientAllergyRecord;
  previousVersionId: string | null;
  changeReason: string | null;
  occurredAt: Date;
  actor: ClinicalEmrActorContext;
}

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

function normalizedDate(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new TypeError(`${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new TypeError(`${field} is not a valid calendar date`);
  }

  return normalized;
}

function optionalDateTime(
  value: string | null | undefined,
  field: string,
): Date | null {
  if (value == null) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${field} must be a valid ISO date-time`);
  }

  return parsed;
}

function normalizeReaction(
  reaction: AllergyReactionInput,
): PersistedAllergyReactionInput {
  return {
    manifestation: normalizeClinicalDisplay(
      reaction.manifestation,
      'reaction.manifestation',
    ),
    severity: reaction.severity,
    occurredAt: optionalDateTime(
      reaction.occurredAt,
      'reaction.occurredAt',
    ),
    notes: normalizeOptionalClinicalText(
      reaction.notes,
      'reaction.notes',
    ),
  };
}

export class PatientAllergyCommandService {
  public constructor(
    public readonly allergies: PatientAllergyRepository,
    private readonly versions: PatientAllergyVersionRepository,
    private readonly catalog: AllergyRepository,
    public readonly common: ClinicalListCommandService,
  ) {}

  public async resolveWriteContext(
    actor: ClinicalEmrActorContext,
    patientId: string,
    sourceEncounterId: string | null | undefined,
  ): Promise<PatientAllergyWriteContext> {
    if (sourceEncounterId == null) {
      throw new ClinicalEncounterContextMismatchError(
        'Patient allergy mutations require a source clinical encounter',
      );
    }

    const canonical = await this.common.dependencies.canonicalPatient.resolve(
      actor.facilityId,
      patientId,
    );
    const encounter = await this.common.requireEncounter(
      actor,
      sourceEncounterId,
    );

    if (
      encounter.patientId.toHexString() !== canonical.canonicalPatientId
    ) {
      throw new ClinicalEncounterContextMismatchError(
        'The source encounter does not belong to the canonical patient',
      );
    }

    return {
      requestedPatientId: canonical.requestedPatientId,
      patientId: canonical.canonicalPatientId,
      encounter,
    };
  }

  public async normalizeInput(
    actor: ClinicalEmrActorContext,
    input: Omit<
      RecordPatientAllergyInput,
      'patientId' | 'sourceEncounterId'
    >,
  ): Promise<NormalizedPatientAllergyInput> {
    const isNoKnown = [
      'NO_KNOWN_ALLERGIES',
      'NO_KNOWN_DRUG_ALLERGIES',
    ].includes(input.recordType);

    let allergyId = input.allergyId ?? null;
    let category = input.category;
    let allergenText = normalizeClinicalDisplay(
      input.allergenText,
      'allergenText',
    );

    if (allergyId !== null) {
      const allergen = await this.catalog.findById(
        actor.facilityId,
        allergyId,
        false,
      );

      if (allergen === null || allergen.status !== 'ACTIVE') {
        throw new AllergyNotFoundError();
      }

      if (allergen.category !== input.category) {
        throw new ClinicalEncounterContextMismatchError(
          'The allergen identifier does not match the supplied category',
        );
      }

      allergyId = allergen._id.toHexString();
      category = allergen.category;
      allergenText = allergen.name;
    }

    const reactions = (input.reactions ?? []).map(normalizeReaction);
    const severity = input.severity ?? 'UNKNOWN';

    if (isNoKnown) {
      if (allergyId !== null || reactions.length > 0 || severity !== 'UNKNOWN') {
        throw new ClinicalNoKnownAllergyConflictError();
      }

      allergenText =
        input.recordType === 'NO_KNOWN_DRUG_ALLERGIES'
          ? 'No known drug allergies'
          : 'No known allergies';
      category =
        input.recordType === 'NO_KNOWN_DRUG_ALLERGIES'
          ? 'MEDICATION'
          : 'OTHER';
    }

    return {
      recordType: input.recordType,
      allergyId,
      category,
      allergenText,
      verificationStatus: input.verificationStatus ?? 'UNCONFIRMED',
      severity,
      reactions,
      onsetDate: normalizedDate(input.onsetDate, 'onsetDate'),
      lastReactionAt: optionalDateTime(
        input.lastReactionAt,
        'lastReactionAt',
      ),
      clinicalNoteId: input.clinicalNoteId ?? null,
      notes: normalizeOptionalClinicalText(input.notes, 'notes'),
    };
  }

  public async assertNoKnownConflict(
    actor: ClinicalEmrActorContext,
    patientId: string,
    normalized: NormalizedPatientAllergyInput,
    ignorePatientAllergyId?: string,
  ): Promise<void> {
    const activeRecords: PatientAllergyRecord[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await this.allergies.list(
        actor.facilityId,
        {
          patientId,
          status: 'ACTIVE',
          page,
          pageSize: 100,
          sortDirection: 'desc',
        },
        false,
      );

      activeRecords.push(...result.items);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages);

    const relevant = activeRecords.filter(
      (record) =>
        record._id.toHexString() !== ignorePatientAllergyId,
    );
    const isNoKnown = [
      'NO_KNOWN_ALLERGIES',
      'NO_KNOWN_DRUG_ALLERGIES',
    ].includes(normalized.recordType);

    if (
      isNoKnown
        ? relevant.length > 0
        : relevant.some((record) =>
            [
              'NO_KNOWN_ALLERGIES',
              'NO_KNOWN_DRUG_ALLERGIES',
            ].includes(record.recordType),
          )
    ) {
      throw new ClinicalNoKnownAllergyConflictError();
    }
  }

  public async requireAllergy(
    actor: ClinicalEmrActorContext,
    patientAllergyId: string,
  ): Promise<PatientAllergyRecord> {
    const allergy = await this.allergies.findById(
      actor.facilityId,
      patientAllergyId,
      true,
    );

    if (allergy === null) {
      throw new PatientAllergyNotFoundError();
    }

    return allergy;
  }

  public assertExpectedVersion(
    allergy: PatientAllergyRecord,
    expectedVersion: number,
  ): void {
    if (allergy.version !== expectedVersion) {
      throw new PatientAllergyConcurrencyError();
    }
  }

  public async appendVersion(
    input: PatientAllergyVersionAppendInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<void> {
    const patientAllergyId = input.allergy._id.toHexString();
    const versionNumber = input.allergy.currentVersion;
    const associatedData = patientAllergyVersionAssociatedData(
      input.actor.facilityId,
      patientAllergyId,
      versionNumber,
    );

    const snapshot = {
      patientAllergyId,
      patientId: input.allergy.patientId.toHexString(),
      recordType: input.allergy.recordType,
      allergyId: id(input.allergy.allergyId),
      category: input.allergy.category,
      allergenText: input.allergy.allergenText,
      status: input.allergy.status,
      verificationStatus: input.allergy.verificationStatus,
      severity: input.allergy.severity,
      reactions: input.allergy.reactions,
      onsetDate: input.allergy.onsetDate,
      lastReactionAt: input.allergy.lastReactionAt?.toISOString() ?? null,
      clinicalNoteId: id(input.allergy.clinicalNoteId),
      sourceEncounterId: id(input.allergy.sourceEncounterId),
      notes: input.allergy.notes,
      verifiedAt: input.allergy.verifiedAt?.toISOString() ?? null,
      verifiedBy: id(input.allergy.verifiedBy),
      statusReason: input.allergy.statusReason,
      supersedesPatientAllergyId: id(
        input.allergy.supersedesPatientAllergyId,
      ),
      supersededByPatientAllergyId: id(
        input.allergy.supersededByPatientAllergyId,
      ),
    };

    const protectedSnapshot =
      this.common.dependencies.snapshotCrypto.protect(
        snapshot,
        associatedData,
      );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.SNAPSHOT_ENCRYPTED,
      {
        patientAllergyId,
        versionNumber,
      },
    );

    await this.versions.create({
      versionId: input.versionId,
      facilityId: input.actor.facilityId,
      patientAllergyId,
      patientId: input.allergy.patientId.toHexString(),
      versionNumber,
      previousVersionId: input.previousVersionId,
      statusSnapshot: input.allergy.status,
      encryptedSnapshot: protectedSnapshot.encryptedValue,
      snapshotHash: protectedSnapshot.valueHash,
      changeReason: input.changeReason,
      recordedAt: input.occurredAt,
      recordedBy: input.actor.userId,
      transactionId: transaction.transactionId,
      correlationId: input.actor.correlationId,
    });

    await transaction.registerCompensation(
      deleteCreatedClinicalRecordCompensation({
        key: `delete-patient-allergy-version:${input.versionId}`,
        collection: 'patientAllergyVersions',
        entityId: input.versionId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.IMMUTABLE_VERSION_APPENDED,
      {
        patientAllergyId,
        versionNumber,
        status: input.allergy.status,
      },
    );
  }
}