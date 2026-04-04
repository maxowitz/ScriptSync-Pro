/**
 * ScriptSync Pro - Fuzzy Text Alignment
 * Matches script dialogue lines to transcribed audio segments.
 */

const TextAligner = (() => {

  /**
   * Normalize text for comparison: lowercase, strip punctuation, normalize whitespace.
   */
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/['']/g, "'")       // Normalize smart quotes
      .replace(/[""]/g, '"')
      .replace(/[^\w\s']/g, ' ')   // Strip punctuation except apostrophe
      .replace(/\s+/g, ' ')         // Normalize whitespace
      .trim();
  }

  /**
   * Standard Levenshtein edit distance between two strings.
   */
  function levenshteinDistance(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);

    const m = a.length;
    const n = b.length;

    // Use single-row optimization for memory
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1];
        } else {
          curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  /**
   * Smith-Waterman local sequence alignment.
   * Finds the best local alignment (substring match) between script and transcript.
   * Returns { score, scriptStart, scriptEnd, transcriptStart, transcriptEnd, alignedScript, alignedTranscript }
   */
  function smithWaterman(scriptTokens, transcriptTokens, matchScore = 2, mismatchPenalty = -1, gapPenalty = -1) {
    const m = scriptTokens.length;
    const n = transcriptTokens.length;

    // DP matrix
    const H = [];
    for (let i = 0; i <= m; i++) {
      H[i] = new Array(n + 1).fill(0);
    }

    let maxScore = 0;
    let maxI = 0;
    let maxJ = 0;

    // Fill matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const isMatch = scriptTokens[i - 1] === transcriptTokens[j - 1];
        const diag = H[i - 1][j - 1] + (isMatch ? matchScore : mismatchPenalty);
        const up = H[i - 1][j] + gapPenalty;
        const left = H[i][j - 1] + gapPenalty;

        H[i][j] = Math.max(0, diag, up, left);

        if (H[i][j] > maxScore) {
          maxScore = H[i][j];
          maxI = i;
          maxJ = j;
        }
      }
    }

    // Traceback
    let i = maxI;
    let j = maxJ;
    let scriptEnd = i - 1;
    let transcriptEnd = j - 1;

    while (i > 0 && j > 0 && H[i][j] > 0) {
      const isMatch = scriptTokens[i - 1] === transcriptTokens[j - 1];
      const diag = H[i - 1][j - 1] + (isMatch ? matchScore : mismatchPenalty);

      if (H[i][j] === diag) {
        i--; j--;
      } else if (H[i][j] === H[i - 1][j] + gapPenalty) {
        i--;
      } else {
        j--;
      }
    }

    return {
      score: maxScore,
      maxPossibleScore: Math.min(m, n) * matchScore,
      scriptStart: i,
      scriptEnd: scriptEnd,
      transcriptStart: j,
      transcriptEnd: transcriptEnd
    };
  }

  /**
   * Calculate similarity ratio between two strings (0-1).
   */
  function similarityRatio(a, b) {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (!na && !nb) return 1;
    if (!na || !nb) return 0;

    const distance = levenshteinDistance(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    return 1 - distance / maxLen;
  }

  /**
   * Token-level similarity using Smith-Waterman alignment.
   */
  function tokenSimilarity(scriptText, transcriptText) {
    const scriptTokens = normalizeText(scriptText).split(/\s+/).filter(Boolean);
    const transcriptTokens = normalizeText(transcriptText).split(/\s+/).filter(Boolean);

    if (scriptTokens.length === 0 || transcriptTokens.length === 0) return 0;

    const result = smithWaterman(scriptTokens, transcriptTokens);
    return result.maxPossibleScore > 0 ? result.score / result.maxPossibleScore : 0;
  }

  /**
   * Find the best matching segment for a dialogue line.
   * @param {string} dialogueText - Script dialogue text
   * @param {Array} segments - Transcript segments [{text, start, end, words}]
   * @param {object} options - { threshold, maxResults }
   * @returns {Array<{segmentIndex, confidence, start, end, text, method}>}
   */
  function findBestMatch(dialogueText, segments, options = {}) {
    const threshold = options.threshold || 0.6;
    const maxResults = options.maxResults || 5;

    if (!dialogueText || !segments || segments.length === 0) {
      return [];
    }

    const results = [];

    for (let idx = 0; idx < segments.length; idx++) {
      const seg = segments[idx];

      // Character-level similarity
      const charSim = similarityRatio(dialogueText, seg.text);

      // Token-level similarity
      const tokenSim = tokenSimilarity(dialogueText, seg.text);

      // Combined score (weighted)
      const confidence = charSim * 0.4 + tokenSim * 0.6;

      if (confidence >= threshold) {
        results.push({
          segmentIndex: idx,
          confidence: Math.round(confidence * 1000) / 1000,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          method: 'fuzzy',
          charSimilarity: charSim,
          tokenSimilarity: tokenSim
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results.slice(0, maxResults);
  }

  /**
   * Auto-align all dialogue lines to segments.
   * Uses greedy best-match with conflict resolution.
   */
  function autoAlign(dialogueLines, segments, threshold = 0.6) {
    const mappings = [];
    const usedSegments = new Set();

    // Sort dialogue lines to process in order (by scene, then position)
    const sortedLines = [...dialogueLines].sort((a, b) => {
      if (a.sceneNumber !== b.sceneNumber) return a.sceneNumber - b.sceneNumber;
      return 0;
    });

    for (const line of sortedLines) {
      const matches = findBestMatch(line.text, segments, { threshold });

      // Find best unused segment
      const bestMatch = matches.find(m => !usedSegments.has(m.segmentIndex));

      if (bestMatch) {
        usedSegments.add(bestMatch.segmentIndex);
        mappings.push({
          dialogueLineId: line.id,
          segmentIndex: bestMatch.segmentIndex,
          confidence: bestMatch.confidence,
          timecodeIn: bestMatch.start,
          timecodeOut: bestMatch.end,
          method: 'fuzzy-auto',
          character: line.character,
          dialogueText: line.text,
          transcriptText: bestMatch.text
        });
      }
    }

    return mappings;
  }

  return {
    normalizeText,
    levenshteinDistance,
    smithWaterman,
    similarityRatio,
    tokenSimilarity,
    findBestMatch,
    autoAlign
  };
})();
