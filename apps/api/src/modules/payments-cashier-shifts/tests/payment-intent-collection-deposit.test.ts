import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CashCounterModel,
  CashShiftModel,
  DepositModel,
  InvoiceModel,
  PaymentMethodConfigurationModel,
  PaymentModel,
} from '@hospital-mis/database';

import {
  PAYMENT_CASHIER_PERMISSION_KEYS,
} from '../payments-cashier-shifts.constants.js';

import {
  CashierShiftNotOpenError,
  PaymentMethodReferenceRequiredError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierActorContext,
} from '../payments-cashier-shifts.contracts.js';

import {
  PaymentsCashierShiftsAccessPolicyService,
} from '../services/payments-cashier-shifts-access-policy.service.js';

import {
  PaymentMethodTenderValidationService,
} from '../services/payment-method-tender-validation.service.js';

function objectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

function commonFields() {
  const actorId = objectId();

  return {
    facilityId:
      objectId(),
    transactionId:
      `tx-${objectId().toHexString()}`,
    correlationId:
      `corr-${objectId().toHexString()}`,
    schemaVersion:
      1,
    version:
      0,
    createdBy:
      actorId,
    updatedBy:
      actorId,
  };
}

function actor(
  facilityId: string,
  userId: string,
  staffId: string,
  counterId: string,
): PaymentCashierActorContext {
  return {
    userId,
    facilityId,
    correlationId:
      'corr-payment-collection-test',
    roleKeys: [
      'CASHIER',
    ],
    permissionKeys:
      new Set([
        PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT,
        PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_CASH,
        PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_NON_CASH,
        PAYMENT_CASHIER_PERMISSION_KEYS.PAYMENT_COLLECT_SPLIT,
      ]),
    staffId,
    departmentId:
      null,
    displayName:
      'Fictional Cashier',
    active:
      true,
    assignedCounterIds: [
      counterId,
    ],
  };
}

function paymentInput() {
  const common =
    commonFields();
  const methodA =
    objectId();
  const methodB =
    objectId();
  const receivedAt =
    new Date(
      '2026-07-21T10:00:00.000Z',
    );

  return {
    ...common,
    operationKey:
      'payment-operation-000001',
    paymentNumber:
      'PAY-2026-000001',
    receiptNumber:
      'RCP-2026-000001',
    paymentIntentId:
      null,
    patientAccountId:
      objectId(),
    patientId:
      objectId(),
    invoiceId:
      objectId(),
    cashierStaffId:
      objectId(),
    cashShiftId:
      objectId(),
    cashCounterId:
      objectId(),
    paymentMethodConfigurationId:
      null,
    paymentMethod:
      'SPLIT_TENDER',
    amount:
      '1000',
    currency:
      'PKR',
    externalReference:
      null,
    tenders: [
      {
        operationKey:
          'payment-operation-000001:tender:1',
        sequence:
          1,
        paymentMethodConfigurationId:
          methodA,
        paymentMethodCodeSnapshot:
          'CASH',
        paymentMethodKindSnapshot:
          'CASH',
        amount:
          '600',
        currency:
          'PKR',
        externalReference:
          null,
        maskedReference:
          null,
        referenceType:
          null,
        status:
          'POSTED',
        settledAt:
          receivedAt,
        failureCode:
          null,
        failureMessage:
          null,
        version:
          0,
      },
      {
        operationKey:
          'payment-operation-000001:tender:2',
        sequence:
          2,
        paymentMethodConfigurationId:
          methodB,
        paymentMethodCodeSnapshot:
          'CREDIT_CARD',
        paymentMethodKindSnapshot:
          'CARD',
        amount:
          '400',
        currency:
          'PKR',
        externalReference:
          'AUTH-778899',
        maskedReference:
          '******8899',
        referenceType:
          'CARD_AUTHORIZATION',
        status:
          'POSTED',
        settledAt:
          receivedAt,
        failureCode:
          null,
        failureMessage:
          null,
        version:
          0,
      },
    ],
    payerName:
      'Fictional Payer',
    responsiblePartyType:
      'PATIENT',
    notes:
      null,
    allocatedAmount:
      '800',
    unallocatedAmount:
      '200',
    refundedAmount:
      '0',
    status:
      'COMPLETED',
    receivedAt,
    postedAt:
      receivedAt,
    postedBy:
      common.createdBy,
    failureCode:
      null,
    failureMessage:
      null,
    reversalId:
      null,
  };
}

