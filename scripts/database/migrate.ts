import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, runMigrations } from '@hospital-mis/database';
const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/hospital_mis';
await connectDatabase({ uri, appName: 'hospital-mis-migrate', serverSelectionTimeoutMs: 10000 });
if (!mongoose.connection.db) throw new Error('MongoDB not ready');
await runMigrations(mongoose.connection.db);
console.log('Database migrations complete');
await disconnectDatabase();
