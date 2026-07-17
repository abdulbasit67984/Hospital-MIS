import {
  DateTime,
} from 'luxon';

import {
  FacilityModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  SequenceAllocation,
  SequenceService,
} from '../../../infrastructure/sequence.service.js';

import {
  DEFAULT_MRN_SEQUENCE_WIDTH,
  PATIENT_MRN_SEQUENCE_NAMESPACE,
} from '../patient.constants.js';

import {
  PatientFacilityNumberingUnavailableError,
} from '../patient.errors.js';

import {
  normalizeMedicalRecordNumber,
} from '../patient.normalization.js';

import type {
  MedicalRecordNumberAllocation,
} from '../patient.types.js';

export interface MedicalRecordNumberFacilityContext {
  code: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface MedicalRecordNumberFacilityResolver {
  findContext(
    facilityId: string,
  ): Promise<MedicalRecordNumberFacilityContext | null>;
}

export interface MedicalRecordNumberSequencePort {
  next(
    facilityId: string,
    key: string,
  ): Promise<SequenceAllocation>;
}

export class MongooseMedicalRecordNumberFacilityResolver
implements MedicalRecordNumberFacilityResolver {
  public async findContext(
    facilityId: string,
  ): Promise<MedicalRecordNumberFacilityContext | null> {
    return FacilityModel.findById(
      toObjectId(
        facilityId,
        'facilityId',
      ),
    )
      .select('code timezone status')
      .lean<MedicalRecordNumberFacilityContext>()
      .exec();
  }
}

export class MedicalRecordNumberService {
  public constructor(
    private readonly sequence:
      MedicalRecordNumberSequencePort,
    private readonly facilities:
      MedicalRecordNumberFacilityResolver =
        new MongooseMedicalRecordNumberFacilityResolver(),
    private readonly now:
      () => Date = () => new Date(),
  ) {}

  public static fromSequenceService(
    sequence: SequenceService,
  ): MedicalRecordNumberService {
    return new MedicalRecordNumberService(
      sequence,
    );
  }

  public async allocate(
    input: Readonly<{
      facilityId: string;
      width?: number;
    }>,
  ): Promise<MedicalRecordNumberAllocation> {
    const facility =
      await this.facilities.findContext(
        input.facilityId,
      );

    if (
      facility === null ||
      facility.status !== 'ACTIVE'
    ) {
      throw new PatientFacilityNumberingUnavailableError();
    }

    const facilityCode =
      facility.code
        .normalize('NFKC')
        .trim()
        .toLocaleUpperCase('en-US')
        .replace(/[^A-Z0-9]/gu, '');

    if (facilityCode.length === 0) {
      throw new PatientFacilityNumberingUnavailableError();
    }

    const year =
      DateTime
        .fromJSDate(
          this.now(),
          {
            zone:
              'utc',
          },
        )
        .setZone(
          facility.timezone,
        )
        .year;

    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 9999
    ) {
      throw new PatientFacilityNumberingUnavailableError();
    }

    const allocated =
      await this.sequence.next(
        input.facilityId,
        `${PATIENT_MRN_SEQUENCE_NAMESPACE}.${year}`,
      );

    const width =
      input.width ??
      DEFAULT_MRN_SEQUENCE_WIDTH;

    const sequenceValue =
      String(
        allocated.value,
      ).padStart(
        width,
        '0',
      );

    const mrn = [
      facilityCode,
      String(year),
      sequenceValue,
    ].join('-');

    return {
      facilityId:
        input.facilityId,
      facilityCode,
      year,
      sequenceValue:
        allocated.value,
      mrn,
      normalizedMrn:
        normalizeMedicalRecordNumber(
          mrn,
          'mrn',
        ),
    };
  }
}