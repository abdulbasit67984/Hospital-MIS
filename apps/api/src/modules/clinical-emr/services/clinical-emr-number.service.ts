import {
  FacilityModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  SequenceService,
} from '../../../infrastructure/sequence.service.js';

import {
  DEFAULT_CLINICAL_NOTE_NUMBER_WIDTH,
  DEFAULT_ENCOUNTER_NUMBER_WIDTH,
  DEFAULT_PATIENT_PROBLEM_NUMBER_WIDTH,
} from '../clinical-emr.constants.js';

import {
  ClinicalEmrFacilityBoundaryError,
  ClinicalNumberingUnavailableError,
} from '../clinical-emr.errors.js';

import {
  buildClinicalNoteNumberSequenceKey,
  buildEncounterNumberSequenceKey,
  buildPatientProblemNumberSequenceKey,
  formatClinicalNoteNumber,
  formatEncounterNumber,
  formatPatientProblemNumber,
  normalizeClinicalServiceDate,
} from '../clinical-emr.normalization.js';

import type {
  ClinicalEmrSequencePort,
} from '../clinical-emr.ports.js';

export interface ClinicalNumberingFacilityContext {
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ClinicalNumberingContextReader {
  findFacility(
    facilityId: string,
  ): Promise<ClinicalNumberingFacilityContext | null>;
}

export interface ClinicalNumberAllocation {
  facilityId: string;
  serviceDate: string;
  sequenceKey: string;
  sequenceValue: number;
  number: string;
}

export class MongooseClinicalNumberingContextReader
implements ClinicalNumberingContextReader {
  public async findFacility(
    facilityId: string,
  ): Promise<ClinicalNumberingFacilityContext | null> {
    return FacilityModel.findById(
      toObjectId(facilityId, 'facilityId'),
    )
      .select('code status')
      .lean<ClinicalNumberingFacilityContext>()
      .exec();
  }
}

export class ClinicalEmrNumberService {
  public constructor(
    private readonly sequence: ClinicalEmrSequencePort,
    private readonly contexts: ClinicalNumberingContextReader =
      new MongooseClinicalNumberingContextReader(),
  ) {}

  public static fromSequenceService(
    sequence: SequenceService,
  ): ClinicalEmrNumberService {
    return new ClinicalEmrNumberService(sequence);
  }

  public async allocateEncounterNumber(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
      width?: number;
    }>,
  ): Promise<ClinicalNumberAllocation> {
    return this.allocate(
      input,
      'encounter',
      buildEncounterNumberSequenceKey,
      formatEncounterNumber,
      input.width ?? DEFAULT_ENCOUNTER_NUMBER_WIDTH,
    );
  }

  public async allocateClinicalNoteNumber(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
      width?: number;
    }>,
  ): Promise<ClinicalNumberAllocation> {
    return this.allocate(
      input,
      'clinical note',
      buildClinicalNoteNumberSequenceKey,
      formatClinicalNoteNumber,
      input.width ?? DEFAULT_CLINICAL_NOTE_NUMBER_WIDTH,
    );
  }

  public async allocatePatientProblemNumber(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
      width?: number;
    }>,
  ): Promise<ClinicalNumberAllocation> {
    return this.allocate(
      input,
      'patient problem',
      buildPatientProblemNumberSequenceKey,
      formatPatientProblemNumber,
      input.width ?? DEFAULT_PATIENT_PROBLEM_NUMBER_WIDTH,
    );
  }

  private async allocate(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
    }>,
    resource: 'encounter' | 'clinical note' | 'patient problem',
    keyBuilder: (serviceDate: string) => string,
    formatter: (
      facilityCode: string,
      serviceDate: string,
      sequenceValue: number,
      width: number,
    ) => string,
    width: number,
  ): Promise<ClinicalNumberAllocation> {
    const facility = await this.contexts.findFacility(input.facilityId);

    if (facility === null) {
      throw new ClinicalEmrFacilityBoundaryError();
    }

    if (facility.status !== 'ACTIVE') {
      throw new ClinicalNumberingUnavailableError(resource);
    }

    const serviceDate = normalizeClinicalServiceDate(input.serviceDate);
    const sequenceKey = keyBuilder(serviceDate);

    const allocation = await this.sequence.next(
      input.facilityId,
      sequenceKey,
    );

    if (
      !Number.isSafeInteger(allocation.value) ||
      allocation.value < 1
    ) {
      throw new ClinicalNumberingUnavailableError(resource);
    }

    return {
      facilityId: input.facilityId,
      serviceDate,
      sequenceKey: allocation.key,
      sequenceValue: allocation.value,
      number: formatter(
        facility.code,
        serviceDate,
        allocation.value,
        width,
      ),
    };
  }
}