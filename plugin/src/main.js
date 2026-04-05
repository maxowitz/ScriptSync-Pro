/**
 * ScriptSync Pro - Main Entry Point
 * Initializes plugin on panel load: auth check, tab nav, socket setup.
 */

(() => {
  // ---- Global utility functions ----

  /**
   * Set status bar message.
   */
  window.setStatus = function(msg) {
    const el = document.getElementById('status-message');
    if (el) el.textContent = msg || 'Ready';
  };

  /**
   * Show a toast notification.
   */
  window.showToast = function(message, type = 'info', durationMs = 4000) {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 300ms';
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  };

  // ---- Bottom Panel Tab Navigation ----

  function initTabNavigation() {
    const bottomTabs = document.querySelectorAll('.bottom-tab');
    const bottomPanels = document.querySelectorAll('.bottom-panel-content');

    bottomTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const panelId = tab.dataset.panel;

        // Update active tab
        bottomTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding panel
        bottomPanels.forEach(p => {
          p.classList.toggle('hidden', p.id !== `panel-${panelId}`);
        });

        // Expand bottom panel if collapsed
        const bottomPanel = document.getElementById('bottom-panel');
        if (bottomPanel) bottomPanel.classList.remove('collapsed');
      });
    });

    // Toggle bottom panel collapse
    const toggleBtn = document.getElementById('btn-toggle-bottom');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const bottomPanel = document.getElementById('bottom-panel');
        if (bottomPanel) bottomPanel.classList.toggle('collapsed');
      });
    }
  }

  // ---- Settings Overlay ----

  function initSettingsOverlay() {
    const overlay = document.getElementById('settings-overlay');
    const openBtn = document.getElementById('btn-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    const backdrop = overlay ? overlay.querySelector('.overlay-backdrop') : null;

    if (openBtn && overlay) {
      openBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
    }
    if (closeBtn && overlay) {
      closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    }
    if (backdrop && overlay) {
      backdrop.addEventListener('click', () => overlay.classList.add('hidden'));
    }
  }

  // ---- Split Divider Drag ----

  function initSplitDivider() {
    const divider = document.getElementById('split-divider');
    const leftPanel = document.querySelector('.split-left');
    const rightPanel = document.querySelector('.split-right');
    if (!divider || !leftPanel || !rightPanel) return;

    let isDragging = false;

    divider.addEventListener('mousedown', (e) => {
      isDragging = true;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const container = leftPanel.parentElement;
      const rect = container.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const clamped = Math.max(0.2, Math.min(0.8, ratio));
      leftPanel.style.flex = `0 0 ${clamped * 100}%`;
      rightPanel.style.flex = `0 0 ${(1 - clamped) * 100}%`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // ---- Project Selector ----
  // FIX: Auto-detect Premiere project instead of requiring cloud project selection.
  // The active Premiere project IS the project. Cloud is optional for collaboration.

  async function loadProjects() {
    const selector = document.getElementById('project-selector');
    if (!selector) return;

    // Step 1: Try to detect the active Premiere Pro project
    let premiereProject = null;
    try {
      const { app } = require('premiere');
      if (app && app.project) {
        const projName = app.project.name || 'Untitled Project';
        const seqName = app.project.activeSequence
          ? app.project.activeSequence.name
          : null;
        premiereProject = {
          id: 'local_' + (projName.replace(/[^a-zA-Z0-9]/g, '_')),
          name: seqName ? `${projName} — ${seqName}` : projName,
          source: 'premiere',
        };
      }
    } catch (e) {
      console.warn('[Main] Premiere API not available:', e.message);
    }

    // Step 2: Build dropdown options
    selector.innerHTML = '';

    if (premiereProject) {
      // Show the active Premiere project as primary option
      const opt = document.createElement('option');
      opt.value = premiereProject.id;
      opt.textContent = premiereProject.name;
      selector.appendChild(opt);
    }

    // Step 3: Also try loading cloud projects (for collaboration features)
    try {
      const data = await CloudAPI.getProjects();
      const cloudProjects = data.projects || data || [];
      if (Array.isArray(cloudProjects) && cloudProjects.length > 0) {
        if (premiereProject) {
          // Add separator
          const sep = document.createElement('option');
          sep.disabled = true;
          sep.textContent = '── Cloud Projects ──';
          selector.appendChild(sep);
        }
        for (const p of cloudProjects) {
          const opt = document.createElement('option');
          opt.value = p.id || p._id;
          opt.textContent = (p.name || p.title || 'Untitled') + ' (cloud)';
          opt.dataset.source = 'cloud';
          selector.appendChild(opt);
        }
      }
    } catch (e) {
      // Cloud not available — that's fine, local project still works
      console.warn('[Main] Cloud projects unavailable:', e.message);
    }

    // Step 4: Auto-select
    if (selector.options.length === 0) {
      selector.innerHTML = '<option value="">No project detected</option>';
      setStatus('Open a Premiere project or log in for cloud projects');
      return;
    }

    // Auto-select the first option (Premiere project or cloud project)
    const firstOption = selector.options[0];
    if (firstOption && firstOption.value) {
      selector.value = firstOption.value;

      // Check if it's a cloud project or local
      if (firstOption.dataset && firstOption.dataset.source === 'cloud') {
        try {
          const project = await CloudAPI.getProject(firstOption.value);
          TokenStore.setSelectedProject(project);
          onProjectSelected(project);
        } catch (e) {
          console.error('[Main] Failed to load cloud project:', e);
        }
      } else {
        // Local Premiere project — use directly
        TokenStore.setSelectedProject(premiereProject || { id: firstOption.value, name: firstOption.textContent });
        onProjectSelected(premiereProject || { id: firstOption.value, name: firstOption.textContent });
      }
    }

    // Handle manual dropdown change
    selector.addEventListener('change', async () => {
      const selectedOpt = selector.options[selector.selectedIndex];
      if (!selectedOpt || !selectedOpt.value) {
        TokenStore.setSelectedProject(null);
        return;
      }

      if (selectedOpt.dataset && selectedOpt.dataset.source === 'cloud') {
        try {
          const project = await CloudAPI.getProject(selectedOpt.value);
          TokenStore.setSelectedProject(project);
          onProjectSelected(project);
        } catch (e) {
          showToast('Failed to load project', 'error');
        }
      } else {
        // Local project selected
        const localProj = { id: selectedOpt.value, name: selectedOpt.textContent };
        TokenStore.setSelectedProject(localProj);
        onProjectSelected(localProj);
      }
    });
  }

  function onProjectSelected(project) {
    const projectId = project.id || project._id;
    setStatus(`Project: ${project.name || project.title || 'Untitled'}`);

    // Join socket room for this project
    SocketClient.joinProject(projectId);

    // Load cached screenplay
    const savedScreenplay = DataStore.getScreenplay(projectId);
    if (savedScreenplay) {
      const sp = ScreenplayImporter.parseJSON(savedScreenplay);
      ScreenplayPanel.setScreenplay(sp);
    }

    // Load cached mappings
    const savedMappings = DataStore.getMappings(projectId);
    if (savedMappings.length > 0) {
      ScreenplayPanel.setMappings(savedMappings);

      // Build mapped regions for playback panel
      const regions = savedMappings
        .filter(m => m.timecodeIn != null && m.timecodeOut != null)
        .map(m => ({
          start: m.timecodeIn,
          end: m.timecodeOut,
          label: m.character ? `${m.character}: ${(m.dialogueText || '').substring(0, 30)}` : (m.dialogueText || '').substring(0, 40)
        }));
      PlaybackPanel.setMappedRegions(regions);

      // Feed mappings to matches panel
      if (typeof MatchesPanel !== 'undefined') {
        MatchesPanel.setMappings(savedMappings);
      }
    }

    // Scan local clips
    scanLocalClips(projectId);

    // Refresh sync panel
    SyncPanel.refresh();
  }

  async function scanLocalClips(projectId) {
    try {
      setStatus('Scanning Premiere project for clips...');
      const clips = await ClipIndexer.scanProject();
      if (clips.length > 0) {
        DataStore.setClipIndex(projectId, clips);
        setStatus(`Found ${clips.length} clips in Premiere`);
        showToast(`Found ${clips.length} clips`, 'success');
        renderClipsTab(clips);
      } else {
        // FIX: Show actionable message instead of silent empty state
        setStatus('No clips in Premiere bin. Use Import Folder or add media to your project.');
        showToast('No clips found. Try "Import Folder" to load media files manually.', 'warning');
        renderClipsTab([]);
      }
    } catch (e) {
      // FIX: Surface the actual error instead of silently falling back
      console.error('[Main] Clip scan error:', e);
      setStatus('Premiere scan failed: ' + (e.message || 'Unknown error'));
      showToast('Could not scan Premiere project. Use "Import Folder" instead.', 'warning');
      // Still try loading from cache
      const cached = DataStore.getClipIndex(projectId);
      if (cached.length > 0) {
        renderClipsTab(cached);
        setStatus(`Loaded ${cached.length} cached clips`);
      } else {
        renderClipsTab([]);
      }
    }
  }

  async function importMediaFolder(projectId) {
    try {
      const uxpStorage = require('uxp').storage;
      const folder = await uxpStorage.localFileSystem.getFolder();
      if (!folder) return;

      setStatus('Scanning folder for media files...');
      const entries = await folder.getEntries();
      const mediaExtensions = /\.(mov|mp4|mxf|wav|aif|aiff|r3d)$/i;
      const clips = [];

      for (const entry of entries) {
        if (entry.isFile && mediaExtensions.test(entry.name)) {
          const parsed = ClipNameParser.parse(entry.name);
          clips.push({
            id: 'manual_' + clips.length + '_' + Date.now(),
            name: parsed.name,
            filePath: entry.nativePath,
            source: 'manual-import',
            scene: parsed.scene,
            shot: parsed.shot,
            take: parsed.take,
            camera: parsed.camera,
            reel: parsed.reel,
            duration: null,
            status: 'imported',
            originalFilename: entry.name
          });
        }
      }

      if (clips.length === 0) {
        showToast('No media files found in selected folder', 'warning');
        setStatus('No media files found');
        return;
      }

      DataStore.setClipIndex(projectId, clips);
      renderClipsTab(clips);
      setStatus(`Found ${clips.length} media file(s)`);
      showToast(`Imported ${clips.length} clips from folder`, 'success');
    } catch (e) {
      console.error('[ImportFolder] Error:', e);
      showToast('Failed to import folder: ' + e.message, 'error');
    }
  }

  function renderClipsTab(clips) {
    const root = document.getElementById('clips-panel-root');
    if (!root) return;

    let html = `
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Project Clips</span>
          <div>
            <button id="btn-import-folder" class="btn btn-sm btn-secondary">Import Folder</button>
            <button id="btn-rescan-clips" class="btn btn-sm btn-secondary">Rescan</button>
            <button id="btn-transcribe-all" class="btn btn-sm btn-primary" ${clips.length === 0 ? 'disabled' : ''}>Transcribe All</button>
          </div>
        </div>
    `;

    if (clips.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <div class="empty-state-text">No clips found</div>
          <div class="empty-state-hint">Open a Premiere Pro project with media clips</div>
        </div>`;
    } else {
      html += `
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Shot Info</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const clip of clips) {
        const parsed = ClipNameParser.parse(clip.name);
        const transcription = DataStore.getTranscription(clip.id);
        const hasTranscript = !!transcription;

        html += `
          <tr class="clip-row" data-clip-id="${clip.id}" style="cursor:pointer;">
            <td>${escapeHtml(clip.name)}</td>
            <td>${escapeHtml(ClipNameParser.formatInfo(parsed))}</td>
            <td class="mono">${clip.duration ? TimecodeUtils.formatDuration(clip.duration) : '-'}</td>
            <td>
              <span class="status-badge ${hasTranscript ? 'status-connected' : 'status-disconnected'}">
                ${hasTranscript ? 'Transcribed' : 'No transcript'}
              </span>
            </td>
          </tr>
        `;
      }

      html += '</tbody></table>';
    }

    html += '</div>';
    root.innerHTML = html;

    // Bind clip row clicks
    root.querySelectorAll('.clip-row').forEach(row => {
      row.addEventListener('click', () => {
        const clipId = row.dataset.clipId;
        const clip = clips.find(c => c.id === clipId);
        if (clip) {
          // Deselect all, select this one
          root.querySelectorAll('.clip-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          document.dispatchEvent(new CustomEvent('clip:selected', { detail: clip }));
        }
      });
    });

    // Bind import folder
    const importBtn = document.getElementById('btn-import-folder');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const project = TokenStore.getSelectedProject();
        if (project) importMediaFolder(project.id || project._id);
      });
    }

    // Bind rescan
    const rescanBtn = document.getElementById('btn-rescan-clips');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        const project = TokenStore.getSelectedProject();
        if (project) scanLocalClips(project.id || project._id);
      });
    }

    // Bind transcribe all
    const transcribeAllBtn = document.getElementById('btn-transcribe-all');
    if (transcribeAllBtn) {
      transcribeAllBtn.addEventListener('click', () => transcribeAllClips(clips));
    }
  }

  async function transcribeAllClips(clips) {
    const untranscribed = clips.filter(c => !DataStore.getTranscription(c.id) && c.filePath);
    if (untranscribed.length === 0) {
      showToast('All clips already transcribed', 'info');
      return;
    }

    setStatus(`Transcribing ${untranscribed.length} clips...`);

    for (let i = 0; i < untranscribed.length; i++) {
      const clip = untranscribed[i];
      try {
        setStatus(`Transcribing ${i + 1}/${untranscribed.length}: ${clip.name}`);
        const words = await TranscriptionEngine.transcribeAndParse(clip.filePath);
        DataStore.setTranscription(clip.id, words);
      } catch (e) {
        console.error(`[Main] Transcription error for ${clip.name}:`, e);
        showToast(`Failed to transcribe ${clip.name}: ${e.message}`, 'error');
      }
    }

    setStatus('Transcription batch complete');
    showToast(`Transcribed ${untranscribed.length} clips`, 'success');

    // Re-render clips tab
    const project = TokenStore.getSelectedProject();
    if (project) {
      const allClips = DataStore.getClipIndex(project.id || project._id);
      renderClipsTab(allClips);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Auth Event Handlers ----

  document.addEventListener('auth:login', (e) => {
    const data = e.detail;
    console.log('[Main] Login successful:', data.user?.email || '');
    initPostLogin();
  });

  document.addEventListener('auth:logout', () => {
    console.log('[Main] Logged out');
  });

  document.addEventListener('auth:expired', () => {
    console.log('[Main] Auth expired');
    LoginManager.showLogin();
    showToast('Session expired. Please log in again.', 'warning');
  });

  // ---- Logout Button ----

  function initLogout() {
    const btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', () => {
        LoginManager.handleLogout();
      });
    }
  }

  // ---- Post-Login Initialization ----

  function initPostLogin() {
    const token = TokenStore.getAccessToken();

    // Connect socket
    if (token) {
      SocketClient.connect(token);
    }

    // Load projects
    loadProjects();

    // Check helper sidecar
    TranscriptionEngine.isHelperAvailable();

    // Auto-poll helper status every 10 seconds
    setInterval(async () => {
      try {
        const settings = DataStore.getSettings();
        const helperUrl = settings.helperUrl || 'http://localhost:9876';
        const res = await fetch(helperUrl + '/health', { method: 'GET' });
        const data = await res.json();
        const el = document.getElementById('helper-status');
        if (el) {
          el.textContent = 'Helper: Online';
          el.className = 'status-badge status-connected';
        }
      } catch {
        const el = document.getElementById('helper-status');
        if (el) {
          el.textContent = 'Helper: Offline';
          el.className = 'status-badge status-disconnected';
        }
      }
    }, 10000);

    // Apply saved settings
    const settings = DataStore.getSettings();
    if (settings.serverUrl) {
      CloudAPI.setServerUrl(settings.serverUrl);
    }
    if (settings.fps) {
      PlaybackPanel.setFPS(settings.fps);
    }
  }

  // ---- Initialize All Panels ----

  function initPanels() {
    ScreenplayPanel.render();
    PlaybackPanel.render();
    MetadataPanel.render();
    SettingsPanel.render();
    SyncPanel.render();
    if (typeof MatchesPanel !== 'undefined') {
      MatchesPanel.init();
    }
  }

  // ---- Main Init ----

  function init() {
    console.log('[ScriptSync Pro] Initializing...');

    initTabNavigation();
    initSettingsOverlay();
    initSplitDivider();
    initLogout();
    initPanels();

    // FIX: Always show main app — Premiere project works without cloud login.
    // Cloud login is optional for collaboration features (sync, remote clips).
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    initPostLogin();

    setStatus('Ready');
    console.log('[ScriptSync Pro] Initialized');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
