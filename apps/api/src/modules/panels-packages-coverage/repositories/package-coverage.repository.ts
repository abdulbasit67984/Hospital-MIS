import {
  PackageEnrollmentBalanceModel,
  PackageEnrollmentModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PackageCoverageRepositoryPort,
} from '../panels-packages-coverage.ports.js';

import type {
  PackageEnrollmentBalanceRecord,
  PackageEnrollmentRecord,
  PpcMongoSession,
} from '../panels-packages-coverage.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class PackageCoverageRepository
implements PackageCoverageRepositoryPort {
  public async enroll(
    actor: Parameters<PackageCoverageRepositoryPort['enroll']>[0],
    input: Parameters<PackageCoverageRepositoryPort['enroll']>[1],
    enrollmentNumber: string,
    transaction: Parameters<PackageCoverageRepositoryPort['enroll']>[3],
  ): Promise<PackageEnrollmentRecord> {
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
        treatmentPackageId: toObjectId(input.packageId, 'packageId'),
        accountId:
          input.accountId === null
            ? null
            : toObjectId(input.accountId, 'accountId'),
        invoiceId:
          input.invoiceId === null
            ? null
            : toObjectId(input.invoiceId, 'invoiceId'),
        effectiveFrom: new Date(input.startsAt),
        effectiveThrough:
          input.expiresAt === null ? null : new Date(input.expiresAt),
        authorizationReference: input.authorizationReference ?? null,
        status: 'ACTIVE',
      }],
      { session: transaction.session },
    );

    return record<PackageEnrollmentRecord>(created!.toObject());
  }

  public async createBalances(
    actor: Parameters<PackageCoverageRepositoryPort['createBalances']>[0],
    enrollmentId: string,
    balances: Parameters<PackageCoverageRepositoryPort['createBalances']>[2],
    transaction: Parameters<PackageCoverageRepositoryPort['createBalances']>[3],
  ): Promise<PackageEnrollmentBalanceRecord[]> {
    const created = await PackageEnrollmentBalanceModel.insertMany(
      balances.map((balance) => ({
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        packageEnrollmentId: toObjectId(
          enrollmentId,
          'packageEnrollmentId',
        ),
        treatmentPackageItemId: toObjectId(
          balance.treatmentPackageItemId,
          'treatmentPackageItemId',
        ),
        includedQuantity: decimal128(balance.includedQuantity),
        reservedQuantity: decimal128('0'),
        consumedQuantity: decimal128('0'),
        reversedQuantity: decimal128('0'),
        includedAmount: decimal128(balance.includedAmount),
        reservedAmount: decimal128('0'),
        consumedAmount: decimal128('0'),
        reversedAmount: decimal128('0'),
      })),
      { session: transaction.session, ordered: true },
    );

    return created.map((item) =>
      record<PackageEnrollmentBalanceRecord>(item.toObject()),
    );
  }

  public async findEnrollment(
    facilityId: string,
    enrollmentId: string,
    session?: PpcMongoSession,
  ): Promise<PackageEnrollmentRecord | null> {
    const query = PackageEnrollmentModel.findOne({
      _id: toObjectId(enrollmentId, 'enrollmentId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    }).lean();

    return record<PackageEnrollmentRecord | null>(
      await (session === undefined ? query : query.session(session)).exec(),
    );
  }
}