import {
  randomUUID,
} from 'node:crypto';

import Decimal from 'decimal.js';

import type {
  ClientSession,
} from 'mongoose';

import type {
  Db,
} from '@hospital-mis/database';

import {
  AdmissionModel,
  ChargeCatalogModel,
  CoverageBenefitBalanceModel,
  CoverageDeterminationModel,
  InvoiceLineModel,
  PackageEnrollmentBalanceModel,
  PackageEnrollmentModel,
  PackageUtilizationModel,
  PanelPlanModel,
  PatientAccountModel,
  PatientCoverageModel,
  PatientModel,
  PreauthorizationModel,
  PriceListModel,
  TreatmentPackageItemModel,
  TreatmentPackageModel,
  createObjectId,
  decimal128,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import type {
  AuditRepository,
} from '../modules/audit/audit.repository.js';

import type {
  PanelsPackagesCoverageActorContext,
} from '../modules/panels-packages-coverage/panels-packages-coverage.contracts.js';

import type {
  PackageEnrollmentRecord,
} from '../modules/panels-packages-coverage/panels-packages-coverage.persistence.types.js';

import type {
  PpcAuditPort,
  PpcClockPort,
  PpcOutboxPort,
  PpcReferenceDataPort,
} from '../modules/panels-packages-coverage/panels-packages-coverage.ports.js';

import type {
  CoverageDeterminationDataPort,
} from '../modules/panels-packages-coverage/services/coverage-determination.service.js';

import type {
  PackageDefinitionSnapshot,
  PackagePatientSnapshot,
} from '../modules/panels-packages-coverage/services/package-enrollment.service.js';

import {
  PackageCoverageRepository,
} from '../modules/panels-packages-coverage/repositories/package-coverage.repository.js';

import {
  projectCoverageDetermination,
} from '../modules/panels-packages-coverage/panels-packages-coverage.projections.js';

import type {
  SequenceService,
} from './sequence.service.js';

function record<T>(value: unknown): T {
  return value as T;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000
  );
}

function safeSnapshot(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 20) {
    return null;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => safeSnapshot(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue['toHexString'] === 'function') {
      return (objectValue['toHexString'] as () => string)();
    }

    if (
      objectValue['_bsontype'] === 'Decimal128' &&
      typeof objectValue['toString'] === 'function'
    ) {
      return (objectValue['toString'] as () => string)();
    }

    return Object.fromEntries(
      Object.entries(objectValue)
        .filter(([key]) =>
          ![
            'membershipReferenceEncrypted',
            'membershipReferenceHash',
            'policyReference',
            'authorizationReference',
          ].includes(key),
        )
        .map(([key, nested]) => [
          key,
          safeSnapshot(nested, depth + 1),
        ]),
    );
  }

  return String(value);
}

