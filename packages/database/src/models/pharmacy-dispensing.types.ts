export const dispensationContextValues = [
  'OUTPATIENT',
  'INPATIENT',
  'DISCHARGE',
  'EMERGENCY',
  'WARD_SUPPLY',
] as const;

export const dispensationPriorityValues = [
  'ROUTINE',
  'URGENT',
  'STAT',
] as const;

export const dispensationStatusValues = [
  'PENDING_REVIEW',
  'HELD',
  'REJECTED',
  'VERIFIED',
  'PARTIALLY_RESERVED',
  'RESERVED',
  'IN_PROGRESS',
  'PARTIALLY_DISPENSED',
  'COMPLETED',
  'CANCELLED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'REVERSAL_PENDING',
  'REVERSED',
  'ENTERED_IN_ERROR',
  'EXPIRED',
  'RECOVERY_REQUIRED',
] as const;

export const dispensationItemStatusValues = [
  'PENDING_REVIEW',
  'HELD',
  'REJECTED',
  'VERIFIED',
  'PARTIALLY_RESERVED',
  'RESERVED',
  'PARTIALLY_DISPENSED',
  'DISPENSED',
  'CANCELLED',
  'PARTIALLY_RETURNED',
  'RETURNED',
  'REVERSED',
  'ENTERED_IN_ERROR',
] as const;

export const dispensationStatusChangeSourceValues = [
  'PHARMACY',
  'SYSTEM',
  'RECOVERY',
] as const;

export const pharmacyReviewScopeValues = [
  'DISPENSATION',
  'ITEM',
] as const;

export const pharmacyReviewActionValues = [
  'REVIEWED',
  'VERIFIED',
  'HELD',
  'RELEASED',
  'REJECTED',
  'SECOND_CHECK_APPROVED',
  'SECOND_CHECK_REJECTED',
  'CONTROLLED_MEDICINE_AUTHORIZED',
] as const;

export const pharmacyReviewOutcomeValues = [
  'PASS',
  'PASS_WITH_WARNINGS',
  'BLOCKED',
  'REJECTED',
] as const;

export const pharmacySafetyAlertTypeValues = [
  'ALLERGY',
  'INTERACTION',
  'DUPLICATE_THERAPY',
  'CONTRAINDICATION',
  'DOSE_RANGE',
  'ROUTE',
  'FREQUENCY',
  'AGE',
  'WEIGHT',
  'PREGNANCY',
  'RENAL',
  'HEPATIC',
  'CONTROLLED_MEDICINE',
  'HIGH_ALERT',
  'COLD_CHAIN',
  'PRESCRIPTION_STATE',
  'STOCK_ELIGIBILITY',
  'OTHER',
] as const;

export const pharmacySafetyAlertSeverityValues = [
  'INFO',
  'LOW',
  'MODERATE',
  'HIGH',
  'CONTRAINDICATED',
] as const;

export const pharmacySafetyAlertDispositionValues = [
  'OPEN',
  'ACKNOWLEDGED',
  'OVERRIDDEN',
  'RESOLVED',
  'BLOCKING',
] as const;

export const pharmacySpecialHandlingValues = [
  'STANDARD',
  'CONTROLLED',
  'NARCOTIC',
  'HIGH_ALERT',
  'REFRIGERATED',
  'FROZEN',
  'PROTECT_FROM_LIGHT',
  'HAZARDOUS',
  'CYTOTOXIC',
  'LOOK_ALIKE_SOUND_ALIKE',
] as const;

export const dispensationAllocationStatusValues = [
  'RESERVED',
  'CONSUMED',
  'RELEASED',
  'RETURNED',
  'REVERSED',
] as const;

export const dispensationSubstitutionTypeValues = [
  'BRAND',
  'GENERIC',
  'STRENGTH',
  'DOSAGE_FORM',
  'PACK_SIZE',
] as const;

export const dispensationSubstitutionStatusValues = [
  'PROPOSED',
  'AUTHORIZED',
  'REJECTED',
  'APPLIED',
  'CANCELLED',
] as const;

export const pharmacyFinalizationStateValues = [
  'NOT_STARTED',
  'PENDING',
  'COMPLETED',
  'RECOVERY_REQUIRED',
  'COMPENSATION_REQUIRED',
] as const;

export const dispensingLabelStatusValues = [
  'DRAFT',
  'GENERATED',
  'PRINTED',
  'VOID',
] as const;

export const dispensingLabelPrintReasonValues = [
  'INITIAL',
  'REPRINT',
  'CORRECTION',
] as const;

export const pharmacyCounsellingStatusValues = [
  'NOT_REQUIRED',
  'PENDING',
  'COMPLETED',
  'DECLINED',
  'UNABLE',
] as const;

