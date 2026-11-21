import { allocation } from './inventoryValidators';
import { signatureValidator } from './signatures';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { salePaymentStatusValidator, salePaymentValidator } from './salePayments';

export default defineSchema({
  purchaseEdits: defineTable({ ownerId: v.string(), operationId: v.string(), operationDigest: v.string(), purchaseId: v.id('purchases'), before: v.any(), itemIds: v.array(v.id('items')), createdAt: v.number() }).index('by_owner_operation', ['ownerId', 'operationId']),
  accounts: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    signatory: v.optional(
      v.object({ firstName: v.string(), lastName: v.string(), capacity: v.string(), signature: v.optional(v.union(signatureValidator, v.null())) }),
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
    removedPurchaseId: v.optional(v.id('purchases')),
    ownerId: v.string(),
    operationId: v.string(),
    purchaseId: v.optional(v.id('purchases')),
    origin: v.optional(v.union(v.literal('purchase'), v.literal('consignment'), v.literal('supplier'))),
    consignmentId: v.optional(v.id('consignments')),
    productType: v.optional(v.union(v.literal('card'), v.literal('sealed'), v.literal('other'))),
    description: v.optional(v.string()),
    hiddenFromCatalogue: v.optional(v.boolean()),
    commissionRateBps: v.optional(v.number()),
    agreedPriceCents: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    quantity: v.optional(v.number()),
    format: v.optional(v.union(v.literal('display'), v.literal('booster'), v.literal('box'), v.literal('other'))),
    packSize: v.optional(v.number()), taxRateBps: v.optional(v.number()),
    coverPhotoId: v.optional(v.id('attachments')),
    purchaseOccurredAt: v.number(),
    name: v.string(),
    tcg: v.optional(v.union(v.literal('pokemon'), v.literal('riftbound'), v.literal('other'))),
    series: v.optional(v.string()),
    identifier: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    catalogueImageUrl: v.optional(v.string()),
    language: v.optional(v.union(v.literal('fr'), v.literal('en'), v.literal('ja'), v.literal('zh'))),
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
      v.literal('returned'), v.literal('donated'),
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
    quantity: v.optional(v.number()), costCents: v.optional(v.number()),
    allocations: v.optional(v.array(allocation)), itemName: v.optional(v.string()),
    taxRateBps: v.optional(v.number()), vatRegime: v.optional(v.union(v.literal('margin'), v.literal('other'))),
    salePriceCents: v.number(),
    customerName: v.optional(v.string()),
    origin: v.optional(v.union(v.literal('purchase'), v.literal('consignment'), v.literal('supplier'))),
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
    flowVersion: v.optional(v.number()),
    contractTerms: v.optional(v.object({ version: v.string(), text: v.string() })),
    contractRevision: v.optional(v.number()),
    contractStatus: v.optional(v.union(v.literal('awaiting_signature'), v.literal('signed'))),
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
  consignmentReturns: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    consignmentId: v.id('consignments'), occurredAt: v.number(),
    itemIds: v.array(v.id('items')), conditionNotes: v.string(),
    completedAt: v.optional(v.number()), createdAt: v.number(),
  }).index('by_owner_operation', ['ownerId', 'operationId']).index('by_consignment', ['consignmentId']),
  consignmentDocuments: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    sellerId: v.id('sellers'), kind: v.union(v.literal('statement'), v.literal('payment')),
    snapshot: v.any(), identity: v.optional(v.any()), createdAt: v.number(),
    objectKey: v.optional(v.string()), sha256: v.optional(v.string()), filename: v.optional(v.string()),
  }).index('by_owner_operation', ['ownerId', 'operationId']).index('by_seller', ['sellerId']),
  signedReceipts: defineTable({
    ownerId: v.string(),
    kind: v.union(v.literal('purchase'), v.literal('consignment'), v.literal('consignment_return')),
    targetId: v.string(),
    snapshot: v.any(),
    identity: v.any(),
    createdAt: v.number(),
    signedAt: v.optional(v.number()),
    companySignature: v.optional(signatureValidator),
    clientSignature: v.optional(signatureValidator),
    consent: v.optional(v.string()),
    objectKey: v.optional(v.string()),
    sha256: v.optional(v.string()),
    filename: v.optional(v.string()),
    emailStatus: v.optional(v.string()),
    emailError: v.optional(v.string()),
    emailHttpStatus: v.optional(v.number()),
    emailAttempt: v.optional(v.string()),
    emailAttemptAt: v.optional(v.number()),
    messageId: v.optional(v.string()),
  }).index('by_target', ['kind', 'targetId']),
  supplierReceipts: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    supplier: v.string(), reference: v.string(), occurredAt: v.number(), createdAt: v.number(),
    itemIds: v.array(v.id('items')), totalCostCents: v.number(),
  }).index('by_owner_operation', ['ownerId', 'operationId']),
  stockLots: defineTable({
    itemId: v.id('items'), receiptId: v.optional(v.id('supplierReceipts')),
    openingId: v.optional(v.id('stockOpenings')), received: v.number(), remaining: v.number(),
    totalCostCents: v.number(), remainingCostCents: v.number(), occurredAt: v.number(),
    taxRateBps: v.number(), createdAt: v.number(),
  }).index('by_item', ['itemId']).index('by_receipt', ['receiptId']).index('by_opening', ['openingId']),
  stockOpenings: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    sourceId: v.id('items'), targetId: v.id('items'), quantity: v.number(), packSize: v.number(),
    allocations: v.array(allocation), occurredAt: v.number(), cancelledAt: v.optional(v.number()),
  }).index('by_owner_operation', ['ownerId', 'operationId']).index('by_source', ['sourceId']),
  stockGifts: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    itemId: v.id('items'), itemName: v.string(), quantity: v.number(), occurredAt: v.number(),
    recipient: v.optional(v.string()), reason: v.string(), note: v.optional(v.string()),
    costCents: v.optional(v.number()), allocations: v.array(allocation), purchaseId: v.optional(v.id('purchases')),
    cancelledAt: v.optional(v.number()),
  }).index('by_owner_operation', ['ownerId', 'operationId']).index('by_date', ['occurredAt']).index('by_item', ['itemId']),
  inventoryReversals: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
  }).index('by_owner_operation', ['ownerId', 'operationId']),
  saleTickets: defineTable({
    ownerId: v.string(), operationId: v.string(), operationDigest: v.string(),
    saleIds: v.array(v.id('sales')), anchorId: v.id('sales'), snapshot: v.any(),
    identity: v.optional(v.any()), createdAt: v.number(),
    objectKey: v.optional(v.string()), sha256: v.optional(v.string()), filename: v.optional(v.string()),
  }).index('by_owner_operation', ['ownerId', 'operationId']).index('by_sale', ['anchorId']),
  saleTicketLinks: defineTable({saleId:v.id('sales'),ticketId:v.id('saleTickets')}).index('by_sale',['saleId']),
  ticketEmails: defineTable({
    ticketId: v.id('saleTickets'), operationId: v.string(), recipient: v.string(),
    status: v.union(v.literal('sending'), v.literal('accepted'), v.literal('failed'), v.literal('unknown')),
    createdAt: v.number(), messageId: v.optional(v.string()),
  }).index('by_operation', ['operationId']).index('by_ticket', ['ticketId']),
  attachments: defineTable({
    operationId: v.optional(v.string()), operationDigest: v.optional(v.string()),
    supplierReceiptId: v.optional(v.id('supplierReceipts')),
    giftId: v.optional(v.id('stockGifts')),

    ownerId: v.string(),
    purchaseId: v.optional(v.id('purchases')),
    itemId: v.optional(v.id('items')),
    objectKey: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index('by_owner_operation', ['ownerId', 'operationId'])
    .index('by_supplier', ['supplierReceiptId'])
    .index('by_gift', ['giftId'])
    .index('by_owner_purchase', ['ownerId', 'purchaseId'])
    .index('by_owner_item', ['ownerId', 'itemId'])
    .index('by_purchase', ['purchaseId'])
    .index('by_item', ['itemId']),
});
