import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ControlledMedicineRegisterEntryModel,
  controlledMedicineRegisterEntrySchema,
} from '../models/pharmacy-controlled-medicine.model.js';

import {
  DispensationItemModel,
  DispensationModel,
  DispensationStatusHistoryModel,
  DispensationSubstitutionModel,
  PharmacyReviewEventModel,
  dispensationItemSchema,
  dispensationSchema,
  dispensationStatusHistorySchema,
  dispensationSubstitutionSchema,
  pharmacyReviewEventSchema,
} from '../models/pharmacy-dispensation.model.js';

import {
  DispensingLabelModel,
  DispensingLabelPrintModel,
  PharmacyCounsellingRecordModel,
  dispensingLabelPrintSchema,
  dispensingLabelSchema,
  pharmacyCounsellingRecordSchema,
} from '../models/pharmacy-label-counselling.model.js';

import {
  DispensationReversalModel,
  PatientReturnItemModel,
  PatientReturnModel,
  dispensationReversalSchema,
  patientReturnItemSchema,
  patientReturnSchema,
} from '../models/pharmacy-return-reversal.model.js';

import {
  schemaForCollection,
} from '../models/registry.js';

import {
  inventoryControlsMonitoring,
} from '../migrations/027-inventory-controls-monitoring.js';

