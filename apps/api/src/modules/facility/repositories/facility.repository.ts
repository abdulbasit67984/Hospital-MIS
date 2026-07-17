import {
  FacilityModel,
} from '@hospital-mis/database';

import type {
  FilterQuery,
  UpdateQuery,
} from 'mongoose';

import {
  FACILITY_STATUS,
} from '../facility.constants.js';
import {
  escapeRegex,
  normalizeCurrency,
  normalizeEmail,
  normalizeFacilityCode,
  normalizeFacilityIdentifiers,
  normalizeLocales,
  normalizeOptionalText,
  toNullableObjectId,
  toObjectId,
} from '../facility.mapper.js';
import type {
  CreateFacilityInput,
  FacilityListQuery,
  FacilityRecord,
  PageResult,
  UpdateFacilityInput,
} from '../facility.types.js';

export class FacilityRepository {
  public async create(
    input: CreateFacilityInput & {
      createdBy: string;
    },
  ): Promise<FacilityRecord> {
    const created =
      await FacilityModel.create({
        code:
          normalizeFacilityCode(
            input.code,
          ),

        name:
          input.name.trim(),

        legalName:
          normalizeOptionalText(
            input.legalName,
          ),

        facilityType:
          input.facilityType,

        parentFacilityId:
          toNullableObjectId(
            input.parentFacilityId,
            'parentFacilityId',
          ),

        identifiers:
          normalizeFacilityIdentifiers(
            input.identifiers,
          ),

        timezone:
          input.timezone.trim(),

        currency:
          normalizeCurrency(
            input.currency,
          ),

        locale:
          input.locale.trim(),

        supportedLocales:
          normalizeLocales(
            input.locale,
            input.supportedLocales,
          ),

        address: {
          ...input.address,
          line1:
            normalizeOptionalText(
              input.address.line1,
            ),

          line2:
            normalizeOptionalText(
              input.address.line2,
            ),

          city:
            normalizeOptionalText(
              input.address.city,
            ),

          district:
            normalizeOptionalText(
              input.address.district,
            ),

          province:
            normalizeOptionalText(
              input.address.province,
            ),

          postalCode:
            normalizeOptionalText(
              input.address.postalCode,
            ),

          countryCode:
            input.address.countryCode
              .trim()
              .toLocaleUpperCase(
                'en-US',
              ),
        },

        contact: {
          ...input.contact,
          primaryPhone:
            normalizeOptionalText(
              input.contact.primaryPhone,
            ),

          secondaryPhone:
            normalizeOptionalText(
              input.contact.secondaryPhone,
            ),

          email:
            normalizeEmail(
              input.contact.email,
            ),

          website:
            normalizeOptionalText(
              input.contact.website,
            ),

          emergencyPhone:
            normalizeOptionalText(
              input.contact.emergencyPhone,
            ),
        },

        status:
          FACILITY_STATUS.ACTIVE,

        allowsAuthentication:
          input.allowsAuthentication,

        deactivatedAt:
          null,

        deactivatedBy:
          null,

        deactivationReason:
          null,

        version:
          0,

        createdBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),

        updatedBy:
          toObjectId(
            input.createdBy,
            'createdBy',
          ),
      });

