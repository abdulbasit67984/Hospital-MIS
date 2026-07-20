import type {
  AdmissionRecommendationStatus,
  AdmissionStatus,
  BedAssignmentStatus,
  BedHoldStatus,
  BedRateStatus,
  InpatientBedStatus,
} from '@hospital-mis/database';

import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class InpatientWardNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient ward was not found');
  }
}

export class InpatientRoomNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient room was not found');
  }
}

export class InpatientBedNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient bed was not found');
  }
}

export class InpatientBedRateNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient bed rate was not found');
  }
}

export class AdmissionRecommendationNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The admission recommendation was not found');
  }
}

export class AdmissionNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient admission was not found');
  }
}

export class BedHoldNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient bed hold was not found');
  }
}

export class BedAssignmentNotFoundError
extends ResourceNotFoundError {
  public constructor() {
    super('The inpatient bed assignment was not found');
  }
}

export class InpatientWardConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The inpatient ward changed before the operation could be completed',
    );
  }
}

export class InpatientRoomConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The inpatient room changed before the operation could be completed',
    );
  }
}

export class InpatientBedConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The inpatient bed changed before the operation could be completed',
    );
  }
}

export class InpatientBedRateConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The inpatient bed rate changed before the operation could be completed',
    );
  }
}

export class AdmissionRecommendationConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The admission recommendation changed before the operation could be completed',
    );
  }
}

export class AdmissionConcurrencyError
extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The inpatient admission changed before the operation could be completed',
    );
  }
}

export class InpatientWardCodeConflictError
extends ConflictError {
  public constructor() {
    super(
      'The ward code is already configured in this facility',
    );
  }
}

export class InpatientWardNameConflictError
extends ConflictError {
  public constructor() {
    super(
      'The ward name is already configured in this facility',
    );
  }
}

export class InpatientRoomCodeConflictError
extends ConflictError {
  public constructor() {
    super(
      'The room code is already configured in this ward',
    );
  }
}

export class InpatientRoomNumberConflictError
extends ConflictError {
  public constructor() {
    super(
      'The room number is already configured in this ward',
    );
  }
}

export class InpatientBedCodeConflictError
extends ConflictError {
  public constructor() {
    super(
      'The bed code is already configured in this facility',
    );
  }
}

export class InpatientBedNumberConflictError
extends ConflictError {
  public constructor() {
    super(
      'The bed number is already configured in this room',
    );
  }
}

export class InpatientBedRateCodeConflictError
extends ConflictError {
  public constructor() {
    super(
      'The bed-rate code is already configured in this facility',
    );
  }
}

export class InpatientBedRateEffectiveFromConflictError
extends ConflictError {
  public constructor() {
    super(
      'A bed rate already starts at this time for the selected scope',
    );
  }
}

export class AdmissionRecommendationNumberConflictError
extends ConflictError {
  public constructor() {
    super(
      'The generated admission-recommendation number is already in use',
    );
  }
}

export class AdmissionNumberConflictError
extends ConflictError {
  public constructor() {
    super(
      'The generated admission number is already in use',
    );
  }
}

export class ActivePatientAdmissionConflictError
extends ConflictError {
  public constructor() {
    super(
      'The patient already has an active inpatient admission in this facility',
    );
  }
}

export class ActiveBedHoldConflictError
extends ConflictError {
  public constructor() {
    super(
      'The selected bed already has an active reservation or hold',
    );
  }
}

export class ActiveBedOccupancyConflictError
extends ConflictError {
  public constructor() {
    super(
      'The selected bed already has an active patient assignment',
    );
  }
}

export class ActiveAdmissionAssignmentConflictError
extends ConflictError {
  public constructor() {
    super(
      'The admission already has an active bed assignment',
    );
  }
}

export class InpatientFacilityBoundaryError
extends ForbiddenError {
  public constructor() {
    super(
      'The requested inpatient record belongs to another facility',
    );
  }
}

export class InpatientMinimumNecessaryAccessError
extends ForbiddenError {
  public constructor() {
    super(
      'Minimum-necessary access to the requested inpatient information could not be established',
    );
  }
}

export class InpatientBreakGlassReasonRequiredError
extends ForbiddenError {
  public constructor() {
    super(
      'Emergency inpatient access requires a documented break-glass reason',
    );
  }
}

export class InpatientStaffAttributionError
extends ForbiddenError {
  public constructor() {
    super(
      'The acting user is not linked to active staff in the selected facility',
    );
  }
}

export class InpatientClinicalContextMismatchError
extends ConflictError {
  public constructor(
    message =
      'The admission patient, encounter, provider, department, registration, OPD visit, or queue linkage is inconsistent',
  ) {
    super(message);
  }
}

export class InpatientEncounterNotEligibleError
extends ConflictError {
  public constructor() {
    super(
      'Admission recommendations require an eligible active clinical encounter',
    );
  }
}

export class InpatientProviderNotAssignedError
extends ConflictError {
  public constructor() {
    super(
      'The recommending provider is not assigned to the clinical encounter',
    );
  }
}

export class InpatientDepartmentUnavailableError
extends ConflictError {
  public constructor() {
    super(
      'The selected inpatient department is inactive or is not clinical',
    );
  }
}

export class InpatientServicePointMismatchError
extends ConflictError {
  public constructor() {
    super(
      'The selected service point does not belong to the inpatient department',
    );
  }
}

export class InpatientLocationHierarchyError
extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class InpatientLocationInUseError
extends ConflictError {
  public constructor(
    resource: 'ward' | 'room' | 'bed',
  ) {
    super(
      `The ${resource} cannot be deactivated while it has active inpatient use`,
    );
  }
}

