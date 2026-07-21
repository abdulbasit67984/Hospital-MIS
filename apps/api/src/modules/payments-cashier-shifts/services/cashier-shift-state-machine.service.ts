import type {
  CashierShiftStatus,
} from '../payments-cashier-shifts.constants.js';

import {
  CashierShiftNotOpenError,
} from '../payments-cashier-shifts.errors.js';

export type CashierShiftTransitionAction =
  | 'SUSPEND'
  | 'RESUME'
  | 'BEGIN_CLOSING'
  | 'CLOSE';

const allowedTransitions: Readonly<
  Record<
    CashierShiftTransitionAction,
    readonly CashierShiftStatus[]
  >
> = {
  SUSPEND: ['OPEN'],
  RESUME: ['SUSPENDED'],
  BEGIN_CLOSING: ['OPEN', 'SUSPENDED'],
  CLOSE: ['CLOSING_IN_PROGRESS'],
};

export class CashierShiftStateMachineService {
  public requireTransition(
    currentStatus: CashierShiftStatus,
    action: CashierShiftTransitionAction,
  ): void {
    if (!allowedTransitions[action].includes(currentStatus)) {
      throw new CashierShiftNotOpenError();
    }
  }

  public requireFinancialActivityAllowed(
    currentStatus: CashierShiftStatus,
  ): void {
    if (currentStatus !== 'OPEN') {
      throw new CashierShiftNotOpenError();
    }
  }
}