    return created.toObject() as FacilityRecord;
  }

  public async findById(
    facilityId: string,
  ): Promise<FacilityRecord | null> {
    return FacilityModel.findById(
      toObjectId(
        facilityId,
        'facilityId',
      ),
    )
      .lean<FacilityRecord>()
      .exec();
  }

  public async findByCode(
    code: string,
  ): Promise<FacilityRecord | null> {
    return FacilityModel.findOne({
      code:
        normalizeFacilityCode(
          code,
        ),
    })
      .lean<FacilityRecord>()
      .exec();
  }

  public async list(
    query: FacilityListQuery,
  ): Promise<PageResult<FacilityRecord>> {
    const filter:
      FilterQuery<FacilityRecord> = {};

    if (
      query.parentFacilityId !==
      undefined
    ) {
      filter.parentFacilityId =
        toNullableObjectId(
          query.parentFacilityId,
          'parentFacilityId',
        );
    }

    if (query.facilityType) {
      filter.facilityType =
        query.facilityType;
    }

    if (query.status) {
      filter.status =
        query.status;
    }

    if (
      query.allowsAuthentication !==
      undefined
    ) {
      filter.allowsAuthentication =
        query.allowsAuthentication;
    }

    if (query.search) {
      const search =
        new RegExp(
          escapeRegex(
            query.search.trim(),
          ),
          'i',
        );

      filter.$or = [
        {
          code: search,
        },
        {
          name: search,
        },
        {
          legalName: search,
        },
        {
          'identifiers.value':
            search,
        },
      ];
    }

    const page =
      Math.max(1, query.page);

    const pageSize =
      Math.max(
        1,
        query.pageSize,
      );

    const skip =
      (page - 1) * pageSize;

    const direction =
      query.sortDirection ===
      'desc'
        ? -1
        : 1;

    const [
      items,
      totalItems,
    ] = await Promise.all([
      FacilityModel.find(
        filter,
      )
        .sort({
          [query.sortBy]:
            direction,
          code: 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean<FacilityRecord[]>()
        .exec(),

      FacilityModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems /
                pageSize,
            ),
    };
  }

  public async updateWithVersion(
    facilityId: string,
    input: UpdateFacilityInput,
    actorUserId: string,
  ): Promise<FacilityRecord | null> {
    const setValues:
      Record<string, unknown> = {
        updatedBy:
          toObjectId(
            actorUserId,
            'actorUserId',
          ),
      };

    if (input.name !== undefined) {
      setValues.name =
        input.name.trim();
    }

    if (
      input.legalName !==
      undefined
    ) {
      setValues.legalName =
        normalizeOptionalText(
          input.legalName,
        );
    }

    if (
      input.parentFacilityId !==
      undefined
    ) {
      setValues.parentFacilityId =
        toNullableObjectId(
          input.parentFacilityId,
          'parentFacilityId',
        );
    }

    if (
      input.identifiers !==
      undefined
    ) {
      setValues.identifiers =
        normalizeFacilityIdentifiers(
          input.identifiers,
        );
    }

    if (
      input.timezone !==
      undefined
    ) {
      setValues.timezone =
        input.timezone.trim();
    }

    if (
      input.currency !==
      undefined
    ) {
      setValues.currency =
        normalizeCurrency(
          input.currency,
        );
    }

    if (
      input.locale !==
      undefined
    ) {
      setValues.locale =
        input.locale.trim();
    }

    if (
      input.supportedLocales !==
      undefined
    ) {
      const primaryLocale =
        input.locale ??
        (
          await this.findById(
            facilityId,
          )
        )?.locale;

      if (
        primaryLocale !==
        undefined
      ) {
        setValues.supportedLocales =
          normalizeLocales(
            primaryLocale,
            input.supportedLocales,
          );
      }
    }

    if (
      input.address !==
      undefined
    ) {
      setValues.address =
        input.address;
    }

    if (
      input.contact !==
      undefined
    ) {
      setValues.contact = {
        ...input.contact,
        email:
          normalizeEmail(
            input.contact.email,
          ),
      };
    }

    if (
      input.allowsAuthentication !==
      undefined
    ) {
      setValues.allowsAuthentication =
        input.allowsAuthentication;
    }

    const update:
      UpdateQuery<FacilityRecord> = {
        $set: setValues,
        $inc: {
          version: 1,
        },
      };

    return FacilityModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,
      },
      update,
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<FacilityRecord>()
      .exec();
  }

  public async changeStatus(
    input: {
      facilityId: string;
      expectedVersion: number;
      status:
        FacilityRecord['status'];
      actorUserId: string;
      reason: string;
      changedAt: Date;
    },
  ): Promise<FacilityRecord | null> {
    const isInactive =
      input.status ===
      FACILITY_STATUS.INACTIVE;

    return FacilityModel.findOneAndUpdate(
      {
        _id:
          toObjectId(
            input.facilityId,
            'facilityId',
          ),

        version:
          input.expectedVersion,
      },
      {
        $set: {
          status:
            input.status,

          allowsAuthentication:
            !isInactive,

          deactivatedAt:
            isInactive
              ? input.changedAt
              : null,

          deactivatedBy:
            isInactive
              ? toObjectId(
                  input.actorUserId,
                  'actorUserId',
                )
              : null,

          deactivationReason:
            isInactive
              ? input.reason.trim()
              : null,

          updatedBy:
            toObjectId(
              input.actorUserId,
              'actorUserId',
            ),
        },

        $inc: {
          version: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .lean<FacilityRecord>()
      .exec();
  }

  public async countActiveChildren(
    facilityId: string,
  ): Promise<number> {
    return FacilityModel.countDocuments({
      parentFacilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      status:
        FACILITY_STATUS.ACTIVE,
    }).exec();
  }
}