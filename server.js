require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const SqliteDatabase = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

function envFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// ─── SECURITY: Trust proxy (for reverse proxies) ────────────────
app.set('trust proxy', 1);

// ─── SECURITY: Disable x-powered-by ────────────────────────────
app.disable('x-powered-by');

// ─── SECURITY: JWT Secret — MUST be set in .env for production ──
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING') {
  if (IS_PROD) {
    console.error('❌ FATAL: JWT_SECRET must be set in .env for production!');
    process.exit(1);
  }
  console.warn('⚠ WARNING: Using random JWT_SECRET. Set JWT_SECRET in .env for persistence.');
}
const JWT_SECRET_FINAL = JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES = '7d';
const BCRYPT_ROUNDS = 12;

// ─── SECURITY: Helmet — Comprehensive HTTP security headers ────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://cdnjs.cloudflare.com", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://*.unsplash.com", "https://img.icons8.com", "https://*.razorpay.com", "https://www.google-analytics.com"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://vibesouting.in", "https://www.vibesouting.in", "https://api.vibesouting.in", "https://www.google-analytics.com", "https://analytics.google.com"],
      frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true, // nosniff
  xFrameOptions: { action: 'deny' },
}));

// ─── SECURITY: Additional security headers ──────────────────────
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// ─── SECURITY: CORS — strict origin rules ──────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://vibesouting.in,https://www.vibesouting.in,http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const allowedOriginRegexes = (process.env.ALLOWED_ORIGIN_REGEX || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map((pattern) => {
    try { return new RegExp(pattern); } catch (_) { return null; }
  })
  .filter(Boolean);
const allowVercelPreview = envFlag(process.env.ALLOW_VERCEL_PREVIEWS, false);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (allowVercelPreview && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return allowedOriginRegexes.some((re) => re.test(origin));
}

app.use(cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin || 'unknown'}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ─── SECURITY: HPP — HTTP Parameter Pollution protection ────────
app.use(hpp());

// ─── PERFORMANCE: Gzip/Brotli compression ───────────────────────
app.use(compression());

// ─── SECURITY: Cookie Parser (secure cookies) ───────────────────
app.use(cookieParser(process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')));

// ─── SECURITY: Rate Limiting — Brute-force & DDoS mitigation ───
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Relaxed: Railway proxy shares IP across all users
  message: { success: false, message: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 signups per hour per IP
  message: { success: false, message: 'Too many accounts created. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many password reset requests. Try later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/auth/forgot-password', passwordResetLimiter);

// ─── SECURITY: Body size limit ──────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ─── STATIC FILES: Serve in dev/monolith mode, skip in API-only mode ─
if (!process.env.API_ONLY) {
  app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    etag: true,
    maxAge: IS_PROD ? '1d' : 0,
  }));
}

// ─── SECURITY: CSRF Protection — require Authorization header for mutating requests ─
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    // If auth comes from cookie only (no Authorization header), check Origin/Referer
    const authHeader = req.headers.authorization;
    if (!authHeader && req.cookies && req.cookies.vibes_token) {
      const origin = req.headers.origin || req.headers.referer || '';
      let originHost = '';
      try {
        originHost = origin ? new URL(origin).origin : '';
      } catch (_) {
        return res.status(403).json({ success: false, message: 'CSRF check failed' });
      }
      if (origin && !isAllowedOrigin(originHost)) {
        console.warn(`[CSRF] Blocked request from origin: ${originHost}`);
        return res.status(403).json({ success: false, message: 'CSRF check failed' });
      }
    }
  }
  next();
});

// ─── RAZORPAY SETUP ─────────────────────────────────────────────
const RAZORPAY_CONFIGURED = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_REPLACE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE',
});
console.log('Razorpay Key:', RAZORPAY_CONFIGURED ? 'Loaded ✓' : '⚠ Not set — update .env file');

// ─── EMAIL SETUP ────────────────────────────────────────────────
const MAIL_PROVIDER = (process.env.MAIL_PROVIDER || 'smtp').toLowerCase();
const isResendProvider = MAIL_PROVIDER === 'resend';
const isSendgridProvider = MAIL_PROVIDER === 'sendgrid';
const resendApiKey = process.env.RESEND_API_KEY || '';
const sendgridApiKey = process.env.SENDGRID_API_KEY || '';
const smtpHost = process.env.SMTP_HOST || (isSendgridProvider ? 'smtp.sendgrid.net' : 'smtp.gmail.com');
const smtpPort = parseInt(process.env.SMTP_PORT || (isSendgridProvider ? '587' : '587'), 10);
const smtpSecure = process.env.SMTP_SECURE !== undefined
  ? envFlag(process.env.SMTP_SECURE)
  : smtpPort === 465;
const smtpUser = process.env.SMTP_USER || (isSendgridProvider && sendgridApiKey ? 'apikey' : '');
const smtpPass = process.env.SMTP_PASS || (isSendgridProvider ? sendgridApiKey : '');
const smtpFrom = process.env.SMTP_FROM || (isResendProvider ? 'onboarding@resend.dev' : smtpUser);
const smtpFromName = process.env.SMTP_FROM_NAME || 'VIBES@Outing';

const emailEnabled = isResendProvider
  ? !!resendApiKey
  : !!(smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom);
let emailTransportHealthy = false;

// Nodemailer transport (only for SMTP / SendGrid providers)
const emailTransporter = (!isResendProvider && emailEnabled) ? nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: envFlag(process.env.SMTP_REQUIRE_TLS, false),
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
}) : null;

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'unknown';
  const [name, domain] = email.split('@');
  const masked = name.length <= 2 ? `${name[0] || '*'}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${masked}@${domain}`;
}

