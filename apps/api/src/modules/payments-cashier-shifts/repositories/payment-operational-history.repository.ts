import {
  PaymentOperationalHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PaymentOperationalHistoryPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  PaymentCashierMongoSession,
  PaymentOperationalHistoryRecord,
} from '../payments-cashier-shifts.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

export class MongoPaymentOperationalHistoryRepository
implements PaymentOperationalHistoryPort {
  public async append(
    input: Omit<
      PaymentOperationalHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PaymentCashierMongoSession,
  ): Promise<PaymentOperationalHistoryRecord> {
    const [created] = await PaymentOperationalHistoryModel.create(
      [
        {
          ...input,
          facilityId: toObjectId(
            input.facilityId.toHexString(),
            'facilityId',
          ),
          entityId: toObjectId(input.entityId.toHexString(), 'entityId'),
          actorUserId: toObjectId(
            input.actorUserId.toHexString(),
            'actorUserId',
          ),
          actorStaffId:
            input.actorStaffId === null
              ? null
              : toObjectId(input.actorStaffId.toHexString(), 'actorStaffId'),
          approvalRequestId:
            input.approvalRequestId === null
              ? null
              : toObjectId(
                  input.approvalRequestId.toHexString(),
                  'approvalRequestId',
                ),
          cashCounterId:
            input.cashCounterId === null
              ? null
              : toObjectId(input.cashCounterId.toHexString(), 'cashCounterId'),
          cashShiftId:
            input.cashShiftId === null
              ? null
              : toObjectId(input.cashShiftId.toHexString(), 'cashShiftId'),
          paymentMethodConfigurationId:
            input.paymentMethodConfigurationId === null
              ? null
              : toObjectId(
                  input.paymentMethodConfigurationId.toHexString(),
                  'paymentMethodConfigurationId',
                ),
          patientId:
            input.patientId === null
              ? null
              : toObjectId(input.patientId.toHexString(), 'patientId'),
          patientAccountId:
            input.patientAccountId === null
              ? null
              : toObjectId(
                  input.patientAccountId.toHexString(),
                  'patientAccountId',
                ),
          invoiceId:
            input.invoiceId === null
              ? null
              : toObjectId(input.invoiceId.toHexString(), 'invoiceId'),
          paymentId:
            input.paymentId === null
              ? null
              : toObjectId(input.paymentId.toHexString(), 'paymentId'),
          refundId:
            input.refundId === null
              ? null
              : toObjectId(input.refundId.toHexString(), 'refundId'),
          receiptId:
            input.receiptId === null
              ? null
              : toObjectId(input.receiptId.toHexString(), 'receiptId'),
          createdBy: toObjectId(input.createdBy.toHexString(), 'createdBy'),
          updatedBy: toObjectId(input.updatedBy.toHexString(), 'updatedBy'),
        },
      ],
      { session },
    );

    return record<PaymentOperationalHistoryRecord>(created.toObject());
  }
}