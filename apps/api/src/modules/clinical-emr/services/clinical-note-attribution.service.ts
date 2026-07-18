import {
  ClinicalEncounterOwnershipError,
  ClinicalEmrMinimumNecessaryAccessError,
} from '../clinical-emr.errors.js';

import type {
  ClinicalEmrActorContext,
} from '../clinical-emr.types.js';

import {
  ClinicalEmrContextRepository,
  type ClinicalActorIdentityRecord,
} from '../repositories/clinical-emr-context.repository.js';

export interface ClinicalActorIdentityReader {
  findActorIdentity(
    userId: string,
  ): Promise<ClinicalActorIdentityRecord | null>;
}

export class ClinicalNoteAttributionService {
  public constructor(
    private readonly identities: ClinicalActorIdentityReader =
      new ClinicalEmrContextRepository(),
  ) {}

  public async resolveActorProvider(
    actor: ClinicalEmrActorContext,
  ): Promise<string> {
    const identity = await this.identities.findActorIdentity(
      actor.userId,
    );

    if (
      identity === null ||
      identity.status !== 'ACTIVE' ||
      identity.staffId === null
    ) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== actor.facilityId
    ) {
      throw new ClinicalEmrMinimumNecessaryAccessError();
    }

    return identity.staffId;
  }

  public async requireActorProvider(
    actor: ClinicalEmrActorContext,
    requestedProviderId: string,
  ): Promise<string> {
    const providerId = await this.resolveActorProvider(actor);

    if (providerId !== requestedProviderId) {
      throw new ClinicalEncounterOwnershipError();
    }

    return providerId;
  }
}