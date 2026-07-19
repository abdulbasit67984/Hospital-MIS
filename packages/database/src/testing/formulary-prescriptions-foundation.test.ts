import {
  randomUUID,
} from 'node:crypto';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ObjectId,
} from 'mongodb';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  FormularyItemModel,
  MedicineModel,
  MedicineRouteModel,
  PrescriptionFrequencyModel,
  UnitOfMeasureModel,
} from '../models/medicine-catalog.model.js';

import {
  PrescriptionItemModel,
  PrescriptionModel,
  PrescriptionSafetyWarningModel,
  PrescriptionStatusHistoryModel,
} from '../models/prescription.model.js';

import {
  formularyPrescriptionSchemas,
  schemaForCollection,
} from '../models/registry.js';

function actorFields(actorId: ObjectId) {
  return {
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function indexNames(
  indexes: ReturnType<typeof PrescriptionModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

function encryptedSnapshot() {
  return {
    algorithm: 'AES-256-GCM' as const,
    keyVersion: 'clinical-key-v1',
    initializationVector: 'a'.repeat(24),
    authenticationTag: 'b'.repeat(32),
    ciphertext: 'encrypted-prescription-snapshot',
  };
}

describe('formulary and prescription persistence foundation', () => {
  it('catalogs and registers every persistence collection with immutable history', () => {
    const expected = [
      'medicines',
      'medicineForms',
      'medicineRoutes',
      'unitsOfMeasure',
      'medicineStrengths',
      'prescriptionFrequencies',
      'formularyItems',
      'prescriptions',
      'prescriptionItems',
      'prescriptionSafetyWarnings',
      'prescriptionStatusHistories',
    ] as const;

    for (const name of expected) {
      expect(schemaForCollection(name)).toBe(formularyPrescriptionSchemas[name]);
    }

    expect(
      collectionSpecs.find(
        (candidate) => candidate.name === 'prescriptionStatusHistories',
      )?.retention,
    ).toBe('immutable');
  });

  it('defines facility-safe search, uniqueness, history, and traceability indexes', () => {
    expect(indexNames(MedicineModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_medicines_facility_code',
        'uq_medicines_facility_generic_name',
        'ix_medicines_facility_brand_status',
      ]),
    );

    expect(indexNames(FormularyItemModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_formulary_items_facility_code',
        'uq_formulary_items_active_selection',
        'ix_formulary_items_inventory_item',
      ]),
    );

    expect(indexNames(PrescriptionModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_prescriptions_facility_number',
        'uq_prescriptions_root_revision',
        'ix_prescriptions_patient_issued',
      ]),
    );

    expect(indexNames(PrescriptionItemModel.schema.indexes())).toContain(
      'ix_prescription_items_patient_medicine_status',
    );

    expect(indexNames(PrescriptionStatusHistoryModel.schema.indexes())).toContain(
      'uq_prescription_status_histories_sequence',
    );

    expect(indexNames(PrescriptionSafetyWarningModel.schema.indexes())).toContain(
      'uq_prescription_warnings_fingerprint',
    );
  });

  it('normalizes generic and brand medicine names without permitting duplicate brands', async () => {
    const actorId = new ObjectId();
    const medicine = new MedicineModel({
      facilityId: new ObjectId(),
      medicineCode: ' med-001 ',
      genericName: '  Paracetamol  ',
      normalizedGenericName: 'placeholder',
      brandNames: [
        {
          name: 'Panadol',
          normalizedName: 'placeholder',
          manufacturerName: 'Fictional Manufacturer',
          status: 'ACTIVE',
        },
      ],
      synonyms: ['Acetaminophen', 'Acetaminophen'],
      status: 'ACTIVE',
      ...actorFields(actorId),
    });

    await expect(medicine.validate()).resolves.toBeUndefined();

    expect(medicine.medicineCode).toBe('MED-001');
    expect(medicine.normalizedGenericName).toBe('paracetamol');
    expect(medicine.brandNames[0]?.normalizedName).toBe('panadol');
    expect(medicine.synonyms).toEqual(['Acetaminophen']);

    medicine.brandNames.push({
      name: ' PANADOL ',
      normalizedName: 'placeholder',
      manufacturerName: null,
      status: 'ACTIVE',
    });

    await expect(medicine.validate()).rejects.toThrow(
      'A medicine cannot contain duplicate normalized brand names',
    );
  });

  it('requires standardized routes, units, frequency, and active formulary selection', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const routeId = new ObjectId();

    const route = new MedicineRouteModel({
      facilityId,
      code: 'ORAL',
      name: 'Oral',
      normalizedName: 'placeholder',
      status: 'ACTIVE',
      ...actorFields(actorId),
    });

    const unit = new UnitOfMeasureModel({
      facilityId,
      code: 'MG',
      name: 'Milligram',
      normalizedName: 'placeholder',
      symbol: 'mg',
      dimension: 'MASS',
      decimalScale: 3,
      status: 'ACTIVE',
      ...actorFields(actorId),
    });

    const frequency = new PrescriptionFrequencyModel({
      facilityId,
      code: 'BID',
      name: 'Twice daily',
      normalizedName: 'placeholder',
      kind: 'SCHEDULED',
      timesPerDay: 2,
      intervalMinutes: null,
      defaultAdministrationTimes: ['08:00', '20:00'],
      allowsAsNeeded: false,
      maxAdministrationsPerDay: 2,
      status: 'ACTIVE',
      ...actorFields(actorId),
    });

    await expect(route.validate()).resolves.toBeUndefined();
    await expect(unit.validate()).resolves.toBeUndefined();
    await expect(frequency.validate()).resolves.toBeUndefined();

    const formularyItem = new FormularyItemModel({
      facilityId,
      formularyCode: 'FORM-0001',
      medicineId: new ObjectId(),
      medicineFormId: new ObjectId(),
      medicineStrengthId: new ObjectId(),
      brandName: 'Panadol',
      allowedRouteIds: [],
      defaultRouteId: routeId,
      doseUnitId: unit._id,
      quantityUnitId: new ObjectId(),
      inventoryItemId: null,
      stockTracked: false,
      restrictionType: 'NONE',
      restrictedDepartmentIds: [],
      highAlert: false,
      controlledMedicine: false,
      searchText: 'Paracetamol Panadol 500 mg tablet',
      effectiveFrom: new Date(),
      status: 'ACTIVE',
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      ...actorFields(actorId),
    });

    await expect(formularyItem.validate()).resolves.toBeUndefined();

    expect(formularyItem.allowedRouteIds.map(String)).toEqual([
      routeId.toHexString(),
    ]);
    expect(formularyItem.activeSelectionKey).toContain('panadol');
  });

  it('requires signed immutable issuance and formulary-linked prescription items', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const patientId = new ObjectId();
    const encounterId = new ObjectId();
    const providerId = new ObjectId();
    const now = new Date();

    const prescription = new PrescriptionModel({
      facilityId,
      prescriptionNumber: 'RX-2026-000001',
      patientId,
      requestedPatientId: patientId,
      encounterId,
      registrationId: new ObjectId(),
      opdVisitId: new ObjectId(),
      departmentId: new ObjectId(),
      prescriberProviderId: providerId,
      status: 'ISSUED',
      revisionNumber: 1,
      draftedAt: now,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      signedBy: providerId,
      signatureMethod: 'AUTHENTICATED_SESSION',
      signatureDigest: 'a'.repeat(64),
      lockedAt: now,
      lockedBy: providerId,
      issuedSnapshotHash: 'b'.repeat(64),
      interactionCheckStatus: 'NOT_REQUESTED',
      itemCount: 1,
      activeItemCount: 1,
      dispensedItemCount: 0,
      safetyWarningCount: 0,
      unresolvedBlockingWarningCount: 0,
      printRevision: 0,
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      ...actorFields(actorId),
    });

    await expect(prescription.validate()).resolves.toBeUndefined();
    expect(String(prescription.rootPrescriptionId)).toBe(String(prescription._id));

    const item = new PrescriptionItemModel({
      facilityId,
      prescriptionId: prescription._id,
      patientId,
      encounterId,
      sequence: 1,
      formularyItemId: new ObjectId(),
      medicineId: new ObjectId(),
      medicineFormId: new ObjectId(),
      medicineStrengthId: new ObjectId(),
      selectedBrandName: 'Panadol',
      genericNameSnapshot: 'Paracetamol',
      medicineFormSnapshot: 'Tablet',
      medicineStrengthSnapshot: '500 mg',
      dose: '500',
      doseUnitId: new ObjectId(),
      doseUnitSnapshot: 'mg',
      routeId: new ObjectId(),
      routeSnapshot: 'Oral',
      frequencyId: new ObjectId(),
      frequencySnapshot: 'Twice daily',
      durationValue: '5',
      durationUnit: 'DAYS',
      quantity: '10',
      quantityUnitId: new ObjectId(),
      quantityUnitSnapshot: 'tablet',
      instructions: 'Take after meals',
      asNeeded: false,
      startDate: '2026-07-18',
      endDate: '2026-07-22',
      status: 'ACTIVE',
      dispensedQuantity: '0',
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      ...actorFields(actorId),
    });

    await expect(item.validate()).resolves.toBeUndefined();

    prescription.status = 'DRAFT';
    await expect(prescription.validate()).rejects.toThrow(
      'Draft prescriptions cannot retain issuance or signature metadata',
    );
  });

  it('requires encrypted append-only history and traceable allergy warnings', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const patientId = new ObjectId();
    const prescriptionId = new ObjectId();
    const providerId = new ObjectId();
    const now = new Date();

    const history = new PrescriptionStatusHistoryModel({
      facilityId,
      prescriptionId,
      patientId,
      sequence: 2,
      fromStatus: 'DRAFT',
      toStatus: 'ISSUED',
      changeType: 'ISSUED',
      changeSource: 'PROVIDER',
      encryptedSnapshot: encryptedSnapshot(),
      snapshotHash: 'c'.repeat(64),
      signedBy: providerId,
      signatureMethod: 'AUTHENTICATED_SESSION',
      signatureDigest: 'd'.repeat(64),
      occurredAt: now,
      changedBy: actorId,
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      ...actorFields(actorId),
    });

    await expect(history.validate()).resolves.toBeUndefined();

    const warning = new PrescriptionSafetyWarningModel({
      facilityId,
      prescriptionId,
      prescriptionItemId: new ObjectId(),
      patientId,
      encounterId: new ObjectId(),
      warningFingerprint: 'e'.repeat(64),
      warningType: 'ALLERGY',
      severity: 'HIGH',
      status: 'OPEN',
      warningCode: 'ALLERGY_MATCH',
      message: 'Medicine may conflict with an active medication allergy',
      patientAllergyId: new ObjectId(),
      detectedAt: now,
      detectedBy: actorId,
      transactionId: randomUUID(),
      correlationId: randomUUID(),
      ...actorFields(actorId),
    });

    await expect(warning.validate()).resolves.toBeUndefined();

    warning.patientAllergyId = null;
    await expect(warning.validate()).rejects.toThrow(
      'Allergy warnings require a patient allergy reference',
    );
  });
});