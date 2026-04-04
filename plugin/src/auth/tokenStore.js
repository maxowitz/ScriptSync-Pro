/**
 * ScriptSync Pro - Token Storage
 * Uses UXP localStorage for persisting auth tokens and user data.
 */

const TokenStore = (() => {
  let storage;
  try {
    const uxp = require('uxp');
    storage = uxp.storage.localStorage;
  } catch (e) {
    // Fallback for development outside UXP
    storage = {
      _data: {},
      getItem(key) { return this._data[key] || null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; }
    };
    console.warn('[TokenStore] UXP storage not available, using in-memory fallback');
  }

  const KEYS = {
    ACCESS_TOKEN: 'ssp_access_token',
    REFRESH_TOKEN: 'ssp_refresh_token',
    USER_DATA: 'ssp_user_data',
    SELECTED_PROJECT: 'ssp_selected_project',
    TOKEN_EXPIRY: 'ssp_token_expiry'
  };

  return {
    getAccessToken() {
      try {
        return storage.getItem(KEYS.ACCESS_TOKEN);
      } catch (e) {
        console.error('[TokenStore] Error getting access token:', e);
        return null;
      }
    },

    setAccessToken(token) {
      try {
        if (token) {
          storage.setItem(KEYS.ACCESS_TOKEN, token);
        } else {
          storage.removeItem(KEYS.ACCESS_TOKEN);
        }
      } catch (e) {
        console.error('[TokenStore] Error setting access token:', e);
      }
    },

    getRefreshToken() {
      try {
        return storage.getItem(KEYS.REFRESH_TOKEN);
      } catch (e) {
        console.error('[TokenStore] Error getting refresh token:', e);
        return null;
      }
    },

    setRefreshToken(token) {
      try {
        if (token) {
          storage.setItem(KEYS.REFRESH_TOKEN, token);
        } else {
          storage.removeItem(KEYS.REFRESH_TOKEN);
        }
      } catch (e) {
        console.error('[TokenStore] Error setting refresh token:', e);
      }
    },

    getTokenExpiry() {
      try {
        const val = storage.getItem(KEYS.TOKEN_EXPIRY);
        return val ? parseInt(val, 10) : null;
      } catch (e) {
        return null;
      }
    },

    setTokenExpiry(timestamp) {
      try {
        if (timestamp) {
          storage.setItem(KEYS.TOKEN_EXPIRY, String(timestamp));
        } else {
          storage.removeItem(KEYS.TOKEN_EXPIRY);
        }
      } catch (e) {
        console.error('[TokenStore] Error setting token expiry:', e);
      }
    },

    isTokenExpired() {
      const expiry = this.getTokenExpiry();
      if (!expiry) return true;
      return Date.now() >= expiry;
    },

    clearTokens() {
      try {
        storage.removeItem(KEYS.ACCESS_TOKEN);
        storage.removeItem(KEYS.REFRESH_TOKEN);
        storage.removeItem(KEYS.TOKEN_EXPIRY);
        storage.removeItem(KEYS.USER_DATA);
      } catch (e) {
        console.error('[TokenStore] Error clearing tokens:', e);
      }
    },

    getUserData() {
      try {
        const data = storage.getItem(KEYS.USER_DATA);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('[TokenStore] Error getting user data:', e);
        return null;
      }
    },

    setUserData(data) {
      try {
        if (data) {
          storage.setItem(KEYS.USER_DATA, JSON.stringify(data));
        } else {
          storage.removeItem(KEYS.USER_DATA);
        }
      } catch (e) {
        console.error('[TokenStore] Error setting user data:', e);
      }
    },

    getSelectedProject() {
      try {
        const data = storage.getItem(KEYS.SELECTED_PROJECT);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('[TokenStore] Error getting selected project:', e);
        return null;
      }
    },

    setSelectedProject(project) {
      try {
        if (project) {
          storage.setItem(KEYS.SELECTED_PROJECT, JSON.stringify(project));
        } else {
          storage.removeItem(KEYS.SELECTED_PROJECT);
        }
      } catch (e) {
        console.error('[TokenStore] Error setting selected project:', e);
      }
    },

    hasValidAuth() {
      const token = this.getAccessToken();
      if (!token) return false;
      if (this.isTokenExpired()) {
        return !!this.getRefreshToken();
      }
      return true;
    }
  };
})();
