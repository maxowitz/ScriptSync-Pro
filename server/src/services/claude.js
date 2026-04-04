const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // uses ANTHROPIC_API_KEY env var automatically

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep helper for retry back-off.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry logic and exponential back-off.
 */
async function withRetry(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.error(
        `${label} attempt ${attempt}/${MAX_RETRIES} failed:`,
        err.message
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

/**
 * Parse raw screenplay text into structured JSON using Claude.
 *
 * @param {string} rawText - Raw screenplay text (.fountain, .fdx extracted, etc.)
 * @returns {Promise<Object>} Parsed screenplay structure
 */
async function parseScreenplay(rawText) {
  return withRetry(async () => {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system:
        'You are a screenplay parser. Parse the following screenplay into structured JSON. ' +
        'Return ONLY valid JSON with no surrounding text. Use this exact schema:\n' +
        '{\n' +
        '  "title": "string",\n' +
        '  "scenes": [\n' +
        '    {\n' +
        '      "sceneNumber": number,\n' +
        '      "heading": "string",\n' +
        '      "elements": [\n' +
        '        {\n' +
        '          "type": "dialogue" | "action" | "transition" | "parenthetical",\n' +
        '          "character": "string or omit if not dialogue/parenthetical",\n' +
        '          "text": "string",\n' +
        '          "lineId": "unique string id"\n' +
        '        }\n' +
        '      ]\n' +
        '    }\n' +
        '  ]\n' +
        '}',
      messages: [
        {
          role: 'user',
          content: rawText,
        },
      ],
    });

    const responseText =
      message.content[0]?.type === 'text' ? message.content[0].text : '';

    // Strip any markdown code fences if present
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    return JSON.parse(cleaned);
  }, 'parseScreenplay');
}

/**
 * Match a dialogue line from the screenplay to transcript segments using Claude.
 *
 * @param {Object} dialogueLine - Dialogue element { character, text, lineId }
 * @param {Array<Object>} transcriptSegments - Array of { index, text, timecodeIn, timecodeOut }
 * @returns {Promise<Object>} Match result { matchedSegmentIndex, confidence, timecodeIn, timecodeOut, reasoning }
 */
async function matchDialogueToTranscript(dialogueLine, transcriptSegments) {
  return withRetry(async () => {
    const segmentsFormatted = transcriptSegments
      .map(
        (seg, i) =>
          `[${i}] (${seg.timecodeIn} - ${seg.timecodeOut}): "${seg.text}"`
      )
      .join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        'You are a dialogue matching assistant for film/TV post-production. ' +
        'Given a screenplay dialogue line and a list of transcript segments with timecodes, ' +
        'find the best matching transcript segment. ' +
        'Return ONLY valid JSON with no surrounding text, using this schema:\n' +
        '{\n' +
        '  "matchedSegmentIndex": number,\n' +
        '  "confidence": number between 0 and 1,\n' +
        '  "timecodeIn": "string",\n' +
        '  "timecodeOut": "string",\n' +
        '  "reasoning": "brief explanation"\n' +
        '}',
      messages: [
        {
          role: 'user',
          content:
            `Screenplay dialogue line:\n` +
            `Character: ${dialogueLine.character}\n` +
            `Text: "${dialogueLine.text}"\n` +
            `Line ID: ${dialogueLine.lineId}\n\n` +
            `Transcript segments:\n${segmentsFormatted}`,
        },
      ],
    });

    const responseText =
      message.content[0]?.type === 'text' ? message.content[0].text : '';

    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    return JSON.parse(cleaned);
  }, 'matchDialogueToTranscript');
}

module.exports = { parseScreenplay, matchDialogueToTranscript };
