/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authService from "../authService.js";
import type * as consignmentOperations from "../consignmentOperations.js";
import type * as operations from "../operations.js";
import type * as readModels from "../readModels.js";
import type * as salePayments from "../salePayments.js";
import type * as signatures from "../signatures.js";
import type * as signedReceipts from "../signedReceipts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authService: typeof authService;
  consignmentOperations: typeof consignmentOperations;
  operations: typeof operations;
  readModels: typeof readModels;
  salePayments: typeof salePayments;
  signatures: typeof signatures;
  signedReceipts: typeof signedReceipts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
