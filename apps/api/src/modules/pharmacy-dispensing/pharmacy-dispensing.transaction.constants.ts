export const PHARMACY_DISPENSING_TRANSACTION_STATES = {
  CONTEXT_RESOLVED: 'CONTEXT_RESOLVED',
  PRESCRIPTION_VALIDATED: 'PRESCRIPTION_VALIDATED',
  SAFETY_EVALUATED: 'SAFETY_EVALUATED',
  PRICING_PREPARED: 'PRICING_PREPARED',
  DISPENSATION_CREATED: 'DISPENSATION_CREATED',
  REVIEW_RECORDED: 'REVIEW_RECORDED',
  SUBSTITUTION_RECORDED: 'SUBSTITUTION_RECORDED',
  RESERVATION_CREATED: 'RESERVATION_CREATED',
  DISPENSATION_UPDATED: 'DISPENSATION_UPDATED',
  AUDIT_RECORDED: 'AUDIT_RECORDED',
  OUTBOX_RECORDED: 'OUTBOX_RECORDED',
} as const;

export const PHARMACY_DISPENSING_AUDIT_ACTIONS = {
  DISPENSATION_CREATED: 'pharmacy.dispensation.created',
  DISPENSATION_VERIFIED: 'pharmacy.dispensation.verified',
  DISPENSATION_SECOND_CHECKED:
    'pharmacy.dispensation.second_checked',
  DISPENSATION_HELD: 'pharmacy.dispensation.held',
  DISPENSATION_RELEASED: 'pharmacy.dispensation.released',
  DISPENSATION_REJECTED: 'pharmacy.dispensation.rejected',
  SUBSTITUTION_PROPOSED: 'pharmacy.substitution.proposed',
  SUBSTITUTION_AUTHORIZED: 'pharmacy.substitution.authorized',
  SUBSTITUTION_REJECTED: 'pharmacy.substitution.rejected',
  RESERVATION_CREATED: 'pharmacy.dispensation.reservation_created',
} as const;

export const PHARMACY_DISPENSING_OUTBOX_EVENTS = {
  DISPENSATION_CREATED: 'pharmacy.dispensation.created.v1',
  DISPENSATION_VERIFIED: 'pharmacy.dispensation.verified.v1',
  DISPENSATION_SECOND_CHECKED:
    'pharmacy.dispensation.second_checked.v1',
  DISPENSATION_HELD: 'pharmacy.dispensation.held.v1',
  DISPENSATION_RELEASED: 'pharmacy.dispensation.released.v1',
  DISPENSATION_REJECTED: 'pharmacy.dispensation.rejected.v1',
  SUBSTITUTION_PROPOSED: 'pharmacy.substitution.proposed.v1',
  SUBSTITUTION_AUTHORIZED: 'pharmacy.substitution.authorized.v1',
  SUBSTITUTION_REJECTED: 'pharmacy.substitution.rejected.v1',
  RESERVATION_CREATED:
    'pharmacy.dispensation.reservation_created.v1',
} as const;