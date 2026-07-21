import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type CollectionRetention,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  ControlledMedicineRegisterEntryModel,
} from '../models/pharmacy-controlled-medicine.model.js';

import {
  DispensationItemModel,
  DispensationModel,
  DispensationStatusHistoryModel,
  DispensationSubstitutionModel,
  PharmacyReviewEventModel,
} from '../models/pharmacy-dispensation.model.js';

import {
  DispensingLabelModel,
  DispensingLabelPrintModel,
  PharmacyCounsellingRecordModel,
} from '../models/pharmacy-label-counselling.model.js';

import {
  DispensationReversalModel,
  PatientReturnItemModel,
  PatientReturnModel,
} from '../models/pharmacy-return-reversal.model.js';

import {
  controlledMedicineDirectionValues,
  controlledMedicineDiscrepancyStatusValues,
  controlledMedicineEntryTypeValues,
  dispensationContextValues,
  dispensationItemStatusValues,
  dispensationPriorityValues,
  dispensationReversalStatusValues,
  dispensationStatusChangeSourceValues,
  dispensationStatusValues,
  dispensationSubstitutionStatusValues,
  dispensationSubstitutionTypeValues,
  dispensingLabelPrintReasonValues,
  dispensingLabelStatusValues,
  patientReturnDispositionValues,
  patientReturnItemStatusValues,
  patientReturnStatusValues,
  pharmacyCounsellingStatusValues,
  pharmacyFinalizationStateValues,
  pharmacyReviewActionValues,
  pharmacyReviewOutcomeValues,
  pharmacyReviewScopeValues,
  returnedMedicineIntegrityValues,
  returnedMedicineSealStatusValues,
} from '../models/pharmacy-dispensing.types.js';

import type {
  Migration,
} from './types.js';

export const pharmacyDispensingFoundationCollections = [
  'dispensations',
  'dispensationItems',
  'dispensationStatusHistories',
  'pharmacyReviewEvents',
  'dispensationSubstitutions',
  'controlledMedicineRegisterEntries',
  'dispensingLabels',
  'dispensingLabelPrints',
  'pharmacyCounsellingRecords',
  'dispensationReversals',
  'patientReturns',
  'patientReturnItems',
] as const satisfies readonly HospitalCollectionName[];

type PharmacyDispensingCollection =
  (typeof pharmacyDispensingFoundationCollections)[number];

const objectId = {
  bsonType: 'objectId',
} as const;
const nullableObjectId = {
  bsonType: ['objectId', 'null'],
} as const;
const string = {
  bsonType: 'string',
} as const;
const nullableString = {
  bsonType: ['string', 'null'],
} as const;
const date = {
  bsonType: 'date',
} as const;
const nullableDate = {
  bsonType: ['date', 'null'],
} as const;
const number = {
  bsonType: 'number',
} as const;
const boolean = {
  bsonType: 'bool',
} as const;
const decimal = {
  bsonType: 'decimal',
} as const;
const objectIdArray = {
  bsonType: 'array',
  items: objectId,
} as const;
const stringArray = {
  bsonType: 'array',
  items: string,
} as const;

const commonProperties = {
  facilityId: objectId,
  transactionId: string,
  correlationId: string,
  schemaVersion: {
    ...number,
    minimum: 1,
  },
  version: {
    ...number,
    minimum: 0,
  },
  createdBy: objectId,
  updatedBy: objectId,
  createdAt: date,
  updatedAt: date,
} as const;

const commonRequired = [
  'facilityId',
  'transactionId',
  'correlationId',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
] as const;

function validator(
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        ...commonRequired,
        ...required,
      ],
      properties: {
        _id: objectId,
        ...commonProperties,
        ...properties,
      },
    },
  };
}

const moneyProperties = {
  grossAmount: decimal,
  discountAmount: decimal,
  taxAmount: decimal,
  netAmount: decimal,
} as const;

export const pharmacyDispensingFoundationValidators:
Readonly<
  Record<
    PharmacyDispensingCollection,
    Record<string, unknown>
  >
