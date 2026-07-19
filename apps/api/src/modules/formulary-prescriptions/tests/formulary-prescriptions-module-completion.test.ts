import {
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
  migrations,
  schemaForCollection,
} from '@hospital-mis/database';

import {
  permissionKeys,
} from '@hospital-mis/permissions';

import {
  assertSafeFormularyPrescriptionEventPayload,
} from '../../../infrastructure/formulary-prescription-runtime.adapters.js';

import {
  formularyPrescriptionOpenApi,
} from '../formulary-prescriptions.openapi.js';

import {
  FORMULARY_PRESCRIPTION_PERMISSION_KEYS,
} from '../formulary-prescriptions.constants.js';

import {
  assertPrescriptionTransition,
} from '../formulary-prescriptions.workflow-helpers.js';

import {
  createFormularyItemBodySchema,
  createPrescriptionDraftBodySchema,
  formularyPrescriptionMutationHeadersSchema,
  issuePrescriptionBodySchema,
  updatePrescriptionDraftBodySchema,
} from '../formulary-prescriptions.validation.js';

describe(
  'Formulary and prescriptions module completion',
  () => {
    it(
      'registers the new formulary and prescription persistence collections',
      () => {
        const collectionNames =
          new Set(
            collectionSpecs.map(
              (
                specification,
              ) =>
                specification.name,
            ),
          );

        expect(
          collectionNames.has(
            'medicineRoutes',
          ),
        ).toBe(
          true,
        );

        expect(
          collectionNames.has(
            'formularyItems',
          ),
        ).toBe(
          true,
        );

        expect(
          collectionNames.has(
            'prescriptionSafetyWarnings',
          ),
        ).toBe(
          true,
        );

        expect(
          collectionNames.has(
            'prescriptions',
          ),
        ).toBe(
          true,
        );

        expect(
          collectionNames.has(
            'prescriptionItems',
          ),
        ).toBe(
          true,
        );

        expect(
          collectionNames.has(
            'prescriptionStatusHistories',
          ),
        ).toBe(
          true,
        );

        expect(
          migrations.some(
            (
              migration,
            ) =>
              migration.id ===
              '015-formulary-prescriptions-foundation',
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      'uses the new encounter-linked prescription schema instead of the legacy critical schema',
      () => {
        const schema =
          schemaForCollection(
            'prescriptions',
          );

        expect(
          schema.path(
            'prescriberProviderId',
          ),
        ).toBeDefined();

        expect(
          schema.path(
            'rootPrescriptionId',
          ),
        ).toBeDefined();

        expect(
          schema.path(
            'unresolvedBlockingWarningCount',
          ),
        ).toBeDefined();

        expect(
          schema.path(
            'issuedSnapshotHash',
          ),
        ).toBeDefined();

        expect(
          schema.path(
            'doctorId',
          ),
        ).toBeUndefined();

        expect(
          schema.path(
            'finalizedSnapshot',
          ),
        ).toBeUndefined();
      },
    );

    it(
      'registers all required authorization permissions',
      () => {
        expect(
          permissionKeys,
        ).toEqual(
          expect.arrayContaining([
            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .FORMULARY_READ,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .FORMULARY_MANAGE,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_READ,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_CREATE,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_ISSUE,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_AMEND,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_CANCEL,

            FORMULARY_PRESCRIPTION_PERMISSION_KEYS
              .PRESCRIPTION_PRINT,
          ]),
        );
      },
    );

    it(
      'requires idempotency for every formulary and prescription mutation',
      () => {
        expect(
          formularyPrescriptionMutationHeadersSchema
            .safeParse({
              'idempotency-key':
                'prescription-20260719-000001',
            })
            .success,
        ).toBe(
          true,
        );

        expect(
          formularyPrescriptionMutationHeadersSchema
            .safeParse({})
            .success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'validates standardized formulary selection and rejects free-text prescribing',
      () => {
        const routeId =
          new ObjectId()
            .toHexString();

        const doseUnitId =
          new ObjectId()
            .toHexString();

        const quantityUnitId =
          new ObjectId()
            .toHexString();

        const formularyItem =
          createFormularyItemBodySchema.safeParse({
            formularyCode:
              'FORM-000001',

            medicineId:
              new ObjectId()
                .toHexString(),

            medicineFormId:
              new ObjectId()
                .toHexString(),

            medicineStrengthId:
              new ObjectId()
                .toHexString(),

            allowedRouteIds: [
              routeId,
            ],

            defaultRouteId:
              routeId,

            doseUnitId,

            quantityUnitId,

            stockTracked:
              false,
          });

        expect(
          formularyItem.success,
        ).toBe(
          true,
        );

        const prescription =
          createPrescriptionDraftBodySchema.safeParse({
            encounterId:
              new ObjectId()
                .toHexString(),

            patientId:
              new ObjectId()
                .toHexString(),

            prescriberProviderId:
              new ObjectId()
                .toHexString(),

            items: [
              {
                formularyItemId:
                  new ObjectId()
                    .toHexString(),

                dose:
                  '500',

                doseUnitId,

                routeId,

                frequencyId:
                  new ObjectId()
                    .toHexString(),

                durationValue:
                  '5',

                durationUnit:
                  'DAYS',

                quantity:
                  '10',

                quantityUnitId,

                instructions:
                  'Take after meals',

                asNeeded:
                  false,

                startDate:
                  '2026-07-19',
              },
            ],
          });

        expect(
          prescription.success,
        ).toBe(
          true,
        );

        expect(
          createPrescriptionDraftBodySchema
            .safeParse({
              encounterId:
                new ObjectId()
                  .toHexString(),

              patientId:
                new ObjectId()
                  .toHexString(),

              prescriberProviderId:
                new ObjectId()
                  .toHexString(),

              items: [
                {
                  medicineName:
                    'Free-text medicine',

                  dose:
                    '1 tablet',
                },
              ],
            })
            .success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'requires optimistic concurrency and signing for issuance',
      () => {
        expect(
          updatePrescriptionDraftBodySchema
            .safeParse({
              expectedVersion:
                0,

              items: [],
            })
            .success,
        ).toBe(
          false,
        );

        expect(
          issuePrescriptionBodySchema
            .safeParse({
              expectedVersion:
                0,

              signatureMethod:
                'AUTHENTICATED_SESSION',

              signatureDigest:
                'a'.repeat(
                  64,
                ),
            })
            .success,
        ).toBe(
          true,
        );

        expect(
          issuePrescriptionBodySchema
            .safeParse({
              expectedVersion:
                0,

              signatureMethod:
                'AUTHENTICATED_SESSION',

              signatureDigest:
                'short',
            })
            .success,
        ).toBe(
          false,
        );
      },
    );

    it(
      'enforces the prescription lifecycle transition graph',
      () => {
        expect(
          () =>
            assertPrescriptionTransition(
              'DRAFT',
              'ISSUED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertPrescriptionTransition(
              'ISSUED',
              'PARTIALLY_DISPENSED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertPrescriptionTransition(
              'PARTIALLY_DISPENSED',
              'DISPENSED',
            ),
        ).not.toThrow();

        expect(
          () =>
            assertPrescriptionTransition(
              'DISPENSED',
              'DRAFT',
            ),
        ).toThrow();
      },
    );

    it(
      'blocks clinical medicine details from outbox and realtime payloads',
      () => {
        expect(
          () =>
            assertSafeFormularyPrescriptionEventPayload({
              prescriptionId:
                new ObjectId()
                  .toHexString(),

              prescriptionNumber:
                'RX-2026-0000001',

              status:
                'ISSUED',

              version:
                1,
            }),
        ).not.toThrow();

        expect(
          () =>
            assertSafeFormularyPrescriptionEventPayload({
              prescriptionId:
                new ObjectId()
                  .toHexString(),

              dose:
                '500 mg',
            }),
        ).toThrow();

        expect(
          () =>
            assertSafeFormularyPrescriptionEventPayload({
              prescriptionId:
                new ObjectId()
                  .toHexString(),

              instructions:
                'Take after meals',
            }),
        ).toThrow();

        expect(
          () =>
            assertSafeFormularyPrescriptionEventPayload({
              warning: {
                message:
                  'Potential medicine allergy',
              },
            }),
        ).toThrow();
      },
    );

    it(
      'publishes all formulary and prescription API paths',
      () => {
        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/formulary',
        );

        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/prescriptions',
        );

        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/prescriptions/{prescriptionId}/issue',
        );

        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/prescriptions/{prescriptionId}/replace',
        );

        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/prescriptions/{prescriptionId}/print',
        );

        expect(
          formularyPrescriptionOpenApi.paths,
        ).toHaveProperty(
          '/formulary-prescriptions/patients/{patientId}/medications',
        );
      },
    );
  },
);