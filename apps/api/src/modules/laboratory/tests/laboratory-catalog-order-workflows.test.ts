import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  LaboratoryTransactionRequest,
} from '../laboratory.ports.js';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryOrderRecord,
  LaboratoryTestCategoryRecord,
  LaboratoryTestRecord,
} from '../laboratory.persistence.types.js';

import type {
  LaboratoryActorContext,
  LaboratoryClinicalContext,
} from '../laboratory.types.js';

import {
  LaboratoryTestNotOrderableError,
} from '../laboratory.errors.js';

import {
  normalizeLaboratoryCode,
  normalizeLaboratoryText,
} from '../laboratory.normalization.js';

import {
  LaboratoryCommandService,
} from '../services/laboratory-command.service.js';

import {
  LaboratoryAccessPolicyService,
  type LaboratoryActorIdentityReader,
} from '../services/laboratory-access-policy.service.js';

import type {
  LaboratoryActorIdentityRecord,
} from '../repositories/laboratory-context.repository.js';

import {
  CreateLaboratoryOrderWorkflow,
} from '../workflows/create-laboratory-order.workflow.js';

function actor(
  facilityId: string,
): LaboratoryActorContext {
  return {
    userId:
      new Types.ObjectId()
        .toHexString(),

    facilityId,

    correlationId:
      'correlation-id',

    roleKeys: [
      'LABORATORY_STAFF',
    ],

    permissionKeys: [
      'laboratory.catalog.manage',
      'laboratory.orders.create',
      'laboratory.orders.read',
    ],
  };
}