import {
  pharmacyDispensingFoundation,
  pharmacyDispensingFoundationCollections,
  pharmacyDispensingFoundationValidators,
} from '../migrations/028-pharmacy-dispensing-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();

  return {
    facilityId: objectId(),
    transactionId:
      `tx-${objectId().toHexString()}`,
    correlationId:
      `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function money() {
  return {
    grossAmount: '100',
    discountAmount: '10',
    taxAmount: '5',
    netAmount: '95',
  };
}

function indexNames(
  schema: mongoose.Schema,
): string[] {
  return schema.indexes().flatMap(
    ([, options]) =>
      typeof options.name === 'string'
        ? [options.name]
        : [],
  );
}

function baseDispensation() {
  const now = new Date();
  const patientId = objectId();

  return {
    ...commonFields(),
    dispensationNumber: 'DSP-2026-000001',
    creationOperationKey:
      'create-dispensation-operation-0001',
    prescriptionId: objectId(),
    prescriptionNumberSnapshot:
      'RX-2026-000001',
    prescriptionRevisionNumber: 1,
    prescriptionVersion: 2,
    patientId,
    requestedPatientId: patientId,
    encounterId: objectId(),
    registrationId: objectId(),
    opdVisitId: objectId(),
    admissionId: null,
    wardId: null,
    departmentId: objectId(),
    servicePointId: objectId(),
    prescriberProviderId: objectId(),
    pharmacyLocationId: objectId(),
    sourceStockLocationId: objectId(),
    context: 'OUTPATIENT' as const,
    priority: 'ROUTINE' as const,
    status: 'PENDING_REVIEW' as const,
    lineCount: 1,
    verifiedLineCount: 0,
    completedLineCount: 0,
    controlledMedicine: false,
    highAlertMedicine: false,
    secondCheckRequired: false,
    witnessRequired: false,
    stockReservationId: null,
    queuedAt: now,
    reviewStartedAt: null,
    verifiedAt: null,
    verifiedByStaffId: null,
    secondCheckedAt: null,
    secondCheckedByStaffId: null,
    firstDispensedAt: null,
    completedAt: null,
    dispensedByStaffId: null,
    heldAt: null,
    heldByStaffId: null,
    holdReason: null,
    rejectedAt: null,
    rejectedByStaffId: null,
    rejectionReason: null,
    cancelledAt: null,
    cancelledByStaffId: null,
    cancellationReason: null,
    enteredInErrorAt: null,
    enteredInErrorByStaffId: null,
    enteredInErrorReason: null,
    expiredAt: null,
    expiresAt: new Date(
      now.getTime() + 60 * 60 * 1_000,
    ),
    currency: 'PKR',
    ...money(),
    billingOperationKey: null,
    billingSourceRecordId: null,
    finalizationState:
      'NOT_STARTED' as const,
    finalizationAttemptCount: 0,
    finalizationUpdatedAt: null,
    recoveryReason: null,
    lastFailureCode: null,
    attachmentIds: [],
  };
}

function baseDispensationItem() {
  const dispensationId = objectId();
  const reservationItemId = objectId();
  const reservationAllocationId = objectId();

  return {
    ...commonFields(),
    dispensationId,
    prescriptionId: objectId(),
    prescriptionItemId: objectId(),
    patientId: objectId(),
    lineNumber: 1,
    prescribedFormularyItemId: objectId(),
    prescribedMedicineId: objectId(),
    prescribedMedicineFormId: objectId(),
    prescribedMedicineStrengthId: objectId(),
    prescribedRouteId: objectId(),
    prescribedFrequencyId: objectId(),
    prescribedMedicineSnapshot:
      'Paracetamol',
    prescribedStrengthSnapshot: '500 mg',
    prescribedFormSnapshot: 'Tablet',
    prescribedRouteSnapshot: 'Oral',
    prescribedFrequencySnapshot:
      'Twice daily',
    prescribedInstructionsSnapshot:
      'Take after food',
    prescribedQuantity: '10',
    prescribedQuantityUnitId: objectId(),
    requestedQuantity: '10',
    approvedQuantity: '10',
    reservedQuantity: '10',
    dispensedQuantity: '10',
    returnedQuantity: '0',
    reversedQuantity: '0',
    dispensedQuantityUnitId: objectId(),
    actualFormularyItemId: objectId(),
    actualMedicineId: objectId(),
    actualMedicineFormId: objectId(),
    actualMedicineStrengthId: objectId(),
    actualInventoryItemId: objectId(),
    actualMedicineSnapshot: 'Paracetamol',
    actualStrengthSnapshot: '500 mg',
    actualFormSnapshot: 'Tablet',
    substitutionId: null,
    substitutionApplied: false,
    quantityRoundingApplied: false,
    quantityRoundingReason: null,
    specialHandling: ['STANDARD'],
    controlledMedicine: false,
    highAlertMedicine: false,
    safetyAlerts: [],
    blockingAlertCount: 0,
    allocations: [
      {
        stockReservationItemId:
          reservationItemId,
        stockReservationAllocationId:
          reservationAllocationId,
        inventoryBatchId: objectId(),
        batchNumberSnapshot: 'BATCH-001',
        expiryDateSnapshot: new Date(
          '2027-12-31T00:00:00.000Z',
        ),
        stockUnitId: objectId(),
        reservedStockQuantity: '10',
        consumedStockQuantity: '10',
        releasedStockQuantity: '0',
        returnedStockQuantity: '0',
        status: 'CONSUMED',
        stockMovementIds: [objectId()],
        reversalStockMovementIds: [],
      },
    ],
    unitSellingPrice: '10',
    ...money(),
    pricingSource: 'BATCH_SELLING_PRICE',
    priceOverrideApplied: false,
    priceOverrideReason: null,
    priceOverrideApprovedByStaffId: null,
    status: 'DISPENSED' as const,
    verifiedByStaffId: objectId(),
    verifiedAt: new Date(),
    dispensedByStaffId: objectId(),
    dispensedAt: new Date(),
    holdReason: null,
    rejectionReason: null,
  };
}

describe(
  'pharmacy dispensing persistence foundation',
  () => {
    it(
      'registers migration 028 after inventory controls and exposes every validator',
      () => {
        expect(
          pharmacyDispensingFoundation.id,
        ).toBe(
          '028-pharmacy-dispensing-foundation',
        );
        expect(migrations.at(-2)).toBe(
          inventoryControlsMonitoring,
        );
        expect(migrations.at(-1)).toBe(
          pharmacyDispensingFoundation,
        );
        expect(
          Object.keys(
            pharmacyDispensingFoundationValidators,
          ).sort(),
        ).toEqual(
          [
            ...pharmacyDispensingFoundationCollections,
          ].sort(),
        );

        for (
          const collection of
          pharmacyDispensingFoundationCollections
        ) {
          expect(
            pharmacyDispensingFoundationValidators[
              collection
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );
        }
      },
    );

    it(
      'registers concrete schemas for every pharmacy collection',
      () => {
        const expected = {
          dispensations: dispensationSchema,
          dispensationItems:
            dispensationItemSchema,
          dispensationStatusHistories:
            dispensationStatusHistorySchema,
          pharmacyReviewEvents:
            pharmacyReviewEventSchema,
          dispensationSubstitutions:
            dispensationSubstitutionSchema,
          controlledMedicineRegisterEntries:
            controlledMedicineRegisterEntrySchema,
          dispensingLabels:
            dispensingLabelSchema,
          dispensingLabelPrints:
            dispensingLabelPrintSchema,
          pharmacyCounsellingRecords:
            pharmacyCounsellingRecordSchema,
          dispensationReversals:
            dispensationReversalSchema,
          patientReturns: patientReturnSchema,
          patientReturnItems:
            patientReturnItemSchema,
        } as const;

        for (const [name, schema] of Object.entries(expected)) {
          expect(
            schemaForCollection(
              name as keyof typeof expected,
            ),
          ).toBe(schema);
        }
      },
    );

    it(
      'defines idempotency, worklist, traceability, and immutable-history indexes',
      () => {
        expect(
          indexNames(
            DispensationModel.schema,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_dispensations_creation_operation',
            'ix_dispensations_pharmacy_worklist',
            'ix_dispensations_recovery_worklist',
          ]),
        );
        expect(
          indexNames(
            DispensationItemModel.schema,
          ),
        ).toContain(
          'ix_dispensation_items_batch_traceability',
        );
        expect(
          indexNames(
            DispensationStatusHistoryModel.schema,
          ),
        ).toContain(
          'uq_dispensation_status_history_sequence',
        );
        expect(
          indexNames(
            PharmacyReviewEventModel.schema,
          ),
        ).toContain(
          'uq_pharmacy_review_events_transaction_action',
        );
        expect(
          indexNames(
            ControlledMedicineRegisterEntryModel.schema,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_controlled_medicine_operation_key',
            'uq_controlled_medicine_register_sequence',
            'ix_controlled_medicine_discrepancy_worklist',
          ]),
        );
        expect(
          indexNames(
            PatientReturnModel.schema,
          ),
        ).toContain(
          'ix_patient_returns_worklist',
        );
        expect(
          indexNames(
            DispensationReversalModel.schema,
          ),
        ).toContain(
          'uq_dispensation_reversals_active_source',
        );
      },
    );

    it(
      'accepts a valid queued dispensation and blocks invalid completion or inpatient context',
      async () => {
        const valid = new DispensationModel(
          baseDispensation(),
        );

        await expect(
          valid.validate(),
        ).resolves.toBeUndefined();

        const invalidCompletion =
          new DispensationModel({
            ...baseDispensation(),
            status: 'COMPLETED',
            stockReservationId: objectId(),
            firstDispensedAt: new Date(),
            dispensedByStaffId: objectId(),
            completedAt: new Date(),
            finalizationState: 'PENDING',
          });

        await expect(
          invalidCompletion.validate(),
        ).rejects.toThrow(
          /Completed dispensing requires completed stock, billing, and finalization attribution/u,
        );

        const invalidInpatient =
          new DispensationModel({
            ...baseDispensation(),
            context: 'INPATIENT',
            admissionId: null,
          });

        await expect(
          invalidInpatient.validate(),
        ).rejects.toThrow(
          /require an admission/u,
        );

        const wrongPatient = baseDispensation();
        wrongPatient.requestedPatientId = objectId();

        await expect(
          new DispensationModel(
            wrongPatient,
          ).validate(),
        ).rejects.toThrow(
          /Requested patient must match/u,
        );
      },
    );

    it(
      'reconciles exact dispensing quantities, allocation consumption, and money',
      async () => {
        const valid = new DispensationItemModel(
          baseDispensationItem(),
        );

        await expect(
          valid.validate(),
        ).resolves.toBeUndefined();

        const overDispensed =
          new DispensationItemModel({
            ...baseDispensationItem(),
            dispensedQuantity: '11',
          });

        await expect(
          overDispensed.validate(),
        ).rejects.toThrow(
          /Dispensed quantity cannot exceed reserved quantity/u,
        );

        const baseItem = baseDispensationItem();
        const sourceAllocation =
          baseItem.allocations[0];

        expect(sourceAllocation).toBeDefined();

        const unreconciled =
          new DispensationItemModel({
            ...baseItem,
            allocations: [
              {
                ...sourceAllocation!,
                consumedStockQuantity: '9',
              },
            ],
          });

        await expect(
          unreconciled.validate(),
        ).rejects.toThrow(
          /Allocation consumption must reconcile exactly/u,
        );

        const wrongMoney =
          new DispensationItemModel({
            ...baseDispensationItem(),
            netAmount: '96',
          });

        await expect(
          wrongMoney.validate(),
        ).rejects.toThrow(
          /Net amount must equal gross amount plus tax less discount/u,
        );

        const wrongGross =
          new DispensationItemModel({
            ...baseDispensationItem(),
            grossAmount: '99',
            netAmount: '94',
          });

        await expect(
          wrongGross.validate(),
        ).rejects.toThrow(
          /Gross amount must equal dispensed quantity multiplied by unit selling price/u,
        );
      },
    );

    it(
      'requires independent controlled-medicine witnessing and exact register balances',
      async () => {
        const pharmacist = objectId();
        const witness = objectId();

        const valid =
          new ControlledMedicineRegisterEntryModel({
            ...commonFields(),
            registerNumber: 'CDR-2026-000001',
            registerSequence: 1,
            operationKey:
              'controlled-dispense-operation-0001',
            entryType: 'DISPENSE',
            direction: 'OUT',
            pharmacyLocationId: objectId(),
            stockLocationId: objectId(),
            patientId: objectId(),
            prescriptionId: objectId(),
            prescriptionItemId: objectId(),
            dispensationId: objectId(),
            dispensationItemId: objectId(),
            patientReturnId: null,
            reversalId: null,
            prescriberProviderId: objectId(),
            pharmacistStaffId: pharmacist,
            witnessRequired: true,
            witnessStaffId: witness,
            witnessMethod: 'IN_PERSON',
            witnessedAt: new Date(),
            formularyItemId: objectId(),
            medicineId: objectId(),
            inventoryItemId: objectId(),
            inventoryBatchId: objectId(),
            batchNumberSnapshot: 'CD-BATCH-1',
            expiryDateSnapshot: new Date(
              '2027-12-31T00:00:00.000Z',
            ),
            stockUnitId: objectId(),
            quantity: '2',
            openingBalance: '10',
            closingBalance: '8',
            physicalBalance: null,
            stockMovementId: objectId(),
            reversalOfRegisterEntryId: null,
            discrepancyStatus: 'NONE',
            discrepancyQuantity: null,
            discrepancyReason: null,
            escalationReference: null,
            reason: 'Dispensed against prescription',
            occurredAt: new Date(),
          });

        await expect(
          valid.validate(),
        ).resolves.toBeUndefined();

        valid.set('closingBalance', '9');

        await expect(
          valid.validate(),
        ).rejects.toThrow(
          /closing balance must reconcile exactly/u,
        );

        valid.set('closingBalance', '8');
        valid.set('witnessStaffId', pharmacist);

        await expect(
          valid.validate(),
        ).rejects.toThrow(
          /pharmacist and witness must be different/u,
        );
      },
    );

    it(
      'preserves label, counselling, return, reversal, review, and substitution foundations',
      () => {
        expect(DispensingLabelModel).toBeDefined();
        expect(
          DispensingLabelPrintModel,
        ).toBeDefined();
        expect(
          PharmacyCounsellingRecordModel,
        ).toBeDefined();
        expect(PatientReturnItemModel).toBeDefined();
        expect(
          DispensationSubstitutionModel,
        ).toBeDefined();
        expect(
          PharmacyReviewEventModel,
        ).toBeDefined();
        expect(
          DispensationReversalModel,
        ).toBeDefined();
      },
    );

    it(
      'blocks unsafe patient-return restocking and repeated active reversal requests',
      async () => {
        const unsafeReturn =
          new PatientReturnItemModel({
            ...commonFields(),
            patientReturnId: objectId(),
            originalDispensationId: objectId(),
            originalDispensationItemId: objectId(),
            originalAllocationId: objectId(),
            lineNumber: 1,
            inventoryItemId: objectId(),
            inventoryBatchId: objectId(),
            batchNumberSnapshot: 'BATCH-RET-1',
            expiryDateSnapshot: new Date(
              '2027-12-31T00:00:00.000Z',
            ),
            stockUnitId: objectId(),
            quantity: '1',
            controlledMedicine: false,
            sealStatus: 'OPENED',
            storageIntegrity: 'NOT_CONFIRMED',
            coldChainIntegrity: 'COMPROMISED',
            contaminationRisk: 'UNKNOWN',
            restockEligible: true,
            disposition: 'RESTOCK_AVAILABLE',
            dispositionLocationId: objectId(),
            eligibilityPolicyCode:
              'PATIENT_RETURN_V1',
            eligibilityPolicyVersion: 1,
            eligibilityReason:
              'Return inspection completed',
            status: 'PENDING_REVIEW',
            stockMovementIds: [],
            ...money(),
            reviewedByStaffId: null,
            reviewedAt: null,
            postedByStaffId: null,
            postedAt: null,
          });

        await expect(
          unsafeReturn.validate(),
        ).rejects.toThrow(
          /Cold-chain-compromised medicine is not eligible for restocking/u,
        );

        const activeReversalIndex =
          DispensationReversalModel.schema
            .indexes()
            .find(
              ([, options]) =>
                options.name ===
                'uq_dispensation_reversals_active_source',
            );

        expect(activeReversalIndex).toBeDefined();
        expect(activeReversalIndex?.[0]).toEqual({
          facilityId: 1,
          originalDispensationId: 1,
        });
        expect(activeReversalIndex?.[1]).toEqual(
          expect.objectContaining({
            unique: true,
            partialFilterExpression:
              expect.objectContaining({
                status: expect.objectContaining({
                  $in: [
                    'REQUESTED',
                    'APPROVED',
                    'POSTED',
                  ],
                }),
              }),
          }),
        );
      },
    );
  },
);