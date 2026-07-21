import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  ClientSession,
} from 'mongoose';

import type {
  CreatedStockReservationAggregate,
  StockReservationRecord,
} from '../inventory/inventory-stock.persistence.types.js';

import type {
  ConsumeDispensingReservationInput,
  DispensingReversalResult,
  DispensingStockResult,
  ReleaseStockReservationInput,
  ReserveStockInput,
  ReverseDispensingInput,
} from '../inventory/inventory-stock.contracts.js';

import type {
  InventoryStockCommandContext,
} from '../inventory/inventory-stock.contracts.js';

import type {
  EligibleFefoBatchRecord,
  InventoryItemRecord,
} from '../inventory/inventory.persistence.types.js';

import type {
  InventoryUnitConversionPort,
} from '../inventory/inventory.ports.js';

import type {
  CreateDispensationIntakeInput,
  PharmacyDispensationListQuery,
  PharmacyDispensingActorContext,
  PharmacyOperationalContext,
  PharmacyPage,
  PharmacyPricingRequest,
  PharmacyPricingResult,
  PharmacySafetyEvaluationRequest,
  PharmacySafetyFinding,
} from './pharmacy-dispensing.contracts.js';

import type {
  PharmacyActorIdentityRecord,
  PharmacyAdmissionRecord,
  PharmacyControlledRegisterRecord,
  PharmacyCounsellingRecord,
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
  PharmacyDispensationReversalRecord,
  PharmacyDispensationStatusHistoryRecord,
  PharmacyDispensationSubstitutionRecord,
  PharmacyDispensingLabelPrintRecord,
  PharmacyDispensingLabelRecord,
  PharmacyEncounterRecord,
  PharmacyFormularyItemRecord,
  PharmacyInventoryItemRecord,
  PharmacyLocationRecord,
  PharmacyMongoSession,
  PharmacyPatientRecord,
  PharmacyPatientReturnItemRecord,
  PharmacyPatientReturnRecord,
  PharmacyPrescriptionItemRecord,
  PharmacyPrescriptionRecord,
  PharmacyPrescriptionWarningRecord,
  PharmacyReviewEventRecord,
  PharmacyStaffRecord,
  PharmacyWardRecord,
} from './pharmacy-dispensing.persistence.types.js';

export interface PharmacyActorResolverInput {
  userId: string;
  facilityId: string;
  correlationId: string;
  permissions: ReadonlySet<PermissionKey>;
  ipAddress?: string;
  userAgent?: string;
  breakGlassReason?: string;
}

export interface PharmacyActorResolverPort {
  resolve(input: PharmacyActorResolverInput): Promise<PharmacyDispensingActorContext>;
}

export interface PharmacyDispensingContextRepositoryPort {
  findActorIdentity(userId: string): Promise<PharmacyActorIdentityRecord | null>;
  findStaff(facilityId: string, staffId: string): Promise<PharmacyStaffRecord | null>;
  findPatient(facilityId: string, patientId: string): Promise<PharmacyPatientRecord | null>;
  findEncounter(facilityId: string, encounterId: string): Promise<PharmacyEncounterRecord | null>;
  findAdmission(facilityId: string, admissionId: string): Promise<PharmacyAdmissionRecord | null>;
  findWard(facilityId: string, wardId: string): Promise<PharmacyWardRecord | null>;
  findLocation(facilityId: string, locationId: string): Promise<PharmacyLocationRecord | null>;
}

export interface PharmacyDispensingContextPort {
  requireActiveActorStaff(
    actor: Readonly<{ userId: string; facilityId: string }>,
  ): Promise<PharmacyOperationalContext['actor']>;

  resolveOperationalContext(
    actor: PharmacyDispensingActorContext,
    locationId: string,
    options?: Readonly<{
      requireControlledMedicine?: boolean;
      admissionId?: string | null;
      wardId?: string | null;
      patientId?: string | null;
      encounterId?: string | null;
    }>,
  ): Promise<PharmacyOperationalContext>;
}

