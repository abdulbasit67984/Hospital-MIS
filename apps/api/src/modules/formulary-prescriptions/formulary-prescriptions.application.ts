import type {
  FormularyStockVisibilityPort,
  MedicineInteractionPort,
  PrescriptionPrintPort,
} from './formulary-prescriptions.ports.js';

import {
  MedicineFormularyRepository,
} from './repositories/medicine-formulary.repository.js';

import {
  PrescriptionRepository,
} from './repositories/prescription.repository.js';

import {
  FormularyPrescriptionAccessPolicyService,
} from './services/formulary-prescription-access-policy.service.js';

import {
  FormularyPrescriptionCommandService,
  type FormularyPrescriptionMutationDependencies,
} from './services/formulary-prescription-command.service.js';

import {
  FormularyPrescriptionContextService,
} from './services/formulary-prescription-context.service.js';

import {
  FormularyPrescriptionQueryService,
} from './services/formulary-prescription-query.service.js';

import {
  FormularyPrescriptionSensitiveReadAuditor,
} from './services/formulary-prescription-sensitive-read-auditor.service.js';

import {
  PrescriptionSafetyService,
} from './services/prescription-safety.service.js';

import {
  ChangeFormularyItemStatusWorkflow,
  CreateFormularyItemWorkflow,
  UpdateFormularyItemWorkflow,
} from './workflows/formulary-item-command.workflows.js';

import {
  IssuePrescriptionWorkflow,
} from './workflows/issue-prescription.workflow.js';

import {
  CancelPrescriptionWorkflow,
  ReplacePrescriptionWorkflow,
} from './workflows/prescription-lifecycle.workflows.js';

import {
  CreatePrescriptionDraftWorkflow,
  UpdatePrescriptionDraftWorkflow,
} from './workflows/prescription-draft.workflows.js';

import {
  AcknowledgePrescriptionWarningWorkflow,
} from './workflows/prescription-warning.workflow.js';

import {
  PrintPrescriptionWorkflow,
} from './workflows/print-prescription.workflow.js';

export interface CreateFormularyPrescriptionApplicationOptions {
  dependencies:
    FormularyPrescriptionMutationDependencies;

  print:
    PrescriptionPrintPort;

  stock?:
    FormularyStockVisibilityPort | null;

  interactions?:
    MedicineInteractionPort | null;
}

export function createFormularyPrescriptionApplication(
  options:
    CreateFormularyPrescriptionApplicationOptions,
) {
  const catalog =
    new MedicineFormularyRepository();

  const prescriptions =
    new PrescriptionRepository();

  const context =
    new FormularyPrescriptionContextService();

  const accessPolicy =
    new FormularyPrescriptionAccessPolicyService();

  const readAuditor =
    new FormularyPrescriptionSensitiveReadAuditor(
      options.dependencies.audit,
    );

  const safety =
    new PrescriptionSafetyService(
      prescriptions,
      options.interactions ??
        null,
    );

  const commandSupport =
    new FormularyPrescriptionCommandService(
      catalog,
      prescriptions,
      context,
      accessPolicy,
      options.dependencies,
    );

  const queries =
    new FormularyPrescriptionQueryService(
      catalog,
      prescriptions,
      context,
      accessPolicy,
      readAuditor,
      options.dependencies.clock,
      options.stock ??
        null,
    );

  return {
    repositories: {
      catalog,
      prescriptions,
    },

    services: {
      context,
      accessPolicy,
      readAuditor,
      safety,
      commandSupport,
      queries,
    },

    workflows: {
      createFormularyItem:
        new CreateFormularyItemWorkflow(
          commandSupport,
        ),

      updateFormularyItem:
        new UpdateFormularyItemWorkflow(
          commandSupport,
        ),

      changeFormularyItemStatus:
        new ChangeFormularyItemStatusWorkflow(
          commandSupport,
        ),

      createPrescriptionDraft:
        new CreatePrescriptionDraftWorkflow(
          commandSupport,
        ),

      updatePrescriptionDraft:
        new UpdatePrescriptionDraftWorkflow(
          commandSupport,
        ),

      issuePrescription:
        new IssuePrescriptionWorkflow(
          commandSupport,
          safety,
        ),

      cancelPrescription:
        new CancelPrescriptionWorkflow(
          commandSupport,
        ),

      replacePrescription:
        new ReplacePrescriptionWorkflow(
          commandSupport,
        ),

      acknowledgePrescriptionWarning:
        new AcknowledgePrescriptionWarningWorkflow(
          commandSupport,
        ),

      printPrescription:
        new PrintPrescriptionWorkflow(
          commandSupport,
          options.print,
        ),
    },
  };
}

export type FormularyPrescriptionApplication =
  ReturnType<
    typeof createFormularyPrescriptionApplication
  >;