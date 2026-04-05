require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { setupSocket } = require('./socket');
const { errorHandler } = require('./middleware/errorHandler');

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
