/**
 * ScriptSync Pro - Matches Panel
 * Shows matching clips when a dialogue line is selected in the screenplay.
 * Displays clip name, timecode, confidence, transcript excerpt with highlighted match.
 */

const MatchesPanel = (() => {
  let _selectedLine = null;
  let _allMappings = [];
  let _allTranscriptions = {};

  function init() {
    // Listen for dialogue line selection from screenplay panel
    document.addEventListener('screenplay:lineSelected', (e) => {
      _selectedLine = e.detail;
      // FIX: Load transcriptions from DataStore before rendering matches
      loadTranscriptionsFromStore();
      renderMatches();
    });

    // Listen for mapping updates
    document.addEventListener('mappings:updated', (e) => {
      if (e.detail && e.detail.mappings) {
        _allMappings = e.detail.mappings;
      }
      if (_selectedLine) renderMatches();
    });

    renderEmpty();
  }

  function setMappings(mappings) {
    _allMappings = mappings || [];
  }

  function setTranscriptions(transcriptions) {
    _allTranscriptions = transcriptions || {};
  }

  // FIX: Load all transcriptions from DataStore for matching
  function loadTranscriptionsFromStore() {
    _allTranscriptions = {};
    try {
      const project = TokenStore.getSelectedProject();
      if (!project) return;

      const projectId = project.id || project._id;
      let clips = DataStore.getClipIndex(projectId);
      // Also try fallback project IDs
      if (!clips || clips.length === 0) clips = DataStore.getClipIndex('local_default');
      if (!clips || clips.length === 0) clips = DataStore.getClipIndex('local_Local_Project');
      if (!clips) return;

      for (const clip of clips) {
        const transcription = DataStore.getTranscription(clip.id);
        if (transcription) {
          // Parse into word array
          const words = TranscriptionParser
            ? TranscriptionParser.parseWhisperJSON(transcription)
            : (transcription.segments || []).flatMap(s => {
                const segWords = (s.text || '').split(/\s+/);
                const dur = (s.end - s.start) / Math.max(segWords.length, 1);
                return segWords.map((w, i) => ({ text: w, start: s.start + i * dur, end: s.start + (i+1) * dur }));
              });
          _allTranscriptions[clip.id] = words;
        }
      }
      console.log('[MatchesPanel] Loaded transcriptions for', Object.keys(_allTranscriptions).length, 'clips');
    } catch (e) {
      console.error('[MatchesPanel] Error loading transcriptions:', e);
    }
  }

  function renderEmpty() {
    const container = document.getElementById('matches-panel-root');
    if (!container) return;

    const empty = document.getElementById('matches-empty');
    const results = document.getElementById('match-results');
    if (empty) empty.classList.remove('hidden');
    if (results) results.classList.add('hidden');
  }

  function renderMatches() {
    const container = document.getElementById('matches-panel-root');
    if (!container) return;

    const empty = document.getElementById('matches-empty');
    const results = document.getElementById('match-results');

    if (!_selectedLine) {
      if (empty) empty.classList.remove('hidden');
      if (results) results.classList.add('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    if (results) results.classList.remove('hidden');

    // Find mappings for this dialogue line
    const lineId = _selectedLine.lineId || _selectedLine.id;
    const matches = _allMappings.filter(m =>
      m.dialogueLineId === lineId || m.lineId === lineId
    );

    // Also find potential matches from transcriptions (unmapped but similar)
    const potentialMatches = findPotentialMatches(_selectedLine);

    results.innerHTML = `
      <div class="match-header">
        <div class="match-character">${escapeHtml(_selectedLine.character || 'Unknown')}</div>
        <div class="match-dialogue-text">"${escapeHtml(truncate(_selectedLine.text || _selectedLine.dialogue || '', 100))}"</div>
      </div>

      ${matches.length > 0 ? `
        <div class="match-section-label">
          <span class="match-section-dot mapped"></span>
          Matched Clips (${matches.length})
        </div>
        ${matches.map(m => renderMatchCard(m, true)).join('')}
      ` : ''}

      ${potentialMatches.length > 0 ? `
        <div class="match-section-label">
          <span class="match-section-dot potential"></span>
          Potential Matches (${potentialMatches.length})
        </div>
        ${potentialMatches.map(m => renderMatchCard(m, false)).join('')}
      ` : ''}

      ${matches.length === 0 && potentialMatches.length === 0 ? `
        <div class="no-matches">
          <div class="no-matches-icon">🔍</div>
          <p>No matches found for this line</p>
          <p class="no-matches-hint">Try running Auto-Match or transcribe more clips</p>
        </div>
      ` : ''}
    `;

    // Attach click handlers for play buttons
    results.querySelectorAll('.match-card').forEach(card => {
      card.addEventListener('click', () => {
        const tc = card.dataset.timecodein;
        if (tc) {
          jumpToTimecode(tc);
          // Highlight this card
          results.querySelectorAll('.match-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        }
      });
    });
  }

  function renderMatchCard(match, isConfirmed) {
    const confidence = match.confidence != null ? Math.round(match.confidence * 100) : null;
    const method = match.matchMethod || match.method || 'auto';
    const clipName = match.clipName || match.clip?.name || match.name || 'Unknown Clip';
    const tcIn = match.timecodeIn || match.start || '--:--:--:--';
    const tcOut = match.timecodeOut || match.end || '--:--:--:--';
    const transcript = match.transcriptText || match.text || '';

    const confidenceClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
    const methodLabel = method === 'CLAUDE' || method === 'claude' ? 'AI' :
                        method === 'MANUAL' || method === 'manual' ? 'Manual' : 'Auto';

    return `
      <div class="match-card ${isConfirmed ? 'confirmed' : 'potential'}"
           data-timecodein="${escapeHtml(tcIn)}"
           data-clipid="${escapeHtml(match.clipId || '')}">
        <div class="match-card-header">
          <div class="match-clip-name">${escapeHtml(clipName)}</div>
          <div class="match-badges">
            ${confidence != null ? `
              <span class="match-confidence ${confidenceClass}">${confidence}%</span>
            ` : ''}
            <span class="match-method">${methodLabel}</span>
          </div>
        </div>
        <div class="match-timecodes">
          <span class="match-tc">IN: ${escapeHtml(tcIn)}</span>
          <span class="match-tc-sep">→</span>
          <span class="match-tc">OUT: ${escapeHtml(tcOut)}</span>
        </div>
        ${transcript ? `
          <div class="match-transcript">${escapeHtml(truncate(transcript, 120))}</div>
        ` : ''}
        ${confidence != null ? `
          <div class="match-confidence-bar">
            <div class="match-confidence-fill ${confidenceClass}" style="width: ${confidence}%"></div>
          </div>
        ` : ''}
        <div class="match-actions">
          <button class="btn btn-sm btn-accent match-play-btn" title="Jump to timecode">▶ Play</button>
          ${!isConfirmed ? `
            <button class="btn btn-sm btn-secondary match-approve-btn" title="Approve match">✓ Approve</button>
          ` : `
            <span class="match-approved-badge">✓ Confirmed</span>
          `}
        </div>
      </div>
    `;
  }

  function findPotentialMatches(dialogueLine) {
    if (!dialogueLine || !dialogueLine.text) return [];

    const text = (dialogueLine.text || dialogueLine.dialogue || '').toLowerCase().trim();
    if (!text) return [];

    const potentials = [];

    // Search through all transcriptions
    for (const [clipId, words] of Object.entries(_allTranscriptions)) {
      if (!words || !words.length) continue;

      // Group words into segments
      const segments = TranscriptionParser
        ? TranscriptionParser.groupIntoSegments(words)
        : groupWordsSimple(words);

      for (const segment of segments) {
        const segText = segment.text || segment.words?.map(w => w.text).join(' ') || '';
        if (!segText) continue;

        // Simple similarity check
        const similarity = quickSimilarity(text, segText.toLowerCase());
        if (similarity > 0.3) {
          // Check if this isn't already a confirmed mapping
          const alreadyMapped = _allMappings.some(m =>
            m.clipId === clipId &&
            m.dialogueLineId === (dialogueLine.lineId || dialogueLine.id)
          );

          if (!alreadyMapped) {
            potentials.push({
              clipId,
              clipName: segment.clipName || `Clip ${clipId.slice(0, 8)}`,
              timecodeIn: formatTime(segment.start),
              timecodeOut: formatTime(segment.end),
              confidence: similarity,
              method: 'auto',
              transcriptText: segText,
            });
          }
        }
      }
    }

    // Sort by confidence descending, take top 5
    return potentials.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  function quickSimilarity(a, b) {
    // Token overlap similarity
    const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 2));
    const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let overlap = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) overlap++;
    }
    return overlap / Math.max(tokensA.size, tokensB.size);
  }

  function groupWordsSimple(words) {
    const segments = [];
    let current = { words: [], start: 0, end: 0, text: '' };

    for (const w of words) {
      if (current.words.length > 0 && w.start - current.end > 1.5) {
        current.text = current.words.map(x => x.text).join(' ');
        segments.push({ ...current });
        current = { words: [], start: w.start, end: w.end, text: '' };
      }
      current.words.push(w);
      if (current.words.length === 1) current.start = w.start;
      current.end = w.end;
    }

    if (current.words.length > 0) {
      current.text = current.words.map(x => x.text).join(' ');
      segments.push(current);
    }

    return segments;
  }

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '--:--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 24);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }

  async function jumpToTimecode(tc) {
    try {
      // FIX: Use correct async premierepro API
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (project) {
        const seq = await project.getActiveSequence();
        if (seq && seq.setPlayerPosition) {
          await seq.setPlayerPosition(tc);
        }
      }
    } catch (e) {
      console.warn('[MatchesPanel] Cannot jump to timecode:', e.message);
    }
    // Dispatch event for other panels
    document.dispatchEvent(new CustomEvent('playback:seek', { detail: { timecode: tc } }));
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str || '';
    return str.slice(0, len) + '...';
  }

  return {
    init,
    setMappings,
    setTranscriptions,
    renderMatches,
    renderEmpty,
  };
})();
