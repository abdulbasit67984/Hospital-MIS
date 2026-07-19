import type {
  LaboratoryChargeBridgePort,
  LaboratoryChargeCancellationRequest,
  LaboratoryChargeRequest,
  LaboratoryChargeRequestResult,
} from './services/laboratory-command.service.js';

export interface UnifiedBillingLaboratoryPort {
  createSourceCharge(input: {
    facilityId: string;
    patientId: string;
    encounterId: string;
    sourceModule: 'LABORATORY';
    sourceType: 'LAB_ORDER_ITEM';
    sourceId: string;
    chargeCatalogItemId: string;
    quantity: string;
    requestedBy: string;
    requestedAt: Date;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<{
    state: 'PENDING' | 'CHARGED';
    chargeId: string | null;
  }>;

  cancelSourceCharge(input: {
    facilityId: string;
    sourceModule: 'LABORATORY';
    sourceType: 'LAB_ORDER_ITEM';
    sourceId: string;
    chargeId: string | null;
    reason: string;
    requestedBy: string;
    requestedAt: Date;
    correlationId: string;
    transactionId: string;
    idempotencyKey: string;
  }): Promise<void>;
}

export class LaboratoryBillingAdapter
implements LaboratoryChargeBridgePort {
  public constructor(
    private readonly billing: UnifiedBillingLaboratoryPort,
  ) {}

  public async requestCharge(
    request: LaboratoryChargeRequest,
  ): Promise<LaboratoryChargeRequestResult> {
    const result =
      await this.billing.createSourceCharge({
        facilityId: request.facilityId,
        patientId: request.patientId,
        encounterId: request.encounterId,
        sourceModule: 'LABORATORY',
        sourceType: 'LAB_ORDER_ITEM',
        sourceId: request.laboratoryOrderItemId,
        chargeCatalogItemId: request.chargeCatalogItemId,
        quantity: request.quantity,
        requestedBy: request.requestedBy,
        requestedAt: request.requestedAt,
        correlationId: request.correlationId,
        transactionId: request.transactionId,
        idempotencyKey: [
          request.transactionId,
          'laboratory-charge',
          request.laboratoryOrderItemId,
        ].join(':'),
      });

    return {
      status: result.state,
      accountChargeId: result.chargeId,
    };
  }

  public async requestCancellation(
    request: LaboratoryChargeCancellationRequest,
  ): Promise<void> {
    await this.billing.cancelSourceCharge({
      facilityId: request.facilityId,
      sourceModule: 'LABORATORY',
      sourceType: 'LAB_ORDER_ITEM',
      sourceId: request.laboratoryOrderItemId,
      chargeId: request.accountChargeId,
      reason: request.reason,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      correlationId: request.correlationId,
      transactionId: request.transactionId,
      idempotencyKey: [
        request.transactionId,
        'laboratory-charge-cancellation',
        request.laboratoryOrderItemId,
      ].join(':'),
    });
  }
}