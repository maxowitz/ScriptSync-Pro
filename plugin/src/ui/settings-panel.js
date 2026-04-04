/**
 * ScriptSync Pro - Settings Panel
 * Plugin configuration UI.
 */

const SettingsPanel = (() => {

  function getRoot() {
    return document.getElementById('settings-panel-root');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    const settings = DataStore.getSettings();

    root.innerHTML = `
      <!-- Server Connection -->
      <div class="settings-section">
        <div class="settings-section-title">Server Connection</div>
        <div class="form-group">
          <label for="setting-server-url">Server URL</label>
          <input type="url" id="setting-server-url" value="${escapeAttr(settings.serverUrl)}" placeholder="http://localhost:3000" />
        </div>
        <div class="form-group">
          <label for="setting-helper-url">Helper Sidecar URL</label>
          <div class="form-row">
            <input type="url" id="setting-helper-url" value="${escapeAttr(settings.helperUrl)}" placeholder="http://localhost:9876" />
            <button id="btn-check-helper" class="btn btn-sm btn-secondary">Check</button>
          </div>
          <div id="helper-check-result" style="font-size:10px; margin-top:4px;"></div>
        </div>
      </div>

      <!-- Transcription -->
      <div class="settings-section">
        <div class="settings-section-title">Transcription</div>
        <div class="form-group">
          <label for="setting-whisper-model">Whisper Model</label>
          <select id="setting-whisper-model">
            <option value="tiny.en" ${settings.whisperModel === 'tiny.en' ? 'selected' : ''}>Tiny (English) - Fastest</option>
            <option value="tiny" ${settings.whisperModel === 'tiny' ? 'selected' : ''}>Tiny (Multilingual)</option>
            <option value="base.en" ${settings.whisperModel === 'base.en' ? 'selected' : ''}>Base (English) - Recommended</option>
            <option value="base" ${settings.whisperModel === 'base' ? 'selected' : ''}>Base (Multilingual)</option>
            <option value="small.en" ${settings.whisperModel === 'small.en' ? 'selected' : ''}>Small (English) - Better accuracy</option>
            <option value="small" ${settings.whisperModel === 'small' ? 'selected' : ''}>Small (Multilingual)</option>
            <option value="medium.en" ${settings.whisperModel === 'medium.en' ? 'selected' : ''}>Medium (English) - Best accuracy</option>
            <option value="medium" ${settings.whisperModel === 'medium' ? 'selected' : ''}>Medium (Multilingual)</option>
          </select>
        </div>
      </div>

      <!-- Matching -->
      <div class="settings-section">
        <div class="settings-section-title">Matching</div>
        <div class="form-group">
          <label>Auto-Match Confidence Threshold</label>
          <div class="setting-row">
            <input type="range" id="setting-threshold" min="0.3" max="0.95" step="0.05" value="${settings.autoMatchThreshold}" />
            <span id="threshold-value" class="setting-value">${Math.round(settings.autoMatchThreshold * 100)}%</span>
          </div>
        </div>
        <div class="form-group">
          <label for="setting-claude-key">Claude API Key (for AI matching)</label>
          <div class="form-row">
            <input type="password" id="setting-claude-key" value="${escapeAttr(settings.claudeApiKey)}" placeholder="sk-ant-..." />
            <button id="btn-test-claude-key" class="btn btn-sm btn-secondary">Test</button>
          </div>
          <div id="claude-key-result" style="font-size:10px; margin-top:4px;"></div>
        </div>
      </div>

      <!-- Clip Naming -->
      <div class="settings-section">
        <div class="settings-section-title">Clip Naming Conventions</div>
        <div id="clip-patterns-list" style="margin-bottom:8px;">
          ${(settings.clipPatterns || []).map((p, i) => `
            <div class="setting-row" style="margin-bottom:4px;">
              <input type="text" class="clip-pattern-input" data-index="${i}" value="${escapeAttr(p)}" style="flex:1;" />
              <button class="btn btn-sm btn-icon remove-pattern-btn" data-index="${i}" title="Remove">\u2715</button>
            </div>
          `).join('')}
        </div>
        <button id="btn-add-pattern" class="btn btn-sm btn-secondary">Add Pattern</button>
      </div>

      <!-- Timeline -->
      <div class="settings-section">
        <div class="settings-section-title">Timeline</div>
        <div class="form-group">
          <label for="setting-fps">Frame Rate (FPS)</label>
          <select id="setting-fps">
            <option value="23.976" ${settings.fps === 23.976 ? 'selected' : ''}>23.976</option>
            <option value="24" ${settings.fps === 24 ? 'selected' : ''}>24</option>
            <option value="25" ${settings.fps === 25 ? 'selected' : ''}>25</option>
            <option value="29.97" ${settings.fps === 29.97 ? 'selected' : ''}>29.97</option>
            <option value="30" ${settings.fps === 30 ? 'selected' : ''}>30</option>
            <option value="48" ${settings.fps === 48 ? 'selected' : ''}>48</option>
            <option value="60" ${settings.fps === 60 ? 'selected' : ''}>60</option>
          </select>
        </div>
      </div>

      <!-- Cache -->
      <div class="settings-section">
        <div class="settings-section-title">Cache</div>
        <div class="setting-row">
          <span class="setting-label">Cache TTL</span>
          <span class="setting-value">${settings.cacheTTLHours || 24} hours</span>
        </div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button id="btn-clear-cache" class="btn btn-sm btn-danger">Clear Cache</button>
          <button id="btn-export-data" class="btn btn-sm btn-secondary">Export Data</button>
          <button id="btn-import-data" class="btn btn-sm btn-secondary">Import Data</button>
        </div>
      </div>

      <!-- Save -->
      <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color);">
        <button id="btn-save-settings" class="btn btn-primary btn-block">Save Settings</button>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Threshold slider
    const thresholdSlider = document.getElementById('setting-threshold');
    const thresholdVal = document.getElementById('threshold-value');
    if (thresholdSlider) {
      thresholdSlider.addEventListener('input', () => {
        thresholdVal.textContent = Math.round(thresholdSlider.value * 100) + '%';
      });
    }

    // Check helper
    document.getElementById('btn-check-helper').addEventListener('click', async () => {
      const resultEl = document.getElementById('helper-check-result');
      resultEl.textContent = 'Checking...';
      resultEl.style.color = 'var(--text-secondary)';
      const available = await TranscriptionEngine.isHelperAvailable();
      resultEl.textContent = available ? 'Helper is running' : 'Helper not reachable';
      resultEl.style.color = available ? 'var(--accent-green)' : 'var(--accent-red)';
    });

    // Test Claude key
    document.getElementById('btn-test-claude-key').addEventListener('click', async () => {
      const resultEl = document.getElementById('claude-key-result');
      const key = document.getElementById('setting-claude-key').value;
      resultEl.textContent = 'Testing...';
      resultEl.style.color = 'var(--text-secondary)';
      const result = await ClaudeMatch.testApiKey(key);
      resultEl.textContent = result.valid ? 'API key is valid' : result.error;
      resultEl.style.color = result.valid ? 'var(--accent-green)' : 'var(--accent-red)';
    });

    // Add pattern
    document.getElementById('btn-add-pattern').addEventListener('click', () => {
      const settings = DataStore.getSettings();
      settings.clipPatterns = settings.clipPatterns || [];
      settings.clipPatterns.push('');
      DataStore.setSettings(settings);
      render();
    });

    // Remove pattern buttons
    document.querySelectorAll('.remove-pattern-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const settings = DataStore.getSettings();
        settings.clipPatterns.splice(idx, 1);
        DataStore.setSettings(settings);
        render();
      });
    });

    // Clear cache
    document.getElementById('btn-clear-cache').addEventListener('click', () => {
      DataStore.clearAllCache();
      showToast('Cache cleared', 'success');
    });

    // Export data
    document.getElementById('btn-export-data').addEventListener('click', async () => {
      const project = TokenStore.getSelectedProject();
      if (!project) {
        showToast('No project selected', 'warning');
        return;
      }
      const data = DataStore.exportProjectData(project.id || project._id);
      const json = JSON.stringify(data, null, 2);

      try {
        const uxpStorage = require('uxp').storage;
        const fs = uxpStorage.localFileSystem;
        const file = await fs.getFileForSaving('scriptsync-export.json');
        if (file) {
          await file.write(json, { format: uxpStorage.formats.utf8 });
          showToast('Data exported successfully', 'success');
        }
      } catch (e) {
        console.error('[Settings] Export error:', e);
        showToast('Export failed: ' + e.message, 'error');
      }
    });

    // Import data
    document.getElementById('btn-import-data').addEventListener('click', async () => {
      try {
        const uxpStorage = require('uxp').storage;
        const fs = uxpStorage.localFileSystem;
        const file = await fs.getFileForOpening({ types: ['json'] });
        if (!file) return;

        const text = await file.read({ format: uxpStorage.formats.utf8 });
        const data = JSON.parse(text);
        const project = TokenStore.getSelectedProject();
        if (project) {
          DataStore.importProjectData(project.id || project._id, data);
          showToast('Data imported successfully', 'success');
        }
      } catch (e) {
        console.error('[Settings] Import error:', e);
        showToast('Import failed: ' + e.message, 'error');
      }
    });

    // Save settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  }

  function saveSettings() {
    const updated = {
      serverUrl: document.getElementById('setting-server-url').value.trim(),
      helperUrl: document.getElementById('setting-helper-url').value.trim(),
      whisperModel: document.getElementById('setting-whisper-model').value,
      autoMatchThreshold: parseFloat(document.getElementById('setting-threshold').value),
      claudeApiKey: document.getElementById('setting-claude-key').value.trim(),
      fps: parseFloat(document.getElementById('setting-fps').value),
      clipPatterns: Array.from(document.querySelectorAll('.clip-pattern-input'))
        .map(el => el.value.trim())
        .filter(Boolean)
    };

    DataStore.setSettings(updated);
    CloudAPI.setServerUrl(updated.serverUrl);

    showToast('Settings saved', 'success');
    setStatus('Settings saved');
  }

  function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  return {
    render
  };
})();
