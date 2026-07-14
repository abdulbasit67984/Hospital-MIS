export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type CorrelationId = Brand<string, 'CorrelationId'>;
export type FacilityId = Brand<string, 'FacilityId'>;
export type PublicPatientId = Brand<string, 'PublicPatientId'>;
export type UserId = Brand<string, 'UserId'>;

export type HealthStatus = 'ok' | 'degraded';
