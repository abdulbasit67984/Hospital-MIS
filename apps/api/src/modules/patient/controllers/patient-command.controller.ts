import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  PatientApplication,
} from '../patient.application.js';

import {
  patientMutationContextFromRequest,
  validatedPatientPart,
} from '../patient.http-helpers.js';

import type {
  AddPatientIdentifierBody,
  PatientAddressPathParams,
  PatientAlertPathParams,
  PatientContactPathParams,
  PatientGuardianRelationshipPathParams,
  PatientIdentifierPathParams,
  PatientPathParams,
  VerifyPatientGuardianBody,
  VerifyPatientIdentifierBody,
} from '../patient.http.validation.js';

import type {
  MergePatientsInput,
  ResolveDuplicateReviewInput,
} from '../patient.merge.js';

import type {
  AddPatientAddressInput,
  AddPatientContactInput,
  CreatePatientAlertInput,
  DeactivatePatientAddressInput,
  DeactivatePatientContactInput,
  EndPatientGuardianInput,
  ResolvePatientAlertInput,
  UpdatePatientAddressInput,
  UpdatePatientContactInput,
  VerifyPatientContactInput,
} from '../patient-profile.mutation.types.js';

import type {
  LinkGuardianBody,
  RegisterPatientBody,
  UpdatePatientBody,
} from '../patient.validation.js';

export class PatientCommandController {
  public constructor(
    private readonly application:
      PatientApplication,
  ) {}

  public register = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const context =
      patientMutationContextFromRequest(
        request,
      );

    const result =
      await this.application
        .workflows
        .registerPatient
        .execute({
          input:
            validatedPatientPart<
              RegisterPatientBody
            >(
              request,
              'body',
            ),

          ...context,
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public update = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const context =
      patientMutationContextFromRequest(
        request,
      );

    const result =
      await this.application
        .workflows
        .updatePatient
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              UpdatePatientBody
            >(
              request,
              'body',
            ),

          ...context,
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public addIdentifier = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const context =
      patientMutationContextFromRequest(
        request,
      );

    const result =
      await this.application
        .workflows
        .addPatientIdentifier
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              AddPatientIdentifierBody
            >(
              request,
              'body',
            ),

          ...context,
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public verifyIdentifier = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientIdentifierPathParams
      >(
        request,
        'params',
      );

    const body =
      validatedPatientPart<
        VerifyPatientIdentifierBody
      >(
        request,
        'body',
      );

    const context =
      patientMutationContextFromRequest(
        request,
      );

    const result =
      await this.application
        .workflows
        .verifyPatientIdentifier
        .execute({
          identifierId:
            params.identifierId,

          expectedVersion:
            body.expectedVersion,

          reason:
            body.reason,

          ...context,
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public revokeIdentifier = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientIdentifierPathParams
      >(
        request,
        'params',
      );

    const body =
      validatedPatientPart<
        VerifyPatientIdentifierBody
      >(
        request,
        'body',
      );

    const context =
      patientMutationContextFromRequest(
        request,
      );

    const result =
      await this.application
        .workflows
        .revokePatientIdentifier
        .execute({
          identifierId:
            params.identifierId,

          expectedVersion:
            body.expectedVersion,

          reason:
            body.reason,

          ...context,
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public linkGuardian = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const body =
      validatedPatientPart<
        LinkGuardianBody
      >(
        request,
        'body',
      );

    const {
      guardianId,
      ...relationship
    } = body;

    const result =
      await this.application
        .workflows
        .linkPatientGuardian
        .execute({
          patientId:
            params.patientId,

          guardianId,

          input:
            relationship,

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public verifyGuardianRelationship = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientGuardianRelationshipPathParams
      >(
        request,
        'params',
      );

    const body =
      validatedPatientPart<
        VerifyPatientGuardianBody
      >(
        request,
        'body',
      );

    const result =
      await this.application
        .workflows
        .verifyPatientGuardian
        .execute({
          relationshipId:
            params.relationshipId,

          expectedVersion:
            body.expectedVersion,

          reason:
            body.reason,

          ...(body.verificationNotes ===
          undefined
            ? {}
            : {
                verificationNotes:
                  body.verificationNotes,
              }),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public endGuardianRelationship = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientGuardianRelationshipPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .endPatientGuardian
        .execute({
          relationshipId:
            params.relationshipId,

          input:
            validatedPatientPart<
              EndPatientGuardianInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public addContact = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .addPatientContact
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              AddPatientContactInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public updateContact = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientContactPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .updatePatientContact
        .execute({
          contactId:
            params.contactId,

          input:
            validatedPatientPart<
              UpdatePatientContactInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public verifyContact = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientContactPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .verifyPatientContact
        .execute({
          contactId:
            params.contactId,

          input:
            validatedPatientPart<
              VerifyPatientContactInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public deactivateContact = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientContactPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .deactivatePatientContact
        .execute({
          contactId:
            params.contactId,

          input:
            validatedPatientPart<
              DeactivatePatientContactInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public addAddress = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .addPatientAddress
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              AddPatientAddressInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public updateAddress = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientAddressPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .updatePatientAddress
        .execute({
          addressId:
            params.addressId,

          input:
            validatedPatientPart<
              UpdatePatientAddressInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public deactivateAddress = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientAddressPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .deactivatePatientAddress
        .execute({
          addressId:
            params.addressId,

          input:
            validatedPatientPart<
              DeactivatePatientAddressInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public createAlert = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .createPatientAlert
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              CreatePatientAlertInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public resolveAlert = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientAlertPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .resolvePatientAlert
        .execute({
          alertId:
            params.alertId,

          input:
            validatedPatientPart<
              ResolvePatientAlertInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public resolveDuplicateReview = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .resolveDuplicateReview
        .execute({
          patientId:
            params.patientId,

          input:
            validatedPatientPart<
              ResolveDuplicateReviewInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public merge = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPatientPart<
        PatientPathParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .mergePatients
        .execute({
          sourcePatientId:
            params.patientId,

          input:
            validatedPatientPart<
              MergePatientsInput
            >(
              request,
              'body',
            ),

          ...patientMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };
}