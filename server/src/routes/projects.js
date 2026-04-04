const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { requireMinRole, requireProjectRole } = require('../middleware/roleGuard');
const { sendInviteEmail } = require('../services/email');

const router = express.Router();
const prisma = new PrismaClient();

const SALT_ROUNDS = 12;
const INVITE_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

// GET /projects — list projects where user is owner or member
router.get('/projects', authenticate, async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// POST /projects — create project, auto-add creator as OWNER member
router.post('/projects', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        ownerId: req.user.id,
        members: {
          create: {
            userId: req.user.id,
            role: 'OWNER',
            acceptedAt: new Date(),
          },
        },
      },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id — get project detail with members
router.get(
  '/projects/:id',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          members: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json(project);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id — delete project (OWNER only)
router.delete(
  '/projects/:id',
  authenticate,
  requireProjectRole('OWNER'),
  async (req, res, next) => {
    try {
      await prisma.$transaction([
        prisma.invite.deleteMany({ where: { projectId: req.params.id } }),
        prisma.projectMember.deleteMany({ where: { projectId: req.params.id } }),
        prisma.project.delete({ where: { id: req.params.id } }),
      ]);

      res.json({ message: 'Project deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// GET /projects/:id/members — list members
router.get(
  '/projects/:id/members',
  authenticate,
  requireMinRole('VIEWER'),
  async (req, res, next) => {
    try {
      const members = await prisma.projectMember.findMany({
        where: { projectId: req.params.id },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { invitedAt: 'asc' },
      });

      res.json(members);
    } catch (err) {
      next(err);
    }
  }
);

// POST /projects/:id/invite — invite member by email with role
router.post(
  '/projects/:id/invite',
  authenticate,
  requireProjectRole('OWNER'),
  async (req, res, next) => {
    try {
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const validRoles = ['EDITOR', 'UPLOADER', 'VIEWER'];
      if (!role || !validRoles.includes(role)) {
        return res
          .status(400)
          .json({ error: `Role must be one of: ${validRoles.join(', ')}` });
      }

      // Check if user is already a member
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        const existingMember = await prisma.projectMember.findFirst({
          where: { projectId: req.params.id, userId: existingUser.id },
        });

        if (existingMember) {
          return res
            .status(409)
            .json({ error: 'User is already a member of this project' });
        }
      }

      // Check for pending invite to same email
      const pendingInvite = await prisma.invite.findFirst({
        where: {
          projectId: req.params.id,
          email: email.toLowerCase(),
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (pendingInvite) {
        return res
          .status(409)
          .json({ error: 'A pending invitation already exists for this email' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(
        Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      );

      const invite = await prisma.invite.create({
        data: {
          projectId: req.params.id,
          email: email.toLowerCase(),
          role,
          token,
          sentBy: req.user.id,
          expiresAt,
        },
      });

      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
      });

      const acceptUrl = `${process.env.PORTAL_URL}/accept-invite?token=${token}`;
      await sendInviteEmail(
        email.toLowerCase(),
        req.user.name,
        project.name,
        role,
        acceptUrl
      );

      res.status(201).json({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /projects/:id/members/:uid — remove member (OWNER only, cannot remove self)
router.delete(
  '/projects/:id/members/:uid',
  authenticate,
  requireProjectRole('OWNER'),
  async (req, res, next) => {
    try {
      if (req.params.uid === req.user.id) {
        return res
          .status(400)
          .json({ error: 'Cannot remove yourself from the project' });
      }

      const member = await prisma.projectMember.findFirst({
        where: { projectId: req.params.id, userId: req.params.uid },
      });

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      await prisma.projectMember.delete({ where: { id: member.id } });

      res.json({ message: 'Member removed' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /projects/:id/members/:uid — change member role (OWNER only)
router.patch(
  '/projects/:id/members/:uid',
  authenticate,
  requireProjectRole('OWNER'),
  async (req, res, next) => {
    try {
      const { role } = req.body;

      const validRoles = ['OWNER', 'EDITOR', 'UPLOADER', 'VIEWER'];
      if (!role || !validRoles.includes(role)) {
        return res
          .status(400)
          .json({ error: `Role must be one of: ${validRoles.join(', ')}` });
      }

      const member = await prisma.projectMember.findFirst({
        where: { projectId: req.params.id, userId: req.params.uid },
      });

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const updated = await prisma.projectMember.update({
        where: { id: member.id },
        data: { role },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Invite acceptance (no auth required)
// ---------------------------------------------------------------------------

// POST /invites/accept — accept an invite by token
router.post('/invites/accept', async (req, res, next) => {
  try {
    const { token, password, name } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { project: true },
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.acceptedAt) {
      return res.status(400).json({ error: 'Invite has already been accepted' });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    let user = await prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (!user) {
      // New user — require password and name
      if (!password || !name) {
        return res.status(400).json({
          error: 'Password and name are required for new users',
          newUser: true,
        });
      }

      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 8 characters' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      user = await prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          name: name.trim(),
          lastLogin: new Date(),
        },
      });
    }

    // Check if already a member (edge case: user added between invite send and accept)
    const existingMember = await prisma.projectMember.findFirst({
      where: { projectId: invite.projectId, userId: user.id },
    });

    if (existingMember) {
      // Still mark invite as accepted
      await prisma.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return res.json({
        message: 'You are already a member of this project',
        projectId: invite.projectId,
        userId: user.id,
      });
    }

    await prisma.$transaction([
      prisma.projectMember.create({
        data: {
          projectId: invite.projectId,
          userId: user.id,
          role: invite.role,
          acceptedAt: new Date(),
        },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    res.json({
      message: 'Invite accepted',
      projectId: invite.projectId,
      userId: user.id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
