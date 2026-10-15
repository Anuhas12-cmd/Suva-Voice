import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { asyncHandler, httpError, validate } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../util/audit.js';
import { displayPhone, normalizePhone } from '../util/phone.js';
import { hashToken, randomOtp, randomToken, safeEqualHash } from '../util/security.js';
import { send } from '../services/notify.js';
import {
  forgotSchema,
  loginSchema,
  otpSchema,
  passwordChangeSchema,
  profileSchema,
  registerSchema,
  resetSchema
} from '../validators.js';

const router = Router();

function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    phoneDisplay: displayPhone(row.phone),
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified,
    customerId: row.customer_id || null,
    address: row.address || null,
    city: row.city || null,
    preferredLanguage: row.preferred_language || 'en',
    notifyMissed: row.notify_missed,
    notifyCheckins: row.notify_checkins,
    notifyOrders: row.notify_orders,
    notifyPayments: row.notify_payments,
    notifyReminders: row.notify_reminders,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, tv: user.token_version },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function identifier(value) {
  if (value.includes('@')) return { column: 'email', value: value.toLowerCase() };
  return { column: 'phone', value: normalizePhone(value) };
}

async function loadAccount(userId) {
  const { rows } = await query(
    `SELECT u.*, c.id AS customer_id, c.address, c.city, c.preferred_language,
            c.notify_missed, c.notify_checkins, c.notify_orders, c.notify_payments, c.notify_reminders
     FROM users u
     LEFT JOIN customers c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0];
}

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const otp = randomOtp();
  const user = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, status, otp_hash, otp_expires_at)
       VALUES ($1,$2,$3,$4,'customer','pending',$5,$6)
       RETURNING *`,
      [
        req.body.fullName,
        req.body.email,
        req.body.phone,
        await bcrypt.hash(req.body.password, 10),
        hashToken(otp),
        new Date(Date.now() + 10 * 60 * 1000)
      ]
    );
    await client.query('INSERT INTO customers (user_id) VALUES ($1)', [inserted.rows[0].id]);
    await send(client, {
      userId: inserted.rows[0].id,
      audience: 'customer',
      channel: 'email',
      recipientAddress: req.body.email,
      title: 'Verify your Suva Voice account',
      body: 'Your Suva Voice verification code is ready. Enter it in the app to finish creating your account.',
      type: 'otp',
      relatedType: 'user',
      relatedId: inserted.rows[0].id
    });
    await audit(client, {
      userId: inserted.rows[0].id,
      action: 'registered',
      entityType: 'user',
      entityId: inserted.rows[0].id,
      details: {}
    });
    return inserted.rows[0];
  });
  res.status(201).json({
    data: {
      message: 'Enter the verification code to activate your account.',
      email: user.email,
      ...(config.demoMode ? { demoOtp: otp } : {})
    }
  });
}));

router.post('/verify-otp', validate(otpSchema), asyncHandler(async (req, res) => {
  const account = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [req.body.email]);
    const user = rows[0];
    if (!user) throw httpError(400, 'That code is incorrect or has expired');
    if (user.otp_attempts >= 5) throw httpError(400, 'Request a new code and try again');
    const expired = !user.otp_expires_at || new Date(user.otp_expires_at) < new Date();
    if (expired || !safeEqualHash(user.otp_hash, req.body.otp)) {
      await client.query('UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1', [user.id]);
      throw httpError(400, 'That code is incorrect or has expired');
    }
    await client.query(
      `UPDATE users
       SET status = 'active', email_verified = true, otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0, updated_at = now()
       WHERE id = $1`,
      [user.id]
    );
    return user;
  });
  const full = await loadAccount(account.id);
  res.json({ data: { token: signToken(full), user: publicUser(full) } });
}));

