import {
  ClinicalEncounterContextMismatchError,
  DiagnosisNotFoundError,
  EncounterDiagnosisConcurrencyError,
  EncounterDiagnosisNotFoundError,
} from '../clinical-emr.errors.js';

import {
  normalizeClinicalCode,
  normalizeClinicalDisplay,
  normalizeOptionalClinicalText,
} from '../clinical-emr.normalization.js';

import type {
  ClinicalEmrActorContext,
  EncounterDiagnosisRecord,
  RecordEncounterDiagnosisInput,
} from '../clinical-emr.types.js';

import type {
  DiagnosisRepository,
  EncounterDiagnosisRepository,
} from '../repositories/diagnosis.repository.js';

import type {
  ClinicalListCommandService,
} from './clinical-list-command.service.js';

export interface ResolvedDiagnosisIdentity {
  diagnosisId: string | null;
  codeSystem: EncounterDiagnosisRecord['codeSystem'];
  code: string;
  display: string;
}

export interface NormalizedEncounterDiagnosisInput
  extends ResolvedDiagnosisIdentity {
  role: EncounterDiagnosisRecord['role'];
  certainty: EncounterDiagnosisRecord['certainty'];
  clinicalNoteId: string | null;
  onsetDate: string | null;
  isChronic: boolean;
  presentOnAdmission: boolean | null;
  evidence: string | null;
}

export class DiagnosisCommandService {
  public constructor(
    public readonly encounterDiagnoses: EncounterDiagnosisRepository,
    private readonly diagnoses: DiagnosisRepository,
    public readonly common: ClinicalListCommandService,
  ) {}

  public async normalizeInput(
    actor: ClinicalEmrActorContext,
    input: Omit<RecordEncounterDiagnosisInput, 'encounterId'>,
  ): Promise<NormalizedEncounterDiagnosisInput> {
    const requestedCode = normalizeClinicalCode(input.code, 'code');
    const requestedDisplay = normalizeClinicalDisplay(
      input.display,
      'display',
    );

    let identity: ResolvedDiagnosisIdentity = {
      diagnosisId: input.diagnosisId ?? null,
      codeSystem: input.codeSystem,
      code: requestedCode,
      display: requestedDisplay,
    };

    if (input.diagnosisId != null) {
      const diagnosis = await this.diagnoses.findById(
        actor.facilityId,
        input.diagnosisId,
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
          'The diagnosis identifier does not match the supplied code system and code',
        );
      }

      identity = {
        diagnosisId: diagnosis._id.toHexString(),
        codeSystem: diagnosis.codeSystem,
        code: diagnosis.code,
        display: diagnosis.display,
      };
    }

    return {
      ...identity,
      role: input.role,
      certainty: input.certainty,
      clinicalNoteId: input.clinicalNoteId ?? null,
      onsetDate: input.onsetDate ?? null,
      isChronic: input.isChronic ?? false,
      presentOnAdmission: input.presentOnAdmission ?? null,
      evidence: normalizeOptionalClinicalText(
        input.evidence,
        'evidence',
      ),
    };
  }

  public async requireEncounterDiagnosis(
    actor: ClinicalEmrActorContext,
    encounterDiagnosisId: string,
  ): Promise<EncounterDiagnosisRecord> {
    const diagnosis = await this.encounterDiagnoses.findById(
      actor.facilityId,
      encounterDiagnosisId,
      true,
    );

    if (diagnosis === null) {
      throw new EncounterDiagnosisNotFoundError();
    }

    return diagnosis;
  }

  public assertExpectedVersion(
    record: EncounterDiagnosisRecord,
    expectedVersion: number,
  ): void {
    if (record.version !== expectedVersion) {
      throw new EncounterDiagnosisConcurrencyError();
    }
  }
}