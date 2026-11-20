import { v } from 'convex/values';
export const allocation = v.object({
  lotId: v.id('stockLots'),
  quantity: v.number(),
  costCents: v.number(),
});
export const productFields = {
  name: v.string(),
  productType: v.union(v.literal('card'), v.literal('sealed'), v.literal('other')),
  format: v.optional(
    v.union(v.literal('display'), v.literal('booster'), v.literal('box'), v.literal('other')),
  ),
  packSize: v.optional(v.number()),
  series: v.optional(v.string()),
  identifier: v.optional(v.string()),
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
  askingPriceCents: v.number(),
  taxRateBps: v.number(),
};
