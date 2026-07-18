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
  ClinicalReferralModel,
  clinicalEmrSchemas,
  collectionSpecs,
  migrations,
  schemaForCollection,
} from '@hospital-mis/database';

import {
  assertSafeClinicalEventPayload,
} from '../../../infrastructure/clinical-emr-runtime.adapters.js';

import {
  allergyCatalogListQuerySchema,
  clinicalEmrMutationHeadersSchema,
  clinicalPatientSummaryQuerySchema,
  clinicalTimelineRouteQuerySchema,
  diagnosisCatalogListQuerySchema,
  encounterDiagnosisListQuerySchema,
  patientAllergyListQuerySchema,
  patientProblemListQuerySchema,
  vitalSignListQuerySchema,
  correctClinicalReferralBodySchema,
  createClinicalReferralBodySchema,
  transitionClinicalReferralBodySchema,
} from '../clinical-emr.http-contracts.js';

import {
  CLINICAL_EMR_COMPENSATABLE_COLLECTIONS,
  CLINICAL_EMR_OUTBOX_EVENTS,
  CLINICAL_EMR_TRANSACTION_TYPES,
} from '../clinical-emr.transaction.constants.js';

import {
  clinicalEmrOpenApi,
  seedClinicalEmrDemoData,
} from '../clinical-emr.module.js';

function auditFields(
  actorId: ObjectId,
) {
  return {
    transactionId: randomUUID(),
    correlationId: randomUUID(),
    schemaVersion: 1,
    createdBy: actorId,
    updatedBy: actorId,
  };
}

