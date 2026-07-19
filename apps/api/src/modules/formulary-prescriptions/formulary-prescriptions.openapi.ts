const bearerSecurity = [
  {
    bearerAuth:
      [],
  },
] as const;

const objectIdSchema = {
  type:
    'string',

  pattern:
    '^[a-fA-F0-9]{24}$',

  example:
    '507f1f77bcf86cd799439011',
} as const;

const expectedVersionSchema = {
  type:
    'integer',

  minimum:
    0,

  example:
    0,
} as const;

const idempotencyParameter = {
  name:
    'idempotency-key',

  in:
    'header',

  required:
    true,

  description:
    'Replay-safe idempotency key. Reusing the key with a different payload is rejected.',

  schema: {
    type:
      'string',

    minLength:
      8,

    maxLength:
      200,

    pattern:
      '^[A-Za-z0-9._:/-]+$',

    example:
      'prescription-20260719-000001',
  },
} as const;

const breakGlassParameter = {
  name:
    'x-break-glass-reason',

  in:
    'header',

  required:
    false,

  description:
    'Documented emergency-access reason. Permission and facility-boundary checks still apply.',

  schema: {
    type:
      'string',

    minLength:
      10,

    maxLength:
      1_000,
  },
} as const;

function pathParameter(
  name:
    string,
): Record<string, unknown> {
  return {
    name,

    in:
      'path',

    required:
      true,

    schema:
      objectIdSchema,
  };
}

const errorResponses = {
  '400': {
    description:
      'Request validation failed',

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/ApiError',
        },
      },
    },
  },

  '401': {
    description:
      'Authentication is required',

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/ApiError',
        },
      },
    },
  },

  '403': {
    description:
      'Permission, facility-boundary, provider-attribution, or record-level access was denied',

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/ApiError',
        },
      },
    },
  },

  '404': {
    description:
      'The requested resource was not found',

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/ApiError',
        },
      },
    },
  },

  '409': {
    description:
      'Lifecycle, safety, duplicate, signature, idempotency, or optimistic-concurrency conflict',

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/ApiError',
        },
      },
    },
  },
} as const;

function successResponse(
  description:
    string,
): Record<string, unknown> {
  return {
    description,

    content: {
      'application/json': {
        schema: {
          $ref:
            '#/components/schemas/FormularyPrescriptionSuccess',
        },
      },
    },
  };
}

function readOperation(
  summary:
    string,

  permission:
    string,

  parameters:
    readonly Record<string, unknown>[] =
      [],
): Record<string, unknown> {
  return {
    tags: [
      'Formulary and Prescriptions',
    ],

    summary,

    description:
      `Requires ${permission}. Prescription reads are filtered through minimum-necessary access rules and sensitive access is audited.`,

    security:
      bearerSecurity,

    parameters: [
      ...parameters,
    ],

    responses: {
      '200':
        successResponse(
          'Request completed',
        ),

      ...errorResponses,
    },
  };
}

function mutationOperation(
  summary:
    string,

  permission:
    string,

  requestSchema:
    string,

  successStatus:
    '200' | '201' =
      '200',

  parameters:
    readonly Record<string, unknown>[] =
      [],
): Record<string, unknown> {
  return {
    tags: [
      'Formulary and Prescriptions',
    ],

    summary,

    description:
      `Requires ${permission}. The operation is facility-scoped, idempotent, audited, journaled, recoverable, and protected by optimistic concurrency where expectedVersion is supplied.`,

    security:
      bearerSecurity,

    parameters: [
      ...parameters,
      idempotencyParameter,
    ],

    requestBody: {
      required:
        true,

      content: {
        'application/json': {
          schema: {
            $ref:
              `#/components/schemas/${requestSchema}`,
          },
        },
      },
    },

    responses: {
      [successStatus]:
        successResponse(
          successStatus === '201'
            ? 'Resource created'
            : 'Operation completed',
        ),

      ...errorResponses,
    },
  };
}