// ── Resend HTTP send ────────────────────────────────────────────
async function sendViaResend({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${smtpFromName} <${smtpFrom}>`,
      to: [to],
      subject,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || `Resend API error ${res.status}`);
    err.code = `RESEND_${res.status}`;
    err.responseCode = res.status;
    err.response = JSON.stringify(data);
    throw err;
  }
  return { messageId: data.id, response: 'Resend accepted' };
}

async function verifyEmailTransport() {
  if (!emailEnabled) {
    console.warn('Email: disabled. Missing credentials or sender configuration.');
    return;
  }
  if (isResendProvider) {
    // Resend has no verify method; just validate the API key exists
    emailTransportHealthy = !!resendApiKey;
    console.log(`Email: configured ✓ provider=resend from=${smtpFrom}`);
    return;
  }
  if (!emailTransporter) {
    console.warn('Email: disabled. No SMTP transporter created.');
    return;
  }
  try {
    await emailTransporter.verify();
    emailTransportHealthy = true;
    console.log(`Email: configured ✓ provider=${MAIL_PROVIDER} host=${smtpHost} port=${smtpPort} secure=${smtpSecure}`);
  } catch (err) {
    emailTransportHealthy = false;
    console.error('[EMAIL] Transport verify failed:', {
      provider: MAIL_PROVIDER,
      host: smtpHost,
      port: smtpPort,
      user: smtpUser ? `${smtpUser.slice(0, 3)}***` : 'missing',
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
    });
    securityLog('EMAIL_TRANSPORT_VERIFY_FAILED', {
      provider: MAIL_PROVIDER,
      host: smtpHost,
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
    });
  }
}

async function sendEmailWithLogging({ to, subject, html, context }) {
  if (!emailEnabled) {
    console.warn(`[EMAIL] Skipped (${context}) because email is not configured. recipient=${maskEmail(to)}`);
    return { ok: false, reason: 'email_not_configured' };
  }
  try {
    let info;
    if (isResendProvider) {
      info = await sendViaResend({ to, subject, html });
    } else {
      if (!emailTransporter) {
        return { ok: false, reason: 'smtp_not_configured' };
      }
      info = await emailTransporter.sendMail({
        from: `"${sanitize(smtpFromName)}" <${smtpFrom}>`,
        to,
        subject,
        html,
      });
    }
    emailTransportHealthy = true;
    console.log(`[EMAIL] Sent (${context}) recipient=${maskEmail(to)} messageId=${info.messageId || 'unknown'}`);
    return { ok: true, info };
  } catch (err) {
    emailTransportHealthy = false;
    console.error('[EMAIL] Send failed:', {
      context,
      recipient: maskEmail(to),
      provider: MAIL_PROVIDER,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
      message: err.message,
    });
    securityLog('EMAIL_SEND_FAILED', {
      context,
      provider: MAIL_PROVIDER,
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
    });
    return { ok: false, reason: err.code || 'send_failed' };
  }
}

async function sendBookingEmail(userEmail, userName, outingTitle, outingDate, outingLocation, amount, paymentId) {
  const result = await sendEmailWithLogging({
    to: userEmail,
    subject: `✅ Booking Confirmed — ${outingTitle}`,
    context: 'booking_confirmation',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;font-size:24px">🎉 Booking Confirmed!</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
          <p>Hi <strong>${sanitize(userName)}</strong>,</p>
          <p>Your VIBES@Outing is locked in! 🔥</p>
          <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
            <p style="margin:4px 0"><strong>🗓 Outing:</strong> ${sanitize(outingTitle)}</p>
            <p style="margin:4px 0"><strong>📍 Location:</strong> ${sanitize(outingLocation)}</p>
            <p style="margin:4px 0"><strong>📅 Date:</strong> ${sanitize(outingDate)}</p>
            <p style="margin:4px 0"><strong>💰 Amount:</strong> ₹${parseInt(amount)}</p>
            <p style="margin:4px 0"><strong>🔑 Payment ID:</strong> ${sanitize(paymentId)}</p>
          </div>
          <p style="color:#64748B;font-size:14px">See you there! 🚀<br>— Team VIBES@Outing</p>
        </div>
      </div>
    `,
  });
  if (result.ok) {
    securityLog('BOOKING_EMAIL_SENT', { recipient: maskEmail(userEmail) });
  }
}

