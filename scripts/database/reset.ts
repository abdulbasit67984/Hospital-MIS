import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '@hospital-mis/database';
if (process.env['ALLOW_DATABASE_RESET'] !== 'true')
  throw new Error('Set ALLOW_DATABASE_RESET=true to reset the database');
const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/hospital_mis';
await connectDatabase({ uri, appName: 'hospital-mis-reset', serverSelectionTimeoutMs: 10000 });
if (!mongoose.connection.db) throw new Error('MongoDB not ready');
await mongoose.connection.db.dropDatabase();
console.log('Database reset complete');
await disconnectDatabase();
