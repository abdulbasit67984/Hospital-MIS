import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PaymentModel,
  RefundModel,
} from '@hospital-mis/database';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();

  return {
    facilityId: objectId(),
    transactionId: `tx-${objectId().toHexString()}`,
    correlationId: `corr-${objectId().toHexString()}`,
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function postedPayment() {
  const common = commonFields();
  const receivedAt = new Date('2026-07-21T10:00:00.000Z');

  return {
    ...common,
    operationKey: 'payment-control-operation-0001',
    paymentNumber: 'PAY-2026-000101',
    receiptNumber: 'RCP-2026-000101',
    paymentIntentId: null,
    patientAccountId: objectId(),
    patientId: objectId(),
    invoiceId: objectId(),
    cashierStaffId: objectId(),
    cashShiftId: objectId(),
    cashCounterId: objectId(),
    paymentMethodConfigurationId: null,
    paymentMethod: 'CASH',
    amount: '1000',
    currency: 'PKR',
    externalReference: null,
    tenders: [
      {
        operationKey: 'payment-control-operation-0001:tender:1',
        sequence: 1,
        paymentMethodConfigurationId: objectId(),
        paymentMethodCodeSnapshot: 'CASH',
        paymentMethodKindSnapshot: 'CASH',
        amount: '1000',
        refundedAmount: '250',
        currency: 'PKR',
        externalReference: null,
        maskedReference: null,
        referenceType: null,
        status: 'PARTIALLY_REFUNDED',
        settledAt: receivedAt,
        failureCode: null,
        failureMessage: null,
        version: 1,
      },
    ],
    payerName: 'Fictional Payer',
    responsiblePartyType: 'PATIENT',
    notes: null,
    allocatedAmount: '750',
    unallocatedAmount: '0',
    refundedAmount: '250',
    reversedAmount: '0',
    status: 'PARTIALLY_REFUNDED',
    receivedAt,
    postedAt: receivedAt,
    postedBy: common.createdBy,
    failureCode: null,
    failureMessage: null,
    reversalId: null,
  };
}

describe('refund, reversal, and reconciliation controls', () => {
  it('accepts an exactly reconciled partial payment refund', async () => {
    const payment = new PaymentModel(postedPayment());

    await expect(payment.validate()).resolves.toBeUndefined();
    expect(payment.refundedAmount.toString()).toBe('250');
    expect(payment.tenders[0]!.refundedAmount.toString()).toBe('250');
  });

  it('rejects a tender refund greater than the tender amount', async () => {
    const input = postedPayment();
    input.tenders[0]!.refundedAmount = '1000.01';
    const payment = new PaymentModel(input);

    await expect(payment.validate()).rejects.toThrow(
      'Tender refunded amount cannot exceed the tender amount',
    );
  });

  it('requires refund allocation effects and unallocated credit to equal the refund', async () => {
    const common = commonFields();
    const refund = new RefundModel({
      ...common,
      operationKey: 'refund-control-operation-0001',
      refundNumber: 'REF-2026-000101',
      refundRequestId: objectId(),
      patientAccountId: objectId(),
      patientId: objectId(),
      paymentId: objectId(),
      depositId: null,
      creditNoteId: null,
      paymentMethodConfigurationId: objectId(),
      cashCounterId: objectId(),
      cashShiftId: objectId(),
      cashierUserId: common.createdBy,
      amount: '300',
      currency: 'PKR',
      paymentMethod: 'CASH',
      externalReference: null,
      unallocatedRefundAmount: '50',
      allocationEffects: [
        {
          paymentAllocationId: objectId(),
          invoiceId: objectId(),
          accountChargeId: null,
          amount: '200',
        },
      ],
      status: 'POSTED',
      postedAt: new Date('2026-07-21T11:00:00.000Z'),
      postedBy: common.createdBy,
      failureCode: null,
      failureMessage: null,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
      reversalApprovalRequestId: null,
    });

    await expect(refund.validate()).rejects.toThrow(
      'Refund allocation effects plus unallocated amount must equal the refund amount',
    );
  });

  it('requires complete attribution when a posted refund is reversed', async () => {
    const common = commonFields();
    const refund = new RefundModel({
      ...common,
      operationKey: 'refund-control-operation-0002',
      refundNumber: 'REF-2026-000102',
      refundRequestId: objectId(),
      patientAccountId: objectId(),
      patientId: objectId(),
      paymentId: null,
      depositId: objectId(),
      creditNoteId: null,
      paymentMethodConfigurationId: objectId(),
      cashCounterId: null,
      cashShiftId: null,
      cashierUserId: common.createdBy,
      amount: '300',
      currency: 'PKR',
      paymentMethod: 'BANK_TRANSFER',
      externalReference: 'BANK-REF-001',
      unallocatedRefundAmount: '300',
      allocationEffects: [],
      status: 'REVERSED',
      postedAt: new Date('2026-07-21T11:00:00.000Z'),
      postedBy: common.createdBy,
      failureCode: null,
      failureMessage: null,
      reversedAt: new Date('2026-07-21T12:00:00.000Z'),
      reversedBy: common.createdBy,
      reversalReason: null,
      reversalApprovalRequestId: null,
    });

    await expect(refund.validate()).rejects.toThrow(
      'Reversed refunds require reversal attribution, reason, and approval',
    );
  });
});