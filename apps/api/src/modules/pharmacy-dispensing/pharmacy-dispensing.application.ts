import type {
  PharmacyDispensingDependencies,
} from './pharmacy-dispensing.ports.js';

import {
  PharmacyDispensingCommandService,
} from './services/pharmacy-dispensing-command.service.js';

import {
  PharmacyDispensingQueryService,
} from './services/pharmacy-dispensing-query.service.js';

import {
  PharmacyPricingPreparationService,
} from './services/pharmacy-pricing-preparation.service.js';

import {
  PharmacySafetyService,
} from './services/pharmacy-safety.service.js';

import {
  PharmacyDispensingFinalizationService,
} from './services/pharmacy-dispensing-finalization.service.js';

import {
  ControlledMedicineRegisterService,
} from './services/controlled-medicine-register.service.js';

import {
  PharmacyReturnAssessmentService,
} from './services/pharmacy-return-assessment.service.js';

import {
  PharmacyReversalFinalizationService,
} from './services/pharmacy-reversal-finalization.service.js';

import {
  PharmacySubstitutionRepository,
} from './repositories/pharmacy-substitution.repository.js';

import {
  PharmacyControlledRegisterRepository,
} from './repositories/pharmacy-controlled-register.repository.js';

import {
  PharmacyLabelCounsellingRepository,
} from './repositories/pharmacy-label-counselling.repository.js';

import {
  PharmacyReturnReversalRepository,
} from './repositories/pharmacy-return-reversal.repository.js';

import {
  CreateDispensationIntakeWorkflow,
} from './workflows/create-dispensation-intake.workflow.js';

import {
  HoldDispensationWorkflow,
  RejectDispensationWorkflow,
  ReleaseDispensationWorkflow,
  VerifyDispensationWorkflow,
} from './workflows/dispensation-review.workflows.js';

import {
  DecideDispensationSubstitutionWorkflow,
  ProposeDispensationSubstitutionWorkflow,
} from './workflows/dispensation-substitution.workflows.js';

import {
  ReserveDispensationStockWorkflow,
} from './workflows/reserve-dispensation-stock.workflow.js';

import {
  CompleteDispensationWorkflow,
} from './workflows/complete-dispensation.workflow.js';

import {
  GenerateDispensingLabelWorkflow,
  PrintDispensingLabelWorkflow,
} from './workflows/dispensing-label.workflow.js';

import {
  RecordPharmacyCounsellingWorkflow,
} from './workflows/pharmacy-counselling.workflow.js';

import {
  RequestDispensationReversalWorkflow,
} from './workflows/request-dispensation-reversal.workflow.js';

import {
  CreatePatientReturnWorkflow,
} from './workflows/create-patient-return.workflow.js';

import {
  PostPatientReturnWorkflow,
} from './workflows/post-patient-return.workflow.js';

import {
  PostDispensationReversalWorkflow,
} from './workflows/post-dispensation-reversal.workflow.js';

import {
  RecoverPharmacyFinalizationWorkflow,
} from './workflows/recover-pharmacy-finalization.workflow.js';

export interface CreatePharmacyDispensingApplicationOptions {
  dependencies: PharmacyDispensingDependencies;
  substitutions?: PharmacySubstitutionRepository;
  controlledRegister?: PharmacyControlledRegisterRepository;
  labelsAndCounselling?: PharmacyLabelCounsellingRepository;
  returnsAndReversals?: PharmacyReturnReversalRepository;
}

export function createPharmacyDispensingApplication(
  options: CreatePharmacyDispensingApplicationOptions,
) {
  const commandSupport = new PharmacyDispensingCommandService(
    options.dependencies,
  );
  const queries = new PharmacyDispensingQueryService(
    options.dependencies.repository,
    options.dependencies.worklists,
    options.dependencies.accessPolicy,
  );
  const safety = new PharmacySafetyService(
    options.dependencies.prescriptions,
    options.dependencies.safety,
  );
  const pricing = new PharmacyPricingPreparationService(
    options.dependencies.pricing,
  );
  const finalization = new PharmacyDispensingFinalizationService(
    options.dependencies,
    pricing,
  );
  const substitutions =
    options.substitutions ?? new PharmacySubstitutionRepository();
  const controlledRegisterRepository =
    options.controlledRegister ?? new PharmacyControlledRegisterRepository();
  const labelsAndCounselling =
    options.labelsAndCounselling ?? new PharmacyLabelCounsellingRepository();
  const returnsAndReversals =
    options.returnsAndReversals ?? new PharmacyReturnReversalRepository();
  const controlledRegister = new ControlledMedicineRegisterService(
    controlledRegisterRepository,
    options.dependencies.sequence,
  );
  const returnAssessment = new PharmacyReturnAssessmentService();
  const reversalFinalization = new PharmacyReversalFinalizationService();

  return {
    services: {
      commandSupport,
      queries,
      safety,
      pricing,
      finalization,
      controlledRegister,
      returnAssessment,
      reversalFinalization,
    },
    repositories: {
      substitutions,
      controlledRegister: controlledRegisterRepository,
      labelsAndCounselling,
      returnsAndReversals,
    },
    workflows: {
      createDispensationIntake: new CreateDispensationIntakeWorkflow(
        commandSupport,
      ),
      verifyDispensation: new VerifyDispensationWorkflow(
        commandSupport,
        safety,
      ),
      holdDispensation: new HoldDispensationWorkflow(commandSupport),
      releaseDispensation: new ReleaseDispensationWorkflow(commandSupport),
      rejectDispensation: new RejectDispensationWorkflow(commandSupport),
      proposeSubstitution: new ProposeDispensationSubstitutionWorkflow(
        commandSupport,
        substitutions,
      ),
      decideSubstitution: new DecideDispensationSubstitutionWorkflow(
        commandSupport,
        substitutions,
      ),
      reserveDispensationStock: new ReserveDispensationStockWorkflow(
        commandSupport,
      ),
      completeDispensation: new CompleteDispensationWorkflow(
        commandSupport,
        finalization,
        controlledRegister,
      ),
      generateDispensingLabel: new GenerateDispensingLabelWorkflow(
        commandSupport,
        labelsAndCounselling,
      ),
      printDispensingLabel: new PrintDispensingLabelWorkflow(
        commandSupport,
        labelsAndCounselling,
      ),
      recordCounselling: new RecordPharmacyCounsellingWorkflow(
        commandSupport,
        labelsAndCounselling,
      ),
      requestReversal: new RequestDispensationReversalWorkflow(
        commandSupport,
      ),
      createPatientReturn: new CreatePatientReturnWorkflow(
        commandSupport,
        returnsAndReversals,
        returnAssessment,
      ),
      postPatientReturn: new PostPatientReturnWorkflow(
        commandSupport,
        returnsAndReversals,
      ),
      postReversal: new PostDispensationReversalWorkflow(
        commandSupport,
        returnsAndReversals,
        reversalFinalization,
        controlledRegister,
      ),
      recoverFinalization: new RecoverPharmacyFinalizationWorkflow(
        commandSupport,
        returnsAndReversals,
      ),
    },
  };
}

export type PharmacyDispensingApplication = ReturnType<
  typeof createPharmacyDispensingApplication
>;