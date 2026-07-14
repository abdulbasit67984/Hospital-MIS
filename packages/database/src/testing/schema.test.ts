import { describe, expect, it } from 'vitest';
import { collectionSpecs } from '../catalog/collection-specs.js';
import { criticalSchemas } from '../models/critical.js';
import { jsonSchemaFor } from '../catalog/json-schema.js';
describe('database catalog', () => {
  it('has unique collection names', () => {
    expect(new Set(collectionSpecs.map((x) => x.name)).size).toBe(collectionSpecs.length);
  });
  it('defines all critical schemas', () => {
    expect(Object.keys(criticalSchemas).length).toBeGreaterThanOrEqual(18);
  });
  it('builds validators for all collections', () => {
    for (const spec of collectionSpecs)
      expect(jsonSchemaFor(spec.name)).toHaveProperty('bsonType', 'object');
  });
  it('has critical unique indexes', () => {
    expect(criticalSchemas.patients.indexes().some(([, o]) => o.unique)).toBe(true);
    expect(criticalSchemas.queueTokens.indexes().some(([, o]) => o.unique)).toBe(true);
    expect(criticalSchemas.stockBalances.indexes().some(([, o]) => o.unique)).toBe(true);
  });
});
