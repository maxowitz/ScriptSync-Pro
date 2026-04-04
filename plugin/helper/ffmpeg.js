const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const TEMP_DIR = path.join(os.tmpdir(), 'scriptsync-helper');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

/**
 * Extract audio from a video file as 16kHz mono WAV (Whisper-compatible).
 * Returns { audioPath, duration }.
 */
function extractAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!outputPath) {
      const basename = path.basename(videoPath, path.extname(videoPath));
      outputPath = path.join(TEMP_DIR, `${basename}_${Date.now()}.wav`);
    }

    const args = [
      '-i', videoPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ];

    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }

      // Parse duration from stderr (FFmpeg writes info to stderr)
      let duration = null;
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        const centis = parseInt(match[4], 10);
        duration = hours * 3600 + minutes * 60 + seconds + centis / 100;
      }

      resolve({ audioPath: outputPath, duration });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Get media metadata via ffprobe. Returns parsed JSON with format and streams.
 */
function getMediaInfo(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    const proc = spawn(FFPROBE_PATH, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }

      try {
        const info = JSON.parse(stdout);
        resolve(info);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}

module.exports = { extractAudio, getMediaInfo, TEMP_DIR };
