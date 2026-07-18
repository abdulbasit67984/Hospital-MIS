import type {
  PatientProblemVersionChangeType,
} from '@hospital-mis/database';

import {
  ClinicalEncounterContextMismatchError,
  DiagnosisNotFoundError,
  EncounterDiagnosisNotFoundError,
  PatientProblemConcurrencyError,
  PatientProblemNotFoundError,
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
  ClinicalEmrActorContext,
  CreatePatientProblemInput,
  EncounterRecord,
  PatientProblemRecord,
} from '../clinical-emr.types.js';

import {
  normalizeClinicalCode,
  normalizeClinicalDisplay,
  normalizeOptionalClinicalText,
} from '../clinical-emr.normalization.js';

import {
  patientProblemVersionAssociatedData,
} from '../clinical-emr.workflow-helpers.js';

import type {
  DiagnosisRepository,
  EncounterDiagnosisRepository,
} from '../repositories/diagnosis.repository.js';

import type {
  PatientProblemRepository,
  PatientProblemVersionRepository,
} from '../repositories/patient-problem.repository.js';

import type {
  ClinicalEmrNumberService,
} from './clinical-emr-number.service.js';

import type {
  ClinicalListCommandService,
} from './clinical-list-command.service.js';

export interface NormalizedPatientProblemInput {
  diagnosisId: string | null;
  sourceEncounterDiagnosisId: string | null;
  codeSystem: PatientProblemRecord['codeSystem'];
  code: string;
  display: string;
  onsetDate: string | null;
  summary: string | null;
}

export interface PatientProblemVersionAppendInput {
  versionId: string;
  problem: PatientProblemRecord;
  previousVersionId: string | null;
  changeType: PatientProblemVersionChangeType;
  changeReason: string | null;
  occurredAt: Date;
  actor: ClinicalEmrActorContext;
}

function id(
  value: { toHexString(): string } | null,
): string | null {
  return value?.toHexString() ?? null;
}

export class PatientProblemCommandService {
  public constructor(
    public readonly problems: PatientProblemRepository,
    private readonly versions: PatientProblemVersionRepository,
    private readonly diagnoses: DiagnosisRepository,
    private readonly encounterDiagnoses: EncounterDiagnosisRepository,
    private readonly numbers: ClinicalEmrNumberService,
    public readonly common: ClinicalListCommandService,
  ) {}

  public async normalizeInput(
    actor: ClinicalEmrActorContext,
    encounter: EncounterRecord,
    input: Omit<CreatePatientProblemInput, 'sourceEncounterId'>,
  ): Promise<NormalizedPatientProblemInput> {
    const requestedCode = normalizeClinicalCode(input.code, 'code');
    let diagnosisId = input.diagnosisId ?? null;
    let codeSystem = input.codeSystem;
    let code = requestedCode;
    let display = normalizeClinicalDisplay(input.display, 'display');

    if (diagnosisId !== null) {
      const diagnosis = await this.diagnoses.findById(
        actor.facilityId,
        diagnosisId,
        false,
      );

      if (diagnosis === null || diagnosis.status !== 'ACTIVE') {
        throw new DiagnosisNotFoundError();
      }

      if (
        diagnosis.codeSystem !== input.codeSystem ||
        diagnosis.normalizedCode !== requestedCode
      ) {
        throw new ClinicalEncounterContextMismatchError(
          'The problem diagnosis identifier does not match its supplied code',
        );
      }

      diagnosisId = diagnosis._id.toHexString();
      codeSystem = diagnosis.codeSystem;
      code = diagnosis.code;
      display = diagnosis.display;
    }

    const sourceEncounterDiagnosisId =
      input.sourceEncounterDiagnosisId ?? null;

    if (sourceEncounterDiagnosisId !== null) {
      const sourceDiagnosis = await this.encounterDiagnoses.findById(
        actor.facilityId,
        sourceEncounterDiagnosisId,
        true,
      );

      if (sourceDiagnosis === null) {
        throw new EncounterDiagnosisNotFoundError();
      }

      if (
        sourceDiagnosis.encounterId.toHexString() !==
          encounter._id.toHexString() ||
        sourceDiagnosis.patientId.toHexString() !==
          encounter.patientId.toHexString() ||
        sourceDiagnosis.status === 'ENTERED_IN_ERROR' ||
        sourceDiagnosis.codeSystem !== codeSystem ||
        sourceDiagnosis.normalizedCode !== code
      ) {
        throw new ClinicalEncounterContextMismatchError(
          'The source encounter diagnosis is inconsistent with the problem-list entry',
        );
      }

      diagnosisId = sourceDiagnosis.diagnosisId?.toHexString() ?? diagnosisId;
      codeSystem = sourceDiagnosis.codeSystem;
      code = sourceDiagnosis.code;
      display = sourceDiagnosis.display;
    }

    return {
      diagnosisId,
      sourceEncounterDiagnosisId,
      codeSystem,
      code,
      display,
      onsetDate: input.onsetDate ?? null,
      summary: normalizeOptionalClinicalText(input.summary, 'summary'),
    };
  }

