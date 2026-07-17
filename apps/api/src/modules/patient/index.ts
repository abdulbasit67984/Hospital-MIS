import type {
  createPatientInfrastructure,
} from '../../infrastructure/patient-infrastructure.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import {
  createGuardianRouter,
} from './guardian.routes.js';

import {
  createPatientRecordPolicies,
} from './patient.policy.js';

import {
  createPatientRouter,
} from './patient.routes.js';

export interface CreatePatientModuleOptions {
  infrastructure:
    ReturnType<
      typeof createPatientInfrastructure
    >;

  authenticationService:
    AuthenticationService;

  authorizationService:
    AuthorizationService;
}

export function createPatientModule(
  options:
    CreatePatientModuleOptions,
) {
  const policies =
    createPatientRecordPolicies(
      options.authorizationService,
    );

  const patientRouter =
    createPatientRouter({
      application:
        options.infrastructure,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,
    });

  const guardianRouter =
    createGuardianRouter({
      application:
        options.infrastructure,

      authenticationService:
        options.authenticationService,

      authorizationService:
        options.authorizationService,
    });

  return {
    ...options.infrastructure,
    policies,
    patientRouter,
    guardianRouter,
  };
}

export * from './controllers/guardian.controller.js';
export * from './controllers/patient-command.controller.js';
export * from './controllers/patient-query.controller.js';

export * from './guardian.routes.js';
export * from './patient.application.js';
export * from './patient.constants.js';
export * from './patient.errors.js';
export * from './patient.http-helpers.js';
export * from './patient.http.validation.js';
export * from './patient.mapper.js';
export * from './patient.merge.js';
export * from './patient.mutation.mapper.js';
export * from './patient.mutation.workflow-helpers.js';
export * from './patient.normalization.js';
export * from './patient.openapi.js';
export * from './patient.policy.js';
export * from './patient.ports.js';
export * from './patient.projections.js';
export * from './patient.query.mapper.js';
export * from './patient.query.types.js';
export * from './patient-profile.mutation.types.js';
export * from './patient-profile.validation.js';
export * from './patient.routes.js';
export * from './patient.transaction.constants.js';
export * from './patient.types.js';
export * from './patient.validation.js';
export * from './patient.workflow-helpers.js';

export {
  guardianProfileQuerySchema,
  guardianSearchQuerySchema,
  patientProfileQuerySchema,
  patientRegistrationSlipQuerySchema,
  patientSearchQuerySchema,
  type GuardianProfileHttpQuery,
  type GuardianSearchHttpQuery,
  type PatientProfileHttpQuery,
  type PatientSearchHttpQuery,
} from './patient.query.validation.js';

export * from './repositories/guardian-query.repository.js';
export * from './repositories/guardian.repository.js';
export * from './repositories/patient-guardian-mutation.repository.js';
export * from './repositories/patient-identifier.repository.js';
export * from './repositories/patient-merge.repository.js';
export * from './repositories/patient-profile.repository.js';
export * from './repositories/patient-query.repository.js';
export * from './repositories/patient.repository.js';

export * from './services/guardian-query.service.js';
export * from './services/medical-record-number.service.js';
export * from './services/patient-duplicate-matcher.service.js';
export * from './services/patient-query.service.js';
export * from './services/patient-registration-slip.service.js';
export * from './services/patient-sensitive-read-auditor.service.js';

export * from './workflows/end-patient-guardian.workflow.js';
export * from './workflows/merge-patients.workflow.js';
export * from './workflows/patient-address.workflows.js';
export * from './workflows/patient-alert.workflows.js';
export * from './workflows/patient-contact.workflows.js';
export * from './workflows/patient-guardian.workflows.js';
export * from './workflows/patient-identifier.workflows.js';
export * from './workflows/register-patient.workflow.js';
export * from './workflows/resolve-duplicate-review.workflow.js';
export * from './workflows/update-guardian.workflow.js';
export * from './workflows/update-patient.workflow.js';