function categoryRecord(
  facilityId:
    Types.ObjectId,
): LaboratoryTestCategoryRecord {
  const now =
    new Date(
      '2026-07-19T08:00:00.000Z',
    );

  const userId =
    new Types.ObjectId();

  return {
    _id:
      new Types.ObjectId(),

    facilityId,

    categoryCode:
      'HEMATOLOGY',

    name:
      'Hematology',

    normalizedName:
      'hematology',

    description:
      null,

    displayOrder:
      1,

    status:
      'ACTIVE',

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      userId,

    updatedBy:
      userId,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function testRecord(
  facilityId:
    Types.ObjectId,

  category:
    LaboratoryTestCategoryRecord,

  chargeCatalogItemId:
    Types.ObjectId |
    null =
      new Types.ObjectId(),
): LaboratoryTestRecord {
  const now =
    new Date(
      '2026-07-19T08:00:00.000Z',
    );

  const userId =
    new Types.ObjectId();

  return {
    _id:
      new Types.ObjectId(),

    facilityId,

    testCode:
      'CBC',

    name:
      'Complete Blood Count',

    normalizedName:
      'complete blood count',

    aliases: [
      'CBC',
    ],

    normalizedAliases: [
      'cbc',
    ],

    categoryId:
      category._id,

    categoryCodeSnapshot:
      category.categoryCode,

    categoryNameSnapshot:
      category.name,

    description:
      null,

    methodCode:
      'AUTO_CELL_COUNT',

    methodName:
      'Automated cell counting',

    requiresSpecimen:
      true,

    specimenRequirements: [
      {
        requirementCode:
          'EDTA_BLOOD',

        specimenTypeCode:
          'WHOLE_BLOOD',

        specimenTypeName:
          'Whole blood',

        containerCode:
          'EDTA_PURPLE',

        containerName:
          'EDTA purple-top tube',

        minimumVolume:
          Types.Decimal128.fromString(
            '2',
          ),

        volumeUnitCode:
          'ML',

        fastingRequired:
          false,

        collectionInstructions:
          null,

        handlingInstructions:
          null,

        maximumTransportMinutes:
          120,

        preferred:
          true,
      },
    ],

    components: [
      {
        componentCode:
          'HGB',

        name:
          'Hemoglobin',

        normalizedName:
          'hemoglobin',

        valueType:
          'NUMERIC',

        unitCode:
          'G_DL',

        unitName:
          'g/dL',

        decimalScale:
          1,

        referenceRanges:
          [],

        required:
          true,

        displayOrder:
          1,

        structuredSchemaKey:
          null,
      },
    ],

    routineTurnaroundMinutes:
      240,

    urgentTurnaroundMinutes:
      90,

    statTurnaroundMinutes:
      45,

    availableDepartmentIds:
      [],

    orderable:
      true,

    requiresResultValidation:
      true,

    requiresResultVerification:
      true,

    criticalNotificationRequired:
      true,

    chargeCatalogItemId,

    effectiveFrom:
      new Date(
        '2026-01-01T00:00:00.000Z',
      ),

    effectiveThrough:
      null,

    status:
      'ACTIVE',

    deactivatedAt:
      null,

    deactivatedBy:
      null,

    deactivationReason:
      null,

    transactionId:
      'catalog-transaction',

    correlationId:
      'catalog-correlation',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      userId,

    updatedBy:
      userId,

    createdAt:
      now,

    updatedAt:
      now,
  };
}

function clinicalContext(
  facilityId: string,
): LaboratoryClinicalContext {
  const providerId =
    new Types.ObjectId()
      .toHexString();

  return {
    encounterId:
      new Types.ObjectId()
        .toHexString(),

    facilityId,

    patientId:
      new Types.ObjectId()
        .toHexString(),

    requestedPatientId:
      new Types.ObjectId()
        .toHexString(),

    canonicalRedirected:
      false,

    confidentiality:
      'STANDARD',

    registrationId:
      new Types.ObjectId()
        .toHexString(),

    opdVisitId:
      new Types.ObjectId()
        .toHexString(),

    queueTokenId:
      null,

    departmentId:
      new Types.ObjectId()
        .toHexString(),

    clinicId:
      new Types.ObjectId()
        .toHexString(),

    servicePointId:
      new Types.ObjectId()
        .toHexString(),

    orderingProviderId:
      providerId,

    assignedProviderIds: [
      providerId,
    ],
  };
}

function transactionManager(
  observations: {
    journalPayloads:
      Record<
        string,
        unknown
      >[];

    compensations:
      unknown[];

    checkpoints:
      string[];
  },
) {
  return {
    async execute<T>(
      request:
        LaboratoryTransactionRequest<T>,
    ): Promise<T> {
      observations
        .journalPayloads
        .push(
          request.journalPayload,
        );

      return request.execute({
        transactionId:
          'laboratory-transaction-id',

        idempotencyKey:
          request.idempotencyKey,

        async checkpoint(
          state,
        ) {
          observations
            .checkpoints
            .push(
              state,
            );
        },

        async registerCompensation(
          compensation,
        ) {
          observations
            .compensations
            .push(
              compensation,
            );
        },
      });
    },
  };
}

class IdentityReader
implements LaboratoryActorIdentityReader {
  public constructor(
    private readonly identity:
      LaboratoryActorIdentityRecord,
  ) {}

  public async findActorIdentity():
    Promise<
      LaboratoryActorIdentityRecord
    > {
    return this.identity;
  }
}

describe(
  'Laboratory catalog and order workflow foundation',
  () => {
    it(
      'creates a standardized encounter-linked order with safe journaling and billing requests',
      async () => {
        const facilityObjectId =
          new Types.ObjectId();

        const facilityId =
          facilityObjectId
            .toHexString();

        const context =
          clinicalContext(
            facilityId,
          );

        const category =
          categoryRecord(
            facilityObjectId,
          );

        const test =
          testRecord(
            facilityObjectId,
            category,
          );

        const observations = {
          journalPayloads:
            [] as Record<
              string,
              unknown
            >[],

          compensations:
            [] as unknown[],

          checkpoints:
            [] as string[],
        };

        const auditEntries:
          unknown[] =
            [];

        const outboxMessages:
          unknown[] =
            [];

        const realtimeMessages:
          unknown[] =
            [];

        const chargeRequests:
          unknown[] =
            [];

        let persistedItems:
          LaboratoryOrderItemRecord[] =
            [];

        const now =
          new Date(
            '2026-07-19T09:00:00.000Z',
          );

        const support = {
          dependencies: {
            transactionManager:
              transactionManager(
                observations,
              ),

            clock: {
              now:
                () =>
                  now,
            },

            sequence: {
              async next() {
                return {
                  key:
                    'laboratory.order.number:2026',

                  value:
                    17,
                };
              },
            },

            audit: {
              async append(
                entry:
                  unknown,
              ) {
                auditEntries.push(
                  entry,
                );
              },
            },

            outbox: {
              async enqueue(
                message:
                  unknown,
              ) {
                outboxMessages.push(
                  message,
                );
              },
            },

            realtime: {
              async publish(
                message:
                  unknown,
              ) {
                realtimeMessages.push(
                  message,
                );
              },
            },
          },

          async resolveOrderClinicalContext() {
            return context;
          },

          async resolveOrderableTests() {
            return [
              test,
            ];
          },

          orders: {
            async create(
              orderInput:
                Record<
                  string,
                  unknown
                >,

              itemInputs:
                Record<
                  string,
                  unknown
                >[],
            ) {
              const orderId =
                new Types.ObjectId();

              const order = {
                ...orderInput,

                _id:
                  orderId,

                createdAt:
                  now,

                updatedAt:
                  now,
              } as unknown as LaboratoryOrderRecord;

              const items =
                itemInputs.map(
                  (
                    itemInput,
                  ) => ({
                    ...itemInput,

                    _id:
                      new Types.ObjectId(),

                    labOrderId:
                      orderId,

                    createdAt:
                      now,

                    updatedAt:
                      now,
                  }),
                ) as unknown as LaboratoryOrderItemRecord[];

              persistedItems =
                items;

              return {
                order,
                items,
              };
            },

            async listItems() {
              return persistedItems;
            },

            async appendHistory(
              input:
                Record<
                  string,
                  unknown
                >,
            ) {
              return {
                ...input,

                _id:
                  new Types.ObjectId(),

                createdAt:
                  now,

                updatedAt:
                  now,
              };
            },
          },

          testDefinitionHash() {
            return 'e'.repeat(
              64,
            );
          },

          async requestOrderCharges(
            _actor:
              unknown,

            transaction: {
              checkpoint(
                state:
                  string,
              ): Promise<void>;
            },

            order:
              LaboratoryOrderRecord,

            items:
              Array<{
                orderItemId:
                  string;

                chargeCatalogItemId:
                  string | null;
              }>,
          ) {
            for (
              const item of
              items
            ) {
              if (
                item.chargeCatalogItemId !==
                null
              ) {
                chargeRequests.push({
                  laboratoryOrderId:
                    order
                      ._id
                      .toHexString(),

                  laboratoryOrderItemId:
                    item.orderItemId,

                  chargeCatalogItemId:
                    item.chargeCatalogItemId,
                });
              }
            }

            await transaction.checkpoint(
              'BILLING_REQUESTED',
            );
          },

          deduplicationKey(
            transactionId:
              string,

            action:
              string,

            entityId:
              string,
          ) {
            return `${transactionId}:${action}:${entityId}`;
          },

          auditActorFields(
            commandActor:
              LaboratoryActorContext,
          ) {
            return {
              actorUserId:
                commandActor.userId,

              facilityId:
                commandActor.facilityId,

              correlationId:
                commandActor.correlationId,
            };
          },

          async publishOrderRealtime(
            _actor:
              LaboratoryActorContext,

            order:
              LaboratoryOrderRecord,

            eventType:
              string,
          ) {
            realtimeMessages.push({
              eventType,

              orderId:
                order
                  ._id
                  .toHexString(),
            });
          },
        } as unknown as LaboratoryCommandService;

        const workflow =
          new CreateLaboratoryOrderWorkflow(
            support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(
                facilityId,
              ),

            input: {
              encounterId:
                context.encounterId,

              priority:
                'STAT',

              clinicalIndication:
                'Fictional suspected anemia',

              orderingNotes:
                'Sensitive fictional ordering note',

              testIds: [
                test
                  ._id
                  .toHexString(),
              ],
            },

            idempotencyKey:
              'laboratory-order-create-0001',
          });

        expect(
          result.order.orderNumber,
        ).toBe(
          'LAB-2026-0000017',
        );

        expect(
          result.items,
        ).toHaveLength(
          1,
        );

        expect(
          result
            .items[0]
            ?.dueAt
            .toISOString(),
        ).toBe(
          '2026-07-19T09:45:00.000Z',
        );

        expect(
          chargeRequests,
        ).toHaveLength(
          1,
        );

        expect(
          auditEntries,
        ).toHaveLength(
          1,
        );

        expect(
          outboxMessages,
        ).toHaveLength(
          1,
        );

        expect(
          realtimeMessages,
        ).toHaveLength(
          2,
        );

        expect(
          observations
            .compensations
            .length,
        ).toBeGreaterThanOrEqual(
          3,
        );

        const journal =
          JSON.stringify(
            observations.journalPayloads,
          );

        expect(
          journal,
        ).not.toContain(
          'suspected anemia',
        );

        expect(
          journal,
        ).not.toContain(
          'Sensitive fictional ordering note',
        );
      },
    );

    it(
      'rejects inactive or unavailable standardized tests before persistence',
      async () => {
        const facilityObjectId =
          new Types.ObjectId();

        const facilityId =
          facilityObjectId
            .toHexString();

        const category =
          categoryRecord(
            facilityObjectId,
          );

        const test =
          testRecord(
            facilityObjectId,
            category,
          );

        test.orderable =
          false;

        const service =
          new LaboratoryCommandService(
            {
              async findTestsByIds() {
                return [
                  test,
                ];
              },

              async findCategoryById() {
                return category;
              },
            } as never,

            {} as never,

            {} as never,

            {} as never,

            {} as never,
          );

        await expect(
          service.resolveOrderableTests(
            actor(
              facilityId,
            ),

            clinicalContext(
              facilityId,
            ),

            [
              test
                ._id
                .toHexString(),
            ],

            new Date(
              '2026-07-19T09:00:00.000Z',
            ),
          ),
        ).rejects.toBeInstanceOf(
          LaboratoryTestNotOrderableError,
        );
      },
    );

    it(
      'normalizes catalog identity and authorizes Laboratory operational reads centrally',
      async () => {
        expect(
          normalizeLaboratoryCode(
            ' hematology section ',
          ),
        ).toBe(
          'HEMATOLOGY_SECTION',
        );

        expect(
          normalizeLaboratoryText(
            '  Complete   Blood Count ',
          ),
        ).toBe(
          'complete blood count',
        );

        const facilityId =
          new Types.ObjectId()
            .toHexString();

        const userId =
          new Types.ObjectId()
            .toHexString();

        const staffId =
          new Types.ObjectId()
            .toHexString();

        const policy =
          new LaboratoryAccessPolicyService(
            new IdentityReader({
              userId,

              facilityId,

              staffId,

              status:
                'ACTIVE',
            }),
          );

        const decision =
          await policy.authorize({
            actor: {
              userId,

              facilityId,

              correlationId:
                'correlation-id',

              roleKeys: [
                'LABORATORY_STAFF',
              ],

              permissionKeys: [
                'laboratory.orders.read',
              ],
            },

            action:
              'ORDER_READ',
          });

        expect(
          decision.allowed,
        ).toBe(
          true,
        );

        expect(
          decision.accessMode,
        ).toBe(
          'LABORATORY_OPERATIONAL',
        );

        expect(
          decision.auditSensitiveRead,
        ).toBe(
          true,
        );
      },
    );
  },
);