const prescriptionItemInputSchema = {
  type:
    'object',

  additionalProperties:
    false,

  required: [
    'formularyItemId',
    'dose',
    'doseUnitId',
    'routeId',
    'frequencyId',
    'durationUnit',
    'quantity',
    'quantityUnitId',
    'startDate',
  ],

  properties: {
    formularyItemId: {
      $ref:
        '#/components/schemas/FormularyPrescriptionObjectId',
    },

    selectedBrandName: {
      type: [
        'string',
        'null',
      ],

      maxLength:
        300,
    },

    dose: {
      type:
        'string',

      example:
        '500',
    },

    doseUnitId: {
      $ref:
        '#/components/schemas/FormularyPrescriptionObjectId',
    },

    routeId: {
      $ref:
        '#/components/schemas/FormularyPrescriptionObjectId',
    },

    frequencyId: {
      $ref:
        '#/components/schemas/FormularyPrescriptionObjectId',
    },

    durationValue: {
      type: [
        'string',
        'null',
      ],

      example:
        '5',
    },

    durationUnit: {
      type:
        'string',

      enum: [
        'DOSES',
        'DAYS',
        'WEEKS',
        'MONTHS',
        'UNTIL_FINISHED',
        'AS_NEEDED',
      ],
    },

    quantity: {
      type:
        'string',

      example:
        '10',
    },

    quantityUnitId: {
      $ref:
        '#/components/schemas/FormularyPrescriptionObjectId',
    },

    instructions: {
      type: [
        'string',
        'null',
      ],

      maxLength:
        5_000,

      example:
        'Take after meals',
    },

    asNeeded: {
      type:
        'boolean',

      default:
        false,
    },

    asNeededReason: {
      type: [
        'string',
        'null',
      ],

      maxLength:
        1_000,
    },

    startDate: {
      type:
        'string',

      format:
        'date',
    },

    endDate: {
      type: [
        'string',
        'null',
      ],

      format:
        'date',
    },
  },
} as const;

