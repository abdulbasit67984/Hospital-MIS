import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  QueueDefinitionRecord,
  QueueTokenRecord,
} from '../registration-queue.types.js';

import {
  QueueWaitEstimateService,
} from '../services/queue-wait-estimate.service.js';

import {
  QueuePublicDisplayService,
} from '../services/queue-public-display.service.js';

const facilityId =
  '507f1f77bcf86cd799439011';

const queueDefinitionId =
  '507f191e810c19729de860e1';

const registrationId =
  '507f191e810c19729de860e2';

const visitId =
  '507f191e810c19729de860e3';

const patientId =
  '507f191e810c19729de860e4';

const actorUserId =
  '507f191e810c19729de860e5';

function objectId(
  value: string,
): Types.ObjectId {
  return new Types.ObjectId(
    value,
  );
}

function queueDefinition(
  publicDisplayMode:
    QueueDefinitionRecord['publicDisplayMode'] =
      'TOKEN_AND_COUNTER',
): QueueDefinitionRecord {
  return {
    _id:
      objectId(
        queueDefinitionId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    departmentId:
      objectId(
        '507f191e810c19729de860e6',
      ),

    clinicId:
      null,

    servicePointId:
      null,

    providerId:
      null,

    code:
      'MED_OPD',

    name:
      'Medicine OPD',

    displayLabel:
      'Medicine',

    tokenPrefix:
      'A',

    resetPolicy:
      'SERVICE_DATE',

    timezone:
      'Asia/Karachi',

    estimatedServiceMinutes:
      15,

    maximumRecallCount:
      2,

    allowPriority:
      true,

    allowEmergencyOverride:
      true,

    publicDisplayEnabled:
      true,

    publicDisplayMode,

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
      objectId(
        actorUserId,
      ),

    updatedBy:
      objectId(
        actorUserId,
      ),

    createdAt:
      new Date(
        '2026-07-18T00:00:00.000Z',
      ),

    updatedAt:
      new Date(
        '2026-07-18T00:00:00.000Z',
      ),
  };
}

function queueToken(
  input: Readonly<{
    queueTokenId: string;
    queueEntryId: string;
    tokenNumber: number;
    priorityScore: number;
    queuedAt: string;
    status?: QueueTokenRecord['status'];
  }>,
): QueueTokenRecord {
  const queuedAt =
    new Date(
      input.queuedAt,
    );

  return {
    _id:
      objectId(
        input.queueTokenId,
      ),

    facilityId:
      objectId(
        facilityId,
      ),

    queueEntryId:
      input.queueEntryId,

    registrationId:
      objectId(
        registrationId,
      ),

    opdVisitId:
      objectId(
        visitId,
      ),

    patientId:
      objectId(
        patientId,
      ),

    queueDefinitionId:
      objectId(
        queueDefinitionId,
      ),

    serviceDate:
      '2026-07-18',

    tokenNumber:
      input.tokenNumber,

    tokenPrefix:
      'A',

    tokenLabel:
      `A${input.tokenNumber}`,

    status:
      input.status ??
      'WAITING',

    priorityClass:
      input.priorityScore >
      0
        ? 'PRIORITY'
        : 'ROUTINE',

    priorityScore:
      input.priorityScore,

    triagePriority:
      'NOT_TRIAGED',

    emergencyOverride:
      false,

    emergencyOverrideReason:
      null,

    specialCategories:
      [],

    assignedProviderId:
      null,

    assignedCounterId:
      null,

    activeEntryKey:
      visitId,

    queuedAt,

    calledAt:
      null,

    servingAt:
      null,

    skippedAt:
      null,

    transferredAt:
      null,

    completedAt:
      null,

    cancelledAt:
      null,

    noShowAt:
      null,

    skipCount:
      0,

    recallCount:
      0,

    transferCount:
      0,

    estimatedWaitMinutes:
      null,

    estimatedServiceAt:
      null,

    transferredFromQueueTokenId:
      null,

    transferredToQueueTokenId:
      null,

    transferReason:
      null,

    statusReason:
      null,

    lastStatusChangedAt:
      queuedAt,

    lastStatusChangedBy:
      objectId(
        actorUserId,
      ),

    transactionId:
      'transaction-001',

    correlationId:
      'correlation-001',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      objectId(
        actorUserId,
      ),

    updatedBy:
      objectId(
        actorUserId,
      ),

    createdAt:
      queuedAt,

    updatedAt:
      queuedAt,
  };
}

describe(
  'registration and OPD queue Batch 7 foundation',
  () => {
    it(
      'orders priority queue entries before routine entries',
      () => {
        const routine =
          queueToken({
            queueTokenId:
              '507f191e810c19729de860e7',

            queueEntryId:
              '7cdf118f-9062-44a6-8eed-59ae31202576',

            tokenNumber:
              1,

            priorityScore:
              0,

            queuedAt:
              '2026-07-18T04:00:00.000Z',
          });

        const priority =
          queueToken({
            queueTokenId:
              '507f191e810c19729de860e8',

            queueEntryId:
              '4733eb1c-9a4a-455c-b256-9ef0cf868654',

            tokenNumber:
              2,

            priorityScore:
              1_000,

            queuedAt:
              '2026-07-18T04:05:00.000Z',
          });

        const waits =
          new QueueWaitEstimateService();

        const positions =
          waits.positionsForOrderedEntries({
            entries: [
              routine,
              priority,
            ],

            definitions:
              new Map([
                [
                  queueDefinitionId,
                  queueDefinition(),
                ],
              ]),

            now:
              new Date(
                '2026-07-18T04:10:00.000Z',
              ),
          });

        expect(
          positions.get(
            priority.queueEntryId,
          ),
        ).toMatchObject({
          position:
            1,

          patientsAhead:
            0,

          estimatedWaitMinutes:
            0,
        });

        expect(
          positions.get(
            routine.queueEntryId,
          ),
        ).toMatchObject({
          position:
            2,

          patientsAhead:
            1,

          estimatedWaitMinutes:
            15,
        });
      },
    );

    it(
      'calculates operational wait and service metrics',
      () => {
        const completed =
          queueToken({
            queueTokenId:
              '507f191e810c19729de860e9',

            queueEntryId:
              'd7320564-5e0c-4492-88e3-cfe8527fa8db',

            tokenNumber:
              1,

            priorityScore:
              0,

            queuedAt:
              '2026-07-18T04:00:00.000Z',

            status:
              'COMPLETED',
          });

        completed.servingAt =
          new Date(
            '2026-07-18T04:15:00.000Z',
          );

        completed.completedAt =
          new Date(
            '2026-07-18T04:30:00.000Z',
          );

        const waiting =
          queueToken({
            queueTokenId:
              '507f191e810c19729de860ea',

            queueEntryId:
              '7c801fd2-b326-459f-acdb-04577b80faf4',

            tokenNumber:
              2,

            priorityScore:
              0,

            queuedAt:
              '2026-07-18T04:20:00.000Z',
          });

        const metrics =
          new QueueWaitEstimateService()
            .operationalMetrics({
              serviceDate:
                '2026-07-18',

              entries: [
                completed,
                waiting,
              ],

              now:
                new Date(
                  '2026-07-18T04:40:00.000Z',
                ),
            });

        expect(
          metrics,
        ).toMatchObject({
          totalEntries:
            2,

          activeEntries:
            1,

          waitingEntries:
            1,

          completedEntries:
            1,

          averageWaitMinutes:
            15,

          averageServiceMinutes:
            15,

          longestCurrentWaitMinutes:
            20,
        });
      },
    );

    it(
      'keeps public queue display free of patient identifiers',
      async () => {
        const entry =
          queueToken({
            queueTokenId:
              '507f191e810c19729de860eb',

            queueEntryId:
              'a056f922-523e-430f-a015-3a634df38c1d',

            tokenNumber:
              9,

            priorityScore:
              0,

            queuedAt:
              '2026-07-18T04:00:00.000Z',

            status:
              'CALLED',
          });

        entry.calledAt =
          new Date(
            '2026-07-18T04:10:00.000Z',
          );

        const service =
          new QueuePublicDisplayService(
            {
              async findQueueDefinition() {
                return queueDefinition(
                  'TOKEN_ONLY',
                );
              },

              async findPublicDisplayEntries() {
                return [
                  entry,
                ];
              },

              async loadPublicCounters() {
                return new Map();
              },
            } as never,
            {
              now() {
                return new Date(
                  '2026-07-18T04:11:00.000Z',
                );
              },
            },
          );

        const result =
          await service.getDisplay(
            facilityId,
            {
              serviceDate:
                '2026-07-18',

              queueDefinitionId,

              maximumEntries:
                25,
            },
          );

        expect(
          result.entries[0],
        ).toMatchObject({
          tokenLabel:
            'A9',

          status:
            'CALLED',

          counterCode:
            null,

          counterName:
            null,
        });

        const serialized =
          JSON.stringify(
            result,
          );

        expect(
          serialized,
        ).not.toContain(
          patientId,
        );

        expect(
          serialized,
        ).not.toContain(
          registrationId,
        );

        expect(
          serialized,
        ).not.toContain(
          visitId,
        );

        expect(
          serialized.toLocaleLowerCase(
            'en-US',
          ),
        ).not.toContain(
          'patientname',
        );

        expect(
          serialized.toLocaleLowerCase(
            'en-US',
          ),
        ).not.toContain(
          'mrn',
        );

        expect(
          serialized.toLocaleLowerCase(
            'en-US',
          ),
        ).not.toContain(
          'cnic',
        );

        expect(
          serialized.toLocaleLowerCase(
            'en-US',
          ),
        ).not.toContain(
          'phone',
        );
      },
    );
  },
);