export const pharmacyAcknowledgementMethodValues = [
  'VERBAL',
  'SIGNATURE',
  'DIGITAL',
  'CAREGIVER',
  'NOT_OBTAINED',
] as const;

export const patientReturnStatusValues = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'PARTIALLY_POSTED',
  'POSTED',
  'CANCELLED',
  'REVERSED',
] as const;

export const patientReturnItemStatusValues = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'REVERSED',
] as const;

export const returnedMedicineSealStatusValues = [
  'SEALED',
  'OPENED',
  'DAMAGED',
  'UNKNOWN',
] as const;

export const returnedMedicineIntegrityValues = [
  'CONFIRMED',
  'NOT_CONFIRMED',
  'COMPROMISED',
  'NOT_APPLICABLE',
] as const;

export const patientReturnDispositionValues = [
  'RESTOCK_AVAILABLE',
  'QUARANTINE',
  'DAMAGED',
  'DESTRUCTION',
  'CONTROLLED_MEDICINE_HOLD',
  'NOT_ACCEPTED',
] as const;

export const dispensationReversalStatusValues = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'FAILED',
  'CANCELLED',
] as const;

export const controlledMedicineEntryTypeValues = [
  'DISPENSE',
  'PATIENT_RETURN',
  'WARD_RETURN',
  'REVERSAL',
  'BALANCE_VERIFICATION',
  'DISCREPANCY',
] as const;

export const controlledMedicineDirectionValues = [
  'IN',
  'OUT',
  'NEUTRAL',
] as const;

export const controlledMedicineDiscrepancyStatusValues = [
  'NONE',
  'OPEN',
  'ESCALATED',
  'RESOLVED',
] as const;

export const controlledMedicineWitnessMethodValues = [
  'IN_PERSON',
  'BADGE_SCAN',
  'DIGITAL_SIGNATURE',
] as const;

export type DispensationContext =
  (typeof dispensationContextValues)[number];
export type DispensationPriority =
  (typeof dispensationPriorityValues)[number];
export type DispensationStatus =
  (typeof dispensationStatusValues)[number];
export type DispensationItemStatus =
  (typeof dispensationItemStatusValues)[number];
export type DispensationStatusChangeSource =
  (typeof dispensationStatusChangeSourceValues)[number];
export type PharmacyReviewScope =
  (typeof pharmacyReviewScopeValues)[number];
export type PharmacyReviewAction =
  (typeof pharmacyReviewActionValues)[number];
export type PharmacyReviewOutcome =
  (typeof pharmacyReviewOutcomeValues)[number];
export type PharmacySafetyAlertType =
  (typeof pharmacySafetyAlertTypeValues)[number];
export type PharmacySafetyAlertSeverity =
  (typeof pharmacySafetyAlertSeverityValues)[number];
export type PharmacySafetyAlertDisposition =
  (typeof pharmacySafetyAlertDispositionValues)[number];
export type PharmacySpecialHandling =
  (typeof pharmacySpecialHandlingValues)[number];
export type DispensationAllocationStatus =
  (typeof dispensationAllocationStatusValues)[number];
export type DispensationSubstitutionType =
  (typeof dispensationSubstitutionTypeValues)[number];
export type DispensationSubstitutionStatus =
  (typeof dispensationSubstitutionStatusValues)[number];
export type PharmacyFinalizationState =
  (typeof pharmacyFinalizationStateValues)[number];
export type DispensingLabelStatus =
  (typeof dispensingLabelStatusValues)[number];
export type DispensingLabelPrintReason =
  (typeof dispensingLabelPrintReasonValues)[number];
export type PharmacyCounsellingStatus =
  (typeof pharmacyCounsellingStatusValues)[number];
export type PharmacyAcknowledgementMethod =
  (typeof pharmacyAcknowledgementMethodValues)[number];
export type PatientReturnStatus =
  (typeof patientReturnStatusValues)[number];
export type PatientReturnItemStatus =
  (typeof patientReturnItemStatusValues)[number];
export type ReturnedMedicineSealStatus =
  (typeof returnedMedicineSealStatusValues)[number];
export type ReturnedMedicineIntegrity =
  (typeof returnedMedicineIntegrityValues)[number];
export type PatientReturnDisposition =
  (typeof patientReturnDispositionValues)[number];
export type DispensationReversalStatus =
  (typeof dispensationReversalStatusValues)[number];
export type ControlledMedicineEntryType =
  (typeof controlledMedicineEntryTypeValues)[number];
export type ControlledMedicineDirection =
  (typeof controlledMedicineDirectionValues)[number];
export type ControlledMedicineDiscrepancyStatus =
  (typeof controlledMedicineDiscrepancyStatusValues)[number];
export type ControlledMedicineWitnessMethod =
  (typeof controlledMedicineWitnessMethodValues)[number];