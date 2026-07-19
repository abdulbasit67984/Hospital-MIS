import type {
  FastifyInstance,
  FastifyPluginAsync,
} from 'fastify';

import type {
  RadiologyApplication,
} from './radiology.application.js';

import {
  RadiologyController,
} from './radiology.controller.js';

import {
  radiologyHttpErrorHandler,
} from './radiology.http.js';

import {
  radiologyOpenApi,
} from './radiology.openapi.js';

export interface RadiologyRoutesOptions {
  application:
    RadiologyApplication;

  authenticate?:
    (
      request:
        unknown,

      reply:
        unknown,
    ) => Promise<void> | void;
}

function mutationSchema(
  tag:
    string,

  summary:
    string,

  created =
    false,
) {
  return {
    tags: [
      tag,
    ],

    summary,

    headers:
      radiologyOpenApi.mutationHeaders,

    response: {
      [
        created
          ? 201
          : 200
      ]:
        radiologyOpenApi.objectResponseSchema,

      ...radiologyOpenApi.commonResponses,
    },
  };
}

function querySchema(
  tag:
    string,

  summary:
    string,

  paginated =
    false,
) {
  return {
    tags: [
      tag,
    ],

    summary,

    response: {
      200:
        paginated
          ? radiologyOpenApi.paginatedResponseSchema
          : radiologyOpenApi.objectResponseSchema,

      ...radiologyOpenApi.commonResponses,
    },
  };
}

