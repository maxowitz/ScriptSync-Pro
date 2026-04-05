const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/roleGuard');
const { parseScreenplay } = require('../services/claude');
const { emitToProject } = require('../socket');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Multer config — memory storage, 50 MB limit for PDFs
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = /\.(fountain|txt|fdx|pdf|fadein|highland)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (PDFs can be large)
  fileFilter(_req, file, cb) {
    if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
      return cb(
        new Error(
          'Accepted formats: .fountain, .txt, .fdx, .pdf, .fadein, .highland'
        )
      );
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// File-to-text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
async function extractTextFromPdf(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, {
      // Preserve page breaks for better screenplay structure detection
      pagerender: null,
    });
    return data.text || '';
  } catch (err) {
    console.error('[Screenplay] PDF parse error:', err.message);
    // Fallback: try raw text extraction
    return buffer
      .toString('utf-8')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }
}

/**
 * Extract text from Final Draft XML (.fdx).
 * Handles both FDX 2.x and 3.x format with paragraph types.
 */
function extractTextFromFdx(buffer) {
  const xml = buffer.toString('utf-8');
  const lines = [];

  // Match each <Paragraph Type="..."> ... </Paragraph> block
  const paragraphRegex = /<Paragraph[^>]*?(?:Type="([^"]*)")?[^>]*>([\s\S]*?)<\/Paragraph>/gi;
  let paraMatch;

  while ((paraMatch = paragraphRegex.exec(xml)) !== null) {
    const paraType = (paraMatch[1] || '').toLowerCase();
    const inner = paraMatch[2];

    // Collect all <Text> content within this paragraph
    const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
    const parts = [];
    let textMatch;
    while ((textMatch = textRegex.exec(inner)) !== null) {
      const clean = textMatch[1].replace(/<[^>]*>/g, '').trim();
      if (clean) parts.push(clean);
    }

    if (parts.length === 0) continue;
    const text = parts.join(' ');

    // Convert FDX paragraph types to Fountain-like formatting
    // so Claude can parse the structure correctly
    switch (paraType) {
      case 'scene heading':
        lines.push('');
        lines.push(text.toUpperCase());
        break;
      case 'action':
        lines.push('');
        lines.push(text);
        break;
      case 'character':
        lines.push('');
        lines.push(text.toUpperCase());
        break;
      case 'dialogue':
        lines.push(text);
        break;
      case 'parenthetical':
        lines.push(`(${text.replace(/^\(|\)$/g, '')})`);
        break;
      case 'transition':
        lines.push('');
        lines.push(`> ${text}`);
        break;
      default:
        lines.push(text);
    }
  }

  return lines.join('\n');
}

/**
 * Extract text from Highland (.highland) files.
 * Highland files are zip archives containing a Fountain document.
 */
function extractTextFromHighland(buffer) {
  // Highland format is essentially Fountain wrapped in a zip
  // Try to read as plain text first (Highland 2 uses plain Fountain)
  const text = buffer.toString('utf-8');
  if (text.includes('INT.') || text.includes('EXT.') || text.includes('FADE IN')) {
    return text;
  }
  // If it looks like binary/zip, we can't parse without unzip
  console.warn('[Screenplay] Highland zip format not fully supported, treating as plain text');
  return text.replace(/[^\x20-\x7E\n\r\t]/g, '').trim();
}

/**
 * Convert uploaded file buffer to plain text based on extension.
 */
