import 'dotenv/config';

import {
  z,
} from 'zod';

import {
  loadApiConfig,
} from '@hospital-mis/config';

import {
  connectDatabase,
  createObjectId,
  disconnectDatabase,
  nativeDatabase,
  toObjectId,
  type DatabaseObjectId,
} from '@hospital-mis/database';

import {
  permissionDefinitions,
  permissionKeys,
  type PermissionKey,
} from '@hospital-mis/permissions';

const environmentSchema =
  z.object({
    IDENTITY_FACILITY_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        ),

    IDENTITY_SEED_ACTOR_USER_ID:
      z
        .string()
        .regex(
          /^[a-f\d]{24}$/i,
        )
        .optional(),

    ADMIN_USERNAME:
      z
        .string()
        .trim()
        .min(3)
        .max(80)
        .default(
          'admin',
        ),
  });

type RoleScope =
  | 'GLOBAL'
  | 'FACILITY';

type RoleSeed =
  Readonly<{
    code:
      string;

    name:
      string;

    description:
      string;

    scope:
      RoleScope;

    permissions:
      readonly PermissionKey[];
  }>;

function permissions(
  ...keys:
    PermissionKey[]
): readonly PermissionKey[] {
  return keys;
}

const roleSeeds:
  readonly RoleSeed[] = [
    {
      code:
        'SYSTEM_ADMINISTRATOR',

      name:
        'System Administrator',

      description:
        'Global system administration, security, configuration, and identity access.',

      scope:
        'GLOBAL',

      permissions:
        permissionKeys,
    },
    {
      code:
        'RECEPTION_MANAGEMENT',

      name:
        'Reception Management',

      description:
        'Patient registration, guardian records, OPD visits, queues, and authorized reception collections.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'patients.create',
          'patients.update',
          'guardians.read',
          'guardians.manage',
          'registrations.read',
          'registrations.create',
          'registrations.collect_payment',
          'queues.read',
          'queues.manage',
          'queues.public_display',
          'billing.accounts.read',
          'billing.payment.receive',
        ),
    },
    {
      code:
        'CLINICAL_DOCTOR',

      name:
        'Clinical Management – Doctor',

      description:
        'Doctor queue, encounters, longitudinal history, diagnoses, prescriptions, diagnostic orders, and admission recommendations.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'patients.read_sensitive',
          'queues.read',
          'encounters.read_assigned',
          'encounters.create',
          'encounters.finalize',
          'encounters.amend',
          'clinical_notes.create',
          'clinical_notes.amend',
          'prescriptions.read',
          'prescriptions.issue',
          'prescriptions.cancel',
          'laboratory.orders.read',
          'laboratory.orders.manage',
          'radiology.orders.read',
          'radiology.orders.manage',
          'admissions.read',
          'admissions.create',
          'reports.clinical.read',
        ),
    },
    {
      code:
        'WARD_NURSE',

      name:
        'Ward Management – Nurse',

      description:
        'Assigned ward patients, vitals, nursing charts, medication administration, handover, and discharge readiness.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'admissions.read',
          'beds.read',
          'nursing.read',
          'nursing.vitals.create',
          'nursing.vitals.amend',
          'nursing.notes.create',
          'nursing.notes.amend',
          'nursing.medication_administer',
          'nursing.handover.manage',
          'inventory.read',
        ),
    },
    {
      code:
        'PHARMACIST',

      name:
        'Inventory Management – Pharmacist',

      description:
        'Formulary, procurement, batches, FEFO dispensing, returns, stock alerts, and authorized adjustments.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'prescriptions.read',
          'inventory.read',
          'inventory.view_cost',
          'inventory.items.manage',
          'inventory.batches.manage',
          'inventory.procure',
          'inventory.receive',
          'inventory.transfer',
          'inventory.adjust',
          'inventory.count',
          'pharmacy.queue.read',
          'pharmacy.dispense',
          'pharmacy.return',
          'billing.charges.create',
          'reports.inventory.read',
          'reports.export',
        ),
    },
    {
      code:
        'BILLING_OFFICER',

      name:
        'Financial Management – Billing Officer',

      description:
        'Patient accounts, invoices, payments, discounts, refunds, assistance allocations, panels, claims, and financial discharge.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'billing.accounts.read',
          'billing.charges.create',
          'billing.invoice.create',
          'billing.invoice.finalize',
          'billing.discount.request',
          'billing.discount.approve',
          'billing.payment.receive',
          'billing.refund.process',
          'billing.credit_note.create',
          'billing.financial_discharge',
          'cash_shifts.open',
          'cash_shifts.close',
          'cash_shifts.reconcile',
          'panels.read',
          'panels.manage',
          'panels.activate',
          'packages.read',
          'packages.manage',
          'packages.activate',
          'packages.enroll',
          'packages.suspend',
          'packages.cancel',
          'packages.reverse',
          'coverage.read',
          'coverage.manage',
          'coverage.activate',
          'coverage.enroll',
          'coverage.verify',
          'coverage.estimate',
          'coverage.determine',
          'coverage.override',
          'coverage.utilization.read',
          'coverage.reports.read',
          'coverage.reports.export',
          'preauthorizations.manage',
          'claims.read',
          'claims.prepare',
          'assistance.read',
          'assistance.allocate',
          'reports.financial.read',
          'reports.export',
        ),
    },
    {
      code:
        'EXECUTIVE_ADMINISTRATOR',

      name:
        'Executive Management – Hospital Administrator',

      description:
        'Controlled read access to operational, clinical, financial, inventory, staff-performance, and audit dashboards.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'queues.read',
          'admissions.read',
          'beds.read',
          'inventory.read',
          'inventory.view_cost',
          'billing.accounts.read',
          'panels.read',
          'packages.read',
          'coverage.read',
          'coverage.utilization.read',
          'coverage.reports.read',
          'claims.read',
          'assistance.read',
          'consultants.read',
          'reports.operational.read',
          'reports.clinical.read',
          'reports.financial.read',
          'reports.inventory.read',
          'reports.export',
          'audit.read',
          'audit.export',
          'identity.permissions.read',
          'identity.roles.read',
          'identity.staff.read',
          'identity.users.read',
          'configuration.read',
        ),
    },
    {
      code:
        'LABORATORY_STAFF',

      name:
        'Laboratory Staff',

      description:
        'Laboratory order acceptance, sample workflow, result entry, verification, and publication.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'laboratory.orders.read',
          'laboratory.orders.manage',
          'laboratory.results.enter',
          'laboratory.results.verify',
          'billing.charges.create',
          'reports.clinical.read',
        ),
    },
    {
      code:
        'RADIOLOGY_STAFF',

      name:
        'Radiology Staff',

      description:
        'Radiology order workflow, report entry, verification, publication, and attachments.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'radiology.orders.read',
          'radiology.orders.manage',
          'radiology.reports.enter',
          'radiology.reports.verify',
          'billing.charges.create',
          'reports.clinical.read',
        ),
    },
    {
      code:
        'CLAIMS_OFFICER',

      name:
        'Claims Officer',

      description:
        'Coverage, preauthorization, claim preparation, submission, status management, receivables, and claim payments.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'panels.read',
          'packages.read',
          'coverage.read',
          'coverage.verify',
          'coverage.estimate',
          'coverage.determine',
          'coverage.utilization.read',
          'coverage.reports.read',
          'coverage.reports.export',
          'preauthorizations.manage',
          'claims.read',
          'claims.prepare',
          'claims.submit',
          'claims.status_manage',
          'claims.payment_record',
          'reports.financial.read',
          'reports.export',
        ),
    },
    {
      code:
        'STORE_MANAGER',

      name:
        'Store or Warehouse Manager',

      description:
        'Non-dispensing inventory master data, procurement, receipts, transfers, adjustments, counts, valuation, and alerts.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'inventory.read',
          'inventory.view_cost',
          'inventory.items.manage',
          'inventory.batches.manage',
          'inventory.procure',
          'inventory.receive',
          'inventory.transfer',
          'inventory.adjust',
          'inventory.count',
          'reports.inventory.read',
          'reports.export',
        ),
    },
    {
      code:
        'CASHIER',

      name:
        'Cashier',

      description:
        'Patient account lookup, payment collection, receipt workflow, and cashier shift operations.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'billing.accounts.read',
          'billing.payment.receive',
          'cash_shifts.open',
          'cash_shifts.close',
          'cash_shifts.reconcile',
        ),
    },
    {
      code:
        'MEDICAL_RECORDS_OFFICER',

      name:
        'Medical Records Officer',

      description:
        'Sensitive patient identity review, duplicate resolution, merge workflow, and longitudinal record retrieval.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'patients.read_sensitive',
          'patients.update',
          'patients.merge',
          'guardians.read',
          'registrations.read',
          'encounters.read_all',
          'prescriptions.read',
          'laboratory.orders.read',
          'radiology.orders.read',
          'admissions.read',
          'audit.read',
        ),
    },
    {
      code:
        'DEPARTMENT_MANAGER',

      name:
        'Department Manager',

      description:
        'Department operations, queues, assigned staff visibility, productivity reporting, and controlled identity reads.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'queues.read',
          'admissions.read',
          'beds.read',
          'reports.operational.read',
          'reports.clinical.read',
          'reports.export',
          'identity.roles.read',
          'identity.staff.read',
          'identity.users.read',
          'configuration.read',
        ),
    },
    {
      code:
        'AUDITOR',

      name:
        'Auditor',

      description:
        'Read-only financial, inventory, clinical, operational, and audit review with export access.',

      scope:
        'FACILITY',

      permissions:
        permissions(
          'patients.read',
          'billing.accounts.read',
          'inventory.read',
          'inventory.view_cost',
          'panels.read',
          'packages.read',
          'coverage.read',
          'coverage.utilization.read',
          'coverage.reports.read',
          'claims.read',
          'assistance.read',
          'consultants.read',
          'reports.operational.read',
          'reports.clinical.read',
          'reports.financial.read',
          'reports.inventory.read',
          'reports.export',
          'audit.read',
          'audit.export',
          'identity.permissions.read',
          'identity.roles.read',
          'identity.staff.read',
          'identity.users.read',
          'configuration.read',
        ),
    },
  ];

