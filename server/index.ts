import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { extension as getExtension } from 'mime-types';
import sharp from 'sharp';
import { z } from 'zod';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

type MediaCategory = 'image' | 'video' | 'audio';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LLM_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:8000'),
  STORAGE_DIR: z.string().default('./storage/media'),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(30 * 1024 * 1024),
  MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  CONVEX_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed.length > 0 ? trimmed : null;
    }),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1)
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  LLM_URL: process.env.LLM_URL,
  STORAGE_DIR: process.env.STORAGE_DIR,
  MAX_IMAGE_BYTES: process.env.MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES: process.env.MAX_VIDEO_BYTES,
  MAX_AUDIO_BYTES: process.env.MAX_AUDIO_BYTES,
  CONVEX_URL: process.env.CONVEX_URL,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
});

const llmBaseUrl = env.LLM_URL.endsWith('/') ? env.LLM_URL : `${env.LLM_URL}/`;
const llmAnalyzeUrl = new URL('analyze', llmBaseUrl).toString();
const mediaRootMap: Record<MediaCategory, string> = {
  image: path.resolve(env.STORAGE_DIR, 'image'),
  video: path.resolve(env.STORAGE_DIR, 'video'),
  audio: path.resolve(env.STORAGE_DIR, 'audio')
};

// Готовим каталоги для медиа заранее, чтобы не ловить ошибки в Multer.
for (const dir of Object.values(mediaRootMap)) {
  fs.mkdirSync(dir, { recursive: true });
}

interface MulterAugmentedRequest extends Request {
  fileCategory?: MediaCategory;
}

const mediaLimits: Record<MediaCategory, number> = {
  image: env.MAX_IMAGE_BYTES,
  video: env.MAX_VIDEO_BYTES,
  audio: env.MAX_AUDIO_BYTES
};

const multerStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const category = detectMediaCategory(file.mimetype);
    if (!category) {
      cb(new Error('unsupported-file-type'));
      return;
    }

    cb(null, mediaRootMap[category]);
  },
  filename: (_req, file, cb) => {
    const ext = sanitizeExtension(file.mimetype, file.originalname);
    cb(null, `${Date.now()}-${randomUUID()}${ext ? `.${ext}` : ''}`);
  }
});

const maxUploadSize = Math.max(...Object.values(mediaLimits));

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: maxUploadSize
  },
  fileFilter: (req, file, cb) => {
    const category = detectMediaCategory(file.mimetype);
    if (!category) {
      cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }

    (req as MulterAugmentedRequest).fileCategory = category;
    cb(null, true);
  }
});

const app = express();
const adminCredentials = {
  username: env.ADMIN_USERNAME,
  password: env.ADMIN_PASSWORD
};
const adminAuthRealm = 'QalaVoice Admin';
const basicPrefix = 'Basic ';

app.use(cors());
// Текстовые payload'ы от фронтенда небольшие, поэтому 1 МБ достаточно.
app.use(express.json({ limit: '1mb' }));

const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  const credentials = extractBasicCredentials(req.headers.authorization);

  if (
    !credentials ||
    credentials.username !== adminCredentials.username ||
    credentials.password !== adminCredentials.password
  ) {
    res.setHeader('WWW-Authenticate', `Basic realm="${adminAuthRealm}", charset="UTF-8"`);
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Требуется авторизация.'
    });
    return;
  }

  next();
};

const priorityValues = ['low', 'medium', 'high', 'critical'] as const;
const statusValues = ['pending', 'approved', 'resolved', 'rejected'] as const;
const legacyStatusValues = ['new', 'in_review', 'forwarded', 'closed'] as const;
const allStatusValues = [...statusValues, ...legacyStatusValues] as const;
const legacyStatusMapping: Record<(typeof legacyStatusValues)[number], (typeof statusValues)[number]> = {
  new: 'pending',
  in_review: 'pending',
  forwarded: 'approved',
  closed: 'resolved'
};
const sourceValues = ['web', 'telegram'] as const;
const tuplePlaceKinds = ['stop', 'street', 'crossroad'] as const;

const tupleObjectSchema = z.object({
  type: z.enum(['route', 'bus_plate']),
  value: z.string().min(1, 'Значение не может быть пустым.')
});

