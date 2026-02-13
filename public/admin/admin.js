const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30m';

// Login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try later' }
});

// Auth middleware
function adminAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// ---- LOGIN ----
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) return res.status(400).json({ error: 'Missing fields' });

    const [rows] = await pool.execute(
      'SELECT * FROM admins WHERE email=? OR username=? LIMIT 1',
      [emailOrUsername, emailOrUsername]
    );
    const admin = rows[0];

    if (!admin || !admin.is_active) return res.status(403).json({ error: 'Invalid credentials or inactive account' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(403).json({ error: 'Invalid credentials' });

    const payload = { admin_id: admin.admin_id, email: admin.email, role: admin.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000
    });

    // Update last_login
    await pool.execute('UPDATE admins SET last_login=CURRENT_TIMESTAMP WHERE admin_id=?', [admin.admin_id]);

    res.json({ ok: true, admin: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- LOGOUT ----
router.post('/logout', adminAuth, async (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ ok: true });
});

// ---- PROTECTED DASHBOARD ----
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT COUNT(*) AS total_users FROM users');
    res.json({ ok: true, data: { total_users: rows[0].total_users, admin: req.admin } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