export const radiologyRoutes:
  FastifyPluginAsync<RadiologyRoutesOptions> =
    async (
      fastify:
        FastifyInstance,

      options:
        RadiologyRoutesOptions,
    ): Promise<void> => {
      const controller =
        new RadiologyController(
          options.application,
        );

      fastify.setErrorHandler(
        radiologyHttpErrorHandler,
      );

      const guarded =
        options.authenticate ===
        undefined
          ? {}
          : {
              preHandler:
                options.authenticate,
            };

      fastify.get(
        '/catalog/modalities',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Catalog',
              'Search Radiology modalities',
              true,
            ),
        },
        controller.searchModalities,
      );

      fastify.post(
        '/catalog/modalities',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Create a Radiology modality',
              true,
            ),
        },
        controller.createModality,
      );

      fastify.patch(
        '/catalog/modalities/:id',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Update a Radiology modality',
            ),
        },
        controller.updateModality,
      );

      fastify.post(
        '/catalog/modalities/:id/status',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Activate or deactivate a Radiology modality',
            ),
        },
        controller.changeModalityStatus,
      );

      fastify.get(
        '/catalog/procedures',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Catalog',
              'Search Radiology procedures',
              true,
            ),
        },
        controller.searchProcedures,
      );

      fastify.get(
        '/catalog/procedures/:id',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Catalog',
              'Get a Radiology procedure definition',
            ),
        },
        controller.getProcedure,
      );

      fastify.post(
        '/catalog/procedures',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Create a Radiology procedure',
              true,
            ),
        },
        controller.createProcedure,
      );

      fastify.patch(
        '/catalog/procedures/:id',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Update a Radiology procedure',
            ),
        },
        controller.updateProcedure,
      );

      fastify.post(
        '/catalog/procedures/:id/status',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Catalog',
              'Activate or deactivate a Radiology procedure',
            ),
        },
        controller.changeProcedureStatus,
      );

      fastify.get(
        '/resources',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Scheduling',
              'List Radiology rooms and equipment',
              true,
            ),
        },
        controller.listResources,
      );

      fastify.post(
        '/resources',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Scheduling',
              'Create a Radiology room or equipment resource',
              true,
            ),
        },
        controller.createResource,
      );

      fastify.post(
        '/resources/:id/status',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Scheduling',
              'Change Radiology resource status',
            ),
        },
        controller.changeResourceStatus,
      );

      fastify.post(
        '/orders',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Orders',
              'Create an encounter-linked Radiology order',
              true,
            ),
        },
        controller.createOrder,
      );

      fastify.get(
        '/orders',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Orders',
              'List the Radiology operational worklist',
              true,
            ),
        },
        controller.listOrders,
      );

      fastify.get(
        '/orders/:orderId',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Orders',
              'Get a Radiology order, items, and lifecycle history',
            ),
        },
        controller.getOrder,
      );

      fastify.post(
        '/orders/:orderId/accept',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Orders',
              'Accept a Radiology order',
            ),
        },
        controller.acceptOrder,
      );

      fastify.post(
        '/orders/:orderId/reject',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Orders',
              'Reject a Radiology order',
            ),
        },
        controller.rejectOrder,
      );

      fastify.post(
        '/orders/:orderId/cancel',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Orders',
              'Cancel a Radiology order and request billing cancellation or refund',
            ),
        },
        controller.cancelOrder,
      );

      fastify.get(
        '/appointments',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Scheduling',
              'List Radiology appointments and allocations',
              true,
            ),
        },
        controller.listAppointments,
      );

      fastify.post(
        '/appointments',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Scheduling',
              'Schedule or reschedule a conflict-safe Radiology appointment',
              true,
            ),
        },
        controller.scheduleAppointment,
      );

      fastify.post(
        '/appointments/:appointmentId/cancel',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Scheduling',
              'Cancel a Radiology appointment and release allocations',
            ),
        },
        controller.cancelAppointment,
      );

      fastify.put(
        '/safety-screenings',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Scheduling',
              'Record or update Radiology safety screening and preparation readiness',
            ),
        },
        controller.recordSafetyScreening,
      );

      fastify.post(
        '/examinations/check-in',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Examinations',
              'Check in a patient for a Radiology examination',
            ),
        },
        controller.checkIn,
      );

      fastify.post(
        '/examinations/start',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Examinations',
              'Start a Radiology examination',
            ),
        },
        controller.startExamination,
      );

      fastify.post(
        '/examinations/complete',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Examinations',
              'Complete a Radiology examination and record Inventory-boundary contrast usage',
            ),
        },
        controller.completeExamination,
      );

      fastify.post(
        '/studies',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Examinations',
              'Register metadata-only PACS, RIS, VNA, or DICOMweb study references',
              true,
            ),
        },
        controller.registerStudy,
      );

      fastify.post(
        '/reports/assign',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Assign a completed study to an eligible radiologist',
              true,
            ),
        },
        controller.assignReport,
      );

      fastify.get(
        '/reports/:reportId',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Reports',
              'Get minimum-necessary report metadata, immutable versions, and communication history',
            ),
        },
        controller.getReport,
      );

      fastify.get(
        '/reports/:reportId/published',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Reports',
              'Get the published immutable Radiology report snapshot',
            ),
        },
        controller.getPublishedReport,
      );

      fastify.patch(
        '/reports/:reportId/draft',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Save a Radiology report draft',
            ),
        },
        controller.saveReportDraft,
      );

      fastify.post(
        '/reports/:reportId/preliminary',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Submit a preliminary Radiology report',
            ),
        },
        controller.submitPreliminary,
      );

      fastify.post(
        '/reports/:reportId/finalize',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Finalize and encrypt an immutable Radiology report version',
            ),
        },
        controller.finalizeReport,
      );

      fastify.post(
        '/reports/:reportId/corrections',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Create a corrected immutable Radiology report version',
            ),
        },
        controller.correctReport,
      );

      fastify.post(
        '/reports/:reportId/addenda',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Append an immutable Radiology report addendum',
            ),
        },
        controller.addAddendum,
      );

      fastify.post(
        '/reports/:reportId/publish',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Publish a finalized Radiology report after critical acknowledgement',
            ),
        },
        controller.publishReport,
      );

      fastify.post(
        '/reports/:reportId/withdraw',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Withdraw a published Radiology report',
            ),
        },
        controller.withdrawReport,
      );

      fastify.post(
        '/reports/:reportId/critical-communications',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Record and dispatch a critical or urgent finding communication',
            ),
        },
        controller.recordCriticalCommunication,
      );

      fastify.post(
        '/reports/:reportId/critical-acknowledgements',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Acknowledge a critical or urgent finding communication',
            ),
        },
        controller.acknowledgeCriticalCommunication,
      );

      fastify.post(
        '/reports/:reportId/render',
        {
          ...guarded,

          schema:
            mutationSchema(
              'Radiology Reports',
              'Render and store a PDF from the immutable Radiology report version',
            ),
        },
        controller.renderReport,
      );

      fastify.get(
        '/encounters/:encounterId/history',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Reports',
              'List published Radiology reports for an encounter',
              true,
            ),
        },
        controller.listEncounterHistory,
      );

      fastify.get(
        '/patients/:patientId/history',
        {
          ...guarded,

          schema:
            querySchema(
              'Radiology Reports',
              'List published Radiology history for a patient',
              true,
            ),
        },
        controller.listPatientHistory,
      );
    };