const tupleSchema = z.object({
  objects: z.array(tupleObjectSchema).default([]),
  time: z.string().min(1, 'Время обязательно.'),
  place: z.object({
    kind: z.enum(tuplePlaceKinds, { required_error: 'Тип местоположения обязателен.' }),
    value: z.string().min(1, 'Название места обязательно.')
  }),
  aspects: z.array(z.string().min(1)).default([])
});

const mediaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['image', 'video', 'audio']),
  path: z.string().min(1),
  size: z.number().nonnegative(),
  mime: z.string().min(1),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  durationSec: z.number().nonnegative().optional(),
  originalName: z.string().optional(),
  uploadedAt: z.string().optional()
});

const contactSchema = z
  .object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional()
  })
  .strict()
  .optional();

const submitPayloadSchema = z
  .object({
    description: z.string().min(1),
    priority: z.enum(priorityValues),
    tuples: z.array(tupleSchema).optional().default([]),
    analysis: z.unknown().nullable().optional(),
    media: z.array(mediaSchema).optional().default([]),
    isAnonymous: z.boolean(),
    contact: contactSchema,
    source: z.enum(sourceValues).default('web'),
    submissionTime: z.string().optional(),
    reportedTime: z.string().optional(),
    status: z.enum(statusValues).optional(),
    adminComment: z
      .string()
      .max(2000, 'Комментарий слишком длинный.')
      .optional()
  })
  .strict();

const statusUpdateSchema = z
  .object({
    status: z.enum(statusValues),
    adminComment: z
      .union([
        z
          .string()
          .max(2000, 'Комментарий слишком длинный.'),
        z.null()
      ])
      .optional()
  })
  .strict();

const convexClient = env.CONVEX_URL
  ? new ConvexHttpClient(env.CONVEX_URL, { skipConvexDeploymentUrlCheck: true })
  : null;

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/admin/session', requireAdminAuth, (_req, res) => {
  res.status(204).send();
});

app.post('/api/analyze', async (req, res, next) => {
  try {
    const upstreamResponse = await fetch(llmAnalyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(req.body ?? {})
    });

    const responseBody = await upstreamResponse.text();
    const responseContentType =
      upstreamResponse.headers.get('content-type') ?? 'application/json';

    res
      .status(upstreamResponse.status)
      .set('content-type', responseContentType)
      .send(responseBody);
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/media/upload',
  upload.single('file'),
  async (req: MulterAugmentedRequest, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'NO_FILE', message: 'Файл не получен.' });
        return;
      }

      const category = req.fileCategory ?? detectMediaCategory(req.file.mimetype);
      if (!category) {
        await safeRemoveFile(req.file.path);
        res.status(400).json({
          error: 'UNSUPPORTED_TYPE',
          message: 'Неподдерживаемый тип файла.'
        });
        return;
      }

      const limit = mediaLimits[category];
      if (req.file.size > limit) {
        await safeRemoveFile(req.file.path);
        res.status(413).json({
          error: 'FILE_TOO_LARGE',
          message: 'Размер файла превышает допустимый порог.',
          limit
        });
        return;
      }

      const relativePath = toProjectRelativePath(req.file.path);
      const payload: UploadResponse = {
        id: randomUUID(),
        type: category,
        mime: req.file.mimetype,
        size: req.file.size,
        originalName: req.file.originalname,
        path: relativePath,
        uploadedAt: new Date().toISOString()
      };

      if (category === 'image') {
        try {
          const metadata = await sharp(req.file.path).metadata();
          payload.width = metadata.width;
          payload.height = metadata.height;
        } catch (error) {
          console.warn('Не удалось получить метаданные изображения:', error);
        }
      }

      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

app.post('/api/submit', async (req, res, next) => {
  try {
    const client = getConvexClientOrRespond(res);
    if (!client) {
      return;
    }

    const payload = submitPayloadSchema.parse(req.body ?? {});
    const submissionTime = payload.submissionTime ?? new Date().toISOString();
    const reportedTime = payload.reportedTime ?? 'submission_time';

    const result = await client.mutation(anyApi.complaints.create, {
      payload: {
        description: payload.description,
        priority: payload.priority,
        tuples: payload.tuples ?? [],
        analysis: payload.analysis ?? null,
        media: payload.media ?? [],
        isAnonymous: payload.isAnonymous,
        contact: prepareContact(payload.contact),
        source: payload.source,
        submissionTime,
        reportedTime,
        status: payload.status,
        adminComment: normalizeAdminComment(payload.adminComment)
      }
    });

    res.status(201).json({
      success: true,
      id: result.id,
      referenceNumber: result.referenceNumber
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Некорректный формат тела запроса.',
        details: error.flatten()
      });
      return;
    }

    next(error);
  }
});

