import type {
  FastifyInstance,
  FastifyPluginAsync,
} from 'fastify';

import type {
  LaboratoryApplication,
} from './laboratory.application.js';

import {
  LaboratoryController,
} from './laboratory.controller.js';

import {
  laboratoryHttpErrorHandler,
} from './laboratory.http.js';

import {
  laboratoryOpenApi,
} from './laboratory.openapi.js';

export interface LaboratoryRoutesOptions {
  application: LaboratoryApplication;
  authenticate?: (
    request: unknown,
    reply: unknown,
  ) => Promise<void> | void;
}

function mutationSchema(
  tag: string,
  summary: string,
) {
  return {
    tags: [
      tag,
    ],
    summary,
    headers:
      laboratoryOpenApi.mutationHeaders,
    response: {
      200:
        laboratoryOpenApi.objectResponseSchema,
      201:
        laboratoryOpenApi.objectResponseSchema,
      ...laboratoryOpenApi.commonResponses,
    },
  };
}

function querySchema(
  tag: string,
  summary: string,
  paginated = false,
) {
  return {
    tags: [
      tag,
    ],
    summary,
    response: {
      200:
        paginated
          ? laboratoryOpenApi.paginatedResponseSchema
          : laboratoryOpenApi.objectResponseSchema,
      ...laboratoryOpenApi.commonResponses,
    },
  };
}

export const laboratoryRoutes: FastifyPluginAsync<
  LaboratoryRoutesOptions
> = async (
  fastify: FastifyInstance,
  options: LaboratoryRoutesOptions,
): Promise<void> => {
  const controller =
    new LaboratoryController(
      options.application,
    );

  fastify.setErrorHandler(
    laboratoryHttpErrorHandler,
  );

  const authenticate =
    options.authenticate;

  const readOptions =
    authenticate === undefined
      ? {}
      : {
          preHandler: authenticate,
        };

  const mutationOptions =
    authenticate === undefined
      ? {}
      : {
          preHandler: authenticate,
        };

  fastify.get(
    '/catalog/tests',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Catalog',
        'Search the facility Laboratory test catalog',
        true,
      ),
    },
    controller.searchCatalog,
  );

  fastify.get(
    '/catalog/tests/:id',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Catalog',
        'Get a standardized Laboratory test definition',
      ),
    },
    controller.getTest,
  );

  fastify.post(
    '/catalog/categories',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Create a Laboratory test category',
      ),
    },
    controller.createCategory,
  );

  fastify.patch(
    '/catalog/categories/:id',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Update a Laboratory test category',
      ),
    },
    controller.updateCategory,
  );

  fastify.post(
    '/catalog/categories/:id/status',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Activate or deactivate a Laboratory test category',
      ),
    },
    controller.changeCategoryStatus,
  );

  fastify.post(
    '/catalog/tests',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Create a standardized Laboratory test definition',
      ),
    },
    controller.createTest,
  );

  fastify.patch(
    '/catalog/tests/:id',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Update a standardized Laboratory test definition',
      ),
    },
    controller.updateTest,
  );

  fastify.post(
    '/catalog/tests/:id/status',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Catalog',
        'Activate or deactivate a Laboratory test definition',
      ),
    },
    controller.changeTestStatus,
  );

  fastify.post(
    '/orders',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Orders',
        'Create an encounter-linked Laboratory order',
      ),
    },
    controller.createOrder,
  );

  fastify.get(
    '/orders',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Orders',
        'List the Laboratory operational worklist',
        true,
      ),
    },
    controller.listOrders,
  );

  fastify.get(
    '/orders/:orderId',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Orders',
        'Get a Laboratory order with items and lifecycle history',
      ),
    },
    controller.getOrder,
  );

  fastify.post(
    '/orders/:orderId/accept',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Orders',
        'Accept a Laboratory order',
      ),
    },
    controller.acceptOrder,
  );

  fastify.post(
    '/orders/:orderId/cancel',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Orders',
        'Cancel a Laboratory order and request billing cancellation',
      ),
    },
    controller.cancelOrder,
  );

  fastify.post(
    '/specimens/accession',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Specimens',
        'Allocate an accession and specimen identifier',
      ),
    },
    controller.accessionSpecimen,
  );

  fastify.post(
    '/specimens/:specimenId/label',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Specimens',
        'Record Laboratory specimen label printing',
      ),
    },
    controller.printSpecimenLabel,
  );

  fastify.post(
    '/specimens/:specimenId/collect',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Specimens',
        'Record Laboratory specimen collection',
      ),
    },
    controller.collectSpecimen,
  );

  fastify.post(
    '/specimens/:specimenId/receive',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Specimens',
        'Receive a Laboratory specimen',
      ),
    },
    controller.receiveSpecimen,
  );

  fastify.post(
    '/specimens/:specimenId/reject',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Specimens',
        'Reject a specimen and optionally request recollection',
      ),
    },
    controller.rejectSpecimen,
  );

  fastify.post(
    '/results',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Enter or update Laboratory result values',
      ),
    },
    controller.enterResult,
  );

  fastify.get(
    '/results/:resultId',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Results',
        'Get a Laboratory result with immutable versions and critical communication history',
      ),
    },
    controller.getResult,
  );

  fastify.post(
    '/results/:resultId/validate',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Validate an entered Laboratory result',
      ),
    },
    controller.validateResult,
  );

  fastify.post(
    '/results/:resultId/verify',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Verify a Laboratory result and create an encrypted immutable version',
      ),
    },
    controller.verifyResult,
  );

  fastify.post(
    '/results/:resultId/correct',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Record a corrected Laboratory result version',
      ),
    },
    controller.correctResult,
  );

  fastify.post(
    '/results/:resultId/publication',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Publish or withdraw a finalized Laboratory result',
      ),
    },
    controller.changeResultPublication,
  );

  fastify.post(
    '/results/:resultId/critical-communications',
    {
      ...mutationOptions,
      schema: mutationSchema(
        'Laboratory Results',
        'Record critical-result notification, escalation, or acknowledgement',
      ),
    },
    controller.recordCriticalCommunication,
  );

  fastify.get(
    '/patients/:patientId/results',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Results',
        'List minimum-necessary patient Laboratory history',
        true,
      ),
    },
    controller.listPatientResultHistory,
  );

  fastify.get(
    '/encounters/:encounterId/results',
    {
      ...readOptions,
      schema: querySchema(
        'Laboratory Results',
        'List minimum-necessary encounter Laboratory history',
        true,
      ),
    },
    controller.listEncounterResultHistory,
  );

  fastify.get(
    '/orders/:orderId/report',
    {
      ...readOptions,
      schema: {
        tags: [
          'Laboratory Results',
        ],
        summary:
          'Download a PDF containing published immutable Laboratory results',
        response: {
          200: {
            description: 'Laboratory PDF report',
            content: {
              'application/pdf': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          ...laboratoryOpenApi.commonResponses,
        },
      },
    },
    controller.printOrderReport,
  );
};

export default laboratoryRoutes;