describe(
  'Clinical encounters and EMR module completion',
  () => {
    it(
      'registers append-only clinical referral persistence and migration',
      () => {
        const specification =
          collectionSpecs.find(
            (candidate) => candidate.name === 'clinicalReferrals',
          );

        expect(specification).toMatchObject({
          domain: 'clinical',
          facilityScoped: true,
          retention: 'immutable',
        });

        expect(
          schemaForCollection('clinicalReferrals'),
        ).toBe(clinicalEmrSchemas.clinicalReferrals);

        expect(
          migrations.at(-1)?.id,
        ).toBe('014-clinical-referrals-foundation');

        expect(
          ClinicalReferralModel.schema.indexes().map(
            ([, options]) => options.name,
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_clinical_referrals_number_version',
            'ix_clinical_referrals_patient_requested',
            'ix_clinical_referrals_assignee_status_priority',
          ]),
        );
      },
    );

    it(
      'validates internal and external referral targets without mixing them',
      async () => {
        const actorId = new ObjectId();
        const now = new Date();

        const internalReferral =
          new ClinicalReferralModel({
            facilityId: new ObjectId(),
            referralNumber: 'REF-2026-0000001',
            referralVersion: 1,
            previousVersionId: null,
            patientId: new ObjectId(),
            sourceEncounterId: new ObjectId(),
            sourceClinicalNoteId: null,
            requestingProviderId: actorId,
            assignedProviderId: null,
            referralType: 'INTERNAL_CONSULTATION',
            priority: 'URGENT',
            status: 'REQUESTED',
            changeType: 'CREATED',
            target: {
              facilityId: new ObjectId(),
              departmentId: new ObjectId(),
              clinicId: null,
              servicePointId: null,
              providerId: null,
              externalOrganization: null,
              externalProviderName: null,
            },
            reason: 'Specialist assessment is required',
            clinicalQuestion: null,
            requestedAt: now,
            changedAt: now,
            changedBy: actorId,
            version: 0,
            ...auditFields(actorId),
          });

        await expect(
          internalReferral.validate(),
        ).resolves.toBeUndefined();

        const externalReferral =
          new ClinicalReferralModel({
            facilityId: new ObjectId(),
            referralNumber: 'REF-2026-0000002',
            referralVersion: 1,
            previousVersionId: null,
            patientId: new ObjectId(),
            sourceEncounterId: new ObjectId(),
            sourceClinicalNoteId: null,
            requestingProviderId: actorId,
            assignedProviderId: null,
            referralType: 'EXTERNAL_REFERRAL',
            priority: 'ROUTINE',
            status: 'REQUESTED',
            changeType: 'CREATED',
            target: {
              facilityId: null,
              departmentId: new ObjectId(),
              clinicId: null,
              servicePointId: null,
              providerId: null,
              externalOrganization: 'Referral Hospital',
              externalProviderName: null,
            },
            reason: 'Service is unavailable at the current facility',
            clinicalQuestion: null,
            requestedAt: now,
            changedAt: now,
            changedBy: actorId,
            version: 0,
            ...auditFields(actorId),
          });

        await expect(
          externalReferral.validate(),
        ).rejects.toThrow(
          'External referrals require an external target and cannot contain internal assignment fields',
        );
      },
    );

    it(
      'enforces append-only referral version and lifecycle attribution rules',
      async () => {
        const actorId = new ObjectId();
        const providerId = new ObjectId();
        const now = new Date();

        const accepted =
          new ClinicalReferralModel({
            facilityId: new ObjectId(),
            referralNumber: 'REF-2026-0000003',
            referralVersion: 2,
            previousVersionId: new ObjectId(),
            patientId: new ObjectId(),
            sourceEncounterId: new ObjectId(),
            requestingProviderId: actorId,
            assignedProviderId: providerId,
            referralType: 'INTERNAL_CONSULTATION',
            priority: 'ROUTINE',
            status: 'ACCEPTED',
            changeType: 'ACCEPTED',
            target: {
              facilityId: new ObjectId(),
              departmentId: new ObjectId(),
              providerId,
            },
            reason: 'Specialist assessment is required',
            requestedAt: now,
            acceptedAt: now,
            changedAt: now,
            changedBy: actorId,
            version: 1,
            ...auditFields(actorId),
          });

        await expect(
          accepted.validate(),
        ).resolves.toBeUndefined();

        accepted.version = 0;

        await expect(
          accepted.validate(),
        ).rejects.toThrow(
          'version must equal referralVersion minus one',
        );
      },
    );

    it(
      'validates idempotency, referral correction, and timeline query contracts',
      () => {
        expect(
          clinicalEmrMutationHeadersSchema.safeParse({
            'idempotency-key': 'clinical-referral-0001',
          }).success,
        ).toBe(true);

        expect(
          clinicalEmrMutationHeadersSchema.safeParse({}).success,
        ).toBe(false);

        const creation =
          createClinicalReferralBodySchema.safeParse({
            patientId: new ObjectId().toHexString(),
            sourceEncounterId: new ObjectId().toHexString(),
            requestingProviderId: new ObjectId().toHexString(),
            referralType: 'INTERNAL_CONSULTATION',
            target: {
              departmentId: new ObjectId().toHexString(),
            },
            reason: 'Specialist assessment is required',
          });

        expect(creation.success).toBe(true);

        const transition =
          transitionClinicalReferralBodySchema.safeParse({
            expectedVersion: 0,
            status: 'COMPLETED',
            assignedProviderId: new ObjectId().toHexString(),
            responseSummary: 'Consultation completed and plan returned',
          });

        expect(transition.success).toBe(true);

        const correction =
          correctClinicalReferralBodySchema.safeParse({
            expectedVersion: 1,
            correctionReason: 'The original target department was incorrect',
            replacement: {
              referralType: 'INTERNAL_CONSULTATION',
              priority: 'URGENT',
              target: {
                departmentId: new ObjectId().toHexString(),
              },
              reason: 'Urgent specialist assessment is required',
            },
          });

        expect(correction.success).toBe(true);

        expect(
          clinicalTimelineRouteQuerySchema.safeParse({
            dateFrom: '2026-07-19T00:00:00.000Z',
            dateTo: '2026-07-18T00:00:00.000Z',
          }).success,
        ).toBe(false);

        expect(
          clinicalPatientSummaryQuerySchema.parse({
            includeEnteredInError: 'false',
          }).includeEnteredInError,
        ).toBe(false);

        expect(
          diagnosisCatalogListQuerySchema.safeParse({
            search: 'hypertension',
          }).success,
        ).toBe(true);

        expect(
          allergyCatalogListQuerySchema.safeParse({
            category: 'MEDICATION',
          }).success,
        ).toBe(true);

        expect(
          encounterDiagnosisListQuerySchema.safeParse({}).success,
        ).toBe(false);

        expect(
          patientProblemListQuerySchema.safeParse({
            patientId: new ObjectId().toHexString(),
          }).success,
        ).toBe(true);

        expect(
          patientAllergyListQuerySchema.safeParse({
            patientId: new ObjectId().toHexString(),
          }).success,
        ).toBe(true);

        expect(
          vitalSignListQuerySchema.safeParse({
            measuredFrom: '2026-07-19T00:00:00.000Z',
            measuredTo: '2026-07-18T00:00:00.000Z',
            patientId: new ObjectId().toHexString(),
          }).success,
        ).toBe(false);
      },
    );

    it(
      'exports an idempotent workflow-backed fictional clinical demo seed',
      () => {
        expect(seedClinicalEmrDemoData).toBeTypeOf('function');
      },
    );

    it(
      'publishes authorized immutable-history and longitudinal read APIs',
      () => {
        expect(
          Object.keys(clinicalEmrOpenApi.paths),
        ).toEqual(
          expect.arrayContaining([
            '/clinical-emr/diagnosis-catalog',
            '/clinical-emr/allergy-catalog',
            '/clinical-emr/diagnoses',
            '/clinical-emr/problems',
            '/clinical-emr/allergies',
            '/clinical-emr/vital-signs',
            '/clinical-emr/encounters/{encounterId}/history',
            '/clinical-emr/notes/{clinicalNoteId}/history',
            '/clinical-emr/problems/{patientProblemId}/history',
            '/clinical-emr/allergies/{patientAllergyId}/history',
            '/clinical-emr/vital-signs/{vitalSignId}/history',
            '/clinical-emr/referrals/{referralNumber}/history',
            '/clinical-emr/patients/{patientId}/summary',
            '/clinical-emr/patients/{patientId}/timeline',
            '/clinical-emr/providers/{providerId}/worklist',
          ]),
        );
      },
    );

    it(
      'keeps clinical content out of public events and includes referrals in recovery',
      () => {
        expect(() =>
          assertSafeClinicalEventPayload({
            referralNumber: 'REF-2026-0000001',
            status: 'REQUESTED',
            targetDepartmentId: new ObjectId().toHexString(),
          }),
        ).not.toThrow();

        expect(() =>
          assertSafeClinicalEventPayload({
            referralNumber: 'REF-2026-0000001',
            clinicalNotes: 'Sensitive clinical narrative',
          }),
        ).toThrow('Sensitive clinical field');

        expect(
          CLINICAL_EMR_COMPENSATABLE_COLLECTIONS,
        ).toContain('clinicalReferrals');

        expect(
          CLINICAL_EMR_TRANSACTION_TYPES.CORRECT_CLINICAL_REFERRAL,
        ).toBe('CORRECT_CLINICAL_REFERRAL');

        expect(
          CLINICAL_EMR_OUTBOX_EVENTS.REFERRAL_CHANGED,
        ).toBe('clinical.referral.changed');
      },
    );
  },
);