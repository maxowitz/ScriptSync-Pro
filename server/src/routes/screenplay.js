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
// Multer config — memory storage, 20 MB limit, allowed extensions
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'application/pdf',
  'text/xml',
  'application/xml',
  'application/octet-stream', // .fountain files often lack a specific MIME type
];

const ALLOWED_EXTENSIONS = /\.(fountain|txt|fdx|pdf)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(_req, file, cb) {
    if (!ALLOWED_EXTENSIONS.test(file.originalname)) {
      return cb(
        new Error('Only .fountain, .txt, .fdx, and .pdf files are accepted')
      );
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a Final Draft XML (.fdx) buffer.
 * Performs a lightweight parse: pulls <Text> content from <Paragraph> elements.
 */
function extractTextFromFdx(buffer) {
  const xml = buffer.toString('utf-8');
  const lines = [];

  // Match each <Paragraph ...> ... </Paragraph> block
  const paragraphRegex = /<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/gi;
  let paraMatch;
  while ((paraMatch = paragraphRegex.exec(xml)) !== null) {
    const inner = paraMatch[1];

    // Collect all <Text> content within this paragraph
    const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
    const parts = [];
    let textMatch;
    while ((textMatch = textRegex.exec(inner)) !== null) {
      parts.push(textMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    if (parts.length > 0) {
      lines.push(parts.join(' '));
    }
  }

  return lines.join('\n');
}

/**
 * Attempt basic text extraction from a PDF buffer.
 * Real PDF parsing requires a dedicated library (pdf-parse, pdfjs-dist, etc.).
 * This is a best-effort extraction of text-like content for simple PDFs.
 */
function extractTextFromPdf(buffer) {
  // Try to pull readable ASCII/UTF-8 strings from the PDF binary.
  // This will NOT work for image-based or encrypted PDFs.
  const raw = buffer.toString('latin1');
  const textChunks = [];

  // Look for text between BT (begin text) and ET (end text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract strings inside parentheses (Tj/TJ string operands)
    const strRegex = /\(([^)]*)\)/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const text = strMatch[1].trim();
      if (text.length > 0) {
        textChunks.push(text);
      }
    }
  }

  if (textChunks.length === 0) {
    // Fallback: return the raw buffer as UTF-8 with non-printable chars stripped
    return buffer
      .toString('utf-8')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  return textChunks.join('\n');
}

/**
 * Convert an uploaded file buffer to plain text based on its extension.
 */
function fileToText(buffer, originalname) {
  const ext = originalname.toLowerCase().split('.').pop();

  switch (ext) {
    case 'fountain':
    case 'txt':
      return buffer.toString('utf-8');

    case 'fdx':
      return extractTextFromFdx(buffer);

    case 'pdf':
      return extractTextFromPdf(buffer);

    default:
      return buffer.toString('utf-8');
  }
}

// ---------------------------------------------------------------------------
// Routes (mounted at /projects in main app)
// ---------------------------------------------------------------------------

// POST /:id/screenplay — Upload and parse a screenplay file
router.post(
  '/projects/:id/screenplay',
  authenticate,
  requireMinRole('EDITOR'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Screenplay file is required' });
      }

      const projectId = req.params.id;
      const rawText = fileToText(req.file.buffer, req.file.originalname);

      if (!rawText || rawText.trim().length === 0) {
        return res
          .status(400)
          .json({ error: 'Could not extract text from the uploaded file' });
      }

      // Parse with Claude
      const parsedJSON = await parseScreenplay(rawText);

      // Upsert screenplay record for this project
      const screenplay = await prisma.screenplay.upsert({
        where: { projectId },
        update: {
          filename: req.file.originalname,
          rawText,
          parsedJSON,
          uploadedBy: req.user.id,
          updatedAt: new Date(),
        },
        create: {
          projectId,
          filename: req.file.originalname,
          rawText,
          parsedJSON,
          uploadedBy: req.user.id,
        },
      });

      // Emit real-time update to project room
      const io = req.app.get('io');
      if (io) {
        emitToProject(io, projectId, 'screenplay:parsed', {
          screenplayId: screenplay.id,
          title: parsedJSON.title,
          sceneCount: parsedJSON.scenes?.length || 0,
          uploadedBy: { id: req.user.id, name: req.user.name },
        });
      }

      res.status(201).json(screenplay);
    } catch (err) {
      // Handle multer errors (file size, type)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ error: 'File too large. Maximum size is 20 MB.' });
      }
      if (err.message && err.message.includes('Only .fountain')) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  }
);

// GET /:id/screenplay — Get the latest parsed screenplay for a project
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
