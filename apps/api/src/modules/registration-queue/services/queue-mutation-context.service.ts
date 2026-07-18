import {
  InactiveRegistrationContextError,
  QueueDefinitionNotFoundError,
  RegistrationContextMismatchError,
  ServiceCounterNotFoundError,
} from '../registration-queue.errors.js';

import type {
  QueueDefinitionRecord,
  ServiceCounterRecord,
} from '../registration-queue.types.js';

import type {
  RegistrationProviderContextRecord,
} from '../repositories/registration-context.repository.js';

import {
  RegistrationContextRepository,
} from '../repositories/registration-context.repository.js';

export interface QueueMutationContextReader {
  findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<QueueDefinitionRecord | null>;

  findProvider(
    facilityId: string,
    providerId: string,
  ): Promise<RegistrationProviderContextRecord | null>;

  findCounter(
    facilityId: string,
    counterId: string,
  ): Promise<ServiceCounterRecord | null>;
}

export interface ResolvedQueueMutationContext {
  queueDefinition: QueueDefinitionRecord;
  provider: RegistrationProviderContextRecord | null;
  counter: ServiceCounterRecord | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
}

function objectIdString(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ??
    null;
}

function sameOptionalObjectId(
  left: {
    toHexString(): string;
  } | null,
  right: {
    toHexString(): string;
  } | null,
): boolean {
  return objectIdString(
    left,
  ) ===
    objectIdString(
      right,
    );
}

export class QueueMutationContextService {
  public constructor(
    private readonly repository:
      QueueMutationContextReader =
        new RegistrationContextRepository(),
  ) {}

  public async resolve(
    input: Readonly<{
      facilityId: string;
      queueDefinitionId: string;
      currentProviderId: string | null;
      currentCounterId: string | null;
      requestedProviderId?: string | null;
      requestedCounterId?: string | null;
    }>,
  ): Promise<ResolvedQueueMutationContext> {
    const queueDefinition =
      await this.repository.findQueueDefinition(
        input.facilityId,
        input.queueDefinitionId,
      );

    if (queueDefinition === null) {
      throw new QueueDefinitionNotFoundError();
    }

    if (
      queueDefinition.status !==
      'ACTIVE'
    ) {
      throw new InactiveRegistrationContextError(
        'Queue definition',
      );
    }

    const assignedProviderId =
      input.requestedProviderId !==
      undefined
        ? input.requestedProviderId
        : input.currentProviderId ??
          objectIdString(
            queueDefinition.providerId,
          );

    if (
      queueDefinition.providerId !==
        null &&
      assignedProviderId !==
        queueDefinition.providerId.toHexString()
    ) {
      throw new RegistrationContextMismatchError(
        'The selected queue is restricted to another provider',
      );
    }

    const provider =
      assignedProviderId ===
      null
        ? null
        : await this.repository.findProvider(
            input.facilityId,
            assignedProviderId,
          );

    if (
      assignedProviderId !==
        null &&
      provider === null
    ) {
      throw new RegistrationContextMismatchError(
        'The selected provider was not found in the active facility',
      );
    }

    if (provider !== null) {
      if (
        !provider.isActive ||
        provider.employmentStatus !==
          'ACTIVE'
      ) {
        throw new InactiveRegistrationContextError(
          'Queue provider',
        );
      }

      if (!provider.isClinical) {
        throw new RegistrationContextMismatchError(
          'The selected provider is not clinical staff',
        );
      }

      if (
        provider.departmentId !==
          null &&
        provider.departmentId.toHexString() !==
          queueDefinition.departmentId.toHexString()
      ) {
        throw new RegistrationContextMismatchError(
          'The selected provider does not belong to the queue department',
        );
      }
    }

    const assignedCounterId =
      input.requestedCounterId !==
      undefined
        ? input.requestedCounterId
        : input.currentCounterId;

    const counter =
      assignedCounterId ===
      null
        ? null
        : await this.repository.findCounter(
            input.facilityId,
            assignedCounterId,
          );

    if (
      assignedCounterId !==
        null &&
      counter === null
    ) {
      throw new ServiceCounterNotFoundError();
    }

    if (counter !== null) {
      if (counter.status !== 'ACTIVE') {
        throw new InactiveRegistrationContextError(
          'Service counter',
        );
      }

      if (
        counter.departmentId.toHexString() !==
        queueDefinition.departmentId.toHexString()
      ) {
        throw new RegistrationContextMismatchError(
          'The selected counter does not belong to the queue department',
        );
      }

      if (
        counter.clinicId !==
          null &&
        !sameOptionalObjectId(
          counter.clinicId,
          queueDefinition.clinicId,
        )
      ) {
        throw new RegistrationContextMismatchError(
          'The selected counter does not belong to the queue clinic',
        );
      }

      if (
        counter.servicePointId !==
          null &&
        !sameOptionalObjectId(
          counter.servicePointId,
          queueDefinition.servicePointId,
        )
      ) {
        throw new RegistrationContextMismatchError(
          'The selected counter does not belong to the queue service point',
        );
      }

      if (
        !counter.queueDefinitionIds.some(
          (queueId) =>
            queueId.toHexString() ===
            queueDefinition._id.toHexString(),
        )
      ) {
        throw new RegistrationContextMismatchError(
          'The selected counter is not configured to serve this queue',
        );
      }
    }

    return {
      queueDefinition,
      provider,
      counter,
      assignedProviderId,
      assignedCounterId,
    };
  }
}