export class InpatientBedNotAvailableError
extends ConflictError {
  public constructor() {
    super(
      'The selected bed is not active and available for allocation',
    );
  }
}

export class InpatientBedCompatibilityError
extends ConflictError {
  public constructor(
    message: string,
  ) {
    super(message);
  }
}

export class InpatientBedRateOverlapError
extends ConflictError {
  public constructor() {
    super(
      'The proposed bed rate overlaps an active effective period for the same financial scope',
    );
  }
}

export class InpatientBedRateResolutionError
extends ConflictError {
  public constructor() {
    super(
      'No effective bed rate could be resolved for the selected bed and financial context',
    );
  }
}

export class InvalidAdmissionRecommendationTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      AdmissionRecommendationStatus,

    toStatus:
      AdmissionRecommendationStatus,
  ) {
    super(
      `Admission recommendation cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidAdmissionTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      AdmissionStatus,

    toStatus:
      AdmissionStatus,
  ) {
    super(
      `Admission cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidBedStatusTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      InpatientBedStatus,

    toStatus:
      InpatientBedStatus,
  ) {
    super(
      `Bed status cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidBedHoldTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      BedHoldStatus,

    toStatus:
      BedHoldStatus,
  ) {
    super(
      `Bed hold cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidBedAssignmentTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      BedAssignmentStatus,

    toStatus:
      BedAssignmentStatus,
  ) {
    super(
      `Bed assignment cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InvalidBedRateTransitionError
extends ConflictError {
  public constructor(
    fromStatus:
      BedRateStatus,

    toStatus:
      BedRateStatus,
  ) {
    super(
      `Bed rate cannot transition from ${fromStatus} to ${toStatus}`,
    );
  }
}

export class InpatientDirectBillingMutationProhibitedError
extends AppError {
  public constructor() {
    super({
      code:
        'INPATIENT_DIRECT_BILLING_MUTATION_PROHIBITED',

      message:
        'Inpatient workflows must use the unified billing boundary instead of directly changing accounts, invoices, payments, or ledgers',

      statusCode:
        409,
    });
  }
}

export class InpatientDirectInventoryMutationProhibitedError
extends AppError {
  public constructor() {
    super({
      code:
        'INPATIENT_DIRECT_INVENTORY_MUTATION_PROHIBITED',

      message:
        'Inpatient workflows must use the Inventory boundary instead of directly changing stock',

      statusCode:
        409,
    });
  }
}

export type InpatientPersistenceOperation =
  | 'CREATE_WARD'
  | 'UPDATE_WARD'
  | 'CREATE_ROOM'
  | 'UPDATE_ROOM'
  | 'CREATE_BED'
  | 'UPDATE_BED'
  | 'CREATE_BED_RATE'
  | 'UPDATE_BED_RATE'
  | 'CREATE_BED_RATE_VERSION'
  | 'CREATE_RECOMMENDATION'
  | 'UPDATE_RECOMMENDATION'
  | 'CREATE_ADMISSION'
  | 'UPDATE_ADMISSION'
  | 'CREATE_ADMISSION_HISTORY'
  | 'CREATE_BED_HOLD'
  | 'CREATE_BED_ASSIGNMENT';

function duplicateIndexName(
  error: unknown,
): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 11000
  ) {
    return null;
  }

  if (
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const match =
      error.message.match(
        /index:\s+([^\s]+)\s+dup key/iu,
      );

    return match?.[1] ?? null;
  }

  return null;
}

export function throwMappedInpatientPersistenceError(
  error: unknown,
  operation:
    InpatientPersistenceOperation,
): never {
  const indexName =
    duplicateIndexName(error);

  switch (indexName) {
    case 'uq_wards_facility_code':
      throw new InpatientWardCodeConflictError();

    case 'uq_wards_facility_name':
      throw new InpatientWardNameConflictError();

    case 'uq_rooms_ward_code':
      throw new InpatientRoomCodeConflictError();

    case 'uq_rooms_ward_number':
      throw new InpatientRoomNumberConflictError();

    case 'uq_beds_facility_code':
      throw new InpatientBedCodeConflictError();

    case 'uq_beds_room_number':
      throw new InpatientBedNumberConflictError();

    case 'uq_bed_rates_facility_code':
      throw new InpatientBedRateCodeConflictError();

    case 'uq_bed_rates_scope_effective_from':
      throw new InpatientBedRateEffectiveFromConflictError();

    case 'uq_admission_recommendations_facility_number':
      throw new AdmissionRecommendationNumberConflictError();

    case 'uq_admissions_facility_number':
      throw new AdmissionNumberConflictError();

    case 'uq_admissions_active_patient':
      throw new ActivePatientAdmissionConflictError();

    case 'uq_bed_holds_active_bed':
      throw new ActiveBedHoldConflictError();

    case 'uq_admission_bed_assignments_active_bed':
      throw new ActiveBedOccupancyConflictError();

    case 'uq_admission_bed_assignments_active_admission':
      throw new ActiveAdmissionAssignmentConflictError();

    default:
      break;
  }

  switch (operation) {
    case 'UPDATE_WARD':
      throw new InpatientWardConcurrencyError();

    case 'UPDATE_ROOM':
      throw new InpatientRoomConcurrencyError();

    case 'UPDATE_BED':
      throw new InpatientBedConcurrencyError();

    case 'UPDATE_BED_RATE':
      throw new InpatientBedRateConcurrencyError();

    case 'UPDATE_RECOMMENDATION':
      throw new AdmissionRecommendationConcurrencyError();

    case 'UPDATE_ADMISSION':
      throw new AdmissionConcurrencyError();

    default:
      throw error;
  }
}