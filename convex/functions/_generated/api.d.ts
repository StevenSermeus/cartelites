/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as auth from "../auth.js";
import type * as authService from "../authService.js";
import type * as consignmentDocuments from "../consignmentDocuments.js";
import type * as consignmentOperations from "../consignmentOperations.js";
import type * as exportReads from "../exportReads.js";
import type * as gradingCompanies from "../gradingCompanies.js";
import type * as inventory from "../inventory.js";
import type * as inventoryValidators from "../inventoryValidators.js";
import type * as itemActivity from "../itemActivity.js";
import type * as operations from "../operations.js";
import type * as paymentHistory from "../paymentHistory.js";
import type * as purchaseEditing from "../purchaseEditing.js";
import type * as readModels from "../readModels.js";
import type * as salePayments from "../salePayments.js";
import type * as saleTickets from "../saleTickets.js";
import type * as sessionGuard from "../sessionGuard.js";
import type * as shopCalendar from "../shopCalendar.js";
import type * as signatures from "../signatures.js";
import type * as signedReceipts from "../signedReceipts.js";
import type * as stockLedger from "../stockLedger.js";
import type * as workspaceReads from "../workspaceReads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  auth: typeof auth;
  authService: typeof authService;
  consignmentDocuments: typeof consignmentDocuments;
  consignmentOperations: typeof consignmentOperations;
  exportReads: typeof exportReads;
  gradingCompanies: typeof gradingCompanies;
  inventory: typeof inventory;
  inventoryValidators: typeof inventoryValidators;
  itemActivity: typeof itemActivity;
  operations: typeof operations;
  paymentHistory: typeof paymentHistory;
  purchaseEditing: typeof purchaseEditing;
  readModels: typeof readModels;
  salePayments: typeof salePayments;
  saleTickets: typeof saleTickets;
  sessionGuard: typeof sessionGuard;
  shopCalendar: typeof shopCalendar;
  signatures: typeof signatures;
  signedReceipts: typeof signedReceipts;
  stockLedger: typeof stockLedger;
  workspaceReads: typeof workspaceReads;
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