> = {
  dispensations: validator(
    [
      'dispensationNumber',
      'creationOperationKey',
      'prescriptionId',
      'prescriptionNumberSnapshot',
      'prescriptionRevisionNumber',
      'prescriptionVersion',
      'patientId',
      'requestedPatientId',
      'prescriberProviderId',
      'pharmacyLocationId',
      'sourceStockLocationId',
      'context',
      'priority',
      'status',
      'lineCount',
      'verifiedLineCount',
      'completedLineCount',
      'controlledMedicine',
      'highAlertMedicine',
      'secondCheckRequired',
      'witnessRequired',
      'queuedAt',
      'expiresAt',
      'currency',
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'netAmount',
      'finalizationState',
      'finalizationAttemptCount',
      'attachmentIds',
    ],
    {
      dispensationNumber: string,
      creationOperationKey: string,
      prescriptionId: objectId,
      prescriptionNumberSnapshot: string,
      prescriptionRevisionNumber: number,
      prescriptionVersion: number,
      patientId: objectId,
      requestedPatientId: objectId,
      encounterId: nullableObjectId,
      registrationId: nullableObjectId,
      opdVisitId: nullableObjectId,
      admissionId: nullableObjectId,
      wardId: nullableObjectId,
      departmentId: nullableObjectId,
      servicePointId: nullableObjectId,
      prescriberProviderId: objectId,
      pharmacyLocationId: objectId,
      sourceStockLocationId: objectId,
      context: {
        ...string,
        enum: [...dispensationContextValues],
      },
      priority: {
        ...string,
        enum: [...dispensationPriorityValues],
      },
      status: {
        ...string,
        enum: [...dispensationStatusValues],
      },
      lineCount: number,
      verifiedLineCount: number,
      completedLineCount: number,
      controlledMedicine: boolean,
      highAlertMedicine: boolean,
      secondCheckRequired: boolean,
      witnessRequired: boolean,
      stockReservationId: nullableObjectId,
      queuedAt: date,
      reviewStartedAt: nullableDate,
      verifiedAt: nullableDate,
      verifiedByStaffId: nullableObjectId,
      secondCheckedAt: nullableDate,
      secondCheckedByStaffId: nullableObjectId,
      firstDispensedAt: nullableDate,
      completedAt: nullableDate,
      dispensedByStaffId: nullableObjectId,
      heldAt: nullableDate,
      heldByStaffId: nullableObjectId,
      holdReason: nullableString,
      rejectedAt: nullableDate,
      rejectedByStaffId: nullableObjectId,
      rejectionReason: nullableString,
      cancelledAt: nullableDate,
      cancelledByStaffId: nullableObjectId,
      cancellationReason: nullableString,
      enteredInErrorAt: nullableDate,
      enteredInErrorByStaffId: nullableObjectId,
      enteredInErrorReason: nullableString,
      expiredAt: nullableDate,
      expiresAt: date,
      currency: string,
      ...moneyProperties,
      billingOperationKey: nullableString,
      billingSourceRecordId: nullableObjectId,
      finalizationState: {
        ...string,
        enum: [...pharmacyFinalizationStateValues],
      },
      finalizationAttemptCount: number,
      finalizationUpdatedAt: nullableDate,
      recoveryReason: nullableString,
      lastFailureCode: nullableString,
      attachmentIds: objectIdArray,
    },
  ),

  dispensationItems: validator(
    [
      'dispensationId',
      'prescriptionId',
      'prescriptionItemId',
      'patientId',
      'lineNumber',
      'prescribedFormularyItemId',
      'prescribedMedicineId',
      'prescribedMedicineFormId',
      'prescribedMedicineStrengthId',
      'prescribedRouteId',
      'prescribedFrequencyId',
      'prescribedMedicineSnapshot',
      'prescribedStrengthSnapshot',
      'prescribedFormSnapshot',
      'prescribedRouteSnapshot',
      'prescribedFrequencySnapshot',
      'prescribedQuantity',
      'prescribedQuantityUnitId',
      'requestedQuantity',
      'approvedQuantity',
      'reservedQuantity',
      'dispensedQuantity',
      'returnedQuantity',
      'reversedQuantity',
      'substitutionApplied',
      'quantityRoundingApplied',
      'specialHandling',
      'controlledMedicine',
      'highAlertMedicine',
      'safetyAlerts',
      'blockingAlertCount',
      'allocations',
      'unitSellingPrice',
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'netAmount',
      'priceOverrideApplied',
      'status',
    ],
    {
      dispensationId: objectId,
      prescriptionId: objectId,
      prescriptionItemId: objectId,
      patientId: objectId,
      lineNumber: number,
      prescribedFormularyItemId: objectId,
      prescribedMedicineId: objectId,
      prescribedMedicineFormId: objectId,
      prescribedMedicineStrengthId: objectId,
      prescribedRouteId: objectId,
      prescribedFrequencyId: objectId,
      prescribedMedicineSnapshot: string,
      prescribedStrengthSnapshot: string,
      prescribedFormSnapshot: string,
      prescribedRouteSnapshot: string,
      prescribedFrequencySnapshot: string,
      prescribedInstructionsSnapshot: nullableString,
      prescribedQuantity: decimal,
      prescribedQuantityUnitId: objectId,
      requestedQuantity: decimal,
      approvedQuantity: decimal,
      reservedQuantity: decimal,
      dispensedQuantity: decimal,
      returnedQuantity: decimal,
      reversedQuantity: decimal,
      dispensedQuantityUnitId: nullableObjectId,
      actualFormularyItemId: nullableObjectId,
      actualMedicineId: nullableObjectId,
      actualMedicineFormId: nullableObjectId,
      actualMedicineStrengthId: nullableObjectId,
      actualInventoryItemId: nullableObjectId,
      actualMedicineSnapshot: nullableString,
      actualStrengthSnapshot: nullableString,
      actualFormSnapshot: nullableString,
      substitutionId: nullableObjectId,
      substitutionApplied: boolean,
      quantityRoundingApplied: boolean,
      quantityRoundingReason: nullableString,
      specialHandling: stringArray,
      controlledMedicine: boolean,
      highAlertMedicine: boolean,
      safetyAlerts: {
        bsonType: 'array',
      },
      blockingAlertCount: number,
      allocations: {
        bsonType: 'array',
      },
      unitSellingPrice: decimal,
      ...moneyProperties,
      pricingSource: nullableString,
      priceOverrideApplied: boolean,
      priceOverrideReason: nullableString,
      priceOverrideApprovedByStaffId: nullableObjectId,
      status: {
        ...string,
        enum: [...dispensationItemStatusValues],
      },
      verifiedByStaffId: nullableObjectId,
      verifiedAt: nullableDate,
      dispensedByStaffId: nullableObjectId,
      dispensedAt: nullableDate,
      holdReason: nullableString,
      rejectionReason: nullableString,
    },
  ),

  dispensationStatusHistories: validator(
    [
      'dispensationId',
      'patientId',
      'sequence',
      'toStatus',
      'changeSource',
      'actorStaffId',
      'snapshotHash',
      'occurredAt',
    ],
    {
      dispensationId: objectId,
      dispensationItemId: nullableObjectId,
      patientId: objectId,
      sequence: number,
      fromStatus: nullableString,
      toStatus: string,
      changeSource: {
        ...string,
        enum: [...dispensationStatusChangeSourceValues],
      },
      actorStaffId: objectId,
      reason: nullableString,
      snapshotHash: string,
      occurredAt: date,
    },
  ),

  pharmacyReviewEvents: validator(
    [
      'dispensationId',
      'prescriptionId',
      'patientId',
      'scope',
      'action',
      'outcome',
      'reviewerStaffId',
      'safetyAlerts',
      'blockingAlertCount',
      'occurredAt',
    ],
    {
      dispensationId: objectId,
      dispensationItemId: nullableObjectId,
      prescriptionId: objectId,
      patientId: objectId,
      scope: {
        ...string,
        enum: [...pharmacyReviewScopeValues],
      },
      action: {
        ...string,
        enum: [...pharmacyReviewActionValues],
      },
      outcome: {
        ...string,
        enum: [...pharmacyReviewOutcomeValues],
      },
      reviewerStaffId: objectId,
      checkerStaffId: nullableObjectId,
      reason: nullableString,
      safetyAlerts: {
        bsonType: 'array',
      },
      blockingAlertCount: number,
      occurredAt: date,
    },
  ),

  dispensationSubstitutions: validator(
    [
      'dispensationId',
      'dispensationItemId',
      'prescriptionItemId',
      'substitutionType',
      'status',
      'prescribedFormularyItemId',
      'prescribedMedicineId',
      'proposedFormularyItemId',
      'proposedMedicineId',
      'proposedInventoryItemId',
      'prescribedSnapshot',
      'proposedSnapshot',
      'prescriberAuthorizationRequired',
      'proposedByStaffId',
      'proposedAt',
      'reason',
    ],
    {
      dispensationId: objectId,
      dispensationItemId: objectId,
      prescriptionItemId: objectId,
      substitutionType: {
        ...string,
        enum: [...dispensationSubstitutionTypeValues],
      },
      status: {
        ...string,
        enum: [...dispensationSubstitutionStatusValues],
      },
      prescribedFormularyItemId: objectId,
      prescribedMedicineId: objectId,
      proposedFormularyItemId: objectId,
      proposedMedicineId: objectId,
      proposedInventoryItemId: objectId,
      prescribedSnapshot: string,
      proposedSnapshot: string,
      formularyRuleId: nullableObjectId,
      prescriberAuthorizationRequired: boolean,
      prescriberAuthorizedByProviderId: nullableObjectId,
      prescriberAuthorizedAt: nullableDate,
      proposedByStaffId: objectId,
      proposedAt: date,
      authorizedByStaffId: nullableObjectId,
      authorizedAt: nullableDate,
      rejectedByStaffId: nullableObjectId,
      rejectedAt: nullableDate,
      appliedAt: nullableDate,
      reason: string,
      decisionReason: nullableString,
    },
  ),

  controlledMedicineRegisterEntries: validator(
    [
      'registerNumber',
      'registerSequence',
      'operationKey',
      'entryType',
      'direction',
      'pharmacyLocationId',
      'stockLocationId',
      'pharmacistStaffId',
      'witnessRequired',
      'formularyItemId',
      'medicineId',
      'inventoryItemId',
      'stockUnitId',
      'quantity',
      'openingBalance',
      'closingBalance',
      'discrepancyStatus',
      'occurredAt',
    ],
    {
      registerNumber: string,
      registerSequence: number,
      operationKey: string,
      entryType: {
        ...string,
        enum: [...controlledMedicineEntryTypeValues],
      },
      direction: {
        ...string,
        enum: [...controlledMedicineDirectionValues],
      },
      pharmacyLocationId: objectId,
      stockLocationId: objectId,
      patientId: nullableObjectId,
      prescriptionId: nullableObjectId,
      prescriptionItemId: nullableObjectId,
      dispensationId: nullableObjectId,
      dispensationItemId: nullableObjectId,
      patientReturnId: nullableObjectId,
      reversalId: nullableObjectId,
      prescriberProviderId: nullableObjectId,
      pharmacistStaffId: objectId,
      witnessRequired: boolean,
      witnessStaffId: nullableObjectId,
      witnessMethod: nullableString,
      witnessedAt: nullableDate,
      formularyItemId: objectId,
      medicineId: objectId,
      inventoryItemId: objectId,
      inventoryBatchId: nullableObjectId,
      batchNumberSnapshot: nullableString,
      expiryDateSnapshot: nullableDate,
      stockUnitId: objectId,
      quantity: decimal,
      openingBalance: decimal,
      closingBalance: decimal,
      physicalBalance: {
        bsonType: ['decimal', 'null'],
      },
      stockMovementId: nullableObjectId,
      reversalOfRegisterEntryId: nullableObjectId,
      discrepancyStatus: {
        ...string,
        enum: [...controlledMedicineDiscrepancyStatusValues],
      },
      discrepancyQuantity: {
        bsonType: ['decimal', 'null'],
      },
      discrepancyReason: nullableString,
      escalationReference: nullableString,
      reason: nullableString,
      occurredAt: date,
    },
  ),

  dispensingLabels: validator(
    [
      'labelNumber',
      'dispensationId',
      'dispensationItemId',
      'patientId',
      'prescriptionId',
      'pharmacyLocationId',
      'templateCode',
      'templateVersion',
      'languageCode',
      'status',
      'patientDisplayName',
      'patientIdentifierSnapshot',
      'medicineName',
      'strength',
      'dosageForm',
      'quantity',
      'quantityUnitLabel',
      'instructions',
      'route',
      'frequency',
      'warnings',
      'dispensedAt',
      'pharmacyDisplayName',
      'pharmacistDisplayName',
      'generatedByStaffId',
      'generatedAt',
      'printCount',
      'medicationGuideAttachmentIds',
    ],
    {
      labelNumber: string,
      dispensationId: objectId,
      dispensationItemId: objectId,
      patientId: objectId,
      prescriptionId: objectId,
      pharmacyLocationId: objectId,
      templateCode: string,
      templateVersion: number,
      languageCode: string,
      status: {
        ...string,
        enum: [...dispensingLabelStatusValues],
      },
      patientDisplayName: string,
      patientIdentifierSnapshot: string,
      medicineName: string,
      strength: string,
      dosageForm: string,
      quantity: decimal,
      quantityUnitLabel: string,
      instructions: string,
      route: string,
      frequency: string,
      duration: nullableString,
      warnings: {
        bsonType: 'array',
      },
      storageInstructions: nullableString,
      batchNumber: nullableString,
      expiryDate: nullableDate,
      dispensedAt: date,
      pharmacyDisplayName: string,
      pharmacistDisplayName: string,
      generatedByStaffId: objectId,
      generatedAt: date,
      printCount: number,
      lastPrintedAt: nullableDate,
      voidedAt: nullableDate,
      voidedByStaffId: nullableObjectId,
      voidReason: nullableString,
      medicationGuideAttachmentIds: objectIdArray,
    },
  ),

  dispensingLabelPrints: validator(
    [
      'dispensingLabelId',
      'dispensationId',
      'dispensationItemId',
      'printSequence',
      'reason',
      'labelVersion',
      'printedByStaffId',
      'printedAt',
    ],
    {
      dispensingLabelId: objectId,
      dispensationId: objectId,
      dispensationItemId: objectId,
      printSequence: number,
      reason: {
        ...string,
        enum: [...dispensingLabelPrintReasonValues],
      },
      labelVersion: number,
      printerIdentifier: nullableString,
      workstationIdentifier: nullableString,
      previousPrintId: nullableObjectId,
      printedByStaffId: objectId,
      printedAt: date,
    },
  ),

  pharmacyCounsellingRecords: validator(
    [
      'dispensationId',
      'patientId',
      'dispensationItemIds',
      'counsellingRequired',
      'status',
      'topics',
      'languageCode',
      'interpreterUsed',
      'counselledPerson',
      'attachmentIds',
    ],
    {
      dispensationId: objectId,
      patientId: objectId,
      dispensationItemIds: objectIdArray,
      counsellingRequired: boolean,
      status: {
        ...string,
        enum: [...pharmacyCounsellingStatusValues],
      },
      topics: stringArray,
      languageCode: string,
      interpreterUsed: boolean,
      interpreterStaffId: nullableObjectId,
      interpreterName: nullableString,
      counselledPerson: string,
      caregiverName: nullableString,
      acknowledgementMethod: nullableString,
      acknowledgementAttachmentId: nullableObjectId,
      completedByStaffId: nullableObjectId,
      completedAt: nullableDate,
      declinedReason: nullableString,
      unableReason: nullableString,
      notes: nullableString,
      correctionOfCounsellingRecordId: nullableObjectId,
      attachmentIds: objectIdArray,
    },
  ),

  dispensationReversals: validator(
    [
      'reversalNumber',
      'operationKey',
      'originalDispensationId',
      'patientId',
      'pharmacyLocationId',
      'status',
      'lineCount',
      'lines',
      'controlledMedicine',
      'witnessRequired',
      'requestedByStaffId',
      'requestedAt',
      'reason',
      'currency',
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'netAmount',
      'finalizationState',
      'finalizationAttemptCount',
    ],
    {
      reversalNumber: string,
      operationKey: string,
      originalDispensationId: objectId,
      patientId: objectId,
      pharmacyLocationId: objectId,
      status: {
        ...string,
        enum: [...dispensationReversalStatusValues],
      },
      lineCount: number,
      lines: {
        bsonType: 'array',
      },
      controlledMedicine: boolean,
      witnessRequired: boolean,
      witnessStaffId: nullableObjectId,
      witnessedAt: nullableDate,
      requestedByStaffId: objectId,
      requestedAt: date,
      approvedByStaffId: nullableObjectId,
      approvedAt: nullableDate,
      postedByStaffId: nullableObjectId,
      postedAt: nullableDate,
      rejectedByStaffId: nullableObjectId,
      rejectedAt: nullableDate,
      failedAt: nullableDate,
      failureCode: nullableString,
      reason: string,
      decisionReason: nullableString,
      currency: string,
      ...moneyProperties,
      stockReversalOperationKey: nullableString,
      billingReversalOperationKey: nullableString,
      billingAdjustmentRecordId: nullableObjectId,
      finalizationState: {
        ...string,
        enum: [...pharmacyFinalizationStateValues],
      },
      finalizationAttemptCount: number,
      finalizationUpdatedAt: nullableDate,
      recoveryReason: nullableString,
    },
  ),

  patientReturns: validator(
    [
      'returnNumber',
      'operationKey',
      'originalDispensationId',
      'patientId',
      'pharmacyLocationId',
      'receivingStockLocationId',
      'status',
      'lineCount',
      'totalReturnedQuantity',
      'controlledMedicine',
      'witnessRequired',
      'requestedByStaffId',
      'requestedAt',
      'reason',
      'currency',
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'netAmount',
      'finalizationState',
      'finalizationAttemptCount',
      'attachmentIds',
    ],
    {
      returnNumber: string,
      operationKey: string,
      originalDispensationId: objectId,
      patientId: objectId,
      admissionId: nullableObjectId,
      wardId: nullableObjectId,
      pharmacyLocationId: objectId,
      receivingStockLocationId: objectId,
      status: {
        ...string,
        enum: [...patientReturnStatusValues],
      },
      lineCount: number,
      totalReturnedQuantity: decimal,
      controlledMedicine: boolean,
      witnessRequired: boolean,
      witnessStaffId: nullableObjectId,
      witnessedAt: nullableDate,
      requestedByStaffId: objectId,
      requestedAt: date,
      receivedByStaffId: nullableObjectId,
      receivedAt: nullableDate,
      reviewedByStaffId: nullableObjectId,
      reviewedAt: nullableDate,
      approvedByStaffId: nullableObjectId,
      approvedAt: nullableDate,
      postedByStaffId: nullableObjectId,
      postedAt: nullableDate,
      rejectedByStaffId: nullableObjectId,
      rejectedAt: nullableDate,
      cancelledByStaffId: nullableObjectId,
      cancelledAt: nullableDate,
      reason: string,
      decisionReason: nullableString,
      currency: string,
      ...moneyProperties,
      billingAdjustmentOperationKey: nullableString,
      billingAdjustmentRecordId: nullableObjectId,
      finalizationState: {
        ...string,
        enum: [...pharmacyFinalizationStateValues],
      },
      finalizationAttemptCount: number,
      finalizationUpdatedAt: nullableDate,
      recoveryReason: nullableString,
      attachmentIds: objectIdArray,
    },
  ),

  patientReturnItems: validator(
    [
      'patientReturnId',
      'originalDispensationId',
      'originalDispensationItemId',
      'lineNumber',
      'inventoryItemId',
      'stockUnitId',
      'quantity',
      'controlledMedicine',
      'sealStatus',
      'storageIntegrity',
      'coldChainIntegrity',
      'contaminationRisk',
      'restockEligible',
      'disposition',
      'eligibilityPolicyCode',
      'eligibilityPolicyVersion',
      'eligibilityReason',
      'status',
      'stockMovementIds',
      'grossAmount',
      'discountAmount',
      'taxAmount',
      'netAmount',
    ],
    {
      patientReturnId: objectId,
      originalDispensationId: objectId,
      originalDispensationItemId: objectId,
      originalAllocationId: nullableObjectId,
      lineNumber: number,
      inventoryItemId: objectId,
      inventoryBatchId: nullableObjectId,
      batchNumberSnapshot: nullableString,
      expiryDateSnapshot: nullableDate,
      stockUnitId: objectId,
      quantity: decimal,
      controlledMedicine: boolean,
      sealStatus: {
        ...string,
        enum: [...returnedMedicineSealStatusValues],
      },
      storageIntegrity: {
        ...string,
        enum: [...returnedMedicineIntegrityValues],
      },
      coldChainIntegrity: {
        ...string,
        enum: [...returnedMedicineIntegrityValues],
      },
      contaminationRisk: string,
      restockEligible: boolean,
      disposition: {
        ...string,
        enum: [...patientReturnDispositionValues],
      },
      dispositionLocationId: nullableObjectId,
      eligibilityPolicyCode: string,
      eligibilityPolicyVersion: number,
      eligibilityReason: string,
      status: {
        ...string,
        enum: [...patientReturnItemStatusValues],
      },
      stockMovementIds: objectIdArray,
      ...moneyProperties,
      reviewedByStaffId: nullableObjectId,
      reviewedAt: nullableDate,
      postedByStaffId: nullableObjectId,
      postedAt: nullableDate,
    },
  ),
};

