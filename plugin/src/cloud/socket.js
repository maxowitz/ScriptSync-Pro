/**
 * ScriptSync Pro - Socket.io Client
 * Real-time sync via WebSocket connection to cloud server.
 */

const SocketClient = (() => {
  let socket = null;
  let _connected = false;
  let _currentProject = null;
  const _listeners = {};
  let _reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_DELAY_MS = 3000;

  function emit(event, ...args) {
    if (socket && _connected) {
      socket.send(JSON.stringify({ event, args }));
    }
  }

  function notifyListeners(event, data) {
    if (_listeners[event]) {
      _listeners[event].forEach(cb => {
        try { cb(data); } catch (e) {
          console.error(`[Socket] Listener error for ${event}:`, e);
        }
      });
    }
  }

  function updateConnectionStatus(connected) {
    _connected = connected;
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.textContent = connected ? 'Online' : 'Offline';
      statusEl.className = `status-badge ${connected ? 'status-connected' : 'status-disconnected'}`;
    }
    notifyListeners('connection', { connected });
  }

  function handleMessage(rawData) {
    try {
      const message = JSON.parse(rawData);
      const { event, data } = message;

      switch (event) {
        case 'clip:transcribed':
          notifyListeners('clipTranscribed', data);
          break;
        case 'mapping:updated':
          notifyListeners('mappingUpdated', data);
          break;
        case 'screenplay:parsed':
          notifyListeners('screenplayParsed', data);
          break;
        case 'clip:uploaded':
          notifyListeners('clipUploaded', data);
          break;
        case 'project:updated':
          notifyListeners('projectUpdated', data);
          break;
        case 'user:joined':
          notifyListeners('userJoined', data);
          break;
        case 'user:left':
          notifyListeners('userLeft', data);
          break;
        case 'error':
          console.error('[Socket] Server error:', data);
          notifyListeners('error', data);
          break;
        default:
          notifyListeners(event, data);
      }
    } catch (e) {
      console.error('[Socket] Failed to parse message:', e);
    }
  }

  function attemptReconnect(token) {
    if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[Socket] Max reconnect attempts reached');
      notifyListeners('reconnectFailed', {});
      return;
    }

    _reconnectAttempts++;
    console.log(`[Socket] Reconnecting (attempt ${_reconnectAttempts})...`);

    setTimeout(() => {
      if (!_connected) {
        connectWebSocket(token);
      }
    }, RECONNECT_DELAY_MS * Math.min(_reconnectAttempts, 5));
  }

  function connectWebSocket(token) {
    const serverUrl = CloudAPI.getServerUrl().replace(/^http/, 'ws');
    const wsUrl = `${serverUrl}/ws?token=${encodeURIComponent(token)}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[Socket] Connected');
        _reconnectAttempts = 0;
        updateConnectionStatus(true);

        // Re-join current project if any
        if (_currentProject) {
          emit('project:join', { projectId: _currentProject });
        }
      };

      socket.onmessage = (event) => {
        handleMessage(event.data);
      };

      socket.onclose = (event) => {
        console.log('[Socket] Disconnected:', event.code, event.reason);
        updateConnectionStatus(false);
        if (event.code !== 1000) { // Not a clean close
          attemptReconnect(token);
        }
      };

      socket.onerror = (error) => {
        console.error('[Socket] Error:', error);
        updateConnectionStatus(false);
      };
    } catch (e) {
      console.error('[Socket] Failed to create WebSocket:', e);
      updateConnectionStatus(false);
    }
  }

  return {
    connect(token) {
      if (socket) {
        this.disconnect();
      }
      _reconnectAttempts = 0;
      connectWebSocket(token);
    },

    disconnect() {
      if (socket) {
        try {
          socket.close(1000, 'Client disconnect');
        } catch (e) {
          console.warn('[Socket] Error closing socket:', e);
        }
        socket = null;
      }
      _connected = false;
      _currentProject = null;
      updateConnectionStatus(false);
    },

    isConnected() {
      return _connected;
    },

    joinProject(projectId) {
      _currentProject = projectId;
      emit('project:join', { projectId });
    },

    leaveProject() {
      if (_currentProject) {
        emit('project:leave', { projectId: _currentProject });
        _currentProject = null;
      }
    },

    // Event subscription methods
    on(event, callback) {
      if (!_listeners[event]) {
        _listeners[event] = [];
      }
      _listeners[event].push(callback);
    },

    off(event, callback) {
      if (_listeners[event]) {
        _listeners[event] = _listeners[event].filter(cb => cb !== callback);
      }
    },

    // Convenience subscription methods
    onClipTranscribed(callback) {
      this.on('clipTranscribed', callback);
    },

    onMappingUpdated(callback) {
      this.on('mappingUpdated', callback);
    },

    onScreenplayParsed(callback) {
      this.on('screenplayParsed', callback);
    },

    onClipUploaded(callback) {
      this.on('clipUploaded', callback);
    },

    onProjectUpdated(callback) {
      this.on('projectUpdated', callback);
    },

    onConnectionChange(callback) {
      this.on('connection', callback);
    },

    // Send events
    sendMappingUpdate(mapping) {
      emit('mapping:update', mapping);
    },

    sendClipUpdate(clip) {
      emit('clip:update', clip);
    }
  };
})();
