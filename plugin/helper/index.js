const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { execSync } = require('child_process');
const path = require('path');

const { extractAudio, getMediaInfo } = require('./ffmpeg');
const { transcribe, listModels, WHISPER_MODELS_DIR } = require('./whisper');

const app = express();
const PORT = process.env.HELPER_PORT || 9876;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Job management — in-memory store for transcription jobs
// ---------------------------------------------------------------------------
const jobs = new Map(); // id -> { id, status, result, error, process }

// ---------------------------------------------------------------------------
// Utility: check if a binary is available on the system
// ---------------------------------------------------------------------------
function binaryExists(name) {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — reports available tools
app.get('/health', (_req, res) => {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const whisperPath = process.env.WHISPER_PATH || 'whisper';

  res.json({
    status: 'ok',
    version: '1.0.0',
    tools: {
      ffmpeg: binaryExists(ffmpegPath),
      ffprobe: binaryExists('ffprobe'),
      whisper: binaryExists(whisperPath),
    },
    modelsDir: WHISPER_MODELS_DIR,
    activeJobs: jobs.size,
  });
});

// Extract audio from a video file
app.post('/extract-audio', async (req, res) => {
  const { videoPath } = req.body;
  if (!videoPath) {
    return res.status(400).json({ error: 'videoPath is required' });
  }

  try {
    const result = await extractAudio(videoPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start a transcription job (async)
app.post('/transcribe', (req, res) => {
  const { audioPath, model } = req.body;
  if (!audioPath) {
    return res.status(400).json({ error: 'audioPath is required' });
  }

  // Resolve model path
  const models = listModels();
  let modelPath;

  if (model) {
    // Try exact filename first, then by short name
    const found = models.find(
      (m) => m.filename === model || m.name === model
    );
    if (found) {
      modelPath = found.path;
    } else {
      modelPath = model; // Treat as absolute path
    }
  } else if (models.length > 0) {
    // Default to first available model
    modelPath = models[0].path;
  } else {
    return res.status(400).json({
      error: 'No Whisper model specified and none found in models directory',
    });
  }

  const jobId = uuidv4();
  const { process: proc, resultPromise } = transcribe(audioPath, modelPath);

  jobs.set(jobId, {
    id: jobId,
    status: 'running',
    result: null,
    error: null,
    process: proc,
  });

  // Handle completion in background
  resultPromise
    .then((result) => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.result = result;
        job.process = null;
      }
    })
    .catch((err) => {
      const job = jobs.get(jobId);
      if (job && job.status !== 'cancelled') {
        job.status = 'failed';
        job.error = err.message;
        job.process = null;
      }
    });

  res.json({ jobId, status: 'running' });
});

// Check transcription job status
app.get('/transcribe/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
    error: job.error,
  });
});

// Cancel a running transcription job
app.post('/transcribe/:jobId/cancel', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'running') {
    return res.status(400).json({ error: `Job is not running (status: ${job.status})` });
  }

  if (job.process) {
    job.process.kill('SIGTERM');
  }
  job.status = 'cancelled';
  job.process = null;

  res.json({ id: job.id, status: 'cancelled' });
});

// Get media metadata
app.get('/media-info', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'path query parameter is required' });
  }

  try {
    const info = await getMediaInfo(filePath);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available Whisper models
app.get('/models', (_req, res) => {
  const models = listModels();
  res.json({ models, modelsDir: WHISPER_MODELS_DIR });
});

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`ScriptSync Helper running on http://localhost:${PORT}`);
  console.log(`Models directory: ${WHISPER_MODELS_DIR}`);
});

// Graceful shutdown: kill all active child processes
function cleanup() {
  console.log('\nShutting down helper — cleaning up child processes...');
  for (const [id, job] of jobs) {
    if (job.process) {
      job.process.kill('SIGTERM');
      console.log(`  Killed job ${id}`);
    }
  }
  jobs.clear();
  server.close(() => {
    console.log('Helper stopped.');
    process.exit(0);
  });
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
