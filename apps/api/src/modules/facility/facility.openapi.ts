const objectIdExample =
  '507f1f77bcf86cd799439011';

const facilityIdExample =
  '507f191e810c19729de860ea';

const departmentIdExample =
  '507f1f77bcf86cd799439012';

const idempotencyParameter = {
  name:
    'Idempotency-Key',

  in:
    'header',

  required:
    true,

  description:
    'Unique mutation key used for replay-safe durable execution.',

  schema: {
    type:
      'string',

    minLength:
      8,

    maxLength:
      200,

    pattern:
      '^[A-Za-z0-9._:-]+$',

    example:
      'facility-operation-20260717-001',
  },
} as const;

function pathIdParameter(
  name:
    string,

  description:
    string,

  example:
    string,
) {
  return {
    name,

    in:
      'path',

    required:
      true,

    description,

    schema: {
      type:
        'string',

      pattern:
        '^[a-fA-F0-9]{24}$',

      example,
    },
  } as const;
}

const facilityIdParameter =
  pathIdParameter(
    'facilityId',
    'Facility identifier',
    facilityIdExample,
  );

const departmentIdParameter =
  pathIdParameter(
    'departmentId',
    'Department identifier',
    departmentIdExample,
  );

const settingIdParameter =
  pathIdParameter(
    'settingId',
    'System-setting identifier',
    objectIdExample,
  );

const settingKeyParameter = {
  name:
    'key',

  in:
    'path',

  required:
    true,

  description:
    'Dot-delimited configuration key',

  schema: {
    type:
      'string',

    example:
      'regional.currency',
  },
} as const;

