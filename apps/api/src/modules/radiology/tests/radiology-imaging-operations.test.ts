import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  RadiologyAppointmentModel,
  RadiologyImagingSeriesModel,
  RadiologyImagingStudyModel,
  RadiologyResourceModel,
  RadiologyResourceReservationModel,
  RadiologySafetyScreeningModel,
  collectionSpecs,
  radiologyImagingOperationCollections,
  radiologyImagingOperations,
  radiologyImagingOperationValidators,
  schemaForCollection,
} from '@hospital-mis/database';

import {
  completeRadiologyExaminationBodySchema,
  recordRadiologySafetyScreeningBodySchema,
  registerRadiologyImagingStudyBodySchema,
  scheduleRadiologyAppointmentBodySchema,
} from '../radiology-operations.validation.js';

import {
  RADIOLOGY_COMPENSATABLE_COLLECTIONS,
} from '../radiology.transaction.constants.js';

import type {
  RadiologyOperationsRepositoryPort,
} from '../radiology-operations.ports.js';

import type {
  RadiologyCommandService,
} from '../services/radiology-command.service.js';

import {
  RadiologyImagingOperationsService,
} from '../services/radiology-imaging-operations.service.js';

function id(): Types.ObjectId {
  return new Types.ObjectId();
}

function commonFields() {
  const actorId = id();

  return {
    facilityId: id(),
    transactionId:
      'tx-radiology-operations-test',
    correlationId:
      'corr-radiology-operations-test',
    schemaVersion: 1,
    version: 0,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function indexNames(
  indexes: Array<
    [
      Record<string, number>,
      Record<string, unknown>,
    ]
  >,
): string[] {
  return indexes.flatMap(
    ([, options]) =>
      typeof options['name'] ===
      'string'
        ? [options['name']]
        : [],
  );
}

describe(
  'Radiology imaging operations database foundation',
  () => {
    it(
      'registers every operational collection as facility-scoped Radiology data',
      () => {
        expect(
          radiologyImagingOperations.id,
        ).toBe(
          '018-radiology-imaging-operations',
        );

        for (
          const name of
          radiologyImagingOperationCollections
        ) {
          expect(
            collectionSpecs.find(
              (candidate) =>
                candidate.name === name,
            ),
          ).toMatchObject({
            domain: 'radiology',
            facilityScoped: true,
            retention: 'standard',
          });

          expect(
            schemaForCollection(name)
              .options.collection,
          ).toBe(name);

          expect(
            radiologyImagingOperationValidators[
              name
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );

          expect(
            RADIOLOGY_COMPENSATABLE_COLLECTIONS,
          ).toContain(name);
        }
      },
    );

    it(
      'defines conflict-oriented resource, appointment, and reservation indexes',
      () => {
        expect(
          indexNames(
            RadiologyResourceModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_radiology_resources_facility_code',
            'ix_radiology_resources_availability',
          ]),
        );

        expect(
          indexNames(
            RadiologyAppointmentModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toContain(
          'uq_radiology_appointments_order_item',
        );

        expect(
          indexNames(
            RadiologyResourceReservationModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toEqual(
          expect.arrayContaining([
            'ix_radiology_reservations_resource_overlap',
            'ix_radiology_reservations_staff_overlap',
          ]),
        );
      },
    );

    it(
      'validates appointment intervals and exactly one reservation subject',
      async () => {
        const fields =
          commonFields();

        const startAt =
          new Date(
            '2026-07-20T08:00:00.000Z',
          );

        const appointment =
          new RadiologyAppointmentModel({
            ...fields,

            radiologyOrderId:
              id(),

            radiologyOrderItemId:
              id(),

            patientId:
              id(),

            encounterId:
              id(),

            procedureId:
              id(),

            modalityId:
              id(),

            departmentId:
              id(),

            scheduledStartAt:
              startAt,

            scheduledEndAt:
              startAt,

            timezone:
              'Asia/Karachi',

            roomResourceId:
              null,

            equipmentResourceIds:
              [],

            technicianStaffIds:
              [id()],

            preparationStatus:
              'PENDING',

            safetyScreeningStatus:
              'PENDING',

            status:
              'SCHEDULED',

            scheduledByStaffId:
              id(),

            scheduledAt:
              new Date(),
          });

        await expect(
          appointment.validate(),
        ).rejects.toThrow(
          'Radiology appointment end time must be after its start time',
        );

        const reservation =
          new RadiologyResourceReservationModel(
            {
              ...fields,

              appointmentId:
                id(),

              radiologyOrderItemId:
                id(),

              subjectType:
                'RESOURCE',

              resourceId:
                id(),

              staffId:
                id(),

              reservedStartAt:
                startAt,

              reservedEndAt:
                new Date(
                  startAt.getTime() +
                    30 * 60_000,
                ),

              status:
                'ACTIVE',
            },
          );

        await expect(
          reservation.validate(),
        ).rejects.toThrow(
          'Resource reservations require only a resource identifier',
        );
      },
    );

    it(
      'keeps detailed safety data and external viewing references out of default projections',
      () => {
        expect(
          RadiologySafetyScreeningModel.schema.path(
            'responses',
          ).options.select,
        ).toBe(false);

        expect(
          RadiologySafetyScreeningModel.schema.path(
            'pregnancyStatus',
          ).options.select,
        ).toBe(false);

        expect(
          RadiologySafetyScreeningModel.schema.path(
            'estimatedGfr',
          ).options.select,
        ).toBe(false);

        expect(
          RadiologyImagingSeriesModel.schema.path(
            'storageReference',
          ).options.select,
        ).toBe(false);

        const externalReferenceSchema =
          RadiologyImagingStudyModel.schema.path(
            'externalReferences',
          ) as unknown as {
            schema: {
              path(
                name: string,
              ): {
                options: {
                  select?: boolean;
                };
              };
            };
          };

        expect(
          externalReferenceSchema.schema.path(
            'viewerReference',
          ).options.select,
        ).toBe(false);
      },
    );
  },
);

describe(
  'Radiology imaging operations validation',
  () => {
    it(
      'rejects duplicate allocations and invalid schedule windows',
      () => {
        const equipmentId =
          id().toHexString();

        const result =
          scheduleRadiologyAppointmentBodySchema.safeParse(
            {
              orderItemId:
                id().toHexString(),

              expectedOrderItemVersion:
                0,

              scheduledStartAt:
                '2026-07-20T10:00:00.000+05:00',

              scheduledEndAt:
                '2026-07-20T09:00:00.000+05:00',

              equipmentResourceIds: [
                equipmentId,
                equipmentId,
              ],

              technicianStaffIds:
                [],
            },
          );

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'requires complete screening evidence before clearance',
      () => {
        const result =
          recordRadiologySafetyScreeningBodySchema.safeParse(
            {
              orderItemId:
                id().toHexString(),

              expectedOrderItemVersion:
                0,

              responses:
                [],

              pregnancyStatus:
                'UNKNOWN',

              contrastAllergyStatus:
                'NO',

              renalRiskStatus:
                'NO',

              implantDeviceStatus:
                'NO',

              status:
                'CLEARED',

              preparationStatus:
                'CONFIRMED',

              conditions:
                [],
            },
          );

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'requires Inventory-boundary details for contrast administration',
      () => {
        const result =
          completeRadiologyExaminationBodySchema.safeParse(
            {
              orderItemId:
                id().toHexString(),

              expectedOrderItemVersion:
                2,

              expectedExaminationVersion:
                1,

              technicianStaffIds: [
                id().toHexString(),
              ],

              contrastAdministered:
                true,

              technicianNotes:
                'Fictional technician note',
            },
          );

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'rejects image binaries and accepts metadata-only DICOM references',
      () => {
        const study = {
          orderItemId:
            id().toHexString(),

          expectedOrderItemVersion:
            3,

          expectedExaminationVersion:
            2,

          studyInstanceUid:
            '1.2.840.113619.2.55.3.604688435.123.1',

          studyDateTime:
            '2026-07-20T10:30:00.000+05:00',

          status:
            'AVAILABLE',

          externalReferences: [
            {
              systemType:
                'PACS',

              systemName:
                'Fictional PACS',

              endpointAlias:
                'PRIMARY_PACS',

              externalStudyId:
                'PACS-STUDY-001',

              viewerReference:
                'viewer-reference-token',
            },
          ],

          series: [
            {
              seriesInstanceUid:
                '1.2.840.113619.2.55.3.604688435.123.1.1',

              seriesNumber:
                1,

              modalityCode:
                'CT',

              bodyRegionCode:
                'CHEST',

              laterality:
                'NOT_APPLICABLE',

              instanceCount:
                120,

              externalSeriesId:
                'PACS-SERIES-001',

              storageReference:
                'dicomweb-series-reference',
            },
          ],
        };

        expect(
          registerRadiologyImagingStudyBodySchema.safeParse(
            study,
          ).success,
        ).toBe(true);

        expect(
          registerRadiologyImagingStudyBodySchema.safeParse(
            {
              ...study,

              imageBinary:
                Buffer.from(
                  'not-permitted',
                ),
            },
          ).success,
        ).toBe(false);
      },
    );
  },
);

describe(
  'Radiology imaging operations workflows',
  () => {
    it(
      'stops scheduling before mutation when any room, equipment, or technician reservation overlaps',
      async () => {
        const facilityId =
          id();

        const departmentId =
          id();

        const modalityId =
          id();

        const orderId =
          id();

        const orderItemId =
          id();

        const roomId =
          id();

        const technicianId =
          id();

        let transactionExecuted =
          false;

        const support = {
          requireOrderItem:
            async () => ({
              _id:
                orderItemId,

              facilityId,

              radiologyOrderId:
                orderId,

              radiologyProcedureId:
                id(),

              patientId:
                id(),

              encounterId:
                id(),

              procedureDefinitionSnapshot:
                {
                  modalityId,

                  requiresTechnician:
                    true,
                },

              status:
                'ACCEPTED',

              version:
                0,
            }),

          requireOrder:
            async () => ({
              _id:
                orderId,

              facilityId,

              departmentId,

              status:
                'ACCEPTED',

              version:
                0,
            }),

          assertAccess:
            async () =>
              undefined,

          assertExpectedVersion:
            () =>
              undefined,

          dependencies: {
            clock: {
              now: () =>
                new Date(
                  '2026-07-19T08:00:00.000Z',
                ),
            },

            transactionManager: {
              execute:
                async () => {
                  transactionExecuted =
                    true;

                  throw new Error(
                    'Transaction must not execute',
                  );
                },
            },
          },
        } as unknown as RadiologyCommandService;

        const operations = {
          findAppointmentByOrderItem:
            async () =>
              null,

          findResourcesByIds:
            async () => [
              {
                _id:
                  roomId,

                facilityId,

                resourceType:
                  'ROOM',

                departmentId,

                modalityIds: [
                  modalityId,
                ],

                status:
                  'ACTIVE',

                effectiveFrom:
                  new Date(
                    '2026-01-01T00:00:00.000Z',
                  ),

                effectiveThrough:
                  null,
              },
            ],

          findEligibleTechnicians:
            async () => [
              technicianId.toHexString(),
            ],

          findSchedulingConflicts:
            async () => [
              {
                reservationId:
                  id().toHexString(),

                appointmentId:
                  id().toHexString(),

                subjectType:
                  'RESOURCE',

                resourceId:
                  roomId.toHexString(),

                staffId:
                  null,

                reservedStartAt:
                  new Date(
                    '2026-07-20T05:00:00.000Z',
                  ),

                reservedEndAt:
                  new Date(
                    '2026-07-20T06:00:00.000Z',
                  ),
              },
            ],
        } as unknown as RadiologyOperationsRepositoryPort;

        const service =
          new RadiologyImagingOperationsService(
            support,
            operations,
            {
              verifyExternalStudy:
                async () => {
                  throw new Error(
                    'unused',
                  );
                },
            },
            {
              recordContrastUsage:
                async () => {
                  throw new Error(
                    'unused',
                  );
                },
            },
          );

        await expect(
          service.scheduleAppointment(
            {
              actor: {
                facilityId:
                  facilityId.toHexString(),

                userId:
                  id().toHexString(),

                correlationId:
                  'corr-conflict-test',

                roleKeys: [
                  'RADIOLOGY_STAFF',
                ],

                permissionKeys: [
                  'radiology.schedules.manage',
                ],
              },

              idempotencyKey:
                'radiology-schedule-conflict-test',

              input: {
                orderItemId:
                  orderItemId.toHexString(),

                expectedOrderItemVersion:
                  0,

                scheduledStartAt:
                  '2026-07-20T10:00:00.000+05:00',

                scheduledEndAt:
                  '2026-07-20T11:00:00.000+05:00',

                roomResourceId:
                  roomId.toHexString(),

                equipmentResourceIds:
                  [],

                technicianStaffIds: [
                  technicianId.toHexString(),
                ],
              },
            },
          ),
        ).rejects.toThrow(
          'The requested Radiology room, equipment, or technician allocation conflicts with an active reservation',
        );

        expect(
          transactionExecuted,
        ).toBe(false);
      },
    );
  },
);