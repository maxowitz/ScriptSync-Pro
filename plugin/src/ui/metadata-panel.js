/**
 * ScriptSync Pro - Metadata Panel
 * Shows selected clip info, transcript, mapping details.
 */

const MetadataPanel = (() => {
  let _selectedClip = null;
  let _transcriptWords = [];
  let _mapping = null;

  function getRoot() {
    return document.getElementById('metadata-panel-root');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="panel-section" style="margin-top:16px;">
        <div class="panel-section-header">
          <span class="panel-section-title">Clip Metadata</span>
        </div>
        <div id="metadata-content">
          <div class="empty-state" style="padding:16px;">
            <div class="empty-state-text">Select a clip to view details</div>
          </div>
        </div>
      </div>
    `;

    // Listen for clip selection events
    document.addEventListener('clip:selected', (e) => {
      setSelectedClip(e.detail);
    });

    document.addEventListener('screenplay:lineSelected', (e) => {
      if (e.detail.mapping) {
        setMapping(e.detail.mapping);
      }
    });
  }

  function setSelectedClip(clip) {
    _selectedClip = clip;

    // Load transcription if available
    if (clip && clip.id) {
      const transcription = DataStore.getTranscription(clip.id);
      if (transcription) {
        _transcriptWords = TranscriptionParser.parseWhisperJSON(transcription);
      } else {
        _transcriptWords = [];
      }
    }

    // Load mapping if available
    const project = TokenStore.getSelectedProject();
    if (project && clip) {
      const mappings = DataStore.getMappings(project.id || project._id);
      _mapping = mappings.find(m => m.clipId === clip.id) || null;
    }

    renderContent();
  }

  function setMapping(mapping) {
    _mapping = mapping;
    renderContent();
  }

  function renderContent() {
    const container = document.getElementById('metadata-content');
    if (!container) return;

    if (!_selectedClip) {
      container.innerHTML = `
        <div class="empty-state" style="padding:16px;">
          <div class="empty-state-text">Select a clip to view details</div>
        </div>`;
      return;
    }

    const clip = _selectedClip;
    const parsed = ClipNameParser.parse(clip.name || '');

    let html = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${escapeHtml(clip.name)}</span>
        </div>
        <div class="card-body">
          <table class="data-table">
            <tbody>
              <tr><td style="width:100px; color:var(--text-secondary)">Shot Info</td><td>${escapeHtml(ClipNameParser.formatInfo(parsed))}</td></tr>
              <tr><td style="color:var(--text-secondary)">Duration</td><td class="mono">${clip.duration ? TimecodeUtils.secondsToTimecode(clip.duration, 24) : 'N/A'}</td></tr>
              <tr><td style="color:var(--text-secondary)">Source</td><td style="font-size:10px; word-break:break-all;">${escapeHtml(clip.filePath || 'Unknown')}</td></tr>
              <tr><td style="color:var(--text-secondary)">Pattern</td><td>${escapeHtml(parsed.patternName)}</td></tr>
              ${clip.scene != null ? `<tr><td style="color:var(--text-secondary)">Scene</td><td>${clip.scene}</td></tr>` : ''}
              ${clip.camera ? `<tr><td style="color:var(--text-secondary)">Camera</td><td>${escapeHtml(clip.camera)}</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Mapping info
    if (_mapping) {
      const confidenceClass = _mapping.confidence >= 0.8 ? 'confidence-high' :
                              _mapping.confidence >= 0.6 ? 'confidence-medium' : 'confidence-low';

      html += `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Mapping</span>
            <span class="match-method-badge ${_mapping.method || 'fuzzy'}">${_mapping.method || 'unknown'}</span>
          </div>
          <div class="card-body">
            <div style="margin-bottom:6px;">
              <span style="color:var(--text-secondary);">Dialogue:</span>
              <span>${escapeHtml(_mapping.dialogueText || '')}</span>
            </div>
            <div style="margin-bottom:6px;">
              <span style="color:var(--text-secondary);">Transcript:</span>
              <span>${escapeHtml(_mapping.transcriptText || '')}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:var(--text-secondary);">Confidence:</span>
              <div class="confidence-bar">
                <div class="confidence-fill ${confidenceClass}">
                  <div class="fill" style="width:${Math.round((_mapping.confidence || 0) * 100)}%"></div>
                </div>
                <span style="font-size:10px;">${Math.round((_mapping.confidence || 0) * 100)}%</span>
              </div>
            </div>
            ${_mapping.timecodeIn != null ? `
              <div style="margin-top:4px;">
                <span style="color:var(--text-secondary);">Timecode:</span>
                <span class="mono">${TranscriptionParser.formatTimestamp(_mapping.timecodeIn)} - ${TranscriptionParser.formatTimestamp(_mapping.timecodeOut)}</span>
              </div>
            ` : ''}
            ${_mapping.reasoning ? `
              <div style="margin-top:4px;">
                <span style="color:var(--text-secondary);">Reasoning:</span>
                <span style="font-size:10px; font-style:italic;">${escapeHtml(_mapping.reasoning)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Transcript
    if (_transcriptWords.length > 0) {
      html += `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Transcript</span>
            <span style="font-size:10px; color:var(--text-muted);">${_transcriptWords.length} words</span>
          </div>
          <div class="card-body transcript-container" style="max-height:200px; overflow-y:auto;">
            ${renderTranscript()}
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Transcript</span>
          </div>
          <div class="card-body" style="color:var(--text-muted);">
            No transcription available.
            <button class="btn btn-sm btn-primary" id="btn-transcribe-clip" style="margin-top:8px;">Transcribe</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // Bind transcribe button if present
    const transcribeBtn = document.getElementById('btn-transcribe-clip');
    if (transcribeBtn) {
      transcribeBtn.addEventListener('click', handleTranscribe);
    }

    // Bind transcript word clicks
    container.querySelectorAll('.transcript-word').forEach(el => {
      el.addEventListener('click', () => {
        const time = parseFloat(el.dataset.start);
        if (!isNaN(time)) {
          document.dispatchEvent(new CustomEvent('playback:jumpTo', { detail: { seconds: time } }));
        }
      });
    });
  }

  function renderTranscript() {
    let html = '';
    let lastTimestamp = -10;

    for (const word of _transcriptWords) {
      // Show timestamp every ~5 seconds
      if (word.start - lastTimestamp >= 5) {
        html += `<span class="transcript-timestamp">[${TranscriptionParser.formatTimestamp(word.start).substring(3, 8)}]</span>`;
        lastTimestamp = word.start;
      }

      const isHighlighted = _mapping &&
        word.start >= (_mapping.timecodeIn || 0) &&
        word.end <= (_mapping.timecodeOut || 0);

      html += `<span class="transcript-word ${isHighlighted ? 'highlight' : ''}" data-start="${word.start}" data-end="${word.end}">${escapeHtml(word.text)} </span>`;
    }

    return html;
  }

  async function handleTranscribe() {
    if (!_selectedClip || !_selectedClip.filePath) {
      showToast('No clip file path available', 'warning');
      return;
    }

    try {
      setStatus('Transcribing clip...');
      const words = await TranscriptionEngine.transcribeAndParse(
        _selectedClip.filePath,
        {},
        (progress) => setStatus(`Transcribing: ${Math.round(progress * 100)}%`)
      );

      _transcriptWords = words;
      DataStore.setTranscription(_selectedClip.id, words);
      renderContent();
      setStatus('Transcription complete');
      showToast('Transcription complete', 'success');
    } catch (e) {
      console.error('[MetadataPanel] Transcription error:', e);
      showToast('Transcription failed: ' + e.message, 'error');
      setStatus('Ready');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    render,
    setSelectedClip,
    setMapping,
    getSelectedClip() { return _selectedClip; }
  };
})();
