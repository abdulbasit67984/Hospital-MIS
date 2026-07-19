import {
  randomUUID,
} from 'node:crypto';

import {
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  LabCriticalResultCommunicationModel,
} from '../models/laboratory-critical-result-communication.model.js';

import {
  LabResultModel,
  LabResultVersionModel,
} from '../models/laboratory-result.model.js';

import {
  LabSpecimenModel,
  LabSpecimenStatusHistoryModel,
} from '../models/laboratory-specimen.model.js';

function actorFields(actorId: ObjectId) {
  return {
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function transactionFields() {
  return {
    transactionId: randomUUID(),
    correlationId: randomUUID(),
  };
}

function encryptedSnapshot() {
  return {
    algorithm: 'AES-256-GCM' as const,
    keyVersion: 'lab-key-v1',
    initializationVector: 'a'.repeat(24),
    authenticationTag: 'b'.repeat(24),
    ciphertext: 'encrypted-laboratory-result-snapshot',
  };
}

function indexNames(
  indexes: ReturnType<typeof LabSpecimenModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

describe('laboratory specimen and result persistence foundation', () => {
  it('defines accession, worklist, immutable history, and result visibility indexes', () => {
    expect(indexNames(LabSpecimenModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_specimens_facility_accession',
        'uq_lab_specimens_facility_identifier',
        'uq_lab_specimens_facility_label_code',
        'ix_lab_specimens_worklist',
      ]),
    );

    expect(
      indexNames(LabSpecimenStatusHistoryModel.schema.indexes()),
    ).toContain('uq_lab_specimen_status_history_sequence');

    expect(indexNames(LabResultModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_results_facility_number',
        'uq_lab_results_order_item',
        'ix_lab_results_encounter_visibility',
        'ix_lab_results_critical_worklist',
      ]),
    );

    expect(indexNames(LabResultVersionModel.schema.indexes())).toContain(
      'uq_lab_result_versions_result_version',
    );

    expect(
      indexNames(LabCriticalResultCommunicationModel.schema.indexes()),
    ).toContain('uq_lab_critical_communications_sequence');
  });

  it('normalizes accession data and enforces specimen collection attribution', async () => {
    const actorId = new ObjectId();
    const now = new Date();

    const specimen = new LabSpecimenModel({
      facilityId: new ObjectId(),
      accessionNumber: ' lab-2026-000001 ',
      specimenIdentifier: ' sp-2026-000001 ',
      labelCode: 'LAB-2026-000001-SP-1',
      labOrderId: new ObjectId(),
      labOrderItemIds: [
        new ObjectId(),
        new ObjectId(),
      ],
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      requirementCodeSnapshot: ' edta blood ',
      specimenTypeCodeSnapshot: ' whole blood ',
      specimenTypeNameSnapshot: 'Whole blood',
      containerCodeSnapshot: 'EDTA_PURPLE',
      containerNameSnapshot: 'EDTA purple-top tube',
      expectedMinimumVolume: '2',
      expectedVolumeUnitCode: 'ML',
      collectedVolume: '3',
      collectedVolumeUnitCode: 'ML',
      collectionMethod: 'VENIPUNCTURE',
      collectionSite: 'Left antecubital fossa',
      status: 'COLLECTED',
      labelPrintCount: 1,
      labelPrintedAt: now,
      labelPrintedBy: actorId,
      collectedAt: now,
      collectedBy: actorId,
      collectorStaffId: new ObjectId(),
      collectionAttempt: 1,
      lastStatusChangedAt: now,
      lastStatusChangedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(specimen.validate()).resolves.toBeUndefined();

    expect(specimen.accessionNumber).toBe('LAB-2026-000001');
    expect(specimen.specimenIdentifier).toBe('SP-2026-000001');
    expect(specimen.requirementCodeSnapshot).toBe('EDTA_BLOOD');

    specimen.collectorStaffId = null;

    await expect(specimen.validate()).rejects.toThrow(
      'Collected specimen states require collection time, actor, staff, and method',
    );
  });

  it('requires rejection and recollection attribution without destructive replacement', async () => {
    const actorId = new ObjectId();
    const now = new Date();

    const specimen = new LabSpecimenModel({
      facilityId: new ObjectId(),
      accessionNumber: 'LAB-2026-000002',
      specimenIdentifier: 'SP-2026-000002',
      labelCode: 'LAB-2026-000002-SP-1',
      labOrderId: new ObjectId(),
      labOrderItemIds: [
        new ObjectId(),
      ],
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      requirementCodeSnapshot: 'SERUM',
      specimenTypeCodeSnapshot: 'SERUM',
      specimenTypeNameSnapshot: 'Serum',
      collectionMethod: 'VENIPUNCTURE',
      status: 'RECOLLECTION_REQUIRED',
      labelPrintCount: 1,
      labelPrintedAt: now,
      labelPrintedBy: actorId,
      collectedAt: now,
      collectedBy: actorId,
      collectorStaffId: new ObjectId(),
      rejectedAt: now,
      rejectedBy: actorId,
      rejectionReasonCode: 'HEMOLYZED',
      rejectionReason: 'Specimen was visibly hemolyzed',
      recollectionRequestedAt: now,
      recollectionRequestedBy: actorId,
      recollectionReason:
        'A new specimen is required for reliable testing',
      collectionAttempt: 1,
      lastStatusChangedAt: now,
      lastStatusChangedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(specimen.validate()).resolves.toBeUndefined();

    specimen.recollectionReason = null;

    await expect(specimen.validate()).rejects.toThrow(
      'Recollection-required specimens require recollection attribution and reason',
    );
  });

  it('enforces exactly one typed result value and critical-result counts', async () => {
    const actorId = new ObjectId();
    const now = new Date();

    const result = new LabResultModel({
      facilityId: new ObjectId(),
      resultNumber: 'LABR-2026-000001',
      labOrderId: new ObjectId(),
      labOrderItemId: new ObjectId(),
      labTestId: new ObjectId(),
      specimenId: new ObjectId(),
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      testCodeSnapshot: 'CBC',
      testNameSnapshot: 'Complete Blood Count',
      methodCodeSnapshot: 'AUTO_CELL_COUNT',
      methodNameSnapshot: 'Automated cell counting',
      status: 'ENTERED',
      components: [
        {
          componentCode: 'HGB',
          componentNameSnapshot: 'Hemoglobin',
          valueType: 'NUMERIC',
          numericValue: '5.9',
          textValue: null,
          codedValue: null,
          qualitativeValue: null,
          structuredValue: null,
          unitCodeSnapshot: 'G_DL',
          unitNameSnapshot: 'g/dL',
          referenceRangeSnapshot: {
            rangeCode: 'ADULT_ANY',
            displayText: '12.0–17.0 g/dL',
            lowerBound: '12',
            upperBound: '17',
            criticalLowerBound: '6',
            criticalUpperBound: '22',
          },
          flag: 'CRITICAL_LOW',
          interpretation: 'Critical anemia range',
          displayOrder: 1,
        },
      ],
      overallFlag: 'CRITICAL_LOW',
      criticalComponentCount: 1,
      unresolvedCriticalComponentCount: 1,
      enteredAt: now,
      enteredBy: actorId,
      technicianStaffId: new ObjectId(),
      currentVersion: 0,
      publicationStatus: 'NOT_PUBLISHED',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(result.validate()).resolves.toBeUndefined();

    result.components[0]!.textValue = 'duplicate typed value';

    await expect(result.validate()).rejects.toThrow(
      'Each laboratory result component requires exactly one typed value',
    );
  });

  it('requires encrypted immutable snapshots for verified and corrected results', async () => {
    const actorId = new ObjectId();
    const resultId = new ObjectId();
    const firstVersionId = new ObjectId();
    const now = new Date();

    const version = new LabResultVersionModel({
      _id: firstVersionId,
      facilityId: new ObjectId(),
      labResultId: resultId,
      labOrderId: new ObjectId(),
      labOrderItemId: new ObjectId(),
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      versionNumber: 1,
      previousVersionId: null,
      changeType: 'INITIAL_VERIFICATION',
      statusSnapshot: 'VERIFIED',
      overallFlagSnapshot: 'NORMAL',
      criticalComponentCountSnapshot: 0,
      encryptedSnapshot: encryptedSnapshot(),
      snapshotHash: 'a'.repeat(64),
      contentHash: 'b'.repeat(64),
      technicianStaffId: new ObjectId(),
      validatorStaffId: new ObjectId(),
      verifierStaffId: new ObjectId(),
      recordedAt: now,
      recordedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(version.validate()).resolves.toBeUndefined();

    const correctedResult = new LabResultModel({
      facilityId: version.facilityId,
      resultNumber: 'LABR-2026-000002',
      labOrderId: version.labOrderId,
      labOrderItemId: version.labOrderItemId,
      labTestId: new ObjectId(),
      specimenId: new ObjectId(),
      patientId: version.patientId,
      encounterId: version.encounterId,
      testCodeSnapshot: 'GLUCOSE',
      testNameSnapshot: 'Blood Glucose',
      status: 'CORRECTED',
      components: [
        {
          componentCode: 'GLUCOSE',
          componentNameSnapshot: 'Blood Glucose',
          valueType: 'NUMERIC',
          numericValue: '105',
          unitCodeSnapshot: 'MG_DL',
          unitNameSnapshot: 'mg/dL',
          flag: 'NORMAL',
          displayOrder: 1,
        },
      ],
      overallFlag: 'NORMAL',
      criticalComponentCount: 0,
      unresolvedCriticalComponentCount: 0,
      enteredAt: now,
      enteredBy: actorId,
      technicianStaffId: version.technicianStaffId,
      validatedAt: now,
      validatedBy: actorId,
      validatorStaffId: version.validatorStaffId,
      verifiedAt: now,
      verifiedBy: actorId,
      verifierStaffId: version.verifierStaffId,
      currentVersion: 2,
      latestVersionId: new ObjectId(),
      correctedAt: now,
      correctedBy: actorId,
      correctionReason:
        'Corrected after analyzer calibration review',
      supersedesResultVersionId: firstVersionId,
      publicationStatus: 'NOT_PUBLISHED',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(correctedResult.validate()).resolves.toBeUndefined();

    correctedResult.supersedesResultVersionId = null;

    await expect(correctedResult.validate()).rejects.toThrow(
      'Corrected laboratory results require correction attribution and prior version traceability',
    );
  });

  it('requires attributed critical-result acknowledgements', async () => {
    const actorId = new ObjectId();

    const communication = new LabCriticalResultCommunicationModel({
      facilityId: new ObjectId(),
      labResultId: new ObjectId(),
      labResultVersionId: new ObjectId(),
      labOrderId: new ObjectId(),
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      sequence: 1,
      componentCodeSnapshot: 'HGB',
      resultFlagSnapshot: 'CRITICAL_LOW',
      communicationType: 'ACKNOWLEDGED',
      channel: 'PHONE',
      recipientType: 'ORDERING_PROVIDER',
      recipientUserId: new ObjectId(),
      recipientStaffId: new ObjectId(),
      recipientDisplaySnapshot: 'Ordering provider',
      communicationNotes:
        'Critical value communicated using read-back procedure',
      occurredAt: new Date(),
      performedBy: actorId,
      acknowledgedAt: new Date(),
      acknowledgedBy: new ObjectId(),
      acknowledgementNotes:
        'Provider acknowledged and accepted responsibility',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(communication.validate()).resolves.toBeUndefined();

    communication.acknowledgedBy = null;

    await expect(communication.validate()).rejects.toThrow(
      'Critical-result acknowledgement records require acknowledgement attribution',
    );
  });
});