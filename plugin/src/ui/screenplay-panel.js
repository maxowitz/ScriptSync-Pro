/**
 * ScriptSync Pro - Screenplay Panel UI
 * Displays parsed screenplay with collapsible scenes and interactive dialogue lines.
 */

const ScreenplayPanel = (() => {
  let _screenplay = null;
  let _mappings = new Map(); // dialogueLineId -> mapping
  let _selectedLineId = null;
  let _collapsedScenes = new Set();
  let _contextMenu = null;

  function getRoot() {
    return document.getElementById('screenplay-panel-root');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Screenplay</span>
          <div class="toolbar">
            <button id="btn-upload-screenplay" class="btn btn-sm btn-primary">Upload</button>
            <button id="btn-clear-screenplay" class="btn btn-sm btn-danger" style="display:none">Clear</button>
            <button id="btn-load-cloud-screenplay" class="btn btn-sm btn-secondary">Load from Cloud</button>
            <div class="toolbar-spacer"></div>
            <button id="btn-auto-match-all" class="btn btn-sm btn-secondary" disabled>Auto-Match All</button>
          </div>
        </div>
        <div id="screenplay-content" class="screenplay-container">
          <div class="empty-state">
            <div class="empty-state-icon">📜</div>
            <div class="empty-state-text">No screenplay loaded</div>
            <div class="empty-state-hint">Upload a .fountain, .pdf, .fdx, or .txt file</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-upload-screenplay').addEventListener('click', handleUpload);
    document.getElementById('btn-clear-screenplay').addEventListener('click', handleClear);
    document.getElementById('btn-load-cloud-screenplay').addEventListener('click', handleLoadFromCloud);
    document.getElementById('btn-auto-match-all').addEventListener('click', handleAutoMatchAll);

    // Close context menu on click elsewhere
    document.addEventListener('click', closeContextMenu);
  }

  async function handleUpload() {
    try {
      const uxpStorage = require('uxp').storage;
      const fs = uxpStorage.localFileSystem;
      const file = await fs.getFileForOpening({
        types: ['fountain', 'txt', 'json', 'pdf', 'fdx']
      });

      if (!file) return;

      const ext = (file.name || '').split('.').pop().toLowerCase();
      const project = TokenStore.getSelectedProject();

      // For PDF and FDX files, upload to server for proper parsing
      // (UXP can't run pdf-parse or XML parsers locally)
      if (ext === 'pdf' || ext === 'fdx') {
        // FIX: Use whatever project is available — local or cloud
        const uploadProject = project || TokenStore.getSelectedProject();
        if (!uploadProject || !uploadProject.id) {
          showToast('No project context available. Try loading from cloud instead.', 'warning');
          return;
        }

        setStatus('Uploading screenplay to server for parsing...');
        showToast('Uploading ' + file.name + '...', 'info');

        // Read file as binary ArrayBuffer
        const arrayBuffer = await file.read({ format: uxpStorage.formats.binary });

        // Use raw binary upload endpoint (more reliable than FormData in UXP)
        // Server endpoint: POST /projects/:id/screenplay/raw
        // Sends raw binary body with X-Filename header
        const result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const projectId = uploadProject.id || uploadProject._id;
          const url = CloudAPI.getServerUrl() + `/projects/${projectId}/screenplay/raw`;
          xhr.open('POST', url);
          xhr.setRequestHeader('Authorization', `Bearer ${TokenStore.getAccessToken()}`);
          xhr.setRequestHeader('X-Filename', file.name);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText)); }
              catch (e) { resolve({}); }
            } else {
              reject(new Error(`Upload Error ${xhr.status}: ${xhr.responseText}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));

          xhr.send(arrayBuffer);
        });

        if (result && result.parsedJSON) {
          // FIX: Server returns {parsedJSON: {title, scenes}}, not {scenes} directly
          _screenplay = ScreenplayImporter.parseJSON(result.parsedJSON);
          DataStore.setScreenplay(uploadProject.id || uploadProject._id, _screenplay.toJSON());
          renderScreenplay();
          setStatus('Screenplay parsed: ' + (_screenplay.title || file.name));
          showToast('Screenplay loaded from ' + ext.toUpperCase(), 'success');
        } else if (result && result.id) {
          // Server saved the file but AI parsing failed — try loading from cloud
          showToast('File uploaded. AI parsing in progress, loading from cloud...', 'info');
          await handleLoadFromCloud();
        } else {
          showToast('Could not parse the file. Check that it contains selectable text.', 'error');
        }
        return;
      }

      // For Fountain, TXT, JSON — parse locally
      const text = await file.read({ format: uxpStorage.formats.utf8 });
      _screenplay = ScreenplayImporter.parse(text);

      if (project) {
        DataStore.setScreenplay(project.id || project._id, _screenplay.toJSON());
      }

      renderScreenplay();
      setStatus('Screenplay loaded: ' + (_screenplay.title || file.name));
      showToast('Screenplay loaded', 'success');
    } catch (e) {
      console.error('[ScreenplayPanel] Upload error:', e);
      showToast('Failed to load screenplay: ' + e.message, 'error');
    }
  }

  async function handleLoadFromCloud() {
    const project = TokenStore.getSelectedProject();
    if (!project) {
      showToast('Select a project first', 'warning');
      return;
    }

    try {
      setStatus('Loading screenplay from cloud...');
      const data = await CloudAPI.getScreenplay(project.id || project._id);
      // FIX: Server returns {parsedJSON: {title, scenes}}, extract the nested object
      const screenplayData = data.parsedJSON || data;
      _screenplay = ScreenplayImporter.parseJSON(screenplayData);
      DataStore.setScreenplay(project.id || project._id, _screenplay.toJSON());
      renderScreenplay();
      setStatus('Screenplay loaded from cloud');
    } catch (e) {
      console.error('[ScreenplayPanel] Cloud load error:', e);
      showToast('Failed to load screenplay from cloud: ' + e.message, 'error');
    }
  }

  // FIX: Clear/replace screenplay functionality
  function handleClear() {
    _screenplay = null;
    _mappings = new Map();
    _selectedLineId = null;

    const content = document.getElementById('screenplay-content');
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📜</div>
          <div class="empty-state-text">No screenplay loaded</div>
          <div class="empty-state-hint">Upload a .fountain, .pdf, .fdx, or .txt file</div>
        </div>`;
    }

    const clearBtn = document.getElementById('btn-clear-screenplay');
    if (clearBtn) clearBtn.style.display = 'none';

    const autoBtn = document.getElementById('btn-auto-match-all');
    if (autoBtn) autoBtn.disabled = true;

    // Reset matches panel
    document.dispatchEvent(new CustomEvent('screenplay:cleared'));
    if (typeof MatchesPanel !== 'undefined') MatchesPanel.renderEmpty();

    setStatus('No screenplay loaded');
    showToast('Screenplay cleared', 'info');
  }

  async function handleAutoMatchAll() {
    if (!_screenplay) return;

    const project = TokenStore.getSelectedProject();
    if (!project) return;

    const projectId = project.id || project._id;
    const clips = DataStore.getClipIndex(projectId);

    // We need transcription segments; gather from all transcribed clips
    const allSegments = [];
    for (const clip of clips) {
      const transcription = DataStore.getTranscription(clip.id);
      if (transcription) {
        const words = TranscriptionParser.parseWhisperJSON(transcription);
        const segments = TranscriptionParser.groupIntoSegments(words);
        segments.forEach((seg, idx) => {
          allSegments.push({ ...seg, clipId: clip.id, clipName: clip.name, originalIndex: idx });
        });
      }
    }

    if (allSegments.length === 0) {
      showToast('No transcriptions available. Transcribe clips first.', 'warning');
      return;
    }

    setStatus('Auto-matching dialogue lines...');
    const dialogueLines = _screenplay.getAllDialogueLines();
    const settings = DataStore.getSettings();
    const mappingResults = TextAligner.autoAlign(dialogueLines, allSegments, settings.autoMatchThreshold);

    // Store mappings
    for (const m of mappingResults) {
      _mappings.set(m.dialogueLineId, m);
    }
    DataStore.setMappings(projectId, Array.from(_mappings.values()));

    renderScreenplay();
    setStatus(`Auto-matched ${mappingResults.length}/${dialogueLines.length} lines`);
  }

  function renderScreenplay() {
    const container = document.getElementById('screenplay-content');
    if (!container || !_screenplay) return;

    const autoMatchBtn = document.getElementById('btn-auto-match-all');
    if (autoMatchBtn) autoMatchBtn.disabled = false;

    // FIX: Show clear button when screenplay is loaded
    const clearBtn = document.getElementById('btn-clear-screenplay');
    if (clearBtn) clearBtn.style.display = 'inline-block';

    let html = '';

    if (_screenplay.title) {
      html += `<div style="text-align:center; margin-bottom:16px;">
        <div style="font-size:14px; font-weight:bold; color:var(--text-primary);">${escapeHtml(_screenplay.title)}</div>
        ${_screenplay.author ? `<div style="font-size:11px; color:var(--text-secondary);">by ${escapeHtml(_screenplay.author)}</div>` : ''}
      </div>`;
    }

    for (const scene of _screenplay.scenes) {
      const isCollapsed = _collapsedScenes.has(scene.id);

      html += `<div class="scene-block" data-scene-id="${scene.id}">`;
      html += `<div class="scene-heading" data-scene-id="${scene.id}">
        <span class="collapse-icon ${isCollapsed ? 'collapsed' : ''}">\u25BC</span>
        <span>${scene.sceneNumber}. ${escapeHtml(scene.heading)}</span>
      </div>`;

      html += `<div class="scene-elements ${isCollapsed ? 'collapsed' : ''}">`;

      for (const el of scene.elements) {
        if (el.type === 'action') {
          html += `<div class="element-action">${escapeHtml(el.text)}</div>`;
        } else if (el.type === 'dialogue') {
          const mapping = _mappings.get(el.id);
          let statusClass = '';
          if (mapping && mapping.confidence >= 0.6) statusClass = 'mapped';
          else if (mapping) statusClass = 'pending';

          const isSelected = el.id === _selectedLineId;

          html += `<div class="element-character">${escapeHtml(el.character)}</div>`;
          if (el.parenthetical) {
            html += `<div class="element-parenthetical">(${escapeHtml(el.parenthetical)})</div>`;
          }
          html += `<div class="element-dialogue ${statusClass} ${isSelected ? 'selected' : ''}"
                       data-line-id="${el.id}"
                       data-character="${escapeHtml(el.character)}">
            ${escapeHtml(el.text)}
            ${mapping ? `<span class="match-method-badge ${mapping.method || 'fuzzy'}">${mapping.method || 'fuzzy'} ${Math.round((mapping.confidence || 0) * 100)}%</span>` : ''}
          </div>`;
        } else if (el.type === 'transition') {
          html += `<div class="element-transition">${escapeHtml(el.text)}</div>`;
        }
      }

      html += `</div></div>`;
    }

    container.innerHTML = html;

    // Bind click events
    container.querySelectorAll('.scene-heading').forEach(el => {
      el.addEventListener('click', () => toggleScene(el.dataset.sceneId));
    });

    container.querySelectorAll('.element-dialogue').forEach(el => {
      el.addEventListener('click', () => selectLine(el.dataset.lineId));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, el.dataset.lineId);
      });
    });

    // FIX: Add free text selection with floating toolbar
    const contentEl = document.getElementById('screenplay-content');
    if (contentEl) {
      contentEl.addEventListener('mouseup', handleTextSelection);
    }
  }

  function toggleScene(sceneId) {
    if (_collapsedScenes.has(sceneId)) {
      _collapsedScenes.delete(sceneId);
    } else {
      _collapsedScenes.add(sceneId);
    }
    renderScreenplay();
  }

  function selectLine(lineId) {
    _selectedLineId = lineId;
    renderScreenplay();
    document.dispatchEvent(new CustomEvent('screenplay:lineSelected', {
      detail: { lineId, mapping: _mappings.get(lineId) }
    }));
  }

  function showContextMenu(event, lineId) {
    closeContextMenu();

    const mapping = _mappings.get(lineId);

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    let items = '';
    items += `<div class="context-menu-item" data-action="map-selected">Map to Selected Clip</div>`;
    items += `<div class="context-menu-item" data-action="auto-match">Auto-Match This Line</div>`;
    items += `<div class="context-menu-item" data-action="claude-match">Match with Claude AI</div>`;
    if (mapping) {
      items += `<div class="context-menu-separator"></div>`;
      items += `<div class="context-menu-item" data-action="clear-mapping">Clear Mapping</div>`;
      items += `<div class="context-menu-item" data-action="jump-to-timecode">Jump to Timecode</div>`;
    }

    menu.innerHTML = items;

    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        handleContextAction(item.dataset.action, lineId);
        closeContextMenu();
      });
    });

    document.body.appendChild(menu);
    _contextMenu = menu;
  }

  function closeContextMenu() {
    if (_contextMenu) {
      _contextMenu.remove();
      _contextMenu = null;
    }
  }

  async function handleContextAction(action, lineId) {
    const line = _screenplay ? _screenplay.getDialogueLineById(lineId) : null;
    if (!line && action !== 'clear-mapping') return;

    switch (action) {
      case 'map-selected':
        document.dispatchEvent(new CustomEvent('screenplay:mapToSelected', { detail: { lineId } }));
        break;

      case 'auto-match':
        if (line) {
          const project = TokenStore.getSelectedProject();
          if (!project) return;
          const projectId = project.id || project._id;
          const clips = DataStore.getClipIndex(projectId);
          const allSegments = [];
          for (const clip of clips) {
            const t = DataStore.getTranscription(clip.id);
            if (t) {
              const words = TranscriptionParser.parseWhisperJSON(t);
              TranscriptionParser.groupIntoSegments(words).forEach((seg, idx) => {
                allSegments.push({ ...seg, clipId: clip.id });
              });
            }
          }
          const matches = TextAligner.findBestMatch(line.text, allSegments);
          if (matches.length > 0) {
            _mappings.set(lineId, {
              dialogueLineId: lineId,
              ...matches[0],
              method: 'fuzzy'
            });
            DataStore.setMappings(projectId, Array.from(_mappings.values()));
            renderScreenplay();
            showToast(`Matched with ${Math.round(matches[0].confidence * 100)}% confidence`, 'success');
          } else {
            showToast('No match found above threshold', 'warning');
          }
        }
        break;

      case 'claude-match':
        if (line) {
          try {
            setStatus('Matching with Claude AI...');
            const project = TokenStore.getSelectedProject();
            if (!project) return;
            const projectId = project.id || project._id;
            const clips = DataStore.getClipIndex(projectId);
            const allSegments = [];
            for (const clip of clips) {
              const t = DataStore.getTranscription(clip.id);
              if (t) {
                const words = TranscriptionParser.parseWhisperJSON(t);
                TranscriptionParser.groupIntoSegments(words).forEach((seg, idx) => {
                  allSegments.push({ ...seg, clipId: clip.id, index: idx });
                });
              }
            }
            const result = await ClaudeMatch.matchWithClaude(line, allSegments);
            if (result.segmentIndex != null) {
              _mappings.set(lineId, {
                dialogueLineId: lineId,
                ...result
              });
              DataStore.setMappings(projectId, Array.from(_mappings.values()));
              renderScreenplay();
              showToast(`Claude matched with ${Math.round(result.confidence * 100)}% confidence`, 'success');
            } else {
              showToast('Claude could not find a confident match', 'warning');
            }
            setStatus('Ready');
          } catch (e) {
            showToast('Claude matching failed: ' + e.message, 'error');
            setStatus('Ready');
          }
        }
        break;

      case 'clear-mapping':
        _mappings.delete(lineId);
        const proj = TokenStore.getSelectedProject();
        if (proj) {
          DataStore.setMappings(proj.id || proj._id, Array.from(_mappings.values()));
        }
        renderScreenplay();
        break;

      case 'jump-to-timecode':
        const mapping = _mappings.get(lineId);
        if (mapping && mapping.timecodeIn != null) {
          document.dispatchEvent(new CustomEvent('playback:jumpTo', {
            detail: { seconds: mapping.timecodeIn }
          }));
        }
        break;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // FIX: Free text selection with floating toolbar
  function handleTextSelection(e) {
    // Remove any existing toolbar
    const existing = document.querySelector('.selection-toolbar');
    if (existing) existing.remove();

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const selectedText = sel.toString().trim();
    if (selectedText.length < 3) return; // Too short to search

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const container = document.getElementById('screenplay-content');
    const containerRect = container.getBoundingClientRect();

    const toolbar = document.createElement('div');
    toolbar.className = 'selection-toolbar';
    toolbar.style.left = `${rect.left - containerRect.left + (rect.width / 2) - 60}px`;
    toolbar.style.top = `${rect.top - containerRect.top - 36}px`;

    const findBtn = document.createElement('button');
    findBtn.textContent = 'Find in Clips';
    findBtn.addEventListener('click', () => {
      toolbar.remove();
      // Dispatch event with selected text for matching
      document.dispatchEvent(new CustomEvent('screenplay:textSelected', {
        detail: { text: selectedText }
      }));
      showToast('Searching for: "' + selectedText.substring(0, 40) + '..."', 'info');
    });

    const noteBtn = document.createElement('button');
    noteBtn.textContent = 'Add Note';
    noteBtn.addEventListener('click', () => {
      toolbar.remove();
      showToast('Notes feature coming soon', 'info');
    });

    toolbar.appendChild(findBtn);
    toolbar.appendChild(noteBtn);
    container.style.position = 'relative';
    container.appendChild(toolbar);

    // Dismiss on escape or outside click
    const dismiss = (evt) => {
      if (evt.type === 'keydown' && evt.key !== 'Escape') return;
      toolbar.remove();
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('mousedown', dismiss);
    };
    setTimeout(() => {
      document.addEventListener('keydown', dismiss);
      document.addEventListener('mousedown', (evt) => {
        if (!toolbar.contains(evt.target)) dismiss(evt);
      }, { once: true });
    }, 50);
  }

  return {
    render,
    renderScreenplay,
    setScreenplay(sp) {
      _screenplay = sp;
      renderScreenplay();
    },
    setMappings(mappings) {
      _mappings.clear();
      if (Array.isArray(mappings)) {
        mappings.forEach(m => _mappings.set(m.dialogueLineId, m));
      }
      renderScreenplay();
    },
    clear: handleClear,
    getSelectedLine() { return _selectedLineId; },
    getMappings() { return Array.from(_mappings.values()); },
    getScreenplay() { return _screenplay; }
  };
})();
