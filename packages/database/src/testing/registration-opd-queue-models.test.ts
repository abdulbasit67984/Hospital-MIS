import {
  randomUUID,
} from 'node:crypto';

import {
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  OpdClinicModel,
  OpdVisitModel,
  QueueDefinitionModel,
  QueueStatusHistoryModel,
  QueueTokenModel,
  RegistrationModel,
  ServiceCounterModel,
  ServicePointModel,
  collectionSpecs,
  registrationQueueSchemas,
  schemaForCollection,
} from '../index.js';

import {
  registrationOpdQueueFoundation,
  registrationQueueCollections,
  registrationQueueValidators,
} from '../migrations/011-registration-opd-queue-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function indexNames(
  indexes:
    ReturnType<
      typeof QueueTokenModel.schema.indexes
    >,
): string[] {
  return indexes
    .map(
      ([, options]) =>
        options.name,
    )
    .filter(
      (name): name is string =>
        typeof name === 'string',
    );
}

function baseActorFields(
  actorId: ObjectId,
) {
  return {
    createdBy:
      actorId,

    updatedBy:
      actorId,
  };
}

describe(
  'Phase 5 registration and OPD queue persistence foundation',
  () => {
    it(
      'catalogs every registration and queue collection as facility scoped',
      () => {
        const byName =
          new Map(
            collectionSpecs.map(
              (spec) => [
                spec.name,
                spec,
              ],
            ),
          );

        for (
          const collection of
          registrationQueueCollections
        ) {
          expect(
            byName.get(
              collection,
            )?.domain,
          ).toBe(
            'patient',
          );

          expect(
            byName.get(
              collection,
            )?.facilityScoped,
          ).toBe(
            true,
          );
        }

        expect(
          byName.get(
            'queueStatusHistories',
          )?.retention,
        ).toBe(
          'immutable',
        );
      },
    );

    it(
      'registers every dedicated schema before generic fallbacks',
      () => {
        expect(
          registrationQueueSchemas
            .opdClinics,
        ).toBe(
          OpdClinicModel.schema,
        );

        expect(
          registrationQueueSchemas
            .servicePoints,
        ).toBe(
          ServicePointModel.schema,
        );

        expect(
          registrationQueueSchemas
            .serviceCounters,
        ).toBe(
          ServiceCounterModel.schema,
        );

        expect(
          registrationQueueSchemas
            .registrations,
        ).toBe(
          RegistrationModel.schema,
        );

        expect(
          registrationQueueSchemas
            .opdVisits,
        ).toBe(
          OpdVisitModel.schema,
        );

        expect(
          registrationQueueSchemas
            .queueDefinitions,
        ).toBe(
          QueueDefinitionModel.schema,
        );

        expect(
          registrationQueueSchemas
            .queueTokens,
        ).toBe(
          QueueTokenModel.schema,
        );

        expect(
          registrationQueueSchemas
            .queueStatusHistories,
        ).toBe(
          QueueStatusHistoryModel.schema,
        );

        for (
          const collection of
          registrationQueueCollections
        ) {
          expect(
            schemaForCollection(
              collection,
            ),
          ).toBe(
            registrationQueueSchemas[
              collection
            ],
          );
        }
      },
    );

    it(
      'defines concurrency and duplicate-prevention indexes',
      () => {
        expect(
          indexNames(
            RegistrationModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_registrations_facility_number',
        );

        expect(
          indexNames(
            OpdVisitModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_opd_visits_facility_active_key',
        );

        expect(
          indexNames(
            QueueTokenModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_queue_tokens_facility_date_queue_number',
        );

        expect(
          indexNames(
            QueueTokenModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_queue_tokens_facility_active_visit',
        );

        expect(
          indexNames(
            QueueStatusHistoryModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_queue_status_histories_token_sequence',
        );
      },
    );

    it(
      'derives active visit and queue-entry keys from canonical patient workflows',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const registrationId =
          new ObjectId();

        const departmentId =
          new ObjectId();

        const queueDefinitionId =
          new ObjectId();

        const visit =
          new OpdVisitModel({
            facilityId,
            visitNumber:
              'VIS-2026-000001',
            registrationId,
            patientId,
            requestedPatientId:
              patientId,
            canonicalRedirected:
              false,
            serviceDate:
              '2026-07-18',
            visitType:
              'RETURNING_PATIENT',
            registrationSource:
              'WALK_IN',
            status:
              'QUEUED',
            departmentId,
            arrivedAt:
              new Date(
                '2026-07-18T04:00:00.000Z',
              ),
            checkedInAt:
              new Date(
                '2026-07-18T04:01:00.000Z',
              ),
            queuedAt:
              new Date(
                '2026-07-18T04:02:00.000Z',
              ),
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...baseActorFields(
              actorId,
            ),
          });

        await visit.validate();

        expect(
          visit.get(
            'activeVisitKey',
          ),
        ).toContain(
          patientId.toHexString(),
        );

        const token =
          new QueueTokenModel({
            facilityId,
            registrationId,
            opdVisitId:
              visit._id,
            patientId,
            queueDefinitionId,
            serviceDate:
              '2026-07-18',
            tokenNumber:
              1,
            tokenPrefix:
              'A',
            tokenLabel:
              'A1',
            status:
              'WAITING',
            priorityClass:
              'ROUTINE',
            priorityScore:
              0,
            triagePriority:
              'NOT_TRIAGED',
            emergencyOverride:
              false,
            specialCategories:
              [],
            queuedAt:
              new Date(
                '2026-07-18T04:02:00.000Z',
              ),
            lastStatusChangedAt:
              new Date(
                '2026-07-18T04:02:00.000Z',
              ),
            lastStatusChangedBy:
              actorId,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...baseActorFields(
              actorId,
            ),
          });

        await token.validate();

        expect(
          token.get(
            'activeEntryKey',
          ),
        ).toBe(
          visit._id.toHexString(),
        );
      },
    );

    it(
      'rejects non-canonical registration metadata and undocumented emergency override',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const canonicalPatientId =
          new ObjectId();

        const mergedPatientId =
          new ObjectId();

        const registration =
          new RegistrationModel({
            facilityId,
            registrationNumber:
              'REG-2026-000001',
            patientId:
              canonicalPatientId,
            requestedPatientId:
              mergedPatientId,
            canonicalRedirected:
              false,
            registrationMode:
              'RETURNING_PATIENT',
            registrationSource:
              'WALK_IN',
            visitType:
              'RETURNING_PATIENT',
            status:
              'ACTIVE',
            serviceDate:
              '2026-07-18',
            arrivedAt:
              new Date(
                '2026-07-18T04:00:00.000Z',
              ),
            departmentId:
              new ObjectId(),
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...baseActorFields(
              actorId,
            ),
          });

        await expect(
          registration.validate(),
        ).rejects.toMatchObject({
          name:
            'ValidationError',
        });

        const token =
          new QueueTokenModel({
            facilityId,
            registrationId:
              new ObjectId(),
            opdVisitId:
              new ObjectId(),
            patientId:
              canonicalPatientId,
            queueDefinitionId:
              new ObjectId(),
            serviceDate:
              '2026-07-18',
            tokenNumber:
              2,
            tokenPrefix:
              'E',
            tokenLabel:
              'E2',
            status:
              'WAITING',
            priorityClass:
              'EMERGENCY',
            priorityScore:
              100_000,
            triagePriority:
              'LEVEL_1_RESUSCITATION',
            emergencyOverride:
              true,
            specialCategories:
              [],
            queuedAt:
              new Date(
                '2026-07-18T04:00:00.000Z',
              ),
            lastStatusChangedAt:
              new Date(
                '2026-07-18T04:00:00.000Z',
              ),
            lastStatusChangedBy:
              actorId,
            transactionId:
              randomUUID(),
            correlationId:
              randomUUID(),
            ...baseActorFields(
              actorId,
            ),
          });

        await expect(
          token.validate(),
        ).rejects.toMatchObject({
          name:
            'ValidationError',
        });
      },
    );

    it(
      'keeps public queue persistence free of patient names and identity numbers',
      () => {
        const queuePaths =
          Object.keys(
            QueueTokenModel
              .schema
              .paths,
          );

        expect(
          queuePaths,
        ).not.toEqual(
          expect.arrayContaining([
            'patientName',
            'displayName',
            'mrn',
            'cnic',
            'bForm',
            'phone',
          ]),
        );
      },
    );

    it(
      'registers migration 011 with strict validators',
      () => {
        expect(
          migrations.at(-1),
        ).toBe(
          registrationOpdQueueFoundation,
        );

        expect(
          registrationOpdQueueFoundation
            .id,
        ).toBe(
          '011-registration-opd-queue-foundation',
        );

        for (
          const collection of
          registrationQueueCollections
        ) {
          expect(
            registrationQueueValidators[
              collection
            ],
          ).toHaveProperty(
            '$jsonSchema.bsonType',
            'object',
          );
        }
      },
    );
  },
);