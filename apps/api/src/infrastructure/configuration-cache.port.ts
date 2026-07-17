export interface ConfigurationCacheEntry<T> {
  value: T;
  expiresAt: Date;
}

export interface ConfigurationCachePort {
  get<T>(
    key: string,
  ): Promise<T | null>;

  set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void>;

  delete(
    key: string,
  ): Promise<void>;

  deleteMany(
    keys: readonly string[],
  ): Promise<void>;

  deleteByPrefix(
    prefix: string,
  ): Promise<void>;

  clear(): Promise<void>;
}