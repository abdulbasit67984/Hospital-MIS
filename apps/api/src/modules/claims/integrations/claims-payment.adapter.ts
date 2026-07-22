import Decimal from 'decimal.js';

import {
  PatientAccountModel,
  PaymentModel,
  decimal128,
  decimal128ToString,
  toObjectId,
} from '@hospital-mis/database';

import {
  ClaimFinancialReconciliationError,
  ClaimPaymentOverAllocationError,
  ClaimVersionConflictError,
} from '../claims.errors.js';

import type {
  ClaimsPaymentIntegrationPort,
} from '../claims.ports.js';

const sponsorPartyTypes = new Set([
  'SPONSOR',
  'PAYER',
  'INSURANCE',
  'EMPLOYER',
  'GOVERNMENT',
  'CHARITY',
  'CORPORATE_PANEL',
  'OTHER_SPONSOR',
]);

export class MongoClaimsPaymentAdapter
implements ClaimsPaymentIntegrationPort {
  public async assertSponsorPayment(
    input: Parameters<ClaimsPaymentIntegrationPort['assertSponsorPayment']>[0],
  ): Promise<Readonly<{
    amount: string;
    availableAmount: string;
    status: string;
  }>> {
    const payment = await PaymentModel.findOne({
      _id: toObjectId(input.sponsorPaymentId, 'sponsorPaymentId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      currency: input.currency,
      status: { $in: ['POSTED', 'PARTIALLY_REFUNDED'] },
    })
      .session(input.session)
      .lean()
      .exec();

    if (
      payment === null ||
      payment.responsiblePartyType == null ||
      !sponsorPartyTypes.has(payment.responsiblePartyType)
    ) {
      throw new ClaimFinancialReconciliationError(
        `Payment is not an eligible sponsor receipt for payer ${input.payerOrganizationId}`,
      );
    }

    const account = await PatientAccountModel.findOne({
      _id: payment.patientAccountId,
      facilityId: payment.facilityId,
      'payerSnapshots.payerOrganizationId': toObjectId(
        input.payerOrganizationId,
        'payerOrganizationId',
      ),
    })
      .session(input.session)
      .select({ _id: 1 })
      .lean()
      .exec();
    if (account === null) {
      throw new ClaimFinancialReconciliationError(
        'Sponsor payment does not belong to the claim payer',
      );
    }

    return {
      amount: decimal128ToString(payment.amount),
      availableAmount: decimal128ToString(payment.unallocatedAmount),
      status: payment.status,
    };
  }

  public async consumeSponsorPayment(
    input: Parameters<ClaimsPaymentIntegrationPort['consumeSponsorPayment']>[0],
  ): Promise<void> {
    const amount = new Decimal(input.amount);
    if (!amount.isPositive()) {
      throw new ClaimPaymentOverAllocationError();
    }

    const payment = await PaymentModel.findOne({
      _id: toObjectId(input.sponsorPaymentId, 'sponsorPaymentId'),
      facilityId: toObjectId(input.facilityId, 'facilityId'),
      status: { $in: ['POSTED', 'PARTIALLY_REFUNDED'] },
    })
      .session(input.transaction.session)
      .lean()
      .exec();
    if (payment === null) {
      throw new ClaimFinancialReconciliationError(
        'Sponsor payment was not found',
      );
    }

    const available = new Decimal(
      decimal128ToString(payment.unallocatedAmount),
    );
    if (amount.greaterThan(available)) {
      throw new ClaimPaymentOverAllocationError();
    }

    const updated = await PaymentModel.updateOne(
      {
        _id: payment._id,
        facilityId: payment.facilityId,
        version: payment.version,
        unallocatedAmount: { $gte: decimal128(amount.toFixed(2)) },
      },
      {
        $set: {
          updatedBy: toObjectId(input.actorUserId, 'updatedBy'),
          transactionId: input.transaction.transactionId,
        },
        $inc: {
          allocatedAmount: decimal128(amount.toFixed(2)),
          unallocatedAmount: decimal128(amount.negated().toFixed(2)),
          version: 1,
        },
      },
      {
        session: input.transaction.session,
        runValidators: true,
      },
    ).exec();

    if (updated.modifiedCount !== 1) {
      throw new ClaimVersionConflictError();
    }
  }
}