export const formularyPrescriptionOpenApi = {
  tags: [
    {
      name:
        'Formulary and Prescriptions',

      description:
        'Facility formulary, prescription lifecycle, safety warnings, longitudinal medication history, and printable prescriptions.',
    },
  ],

  components: {
    schemas: {
      FormularyPrescriptionObjectId:
        objectIdSchema,

      FormularyPrescriptionExpectedVersion:
        expectedVersionSchema,

      FormularyPrescriptionSuccess: {
        type:
          'object',

        required: [
          'success',
          'data',
        ],

        properties: {
          success: {
            type:
              'boolean',

            const:
              true,
          },

          data: {
            type: [
              'object',
              'array',
            ],
          },

          correlationId: {
            type:
              'string',

            format:
              'uuid',
          },
        },
      },

      PrescriptionItemInput:
        prescriptionItemInputSchema,

      CreateFormularyItemRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'formularyCode',
          'medicineId',
          'medicineFormId',
          'medicineStrengthId',
          'allowedRouteIds',
          'defaultRouteId',
          'doseUnitId',
          'quantityUnitId',
        ],

        properties: {
          formularyCode: {
            type:
              'string',

            minLength:
              2,

            maxLength:
              80,

            example:
              'FORM-000001',
          },

          medicineId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          medicineFormId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          medicineStrengthId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          brandName: {
            type: [
              'string',
              'null',
            ],

            maxLength:
              300,
          },

          allowedRouteIds: {
            type:
              'array',

            minItems:
              1,

            maxItems:
              50,

            items: {
              $ref:
                '#/components/schemas/FormularyPrescriptionObjectId',
            },
          },

          defaultRouteId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          doseUnitId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          quantityUnitId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          inventoryItemId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FormularyPrescriptionObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          stockTracked: {
            type:
              'boolean',

            default:
              false,
          },

          restrictionType: {
            type:
              'string',

            enum: [
              'NONE',
              'SPECIALIST_ONLY',
              'DEPARTMENT_ONLY',
              'AGE_RESTRICTED',
              'CONTROLLED',
              'HIGH_ALERT',
              'OTHER',
            ],

            default:
              'NONE',
          },

          restrictedDepartmentIds: {
            type:
              'array',

            maxItems:
              100,

            items: {
              $ref:
                '#/components/schemas/FormularyPrescriptionObjectId',
            },
          },

          minimumAgeYears: {
            type: [
              'integer',
              'null',
            ],

            minimum:
              0,

            maximum:
              150,
          },

          maximumAgeYears: {
            type: [
              'integer',
              'null',
            ],

            minimum:
              0,

            maximum:
              150,
          },

          highAlert: {
            type:
              'boolean',

            default:
              false,
          },

          controlledMedicine: {
            type:
              'boolean',

            default:
              false,
          },

          prescribingNotes: {
            type: [
              'string',
              'null',
            ],

            maxLength:
              5_000,
          },

          effectiveFrom: {
            type:
              'string',

            format:
              'date-time',
          },

          effectiveUntil: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      UpdateFormularyItemRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          brandName: {
            type: [
              'string',
              'null',
            ],
          },

          allowedRouteIds: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/FormularyPrescriptionObjectId',
            },
          },

          defaultRouteId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          inventoryItemId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FormularyPrescriptionObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          stockTracked: {
            type:
              'boolean',
          },

          restrictionType: {
            type:
              'string',
          },

          restrictedDepartmentIds: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/FormularyPrescriptionObjectId',
            },
          },

          highAlert: {
            type:
              'boolean',
          },

          controlledMedicine: {
            type:
              'boolean',
          },

          prescribingNotes: {
            type: [
              'string',
              'null',
            ],
          },

          effectiveFrom: {
            type:
              'string',

            format:
              'date-time',
          },

          effectiveUntil: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      ChangeFormularyItemStatusRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'status',
          'reason',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
            ],
          },

          reason: {
            type:
              'string',

            minLength:
              5,

            maxLength:
              2_000,
          },
        },
      },

      CreatePrescriptionDraftRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'encounterId',
          'patientId',
          'prescriberProviderId',
          'items',
        ],

        properties: {
          encounterId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          patientId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          prescriberProviderId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          items: {
            type:
              'array',

            minItems:
              1,

            maxItems:
              100,

            items: {
              $ref:
                '#/components/schemas/PrescriptionItemInput',
            },
          },
        },
      },

      UpdatePrescriptionDraftRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'items',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          items: {
            type:
              'array',

            minItems:
              1,

            maxItems:
              100,

            items: {
              $ref:
                '#/components/schemas/PrescriptionItemInput',
            },
          },
        },
      },

      IssuePrescriptionRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'signatureMethod',
          'signatureDigest',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          expiresAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          signatureMethod: {
            type:
              'string',

            enum: [
              'AUTHENTICATED_SESSION',
              'PASSWORD_REAUTHENTICATION',
              'DIGITAL_CERTIFICATE',
            ],
          },

          signatureDigest: {
            type:
              'string',

            minLength:
              32,

            maxLength:
              256,
          },

          warningAcknowledgements: {
            type:
              'object',

            additionalProperties: {
              type:
                'object',

              additionalProperties:
                false,

              required: [
                'expectedVersion',
                'reason',
                'override',
              ],

              properties: {
                expectedVersion:
                  expectedVersionSchema,

                reason: {
                  type:
                    'string',

                  minLength:
                    5,

                  maxLength:
                    2_000,
                },

                override: {
                  type:
                    'boolean',
                },
              },
            },
          },
        },
      },

      CancelPrescriptionRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          reason: {
            type:
              'string',

            minLength:
              5,

            maxLength:
              2_000,
          },
        },
      },

      ReplacePrescriptionRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'reason',
          'items',
          'signatureMethod',
          'signatureDigest',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          reason: {
            type:
              'string',

            minLength:
              5,

            maxLength:
              2_000,
          },

          items: {
            type:
              'array',

            minItems:
              1,

            maxItems:
              100,

            items: {
              $ref:
                '#/components/schemas/PrescriptionItemInput',
            },
          },

          signatureMethod: {
            type:
              'string',

            enum: [
              'AUTHENTICATED_SESSION',
              'PASSWORD_REAUTHENTICATION',
              'DIGITAL_CERTIFICATE',
            ],
          },

          signatureDigest: {
            type:
              'string',

            minLength:
              32,

            maxLength:
              256,
          },

          expiresAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      AcknowledgePrescriptionWarningRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
          'reason',
          'override',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          reason: {
            type:
              'string',

            minLength:
              5,

            maxLength:
              2_000,
          },

          override: {
            type:
              'boolean',
          },
        },
      },

      PrintPrescriptionRequest: {
        type:
          'object',

        additionalProperties:
          false,

        required: [
          'expectedVersion',
        ],

        properties: {
          expectedVersion:
            expectedVersionSchema,

          locale: {
            type:
              'string',

            default:
              'en-PK',
          },

          timezone: {
            type:
              'string',

            default:
              'Asia/Karachi',
          },
        },
      },

      FormularyItem: {
        type:
          'object',

        required: [
          'id',
          'facilityId',
          'formularyCode',
          'medicineId',
          'genericName',
          'form',
          'strength',
          'status',
          'version',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          facilityId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          formularyCode: {
            type:
              'string',
          },

          medicineId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          genericName: {
            type:
              'string',
          },

          brandName: {
            type: [
              'string',
              'null',
            ],
          },

          form: {
            type:
              'string',
          },

          strength: {
            type:
              'string',
          },

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
            ],
          },

          version:
            expectedVersionSchema,

          stock: {
            type:
              'object',

            description:
              'Read-only inventory availability projection. Prescription operations never update this value.',
          },
        },
      },

      Prescription: {
        type:
          'object',

        required: [
          'id',
          'facilityId',
          'prescriptionNumber',
          'patientId',
          'encounterId',
          'prescriberProviderId',
          'status',
          'revisionNumber',
          'itemCount',
          'version',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          facilityId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          prescriptionNumber: {
            type:
              'string',

            example:
              'RX-2026-0000001',
          },

          patientId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          encounterId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          prescriberProviderId: {
            $ref:
              '#/components/schemas/FormularyPrescriptionObjectId',
          },

          status: {
            type:
              'string',

            enum: [
              'DRAFT',
              'ISSUED',
              'PARTIALLY_DISPENSED',
              'DISPENSED',
              'CANCELLED',
              'EXPIRED',
            ],
          },

          revisionNumber: {
            type:
              'integer',

            minimum:
              1,
          },

          itemCount: {
            type:
              'integer',

            minimum:
              0,
          },

          version:
            expectedVersionSchema,

          items: {
            type:
              'array',

            items: {
              type:
                'object',
            },
          },

          warnings: {
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
  },

  paths: {
    '/formulary-prescriptions/formulary': {
      get:
        readOperation(
          'Search the facility formulary',
          'formulary.read',
          [
            {
              name:
                'search',

              in:
                'query',

              required:
                false,

              schema: {
                type:
                  'string',

                maxLength:
                  300,
              },
            },

            {
              name:
                'status',

              in:
                'query',

              required:
                false,

              schema: {
                type:
                  'string',

                enum: [
                  'ACTIVE',
                  'INACTIVE',
                ],
              },
            },

            {
              name:
                'includeStock',

              in:
                'query',

              required:
                false,

              description:
                'Requires inventory.read. Returns availability only and never returns inventory cost.',

              schema: {
                type:
                  'boolean',

                default:
                  false,
              },
            },
          ],
        ),

      post:
        mutationOperation(
          'Create a facility formulary item',
          'formulary.manage',
          'CreateFormularyItemRequest',
          '201',
        ),
    },

    '/formulary-prescriptions/formulary/{formularyItemId}': {
      get:
        readOperation(
          'Read a facility formulary item',
          'formulary.read',
          [
            pathParameter(
              'formularyItemId',
            ),
          ],
        ),

      patch:
        mutationOperation(
          'Update a facility formulary item',
          'formulary.manage',
          'UpdateFormularyItemRequest',
          '200',
          [
            pathParameter(
              'formularyItemId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/formulary/{formularyItemId}/status': {
      post:
        mutationOperation(
          'Activate or deactivate a formulary item',
          'formulary.manage',
          'ChangeFormularyItemStatusRequest',
          '200',
          [
            pathParameter(
              'formularyItemId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions': {
      get:
        readOperation(
          'List minimum-necessary prescriptions available to the actor',
          'prescriptions.read',
          [
            breakGlassParameter,
          ],
        ),

      post:
        mutationOperation(
          'Create an encounter-linked prescription draft',
          'prescriptions.create',
          'CreatePrescriptionDraftRequest',
          '201',
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}': {
      get:
        readOperation(
          'Read an authorized prescription',
          'prescriptions.read',
          [
            pathParameter(
              'prescriptionId',
            ),

            breakGlassParameter,
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/history': {
      get:
        readOperation(
          'Read immutable prescription lifecycle history',
          'prescriptions.read',
          [
            pathParameter(
              'prescriptionId',
            ),

            breakGlassParameter,
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/draft': {
      patch:
        mutationOperation(
          'Replace medicine items in a prescription draft',
          'prescriptions.create',
          'UpdatePrescriptionDraftRequest',
          '200',
          [
            pathParameter(
              'prescriptionId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/issue': {
      post:
        mutationOperation(
          'Evaluate safety checks and issue an immutable prescription',
          'prescriptions.issue',
          'IssuePrescriptionRequest',
          '200',
          [
            pathParameter(
              'prescriptionId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/cancel': {
      post:
        mutationOperation(
          'Cancel a prescription while preserving its history',
          'prescriptions.cancel',
          'CancelPrescriptionRequest',
          '200',
          [
            pathParameter(
              'prescriptionId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/replace': {
      post:
        mutationOperation(
          'Create a replacement prescription revision',
          'prescriptions.amend',
          'ReplacePrescriptionRequest',
          '201',
          [
            pathParameter(
              'prescriptionId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/warnings/{warningId}/acknowledge': {
      post:
        mutationOperation(
          'Acknowledge or override a prescription safety warning',
          'prescriptions.issue',
          'AcknowledgePrescriptionWarningRequest',
          '200',
          [
            pathParameter(
              'prescriptionId',
            ),

            pathParameter(
              'warningId',
            ),
          ],
        ),
    },

    '/formulary-prescriptions/prescriptions/{prescriptionId}/print': {
      post: {
        tags: [
          'Formulary and Prescriptions',
        ],

        summary:
          'Render an auditable printable prescription PDF',

        description:
          'Requires prescriptions.print. The prescription must have been issued and is rendered without modifying inventory.',

        security:
          bearerSecurity,

        parameters: [
          pathParameter(
            'prescriptionId',
          ),

          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/PrintPrescriptionRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Printable prescription PDF',

            headers: {
              'x-content-sha256': {
                description:
                  'SHA-256 digest of the returned PDF',

                schema: {
                  type:
                    'string',
                },
              },
            },

            content: {
              'application/pdf': {
                schema: {
                  type:
                    'string',

                  format:
                    'binary',
                },
              },
            },
          },

          ...errorResponses,
        },
      },
    },

    '/formulary-prescriptions/patients/{patientId}/medications': {
      get:
        readOperation(
          'Read authorized longitudinal patient medication history',
          'prescriptions.read',
          [
            pathParameter(
              'patientId',
            ),

            breakGlassParameter,
          ],
        ),
    },
  },
} as const;