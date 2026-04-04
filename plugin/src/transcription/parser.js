/**
 * ScriptSync Pro - Transcription Parser
 * Parse Whisper output into usable format with word-level timestamps.
 */

const TranscriptionParser = (() => {

  /**
   * Parse Whisper JSON output into word entries.
   * Supports both word-level and segment-level Whisper output formats.
   * @param {object} jsonData - Raw Whisper output
   * @returns {Array<{text, start, end}>} - Word entries
   */
  function parseWhisperJSON(jsonData) {
    if (!jsonData) return [];

    const words = [];

    // Format 1: Word-level timestamps (whisper with --word_timestamps)
    if (jsonData.words && Array.isArray(jsonData.words)) {
      for (const w of jsonData.words) {
        words.push({
          text: (w.word || w.text || '').trim(),
          start: w.start || 0,
          end: w.end || 0,
          confidence: w.probability || w.confidence || 0
        });
      }
      return words;
    }

    // Format 2: Segments with word-level info
    if (jsonData.segments && Array.isArray(jsonData.segments)) {
      for (const seg of jsonData.segments) {
        if (seg.words && Array.isArray(seg.words)) {
          // Segment has word-level detail
          for (const w of seg.words) {
            words.push({
              text: (w.word || w.text || '').trim(),
              start: w.start || 0,
              end: w.end || 0,
              confidence: w.probability || w.confidence || 0
            });
          }
        } else {
          // Segment-level only: split text into approximate word entries
          const segText = (seg.text || '').trim();
          if (!segText) continue;

          const segWords = segText.split(/\s+/);
          const segDuration = (seg.end || 0) - (seg.start || 0);
          const wordDuration = segWords.length > 0 ? segDuration / segWords.length : 0;

          for (let i = 0; i < segWords.length; i++) {
            words.push({
              text: segWords[i],
              start: (seg.start || 0) + i * wordDuration,
              end: (seg.start || 0) + (i + 1) * wordDuration,
              confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.5
            });
          }
        }
      }
      return words;
    }

    // Format 3: Simple text with timestamps (SRT-like)
    if (jsonData.text && typeof jsonData.text === 'string') {
      words.push({
        text: jsonData.text.trim(),
        start: jsonData.start || 0,
        end: jsonData.end || 0,
        confidence: 0.5
      });
      return words;
    }

    console.warn('[TranscriptionParser] Unrecognized format:', Object.keys(jsonData));
    return words;
  }

  /**
   * Group words into speech segments based on silence gaps.
   * @param {Array} words - Word entries from parseWhisperJSON
   * @param {number} gapThreshold - Minimum gap in seconds to split segments (default 1.0)
   * @returns {Array<{text, start, end, words}>}
   */
  function groupIntoSegments(words, gapThreshold = 1.0) {
    if (!words || words.length === 0) return [];

    const segments = [];
    let currentSegment = {
      words: [words[0]],
      start: words[0].start,
      end: words[0].end
    };

    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start - words[i - 1].end;

      if (gap >= gapThreshold) {
        // Close current segment
        currentSegment.text = currentSegment.words.map(w => w.text).join(' ');
        currentSegment.end = words[i - 1].end;
        segments.push({ ...currentSegment });

        // Start new segment
        currentSegment = {
          words: [words[i]],
          start: words[i].start,
          end: words[i].end
        };
      } else {
        currentSegment.words.push(words[i]);
        currentSegment.end = words[i].end;
      }
    }

    // Close final segment
    if (currentSegment.words.length > 0) {
      currentSegment.text = currentSegment.words.map(w => w.text).join(' ');
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Format seconds to timecode string.
   * @param {number} seconds
   * @returns {string} "HH:MM:SS.mmm"
   */
  function formatTimestamp(seconds) {
    if (seconds == null || isNaN(seconds)) return '00:00:00.000';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);

    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  /**
   * Get all text within a time range.
   * @param {Array} words - Word entries
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @returns {string}
   */
  function getTextInRange(words, startTime, endTime) {
    return words
      .filter(w => w.start >= startTime && w.end <= endTime)
      .map(w => w.text)
      .join(' ');
  }

  /**
   * Find words matching a text query.
   * @param {Array} words - Word entries
   * @param {string} query - Text to search for
   * @returns {Array} - Matching word indices and ranges
   */
  function findTextOccurrences(words, query) {
    const normalizedQuery = query.toLowerCase().trim().split(/\s+/);
    const normalizedWords = words.map(w => w.text.toLowerCase().replace(/[^\w]/g, ''));
    const matches = [];

    for (let i = 0; i <= normalizedWords.length - normalizedQuery.length; i++) {
      let matched = true;
      for (let j = 0; j < normalizedQuery.length; j++) {
        if (normalizedWords[i + j] !== normalizedQuery[j].replace(/[^\w]/g, '')) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matches.push({
          startIndex: i,
          endIndex: i + normalizedQuery.length - 1,
          start: words[i].start,
          end: words[i + normalizedQuery.length - 1].end,
          text: words.slice(i, i + normalizedQuery.length).map(w => w.text).join(' ')
        });
      }
    }

    return matches;
  }

  /**
   * Get full transcript text.
   * @param {Array} words
   * @returns {string}
   */
  function getFullText(words) {
    return words.map(w => w.text).join(' ');
  }

  return {
    parseWhisperJSON,
    groupIntoSegments,
    formatTimestamp,
    getTextInRange,
    findTextOccurrences,
    getFullText
  };
})();
