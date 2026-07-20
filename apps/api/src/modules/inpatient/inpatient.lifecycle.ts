import type {
  AdmissionRecommendationStatus,
  AdmissionStatus,
  BedAssignmentStatus,
  BedHoldStatus,
  BedRateStatus,
  InpatientBedStatus,
} from '@hospital-mis/database';

import {
  ADMISSION_RECOMMENDATION_TRANSITIONS,
  ADMISSION_TRANSITIONS,
  BED_ASSIGNMENT_TRANSITIONS,
  BED_HOLD_TRANSITIONS,
  BED_RATE_TRANSITIONS,
  BED_STATUS_TRANSITIONS,
} from './inpatient.constants.js';

import {
  InpatientBedCompatibilityError,
  InpatientBedNotAvailableError,
  InvalidAdmissionRecommendationTransitionError,
  InvalidAdmissionTransitionError,
  InvalidBedAssignmentTransitionError,
  InvalidBedHoldTransitionError,
  InvalidBedRateTransitionError,
  InvalidBedStatusTransitionError,
} from './inpatient.errors.js';

import type {
  BedRecord,
  RoomRecord,
  WardRecord,
} from './inpatient.persistence.types.js';

import type {
  InpatientBedCompatibilityResult,
  InpatientBedCompatibilitySubject,
  InpatientBedCompatibilityTarget,
} from './inpatient.types.js';

