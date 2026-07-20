import type {
  NursingDeteriorationTaskPort,
  NursingObservationThresholdPolicyPort,
  NursingVitalSignIntegrationPort,
  NursingVitalSignQueryPort,
} from './nursing-observation.ports.js';

import type {
  NursingMedicationCommandDependencies,
} from './nursing-medication.workflow-ports.js';

import {
  NursingMedicationContextRepository,
} from './repositories/nursing-medication-context.repository.js';

import {
  NursingClinicalDocumentRepository,
} from './repositories/nursing-clinical-document.repository.js';

import {
  NursingObservationRepository,
} from './repositories/nursing-observation.repository.js';

import {
  NursingHandoverRepository,
  NursingVitalSignQueryRepository,
} from './repositories/nursing-vital-handover.repository.js';

import {
  MedicationAdministrationRepository,
} from './repositories/medication-administration.repository.js';

import {
  NursingMedicationContextService,
} from './services/nursing-medication-context.service.js';

import {
  NursingMedicationAccessPolicyService,
} from './services/nursing-medication-access-policy.service.js';

import {
  NursingMedicationCommandService,
} from './services/nursing-medication-command.service.js';

import {
  NursingObservationCommandService,
} from './services/nursing-observation-command.service.js';

import {
  DefaultNursingObservationThresholdPolicy,
} from './nursing-observation.thresholds.js';

import {
  DefaultMedicationTimingPolicy,
  MedicationSafetyPolicyService,
} from './services/medication-safety-policy.service.js';

import {
  MedicationAdministrationService,
} from './services/medication-administration.service.js';

import {
  CreateNursingAssessmentWorkflow,
  SignNursingAssessmentWorkflow,
} from './workflows/nursing-assessment-create-sign.workflows.js';

import {
  CorrectNursingAssessmentWorkflow,
  MarkNursingAssessmentEnteredInErrorWorkflow,
} from './workflows/nursing-assessment-correction.workflows.js';

import {
  CreateNursingCarePlanWorkflow,
  ReviewNursingCarePlanWorkflow,
} from './workflows/nursing-care-plan-create-review.workflows.js';

import {
  CancelNursingCarePlanWorkflow,
  CompleteNursingCarePlanWorkflow,
  CorrectNursingCarePlanWorkflow,
} from './workflows/nursing-care-plan-lifecycle.workflows.js';

import {
  CarryForwardNursingTaskWorkflow,
  ChangeNursingTaskStatusWorkflow,
  CreateNursingTaskWorkflow,
} from './workflows/nursing-task.workflows.js';

import {
  CorrectNursingVitalObservationWorkflow,
  EnterNursingVitalObservationInErrorWorkflow,
  ListNursingVitalTrendWorkflow,
  RecordNursingVitalObservationWorkflow,
} from './workflows/nursing-vital-observation.workflows.js';

import {
  CalculateFluidBalanceWorkflow,
  CorrectIntakeOutputWorkflow,
  EnterIntakeOutputInErrorWorkflow,
  RecordIntakeOutputWorkflow,
} from './workflows/nursing-intake-output.workflows.js';

import {
  CreateNursingDeviceWorkflow,
  RecordNursingDeviceObservationWorkflow,
  RemoveNursingDeviceWorkflow,
} from './workflows/nursing-device.workflows.js';

import {
  CorrectWardHandoverWorkflow,
  EnterWardHandoverInErrorWorkflow,
  ListWardHandoverWorklistWorkflow,
} from './workflows/nursing-handover.workflows.js';

import type {
  MedicationTimingPolicyPort,
} from './medication-administration.ports.js';

export interface CreateNursingMedicationApplicationOptions {
  dependencies:
    NursingMedicationCommandDependencies;

  vitalCommands:
    NursingVitalSignIntegrationPort;

  vitalQueries?:
    NursingVitalSignQueryPort;

  deteriorationThresholds?:
    NursingObservationThresholdPolicyPort;

  medicationTimingPolicy?:
    MedicationTimingPolicyPort;
}

class DeteriorationTaskAdapter
implements NursingDeteriorationTaskPort {
  public constructor(
    private readonly workflow:
      CreateNursingTaskWorkflow,
  ) {}

  public async create(
    input: Parameters<
      NursingDeteriorationTaskPort['create']
    >[0],
  ): Promise<string> {
    const created =
      await this.workflow.execute({
        actor:
          input.actor,

        idempotencyKey:
          input.idempotencyKey,

        input: {
          admissionId:
            input.context.admissionId,

          sourceType:
            'VITAL_SIGN' as never,

          sourceRecordId:
            input.vitalSignId,

          title:
            `Escalate ${input.evaluation.severity.toLowerCase()} deterioration score`,

          instructions:
            `Escalate observation score ${input.evaluation.totalScore}; triggered rules: ${input.evaluation.triggeredRules.map((rule) => rule.code).join(', ') || 'aggregate threshold'}`,

          priority:
            input.priority,

          dueAt:
            input.dueAt.toISOString(),

          recurrenceKey:
            `VITAL_${input.vitalSignId}`,
        },
      });

    return created.id;
  }
}

