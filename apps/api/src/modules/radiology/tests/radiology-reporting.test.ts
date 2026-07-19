import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  RadiologyCriticalFindingCommunicationModel,
  RadiologyReportModel,
  RadiologyReportVersionModel,
  collectionSpecs,
  radiologyReportingCollections,
  radiologyReportingFoundation,
  radiologyReportingValidators,
  schemaForCollection,
} from '@hospital-mis/database';

import {
  changeRadiologyReportPublicationBodySchema,
  recordRadiologyCriticalCommunicationBodySchema,
  saveRadiologyReportDraftBodySchema,
  type RadiologyFinalReportSnapshot,
  type RadiologyReportRecord,
  type RadiologyReportRepositoryPort,
} from '../radiology-reporting.contracts.js';

import {
  RadiologyReportRenderer,
} from '../services/radiology-report.renderer.js';

import {
  RadiologyReportingService,
} from '../services/radiology-reporting.service.js';

import type {
  RadiologyCommandService,
} from '../services/radiology-command.service.js';

function id(): Types.ObjectId {
  return new Types.ObjectId();
}

function commonFields() {
  const actorId =
    id();

  return {
    facilityId:
      id(),

    transactionId:
      'tx-radiology-report-test',

    correlationId:
      'corr-radiology-report-test',

    schemaVersion:
      1,

    version:
      0,

    createdBy:
      actorId,

    updatedBy:
      actorId,
  };
}

function indexNames(
  indexes:
    Array<
      [
        Record<string, number>,
        Record<string, unknown>,
      ]
    >,
): string[] {
  return indexes.flatMap(
    (
      [
        ,
        options,
      ],
    ) =>
      typeof options[
        'name'
      ] ===
      'string'
        ? [
            options[
              'name'
            ],
          ]
        : [],
  );
}