const standardErrors = {
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
      'Permission, facility boundary, or record policy denied access',

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
      'Facility or configuration resource was not found',

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
      'Duplicate record, lifecycle restriction, or optimistic-concurrency conflict',

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

const bearerSecurity = [
  {
    bearerAuth:
      [],
  },
] as const;

export const facilityOpenApi = {
  tags: [
    {
      name:
        'Facilities',

      description:
        'Hospital, branch, clinic, diagnostic-center, and pharmacy configuration.',
    },

    {
      name:
        'Departments',

      description:
        'Facility-scoped clinical and administrative department hierarchy.',
    },

    {
      name:
        'Configuration Definitions',

      description:
        'Typed global metadata describing available system settings.',
    },

    {
      name:
        'Configuration Settings',

      description:
        'Global and facility-scoped values with precedence, encryption, history, and optimistic concurrency.',
    },
  ],

  components: {
    schemas: {
      FacilityObjectId: {
        type:
          'string',

        pattern:
          '^[a-fA-F0-9]{24}$',

        example:
          objectIdExample,
      },

      FacilityIdentifier: {
        type:
          'object',

        required: [
          'type',
          'value',
          'normalizedValue',
          'isPrimary',
        ],

        properties: {
          type: {
            type:
              'string',

            example:
              'LICENSE_NUMBER',
          },

          value: {
            type:
              'string',

            example:
              'PK-HOSP-0001',
          },

          normalizedValue: {
            type:
              'string',

            example:
              'PK-HOSP-0001',
          },

          issuingAuthority: {
            type: [
              'string',
              'null',
            ],
          },

          isPrimary: {
            type:
              'boolean',
          },
        },
      },

      FacilityAddress: {
        type:
          'object',

        required: [
          'line1',
          'line2',
          'city',
          'district',
          'province',
          'postalCode',
          'countryCode',
        ],

        properties: {
          line1: {
            type: [
              'string',
              'null',
            ],
          },

          line2: {
            type: [
              'string',
              'null',
            ],
          },

          city: {
            type: [
              'string',
              'null',
            ],

            example:
              'Lahore',
          },

          district: {
            type: [
              'string',
              'null',
            ],
          },

          province: {
            type: [
              'string',
              'null',
            ],

            example:
              'Punjab',
          },

          postalCode: {
            type: [
              'string',
              'null',
            ],
          },

          countryCode: {
            type:
              'string',

            minLength:
              2,

            maxLength:
              2,

            example:
              'PK',
          },
        },
      },

      FacilityContact: {
        type:
          'object',

        required: [
          'primaryPhone',
          'secondaryPhone',
          'email',
          'website',
          'emergencyPhone',
        ],

        properties: {
          primaryPhone: {
            type: [
              'string',
              'null',
            ],
          },

          secondaryPhone: {
            type: [
              'string',
              'null',
            ],
          },

          email: {
            type: [
              'string',
              'null',
            ],

            format:
              'email',
          },

          website: {
            type: [
              'string',
              'null',
            ],

            format:
              'uri',
          },

          emergencyPhone: {
            type: [
              'string',
              'null',
            ],
          },
        },
      },

      Facility: {
        type:
          'object',

        required: [
          'id',
          'code',
          'name',
          'facilityType',
          'parentFacilityId',
          'identifiers',
          'timezone',
          'currency',
          'locale',
          'supportedLocales',
          'address',
          'contact',
          'status',
          'allowsAuthentication',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          code: {
            type:
              'string',

            example:
              'MAIN',
          },

          name: {
            type:
              'string',

            example:
              'Main Hospital',
          },

          legalName: {
            type: [
              'string',
              'null',
            ],
          },

          facilityType: {
            type:
              'string',

            enum: [
              'HOSPITAL',
              'BRANCH',
              'CLINIC',
              'DIAGNOSTIC_CENTER',
              'PHARMACY',
              'OTHER',
            ],
          },

          parentFacilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          identifiers: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/FacilityIdentifier',
            },
          },

          timezone: {
            type:
              'string',

            example:
              'Asia/Karachi',
          },

          currency: {
            type:
              'string',

            example:
              'PKR',
          },

          locale: {
            type:
              'string',

            example:
              'en-PK',
          },

          supportedLocales: {
            type:
              'array',

            items: {
              type:
                'string',
            },

            example: [
              'en-PK',
              'ur-PK',
            ],
          },

          address: {
            $ref:
              '#/components/schemas/FacilityAddress',
          },

          contact: {
            $ref:
              '#/components/schemas/FacilityContact',
          },

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
            ],
          },

          allowsAuthentication: {
            type:
              'boolean',
          },

          deactivatedAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          deactivationReason: {
            type: [
              'string',
              'null',
            ],
          },

          version: {
            type:
              'integer',

            minimum:
              0,
          },

          createdAt: {
            type:
              'string',

            format:
              'date-time',
          },

          updatedAt: {
            type:
              'string',

            format:
              'date-time',
          },
        },
      },

      CreateFacilityRequest: {
        type:
          'object',

        required: [
          'code',
          'name',
          'facilityType',
          'timezone',
          'currency',
          'locale',
          'supportedLocales',
          'address',
          'contact',
          'allowsAuthentication',
        ],

        properties: {
          code: {
            type:
              'string',

            example:
              'MAIN',
          },

          name: {
            type:
              'string',

            example:
              'Main Hospital',
          },

          legalName: {
            type: [
              'string',
              'null',
            ],
          },

          facilityType: {
            type:
              'string',

            enum: [
              'HOSPITAL',
              'BRANCH',
              'CLINIC',
              'DIAGNOSTIC_CENTER',
              'PHARMACY',
              'OTHER',
            ],
          },

          parentFacilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          identifiers: {
            type:
              'array',

            items: {
              type:
                'object',
            },
          },

          timezone: {
            type:
              'string',

            example:
              'Asia/Karachi',
          },

          currency: {
            type:
              'string',

            example:
              'PKR',
          },

          locale: {
            type:
              'string',

            example:
              'en-PK',
          },

          supportedLocales: {
            type:
              'array',

            items: {
              type:
                'string',
            },
          },

          address: {
            $ref:
              '#/components/schemas/FacilityAddress',
          },

          contact: {
            $ref:
              '#/components/schemas/FacilityContact',
          },

          allowsAuthentication: {
            type:
              'boolean',
          },
        },
      },

      DepartmentContact: {
        type:
          'object',

        required: [
          'phone',
          'extension',
          'email',
        ],

        properties: {
          phone: {
            type: [
              'string',
              'null',
            ],
          },

          extension: {
            type: [
              'string',
              'null',
            ],
          },

          email: {
            type: [
              'string',
              'null',
            ],

            format:
              'email',
          },
        },
      },

      Department: {
        type:
          'object',

        required: [
          'id',
          'facilityId',
          'code',
          'name',
          'departmentType',
          'isClinical',
          'contact',
          'status',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          facilityId: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          parentDepartmentId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          managerStaffId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          code: {
            type:
              'string',

            example:
              'OPD',
          },

          name: {
            type:
              'string',

            example:
              'Outpatient Department',
          },

          description: {
            type: [
              'string',
              'null',
            ],
          },

          departmentType: {
            type:
              'string',

            enum: [
              'CLINICAL',
              'DIAGNOSTIC',
              'ADMINISTRATIVE',
              'FINANCIAL',
              'PHARMACY',
              'SUPPORT',
              'OTHER',
            ],
          },

          isClinical: {
            type:
              'boolean',
          },

          location: {
            type: [
              'string',
              'null',
            ],
          },

          costCenterCode: {
            type: [
              'string',
              'null',
            ],
          },

          contact: {
            $ref:
              '#/components/schemas/DepartmentContact',
          },

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
            ],
          },

          version: {
            type:
              'integer',
          },

          createdAt: {
            type:
              'string',

            format:
              'date-time',
          },

          updatedAt: {
            type:
              'string',

            format:
              'date-time',
          },
        },
      },

      CreateDepartmentRequest: {
        type:
          'object',

        required: [
          'code',
          'name',
          'departmentType',
          'isClinical',
          'contact',
        ],

        properties: {
          parentDepartmentId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          managerStaffId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          code: {
            type:
              'string',

            example:
              'OPD',
          },

          name: {
            type:
              'string',

            example:
              'Outpatient Department',
          },

          description: {
            type: [
              'string',
              'null',
            ],
          },

          departmentType: {
            type:
              'string',
          },

          isClinical: {
            type:
              'boolean',
          },

          location: {
            type: [
              'string',
              'null',
            ],
          },

          costCenterCode: {
            type: [
              'string',
              'null',
            ],
          },

          contact: {
            $ref:
              '#/components/schemas/DepartmentContact',
          },
        },
      },

      LifecycleRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          expectedVersion: {
            type:
              'integer',

            minimum:
              0,
          },

          reason: {
            type:
              'string',

            minLength:
              3,

            maxLength:
              500,
          },
        },
      },

      SettingDefinition: {
        type:
          'object',

        required: [
          'id',
          'key',
          'category',
          'dataType',
          'allowedScopes',
          'labels',
          'validation',
          'isSensitive',
          'isMutable',
          'isActive',
          'cacheTtlSeconds',
          'version',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          key: {
            type:
              'string',

            example:
              'regional.currency',
          },

          category: {
            type:
              'string',
          },

          dataType: {
            type:
              'string',
          },

          allowedScopes: {
            type:
              'array',

            items: {
              type:
                'string',

              enum: [
                'GLOBAL',
                'FACILITY',
              ],
            },
          },

          defaultValue: {},

          labels: {
            type:
              'array',

            items: {
              type:
                'object',
            },
          },

          validation: {
            type:
              'object',
          },

          isSensitive: {
            type:
              'boolean',
          },

          isMutable: {
            type:
              'boolean',
          },

          isActive: {
            type:
              'boolean',
          },

          cacheTtlSeconds: {
            type:
              'integer',
          },

          version: {
            type:
              'integer',
          },
        },
      },

      SystemSetting: {
        type:
          'object',

        required: [
          'id',
          'definitionId',
          'key',
          'scope',
          'facilityId',
          'value',
          'isSensitive',
          'isConfigured',
          'revision',
          'isActive',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          definitionId: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          key: {
            type:
              'string',
          },

          scope: {
            type:
              'string',

            enum: [
              'GLOBAL',
              'FACILITY',
            ],
          },

          facilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          value: {
            description:
              'Always null for sensitive settings.',
          },

          isSensitive: {
            type:
              'boolean',
          },

          isConfigured: {
            type:
              'boolean',
          },

          revision: {
            type:
              'integer',

            minimum:
              1,
          },

          isActive: {
            type:
              'boolean',
          },

          version: {
            type:
              'integer',
          },

          createdAt: {
            type:
              'string',

            format:
              'date-time',
          },

          updatedAt: {
            type:
              'string',

            format:
              'date-time',
          },
        },
      },

      EffectiveSystemSetting: {
        type:
          'object',

        required: [
          'key',
          'dataType',
          'requestedFacilityId',
          'source',
          'sourceFacilityId',
          'settingId',
          'value',
          'isSensitive',
          'isConfigured',
          'revision',
          'updatedAt',
        ],

        properties: {
          key: {
            type:
              'string',
          },

          dataType: {
            type:
              'string',
          },

          requestedFacilityId: {
            $ref:
              '#/components/schemas/FacilityObjectId',
          },

          source: {
            type:
              'string',

            enum: [
              'FACILITY',
              'GLOBAL',
              'DEFAULT',
              'UNCONFIGURED',
            ],
          },

          sourceFacilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          settingId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          value: {
            description:
              'Always null for sensitive settings.',
          },

          isSensitive: {
            type:
              'boolean',
          },

          isConfigured: {
            type:
              'boolean',
          },

          revision: {
            type: [
              'integer',
              'null',
            ],
          },

          updatedAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      UpsertSystemSettingRequest: {
        type:
          'object',

        required: [
          'scope',
          'facilityId',
          'value',
          'expectedVersion',
          'expectedRevision',
          'reason',
        ],

        properties: {
          scope: {
            type:
              'string',

            enum: [
              'GLOBAL',
              'FACILITY',
            ],
          },

          facilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/FacilityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          value: {},

          expectedVersion: {
            type: [
              'integer',
              'null',
            ],
          },

          expectedRevision: {
            type: [
              'integer',
              'null',
            ],
          },

          reason: {
            type:
              'string',
          },
        },
      },
    },
  },

  paths: {
    '/facilities': {
      get: {
        tags: [
          'Facilities',
        ],

        summary:
          'List visible facilities',

        description:
          'Users without facilities.manage_all receive only their authenticated facility.',

        security:
          bearerSecurity,

        responses: {
          '200': {
            description:
              'Facility page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Facilities',
        ],

        summary:
          'Create a facility',

        security:
          bearerSecurity,

        parameters: [
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/CreateFacilityRequest',
              },
            },
          },
        },

        responses: {
          '201': {
            description:
              'Facility created',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}': {
      get: {
        tags: [
          'Facilities',
        ],

        summary:
          'Get a facility',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
        ],

        responses: {
          '200': {
            description:
              'Facility returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Facilities',
        ],

        summary:
          'Update a facility',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                allOf: [
                  {
                    $ref:
                      '#/components/schemas/CreateFacilityRequest',
                  },

                  {
                    type:
                      'object',

                    required: [
                      'expectedVersion',
                    ],

                    properties: {
                      expectedVersion: {
                        type:
                          'integer',
                      },
                    },
                  },
                ],
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Facility updated',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/activate': {
      post: {
        tags: [
          'Facilities',
        ],

        summary:
          'Activate a facility',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/LifecycleRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Facility activated',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/deactivate': {
      post: {
        tags: [
          'Facilities',
        ],

        summary:
          'Deactivate a facility and revoke active sessions',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/LifecycleRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Facility deactivated',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/departments': {
      get: {
        tags: [
          'Departments',
        ],

        summary:
          'List departments for a facility',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
        ],

        responses: {
          '200': {
            description:
              'Department page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Departments',
        ],

        summary:
          'Create a department',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/CreateDepartmentRequest',
              },
            },
          },
        },

        responses: {
          '201': {
            description:
              'Department created',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/departments/{departmentId}': {
      get: {
        tags: [
          'Departments',
        ],

        summary:
          'Get a department',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          departmentIdParameter,
        ],

        responses: {
          '200': {
            description:
              'Department returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Departments',
        ],

        summary:
          'Update a department',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          departmentIdParameter,
          idempotencyParameter,
        ],

        responses: {
          '200': {
            description:
              'Department updated',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/departments/{departmentId}/activate': {
      post: {
        tags: [
          'Departments',
        ],

        summary:
          'Activate a department',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          departmentIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/LifecycleRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Department activated',
          },

          ...standardErrors,
        },
      },
    },

    '/facilities/{facilityId}/departments/{departmentId}/deactivate': {
      post: {
        tags: [
          'Departments',
        ],

        summary:
          'Deactivate a department',

        security:
          bearerSecurity,

        parameters: [
          facilityIdParameter,
          departmentIdParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/LifecycleRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Department deactivated',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/definitions': {
      get: {
        tags: [
          'Configuration Definitions',
        ],

        summary:
          'List setting definitions',

        security:
          bearerSecurity,

        responses: {
          '200': {
            description:
              'Definition page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Configuration Definitions',
        ],

        summary:
          'Create a setting definition',

        security:
          bearerSecurity,

        parameters: [
          idempotencyParameter,
        ],

        responses: {
          '201': {
            description:
              'Setting definition created',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/definitions/{key}': {
      get: {
        tags: [
          'Configuration Definitions',
        ],

        summary:
          'Get a setting definition',

        security:
          bearerSecurity,

        parameters: [
          settingKeyParameter,
        ],

        responses: {
          '200': {
            description:
              'Setting definition returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Configuration Definitions',
        ],

        summary:
          'Update mutable definition fields',

        security:
          bearerSecurity,

        parameters: [
          settingKeyParameter,
          idempotencyParameter,
        ],

        responses: {
          '200': {
            description:
              'Setting definition updated',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/settings': {
      get: {
        tags: [
          'Configuration Settings',
        ],

        summary:
          'List configured settings',

        security:
          bearerSecurity,

        responses: {
          '200': {
            description:
              'System-setting page returned',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/settings/effective/{key}': {
      get: {
        tags: [
          'Configuration Settings',
        ],

        summary:
          'Resolve a facility-effective setting',

        description:
          'Resolution order is facility value, global value, definition default, then unconfigured.',

        security:
          bearerSecurity,

        parameters: [
          settingKeyParameter,

          {
            name:
              'facilityId',

            in:
              'query',

            required:
              false,

            schema: {
              $ref:
                '#/components/schemas/FacilityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Effective setting returned',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/settings/{key}': {
      put: {
        tags: [
          'Configuration Settings',
        ],

        summary:
          'Create or update a system setting',

        description:
          'Sensitive values are encrypted and never returned as plaintext.',

        security:
          bearerSecurity,

        parameters: [
          settingKeyParameter,
          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                $ref:
                  '#/components/schemas/UpsertSystemSettingRequest',
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'System setting created or updated',
          },

          ...standardErrors,
        },
      },
    },

    '/configuration/settings/{settingId}/history': {
      get: {
        tags: [
          'Configuration Settings',
        ],

        summary:
          'List immutable setting history',

        security:
          bearerSecurity,

        parameters: [
          settingIdParameter,
        ],

        responses: {
          '200': {
            description:
              'Version-history page returned',
          },

          ...standardErrors,
        },
      },
    },
  },
} as const;