app.get('/api/analytics/summary', requireAdminAuth, async (_req, res, next) => {
  try {
    const client = getConvexClientOrRespond(res);
    if (!client) {
      return;
    }

    const summary = await client.query(anyApi.analytics.summary, {});
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get('/api/complaints/status/:reference', async (req, res, next) => {
  try {
    const client = getConvexClientOrRespond(res);
    if (!client) {
      return;
    }

    const reference = parseOptionalString(req.params.reference);
    if (!reference) {
      res.status(400).json({
        error: 'INVALID_REFERENCE',
        message: 'Номер обращения должен быть указан.'
      });
      return;
    }

    const complaint = await client.query(anyApi.complaints.findByReference, {
      reference
    });

    if (!complaint) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Обращение с указанным номером не найдено.'
      });
      return;
    }

    res.json(mapComplaintStatusDocument(complaint as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

app.get('/api/complaints', requireAdminAuth, async (req, res, next) => {
  try {
    const client = getConvexClientOrRespond(res);
    if (!client) {
      return;
    }

    const limit = parseOptionalNumber(req.query.limit);
    const cursor = parseOptionalString(req.query.cursor);
    const filters = buildComplaintsFilters(req.query);

    const result = await client.query(anyApi.complaints.list, {
      limit: limit ?? undefined,
      cursor: cursor ?? undefined,
      filters: filters ?? undefined
    });

    const { page, isDone, continueCursor } = result as {
      page: Array<Record<string, unknown>>;
      isDone: boolean;
      continueCursor?: string | null;
    };

    res.json({
      items: page.map(mapComplaintDocument),
      nextCursor: isDone ? null : continueCursor ?? null
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/complaints/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const client = getConvexClientOrRespond(res);
    if (!client) {
      return;
    }

    const complaintId = parseOptionalString(req.params.id);
    if (!complaintId) {
      res.status(400).json({
        error: 'INVALID_ID',
        message: 'Некорректный идентификатор обращения.'
      });
      return;
    }

    const payload = statusUpdateSchema.parse(req.body ?? {});
    const normalizedComment =
      payload.adminComment === null
        ? null
        : normalizeAdminComment(payload.adminComment);

    await client.mutation(anyApi.complaints.updateStatus, {
      id: complaintId,
      status: payload.status,
      adminComment: normalizedComment ?? null
    });

    const updated = await client.query(anyApi.complaints.getById, { id: complaintId });
    if (!updated) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Обращение не найдено.'
      });
      return;
    }

    res.json(mapComplaintDocument(updated as Record<string, unknown>));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Некорректное тело запроса.',
        details: error.flatten()
      });
      return;
    }

    next(error);
  }
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => {
    if (error instanceof MulterError) {
      res.status(400).json({
        error: 'UPLOAD_ERROR',
        message: error.message
      });
      return;
    }

    console.error('Unexpected error:', error);
    res.status(502).json({ error: 'UPSTREAM_ERROR', message: 'Сервис временно недоступен.' });
  }
);

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
});

function extractBasicCredentials(
  header: string | undefined
): { username: string; password: string } | null {
  if (!header?.startsWith(basicPrefix)) {
    return null;
  }

  const base64 = header.slice(basicPrefix.length).trim();
  if (!base64) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function detectMediaCategory(mime: string): MediaCategory | null {
  if (mime.startsWith('image/')) {
    return 'image';
  }

  if (mime.startsWith('video/')) {
    return 'video';
  }

  if (mime.startsWith('audio/')) {
    return 'audio';
  }

  return null;
}

function sanitizeExtension(mime: string, originalName: string): string | null {
  const fromMime = getExtension(mime);
  if (fromMime) {
    return fromMime;
  }

  const parts = originalName.split('.');
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() ?? null;
  }

  return null;
}

async function safeRemoveFile(filePath: string) {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    console.warn('Не удалось удалить файл:', error);
  }
}

function toProjectRelativePath(targetPath: string): string {
  const relative = path.relative(process.cwd(), targetPath);
  return relative.split(path.sep).join('/');
}

