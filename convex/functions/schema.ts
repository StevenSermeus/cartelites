import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  accounts: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    signatory: v.optional(v.object({ firstName: v.string(), lastName: v.string(), capacity: v.string() })),
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
    .index('by_owner', ['ownerId']),
  items: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    purchaseId: v.id('purchases'),
    purchaseOccurredAt: v.number(),
    name: v.string(),
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
    purchasePriceCents: v.number(),
    askingPriceCents: v.optional(v.number()),
    vatRegime: v.union(v.literal('margin'), v.literal('other')),
    status: v.union(v.literal('available'), v.literal('sold'), v.literal('cancelled')),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_status', ['status'])
    .index('by_purchase', ['purchaseId'])
    .index('by_owner_operation', ['ownerId', 'operationId']),
  sales: defineTable({
    ownerId: v.string(),
    operationId: v.string(),
    operationDigest: v.string(),
    cancelOperationId: v.optional(v.string()),
    cancelDigest: v.optional(v.string()),
    itemId: v.id('items'),
    occurredAt: v.number(),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('cancelled')),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_owner', ['ownerId'])
    .index('by_owner_cancel_operation', ['ownerId', 'cancelOperationId'])
    .index('by_owner_item_status', ['ownerId', 'itemId', 'status'])
    .index('by_item_status', ['itemId', 'status']),
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
