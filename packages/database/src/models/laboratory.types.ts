export const laboratoryCatalogStatusValues = [
  'ACTIVE',
  'INACTIVE',
] as const;

export const laboratoryOrderPriorityValues = [
  'ROUTINE',
  'URGENT',
  'STAT',
] as const;

export const laboratoryOrderStatusValues = [
  'ORDERED',
  'ACCEPTED',
  'PARTIALLY_COLLECTED',
  'SAMPLE_COLLECTED',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'VERIFIED',
  'RECOLLECTION_REQUIRED',
  'CANCELLED',
] as const;

export const laboratoryOrderItemStatusValues = [
  'ORDERED',
  'ACCEPTED',
  'COLLECTION_PENDING',
  'SPECIMEN_COLLECTED',
  'SPECIMEN_RECEIVED',
  'IN_PROGRESS',
  'RESULT_ENTERED',
  'COMPLETED',
  'VERIFIED',
  'REJECTED',
  'RECOLLECTION_REQUIRED',
  'CANCELLED',
] as const;

export const laboratoryOrderStatusChangeSourceValues = [
  'ORDERING_PROVIDER',
  'LABORATORY_STAFF',
  'SYSTEM',
  'RECOVERY',
] as const;

export const laboratorySpecimenStatusValues = [
  'PLANNED',
  'LABEL_PRINTED',
  'COLLECTED',
  'RECEIVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'RECOLLECTION_REQUIRED',
  'CANCELLED',
] as const;

export const laboratorySpecimenStatusChangeSourceValues = [
  'COLLECTOR',
  'LABORATORY_STAFF',
  'SYSTEM',
  'RECOVERY',
] as const;

export const laboratorySpecimenCollectionMethodValues = [
  'VENIPUNCTURE',
  'CAPILLARY',
  'SWAB',
  'URINE_COLLECTION',
  'STOOL_COLLECTION',
  'ASPIRATE',
  'BIOPSY',
  'OTHER',
] as const;

export const laboratoryResultValueTypeValues = [
  'NUMERIC',
  'TEXT',
  'CODED',
  'QUALITATIVE',
  'STRUCTURED',
] as const;

export const laboratoryResultFlagValues = [
  'NORMAL',
  'ABNORMAL',
  'HIGH',
  'LOW',
  'CRITICAL',
  'CRITICAL_HIGH',
  'CRITICAL_LOW',
  'INDETERMINATE',
  'NOT_APPLICABLE',
] as const;

export const laboratoryResultStatusValues = [
  'DRAFT',
  'ENTERED',
  'VALIDATED',
  'VERIFIED',
  'CORRECTED',
  'CANCELLED',
] as const;

export const laboratoryResultVersionChangeTypeValues = [
  'INITIAL_VERIFICATION',
  'CORRECTION',
  'CANCELLATION',
  'RECOVERY',
] as const;

export const laboratoryResultPublicationStatusValues = [
  'NOT_PUBLISHED',
  'PUBLISHED',
  'WITHDRAWN',
] as const;

export const laboratoryCriticalCommunicationTypeValues = [
  'NOTIFICATION_ATTEMPT',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'ESCALATED',
  'FAILED',
] as const;

export const laboratoryCommunicationChannelValues = [
  'IN_PERSON',
  'PHONE',
  'SMS',
  'EMAIL',
  'SYSTEM',
  'OTHER',
] as const;

export const laboratoryCommunicationRecipientTypeValues = [
  'ORDERING_PROVIDER',
  'ON_CALL_PROVIDER',
  'NURSE',
  'PATIENT',
  'GUARDIAN',
  'OTHER',
] as const;

export const laboratoryBillingStatusValues = [
  'NOT_REQUESTED',
  'PENDING',
  'CHARGED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'FAILED',
] as const;

export const laboratoryReferenceSexValues = [
  'ANY',
  'MALE',
  'FEMALE',
  'INTERSEX',
  'UNKNOWN',
] as const;

export const laboratoryReferenceRangeKindValues = [
  'NUMERIC_INTERVAL',
  'TEXTUAL',
  'CODED_SET',
] as const;

export type LaboratoryCatalogStatus =
  (typeof laboratoryCatalogStatusValues)[number];

export type LaboratoryOrderPriority =
  (typeof laboratoryOrderPriorityValues)[number];

export type LaboratoryOrderStatus =
  (typeof laboratoryOrderStatusValues)[number];

export type LaboratoryOrderItemStatus =
  (typeof laboratoryOrderItemStatusValues)[number];

export type LaboratoryOrderStatusChangeSource =
  (typeof laboratoryOrderStatusChangeSourceValues)[number];

export type LaboratorySpecimenStatus =
  (typeof laboratorySpecimenStatusValues)[number];

export type LaboratorySpecimenStatusChangeSource =
  (typeof laboratorySpecimenStatusChangeSourceValues)[number];

export type LaboratorySpecimenCollectionMethod =
  (typeof laboratorySpecimenCollectionMethodValues)[number];

export type LaboratoryResultValueType =
  (typeof laboratoryResultValueTypeValues)[number];

export type LaboratoryResultFlag =
  (typeof laboratoryResultFlagValues)[number];

export type LaboratoryResultStatus =
  (typeof laboratoryResultStatusValues)[number];

export type LaboratoryResultVersionChangeType =
  (typeof laboratoryResultVersionChangeTypeValues)[number];

export type LaboratoryResultPublicationStatus =
  (typeof laboratoryResultPublicationStatusValues)[number];

export type LaboratoryCriticalCommunicationType =
  (typeof laboratoryCriticalCommunicationTypeValues)[number];

export type LaboratoryCommunicationChannel =
  (typeof laboratoryCommunicationChannelValues)[number];

export type LaboratoryCommunicationRecipientType =
  (typeof laboratoryCommunicationRecipientTypeValues)[number];

export type LaboratoryBillingStatus =
  (typeof laboratoryBillingStatusValues)[number];

export type LaboratoryReferenceSex =
  (typeof laboratoryReferenceSexValues)[number];

export type LaboratoryReferenceRangeKind =
  (typeof laboratoryReferenceRangeKindValues)[number];