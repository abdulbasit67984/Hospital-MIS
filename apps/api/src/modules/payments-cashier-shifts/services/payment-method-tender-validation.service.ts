import type {
  PaymentCashierActorContext,
  PaymentTenderInput,
} from '../payments-cashier-shifts.contracts.js';

import {
  CashCounterPaymentMethodError,
  CashierShiftNotOpenError,
  PaymentMethodCurrencyError,
  PaymentMethodInactiveError,
  PaymentMethodReferenceRequiredError,
} from '../payments-cashier-shifts.errors.js';

import type {
  PaymentCashierAccessPolicyPort,
  PaymentMethodTenderValidationPort,
} from '../payments-cashier-shifts.ports.js';

import type {
  CashCounterRecord,
  CashierShiftRecord,
  PaymentMethodConfigurationRecord,
} from '../payments-cashier-shifts.persistence.types.js';

import {
  maskPaymentReference,
} from '../payments-cashier-shifts.projections.js';

import type {
  PreparedPaymentTenderSnapshot,
} from '../repositories/payment-finance.repository.js';

const possibleFullCardNumber =
  /(?:\d[ -]*?){12,19}/u;

function requiredReferenceName(
  method:
    PaymentMethodConfigurationRecord,
): string | null {
  if (method.cardReferenceRequired) {
    return 'card authorization';
  }

  if (method.bankReferenceRequired) {
    return 'bank';
  }

  if (method.externalReferenceRequired) {
    return 'external payment';
  }

  return null;
}

function legacyPaymentMethod(
  method:
    PaymentMethodConfigurationRecord,
): string {
  switch (method.methodCode) {
    case 'CASH':
      return 'CASH';
    case 'CREDIT_CARD':
      return 'CREDIT_CARD';
    case 'DEBIT_CARD':
      return 'DEBIT_CARD';
    case 'BANK_TRANSFER':
      return 'BANK_TRANSFER';
    case 'BANK_DEPOSIT':
      return 'BANK_DEPOSIT';
    case 'CHEQUE':
      return 'CHEQUE';
    case 'MOBILE_WALLET':
      return 'MOBILE_WALLET';
    case 'ONLINE_PAYMENT':
      return 'ONLINE_PAYMENT';
    case 'CORPORATE_SETTLEMENT':
      return 'CORPORATE_SETTLEMENT';
    case 'PANEL_SETTLEMENT':
      return 'PANEL_SETTLEMENT';
    case 'OTHER':
      return 'OTHER';
  }
}

export interface ValidatedPaymentTender
extends PreparedPaymentTenderSnapshot {
  legacyPaymentMethod:
    string;
  debitLedgerAccountId:
    string;
  receivableLedgerAccountId:
    string;
}

export class PaymentMethodTenderValidationService
implements PaymentMethodTenderValidationPort {
  public constructor(
    private readonly accessPolicy:
      PaymentCashierAccessPolicyPort,
  ) {}

  public async validate(
    method:
      PaymentMethodConfigurationRecord,
    tender:
      PaymentTenderInput,
    context:
      Readonly<{
        currency: string;
        counter: CashCounterRecord;
        shift: CashierShiftRecord;
        actor: PaymentCashierActorContext;
        at: Date;
      }>,
  ): Promise<void> {
    this.prepare(
      method,
      tender,
      context,
    );
  }

  public prepare(
    method:
      PaymentMethodConfigurationRecord,
    tender:
      PaymentTenderInput,
    context:
      Readonly<{
        currency: string;
        counter: CashCounterRecord;
        shift: CashierShiftRecord;
        actor: PaymentCashierActorContext;
        at: Date;
      }>,
  ): ValidatedPaymentTender {
    const methodId =
      method._id.toHexString();

    if (
      !method.active ||
      method.effectiveFrom.getTime() >
        context.at.getTime() ||
      (
        method.effectiveThrough !== null &&
        method.effectiveThrough.getTime() <
          context.at.getTime()
      )
    ) {
      throw new PaymentMethodInactiveError();
    }

    if (
      !method.allowedCurrencies.includes(
        context.currency,
      )
    ) {
      throw new PaymentMethodCurrencyError();
    }

    if (
      !context.counter.active ||
      !context.counter
        .allowedPaymentMethodConfigurationIds
        .some(
          (candidate) =>
            candidate.toHexString() ===
            methodId,
        )
    ) {
      throw new CashCounterPaymentMethodError();
    }

    if (
      method.requiresOpenCashierShift &&
      (
        context.shift.status !== 'OPEN' ||
        context.shift.cashCounterId.toHexString() !==
          context.counter._id.toHexString() ||
        context.shift.cashierUserId.toHexString() !==
          context.actor.userId
      )
    ) {
      throw new CashierShiftNotOpenError();
    }

    this.accessPolicy.require({
      actor:
        context.actor,
      action:
        method.methodKind === 'CASH'
          ? 'PAYMENT_COLLECT_CASH'
          : 'PAYMENT_COLLECT_NON_CASH',
      resourceFacilityId:
        context.actor.facilityId,
      counterId:
        context.counter._id.toHexString(),
      cashierUserId:
        context.shift.cashierUserId.toHexString(),
      paymentMethodPermissionCodes:
        method.permissionCodes,
    });

    const externalReference =
      tender.externalReference?.trim() ??
      null;
    const referenceName =
      requiredReferenceName(
        method,
      );

    if (
      referenceName !== null &&
      externalReference === null
    ) {
      throw new PaymentMethodReferenceRequiredError(
        referenceName,
      );
    }

    if (
      method.methodKind === 'CARD' &&
      externalReference !== null &&
      possibleFullCardNumber.test(
        externalReference,
      )
    ) {
      throw new PaymentMethodReferenceRequiredError(
        'tokenized or authorization-only card',
      );
    }

    const maskedReference =
      tender.maskedReference?.trim() ??
      maskPaymentReference(
        externalReference,
      );

    if (
      method.methodKind === 'CARD' &&
      maskedReference !== null &&
      possibleFullCardNumber.test(
        maskedReference,
      )
    ) {
      throw new PaymentMethodReferenceRequiredError(
        'masked card reference',
      );
    }

    const debitLedgerAccountId =
      method.methodKind === 'CASH'
        ? method.cashLedgerAccountId
        : method.clearingLedgerAccountId;

    if (
      debitLedgerAccountId === null ||
      method.receivableLedgerAccountId === null
    ) {
      throw new CashCounterPaymentMethodError();
    }

    return {
      paymentMethodConfigurationId:
        methodId,
      paymentMethodCodeSnapshot:
        method.methodCode,
      paymentMethodKindSnapshot:
        method.methodKind,
      amount:
        tender.amount,
      externalReference,
      maskedReference,
      referenceType:
        tender.referenceType ??
        null,
      legacyPaymentMethod:
        legacyPaymentMethod(
          method,
        ),
      debitLedgerAccountId:
        debitLedgerAccountId.toHexString(),
      receivableLedgerAccountId:
        method.receivableLedgerAccountId.toHexString(),
    };
  }
}