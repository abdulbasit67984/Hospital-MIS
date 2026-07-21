import {
  ControlledMedicineRegisterEntryModel,
  DispensationModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE,
} from '../pharmacy-dispensing.constants.js';

import type {
  PharmacyDispensationListQuery,
  PharmacyPage,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyControlledRegisterRecord,
  PharmacyDispensationRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import type {
  PharmacyWorklistRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import {
  PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT,
  PHARMACY_DISPENSATION_INTERNAL_SELECT,
} from '../pharmacy-dispensing.projections.js';

function record<T>(value: unknown): T {
  return value as T;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function dateRange(
  from: string | undefined,
  to: string | undefined,
): Record<string, Date> | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  return {
    ...(from === undefined ? {} : { $gte: new Date(from) }),
    ...(to === undefined ? {} : { $lte: new Date(to) }),
  };
}

export class PharmacyWorklistRepository
implements PharmacyWorklistRepositoryPort {
  public async listPending(
    facilityId: string,
    query: PharmacyDispensationListQuery,
  ): Promise<PharmacyPage<PharmacyDispensationRecord>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE;
    const queuedAt = dateRange(query.from, query.to);
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.status === undefined
        ? {
            status: {
              $in: [
                'PENDING_REVIEW',
                'HELD',
                'VERIFIED',
                'PARTIALLY_RESERVED',
                'RESERVED',
                'IN_PROGRESS',
                'PARTIALLY_DISPENSED',
                'RECOVERY_REQUIRED',
              ],
            },
          }
        : { status: { $in: [...query.status] } }),
      ...(query.context === undefined
        ? {}
        : { context: { $in: [...query.context] } }),
      ...(query.priority === undefined
        ? {}
        : { priority: { $in: [...query.priority] } }),
      ...(query.pharmacyLocationId === undefined
        ? {}
        : {
            pharmacyLocationId: toObjectId(
              query.pharmacyLocationId,
              'pharmacyLocationId',
            ),
          }),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.prescriptionId === undefined
        ? {}
        : {
            prescriptionId: toObjectId(
              query.prescriptionId,
              'prescriptionId',
            ),
          }),
      ...(query.admissionId === undefined
        ? {}
        : { admissionId: toObjectId(query.admissionId, 'admissionId') }),
      ...(query.controlledMedicine === undefined
        ? {}
        : { controlledMedicine: query.controlledMedicine }),
      ...(queuedAt === undefined ? {} : { queuedAt }),
    };

    if (query.search !== undefined) {
      const expression = new RegExp(escapeRegex(query.search), 'iu');
      filter['$or'] = [
        { dispensationNumber: expression },
        { prescriptionNumberSnapshot: expression },
      ];
    }

    const sortField = query.sortBy ?? 'queuedAt';
    const sortDirection = query.sortDirection === 'desc' ? -1 : 1;
    const sort = {
      [sortField]: sortDirection,
      _id: sortDirection,
    } as Record<string, 1 | -1>;

    const [items, totalItems] = await Promise.all([
      DispensationModel.find(filter)
        .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      DispensationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: record<PharmacyDispensationRecord[]>(items),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async listRecoveryRequired(
    facilityId: string,
    before: Date,
    limit: number,
  ): Promise<PharmacyDispensationRecord[]> {
    return record<PharmacyDispensationRecord[]>(
      await DispensationModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        finalizationState: {
          $in: ['RECOVERY_REQUIRED', 'COMPENSATION_REQUIRED'],
        },
        finalizationUpdatedAt: { $lte: before },
      })
        .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
        .sort({ finalizationUpdatedAt: 1, _id: 1 })
        .limit(limit)
        .lean()
        .exec(),
    );
  }

  public async listExpirable(
    facilityId: string,
    at: Date,
    limit: number,
  ): Promise<PharmacyDispensationRecord[]> {
    return record<PharmacyDispensationRecord[]>(
      await DispensationModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: {
          $in: [
            'PENDING_REVIEW',
            'HELD',
            'VERIFIED',
            'PARTIALLY_RESERVED',
            'RESERVED',
          ],
        },
        expiresAt: { $lte: at },
      })
        .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
        .sort({ expiresAt: 1, _id: 1 })
        .limit(limit)
        .lean()
        .exec(),
    );
  }

  public async listControlledDiscrepancies(
    facilityId: string,
    locationId: string | null,
    limit: number,
  ): Promise<PharmacyControlledRegisterRecord[]> {
    return record<PharmacyControlledRegisterRecord[]>(
      await ControlledMedicineRegisterEntryModel.find({
        facilityId: toObjectId(facilityId, 'facilityId'),
        discrepancyStatus: { $in: ['OPEN', 'ESCALATED'] },
        ...(locationId === null
          ? {}
          : {
              pharmacyLocationId: toObjectId(
                locationId,
                'pharmacyLocationId',
              ),
            }),
      })
        .select(PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT)
        .sort({ occurredAt: 1, registerSequence: 1 })
        .limit(limit)
        .lean()
        .exec(),
    );
  }
}