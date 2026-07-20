import type {
  InpatientAccessPolicyPort,
  InpatientAuditPort,
  InpatientCanonicalPatientPort,
  InpatientClockPort,
  InpatientOutboxPort,
  InpatientRealtimePort,
  InpatientSequencePort,
  InpatientTransactionManagerPort,
} from './inpatient.ports.js';

import type {
  InpatientSnapshotCryptoPort,
} from './inpatient.mutation-snapshots.js';

import type {
  InpatientBedBillingPort,
} from './inpatient-bed-operations.ports.js';

import type {
  FinancialDischargePort,
} from './inpatient-discharge.contracts.js';

import {
  InpatientAdmissionRepository,
} from './repositories/inpatient-admission.repository.js';

import {
  InpatientBedOperationRepository,
} from './repositories/inpatient-bed-operation.repository.js';

import {
  InpatientContextRepository,
} from './repositories/inpatient-context.repository.js';

import {
  InpatientDischargeRepository,
} from './repositories/inpatient-discharge.repository.js';

import {
  InpatientLocationRepository,
} from './repositories/inpatient-location.repository.js';

import {
  InpatientNursingRepository,
} from './repositories/inpatient-nursing.repository.js';

import {
  InpatientAccessPolicyService,
} from './services/inpatient-access-policy.service.js';

import {
  InpatientBedChargeCalculatorService,
} from './services/inpatient-bed-charge-calculator.service.js';

import {
  InpatientBedHoldExpiryService,
} from './services/inpatient-bed-hold-expiry.service.js';

import {
  InpatientBedOperationService,
} from './services/inpatient-bed-operation.service.js';

import {
  InpatientBedStateReconciliationService,
} from './services/inpatient-bed-state-reconciliation.service.js';

import {
  type InpatientConfigurationContextPort,
  InpatientCommandService,
} from './services/inpatient-command.service.js';

import {
  InpatientContextService,
} from './services/inpatient-context.service.js';

import {
  InpatientDischargeService,
} from './services/inpatient-discharge.service.js';

import {
  InpatientNursingService,
} from './services/inpatient-nursing.service.js';

import {
  AcceptAdmissionRecommendationWorkflow,
  AcceptAdmissionWorkflow,
  CancelAdmissionRecommendationWorkflow,
  CancelAdmissionWorkflow,
  CreateAdmissionRecommendationWorkflow,
  CreateAdmissionWorkflow,
  RejectAdmissionRecommendationWorkflow,
} from './workflows/inpatient-admission.workflows.js';

import {
  ActivateBedRateWorkflow,
  CreateBedRateWorkflow,
  SupersedeBedRateWorkflow,
} from './workflows/inpatient-bed-rate.workflows.js';

import {
  ChangeBedCatalogStatusWorkflow,
  ChangeRoomStatusWorkflow,
  ChangeWardStatusWorkflow,
  CreateBedWorkflow,
  CreateRoomWorkflow,
  CreateWardWorkflow,
  UpdateBedWorkflow,
  UpdateRoomWorkflow,
  UpdateWardWorkflow,
} from './workflows/inpatient-location.workflows.js';

export interface InpatientApplicationDependencies {
  transactionManager:
    InpatientTransactionManagerPort;

  audit:
    InpatientAuditPort;

  outbox:
    InpatientOutboxPort;

  realtime:
    InpatientRealtimePort;

  clock:
    InpatientClockPort;

  sequence:
    InpatientSequencePort;

  canonicalPatient:
    InpatientCanonicalPatientPort;

  snapshotCrypto:
    InpatientSnapshotCryptoPort;

  configurationContext:
    InpatientConfigurationContextPort;

  billing:
    InpatientBedBillingPort;

  financialDischarge:
    FinancialDischargePort;

  accessPolicy?:
    InpatientAccessPolicyPort;
}

