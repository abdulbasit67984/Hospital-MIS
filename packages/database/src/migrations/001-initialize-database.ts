import type { Migration } from './types.js';
import { collectionSpecs } from '../catalog/collection-specs.js';
import { jsonSchemaFor } from '../catalog/json-schema.js';
import { schemaForCollection } from '../models/registry.js';
export const initializeDatabase: Migration = {
  id: '001-initialize-database',
  description: 'Create all Hospital MIS collections, validators, and indexes',
  async up(db) {
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name),
    );
    for (const spec of collectionSpecs) {
      const validator = { $jsonSchema: jsonSchemaFor(spec.name) };
      if (!existing.has(spec.name))
        await db.createCollection(spec.name, {
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      else
        await db.command({
          collMod: spec.name,
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      const schema = schemaForCollection(spec.name);
      const indexes = schema.indexes();
      if (indexes.length)
        await db
          .collection(spec.name)
          .createIndexes(indexes.map(([key, options]) => ({ key, ...options })) as never[]);
    }
    await db.collection('_migrations').createIndex({ id: 1 }, { unique: true });
  },
};
