import {
  FacilityModel,
  QueueDefinitionModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  SequenceService,
} from '../../../infrastructure/sequence.service.js';

import {
  DEFAULT_REGISTRATION_NUMBER_WIDTH,
  DEFAULT_VISIT_NUMBER_WIDTH,
} from '../registration-queue.constants.js';

import {
  QueueDefinitionNotFoundError,
  RegistrationQueueNumberingUnavailableError,
} from '../registration-queue.errors.js';

import {
  buildQueueTokenLabel,
  buildQueueTokenSequenceKey,
  buildRegistrationNumberSequenceKey,
  buildVisitNumberSequenceKey,
  formatRegistrationNumber,
  formatVisitNumber,
  normalizeServiceDate,
  normalizeTokenPrefix,
} from '../registration-queue.normalization.js';

import type {
  RegistrationQueueSequencePort,
} from '../registration-queue.ports.js';

import type {
  QueueTokenNumberAllocation,
  RegistrationNumberAllocation,
  VisitNumberAllocation,
} from '../registration-queue.types.js';

export interface RegistrationQueueNumberingFacilityContext {
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface RegistrationQueueNumberingQueueContext {
  tokenPrefix: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface RegistrationQueueNumberingContextReader {
  findFacility(
    facilityId: string,
  ): Promise<RegistrationQueueNumberingFacilityContext | null>;

  findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<RegistrationQueueNumberingQueueContext | null>;
}

export class MongooseRegistrationQueueNumberingContextReader
implements RegistrationQueueNumberingContextReader {
  public async findFacility(
    facilityId: string,
  ): Promise<RegistrationQueueNumberingFacilityContext | null> {
    return FacilityModel.findById(
      toObjectId(
        facilityId,
        'facilityId',
      ),
    )
      .select(
        'code status',
      )
      .lean<RegistrationQueueNumberingFacilityContext>()
      .exec();
  }

  public async findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<RegistrationQueueNumberingQueueContext | null> {
    return QueueDefinitionModel.findOne({
      _id:
        toObjectId(
          queueDefinitionId,
          'queueDefinitionId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        'tokenPrefix status',
      )
      .lean<RegistrationQueueNumberingQueueContext>()
      .exec();
  }
}

export class RegistrationQueueNumberService {
  public constructor(
    private readonly sequence:
      RegistrationQueueSequencePort,

    private readonly contexts:
      RegistrationQueueNumberingContextReader =
        new MongooseRegistrationQueueNumberingContextReader(),
  ) {}

  public static fromSequenceService(
    sequence: SequenceService,
  ): RegistrationQueueNumberService {
    return new RegistrationQueueNumberService(
      sequence,
    );
  }

  public async allocateRegistrationNumber(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
      width?: number;
    }>,
  ): Promise<RegistrationNumberAllocation> {
    const facility =
      await this.requireActiveFacility(
        input.facilityId,
        'registration',
      );

    const serviceDate =
      normalizeServiceDate(
        input.serviceDate,
      );

    const allocated =
      await this.sequence.next(
        input.facilityId,
        buildRegistrationNumberSequenceKey(
          serviceDate,
        ),
      );

    return {
      facilityId:
        input.facilityId,

      serviceDate,

      sequenceValue:
        allocated.value,

      registrationNumber:
        formatRegistrationNumber(
          facility.code,
          serviceDate,
          allocated.value,
          input.width ??
            DEFAULT_REGISTRATION_NUMBER_WIDTH,
        ),
    };
  }

  public async allocateVisitNumber(
    input: Readonly<{
      facilityId: string;
      serviceDate: string;
      width?: number;
    }>,
  ): Promise<VisitNumberAllocation> {
    const facility =
      await this.requireActiveFacility(
        input.facilityId,
        'visit',
      );

    const serviceDate =
      normalizeServiceDate(
        input.serviceDate,
      );

    const allocated =
      await this.sequence.next(
        input.facilityId,
        buildVisitNumberSequenceKey(
          serviceDate,
        ),
      );

    return {
      facilityId:
        input.facilityId,

      serviceDate,

      sequenceValue:
        allocated.value,

      visitNumber:
        formatVisitNumber(
          facility.code,
          serviceDate,
          allocated.value,
          input.width ??
            DEFAULT_VISIT_NUMBER_WIDTH,
        ),
    };
  }

  public async allocateQueueTokenNumber(
    input: Readonly<{
      facilityId: string;
      queueDefinitionId: string;
      serviceDate: string;
    }>,
  ): Promise<QueueTokenNumberAllocation> {
    await this.requireActiveFacility(
      input.facilityId,
      'queue token',
    );

    const queueDefinition =
      await this.contexts.findQueueDefinition(
        input.facilityId,
        input.queueDefinitionId,
      );

    if (queueDefinition === null) {
      throw new QueueDefinitionNotFoundError();
    }

    if (queueDefinition.status !== 'ACTIVE') {
      throw new RegistrationQueueNumberingUnavailableError(
        'queue token',
      );
    }

    const serviceDate =
      normalizeServiceDate(
        input.serviceDate,
      );

    const allocated =
      await this.sequence.next(
        input.facilityId,
        buildQueueTokenSequenceKey(
          input.queueDefinitionId,
          serviceDate,
        ),
      );

    const tokenPrefix =
      normalizeTokenPrefix(
        queueDefinition.tokenPrefix,
      );

    return {
      facilityId:
        input.facilityId,

      serviceDate,

      queueDefinitionId:
        input.queueDefinitionId,

      sequenceValue:
        allocated.value,

      tokenNumber:
        allocated.value,

      tokenPrefix,

      tokenLabel:
        buildQueueTokenLabel(
          tokenPrefix,
          allocated.value,
        ),
    };
  }

  private async requireActiveFacility(
    facilityId: string,
    resource:
      | 'registration'
      | 'visit'
      | 'queue token',
  ): Promise<RegistrationQueueNumberingFacilityContext> {
    const facility =
      await this.contexts.findFacility(
        facilityId,
      );

    if (
      facility === null ||
      facility.status !== 'ACTIVE'
    ) {
      throw new RegistrationQueueNumberingUnavailableError(
        resource,
      );
    }

    return facility;
  }
}