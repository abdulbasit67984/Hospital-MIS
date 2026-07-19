import type {
  LaboratoryApplication,
} from './laboratory.application.js';

import type {
  LaboratoryActorContext,
  LaboratoryResultSummaryView,
} from './laboratory.types.js';

export interface EncounterLaboratorySection {
  encounterId: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    priority: string;
    status: string;
    itemCount: number;
    orderedAt: string;
  }>;
  results: LaboratoryResultSummaryView[];
}

export interface PatientLaboratoryHistorySection {
  patientId: string;
  results: LaboratoryResultSummaryView[];
  total: number;
  page: number;
  pageSize: number;
}

export class LaboratoryClinicalIntegration {
  public constructor(
    private readonly application: LaboratoryApplication,
  ) {}

  public async getEncounterSection(
    actor: LaboratoryActorContext,
    encounterId: string,
  ): Promise<EncounterLaboratorySection> {
    const [orders, results] =
      await Promise.all([
        this.application.services.query.listOperationalOrders(
          actor,
          {
            encounterId,
            page: 1,
            pageSize: 100,
            sortBy: 'orderedAt',
            sortDirection: 'desc',
          },
        ),

        this.application.services.resultQueries.listEncounterHistory(
          actor,
          encounterId,
          1,
          100,
        ),
      ]);

    return {
      encounterId,
      orders: orders.items.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        priority: order.priority,
        status: order.status,
        itemCount: order.itemCount,
        orderedAt: order.orderedAt,
      })),
      results: results.items,
    };
  }

  public async getPatientHistorySection(
    actor: LaboratoryActorContext,
    patientId: string,
    page: number,
    pageSize: number,
  ): Promise<PatientLaboratoryHistorySection> {
    const result =
      await this.application.services.resultQueries.listPatientHistory(
        actor,
        patientId,
        page,
        pageSize,
      );

    return {
      patientId,
      results: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  =
      await this.application.services.resultQueries.listPatientHistory(
        actor,
        patientId,
        page,
        pageSize,
      );

    return {
      }
}