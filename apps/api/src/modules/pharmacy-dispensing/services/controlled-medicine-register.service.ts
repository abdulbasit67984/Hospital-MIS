import Decimal from 'decimal.js';

import {
  Decimal128,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensationAllocationRecord,
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
  PharmacyMongoSession,
} from '../pharmacy-dispensing.persistence.types.js';

import type {
  PharmacyDispensingActorContext,
  PharmacyOperationalContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacySequencePort,
} from '../pharmacy-dispensing.ports.js';

import {
  PHARMACY_CONTROLLED_REGISTER_NUMBER_SEQUENCE_NAMESPACE,
} from '../pharmacy-dispensing.constants.js';

import {
  normalizePharmacyDecimal,
  pharmacyOperationKey,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyControlledRegisterRepository,
} from '../repositories/pharmacy-controlled-register.repository.js';

export interface ControlledRegisterDispensingInput {
  actor: PharmacyDispensingActorContext;
  operational: PharmacyOperationalContext;
  dispensation: PharmacyDispensationRecord;
  item: PharmacyDispensationItemRecord;
  allocation: PharmacyDispensationAllocationRecord;
  inventoryItemId: string;
  stockMovementId: string | null;
  witnessStaffId: string;
  transactionId: string;
  idempotencyKey: string;
  occurredAt: Date;
  session: PharmacyMongoSession;
}

export interface ControlledRegisterInboundInput {
  actor: PharmacyDispensingActorContext;
  operational: PharmacyOperationalContext;
  dispensation: PharmacyDispensationRecord;
  item: PharmacyDispensationItemRecord;
  allocation: PharmacyDispensationAllocationRecord;
  inventoryItemId: string;
  stockQuantity: string;
  stockMovementId: string | null;
  witnessStaffId: string;
  transactionId: string;
  idempotencyKey: string;
  occurredAt: Date;
  session: PharmacyMongoSession;
  sourceType: 'REVERSAL' | 'PATIENT_RETURN';
  sourceId: string;
  reason: string;
}

function formatControlledRegisterNumber(
  occurredAt: Date,
  sequence: number,
): string {
  return [
    'CDR',
    occurredAt.getUTCFullYear(),
    String(sequence).padStart(8, '0'),
  ].join('-');
}

export class ControlledMedicineRegisterService {
  public constructor(
    private readonly repository: PharmacyControlledRegisterRepository,
    private readonly sequence: PharmacySequencePort,
  ) {}

  public recordDispensing(
    input: ControlledRegisterDispensingInput,
  ) {
    return this.record({
      ...input,
      sourceType: 'DISPENSE',
      sourceId: input.dispensation._id.toHexString(),
      direction: 'OUT',
      stockQuantity: input.allocation.consumedStockQuantity.toString(),
      reason: 'Controlled medicine dispensed against an authorized prescription',
    });
  }

  public recordReversal(input: ControlledRegisterInboundInput) {
    if (input.sourceType !== 'REVERSAL') {
      throw new ConflictError('Controlled reversal register source is invalid');
    }

    return this.record({
      ...input,
      direction: 'IN',
    });
  }

  public recordPatientReturn(input: ControlledRegisterInboundInput) {
    if (input.sourceType !== 'PATIENT_RETURN') {
      throw new ConflictError('Controlled patient-return register source is invalid');
    }

    return this.record({
      ...input,
      direction: 'IN',
    });
  }

