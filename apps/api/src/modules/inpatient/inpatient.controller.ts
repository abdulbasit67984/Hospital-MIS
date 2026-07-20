import type {
  FastifyReply,
} from 'fastify';

import type {
  InpatientApplication,
} from './inpatient.application.js';

import {
  inpatientActorFromRequest,
  parseInpatientInput,
  requireInpatientIdempotencyKey,
  type InpatientAuthenticatedRequest,
} from './inpatient.http.js';

import {
  acknowledgeWardHandoverBodySchema,
  createMedicationScheduleBodySchema,
  createNursingNoteBodySchema,
  createWardHandoverBodySchema,
  recordMedicationDoseBodySchema,
  recordNursingVitalSignBodySchema,
} from './inpatient-nursing.validation.js';

import {
  cancelDischargeBodySchema,
  clinicallyClearDischargeBodySchema,
  completeDischargeBodySchema,
  confirmFinancialClearanceBodySchema,
  initiateDischargeBodySchema,
  prepareDischargeSummaryBodySchema,
  updateDischargeReadinessBodySchema,
} from './inpatient-discharge.validation.js';

export function createInpatientController(
  application:
    InpatientApplication,
) {
  return {
    async recordVitalSign(
      request:
        InpatientAuthenticatedRequest,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.recordVitalSign({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              recordNursingVitalSignBodySchema,
              request.body,
            ),
        });

      return reply
        .status(
          201,
        )
        .send(
          result,
        );
    },

    async createNursingNote(
      request:
        InpatientAuthenticatedRequest,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.createNursingNote({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              createNursingNoteBodySchema,
              request.body,
            ),
        });

      return reply
        .status(
          201,
        )
        .send(
          result,
        );
    },

    async createMedicationSchedule(
      request:
        InpatientAuthenticatedRequest,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.createMedicationSchedule({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              createMedicationScheduleBodySchema,
              request.body,
            ),
        });

      return reply
        .status(
          201,
        )
        .send(
          result,
        );
    },

    async recordMedicationDose(
      request:
        InpatientAuthenticatedRequest<{
          scheduleId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.recordMedicationDose({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          entityId:
            request.params.scheduleId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              recordMedicationDoseBodySchema,
              request.body,
            ),
        });

      return reply.send(
        result,
      );
    },

    async createWardHandover(
      request:
        InpatientAuthenticatedRequest,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.createWardHandover({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              createWardHandoverBodySchema,
              request.body,
            ),
        });

      return reply
        .status(
          201,
        )
        .send(
          result,
        );
    },

    async acknowledgeWardHandover(
      request:
        InpatientAuthenticatedRequest<{
          handoverId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.nursing.acknowledgeWardHandover({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          entityId:
            request.params.handoverId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              acknowledgeWardHandoverBodySchema,
              request.body,
            ),
        });

      return reply.send(
        result,
      );
    },

    async initiateDischarge(
      request:
        InpatientAuthenticatedRequest,
      reply:
        FastifyReply,
    ) {
      const result =
        await application.services.discharge.initiate({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              initiateDischargeBodySchema,
              request.body,
            ),
        });

      return reply
        .status(
          201,
        )
        .send(
          result,
        );
    },

    async updateDischargeReadiness(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.updateReadiness({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              updateDischargeReadinessBodySchema,
              request.body,
            ),
        }),
      );
    },

    async prepareDischargeSummary(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.prepareSummary({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              prepareDischargeSummaryBodySchema,
              request.body,
            ),
        }),
      );
    },

    async clinicallyClearDischarge(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.clinicallyClear({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              clinicallyClearDischargeBodySchema,
              request.body,
            ),
        }),
      );
    },

    async confirmFinancialClearance(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.confirmFinancialClearance({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              confirmFinancialClearanceBodySchema,
              request.body,
            ),
        }),
      );
    },

    async completeDischarge(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.complete({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              completeDischargeBodySchema,
              request.body,
            ),
        }),
      );
    },

    async cancelDischarge(
      request:
        InpatientAuthenticatedRequest<{
          dischargeId:
            string;
        }>,
      reply:
        FastifyReply,
    ) {
      return reply.send(
        await application.services.discharge.cancel({
          actor:
            inpatientActorFromRequest(
              request,
            ),

          dischargeId:
            request.params.dischargeId,

          idempotencyKey:
            requireInpatientIdempotencyKey(
              request,
            ),

          input:
            parseInpatientInput(
              cancelDischargeBodySchema,
              request.body,
            ),
        }),
      );
    },
  };
}