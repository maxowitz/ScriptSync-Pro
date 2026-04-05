const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const Bull = require('bull');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/roleGuard');
const {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteObject,
  getStorageType,
} = require('../services/storage');

const router = express.Router();
const prisma = new PrismaClient();

const transcriptionQueue = new Bull('transcription', process.env.REDIS_URL);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse shot and take numbers from common production filename conventions.
 *
 * Supported patterns:
 *   "Scene01_Shot02_Take03.mov" -> { name, shot: "02", take: "03" }
 *   "A001C002_220101_R1K4.mxf"  -> { name, shot: "A001C002", take: null }
 *   Fallback: use entire basename as name, null shot/take.
 */
function parseShotTake(filename) {
  const baseName = filename.replace(/\.[^.]+$/, ''); // strip extension

  // Pattern 1: Scene##_Shot##_Take##  (case-insensitive, flexible separators)
  const scripted = /(?:scene\s*(\d+))?[_\- ]*shot\s*(\d+)[_\- ]*take\s*(\d+)/i;
  const m1 = baseName.match(scripted);
  if (m1) {
    return {
      name: baseName,
      shotNumber: m1[2],
      takeNumber: m1[3],
    };
  }

  // Pattern 2: Camera-roll clip ID, e.g. A002C011_240618_RPSM
  const arri = /^([A-Z]\d{3}C\d{3,4})/i;
  const m2 = baseName.match(arri);
  if (m2) {
    return {
      name: baseName,
      shotNumber: m2[1],
      takeNumber: null,
    };
  }

  // FIX: Pattern 3: Production sound convention — 21A-003.WAV = Scene 21A, Take 003
  const prodSound = /^(\d+[A-Z]?)[_\-](\d{2,3})$/i;
  const m3 = baseName.match(prodSound);
  if (m3) {
    return {
      name: baseName,
      shotNumber: m3[1],  // scene/slate number (e.g., "21A")
      takeNumber: m3[2],  // take number (e.g., "003")
    };
  }

  // Fallback — never throws
  return {
    name: baseName,
    shotNumber: null,
    takeNumber: null,
  };
}

// ---------------------------------------------------------------------------
// GET /projects/:id/clips — list clips with pagination
// ---------------------------------------------------------------------------

