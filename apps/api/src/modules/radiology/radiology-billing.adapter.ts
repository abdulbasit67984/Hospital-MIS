import type {
  RadiologyChargeBridgePort,
  RadiologyChargeCancellationRequest,
  RadiologyChargeRequest,
  RadiologyChargeRequestResult,
} from './services/radiology-command.service.js';

export interface UnifiedBillingRadiologyPort {
  createSourceCharge(input: {
    facilityId: string;
    patientId: string;
    encounterId: string;
    sourceModule: 'RADIOLOGY';
    sourceType: 'RADIOLOGY_ORDER_ITEM';
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
    sourceModule: 'RADIOLOGY';
    sourceType: 'RADIOLOGY_ORDER_ITEM';
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

export class RadiologyBillingAdapter
implements RadiologyChargeBridgePort {
  public constructor(
    private readonly billing: UnifiedBillingRadiologyPort,
  ) {}

  public async requestCharge(
    request: RadiologyChargeRequest,
  ): Promise<RadiologyChargeRequestResult> {
    const result = await this.billing.createSourceCharge({
      facilityId: request.facilityId,
      patientId: request.patientId,
      encounterId: request.encounterId,
      sourceModule: 'RADIOLOGY',
      sourceType: 'RADIOLOGY_ORDER_ITEM',
      sourceId: request.radiologyOrderItemId,
      chargeCatalogItemId: request.chargeCatalogItemId,
      quantity: request.quantity,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      correlationId: request.correlationId,
      transactionId: request.transactionId,
      idempotencyKey: [
        request.transactionId,
        'radiology-charge',
        request.radiologyOrderItemId,
      ].join(':'),
    });

    return {
      status: result.state,
      accountChargeId: result.chargeId,
    };
  }

  public async requestCancellation(
    request: RadiologyChargeCancellationRequest,
  ): Promise<void> {
    await this.billing.cancelSourceCharge({
      facilityId: request.facilityId,
      sourceModule: 'RADIOLOGY',
      sourceType: 'RADIOLOGY_ORDER_ITEM',
      sourceId: request.radiologyOrderItemId,
      chargeId: request.accountChargeId,
      reason: request.reason,
      requestedBy: request.requestedBy,
      requestedAt: request.requestedAt,
      correlationId: request.correlationId,
      transactionId: request.transactionId,
      idempotencyKey: [
        request.transactionId,
        'radiology-charge-cancellation',
        request.radiologyOrderItemId,
      ].join(':'),
    });
  }
}