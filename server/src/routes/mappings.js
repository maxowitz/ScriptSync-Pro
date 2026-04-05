const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/roleGuard');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// GET /projects/:id/mappings — list mappings for a project
// ---------------------------------------------------------------------------

router.get(
  '/projects/:id/mappings',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { status, clipId } = req.query;

      const where = { projectId };

      if (status === 'approved') {
        where.approvedAt = { not: null };
      } else if (status === 'pending') {
        where.approvedAt = null;
      }

      if (clipId) {
        where.clipId = clipId;
      }

      const mappings = await prisma.scriptMapping.findMany({
        where,
        include: {
          screenplay: {
            select: { id: true, filename: true },
          },
          clip: {
            select: { id: true, name: true, shotNumber: true, takeNumber: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json(mappings);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:id/mappings — create or update a single mapping
// ---------------------------------------------------------------------------

router.post(
  '/projects/:id/mappings',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const {
        screenplayId,
        dialogueLineId,
        clipId,
        timecodeIn,
        timecodeOut,
        confidence,
        matchMethod,
      } = req.body;

      if (!screenplayId || !dialogueLineId || !clipId) {
        return res
          .status(400)
          .json({ error: 'screenplayId, dialogueLineId, and clipId are required' });
      }

      const validMethods = ['FUZZY', 'CLAUDE', 'MANUAL'];
      if (matchMethod && !validMethods.includes(matchMethod)) {
        return res
          .status(400)
          .json({ error: `matchMethod must be one of: ${validMethods.join(', ')}` });
      }

      // Upsert: if a mapping already exists for this screenplay+dialogueLine, update it
      const existing = await prisma.scriptMapping.findFirst({
        where: { screenplayId, dialogueLineId, projectId },
      });

      let mapping;

      if (existing) {
        mapping = await prisma.scriptMapping.update({
          where: { id: existing.id },
          data: {
            clipId,
            timecodeIn: timecodeIn ?? null,
            timecodeOut: timecodeOut ?? null,
            confidence: confidence ?? null,
            matchMethod: matchMethod || existing.matchMethod,
          },
          include: {
            screenplay: {
              select: { id: true, filename: true },
            },
            clip: {
              select: { id: true, name: true, shotNumber: true, takeNumber: true, status: true },
            },
          },
        });
      } else {
        mapping = await prisma.scriptMapping.create({
          data: {
            projectId,
            screenplayId,
            dialogueLineId,
            clipId,
            timecodeIn: timecodeIn ?? null,
            timecodeOut: timecodeOut ?? null,
            confidence: confidence ?? null,
            matchMethod: matchMethod || 'MANUAL',
          },
          include: {
            screenplay: {
              select: { id: true, filename: true },
            },
            clip: {
              select: { id: true, name: true, shotNumber: true, takeNumber: true, status: true },
            },
          },
        });
      }

      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('mapping:updated', mapping);
        io.to(`project:${projectId}`).emit('clip:mapped', { mapping });
      }

      res.status(existing ? 200 : 201).json(mapping);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /projects/:id/mappings/batch — batch create/update mappings
// ---------------------------------------------------------------------------

router.post(
  '/projects/:id/mappings/batch',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { mappings } = req.body;

      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res
          .status(400)
          .json({ error: 'mappings array is required and must not be empty' });
      }

      const results = await prisma.$transaction(async (tx) => {
        const processed = [];

        for (const m of mappings) {
          const {
            screenplayId,
            dialogueLineId,
            clipId,
            timecodeIn,
            timecodeOut,
            confidence,
            matchMethod,
          } = m;

          if (!screenplayId || !dialogueLineId || !clipId) {
            throw new Error(
              'Each mapping requires screenplayId, dialogueLineId, and clipId'
            );
          }

          const existing = await tx.scriptMapping.findFirst({
            where: { screenplayId, dialogueLineId, projectId },
          });

          let mapping;

          if (existing) {
            mapping = await tx.scriptMapping.update({
              where: { id: existing.id },
              data: {
                clipId,
                timecodeIn: timecodeIn ?? null,
                timecodeOut: timecodeOut ?? null,
                confidence: confidence ?? null,
                matchMethod: matchMethod || existing.matchMethod,
              },
            });
          } else {
            mapping = await tx.scriptMapping.create({
              data: {
                projectId,
                screenplayId,
                dialogueLineId,
                clipId,
                timecodeIn: timecodeIn ?? null,
                timecodeOut: timecodeOut ?? null,
                confidence: confidence ?? null,
                matchMethod: matchMethod || 'MANUAL',
              },
            });
          }

          processed.push(mapping);
        }

        return processed;
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('mappings:batch-updated', {
          count: results.length,
          mappings: results,
        });
        for (const result of results) {
          io.to(`project:${projectId}`).emit('clip:mapped', { mapping: result });
        }
      }

      res.json({ count: results.length, mappings: results });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /projects/:id/mappings/:mappingId/approve — approve a mapping
// ---------------------------------------------------------------------------

router.patch(
  '/projects/:id/mappings/:mappingId/approve',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId, mappingId } = req.params;

      const mapping = await prisma.scriptMapping.findFirst({
        where: { id: mappingId, projectId },
      });

      if (!mapping) {
        return res.status(404).json({ error: 'Mapping not found' });
      }

      const updated = await prisma.scriptMapping.update({
        where: { id: mappingId },
        data: {
          approvedBy: req.user.id,
          approvedAt: new Date(),
        },
        include: {
          screenplay: {
            select: { id: true, filename: true },
          },
          clip: {
            select: { id: true, name: true, shotNumber: true, takeNumber: true, status: true },
          },
        },
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('mapping:approved', updated);
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /projects/:id/mappings/:mappingId — delete a mapping
// ---------------------------------------------------------------------------

router.delete(
  '/projects/:id/mappings/:mappingId',
  authenticate,
  requireMinRole('EDITOR'),
  async (req, res, next) => {
    try {
      const { id: projectId, mappingId } = req.params;

      const mapping = await prisma.scriptMapping.findFirst({
        where: { id: mappingId, projectId },
      });

      if (!mapping) {
        return res.status(404).json({ error: 'Mapping not found' });
      }

      await prisma.scriptMapping.delete({ where: { id: mappingId } });

      res.json({ message: 'Mapping deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
