const errorResponseSchema = {
  type:
    'object',

  required: [
    'error',
  ],

  properties: {
    error: {
      type:
        'object',

      required: [
        'code',
        'message',
      ],

      properties: {
        code: {
          type:
            'string',
        },

        message: {
          type:
            'string',
        },

        details: {
          type:
            'array',

          items: {
            type:
              'object',
          },
        },
      },
    },
  },
} as const;

const objectResponseSchema = {
  type:
    'object',

  additionalProperties:
    true,
} as const;

const paginatedResponseSchema = {
  type:
    'object',

  required: [
    'items',
    'total',
    'page',
    'pageSize',
  ],

  properties: {
    items: {
      type:
        'array',

      items:
        objectResponseSchema,
    },

    total: {
      type:
        'integer',

      minimum:
        0,
    },

    page: {
      type:
        'integer',

      minimum:
        1,
    },

    pageSize: {
      type:
        'integer',

      minimum:
        1,

      maximum:
        100,
    },
  },
} as const;

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

export const radiologyOpenApi = {
  tags: [
    {
      name:
        'Radiology Catalog',

      description:
        'Facility-scoped modality, procedure, and operational-resource definitions',
    },
    {
      name:
        'Radiology Orders',

      description:
        'Encounter-linked Radiology orders, acceptance, rejection, cancellation, and billing requests',
    },
    {
      name:
        'Radiology Scheduling',

      description:
        'Conflict-safe appointments, rooms, equipment, technicians, and safety screening',
    },
    {
      name:
        'Radiology Examinations',

      description:
        'Patient check-in, examination execution, contrast-use references, and external study registration',
    },
    {
      name:
        'Radiology Reports',

      description:
        'Drafting, preliminary review, encrypted immutable finalization, publication, critical communication, and EMR history',
    },
  ],

  commonResponses: {
    400: {
      description:
        'Invalid Radiology request',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    401: {
      description:
        'Authentication required',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    403: {
      description:
        'Radiology access denied',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    404: {
      description:
        'Radiology resource not found',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    409: {
      description:
        'Radiology lifecycle, allocation, billing, integrity, or concurrency conflict',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    500: {
      description:
        'Internal Radiology error',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },
  },

  mutationHeaders,

  objectResponseSchema,

  paginatedResponseSchema,
} as const;