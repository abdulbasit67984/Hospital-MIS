import type {
  Request,
  RequestHandler,
  Response,
} from 'express';

import {
  Router,
  type Router as ExpressRouter,
} from 'express';

import {
  z,
} from 'zod';

import {
  BadRequestError,
  ResourceNotFoundError,
  UnauthorizedError,
  createApiSuccess,
} from '@hospital-mis/shared';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  InventoryActorResolverPort,
} from '../../infrastructure/inventory-runtime.adapters.js';

import type {
  InventoryApplication,
} from './inventory.application.js';

import {
  INVENTORY_PERMISSION_KEYS,
} from './inventory.constants.js';

import {
  changeInventoryCatalogStatusBodySchema,
  changeSupplierStatusBodySchema,
  createInventoryCategoryBodySchema,
  createInventoryItemBodySchema,
  createInventoryLocationBodySchema,
  createSupplierBodySchema,
  inventoryBatchListQuerySchema,
  inventoryCategoryListQuerySchema,
  inventoryItemListQuerySchema,
  inventoryLocationListQuerySchema,
  inventoryMutationHeadersSchema,
  inventoryObjectIdSchema,
  inventoryReadHeadersSchema,
  inventoryUnitConversionBodySchema,
  stockBalanceListQuerySchema,
  supplierListQuerySchema,
  updateInventoryCategoryBodySchema,
  updateInventoryItemBodySchema,
  updateInventoryLocationBodySchema,
  updateSupplierBodySchema,
} from './inventory.validation.js';

import {
  acknowledgePurchaseOrderBodySchema,
  approveSupplierReturnBodySchema,
  cancelPurchaseOrderBodySchema,
  createPurchaseOrderBodySchema,
  createPurchaseRequisitionBodySchema,
  decidePurchaseRequisitionBodySchema,
  enterGoodsReceiptInErrorBodySchema,
  initiateSupplierReturnBodySchema,
  receiveGoodsBodySchema,
  submitPurchaseRequisitionBodySchema,
} from './inventory-procurement.validation.js';

import {
  approveStockTransferBodySchema,
  cancelStockTransferBodySchema,
  consumeDispensingReservationBodySchema,
  createStockTransferRequestBodySchema,
  dispatchStockTransferBodySchema,
  expireReservationsBodySchema,
  receiveStockTransferBodySchema,
  rejectStockTransferBodySchema,
  releaseStockReservationBodySchema,
  reserveStockBodySchema,
  reverseDispensingBodySchema,
  reverseStockTransferBodySchema,
} from './inventory-stock.validation.js';

import {
  activateProductRecallBodySchema,
  closeProductRecallBodySchema,
  createPhysicalStockCountBodySchema,
  createProductRecallBodySchema,
  createStockAdjustmentBodySchema,
  decideInventoryControlBodySchema,
  inventoryMonitoringQuerySchema,
  inventoryValuationQuerySchema,
  nearExpiryInventoryQuerySchema,
  recordPhysicalStockCountLineBodySchema,
  reverseStockAdjustmentBodySchema,
  runInventoryRestrictionSweepBodySchema,
  stockReconciliationQuerySchema,
  submitInventoryControlBodySchema,
  upsertReorderRuleBodySchema,
} from './inventory-control.validation.js';

import type {
  InventoryOperationalResource,
} from './services/inventory-query.service.js';

const mutationHeadersSchema =
  inventoryMutationHeadersSchema.passthrough();
const readHeadersSchema =
  inventoryReadHeadersSchema.passthrough();

const categoryParamsSchema = z
  .object({
    categoryId: inventoryObjectIdSchema,
  })
  .strict();

const itemParamsSchema = z
  .object({
    itemId: inventoryObjectIdSchema,
  })
  .strict();

const supplierParamsSchema = z
  .object({
    supplierId: inventoryObjectIdSchema,
  })
  .strict();

const locationParamsSchema = z
  .object({
    locationId: inventoryObjectIdSchema,
  })
  .strict();

