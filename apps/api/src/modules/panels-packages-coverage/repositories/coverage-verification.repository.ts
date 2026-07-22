import {
  PatientCoverageModel,
  PatientCoverageVerificationModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  CoverageVerificationRepositoryPort,
} from '../services/coverage-verification.service.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class CoverageVerificationRepository
implements CoverageVerificationRepositoryPort {
  public async findCoverage(
    facilityId: string,
    coverageId: string,
  ) {
    const found = await PatientCoverageModel.findOne({
      _id: toObjectId(coverageId, 'coverageId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    }).lean().exec();

    if (found === null) {
      return null;
    }

    return {
      id: found._id.toHexString(),
      patientId: found.patientId.toHexString(),
      version: found.version,
      status: found.status,
    };
  }

  public async appendVerification(
    input: Parameters<CoverageVerificationRepositoryPort['appendVerification']>[0],
  ) {
    const [created] = await PatientCoverageVerificationModel.create(
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
        patientCoverageId: toObjectId(
          input.coverageId,
          'coverageId',
        ),
        status: input.verifiedEligible
          ? 'VERIFIED'
          : 'INELIGIBLE',
        verifiedFrom: input.verifiedFrom,
        verifiedThrough: input.verifiedThrough,
        verificationReference: input.verificationReference,
        responseSnapshot: {
          eligible: input.verifiedEligible,
        },
        reason: input.reason,
      }],
      { session: input.session },
    );

    return {
      id: created!._id.toHexString(),
    };
  }

  public async applyVerification(
    input: Parameters<CoverageVerificationRepositoryPort['applyVerification']>[0],
  ) {
    const updated = await PatientCoverageModel.findOneAndUpdate(
      {
        _id: toObjectId(input.coverageId, 'coverageId'),
        facilityId: toObjectId(input.facilityId, 'facilityId'),
        version: input.expectedVersion,
      },
      {
        $set: {
          status: input.status,
          lastVerificationId: toObjectId(
            input.verificationId,
            'verificationId',
          ),
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

    if (updated === null) {
      return null;
    }

    return {
      id: updated._id.toHexString(),
      patientId: updated.patientId.toHexString(),
      status: updated.status,
      version: updated.version,
    };
  }
}