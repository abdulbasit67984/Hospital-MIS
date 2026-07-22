import mongoose from 'mongoose';

export type DatabaseConnectionOptions = {
  uri: string;
  appName: string;
  serverSelectionTimeoutMs: number;
};

export type DependencyHealth = {
  status: 'up';
  latencyMs: number;
};

let connectionPromise:
  | Promise<typeof mongoose>
  | undefined;

export async function connectDatabase(
  options: DatabaseConnectionOptions,
): Promise<typeof mongoose> {
  if (
    mongoose.connection.readyState === 1
  ) {
    return mongoose;
  }

  const connectOptions = {
    appName:
      options.appName,

    serverSelectionTimeoutMS:
      options.serverSelectionTimeoutMs,

    maxPoolSize:
      20,

    minPoolSize:
      1,

    retryWrites:
      false,
  } as mongoose.ConnectOptions;

  connectionPromise ??=
    mongoose.connect(
      options.uri,
      connectOptions,
    );

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise =
      undefined;

    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  connectionPromise =
    undefined;

  if (
    mongoose.connection.readyState !== 0
  ) {
    await mongoose.disconnect();
  }
}

export async function pingDatabase(): Promise<DependencyHealth> {
  const database =
    mongoose.connection.db;

  if (
    mongoose.connection.readyState !== 1 ||
    database === undefined
  ) {
    throw new Error(
      'MongoDB connection is not ready',
    );
  }

  const startedAt =
    Date.now();

  await database.command({
    ping:
      1,
  });

  return {
    status:
      'up',

    latencyMs:
      Date.now() - startedAt,
  };
}

export function databaseReadyState(): number {
  return mongoose.connection.readyState;
}

export function nativeDatabase() {
  const database =
    mongoose.connection.db;

  if (
    database === undefined
  ) {
    throw new Error(
      'MongoDB connection is not ready',
    );
  }

  return database;
}

export type {
  Collection,
  Db,
  Filter,
  IndexDescription,
  UpdateFilter,
} from 'mongodb';

export {
  Decimal128,
  ObjectId,
} from 'mongodb';

export * from './atomic.js';
export * from './decimal128.js';
export * from './object-id.js';

export * from './catalog/collection-specs.js';
export * from './catalog/enums.js';
export * from './catalog/json-schema.js';

export * from './models/access-control.js';
export * from './models/audit.js';
export * from './models/auth.js';
export * from './models/common.js';
export * from './models/critical.js';
export * from './models/facility-configuration.js';
export * from './models/patient-guardian.types.js';
export * from './models/registration-queue.types.js';
export * from './models/clinical-emr.types.js';
export * from './models/formulary-prescription.types.js';
export * from './models/laboratory.types.js';
export * from './models/radiology.types.js';
export * from './models/registry.js';
export * from './models/inpatient-nursing.types.js';
export * from './models/inpatient-nursing.model.js';
export * from './models/allergy.model.js';
export * from './models/clinical-note.model.js';
export * from './models/clinical-referral.model.js';
export * from './models/diagnosis.model.js';
export * from './models/encounter.model.js';
export * from './models/vital-sign.model.js';
export * from './models/medicine-catalog.model.js';
export * from './models/prescription.model.js';
export * from './models/laboratory-catalog.model.js';
export * from './models/laboratory-order.model.js';
export * from './models/laboratory-specimen.model.js';
export * from './models/laboratory-result.model.js';
export * from './models/laboratory-critical-result-communication.model.js';
export * from './models/radiology-catalog.model.js';
export * from './models/radiology-order.model.js';
export * from './models/radiology-operations.model.js';
export * from './models/radiology-report.model.js';
export * from './models/department.model.js';
export * from './models/facility.model.js';
export * from './models/guardian.model.js';
export * from './models/patient-guardian.model.js';
export * from './models/patient-identifier.model.js';
export * from './models/patient-merge.model.js';
export * from './models/patient.model.js';
export * from './models/patient-profile.model.js';
export * from './models/opd-context.model.js';
export * from './models/opd-visit.model.js';
export * from './models/queue.model.js';
export * from './models/registration.model.js';
export * from './models/permission.model.js';
export * from './models/setting-definition.model.js';
export * from './models/system-setting.model.js';
export * from './models/system-setting-version.model.js';
export * from './models/role.model.js';
export * from './models/role-permission.model.js';
export * from './models/staff.model.js';
export * from './models/user.model.js';
export * from './models/user-role.model.js';
export * from './models/inpatient.types.js';
export * from './models/inpatient-schema-helpers.js';
export * from './models/inpatient-location.model.js';
export * from './models/bed-rate.model.js';
export * from './models/admission-recommendation.model.js';
export * from './models/admission.model.js';
export * from './models/inpatient-bed-operation.model.js';
export * from './migrations/types.js';
export * from './migrations/index.js';
export * from './models/inpatient-discharge.model.js';
export * from './models/nursing-medication.types.js';
export * from './models/nursing-medication.model.js';
export * from './models/inventory.types.js';
export * from './models/inventory-schema-helpers.js';
export * from './models/inventory-catalog.model.js';
export * from './models/inventory-location.model.js';
export * from './models/supplier.model.js';
export * from './models/inventory-stock.model.js';
export * from './models/inventory-procurement.model.js';
export * from './models/inventory-receipt.model.js';
export * from './models/inventory-operational.model.js';
export * from './models/inventory-control.model.js';
export * from './models/pharmacy-dispensing.types.js';
export * from './models/pharmacy-dispensing-schema-helpers.js';
export * from './models/pharmacy-dispensation.model.js';
export * from './models/pharmacy-controlled-medicine.model.js';
export * from './models/pharmacy-label-counselling.model.js';
export * from './models/pharmacy-return-reversal.model.js';

export * from './models/billing.types.js';
export * from './models/billing-schema-helpers.js';
export * from './models/charge-catalog.model.js';
export * from './models/billing-pricing-package.model.js';
export * from './models/patient-account-charge.model.js';
export * from './models/billing-invoice-adjustment.model.js';
export * from './models/billing-payment.model.js';
export * from './models/financial-ledger.model.js';
export * from './models/payment-cashier.types.js';
export * from './models/payment-configuration.model.js';
export * from './models/cashier-shift.model.js';
export * from './models/payment-receipt.model.js';
export * from './models/deposit-operation.model.js';
export * from './models/cash-movement.model.js';
export * from './models/payment-operational-history.model.js';
export * from './models/panels-packages-coverage.types.js';
export * from './models/panels-packages-coverage-schema-helpers.js';
export * from './models/diagnostic-panel.model.js';
export * from './models/payer-coverage.model.js';
export * from './models/coverage-utilization.model.js';
export * from './models/package-coverage-history.model.js';