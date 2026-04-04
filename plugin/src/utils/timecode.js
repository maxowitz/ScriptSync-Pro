/**
 * ScriptSync Pro - Timecode Utilities
 * Convert between seconds, frames, and SMPTE timecodes.
 */

const TimecodeUtils = (() => {

  /**
   * Convert seconds to SMPTE timecode string.
   * @param {number} seconds
   * @param {number} fps - Frames per second (default 24)
   * @returns {string} "HH:MM:SS:FF"
   */
  function secondsToTimecode(seconds, fps = 24) {
    if (seconds == null || isNaN(seconds) || seconds < 0) {
      return '00:00:00:00';
    }

    const totalFrames = Math.round(seconds * fps);
    return framesToTimecode(totalFrames, fps);
  }

  /**
   * Convert SMPTE timecode string to seconds.
   * @param {string} tc - "HH:MM:SS:FF" or "HH:MM:SS;FF" (drop-frame)
   * @param {number} fps
   * @returns {number} seconds
   */
  function timecodeToSeconds(tc, fps = 24) {
    if (!tc) return 0;

    const parts = tc.split(/[:;]/);
    if (parts.length < 4) {
      // Try "HH:MM:SS.mmm" format
      const dotParts = tc.split(/[:.]/);
      if (dotParts.length >= 3) {
        const h = parseInt(dotParts[0], 10) || 0;
        const m = parseInt(dotParts[1], 10) || 0;
        const s = parseInt(dotParts[2], 10) || 0;
        const ms = dotParts[3] ? parseInt(dotParts[3].padEnd(3, '0'), 10) : 0;
        return h * 3600 + m * 60 + s + ms / 1000;
      }
      return 0;
    }

    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    const f = parseInt(parts[3], 10) || 0;

    return h * 3600 + m * 60 + s + f / fps;
  }

  /**
   * Convert SMPTE timecode to total frame count.
   * @param {string} tc - "HH:MM:SS:FF"
   * @param {number} fps
   * @returns {number} frame count
   */
  function timecodeToFrames(tc, fps = 24) {
    const seconds = timecodeToSeconds(tc, fps);
    return Math.round(seconds * fps);
  }

  /**
   * Convert frame count to SMPTE timecode.
   * @param {number} frames - Total frame count
   * @param {number} fps
   * @returns {string} "HH:MM:SS:FF"
   */
  function framesToTimecode(frames, fps = 24) {
    if (frames < 0) frames = 0;

    const roundedFps = Math.round(fps);
    const f = frames % roundedFps;
    const totalSeconds = Math.floor(frames / roundedFps);
    const s = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);

    return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(f)}`;
  }

  /**
   * Add two timecodes.
   * @param {string} tc1
   * @param {string} tc2
   * @param {number} fps
   * @returns {string} Sum timecode
   */
  function addTimecodes(tc1, tc2, fps = 24) {
    const frames1 = timecodeToFrames(tc1, fps);
    const frames2 = timecodeToFrames(tc2, fps);
    return framesToTimecode(frames1 + frames2, fps);
  }

  /**
   * Subtract two timecodes (tc1 - tc2).
   * @param {string} tc1
   * @param {string} tc2
   * @param {number} fps
   * @returns {string} Difference timecode
   */
  function subtractTimecodes(tc1, tc2, fps = 24) {
    const frames1 = timecodeToFrames(tc1, fps);
    const frames2 = timecodeToFrames(tc2, fps);
    return framesToTimecode(Math.max(0, frames1 - frames2), fps);
  }

  /**
   * Format seconds to human-readable duration (e.g., "1m 23s").
   * @param {number} seconds
   * @returns {string}
   */
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0s';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);

    return parts.join(' ');
  }

  /**
   * Check if a string is a valid timecode.
   * @param {string} tc
   * @returns {boolean}
   */
  function isValidTimecode(tc) {
    if (!tc || typeof tc !== 'string') return false;
    return /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/.test(tc);
  }

  /**
   * Compare two timecodes. Returns negative if tc1 < tc2, 0 if equal, positive if tc1 > tc2.
   * @param {string} tc1
   * @param {string} tc2
   * @param {number} fps
   * @returns {number}
   */
  function compareTimecodes(tc1, tc2, fps = 24) {
    return timecodeToFrames(tc1, fps) - timecodeToFrames(tc2, fps);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  return {
    secondsToTimecode,
    timecodeToSeconds,
    timecodeToFrames,
    framesToTimecode,
    addTimecodes,
    subtractTimecodes,
    formatDuration,
    isValidTimecode,
    compareTimecodes
  };
})();