async function fileToText(buffer, originalname) {
  const ext = originalname.toLowerCase().split('.').pop();

  switch (ext) {
    case 'fountain':
    case 'txt':
      return buffer.toString('utf-8');

    case 'fdx':
      return extractTextFromFdx(buffer);

    case 'pdf':
      return await extractTextFromPdf(buffer);

    case 'highland':
    case 'fadein':
      return extractTextFromHighland(buffer);

    default:
      return buffer.toString('utf-8');
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /projects/:id/screenplay — Upload and parse a screenplay file
router.post(
  '/projects/:id/screenplay',
  authenticate,
  requireMinRole('EDITOR'),
  (req, res, next) => {
    // Wrap multer in error handler — if multipart parsing fails,
    // still let the request through so we can check for raw body
    upload.single('file')(req, res, (err) => {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50 MB.' });
      }
      if (err && err.message && err.message.includes('Accepted formats')) {
        return res.status(400).json({ error: err.message });
      }
      // For other multer errors, continue — req.file may just be undefined
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        // Multer didn't parse a file — could be UXP's non-standard FormData
        // Check if there's a raw body we can use
        console.warn('[Screenplay] No file from multer. Content-Type:', req.headers['content-type']);
        return res.status(400).json({
          error: 'Screenplay file is required. Ensure the file is sent as multipart form data with field name "file".',
        });
      }

      const projectId = req.params.id;
      const rawText = await fileToText(req.file.buffer, req.file.originalname);

      if (!rawText || rawText.trim().length < 10) {
        return res.status(400).json({
          error:
            'Could not extract meaningful text from the file. For PDFs, make sure the file contains selectable text (not scanned images).',
        });
      }

      // Parse with Claude AI
      let parsedJSON = null;
      try {
        parsedJSON = await parseScreenplay(rawText);
      } catch (parseErr) {
        console.error('[Screenplay] Claude parse failed:', parseErr.message);
        // Still save the raw text even if AI parsing fails
        // User can retry parsing later
      }

      // Check if a screenplay already exists for this project
      const existing = await prisma.screenplay.findFirst({
        where: { projectId },
        orderBy: { uploadedAt: 'desc' },
      });

      let screenplay;
      if (existing) {
        screenplay = await prisma.screenplay.update({
          where: { id: existing.id },
          data: {
            filename: req.file.originalname,
            rawText,
            parsedJSON,
            uploadedBy: req.user.id,
          },
        });
      } else {
        screenplay = await prisma.screenplay.create({
          data: {
            projectId,
            filename: req.file.originalname,
            rawText,
            parsedJSON,
            uploadedBy: req.user.id,
          },
        });
      }

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        emitToProject(io, projectId, 'screenplay:parsed', {
          screenplayId: screenplay.id,
          filename: screenplay.filename,
          title: parsedJSON?.title || null,
          sceneCount: parsedJSON?.scenes?.length || 0,
          uploadedBy: { id: req.user.id, name: req.user.name },
        });
      }

      res.status(201).json({
        id: screenplay.id,
        projectId: screenplay.projectId,
        filename: screenplay.filename,
        parsedJSON: screenplay.parsedJSON,
        uploadedAt: screenplay.uploadedAt,
        parseStatus: parsedJSON ? 'success' : 'failed',
      });
    } catch (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ error: 'File too large. Maximum size is 50 MB.' });
      }
      if (err.message && err.message.includes('Accepted formats')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  }
);

// POST /projects/:id/screenplay/raw — Alternative upload endpoint for UXP plugin
// Accepts raw binary body with X-Filename header (no multipart FormData needed)
router.post(
  '/projects/:id/screenplay/raw',
  authenticate,
  requireMinRole('EDITOR'),
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res, next) => {
    try {
      const filename = req.headers['x-filename'] || 'screenplay.txt';
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);

      if (!buffer || buffer.length < 10) {
        return res.status(400).json({ error: 'File body is empty' });
      }

      const projectId = req.params.id;
      const rawText = await fileToText(buffer, filename);

      if (!rawText || rawText.trim().length < 10) {
        return res.status(400).json({
          error: 'Could not extract text from the file.',
        });
      }

      let parsedJSON = null;
      try {
        parsedJSON = await parseScreenplay(rawText);
      } catch (parseErr) {
        console.error('[Screenplay] Claude parse failed:', parseErr.message);
      }

      const existing = await prisma.screenplay.findFirst({
        where: { projectId },
        orderBy: { uploadedAt: 'desc' },
      });

      let screenplay;
      if (existing) {
        screenplay = await prisma.screenplay.update({
          where: { id: existing.id },
          data: { filename, rawText, parsedJSON, uploadedBy: req.user.id },
        });
      } else {
        screenplay = await prisma.screenplay.create({
          data: { projectId, filename, rawText, parsedJSON, uploadedBy: req.user.id },
        });
      }

      const io = req.app.get('io');
      if (io) {
        emitToProject(io, projectId, 'screenplay:parsed', {
          screenplayId: screenplay.id,
          filename,
          title: parsedJSON?.title || null,
          sceneCount: parsedJSON?.scenes?.length || 0,
        });
      }

      res.status(201).json({
        id: screenplay.id,
        projectId: screenplay.projectId,
        filename: screenplay.filename,
        parsedJSON: screenplay.parsedJSON,
        uploadedAt: screenplay.uploadedAt,
        parseStatus: parsedJSON ? 'success' : 'failed',
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /projects/:id/screenplay — Get the latest screenplay for a project
router.get(
  '/projects/:id/screenplay',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const screenplay = await prisma.screenplay.findFirst({
        where: { projectId: req.params.id },
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          projectId: true,
          filename: true,
          rawText: true,
          parsedJSON: true,
          uploadedBy: true,
          uploadedAt: true,
        },
      });

      if (!screenplay) {
        return res
          .status(404)
          .json({ error: 'No screenplay found for this project' });
      }

      res.json(screenplay);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
