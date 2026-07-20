import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CreateNursingCarePlanWorkflow,
  ReviewNursingCarePlanWorkflow,
} from '../workflows/nursing-care-plan-create-review.workflows.js';

import {
  CompleteNursingCarePlanWorkflow,
} from '../workflows/nursing-care-plan-lifecycle.workflows.js';

import {
  CarryForwardNursingTaskWorkflow,
  ChangeNursingTaskStatusWorkflow,
  CreateNursingTaskWorkflow,
} from '../workflows/nursing-task.workflows.js';

import {
  actor,
  carePlanRecord,
  taskRecord,
  TEST_IDS,
  workflowHarness,
} from './nursing-medication-workflow.test-helpers.js';

describe(
  'nursing care-plan workflows',
  () => {
    it(
      'creates an active care plan and its initial immutable version',
      async () => {
        const harness =
          workflowHarness();

        const workflow =
          new CreateNursingCarePlanWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            idempotencyKey:
              'care-plan-create-001',
            input: {
              admissionId:
                TEST_IDS.admissionId,
              title:
                'Mobility support',
              problems: [
                {
                  description:
                    'Reduced mobility',
                  identifiedAt:
                    '2026-07-20T09:00:00.000Z',
                  goals: [
                    {
                      description:
                        'Mobilize safely',
                      expectedOutcome:
                        'Patient ambulates with assistance',
                    },
                  ],
                  interventions: [
                    {
                      description:
                        'Assist ambulation',
                      frequency: {
                        type:
                          'SHIFT',
                        shiftCodes: [
                          'DAY',
                        ],
                      },
                      startsAt:
                        '2026-07-20T10:00:00.000Z',
                    },
                  ],
                },
              ],
              startedAt:
                '2026-07-20T10:00:00.000Z',
            },
          });

        expect(
          harness.care.createCarePlan,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'ACTIVE',
            revisionNumber:
              1,
          }),
        );

        expect(
          harness.care.createCarePlanVersion,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.status,
        ).toBe(
          'ACTIVE',
        );
      },
    );

    it(
      'reviews a care plan with optimistic concurrency and a new revision',
      async () => {
        const current =
          carePlanRecord({
            version:
              3,
            revisionNumber:
              2,
          });

        const harness =
          workflowHarness({
            carePlan:
              current,
          });

        harness.care.updateCarePlan.mockResolvedValue(
          carePlanRecord({
            version:
              4,
            revisionNumber:
              3,
          }),
        );

        const workflow =
          new ReviewNursingCarePlanWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.carePlanId,
            idempotencyKey:
              'care-plan-review-001',
            input: {
              expectedVersion:
                3,
              problems: [
                {
                  description:
                    'Reduced mobility',
                  identifiedAt:
                    '2026-07-20T09:00:00.000Z',
                },
              ],
              outcomeEvaluation:
                'Patient tolerated assisted ambulation',
              nextReviewAt:
                '2026-07-21T10:00:00.000Z',
            },
          });

        expect(
          harness.care.updateCarePlan,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.carePlanId,
          3,
          [
            'ACTIVE',
            'ON_HOLD',
          ],
          expect.objectContaining({
            revisionNumber:
              3,
          }),
        );

        expect(
          result.revisionNumber,
        ).toBe(
          3,
        );
      },
    );

    it(
      'completes a care plan with completion attribution',
      async () => {
        const current =
          carePlanRecord({
            version:
              1,
            revisionNumber:
              1,
          });

        const harness =
          workflowHarness({
            carePlan:
              current,
          });

        harness.care.updateCarePlan.mockResolvedValue(
          carePlanRecord({
            status:
              'COMPLETED',
            version:
              2,
            revisionNumber:
              2,
          }),
        );

        const workflow =
          new CompleteNursingCarePlanWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.carePlanId,
            idempotencyKey:
              'care-plan-complete-001',
            input: {
              expectedVersion:
                1,
              outcomeEvaluation:
                'Expected outcome achieved safely',
            },
          });

        expect(
          harness.care.updateCarePlan,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.carePlanId,
          1,
          [
            'ACTIVE',
            'ON_HOLD',
          ],
          expect.objectContaining({
            status:
              'COMPLETED',
            completedByStaffId:
              expect.anything(),
          }),
        );

        expect(
          result.status,
        ).toBe(
          'COMPLETED',
        );
      },
    );
  },
);

