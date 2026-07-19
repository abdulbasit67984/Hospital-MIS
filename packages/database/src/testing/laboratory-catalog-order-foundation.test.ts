import {
  randomUUID,
} from 'node:crypto';

import {
  Decimal128,
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  LabTestCategoryModel,
  LabTestModel,
} from '../models/laboratory-catalog.model.js';

import {
  LabOrderItemModel,
  LabOrderModel,
  LabOrderStatusHistoryModel,
} from '../models/laboratory-order.model.js';

import {
  laboratorySchemas,
  schemaForCollection,
} from '../models/registry.js';

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

function indexNames(
  indexes: ReturnType<typeof LabOrderModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

describe('laboratory catalog and order persistence foundation', () => {
  it('catalogs and registers the batch-one laboratory collections', () => {
    const expected = [
      'labTestCategories',
      'labTests',
      'labOrders',
      'labOrderItems',
      'labOrderStatusHistories',
    ] as const;

    for (const name of expected) {
      expect(schemaForCollection(name)).toBe(laboratorySchemas[name]);
      expect(
        collectionSpecs.find((candidate) => candidate.name === name)?.domain,
      ).toBe('laboratory');
    }

    expect(
      collectionSpecs.find(
        (candidate) => candidate.name === 'labOrderStatusHistories',
      )?.retention,
    ).toBe('immutable');
  });

  it('defines facility-safe catalog, order, worklist, and history indexes', () => {
    expect(indexNames(LabTestCategoryModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_test_categories_facility_code',
        'uq_lab_test_categories_facility_name',
      ]),
    );

    expect(indexNames(LabTestModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_tests_facility_code',
        'uq_lab_tests_facility_name',
        'ix_lab_tests_department_availability',
      ]),
    );

    expect(indexNames(LabOrderModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_orders_facility_number',
        'ix_lab_orders_worklist',
        'ix_lab_orders_patient_ordered',
      ]),
    );

    expect(indexNames(LabOrderItemModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_lab_order_items_sequence',
        'uq_lab_order_items_test',
        'ix_lab_order_items_patient_test_history',
      ]),
    );

    expect(indexNames(LabOrderStatusHistoryModel.schema.indexes())).toContain(
      'uq_lab_order_status_histories_sequence',
    );
  });

  it('normalizes standardized tests and enforces specimen and result definitions', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();

    const category = new LabTestCategoryModel({
      facilityId,
      categoryCode: ' hematology ',
      name: ' Hematology ',
      normalizedName: 'placeholder',
      description: 'Blood and hematology testing',
      displayOrder: 10,
      status: 'ACTIVE',
      ...actorFields(actorId),
    });

    await expect(category.validate()).resolves.toBeUndefined();
    expect(category.categoryCode).toBe('HEMATOLOGY');
    expect(category.normalizedName).toBe('hematology');

    const test = new LabTestModel({
      facilityId,
      testCode: ' cbc ',
      name: ' Complete Blood Count ',
      normalizedName: 'placeholder',
      aliases: ['CBC', ' Full Blood Count ', 'cbc'],
      normalizedAliases: [],
      categoryId: category._id,
      categoryCodeSnapshot: category.categoryCode,
      categoryNameSnapshot: category.name,
      description: 'Standard fictional CBC definition',
      methodCode: 'AUTO_CELL_COUNT',
      methodName: 'Automated cell counting',
      requiresSpecimen: true,
      specimenRequirements: [
        {
          requirementCode: 'EDTA_BLOOD',
          specimenTypeCode: 'WHOLE_BLOOD',
          specimenTypeName: 'Whole blood',
          containerCode: 'EDTA_PURPLE',
          containerName: 'EDTA purple-top tube',
          minimumVolume: '2',
          volumeUnitCode: 'ML',
          fastingRequired: false,
          collectionInstructions: 'Collect using standard venipuncture procedure',
          handlingInstructions: 'Keep upright and transport promptly',
          maximumTransportMinutes: 120,
          preferred: true,
        },
      ],
      components: [
        {
          componentCode: 'HGB',
          name: 'Hemoglobin',
          normalizedName: 'placeholder',
          valueType: 'NUMERIC',
          unitCode: 'G_DL',
          unitName: 'g/dL',
          decimalScale: 1,
          referenceRanges: [
            {
              rangeCode: 'ADULT_ANY',
              kind: 'NUMERIC_INTERVAL',
              sex: 'ANY',
              minimumAgeDays: 6_570,
              maximumAgeDays: null,
              lowerBound: '12',
              upperBound: '17',
              criticalLowerBound: '6',
              criticalUpperBound: '22',
              textualReference: null,
              codedValues: [],
              notes: null,
            },
          ],
          required: true,
          displayOrder: 1,
          structuredSchemaKey: null,
        },
      ],
      routineTurnaroundMinutes: 240,
      urgentTurnaroundMinutes: 90,
      statTurnaroundMinutes: 45,
      availableDepartmentIds: [new ObjectId(), new ObjectId()],
      orderable: true,
      requiresResultValidation: true,
      requiresResultVerification: true,
      criticalNotificationRequired: true,
      chargeCatalogItemId: null,
      effectiveFrom: new Date(),
      effectiveThrough: null,
      status: 'ACTIVE',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(test.validate()).resolves.toBeUndefined();
    expect(test.testCode).toBe('CBC');
    expect(test.normalizedName).toBe('complete blood count');
    expect(test.normalizedAliases).toEqual(['cbc', 'full blood count']);

    test.components[0]!.referenceRanges[0]!.upperBound =
      Decimal128.fromString('5');

    await expect(test.validate()).rejects.toThrow(
      'Reference range upper bound cannot be lower than its lower bound',
    );
  });

  it('requires active-encounter traceability and immutable standardized test snapshots', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const patientId = new ObjectId();
    const encounterId = new ObjectId();
    const now = new Date();

    const order = new LabOrderModel({
      facilityId,
      orderNumber: 'LAB-2026-000001',
      patientId,
      requestedPatientId: patientId,
      encounterId,
      registrationId: new ObjectId(),
      opdVisitId: new ObjectId(),
      departmentId: new ObjectId(),
      orderingProviderId: new ObjectId(),
      priority: 'STAT',
      status: 'ORDERED',
      clinicalIndication: 'Fever with suspected infection',
      orderingNotes: 'Collect before antibiotic administration',
      orderedAt: now,
      itemCount: 1,
      activeItemCount: 1,
      collectedItemCount: 0,
      completedItemCount: 0,
      verifiedItemCount: 0,
      rejectedItemCount: 0,
      criticalResultCount: 0,
      lastStatusChangedAt: now,
      lastStatusChangedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(order.validate()).resolves.toBeUndefined();

    const item = new LabOrderItemModel({
      facilityId,
      labOrderId: order._id,
      patientId,
      encounterId,
      sequence: 1,
      labTestId: new ObjectId(),
      testCodeSnapshot: 'CBC',
      testNameSnapshot: 'Complete Blood Count',
      categoryCodeSnapshot: 'HEMATOLOGY',
      categoryNameSnapshot: 'Hematology',
      methodCodeSnapshot: 'AUTO_CELL_COUNT',
      methodNameSnapshot: 'Automated cell counting',
      requiresSpecimen: true,
      specimenRequirementsSnapshot: [
        {
          requirementCode: 'EDTA_BLOOD',
          specimenTypeCode: 'WHOLE_BLOOD',
          specimenTypeName: 'Whole blood',
          containerCode: 'EDTA_PURPLE',
          containerName: 'EDTA purple-top tube',
          minimumVolume: '2',
          volumeUnitCode: 'ML',
          fastingRequired: false,
          collectionInstructions: null,
          handlingInstructions: null,
          maximumTransportMinutes: 120,
          preferred: true,
        },
      ],
      resultComponentsSnapshot: [
        {
          componentCode: 'HGB',
          name: 'Hemoglobin',
          valueType: 'NUMERIC',
          unitCode: 'G_DL',
          unitName: 'g/dL',
          decimalScale: 1,
          required: true,
          displayOrder: 1,
          referenceRangesSnapshot: [],
          structuredSchemaKey: null,
        },
      ],
      testDefinitionHash: 'a'.repeat(64),
      turnaroundMinutes: 45,
      dueAt: new Date(now.getTime() + 45 * 60 * 1_000),
      status: 'ORDERED',
      specimenCount: 0,
      recollectionCount: 0,
      billingStatus: 'PENDING',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(item.validate()).resolves.toBeUndefined();

    item.resultComponentsSnapshot = [];

    await expect(item.validate()).rejects.toThrow(
      'Laboratory order items require a result definition snapshot',
    );
  });

  it('rejects no-op order status history records', async () => {
    const actorId = new ObjectId();

    const history = new LabOrderStatusHistoryModel({
      facilityId: new ObjectId(),
      labOrderId: new ObjectId(),
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      sequence: 2,
      fromStatus: 'ORDERED',
      toStatus: 'ORDERED',
      changeSource: 'LABORATORY_STAFF',
      reasonCode: null,
      reason: null,
      occurredAt: new Date(),
      changedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(history.validate()).rejects.toThrow(
      'Laboratory order status history must represent a state change',
    );
  });
});