describe(
  'Radiology reporting database foundation',
  () => {
    it(
      'registers report projections and immutable history collections',
      () => {
        expect(
          radiologyReportingFoundation.id,
        ).toBe(
          '019-radiology-reporting',
        );

        for (
          const name of
          radiologyReportingCollections
        ) {
          const expectedRetention =
            name ===
            'radiologyReports'
              ? 'standard'
              : 'immutable';

          expect(
            collectionSpecs.find(
              (
                candidate,
              ) =>
                candidate.name ===
                name,
            ),
          ).toMatchObject({
            domain:
              'radiology',

            facilityScoped:
              true,

            retention:
              expectedRetention,
          });

          expect(
            schemaForCollection(
              name,
            ).options.collection,
          ).toBe(
            name,
          );

          expect(
            radiologyReportingValidators[
              name
            ],
          ).toHaveProperty(
            '$jsonSchema.properties.facilityId.bsonType',
            'objectId',
          );
        }
      },
    );

    it(
      'defines report identity, history, and critical-worklist indexes',
      () => {
        expect(
          indexNames(
            RadiologyReportModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_radiology_reports_facility_number',
            'uq_radiology_reports_order_item',
            'ix_radiology_reports_radiologist_worklist',
            'ix_radiology_reports_critical_worklist',
          ]),
        );

        expect(
          indexNames(
            RadiologyReportVersionModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toContain(
          'uq_radiology_report_versions_report_version',
        );

        expect(
          indexNames(
            RadiologyCriticalFindingCommunicationModel.schema.indexes() as Array<
              [
                Record<string, number>,
                Record<string, unknown>,
              ]
            >,
          ),
        ).toContain(
          'uq_radiology_critical_communication_acknowledgement',
        );
      },
    );

    it(
      'keeps report content, encrypted snapshots, and recipient details out of default projections',
      () => {
        expect(
          RadiologyReportModel.schema.path(
            'findings',
          ).options.select,
        ).toBe(
          false,
        );

        expect(
          RadiologyReportModel.schema.path(
            'criticalFindings',
          ).options.select,
        ).toBe(
          false,
        );

        expect(
          RadiologyReportVersionModel.schema.path(
            'encryptedSnapshot',
          ).options.select,
        ).toBe(
          false,
        );

        expect(
          RadiologyCriticalFindingCommunicationModel.schema.path(
            'recipientDisplaySnapshot',
          ).options.select,
        ).toBe(
          false,
        );
      },
    );

    it(
      'rejects a final report without immutable-version attribution',
      async () => {
        const fields =
          commonFields();

        const report =
          new RadiologyReportModel({
            ...fields,

            reportNumber:
              'RPT-2026-0000001',

            radiologyOrderId:
              id(),

            radiologyOrderItemId:
              id(),

            imagingStudyId:
              id(),

            examinationId:
              id(),

            patientId:
              id(),

            encounterId:
              id(),

            procedureId:
              id(),

            procedureCodeSnapshot:
              'CT_CHEST',

            procedureNameSnapshot:
              'CT Chest',

            modalityCodeSnapshot:
              'CT',

            accessionNumberSnapshot:
              'ACC-2026-0000001',

            studyInstanceUidSnapshot:
              '1.2.840.113619.2.1',

            assignedRadiologistStaffId:
              id(),

            assignedAt:
              new Date(),

            assignedByStaffId:
              id(),

            status:
              'FINAL',

            urgency:
              'ROUTINE',

            clinicalHistory:
              'Fictional clinical history',

            comparisonStudyReferences:
              [],

            findings:
              'Fictional findings',

            impression:
              'Fictional impression',

            recommendations:
              null,

            criticalFindings:
              [],

            criticalFindingCount:
              0,

            unresolvedCriticalFindingCount:
              0,

            attachmentIds:
              [],

            finalizedAt:
              new Date(),

            finalizedBy:
              id(),

            finalRadiologistStaffId:
              id(),

            currentVersion:
              0,

            latestVersionId:
              null,

            addendumCount:
              0,

            publicationStatus:
              'NOT_PUBLISHED',
          });

        await expect(
          report.validate(),
        ).rejects.toThrow(
          'Final Radiology report states require signed content',
        );
      },
    );
  },
);

describe(
  'Radiology reporting request validation',
  () => {
    it(
      'rejects duplicate critical-finding codes',
      () => {
        const finding = {
          findingCode:
            'acute finding',

          title:
            'Acute finding',

          description:
            'Fictional critical finding description',

          urgency:
            'CRITICAL' as const,
        };

        const result =
          saveRadiologyReportDraftBodySchema.safeParse(
            {
              expectedReportVersion:
                0,

              urgency:
                'CRITICAL',

              findings:
                'Fictional findings',

              impression:
                'Fictional impression',

              comparisonStudyReferences:
                [],

              attachmentIds:
                [],

              criticalFindings: [
                finding,
                finding,
              ],
            },
          );

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'requires a withdrawal reason and a dedicated acknowledgement command',
      () => {
        expect(
          changeRadiologyReportPublicationBodySchema.safeParse(
            {
              expectedReportVersion:
                3,

              publicationStatus:
                'WITHDRAWN',
            },
          ).success,
        ).toBe(
          false,
        );

        expect(
          recordRadiologyCriticalCommunicationBodySchema.safeParse(
            {
              expectedReportVersion:
                3,

              findingCode:
                'ACUTE_FINDING',

              communicationType:
                'ACKNOWLEDGED',

              channel:
                'PHONE',

              recipientType:
                'ORDERING_PROVIDER',

              recipientDisplay:
                'Fictional Provider',
            },
          ).success,
        ).toBe(
          false,
        );
      },
    );
  },
);

describe(
  'Radiology immutable report rendering and publication safety',
  () => {
    it(
      'renders PDF bytes only from an immutable final snapshot',
      async () => {
        const renderer =
          new RadiologyReportRenderer();

        const snapshot:
          RadiologyFinalReportSnapshot = {
            schemaVersion:
              1,

            reportId:
              '64b000000000000000000001',

            reportNumber:
              'RPT-2026-0000001',

            orderId:
              '64b000000000000000000002',

            orderItemId:
              '64b000000000000000000003',

            imagingStudyId:
              '64b000000000000000000004',

            examinationId:
              '64b000000000000000000005',

            patientId:
              '64b000000000000000000006',

            encounterId:
              '64b000000000000000000007',

            procedureId:
              '64b000000000000000000008',

            procedureCode:
              'CT_CHEST',

            procedureName:
              'CT Chest',

            modalityCode:
              'CT',

            accessionNumber:
              'ACC-2026-0000001',

            studyInstanceUid:
              '1.2.840.113619.2.55.3.1',

            status:
              'FINAL',

            urgency:
              'ROUTINE',

            versionNumber:
              1,

            clinicalHistory:
              'Fictional clinical history',

            comparisonStudyReferences:
              [],

            findings:
              'Fictional radiology findings',

            impression:
              'Fictional radiology impression',

            recommendations:
              null,

            criticalFindings:
              [],

            attachmentIds:
              [],

            authorStaffId:
              '64b000000000000000000009',

            finalRadiologistStaffId:
              '64b000000000000000000010',

            finalizedAt:
              '2026-07-19T10:00:00.000Z',

            correctionReason:
              null,

            addendumText:
              null,

            recordedAt:
              '2026-07-19T10:00:00.000Z',
          };

        const document =
          await renderer.renderFinalSnapshot(
            {
              snapshot,

              printedAt:
                new Date(
                  '2026-07-19T11:00:00.000Z',
                ),
            },
          );

        expect(
          document.mediaType,
        ).toBe(
          'application/pdf',
        );

        expect(
          document.filename,
        ).toBe(
          'radiology-rpt-2026-0000001.pdf',
        );

        expect(
          Buffer.from(
            document.bytes,
          )
            .subarray(
              0,
              8,
            )
            .toString(
              'ascii',
            ),
        ).toBe(
          '%PDF-1.4',
        );

        expect(
          document.contentHash,
        ).toMatch(
          /^[a-f\d]{64}$/u,
        );
      },
    );

    it(
      'blocks publication before opening a transaction while critical findings remain unresolved',
      async () => {
        const facilityId =
          id();

        const reportId =
          id();

        const orderId =
          id();

        const itemId =
          id();

        const patientId =
          id();

        const encounterId =
          id();

        let transactionExecuted =
          false;

        const report = {
          _id:
            reportId,

          facilityId,

          reportNumber:
            'RPT-2026-0000001',

          radiologyOrderId:
            orderId,

          radiologyOrderItemId:
            itemId,

          imagingStudyId:
            id(),

          examinationId:
            id(),

          patientId,

          encounterId,

          procedureId:
            id(),

          procedureCodeSnapshot:
            'CT_CHEST',

          procedureNameSnapshot:
            'CT Chest',

          modalityCodeSnapshot:
            'CT',

          accessionNumberSnapshot:
            'ACC-2026-0000001',

          studyInstanceUidSnapshot:
            '1.2.840.113619.2.55.3.1',

          assignedRadiologistStaffId:
            id(),

          assignedAt:
            new Date(),

          assignedByStaffId:
            id(),

          status:
            'FINAL',

          urgency:
            'CRITICAL',

          criticalFindingCount:
            1,

          unresolvedCriticalFindingCount:
            1,

          attachmentIds:
            [],

          currentVersion:
            1,

          latestVersionId:
            id(),

          addendumCount:
            0,

          publicationStatus:
            'NOT_PUBLISHED',

          finalizedAt:
            new Date(),

          version:
            4,

          createdAt:
            new Date(),

          updatedAt:
            new Date(),
        } as unknown as RadiologyReportRecord;

        const support = {
          requireOrderItem:
            async () => ({
              _id:
                itemId,

              radiologyOrderId:
                orderId,
            }),

          requireOrder:
            async () => ({
              _id:
                orderId,
            }),

          assertAccess:
            async () =>
              undefined,

          dependencies: {
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

        const reports = {
          findById:
            async () =>
              report,
        } as unknown as RadiologyReportRepositoryPort;

        const service =
          new RadiologyReportingService(
            support,
            {} as never,
            reports,
            {
              assertEligibleRadiologist:
                async () =>
                  undefined,
            },
            {
              assertUsable:
                async () =>
                  undefined,
            },
            {
              notify:
                async () =>
                  undefined,
            },
            new RadiologyReportRenderer(),
            {
              storeGeneratedReport:
                async () => ({
                  artifactId:
                    id().toHexString(),
                }),
            },
          );

        await expect(
          service.changePublication(
            {
              actor: {
                facilityId:
                  facilityId.toHexString(),

                userId:
                  id().toHexString(),

                correlationId:
                  'corr-publication-test',

                roleKeys: [
                  'RADIOLOGY_STAFF',
                ],

                permissionKeys: [
                  'radiology.reports.publish',
                ],
              },

              reportId:
                reportId.toHexString(),

              idempotencyKey:
                'radiology-publication-critical-test',

              input: {
                expectedReportVersion:
                  4,

                publicationStatus:
                  'PUBLISHED',
              },
            },
          ),
        ).rejects.toThrow(
          'Critical or urgent Radiology findings must be acknowledged before report publication',
        );

        expect(
          transactionExecuted,
        ).toBe(
          false,
        );
      },
    );
  },
);