function getConvexClientOrRespond(res: Response): ConvexHttpClient | null {
  if (!convexClient) {
    res.status(500).json({
      error: 'CONVEX_NOT_CONFIGURED',
      message: 'Переменная окружения CONVEX_URL не задана или пустая. Укажите URL dev-деплоймента Convex.'
    });
    return null;
  }

  return convexClient;
}

function prepareContact(contact: z.infer<typeof contactSchema>) {
  if (!contact) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  if (contact.name?.trim()) {
    normalized.name = contact.name.trim();
  }
  if (contact.phone?.trim()) {
    normalized.phone = contact.phone.trim();
  }
  if (contact.email?.trim()) {
    normalized.email = contact.email.trim();
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

interface UploadResponse {
  id: string;
  type: MediaCategory;
  mime: string;
  size: number;
  path: string;
  originalName: string;
  uploadedAt: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEnumParam<T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | undefined {
  const str = parseOptionalString(value);
  if (!str) {
    return undefined;
  }

  return allowed.includes(str as T[number]) ? (str as T[number]) : undefined;
}

function buildComplaintsFilters(
  query: Request['query']
): {
  priority?: (typeof priorityValues)[number];
  source?: (typeof sourceValues)[number];
  status?: (typeof statusValues)[number];
  search?: string;
} | null {
  const priority = parseEnumParam(query.priority, priorityValues);
  const source = parseEnumParam(query.source, sourceValues);
  const status = parseEnumParam(query.status, statusValues);
  const search = parseOptionalString(query.search);

  const filters = {
    priority,
    source,
    status,
    search
  };

  return Object.values(filters).some((value) => value !== undefined) ? filters : null;
}

function mapComplaintDocument(doc: Record<string, unknown>) {
  return {
    id: serializeId(doc._id),
    referenceNumber: typeof doc.referenceNumber === 'string' ? doc.referenceNumber : null,
    priority: typeof doc.priority === 'string' ? doc.priority : null,
    status: canonicalizeStatus(doc.status),
    source: typeof doc.source === 'string' ? doc.source : null,
    submissionTime: typeof doc.submissionTime === 'string' ? doc.submissionTime : null,
    reportedTime: typeof doc.reportedTime === 'string' ? doc.reportedTime : null,
    rawText: typeof doc.rawText === 'string' ? doc.rawText : null,
    tuples: Array.isArray(doc.tuples) ? doc.tuples : [],
    analysis: doc.analysis ?? null,
    media: Array.isArray(doc.media) ? doc.media : [],
    isAnonymous: typeof doc.isAnonymous === 'boolean' ? doc.isAnonymous : null,
    contact: doc.contact ?? null,
    adminComment: normalizeAdminCommentForResponse(doc.adminComment),
    statusUpdatedAt: typeof doc.statusUpdatedAt === 'string' ? doc.statusUpdatedAt : null,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null
  };
}

function mapComplaintStatusDocument(doc: Record<string, unknown>) {
  return {
    referenceNumber: typeof doc.referenceNumber === 'string' ? doc.referenceNumber : '',
    status: canonicalizeStatus(doc.status),
    priority: typeof doc.priority === 'string' ? doc.priority : null,
    submissionTime: typeof doc.submissionTime === 'string' ? doc.submissionTime : null,
    reportedTime: typeof doc.reportedTime === 'string' ? doc.reportedTime : null,
    statusUpdatedAt: typeof doc.statusUpdatedAt === 'string' ? doc.statusUpdatedAt : null,
    adminComment: normalizeAdminCommentForResponse(doc.adminComment)
  };
}

function canonicalizeStatus(value: unknown): (typeof statusValues)[number] | null {
  if (typeof value !== 'string') {
    return null;
  }

  if ((statusValues as readonly string[]).includes(value as (typeof statusValues)[number])) {
    return value as (typeof statusValues)[number];
  }

  return legacyStatusMapping[value as (typeof legacyStatusValues)[number]] ?? null;
}

function normalizeAdminComment(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAdminCommentForResponse(value: unknown): string | null {
  const normalized = normalizeAdminComment(value);
  return normalized ?? null;
}

function serializeId(value: unknown): string {
  if (!value) {
    return '';
  }

  return typeof value === 'string' ? value : String(value);
}
