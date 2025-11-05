import { v, type Infer } from 'convex/values';
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from './_generated/server';
import type { FilterBuilder } from 'convex/server';

const priorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
  v.literal('critical')
);

const currentStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('resolved'),
  v.literal('rejected')
);

const statusValidator = v.union(
  currentStatusValidator,
  v.literal('new'),
  v.literal('in_review'),
  v.literal('forwarded'),
  v.literal('closed')
);

const sourceValidator = v.union(v.literal('web'), v.literal('telegram'));

const mediaValidator = v.object({
  id: v.string(),
  type: v.union(v.literal('image'), v.literal('video'), v.literal('audio')),
  path: v.string(),
  size: v.number(),
  mime: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationSec: v.optional(v.number()),
  originalName: v.optional(v.string()),
  uploadedAt: v.optional(v.string())
});

const tupleObjectValidator = v.object({
  type: v.union(v.literal('route'), v.literal('bus_plate')),
  value: v.string()
});

const tupleValidator = v.object({
  objects: v.array(tupleObjectValidator),
  time: v.string(),
  place: v.object({
    kind: v.union(v.literal('stop'), v.literal('street'), v.literal('crossroad')),
    value: v.string()
  }),
  aspects: v.array(v.string())
});

const contactValidator = v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string())
});

const complaintPayload = v.object({
  description: v.string(),
  priority: priorityValidator,
  tuples: v.optional(v.array(tupleValidator)),
  analysis: v.optional(v.any()),
  media: v.optional(v.array(mediaValidator)),
  isAnonymous: v.boolean(),
  contact: v.optional(contactValidator),
  source: sourceValidator,
  submissionTime: v.optional(v.string()),
  reportedTime: v.optional(v.string()),
  status: v.optional(currentStatusValidator),
  adminComment: v.optional(v.string())
});

export const create = mutation({
  args: {
    payload: complaintPayload
  },
  handler: async (ctx: MutationCtx, args) => {
    const { payload } = args;
    const nowIso = new Date().toISOString();
    const submissionTime = payload.submissionTime ?? nowIso;
    const reportedTime = payload.reportedTime ?? 'submission_time';
    const status = payload.status ?? 'pending';
    const tuples = payload.tuples ?? [];
    const media = payload.media ?? [];
    const adminComment = payload.adminComment?.trim();
    const referenceNumber = buildReferenceNumber(nowIso);

    const insertedId = await ctx.db.insert('complaints', {
      source: payload.source,
      rawText: payload.description,
      analysis: payload.analysis ?? null,
      tuples,
      priority: payload.priority,
      submissionTime,
      reportedTime,
      media,
      isAnonymous: payload.isAnonymous,
      contact: payload.contact,
      status,
      adminComment: adminComment && adminComment.length > 0 ? adminComment : undefined,
      statusUpdatedAt: nowIso,
      referenceNumber,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    await upsertDictionaries(ctx, {
      tuples,
      submissionTime,
      reportedTime
    });

    return {
      id: insertedId,
      referenceNumber
    };
  }
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    filters: v.optional(
      v.object({
        priority: v.optional(priorityValidator),
        source: v.optional(sourceValidator),
        status: v.optional(currentStatusValidator),
        search: v.optional(v.string())
      })
    )
  },
  handler: async (ctx: QueryCtx, args) => {
    const limit = normalizeLimit(args.limit);
    const filters = args.filters ?? {};

    let query = ctx.db.query('complaints').withIndex('by_submission_time');

    if (filters.priority) {
      query = query.filter((builder: FilterBuilder<any>) =>
        builder.eq(builder.field('priority'), filters.priority)
      );
    }

    if (filters.source) {
      query = query.filter((builder: FilterBuilder<any>) =>
        builder.eq(builder.field('source'), filters.source)
      );
    }

    if (filters.status) {
      query = query.filter((builder: FilterBuilder<any>) =>
        builder.eq(builder.field('status'), filters.status)
      );
    }

    return query.order('desc').paginate({
      numItems: limit,
      cursor: args.cursor ?? null
    });
  }
});

export const updateStatus = mutation({
  args: {
    id: v.id('complaints'),
    status: currentStatusValidator,
    adminComment: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx: MutationCtx, args) => {
    const complaint = await ctx.db.get(args.id);
    if (!complaint) {
      throw new Error('NOT_FOUND');
    }

    const nowIso = new Date().toISOString();
    const adminComment = typeof args.adminComment === 'string' ? args.adminComment.trim() : null;

    await ctx.db.patch(args.id, {
      status: args.status,
      adminComment: adminComment && adminComment.length > 0 ? adminComment : undefined,
      statusUpdatedAt: nowIso,
      updatedAt: nowIso
    });

    return {
      id: args.id,
      status: args.status,
      adminComment: adminComment && adminComment.length > 0 ? adminComment : null,
      statusUpdatedAt: nowIso,
      updatedAt: nowIso
    };
  }
});

export const getById = query({
  args: {
    id: v.id('complaints')
  },
  handler: async (ctx: QueryCtx, args) => {
    return ctx.db.get(args.id);
  }
});

export const findByReference = query({
  args: {
    reference: v.string()
  },
  handler: async (ctx: QueryCtx, args) => {
    return ctx.db
      .query('complaints')
      .withIndex('by_reference', (q) => q.eq('referenceNumber', args.reference))
      .first();
  }
});

function normalizeLimit(limit?: number | null) {
  if (!limit || Number.isNaN(limit)) {
    return 20;
  }

  if (limit < 1) {
    return 1;
  }

  if (limit > 100) {
    return 100;
  }

  return Math.floor(limit);
}

async function upsertDictionaries(
  ctx: MutationCtx,
  params: {
    tuples: Infer<typeof tupleValidator>[];
    submissionTime: string;
    reportedTime: string;
  }
) {
  const { tuples, submissionTime, reportedTime } = params;
  for (const tuple of tuples) {
    for (const obj of tuple.objects) {
      if (obj.type === 'route') {
        await upsertDictValue(ctx, 'route', obj.value, submissionTime);
      } else if (obj.type === 'bus_plate') {
        await upsertDictValue(ctx, 'plate', obj.value, submissionTime);
      }
    }

    const kind = tuple.place?.kind;
    if (kind === 'stop') {
      await upsertDictValue(ctx, 'stop', tuple.place.value, reportedTime ?? submissionTime);
    } else if (kind === 'street' || kind === 'crossroad') {
      await upsertDictValue(ctx, 'place', tuple.place.value, reportedTime ?? submissionTime);
    }
  }
}

async function upsertDictValue(
  ctx: MutationCtx,
  kind: 'route' | 'place' | 'stop' | 'plate',
  rawValue: string,
  timestampIso: string
) {
  const value = rawValue.trim();
  if (!value) {
    return;
  }

  const existing = await ctx.db
    .query('dict_values')
    .withIndex('by_kind_value', (index) => index.eq('kind', kind))
    .filter((builder: FilterBuilder<any>) => builder.eq(builder.field('value'), value))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      freq: existing.freq + 1,
      lastSeen: timestampIso
    });
  } else {
    await ctx.db.insert('dict_values', {
      kind,
      value,
      freq: 1,
      lastSeen: timestampIso
    });
  }
}

function buildReferenceNumber(seed: string) {
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  const stamp = seed.replace(/[-T:Z.]/g, '').slice(-10);
  return `AST-${stamp}-${salt}`;
}