function buildResetUrl(token) {
  const fallbackBase = process.env.APP_BASE_URL || 'http://localhost:3000';
  const baseUrl = process.env.PASSWORD_RESET_URL || fallbackBase;
  try {
    const url = new URL('/reset-password', baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  } catch (_) {
    const safeBase = baseUrl.replace(/\/$/, '');
    return `${safeBase}/reset-password?token=${token}`;
  }
}

function getWhatsAppLink(phone, outingTitle, outingDate, outingLocation, amount) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const msg = encodeURIComponent(`🎉 *VIBES@Outing — Booking Confirmed!*\n\n🗓 *${outingTitle}*\n📍 ${outingLocation}\n📅 ${outingDate}\n💰 ₹${amount}\n\nSee you there! 🚀`);
  return cleanPhone ? `https://wa.me/91${cleanPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

// ─── DATABASE SETUP (auto-detect SQLite local / PostgreSQL on Railway) ─
const USE_PG = !!process.env.DATABASE_URL;
let pool;
let sqliteDb;

if (USE_PG) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
  console.log('Database: PostgreSQL (Railway) ✓');
} else {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vibes.db');
  sqliteDb = new SqliteDatabase(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  console.log('Database: SQLite (local dev) ✓');
}

// Unified async query interface — same API regardless of backend
async function dbQuery(sql, params = []) {
  if (USE_PG) {
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  }
  // Translate $1,$2... → ? for SQLite
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  // Detect query type
  const trimmed = sqliteSql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    const rows = sqliteDb.prepare(sqliteSql).all(...params);
    return { rows };
  }
  if (trimmed.startsWith('INSERT') && / RETURNING /i.test(sqliteSql)) {
    // SQLite doesn't support RETURNING — strip it, run, then fetch last insert
    const withoutReturning = sqliteSql.replace(/ RETURNING .*/i, '');
    const stmt = sqliteDb.prepare(withoutReturning);
    const info = stmt.run(...params);
    // Build a minimal returning row with id
    return { rows: [{ id: info.lastInsertRowid }] };
  }
  sqliteDb.prepare(sqliteSql).run(...params);
  return { rows: [] };
}

// ─── SECURITY: JWT Auth Middleware ──────────────────────────────
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET_FINAL,
    { expiresIn: JWT_EXPIRES, issuer: 'vibes-outing', audience: 'vibes-outing-app' }
  );
}

function authMiddleware(req, res, next) {
  // Support both Bearer token and httpOnly cookie
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.vibes_token) {
    token = req.cookies.vibes_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL, {
      issuer: 'vibes-outing',
      audience: 'vibes-outing-app',
    });
    req.user = decoded;
    next();
  } catch (err) {
    // Clear invalid cookie
    res.clearCookie('vibes_token');
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    securityLog('UNAUTHORIZED_ADMIN_ACCESS', { userId: req.user?.id, ip: req.ip });
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

// ─── SECURITY: Validation error handler ─────────────────────────
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: errors.array()[0].msg });
    return false;
  }
  return true;
}

// ─── SECURITY: Sanitize HTML to prevent XSS ─────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>"'&]/g, c => ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '&':'&amp;' }[c]));
}

// ─── SECURITY: Logging — failed logins & suspicious activity ────
function securityLog(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, event, ...details };
  console.log(`[SECURITY] ${JSON.stringify(logEntry)}`);

  // Store in DB for monitoring (fire-and-forget)
  dbQuery(
    'INSERT INTO security_logs (event, details, ip, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
    [event, JSON.stringify(details), details.ip || 'unknown']
  ).catch(() => { /* table may not exist yet */ });
}

// ─── SECURITY: Account lockout tracking ─────────────────────────
const loginAttempts = new Map(); // email -> { count, lastAttempt }
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkAccountLockout(identifier) {
  const attempt = loginAttempts.get(identifier);
  if (!attempt) return false;
  if (attempt.count >= LOCKOUT_THRESHOLD) {
    if (Date.now() - attempt.lastAttempt < LOCKOUT_DURATION) return true;
    loginAttempts.delete(identifier); // Reset after lockout period
  }
  return false;
}

function recordFailedLogin(identifier) {
  const attempt = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
  attempt.count++;
  attempt.lastAttempt = Date.now();
  loginAttempts.set(identifier, attempt);
}

function clearLoginAttempts(identifier) {
  loginAttempts.delete(identifier);
}

// ─── DATABASE INITIALIZATION (async) ────────────────────────────
async function initDatabase() {
  if (USE_PG) {
    // PostgreSQL: each table in its own query (pg driver doesn't support multi-statement)
    await dbQuery(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        interests TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        must_change_password INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS outings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        image_url TEXT DEFAULT '',
        date TEXT NOT NULL,
        time TEXT DEFAULT '10:00 AM',
        cost INTEGER NOT NULL,
        max_participants INTEGER DEFAULT 20,
        current_participants INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        participants INTEGER DEFAULT 1,
        participant_names TEXT DEFAULT '',
        total_amount INTEGER NOT NULL,
        token_amount INTEGER DEFAULT 0,
        remaining_amount INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        remaining_payment_status TEXT DEFAULT 'pending',
        payment_id TEXT,
        remaining_payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        budget TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS id_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
        id_type TEXT NOT NULL,
        id_number TEXT NOT NULL,
        full_name TEXT NOT NULL,
        emergency_contact TEXT DEFAULT '',
        emergency_name TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified_at TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        event TEXT NOT NULL,
        details TEXT,
        ip TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_bookings_outing_id ON bookings(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_reviews_outing_id ON reviews(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_chat_outing_id ON chat_messages(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)').catch(() => {});
  } else {
    // SQLite: tables one at a time (exec doesn't support multi-statement in all versions)
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password TEXT NOT NULL, interests TEXT DEFAULT '', role TEXT DEFAULT 'user', must_change_password INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS outings (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, location TEXT NOT NULL, description TEXT, image_url TEXT DEFAULT '', date TEXT NOT NULL, time TEXT DEFAULT '10:00 AM', cost INTEGER NOT NULL, max_participants INTEGER DEFAULT 20, current_participants INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, participants INTEGER DEFAULT 1, participant_names TEXT DEFAULT '', total_amount INTEGER NOT NULL, token_amount INTEGER DEFAULT 0, remaining_amount INTEGER DEFAULT 0, payment_status TEXT DEFAULT 'pending', remaining_payment_status TEXT DEFAULT 'pending', payment_id TEXT, remaining_payment_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL, description TEXT, budget TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), comment TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, outing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, message TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (outing_id) REFERENCES outings(id), FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS id_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, id_type TEXT NOT NULL, id_number TEXT NOT NULL, full_name TEXT NOT NULL, emergency_contact TEXT DEFAULT '', emergency_name TEXT DEFAULT '', status TEXT DEFAULT 'pending', submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP, verified_at DATETIME, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS security_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details TEXT, ip TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_outing_id ON bookings(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_outing_id ON reviews(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_chat_outing_id ON chat_messages(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)`); } catch(e) {}
  }

  // ─── Seed admin + sample data (same for both backends) ─────────
  const adminResult = await dbQuery('SELECT id FROM users WHERE email = $1', ['vibesoutingsupport@gmail.com']);
  if (adminResult.rows.length === 0) {
    const defaultAdminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Vibes2026';
    if (IS_PROD && !process.env.ADMIN_DEFAULT_PASSWORD) {
      console.error('❌ FATAL: Set ADMIN_DEFAULT_PASSWORD in .env for production!');
      process.exit(1);
    }
    const hashedAdminPass = bcrypt.hashSync(defaultAdminPass, BCRYPT_ROUNDS);
    await dbQuery(
      'INSERT INTO users (name, email, phone, password, role, must_change_password) VALUES ($1, $2, $3, $4, $5, $6)',
      ['Admin', 'vibesoutingsupport@gmail.com', '9999999999', hashedAdminPass, 'admin', 1]
    );
    console.warn(`⚠ Default admin created — CHANGE PASSWORD IMMEDIATELY! (password: ${defaultAdminPass})`);
  }

  const outingsCount = (await dbQuery('SELECT COUNT(*) AS count FROM outings')).rows[0].count;
  if (parseInt(outingsCount) === 0) {
    const sampleOutings = loadDefaultOutings();
    for (const o of sampleOutings) {
      await dbQuery(
        'INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)',
        [o.title, o.location, o.description, o.date, o.time, o.cost, o.max, o.img]
      );
    }
  }

  console.log(`✅ Database initialized (${USE_PG ? 'PostgreSQL' : 'SQLite'})`);
}

