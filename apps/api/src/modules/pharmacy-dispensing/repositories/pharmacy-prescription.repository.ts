import Decimal from 'decimal.js';

import {
  Decimal128,
  FormularyItemModel,
  InventoryItemModel,
  PrescriptionItemModel,
  PrescriptionModel,
  PrescriptionSafetyWarningModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PharmacyPrescriptionRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyFormularyItemRecord,
  PharmacyInventoryItemRecord,
  PharmacyMongoSession,
  PharmacyPrescriptionItemRecord,
  PharmacyPrescriptionRecord,
  PharmacyPrescriptionWarningRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_PRESCRIPTION_DISPENSING_SELECT,
  PHARMACY_PRESCRIPTION_ITEM_DISPENSING_SELECT,
} from '../pharmacy-dispensing.projections.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class PharmacyPrescriptionRepository
implements PharmacyPrescriptionRepositoryPort {
  public async findPrescription(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionRecord | null> {
    const query = PrescriptionModel.findOne({
      _id: toObjectId(prescriptionId, 'prescriptionId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(PHARMACY_PRESCRIPTION_DISPENSING_SELECT)
      .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<PharmacyPrescriptionRecord | null>(await query.exec());
  }

  public async listPrescriptionItems(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionItemRecord[]> {
    const query = PrescriptionItemModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      prescriptionId: toObjectId(prescriptionId, 'prescriptionId'),
    })
      .select(PHARMACY_PRESCRIPTION_ITEM_DISPENSING_SELECT)
      .sort({ sequence: 1 })
      .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<PharmacyPrescriptionItemRecord[]>(await query.exec());
  }

  public async listPrescriptionWarnings(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionWarningRecord[]> {
    const query = PrescriptionSafetyWarningModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      prescriptionId: toObjectId(prescriptionId, 'prescriptionId'),
    })
      .select(
        '_id prescriptionId prescriptionItemId warningType severity status warningCode +message detectedAt',
      )
      .sort({ detectedAt: 1, _id: 1 })
      .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<PharmacyPrescriptionWarningRecord[]>(await query.exec());
  }

  public async findFormularyItem(
    facilityId: string,
    formularyItemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyFormularyItemRecord | null> {
    const query = FormularyItemModel.findOne({
      _id: toObjectId(formularyItemId, 'formularyItemId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId medicineId medicineFormId medicineStrengthId quantityUnitId inventoryItemId stockTracked highAlert controlledMedicine restrictionType status effectiveFrom effectiveUntil',
      )
      .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<PharmacyFormularyItemRecord | null>(await query.exec());
  }

  public async findInventoryItemForFormulary(
    facilityId: string,
    formularyItemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyInventoryItemRecord | null> {
    const query = InventoryItemModel.findOne({
      facilityId: toObjectId(facilityId, 'facilityId'),
      formularyItemId: toObjectId(formularyItemId, 'formularyItemId'),
      status: 'ACTIVE',
    })
      .select(
        '_id facilityId itemCode name formularyItemId stockUnitId issueUnitId allowFractionalStock batchTrackingRequired expiryTrackingRequired controlledMedicine highAlert negativeStockAllowed status version',
      )
      .lean();

    if (session !== undefined) {
      query.session(session);
    }

    return record<PharmacyInventoryItemRecord | null>(await query.exec());
  }

  public async updateDispensingProgress(
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
  ): Promise<PharmacyPrescriptionRecord | null> {
    const objectFacilityId = toObjectId(facilityId, 'facilityId');
    const objectPrescriptionId = toObjectId(prescriptionId, 'prescriptionId');
    const objectActorId = toObjectId(actorUserId, 'actorUserId');

    for (const update of updates) {
      const result = await PrescriptionItemModel.updateOne(
        {
          _id: toObjectId(update.prescriptionItemId, 'prescriptionItemId'),
          facilityId: objectFacilityId,
          prescriptionId: objectPrescriptionId,
          version: update.expectedVersion,
        },
        {
          $set: {
            dispensedQuantity: Decimal128.fromString(update.dispensedQuantity),
            lastDispensedAt: update.lastDispensedAt,
            lastDispensationId: toObjectId(
              update.lastDispensationId,
              'lastDispensationId',
            ),
            updatedBy: objectActorId,
            transactionId,
            correlationId,
          },
          $inc: { version: 1 },
        },
        { session },
      ).exec();

      if (result.matchedCount !== 1) {
        return null;
      }
    }

    const items = await PrescriptionItemModel.find({
      facilityId: objectFacilityId,
      prescriptionId: objectPrescriptionId,
      status: 'ACTIVE',
    })
      .select('quantity dispensedQuantity')
      .session(session)
      .lean()
      .exec();

    const fullyDispensed = items.filter(
      (item) =>
        new Decimal(item.dispensedQuantity.toString()).eq(
          item.quantity.toString(),
        ),
    ).length;
    const anyDispensed = items.some(
      (item) => new Decimal(item.dispensedQuantity.toString()).gt(0),
    );
    const status = fullyDispensed === items.length
      ? 'DISPENSED'
      : anyDispensed
        ? 'PARTIALLY_DISPENSED'
        : 'ISSUED';

    return record<PharmacyPrescriptionRecord | null>(
      await PrescriptionModel.findOneAndUpdate(
        {
          _id: objectPrescriptionId,
          facilityId: objectFacilityId,
          version: expectedVersion,
        },
        {
          $set: {
            status,
            dispensedItemCount: fullyDispensed,
            updatedBy: objectActorId,
            transactionId,
            correlationId,
          },
          $inc: { version: 1 },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      )
        .select(PHARMACY_PRESCRIPTION_DISPENSING_SELECT)
        .lean()
        .exec(),
    );
  }
}