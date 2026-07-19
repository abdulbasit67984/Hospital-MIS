import type {
  Request,
  Response,
} from 'express';

import {
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  FormularyPrescriptionApplication,
} from './formulary-prescriptions.application.js';

import {
  formularyPrescriptionActorFromRequest,
  formularyPrescriptionIdempotencyKeyFromRequest,
  validatedFormularyPrescriptionPart,
} from './formulary-prescriptions.http-contracts.js';

import type {
  FormularyPrescriptionActorContext,
  FormularySearchQuery,
  PrescriptionListQuery,
} from './formulary-prescriptions.types.js';

export class FormularyPrescriptionController {
  public constructor(
    private readonly application:
      FormularyPrescriptionApplication,

    private readonly authorization:
      AuthorizationService,
  ) {}

  private async actor(
    request:
      Request,
  ): Promise<FormularyPrescriptionActorContext> {
    return formularyPrescriptionActorFromRequest(
      request,
      this.authorization,
    );
  }

  private mutationContext(
    request:
      Request,
  ): Promise<{
    actor:
      FormularyPrescriptionActorContext;

    idempotencyKey:
      string;
  }> {
    return this.actor(
      request,
    ).then(
      (actor) => ({
        actor,

        idempotencyKey:
          formularyPrescriptionIdempotencyKeyFromRequest(
            request,
          ),
      }),
    );
  }

  private parameter(
    request:
      Request,

    key:
      string,
  ): string {
    const params =
      validatedFormularyPrescriptionPart<
        Record<
          string,
          string | undefined
        >
      >(
        request,
        'params',
      );

    const value =
      params[
        key
      ];

    if (value === undefined) {
      throw new ResourceNotFoundError(
        `Formulary or prescription route parameter ${key} is unavailable`,
      );
    }

    return value;
  }

  private send(
    request:
      Request,

    response:
      Response,

    status:
      number,

    result:
      unknown,
  ): void {
    response
      .status(
        status,
      )
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  }

  public searchFormulary = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.application
        .services
        .queries
        .searchFormulary(
          await this.actor(
            request,
          ),

          validatedFormularyPrescriptionPart<FormularySearchQuery>(
            request,
            'query',
          ),
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public getFormularyItem = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const query =
      validatedFormularyPrescriptionPart<{
        includeStock:
          boolean;
      }>(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queries
        .getFormularyItem(
          await this.actor(
            request,
          ),

          this.parameter(
            request,
            'formularyItemId',
          ),

          query.includeStock,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public createFormularyItem = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const created =
      await this.application
        .workflows
        .createFormularyItem
        .execute({
          ...context,

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getFormularyItem(
          context.actor,
          created._id.toHexString(),
          false,
        );

    this.send(
      request,
      response,
      201,
      result,
    );
  };

  public updateFormularyItem = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const updated =
      await this.application
        .workflows
        .updateFormularyItem
        .execute({
          ...context,

          formularyItemId:
            this.parameter(
              request,
              'formularyItemId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getFormularyItem(
          context.actor,
          updated._id.toHexString(),
          false,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public changeFormularyItemStatus = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const updated =
      await this.application
        .workflows
        .changeFormularyItemStatus
        .execute({
          ...context,

          formularyItemId:
            this.parameter(
              request,
              'formularyItemId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getFormularyItem(
          context.actor,
          updated._id.toHexString(),
          false,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public listPrescriptions = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.application
        .services
        .queries
        .listPrescriptions(
          await this.actor(
            request,
          ),

          validatedFormularyPrescriptionPart<PrescriptionListQuery>(
            request,
            'query',
          ),
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public patientMedicationHistory = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const query =
      validatedFormularyPrescriptionPart<PrescriptionListQuery>(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queries
        .patientMedicationHistory(
          await this.actor(
            request,
          ),

          this.parameter(
            request,
            'patientId',
          ),

          {
            page:
              query.page,

            pageSize:
              query.pageSize,

            sortBy:
              query.sortBy,

            sortDirection:
              query.sortDirection,

            ...(query.encounterId ===
            undefined
              ? {}
              : {
                  encounterId:
                    query.encounterId,
                }),

            ...(query.prescriberProviderId ===
            undefined
              ? {}
              : {
                  prescriberProviderId:
                    query.prescriberProviderId,
                }),

            ...(query.status ===
            undefined
              ? {}
              : {
                  status:
                    query.status,
                }),

            ...(query.issuedFrom ===
            undefined
              ? {}
              : {
                  issuedFrom:
                    query.issuedFrom,
                }),

            ...(query.issuedTo ===
            undefined
              ? {}
              : {
                  issuedTo:
                    query.issuedTo,
                }),

            includeItems:
              true,

            includeWarnings:
              query.includeWarnings,
          },
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public getPrescription = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const query =
      validatedFormularyPrescriptionPart<{
        includeItems:
          boolean;

        includeWarnings:
          boolean;
      }>(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          await this.actor(
            request,
          ),

          this.parameter(
            request,
            'prescriptionId',
          ),

          query.includeItems,
          query.includeWarnings,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public getPrescriptionHistory = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.application
        .services
        .queries
        .getPrescriptionHistory(
          await this.actor(
            request,
          ),

          this.parameter(
            request,
            'prescriptionId',
          ),
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public createPrescriptionDraft = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const created =
      await this.application
        .workflows
        .createPrescriptionDraft
        .execute({
          ...context,

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          context.actor,
          created._id.toHexString(),
          true,
          true,
        );

    this.send(
      request,
      response,
      201,
      result,
    );
  };

  public updatePrescriptionDraft = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const updated =
      await this.application
        .workflows
        .updatePrescriptionDraft
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          context.actor,
          updated._id.toHexString(),
          true,
          true,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public issuePrescription = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const issued =
      await this.application
        .workflows
        .issuePrescription
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          context.actor,
          issued._id.toHexString(),
          true,
          true,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public cancelPrescription = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const cancelled =
      await this.application
        .workflows
        .cancelPrescription
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          context.actor,
          cancelled._id.toHexString(),
          true,
          true,
        );

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public replacePrescription = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const replacement =
      await this.application
        .workflows
        .replacePrescription
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const result =
      await this.application
        .services
        .queries
        .getPrescription(
          context.actor,
          replacement._id
            .toHexString(),
          true,
          true,
        );

    this.send(
      request,
      response,
      201,
      result,
    );
  };

  public acknowledgeWarning = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const result =
      await this.application
        .workflows
        .acknowledgePrescriptionWarning
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          warningId:
            this.parameter(
              request,
              'warningId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    this.send(
      request,
      response,
      200,
      result,
    );
  };

  public printPrescription = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      await this.mutationContext(
        request,
      );

    const document =
      await this.application
        .workflows
        .printPrescription
        .execute({
          ...context,

          prescriptionId:
            this.parameter(
              request,
              'prescriptionId',
            ),

          input:
            validatedFormularyPrescriptionPart(
              request,
              'body',
            ),
        } as never);

    const safeFilename =
      document.filename
        .replaceAll(
          /[\r\n"]/gu,
          '',
        )
        .slice(
          0,
          200,
        );

    response
      .status(
        200,
      )
      .setHeader(
        'content-type',
        document.mediaType,
      )
      .setHeader(
        'content-disposition',
        `inline; filename="${safeFilename}"`,
      )
      .setHeader(
        'x-content-sha256',
        document.contentHash,
      )
      .send(
        Buffer.from(
          document.bytes,
        ),
      );
  };
}