describe(
  'nursing task workflows',
  () => {
    it(
      'creates a pending nursing task',
      async () => {
        const harness =
          workflowHarness();

        const workflow =
          new CreateNursingTaskWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            idempotencyKey:
              'task-create-001',
            input: {
              admissionId:
                TEST_IDS.admissionId,
              sourceType:
                'MANUAL',
              title:
                'Reposition patient',
              dueAt:
                '2026-07-20T11:00:00.000Z',
            },
          });

        expect(
          harness.care.createTask,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'PENDING',
          }),
        );

        expect(
          result.status,
        ).toBe(
          'PENDING',
        );
      },
    );

    it(
      'completes a task with nurse and user attribution',
      async () => {
        const current =
          taskRecord({
            status:
              'IN_PROGRESS',
            version:
              2,
          });

        const harness =
          workflowHarness({
            task:
              current,
          });

        harness.care.updateTask.mockResolvedValue(
          taskRecord({
            status:
              'COMPLETED',
            version:
              3,
          }),
        );

        const workflow =
          new ChangeNursingTaskStatusWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.taskId,
            idempotencyKey:
              'task-complete-001',
            input: {
              expectedVersion:
                2,
              status:
                'COMPLETED',
            },
          });

        expect(
          harness.care.updateTask,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.taskId,
          2,
          [
            'IN_PROGRESS',
          ],
          expect.objectContaining({
            status:
              'COMPLETED',
            completedByUserId:
              expect.anything(),
            completedByStaffId:
              expect.anything(),
          }),
        );

        expect(
          result.status,
        ).toBe(
          'COMPLETED',
        );
      },
    );

    it(
      'carries a pending task forward while preserving the source chain',
      async () => {
        const current =
          taskRecord({
            status:
              'PENDING',
            version:
              1,
          });

        const replacement =
          taskRecord({
            taskNumber:
              'NTK-2026-0000002',
            carriedForwardFromTaskId:
              current._id,
            version:
              0,
          });

        const harness =
          workflowHarness({
            task:
              current,
          });

        harness.care.createTask.mockResolvedValue(
          replacement,
        );

        harness.care.updateTask.mockResolvedValue(
          taskRecord({
            status:
              'CANCELLED',
            version:
              2,
            carriedForwardToTaskId:
              replacement._id,
          }),
        );

        const workflow =
          new CarryForwardNursingTaskWorkflow(
            harness.support,
          );

        const result =
          await workflow.execute({
            actor:
              actor(),
            entityId:
              TEST_IDS.taskId,
            idempotencyKey:
              'task-carry-forward-001',
            input: {
              expectedVersion:
                1,
              dueAt:
                '2026-07-20T19:00:00.000Z',
              reason:
                'Task remains clinically required for the incoming shift',
            },
          });

        expect(
          harness.care.createTask,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              'PENDING',
            carriedForwardFromTaskId:
              current._id,
          }),
        );

        expect(
          harness.care.updateTask,
        ).toHaveBeenCalledWith(
          TEST_IDS.facilityId,
          TEST_IDS.taskId,
          1,
          [
            'PENDING',
          ],
          expect.objectContaining({
            status:
              'CANCELLED',
            dispositionReasonCode:
              'SHIFT_CARRY_FORWARD',
          }),
        );

        expect(
          result.taskNumber,
        ).toBe(
          'NTK-2026-0000002',
        );
      },
    );
  },
);