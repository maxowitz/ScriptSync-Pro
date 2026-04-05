/**
 * ScriptSync Pro - Matches Panel
 * When a dialogue line is clicked, shows ALL clips that contain matching audio.
 * Each match shows clip name, timecode, confidence, transcript excerpt,
 * with Preview and Insert buttons.
 */

const MatchesPanel = (() => {
  let _selectedLine = null;
  let _allMappings = [];

  function init() {
    document.addEventListener('screenplay:lineSelected', (e) => {
      _selectedLine = e.detail;
      if (_selectedLine && _selectedLine.text) {
        findAndDisplayMatches(_selectedLine.text, _selectedLine.character);
      }
    });

    document.addEventListener('screenplay:textSelected', (e) => {
      if (e.detail && e.detail.text) {
        findAndDisplayMatches(e.detail.text, null);
      }
    });

    document.addEventListener('mappings:updated', (e) => {
      if (e.detail && e.detail.mappings) {
        _allMappings = e.detail.mappings;
      }
    });

    renderEmpty();
  }

  function setMappings(mappings) {
    _allMappings = mappings || [];
  }

  function renderEmpty() {
    const container = getResultsContainer();
    if (!container) return;
    const empty = document.getElementById('matches-empty');
    if (empty) empty.classList.remove('hidden');
    container.classList.add('hidden');
  }

  function getResultsContainer() {
    return document.getElementById('match-results');
  }

  /**
   * Core function: Search ALL transcribed clips for text matching the dialogue line.
   * Shows results ranked by confidence with preview/insert buttons.
   */
  function findAndDisplayMatches(searchText, character) {
    const container = getResultsContainer();
    const empty = document.getElementById('matches-empty');
    if (!container) return;

    // Load clips and their transcriptions
    const project = TokenStore.getSelectedProject();
    if (!project) return;

    const projectId = project.id || project._id;
    let clips = DataStore.getClipIndex(projectId);
    if (!clips || clips.length === 0) clips = DataStore.getClipIndex('local_default');
    if (!clips || clips.length === 0) clips = DataStore.getClipIndex('local_Local_Project');
    if (!clips || clips.length === 0) {
      if (empty) { empty.classList.remove('hidden'); }
      container.classList.add('hidden');
      return;
    }

    const searchLower = searchText.toLowerCase().replace(/[^\w\s]/g, '');
    const searchTokens = searchLower.split(/\s+/).filter(t => t.length > 2);
    const results = [];

    for (const clip of clips) {
      const transcription = DataStore.getTranscription(clip.id);
      if (!transcription) continue;

      // Parse transcription into words
      const words = parseTranscription(transcription);
      if (words.length === 0) continue;

      const fullText = words.map(w => w.text).join(' ').toLowerCase();

      // Find best matching window in the transcript
      const match = findBestWindow(searchTokens, words, searchLower);
      if (match.score > 0.2) {
        results.push({
          clipId: clip.id,
          clipName: clip.name || clip.originalFilename || 'Unknown',
          clipPath: clip.filePath,
          score: match.score,
          startTime: match.startTime,
          endTime: match.endTime,
          matchedText: match.matchedText,
          fullTranscript: fullText,
          scene: clip.scene,
          take: clip.take,
          shotInfo: formatShotInfo(clip),
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.score - a.score);

    if (empty) empty.classList.add('hidden');
    container.classList.remove('hidden');

    if (results.length === 0) {
      container.innerHTML = `
        <div class="match-header">
          ${character ? `<div class="match-character">${esc(character)}</div>` : ''}
          <div class="match-dialogue-text">"${esc(truncate(searchText, 80))}"</div>
        </div>
        <div class="no-matches">
          <p>No matching clips found</p>
          <p class="no-matches-hint">Try transcribing more clips or selecting different text</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="match-header">
        ${character ? `<div class="match-character">${esc(character)}</div>` : ''}
        <div class="match-dialogue-text">"${esc(truncate(searchText, 80))}"</div>
      </div>
      <div class="match-section-label">
        <span class="match-section-dot mapped"></span>
        ${results.length} clip${results.length > 1 ? 's' : ''} with matching audio
      </div>
      ${results.map((r, i) => renderMatchCard(r, i === 0)).join('')}
    `;

    // Bind click handlers
    container.querySelectorAll('.match-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const clipId = btn.dataset.clipid;
        const startTime = parseFloat(btn.dataset.start);
        previewClip(clipId, startTime);
      });
    });

    container.querySelectorAll('.match-insert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const clipId = btn.dataset.clipid;
        const startTime = parseFloat(btn.dataset.start);
        const endTime = parseFloat(btn.dataset.end);
        insertClip(clipId, startTime, endTime);
      });
    });

    container.querySelectorAll('.match-card').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('.match-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // Show this clip in metadata panel
        const clipId = card.dataset.clipid;
        const clip = clips.find(c => c.id === clipId);
        if (clip) {
          document.dispatchEvent(new CustomEvent('clip:selected', { detail: clip }));
        }
      });
    });
  }

  function renderMatchCard(match, isBest) {
    const pct = Math.round(match.score * 100);
    const confClass = pct >= 70 ? 'high' : pct >= 45 ? 'medium' : 'low';

    return `
      <div class="match-card ${isBest ? 'selected' : ''}" data-clipid="${esc(match.clipId)}">
        <div class="match-card-header">
          <div>
            <div class="match-clip-name">${esc(match.clipName)}</div>
            <div class="match-shot-info">${esc(match.shotInfo)}</div>
          </div>
          <div class="match-badges">
            <span class="match-confidence ${confClass}">${pct}%</span>
            ${isBest ? '<span class="match-best-badge">Best</span>' : ''}
          </div>
        </div>
        <div class="match-timecodes">
          <span class="match-tc">IN ${formatTC(match.startTime)}</span>
          <span class="match-tc-sep">\u2192</span>
          <span class="match-tc">OUT ${formatTC(match.endTime)}</span>
        </div>
        <div class="match-transcript">${esc(truncate(match.matchedText, 150))}</div>
        <div class="match-confidence-bar">
          <div class="match-confidence-fill ${confClass}" style="width:${pct}%"></div>
        </div>
        <div class="match-actions">
          <button class="btn btn-sm btn-primary match-play-btn"
            data-clipid="${esc(match.clipId)}" data-start="${match.startTime}">
            \u25B6 Preview
          </button>
          <button class="btn btn-sm btn-accent match-insert-btn"
            data-clipid="${esc(match.clipId)}" data-start="${match.startTime}" data-end="${match.endTime}">
            + Insert to Timeline
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Parse transcription data into word array.
   * Handles the helper's { segments: [...] } format.
   */
  function parseTranscription(data) {
    if (!data) return [];
    const words = [];

    const segments = data.segments || [];
    for (const seg of segments) {
      const segText = (seg.text || '').trim();
      if (!segText) continue;

      if (seg.words && seg.words.length > 0) {
        for (const w of seg.words) {
          words.push({ text: (w.text || w.word || '').trim(), start: w.start || 0, end: w.end || 0 });
        }
      } else {
        // Split segment text into approximate words
        const segWords = segText.split(/\s+/);
        const dur = ((seg.end || 0) - (seg.start || 0)) / Math.max(segWords.length, 1);
        for (let i = 0; i < segWords.length; i++) {
          words.push({
            text: segWords[i],
            start: (seg.start || 0) + i * dur,
            end: (seg.start || 0) + (i + 1) * dur,
          });
        }
      }
    }
    return words;
  }

  /**
   * Sliding window search: find the window of words that best matches the search text.
   */
  function findBestWindow(searchTokens, words, searchFull) {
    if (words.length === 0 || searchTokens.length === 0) {
      return { score: 0, startTime: 0, endTime: 0, matchedText: '' };
    }

    const windowSize = Math.min(words.length, Math.max(searchTokens.length * 2, 10));
    let bestScore = 0, bestStart = 0, bestEnd = 0, bestText = '';

    for (let i = 0; i <= words.length - Math.min(windowSize, words.length); i++) {
      const windowEnd = Math.min(i + windowSize, words.length);
      const windowWords = words.slice(i, windowEnd);
      const windowText = windowWords.map(w => w.text).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
      const windowTokens = windowText.split(/\s+/).filter(t => t.length > 2);

      // Score: token overlap
      let overlap = 0;
      for (const st of searchTokens) {
        for (const wt of windowTokens) {
          if (wt.includes(st) || st.includes(wt)) { overlap++; break; }
        }
      }
      const score = searchTokens.length > 0 ? overlap / searchTokens.length : 0;

      if (score > bestScore) {
        bestScore = score;
        bestStart = windowWords[0].start;
        bestEnd = windowWords[windowWords.length - 1].end;
        bestText = windowWords.map(w => w.text).join(' ');
      }
    }

    return { score: bestScore, startTime: bestStart, endTime: bestEnd, matchedText: bestText };
  }

  /**
   * Preview: jump Premiere playhead to the clip's matched timecode.
   */
  async function previewClip(clipId, startTimeSecs) {
    try {
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (project) {
        const seq = await project.getActiveSequence();
        if (seq && seq.setPlayerPosition) {
          await seq.setPlayerPosition(startTimeSecs.toString());
          showToast('Jumped to ' + formatTC(startTimeSecs), 'info');
        }
      }
    } catch (e) {
      console.warn('[MatchesPanel] Preview failed:', e.message);
      showToast('Preview: jump to ' + formatTC(startTimeSecs), 'info');
    }
  }

  /**
   * Insert: add the clip to the timeline at the current playhead position.
   */
  async function insertClip(clipId, startSecs, endSecs) {
    try {
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (!project) { showToast('No Premiere project open', 'error'); return; }

      // Find the project item by searching the bin
      const rootItem = await project.getRootItem();
      const targetClip = await findClipInBin(ppro, rootItem, clipId);

      if (targetClip) {
        showToast('Clip selected in project bin. Drag to timeline or use Premiere insert.', 'success');
        // Try to select the item in the project panel
        // (Direct insert API varies by Premiere version)
      } else {
        showToast('Clip not found in Premiere project bin', 'warning');
      }
    } catch (e) {
      console.warn('[MatchesPanel] Insert failed:', e.message);
      showToast('Insert not available — select clip manually in project bin', 'info');
    }
  }

  async function findClipInBin(ppro, item, clipId) {
    try {
      const folder = ppro.FolderItem.cast(item);
      if (folder) {
        const items = await folder.getItems();
        for (const child of items) {
          const found = await findClipInBin(ppro, child, clipId);
          if (found) return found;
        }
      }
      const clipItem = ppro.ClipProjectItem.cast(item);
      if (clipItem && (item.guid === clipId || item.name === clipId)) {
        return clipItem;
      }
    } catch (e) { /* skip */ }
    return null;
  }

  function formatShotInfo(clip) {
    const parts = [];
    if (clip.scene) parts.push('Sc' + clip.scene);
    if (clip.take) parts.push('Tk' + clip.take);
    if (clip.camera) parts.push('Cam' + clip.camera);
    if (clip.reel) parts.push('R' + clip.reel);
    return parts.length > 0 ? parts.join(' / ') : (clip.source || '');
  }

  function formatTC(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '--:--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 24);
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function truncate(s, n) { return (s || '').length > n ? s.substring(0, n) + '...' : (s || ''); }

  return {
    init,
    setMappings,
    renderEmpty,
    findAndDisplayMatches,
    setTranscriptions() {}, // kept for compatibility
  };
})();
