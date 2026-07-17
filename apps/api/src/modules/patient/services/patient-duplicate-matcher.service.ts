import {
  PATIENT_ACCESS_LEVEL,
  PATIENT_DUPLICATE_MATCH_LEVEL,
  PATIENT_DUPLICATE_REASON,
  PATIENT_DUPLICATE_SCORE,
  PATIENT_DUPLICATE_THRESHOLD,
  type PatientDuplicateMatchLevel,
  type PatientDuplicateReason,
} from '../patient.constants.js';

import {
  buildLegalName,
  normalizeCnic,
  normalizePatientIdentifier,
  normalizeSearchText,
  parseNullableDate,
} from '../patient.normalization.js';

import type {
  PatientDuplicateAssessment,
  PatientDuplicateCandidate,
  PatientDuplicateCheckInput,
  PatientIdentifierMatch,
  PatientRecord,
} from '../patient.types.js';

export interface DuplicatePatientRepositoryPort {
  findByIds(
    facilityId: string,
    patientIds: readonly string[],
    access: typeof PATIENT_ACCESS_LEVEL.MATCHING,
  ): Promise<PatientRecord[]>;

  findMatchingCandidates(
    input: Readonly<{
      facilityId: string;
      normalizedFullName: string;
      birthDate: Date | null;
      estimatedBirthYear: number | null;
      excludePatientId?: string;
      limit?: number;
    }>,
  ): Promise<PatientRecord[]>;
}

export interface DuplicateIdentifierRepositoryPort {
  findExactMatches(
    input: Readonly<{
      facilityId: string;
      identifiers: readonly Readonly<{
        identifierType:
          PatientDuplicateCheckInput['identifiers'][number]['identifierType'];
        value: string;
      }>[];
      excludePatientId?: string;
    }>,
  ): Promise<PatientIdentifierMatch[]>;

  findPrimaryMrn(
    facilityId: string,
    patientId: string,
  ): Promise<
    | Readonly<{
        displayValue: string;
      }>
    | null
  >;
}

export interface DuplicateGuardianRepositoryPort {
  findPatientIdsByGuardianCnic(
    facilityId: string,
    cnic: string,
    excludePatientId?: string,
  ): Promise<string[]>;
}

export interface DuplicateProfileRepositoryPort {
  findPatientIdsByPhone(
    facilityId: string,
    phones: readonly string[],
    excludePatientId?: string,
  ): Promise<string[]>;
}

interface CandidateAccumulator {
  patientId: string;
  facilityId: string;
  crossFacility: boolean;
  score: number;
  reasons: Set<PatientDuplicateReason>;
}

function candidateKey(
  facilityId: string,
  patientId: string,
): string {
  return `${facilityId}:${patientId}`;
}

function addReason(
  candidate: CandidateAccumulator,
  reason: PatientDuplicateReason,
  score: number,
): void {
  if (candidate.reasons.has(reason)) {
    return;
  }

  candidate.reasons.add(reason);
  candidate.score += score;
}

function levelForScore(
  score: number,
): PatientDuplicateMatchLevel {
  if (
    score >=
    PATIENT_DUPLICATE_THRESHOLD.BLOCK
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK;
  }

  if (
    score >=
    PATIENT_DUPLICATE_THRESHOLD.HIGH
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.HIGH;
  }

  if (
    score >=
    PATIENT_DUPLICATE_THRESHOLD.POSSIBLE
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.POSSIBLE;
  }

  return PATIENT_DUPLICATE_MATCH_LEVEL.NONE;
}

function identifierReason(
  match: PatientIdentifierMatch,
): Readonly<{
  reason: PatientDuplicateReason;
  score: number;
}> | null {
  switch (match.identifierType) {
    case 'CNIC':
      return {
        reason:
          PATIENT_DUPLICATE_REASON.EXACT_CNIC,
        score:
          PATIENT_DUPLICATE_SCORE.EXACT_CNIC,
      };

    case 'B_FORM':
      return {
        reason:
          PATIENT_DUPLICATE_REASON.EXACT_B_FORM,
        score:
          PATIENT_DUPLICATE_SCORE.EXACT_B_FORM,
      };

    case 'PASSPORT':
      return {
        reason:
          PATIENT_DUPLICATE_REASON.EXACT_PASSPORT,
        score:
          PATIENT_DUPLICATE_SCORE.EXACT_PASSPORT,
      };

    case 'MRN':
    case 'OTHER':
      return null;

    default:
      return null;
  }
}

function sameUtcDate(
  first: Date,
  second: Date,
): boolean {
  return (
    first.getUTCFullYear() ===
      second.getUTCFullYear() &&
    first.getUTCMonth() ===
      second.getUTCMonth() &&
    first.getUTCDate() ===
      second.getUTCDate()
  );
}

