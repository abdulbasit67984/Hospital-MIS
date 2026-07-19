import {
  createHash,
} from 'node:crypto';

import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  RadiologyAccessPolicyPort,
  RadiologyAuditEntry,
  RadiologyCatalogRepositoryPort,
  RadiologyClinicalContextPort,
  RadiologyEncryptedSnapshot,
  RadiologyOrderRepositoryPort,
  RadiologyOutboxMessage,
  RadiologyRealtimeMessage,
  RadiologySnapshotCryptoPort,
  RadiologyTransactionCompensation,
  RadiologyTransactionRequest,
} from '../radiology.ports.js';

import type {
  RadiologyModalityRecord,
  RadiologyOrderItemRecord,
  RadiologyOrderItemStatusHistoryRecord,
  RadiologyOrderRecord,
  RadiologyOrderStatusHistoryRecord,
  RadiologyProcedureRecord,
} from '../radiology.persistence.types.js';

import type {
  RadiologyActorContext,
  RadiologyClinicalContext,
} from '../radiology.types.js';

import {
  RadiologyCommandService,
  type RadiologyChargeCancellationRequest,
  type RadiologyChargeRequest,
} from '../services/radiology-command.service.js';

import {
  CreateRadiologyProcedureWorkflow,
} from '../workflows/radiology-catalog.workflows.js';

import {
  CreateRadiologyOrderWorkflow,
} from '../workflows/create-radiology-order.workflow.js';

import {
  AcceptRadiologyOrderWorkflow,
  CancelRadiologyOrderWorkflow,
} from '../workflows/radiology-order-lifecycle.workflows.js';

import {
  RADIOLOGY_COMPENSATION_TYPES,
} from '../radiology.transaction.constants.js';

const now = new Date('2026-07-19T08:00:00.000Z');

function oid(): Types.ObjectId {
  return new Types.ObjectId();
}

function actor(
  facilityId: string,
  userId: string,
): RadiologyActorContext {
  return {
    facilityId,
    userId,
    correlationId: 'corr-radiology-batch-3',
    roleKeys: ['RADIOLOGY_STAFF', 'CLINICAL_MANAGEMENT_DOCTOR'],
    permissionKeys: [
      'radiology.catalog.manage',
      'radiology.orders.create',
      'radiology.orders.manage',
      'radiology.orders.cancel',
    ],
  };
}

