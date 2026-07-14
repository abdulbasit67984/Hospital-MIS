export function createCorrelationIdForTest(seed = '00000000-0000-4000-8000-000000000001'): string {
  return seed;
}

export function eventuallyOptions(): { timeout: number; interval: number } {
  return { timeout: 5_000, interval: 50 };
}
