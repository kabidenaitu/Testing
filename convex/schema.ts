import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const mediaEntry = v.object({
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

const tupleObject = v.object({
  type: v.union(v.literal('route'), v.literal('bus_plate')),
  value: v.string()
});

const tupleEntry = v.object({
  objects: v.array(tupleObject),
  time: v.string(),
  place: v.object({
    kind: v.union(v.literal('stop'), v.literal('street'), v.literal('crossroad')),
    value: v.string()
  }),
  aspects: v.array(v.string())
});

const contactInfo = v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string())
});

const priorityLiteral = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
  v.literal('critical')
);

const statusLiteral = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('resolved'),
  v.literal('rejected'),
  v.literal('new'),
  v.literal('in_review'),
  v.literal('forwarded'),
  v.literal('closed')
);

const sourceLiteral = v.union(v.literal('web'), v.literal('telegram'));

export default defineSchema({
  complaints: defineTable({
    source: sourceLiteral,
    rawText: v.string(),
    analysis: v.any(),
    tuples: v.array(tupleEntry),
    priority: priorityLiteral,
    submissionTime: v.string(),
    reportedTime: v.string(),
    media: v.array(mediaEntry),
    isAnonymous: v.boolean(),
    contact: v.optional(contactInfo),
    status: statusLiteral,
    adminComment: v.optional(v.string()),
    statusUpdatedAt: v.optional(v.string()),
    referenceNumber: v.string(),
    createdAt: v.string(),
    updatedAt: v.string()
  })
    .index('by_priority', ['priority'])
    .index('by_source', ['source'])
    .index('by_status', ['status'])
    .index('by_submission_time', ['submissionTime'])
    .index('by_reference', ['referenceNumber']),
  dict_values: defineTable({
    kind: v.union(
      v.literal('route'),
      v.literal('place'),
      v.literal('stop'),
      v.literal('plate')
    ),
    value: v.string(),
    freq: v.number(),
    lastSeen: v.string()
  })
    .index('by_kind_value', ['kind', 'value'])
    .index('by_last_seen', ['lastSeen'])
});
