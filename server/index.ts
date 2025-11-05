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
  MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024)
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  LLM_URL: process.env.LLM_URL,
  STORAGE_DIR: process.env.STORAGE_DIR,
  MAX_IMAGE_BYTES: process.env.MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES: process.env.MAX_VIDEO_BYTES,
  MAX_AUDIO_BYTES: process.env.MAX_AUDIO_BYTES
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

app.use(cors());
// Текстовые payload'ы от фронтенда небольшие, поэтому 1 МБ достаточно.
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
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
}
