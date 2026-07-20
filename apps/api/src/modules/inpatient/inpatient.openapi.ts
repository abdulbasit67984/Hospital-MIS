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

export const inpatientOpenApi = {
  tags: [
    {
      name:
        'Inpatient Locations',

      description:
        'Facility-scoped wards, rooms, beds, restrictions, catalog status, and effective rates',
    },

    {
      name:
        'Inpatient Admissions',

      description:
        'Admission recommendations, acceptance, admission creation, and lifecycle management',
    },

    {
      name:
        'Inpatient Bed Management',

      description:
        'Bed reservations, allocations, transfers, release, cleaning, maintenance, and reconciliation',
    },

    {
      name:
        'Inpatient Nursing',

      description:
        'Vital signs, nursing observations, intake/output, escalation, and ward handover',
    },

    {
      name:
        'Medication Administration',

      description:
        'Medication schedules, dose recording, omission, refusal, delay, correction, and compliance',
    },

    {
      name:
        'Inpatient Discharge',

      description:
        'Discharge readiness, immutable summaries, clinical clearance, financial clearance, bed release, and final discharge',
    },
  ],

  commonResponses: {
    400: {
      description:
        'Invalid inpatient request',

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
        'Inpatient access denied',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    404: {
      description:
        'Inpatient resource not found',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    409: {
      description:
        'Inpatient lifecycle, bed-allocation, billing, or concurrency conflict',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },

    500: {
      description:
        'Internal inpatient error',

      content: {
        'application/json': {
          schema:
            errorResponseSchema,
        },
      },
    },
  },
} as const;