describe(
  'payment collection and deposit foundations',
  () => {
    it(
      'accepts an exactly reconciled split-tender payment',
      async () => {
        const payment =
          new PaymentModel(
            paymentInput(),
          );

        await expect(
          payment.validate(),
        ).resolves.toBeUndefined();

        expect(
          payment.amount.toString(),
        ).toBe(
          '1000',
        );
        expect(
          payment.tenders,
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      'rejects a tender total that differs from the payment amount',
      async () => {
        const input =
          paymentInput();
        input.tenders[1]!.amount =
          '399.99';
        const payment =
          new PaymentModel(
            input,
          );

        await expect(
          payment.validate(),
        ).rejects.toThrow(
          'Payment tenders must equal the payment amount exactly',
        );
      },
    );

    it(
      'rejects a possible full card number as an external reference',
      async () => {
        const facilityId =
          objectId();
        const userId =
          objectId();
        const staffId =
          objectId();
        const counterId =
          objectId();
        const shiftId =
          objectId();
        const methodId =
          objectId();
        const receivableId =
          objectId();
        const clearingId =
          objectId();
        const method =
          new PaymentMethodConfigurationModel({
            ...commonFields(),
            _id:
              methodId,
            facilityId,
            code:
              'CARD-MAIN',
            name:
              'Main card terminal',
            description:
              null,
            methodCode:
              'CREDIT_CARD',
            methodKind:
              'CARD',
            active:
              true,
            effectiveFrom:
              new Date(
                '2026-01-01T00:00:00.000Z',
              ),
            effectiveThrough:
              null,
            allowedCurrencies: [
              'PKR',
            ],
            externalReferenceRequired:
              true,
            bankReferenceRequired:
              false,
            cardReferenceRequired:
              true,
            cashEquivalent:
              false,
            refundEligible:
              true,
            reversalEligible:
              true,
            settlementMode:
              'IMMEDIATE',
            settlementDelayHours:
              null,
            permissionCodes: [],
            cashLedgerAccountId:
              null,
            clearingLedgerAccountId:
              clearingId,
            receivableLedgerAccountId:
              receivableId,
            externalProviderCode:
              null,
            requiresOpenCashierShift:
              true,
            deactivatedAt:
              null,
            deactivatedBy:
              null,
            deactivationReason:
              null,
          });
        const counter =
          new CashCounterModel({
            ...commonFields(),
            _id:
              counterId,
            facilityId,
            counterCode:
              'BILLING-01',
            name:
              'Billing Counter',
            location:
              'Ground Floor',
            departmentId:
              null,
            counterType:
              'BILLING',
            active:
              true,
            assignedUserIds: [
              userId,
            ],
            allowedPaymentMethodConfigurationIds: [
              methodId,
            ],
            currency:
              'PKR',
            cashHoldingLimit:
              '100000',
            openingFloatRequired:
              true,
            minimumOpeningFloat:
              '1000',
            maximumOpeningFloat:
              '5000',
            activeShiftPolicy:
              'CASHIER_AND_COUNTER',
            supervisorApprovalRequiredForClose:
              true,
            negativeExpectedCashAllowed:
              false,
            deactivatedAt:
              null,
            deactivatedBy:
              null,
            deactivationReason:
              null,
          });
        const shift =
          new CashShiftModel({
            ...commonFields(),
            _id:
              shiftId,
            facilityId,
            operationKey:
              'shift-operation-000001',
            shiftNumber:
              'SHIFT-2026-000001',
            cashCounterId:
              counterId,
            cashierUserId:
              userId,
            cashierStaffId:
              staffId,
            supervisorUserId:
              null,
            currency:
              'PKR',
            status:
              'OPEN',
            openedAt:
              new Date(),
            openingFloat:
              '1000',
            expectedCash:
              '1000',
            declaredCash:
              '1000',
            cashVariance:
              '0',
            nonCashTotal:
              '0',
            paymentMethodTotals: [],
            refundTotal:
              '0',
            reversalTotal:
              '0',
            depositTotal:
              '0',
            advanceTotal:
              '0',
            receiptCount:
              0,
            paymentCount:
              0,
          });
        const service =
          new PaymentMethodTenderValidationService(
            new PaymentsCashierShiftsAccessPolicyService(),
          );

        expect(
          () =>
            service.prepare(
              method.toObject() as never,
              {
                paymentMethodConfigurationId:
                  methodId.toHexString(),
                amount:
                  '1000',
                externalReference:
                  '4111111111111111',
                referenceType:
                  'CARD_AUTHORIZATION',
              },
              {
                currency:
                  'PKR',
                counter:
                  counter.toObject() as never,
                shift:
                  shift.toObject() as never,
                actor:
                  actor(
                    facilityId.toHexString(),
                    userId.toHexString(),
                    staffId.toHexString(),
                    counterId.toHexString(),
                  ),
                at:
                  new Date(),
              },
            ),
        ).toThrow(
          PaymentMethodReferenceRequiredError,
        );
      },
    );

    it(
      'blocks tender collection against a closed shift',
      () => {
        const facilityId =
          objectId();
        const userId =
          objectId();
        const staffId =
          objectId();
        const counterId =
          objectId();
        const methodId =
          objectId();
        const common =
          commonFields();
        const method = {
          ...common,
          _id:
            methodId,
          facilityId,
          code:
            'CASH',
          name:
            'Cash',
          description:
            null,
          methodCode:
            'CASH',
          methodKind:
            'CASH',
          active:
            true,
          effectiveFrom:
            new Date(
              '2026-01-01T00:00:00.000Z',
            ),
          effectiveThrough:
            null,
          allowedCurrencies: [
            'PKR',
          ],
          externalReferenceRequired:
            false,
          bankReferenceRequired:
            false,
          cardReferenceRequired:
            false,
          cashEquivalent:
            true,
          refundEligible:
            true,
          reversalEligible:
            true,
          settlementMode:
            'IMMEDIATE',
          settlementDelayHours:
            null,
          permissionCodes: [],
          cashLedgerAccountId:
            objectId(),
          clearingLedgerAccountId:
            null,
          receivableLedgerAccountId:
            objectId(),
          externalProviderCode:
            null,
          requiresOpenCashierShift:
            true,
          deactivatedAt:
            null,
          deactivatedBy:
            null,
          deactivationReason:
            null,
        } as never;
        const counter = {
          ...common,
          _id:
            counterId,
          facilityId,
          active:
            true,
          assignedUserIds: [
            userId,
          ],
          allowedPaymentMethodConfigurationIds: [
            methodId,
          ],
        } as never;
        const shift = {
          ...common,
          _id:
            objectId(),
          facilityId,
          cashCounterId:
            counterId,
          cashierUserId:
            userId,
          status:
            'CLOSED',
        } as never;
        const service =
          new PaymentMethodTenderValidationService(
            new PaymentsCashierShiftsAccessPolicyService(),
          );

        expect(
          () =>
            service.prepare(
              method,
              {
                paymentMethodConfigurationId:
                  methodId.toHexString(),
                amount:
                  '100',
              },
              {
                currency:
                  'PKR',
                counter,
                shift,
                actor:
                  actor(
                    facilityId.toHexString(),
                    userId.toHexString(),
                    staffId.toHexString(),
                    counterId.toHexString(),
                  ),
                at:
                  new Date(),
              },
            ),
        ).toThrow(
          CashierShiftNotOpenError,
        );
      },
    );

    it(
      'reconciles transferred deposit balances exactly',
      async () => {
        const deposit =
          new DepositModel({
            ...commonFields(),
            operationKey:
              'deposit-operation-000001',
            depositNumber:
              'DEP-2026-000001',
            patientId:
              objectId(),
            patientAccountId:
              objectId(),
            depositType:
              'GENERAL_ADVANCE',
            admissionId:
              null,
            procedureReferenceId:
              null,
            responsiblePartyType:
              'PATIENT',
            paymentId:
              objectId(),
            originalAmount:
              '1000',
            availableAmount:
              '400',
            appliedAmount:
              '200',
            refundedAmount:
              '100',
            transferredAmount:
              '300',
            forfeitedAmount:
              '0',
            currency:
              'PKR',
            status:
              'PARTIALLY_APPLIED',
            receivedAt:
              new Date(),
            expiresAt:
              null,
            releasedAt:
              null,
            releasedBy:
              null,
            releaseReason:
              null,
            reversalId:
              null,
          });

        await expect(
          deposit.validate(),
        ).resolves.toBeUndefined();
      },
    );

    it(
      'requires paid invoices to have no outstanding balance',
      async () => {
        const invoice =
          new InvoiceModel({
            ...commonFields(),
            invoiceNumber:
              'INV-2026-000001',
            patientAccountId:
              objectId(),
            patientId:
              objectId(),
            invoiceType:
              'OUTPATIENT',
            currency:
              'PKR',
            status:
              'PAID',
            lineCount:
              1,
            grossAmount:
              '1000',
            discountAmount:
              '0',
            taxAmount:
              '0',
            welfareAmount:
              '0',
            payerAmount:
              '0',
            patientAmount:
              '1000',
            netAmount:
              '1000',
            paymentsAppliedAmount:
              '900',
            creditsAppliedAmount:
              '0',
            outstandingAmount:
              '100',
            refundableAmount:
              '0',
            issuedAt:
              new Date(),
            finalizedAt:
              new Date(),
            finalizedBy:
              objectId(),
            lockedAccountVersion:
              1,
            taxSummary: [],
            discountIds: [],
            creditNoteIds: [],
            debitNoteIds: [],
            printableSnapshotVersion:
              1,
          });

        await expect(
          invoice.validate(),
        ).rejects.toThrow(
          'Paid invoices must have a zero outstanding amount',
        );
      },
    );
  },
);