router.post('/resend-otp', validate(forgotSchema), asyncHandler(async (req, res) => {
  const ident = identifier(req.body.identifier);
  const { rows } = await query(`SELECT * FROM users WHERE ${ident.column} = $1`, [ident.value]);
  const user = rows[0];
  let demoOtp;
  if (user && user.status === 'pending') {
    demoOtp = randomOtp();
    await query(
      `UPDATE users SET otp_hash = $2, otp_expires_at = $3, otp_attempts = 0, updated_at = now() WHERE id = $1`,
      [user.id, hashToken(demoOtp), new Date(Date.now() + 10 * 60 * 1000)]
    );
  }
  res.json({
    data: {
      message: 'If the account is waiting for verification, a new code is ready.',
      ...(config.demoMode && demoOtp ? { demoOtp } : {})
    }
  });
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const ident = identifier(req.body.identifier);
  const { rows } = await query(`SELECT * FROM users WHERE ${ident.column} = $1`, [ident.value]);
  const user = rows[0];
  const match = user ? await bcrypt.compare(req.body.password, user.password_hash) : false;
  if (!user || !match) {
    throw httpError(401, 'The email, phone, or password is incorrect');
  }
  if (user.status === 'pending') {
    throw httpError(403, 'Enter the verification code to activate your account', { code: 'ACCOUNT_PENDING' });
  }
  if (user.status !== 'active') {
    throw httpError(403, 'This account is disabled. Contact Suva Voice support.');
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit({ query }, {
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    details: { role: user.role }
  });
  const full = await loadAccount(user.id);
  res.json({ data: { token: signToken(full), user: publicUser(full) } });
}));

router.post('/forgot-password', validate(forgotSchema), asyncHandler(async (req, res) => {
  const ident = identifier(req.body.identifier);
  const { rows } = await query(`SELECT * FROM users WHERE ${ident.column} = $1 AND status = 'active'`, [ident.value]);
  const user = rows[0];
  let demoResetToken;
  if (user) {
    demoResetToken = randomToken();
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET reset_token_hash = $2, reset_expires_at = $3, updated_at = now() WHERE id = $1`,
        [user.id, hashToken(demoResetToken), new Date(Date.now() + 30 * 60 * 1000)]
      );
      await send(client, {
        userId: user.id,
        audience: user.role === 'customer' ? 'customer' : 'admin',
        channel: 'email',
        recipientAddress: user.email,
        title: 'Reset your Suva Voice password',
        body: 'A password reset was requested for your Suva Voice account.',
        type: 'password_reset',
        relatedType: 'user',
        relatedId: user.id
      });
    });
  }
  res.json({
    data: {
      message: 'If an account exists, password reset instructions are ready.',
      ...(config.demoMode && demoResetToken ? { demoResetToken } : {})
    }
  });
}));

router.post('/reset-password', validate(resetSchema), asyncHandler(async (req, res) => {
  const tokenHash = hashToken(req.body.token);
  const { rows } = await query(
    `SELECT * FROM users WHERE reset_token_hash = $1 AND reset_expires_at > now()`,
    [tokenHash]
  );
  const user = rows[0];
  if (!user || !safeEqualHash(user.reset_token_hash, req.body.token)) {
    throw httpError(400, 'This reset link is incorrect or has expired');
  }
  await query(
    `UPDATE users
     SET password_hash = $2, reset_token_hash = NULL, reset_expires_at = NULL,
         token_version = token_version + 1, updated_at = now()
     WHERE id = $1`,
    [user.id, await bcrypt.hash(req.body.password, 10)]
  );
  await audit({ query }, {
    userId: user.id,
    action: 'password_reset',
    entityType: 'user',
    entityId: user.id,
    details: {}
  });
  res.json({ data: { message: 'Your password has been updated. Please sign in.' } });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const full = await loadAccount(req.user.id);
  res.json({ data: publicUser(full) });
}));

router.patch('/profile', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET full_name = COALESCE($2, full_name), phone = COALESCE($3, phone), updated_at = now() WHERE id = $1`,
      [req.user.id, req.body.fullName || null, req.body.phone || null]
    );
    if (req.user.customerId) {
      await client.query(
        `UPDATE customers
         SET address = COALESCE($2, address), city = COALESCE($3, city),
             preferred_language = COALESCE($4, preferred_language), updated_at = now()
         WHERE id = $1`,
        [req.user.customerId, req.body.address || null, req.body.city || null, req.body.preferredLanguage || null]
      );
    }
  });
  res.json({ data: publicUser(await loadAccount(req.user.id)) });
}));

router.patch('/password', requireAuth, validate(passwordChangeSchema), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const match = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
  if (!match) throw httpError(400, 'The current password is incorrect');
  await query(
    `UPDATE users
     SET password_hash = $2, token_version = token_version + 1, updated_at = now()
     WHERE id = $1`,
    [req.user.id, await bcrypt.hash(req.body.newPassword, 10)]
  );
  const full = await loadAccount(req.user.id);
  res.json({ data: { token: signToken(full), user: publicUser(full) } });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1', [req.user.id]);
  await audit({ query }, {
    userId: req.user.id,
    action: 'logout',
    entityType: 'user',
    entityId: req.user.id,
    details: {}
  });
  res.json({ data: { message: 'You have signed out.' } });
}));

export default router;
