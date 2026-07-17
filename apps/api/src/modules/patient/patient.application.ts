import type {
  PatientAuditPort,
  PatientClockPort,
  PatientOutboxPort,
  PatientSensitiveSnapshotCryptoPort,
  PatientTransactionManagerPort,
} from './patient.ports.js';

import {
  GuardianQueryRepository,
} from './repositories/guardian-query.repository.js';

import {
  GuardianRepository,
} from './repositories/guardian.repository.js';

import {
  PatientGuardianMutationRepository,
} from './repositories/patient-guardian-mutation.repository.js';

import {
  PatientIdentifierRepository,
} from './repositories/patient-identifier.repository.js';

import {
  PatientCanonicalizationService,
  PatientMergeRepository,
} from './repositories/patient-merge.repository.js';

import {
  PatientProfileRepository,
} from './repositories/patient-profile.repository.js';

import {
  PatientQueryRepository,
} from './repositories/patient-query.repository.js';

import {
  PatientRepository,
} from './repositories/patient.repository.js';

import {
  GuardianQueryService,
} from './services/guardian-query.service.js';

import type {
  MedicalRecordNumberService,
} from './services/medical-record-number.service.js';

import {
  PatientDuplicateMatcherService,
} from './services/patient-duplicate-matcher.service.js';

import {
  PatientQueryService,
} from './services/patient-query.service.js';

import {
  PatientRegistrationSlipService,
} from './services/patient-registration-slip.service.js';

import {
  PatientSensitiveReadAuditor,
} from './services/patient-sensitive-read-auditor.service.js';

import {
  AddPatientAddressWorkflow,
  DeactivatePatientAddressWorkflow,
  UpdatePatientAddressWorkflow,
} from './workflows/patient-address.workflows.js';

import {
  CreatePatientAlertWorkflow,
  ResolvePatientAlertWorkflow,
} from './workflows/patient-alert.workflows.js';

import {
  AddPatientContactWorkflow,
  DeactivatePatientContactWorkflow,
  UpdatePatientContactWorkflow,
  VerifyPatientContactWorkflow,
} from './workflows/patient-contact.workflows.js';

import {
  AddPatientIdentifierWorkflow,
  RevokePatientIdentifierWorkflow,
  VerifyPatientIdentifierWorkflow,
} from './workflows/patient-identifier.workflows.js';

import {
  LinkPatientGuardianWorkflow,
  VerifyPatientGuardianWorkflow,
} from './workflows/patient-guardian.workflows.js';

import {
  EndPatientGuardianWorkflow,
} from './workflows/end-patient-guardian.workflow.js';

import {
  MergePatientsWorkflow,
} from './workflows/merge-patients.workflow.js';

import {
  RegisterPatientWorkflow,
} from './workflows/register-patient.workflow.js';

import {
  ResolveDuplicateReviewWorkflow,
} from './workflows/resolve-duplicate-review.workflow.js';

import {
  UpdateGuardianWorkflow,
} from './workflows/update-guardian.workflow.js';

import {
  UpdatePatientWorkflow,
} from './workflows/update-patient.workflow.js';

export interface CreatePatientApplicationOptions {
  transactionManager: PatientTransactionManagerPort;
  audit: PatientAuditPort;
  outbox: PatientOutboxPort;
  medicalRecordNumbers: MedicalRecordNumberService;
  snapshotCrypto: PatientSensitiveSnapshotCryptoPort;
  clock?: PatientClockPort;
}

const systemClock:
  PatientClockPort = {
    now(): Date {
      return new Date();
    },
  };

