import type {
  FastifyPluginAsync,
  preHandlerHookHandler,
} from 'fastify';

import type {
  InpatientApplication,
} from './inpatient.application.js';

import {
  createInpatientController,
} from './inpatient.controller.js';

import {
  inpatientHttpErrorHandler,
} from './inpatient.http.js';

export interface InpatientRoutesOptions {
  application:
    InpatientApplication;

  authenticate?:
    preHandlerHookHandler;
}

const mutationHeaders = {
  type:
    'object',

  required: [
    'idempotency-key',
  ],

  properties: {
    'idempotency-key': {
      type:
        'string',

      minLength:
        8,

      maxLength:
        200,
    },

    'x-correlation-id': {
      type:
        'string',

      minLength:
        1,

      maxLength:
        200,
    },
  },
} as const;

function mutationSchema(
  tag:
    string,

  summary:
    string,
) {
  return {
    tags: [
      tag,
    ],

    summary,

    headers:
      mutationHeaders,

    body: {
      type:
        'object',

      additionalProperties:
        true,
    },

    response: {
      200: {
        type:
          'object',

        additionalProperties:
          true,
      },

      201: {
        type:
          'object',

        additionalProperties:
          true,
      },
    },
  };
}

export const inpatientRoutes:
  FastifyPluginAsync<
    InpatientRoutesOptions
  > =
  async (
    fastify,
    options,
  ) => {
    const controller =
      createInpatientController(
        options.application,
      );

    fastify.setErrorHandler(
      inpatientHttpErrorHandler,
    );

    const guarded =
      options.authenticate ===
      undefined
        ? {}
        : {
            preHandler:
              options.authenticate,
          };

    fastify.post(
      '/nursing/vital-signs',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Nursing',
            'Record an inpatient vital-sign observation',
          ),
      },
      controller.recordVitalSign,
    );

    fastify.post(
      '/nursing/notes',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Nursing',
            'Create an inpatient nursing note',
          ),
      },
      controller.createNursingNote,
    );

    fastify.post(
      '/nursing/medication-schedules',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Medication Administration',
            'Create a medication-administration schedule',
          ),
      },
      controller.createMedicationSchedule,
    );

    fastify.post(
      '/nursing/medication-schedules/:scheduleId/doses',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Medication Administration',
            'Record an administered, omitted, refused, delayed, or cancelled dose',
          ),
      },
      controller.recordMedicationDose,
    );

    fastify.post(
      '/nursing/handovers',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Nursing',
            'Create and sign a ward handover',
          ),
      },
      controller.createWardHandover,
    );

    fastify.post(
      '/nursing/handovers/:handoverId/acknowledge',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Nursing',
            'Acknowledge a signed ward handover',
          ),
      },
      controller.acknowledgeWardHandover,
    );

    fastify.post(
      '/discharges',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Initiate the discharge-readiness process',
          ),
      },
      controller.initiateDischarge,
    );

    fastify.patch(
      '/discharges/:dischargeId/readiness',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Update discharge checklist and medication reconciliation',
          ),
      },
      controller.updateDischargeReadiness,
    );

    fastify.post(
      '/discharges/:dischargeId/summaries',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Create or amend a discharge summary',
          ),
      },
      controller.prepareDischargeSummary,
    );

    fastify.post(
      '/discharges/:dischargeId/clinical-clearance',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Clinically clear an admission and request financial clearance',
          ),
      },
      controller.clinicallyClearDischarge,
    );

    fastify.post(
      '/discharges/:dischargeId/financial-clearance',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Confirm billing and financial discharge clearance',
          ),
      },
      controller.confirmFinancialClearance,
    );

    fastify.post(
      '/discharges/:dischargeId/complete',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Release the bed and complete final discharge',
          ),
      },
      controller.completeDischarge,
    );

    fastify.post(
      '/discharges/:dischargeId/cancel',
      {
        ...guarded,

        schema:
          mutationSchema(
            'Inpatient Discharge',
            'Cancel an incomplete discharge process',
          ),
      },
      controller.cancelDischarge,
    );
  };