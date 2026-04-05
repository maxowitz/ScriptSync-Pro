/**
 * ScriptSync Pro - Cloud API Client
 * Authenticated fetch wrapper with auto token refresh.
 */

const CloudAPI = (() => {
  const DEFAULT_SERVER_URL = 'https://server-production-4168.up.railway.app';
  let _serverUrl = null;
  let _refreshing = null; // Promise for in-flight refresh

  function getServerUrl() {
    if (_serverUrl) return _serverUrl;
    try {
      const settings = DataStore.getSettings();
      if (settings && settings.serverUrl) {
        _serverUrl = settings.serverUrl.replace(/\/+$/, '');
        return _serverUrl;
      }
    } catch (e) {
      // DataStore may not be loaded yet
    }
    return DEFAULT_SERVER_URL;
  }

  function setServerUrl(url) {
    _serverUrl = url ? url.replace(/\/+$/, '') : null;
  }

  async function refreshAccessToken() {
    const refreshToken = TokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const res = await fetch(`${getServerUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!res.ok) {
      TokenStore.clearTokens();
      throw new Error('Token refresh failed');
    }

    const data = await res.json();
    TokenStore.setAccessToken(data.accessToken);
    if (data.refreshToken) {
      TokenStore.setRefreshToken(data.refreshToken);
    }
    if (data.expiresIn) {
      TokenStore.setTokenExpiry(Date.now() + data.expiresIn * 1000);
    }
    return data.accessToken;
  }

  async function ensureValidToken() {
    if (TokenStore.isTokenExpired()) {
      if (!_refreshing) {
        _refreshing = refreshAccessToken().finally(() => { _refreshing = null; });
      }
      await _refreshing;
    }
    return TokenStore.getAccessToken();
  }

  async function cloudFetch(path, options = {}) {
    const url = `${getServerUrl()}${path}`;
    const token = await ensureValidToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch(url, {
      ...options,
      headers
    });

    // Auto-retry on 401
    if (res.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      } catch (refreshErr) {
        console.error('[CloudAPI] Token refresh failed:', refreshErr);
        // Dispatch event so UI can handle logout
        document.dispatchEvent(new CustomEvent('auth:expired'));
        throw refreshErr;
      }
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const err = new Error(`API Error ${res.status}: ${errorBody}`);
      err.status = res.status;
      err.body = errorBody;
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res;
  }

  return {
    setServerUrl,
    getServerUrl,

    async login(email, password) {
      const res = await fetch(`${getServerUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Login failed' }));
        throw new Error(body.message || 'Login failed');
      }

      const data = await res.json();
      TokenStore.setAccessToken(data.accessToken);
      TokenStore.setRefreshToken(data.refreshToken);
      if (data.expiresIn) {
        TokenStore.setTokenExpiry(Date.now() + data.expiresIn * 1000);
      }
      if (data.user) {
        TokenStore.setUserData(data.user);
      }
      return data;
    },

    async register(name, email, password) {
      const res = await fetch(`${getServerUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Registration failed' }));
        throw new Error(body.message || 'Registration failed');
      }

      return res.json();
    },

    logout() {
      const token = TokenStore.getAccessToken();
      TokenStore.clearTokens();
      // Fire-and-forget server logout
      if (token) {
        fetch(`${getServerUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {});
      }
    },

    // Convenience methods
    get(path) {
      return cloudFetch(path, { method: 'GET' });
    },

    post(path, body) {
      return cloudFetch(path, {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },

    patch(path, body) {
      return cloudFetch(path, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
    },

    put(path, body) {
      return cloudFetch(path, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    },

    del(path) {
      return cloudFetch(path, { method: 'DELETE' });
    },

    // Upload with binary body (no JSON content type)
    async upload(path, file, filename) {
      const url = `${getServerUrl()}${path}`;
      const token = await ensureValidToken();

      const formData = new FormData();
      formData.append('file', file, filename);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        throw new Error(`Upload Error ${res.status}: ${errorBody}`);
      }

      return res.json();
    },

    // Download raw response (for file downloads)
    async download(path) {
      const url = `${getServerUrl()}${path}`;
      const token = await ensureValidToken();

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Download Error ${res.status}`);
      }

      return res;
    },

    // Projects
    getProjects() {
      return this.get('/projects');
    },

    getProject(id) {
      return this.get(`/projects/${id}`);
    },

    createProject(data) {
      return this.post('/projects', data);
    },

    // Clips
    getClips(projectId) {
      return this.get(`/projects/${projectId}/clips`);
    },

    uploadClip(projectId, file, filename) {
      return this.upload(`/projects/${projectId}/clips`, file, filename);
    },

    // Screenplays
    getScreenplay(projectId) {
      return this.get(`/projects/${projectId}/screenplay`);
    },

    uploadScreenplay(projectId, body) {
      return this.post(`/projects/${projectId}/screenplay`, body);
    },

    // Mappings
    getMappings(projectId) {
      return this.get(`/projects/${projectId}/mappings`);
    },

    saveMappings(projectId, mappings) {
      return this.post(`/projects/${projectId}/mappings`, { mappings });
    },

    // Transcription
    getTranscription(clipId) {
      return this.get(`/clips/${clipId}/transcription`);
    }
  };
})();
