/**
 * ScriptSync Pro - Local Data Store
 * Persistent storage for project data, clip index, mappings, and settings.
 */

const DataStore = (() => {
  let storage;
  try {
    const uxp = require('uxp');
    storage = uxp.storage.localStorage;
  } catch (e) {
    storage = {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; }
    };
    console.warn('[DataStore] UXP storage not available, using in-memory fallback');
  }

  const PREFIX = 'ssp_store_';
  const TTL_KEY_SUFFIX = '_ttl';
  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  function makeKey(namespace, key) {
    return `${PREFIX}${namespace}_${key}`;
  }

  function setWithTTL(fullKey, value, ttlMs) {
    try {
      storage.setItem(fullKey, JSON.stringify(value));
      if (ttlMs > 0) {
        storage.setItem(fullKey + TTL_KEY_SUFFIX, String(Date.now() + ttlMs));
      }
    } catch (e) {
      console.error('[DataStore] Error saving:', fullKey, e);
    }
  }

  function getWithTTL(fullKey) {
    try {
      const ttlStr = storage.getItem(fullKey + TTL_KEY_SUFFIX);
      if (ttlStr) {
        const expiry = parseInt(ttlStr, 10);
        if (Date.now() > expiry) {
          storage.removeItem(fullKey);
          storage.removeItem(fullKey + TTL_KEY_SUFFIX);
          return null;
        }
      }
      const raw = storage.getItem(fullKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('[DataStore] Error reading:', fullKey, e);
      return null;
    }
  }

  function remove(fullKey) {
    try {
      storage.removeItem(fullKey);
      storage.removeItem(fullKey + TTL_KEY_SUFFIX);
    } catch (e) {
      console.error('[DataStore] Error removing:', fullKey, e);
    }
  }

  return {
    // ---- Project Data ----
    getProjectData(projectId) {
      return getWithTTL(makeKey('project', projectId));
    },

    setProjectData(projectId, data) {
      setWithTTL(makeKey('project', projectId), data, DEFAULT_TTL_MS);
    },

    // ---- Clip Index ----
    getClipIndex(projectId) {
      return getWithTTL(makeKey('clips', projectId)) || [];
    },

    setClipIndex(projectId, clips) {
      setWithTTL(makeKey('clips', projectId), clips, DEFAULT_TTL_MS);
    },

    // ---- Mappings ----
    getMappings(projectId) {
      return getWithTTL(makeKey('mappings', projectId)) || [];
    },

    setMappings(projectId, mappings) {
      setWithTTL(makeKey('mappings', projectId), mappings, 0); // No TTL for mappings
    },

    // ---- Screenplay ----
    getScreenplay(projectId) {
      return getWithTTL(makeKey('screenplay', projectId));
    },

    setScreenplay(projectId, screenplay) {
      setWithTTL(makeKey('screenplay', projectId), screenplay, 0);
    },

    // ---- Transcriptions ----
    getTranscription(clipId) {
      return getWithTTL(makeKey('transcription', clipId));
    },

    setTranscription(clipId, transcription) {
      setWithTTL(makeKey('transcription', clipId), transcription, DEFAULT_TTL_MS * 7);
    },

    // ---- Settings ----
    getSettings() {
      const defaults = {
        serverUrl: 'http://localhost:3000',
        helperUrl: 'http://localhost:9876',
        whisperModel: 'base.en',
        autoMatchThreshold: 0.6,
        clipPatterns: [
          'Scene##_Shot##_Take##',
          'A###C###',
          'A###_C###',
          'Shot#_Take#'
        ],
        fps: 24,
        cacheTTLHours: 24,
        claudeApiKey: ''
      };

      const saved = getWithTTL(makeKey('config', 'settings'));
      return { ...defaults, ...(saved || {}) };
    },

    setSettings(settings) {
      setWithTTL(makeKey('config', 'settings'), settings, 0);
    },

    updateSettings(partial) {
      const current = this.getSettings();
      const updated = { ...current, ...partial };
      this.setSettings(updated);
      return updated;
    },

    // ---- Cache Management ----
    clearProjectCache(projectId) {
      remove(makeKey('project', projectId));
      remove(makeKey('clips', projectId));
      remove(makeKey('screenplay', projectId));
      // Keep mappings since they're user-created
    },

    clearAllCache() {
      // Clear all prefixed keys
      // Note: UXP localStorage doesn't support iteration,
      // so we track known keys
      const knownNamespaces = ['project', 'clips', 'screenplay', 'transcription', 'config'];
      // We can only clear what we know about
      console.log('[DataStore] Clearing all cached data');
      // Reset settings to defaults
      remove(makeKey('config', 'settings'));
    },

    // ---- Import/Export ----
    exportProjectData(projectId) {
      return {
        project: this.getProjectData(projectId),
        clips: this.getClipIndex(projectId),
        mappings: this.getMappings(projectId),
        screenplay: this.getScreenplay(projectId),
        exportedAt: new Date().toISOString()
      };
    },

    importProjectData(projectId, data) {
      if (data.project) this.setProjectData(projectId, data.project);
      if (data.clips) this.setClipIndex(projectId, data.clips);
      if (data.mappings) this.setMappings(projectId, data.mappings);
      if (data.screenplay) this.setScreenplay(projectId, data.screenplay);
    }
  };
})();
