const errorResponseSchema = {
  type: 'object',
  required: [
    'error',
  ],
  properties: {
    error: {
      type: 'object',
      required: [
        'code',
        'message',
      ],
      properties: {
        code: {
          type: 'string',
        },
        message: {
          type: 'string',
        },
        details: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
      },
    },
  },
} as const;

const objectResponseSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

const paginatedResponseSchema = {
  type: 'object',
  required: [
    'items',
    'total',
  ],
  properties: {
    items: {
      type: 'array',
      items: objectResponseSchema,
    },
    total: {
      type: 'integer',
      minimum: 0,
    },
    page: {
      type: 'integer',
      minimum: 1,
    },
    pageSize: {
      type: 'integer',
      minimum: 1,
    },
  },
} as const;

const mutationHeaders = {
  type: 'object',
  required: [
    'idempotency-key',
  ],
  properties: {
    'idempotency-key': {
      type: 'string',
      minLength: 8,
      maxLength: 200,
    },
  },
} as const;

export const laboratoryOpenApi = {
  tags: [
    {
      name: 'Laboratory Catalog',
      description:
        'Facility-scoped Laboratory test catalog and standardized definitions',
    },
    {
      name: 'Laboratory Orders',
      description:
        'Encounter-linked Laboratory orders and lifecycle management',
    },
    {
      name: 'Laboratory Specimens',
      description:
        'Specimen accessioning, labeling, collection, receipt, rejection, and recollection',
    },
    {
      name: 'Laboratory Results',
      description:
        'Result entry, validation, verification, correction, publication, reporting, and critical communication',
    },
  ],

  commonResponses: {
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'Laboratory access denied',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: 'Laboratory resource not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    409: {
      description: 'Laboratory lifecycle or concurrency conflict',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal Laboratory error',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },

  mutationHeaders,
  objectResponseSchema,
  paginatedResponseSchema,
} as const;