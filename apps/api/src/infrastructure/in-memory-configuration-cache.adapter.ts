import type {
  ConfigurationCacheEntry,
  ConfigurationCachePort,
} from './configuration-cache.port.js';

export interface InMemoryConfigurationCacheOptions {
  maximumEntries?: number;
  now?: () => Date;
}

export class InMemoryConfigurationCacheAdapter
  implements ConfigurationCachePort
{
  readonly #entries =
    new Map<
      string,
      ConfigurationCacheEntry<unknown>
    >();

  readonly #maximumEntries: number;

  readonly #now: () => Date;

  public constructor(
    options:
      InMemoryConfigurationCacheOptions = {},
  ) {
    this.#maximumEntries =
      options.maximumEntries ?? 10_000;

    this.#now =
      options.now ?? (() => new Date());

    if (
      !Number.isSafeInteger(
        this.#maximumEntries,
      ) ||
      this.#maximumEntries <= 0
    ) {
      throw new TypeError(
        'maximumEntries must be a positive safe integer',
      );
    }
  }

  public async get<T>(
    key: string,
  ): Promise<T | null> {
    const entry =
      this.#entries.get(key);

    if (entry === undefined) {
      return null;
    }

    if (
      entry.expiresAt.getTime() <=
      this.#now().getTime()
    ) {
      this.#entries.delete(key);

      return null;
    }

    return entry.value as T;
  }

  public async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    if (
      !Number.isFinite(ttlSeconds) ||
      ttlSeconds < 0
    ) {
      throw new TypeError(
        'ttlSeconds must be a non-negative finite number',
      );
    }

    if (ttlSeconds === 0) {
      this.#entries.delete(key);

      return;
    }

    this.#removeExpiredEntries();

    if (
      !this.#entries.has(key) &&
      this.#entries.size >=
        this.#maximumEntries
    ) {
      const oldestKey =
        this.#entries.keys().next()
          .value as
          | string
          | undefined;

      if (oldestKey !== undefined) {
        this.#entries.delete(
          oldestKey,
        );
      }
    }

    this.#entries.delete(key);

    this.#entries.set(
      key,
      {
        value,
        expiresAt: new Date(
          this.#now().getTime() +
            ttlSeconds * 1000,
        ),
      },
    );
  }

  public async delete(
    key: string,
  ): Promise<void> {
    this.#entries.delete(key);
  }

  public async deleteMany(
    keys: readonly string[],
  ): Promise<void> {
    for (const key of keys) {
      this.#entries.delete(key);
    }
  }

  public async deleteByPrefix(
    prefix: string,
  ): Promise<void> {
    for (
      const key of
      this.#entries.keys()
    ) {
      if (key.startsWith(prefix)) {
        this.#entries.delete(key);
      }
    }
  }

  public async clear():
    Promise<void> {
    this.#entries.clear();
  }

  public size(): number {
    this.#removeExpiredEntries();

    return this.#entries.size;
  }

  #removeExpiredEntries(): void {
    const now =
      this.#now().getTime();

    for (
      const [
        key,
        entry,
      ] of this.#entries
    ) {
      if (
        entry.expiresAt.getTime() <=
        now
      ) {
        this.#entries.delete(key);
      }
    }
  }
}