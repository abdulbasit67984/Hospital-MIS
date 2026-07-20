import {
  readFile,
} from 'node:fs/promises';

import express, {
  type ErrorRequestHandler,
} from 'express';
import request from 'supertest';

import {
  ForbiddenError,
} from '@hospital-mis/shared';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  Types,
} from 'mongoose';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  MongoFormularyStockVisibilityAdapter,
} from '../../../infrastructure/formulary-stock-visibility.adapter.js';

import {
  InventoryBackgroundJobs,
  INVENTORY_BACKGROUND_JOB_TYPES,
} from '../../../infrastructure/inventory-background-jobs.js';

import {
  MongoInventoryApprovalLimitAdapter,
} from '../../../infrastructure/inventory-runtime.adapters.js';

import {
  MongoInventoryTransactionManagerAdapter,
} from '../../../infrastructure/inventory-transaction-manager.adapter.js';

import {
  createInventoryRouter,
} from '../inventory.http.js';

import {
  INVENTORY_PERMISSION_KEYS,
} from '../inventory.constants.js';

function objectId(): Types.ObjectId {
  return new Types.ObjectId();
}

describe(
  'inventory Batch 6 runtime integration',
  () => {
    it(
      'resolves procurement approval limits using exact decimal comparison',
      async () => {
        const facilityId = objectId().toHexString();
        const database = {
          collection: vi.fn(() => ({
            findOne: vi.fn(async () => ({
              value: {
                currency: 'PKR',
                defaultLimit: '9007199254740992.10',
                roleLimits: {
                  STORE_MANAGER: '9007199254740992.09',
                  HOSPITAL_ADMINISTRATOR: '9007199254740992.11',
                },
              },
            })),
          })),
        };

        const adapter = new MongoInventoryApprovalLimitAdapter(
          database as never,
        );

        const limit = await adapter.resolveLimit({
          facilityId,
          actorUserId: objectId().toHexString(),
          actorStaffId: objectId().toHexString(),
          roleKeys: [
            'STORE_MANAGER',
            'HOSPITAL_ADMINISTRATOR',
          ],
          documentType: 'PURCHASE_REQUISITION',
          currency: 'PKR',
          amount: '1',
          occurredAt: new Date('2026-07-21T00:00:00.000Z'),
        });

        expect(limit).toBe('9007199254740992.11');
      },
    );

    it(
      'joins stock units and computes formulary low-stock visibility from available stock only',
      async () => {
        const facilityId = objectId().toHexString();
        const inventoryItemId = objectId();
        const stockUnitId = objectId();
        const updatedAt = new Date('2026-07-21T08:30:00.000Z');

        const collection = vi.fn((name: string) => {
          if (name === 'stockBalances') {
            return {
              aggregate: vi.fn(() => ({
                toArray: vi.fn(async () => [
                  {
                    _id: inventoryItemId,
                    availableQuantity: Types.Decimal128.fromString('4'),
                    asOf: updatedAt,
                  },
                ]),
              })),
            };
          }

          if (name === 'inventoryItems') {
            return {
              find: vi.fn(() => ({
                project: vi.fn(() => ({
                  toArray: vi.fn(async () => [
                    {
                      _id: inventoryItemId,
                      stockUnitId,
                      reorderLevel: Types.Decimal128.fromString('5'),
                      status: 'ACTIVE',
                    },
                  ]),
                })),
              })),
            };
          }

          if (name === 'unitsOfMeasure') {
            return {
              find: vi.fn(() => ({
                project: vi.fn(() => ({
                  toArray: vi.fn(async () => [
                    {
                      _id: stockUnitId,
                      symbol: 'tab',
                      status: 'ACTIVE',
                    },
                  ]),
                })),
              })),
            };
          }

          throw new Error(`Unexpected collection ${name}`);
        });

        const adapter = new MongoFormularyStockVisibilityAdapter({
          collection,
        } as never);

        const result = await adapter.read(
          facilityId,
          [inventoryItemId.toHexString()],
        );

        expect(result.get(inventoryItemId.toHexString())).toEqual({
          visible: true,
          inventoryItemId: inventoryItemId.toHexString(),
          availableQuantity: '4',
          unit: 'tab',
          lowStock: true,
          asOf: updatedAt.toISOString(),
        });
      },
    );

    it(
      'registers restriction, reservation-expiry, and realtime-retry background handlers',
      () => {
        const register = vi.fn();

        new InventoryBackgroundJobs({
          database: {} as never,
          jobs: {} as never,
          runner: {
            register,
          } as never,
          application: {} as never,
          actorResolver: {} as never,
          transactionRecovery: {
            recoverFinalizations: vi.fn(async () => 0),
          },
          publishRealtime: vi.fn(async () => undefined),
        });

        expect(
          register.mock.calls.map((call) => call[0]),
        ).toEqual([
          INVENTORY_BACKGROUND_JOB_TYPES.RESTRICTION_SWEEP,
          INVENTORY_BACKGROUND_JOB_TYPES.RESERVATION_EXPIRY,
          INVENTORY_BACKGROUND_JOB_TYPES.REALTIME_RETRY,
          INVENTORY_BACKGROUND_JOB_TYPES.TRANSACTION_RECOVERY,
        ]);
      },
    );


    it(
      'queues finalization recovery without compensating a completed domain operation',
      async () => {
        const applicationTransactionUpdate = vi.fn(async () => ({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
        }));
        const database = {
          collection: vi.fn(() => ({
            updateOne: applicationTransactionUpdate,
          })),
        };
        const transactions = {
          create: vi.fn(async () => undefined),
          setStatus: vi.fn(async () => undefined),
          setStepStatus: vi.fn(async () => undefined),
        };
        const idempotency = {
          begin: vi.fn(async () => ({
            kind: 'ACQUIRED' as const,
            ownerId: 'inventory-owner-1',
          })),
          complete: vi.fn(async () => {
            throw new Error('simulated idempotency finalization failure');
          }),
          fail: vi.fn(async () => undefined),
        };
        const locks = {
          acquireMany: vi.fn(async () => []),
          releaseMany: vi.fn(async () => undefined),
        };
        const outbox = {
          releaseTransactionEvents: vi.fn(async () => undefined),
        };
        const compensationExecutor = {
          execute: vi.fn(async () => undefined),
        };

        const manager = new MongoInventoryTransactionManagerAdapter(
          database as never,
          transactions as never,
          idempotency as never,
          locks as never,
          outbox as never,
          compensationExecutor as never,
        );

        await expect(
          manager.execute({
            transactionType: 'inventory.test.finalization',
            idempotencyKey: 'inventory-finalization-test-1',
            actorUserId: objectId().toHexString(),
            facilityId: objectId().toHexString(),
            correlationId: 'corr-finalization-test',
            lockKeys: ['inventory:test:finalization'],
            idempotencyPayload: {
              test: true,
            },
            journalPayload: {
              operation: 'TEST_FINALIZATION',
            },
            execute: async (context) => {
              await context.registerCompensation({
                key: 'test-compensation',
                type: 'inventory.catalog.delete-created',
                payload: {},
              });

              return {
                completed: true,
              };
            },
          }),
        ).rejects.toMatchObject({
          code: 'INVENTORY_TRANSACTION_FINALIZATION_PENDING',
        });

        expect(compensationExecutor.execute).not.toHaveBeenCalled();
        expect(idempotency.fail).not.toHaveBeenCalled();
        expect(applicationTransactionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({}),
          expect.objectContaining({
            $set: expect.objectContaining({
              recoveryStatus: 'INVENTORY_FINALIZATION_PENDING',
            }),
          }),
        );
      },
    );

    it(
      'mounts inventory routes and starts and stops inventory jobs with the API lifecycle',
      async () => {
        const source = await readFile(
          new URL('../../../server.ts', import.meta.url),
          'utf8',
        );

        expect(source).toContain("'/api/v1/inventory'");
        expect(source).toContain(
          'inventoryInfrastructure.backgroundJobs.start();',
        );
        expect(source).toContain(
          'inventoryInfrastructure.backgroundJobs.stop();',
        );
        expect(source).toContain(
          "inventoryDispensingMutation:\n          'enabled-through-inventory-ledger'",
        );
        expect(source).toContain(
          "medicationAdministrationInventoryMutation:\n          'disabled'",
        );
      },
    );
  },
);

