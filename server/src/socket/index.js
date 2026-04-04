const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

/**
 * Set up Socket.io server with JWT authentication and per-project rooms.
 *
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client instance
 * @returns {Server} Socket.io server instance
 */
function setupSocket(server, prisma) {
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.PORTAL_URL || 'http://localhost:5173',
        process.env.PLUGIN_ORIGIN || 'http://localhost:8080',
      ],
      credentials: true,
    },
  });

  // ---------------------------------------------------------------------------
  // JWT authentication middleware
  // ---------------------------------------------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      socket.data.user = { sub: decoded.sub, email: decoded.email, name: decoded.name };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }
      return next(new Error('Invalid token'));
    }
  });

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------
  io.on('connection', (socket) => {
    const { sub: userId, email } = socket.data.user;
    console.log(`Socket connected: ${email} (${socket.id})`);

    // --- join:project --------------------------------------------------------
    socket.on('join:project', async (projectId, callback) => {
      try {
        if (!projectId) {
          return typeof callback === 'function'
            ? callback({ error: 'Project ID required' })
            : undefined;
        }

        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            members: { where: { userId } },
          },
        });

        if (!project) {
          return typeof callback === 'function'
            ? callback({ error: 'Project not found' })
            : undefined;
        }

        const isMember =
          project.ownerId === userId || project.members.length > 0;

        if (!isMember) {
          return typeof callback === 'function'
            ? callback({ error: 'Not a member of this project' })
            : undefined;
        }

        socket.join(`project:${projectId}`);
        console.log(`${email} joined project:${projectId}`);

        if (typeof callback === 'function') {
          callback({ ok: true });
        }
      } catch (err) {
        console.error('join:project error', err);
        if (typeof callback === 'function') {
          callback({ error: 'Internal error' });
        }
      }
    });

    // --- leave:project -------------------------------------------------------
    socket.on('leave:project', (projectId, callback) => {
      if (!projectId) {
        return typeof callback === 'function'
          ? callback({ error: 'Project ID required' })
          : undefined;
      }

      socket.leave(`project:${projectId}`);
      console.log(`${email} left project:${projectId}`);

      if (typeof callback === 'function') {
        callback({ ok: true });
      }
    });

    // --- disconnect ----------------------------------------------------------
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${email} (${socket.id}) — ${reason}`);
    });
  });

  return io;
}

/**
 * Emit an event to all sockets in a project room.
 *
 * @param {Server} io - Socket.io server instance
 * @param {string} projectId - Project ID
 * @param {string} event - Event name
 * @param {*} data - Payload
 */
function emitToProject(io, projectId, event, data) {
  io.to(`project:${projectId}`).emit(event, data);
}

module.exports = { setupSocket, emitToProject };
