import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase, registerAllModels } from '@hospital-mis/database';
const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/hospital_mis';
await connectDatabase({ uri, appName: 'hospital-mis-seed', serverSelectionTimeoutMs: 10000 });
const models = registerAllModels();
const facilities = models['facilities'];
const permissionModel = models['permissions'];
if (!facilities || !permissionModel) throw new Error('Required seed models are not registered');
const facilityId = new Types.ObjectId('64b000000000000000000001');
await facilities.updateOne(
  { _id: facilityId },
  {
    $setOnInsert: {
      facilityId,
      schemaVersion: 1,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {
        code: 'H001',
        name: 'Fictional City Hospital',
        timezone: 'Asia/Karachi',
        currency: 'PKR',
      },
    },
  },
  { upsert: true },
);
const permissions = [
  'patients.read',
  'patients.create',
  'encounters.read_assigned',
  'prescriptions.issue',
  'inventory.view_cost',
  'inventory.adjust',
  'billing.invoice.finalize',
  'billing.discount.approve',
  'claims.submit',
  'reports.financial.read',
  'audit.read',
];
for (const key of permissions)
  await permissionModel.updateOne(
    { 'data.key': key },
    {
      $setOnInsert: {
        schemaVersion: 1,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        data: { key, description: key },
      },
    },
    { upsert: true },
  );
console.log('Safe demo seed completed');
await disconnectDatabase();
