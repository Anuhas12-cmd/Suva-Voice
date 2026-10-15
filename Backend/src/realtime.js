import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { isAllowedOrigin } from './cors.js';
import { logger } from './logger.js';

let io;

export function attachSocket(server) {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      }
    }
  });

  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token || '', config.jwtSecret);
      const { rows } = await query(
        `SELECT id, role, status, token_version FROM users WHERE id = $1`,
        [payload.sub]
      );
      const user = rows[0];
      if (!user || user.status !== 'active' || user.token_version !== payload.tv) {
        return next(new Error('unauthorized'));
      }
      socket.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === 'admin' || socket.user.role === 'staff') socket.join('admins');
    logger.info(`Realtime connected (${socket.user.role})`);
  });
  return io;
}

export function emitUpdate(payload, userIds = []) {
  if (!io) return;
  let chain = io.to('admins');
  for (const id of [...new Set(userIds.filter(Boolean))]) {
    chain = chain.to(`user:${id}`);
  }
  chain.emit('suva:update', { ...payload, at: new Date().toISOString() });
}
