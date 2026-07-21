export const billingCurrencyValues = ['PKR'] as const;

export const chargeCategoryStatusValues = [
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
] as const;

export const chargeCatalogStatusValues = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
] as const;

export const chargeTypeValues = [
  'REGISTRATION',
  'CONSULTATION',
  'EMERGENCY',
  'PROCEDURE',
  'LABORATORY',
  'RADIOLOGY',
  'BED',
  'ROOM',
  'ICU',
  'NURSING',
  'MEDICATION_ADMINISTRATION',
  'PHARMACY',
  'INVENTORY',
  'SURGERY',
  'PACKAGE',
  'MISCELLANEOUS',
] as const;

export const chargeRuleTypeValues = [
  'REQUIRES',
  'MUTUALLY_EXCLUSIVE',
  'MINIMUM_QUANTITY',
  'MAXIMUM_QUANTITY',
  'MINIMUM_PRICE',
  'MAXIMUM_PRICE',
] as const;

export const taxCalculationModeValues = [
  'EXEMPT',
  'INCLUSIVE',
  'EXCLUSIVE',
] as const;

export const roundingModeValues = [
  'HALF_UP',
  'HALF_EVEN',
  'DOWN',
  'UP',
] as const;

export const priceListStatusValues = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
] as const;

export const priceListTypeValues = [
  'CASH',
  'SELF_PAY',
  'PAYER',
  'CORPORATE',
  'GOVERNMENT',
  'PACKAGE',
] as const;

export const billingContextValues = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
] as const;

export const rateStatusValues = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
] as const;

export const packageStatusValues = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'RETIRED',
] as const;

export const packageEnrollmentStatusValues = [
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED',
] as const;

export const packageUtilizationStatusValues = [
  'RESERVED',
  'CONSUMED',
  'REVERSED',
  'CANCELLED',
] as const;

export const patientAccountTypeValues = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
  'GENERAL',
] as const;

export const patientAccountStatusValues = [
  'OPEN',
  'FINALIZED',
  'SUSPENDED',
  'CANCELLED',
  'WRITTEN_OFF',
] as const;

export const responsiblePartyTypeValues = [
  'PATIENT',
  'GUARANTOR',
  'PAYER',
  'EMPLOYER',
  'OTHER',
] as const;

export const chargeStatusValues = [
  'DRAFT',
  'PENDING',
  'POSTED',
  'CANCELLED',
  'REVERSED',
  'CREDITED',
  'ADJUSTED',
  'WRITTEN_OFF',
  'TRANSFERRED',
  'CORRECTED',
] as const;

export const chargeSourceModuleValues = [
  'REGISTRATION',
  'CLINICAL_EMR',
  'LABORATORY',
  'RADIOLOGY',
  'INPATIENT',
  'NURSING_MEDICATION',
  'INVENTORY',
  'PHARMACY_DISPENSING',
  'UNIFIED_BILLING',
] as const;

export const chargeHistoryActionValues = [
  'CREATED',
  'POSTED',
  'CANCELLED',
  'REVERSED',
  'CREDITED',
  'ADJUSTED',
  'WRITTEN_OFF',
  'TRANSFERRED',
  'CORRECTED',
] as const;

export const invoiceStatusValues = [
  'DRAFT',
  'FINALIZED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'CORRECTED',
] as const;

export const invoiceTypeValues = [
  'OUTPATIENT',
  'INPATIENT_INTERIM',
  'INPATIENT_FINAL',
  'EMERGENCY',
] as const;

export const invoiceHistoryActionValues = [
  'CREATED',
  'FINALIZED',
  'CANCELLED',
  'CORRECTED',
] as const;

export const financialNoteStatusValues = [
  'DRAFT',
  'POSTED',
  'CANCELLED',
  'REVERSED',
] as const;

export const discountTypeValues = [
  'FIXED',
  'PERCENTAGE',
] as const;

export const discountScopeValues = [
  'LINE',
  'ACCOUNT',
] as const;

export const approvalStatusValues = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;

export const approvalTypeValues = [
  'DISCOUNT',
  'PRICE_OVERRIDE',
  'REVERSAL',
  'PAYMENT_REVERSAL',
  'CREDIT',
  'WRITE_OFF',
  'REFUND',
  'REFUND_REVERSAL',
  'DEPOSIT_TRANSFER',
  'DEPOSIT_RELEASE',
  'CASH_SHIFT_REOPEN',
  'CASH_SHIFT_CLOSE',
  'SHIFT_VARIANCE',
  'CASH_MOVEMENT',
  'ACCOUNT_FINALIZATION',
] as const;

export const paymentMethodValues = [
  'CASH',
  'CARD',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'BANK_DEPOSIT',
  'MOBILE_WALLET',
  'ONLINE_PAYMENT',
  'CHEQUE',
  'CORPORATE_SETTLEMENT',
  'PANEL_SETTLEMENT',
  'OTHER',
  'SPLIT_TENDER',
] as const;

export const paymentIntentPurposeValues = [
  'ACCOUNT_PAYMENT',
  'INVOICE_PAYMENT',
  'PATIENT_DEPOSIT',
  'ADMISSION_DEPOSIT',
  'PROCEDURE_DEPOSIT',
  'GENERAL_ADVANCE',
  'REFUND',
] as const;

export const paymentIntentStatusValues = [
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'REVERSED',
] as const;

export const paymentStatusValues = [
  'PENDING',
  'POSTED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'REVERSED',
] as const;

export const allocationStatusValues = [
  'ACTIVE',
  'REVERSED',
] as const;

export const depositTypeValues = [
  'PATIENT',
  'ADMISSION',
  'PROCEDURE',
  'GENERAL_ADVANCE',
] as const;

export const depositStatusValues = [
  'AVAILABLE',
  'PARTIALLY_APPLIED',
  'APPLIED',
  'PARTIALLY_TRANSFERRED',
  'TRANSFERRED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FORFEITED',
  'REVERSED',
] as const;

export const refundRequestStatusValues = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
] as const;

export const refundStatusValues = [
  'PENDING',
  'POSTED',
  'FAILED',
  'CANCELLED',
  'REVERSED',
] as const;

export const paymentReversalStatusValues = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'FAILED',
  'CANCELLED',
] as const;

export const ledgerAccountTypeValues = [
  'ASSET',
  'LIABILITY',
  'REVENUE',
  'EXPENSE',
  'CONTROL',
] as const;

export const ledgerTransactionStatusValues = [
  'POSTED',
  'REVERSED',
] as const;

export const ledgerEntryDirectionValues = [
  'DEBIT',
  'CREDIT',
] as const;