export function createPatientApplication(
  options:
    CreatePatientApplicationOptions,
) {
  const patientRepository =
    new PatientRepository();

  const patientIdentifierRepository =
    new PatientIdentifierRepository();

  const guardianRepository =
    new GuardianRepository();

  const patientProfileRepository =
    new PatientProfileRepository();

  const patientGuardianMutationRepository =
    new PatientGuardianMutationRepository();

  const patientMergeRepository =
    new PatientMergeRepository();

  const patientQueryRepository =
    new PatientQueryRepository();

  const guardianQueryRepository =
    new GuardianQueryRepository();

  const duplicateMatcher =
    new PatientDuplicateMatcherService(
      patientRepository,
      patientIdentifierRepository,
      guardianRepository,
      patientProfileRepository,
    );

  const canonicalization =
    new PatientCanonicalizationService(
      patientMergeRepository,
    );

  const clock =
    options.clock ??
    systemClock;

  const sensitiveReadAuditor =
    new PatientSensitiveReadAuditor(
      options.audit,
    );

  const patientQueryService =
    new PatientQueryService(
      patientQueryRepository,
      canonicalization,
      sensitiveReadAuditor,
      {
        clock,
      },
    );

  const guardianQueryService =
    new GuardianQueryService(
      guardianQueryRepository,
      sensitiveReadAuditor,
      {
        clock,
      },
    );

  const registrationSlipService =
    new PatientRegistrationSlipService(
      patientQueryService,
      {
        clock,
      },
    );

  const mutationDependencies = {
    transactionManager:
      options.transactionManager,

    audit:
      options.audit,

    outbox:
      options.outbox,

    clock,

    snapshotCrypto:
      options.snapshotCrypto,
  };

  const registerPatient =
    new RegisterPatientWorkflow(
      patientRepository,
      patientIdentifierRepository,
      guardianRepository,
      patientProfileRepository,
      duplicateMatcher,
      options.medicalRecordNumbers,
      mutationDependencies,
    );

  const updatePatient =
    new UpdatePatientWorkflow(
      patientRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const updateGuardian =
    new UpdateGuardianWorkflow(
      guardianRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const addPatientIdentifier =
    new AddPatientIdentifierWorkflow(
      patientRepository,
      patientIdentifierRepository,
      mutationDependencies,
    );

  const verifyPatientIdentifier =
    new VerifyPatientIdentifierWorkflow(
      patientIdentifierRepository,
      mutationDependencies,
    );

  const revokePatientIdentifier =
    new RevokePatientIdentifierWorkflow(
      patientIdentifierRepository,
      mutationDependencies,
    );

  const linkPatientGuardian =
    new LinkPatientGuardianWorkflow(
      patientRepository,
      guardianRepository,
      mutationDependencies,
    );

  const verifyPatientGuardian =
    new VerifyPatientGuardianWorkflow(
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const endPatientGuardian =
    new EndPatientGuardianWorkflow(
      patientRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const addPatientContact =
    new AddPatientContactWorkflow(
      patientRepository,
      patientProfileRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const updatePatientContact =
    new UpdatePatientContactWorkflow(
      patientProfileRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const verifyPatientContact =
    new VerifyPatientContactWorkflow(
      patientProfileRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const deactivatePatientContact =
    new DeactivatePatientContactWorkflow(
      patientProfileRepository,
      patientGuardianMutationRepository,
      mutationDependencies,
    );

  const addPatientAddress =
    new AddPatientAddressWorkflow(
      patientRepository,
      patientProfileRepository,
      mutationDependencies,
    );

  const updatePatientAddress =
    new UpdatePatientAddressWorkflow(
      patientProfileRepository,
      mutationDependencies,
    );

  const deactivatePatientAddress =
    new DeactivatePatientAddressWorkflow(
      patientProfileRepository,
      mutationDependencies,
    );

  const createPatientAlert =
    new CreatePatientAlertWorkflow(
      patientRepository,
      patientProfileRepository,
      mutationDependencies,
    );

  const resolvePatientAlert =
    new ResolvePatientAlertWorkflow(
      patientProfileRepository,
      mutationDependencies,
    );

  const resolveDuplicateReview =
    new ResolveDuplicateReviewWorkflow(
      patientMergeRepository,
      mutationDependencies,
    );

  const mergePatients =
    new MergePatientsWorkflow(
      patientMergeRepository,
      mutationDependencies,
    );

  return {
    repositories: {
      patientRepository,
      patientIdentifierRepository,
      guardianRepository,
      patientProfileRepository,
      patientGuardianMutationRepository,
      patientMergeRepository,
      patientQueryRepository,
      guardianQueryRepository,
    },

    services: {
      duplicateMatcher,
      canonicalization,
      patientQueryService,
      guardianQueryService,
      registrationSlipService,
      sensitiveReadAuditor,

      medicalRecordNumbers:
        options.medicalRecordNumbers,
    },

    workflows: {
      registerPatient,
      updatePatient,
      updateGuardian,
      addPatientIdentifier,
      verifyPatientIdentifier,
      revokePatientIdentifier,
      linkPatientGuardian,
      verifyPatientGuardian,
      endPatientGuardian,
      addPatientContact,
      updatePatientContact,
      verifyPatientContact,
      deactivatePatientContact,
      addPatientAddress,
      updatePatientAddress,
      deactivatePatientAddress,
      createPatientAlert,
      resolvePatientAlert,
      resolveDuplicateReview,
      mergePatients,
    },
  };
}

export type PatientApplication =
  ReturnType<
    typeof createPatientApplication
  >;