export function createNursingMedicationApplication(
  options:
    CreateNursingMedicationApplicationOptions,
) {
  const contextRepository =
    new NursingMedicationContextRepository();

  const clinicalDocuments =
    new NursingClinicalDocumentRepository();

  const observations =
    new NursingObservationRepository();

  const handovers =
    new NursingHandoverRepository();

  const vitalQueries =
    options.vitalQueries ??
    new NursingVitalSignQueryRepository();

  const medicationRepository =
    new MedicationAdministrationRepository();

  const context =
    new NursingMedicationContextService(
      contextRepository,
    );

  const accessPolicy =
    new NursingMedicationAccessPolicyService(
      contextRepository,
    );

  const command =
    new NursingMedicationCommandService(
      clinicalDocuments,
      clinicalDocuments,
      context,
      accessPolicy,
      options.dependencies,
    );

  const createTask =
    new CreateNursingTaskWorkflow(
      command,
    );

  const observationCommand =
    new NursingObservationCommandService(
      command,
      observations,
      handovers,
      options.vitalCommands,
      vitalQueries,
      options.deteriorationThresholds ??
        new DefaultNursingObservationThresholdPolicy(),
      new DeteriorationTaskAdapter(
        createTask,
      ),
    );

  const medication =
    new MedicationAdministrationService(
      command,
      medicationRepository,
      new MedicationSafetyPolicyService(
        options.medicationTimingPolicy ??
        new DefaultMedicationTimingPolicy(),
      ),
    );

  return {
    repositories: {
      context:
        contextRepository,
      clinicalDocuments,
      observations,
      handovers,
      vitalSigns:
        vitalQueries,
      medication:
        medicationRepository,
    },

    services: {
      context,
      accessPolicy,
      command,
      observationCommand,
      medication,
    },

    workflows: {
      createAssessment:
        new CreateNursingAssessmentWorkflow(
          command,
        ),
      signAssessment:
        new SignNursingAssessmentWorkflow(
          command,
        ),
      correctAssessment:
        new CorrectNursingAssessmentWorkflow(
          command,
        ),
      enterAssessmentInError:
        new MarkNursingAssessmentEnteredInErrorWorkflow(
          command,
        ),

      createCarePlan:
        new CreateNursingCarePlanWorkflow(
          command,
        ),
      reviewCarePlan:
        new ReviewNursingCarePlanWorkflow(
          command,
        ),
      completeCarePlan:
        new CompleteNursingCarePlanWorkflow(
          command,
        ),
      cancelCarePlan:
        new CancelNursingCarePlanWorkflow(
          command,
        ),
      correctCarePlan:
        new CorrectNursingCarePlanWorkflow(
          command,
        ),

      createTask,
      changeTaskStatus:
        new ChangeNursingTaskStatusWorkflow(
          command,
        ),
      carryForwardTask:
        new CarryForwardNursingTaskWorkflow(
          command,
        ),

      recordVitalObservation:
        new RecordNursingVitalObservationWorkflow(
          observationCommand,
        ),
      correctVitalObservation:
        new CorrectNursingVitalObservationWorkflow(
          observationCommand,
        ),
      enterVitalObservationInError:
        new EnterNursingVitalObservationInErrorWorkflow(
          observationCommand,
        ),
      listVitalTrend:
        new ListNursingVitalTrendWorkflow(
          observationCommand,
        ),

      recordIntakeOutput:
        new RecordIntakeOutputWorkflow(
          observationCommand,
        ),
      correctIntakeOutput:
        new CorrectIntakeOutputWorkflow(
          observationCommand,
        ),
      enterIntakeOutputInError:
        new EnterIntakeOutputInErrorWorkflow(
          observationCommand,
        ),
      calculateFluidBalance:
        new CalculateFluidBalanceWorkflow(
          observationCommand,
        ),

      createDevice:
        new CreateNursingDeviceWorkflow(
          observationCommand,
        ),
      recordDeviceObservation:
        new RecordNursingDeviceObservationWorkflow(
          observationCommand,
        ),
      removeDevice:
        new RemoveNursingDeviceWorkflow(
          observationCommand,
        ),

      correctHandover:
        new CorrectWardHandoverWorkflow(
          observationCommand,
        ),
      enterHandoverInError:
        new EnterWardHandoverInErrorWorkflow(
          observationCommand,
        ),
      listHandoverWorklist:
        new ListWardHandoverWorklistWorkflow(
          observationCommand,
        ),
    },
  };
}

export type NursingMedicationApplication =
  ReturnType<
    typeof createNursingMedicationApplication
  >;