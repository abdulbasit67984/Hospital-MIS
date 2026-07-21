import {
  ControlledMedicineRegisterEntryModel,
  DispensationModel,
  DispensationReversalModel,
  DispensationStatusHistoryModel,
  DispensationSubstitutionModel,
  DispensingLabelModel,
  PatientReturnItemModel,
  PatientReturnModel,
  PharmacyCounsellingRecordModel,
  PharmacyReviewEventModel,
  toObjectId,
} from '@hospital-mis/database';

import {
  ForbiddenError,
} from '@hospital-mis/shared';

import type {
  PharmacyControlledRegisterListQuery,
  PharmacyDispensationListQuery,
  PharmacyDispensingActorContext,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyAccessPolicyPort,
  PharmacyDispensationRepositoryPort,
  PharmacyWorklistRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import {
  PharmacyDispensationNotFoundError,
} from '../pharmacy-dispensing.errors.js';

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return null;
  }

  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate['toHexString'] === 'function') {
      return (candidate['toHexString'] as () => string)();
    }

    if (candidate['_bsontype'] === 'Decimal128' && typeof candidate['toString'] === 'function') {
      return (candidate['toString'] as () => string)();
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        safeValue(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

function assertAllowed(
  decision: Awaited<ReturnType<PharmacyAccessPolicyPort['authorize']>>,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ?? 'The pharmacy query was denied',
    );
  }
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

export class PharmacyDispensingQueryService {
  public constructor(
    private readonly repository: PharmacyDispensationRepositoryPort,
    private readonly worklists: PharmacyWorklistRepositoryPort,
    private readonly accessPolicy: PharmacyAccessPolicyPort,
  ) {}

  public async listWorklist(
    actor: PharmacyDispensingActorContext,
    query: PharmacyDispensationListQuery,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'QUEUE_READ',
      }),
    );

    return safeValue(
      await this.worklists.listPending(actor.facilityId, query),
    );
  }

  public async listDispensations(
    actor: PharmacyDispensingActorContext,
    query: PharmacyDispensationListQuery,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'READ',
      }),
    );

    return safeValue(
      await this.repository.list(actor.facilityId, query),
    );
  }

  public async getDispensation(
    actor: PharmacyDispensingActorContext,
    dispensationId: string,
  ): Promise<unknown> {
    const dispensation = await this.repository.findById(
      actor.facilityId,
      dispensationId,
    );

    if (dispensation === null) {
      throw new PharmacyDispensationNotFoundError();
    }

    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'READ',
        dispensation,
        patientId: dispensation.patientId.toHexString(),
        admissionId: dispensation.admissionId?.toHexString() ?? null,
      }),
    );

    const facilityId = toObjectId(actor.facilityId, 'facilityId');
    const objectDispensationId = toObjectId(dispensationId, 'dispensationId');
    const [items, history, reviews, substitutions, labels, counselling, returns, reversals] =
      await Promise.all([
        this.repository.listItems(actor.facilityId, dispensationId),
        DispensationStatusHistoryModel.find({
          facilityId,
          dispensationId: objectDispensationId,
        })
          .select('+reason')
          .sort({ sequence: 1, occurredAt: 1 })
          .lean()
          .exec(),
        PharmacyReviewEventModel.find({
          facilityId,
          dispensationId: objectDispensationId,
        })
          .select('+reason +safetyAlerts.message +safetyAlerts.acknowledgementReason')
          .sort({ occurredAt: 1, _id: 1 })
          .lean()
          .exec(),
        DispensationSubstitutionModel.find({
          facilityId,
          dispensationId: objectDispensationId,
        })
          .select('+reason +decisionReason')
          .sort({ proposedAt: 1, _id: 1 })
          .lean()
          .exec(),
        DispensingLabelModel.find({
          facilityId,
          dispensationId: objectDispensationId,
        })
          .select('+patientDisplayName +patientIdentifierSnapshot +instructions')
          .sort({ generatedAt: 1, _id: 1 })
          .lean()
          .exec(),
        PharmacyCounsellingRecordModel.find({
          facilityId,
          dispensationId: objectDispensationId,
        })
          .select('+interpreterName +caregiverName +declinedReason +unableReason +notes')
          .sort({ createdAt: 1, _id: 1 })
          .lean()
          .exec(),
        PatientReturnModel.find({
          facilityId,
          originalDispensationId: objectDispensationId,
        })
          .select('+reason +recoveryReason +lastFailureCode')
          .sort({ requestedAt: 1, _id: 1 })
          .lean()
          .exec(),
        DispensationReversalModel.find({
          facilityId,
          originalDispensationId: objectDispensationId,
        })
          .select('+reason +recoveryReason +lastFailureCode')
          .sort({ requestedAt: 1, _id: 1 })
          .lean()
          .exec(),
      ]);

    return safeValue({
      dispensation,
      items,
      history,
      reviews,
      substitutions,
      labels,
      counselling,
      returns,
      reversals,
    });
  }

  public async getPatientReturn(
    actor: PharmacyDispensingActorContext,
    returnId: string,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({ actor, action: 'READ' }),
    );

    const facilityId = toObjectId(actor.facilityId, 'facilityId');
    const objectReturnId = toObjectId(returnId, 'returnId');
    const [header, items] = await Promise.all([
      PatientReturnModel.findOne({
        _id: objectReturnId,
        facilityId,
      })
        .select('+reason +recoveryReason +lastFailureCode')
        .lean()
        .exec(),
      PatientReturnItemModel.find({
        facilityId,
        patientReturnId: objectReturnId,
      })
        .select('+assessmentNotes +dispositionReason')
        .sort({ lineNumber: 1, _id: 1 })
        .lean()
        .exec(),
    ]);

    if (header === null) {
      throw new PharmacyDispensationNotFoundError();
    }

    return safeValue({ header, items });
  }

  public async listControlledRegister(
    actor: PharmacyDispensingActorContext,
    query: PharmacyControlledRegisterListQuery,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'REPORT_READ',
      }),
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const occurredAt = dateRange(query.from, query.to);
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(actor.facilityId, 'facilityId'),
      ...(query.pharmacyLocationId === undefined
        ? {}
        : {
            pharmacyLocationId: toObjectId(
              query.pharmacyLocationId,
              'pharmacyLocationId',
            ),
          }),
      ...(query.inventoryItemId === undefined
        ? {}
        : { inventoryItemId: toObjectId(query.inventoryItemId, 'inventoryItemId') }),
      ...(query.batchId === undefined
        ? {}
        : { inventoryBatchId: toObjectId(query.batchId, 'batchId') }),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.discrepancyStatus === undefined
        ? {}
        : { discrepancyStatus: query.discrepancyStatus }),
      ...(occurredAt === undefined ? {} : { occurredAt }),
    };

    const [items, totalItems] = await Promise.all([
      ControlledMedicineRegisterEntryModel.find(filter)
        .select('+reason +discrepancyReason')
        .sort({ occurredAt: -1, registerSequence: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      ControlledMedicineRegisterEntryModel.countDocuments(filter).exec(),
    ]);

    return safeValue({
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    });
  }

  public async summary(
    actor: PharmacyDispensingActorContext,
    input: Readonly<{
      from: string;
      to: string;
      pharmacyLocationId?: string;
    }>,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'REPORT_READ',
      }),
    );

    const rows = await DispensationModel.aggregate([
      {
        $match: {
          facilityId: toObjectId(actor.facilityId, 'facilityId'),
          queuedAt: {
            $gte: new Date(input.from),
            $lte: new Date(input.to),
          },
          ...(input.pharmacyLocationId === undefined
            ? {}
            : {
                pharmacyLocationId: toObjectId(
                  input.pharmacyLocationId,
                  'pharmacyLocationId',
                ),
              }),
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          grossAmount: { $sum: '$grossAmount' },
          discountAmount: { $sum: '$discountAmount' },
          taxAmount: { $sum: '$taxAmount' },
          netAmount: { $sum: '$netAmount' },
          controlledMedicineCount: {
            $sum: { $cond: ['$controlledMedicine', 1, 0] },
          },
          highAlertMedicineCount: {
            $sum: { $cond: ['$highAlertMedicine', 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    return safeValue({
      from: input.from,
      to: input.to,
      pharmacyLocationId: input.pharmacyLocationId ?? null,
      rows,
    });
  }

  public async recoveryDashboard(
    actor: PharmacyDispensingActorContext,
  ): Promise<unknown> {
    assertAllowed(
      await this.accessPolicy.authorize({
        actor,
        action: 'CONFIGURATION_MANAGE',
      }),
    );

    const facilityId = toObjectId(actor.facilityId, 'facilityId');
    const recoveryStates = ['RECOVERY_REQUIRED', 'COMPENSATION_REQUIRED'];
    const [dispensations, returns, reversals, discrepancies] = await Promise.all([
      this.worklists.listRecoveryRequired(actor.facilityId, new Date(), 100),
      PatientReturnModel.find({
        facilityId,
        finalizationState: { $in: recoveryStates },
      })
        .select('+recoveryReason +lastFailureCode')
        .sort({ finalizationUpdatedAt: 1, _id: 1 })
        .limit(100)
        .lean()
        .exec(),
      DispensationReversalModel.find({
        facilityId,
        finalizationState: { $in: recoveryStates },
      })
        .select('+recoveryReason +lastFailureCode')
        .sort({ finalizationUpdatedAt: 1, _id: 1 })
        .limit(100)
        .lean()
        .exec(),
      this.worklists.listControlledDiscrepancies(actor.facilityId, null, 100),
    ]);

    return safeValue({
      dispensations,
      returns,
      reversals,
      controlledRegisterDiscrepancies: discrepancies,
    });
  }
}