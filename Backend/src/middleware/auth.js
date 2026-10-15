import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: { message: 'Please sign in to continue' } });
    }
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.token_version, c.id AS customer_id
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || user.token_version !== payload.tv) {
      return res.status(401).json({ error: { message: 'Your session has ended. Please sign in again' } });
    }
    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      customerId: user.customer_id
    };
    return next();
  } catch {
    return res.status(401).json({ error: { message: 'Your session has ended. Please sign in again' } });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'You do not have permission to do that' } });
    }
    return next();
  };
}