const models = {
  dispensations: DispensationModel,
  dispensationItems: DispensationItemModel,
  dispensationStatusHistories:
    DispensationStatusHistoryModel,
  pharmacyReviewEvents:
    PharmacyReviewEventModel,
  dispensationSubstitutions:
    DispensationSubstitutionModel,
  controlledMedicineRegisterEntries:
    ControlledMedicineRegisterEntryModel,
  dispensingLabels: DispensingLabelModel,
  dispensingLabelPrints:
    DispensingLabelPrintModel,
  pharmacyCounsellingRecords:
    PharmacyCounsellingRecordModel,
  dispensationReversals:
    DispensationReversalModel,
  patientReturns: PatientReturnModel,
  patientReturnItems: PatientReturnItemModel,
} as const;

const expectedRetention:
Readonly<
  Record<
    PharmacyDispensingCollection,
    CollectionRetention
  >
> = {
  dispensations: 'standard',
  dispensationItems: 'standard',
  dispensationStatusHistories: 'immutable',
  pharmacyReviewEvents: 'immutable',
  dispensationSubstitutions: 'standard',
  controlledMedicineRegisterEntries: 'immutable',
  dispensingLabels: 'standard',
  dispensingLabelPrints: 'immutable',
  pharmacyCounsellingRecords: 'standard',
  dispensationReversals: 'standard',
  patientReturns: 'standard',
  patientReturnItems: 'standard',
};

