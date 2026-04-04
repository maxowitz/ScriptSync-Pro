/**
 * ScriptSync Pro - Sync Panel UI
 * Wraps SyncPanelLogic with cloud connection status, remote clips, and upload.
 */

const SyncPanel = (() => {
  let _remoteClips = [];

  function getRoot() {
    return document.getElementById('sync-panel-root');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    const project = TokenStore.getSelectedProject();
    const isConnected = SocketClient.isConnected();

    root.innerHTML = `
      <!-- Connection Status -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Cloud Connection</span>
          <span class="status-badge ${isConnected ? 'status-connected' : 'status-disconnected'}">
            ${isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div class="card-body">
          ${project ? `
            <div style="margin-bottom:4px;"><strong>Project:</strong> ${escapeHtml(project.name || project.title || 'Unknown')}</div>
            <div style="font-size:10px; color:var(--text-muted);">ID: ${project.id || project._id || '?'}</div>
          ` : '<div style="color:var(--text-muted);">No project selected</div>'}
        </div>
      </div>

      <!-- Team Members -->
      <div class="card" id="team-members-card" style="display:none;">
        <div class="card-header">
          <span class="card-title">Team</span>
        </div>
        <div class="card-body" id="team-members-list"></div>
      </div>

      <!-- Remote Clips -->
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Remote Clips</span>
          <div>
            <button id="btn-refresh-remote" class="btn btn-sm btn-secondary">Refresh</button>
            <button id="btn-upload-local" class="btn btn-sm btn-primary">Upload Local</button>
          </div>
        </div>
        <div id="remote-clips-list">
          <div class="loading-overlay" id="remote-clips-loading" style="display:none;">
            <div class="spinner"></div>
            <span>Loading remote clips...</span>
          </div>
          <div id="remote-clips-content">
            <div class="empty-state" style="padding:16px;">
              <div class="empty-state-text">No remote clips</div>
              <div class="empty-state-hint">Upload clips or sync from the cloud</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sync Status -->
      <div class="card" style="margin-top:12px;">
        <div class="card-header">
          <span class="card-title">Sync Status</span>
        </div>
        <div class="card-body" id="sync-status-area">
          <div style="color:var(--text-muted);">No sync activity</div>
        </div>
      </div>
    `;

    document.getElementById('btn-refresh-remote').addEventListener('click', loadRemoteClips);
    document.getElementById('btn-upload-local').addEventListener('click', handleUploadLocal);

    // Set up live socket listeners
    SyncPanelLogic.setupSocketListeners((event, data) => {
      loadRemoteClips(); // Refresh on any sync event
      showSyncActivity(event, data);
    });

    // Auto-load if project selected
    if (project) {
      loadRemoteClips();
      loadTeamMembers();
    }
  }

  async function loadRemoteClips() {
    const project = TokenStore.getSelectedProject();
    if (!project) return;

    const loadingEl = document.getElementById('remote-clips-loading');
    const contentEl = document.getElementById('remote-clips-content');
    if (loadingEl) loadingEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';

    try {
      _remoteClips = await SyncPanelLogic.fetchRemoteClips(project.id || project._id);

      // Set local clips for conflict detection
      const localClips = DataStore.getClipIndex(project.id || project._id);
      SyncPanelLogic.setLocalClips(localClips);

      const withConflicts = SyncPanelLogic.detectConflicts();
      renderRemoteClips(withConflicts);
    } catch (e) {
      console.error('[SyncPanel] Error loading remote clips:', e);
      if (contentEl) {
        contentEl.innerHTML = `<div style="color:var(--accent-red); padding:8px;">Failed to load: ${escapeHtml(e.message)}</div>`;
        contentEl.style.display = 'block';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    }
  }

  function renderRemoteClips(clips) {
    const contentEl = document.getElementById('remote-clips-content');
    if (!contentEl) return;

    if (!clips || clips.length === 0) {
      contentEl.innerHTML = `
        <div class="empty-state" style="padding:16px;">
          <div class="empty-state-text">No remote clips</div>
        </div>`;
      return;
    }

    contentEl.innerHTML = clips.map(clip => {
      const name = clip.filename || clip.name || 'Unknown';
      const uploader = clip.uploadedBy?.name || clip.uploader || '';
      const uploadTime = clip.createdAt ? new Date(clip.createdAt).toLocaleDateString() : '';
      const transcriptionStatus = clip.transcriptionStatus || 'none';
      const statusClass = transcriptionStatus === 'completed' ? 'status-connected' :
                         transcriptionStatus === 'processing' ? 'status-processing' :
                         'status-disconnected';

      return `
        <div class="sync-item">
          <div class="sync-item-info">
            <div class="sync-item-name">${escapeHtml(name)}</div>
            <div class="sync-item-meta">
              ${uploader ? `${escapeHtml(uploader)} \u2022 ` : ''}${uploadTime}
              ${clip.conflict ? `<span class="conflict-badge">Conflict: ${escapeHtml(clip.conflict.reason)}</span>` : ''}
            </div>
          </div>
          <div class="sync-item-actions">
            <span class="status-badge ${statusClass}" style="margin-right:4px;">
              ${transcriptionStatus === 'completed' ? 'Transcribed' : transcriptionStatus === 'processing' ? 'Processing' : 'No transcript'}
            </span>
            <button class="btn btn-sm btn-primary import-remote-btn" data-clip-id="${clip.id || clip._id}">Import</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind import buttons
    contentEl.querySelectorAll('.import-remote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clipId = btn.dataset.clipId;
        const clip = clips.find(c => (c.id || c._id) === clipId);
        if (!clip) return;

        btn.disabled = true;
        btn.textContent = 'Importing...';
        try {
          await SyncPanelLogic.importRemoteClip(clip);
          showToast(`Imported: ${clip.filename || clip.name}`, 'success');
          btn.textContent = 'Done';
        } catch (e) {
          showToast(`Import failed: ${e.message}`, 'error');
          btn.textContent = 'Import';
          btn.disabled = false;
        }
      });
    });
  }

  async function loadTeamMembers() {
    const project = TokenStore.getSelectedProject();
    if (!project) return;

    try {
      const projectData = await CloudAPI.getProject(project.id || project._id);
      const members = projectData.members || projectData.team || [];

      if (members.length > 0) {
        const card = document.getElementById('team-members-card');
        const list = document.getElementById('team-members-list');
        if (card) card.style.display = 'block';
        if (list) {
          list.innerHTML = members.map(m => `
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--accent-blue); display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff;">
                ${(m.name || m.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style="font-size:11px;">${escapeHtml(m.name || m.email)}</div>
                <div style="font-size:9px; color:var(--text-muted);">${escapeHtml(m.role || '')}</div>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (e) {
      console.warn('[SyncPanel] Could not load team members:', e);
    }
  }

  async function handleUploadLocal() {
    const project = TokenStore.getSelectedProject();
    if (!project) {
      showToast('Select a project first', 'warning');
      return;
    }

    try {
      const uxpStorage = require('uxp').storage;
      const fs = uxpStorage.localFileSystem;
      const file = await fs.getFileForOpening({
        types: ['mov', 'mp4', 'mxf', 'avi', 'r3d', 'braw', 'wav', 'mp3']
      });
      if (!file) return;

      setStatus('Uploading clip to cloud...');
      const data = await file.read({ format: uxpStorage.formats.binary });
      const blob = new Blob([data]);
      await CloudAPI.uploadClip(project.id || project._id, blob, file.name);

      showToast('Clip uploaded to cloud', 'success');
      setStatus('Upload complete');
      loadRemoteClips();
    } catch (e) {
      console.error('[SyncPanel] Upload error:', e);
      showToast('Upload failed: ' + e.message, 'error');
      setStatus('Ready');
    }
  }

  function showSyncActivity(event, data) {
    const area = document.getElementById('sync-status-area');
    if (!area) return;

    const time = new Date().toLocaleTimeString();
    const messages = {
      clipUploaded: `Clip uploaded: ${data.clip?.filename || 'unknown'}`,
      clipTranscribed: `Transcription complete for clip ${data.clipId || ''}`,
    };

    const msg = messages[event] || `Event: ${event}`;
    const entry = document.createElement('div');
    entry.style.cssText = 'font-size:10px; color:var(--text-secondary); margin-bottom:2px;';
    entry.textContent = `[${time}] ${msg}`;
    area.prepend(entry);

    // Keep only last 10 entries
    while (area.children.length > 10) {
      area.removeChild(area.lastChild);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    render,
    refresh: loadRemoteClips
  };
})();
