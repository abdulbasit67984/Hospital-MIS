import {
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import {
  highestAlertSeverity,
  toPatientProfileDto,
  toPatientSearchItemDto,
} from '../patient.query.mapper.js';

import type {
  PageResult,
  PatientProfileDto,
  PatientProfileQuery,
  PatientQueryAccessLevel,
  PatientSearchCandidateRecord,
  PatientSearchItemDto,
  PatientSearchQuery,
} from '../patient.query.types.js';

import type {
  PatientActorContext,
} from '../patient.types.js';

import type {
  PatientCanonicalizationService,
} from '../repositories/patient-merge.repository.js';

import type {
  PatientQueryRepository,
} from '../repositories/patient-query.repository.js';

import type {
  PatientSensitiveReadAuditor,
} from './patient-sensitive-read-auditor.service.js';

export interface PatientQueryServiceOptions {
  clock?: Readonly<{
    now(): Date;
  }>;
}

const systemClock = {
  now(): Date {
    return new Date();
  },
};

export class PatientQueryService {
  private readonly clock:
    Readonly<{
      now(): Date;
    }>;

  public constructor(
    private readonly repository:
      PatientQueryRepository,

    private readonly canonicalization:
      PatientCanonicalizationService,

    private readonly sensitiveReadAuditor:
      PatientSensitiveReadAuditor,

    options:
      PatientQueryServiceOptions = {},
  ) {
    this.clock =
      options.clock ??
      systemClock;
  }

  public async search(
    query: PatientSearchQuery,
    accessLevel: PatientQueryAccessLevel,
    actor: PatientActorContext,
  ): Promise<
    PageResult<PatientSearchItemDto>
  > {
    const candidates =
      await this.repository
        .findSearchCandidates(
          actor.facilityId,
          {
            ...query,
            includeMerged:
              true,
          },
        );

    const now =
      this.clock.now();

    const canonicalItems =
      new Map<
        string,
        PatientSearchItemDto
      >();

    for (const candidate of candidates) {
      const requestedPatientId =
        candidate.patient._id
          .toHexString();

      const resolution =
        await this.canonicalization
          .resolve(
            actor.facilityId,
            requestedPatientId,
          );

      let canonicalCandidate =
        candidate;

      if (resolution.redirected) {
        const records =
          await this.repository
            .loadProfile(
              actor.facilityId,
              resolution.canonicalPatientId,
              accessLevel,
              {
                includeInactiveContacts:
                  false,

                includeInactiveAddresses:
                  false,

                includeInactiveGuardians:
                  false,

                includeResolvedAlerts:
                  false,
              },
            );

        if (records === null) {
          continue;
        }

        const primaryMrn =
          records.identifiers.find(
            (identifier) =>
              identifier.identifierType ===
                'MRN' &&
              identifier.isPrimaryMrn &&
              identifier.status ===
                'ACTIVE',
          );

        if (primaryMrn === undefined) {
          continue;
        }

        canonicalCandidate = {
          patient:
            records.patient,

          primaryMrn,

          primaryContact:
            records.contacts.find(
              (contact) =>
                contact.isPrimary &&
                contact.status ===
                  'ACTIVE',
            ) ??
            null,

          matchedBy: [
            ...candidate.matchedBy,
          ],

          activeAlertCount:
            records.alerts.filter(
              (alert) =>
                alert.status ===
                  'ACTIVE',
            ).length,

          highestAlertSeverity:
            highestAlertSeverity(
              records.alerts
                .filter(
                  (alert) =>
                    alert.status ===
                      'ACTIVE',
                )
                .map(
                  (alert) =>
                    alert.severity,
                ),
            ),
        } satisfies PatientSearchCandidateRecord;
      }

      const canonicalPatientId =
        canonicalCandidate.patient._id
          .toHexString();

      const existing =
        canonicalItems.get(
          canonicalPatientId,
        );

      const item =
        toPatientSearchItemDto(
          canonicalCandidate,
          {
            accessLevel,
            now,
            redirectedFromPatientIds:
              resolution.redirected
                ? [
                    requestedPatientId,
                  ]
                : [],
          },
        );

      if (existing === undefined) {
        canonicalItems.set(
          canonicalPatientId,
          item,
        );
      } else {
        canonicalItems.set(
          canonicalPatientId,
          {
            ...existing,

            matchedBy: [
              ...new Set([
                ...existing.matchedBy,
                ...item.matchedBy,
              ]),
            ],

            redirectedFromPatientIds: [
              ...new Set([
                ...existing
                  .redirectedFromPatientIds,
                ...item
                  .redirectedFromPatientIds,
              ]),
            ],
          },
        );
      }
    }

    const allItems =
      [...canonicalItems.values()];

    const start =
      (query.page - 1) *
      query.pageSize;

    const items =
      allItems.slice(
        start,
        start + query.pageSize,
      );

    if (
      accessLevel === 'SENSITIVE'
    ) {
      await Promise.all(
        items.map(
          (item) =>
            this.sensitiveReadAuditor
              .recordPatientRead({
                actor,
                patientId:
                  item.redirectedFromPatientIds[0] ??
                  item.id,
                canonicalPatientId:
                  item.id,
                redirected:
                  item.redirectedFromPatientIds.length >
                  0,
                resource:
                  'SEARCH',
                fieldGroups: [
                  'identity',
                  'demographics',
                  'contact',
                ],
                occurredAt:
                  now,
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
      totalItems:
        allItems.length,
      totalPages:
        allItems.length === 0
          ? 0
          : Math.ceil(
              allItems.length /
              query.pageSize,
            ),
    };
  }

  public async getProfile(
    patientId: string,
    query: PatientProfileQuery,
    accessLevel: PatientQueryAccessLevel,
    actor: PatientActorContext,
  ): Promise<PatientProfileDto> {
    const canonicalization =
      await this.canonicalization
        .resolve(
          actor.facilityId,
          patientId,
        );

    const records =
      await this.repository
        .loadProfile(
          actor.facilityId,
          canonicalization
            .canonicalPatientId,
          accessLevel,
          query,
        );

    if (records === null) {
      throw new ResourceNotFoundError(
        'Patient was not found',
      );
    }

    const now =
      this.clock.now();

    const profile =
      toPatientProfileDto(
        records,
        {
          accessLevel,
          canonicalization,
          now,
        },
      );

    if (
      accessLevel === 'SENSITIVE'
    ) {
      await this.sensitiveReadAuditor
        .recordPatientRead({
          actor,
          patientId,
          canonicalPatientId:
            canonicalization
              .canonicalPatientId,
          redirected:
            canonicalization.redirected,
          resource:
            'PROFILE',
          fieldGroups: [
            'identity',
            'demographics',
            'contacts',
            'addresses',
            'guardians',
            'alerts',
          ],
          occurredAt:
            now,
        });
    }

    return profile;
  }
}