function loadDefaultOutings() {
  const catalogPath = path.join(__dirname, 'data', 'default-outings.json');
  try {
    const raw = fs.readFileSync(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load default outings catalog:', error.message);
    return [];
  }
}

// ─── SECURITY: Set secure cookie helper ─────────────────────────
function setAuthCookie(res, token) {
  res.cookie('vibes_token', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'strict', // 'none' required for cross-origin (Vercel→Railway)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

// ─── AUTH ROUTES (SECURED) ───────────────────────────────────────
app.post('/api/auth/signup', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).escape(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number'),
  body('phone').optional().trim().isLength({ max: 15 }).matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone number'),
  body('interests').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { name, email, phone, password, interests } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await dbQuery(
      'INSERT INTO users (name, email, phone, password, interests) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [sanitize(name), email, sanitize(phone || ''), hashedPassword, sanitize(interests || '')]
    );
    const user = (await dbQuery('SELECT id, name, email, role FROM users WHERE id = $1', [result.rows[0].id])).rows[0];
    const token = generateToken(user);
    setAuthCookie(res, token);
    securityLog('SIGNUP', { userId: user.id, email, ip: req.ip });
    res.json({ success: true, user, token });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Email already exists' });
  }
});

app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { email, password } = req.body;
  const lockoutKey = email; // Use email only — Railway proxy shares IP across users

  // Check account lockout
  if (checkAccountLockout(lockoutKey)) {
    securityLog('ACCOUNT_LOCKED', { email, ip: req.ip });
    return res.status(429).json({ success: false, message: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' });
  }

  const userResult = await dbQuery('SELECT id, name, email, role, password as hashed FROM users WHERE email = $1', [email]);
  const user = userResult.rows[0];

  // Constant-time response for non-existent users (prevent user enumeration)
  if (!user) {
    await bcrypt.hash(password, BCRYPT_ROUNDS); // Waste time to prevent timing attacks
    recordFailedLogin(lockoutKey);
    securityLog('FAILED_LOGIN', { email, reason: 'user_not_found', ip: req.ip });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.hashed);
  if (!match) {
    recordFailedLogin(lockoutKey);
    securityLog('FAILED_LOGIN', { email, reason: 'wrong_password', ip: req.ip, attempts: loginAttempts.get(lockoutKey)?.count });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  clearLoginAttempts(lockoutKey);
  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  setAuthCookie(res, token);
  securityLog('LOGIN_SUCCESS', { userId: user.id, email, ip: req.ip });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

// ─── SECURITY: Logout — clear cookie ────────────────────────────
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('vibes_token');
  res.json({ success: true });
});

// ─── OUTING ROUTES ──────────────────────────────────────────────
app.get('/api/outings', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM outings WHERE status = $1 ORDER BY date ASC', ['active']);
    res.json(result.rows);
  } catch (error) {
    console.error('[/api/outings] Failed to fetch outings:', error.message);
    res.status(500).json({ error: 'Failed to fetch outings' });
  }
});

app.get('/api/outings/:id', [
  param('id').isInt({ min: 1 }).withMessage('Invalid outing ID'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery('SELECT * FROM outings WHERE id = $1', [req.params.id]);
  if (result.rows[0]) res.json(result.rows[0]);
  else res.status(404).json({ message: 'Not found' });
});

app.post('/api/outings', authMiddleware, adminMiddleware, [
  body('title').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('location').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 2000 }).escape(),
  body('date').isISO8601().withMessage('Valid date required'),
  body('time').optional().trim().isLength({ max: 20 }),
  body('cost').isInt({ min: 0, max: 1000000 }).withMessage('Valid cost required'),
  body('max_participants').optional().isInt({ min: 1, max: 1000 }),
  body('image_url').optional().trim().isURL().withMessage('Valid image URL required'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, location, description, date, time, cost, max_participants, image_url } = req.body;
  const result = await dbQuery(
    'INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [sanitize(title), sanitize(location), sanitize(description || ''), date, sanitize(time || '10:00 AM'), cost, max_participants || 20, image_url || '', req.user.id]
  );
  res.json({ success: true, id: result.rows[0].id });
});