export interface PharmacyPrescriptionRepositoryPort {
  findPrescription(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionRecord | null>;

  listPrescriptionItems(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionItemRecord[]>;

  listPrescriptionWarnings(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionWarningRecord[]>;

  findFormularyItem(
    facilityId: string,
    formularyItemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyFormularyItemRecord | null>;

  findInventoryItemForFormulary(
    facilityId: string,
    formularyItemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyInventoryItemRecord | null>;

  updateDispensingProgress(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    updates: ReadonlyArray<{
      prescriptionItemId: string;
      expectedVersion: number;
      dispensedQuantity: string;
      lastDispensedAt: Date;
      lastDispensationId: string;
    }>,
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    session: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionRecord | null>;
}

export interface PharmacyDispensationRepositoryPort {
  findById(
    facilityId: string,
    dispensationId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null>;

  findActiveByPrescription(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null>;

  list(
    facilityId: string,
    query: PharmacyDispensationListQuery,
  ): Promise<PharmacyPage<PharmacyDispensationRecord>>;

  listItems(
    facilityId: string,
    dispensationId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord[]>;

  findItemById(
    facilityId: string,
    dispensationId: string,
    itemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord | null>;

  createAggregate(
    input: CreateDispensationIntakeInput,
    prepared: Readonly<{
      dispensationNumber: string;
      patientId: string;
      prescription: PharmacyPrescriptionRecord;
      prescriptionItems: readonly PharmacyPrescriptionItemRecord[];
      itemContexts: ReadonlyMap<
        string,
        Readonly<{
          formulary: PharmacyFormularyItemRecord;
          inventory: PharmacyInventoryItemRecord;
          requestedQuantity: string;
        }>
      >;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      queuedAt: Date;
      expiresAt: Date;
      operationKey: string;
    }>,
    session: PharmacyMongoSession,
  ): Promise<{
    dispensation: PharmacyDispensationRecord;
    items: PharmacyDispensationItemRecord[];
  }>;

  updateDispensation(
    facilityId: string,
    dispensationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null>;

  updateItem(
    facilityId: string,
    dispensationId: string,
    itemId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord | null>;

  appendStatusHistory(
    record: Omit<
      PharmacyDispensationStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationStatusHistoryRecord>;

  appendReviewEvent(
    record: Omit<PharmacyReviewEventRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyReviewEventRecord>;

  createSubstitution(
    record: Omit<
      PharmacyDispensationSubstitutionRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationSubstitutionRecord>;

  findSubstitution(
    facilityId: string,
    substitutionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationSubstitutionRecord | null>;

  createControlledRegisterEntry(
    record: Omit<PharmacyControlledRegisterRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyControlledRegisterRecord>;

  createLabel(
    record: Omit<PharmacyDispensingLabelRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensingLabelRecord>;

  appendLabelPrint(
    record: Omit<
      PharmacyDispensingLabelPrintRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensingLabelPrintRecord>;

  createCounsellingRecord(
    record: Omit<PharmacyCounsellingRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyCounsellingRecord>;

  createPatientReturn(
    aggregate: Readonly<{
      header: Omit<PharmacyPatientReturnRecord, '_id' | 'createdAt' | 'updatedAt'>;
      items: ReadonlyArray<
        Omit<PharmacyPatientReturnItemRecord, '_id' | 'createdAt' | 'updatedAt'>
      >;
    }>,
    session: PharmacyMongoSession,
  ): Promise<{
    header: PharmacyPatientReturnRecord;
    items: PharmacyPatientReturnItemRecord[];
  }>;

  createReversal(
    record: Omit<
      PharmacyDispensationReversalRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationReversalRecord>;
}

export interface PharmacyWorklistRepositoryPort {
  listPending(
    facilityId: string,
    query: PharmacyDispensationListQuery,
  ): Promise<PharmacyPage<PharmacyDispensationRecord>>;

  listRecoveryRequired(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<PharmacyDispensationRecord[]>;

  listExpirable(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<PharmacyDispensationRecord[]>;

  listControlledDiscrepancies(
    facilityId: string,
    locationId: string | null,
    limit: number,
  ): Promise<PharmacyControlledRegisterRecord[]>;
}

export interface PharmacyInventoryQueryPort {
  findInventoryItem(
    facilityId: string,
    itemId: string,
  ): Promise<InventoryItemRecord | null>;

  listEligibleFefoBatches(
    facilityId: string,
    locationId: string,
    itemId: string,
    at: Date,
    limit?: number,
  ): Promise<EligibleFefoBatchRecord[]>;
}

export interface PharmacyInventoryIntegrationPort {
  readonly unitConversion: InventoryUnitConversionPort;

  reserveForDispensing(
    context: InventoryStockCommandContext,
    input: ReserveStockInput,
    session: PharmacyMongoSession,
  ): Promise<CreatedStockReservationAggregate>;

  consumeDispensingReservation(
    context: InventoryStockCommandContext,
    reservationId: string,
    input: ConsumeDispensingReservationInput,
    session: PharmacyMongoSession,
  ): Promise<DispensingStockResult>;

  releaseDispensingReservation(
    context: InventoryStockCommandContext,
    reservationId: string,
    input: ReleaseStockReservationInput,
    session: PharmacyMongoSession,
  ): Promise<StockReservationRecord>;

  reverseDispensing(
    context: InventoryStockCommandContext,
    input: ReverseDispensingInput,
    session: PharmacyMongoSession,
  ): Promise<DispensingReversalResult>;
}

export interface PharmacyPricingPort {
  resolve(request: PharmacyPricingRequest): Promise<PharmacyPricingResult>;
}

export interface PharmacySafetyPort {
  evaluate(request: PharmacySafetyEvaluationRequest): Promise<readonly PharmacySafetyFinding[]>;
}

export interface PharmacyBillingChargeInput {
  facilityId: string;
  patientId: string;
  encounterId: string | null;
  admissionId: string | null;
  dispensationId: string;
  dispensationItemId: string;
  quantity: string;
  unitPrice: string;
  grossAmount: string;
  discountAmount: string;
  taxAmount: string;
  netAmount: string;
  currency: string;
  pricingSource: string;
}

export interface PharmacyBillingPort {
  createDispensingCharges(
    operationKey: string,
    charges: readonly PharmacyBillingChargeInput[],
    session: ClientSession,
  ): Promise<Readonly<{ billingRecordId: string }>>;

  reverseDispensingCharges(
    operationKey: string,
    dispensationId: string,
    reason: string,
    session: ClientSession,
  ): Promise<Readonly<{ billingRecordId: string }>>;
}

export interface PharmacyTransactionCompensation {
  key: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface PharmacyTransactionContext {
  transactionId: string;
  idempotencyKey: string;
  session: PharmacyMongoSession;
  checkpoint(state: string, data?: Record<string, unknown>): Promise<void>;
  registerCompensation(compensation: PharmacyTransactionCompensation): Promise<void>;
}

export interface PharmacyTransactionRequest<T> {
  transactionType: string;
  idempotencyKey: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  lockKeys: string[];
  idempotencyPayload: unknown;
  journalPayload: Record<string, unknown>;
  execute(context: PharmacyTransactionContext): Promise<T>;
}

export interface PharmacyTransactionManagerPort {
  execute<T>(request: PharmacyTransactionRequest<T>): Promise<T>;
}

export interface PharmacyAuditEntry {
  transactionId: string;
  deduplicationKey: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  actorStaffId: string;
  facilityId: string;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  reason?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface PharmacyAuditPort {
  append(entry: PharmacyAuditEntry, session?: PharmacyMongoSession): Promise<void>;
}

export interface PharmacyOutboxMessage {
  transactionId: string;
  deduplicationKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string;
  facilityId: string;
  correlationId: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface PharmacyOutboxPort {
  enqueue(message: PharmacyOutboxMessage, session?: PharmacyMongoSession): Promise<void>;
}

export interface PharmacyRealtimeMessage {
  eventType: string;
  facilityId: string;
  pharmacyLocationId: string;
  payload: Record<string, unknown>;
}

export interface PharmacyRealtimePort {
  publish(message: PharmacyRealtimeMessage): Promise<void>;
}

export interface PharmacyClockPort {
  now(): Date;
}

export interface PharmacySequenceAllocation {
  key: string;
  value: number;
}

export interface PharmacySequencePort {
  next(facilityId: string, key: string): Promise<PharmacySequenceAllocation>;
}

export interface PharmacyAccessRequest {
  actor: PharmacyDispensingActorContext;
  action:
    | 'READ'
    | 'QUEUE_READ'
    | 'VERIFY'
    | 'DISPENSE'
    | 'CONTROLLED_DISPENSE'
    | 'RETURN'
    | 'REVERSAL'
    | 'PRICE_OVERRIDE'
    | 'COST_READ'
    | 'REPORT_READ'
    | 'REPORT_EXPORT'
    | 'CONFIGURATION_MANAGE';
  location?: PharmacyLocationRecord;
  dispensation?: PharmacyDispensationRecord;
  patientId?: string;
  admissionId?: string | null;
  witnessStaffId?: string | null;
}

export interface PharmacyAccessDecision {
  allowed: boolean;
  accessMode:
    | 'PHARMACY_OPERATIONAL'
    | 'PHARMACY_MANAGER'
    | 'FACILITY_ADMINISTRATOR'
    | 'BREAK_GLASS'
    | 'DENIED';
  includeCost: boolean;
  minimumNecessaryFields: readonly string[];
  auditSensitiveRead: boolean;
  denialReason?: string;
}

export interface PharmacyAccessPolicyPort {
  authorize(request: PharmacyAccessRequest): Promise<PharmacyAccessDecision>;
}

export interface PharmacyDispensingDependencies {
  context: PharmacyDispensingContextPort;
  accessPolicy: PharmacyAccessPolicyPort;
  prescriptions: PharmacyPrescriptionRepositoryPort;
  repository: PharmacyDispensationRepositoryPort;
  worklists: PharmacyWorklistRepositoryPort;
  inventoryQueries: PharmacyInventoryQueryPort;
  inventory: PharmacyInventoryIntegrationPort;
  pricing: PharmacyPricingPort;
  safety: PharmacySafetyPort;
  billing: PharmacyBillingPort;
  transactions: PharmacyTransactionManagerPort;
  audit: PharmacyAuditPort;
  outbox: PharmacyOutboxPort;
  realtime: PharmacyRealtimePort;
  sequence: PharmacySequencePort;
  clock: PharmacyClockPort;
}

export type PharmacyReservationAggregate = CreatedStockReservationAggregate;