export function canTransitionAdmissionRecommendation(
  fromStatus:
    AdmissionRecommendationStatus,

  toStatus:
    AdmissionRecommendationStatus,
): boolean {
  const transitions:
    readonly AdmissionRecommendationStatus[] =
      ADMISSION_RECOMMENDATION_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertAdmissionRecommendationTransition(
  fromStatus:
    AdmissionRecommendationStatus,

  toStatus:
    AdmissionRecommendationStatus,
): void {
  if (
    !canTransitionAdmissionRecommendation(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidAdmissionRecommendationTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionAdmission(
  fromStatus:
    AdmissionStatus,

  toStatus:
    AdmissionStatus,
): boolean {
  const transitions:
    readonly AdmissionStatus[] =
      ADMISSION_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertAdmissionTransition(
  fromStatus:
    AdmissionStatus,

  toStatus:
    AdmissionStatus,
): void {
  if (
    !canTransitionAdmission(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidAdmissionTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionBedStatus(
  fromStatus:
    InpatientBedStatus,

  toStatus:
    InpatientBedStatus,
): boolean {
  const transitions:
    readonly InpatientBedStatus[] =
      BED_STATUS_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertBedStatusTransition(
  fromStatus:
    InpatientBedStatus,

  toStatus:
    InpatientBedStatus,
): void {
  if (
    !canTransitionBedStatus(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidBedStatusTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionBedHold(
  fromStatus:
    BedHoldStatus,

  toStatus:
    BedHoldStatus,
): boolean {
  const transitions:
    readonly BedHoldStatus[] =
      BED_HOLD_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertBedHoldTransition(
  fromStatus:
    BedHoldStatus,

  toStatus:
    BedHoldStatus,
): void {
  if (
    !canTransitionBedHold(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidBedHoldTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionBedAssignment(
  fromStatus:
    BedAssignmentStatus,

  toStatus:
    BedAssignmentStatus,
): boolean {
  const transitions:
    readonly BedAssignmentStatus[] =
      BED_ASSIGNMENT_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertBedAssignmentTransition(
  fromStatus:
    BedAssignmentStatus,

  toStatus:
    BedAssignmentStatus,
): void {
  if (
    !canTransitionBedAssignment(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidBedAssignmentTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

export function canTransitionBedRate(
  fromStatus:
    BedRateStatus,

  toStatus:
    BedRateStatus,
): boolean {
  const transitions:
    readonly BedRateStatus[] =
      BED_RATE_TRANSITIONS[
        fromStatus
      ];

  return transitions.includes(
    toStatus,
  );
}

export function assertBedRateTransition(
  fromStatus:
    BedRateStatus,

  toStatus:
    BedRateStatus,
): void {
  if (
    !canTransitionBedRate(
      fromStatus,
      toStatus,
    )
  ) {
    throw new InvalidBedRateTransitionError(
      fromStatus,
      toStatus,
    );
  }
}

function normalizedSet(
  values:
    readonly string[],
): Set<string> {
  return new Set(
    values.map(
      (value) =>
        value
          .trim()
          .toUpperCase(),
    ),
  );
}

export function evaluateInpatientBedCompatibility(
  subject:
    InpatientBedCompatibilitySubject,

  target:
    InpatientBedCompatibilityTarget,
): InpatientBedCompatibilityResult {
  const reasons:
    string[] = [];

  if (
    !target.permittedSexes.includes(
      subject.patientSex,
    )
  ) {
    reasons.push(
      'Patient sex is not permitted by the inpatient location',
    );
  }

  if (
    subject.ageYears !== null &&
    target.minimumAgeYears !== null &&
    subject.ageYears <
      target.minimumAgeYears
  ) {
    reasons.push(
      'Patient age is below the inpatient location minimum',
    );
  }

  if (
    subject.ageYears !== null &&
    target.maximumAgeYears !== null &&
    subject.ageYears >
      target.maximumAgeYears
  ) {
    reasons.push(
      'Patient age is above the inpatient location maximum',
    );
  }

  const targetSpecialties =
    normalizedSet(
      target.specialtyCodes,
    );

  const requestedSpecialties =
    normalizedSet(
      subject.specialtyCodes,
    );

  if (
    targetSpecialties.size > 0 &&
    requestedSpecialties.size > 0 &&
    ![
      ...requestedSpecialties,
    ].some(
      (code) =>
        targetSpecialties.has(
          code,
        ),
    )
  ) {
    reasons.push(
      'The inpatient location does not support the requested specialty',
    );
  }

  const targetIsolation =
    normalizedSet(
      target.isolationCapabilities,
    );

  for (
    const requiredCapability of
    subject
      .requiredIsolationCapabilities
  ) {
    if (
      !targetIsolation.has(
        requiredCapability.toUpperCase(),
      )
    ) {
      reasons.push(
        `The inpatient location does not provide required isolation capability ${requiredCapability}`,
      );
    }
  }

  if (
    subject
      .requiredIsolationCapabilities
      .includes(
        'NEGATIVE_PRESSURE',
      ) &&
    !target
      .negativePressureCapable
  ) {
    reasons.push(
      'The inpatient location is not negative-pressure capable',
    );
  }

  const targetInfectionTags =
    normalizedSet(
      target.infectionControlTags,
    );

  for (
    const requiredTag of
    subject.infectionControlTags
  ) {
    if (
      targetInfectionTags.size > 0 &&
      !targetInfectionTags.has(
        requiredTag
          .trim()
          .toUpperCase(),
      )
    ) {
      reasons.push(
        `The inpatient location does not support infection-control tag ${requiredTag}`,
      );
    }
  }

  if (
    !target.cohortingAllowed &&
    subject
      .infectionControlTags
      .length > 0
  ) {
    reasons.push(
      'The inpatient location does not permit cohort placement',
    );
  }

  return {
    compatible:
      reasons.length === 0,

    reasons,
  };
}

export function assertInpatientBedCompatibility(
  subject:
    InpatientBedCompatibilitySubject,

  ...targets:
    readonly InpatientBedCompatibilityTarget[]
): void {
  for (
    const target of targets
  ) {
    const result =
      evaluateInpatientBedCompatibility(
        subject,
        target,
      );

    if (
      !result.compatible
    ) {
      throw new InpatientBedCompatibilityError(
        result.reasons.join(
          '; ',
        ),
      );
    }
  }
}

export function assertInpatientBedAllocatable(
  ward:
    Pick<
      WardRecord,
      'status'
    >,

  room:
    Pick<
      RoomRecord,
      'status'
    >,

  bed:
    Pick<
      BedRecord,
      | 'status'
      | 'operationalStatus'
      | 'currentAdmissionId'
      | 'currentAssignmentId'
      | 'currentPatientId'
      | 'activeHoldId'
    >,

  allowActiveHold =
    false,
): void {
  const holdAllowed =
    allowActiveHold &&
    bed.operationalStatus ===
      'RESERVED' &&
    bed.activeHoldId !== null;

  if (
    ward.status !== 'ACTIVE' ||
    room.status !== 'ACTIVE' ||
    bed.status !== 'ACTIVE' ||
    (
      bed.operationalStatus !==
        'AVAILABLE' &&
      !holdAllowed
    ) ||
    bed.currentAdmissionId !==
      null ||
    bed.currentAssignmentId !==
      null ||
    bed.currentPatientId !==
      null ||
    (
      !allowActiveHold &&
      bed.activeHoldId !== null
    )
  ) {
    throw new InpatientBedNotAvailableError();
  }
}