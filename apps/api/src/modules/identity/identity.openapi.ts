const objectIdExample =
  '507f1f77bcf86cd799439011';

const facilityIdExample =
  '507f191e810c19729de860ea';

const idempotencyParameter = {
  name:
    'Idempotency-Key',

  in:
    'header',

  required:
    true,

  description:
    'Unique key used to prevent duplicate execution of a mutation.',

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
      'identity-role-create-20260716-001',
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
      'Permission or record-level policy denied access',

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
      'Identity resource was not found',

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
      'Duplicate record, version conflict, or protected resource conflict',

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

export const identityOpenApi = {
  tags: [
    {
      name:
        'Identity Permissions',

      description:
        'Permission catalog used by centralized backend and frontend authorization.',
    },

    {
      name:
        'Identity Roles',

      description:
        'Global and facility-scoped role management.',
    },

    {
      name:
        'Identity Staff',

      description:
        'Hospital staff identity and employment records.',
    },

    {
      name:
        'Identity Users',

      description:
        'Login accounts, role assignments, password reset, and session revocation.',
    },
  ],

  components: {
    schemas: {
      IdentityObjectId: {
        type:
          'string',

        pattern:
          '^[a-fA-F0-9]{24}$',

        example:
          objectIdExample,
      },

      IdentityPermission: {
        type:
          'object',

        required: [
          'id',
          'code',
          'name',
          'module',
          'isSystem',
          'isActive',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          code: {
            type:
              'string',

            example:
              'identity.users.read',
          },

          name: {
            type:
              'string',

            example:
              'Identity Users Read',
          },

          module: {
            type:
              'string',

            example:
              'identity',
          },

          description: {
            type: [
              'string',
              'null',
            ],
          },

          isSystem: {
            type:
              'boolean',

            example:
              true,
          },

          isActive: {
            type:
              'boolean',

            example:
              true,
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

      IdentityRole: {
        type:
          'object',

        required: [
          'id',
          'facilityId',
          'code',
          'name',
          'scope',
          'isSystem',
          'isActive',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          facilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
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
              'RECEPTION_MANAGEMENT',
          },

          name: {
            type:
              'string',

            example:
              'Reception Management',
          },

          description: {
            type: [
              'string',
              'null',
            ],
          },

          scope: {
            type:
              'string',

            enum: [
              'GLOBAL',
              'FACILITY',
            ],

            example:
              'FACILITY',
          },

          isSystem: {
            type:
              'boolean',
          },

          isActive: {
            type:
              'boolean',
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

      IdentityStaff: {
        type:
          'object',

        required: [
          'id',
          'facilityId',
          'employeeNumber',
          'firstName',
          'lastName',
          'displayName',
          'employmentStatus',
          'isClinical',
          'isActive',
          'version',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          facilityId: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          departmentId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          employeeNumber: {
            type:
              'string',

            example:
              'EMP-00042',
          },

          firstName: {
            type:
              'string',

            example:
              'Ayesha',
          },

          middleName: {
            type: [
              'string',
              'null',
            ],
          },

          lastName: {
            type:
              'string',

            example:
              'Khan',
          },

          displayName: {
            type:
              'string',

            example:
              'Dr. Ayesha Khan',
          },

          cnic: {
            type: [
              'string',
              'null',
            ],

            pattern:
              '^\\d{13}$',
          },

          phone: {
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

          designation: {
            type: [
              'string',
              'null',
            ],

            example:
              'Consultant Physician',
          },

          employmentStatus: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
              'ON_LEAVE',
              'SUSPENDED',
              'TERMINATED',
            ],
          },

          isClinical: {
            type:
              'boolean',
          },

          isActive: {
            type:
              'boolean',
          },

          version: {
            type:
              'integer',

            minimum:
              0,
          },
        },
      },

      IdentityUserRole: {
        type:
          'object',

        required: [
          'id',
          'userId',
          'roleId',
          'facilityId',
          'assignedBy',
          'assignedAt',
          'expiresAt',
          'isActive',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          userId: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          roleId: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          facilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          assignedBy: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          assignedAt: {
            type:
              'string',

            format:
              'date-time',
          },

          expiresAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          isActive: {
            type:
              'boolean',
          },

          revokedAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          revocationReason: {
            type: [
              'string',
              'null',
            ],
          },
        },
      },

      IdentityUser: {
        type:
          'object',

        required: [
          'id',
          'username',
          'status',
          'mustChangePassword',
          'failedLoginAttempts',
          'version',
          'createdAt',
          'updatedAt',
        ],

        properties: {
          id: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          staffId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          username: {
            type:
              'string',

            example:
              'ayesha.khan',
          },

          email: {
            type: [
              'string',
              'null',
            ],

            format:
              'email',
          },

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
              'LOCKED',
              'SUSPENDED',
              'DISABLED',
            ],
          },

          mustChangePassword: {
            type:
              'boolean',
          },

          failedLoginAttempts: {
            type:
              'integer',

            minimum:
              0,
          },

          lockedUntil: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          lastLoginAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
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

      IdentityPage: {
        type:
          'object',

        required: [
          'items',
          'page',
          'pageSize',
          'totalItems',
          'totalPages',
        ],

        properties: {
          items: {
            type:
              'array',

            items: {},
          },

          page: {
            type:
              'integer',
          },

          pageSize: {
            type:
              'integer',
          },

          totalItems: {
            type:
              'integer',
          },

          totalPages: {
            type:
              'integer',
          },
        },
      },

      CreateRoleRequest: {
        type:
          'object',

        required: [
          'code',
          'name',
          'scope',
        ],

        properties: {
          facilityId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
              },

              {
                type:
                  'null',
              },
            ],

            example:
              facilityIdExample,
          },

          code: {
            type:
              'string',

            pattern:
              '^[A-Z][A-Z0-9_]*$',

            example:
              'RECEPTION_MANAGEMENT',
          },

          name: {
            type:
              'string',

            example:
              'Reception Management',
          },

          description: {
            type: [
              'string',
              'null',
            ],
          },

          scope: {
            type:
              'string',

            enum: [
              'GLOBAL',
              'FACILITY',
            ],

            example:
              'FACILITY',
          },

          permissionIds: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        },
      },

      CreateStaffRequest: {
        type:
          'object',

        required: [
          'facilityId',
          'employeeNumber',
          'firstName',
          'lastName',
        ],

        properties: {
          facilityId: {
            $ref:
              '#/components/schemas/IdentityObjectId',
          },

          employeeNumber: {
            type:
              'string',

            example:
              'EMP-00042',
          },

          firstName: {
            type:
              'string',

            example:
              'Ayesha',
          },

          lastName: {
            type:
              'string',

            example:
              'Khan',
          },

          cnic: {
            type: [
              'string',
              'null',
            ],

            example:
              '3520212345678',
          },

          designation: {
            type: [
              'string',
              'null',
            ],

            example:
              'Consultant Physician',
          },

          isClinical: {
            type:
              'boolean',

            example:
              true,
          },
        },
      },

      CreateUserRequest: {
        type:
          'object',

        required: [
          'username',
          'password',
        ],

        properties: {
          staffId: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/IdentityObjectId',
              },

              {
                type:
                  'null',
              },
            ],
          },

          username: {
            type:
              'string',

            example:
              'ayesha.khan',
          },

          email: {
            type: [
              'string',
              'null',
            ],

            example:
              'ayesha.khan@example.test',
          },

          password: {
            type:
              'string',

            format:
              'password',

            minLength:
              12,
          },

          mustChangePassword: {
            type:
              'boolean',

            default:
              true,
          },

          roleAssignments: {
            type:
              'array',

            items: {
              type:
                'object',

              required: [
                'roleId',
              ],

              properties: {
                roleId: {
                  $ref:
                    '#/components/schemas/IdentityObjectId',
                },

                facilityId: {
                  oneOf: [
                    {
                      $ref:
                        '#/components/schemas/IdentityObjectId',
                    },

                    {
                      type:
                        'null',
                    },
                  ],
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
          },
        },
      },
    },
  },

  paths: {
    '/identity/permissions': {
      get: {
        tags: [
          'Identity Permissions',
        ],

        summary:
          'List permissions',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'module',

            in:
              'query',

            schema: {
              type:
                'string',
            },
          },

          {
            name:
              'search',

            in:
              'query',

            schema: {
              type:
                'string',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Permission page returned',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/permissions/{id}': {
      get: {
        tags: [
          'Identity Permissions',
        ],

        summary:
          'Get a permission',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'id',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Permission returned',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/roles': {
      get: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'List roles',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'facilityId',

            in:
              'query',

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          {
            name:
              'scope',

            in:
              'query',

            schema: {
              type:
                'string',

              enum: [
                'GLOBAL',
                'FACILITY',
              ],
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Role page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'Create a role',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

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
                  '#/components/schemas/CreateRoleRequest',
              },
            },
          },
        },

        responses: {
          '201': {
            description:
              'Role created',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/roles/{roleId}': {
      get: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'Get a role and its permissions',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'roleId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Role returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'Update a role',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'roleId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                type:
                  'object',

                required: [
                  'expectedVersion',
                ],

                properties: {
                  name: {
                    type:
                      'string',
                  },

                  description: {
                    type: [
                      'string',
                      'null',
                    ],
                  },

                  isActive: {
                    type:
                      'boolean',
                  },

                  expectedVersion: {
                    type:
                      'integer',

                    minimum:
                      0,
                  },
                },
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Role updated',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/roles/{roleId}/permissions': {
      get: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'List permissions assigned to a role',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'roleId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Assigned permissions returned',
          },

          ...standardErrors,
        },
      },

      put: {
        tags: [
          'Identity Roles',
        ],

        summary:
          'Replace role permissions',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'roleId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                type:
                  'object',

                required: [
                  'permissionIds',
                  'expectedRoleVersion',
                ],

                properties: {
                  permissionIds: {
                    type:
                      'array',

                    items: {
                      $ref:
                        '#/components/schemas/IdentityObjectId',
                    },
                  },

                  expectedRoleVersion: {
                    type:
                      'integer',

                    minimum:
                      0,
                  },
                },
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Role permissions replaced',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/staff': {
      get: {
        tags: [
          'Identity Staff',
        ],

        summary:
          'List staff for a facility',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'facilityId',

            in:
              'query',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Staff page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Identity Staff',
        ],

        summary:
          'Create a staff record',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

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
                  '#/components/schemas/CreateStaffRequest',
              },
            },
          },
        },

        responses: {
          '201': {
            description:
              'Staff record created',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/staff/{id}': {
      get: {
        tags: [
          'Identity Staff',
        ],

        summary:
          'Get a staff record',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'id',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'Staff record returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Identity Staff',
        ],

        summary:
          'Update a staff record',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'id',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        responses: {
          '200': {
            description:
              'Staff record updated',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/users': {
      get: {
        tags: [
          'Identity Users',
        ],

        summary:
          'List user accounts',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        responses: {
          '200': {
            description:
              'User page returned',
          },

          ...standardErrors,
        },
      },

      post: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Create a user account',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

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
                  '#/components/schemas/CreateUserRequest',
              },
            },
          },
        },

        responses: {
          '201': {
            description:
              'User account created',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/users/{userId}': {
      get: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Get a user and role assignments',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'userId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },
        ],

        responses: {
          '200': {
            description:
              'User returned',
          },

          ...standardErrors,
        },
      },

      patch: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Update a user account',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'userId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        responses: {
          '200': {
            description:
              'User updated',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/users/{userId}/roles': {
      put: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Replace user role assignments',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'userId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        responses: {
          '200': {
            description:
              'User role assignments replaced',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/users/{userId}/password-reset': {
      post: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Reset a user password',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'userId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                type:
                  'object',

                required: [
                  'password',
                  'reason',
                ],

                properties: {
                  password: {
                    type:
                      'string',

                    format:
                      'password',

                    minLength:
                      12,
                  },

                  mustChangePassword: {
                    type:
                      'boolean',

                    default:
                      true,
                  },

                  revokeSessions: {
                    type:
                      'boolean',

                    default:
                      true,
                  },

                  reason: {
                    type:
                      'string',

                    example:
                      'Password reset approved by the system administrator',
                  },
                },
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Password reset completed',
          },

          ...standardErrors,
        },
      },
    },

    '/identity/users/{userId}/sessions/revoke': {
      post: {
        tags: [
          'Identity Users',
        ],

        summary:
          'Revoke active sessions for a user',

        security: [
          {
            bearerAuth:
              [],
          },
        ],

        parameters: [
          {
            name:
              'userId',

            in:
              'path',

            required:
              true,

            schema: {
              $ref:
                '#/components/schemas/IdentityObjectId',
            },
          },

          idempotencyParameter,
        ],

        requestBody: {
          required:
            true,

          content: {
            'application/json': {
              schema: {
                type:
                  'object',

                required: [
                  'reason',
                ],

                properties: {
                  reason: {
                    type:
                      'string',

                    example:
                      'Account access review',
                  },

                  excludeSessionId: {
                    type:
                      'string',

                    format:
                      'uuid',
                  },
                },
              },
            },
          },
        },

        responses: {
          '200': {
            description:
              'Sessions revoked',
          },

          ...standardErrors,
        },
      },
    },
  },
} as const;