  public async requireProblem(
    actor: ClinicalEmrActorContext,
    patientProblemId: string,
  ): Promise<PatientProblemRecord> {
    const problem = await this.problems.findById(
      actor.facilityId,
      patientProblemId,
      true,
    );

    if (problem === null) {
      throw new PatientProblemNotFoundError();
    }

    return problem;
  }

  public assertExpectedVersion(
    problem: PatientProblemRecord,
    expectedVersion: number,
  ): void {
    if (problem.version !== expectedVersion) {
      throw new PatientProblemConcurrencyError();
    }
  }

  public async allocateNumber(
    encounter: EncounterRecord,
  ) {
    return this.numbers.allocatePatientProblemNumber({
      facilityId: encounter.facilityId.toHexString(),
      serviceDate: encounter.serviceDate,
    });
  }

  public async appendVersion(
    input: PatientProblemVersionAppendInput,
    transaction: ClinicalEmrTransactionContext,
  ): Promise<void> {
    const patientProblemId = input.problem._id.toHexString();
    const versionNumber = input.problem.currentVersion;
    const associatedData = patientProblemVersionAssociatedData(
      input.actor.facilityId,
      patientProblemId,
      versionNumber,
    );

    const snapshot = {
      patientProblemId,
      problemNumber: input.problem.problemNumber,
      patientId: input.problem.patientId.toHexString(),
      diagnosisId: id(input.problem.diagnosisId),
      sourceEncounterId: input.problem.sourceEncounterId.toHexString(),
      sourceEncounterDiagnosisId: id(
        input.problem.sourceEncounterDiagnosisId,
      ),
      codeSystem: input.problem.codeSystem,
      code: input.problem.code,
      display: input.problem.display,
      status: input.problem.status,
      onsetDate: input.problem.onsetDate,
      resolvedAt: input.problem.resolvedAt?.toISOString() ?? null,
      summary: input.problem.summary,
      statusReason: input.problem.statusReason,
      supersedesProblemId: id(input.problem.supersedesProblemId),
      supersededByProblemId: id(input.problem.supersededByProblemId),
    };

    const protectedSnapshot =
      this.common.dependencies.snapshotCrypto.protect(
        snapshot,
        associatedData,
      );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.SNAPSHOT_ENCRYPTED,
      {
        patientProblemId,
        versionNumber,
      },
    );

    await this.versions.create({
      versionId: input.versionId,
      facilityId: input.actor.facilityId,
      patientProblemId,
      patientId: input.problem.patientId.toHexString(),
      versionNumber,
      previousVersionId: input.previousVersionId,
      changeType: input.changeType,
      statusSnapshot: input.problem.status,
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
        key: `delete-patient-problem-version:${input.versionId}`,
        collection: 'patientProblemVersions',
        entityId: input.versionId,
        expectedVersion: 0,
        transactionId: transaction.transactionId,
      }),
    );

    await transaction.checkpoint(
      CLINICAL_EMR_TRANSACTION_STATES.IMMUTABLE_VERSION_APPENDED,
      {
        patientProblemId,
        versionNumber,
        changeType: input.changeType,
      },
    );
  }
}