const facilityId = '507f1f77bcf86cd799439011';
const userId = '507f1f77bcf86cd799439012';
const staffId = '507f1f77bcf86cd799439013';
const requisitionId = '507f1f77bcf86cd799439014';
const requisitionItemId = '507f1f77bcf86cd799439015';

function createTestRuntime(
  initialPermissions: readonly PermissionKey[],
) {
  let permissions = new Set<PermissionKey>(initialPermissions);

  const authenticationService = {
    authenticateAccessToken: vi.fn(async () => ({
      userId,
      sessionId: 'session-1',
      facilityId,
      accessTokenId: 'token-1',
      tokenVersion: 1,
      permissionVersion: 1,
    })),
  };

  const authorizationService = {
    permissionsFor: vi.fn(async () => permissions),
    assertPermission: vi.fn(
      async (_principal: unknown, permission: PermissionKey) => {
        if (!permissions.has(permission)) {
          throw new ForbiddenError(
            `Permission ${permission} is required`,
          );
        }
      },
    ),
  };

  const actorResolver = {
    resolve: vi.fn(async (input: {
      correlationId: string;
      permissions: ReadonlySet<PermissionKey>;
    }) => ({
      userId,
      facilityId,
      correlationId: input.correlationId,
      roleKeys: ['STORE_MANAGER'],
      permissionKeys: [...input.permissions],
      staffId,
    })),
  };

  const listItems = vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 0,
  }));

  const createCategory = vi.fn(async () => ({
    id: '507f1f77bcf86cd799439016',
  }));

  const decidePurchaseRequisition = vi.fn(async () => ({
    id: requisitionId,
  }));

  const listValuation = vi.fn(async () => []);

  const application = {
    services: {
      catalog: {
        listItems,
        createCategory,
      },
      procurement: {
        decidePurchaseRequisition,
      },
      controls: {
        listValuation,
      },
      query: {},
      stock: {},
    },
  };

  const app = express();
  app.use(express.json());
  app.use((httpRequest, _response, next) => {
    httpRequest.correlationId = 'corr-inventory-http-test';
    next();
  });
  app.use(
    '/api/v1/inventory',
    createInventoryRouter({
      application: application as never,
      authenticationService: authenticationService as never,
      authorizationService: authorizationService as never,
      actorResolver: actorResolver as never,
    }),
  );

  const errors: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    const candidate = error as {
      statusCode?: number;
      message?: string;
    };

    response.status(candidate.statusCode ?? 500).json({
      message: candidate.message ?? 'Unexpected error',
    });
  };

  app.use(errors);

  return {
    app,
    authenticationService,
    authorizationService,
    actorResolver,
    listItems,
    createCategory,
    decidePurchaseRequisition,
    listValuation,
    setPermissions(next: readonly PermissionKey[]) {
      permissions = new Set(next);
    },
  };
}

