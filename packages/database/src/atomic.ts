import type {
  Collection,
  Filter,
  UpdateFilter,
  WithId,
} from 'mongodb';

import {
  ConcurrencyConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export async function requireDocument<T extends object>(
  collection:
    Collection<T>,
  filter:
    Filter<T>,
  message:
    string =
      'The requested record was not found',
): Promise<WithId<T>> {
  const document =
    await collection.findOne(
      filter,
    );

  if (
    document === null
  ) {
    throw new ResourceNotFoundError(
      message,
    );
  }

  return document;
}

export async function conditionalUpdateOne<
  T extends object,
>(
  collection:
    Collection<T>,

  filter:
    Filter<T>,

  update:
    UpdateFilter<T>,

  conflictMessage:
    string =
      'The record changed before the operation completed',
): Promise<void> {
  const result =
    await collection.updateOne(
      filter,
      update,
    );

  if (
    result.matchedCount !== 1 ||
    result.modifiedCount !== 1
  ) {
    throw new ConcurrencyConflictError(
      conflictMessage,
    );
  }
}

export async function versionedUpdateOne<
  T extends {
    version: number;
  },
>(
  collection:
    Collection<T>,

  filter:
    Filter<T>,

  expectedVersion:
    number,

  update:
    UpdateFilter<T>,

  conflictMessage?:
    string,
): Promise<void> {
  const versionedFilter = {
    ...filter,
    version:
      expectedVersion,
  } as Filter<T>;

  const versionedUpdate = {
    ...update,

    $inc: {
      ...(update.$inc ?? {}),
      version: 1,
    },

    $currentDate: {
      ...(update.$currentDate ?? {}),
      updatedAt: true,
    },
  } as UpdateFilter<T>;

  await conditionalUpdateOne(
    collection,
    versionedFilter,
    versionedUpdate,
    conflictMessage,
  );
}