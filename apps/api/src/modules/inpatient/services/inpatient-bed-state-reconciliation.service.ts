import {
  toObjectId,
} from '@hospital-mis/database';

import {
  InpatientBedConcurrencyError,
} from '../inpatient.errors.js';

import type {
  InpatientBedOperationRepositoryPort,
} from '../inpatient-bed-operations.ports.js';

import type {
  InpatientBedStateReconciliationIssue,
  InpatientBedStateReconciliationResult,
  ReconcileBedStateInput,
} from '../inpatient-bed-operations.types.js';

import {
  reconcileBedStateBodySchema,
} from '../inpatient-bed-operations.validation.js';

import {
  InpatientCommandService,
} from './inpatient-command.service.js';

export class InpatientBedStateReconciliationService {
  public constructor(
    private readonly support:
      InpatientCommandService,

    private readonly operations:
      InpatientBedOperationRepositoryPort,
  ) {}

  public async reconcile(
    actor:
      import('../inpatient.types.js')
        .InpatientActorContext,

    bedId:
      string,

    rawInput:
      ReconcileBedStateInput,
  ): Promise<
    InpatientBedStateReconciliationResult
  > {
    const input =
      reconcileBedStateBodySchema.parse(
        rawInput,
      );

    const bed =
      await this.support.requireBed(
        actor,
        bedId,
      );

    this.support.assertExpectedVersion(
      bed,
      input.expectedBedVersion,
      'BED',
    );

    await this.support.assertAccess(
      actor,
      'BED_STATUS_MANAGE',
      {
        bed,
      },
    );

    const [
      activeAssignment,
      activeHold,
    ] =
      await Promise.all([
        this.support.admissions
          .findActiveBedAssignment(
            actor.facilityId,
            bedId,
          ),

        this.support.admissions
          .findActiveBedHold(
            actor.facilityId,
            bedId,
          ),
      ]);

    const issues:
      InpatientBedStateReconciliationIssue[] =
      [];

    const expectedAssignmentId =
      activeAssignment?._id.toHexString() ??
      null;

    const expectedAdmissionId =
      activeAssignment?.admissionId.toHexString() ??
      null;

    const expectedPatientId =
      activeAssignment?.patientId.toHexString() ??
      null;

    const expectedHoldId =
      activeHold?._id.toHexString() ??
      null;

    const expectedStatus =
      activeAssignment !==
      null
        ? 'OCCUPIED'
        : activeHold !==
            null
          ? 'RESERVED'
          : (
              bed.operationalStatus ===
                'OCCUPIED' ||
              bed.operationalStatus ===
                'RESERVED'
            )
            ? 'AVAILABLE'
            : bed.operationalStatus;

    function compare(
      code:
        string,

      message:
        string,

      currentValue:
        unknown,

      expectedValue:
        unknown,
    ): void {
      if (
        currentValue !==
        expectedValue
      ) {
        issues.push({
          code,
          message,
          currentValue,
          expectedValue,
        });
      }
    }

    compare(
      'BED_ASSIGNMENT_PROJECTION_MISMATCH',
      'The current assignment projection differs from active assignment history',
      bed.currentAssignmentId?.toHexString() ??
        null,
      expectedAssignmentId,
    );

    compare(
      'BED_ADMISSION_PROJECTION_MISMATCH',
      'The current admission projection differs from active assignment history',
      bed.currentAdmissionId?.toHexString() ??
        null,
      expectedAdmissionId,
    );

    compare(
      'BED_PATIENT_PROJECTION_MISMATCH',
      'The current patient projection differs from active assignment history',
      bed.currentPatientId?.toHexString() ??
        null,
      expectedPatientId,
    );

    compare(
      'BED_HOLD_PROJECTION_MISMATCH',
      'The active hold projection differs from active hold history',
      bed.activeHoldId?.toHexString() ??
        null,
      expectedHoldId,
    );

    compare(
      'BED_OPERATIONAL_STATUS_MISMATCH',
      'The operational status differs from active hold or assignment state',
      bed.operationalStatus,
      expectedStatus,
    );

    if (
      issues.length ===
        0 ||
      input.dryRun
    ) {
      return {
        bedId,

        admissionId:
          expectedAdmissionId,

        assignmentId:
          expectedAssignmentId,

        holdId:
          expectedHoldId,

        issues,

        repaired:
          false,
      };
    }

    const occurredAt =
      this.support.dependencies
        .clock.now();

    const repaired =
      await this.operations
        .projectBedState(
          actor.facilityId,
          bedId,
          input.expectedBedVersion,
          {
            operationalStatus:
              expectedStatus,

            operationalStatusChangedAt:
              occurredAt,

            operationalStatusChangedBy:
              toObjectId(
                actor.userId,
                'actorUserId',
              ),

            operationalStatusReasonCode:
              'RECOVERY',

            operationalStatusReason:
              this.support.displayText(
                input.reason,
              ),

            currentAdmissionId:
              expectedAdmissionId ===
              null
                ? null
                : toObjectId(
                    expectedAdmissionId,
                    'admissionId',
                  ),

            currentAssignmentId:
              expectedAssignmentId ===
              null
                ? null
                : toObjectId(
                    expectedAssignmentId,
                    'assignmentId',
                  ),

            currentPatientId:
              expectedPatientId ===
              null
                ? null
                : toObjectId(
                    expectedPatientId,
                    'patientId',
                  ),

            activeHoldId:
              expectedHoldId ===
              null
                ? null
                : toObjectId(
                    expectedHoldId,
                    'bedHoldId',
                  ),

            updatedBy:
              toObjectId(
                actor.userId,
                'actorUserId',
              ),
          },
        );

    if (
      repaired ===
      null
    ) {
      throw new InpatientBedConcurrencyError();
    }

    await this.support.dependencies.audit.append({
      transactionId:
        `reconcile:${actor.correlationId}`,

      deduplicationKey:
        `reconcile:${bedId}:${input.expectedBedVersion}`,

      action:
        'inpatient.bed.state_reconciled',

      entityType:
        'Bed',

      entityId:
        bedId,

      ...this.support.auditActorFields(
        actor,
      ),

      occurredAt,

      reason:
        input.reason,

      before: {
        operationalStatus:
          bed.operationalStatus,

        currentAdmissionId:
          bed.currentAdmissionId?.toHexString() ??
          null,

        currentAssignmentId:
          bed.currentAssignmentId?.toHexString() ??
          null,

        activeHoldId:
          bed.activeHoldId?.toHexString() ??
          null,
      },

      after: {
        operationalStatus:
          repaired.operationalStatus,

        currentAdmissionId:
          repaired.currentAdmissionId?.toHexString() ??
          null,

        currentAssignmentId:
          repaired.currentAssignmentId?.toHexString() ??
          null,

        activeHoldId:
          repaired.activeHoldId?.toHexString() ??
          null,
      },

      metadata: {
        issues,
      },
    });

    return {
      bedId,

      admissionId:
        expectedAdmissionId,

      assignmentId:
        expectedAssignmentId,

      holdId:
        expectedHoldId,

      issues,

      repaired:
        true,
    };
  }
}