export function createInpatientApplication(
  dependencies:
    InpatientApplicationDependencies,
) {
  const locations =
    new InpatientLocationRepository();

  const admissions =
    new InpatientAdmissionRepository();

  const contextRepository =
    new InpatientContextRepository();

  const operations =
    new InpatientBedOperationRepository();

  const nursingRepository =
    new InpatientNursingRepository();

  const dischargeRepository =
    new InpatientDischargeRepository();

  const context =
    new InpatientContextService(
      contextRepository,
      dependencies.clock,
      dependencies.canonicalPatient,
    );

  const accessPolicy =
    dependencies.accessPolicy ??
    new InpatientAccessPolicyService(
      contextRepository,
    );

  const command =
    new InpatientCommandService(
      locations,
      admissions,
      context,
      dependencies.configurationContext,
      accessPolicy,
      {
        transactionManager:
          dependencies.transactionManager,

        audit:
          dependencies.audit,

        outbox:
          dependencies.outbox,

        realtime:
          dependencies.realtime,

        clock:
          dependencies.clock,

        sequence:
          dependencies.sequence,

        snapshotCrypto:
          dependencies.snapshotCrypto,
      },
    );

  const bedOperations =
    new InpatientBedOperationService(
      command,
      {
        operations,

        billing:
          dependencies.billing,

        calculator:
          new InpatientBedChargeCalculatorService(),
      },
    );

  const nursing =
    new InpatientNursingService(
      command,
      nursingRepository,
    );

  const discharge =
    new InpatientDischargeService(
      command,
      dischargeRepository,
      bedOperations,
      dependencies.financialDischarge,
    );

  return {
    repositories: {
      locations,
      admissions,
      context:
        contextRepository,
      operations,
      nursing:
        nursingRepository,
      discharge:
        dischargeRepository,
    },

    services: {
      context,
      accessPolicy,
      command,
      bedOperations,
      nursing,
      discharge,

      bedHoldExpiry:
        new InpatientBedHoldExpiryService(
          command,
          operations,
        ),

      reconciliation:
        new InpatientBedStateReconciliationService(
          command,
          operations,
        ),
    },

    workflows: {
      createWard:
        new CreateWardWorkflow(
          command,
        ),

      updateWard:
        new UpdateWardWorkflow(
          command,
        ),

      changeWardStatus:
        new ChangeWardStatusWorkflow(
          command,
        ),

      createRoom:
        new CreateRoomWorkflow(
          command,
        ),

      updateRoom:
        new UpdateRoomWorkflow(
          command,
        ),

      changeRoomStatus:
        new ChangeRoomStatusWorkflow(
          command,
        ),

      createBed:
        new CreateBedWorkflow(
          command,
        ),

      updateBed:
        new UpdateBedWorkflow(
          command,
        ),

      changeBedStatus:
        new ChangeBedCatalogStatusWorkflow(
          command,
        ),

      createBedRate:
        new CreateBedRateWorkflow(
          command,
        ),

      activateBedRate:
        new ActivateBedRateWorkflow(
          command,
        ),

      supersedeBedRate:
        new SupersedeBedRateWorkflow(
          command,
        ),

      createAdmissionRecommendation:
        new CreateAdmissionRecommendationWorkflow(
          command,
        ),

      acceptAdmissionRecommendation:
        new AcceptAdmissionRecommendationWorkflow(
          command,
        ),

      rejectAdmissionRecommendation:
        new RejectAdmissionRecommendationWorkflow(
          command,
        ),

      cancelAdmissionRecommendation:
        new CancelAdmissionRecommendationWorkflow(
          command,
        ),

      createAdmission:
        new CreateAdmissionWorkflow(
          command,
        ),

      acceptAdmission:
        new AcceptAdmissionWorkflow(
          command,
        ),

      cancelAdmission:
        new CancelAdmissionWorkflow(
          command,
        ),
    },
  };
}

export type InpatientApplication =
  ReturnType<
    typeof createInpatientApplication
  >;