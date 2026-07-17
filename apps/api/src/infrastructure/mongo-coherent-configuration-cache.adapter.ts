import type {
  Db,
} from '@hospital-mis/database';

import type {
  ConfigurationCachePort,
} from './configuration-cache.port.js';

import {
  InMemoryConfigurationCacheAdapter,
} from './in-memory-configuration-cache.adapter.js';

import type {
  LeasedOutboxEvent,
} from './outbox.service.js';

interface CacheEpochDocument {
  _id:
    string;

  epoch:
    number;

  createdAt:
    Date;

  updatedAt:
    Date;
}

export interface MongoCoherentConfigurationCacheOptions {
  maximumEntries?:
    number;

  epochRefreshMilliseconds?:
    number;

  namespace?:
    string;

  now?:
    () => number;
}

const configurationEventPrefixes = [
  'facility.',
  'department.',
  'configuration.',
] as const;

export class MongoCoherentConfigurationCacheAdapter
implements ConfigurationCachePort {
  readonly #local:
    InMemoryConfigurationCacheAdapter;

  readonly #epochRefreshMilliseconds:
    number;

  readonly #namespace:
    string;

  readonly #now:
    () => number;

  #localEpoch:
    number | null =
    null;

  #lastEpochCheckAt =
    0;

  #synchronization:
    Promise<void> | null =
    null;

  public constructor(
    private readonly database:
      Db,

    options:
      MongoCoherentConfigurationCacheOptions = {},
  ) {
    this.#local =
      new InMemoryConfigurationCacheAdapter({
        maximumEntries:
          options.maximumEntries,
      });

    this.#epochRefreshMilliseconds =
      options.epochRefreshMilliseconds ??
      1_000;

    this.#namespace =
      options.namespace ??
      'facility-configuration';

    this.#now =
      options.now ??
      Date.now;

    if (
      !Number.isSafeInteger(
        this.#epochRefreshMilliseconds,
      ) ||
      this.#epochRefreshMilliseconds <
        0
    ) {
      throw new TypeError(
        'Configuration cache epoch refresh interval must be a non-negative safe integer',
      );
    }

    if (
      this.#namespace.trim().length ===
      0
    ) {
      throw new TypeError(
        'Configuration cache namespace is required',
      );
    }
  }

  public async get<T>(
    key:
      string,
  ): Promise<T | null> {
    await this.synchronizeEpoch();

    return this.#local
      .get<T>(
        key,
      );
  }

  public async set<T>(
    key:
      string,

    value:
      T,

    ttlSeconds:
      number,
  ): Promise<void> {
    await this.synchronizeEpoch();

    await this.#local
      .set(
        key,
        value,
        ttlSeconds,
      );
  }

  public async delete(
    key:
      string,
  ): Promise<void> {
    await this.#local
      .delete(
        key,
      );

    await this.bumpSharedEpoch();
  }

  public async deleteMany(
    keys:
      readonly string[],
  ): Promise<void> {
    await this.#local
      .deleteMany(
        keys,
      );

    await this.bumpSharedEpoch();
  }

  public async deleteByPrefix(
    prefix:
      string,
  ): Promise<void> {
    await this.#local
      .deleteByPrefix(
        prefix,
      );

    await this.bumpSharedEpoch();
  }

  public async clear():
    Promise<void> {
    await this.#local.clear();

    await this.bumpSharedEpoch();
  }

  public async handleOutboxEvent(
    event:
      LeasedOutboxEvent,
  ): Promise<boolean> {
    const relevant =
      configurationEventPrefixes
        .some(
          (
            prefix,
          ) =>
            event.eventType.startsWith(
              prefix,
            ),
        );

    if (
      !relevant
    ) {
      return false;
    }

    /*
     * Event payloads can evolve independently. A namespace-level epoch keeps
     * invalidation safe even when a future event omits an entity-specific key.
     */
    await this.#local.clear();

    await this.bumpSharedEpoch();

    return true;
  }

  private async synchronizeEpoch(
    force =
      false,
  ): Promise<void> {
    const now =
      this.#now();

    if (
      !force &&
      this.#localEpoch !==
        null &&
      now -
        this.#lastEpochCheckAt <
        this.#epochRefreshMilliseconds
    ) {
      return;
    }

    if (
      this.#synchronization !==
      null
    ) {
      await this.#synchronization;
      return;
    }

    this.#synchronization =
      this.performEpochSynchronization(
        now,
      );

    try {
      await this.#synchronization;
    } finally {
      this.#synchronization =
        null;
    }
  }

  private async performEpochSynchronization(
    checkedAt:
      number,
  ): Promise<void> {
    const epoch =
      await this.readOrCreateEpoch();

    if (
      this.#localEpoch !==
        null &&
      epoch !==
        this.#localEpoch
    ) {
      await this.#local.clear();
    }

    this.#localEpoch =
      epoch;

    this.#lastEpochCheckAt =
      checkedAt;
  }

  private async readOrCreateEpoch():
    Promise<number> {
    const collection =
      this.database
        .collection<
          CacheEpochDocument
        >(
          'configurationCacheEpochs',
        );

    const existing =
      await collection.findOne({
        _id:
          this.#namespace,
      });

    if (
      existing !==
      null
    ) {
      return existing.epoch;
    }

    const now =
      new Date();

    const created =
      await collection
        .findOneAndUpdate(
          {
            _id:
              this.#namespace,
          },
          {
            $setOnInsert: {
              epoch:
                0,

              createdAt:
                now,

              updatedAt:
                now,
            },
          },
          {
            upsert:
              true,

            returnDocument:
              'after',
          },
        );

    if (
      created ===
      null
    ) {
      throw new Error(
        'Configuration cache epoch could not be initialized',
      );
    }

    return created.epoch;
  }

  private async bumpSharedEpoch():
    Promise<void> {
    const now =
      new Date();

    const updated =
      await this.database
        .collection<
          CacheEpochDocument
        >(
          'configurationCacheEpochs',
        )
        .findOneAndUpdate(
          {
            _id:
              this.#namespace,
          },
          {
            $inc: {
              epoch:
                1,
            },

            $set: {
              updatedAt:
                now,
            },

            $setOnInsert: {
              createdAt:
                now,
            },
          },
          {
            upsert:
              true,

            returnDocument:
              'after',
          },
        );

    if (
      updated ===
      null
    ) {
      throw new Error(
        'Configuration cache epoch could not be advanced',
      );
    }

    this.#localEpoch =
      updated.epoch;

    this.#lastEpochCheckAt =
      this.#now();
  }
}