export class MongoPpcAuditAdapter
implements PpcAuditPort {
  public constructor(
    private readonly database: Db,
    private readonly auditRepository?: AuditRepository,
  ) {}

  public async record(
    input: Parameters<PpcAuditPort['record']>[0],
  ): Promise<void> {
    const now = new Date();

    try {
      await this.database.collection('auditLogs').insertOne(
        {
          _id: createObjectId(),
          facilityId: toObjectId(
            input.actor.facilityId,
            'facilityId',
          ),
          eventId: [
            input.transactionId,
            input.action,
            input.entityType,
            input.entityId,
          ].join(':'),
          actorId: toObjectId(input.actor.userId, 'actorUserId'),
          action: input.action,
          module: 'PANELS_PACKAGES_COVERAGE',
          entityType: input.entityType,
          entityId: input.entityId,
          ...(input.reason === null
            ? {}
            : { reason: input.reason }),
          beforeSnapshot: safeSnapshot(input.before),
          afterSnapshot: safeSnapshot(input.after),
          metadata: {
            actorStaffId: input.actor.staffId,
          },
          outcome: 'SUCCESS',
          sensitivity: 'HIGHLY_SENSITIVE',
          correlationId: input.actor.correlationId,
          transactionId: input.transactionId,
          requestSource: 'API',
          ...(input.actor.ipAddress === undefined
            ? {}
            : { ipAddress: input.actor.ipAddress }),
          ...(input.actor.userAgent === undefined
            ? {}
            : { userAgent: input.actor.userAgent }),
          occurredAt: now,
          schemaVersion: 1,
          version: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          session: input.session,
        },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
    }

    void this.auditRepository;
  }
}

export class MongoPpcOutboxAdapter
implements PpcOutboxPort {
  public constructor(
    private readonly database: Db,
  ) {}

  public async enqueue(
    input: Parameters<PpcOutboxPort['enqueue']>[0],
  ): Promise<void> {
    const now = new Date();

    await this.database.collection('outboxEvents').insertOne(
      {
        _id: createObjectId(),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        eventId: randomUUID(),
        transactionId: input.transactionId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: safeSnapshot(input.payload),
        status: 'BLOCKED',
        availableAt: now,
        attemptCount: 0,
        schemaVersion: 1,
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        session: input.session,
      },
    );
  }
}

export class SystemPpcClock
implements PpcClockPort {
  public now(): Date {
    return new Date();
  }
}

export class MongoPpcReferenceDataAdapter
implements PpcReferenceDataPort {
  public async patientExists(
    facilityId: string,
    patientId: string,
  ): Promise<boolean> {
    return (
      await PatientModel.exists({
        _id: toObjectId(patientId, 'patientId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: {
          $ne: 'MERGED',
        },
      })
    ) !== null;
  }

  public async priceListExists(
    facilityId: string,
    priceListId: string,
  ): Promise<boolean> {
    return (
      await PriceListModel.exists({
        _id: toObjectId(priceListId, 'priceListId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
    ) !== null;
  }

  public async chargeCatalogItemsExist(
    facilityId: string,
    itemIds: readonly string[],
  ): Promise<boolean> {
    const unique = [...new Set(itemIds)];

    return (
      await ChargeCatalogModel.countDocuments({
        _id: {
          $in: unique.map((itemId) =>
            toObjectId(itemId, 'chargeCatalogItemId'),
          ),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
    ) === unique.length;
  }

  public async treatmentPackageExists(
    facilityId: string,
    packageId: string,
  ): Promise<boolean> {
    return (
      await TreatmentPackageModel.exists({
        _id: toObjectId(packageId, 'packageId'),
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
    ) !== null;
  }
}

export class MongoPpcSequenceAdapter {
  public constructor(
    private readonly sequences: SequenceService,
  ) {}

  public nextCoverageNumber(facilityId: string): Promise<string> {
    return this.sequences.formatted({
      facilityId,
      key: 'ppc.patient_coverage',
      prefix: 'COV',
      width: 8,
      year: new Date().getUTCFullYear(),
    });
  }

  public nextEnrollmentNumber(facilityId: string): Promise<string> {
    return this.sequences.formatted({
      facilityId,
      key: 'ppc.package_enrollment',
      prefix: 'PEN',
      width: 8,
      year: new Date().getUTCFullYear(),
    });
  }

  public nextDeterminationNumber(
    facilityId: string,
  ): Promise<string> {
    return this.sequences.formatted({
      facilityId,
      key: 'ppc.coverage_determination',
      prefix: 'CDT',
      width: 8,
      year: new Date().getUTCFullYear(),
    });
  }
}

export class MongoPpcPackageRuntimeAdapter
extends PackageCoverageRepository {
  public async findDefinition(
    facilityId: string,
    packageId: string,
  ): Promise<PackageDefinitionSnapshot | null> {
    const packageRecord = await TreatmentPackageModel.findOne({
      _id: toObjectId(packageId, 'packageId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    }).lean().exec();

    if (packageRecord === null) {
      return null;
    }

    const items = await TreatmentPackageItemModel.find({
      facilityId: packageRecord.facilityId,
      treatmentPackageId: packageRecord._id,
      active: true,
    }).sort({ lineNumber: 1 }).lean().exec();

    const eligibility = packageRecord.eligibility ?? {
      patientCategoryCodes:
        packageRecord.patientCategoryCode === null
          ? []
          : [packageRecord.patientCategoryCode],
      minimumAgeYears: null,
      maximumAgeYears: null,
      genderCodes: [],
      admissionRequired: false,
      departmentIds: [],
      payerOrganizationIds:
        packageRecord.payerOrganizationId === null
          ? []
          : [packageRecord.payerOrganizationId],
    };

    return {
      id: packageRecord._id.toHexString(),
      status: packageRecord.status,
      effectiveFrom: packageRecord.effectiveFrom,
      effectiveThrough: packageRecord.effectiveThrough ?? null,
      eligibility: {
        patientCategoryCodes:
          eligibility.patientCategoryCodes ?? [],
        minimumAgeYears:
          eligibility.minimumAgeYears ?? null,
        maximumAgeYears:
          eligibility.maximumAgeYears ?? null,
        genderCodes: eligibility.genderCodes ?? [],
        admissionRequired:
          eligibility.admissionRequired ?? false,
        departmentIds: (eligibility.departmentIds ?? []).map(
          (value) => value.toHexString(),
        ),
        payerOrganizationIds:
          (eligibility.payerOrganizationIds ?? []).map(
            (value) => value.toHexString(),
          ),
      },
      items: items.map((item) => ({
        id: item._id.toHexString(),
        included: item.included ?? true,
        includedQuantity: decimal128ToString(
          item.quantityLimit ?? item.includedQuantity,
        ),
        allocationAmount: decimal128ToString(
          item.amountLimit ?? item.allocationAmount,
        ),
      })),
    };
  }

  public async findPatientSnapshot(
    facilityId: string,
    patientId: string,
  ): Promise<PackagePatientSnapshot | null> {
    const patient = await PatientModel.findOne({
      _id: toObjectId(patientId, 'patientId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('+birthDate.value')
      .lean()
      .exec();

    if (patient === null) {
      return null;
    }

    const activeAdmission = await AdmissionModel.findOne({
      facilityId: patient.facilityId,
      patientId: patient._id,
      status: {
        $in: ['ADMITTED', 'TRANSFER_IN_PROGRESS'],
      },
    }).select('_id').lean().exec();

    const coverages = await PatientCoverageModel.find({
      facilityId: patient.facilityId,
      patientId: patient._id,
      status: 'ACTIVE',
    }).select('panelPlanId').lean().exec();

    const plans = coverages.length === 0
      ? []
      : await PanelPlanModel.find({
          _id: {
            $in: coverages.map((coverage) =>
              coverage.panelPlanId,
            ),
          },
          facilityId: patient.facilityId,
        }).select('payerOrganizationId').lean().exec();

    const birthDate = patient.birthDate.value;
    const ageYears =
      birthDate instanceof Date
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - birthDate.getTime()) /
                (365.2425 * 86_400_000),
            ),
          )
        : patient.birthDate.estimatedAgeYears ?? null;

    return {
      patientCategoryCode: patient.isMinor ? 'MINOR' : 'ADULT',
      ageYears,
      genderCode: patient.sexAtBirth,
      hasActiveAdmission: activeAdmission !== null,
      departmentId: null,
      payerOrganizationIds: plans.map((plan) =>
        plan.payerOrganizationId.toHexString(),
      ),
    };
  }

  public override async enroll(
    actor: Parameters<PackageCoverageRepository['enroll']>[0],
    input: Parameters<PackageCoverageRepository['enroll']>[1],
    enrollmentNumber: string,
    transaction: Parameters<PackageCoverageRepository['enroll']>[3],
  ): Promise<PackageEnrollmentRecord> {
    let accountId = input.accountId;

    if (accountId === null) {
      const account = await PatientAccountModel.findOne({
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        patientId: toObjectId(input.patientId, 'patientId'),
        status: 'ACTIVE',
      }).session(transaction.session).lean().exec();

      if (account === null) {
        throw new Error(
          'An active patient account is required for package enrollment',
        );
      }

      accountId = account._id.toHexString();
    }

    const expiresAt =
      input.expiresAt === null
        ? new Date(
            new Date(input.startsAt).getTime() +
              365 * 86_400_000,
          )
        : new Date(input.expiresAt);

    const [created] = await PackageEnrollmentModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        enrollmentNumber,
        patientId: toObjectId(input.patientId, 'patientId'),
        patientAccountId: toObjectId(
          accountId,
          'patientAccountId',
        ),
        treatmentPackageId: toObjectId(
          input.packageId,
          'treatmentPackageId',
        ),
        encounterId: null,
        admissionId: null,
        enrolledAt: new Date(),
        validFrom: new Date(input.startsAt),
        validThrough: expiresAt,
        packagePriceSnapshot: decimal128(input.enrollmentPrice),
        currency: 'PKR',
        authorizationReference:
          input.authorizationReference ?? null,
        status: 'ACTIVE',
      }],
      {
        session: transaction.session,
      },
    );

    const persisted = created!.toObject();

    return record<PackageEnrollmentRecord>({
      ...persisted,
      patientId: persisted.patientId,
      treatmentPackageId: persisted.treatmentPackageId,
      status: persisted.status,
      enrollmentNumber: persisted.enrollmentNumber,
      effectiveFrom: persisted.validFrom,
      effectiveThrough: persisted.validThrough,
      accountId: persisted.patientAccountId,
      invoiceId:
        input.invoiceId === null
          ? null
          : toObjectId(input.invoiceId, 'invoiceId'),
      authorizationReference:
        input.authorizationReference ?? null,
    });
  }

  public async reserveEnrollmentBalance(input: Readonly<{
    facilityId: string;
    enrollmentId: string;
    chargeCatalogItemId: string;
    quantity: string;
    amount: string;
    expectedVersion: number;
    actorUserId: string;
    transactionId: string;
    session: ClientSession;
  }>): Promise<Readonly<{
    balanceId: string;
    treatmentPackageItemId: string;
    version: number;
  }> | null> {
    const packageItem = await TreatmentPackageItemModel.findOne({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      chargeCatalogItemId: toObjectId(
        input.chargeCatalogItemId,
        'chargeCatalogItemId',
      ),
      active: true,
      included: {
        $ne: false,
      },
    }).session(input.session).lean().exec();

    if (packageItem === null) {
      return null;
    }

    const balance = await PackageEnrollmentBalanceModel.findOne({
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      packageEnrollmentId: toObjectId(
        input.enrollmentId,
        'enrollmentId',
      ),
      treatmentPackageItemId: packageItem._id,
      version: input.expectedVersion,
    }).session(input.session).lean().exec();

    if (balance === null) {
      return null;
    }

    const quantityRemaining = new Decimal(
      decimal128ToString(balance.includedQuantity),
    )
      .plus(decimal128ToString(balance.reversedQuantity))
      .minus(decimal128ToString(balance.reservedQuantity))
      .minus(decimal128ToString(balance.consumedQuantity));

    const amountRemaining = new Decimal(
      decimal128ToString(balance.includedAmount),
    )
      .plus(decimal128ToString(balance.reversedAmount))
      .minus(decimal128ToString(balance.reservedAmount))
      .minus(decimal128ToString(balance.consumedAmount));

    if (
      quantityRemaining.lessThan(input.quantity) ||
      amountRemaining.lessThan(input.amount)
    ) {
      return null;
    }

    const updated = await PackageEnrollmentBalanceModel.findOneAndUpdate(
      {
        _id: balance._id,
        facilityId: balance.facilityId,
        version: input.expectedVersion,
      },
      {
        $inc: {
          reservedQuantity: decimal128(input.quantity),
          reservedAmount: decimal128(input.amount),
          version: 1,
        },
        $set: {
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transactionId,
        },
      },
      {
        new: true,
        runValidators: true,
        session: input.session,
      },
    ).lean().exec();

    return updated === null
      ? null
      : {
          balanceId: updated._id.toHexString(),
          treatmentPackageItemId:
            updated.treatmentPackageItemId.toHexString(),
          version: updated.version,
        };
  }

  public async createPackageUtilization(input: Readonly<{
    actor: PanelsPackagesCoverageActorContext;
    operationKey: string;
    enrollmentId: string;
    treatmentPackageItemId: string;
    balanceId: string;
    invoiceId: string;
    invoiceLineId: string;
    chargeCatalogItemId: string;
    quantity: string;
    grossAmount: string;
    packageAllocatedAmount: string;
    transactionId: string;
    session: ClientSession;
  }>): Promise<Readonly<{
    id: string;
    version: number;
  }>> {
    const line = await InvoiceLineModel.findOne({
      _id: toObjectId(input.invoiceLineId, 'invoiceLineId'),
      facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
      invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
    }).session(input.session).lean().exec();

    if (line === null) {
      throw new Error('Invoice line was not found');
    }

    const [created] = await PackageUtilizationModel.create(
      [{
        facilityId: toObjectId(
          input.actor.facilityId,
          'facilityId',
        ),
        transactionId: input.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'createdBy'),
        updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        packageEnrollmentId: toObjectId(
          input.enrollmentId,
          'packageEnrollmentId',
        ),
        treatmentPackageItemId: toObjectId(
          input.treatmentPackageItemId,
          'treatmentPackageItemId',
        ),
        accountChargeId: line.accountChargeId,
        consumedQuantity: decimal128(input.quantity),
        overageQuantity: decimal128('0'),
        status: 'RESERVED',
        packageAllocatedAmount: decimal128(
          input.packageAllocatedAmount,
        ),
        refundId: null,
        creditNoteId: null,
      }],
      {
        session: input.session,
      },
    );

    void input.balanceId;
    void input.chargeCatalogItemId;
    void input.grossAmount;

    return {
      id: created!._id.toHexString(),
      version: created!.version,
    };
  }

  public async reversePackageUtilization(input: Readonly<{
    facilityId: string;
    utilizationId: string;
    expectedVersion: number;
    actorUserId: string;
    reason: string;
    refundId: string | null;
    creditNoteId: string | null;
    transactionId: string;
    session: ClientSession;
  }>): Promise<Readonly<{
    id: string;
    enrollmentId: string;
    balanceId: string;
    quantity: string;
    amount: string;
  }> | null> {
    const utilization = await PackageUtilizationModel.findOneAndUpdate(
      {
        _id: toObjectId(input.utilizationId, 'utilizationId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        version: input.expectedVersion,
        status: {
          $in: ['RESERVED', 'CONSUMED'],
        },
      },
      {
        $set: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedBy: toObjectId(input.actorUserId, 'reversedBy'),
          reversalReason: input.reason,
          refundId:
            input.refundId === null
              ? null
              : toObjectId(input.refundId, 'refundId'),
          creditNoteId:
            input.creditNoteId === null
              ? null
              : toObjectId(input.creditNoteId, 'creditNoteId'),
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transactionId,
        },
        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
        session: input.session,
      },
    ).lean().exec();

    if (utilization === null) {
      return null;
    }

    const balance = await PackageEnrollmentBalanceModel.findOne({
      facilityId: utilization.facilityId,
      packageEnrollmentId: utilization.packageEnrollmentId,
      treatmentPackageItemId:
        utilization.treatmentPackageItemId,
    }).session(input.session).lean().exec();

    if (balance === null) {
      throw new Error('Package enrollment balance was not found');
    }

    return {
      id: utilization._id.toHexString(),
      enrollmentId:
        utilization.packageEnrollmentId.toHexString(),
      balanceId: balance._id.toHexString(),
      quantity: decimal128ToString(utilization.consumedQuantity),
      amount: decimal128ToString(
        utilization.packageAllocatedAmount,
      ),
    };
  }

  public async releaseEnrollmentBalance(input: Readonly<{
    facilityId: string;
    balanceId: string;
    quantity: string;
    amount: string;
    actorUserId: string;
    transactionId: string;
    session: ClientSession;
  }>): Promise<void> {
    const result = await PackageEnrollmentBalanceModel.updateOne(
      {
        _id: toObjectId(input.balanceId, 'balanceId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
      },
      {
        $inc: {
          reservedQuantity: decimal128(
            new Decimal(input.quantity).negated().toFixed(),
          ),
          reservedAmount: decimal128(
            new Decimal(input.amount).negated().toFixed(),
          ),
          reversedQuantity: decimal128(input.quantity),
          reversedAmount: decimal128(input.amount),
          version: 1,
        },
        $set: {
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transactionId,
        },
      },
      {
        session: input.session,
        runValidators: true,
      },
    ).exec();

    if (result.modifiedCount !== 1) {
      throw new Error('Package balance reversal failed');
    }
  }
}

export class MongoCoverageDeterminationDataAdapter
implements CoverageDeterminationDataPort {
  public constructor(
    private readonly sequences: MongoPpcSequenceAdapter,
  ) {}

  public async findCoverages(
    facilityId: string,
    patientId: string,
    coverageIds: readonly string[],
    asOf: Date,
  ) {
    return record(
      await PatientCoverageModel.find({
        _id: {
          $in: coverageIds.map((coverageId) =>
            toObjectId(coverageId, 'coverageId'),
          ),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
        patientId: toObjectId(patientId, 'patientId'),
        status: 'ACTIVE',
        eligibleFrom: {
          $lte: asOf,
        },
        $or: [
          {
            eligibleThrough: null,
          },
          {
            eligibleThrough: {
              $gte: asOf,
            },
          },
        ],
      }).sort({ priority: 1 }).lean().exec(),
    );
  }

  public async findPlans(
    facilityId: string,
    planIds: readonly string[],
  ) {
    return record(
      await PanelPlanModel.find({
        _id: {
          $in: planIds.map((planId) =>
            toObjectId(planId, 'planId'),
          ),
        },
        facilityId: toObjectId(facilityId, 'facilityId'),
        status: 'ACTIVE',
      }).lean().exec(),
    );
  }

  public async resolveChargeContext(
    facilityId: string,
    invoiceId: string,
    invoiceLineId: string,
  ) {
    const line = await InvoiceLineModel.findOne({
      _id: toObjectId(invoiceLineId, 'invoiceLineId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
      invoiceId: toObjectId(invoiceId, 'invoiceId'),
    }).lean().exec();

    if (line === null) {
      throw new Error('Invoice line was not found');
    }

    return {
      departmentId: line.departmentId?.toHexString() ?? null,
      networkCode: line.serviceLineCodeSnapshot ?? null,
    };
  }

  public async hasValidPreauthorization(
    facilityId: string,
    patientCoverageId: string,
    chargeCatalogItemId: string,
    serviceDate: Date,
  ): Promise<boolean> {
    return (
      await PreauthorizationModel.exists({
        facilityId: toObjectId(facilityId, 'facilityId'),
        patientCoverageId: toObjectId(
          patientCoverageId,
          'patientCoverageId',
        ),
        chargeCatalogItemIds: toObjectId(
          chargeCatalogItemId,
          'chargeCatalogItemId',
        ),
        status: {
          $in: ['APPROVED', 'PARTIALLY_APPROVED'],
        },
        validFrom: {
          $lte: serviceDate,
        },
        $or: [
          {
            validThrough: null,
          },
          {
            validThrough: {
              $gte: serviceDate,
            },
          },
        ],
      })
    ) !== null;
  }

  public async consumedAmountByRule(
    facilityId: string,
    patientCoverageId: string,
    asOf: Date,
  ): Promise<ReadonlyMap<string, string>> {
    const balances = await CoverageBenefitBalanceModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      patientCoverageId: toObjectId(
        patientCoverageId,
        'patientCoverageId',
      ),
      periodStart: {
        $lte: asOf,
      },
      $or: [
        {
          periodEnd: null,
        },
        {
          periodEnd: {
            $gte: asOf,
          },
        },
      ],
    }).lean().exec();

    return new Map(
      balances.map((balance) => [
        balance.ruleCode,
        decimal128ToString(balance.consumedAmount),
      ]),
    );
  }

  public async deductibleRemaining(
    facilityId: string,
    patientCoverageId: string,
    asOf: Date,
  ): Promise<string> {
    const coverage = await PatientCoverageModel.findOne({
      _id: toObjectId(patientCoverageId, 'patientCoverageId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    }).lean().exec();

    if (coverage === null) {
      return '0.00';
    }

    const plan = await PanelPlanModel.findOne({
      _id: coverage.panelPlanId,
      facilityId: coverage.facilityId,
    }).lean().exec();

    if (plan === null) {
      return '0.00';
    }

    const start = new Date(
      Date.UTC(asOf.getUTCFullYear(), 0, 1),
    );

    const used = await CoverageDeterminationModel.aggregate<{
      total: import('mongoose').Types.Decimal128;
    }>([
      {
        $match: {
          facilityId: coverage.facilityId,
          coverageIds: coverage._id,
          asOf: {
            $gte: start,
            $lte: asOf,
          },
          status: {
            $in: [
              'APPROVED',
              'PARTIALLY_APPROVED',
              'OVERRIDDEN',
            ],
          },
        },
      },
      {
        $unwind: '$allocations',
      },
      {
        $match: {
          'allocations.patientCoverageId': coverage._id,
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$allocations.deductibleAmount',
          },
        },
      },
    ]).exec();

    return Decimal.max(
      0,
      new Decimal(decimal128ToString(plan.deductibleAmount))
        .minus(used[0]?.total.toString() ?? '0'),
    ).toFixed(2);
  }

  public nextDeterminationNumber(
    facilityId: string,
  ): Promise<string> {
    return this.sequences.nextDeterminationNumber(facilityId);
  }

  public async createDetermination(
    input: Parameters<
      CoverageDeterminationDataPort['createDetermination']
    >[0],
  ) {
    const [created] = await CoverageDeterminationModel.create(
      [{
        facilityId: toObjectId(input.actor.facilityId, 'facilityId'),
        transactionId: input.transactionId,
        correlationId: input.actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(input.actor.userId, 'createdBy'),
        updatedBy: toObjectId(input.actor.userId, 'updatedBy'),
        operationKey: input.operationKey,
        determinationNumber: input.determinationNumber,
        patientId: toObjectId(input.patientId, 'patientId'),
        invoiceId: toObjectId(input.invoiceId, 'invoiceId'),
        estimationId:
          input.estimationId === null
            ? null
            : toObjectId(input.estimationId, 'estimationId'),
        coverageIds: input.coverageIds.map((coverageId) =>
          toObjectId(coverageId, 'coverageId'),
        ),
        status: input.status,
        asOf: input.asOf,
        grossAmount: decimal128(input.grossAmount),
        packageAmount: decimal128(input.packageAmount),
        sponsorAmount: decimal128(input.sponsorAmount),
        patientAmount: decimal128(input.patientAmount),
        allocations: input.allocations.map((allocation) => ({
          invoiceLineId: toObjectId(
            String(allocation['invoiceLineId']),
            'invoiceLineId',
          ),
          patientCoverageId:
            allocation['coverageId'] === null
              ? null
              : toObjectId(
                  String(allocation['coverageId']),
                  'patientCoverageId',
                ),
          packageEnrollmentId:
            allocation['packageEnrollmentId'] === null
              ? null
              : toObjectId(
                  String(allocation['packageEnrollmentId']),
                  'packageEnrollmentId',
                ),
          grossAmount: decimal128(
            String(allocation['grossAmount']),
          ),
          packageAmount: decimal128(
            String(allocation['packageAmount']),
          ),
          deductibleAmount: decimal128(
            String(allocation['deductibleAmount']),
          ),
          copaymentAmount: decimal128(
            String(allocation['copaymentAmount']),
          ),
          coinsuranceAmount: decimal128(
            String(allocation['coinsuranceAmount']),
          ),
          sponsorAmount: decimal128(
            String(allocation['sponsorAmount']),
          ),
          patientAmount: decimal128(
            String(allocation['patientAmount']),
          ),
          deniedAmount: decimal128(
            String(allocation['deniedAmount']),
          ),
          denialReason: allocation['denialReason'],
        })),
      }],
      {
        session: input.session,
      },
    );

    return projectCoverageDetermination(
      record(created!.toObject()),
    );
  }
}