function estimatedBirthYear(
  input: PatientDuplicateCheckInput,
): number | null {
  const explicitDate =
    parseNullableDate(
      input.birthDate.value,
      'birthDate.value',
    );

  if (explicitDate !== null) {
    return explicitDate.getUTCFullYear();
  }

  if (
    input.birthDate.estimatedAgeYears ===
      null ||
    input.birthDate.estimatedAsOfDate ===
      null
  ) {
    return null;
  }

  const asOfDate =
    parseNullableDate(
      input.birthDate.estimatedAsOfDate,
      'birthDate.estimatedAsOfDate',
    );

  return asOfDate === null
    ? null
    : asOfDate.getUTCFullYear() -
        input.birthDate.estimatedAgeYears;
}

function highestLevel(
  candidates: readonly PatientDuplicateCandidate[],
): PatientDuplicateMatchLevel {
  if (
    candidates.some(
      (candidate) =>
        candidate.level ===
        PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK,
    )
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK;
  }

  if (
    candidates.some(
      (candidate) =>
        candidate.level ===
        PATIENT_DUPLICATE_MATCH_LEVEL.HIGH,
    )
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.HIGH;
  }

  if (
    candidates.some(
      (candidate) =>
        candidate.level ===
        PATIENT_DUPLICATE_MATCH_LEVEL.POSSIBLE,
    )
  ) {
    return PATIENT_DUPLICATE_MATCH_LEVEL.POSSIBLE;
  }

  return PATIENT_DUPLICATE_MATCH_LEVEL.NONE;
}

export class PatientDuplicateMatcherService {
  public constructor(
    private readonly patients:
      DuplicatePatientRepositoryPort,
    private readonly identifiers:
      DuplicateIdentifierRepositoryPort,
    private readonly guardians:
      DuplicateGuardianRepositoryPort,
    private readonly profiles:
      DuplicateProfileRepositoryPort,
  ) {}