const requisitionParamsSchema = z
  .object({
    requisitionId: inventoryObjectIdSchema,
  })
  .strict();

const purchaseOrderParamsSchema = z
  .object({
    purchaseOrderId: inventoryObjectIdSchema,
  })
  .strict();

const receiptParamsSchema = z
  .object({
    goodsReceiptId: inventoryObjectIdSchema,
  })
  .strict();

const supplierReturnParamsSchema = z
  .object({
    supplierReturnId: inventoryObjectIdSchema,
  })
  .strict();

const transferParamsSchema = z
  .object({
    transferId: inventoryObjectIdSchema,
  })
  .strict();

const reservationParamsSchema = z
  .object({
    reservationId: inventoryObjectIdSchema,
  })
  .strict();

const adjustmentParamsSchema = z
  .object({
    adjustmentId: inventoryObjectIdSchema,
  })
  .strict();

const countParamsSchema = z
  .object({
    countId: inventoryObjectIdSchema,
  })
  .strict();

const countLineParamsSchema = z
  .object({
    countId: inventoryObjectIdSchema,
    countItemId: inventoryObjectIdSchema,
  })
  .strict();

const recallParamsSchema = z
  .object({
    recallId: inventoryObjectIdSchema,
  })
  .strict();

const operationalListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25),
    status: z.string().trim().min(1).max(80).optional(),
    locationId: inventoryObjectIdSchema.optional(),
    supplierId: inventoryObjectIdSchema.optional(),
    itemId: inventoryObjectIdSchema.optional(),
    sourceType: z.string().trim().min(1).max(100).optional(),
    sourceId: inventoryObjectIdSchema.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      new Date(value.from) <= new Date(value.to),
    {
      path: ['to'],
      message: 'Query end must be on or after query start',
    },
  );

function validated<T>(
  request: Request,
  location: 'params' | 'query' | 'body' | 'headers',
): T {
  const value = request.validated[location];

  if (value === undefined) {
    throw new BadRequestError(
      `Validated inventory request ${location} is unavailable`,
    );
  }

  return value as T;
}

function requirePrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (request.auth === undefined) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

function parameter(
  request: Request,
  key: string,
): string {
  const value = validated<Record<string, string | undefined>>(
    request,
    'params',
  )[key];

  if (value === undefined) {
    throw new ResourceNotFoundError(
      `Inventory route parameter ${key} is unavailable`,
    );
  }

  return value;
}

function idempotencyKey(
  request: Request,
): string {
  return validated<{
    'idempotency-key': string;
  }>(request, 'headers')['idempotency-key'];
}

function jsonSafe(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 24) {
    return null;
  }

  if (value == null) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      jsonSafe(entry, depth + 1),
    );
  }

  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;

    if (typeof object['toHexString'] === 'function') {
      return (
        object['toHexString'] as () => string
      )();
    }

    if (
      object['_bsontype'] === 'Decimal128' &&
      typeof object['toString'] === 'function'
    ) {
      return (
        object['toString'] as () => string
      )();
    }

    return Object.fromEntries(
      Object.entries(object)
        .filter(([key]) => !key.startsWith('$'))
        .map(([key, nested]) => [
          key,
          jsonSafe(nested, depth + 1),
        ]),
    );
  }

  return String(value);
}

export interface CreateInventoryRouterOptions {
  application: InventoryApplication;
  authenticationService: AuthenticationService;
  authorizationService: AuthorizationService;
  actorResolver: InventoryActorResolverPort;
}

