import {
  InactiveRegistrationContextError,
  QueueDefinitionNotFoundError,
} from '../registration-queue.errors.js';

import type {
  PublicQueueDisplayQuery,
  QueuePublicDisplayEntry,
  QueuePublicDisplayResult,
} from '../registration-queue.query.types.js';

import type {
  RegistrationQueueReadRepository,
} from '../repositories/registration-queue-read.repository.js';

function dateString(
  value: Date | null,
): string | null {
  return value?.toISOString() ??
    null;
}

export class QueuePublicDisplayService {
  public constructor(
    private readonly repository:
      RegistrationQueueReadRepository,

    private readonly clock: {
      now(): Date;
    } = {
      now(): Date {
        return new Date();
      },
    },
  ) {}

  public async getDisplay(
    facilityId: string,
    query: PublicQueueDisplayQuery,
  ): Promise<QueuePublicDisplayResult> {
    const definition =
      await this.repository
        .findQueueDefinition(
          facilityId,
          query.queueDefinitionId,
        );

    if (definition === null) {
      throw new QueueDefinitionNotFoundError();
    }

    if (
      definition.status !==
        'ACTIVE' ||
      !definition.publicDisplayEnabled
    ) {
      throw new InactiveRegistrationContextError(
        'Public queue display',
      );
    }

    const entries =
      await this.repository
        .findPublicDisplayEntries(
          facilityId,
          query.serviceDate,
          query.queueDefinitionId,
          query.maximumEntries,
        );

    const counters =
      await this.repository
        .loadPublicCounters(
          facilityId,
          entries,
        );

    const projected:
      QueuePublicDisplayEntry[] =
      entries.map(
        (entry) => {
          const counterId =
            entry.assignedCounterId
              ?.toHexString() ??
            null;

          const counter =
            counterId === null
              ? undefined
              : counters.get(
                  counterId,
                );

          const revealCounter =
            definition.publicDisplayMode ===
            'TOKEN_AND_COUNTER';

          return {
            queueEntryId:
              entry.queueEntryId,

            tokenLabel:
              entry.tokenLabel,

            status:
              entry.status,

            queueDisplayLabel:
              definition.displayLabel,

            counterCode:
              revealCounter
                ? counter?.code ??
                  null
                : null,

            counterName:
              revealCounter
                ? counter?.name ??
                  null
                : null,

            calledAt:
              dateString(
                entry.calledAt,
              ),

            servingAt:
              dateString(
                entry.servingAt,
              ),

            lastStatusChangedAt:
              entry.lastStatusChangedAt.toISOString(),
          };
        },
      );

    return {
      generatedAt:
        this.clock
          .now()
          .toISOString(),

      facilityId,

      serviceDate:
        query.serviceDate,

      queueDefinitionId:
        definition._id.toHexString(),

      queueCode:
        definition.code,

      queueDisplayLabel:
        definition.displayLabel,

      publicDisplayMode:
        definition.publicDisplayMode,

      entries:
        projected,
    };
  }
}