router.get(
  '/projects/:id/clips',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
      const offset = (page - 1) * limit;

      const [clips, total] = await Promise.all([
        prisma.clip.findMany({
          where: { projectId },
          include: {
            transcript: {
              select: { id: true, engine: true, model: true, completedAt: true },
            },
          },
          orderBy: { uploadedAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.clip.count({ where: { projectId } }),
      ]);

      res.json({
        clips,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:id/clips/presign — get presigned upload URL
// ---------------------------------------------------------------------------

router.post(
  '/projects/:id/clips/presign',
  authenticate,
  requireMinRole('UPLOADER'),
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { filename, contentType } = req.body;

      if (!filename || !contentType) {
        return res
          .status(400)
          .json({ error: 'filename and contentType are required' });
      }

      const fileId = uuidv4();
      const storageKey = `projects/${projectId}/clips/${fileId}-${filename}`;
      const { url } = await generatePresignedUploadUrl(storageKey, contentType);

      const { name, shotNumber, takeNumber } = parseShotTake(filename);

      const clip = await prisma.clip.create({
        data: {
          projectId,
          name,
          shotNumber,
          takeNumber,
          uploadedBy: req.user.id,
          source: getStorageType() === 'r2' ? 'REMOTE' : 'LOCAL',
          remoteStorageKey: storageKey,
          status: 'PENDING',
        },
      });

      res.json({ uploadUrl: url, storageKey, clip });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:id/clips/confirm-upload — mark upload complete, enqueue job
// ---------------------------------------------------------------------------

router.post(
  '/projects/:id/clips/:clipId/confirm-upload',
  authenticate,
  requireMinRole('UPLOADER'),
  async (req, res, next) => {
    try {
      const { id: projectId, clipId } = req.params;

      if (!clipId) {
        return res.status(400).json({ error: 'clipId is required' });
      }

      const clip = await prisma.clip.findFirst({
        where: { id: clipId, projectId },
      });

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found in this project' });
      }

      if (clip.status !== 'PENDING') {
        return res
          .status(409)
          .json({ error: `Clip is already in status: ${clip.status}` });
      }

      const updated = await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'TRANSCRIBING' },
      });

      // Enqueue transcription job
      await transcriptionQueue.add(
        { clipId: clip.id, projectId, storageKey: clip.remoteStorageKey },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        }
      );

      // Notify project room via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('clip:uploading-complete', {
          clipId: clip.id,
          status: 'TRANSCRIBING',
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /projects/:id/clips/:clipId — clip detail with transcript
// ---------------------------------------------------------------------------

router.get(
  '/projects/:id/clips/:clipId',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const { id: projectId, clipId } = req.params;

      const clip = await prisma.clip.findFirst({
        where: { id: clipId, projectId },
        include: {
          transcript: true,
          uploadedByUser: {
            select: { id: true, email: true, name: true },
          },
        },
      });

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Attach a download URL if stored remotely
      let downloadUrl = null;
      if (clip.remoteStorageKey) {
        downloadUrl = await generatePresignedDownloadUrl(clip.remoteStorageKey);
      }

      res.json({ ...clip, downloadUrl });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /projects/:id/clips/:clipId — delete clip + storage object
// ---------------------------------------------------------------------------

router.delete(
  '/projects/:id/clips/:clipId',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId, clipId } = req.params;

      const clip = await prisma.clip.findFirst({
        where: { id: clipId, projectId },
      });

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Delete from object storage if remote
      if (clip.source === 'REMOTE' && clip.remoteStorageKey) {
        try {
          await deleteObject(clip.remoteStorageKey);
        } catch (storageErr) {
          console.error('Failed to delete storage object:', storageErr.message);
          // Continue with DB deletion even if storage delete fails
        }
      }

      // Delete transcript first (FK constraint), then clip
      await prisma.$transaction([
        prisma.transcript.deleteMany({ where: { clipId } }),
        prisma.clip.delete({ where: { id: clipId } }),
      ]);

      res.json({ message: 'Clip deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /projects/:id/clips/:clipId/job — transcription job status
// ---------------------------------------------------------------------------

router.get(
  '/projects/:id/clips/:clipId/job',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const { id: projectId, clipId } = req.params;

      const clip = await prisma.clip.findFirst({
        where: { id: clipId, projectId },
      });

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Look up Bull jobs for this clip
      const jobs = await transcriptionQueue.getJobs([
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      ]);
      const job = jobs.find((j) => j.data && j.data.clipId === clipId);

      if (!job) {
        return res.json({
          clipId,
          clipStatus: clip.status,
          job: null,
        });
      }

      const state = await job.getState();
      const progress = job.progress();

      res.json({
        clipId,
        clipStatus: clip.status,
        job: {
          id: job.id,
          state,
          progress,
          failedReason: job.failedReason || null,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:id/clips/:clipId/retranscribe — re-queue a failed job
// ---------------------------------------------------------------------------

router.post(
  '/projects/:id/clips/:clipId/retranscribe',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId, clipId } = req.params;

      const clip = await prisma.clip.findFirst({
        where: { id: clipId, projectId },
      });

      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      if (clip.status !== 'FAILED') {
        return res.status(409).json({
          error: 'Only clips with FAILED status can be retranscribed',
          currentStatus: clip.status,
        });
      }

      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'TRANSCRIBING' },
      });

      await transcriptionQueue.add(
        { clipId: clip.id, projectId, storageKey: clip.remoteStorageKey },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('clip:retranscribe', {
          clipId: clip.id,
          status: 'TRANSCRIBING',
        });
      }

      res.json({ message: 'Transcription re-queued', clipId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