app.put('/api/outings/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('title').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('location').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 2000 }).escape(),
  body('date').isISO8601(),
  body('cost').isInt({ min: 0, max: 1000000 }),
  body('status').isIn(['active', 'inactive', 'cancelled']),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, location, description, date, time, cost, max_participants, image_url, status } = req.body;
  await dbQuery(
    'UPDATE outings SET title=$1, location=$2, description=$3, date=$4, time=$5, cost=$6, max_participants=$7, image_url=$8, status=$9 WHERE id=$10',
    [sanitize(title), sanitize(location), sanitize(description || ''), date, sanitize(time), cost, max_participants, image_url || '', status, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/outings/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('DELETE FROM outings WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ─── BOOKING ROUTES (RAZORPAY — 20% TOKEN BOOKING) ─────────────
app.post('/api/bookings/create-order', authMiddleware, [
  body('outing_id').isInt({ min: 1 }),
  body('participants').isInt({ min: 1, max: 50 }),
  body('participant_names').optional().trim().isLength({ max: 1000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, participants, participant_names } = req.body;
  const user_id = req.user.id; // IDOR prevention: use authenticated user

  const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1', [outing_id]);
  const outing = outingResult.rows[0];
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.status !== 'active') return res.status(400).json({ message: 'Outing is not active' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }
  const totalAmount = outing.cost * participants;
  const tokenAmount = Math.ceil(totalAmount * 0.20);
  const remainingAmount = totalAmount - tokenAmount;
  try {
    const order = await razorpay.orders.create({
      amount: tokenAmount * 100,
      currency: 'INR',
      receipt: 'outing_' + outing_id + '_' + Date.now(),
      notes: { user_id: String(user_id), outing_id: String(outing_id), participants: String(participants), type: 'token' }
    });
    const result = await dbQuery(
      'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [user_id, outing_id, participants, sanitize(participant_names || ''), totalAmount, tokenAmount, remainingAmount, 'pending', 'pending', order.id]
    );
    res.json({ success: true, order_id: order.id, booking_id: result.rows[0].id, amount: tokenAmount, total_amount: totalAmount, remaining_amount: remainingAmount, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ message: 'Payment gateway error. Check your Razorpay API keys in .env file.' });
  }
});

app.post('/api/bookings/verify-payment', authMiddleware, [
  body('razorpay_order_id').trim().notEmpty(),
  body('razorpay_payment_id').trim().notEmpty(),
  body('razorpay_signature').trim().notEmpty(),
  body('booking_id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

  // IDOR prevention: verify booking belongs to authenticated user
  const bookingResult = await dbQuery('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [booking_id, req.user.id]);
  const booking = bookingResult.rows[0];
  if (!booking) return res.status(403).json({ success: false, message: 'Booking not found or access denied' });

  const body_str = razorpay_order_id + '|' + razorpay_payment_id;
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    securityLog('PAYMENT_NO_SECRET', { ip: req.ip });
    return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
  }
  const expectedSignature = crypto.createHmac('sha256', razorpaySecret)
    .update(body_str).digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature))) {
    await dbQuery('UPDATE bookings SET payment_status = $1, payment_id = $2 WHERE id = $3', ['paid', razorpay_payment_id, booking_id]);
    await dbQuery('UPDATE outings SET current_participants = current_participants + $1 WHERE id = $2', [booking.participants, booking.outing_id]);
    const user = (await dbQuery('SELECT * FROM users WHERE id = $1', [booking.user_id])).rows[0];
    const outing = (await dbQuery('SELECT * FROM outings WHERE id = $1', [booking.outing_id])).rows[0];
    if (user && outing) {
      sendBookingEmail(user.email, user.name, outing.title, outing.date, outing.location, booking.token_amount, razorpay_payment_id);
    }
    securityLog('PAYMENT_SUCCESS', { userId: req.user.id, bookingId: booking_id, paymentId: razorpay_payment_id, ip: req.ip });
    const whatsappLink = (user && outing) ? getWhatsAppLink(user.phone, outing.title, outing.date, outing.location, booking.token_amount) : '';
    res.json({ success: true, payment_id: razorpay_payment_id, whatsapp_link: whatsappLink, token_amount: booking.token_amount, remaining_amount: booking.remaining_amount, outing_date: outing ? outing.date : '' });
  } else {
    await dbQuery('UPDATE bookings SET payment_status = $1 WHERE id = $2', ['failed', booking_id]);
    securityLog('PAYMENT_VERIFICATION_FAILED', { userId: req.user.id, bookingId: booking_id, ip: req.ip });
    res.status(400).json({ success: false, message: 'Payment verification failed' });
  }
});

app.post('/api/bookings/pay-remaining', authMiddleware, [
  body('booking_id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { booking_id } = req.body;
  // IDOR prevention
  const bookingResult = await dbQuery(
    'SELECT b.*, o.date as outing_date FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.id = $1 AND b.user_id = $2',
    [booking_id, req.user.id]
  );
  const booking = bookingResult.rows[0];
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.payment_status !== 'paid') return res.status(400).json({ message: 'Token payment not completed yet' });
  if (booking.remaining_payment_status === 'paid') return res.status(400).json({ message: 'Already fully paid' });

  const tripDate = new Date(booking.outing_date);
  const deadline = new Date(tripDate.getTime() - 24 * 60 * 60 * 1000);
  if (new Date() > deadline) return res.status(400).json({ message: 'Payment deadline passed (24hrs before trip). Contact support.' });

  try {
    const order = await razorpay.orders.create({
      amount: booking.remaining_amount * 100,
      currency: 'INR',
      receipt: 'remaining_' + booking_id + '_' + Date.now(),
      notes: { booking_id: String(booking_id), type: 'remaining' }
    });
    res.json({ success: true, order_id: order.id, amount: booking.remaining_amount, key_id: process.env.RAZORPAY_KEY_ID, booking_id });
  } catch (err) {
    console.error('Razorpay remaining order error:', err);
    res.status(500).json({ message: 'Payment gateway error' });
  }
});

app.post('/api/bookings/verify-remaining', authMiddleware, [
  body('razorpay_order_id').trim().notEmpty(),
  body('razorpay_payment_id').trim().notEmpty(),
  body('razorpay_signature').trim().notEmpty(),
  body('booking_id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

  // IDOR prevention
  const bookingResult = await dbQuery('SELECT * FROM bookings WHERE id = $1 AND user_id = $2', [booking_id, req.user.id]);
  const booking = bookingResult.rows[0];
  if (!booking) return res.status(403).json({ success: false, message: 'Access denied' });

  const body_str = razorpay_order_id + '|' + razorpay_payment_id;
  const razorpaySecret2 = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret2) return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
  const expectedSignature = crypto.createHmac('sha256', razorpaySecret2)
    .update(body_str).digest('hex');
  if (crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature))) {
    await dbQuery('UPDATE bookings SET remaining_payment_status = $1, remaining_payment_id = $2 WHERE id = $3', ['paid', razorpay_payment_id, booking_id]);
    res.json({ success: true, payment_id: razorpay_payment_id });
  } else {
    res.status(400).json({ success: false, message: 'Payment verification failed' });
  }
});

// Fallback: direct booking without Razorpay (DISABLED in production)
app.post('/api/bookings', authMiddleware, async (req, res) => {
  if (IS_PROD) return res.status(403).json({ message: 'Demo bookings disabled in production' });

  const { outing_id, participants, participant_names, total_amount } = req.body;
  const user_id = req.user.id; // IDOR prevention
  const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1', [outing_id]);
  const outing = outingResult.rows[0];
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }
  const tokenAmount = Math.ceil(total_amount * 0.20);
  const remainingAmount = total_amount - tokenAmount;
  const paymentId = 'pay_demo_' + crypto.randomBytes(8).toString('hex');
  const result = await dbQuery(
    'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [user_id, outing_id, participants, sanitize(participant_names || ''), total_amount, tokenAmount, remainingAmount, 'paid', 'pending', paymentId]
  );
  await dbQuery('UPDATE outings SET current_participants = current_participants + $1 WHERE id = $2', [participants, outing_id]);
  res.json({ success: true, booking_id: result.rows[0].id, payment_id: paymentId, token_amount: tokenAmount, remaining_amount: remainingAmount });
});