  public async assess(
    input: PatientDuplicateCheckInput,
  ): Promise<PatientDuplicateAssessment> {
    const normalizedFullName =
      normalizeSearchText(
        buildLegalName({
          firstName:
            input.firstName,
          middleName:
            input.middleName ?? null,
          lastName:
            input.lastName ?? null,
        }),
      );

    const birthDate =
      parseNullableDate(
        input.birthDate.value,
        'birthDate.value',
      );

    const birthYear =
      estimatedBirthYear(input);

    const normalizedIdentifiers =
      input.identifiers.map(
        (identifier) => ({
          identifierType:
            identifier.identifierType,
          value:
            normalizePatientIdentifier(
              identifier.identifierType,
              identifier.value,
            ),
        }),
      );

    const [
      exactIdentityMatches,
      guardianPatientIds,
      phonePatientIds,
      nameCandidates,
    ] = await Promise.all([
      this.identifiers.findExactMatches({
        facilityId:
          input.facilityId,
        identifiers:
          normalizedIdentifiers,
        ...(input.excludePatientId === undefined
          ? {}
          : {
              excludePatientId:
                input.excludePatientId,
            }),
      }),
      input.guardianCnic === undefined ||
      input.guardianCnic === null ||
      input.guardianCnic.trim().length === 0
        ? Promise.resolve([])
        : this.guardians.findPatientIdsByGuardianCnic(
            input.facilityId,
            normalizeCnic(
              input.guardianCnic,
              'guardianCnic',
            ),
            input.excludePatientId,
          ),
      this.profiles.findPatientIdsByPhone(
        input.facilityId,
        input.phones,
        input.excludePatientId,
      ),
      this.patients.findMatchingCandidates({
        facilityId:
          input.facilityId,
        normalizedFullName,
        birthDate,
        estimatedBirthYear:
          birthYear,
        ...(input.excludePatientId === undefined
          ? {}
          : {
              excludePatientId:
                input.excludePatientId,
            }),
        limit:
          50,
      }),
    ]);

    const accumulators =
      new Map<string, CandidateAccumulator>();

    const ensureCandidate = (
      facilityId: string,
      patientId: string,
    ): CandidateAccumulator => {
      const key =
        candidateKey(
          facilityId,
          patientId,
        );

      const existing =
        accumulators.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const created: CandidateAccumulator = {
        facilityId,
        patientId,
        crossFacility:
          facilityId !== input.facilityId,
        score:
          0,
        reasons:
          new Set<PatientDuplicateReason>(),
      };

      accumulators.set(
        key,
        created,
      );

      return created;
    };

    for (const match of exactIdentityMatches) {
      const reason =
        identifierReason(match);

      if (reason === null) {
        continue;
      }

      addReason(
        ensureCandidate(
          match.facilityId,
          match.patientId,
        ),
        reason.reason,
        reason.score,
      );
    }

    for (const patientId of guardianPatientIds) {
      addReason(
        ensureCandidate(
          input.facilityId,
          patientId,
        ),
        PATIENT_DUPLICATE_REASON.SAME_GUARDIAN_CNIC,
        PATIENT_DUPLICATE_SCORE.SAME_GUARDIAN_CNIC,
      );
    }

    for (const patientId of phonePatientIds) {
      addReason(
        ensureCandidate(
          input.facilityId,
          patientId,
        ),
        PATIENT_DUPLICATE_REASON.EXACT_PHONE,
        PATIENT_DUPLICATE_SCORE.EXACT_PHONE,
      );
    }

    for (const patient of nameCandidates) {
      ensureCandidate(
        input.facilityId,
        patient._id.toHexString(),
      );
    }

    const localPatientIds = [
      ...new Set(
        [...accumulators.values()]
          .filter(
            (candidate) =>
              !candidate.crossFacility,
          )
          .map(
            (candidate) =>
              candidate.patientId,
          ),
      ),
    ];

    const localPatients =
      await this.patients.findByIds(
        input.facilityId,
        localPatientIds,
        PATIENT_ACCESS_LEVEL.MATCHING,
      );

    const localPatientsById =
      new Map(
        localPatients.map(
          (patient) => [
            patient._id.toHexString(),
            patient,
          ],
        ),
      );

    for (const patient of localPatients) {
      const candidate =
        ensureCandidate(
          input.facilityId,
          patient._id.toHexString(),
        );

      if (
        patient.normalizedFullName ===
        normalizedFullName
      ) {
        addReason(
          candidate,
          PATIENT_DUPLICATE_REASON.EXACT_NAME,
          PATIENT_DUPLICATE_SCORE.EXACT_NAME,
        );
      }

      if (
        birthDate !== null &&
        patient.birthDate.value !== null &&
        sameUtcDate(
          birthDate,
          patient.birthDate.value,
        )
      ) {
        addReason(
          candidate,
          PATIENT_DUPLICATE_REASON.EXACT_BIRTH_DATE,
          PATIENT_DUPLICATE_SCORE.EXACT_BIRTH_DATE,
        );
      } else if (
        birthYear !== null &&
        patient.birthDate.value !== null &&
        patient.birthDate.value.getUTCFullYear() ===
          birthYear
      ) {
        addReason(
          candidate,
          PATIENT_DUPLICATE_REASON.APPROXIMATE_BIRTH_YEAR,
          PATIENT_DUPLICATE_SCORE.APPROXIMATE_BIRTH_YEAR,
        );
      }

      if (
        input.isMinor &&
        candidate.reasons.has(
          PATIENT_DUPLICATE_REASON.SAME_GUARDIAN_CNIC,
        ) &&
        candidate.reasons.has(
          PATIENT_DUPLICATE_REASON.EXACT_NAME,
        ) &&
        (
          candidate.reasons.has(
            PATIENT_DUPLICATE_REASON.EXACT_BIRTH_DATE,
          ) ||
          candidate.reasons.has(
            PATIENT_DUPLICATE_REASON.APPROXIMATE_BIRTH_YEAR,
          )
        )
      ) {
        candidate.score +=
          PATIENT_DUPLICATE_SCORE.MINOR_COMPOSITE_BONUS;
      }
    }

    const candidates:
      PatientDuplicateCandidate[] = [];

    for (const candidate of accumulators.values()) {
      const level =
        levelForScore(
          candidate.score,
        );

      if (
        level ===
        PATIENT_DUPLICATE_MATCH_LEVEL.NONE
      ) {
        continue;
      }

      const patient =
        candidate.crossFacility
          ? undefined
          : localPatientsById.get(
              candidate.patientId,
            );

      const mrn =
        patient === undefined
          ? null
          : await this.identifiers.findPrimaryMrn(
              input.facilityId,
              candidate.patientId,
            );

      candidates.push({
        patientId:
          candidate.crossFacility
            ? null
            : candidate.patientId,
        facilityId:
          candidate.crossFacility
            ? null
            : candidate.facilityId,
        displayName:
          candidate.crossFacility
            ? null
            : patient?.displayName ??
              null,
        mrn:
          candidate.crossFacility
            ? null
            : mrn?.displayValue ??
              null,
        crossFacility:
          candidate.crossFacility,
        score:
          candidate.score,
        level,
        reasons: [
          ...candidate.reasons,
        ].sort(),
      });
    }

    candidates.sort(
      (first, second) =>
        second.score - first.score ||
        Number(second.crossFacility) -
          Number(first.crossFacility),
    );

    const highest =
      highestLevel(candidates);

    return {
      blocked:
        highest ===
        PATIENT_DUPLICATE_MATCH_LEVEL.BLOCK,
      highestLevel:
        highest,
      candidates,
    };
  }
}