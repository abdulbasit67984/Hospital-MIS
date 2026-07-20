import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  NURSING_MEDICATION_TRANSACTION_TYPES,
} from '../nursing-medication.transaction.constants.js';

import {
  CreateNursingAssessmentWorkflow,
  SignNursingAssessmentWorkflow,
} from '../workflows/nursing-assessment-create-sign.workflows.js';

import {
  CorrectNursingAssessmentWorkflow,
  MarkNursingAssessmentEnteredInErrorWorkflow,
} from '../workflows/nursing-assessment-correction.workflows.js';

import {
  actor,
  assessmentRecord,
  TEST_IDS,
  workflowHarness,
} from './nursing-medication-workflow.test-helpers.js';

describe(
  'nursing assessment workflows',
  () => {
    it(
      'creates a draft assessment through the transaction boundary',
      async () => {
        const harness =
          workflowHarness();

        const workflow =
          new CreateNursingAssessmentWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            idempotencyKey:
              'assessment-create-001',
            input: {
              admissionId:
                TEST_IDS.admissionId,
              assessmentType:
                'INITIAL',
              sections: [
                {
                  sectionCode:
                    'GENERAL',
                  sectionLabel:
                    'General',
                  values: {
                    alert:
                      true,
                  },
                  riskLevel:
                    'LOW',
                },
              ],
              assessedAt:
                '2026-07-20T09:55:00.000Z',
            },
          });

        expect(
          harness.requests[0]
            ?.transactionType,
        ).toBe(
          NURSING_MEDICATION_TRANSACTION_TYPES.CREATE_ASSESSMENT,
        );

        expect(
          harness.assessments.create,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          harness.compensations,
        ).toHaveLength(
          1,
        );

        expect(
          harness.publishMutation,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.status,
        ).toBe(
          'DRAFT',
        );
      },
    );

    it(
      'signs a draft assessment and appends its immutable version',
      async () => {
        const current =
          assessmentRecord({
            status:
              'DRAFT',
            version:
              2,
          });

        const harness =
          workflowHarness({
            assessment:
              current,
          });

        harness.assessments.update.mockResolvedValue(
          assessmentRecord({
            status:
              'SIGNED',
            version:
              3,
            signedAt:
              new Date(
                '2026-07-20T10:00:00.000Z',
              ),
          }),
        );

        const workflow =
          new SignNursingAssessmentWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.assessmentId,
            idempotencyKey:
              'assessment-sign-001',
            input: {
              expectedVersion:
                2,
            },
          });

        expect(
          harness.assessments.update,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.assessmentId,
          2,
          [
            'DRAFT',
          ],
          expect.objectContaining({
            status:
              'SIGNED',
          }),
        );

        expect(
          harness.assessments.createVersion,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          harness.compensations,
        ).toHaveLength(
          2,
        );

        expect(
          result.status,
        ).toBe(
          'SIGNED',
        );
      },
    );

    it(
      'creates a signed replacement when correcting a signed assessment',
      async () => {
        const current =
          assessmentRecord({
            status:
              'SIGNED',
            version:
              1,
            signedAt:
              new Date(
                '2026-07-20T09:58:00.000Z',
              ),
          });

        const replacement =
          assessmentRecord({
            status:
              'SIGNED',
            revisionNumber:
              2,
            supersedesAssessmentId:
              current._id,
            version:
              0,
          });

        const harness =
          workflowHarness({
            assessment:
              current,
          });

        harness.assessments.create.mockResolvedValue(
          replacement,
        );

        harness.assessments.update.mockResolvedValue(
          assessmentRecord({
            status:
              'CORRECTED',
            version:
              2,
          }),
        );

        const workflow =
          new CorrectNursingAssessmentWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.assessmentId,
            idempotencyKey:
              'assessment-correct-001',
            input: {
              expectedVersion:
                1,
              reason:
                'Correcting a documented transcription error',
              replacement: {
                assessmentType:
                  'INITIAL',
                sections: [
                  {
                    sectionCode:
                      'GENERAL',
                    sectionLabel:
                      'General',
                    values: {
                      alert:
                        true,
                    },
                    riskLevel:
                      'LOW',
                  },
                ],
                assessedAt:
                  '2026-07-20T09:55:00.000Z',
              },
            },
          });

        expect(
          harness.assessments.create,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'SIGNED',
            revisionNumber:
              2,
            supersedesAssessmentId:
              current._id,
          }),
        );

        expect(
          harness.assessments.update,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.assessmentId,
          1,
          [
            'SIGNED',
          ],
          expect.objectContaining({
            status:
              'CORRECTED',
          }),
        );

        expect(
          result.revisionNumber,
        ).toBe(
          2,
        );
      },
    );

    it(
      'marks a draft assessment entered in error without deleting it',
      async () => {
        const current =
          assessmentRecord({
            status:
              'DRAFT',
            version:
              0,
          });

        const harness =
          workflowHarness({
            assessment:
              current,
          });

        harness.assessments.update.mockResolvedValue(
          assessmentRecord({
            status:
              'ENTERED_IN_ERROR',
            version:
              1,
          }),
        );

        const workflow =
          new MarkNursingAssessmentEnteredInErrorWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.assessmentId,
            idempotencyKey:
              'assessment-error-001',
            input: {
              expectedVersion:
                0,
              reason:
                'Assessment was recorded against the wrong clinical time',
            },
          });

        expect(
          harness.assessments.update,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.assessmentId,
          0,
          [
            'DRAFT',
            'SIGNED',
          ],
          expect.objectContaining({
            status:
              'ENTERED_IN_ERROR',
          }),
        );

        expect(
          result.status,
        ).toBe(
          'ENTERED_IN_ERROR',
        );
      },
    );
  },
);