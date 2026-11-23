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
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as authService from "../authService.js";
import type * as compat from "../compat.js";
import type * as consignmentDocuments from "../consignmentDocuments.js";
import type * as consignmentEvents from "../consignmentEvents.js";
import type * as consignmentOperations from "../consignmentOperations.js";
import type * as documentStore from "../documentStore.js";
import type * as domain from "../domain.js";
import type * as exportReads from "../exportReads.js";
import type * as gradingCompanies from "../gradingCompanies.js";
import type * as inventory from "../inventory.js";
import type * as itemActivity from "../itemActivity.js";
import type * as migration from "../migration.js";
import type * as migrationPolicy from "../migrationPolicy.js";
import type * as migrationReferences from "../migrationReferences.js";
import type * as migrationService from "../migrationService.js";
import type * as operations from "../operations.js";
import type * as paymentHistory from "../paymentHistory.js";
import type * as publicCatalogue from "../publicCatalogue.js";
import type * as purchaseEditing from "../purchaseEditing.js";
import type * as readModels from "../readModels.js";
import type * as reads from "../reads.js";
import type * as saleTickets from "../saleTickets.js";
import type * as shopCalendar from "../shopCalendar.js";
import type * as signedReceipts from "../signedReceipts.js";
import type * as system from "../system.js";
import type * as transaction from "../transaction.js";
import type * as transactions from "../transactions.js";
import type * as workspaceReads from "../workspaceReads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  attachments: typeof attachments;
  auth: typeof auth;
  authService: typeof authService;
  compat: typeof compat;
  consignmentDocuments: typeof consignmentDocuments;
  consignmentEvents: typeof consignmentEvents;
  consignmentOperations: typeof consignmentOperations;
  documentStore: typeof documentStore;
  domain: typeof domain;
  exportReads: typeof exportReads;
  gradingCompanies: typeof gradingCompanies;
  inventory: typeof inventory;
  itemActivity: typeof itemActivity;
  migration: typeof migration;
  migrationPolicy: typeof migrationPolicy;
  migrationReferences: typeof migrationReferences;
  migrationService: typeof migrationService;
  operations: typeof operations;
  paymentHistory: typeof paymentHistory;
  publicCatalogue: typeof publicCatalogue;
  purchaseEditing: typeof purchaseEditing;
  readModels: typeof readModels;
  reads: typeof reads;
  saleTickets: typeof saleTickets;
  shopCalendar: typeof shopCalendar;
  signedReceipts: typeof signedReceipts;
  system: typeof system;
  transaction: typeof transaction;
  transactions: typeof transactions;
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
