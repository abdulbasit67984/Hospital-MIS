import {
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  toGuardianProfileDto,
  toGuardianSearchItemDto,
} from '../patient.query.mapper.js';

import type {
  GuardianProfileDto,
  GuardianProfileQuery,
  GuardianSearchItemDto,
  GuardianSearchQuery,
  PageResult,
  PatientQueryAccessLevel,
} from '../patient.query.types.js';

import type {
  PatientActorContext,
} from '../patient.types.js';

import type {
  GuardianQueryRepository,
} from '../repositories/guardian-query.repository.js';

import type {
  PatientSensitiveReadAuditor,
} from './patient-sensitive-read-auditor.service.js';

export interface GuardianQueryServiceOptions {
  clock?: Readonly<{
    now(): Date;
  }>;
}

const systemClock = {
  now(): Date {
    return new Date();
  },
};

export class GuardianQueryService {
  private readonly clock:
    Readonly<{
      now(): Date;
    }>;

  public constructor(
    private readonly repository:
      GuardianQueryRepository,

    private readonly sensitiveReadAuditor:
      PatientSensitiveReadAuditor,

    options:
      GuardianQueryServiceOptions = {},
  ) {
    this.clock =
      options.clock ??
      systemClock;
  }

  public async search(
    query: GuardianSearchQuery,
    accessLevel: PatientQueryAccessLevel,
    actor: PatientActorContext,
  ): Promise<
    PageResult<GuardianSearchItemDto>
  > {
    const [
      candidates,
      totalItems,
    ] = await Promise.all([
      this.repository
        .findSearchCandidates(
          actor.facilityId,
          query,
        ),

      this.repository.count(
        actor.facilityId,
        query,
      ),
    ]);

    const items =
      candidates.map(
        toGuardianSearchItemDto,
      );

    if (
      accessLevel === 'SENSITIVE'
    ) {
      const occurredAt =
        this.clock.now();

      await Promise.all(
        items.map(
          (item) =>
            this.sensitiveReadAuditor
              .recordGuardianRead({
                actor,
                guardianId:
                  item.id,
                resource:
                  'SEARCH',
                fieldGroups: [
                  'identity',
                  'contact',
                ],
                occurredAt,
              }),
        ),
      );
    }

    return {
      items,
      page:
        query.page,
      pageSize:
        query.pageSize,
      totalItems,
      totalPages:
        totalItems === 0
          ? 0
          : Math.ceil(
              totalItems /
              query.pageSize,
            ),
    };
  }

  public async getProfile(
    guardianId: string,
    query: GuardianProfileQuery,
    accessLevel: PatientQueryAccessLevel,
    actor: PatientActorContext,
  ): Promise<GuardianProfileDto> {
    const records =
      await this.repository
        .loadProfile(
          actor.facilityId,
          guardianId,
          query,
        );

    if (records === null) {
      throw new ResourceNotFoundError(
        'Guardian was not found',
      );
    }

    const profile =
      toGuardianProfileDto(
        records,
        accessLevel,
      );

    if (
      accessLevel === 'SENSITIVE'
    ) {
      await this.sensitiveReadAuditor
        .recordGuardianRead({
          actor,
          guardianId,
          resource:
            'PROFILE',
          fieldGroups: [
            'identity',
            'contact',
            'address',
            'patient_relationships',
          ],
          occurredAt:
            this.clock.now(),
        });
    }

    return profile;
  }
}