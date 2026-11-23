import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

import { actor as authorize } from './domain';
export const list = query({ args: {}, handler: async ctx => {
  await authorize(ctx);
  return (await ctx.db.query('gradingCompanies').collect()).sort((a,b)=>a.name.localeCompare(b.name));
}});
export const save = mutation({
  args: { id: v.optional(v.id('gradingCompanies')), expectedRevision: v.optional(v.number()), name: v.string(), abbreviation: v.optional(v.string()), website: v.optional(v.string()), archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await authorize(ctx,true), name = args.name.trim(), normalizedName = name.normalize('NFKC').toLocaleLowerCase('en');
    if (!name || name.length > 100 || /[\x00-\x1f]/.test(name) || (args.abbreviation?.length ?? 0)>30) throw new Error('INVALID_GRADING_COMPANY');
    if (args.website && !/^https:\/\/[^\s]+$/.test(args.website)) throw new Error('INVALID_GRADING_WEBSITE');
    const prior = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && !prior) throw new Error('GRADING_COMPANY_NOT_FOUND');
    if (prior && prior.revision !== args.expectedRevision) throw new Error('REVISION_CONFLICT');
    const duplicate = await ctx.db.query('gradingCompanies').withIndex('by_name', q=>q.eq('normalizedName', normalizedName)).unique();
    if (duplicate && duplicate._id !== args.id) throw new Error('GRADING_COMPANY_EXISTS');
    const now = Date.now();
    const fields = { name, normalizedName, abbreviation: args.abbreviation, website: args.website, archivedAt: args.archived ? prior?.archivedAt ?? now : undefined, revision: (prior?.revision ?? 0)+1, updatedBy: user, updatedAt: now };
    if (prior) { await ctx.db.patch(prior._id, fields); return prior._id; }
    return ctx.db.insert('gradingCompanies', {...fields, createdBy:user, createdAt:now});
  }
});
