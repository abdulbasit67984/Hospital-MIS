export type FinancialAction = 'DISCOUNT'|'PRICE_OVERRIDE'|'REVERSAL'|'CREDIT'|'WRITE_OFF'|'REFUND';
export type ApprovalStatus = 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED'|'EXPIRED';
export type PaymentMethod = 'CASH'|'CARD'|'BANK_TRANSFER'|'MOBILE_WALLET'|'CHEQUE'|'OTHER';
export type PaymentStatus = 'PENDING'|'POSTED'|'REVERSED'|'FAILED';
export type RefundStatus = 'REQUESTED'|'APPROVED'|'POSTED'|'REJECTED'|'CANCELLED';
export interface FinancialActor { userId:string; staffId:string|null; facilityId:string; permissions:ReadonlySet<string>; correlationId:string; ipAddress:string|null; userAgent:string|null; }
export interface MoneyAllocation { invoiceId:string; amount:string; }
export interface RequestApprovalInput { action:FinancialAction; entityType:string; entityId:string; amount:string; reasonCode:string; reason:string; expectedVersion:number; }
export interface DecideApprovalInput { approvalId:string; decision:'APPROVE'|'REJECT'; reason:string; expectedVersion:number; }
export interface ReverseChargeInput { chargeId:string; quantity:string|null; amount:string|null; reasonCode:string; reason:string; approvalId:string|null; expectedVersion:number; idempotencyKey:string; }
export interface AdjustChargeInput { chargeId:string; discountAmount:string; taxAmount:string|null; patientResponsibilityAmount:string|null; payerResponsibilityAmount:string|null; reasonCode:string; reason:string; approvalId:string|null; expectedVersion:number; idempotencyKey:string; }
export interface WriteOffInput { accountId:string; invoiceId:string|null; amount:string; reasonCode:string; reason:string; approvalId:string; expectedVersion:number; idempotencyKey:string; }
export interface RecordPaymentInput { accountId:string; amount:string; currency:'PKR'; method:PaymentMethod; allocations:readonly MoneyAllocation[]; externalReference:string|null; cashierId:string|null; shiftId:string|null; counterId:string|null; receivedAt:string; idempotencyKey:string; }
export interface RequestRefundInput { paymentId:string; amount:string; reasonCode:string; reason:string; approvalId:string|null; idempotencyKey:string; }
export interface BillingReportQuery { facilityId:string; from:string; to:string; departmentId?:string; payerOrganizationId?:string; sourceModule?:string; status?:string; page:number; pageSize:number; }
export interface AgingBucket { label:string; amount:string; accountCount:number; }
export interface ReconciliationResult { facilityId:string; from:string; to:string; charges:string; invoiced:string; payments:string; credits:string; refunds:string; writeOffs:string; outstanding:string; balanced:boolean; discrepancies:readonly string[]; }
export interface RecoveryResult { scanned:number; recovered:number; failed:number; skipped:number; }