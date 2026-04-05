// FIX: override=true needed because Claude Code sets empty ANTHROPIC_API_KEY in shell env
require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { setupSocket } = require('./socket');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const clipRoutes = require('./routes/clips');
const screenplayRoutes = require('./routes/screenplay');
const mappingRoutes = require('./routes/mappings');
const { startTranscriptionWorker } = require('./workers/transcriptionWorker');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const io = setupSocket(server, prisma);
app.set('io', io);
app.set('prisma', prisma);

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: [
    process.env.PORTAL_URL || 'http://localhost:5173',
    process.env.PLUGIN_ORIGIN || 'http://localhost:8080',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/', projectRoutes);
app.use('/', clipRoutes);
app.use('/', screenplayRoutes);
app.use('/', mappingRoutes);

// Local storage upload handler (used when R2 is not configured)
const localStoragePath = process.env.LOCAL_STORAGE_PATH || './storage';
app.put('/storage/*', authenticate, (req, res, next) => {
  const key = req.params[0];
  const fullPath = path.join(localStoragePath, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const writeStream = fs.createWriteStream(fullPath);
  req.pipe(writeStream);
  writeStream.on('finish', () => res.json({ ok: true }));
  writeStream.on('error', (err) => next(err));
});

// Serve stored files
app.use('/storage', express.static(localStoragePath));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ScriptSync Pro server running on port ${PORT}`);
  startTranscriptionWorker(io);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

module.exports = { app, server, prisma };
