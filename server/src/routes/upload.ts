import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

type Platform = 'wa' | 'tg';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function inferExtFromMime(mime: string): string | undefined {
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/webm') return '.webm';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return '.mp3';
  if (mime === 'audio/mp4' || mime === 'audio/aac') return '.m4a';
  return undefined;
}

function createStorageForPlatform(platform: Platform) {
  const uploadsRoot = path.join(process.cwd(), 'public', 'media', platform, 'uploads', 'voice');
  ensureDir(uploadsRoot);
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsRoot),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const ext = path.extname(file.originalname) || inferExtFromMime(file.mimetype) || '.ogg';
      const base = path.basename(file.originalname, path.extname(file.originalname)) || 'voice';
      cb(null, `${base}-${ts}${ext}`);
    }
  });
}

const allowedMimes = ['audio/ogg', 'audio/webm', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac'];

function createUploader(platform: Platform) {
  return multer({
    storage: createStorageForPlatform(platform),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
      if (allowedMimes.includes(file.mimetype)) return cb(null, true);
      return cb(new Error(`Unsupported content-type: ${file.mimetype}`));
    }
  });
}

// POST /upload/voice/:platform  platform in ['wa','tg']  field: file
router.post('/voice/:platform', (req, res, next) => {
  const platform = (req.params.platform || '').toLowerCase() as Platform;
  if (platform !== 'wa' && platform !== 'tg') {
    return res.status(400).json({ ok: false, message: 'Invalid platform, expected wa|tg' });
  }

  const uploader = createUploader(platform).single('file');
  uploader(req, res, (err: any) => {
    if (err) return res.status(400).json({ ok: false, message: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded' });

    const rel = path.relative(path.join(process.cwd(), 'public'), req.file.path).replace(/\\/g, '/');
    const url = `/media/${rel}`; // served by express.static('/media', ...)
    return res.json({ ok: true, url, filename: req.file.filename, mime: req.file.mimetype, size: req.file.size, platform });
  });
});

export default router;