async function ensureCollection(
  database: Db,
  name: PharmacyDispensingCollection,
): Promise<void> {
  const exists =
    (
      await database
        .listCollections(
          { name },
          { nameOnly: true },
        )
        .toArray()
    ).length > 0;

  const collectionValidator =
    pharmacyDispensingFoundationValidators[name];

  if (exists) {
    await database.command({
      collMod: name,
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await database.createCollection(name, {
      validator: collectionValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  const collection = database.collection(name);
  const existingIndexes =
    await collection.indexes();

  for (const index of existingIndexes) {
    if (index.name !== '_id_') {
      await collection.dropIndex(index.name);
    }
  }

  const indexes =
    models[name].schema.indexes() as IndexDescription[];

  if (indexes.length > 0) {
    await collection.createIndexes(indexes);
  }
}

export const pharmacyDispensingFoundation:
Migration = {
  id: '028-pharmacy-dispensing-foundation',

  description:
    'Create pharmacy dispensing, verification, controlled-medicine, label, counselling, return, and reversal foundations',

  async up(database) {
    for (
      const collectionName of
      pharmacyDispensingFoundationCollections
    ) {
      const spec = collectionSpecs.find(
        (candidate) =>
          candidate.name === collectionName,
      );

      if (
        spec === undefined ||
        spec.domain !== 'inventory' ||
        !spec.facilityScoped ||
        spec.retention !==
          expectedRetention[collectionName]
      ) {
        throw new Error(
          `${collectionName} has an invalid pharmacy dispensing collection specification`,
        );
      }

      await ensureCollection(
        database,
        collectionName,
      );
    }
  },
};