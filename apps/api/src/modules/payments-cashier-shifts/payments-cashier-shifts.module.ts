import type {
  Router,
} from 'express';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PaymentsCashierShiftsApplication,
} from './payments-cashier-shifts.application.js';

import type {
  PaymentCashierActorResolverPort,
} from './payments-cashier-shifts.ports.js';

import {
  createPaymentsCashierShiftsRouter,
} from './payments-cashier-shifts.routes.js';

export interface CreatePaymentsCashierShiftsModuleOptions {
  application: PaymentsCashierShiftsApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: PaymentCashierActorResolverPort;
}

export interface PaymentsCashierShiftsModule {
  application: PaymentsCashierShiftsApplication;
  router: Router;
}

export function createPaymentsCashierShiftsModule(
  options: CreatePaymentsCashierShiftsModuleOptions,
): PaymentsCashierShiftsModule {
  return {
    application: options.application,
    router: createPaymentsCashierShiftsRouter(options),
  };
}