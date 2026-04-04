const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { sendResetEmail } = require('../services/email');

const router = express.Router();
const prisma = new PrismaClient();

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        lastLogin: new Date(),
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      if (stored) {
        // Potential token reuse — revoke all tokens for this user
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId },
          data: { revoked: true },
        });
      }
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const newAccessToken = generateAccessToken(stored.user);
    const newRefreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId: req.user.id },
        data: { revoked: true },
      });
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Store reset token as a special refresh token with short expiry
    await prisma.refreshToken.create({
      data: {
        token: `reset:${resetTokenHash}`,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const resetUrl = `${process.env.PORTAL_URL}/reset-password?token=${resetToken}`;
    await sendResetEmail(user.email, user.name, resetUrl);

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const stored = await prisma.refreshToken.findUnique({
      where: { token: `reset:${tokenHash}` },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true },
      }),
      // Revoke all existing refresh tokens for security
      prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true, lastLogin: true },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