app.get('/api/bookings/:userId', authMiddleware, [
  param('userId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  // IDOR prevention: Users can only see their own bookings
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const bookingsResult = await dbQuery(`
    SELECT b.*, o.title, o.location, o.date, o.time, o.image_url
    FROM bookings b JOIN outings o ON b.outing_id = o.id
    WHERE b.user_id = $1 ORDER BY b.created_at DESC
  `, [req.params.userId]);
  const enriched = bookingsResult.rows.map(b => {
    const tripDate = new Date(b.date);
    const deadline = new Date(tripDate.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();
    return { ...b, deadline: deadline.toISOString(), deadline_passed: now > deadline, hours_until_deadline: Math.max(0, Math.round((deadline - now) / (1000 * 60 * 60))) };
  });
  res.json(enriched);
});

// ─── PUBLIC STATS (for homepage) ────────────────────────────────
app.get('/api/public-stats', async (req, res) => {
  const outings = (await dbQuery("SELECT COUNT(*) as count FROM outings WHERE status = $1", ['active'])).rows[0];
  const users = (await dbQuery("SELECT COUNT(*) as count FROM users WHERE role = $1", ['user'])).rows[0];
  const destinations = (await dbQuery("SELECT COUNT(DISTINCT location) as count FROM outings WHERE status = $1", ['active'])).rows[0];
  const avgReview = (await dbQuery('SELECT AVG(rating) as avg FROM reviews')).rows[0];
  res.json({
    outings: parseInt(outings.count),
    users: parseInt(users.count),
    destinations: parseInt(destinations.count),
    avgRating: Math.round((parseFloat(avgReview.avg) || 4.8) * 10) / 10
  });
});

// ─── SUGGESTION ROUTES ──────────────────────────────────────────
app.get('/api/razorpay-key', (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID || '' });
});

app.post('/api/suggestions', authMiddleware, [
  body('title').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('location').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 2000 }).escape(),
  body('budget').optional().trim().isLength({ max: 100 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, location, description, budget } = req.body;
  const user_id = req.user.id; // IDOR prevention
  await dbQuery(
    'INSERT INTO suggestions (user_id, title, location, description, budget) VALUES ($1,$2,$3,$4,$5)',
    [user_id, sanitize(title), sanitize(location), sanitize(description || ''), sanitize(budget || '')]
  );
  res.json({ success: true });
});

app.get('/api/suggestions', async (req, res) => {
  const result = await dbQuery('SELECT s.*, u.name as user_name FROM suggestions s JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC');
  res.json(result.rows);
});

app.put('/api/suggestions/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('status').isIn(['approved', 'rejected']).withMessage('Invalid status'),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('UPDATE suggestions SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
  res.json({ success: true });
});

// ─── ADMIN ROUTES ───────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  const users = (await dbQuery("SELECT COUNT(*) as count FROM users WHERE role = $1", ['user'])).rows[0];
  const outings = (await dbQuery('SELECT COUNT(*) as count FROM outings')).rows[0];
  const bookings = (await dbQuery('SELECT COUNT(*) as count FROM bookings')).rows[0];
  const revenue = (await dbQuery("SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE payment_status = $1", ['paid'])).rows[0];
  const pendingSuggestions = (await dbQuery("SELECT COUNT(*) as count FROM suggestions WHERE status = $1", ['pending'])).rows[0];
  const pendingVerifications = (await dbQuery("SELECT COUNT(*) as count FROM id_verifications WHERE status = $1", ['pending'])).rows[0];
  const totalReviews = (await dbQuery('SELECT COUNT(*) as count FROM reviews')).rows[0];
  const recentSecurityEvents = (await dbQuery(
    USE_PG
      ? "SELECT COUNT(*) as count FROM security_logs WHERE created_at > NOW() - INTERVAL '24 hours'"
      : "SELECT COUNT(*) as count FROM security_logs WHERE created_at > datetime('now', '-24 hours')"
  )).rows[0];
  res.json({
    users: parseInt(users.count),
    outings: parseInt(outings.count),
    bookings: parseInt(bookings.count),
    revenue: parseInt(revenue.total),
    pendingSuggestions: parseInt(pendingSuggestions.count),
    pendingVerifications: parseInt(pendingVerifications.count),
    totalReviews: parseInt(totalReviews.count),
    securityEvents24h: parseInt(recentSecurityEvents.count)
  });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  // Never expose password hashes
  const result = await dbQuery('SELECT id, name, email, phone, interests, role, created_at FROM users ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/admin/reset-password', authMiddleware, adminMiddleware, [
  body('user_id').isInt().withMessage('Valid user ID required'),
  body('new_password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { user_id, new_password } = req.body;
  const userResult = await dbQuery('SELECT id, name, email FROM users WHERE id = $1', [user_id]);
  const user = userResult.rows[0];
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  await dbQuery('UPDATE users SET password = $1 WHERE id = $2', [hashed, user_id]);
  securityLog('ADMIN_PASSWORD_RESET', { adminId: req.user.id, targetUserId: user_id, ip: req.ip });
  res.json({ success: true, message: `Password reset for ${user.name} (${user.email})` });
});

app.get('/api/admin/bookings', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(`
    SELECT b.*, u.name as user_name, u.email as user_email, o.title as outing_title
    FROM bookings b JOIN users u ON b.user_id = u.id JOIN outings o ON b.outing_id = o.id
    ORDER BY b.created_at DESC
  `);
  res.json(result.rows);
});

// ─── SECURITY: Admin — Security Logs ────────────────────────────
app.get('/api/admin/security-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 100');
  res.json(result.rows);
});

// ─── REVIEW ROUTES ──────────────────────────────────────────────
app.post('/api/reviews', authMiddleware, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('comment').optional().trim().isLength({ max: 1000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, rating, comment } = req.body;
  const user_id = req.user.id;
  const existing = (await dbQuery('SELECT id FROM reviews WHERE user_id = $1 AND outing_id = $2', [user_id, outing_id])).rows[0];
  if (existing) return res.status(400).json({ message: 'You already reviewed this outing' });
  const hasBooked = (await dbQuery('SELECT id FROM bookings WHERE user_id = $1 AND outing_id = $2 AND payment_status = $3', [user_id, outing_id, 'paid'])).rows[0];
  if (!hasBooked) return res.status(403).json({ message: 'You must book this outing before reviewing' });
  await dbQuery('INSERT INTO reviews (user_id, outing_id, rating, comment) VALUES ($1,$2,$3,$4)', [user_id, outing_id, rating, sanitize(comment || '')]);
  res.json({ success: true });
});

