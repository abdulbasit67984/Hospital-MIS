import {
  toObjectId,
} from '@hospital-mis/database';

import {
  InpatientBedConcurrencyError,
} from '../inpatient.errors.js';

import type {
  InpatientBedOperationRepositoryPort,
} from '../inpatient-bed-operations.ports.js';

import {
  INPATIENT_BED_OPERATION_EVENTS,
  INPATIENT_BED_OPERATION_REALTIME_EVENTS,
} from '../inpatient-bed-operations.constants.js';

import {
  InpatientCommandService,
} from './inpatient-command.service.js';

export class InpatientBedHoldExpiryService {
  public constructor(
    private readonly support:
      InpatientCommandService,

    private readonly operations:
      InpatientBedOperationRepositoryPort,
  ) {}

  public async expireFacilityHolds(
    facilityId:
      string,

    systemActorUserId:
      string,

    correlationId:
      string,

    limit =
      100,
  ): Promise<number> {
    const occurredAt =
      this.support.dependencies
        .clock.now();

    const expired =
      await this.operations
        .expireActiveHolds(
          facilityId,
          occurredAt,
          systemActorUserId,
          limit,
        );

    let releasedBeds =
      0;

    for (
      const hold of
      expired
    ) {
      const bed =
        await this.support.locations
          .findBedById(
            facilityId,
            hold.bedId.toHexString(),
          );

      if (
        bed ===
          null ||
        bed.activeHoldId?.toHexString() !==
          hold._id.toHexString() ||
        bed.currentAssignmentId !==
          null
      ) {
        continue;
      }

      const projected =
        await this.operations
          .projectBedState(
            facilityId,
            bed._id.toHexString(),
            bed.version,
            {
              operationalStatus:
                'AVAILABLE',

              operationalStatusChangedAt:
                occurredAt,

              operationalStatusChangedBy:
                toObjectId(
                  systemActorUserId,
                  'systemActorUserId',
                ),

              operationalStatusReasonCode:
                'RESERVATION_EXPIRED',

              operationalStatusReason:
                'The active bed hold expired',

              activeHoldId:
                null,

              updatedBy:
                toObjectId(
                  systemActorUserId,
                  'systemActorUserId',
                ),
            },
          );

      if (
        projected ===
        null
      ) {
        throw new InpatientBedConcurrencyError();
      }

      releasedBeds +=
        1;

      await this.support.dependencies.outbox.enqueue({
        transactionId:
          `hold-expiry:${hold._id.toHexString()}`,

        deduplicationKey:
          `hold-expiry:${hold._id.toHexString()}`,

        eventType:
          INPATIENT_BED_OPERATION_EVENTS
            .BED_HOLD_EXPIRED,

        aggregateType:
          'BedHold',

        aggregateId:
          hold._id.toHexString(),

        actorUserId:
          systemActorUserId,

        facilityId,

        correlationId,

        occurredAt,

        payload: {
          bedHoldId:
            hold._id.toHexString(),

          bedId:
            bed._id.toHexString(),

          admissionId:
            hold.admissionId?.toHexString() ??
            null,

          expiredAt:
            occurredAt.toISOString(),
        },
      });

      await this.support.dependencies.realtime.publish({
        eventType:
          INPATIENT_BED_OPERATION_REALTIME_EVENTS
            .BED_HOLD_WORKLIST_CHANGED,

        facilityId,

        wardId:
          bed.wardId.toHexString(),

        roomId:
          bed.roomId.toHexString(),

        bedId:
          bed._id.toHexString(),

        admissionId:
          hold.admissionId?.toHexString(),

        payload: {
          bedHoldId:
            hold._id.toHexString(),

          status:
            'EXPIRED',

          bedStatus:
            'AVAILABLE',
        },
      });
    }

    return releasedBeds;
  }
}