  private async record(
    input:
      | (ControlledRegisterDispensingInput & {
          sourceType: 'DISPENSE';
          sourceId: string;
          direction: 'OUT';
          stockQuantity: string;
          reason: string;
        })
      | (ControlledRegisterInboundInput & { direction: 'IN' }),
  ) {
    if (!input.item.controlledMedicine) {
      throw new ConflictError(
        'Only controlled medicines may be posted to the controlled register',
      );
    }

    if (!input.operational.location.allowsControlledMedicine) {
      throw new ConflictError(
        'The pharmacy location is not authorized for controlled medicines',
      );
    }

    if (input.operational.actor.staffId === input.witnessStaffId) {
      throw new ConflictError(
        'The controlled-medicine pharmacist and witness must be different staff members',
      );
    }

    const operationKey = pharmacyOperationKey(
      input.actor.facilityId,
      [
        'controlled-register',
        input.sourceType,
        input.sourceId,
        input.item._id.toHexString(),
        input.allocation._id.toHexString(),
      ].join(':'),
      input.idempotencyKey,
    );
    const existing = await this.repository.findByOperationKey(
      input.actor.facilityId,
      operationKey,
      input.session,
    );

    if (existing !== null) {
      return existing;
    }

    const latest = await this.repository.findLatestBalance(
      input.actor.facilityId,
      input.dispensation.sourceStockLocationId.toHexString(),
      input.inventoryItemId,
      input.allocation.inventoryBatchId?.toHexString() ?? null,
      input.session,
    );
    const opening = new Decimal(latest?.closingBalance.toString() ?? '0');
    const quantity = new Decimal(input.stockQuantity);

    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new ConflictError(
        'Controlled-register quantity must be a positive exact decimal',
      );
    }

    const closing = input.direction === 'OUT'
      ? opening.minus(quantity)
      : opening.plus(quantity);

    if (closing.lt(0)) {
      throw new ConflictError(
        'Controlled-medicine register balance cannot become negative',
      );
    }

    const sequence = await this.sequence.next(
      input.actor.facilityId,
      PHARMACY_CONTROLLED_REGISTER_NUMBER_SEQUENCE_NAMESPACE,
    );

    return this.repository.create(
      {
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'actorUserId'),
        updatedBy: toObjectId(input.actor.userId, 'actorUserId'),
        registerNumber: formatControlledRegisterNumber(
          input.occurredAt,
          sequence.value,
        ),
        registerSequence: sequence.value,
        operationKey,
        entryType:
          input.sourceType === 'DISPENSE'
            ? 'DISPENSE'
            : input.sourceType === 'REVERSAL'
              ? 'REVERSAL'
              : 'PATIENT_RETURN',
        direction: input.direction,
        pharmacyLocationId: input.dispensation.pharmacyLocationId,
        stockLocationId: input.dispensation.sourceStockLocationId,
        patientId: input.dispensation.patientId,
        prescriptionId: input.dispensation.prescriptionId,
        prescriptionItemId: input.item.prescriptionItemId,
        dispensationId: input.dispensation._id,
        dispensationItemId: input.item._id,
        patientReturnId:
          input.sourceType === 'PATIENT_RETURN'
            ? toObjectId(input.sourceId, 'patientReturnId')
            : null,
        reversalId:
          input.sourceType === 'REVERSAL'
            ? toObjectId(input.sourceId, 'reversalId')
            : null,
        prescriberProviderId: input.dispensation.prescriberProviderId,
        pharmacistStaffId: toObjectId(
          input.operational.actor.staffId,
          'pharmacistStaffId',
        ),
        witnessRequired: true,
        witnessStaffId: toObjectId(input.witnessStaffId, 'witnessStaffId'),
        witnessMethod: 'IN_PERSON',
        witnessedAt: input.occurredAt,
        formularyItemId:
          input.item.actualFormularyItemId ?? input.item.prescribedFormularyItemId,
        medicineId: input.item.actualMedicineId ?? input.item.prescribedMedicineId,
        inventoryItemId: toObjectId(input.inventoryItemId, 'inventoryItemId'),
        inventoryBatchId: input.allocation.inventoryBatchId,
        batchNumberSnapshot: input.allocation.batchNumberSnapshot,
        expiryDateSnapshot: input.allocation.expiryDateSnapshot,
        stockUnitId: input.allocation.stockUnitId,
        quantity: Decimal128.fromString(normalizePharmacyDecimal(quantity)),
        openingBalance: Decimal128.fromString(normalizePharmacyDecimal(opening)),
        closingBalance: Decimal128.fromString(normalizePharmacyDecimal(closing)),
        physicalBalance: null,
        stockMovementId:
          input.stockMovementId === null
            ? null
            : toObjectId(input.stockMovementId, 'stockMovementId'),
        reversalOfRegisterEntryId:
          input.direction === 'IN' ? latest?._id ?? null : null,
        discrepancyStatus: 'NONE',
        discrepancyQuantity: null,
        discrepancyReason: null,
        escalationReference: null,
        reason: input.reason,
        occurredAt: input.occurredAt,
      } as never,
      input.session,
    );
  }
}