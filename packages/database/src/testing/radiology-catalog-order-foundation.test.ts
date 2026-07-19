import {
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
  RadiologyModalityModel,
  RadiologyProcedureModel,
} from '../models/radiology-catalog.model.js';

import {
  RadiologyOrderItemModel,
  RadiologyOrderItemStatusHistoryModel,
  RadiologyOrderModel,
  RadiologyOrderStatusHistoryModel,
} from '../models/radiology-order.model.js';

function indexNames(
  indexes: ReturnType<typeof RadiologyOrderModel.schema.indexes>,
): string[] {
  return indexes.flatMap(([, options]) =>
    typeof options.name === 'string'
      ? [options.name]
      : [],
  );
}

function actorFields(actorId: ObjectId) {
  return {
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function transactionFields() {
  return {
    transactionId: `tx-${new ObjectId().toHexString()}`,
    correlationId: `corr-${new ObjectId().toHexString()}`,
  };
}

function procedureSnapshot(
  procedureId: ObjectId,
  modalityId: ObjectId,
  departmentId: ObjectId,
) {
  const now = new Date();

  return {
    procedureId,
    procedureVersion: 2,
    procedureCode: 'CT_CHEST_CONTRAST',
    procedureName: 'CT Chest with Contrast',
    description: 'Fictional standardized CT chest definition',
    modalityId,
    modalityCode: 'CT',
    modalityName: 'Computed Tomography',
    modalityType: 'CT' as const,
    dicomModalityCode: 'CT',
    bodyRegions: [
      {
        code: 'CHEST',
        name: 'Chest',
      },
    ],
    lateralityRequirement: 'NOT_APPLICABLE' as const,
    permittedLateralities: ['NOT_APPLICABLE'] as const,
    contrastRequirement: 'REQUIRED' as const,
    permittedContrastRoutes: ['INTRAVENOUS'] as const,
    preparationInstructions: ['Fast for four hours before examination'],
    contraindications: ['Unresolved severe contrast reaction'],
    safetyScreeningRequirements: [
      'CONTRAST_ALLERGY',
      'PREGNANCY',
      'RENAL_RISK',
    ] as const,
    expectedDurationMinutes: 30,
    routineTurnaroundMinutes: 1_440,
    urgentTurnaroundMinutes: 240,
    statTurnaroundMinutes: 60,
    availableDepartmentIds: [departmentId],
    schedulingRequired: true,
    requiresTechnician: true,
    requiresRadiologist: true,
    chargeCatalogItemId: new ObjectId(),
    effectiveFrom: now,
    effectiveThrough: null,
    capturedAt: now,
  };
}

describe('radiology catalog and order database foundation', () => {
  it('catalogs the new Radiology collections with facility scope and immutable histories', () => {
    const expected = new Map([
      ['radiologyModalities', 'standard'],
      ['radiologyProcedures', 'standard'],
      ['radiologyOrders', 'standard'],
      ['radiologyOrderItems', 'standard'],
      ['radiologyOrderStatusHistories', 'immutable'],
      ['radiologyOrderItemStatusHistories', 'immutable'],
    ]);

    for (const [name, retention] of expected) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === name,
      );

      expect(spec).toMatchObject({
        domain: 'radiology',
        facilityScoped: true,
        retention,
      });
    }
  });

  it('defines facility-safe catalog, worklist, accession, and history indexes', () => {
    expect(indexNames(RadiologyModalityModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_radiology_modalities_facility_code',
        'uq_radiology_modalities_facility_name',
        'ix_radiology_modalities_department_availability',
      ]),
    );

    expect(indexNames(RadiologyProcedureModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_radiology_procedures_facility_code',
        'uq_radiology_procedures_facility_name',
        'ix_radiology_procedures_modality_availability',
      ]),
    );

    expect(indexNames(RadiologyOrderModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_radiology_orders_facility_number',
        'ix_radiology_orders_worklist',
        'ix_radiology_orders_patient_ordered',
      ]),
    );

    expect(indexNames(RadiologyOrderItemModel.schema.indexes())).toEqual(
      expect.arrayContaining([
        'uq_radiology_order_items_sequence',
        'uq_radiology_order_items_facility_accession',
        'ix_radiology_order_items_patient_procedure_history',
      ]),
    );

    expect(
      indexNames(RadiologyOrderStatusHistoryModel.schema.indexes()),
    ).toContain('uq_radiology_order_status_histories_sequence');

    expect(
      indexNames(RadiologyOrderItemStatusHistoryModel.schema.indexes()),
    ).toContain('uq_radiology_order_item_status_histories_sequence');
  });

  it('normalizes modality and procedure catalog records and enforces safety definitions', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const departmentId = new ObjectId();
    const now = new Date();

    const modality = new RadiologyModalityModel({
      facilityId,
      modalityCode: ' ct ',
      name: ' Computed Tomography ',
      normalizedName: 'placeholder',
      modalityType: 'CT',
      dicomModalityCode: ' ct ',
      description: 'Fictional CT modality',
      availableDepartmentIds: [departmentId, departmentId],
      supportsContrast: true,
      supportsPacsIntegration: true,
      pacsRoutingCode: ' ct-main ',
      orderable: true,
      effectiveFrom: now,
      effectiveThrough: null,
      status: 'ACTIVE',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(modality.validate()).resolves.toBeUndefined();
    expect(modality.modalityCode).toBe('CT');
    expect(modality.normalizedName).toBe('computed tomography');
    expect(modality.pacsRoutingCode).toBe('CT-MAIN');
    expect(modality.availableDepartmentIds).toHaveLength(1);

    const procedure = new RadiologyProcedureModel({
      facilityId,
      procedureCode: ' ct chest contrast ',
      name: ' CT Chest with Contrast ',
      normalizedName: 'placeholder',
      aliases: ['CECT Chest', ' cect chest ', 'Thorax CT'],
      normalizedAliases: [],
      description: 'Fictional contrast CT chest procedure',
      modalityId: modality._id,
      modalityCodeSnapshot: modality.modalityCode,
      modalityNameSnapshot: modality.name,
      modalityTypeSnapshot: modality.modalityType,
      dicomModalityCodeSnapshot: modality.dicomModalityCode,
      bodyRegions: [
        {
          code: ' chest ',
          name: 'Chest',
        },
      ],
      lateralityRequirement: 'NOT_APPLICABLE',
      permittedLateralities: ['NOT_APPLICABLE'],
      contrastRequirement: 'REQUIRED',
      permittedContrastRoutes: ['INTRAVENOUS'],
      preparationInstructions: [
        ' Fast for four hours ',
        'Fast for four hours',
      ],
      contraindications: ['Unresolved severe contrast reaction'],
      safetyScreeningRequirements: [
        'CONTRAST_ALLERGY',
        'PREGNANCY',
        'RENAL_RISK',
      ],
      expectedDurationMinutes: 30,
      routineTurnaroundMinutes: 1_440,
      urgentTurnaroundMinutes: 240,
      statTurnaroundMinutes: 60,
      availableDepartmentIds: [departmentId],
      schedulingRequired: true,
      requiresTechnician: true,
      requiresRadiologist: true,
      orderable: true,
      chargeCatalogItemId: new ObjectId(),
      effectiveFrom: now,
      effectiveThrough: null,
      status: 'ACTIVE',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(procedure.validate()).resolves.toBeUndefined();
    expect(procedure.procedureCode).toBe('CT_CHEST_CONTRAST');
    expect(procedure.normalizedAliases).toEqual([
      'cect chest',
      'thorax ct',
    ]);
    expect(procedure.preparationInstructions).toEqual([
      'Fast for four hours',
    ]);

    procedure.safetyScreeningRequirements = ['PREGNANCY'];

    await expect(procedure.validate()).rejects.toThrow(
      'Required or conditional contrast procedures require contrast-allergy screening',
    );
  });

  it('requires encounter-linked orders and validates attributed rejection or cancellation', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const patientId = new ObjectId();
    const now = new Date();

    const order = new RadiologyOrderModel({
      facilityId,
      orderNumber: ' rad-2026-000001 ',
      patientId,
      requestedPatientId: patientId,
      encounterId: new ObjectId(),
      registrationId: new ObjectId(),
      opdVisitId: new ObjectId(),
      departmentId: new ObjectId(),
      orderingProviderId: new ObjectId(),
      priority: 'STAT',
      status: 'ORDERED',
      clinicalIndication: 'Acute chest pain requiring imaging assessment',
      orderingNotes: 'Coordinate with treating team',
      orderedAt: now,
      itemCount: 1,
      activeItemCount: 1,
      scheduledItemCount: 0,
      completedItemCount: 0,
      reportedItemCount: 0,
      verifiedItemCount: 0,
      rejectedItemCount: 0,
      lastStatusChangedAt: now,
      lastStatusChangedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(order.validate()).resolves.toBeUndefined();
    expect(order.orderNumber).toBe('RAD-2026-000001');
    expect(order.canonicalRedirected).toBe(false);

    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.cancelledBy = actorId;

    await expect(order.validate()).rejects.toThrow(
      'Cancelled radiology orders require cancellation attribution and reason',
    );

    order.cancellationReason = 'Clinical team cancelled after reassessment';
    await expect(order.validate()).resolves.toBeUndefined();
  });

  it('stores an immutable standardized procedure snapshot and validates laterality, contrast, and screening', async () => {
    const facilityId = new ObjectId();
    const actorId = new ObjectId();
    const patientId = new ObjectId();
    const encounterId = new ObjectId();
    const procedureId = new ObjectId();
    const modalityId = new ObjectId();
    const departmentId = new ObjectId();
    const now = new Date();

    const item = new RadiologyOrderItemModel({
      facilityId,
      radiologyOrderId: new ObjectId(),
      patientId,
      encounterId,
      sequence: 1,
      radiologyProcedureId: procedureId,
      procedureDefinitionSnapshot: procedureSnapshot(
        procedureId,
        modalityId,
        departmentId,
      ),
      procedureDefinitionHash: 'a'.repeat(64),
      requestedLaterality: 'NOT_APPLICABLE',
      contrastRequested: true,
      requestedContrastRoute: 'INTRAVENOUS',
      specialInstructions: 'Assess renal-risk screening before examination',
      priority: 'URGENT',
      status: 'ORDERED',
      orderedAt: now,
      dueAt: new Date(now.getTime() + 240 * 60_000),
      preparationStatus: 'PENDING',
      safetyScreeningStatus: 'PENDING',
      billingStatus: 'PENDING',
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(item.validate()).resolves.toBeUndefined();

    expect(
      RadiologyOrderItemModel.schema.path('procedureDefinitionSnapshot')
        .options.immutable,
    ).toBe(true);
    expect(
      RadiologyOrderItemModel.schema.path('procedureDefinitionHash').options
        .immutable,
    ).toBe(true);

    item.contrastRequested = false;
    item.requestedContrastRoute = null;

    await expect(item.validate()).rejects.toThrow(
      'Required-contrast radiology procedures must request contrast',
    );
  });

  it('keeps sensitive clinical text excluded from ordinary query projections', () => {
    expect(
      RadiologyOrderModel.schema.path('clinicalIndication').options.select,
    ).toBe(false);
    expect(
      RadiologyOrderModel.schema.path('orderingNotes').options.select,
    ).toBe(false);
    expect(
      RadiologyOrderItemModel.schema.path('specialInstructions').options
        .select,
    ).toBe(false);
    expect(
      RadiologyOrderItemStatusHistoryModel.schema.path('reason').options
        .select,
    ).toBe(false);
  });

  it('rejects lifecycle history records that do not represent a state change', async () => {
    const actorId = new ObjectId();

    const history = new RadiologyOrderStatusHistoryModel({
      facilityId: new ObjectId(),
      radiologyOrderId: new ObjectId(),
      patientId: new ObjectId(),
      encounterId: new ObjectId(),
      sequence: 2,
      fromStatus: 'ACCEPTED',
      toStatus: 'ACCEPTED',
      changeSource: 'RADIOLOGY_STAFF',
      occurredAt: new Date(),
      changedBy: actorId,
      ...transactionFields(),
      ...actorFields(actorId),
    });

    await expect(history.validate()).rejects.toThrow(
      'Radiology order status history must represent a state change',
    );
  });
});