describe(
  'inventory HTTP authentication, authorization, and strict validation',
  () => {
    let runtime: ReturnType<typeof createTestRuntime>;

    beforeEach(() => {
      runtime = createTestRuntime([
        INVENTORY_PERMISSION_KEYS.READ,
        INVENTORY_PERMISSION_KEYS.PROCURE,
        INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
      ]);
    });

    it(
      'rejects unauthenticated requests before inventory application execution',
      async () => {
        const response = await request(runtime.app)
          .get('/api/v1/inventory/items');

        expect(response.status).toBe(401);
        expect(runtime.listItems).not.toHaveBeenCalled();
      },
    );

    it(
      'resolves permissions and actor context for an authenticated inventory read',
      async () => {
        const response = await request(runtime.app)
          .get('/api/v1/inventory/items')
          .set('Authorization', 'Bearer inventory-test-token');

        expect(response.status).toBe(200);
        expect(runtime.listItems).toHaveBeenCalledTimes(1);
        expect(runtime.actorResolver.resolve).toHaveBeenCalledWith(
          expect.objectContaining({
            userId,
            facilityId,
            permissions: expect.any(Set),
          }),
        );
      },
    );

    it(
      'requires an idempotency key before executing a mutating route',
      async () => {
        const response = await request(runtime.app)
          .post('/api/v1/inventory/categories')
          .set('Authorization', 'Bearer inventory-test-token')
          .send({
            categoryCode: 'MEDICAL',
            name: 'Medical supplies',
          });

        expect(response.status).toBe(400);
        expect(runtime.createCategory).not.toHaveBeenCalled();
      },
    );

    it(
      'rejects client-supplied procurement approval limits',
      async () => {
        const response = await request(runtime.app)
          .post(
            `/api/v1/inventory/requisitions/${requisitionId}/decision`,
          )
          .set('Authorization', 'Bearer inventory-test-token')
          .set('Idempotency-Key', 'inventory-requisition-decision-1')
          .send({
            expectedVersion: 0,
            decision: 'APPROVED',
            reason: 'Approved within procurement policy',
            actorApprovalLimit: '999999999999999999',
            lines: [
              {
                requisitionItemId,
                approvedStockQuantity: '10',
                decision: 'APPROVED',
              },
            ],
          });

        expect(response.status).toBe(400);
        expect(
          runtime.decidePurchaseRequisition,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'keeps inventory valuation behind the separate cost permission',
      async () => {
        runtime.setPermissions([
          INVENTORY_PERMISSION_KEYS.READ,
        ]);

        const response = await request(runtime.app)
          .get('/api/v1/inventory/monitoring/valuation')
          .set('Authorization', 'Bearer inventory-test-token');

        expect(response.status).toBe(403);
        expect(runtime.listValuation).not.toHaveBeenCalled();
      },
    );
  },
);
