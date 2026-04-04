/**
 * ScriptSync Pro - Claude AI Matching
 * Uses Anthropic Claude API for ambiguous dialogue-to-transcript matching.
 */

const ClaudeMatch = (() => {

  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-haiku-4-5-20251001';

  function getApiKey() {
    try {
      const settings = DataStore.getSettings();
      return settings.claudeApiKey || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Match a dialogue line against transcript segments using Claude.
   * @param {object} dialogueLine - { character, text, parenthetical }
   * @param {Array} segments - [{ text, start, end, index }]
   * @param {string} apiKey - Anthropic API key (optional, falls back to settings)
   * @returns {object} - { segmentIndex, confidence, timecodeIn, timecodeOut, reasoning }
   */
  async function matchWithClaude(dialogueLine, segments, apiKey = null) {
    const key = apiKey || getApiKey();
    if (!key) {
      throw new Error('Claude API key not configured. Set it in Settings.');
    }

    // Build the prompt with segment options
    const segmentList = segments.map((seg, i) => {
      return `[${i}] (${formatTime(seg.start)} - ${formatTime(seg.end)}): "${seg.text}"`;
    }).join('\n');

    const prompt = `You are an assistant that matches screenplay dialogue to audio transcripts.

DIALOGUE LINE:
Character: ${dialogueLine.character}
${dialogueLine.parenthetical ? `Parenthetical: (${dialogueLine.parenthetical})` : ''}
Text: "${dialogueLine.text}"

TRANSCRIPT SEGMENTS:
${segmentList}

Which transcript segment best matches this dialogue line? Consider:
1. Semantic similarity (same meaning even if words differ slightly)
2. Character speech patterns
3. Word-for-word closeness
4. Context from parenthetical direction

Respond with ONLY a JSON object (no markdown, no code fences):
{"segmentIndex": <number or null>, "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}

If no segment matches well, set segmentIndex to null and confidence to 0.`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Claude API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const responseText = data.content?.[0]?.text || '';

    // Parse JSON response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.error('[ClaudeMatch] Failed to parse response:', responseText);
      return {
        segmentIndex: null,
        confidence: 0,
        timecodeIn: null,
        timecodeOut: null,
        reasoning: 'Failed to parse Claude response'
      };
    }

    // Build final result
    const segIdx = result.segmentIndex;
    const matchedSegment = (segIdx != null && segIdx >= 0 && segIdx < segments.length)
      ? segments[segIdx]
      : null;

    return {
      segmentIndex: segIdx,
      confidence: Math.min(1, Math.max(0, result.confidence || 0)),
      timecodeIn: matchedSegment ? matchedSegment.start : null,
      timecodeOut: matchedSegment ? matchedSegment.end : null,
      reasoning: result.reasoning || '',
      method: 'claude'
    };
  }

  /**
   * Batch match multiple dialogue lines.
   * @param {Array} dialogueLines - Array of dialogue line objects
   * @param {Array} segments - Transcript segments
   * @param {object} options - { apiKey, onProgress, delayMs }
   * @returns {Array} - Array of match results
   */
  async function batchMatch(dialogueLines, segments, options = {}) {
    const apiKey = options.apiKey || getApiKey();
    const delayMs = options.delayMs || 500; // Rate limiting delay between calls
    const results = [];

    for (let i = 0; i < dialogueLines.length; i++) {
      try {
        const result = await matchWithClaude(dialogueLines[i], segments, apiKey);
        results.push({
          dialogueLineId: dialogueLines[i].id,
          ...result
        });
      } catch (err) {
        console.error(`[ClaudeMatch] Error matching line ${i}:`, err);
        results.push({
          dialogueLineId: dialogueLines[i].id,
          segmentIndex: null,
          confidence: 0,
          timecodeIn: null,
          timecodeOut: null,
          reasoning: `Error: ${err.message}`,
          method: 'claude-error'
        });
      }

      if (options.onProgress) {
        options.onProgress((i + 1) / dialogueLines.length);
      }

      // Rate limit delay (skip for last item)
      if (i < dialogueLines.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  function formatTime(seconds) {
    if (seconds == null) return '??:??';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Check if Claude API is accessible with the current key.
   */
  async function testApiKey(apiKey = null) {
    const key = apiKey || getApiKey();
    if (!key) return { valid: false, error: 'No API key' };

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      if (res.ok) {
        return { valid: true };
      } else if (res.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      } else {
        return { valid: false, error: `API error: ${res.status}` };
      }
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  return {
    matchWithClaude,
    batchMatch,
    testApiKey
  };
})();