function normalizeUsername(
  value:
    string,
): string {
  return value
    .normalize(
      'NFKC',
    )
    .trim()
    .toLocaleLowerCase(
      'en-US',
    );
}

async function main():
  Promise<void> {
  const apiConfig =
    loadApiConfig();

  const environment =
    environmentSchema.parse(
      process.env,
    );

  await connectDatabase({
    uri:
      apiConfig.mongodbUri,

    appName:
      'hospital-mis-identity-access-seed',

    serverSelectionTimeoutMs:
      apiConfig.mongodbServerSelectionTimeoutMs,
  });

  const database =
    nativeDatabase();

  const facilityId =
    toObjectId(
      environment.IDENTITY_FACILITY_ID,
      'IDENTITY_FACILITY_ID',
    );

  const actor =
    environment.IDENTITY_SEED_ACTOR_USER_ID ===
    undefined
      ? await database
          .collection<{
            _id:
              DatabaseObjectId;
          }>(
            'users',
          )
          .findOne({
            normalizedUsername:
              normalizeUsername(
                environment.ADMIN_USERNAME,
              ),
          })
      : await database
          .collection<{
            _id:
              DatabaseObjectId;
          }>(
            'users',
          )
          .findOne({
            _id:
              toObjectId(
                environment.IDENTITY_SEED_ACTOR_USER_ID,
                'IDENTITY_SEED_ACTOR_USER_ID',
              ),
          });

  if (
    actor ===
    null
  ) {
    throw new Error(
      'Seed actor was not found. Run seed:admin first or provide IDENTITY_SEED_ACTOR_USER_ID.',
    );
  }

  const now =
    new Date();

  const permissionsCollection =
    database.collection<
      Record<string, unknown> & {
        _id:
          DatabaseObjectId;

        code:
          PermissionKey;
      }
    >(
      'permissions',
    );

  await permissionsCollection.bulkWrite(
    permissionDefinitions.map(
      (
        definition,
      ) => ({
        updateOne: {
          filter: {
            code:
              definition.key,
          },

          update: {
            $set: {
              name:
                definition.description,

              module:
                definition.module,

              description:
                definition.description,

              sensitivity:
                definition.sensitivity,

              isSystem:
                true,

              isActive:
                true,

              updatedAt:
                now,
            },

            $setOnInsert: {
              _id:
                createObjectId(),

              code:
                definition.key,

              schemaVersion:
                1,

              version:
                0,

              createdAt:
                now,
            },
          },

          upsert:
            true,
        },
      }),
    ),
    {
      ordered:
        true,
    },
  );

  const permissionRecords =
    await permissionsCollection
      .find({
        code: {
          $in: [
            ...permissionKeys,
          ],
        },
      })
      .toArray();

  const permissionByCode =
    new Map(
      permissionRecords.map(
        (
          permission,
        ) => [
          permission.code,
          permission._id,
        ],
      ),
    );

  const rolesCollection =
    database.collection<
      Record<string, unknown> & {
        _id:
          DatabaseObjectId;

        code:
          string;

        scope:
          RoleScope;

        facilityId?:
          DatabaseObjectId | null;
      }
    >(
      'roles',
    );

  const affectedRoleIds:
    DatabaseObjectId[] =
    [];

  for (
    const seed of
    roleSeeds
  ) {
    const roleFacilityId =
      seed.scope ===
      'GLOBAL'
        ? null
        : facilityId;

    await rolesCollection.updateOne(
      {
        scope:
          seed.scope,

        facilityId:
          roleFacilityId,

        code:
          seed.code,
      },
      {
        $set: {
          name:
            seed.name,

          description:
            seed.description,

          isSystem:
            true,

          isActive:
            true,

          updatedBy:
            actor._id,

          updatedAt:
            now,
        },

        $setOnInsert: {
          _id:
            createObjectId(),

          facilityId:
            roleFacilityId,

          code:
            seed.code,

          scope:
            seed.scope,

          createdBy:
            actor._id,

          schemaVersion:
            1,

          version:
            0,

          createdAt:
            now,
        },
      },
      {
        upsert:
          true,
      },
    );

    const role =
      await rolesCollection.findOne({
        scope:
          seed.scope,

        facilityId:
          roleFacilityId,

        code:
          seed.code,
      });

    if (
      role ===
      null
    ) {
      throw new Error(
        `Role ${seed.code} could not be loaded after upsert`,
      );
    }

    affectedRoleIds.push(
      role._id,
    );

    const permissionIds =
      seed.permissions.map(
        (
          permissionCode,
        ) => {
          const permissionId =
            permissionByCode.get(
              permissionCode,
            );

          if (
            permissionId ===
            undefined
          ) {
            throw new Error(
              `Permission ${permissionCode} was not seeded`,
            );
          }

          return permissionId;
        },
      );

    const rolePermissions =
      database.collection(
        'rolePermissions',
      );

    await rolePermissions.deleteMany({
      roleId:
        role._id,

      permissionId: {
        $nin:
          permissionIds,
      },
    });

    if (
      permissionIds.length >
      0
    ) {
      await rolePermissions.bulkWrite(
        permissionIds.map(
          (
            permissionId,
          ) => ({
            updateOne: {
              filter: {
                roleId:
                  role._id,

                permissionId,
              },

              update: {
                $set: {
                  grantedBy:
                    actor._id,

                  grantedAt:
                    now,

                  updatedAt:
                    now,
                },

                $setOnInsert: {
                  _id:
                    createObjectId(),

                  roleId:
                    role._id,

                  permissionId,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdAt:
                    now,
                },
              },

              upsert:
                true,
            },
          }),
        ),
        {
          ordered:
            true,
        },
      );
    }
  }

  const assignedUserIds =
    await database
      .collection(
        'userRoles',
      )
      .distinct(
        'userId',
        {
          roleId: {
            $in:
              affectedRoleIds,
          },

          isActive:
            true,
        },
      );

  if (
    assignedUserIds.length >
    0
  ) {
    await database
      .collection(
        'users',
      )
      .updateMany(
        {
          _id: {
            $in:
              assignedUserIds,
          },
        },
        {
          $inc: {
            permissionVersion:
              1,

            version:
              1,
          },

          $currentDate: {
            updatedAt:
              true,
          },
        },
      );
  }

  console.info(
    JSON.stringify(
      {
        success:
          true,

        facilityId:
          facilityId.toHexString(),

        roleCount:
          roleSeeds.length,

        permissionCount:
          permissionKeys.length,

        invalidatedUserCount:
          assignedUserIds.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Identity access seed failed',
      );

      process.exitCode =
        1;
    },
  )
  .finally(
    async () => {
      await disconnectDatabase();
    },
  );