app.get('/api/reviews/:outingId', [
  param('outingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const reviews = (await dbQuery('SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.outing_id = $1 ORDER BY r.created_at DESC', [req.params.outingId])).rows;
  const avg = (await dbQuery('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE outing_id = $1', [req.params.outingId])).rows[0];
  res.json({ reviews, average: Math.round((parseFloat(avg.avg) || 0) * 10) / 10, count: parseInt(avg.count) });
});

// ─── CHAT ROUTES ────────────────────────────────────────────────
app.get('/api/chat/:outingId', authMiddleware, [
  param('outingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery('SELECT c.*, u.name as user_name FROM chat_messages c JOIN users u ON c.user_id = u.id WHERE c.outing_id = $1 ORDER BY c.created_at ASC', [req.params.outingId]);
  res.json(result.rows);
});

app.post('/api/chat', authMiddleware, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('message').trim().notEmpty().withMessage('Message required').isLength({ max: 2000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, message } = req.body;
  const user_id = req.user.id;
  const hasBooked = (await dbQuery('SELECT id FROM bookings WHERE user_id = $1 AND outing_id = $2 AND payment_status = $3', [user_id, outing_id, 'paid'])).rows[0];
  if (!hasBooked) return res.status(403).json({ message: 'Only booked participants can chat' });
  await dbQuery('INSERT INTO chat_messages (outing_id, user_id, message) VALUES ($1,$2,$3)', [outing_id, user_id, sanitize(message)]);
  res.json({ success: true });
});

// ─── ID VERIFICATION ROUTES ─────────────────────────────────────
app.post('/api/verify-id', authMiddleware, [
  body('id_type').isIn(['aadhaar', 'pan', 'driving_license', 'passport']).withMessage('Invalid ID type'),
  body('id_number').trim().notEmpty().isLength({ min: 4, max: 30 }).withMessage('Valid ID number required'),
  body('full_name').trim().notEmpty().isLength({ max: 100 }).escape(),
  body('emergency_contact').optional().trim().isLength({ max: 15 }).matches(/^[0-9+\-\s()]*$/),
  body('emergency_name').optional().trim().isLength({ max: 100 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { id_type, id_number, full_name, emergency_contact, emergency_name } = req.body;
  const user_id = req.user.id;
  try {
    await dbQuery(
      `INSERT INTO id_verifications (user_id, id_type, id_number, full_name, emergency_contact, emergency_name, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET id_type=excluded.id_type, id_number=excluded.id_number, full_name=excluded.full_name, emergency_contact=excluded.emergency_contact, emergency_name=excluded.emergency_name, status=excluded.status, submitted_at=CURRENT_TIMESTAMP`,
      [user_id, sanitize(id_type), sanitize(id_number), sanitize(full_name), sanitize(emergency_contact || ''), sanitize(emergency_name || ''), 'pending']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ message: 'Verification submission failed' });
  }
});

app.get('/api/verify-id/:userId', authMiddleware, [
  param('userId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  // IDOR prevention
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const result = await dbQuery('SELECT * FROM id_verifications WHERE user_id = $1', [req.params.userId]);
  res.json(result.rows[0] || { status: 'none' });
});

app.get('/api/admin/verifications', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery('SELECT v.*, u.name as user_name, u.email FROM id_verifications v JOIN users u ON v.user_id = u.id ORDER BY v.submitted_at DESC');
  res.json(result.rows);
});

app.put('/api/admin/verifications/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('status').isIn(['verified', 'rejected']).withMessage('Invalid status'),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('UPDATE id_verifications SET status = $1, verified_at = CURRENT_TIMESTAMP WHERE id = $2', [req.body.status, req.params.id]);
  res.json({ success: true });
});

// ─── AI RECOMMENDATION ROUTE ────────────────────────────────────
app.get('/api/recommendations/:userId', authMiddleware, [
  param('userId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  // IDOR prevention
  if (req.user.id !== parseInt(req.params.userId)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const userResult = await dbQuery('SELECT * FROM users WHERE id = $1', [req.params.userId]);
  const user = userResult.rows[0];
  if (!user) return res.json([]);
  const userInterests = (user.interests || '').toLowerCase().split(',').map(i => i.trim()).filter(Boolean);
  const bookedOutingIds = (await dbQuery('SELECT outing_id FROM bookings WHERE user_id = $1 AND payment_status = $2', [req.params.userId, 'paid'])).rows.map(b => b.outing_id);
  const allOutings = (await dbQuery("SELECT * FROM outings WHERE status = $1 ORDER BY date ASC", ['active'])).rows;

  // Pre-fetch data for scoring to avoid N+1 queries
  const bookedLocations = (await dbQuery(
    'SELECT DISTINCT o.location FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = $1 AND b.payment_status = $2',
    [req.params.userId, 'paid']
  )).rows.map(r => r.location.toLowerCase());
  const avgSpendResult = (await dbQuery(
    'SELECT AVG(o.cost) as avg FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = $1 AND b.payment_status = $2',
    [req.params.userId, 'paid']
  )).rows[0];
  const avgSpend = parseFloat(avgSpendResult.avg) || null;

  // Pre-fetch review averages for all active outings
  const reviewAvgs = {};
  const reviewRows = (await dbQuery('SELECT outing_id, AVG(rating) as avg FROM reviews GROUP BY outing_id')).rows;
  for (const r of reviewRows) reviewAvgs[r.outing_id] = parseFloat(r.avg);

  const scored = allOutings
    .filter(o => !bookedOutingIds.includes(o.id))
    .map(o => {
      let score = 0;
      const desc = ((o.description || '') + ' ' + o.title + ' ' + o.location).toLowerCase();
      userInterests.forEach(interest => { if (desc.includes(interest)) score += 30; });
      if (bookedLocations.includes(o.location.toLowerCase())) score += 15;
      if (avgSpend) { const diff = Math.abs(o.cost - avgSpend); if (diff < 200) score += 20; else if (diff < 500) score += 10; }
      score += Math.min(o.current_participants * 2, 20);
      const daysAway = (new Date(o.date) - new Date()) / (1000*60*60*24);
      if (daysAway > 0 && daysAway < 30) score += 15;
      else if (daysAway > 0 && daysAway < 60) score += 8;
      const reviewAvg = reviewAvgs[o.id];
      if (reviewAvg) score += reviewAvg * 5;
      return { ...o, score, matchReasons: getMatchReasons(o, userInterests, bookedLocations, avgSpend) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  res.json(scored);
});

function getMatchReasons(outing, interests, bookedLocations, avgBudget) {
  const reasons = [];
  const desc = ((outing.description || '') + ' ' + outing.title + ' ' + outing.location).toLowerCase();
  interests.forEach(i => { if (desc.includes(i)) reasons.push(`Matches your interest: ${i}`); });
  if (bookedLocations.includes(outing.location.toLowerCase())) reasons.push(`You've enjoyed ${outing.location} before`);
  if (avgBudget && Math.abs(outing.cost - avgBudget) < 200) reasons.push('Fits your budget range');
  if (outing.current_participants > 5) reasons.push('Popular with others');
  if (reasons.length === 0) reasons.push('Trending outing');
  return reasons;
}

// ─── WHATSAPP LINK ROUTE ────────────────────────────────────────
app.post('/api/whatsapp-link', authMiddleware, (req, res) => {
  const { phone, outing_title, outing_date, outing_location, amount } = req.body;
  const link = getWhatsAppLink(phone, outing_title, outing_date, outing_location, amount);
  res.json({ link });
});

// ─── EMAIL HEALTH CHECK (admin only) ────────────────────────────
app.post('/api/admin/test-email', authMiddleware, adminMiddleware, [
  body('to').isEmail().withMessage('Valid email required').normalizeEmail(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { to } = req.body;
  const result = await sendEmailWithLogging({
    to,
    subject: 'VIBES@Outing — Email Test',
    context: 'admin_test',
    html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Email is working!</h2><p>This is a test email from VIBES@Outing.</p><p>Time: ${new Date().toISOString()}</p></div>`,
  });
  res.json({
    success: result.ok,
    message: result.ok ? `Test email sent to ${to}` : `Email failed: ${result.reason}`,
    emailEnabled,
    provider: MAIL_PROVIDER,
    host: smtpHost,
    port: smtpPort,
    transportHealthy: emailTransportHealthy,
  });
});

// ─── FORGOT PASSWORD ────────────────────────────────────────────
app.post('/api/auth/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { email } = req.body;

  try {
    if (!emailEnabled) {
      console.error('[PASSWORD_RESET] Email service unavailable: SMTP not configured.');
      return res.status(503).json({ success: false, message: 'Password reset service is temporarily unavailable. Please try again shortly.' });
    }

    const userResult = await dbQuery('SELECT id, name FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = userResult.rows[0];

    if (!user) {
      securityLog('PASSWORD_RESET_REQUEST_UNKNOWN_EMAIL', { emailHash: crypto.createHash('sha256').update(email).digest('hex'), ip: req.ip });
      return res.json({ success: true, message: 'If your email is registered, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    await dbQuery('UPDATE password_resets SET used = 1 WHERE user_id = $1 AND used = 0', [user.id]);
    await dbQuery('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2,$3)', [user.id, hashedToken, expiresAt]);
    securityLog('PASSWORD_RESET_REQUESTED', { userId: user.id, ip: req.ip, email: maskEmail(email) });

    const resetUrl = buildResetUrl(token);
    const emailResult = await sendEmailWithLogging({
      to: email,
      subject: 'Reset your VIBES@Outing password',
      context: 'password_reset',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;font-size:24px">🔑 Password Reset</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
          <p>Hi <strong>${sanitize(user.name)}</strong>,</p>
          <p>We received a request to reset your password.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#6C3CE1;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a></p>
          <p style="color:#64748B;font-size:14px">This link is valid for 30 minutes. If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>`,
    });

    if (!emailResult.ok) {
      console.error('[PASSWORD_RESET] Failed to deliver reset email after token generation.', {
        reason: emailResult.reason,
        email: maskEmail(email),
      });
      securityLog('PASSWORD_RESET_EMAIL_FAILED', { userId: user.id, reason: emailResult.reason, ip: req.ip });
    } else {
      securityLog('PASSWORD_RESET_EMAIL_SENT', { userId: user.id, ip: req.ip });
    }

    return res.json({ success: true, message: 'If your email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('[PASSWORD_RESET] Route error:', {
      email: maskEmail(email),
      code: err.code,
      message: err.message,
      stack: IS_PROD ? undefined : err.stack,
    });
    securityLog('PASSWORD_RESET_ROUTE_ERROR', { ip: req.ip, code: err.code, message: err.message });
    return res.status(500).json({ success: false, message: 'Unable to process request right now. Please try again shortly.' });
  }
});

app.post('/api/auth/reset-password', [
  body('token').trim().notEmpty().isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Invalid token'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { token, password } = req.body;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const resetResult = await dbQuery('SELECT * FROM password_resets WHERE token = $1 AND used = 0', [hashedToken]);
  const reset = resetResult.rows[0];
  if (!reset) return res.status(400).json({ success: false, message: 'Invalid or expired token' });
  if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });
  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await dbQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, reset.user_id]);
  await dbQuery('UPDATE password_resets SET used = 1 WHERE id = $1', [reset.id]);
  // Invalidate all unused reset tokens for this user
  await dbQuery('UPDATE password_resets SET used = 1 WHERE user_id = $1 AND used = 0', [reset.user_id]);
  securityLog('PASSWORD_RESET_COMPLETED', { userId: reset.user_id });
  res.json({ success: true });
});

// ─── SECURITY: Global error handler — never leak stack traces ───
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  securityLog('UNHANDLED_ERROR', { error: err.message, path: req.path, ip: req.ip });
  res.status(err.status || 500).json({
    success: false,
    message: IS_PROD ? 'Internal server error' : err.message,
  });
});

// ─── SECURITY: 404 handler ──────────────────────────────────────
app.get('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// ─── SPA FALLBACK (only in monolith mode) ───────────────────────
if (!process.env.API_ONLY) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// ─── START SERVER (after DB init) ───────────────────────────────
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 VIBES@Outing Platform running at http://localhost:${PORT}`);
    console.log(`   Environment: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log('   Database: PostgreSQL ✓');
    if (!IS_PROD) console.log(`   Admin Login: vibesoutingsupport@gmail.com / ${process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Vibes2026'}`);
    console.log('');
    verifyEmailTransport().catch((err) => {
      console.error('Email transport verification error:', err.message);
    });
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err.message || err.code || err);
  console.error('   DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@') : 'NOT SET');
  process.exit(1);
});
