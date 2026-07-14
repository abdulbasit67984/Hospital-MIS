import { Schema, type SchemaDefinition } from 'mongoose';
export const objectId = Schema.Types.ObjectId;
export const decimal128 = Schema.Types.Decimal128;
export const commonFields: SchemaDefinition = {
  facilityId: { type: objectId, required: true, index: true },
  schemaVersion: { type: Number, required: true, default: 1, min: 1 },
  version: { type: Number, required: true, default: 0, min: 0 },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
};
export function baseSchema(
  definition: SchemaDefinition,
  options: { collection: string; strict?: boolean },
) {
  const schema = new Schema(
    { ...commonFields, ...definition },
    {
      collection: options.collection,
      strict: options.strict ?? true,
      timestamps: false,
      versionKey: false,
    },
  );

  schema.pre('save', function () {
    this['updatedAt'] = new Date();
  });

  return schema;
}
