const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// FIX: Homebrew installs whisper.cpp as 'whisper-cli', not 'whisper'
const WHISPER_PATH = process.env.WHISPER_PATH || 'whisper-cli';
const WHISPER_MODELS_DIR = process.env.WHISPER_MODELS_DIR || path.join(__dirname, 'models');

/**
 * Run Whisper.cpp transcription on an audio file.
 * Returns { process, resultPromise } so the caller can track/cancel the job.
 *
 * options:
 *   language — language code (default: "en")
 *   threads  — number of threads
 */
function transcribe(audioPath, modelPath, options = {}) {
  const language = options.language || 'en';

  const args = [
    '-m', modelPath,
    '-f', audioPath,
    '--output-json',
    '-l', language,
  ];

  if (options.threads) {
    args.push('-t', String(options.threads));
  }

  const proc = spawn(WHISPER_PATH, args);

  const resultPromise = new Promise((resolve, reject) => {
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Whisper exited with code ${code}: ${stderr}`));
      }

      // Whisper.cpp writes <inputfile>.json next to the input
      const jsonPath = audioPath + '.json';

      if (!fs.existsSync(jsonPath)) {
        return reject(new Error('Whisper did not produce JSON output file'));
      }

      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const standardized = normalizeWhisperOutput(raw);
        // Clean up the json file
        fs.unlinkSync(jsonPath);
        resolve(standardized);
      } catch (e) {
        reject(new Error(`Failed to parse Whisper output: ${e.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Whisper: ${err.message}`));
    });
  });

  return { process: proc, resultPromise };
}

/**
 * Convert Whisper.cpp JSON output to a standardized format.
 * Handles both older and newer Whisper.cpp output structures.
 */
function normalizeWhisperOutput(raw) {
  const segments = [];

  // Newer format: raw.transcription is an array of segments
  const source = raw.transcription || raw.segments || raw.result?.segments || [];

  for (const seg of source) {
    const segment = {
      text: (seg.text || '').trim(),
      start: parseTimestamp(seg.timestamps?.from || seg.t0 || seg.start || 0),
      end: parseTimestamp(seg.timestamps?.to || seg.t1 || seg.end || 0),
      words: [],
    };

    // Word-level timestamps if available
    const tokens = seg.tokens || seg.words || [];
    for (const tok of tokens) {
      // Skip non-text tokens (e.g. special tokens in older formats)
      const text = (tok.text || tok.word || '').trim();
      if (!text) continue;

      segment.words.push({
        text,
        start: parseTimestamp(tok.timestamps?.from || tok.t0 || tok.start || segment.start),
        end: parseTimestamp(tok.timestamps?.to || tok.t1 || tok.end || segment.end),
      });
    }

    if (segment.text) {
      segments.push(segment);
    }
  }

  return { segments };
}

/**
 * Parse a timestamp value to seconds (float).
 * Handles: number (ms or seconds), string "HH:MM:SS.mmm", string "SS.mmm".
 */
function parseTimestamp(value) {
  if (typeof value === 'number') {
    // Whisper.cpp older versions use centiseconds, newer use milliseconds
    // If value > 1_000_000, treat as ms
    if (value > 100000) return value / 1000;
    if (value > 1000) return value / 100;
    return value;
  }

  if (typeof value === 'string') {
    // "HH:MM:SS.mmm" format
    const parts = value.split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]);
      const m = parseFloat(parts[1]);
      const s = parseFloat(parts[2]);
      return h * 3600 + m * 60 + s;
    }
    return parseFloat(value) || 0;
  }

  return 0;
}

/**
 * List available Whisper models in the models directory.
 */
function listModels() {
  if (!fs.existsSync(WHISPER_MODELS_DIR)) {
    return [];
  }

  return fs.readdirSync(WHISPER_MODELS_DIR)
    .filter((f) => f.startsWith('ggml-') && f.endsWith('.bin'))
    .map((f) => {
      const stats = fs.statSync(path.join(WHISPER_MODELS_DIR, f));
      const name = f.replace('ggml-', '').replace('.bin', '');
      return {
        name,
        filename: f,
        path: path.join(WHISPER_MODELS_DIR, f),
        size: stats.size,
      };
    });
}

module.exports = { transcribe, listModels, WHISPER_MODELS_DIR };
