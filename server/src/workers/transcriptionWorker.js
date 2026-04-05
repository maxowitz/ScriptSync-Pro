const Bull = require('bull');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { downloadToLocal } = require('../services/storage');

const prisma = new PrismaClient();

const WHISPER_BINARY_PATH = process.env.WHISPER_BINARY_PATH || 'whisper-cpp';
const WHISPER_MODEL_PATH =
  process.env.WHISPER_MODEL_PATH || '/usr/local/share/whisper/ggml-base.en.bin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap child_process.spawn in a Promise. Resolves with stdout on exit 0,
 * rejects with stderr / non-zero exit code.
 */
function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${command}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${command} exited with code ${code}:\n${stderr || stdout}`
          )
        );
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Extract audio from a media file as 16 kHz mono WAV using FFmpeg.
 */
async function extractAudio(inputPath, outputPath) {
  await spawnAsync('ffmpeg', [
    '-i', inputPath,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    outputPath,
  ]);
}

/**
 * Run Whisper.cpp on a WAV file and return the parsed JSON output.
 */
async function runWhisper(wavPath) {
  const jsonOutputBase = wavPath; // whisper-cpp appends .json to the input filename
  await spawnAsync(WHISPER_BINARY_PATH, [
    '-m', WHISPER_MODEL_PATH,
    '-f', wavPath,
    '--output-json',
    '-l', 'en',
  ]);

  // Whisper.cpp writes output to <input>.json
  const jsonPath = `${wavPath}.json`;
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Whisper JSON output not found at ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Parse Whisper JSON output into word-level timestamp segments.
 * Returns [{ text, start, end }]
 */
function parseWhisperOutput(whisperJson) {
  const words = [];

  const segments = whisperJson.transcription || whisperJson.segments || [];

  for (const segment of segments) {
    // Whisper.cpp JSON may have word-level tokens
    if (segment.tokens && Array.isArray(segment.tokens)) {
      for (const token of segment.tokens) {
        const text = (token.text || '').trim();
        if (!text) continue;
        words.push({
          text,
          start: token.offsets?.from ?? segment.offsets?.from ?? 0,
          end: token.offsets?.to ?? segment.offsets?.to ?? 0,
        });
      }
    } else {
      // Fallback: treat entire segment as one entry
      const text = (segment.text || '').trim();
      if (!text) continue;
      words.push({
        text,
        start: segment.offsets?.from ?? segment.start ?? 0,
        end: segment.offsets?.to ?? segment.end ?? 0,
      });
    }
  }

  return words;
}

/**
 * Remove temp files, ignoring errors.
 */
function cleanupFiles(...files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      // best-effort cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

function startTranscriptionWorker(io) {
  const transcriptionQueue = new Bull('transcription', process.env.REDIS_URL);

  transcriptionQueue.process(async (job) => {
    const { clipId, projectId, storageKey } = job.data;
    const tmpId = crypto.randomUUID();
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${tmpId}-input`);
    const wavPath = path.join(tmpDir, `${tmpId}-audio.wav`);

    try {
      // Step 1: Mark clip as TRANSCRIBING
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'TRANSCRIBING' },
      });
      job.progress(10);

      // Step 2: Download clip from storage to temp
      await downloadToLocal(storageKey, inputPath);
      job.progress(25);

      // Step 3: Extract audio with FFmpeg
      await extractAudio(inputPath, wavPath);
      job.progress(40);

      // Step 4: Run Whisper.cpp
      const whisperJson = await runWhisper(wavPath);
      job.progress(70);

      // Step 5: Parse word-level timestamps
      const words = parseWhisperOutput(whisperJson);
      const fullText = words.map((w) => w.text).join(' ');
      job.progress(80);

      // Step 6: Store transcript in DB
      await prisma.transcript.create({
        data: {
          clipId,
          engine: 'whisper.cpp',
          model: path.basename(WHISPER_MODEL_PATH),
          rawOutput: JSON.stringify(whisperJson),
          words,
          completedAt: new Date(),
        },
      });
      job.progress(90);

      // Step 7: Update clip status
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'TRANSCRIBED' },
      });

      // Step 8: Emit socket event
      if (io) {
        io.to(`project:${projectId}`).emit('clip:transcribed', {
          clipId,
          projectId,
        });
      }

      job.progress(100);

      return { clipId, wordCount: words.length };
    } finally {
      // Step 9: Clean up temp files
      const whisperJsonPath = `${wavPath}.json`;
      cleanupFiles(inputPath, wavPath, whisperJsonPath);
    }
  });

  // ---------------------------------------------------------------------------
  // Failure handler — update clip status to FAILED
  // ---------------------------------------------------------------------------

  transcriptionQueue.on('failed', async (job, err) => {
    const { clipId, projectId } = job.data;
    console.error(
      `[transcription] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`,
      err.message
    );

    try {
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'FAILED' },
      });
    } catch (dbErr) {
      console.error(
        `[transcription] Failed to update clip ${clipId} status to FAILED:`,
        dbErr.message
      );
    }

    if (io) {
      io.to(`project:${projectId}`).emit('clip:transcription-failed', {
        clipId,
        projectId,
        error: err.message,
        attempt: job.attemptsMade,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Dead letter — all retries exhausted
  // ---------------------------------------------------------------------------

  transcriptionQueue.on('failed', async (job, err) => {
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      console.error(
        `[transcription] DEAD LETTER — Job ${job.id} exhausted all ${job.attemptsMade} attempts.\n` +
          `  clipId:     ${job.data.clipId}\n` +
          `  projectId:  ${job.data.projectId}\n` +
          `  storageKey: ${job.data.storageKey}\n` +
          `  error:      ${err.message}\n` +
          `  stack:      ${err.stack}`
      );
    }
  });

  console.log('[transcription] Worker started, listening for jobs...');

  return transcriptionQueue;
}

module.exports = { startTranscriptionWorker };
