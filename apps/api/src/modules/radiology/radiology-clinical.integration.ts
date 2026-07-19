import type {
  RadiologyActorContext,
} from './radiology.types.js';

import type {
  RadiologyFinalReportSnapshot,
  RadiologyReportSummaryView,
} from './radiology-reporting.contracts.js';

import type {
  RadiologyReportingService,
} from './services/radiology-reporting.service.js';

export interface EncounterRadiologySection {
  encounterId:
    string;

  reports:
    RadiologyReportSummaryView[];

  total:
    number;
}

export interface PatientRadiologyHistorySection {
  patientId:
    string;

  reports:
    RadiologyReportSummaryView[];

  total:
    number;

  page:
    number;

  pageSize:
    number;
}

export class RadiologyClinicalIntegration {
  public constructor(
    private readonly reporting:
      RadiologyReportingService,
  ) {}

  public async getEncounterSection(
    actor:
      RadiologyActorContext,

    encounterId:
      string,
  ): Promise<
    EncounterRadiologySection
  > {
    const result =
      await this.reporting.listEncounterHistory(
        actor,
        encounterId,
        1,
        100,
      );

    return {
      encounterId,

      reports:
        result.items,

      total:
        result.total,
    };
  }

  public async getPatientHistorySection(
    actor:
      RadiologyActorContext,

    patientId:
      string,

    page:
      number,

    pageSize:
      number,
  ): Promise<
    PatientRadiologyHistorySection
  > {
    const result =
      await this.reporting.listPatientHistory(
        actor,
        patientId,
        page,
        pageSize,
      );

    return {
      patientId,

      reports:
        result.items,

      total:
        result.total,

      page:
        result.page,

      pageSize:
        result.pageSize,
    };
  }

  public async getPublishedReport(
    actor:
      RadiologyActorContext,

    reportId:
      string,
  ): Promise<
    RadiologyFinalReportSnapshot
  > {
    return this.reporting.getPublishedSnapshot(
      actor,
      reportId,
    );
  }
}