function modalityRecord(
  facilityId: Types.ObjectId,
  departmentId: Types.ObjectId,
  actorUserId: Types.ObjectId,
): RadiologyModalityRecord {
  return {
    _id: oid(),
    facilityId,
    modalityCode: 'CT',
    name: 'Computed Tomography',
    normalizedName: 'computed tomography',
    modalityType: 'CT',
    dicomModalityCode: 'CT',
    description: 'Fictional modality description',
    availableDepartmentIds: [departmentId],
    supportsContrast: true,
    supportsPacsIntegration: true,
    pacsRoutingCode: 'CT_MAIN',
    orderable: true,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'ACTIVE',
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    transactionId: 'seed-transaction',
    correlationId: 'seed-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
}

function procedureRecord(
  facilityId: Types.ObjectId,
  departmentId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  modality: RadiologyModalityRecord,
): RadiologyProcedureRecord {
  return {
    _id: oid(),
    facilityId,
    procedureCode: 'CT_CHEST_CONTRAST',
    name: 'CT Chest with Contrast',
    normalizedName: 'ct chest with contrast',
    aliases: ['CECT Chest'],
    normalizedAliases: ['cect chest'],
    description: 'Fictional procedure description',
    modalityId: modality._id,
    modalityCodeSnapshot: modality.modalityCode,
    modalityNameSnapshot: modality.name,
    modalityTypeSnapshot: modality.modalityType,
    dicomModalityCodeSnapshot: modality.dicomModalityCode,
    bodyRegions: [
      {
        code: 'CHEST',
        name: 'Chest',
      },
    ],
    lateralityRequirement: 'NOT_APPLICABLE',
    permittedLateralities: ['NOT_APPLICABLE'],
    contrastRequirement: 'REQUIRED',
    permittedContrastRoutes: ['INTRAVENOUS'],
    preparationInstructions: ['Fast for four hours'],
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
    chargeCatalogItemId: oid(),
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveThrough: null,
    status: 'ACTIVE',
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    transactionId: 'seed-transaction',
    correlationId: 'seed-correlation',
    schemaVersion: 1,
    version: 0,
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeSnapshotCrypto implements RadiologySnapshotCryptoPort {
  public protect(
    value: unknown,
    associatedData: string,
  ): {
    encryptedValue: RadiologyEncryptedSnapshot;
    valueHash: string;
  } {
    return {
      encryptedValue: {
        algorithm: 'AES-256-GCM',
        keyVersion: 'test-key-v1',
        initializationVector: 'test-iv',
        authenticationTag: 'test-tag',
        ciphertext: Buffer.from(JSON.stringify(value)).toString('base64'),
      },
      valueHash: this.hash(value, associatedData),
    };
  }

  public unprotect<T>(encryptedValue: RadiologyEncryptedSnapshot): T {
    return JSON.parse(
      Buffer.from(encryptedValue.ciphertext, 'base64').toString('utf8'),
    ) as T;
  }

  public hash(value: unknown, associatedData: string): string {
    return createHash('sha256')
      .update(associatedData)
      .update(JSON.stringify(value))
      .digest('hex');
  }

  public matchesHash(
    value: unknown,
    associatedData: string,
    expectedHash: string,
  ): boolean {
    return this.hash(value, associatedData) === expectedHash;
  }

  public needsRotation(): boolean {
    return false;
  }
}

class FakeTransactionManager {
  public readonly requests: RadiologyTransactionRequest<unknown>[] = [];
  public readonly compensations: RadiologyTransactionCompensation[] = [];
  public readonly checkpoints: Array<{
    state: string;
    data?: Record<string, unknown>;
  }> = [];
  private sequence = 0;

  public async execute<T>(
    request: RadiologyTransactionRequest<T>,
  ): Promise<T> {
    this.requests.push(request as RadiologyTransactionRequest<unknown>);
    this.sequence += 1;

    return request.execute({
      transactionId: `tx-radiology-${this.sequence}`,
      idempotencyKey: request.idempotencyKey,
      checkpoint: async (state, data) => {
        this.checkpoints.push({
          state,
          ...(data === undefined ? {} : { data }),
        });
      },
      registerCompensation: async (compensation) => {
        this.compensations.push(compensation);
      },
    });
  }
}

class MemoryOrderRepository {
  public order: RadiologyOrderRecord | null = null;
  public items: RadiologyOrderItemRecord[] = [];
  public histories: RadiologyOrderStatusHistoryRecord[] = [];
  public itemHistories: RadiologyOrderItemStatusHistoryRecord[] = [];

  public async findById(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderRecord | null> {
    return this.order !== null &&
      this.order.facilityId.toHexString() === facilityId &&
      this.order._id.toHexString() === orderId
      ? this.order
      : null;
  }

  public async listItems(
    facilityId: string,
    orderId: string,
  ): Promise<RadiologyOrderItemRecord[]> {
    return this.items.filter(
      (item) =>
        item.facilityId.toHexString() === facilityId &&
        item.radiologyOrderId.toHexString() === orderId,
    );
  }

  public async create(
    order: Omit<RadiologyOrderRecord, 'createdAt' | 'updatedAt'>,
    items: ReadonlyArray<
      Omit<RadiologyOrderItemRecord, 'createdAt' | 'updatedAt'>
    >,
    orderHistory: Omit<
      RadiologyOrderStatusHistoryRecord,
      'createdAt' | 'updatedAt'
    >,
    itemHistories: ReadonlyArray<
      Omit<
        RadiologyOrderItemStatusHistoryRecord,
        'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    order: RadiologyOrderRecord;
    items: RadiologyOrderItemRecord[];
  }> {
    this.order = {
      ...order,
      createdAt: now,
      updatedAt: now,
    };
    this.items = items.map((item) => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));
    this.histories = [
      {
        ...orderHistory,
        createdAt: now,
        updatedAt: now,
      },
    ];
    this.itemHistories = itemHistories.map((history) => ({
      ...history,
      createdAt: now,
      updatedAt: now,
    }));

    return {
      order: this.order,
      items: this.items,
    };
  }

  public async updateItemBilling(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    billingStatus: RadiologyOrderItemRecord['billingStatus'],
    accountChargeId: string | null,
    billingFailureCode: string | null,
    actorUserId: string,
  ): Promise<RadiologyOrderItemRecord | null> {
    const index = this.items.findIndex(
      (item) =>
        item.facilityId.toHexString() === facilityId &&
        item._id.toHexString() === orderItemId &&
        item.version === expectedVersion,
    );

    if (index < 0) {
      return null;
    }

    const current = this.items[index] as RadiologyOrderItemRecord;
    const updated: RadiologyOrderItemRecord = {
      ...current,
      billingStatus,
      accountChargeId:
        accountChargeId === null ? null : new Types.ObjectId(accountChargeId),
      billingFailureCode,
      updatedBy: new Types.ObjectId(actorUserId),
      updatedAt: now,
      version: current.version + 1,
    };
    this.items[index] = updated;
    return updated;
  }

  public async transitionStatus(
    facilityId: string,
    orderId: string,
    expectedVersion: number,
    fromStatuses: readonly RadiologyOrderRecord['status'][],
    update: Partial<RadiologyOrderRecord>,
  ): Promise<RadiologyOrderRecord | null> {
    if (
      this.order === null ||
      this.order.facilityId.toHexString() !== facilityId ||
      this.order._id.toHexString() !== orderId ||
      this.order.version !== expectedVersion ||
      !fromStatuses.includes(this.order.status)
    ) {
      return null;
    }

    this.order = {
      ...this.order,
      ...update,
      updatedAt: now,
      version: this.order.version + 1,
    };
    return this.order;
  }

  public async transitionItem(
    facilityId: string,
    orderItemId: string,
    expectedVersion: number,
    fromStatuses: readonly RadiologyOrderItemRecord['status'][],
    update: Partial<RadiologyOrderItemRecord>,
  ): Promise<RadiologyOrderItemRecord | null> {
    const index = this.items.findIndex(
      (item) =>
        item.facilityId.toHexString() === facilityId &&
        item._id.toHexString() === orderItemId &&
        item.version === expectedVersion &&
        fromStatuses.includes(item.status),
    );

    if (index < 0) {
      return null;
    }

    const current = this.items[index] as RadiologyOrderItemRecord;
    const updated: RadiologyOrderItemRecord = {
      ...current,
      ...update,
      updatedAt: now,
      version: current.version + 1,
    };
    this.items[index] = updated;
    return updated;
  }

  public async listHistory(): Promise<RadiologyOrderStatusHistoryRecord[]> {
    return this.histories;
  }

  public async listItemHistory(
    _facilityId: string,
    orderItemId: string,
  ): Promise<RadiologyOrderItemStatusHistoryRecord[]> {
    return this.itemHistories.filter(
      (history) =>
        history.radiologyOrderItemId.toHexString() === orderItemId,
    );
  }

  public async appendHistory(
    history: Omit<
      RadiologyOrderStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderStatusHistoryRecord> {
    const created: RadiologyOrderStatusHistoryRecord = {
      ...history,
      _id: oid(),
      createdAt: now,
      updatedAt: now,
    };
    this.histories.push(created);
    return created;
  }

  public async appendItemHistory(
    history: Omit<
      RadiologyOrderItemStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<RadiologyOrderItemStatusHistoryRecord> {
    const created: RadiologyOrderItemStatusHistoryRecord = {
      ...history,
      _id: oid(),
      createdAt: now,
      updatedAt: now,
    };
    this.itemHistories.push(created);
    return created;
  }
}

describe('Radiology catalog and order transaction workflows', () => {
  it('creates a modality-linked procedure with safe events and delete compensation', async () => {
    const facilityId = oid();
    const departmentId = oid();
    const actorUserId = oid();
    const modality = modalityRecord(facilityId, departmentId, actorUserId);
    let createdProcedure: RadiologyProcedureRecord | null = null;
    const audits: RadiologyAuditEntry[] = [];
    const outbox: RadiologyOutboxMessage[] = [];
    const realtime: RadiologyRealtimeMessage[] = [];
    const transactionManager = new FakeTransactionManager();
    const catalog = {
      findModalityById: async () => modality,
      createProcedure: async (
        input: Omit<
          RadiologyProcedureRecord,
          '_id' | 'createdAt' | 'updatedAt'
        >,
      ) => {
        createdProcedure = {
          ...input,
          _id: oid(),
          createdAt: now,
          updatedAt: now,
        };
        return createdProcedure;
      },
    } as unknown as RadiologyCatalogRepositoryPort;
    const accessPolicy = {
      requireActiveActorStaffId: async () => oid().toHexString(),
      authorize: async () => ({
        allowed: true,
        accessMode: 'RADIOLOGY_OPERATIONAL' as const,
        minimumNecessaryFields: [],
        auditSensitiveRead: false,
      }),
    } satisfies RadiologyAccessPolicyPort;
    const support = new RadiologyCommandService(
      catalog,
      {} as RadiologyOrderRepositoryPort,
      {} as RadiologyClinicalContextPort,
      accessPolicy,
      {
        transactionManager,
        audit: {
          append: async (entry) => {
            audits.push(entry);
          },
        },
        outbox: {
          enqueue: async (message) => {
            outbox.push(message);
          },
        },
        realtime: {
          publish: async (message) => {
            realtime.push(message);
          },
        },
        clock: {
          now: () => now,
        },
        sequence: {
          next: async () => ({ key: 'unused', value: 1 }),
        },
        canonicalPatient: {
          resolve: async () => {
            throw new Error('unused');
          },
        },
        snapshotCrypto: new FakeSnapshotCrypto(),
        charges: {
          requestCharge: async () => ({
            status: 'PENDING',
            accountChargeId: null,
          }),
          requestCancellation: async () => undefined,
        },
      },
    );
    const workflow = new CreateRadiologyProcedureWorkflow(support);

    const result = await workflow.execute({
      actor: actor(facilityId.toHexString(), actorUserId.toHexString()),
      idempotencyKey: 'radiology-procedure-create-0001',
      input: {
        procedureCode: 'ct chest contrast',
        name: 'CT Chest with Contrast',
        aliases: ['CECT Chest'],
        description: 'Fictional procedure description',
        modalityId: modality._id.toHexString(),
        bodyRegions: [
          {
            code: 'chest',
            name: 'Chest',
          },
        ],
        lateralityRequirement: 'NOT_APPLICABLE',
        permittedLateralities: ['NOT_APPLICABLE'],
        contrastRequirement: 'REQUIRED',
        permittedContrastRoutes: ['INTRAVENOUS'],
        preparationInstructions: ['Fast for four hours'],
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
        availableDepartmentIds: [departmentId.toHexString()],
        chargeCatalogItemId: oid().toHexString(),
      },
    });

    expect(result).toBe(createdProcedure);
    expect(result.modalityCodeSnapshot).toBe('CT');
    expect(result.bodyRegions[0]?.code).toBe('CHEST');
    expect(audits).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(realtime).toHaveLength(1);
    expect(outbox[0]?.payload).not.toHaveProperty('description');
    expect(outbox[0]?.payload).not.toHaveProperty('contraindications');
    expect(transactionManager.compensations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: RADIOLOGY_COMPENSATION_TYPES.DELETE_CREATED_RECORD,
        }),
      ]),
    );
  });

  it('creates, accepts, and cancels an encounter-linked order without leaking clinical text', async () => {
    const facilityId = oid();
    const departmentId = oid();
    const actorUserId = oid();
    const providerStaffId = oid();
    const patientId = oid();
    const encounterId = oid();
    const modality = modalityRecord(facilityId, departmentId, actorUserId);
    const procedure = procedureRecord(
      facilityId,
      departmentId,
      actorUserId,
      modality,
    );
    const context: RadiologyClinicalContext = {
      encounterId: encounterId.toHexString(),
      facilityId: facilityId.toHexString(),
      patientId: patientId.toHexString(),
      requestedPatientId: patientId.toHexString(),
      canonicalRedirected: false,
      confidentiality: 'STANDARD',
      registrationId: null,
      opdVisitId: null,
      queueTokenId: null,
      departmentId: departmentId.toHexString(),
      clinicId: null,
      servicePointId: null,
      orderingProviderId: providerStaffId.toHexString(),
      assignedProviderIds: [providerStaffId.toHexString()],
    };
    const transactionManager = new FakeTransactionManager();
    const orderRepository = new MemoryOrderRepository();
    const audits: RadiologyAuditEntry[] = [];
    const outbox: RadiologyOutboxMessage[] = [];
    const realtime: RadiologyRealtimeMessage[] = [];
    const chargeRequests: RadiologyChargeRequest[] = [];
    const chargeCancellations: RadiologyChargeCancellationRequest[] = [];
    let sequence = 0;
    const catalog = {
      findProceduresByIds: async () => [procedure],
      findModalityById: async () => modality,
    } as unknown as RadiologyCatalogRepositoryPort;
    const accessPolicy = {
      requireActiveActorStaffId: async () => providerStaffId.toHexString(),
      authorize: async () => ({
        allowed: true,
        accessMode: 'RADIOLOGY_OPERATIONAL' as const,
        minimumNecessaryFields: [],
        auditSensitiveRead: false,
      }),
    } satisfies RadiologyAccessPolicyPort;
    const support = new RadiologyCommandService(
      catalog,
      orderRepository as unknown as RadiologyOrderRepositoryPort,
      {
        resolveActiveEncounter: async () => context,
      },
      accessPolicy,
      {
        transactionManager,
        audit: {
          append: async (entry) => {
            audits.push(entry);
          },
        },
        outbox: {
          enqueue: async (message) => {
            outbox.push(message);
          },
        },
        realtime: {
          publish: async (message) => {
            realtime.push(message);
          },
        },
        clock: {
          now: () => now,
        },
        sequence: {
          next: async (_facilityId, key) => {
            sequence += 1;
            return { key, value: sequence };
          },
        },
        canonicalPatient: {
          resolve: async () => ({
            requestedPatientId: patientId.toHexString(),
            canonicalPatientId: patientId.toHexString(),
            redirected: false,
            mergeChain: [],
          }),
        },
        snapshotCrypto: new FakeSnapshotCrypto(),
        charges: {
          requestCharge: async (request) => {
            chargeRequests.push(request);
            return {
              status: 'CHARGED',
              accountChargeId: oid().toHexString(),
            };
          },
          requestCancellation: async (request) => {
            chargeCancellations.push(request);
          },
        },
      },
    );
    const requestActor = actor(
      facilityId.toHexString(),
      actorUserId.toHexString(),
    );
    const createWorkflow = new CreateRadiologyOrderWorkflow(support);

    const created = await createWorkflow.execute({
      actor: requestActor,
      idempotencyKey: 'radiology-order-create-0001',
      input: {
        encounterId: encounterId.toHexString(),
        priority: 'URGENT',
        clinicalIndication: 'Fictional sensitive clinical indication',
        orderingNotes: 'Fictional sensitive ordering note',
        items: [
          {
            procedureId: procedure._id.toHexString(),
            requestedLaterality: 'NOT_APPLICABLE',
            contrastRequested: true,
            requestedContrastRoute: 'INTRAVENOUS',
            specialInstructions: 'Fictional sensitive instruction',
          },
        ],
      },
    });

    expect(created.order.orderingProviderId.equals(providerStaffId)).toBe(true);
    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.procedureDefinitionHash).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(created.items[0]?.billingStatus).toBe('CHARGED');
    expect(chargeRequests).toHaveLength(1);
    expect(transactionManager.requests[0]?.journalPayload).not.toHaveProperty(
      'clinicalIndication',
    );
    expect(transactionManager.requests[0]?.journalPayload).not.toHaveProperty(
      'orderingNotes',
    );
    expect(transactionManager.requests[0]?.idempotencyPayload).toEqual(
      expect.objectContaining({
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(outbox[0]?.payload).not.toHaveProperty('clinicalIndication');
    expect(outbox[0]?.payload).not.toHaveProperty('orderingNotes');

    const acceptWorkflow = new AcceptRadiologyOrderWorkflow(support);
    const accepted = await acceptWorkflow.execute({
      actor: requestActor,
      orderId: created.order._id.toHexString(),
      idempotencyKey: 'radiology-order-accept-0001',
      input: {
        expectedVersion: created.order.version,
      },
    });

    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptedBy?.equals(providerStaffId)).toBe(true);
    expect(orderRepository.items[0]?.accessionNumber).toMatch(
      /^ACC-2026-\d{7}$/u,
    );

    const cancelWorkflow = new CancelRadiologyOrderWorkflow(support);
    const cancelled = await cancelWorkflow.execute({
      actor: requestActor,
      orderId: accepted._id.toHexString(),
      idempotencyKey: 'radiology-order-cancel-0001',
      input: {
        expectedVersion: accepted.version,
        reason: 'Fictional documented cancellation reason',
      },
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledBy?.equals(providerStaffId)).toBe(true);
    expect(orderRepository.items[0]?.status).toBe('CANCELLED');
    expect(orderRepository.items[0]?.billingStatus).toBe('REFUND_PENDING');
    expect(chargeCancellations).toHaveLength(1);
    expect(outbox.at(-1)?.payload).not.toHaveProperty('cancellationReason');
    expect(realtime.length).toBeGreaterThanOrEqual(6);
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'radiology.order.created',
        'radiology.order.accepted',
        'radiology.order.cancelled',
      ]),
    );
    expect(
      transactionManager.compensations.filter(
        (compensation) =>
          compensation.type ===
          RADIOLOGY_COMPENSATION_TYPES.RESTORE_ENCRYPTED_RECORD,
      ).length,
    ).toBeGreaterThanOrEqual(4);
  });
});