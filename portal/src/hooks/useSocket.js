import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export default function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'TOKEN_EXPIRED') {
        // Token was refreshed by the axios interceptor; reconnect with new token
        const newToken = localStorage.getItem('token');
        if (newToken && newToken !== token) {
          socket.auth = { token: newToken };
          socket.connect();
        }
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinProject = useCallback((projectId) => {
    socketRef.current?.emit('join:project', projectId);
  }, []);

  const leaveProject = useCallback((projectId) => {
    socketRef.current?.emit('leave:project', projectId);
  }, []);

  const onEvent = useCallback((event, callback) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, callback);
    return () => socket.off(event, callback);
  }, []);

  return { joinProject, leaveProject, onEvent };
}