export function createInventoryRouter(
  options: CreateInventoryRouterOptions,
): ExpressRouter {
  const router = Router();

  router.use(
    authenticate(options.authenticationService),
  );

  const actor = async (request: Request) => {
    const principal = requirePrincipal(request);
    const permissions =
      await options.authorizationService.permissionsFor(
        principal,
      );
    const headers = request.validated.headers as
      | {
          'x-break-glass-reason'?: string;
        }
      | undefined;
    const userAgent = request.header('user-agent');

    return options.actorResolver.resolve({
      userId: principal.userId,
      facilityId: principal.facilityId,
      correlationId: request.correlationId,
      permissions,
      ...(request.ip.length === 0
        ? {}
        : {
            ipAddress: request.ip,
          }),
      ...(userAgent === undefined
        ? {}
        : {
            userAgent,
          }),
      ...(headers?.['x-break-glass-reason'] === undefined
        ? {}
        : {
            breakGlassReason:
              headers['x-break-glass-reason'],
          }),
    });
  };

  const send = (
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ) => {
    response.status(status).json(
      createApiSuccess(
        jsonSafe(result),
        request.correlationId,
      ),
    );
  };

  const readHandler = (
    handler: (
      request: Request,
      resolvedActor: Awaited<ReturnType<typeof actor>>,
    ) => Promise<unknown>,
    status = 200,
  ): RequestHandler =>
    async (request, response) => {
      send(
        request,
        response,
        status,
        await handler(request, await actor(request)),
      );
    };

  const mutationHandler = (
    handler: (
      request: Request,
      context: {
        actor: Awaited<ReturnType<typeof actor>>;
        idempotencyKey: string;
      },
    ) => Promise<unknown>,
    status = 200,
  ): RequestHandler =>
    async (request, response) => {
      send(
        request,
        response,
        status,
        await handler(request, {
          actor: await actor(request),
          idempotencyKey: idempotencyKey(request),
        }),
      );
    };

  const read = (
    path: string,
    permission: Parameters<typeof requirePermission>[1],
    schemas: Parameters<typeof validateRequest>[0],
    handler: Parameters<typeof readHandler>[0],
  ) => {
    router.get(
      path,
      validateRequest({
        headers: readHeadersSchema,
        ...schemas,
      }),
      requirePermission(
        options.authorizationService,
        permission,
      ),
      readHandler(handler),
    );
  };

  const post = (
    path: string,
    permission: Parameters<typeof requirePermission>[1],
    schemas: Parameters<typeof validateRequest>[0],
    handler: Parameters<typeof mutationHandler>[0],
    status = 200,
  ) => {
    router.post(
      path,
      validateRequest({
        headers: mutationHeadersSchema,
        ...schemas,
      }),
      requirePermission(
        options.authorizationService,
        permission,
      ),
      mutationHandler(handler, status),
    );
  };

  const patch = (
    path: string,
    permission: Parameters<typeof requirePermission>[1],
    schemas: Parameters<typeof validateRequest>[0],
    handler: Parameters<typeof mutationHandler>[0],
  ) => {
    router.patch(
      path,
      validateRequest({
        headers: mutationHeadersSchema,
        ...schemas,
      }),
      requirePermission(
        options.authorizationService,
        permission,
      ),
      mutationHandler(handler),
    );
  };

  read(
    '/categories',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: inventoryCategoryListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listCategories(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/categories/:categoryId',
    INVENTORY_PERMISSION_KEYS.READ,
    { params: categoryParamsSchema },
    (request, resolvedActor) =>
      options.application.services.catalog.getCategory(
        resolvedActor,
        parameter(request, 'categoryId'),
      ),
  );

  post(
    '/categories',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    { body: createInventoryCategoryBodySchema },
    (request, context) =>
      options.application.services.catalog.createCategory(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  patch(
    '/categories/:categoryId',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: categoryParamsSchema,
      body: updateInventoryCategoryBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.updateCategory(
        context,
        parameter(request, 'categoryId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/categories/:categoryId/status',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: categoryParamsSchema,
      body: changeInventoryCatalogStatusBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.changeCategoryStatus(
        context,
        parameter(request, 'categoryId'),
        validated(request, 'body'),
      ),
  );

  read(
    '/items',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: inventoryItemListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listItems(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/items/:itemId',
    INVENTORY_PERMISSION_KEYS.READ,
    { params: itemParamsSchema },
    (request, resolvedActor) =>
      options.application.services.catalog.getItem(
        resolvedActor,
        parameter(request, 'itemId'),
      ),
  );

  post(
    '/items',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    { body: createInventoryItemBodySchema },
    (request, context) =>
      options.application.services.catalog.createItem(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  patch(
    '/items/:itemId',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: itemParamsSchema,
      body: updateInventoryItemBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.updateItem(
        context,
        parameter(request, 'itemId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/items/:itemId/status',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: itemParamsSchema,
      body: changeInventoryCatalogStatusBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.changeItemStatus(
        context,
        parameter(request, 'itemId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/items/:itemId/convert-unit',
    INVENTORY_PERMISSION_KEYS.READ,
    {
      params: itemParamsSchema,
      body: inventoryUnitConversionBodySchema,
    },
    async (request, context) =>
      options.application.services.catalog.convertUnit(
        context.actor,
        parameter(request, 'itemId'),
        validated(request, 'body'),
      ),
  );

  read(
    '/suppliers',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: supplierListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listSuppliers(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/suppliers/:supplierId',
    INVENTORY_PERMISSION_KEYS.READ,
    { params: supplierParamsSchema },
    (request, resolvedActor) =>
      options.application.services.catalog.getSupplier(
        resolvedActor,
        parameter(request, 'supplierId'),
      ),
  );

  post(
    '/suppliers',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    { body: createSupplierBodySchema },
    (request, context) =>
      options.application.services.catalog.createSupplier(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  patch(
    '/suppliers/:supplierId',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: supplierParamsSchema,
      body: updateSupplierBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.updateSupplier(
        context,
        parameter(request, 'supplierId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/suppliers/:supplierId/status',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: supplierParamsSchema,
      body: changeSupplierStatusBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.changeSupplierStatus(
        context,
        parameter(request, 'supplierId'),
        validated(request, 'body'),
      ),
  );

  read(
    '/locations',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: inventoryLocationListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listLocations(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/locations/:locationId',
    INVENTORY_PERMISSION_KEYS.READ,
    { params: locationParamsSchema },
    (request, resolvedActor) =>
      options.application.services.catalog.getLocation(
        resolvedActor,
        parameter(request, 'locationId'),
      ),
  );

  post(
    '/locations',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    { body: createInventoryLocationBodySchema },
    (request, context) =>
      options.application.services.catalog.createLocation(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  patch(
    '/locations/:locationId',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: locationParamsSchema,
      body: updateInventoryLocationBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.updateLocation(
        context,
        parameter(request, 'locationId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/locations/:locationId/status',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    {
      params: locationParamsSchema,
      body: changeInventoryCatalogStatusBodySchema,
    },
    (request, context) =>
      options.application.services.catalog.changeLocationStatus(
        context,
        parameter(request, 'locationId'),
        validated(request, 'body'),
      ),
  );

  read(
    '/batches',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: inventoryBatchListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listBatches(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/stock-balances',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: stockBalanceListQuerySchema },
    (request, resolvedActor) =>
      options.application.services.catalog.listBalances(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  const operationalRoutes: readonly {
    path: string;
    resource: InventoryOperationalResource;
    permission: Parameters<typeof requirePermission>[1];
    idParam: string;
    paramsSchema: z.ZodType;
  }[] = [
    {
      path: '/requisitions',
      resource: 'requisitions',
      permission: INVENTORY_PERMISSION_KEYS.PROCURE,
      idParam: 'requisitionId',
      paramsSchema: requisitionParamsSchema,
    },
    {
      path: '/purchase-orders',
      resource: 'purchaseOrders',
      permission: INVENTORY_PERMISSION_KEYS.PROCURE,
      idParam: 'purchaseOrderId',
      paramsSchema: purchaseOrderParamsSchema,
    },
    {
      path: '/goods-receipts',
      resource: 'goodsReceipts',
      permission: INVENTORY_PERMISSION_KEYS.RECEIVE,
      idParam: 'goodsReceiptId',
      paramsSchema: receiptParamsSchema,
    },
    {
      path: '/supplier-returns',
      resource: 'supplierReturns',
      permission: INVENTORY_PERMISSION_KEYS.PHARMACY_RETURN,
      idParam: 'supplierReturnId',
      paramsSchema: supplierReturnParamsSchema,
    },
    {
      path: '/transfers',
      resource: 'transfers',
      permission: INVENTORY_PERMISSION_KEYS.TRANSFER,
      idParam: 'transferId',
      paramsSchema: transferParamsSchema,
    },
    {
      path: '/reservations',
      resource: 'reservations',
      permission: INVENTORY_PERMISSION_KEYS.READ,
      idParam: 'reservationId',
      paramsSchema: reservationParamsSchema,
    },
    {
      path: '/adjustments',
      resource: 'adjustments',
      permission: INVENTORY_PERMISSION_KEYS.ADJUST,
      idParam: 'adjustmentId',
      paramsSchema: adjustmentParamsSchema,
    },
    {
      path: '/physical-counts',
      resource: 'counts',
      permission: INVENTORY_PERMISSION_KEYS.COUNT,
      idParam: 'countId',
      paramsSchema: countParamsSchema,
    },
    {
      path: '/recalls',
      resource: 'recalls',
      permission: INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
      idParam: 'recallId',
      paramsSchema: recallParamsSchema,
    },
    {
      path: '/movements',
      resource: 'movements',
      permission: INVENTORY_PERMISSION_KEYS.READ,
      idParam: 'movementId',
      paramsSchema: z
        .object({
          movementId: inventoryObjectIdSchema,
        })
        .strict(),
    },
  ];

  for (const route of operationalRoutes) {
    read(
      route.path,
      route.permission,
      { query: operationalListQuerySchema },
      (request, resolvedActor) =>
        options.application.services.query.list(
          resolvedActor,
          route.resource,
          validated(request, 'query'),
        ),
    );

    read(
      `${route.path}/:${route.idParam}`,
      route.permission,
      { params: route.paramsSchema },
      (request, resolvedActor) =>
        options.application.services.query.get(
          resolvedActor,
          route.resource,
          parameter(request, route.idParam),
        ),
    );
  }

  post(
    '/requisitions',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    { body: createPurchaseRequisitionBodySchema },
    (request, context) =>
      options.application.services.procurement.createPurchaseRequisition(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/requisitions/:requisitionId/submit',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: requisitionParamsSchema,
      body: submitPurchaseRequisitionBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.submitPurchaseRequisition(
        context,
        parameter(request, 'requisitionId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/requisitions/:requisitionId/decision',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: requisitionParamsSchema,
      body: decidePurchaseRequisitionBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.decidePurchaseRequisition(
        context,
        parameter(request, 'requisitionId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/purchase-orders',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    { body: createPurchaseOrderBodySchema },
    (request, context) =>
      options.application.services.procurement.createPurchaseOrder(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/purchase-orders/:purchaseOrderId/acknowledge',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: purchaseOrderParamsSchema,
      body: acknowledgePurchaseOrderBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.acknowledgePurchaseOrder(
        context,
        parameter(request, 'purchaseOrderId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/purchase-orders/:purchaseOrderId/cancel',
    INVENTORY_PERMISSION_KEYS.PROCURE,
    {
      params: purchaseOrderParamsSchema,
      body: cancelPurchaseOrderBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.cancelPurchaseOrder(
        context,
        parameter(request, 'purchaseOrderId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/goods-receipts',
    INVENTORY_PERMISSION_KEYS.RECEIVE,
    { body: receiveGoodsBodySchema },
    (request, context) =>
      options.application.services.procurement.receiveGoods(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/goods-receipts/:goodsReceiptId/entered-in-error',
    INVENTORY_PERMISSION_KEYS.RECEIVE,
    {
      params: receiptParamsSchema,
      body: enterGoodsReceiptInErrorBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.enterGoodsReceiptInError(
        context,
        parameter(request, 'goodsReceiptId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/supplier-returns',
    INVENTORY_PERMISSION_KEYS.PHARMACY_RETURN,
    { body: initiateSupplierReturnBodySchema },
    (request, context) =>
      options.application.services.procurement.initiateSupplierReturn(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/supplier-returns/:supplierReturnId/approve',
    INVENTORY_PERMISSION_KEYS.PHARMACY_RETURN,
    {
      params: supplierReturnParamsSchema,
      body: approveSupplierReturnBodySchema,
    },
    (request, context) =>
      options.application.services.procurement.approveSupplierReturn(
        context,
        parameter(request, 'supplierReturnId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    { body: createStockTransferRequestBodySchema },
    (request, context) =>
      options.application.services.stock.createStockTransferRequest(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/transfers/:transferId/approve',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: approveStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.approveStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers/:transferId/reject',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: rejectStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.rejectStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers/:transferId/dispatch',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: dispatchStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.dispatchStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers/:transferId/receive',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: receiveStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.receiveStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers/:transferId/cancel',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: cancelStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.cancelStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/transfers/:transferId/reverse',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: transferParamsSchema,
      body: reverseStockTransferBodySchema,
    },
    (request, context) =>
      options.application.services.stock.reverseStockTransfer(
        context,
        parameter(request, 'transferId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/reservations',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    { body: reserveStockBodySchema },
    (request, context) =>
      options.application.services.stock.reserveStock(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/reservations/:reservationId/release',
    INVENTORY_PERMISSION_KEYS.TRANSFER,
    {
      params: reservationParamsSchema,
      body: releaseStockReservationBodySchema,
    },
    (request, context) =>
      options.application.services.stock.releaseStockReservation(
        context,
        parameter(request, 'reservationId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/reservations/expire',
    INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
    { body: expireReservationsBodySchema },
    (request, context) => {
      const body = validated<{
        limit?: number;
      }>(request, 'body');

      return options.application.services.stock.expireReservations(
        context,
        body.limit,
      );
    },
  );

  post(
    '/dispensing/reservations',
    INVENTORY_PERMISSION_KEYS.PHARMACY_DISPENSE,
    { body: reserveStockBodySchema },
    (request, context) =>
      options.application.services.stock.reserveForDispensing(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/dispensing/reservations/:reservationId/consume',
    INVENTORY_PERMISSION_KEYS.PHARMACY_DISPENSE,
    {
      params: reservationParamsSchema,
      body: consumeDispensingReservationBodySchema,
    },
    (request, context) =>
      options.application.services.stock.consumeDispensingReservation(
        context,
        parameter(request, 'reservationId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/dispensing/reverse',
    INVENTORY_PERMISSION_KEYS.PHARMACY_RETURN,
    { body: reverseDispensingBodySchema },
    (request, context) =>
      options.application.services.stock.reverseDispensing(
        context,
        validated(request, 'body'),
      ),
  );

  post(
    '/adjustments',
    INVENTORY_PERMISSION_KEYS.ADJUST,
    { body: createStockAdjustmentBodySchema },
    (request, context) =>
      options.application.services.controls.createStockAdjustment(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/adjustments/:adjustmentId/submit',
    INVENTORY_PERMISSION_KEYS.ADJUST,
    {
      params: adjustmentParamsSchema,
      body: submitInventoryControlBodySchema,
    },
    (request, context) =>
      options.application.services.controls.submitStockAdjustment(
        context,
        parameter(request, 'adjustmentId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/adjustments/:adjustmentId/decision',
    INVENTORY_PERMISSION_KEYS.ADJUST,
    {
      params: adjustmentParamsSchema,
      body: decideInventoryControlBodySchema,
    },
    (request, context) =>
      options.application.services.controls.decideStockAdjustment(
        context,
        parameter(request, 'adjustmentId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/adjustments/:adjustmentId/reverse',
    INVENTORY_PERMISSION_KEYS.ADJUST,
    {
      params: adjustmentParamsSchema,
      body: reverseStockAdjustmentBodySchema,
    },
    (request, context) =>
      options.application.services.controls.reverseStockAdjustment(
        context,
        parameter(request, 'adjustmentId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/physical-counts',
    INVENTORY_PERMISSION_KEYS.COUNT,
    { body: createPhysicalStockCountBodySchema },
    (request, context) =>
      options.application.services.controls.createPhysicalStockCount(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/physical-counts/:countId/start',
    INVENTORY_PERMISSION_KEYS.COUNT,
    {
      params: countParamsSchema,
      body: submitInventoryControlBodySchema,
    },
    (request, context) =>
      options.application.services.controls.transitionPhysicalStockCount(
        context,
        parameter(request, 'countId'),
        validated(request, 'body'),
        'START',
      ),
  );

  post(
    '/physical-counts/:countId/submit',
    INVENTORY_PERMISSION_KEYS.COUNT,
    {
      params: countParamsSchema,
      body: submitInventoryControlBodySchema,
    },
    (request, context) =>
      options.application.services.controls.transitionPhysicalStockCount(
        context,
        parameter(request, 'countId'),
        validated(request, 'body'),
        'SUBMIT',
      ),
  );

  post(
    '/physical-counts/:countId/items/:countItemId',
    INVENTORY_PERMISSION_KEYS.COUNT,
    {
      params: countLineParamsSchema,
      body: recordPhysicalStockCountLineBodySchema,
    },
    (request, context) =>
      options.application.services.controls.recordPhysicalStockCountLine(
        context,
        parameter(request, 'countId'),
        parameter(request, 'countItemId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/physical-counts/:countId/decision',
    INVENTORY_PERMISSION_KEYS.COUNT,
    {
      params: countParamsSchema,
      body: decideInventoryControlBodySchema,
    },
    (request, context) =>
      options.application.services.controls.decidePhysicalStockCount(
        context,
        parameter(request, 'countId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/recalls',
    INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
    { body: createProductRecallBodySchema },
    (request, context) =>
      options.application.services.controls.createProductRecall(
        context,
        validated(request, 'body'),
      ),
    201,
  );

  post(
    '/recalls/:recallId/activate',
    INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
    {
      params: recallParamsSchema,
      body: activateProductRecallBodySchema,
    },
    (request, context) =>
      options.application.services.controls.activateProductRecall(
        context,
        parameter(request, 'recallId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/recalls/:recallId/close',
    INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
    {
      params: recallParamsSchema,
      body: closeProductRecallBodySchema,
    },
    (request, context) =>
      options.application.services.controls.closeProductRecall(
        context,
        parameter(request, 'recallId'),
        validated(request, 'body'),
      ),
  );

  post(
    '/reorder-rules',
    INVENTORY_PERMISSION_KEYS.ITEMS_MANAGE,
    { body: upsertReorderRuleBodySchema },
    (request, context) =>
      options.application.services.controls.upsertReorderRule(
        context,
        validated(request, 'body'),
      ),
  );

  read(
    '/monitoring/low-stock',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: inventoryMonitoringQuerySchema },
    (request, resolvedActor) =>
      options.application.services.controls.listLowStock(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/monitoring/near-expiry',
    INVENTORY_PERMISSION_KEYS.READ,
    { query: nearExpiryInventoryQuerySchema },
    (request, resolvedActor) =>
      options.application.services.controls.listNearExpiry(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/monitoring/valuation',
    INVENTORY_PERMISSION_KEYS.VIEW_COST,
    { query: inventoryValuationQuerySchema },
    (request, resolvedActor) =>
      options.application.services.controls.listValuation(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  read(
    '/monitoring/reconciliation',
    INVENTORY_PERMISSION_KEYS.REPORTS_READ,
    { query: stockReconciliationQuerySchema },
    (request, resolvedActor) =>
      options.application.services.controls.listReconciliation(
        resolvedActor,
        validated(request, 'query'),
      ),
  );

  post(
    '/controls/restriction-sweep',
    INVENTORY_PERMISSION_KEYS.BATCHES_MANAGE,
    { body: runInventoryRestrictionSweepBodySchema },
    (request, context) => {
      const body = validated<{
        batchLimit?: number;
      }>(request, 'body');

      return options.application.services.controls
        .runInventoryRestrictionSweep(
          context,
          body.batchLimit,
        );
    },
  );

  return router;
}