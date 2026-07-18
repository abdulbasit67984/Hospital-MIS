import type {
  QueueDefinitionRecord,
  QueueTokenRecord,
} from '../registration-queue.types.js';

import type {
  QueueOperationalMetricsProjection,
  QueuePositionProjection,
} from '../registration-queue.query.types.js';

const activeWaitingStatuses =
  new Set<
    QueueTokenRecord['status']
  >([
    'WAITING',
    'CALLED',
    'SKIPPED',
  ]);

function differenceMinutes(
  later: Date,
  earlier: Date,
): number {
  return Math.max(
    0,
    (
      later.getTime() -
      earlier.getTime()
    ) /
      60_000,
  );
}

function roundedAverage(
  values: readonly number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  const total =
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    );

  return Math.round(
    (
      total /
      values.length
    ) *
      10,
  ) / 10;
}

export class QueueWaitEstimateService {
  public positionForEntry(
    input: Readonly<{
      entry: QueueTokenRecord;
      definition: QueueDefinitionRecord;
      patientsAhead: number;
      now: Date;
    }>,
  ): QueuePositionProjection {
    const position =
      input.patientsAhead +
      1;

    const estimatedWaitMinutes =
      input.entry.status ===
        'CALLED' ||
      input.entry.status ===
        'SERVING'
        ? 0
        : input.patientsAhead *
          input.definition
            .estimatedServiceMinutes;

    const estimatedServiceAt =
      activeWaitingStatuses.has(
        input.entry.status,
      )
        ? new Date(
            input.now.getTime() +
              estimatedWaitMinutes *
                60_000,
          ).toISOString()
        : null;

    return {
      queueEntryId:
        input.entry.queueEntryId,

      position,

      patientsAhead:
        input.patientsAhead,

      estimatedWaitMinutes,

      estimatedServiceAt,

      calculatedAt:
        input.now.toISOString(),
    };
  }

  public positionsForOrderedEntries(
    input: Readonly<{
      entries: readonly QueueTokenRecord[];
      definitions: ReadonlyMap<
        string,
        QueueDefinitionRecord
      >;
      now: Date;
    }>,
  ): Map<
    string,
    QueuePositionProjection
  > {
    const result =
      new Map<
        string,
        QueuePositionProjection
      >();

    const activeByQueue =
      new Map<
        string,
        QueueTokenRecord[]
      >();

    for (const entry of input.entries) {
      if (
        !activeWaitingStatuses.has(
          entry.status,
        )
      ) {
        continue;
      }

      const key =
        entry.queueDefinitionId.toHexString();

      const existing =
        activeByQueue.get(
          key,
        ) ??
        [];

      existing.push(
        entry,
      );

      activeByQueue.set(
        key,
        existing,
      );
    }

    for (
      const [
        queueDefinitionId,
        entries,
      ] of activeByQueue
    ) {
      const definition =
        input.definitions.get(
          queueDefinitionId,
        );

      if (definition === undefined) {
        continue;
      }

      const ordered =
        [
          ...entries,
        ].sort(
          (
            left,
            right,
          ) => {
            if (
              left.priorityScore !==
              right.priorityScore
            ) {
              return (
                right.priorityScore -
                left.priorityScore
              );
            }

            const queuedDifference =
              left.queuedAt.getTime() -
              right.queuedAt.getTime();

            if (
              queuedDifference !==
              0
            ) {
              return queuedDifference;
            }

            if (
              left.tokenNumber !==
              right.tokenNumber
            ) {
              return (
                left.tokenNumber -
                right.tokenNumber
              );
            }

            return left._id
              .toHexString()
              .localeCompare(
                right._id.toHexString(),
              );
          },
        );

      ordered.forEach(
        (
          entry,
          index,
        ) => {
          result.set(
            entry.queueEntryId,
            this.positionForEntry({
              entry,

              definition,

              patientsAhead:
                index,

              now:
                input.now,
            }),
          );
        },
      );
    }

    return result;
  }

  public operationalMetrics(
    input: Readonly<{
      serviceDate: string;
      entries: readonly QueueTokenRecord[];
      now: Date;
    }>,
  ): QueueOperationalMetricsProjection {
    const statusCounts =
      new Map<
        QueueTokenRecord['status'],
        number
      >();

    const waitMinutes:
      number[] = [];

    const serviceMinutes:
      number[] = [];

    const currentWaitMinutes:
      number[] = [];

    for (const entry of input.entries) {
      statusCounts.set(
        entry.status,
        (
          statusCounts.get(
            entry.status,
          ) ??
          0
        ) + 1,
      );

      const serviceStart =
        entry.servingAt ??
        entry.calledAt;

      if (serviceStart !== null) {
        waitMinutes.push(
          differenceMinutes(
            serviceStart,
            entry.queuedAt,
          ),
        );
      }

      if (
        entry.servingAt !==
          null &&
        entry.completedAt !==
          null
      ) {
        serviceMinutes.push(
          differenceMinutes(
            entry.completedAt,
            entry.servingAt,
          ),
        );
      }

      if (
        activeWaitingStatuses.has(
          entry.status,
        )
      ) {
        currentWaitMinutes.push(
          differenceMinutes(
            input.now,
            entry.queuedAt,
          ),
        );
      }
    }

    const count = (
      status:
        QueueTokenRecord['status'],
    ): number =>
      statusCounts.get(
        status,
      ) ??
      0;

    return {
      serviceDate:
        input.serviceDate,

      totalEntries:
        input.entries.length,

      activeEntries:
        count(
          'WAITING',
        ) +
        count(
          'CALLED',
        ) +
        count(
          'SERVING',
        ) +
        count(
          'SKIPPED',
        ),

      waitingEntries:
        count(
          'WAITING',
        ),

      calledEntries:
        count(
          'CALLED',
        ),

      servingEntries:
        count(
          'SERVING',
        ),

      skippedEntries:
        count(
          'SKIPPED',
        ),

      completedEntries:
        count(
          'COMPLETED',
        ),

      transferredEntries:
        count(
          'TRANSFERRED',
        ),

      cancelledEntries:
        count(
          'CANCELLED',
        ),

      noShowEntries:
        count(
          'NO_SHOW',
        ),

      averageWaitMinutes:
        roundedAverage(
          waitMinutes,
        ),

      averageServiceMinutes:
        roundedAverage(
          serviceMinutes,
        ),

      longestCurrentWaitMinutes:
        currentWaitMinutes.length ===
        0
          ? null
          : Math.round(
              Math.max(
                ...currentWaitMinutes,
              ) *
                10,
            ) / 10,
    };
  }
}