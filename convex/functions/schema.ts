import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { salePaymentStatusValidator, salePaymentValidator } from './salePayments';

export default defineSchema({
  accounts: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    signatory: v.optional(
      v.object({ firstName: v.string(), lastName: v.string(), capacity: v.string() }),
    ),
    sessionVersion: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_email', ['email']),
  applicationSettings: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
  revokedSessions: defineTable({
    jti: v.string(),
    expiresAt: v.number(),
  }).index('by_jti', ['jti']),
  loginAttempts: defineTable({
    emailHash: v.string(),
    windowStartedAt: v.number(),
    attempts: v.number(),
  }).index('by_email_hash', ['emailHash']),
  passwordResetTokens: defineTable({
    accountId: v.id('accounts'),
    tokenHash: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_account', ['accountId']),
  sellers: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_operation', ['ownerId', 'operationId']),
  purchases: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    sellerId: v.id('sellers'),
    occurredAt: v.number(),
    reference: v.string(),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('cancelled')),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_owner', ['ownerId'])
    .index('by_seller', ['sellerId']),
  items: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    purchaseId: v.optional(v.id('purchases')),
    origin: v.optional(v.union(v.literal('purchase'), v.literal('consignment'))),
    consignmentId: v.optional(v.id('consignments')),
    productType: v.optional(v.union(v.literal('card'), v.literal('sealed'), v.literal('other'))),
    description: v.optional(v.string()),
    hiddenFromCatalogue: v.optional(v.boolean()),
    commissionRateBps: v.optional(v.number()),
    agreedPriceCents: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    purchaseOccurredAt: v.number(),
    name: v.string(),
    tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'))),
    series: v.optional(v.string()),
    identifier: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    catalogueImageUrl: v.optional(v.string()),
    language: v.optional(v.union(v.literal('fr'), v.literal('en'), v.literal('ja'))),
    condition: v.optional(
      v.union(
        v.literal('M'),
        v.literal('NM'),
        v.literal('EX'),
        v.literal('GD'),
        v.literal('LP'),
        v.literal('PL'),
        v.literal('PO'),
      ),
    ),
    gradingCompany: v.optional(
      v.union(v.literal('PSA'), v.literal('CollectAura'), v.literal('PCA'), v.literal('CCC')),
    ),
    gradingGrade: v.optional(v.string()),
    gradingCertificate: v.optional(v.string()),
    gradingNotes: v.optional(v.string()),
    marketValueCents: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    purchasePriceCents: v.optional(v.number()),
    askingPriceCents: v.optional(v.number()),
    vatRegime: v.union(v.literal('margin'), v.literal('other')),
    status: v.union(
      v.literal('available'),
      v.literal('sold'),
      v.literal('cancelled'),
      v.literal('returned'),
    ),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_status', ['status'])
    .index('by_purchase', ['purchaseId'])
    .index('by_consignment', ['consignmentId'])
    .index('by_owner_operation', ['ownerId', 'operationId']),
  stockVisibilityOperations: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    itemIds: v.array(v.id('items')),
    hidden: v.boolean(),
    updatedCount: v.number(),
    createdAt: v.number(),
  }).index('by_owner_operation', ['ownerId', 'operationId']),
  saleBatches: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    saleIds: v.array(v.id('sales')),
  }).index('by_owner_operation', ['ownerId', 'operationId']),
  sales: defineTable({
    paymentStatus: v.optional(salePaymentStatusValidator),
    payment: v.optional(salePaymentValidator),
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    cancelOperationId: v.optional(v.string()),
    cancelDigest: v.optional(v.string()),
    itemId: v.id('items'),
    occurredAt: v.number(),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
    origin: v.optional(v.union(v.literal('purchase'), v.literal('consignment'))),
    consignmentId: v.optional(v.id('consignments')),
    sellerId: v.optional(v.id('sellers')),
    commissionRateBps: v.optional(v.number()),
    commissionCents: v.optional(v.number()),
    depositorAmountCents: v.optional(v.number()),
    status: v.union(v.literal('active'), v.literal('cancelled')),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_owner', ['ownerId'])
    .index('by_owner_cancel_operation', ['ownerId', 'cancelOperationId'])
    .index('by_owner_item_status', ['ownerId', 'itemId', 'status'])
    .index('by_item_status', ['itemId', 'status'])
    .index('by_seller', ['sellerId']),
  salePaymentEvents: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    saleId: v.id('sales'),
    previousPaymentStatus: v.optional(salePaymentStatusValidator),
    previousPayment: v.optional(salePaymentValidator),
    payment: salePaymentValidator,
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_sale', ['saleId']),
  saleConflicts: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    itemId: v.id('items'),
    occurredAt: v.number(),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
    status: v.union(v.literal('open'), v.literal('resolved')),
    resolutionNote: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_status', ['status']),
  consignments: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    sellerId: v.id('sellers'),
    occurredAt: v.number(),
    reference: v.string(),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_seller', ['sellerId']),
  consignmentPayments: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    sellerId: v.id('sellers'),
    amountCents: v.number(),
    occurredAt: v.number(),
    method: v.string(),
    reference: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_seller', ['sellerId']),
  consignmentEvents: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    itemId: v.id('items'),
    kind: v.union(v.literal('return'), v.literal('terms')),
    occurredAt: v.number(),
    authorizationNote: v.optional(v.string()),
    previousPriceCents: v.optional(v.number()),
    askingPriceCents: v.optional(v.number()),
    previousCommissionRateBps: v.optional(v.number()),
    commissionRateBps: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_item', ['itemId']),
  attachments: defineTable({
    ownerId: v.string(),
    purchaseId: v.optional(v.id('purchases')),
    itemId: v.optional(v.id('items')),
    objectKey: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index('by_owner_purchase', ['ownerId', 'purchaseId'])
    .index('by_owner_item', ['ownerId', 'itemId'])
    .index('by_purchase', ['purchaseId'])
    .index('by_item', ['itemId']),
});
