import {
  InventoryActorInactiveError,
  InventoryContextMismatchError,
  InventoryLocationNotFoundError,
  InventoryStaffAttributionError,
} from '../inventory.errors.js';

import type {
  InventoryActorContext,
  InventoryOperationalContext,
} from '../inventory.contracts.js';

import type {
  InventoryContextPort,
  InventoryContextRepositoryPort,
} from '../inventory.ports.js';

import {
  InventoryContextRepository,
} from '../repositories/inventory-context.repository.js';

export class InventoryContextService
implements InventoryContextPort {
  public constructor(
    private readonly repository: InventoryContextRepositoryPort =
      new InventoryContextRepository(),
  ) {}

  public async requireActiveActorStaff(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<InventoryOperationalContext['actor']> {
    const identity = await this.repository.findActorIdentity(
      actor.userId,
    );

    if (
      identity === null ||
      identity.status !== 'ACTIVE'
    ) {
      throw new InventoryActorInactiveError();
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== actor.facilityId
    ) {
      throw new InventoryStaffAttributionError();
    }

    if (identity.staffId === null) {
      throw new InventoryStaffAttributionError();
    }

    const staff = await this.repository.findStaff(
      actor.facilityId,
      identity.staffId,
    );

    if (
      staff === null ||
      !staff.isActive ||
      staff.employmentStatus !== 'ACTIVE'
    ) {
      throw new InventoryStaffAttributionError();
    }

    return {
      userId: identity.userId,
      staffId: staff.staffId,
      facilityId: staff.facilityId,
      departmentId: staff.departmentId,
      displayName: staff.displayName,
      professionalType: staff.professionalType,
    };
  }

  public async resolveOperationalLocation(
    actor: InventoryActorContext,
    locationId: string,
    options: Readonly<{
      requireActive?: boolean;
      requireDispensing?: boolean;
      requireControlledMedicineStorage?: boolean;
    }> = {},
  ): Promise<InventoryOperationalContext> {
    const actorStaff = await this.requireActiveActorStaff(actor);

    const location = await this.repository.findLocation(
      actor.facilityId,
      locationId,
    );

    if (location === null) {
      throw new InventoryLocationNotFoundError();
    }

    if (
      location.facilityId.toHexString() !== actor.facilityId
    ) {
      throw new InventoryContextMismatchError(
        'The selected inventory location belongs to another facility',
      );
    }

    if (
      (options.requireActive ?? true) &&
      location.status !== 'ACTIVE'
    ) {
      throw new InventoryContextMismatchError(
        'The selected inventory location is inactive',
      );
    }

    if (
      options.requireDispensing === true &&
      !location.supportsDispensing
    ) {
      throw new InventoryContextMismatchError(
        'The selected inventory location is not configured for dispensing',
      );
    }

    if (
      options.requireControlledMedicineStorage === true &&
      !location.allowsControlledMedicine
    ) {
      throw new InventoryContextMismatchError(
        'The selected inventory location is not approved for controlled medicines',
      );
    }

    if (location.departmentId !== null) {
      const department = await this.repository.findDepartment(
        actor.facilityId,
        location.departmentId.toHexString(),
      );

      if (
        department === null ||
        department.status !== 'ACTIVE'
      ) {
        throw new InventoryContextMismatchError(
          'The inventory location is linked to an unavailable department',
        );
      }
    }

    if (location.wardId !== null) {
      const ward = await this.repository.findWard(
        actor.facilityId,
        location.wardId.toHexString(),
      );

      if (
        ward === null ||
        ward.status !== 'ACTIVE'
      ) {
        throw new InventoryContextMismatchError(
          'The inventory location is linked to an unavailable ward',
        );
      }

      if (
        location.departmentId !== null &&
        ward.departmentId !== location.departmentId.toHexString()
      ) {
        throw new InventoryContextMismatchError(
          'The inventory location ward and department links do not match',
        );
      }
    }

    return {
      actor: actorStaff,
      location: {
        locationId: location._id.toHexString(),
        facilityId: location.facilityId.toHexString(),
        locationCode: location.locationCode,
        name: location.name,
        locationType: location.locationType,
        parentLocationId: location.parentLocationId?.toHexString() ?? null,
        ancestorLocationIds: location.ancestorLocationIds.map(
          (value) => value.toHexString(),
        ),
        departmentId: location.departmentId?.toHexString() ?? null,
        wardId: location.wardId?.toHexString() ?? null,
        servicePointId: location.servicePointId?.toHexString() ?? null,
        managerStaffId: location.managerStaffId?.toHexString() ?? null,
        supportsDispensing: location.supportsDispensing,
        allowsControlledMedicine: location.allowsControlledMedicine,
        allowsGeneralStock: location.allowsGeneralStock,
        status: location.status,
      },
    };
  }
}