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
const QRCode = require('qrcode');
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
  message: { success: false, message: 'Too many requests. Please try again later.' },
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

// ─── HEALTH CHECK (before body parsing, no rate limit) ──────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─── LOGGING: Request logger for API debugging ─────────────────
app.use('/api/', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 3000 || res.statusCode >= 400) {
      console.log(`[API] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms) origin=${req.headers.origin || 'none'}`);
    }
  });
  next();
});

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
  app.use('/outing_pic', express.static(path.join(__dirname, 'outing_pic'), {
    dotfiles: 'deny',
    etag: true,
    maxAge: IS_PROD ? '7d' : 0,
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

async function sendBoardingPassEmail(userEmail, userName, outing, booking, digitalPass) {
  const result = await sendEmailWithLogging({
    to: userEmail,
    subject: `🎫 Your Digital Trip Pass — ${sanitize(outing.title)}`,
    context: 'boarding_pass',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;font-size:22px">🎫 Digital Trip Pass</h1>
          <p style="margin:8px 0 0;opacity:.85;font-size:14px">VIBES@Outing — Official Boarding Pass</p>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
          <p>Hi <strong>${sanitize(userName)}</strong>,</p>
          <p>Your digital trip pass has been generated! Show this at boarding for instant verification.</p>
          <div style="background:linear-gradient(135deg,#EEF2FF,#F0F9FF);padding:16px;border-radius:8px;margin:16px 0;border:1px solid #C7D2FE">
            <p style="margin:4px 0;font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:1px;text-align:center">${sanitize(digitalPass.pass_id)}</p>
          </div>
          <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
            <p style="margin:4px 0"><strong>🗓 Trip:</strong> ${sanitize(outing.title)}</p>
            <p style="margin:4px 0"><strong>📍 Location:</strong> ${sanitize(outing.location)}</p>
            <p style="margin:4px 0"><strong>📅 Date:</strong> ${sanitize(outing.date)}</p>
            <p style="margin:4px 0"><strong>⏰ Time:</strong> ${sanitize(outing.time || '10:00 AM')}</p>
            <p style="margin:4px 0"><strong>👥 Participants:</strong> ${booking.participants}</p>
            <p style="margin:4px 0"><strong>💰 Total:</strong> ₹${booking.total_amount}</p>
          </div>
          <div style="text-align:center;margin:16px 0">
            <img src="${digitalPass.qr_code}" alt="QR Code" style="width:200px;height:200px;border:2px solid #E2E8F0;border-radius:8px">
            <p style="font-size:12px;color:#64748B;margin-top:8px">Show this QR code at boarding</p>
          </div>
          <div style="background:#FEF3C7;padding:12px;border-radius:8px;margin:12px 0;font-size:13px;color:#92400E">
            <strong>📋 Instructions:</strong><br>
            • Arrive 15 minutes before reporting time<br>
            • Keep this pass ready on your phone or print it<br>
            • Carry a valid photo ID for verification
          </div>
          <p style="color:#64748B;font-size:14px;margin-top:16px">Have a great trip! 🚀<br>— Team VIBES@Outing</p>
        </div>
      </div>
    `,
  });
  if (result.ok) {
    securityLog('BOARDING_PASS_EMAIL_SENT', { recipient: maskEmail(userEmail), passId: digitalPass.pass_id });
  }
}

function buildResetUrl(token) {
  const fallbackBase = process.env.APP_BASE_URL || 'http://localhost:3000';
  const baseUrl = process.env.PASSWORD_RESET_URL || fallbackBase;
  try {
    const url = new URL('/', baseUrl);
    url.searchParams.set('action', 'reset-password');
    url.searchParams.set('token', token);
    return url.toString();
  } catch (_) {
    const safeBase = baseUrl.replace(/\/$/, '');
    return `${safeBase}/?action=reset-password&token=${token}`;
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
        images TEXT DEFAULT '[]',
        date TEXT NOT NULL,
        time TEXT DEFAULT '10:00 AM',
        cost INTEGER NOT NULL,
        max_participants INTEGER DEFAULT 20,
        current_participants INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        category TEXT DEFAULT '',
        trip_type TEXT DEFAULT 'one_day',
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
        selected_date TEXT DEFAULT '',
        departure_time TEXT DEFAULT '',
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
        booking_id INTEGER REFERENCES bookings(id),
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        title TEXT DEFAULT '',
        comment TEXT DEFAULT '',
        images TEXT DEFAULT '',
        recommend INTEGER DEFAULT 1,
        approved INTEGER DEFAULT 1,
        helpful_count INTEGER DEFAULT 0,
        admin_reply TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS blogs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        booking_id INTEGER REFERENCES bookings(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        cover_image TEXT DEFAULT '',
        gallery_images TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        category TEXT DEFAULT 'Adventure',
        status TEXT DEFAULT 'pending',
        featured INTEGER DEFAULT 0,
        slug TEXT DEFAULT '',
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
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_blogs_outing_id ON blogs(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_blogs_user_id ON blogs(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_chat_outing_id ON chat_messages(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)').catch(() => {});

    // Notifications table
    await dbQuery(`CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT DEFAULT 'general',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)').catch(() => {});

    // Support tickets table
    await dbQuery(`CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        priority TEXT DEFAULT 'Medium',
        message TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        admin_reply TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)').catch(() => {});

    // Wallet transactions table
    await dbQuery(`CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_wallet_txn_user_id ON wallet_transactions(user_id)').catch(() => {});

    // Galleries table
    await dbQuery(`CREATE TABLE IF NOT EXISTS galleries (
        id SERIAL PRIMARY KEY,
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        title TEXT NOT NULL,
        cover_image TEXT DEFAULT '',
        created_by INTEGER NOT NULL REFERENCES users(id),
        published INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_galleries_outing_id ON galleries(outing_id)').catch(() => {});

    // Gallery media table
    await dbQuery(`CREATE TABLE IF NOT EXISTS gallery_media (
        id SERIAL PRIMARY KEY,
        gallery_id INTEGER NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
        media_url TEXT NOT NULL,
        media_type TEXT DEFAULT 'image',
        caption TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_gallery_media_gallery_id ON gallery_media(gallery_id)').catch(() => {});

    // Gallery likes table
    await dbQuery(`CREATE TABLE IF NOT EXISTS gallery_likes (
        id SERIAL PRIMARY KEY,
        media_id INTEGER NOT NULL REFERENCES gallery_media(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(media_id, user_id)
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_gallery_likes_media_id ON gallery_likes(media_id)').catch(() => {});

    // Trip expectations table
    await dbQuery(`CREATE TABLE IF NOT EXISTS trip_expectations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        expectations TEXT NOT NULL,
        tags TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_trip_expectations_user_id ON trip_expectations(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_trip_expectations_booking_id ON trip_expectations(booking_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_trip_expectations_outing_id ON trip_expectations(outing_id)').catch(() => {});

    // Partner applications table
    await dbQuery(`CREATE TABLE IF NOT EXISTS partner_applications (
        id SERIAL PRIMARY KEY,
        business_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        property_type TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT DEFAULT '',
        application_status TEXT DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_applications(application_status)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_partner_apps_email ON partner_applications(email)').catch(() => {});

    // Digital passes table
    await dbQuery(`CREATE TABLE IF NOT EXISTS digital_passes (
        id SERIAL PRIMARY KEY,
        pass_id TEXT UNIQUE NOT NULL,
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        outing_id INTEGER NOT NULL REFERENCES outings(id),
        qr_code TEXT NOT NULL,
        verification_token TEXT UNIQUE NOT NULL,
        boarding_status TEXT DEFAULT 'not_verified',
        verification_time TIMESTAMP,
        scanned_by INTEGER,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_digital_passes_booking_id ON digital_passes(booking_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_digital_passes_user_id ON digital_passes(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_digital_passes_outing_id ON digital_passes(outing_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_digital_passes_pass_id ON digital_passes(pass_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_digital_passes_verification_token ON digital_passes(verification_token)').catch(() => {});

    // Boarding logs table
    await dbQuery(`CREATE TABLE IF NOT EXISTS boarding_logs (
        id SERIAL PRIMARY KEY,
        pass_id TEXT NOT NULL,
        scanned_by INTEGER,
        scan_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        device_info TEXT DEFAULT '',
        verification_result TEXT NOT NULL
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_boarding_logs_pass_id ON boarding_logs(pass_id)').catch(() => {});
  } else {
    // SQLite: tables one at a time (exec doesn't support multi-statement in all versions)
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password TEXT NOT NULL, interests TEXT DEFAULT '', role TEXT DEFAULT 'user', must_change_password INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS outings (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, location TEXT NOT NULL, description TEXT, image_url TEXT DEFAULT '', images TEXT DEFAULT '[]', date TEXT NOT NULL, time TEXT DEFAULT '10:00 AM', cost INTEGER NOT NULL, max_participants INTEGER DEFAULT 20, current_participants INTEGER DEFAULT 0, status TEXT DEFAULT 'active', category TEXT DEFAULT '', trip_type TEXT DEFAULT 'one_day', created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, participants INTEGER DEFAULT 1, participant_names TEXT DEFAULT '', total_amount INTEGER NOT NULL, token_amount INTEGER DEFAULT 0, remaining_amount INTEGER DEFAULT 0, payment_status TEXT DEFAULT 'pending', remaining_payment_status TEXT DEFAULT 'pending', payment_id TEXT, remaining_payment_id TEXT, selected_date TEXT DEFAULT '', departure_time TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL, description TEXT, budget TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, booking_id INTEGER, rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5), title TEXT DEFAULT '', comment TEXT DEFAULT '', images TEXT DEFAULT '', recommend INTEGER DEFAULT 1, approved INTEGER DEFAULT 1, helpful_count INTEGER DEFAULT 0, admin_reply TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id), FOREIGN KEY (booking_id) REFERENCES bookings(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS blogs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, booking_id INTEGER, title TEXT NOT NULL, content TEXT NOT NULL, cover_image TEXT DEFAULT '', gallery_images TEXT DEFAULT '', tags TEXT DEFAULT '', category TEXT DEFAULT 'Adventure', status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, slug TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id), FOREIGN KEY (booking_id) REFERENCES bookings(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, outing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, message TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (outing_id) REFERENCES outings(id), FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS id_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, id_type TEXT NOT NULL, id_number TEXT NOT NULL, full_name TEXT NOT NULL, emergency_contact TEXT DEFAULT '', emergency_name TEXT DEFAULT '', status TEXT DEFAULT 'pending', submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP, verified_at DATETIME, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS security_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, details TEXT, ip TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_outing_id ON bookings(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_outing_id ON reviews(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_blogs_outing_id ON blogs(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_blogs_user_id ON blogs(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_chat_outing_id ON chat_messages(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)`); } catch(e) {}

    // Notifications table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'general', title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`); } catch(e) {}

    // Support tickets table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS support_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, priority TEXT DEFAULT 'Medium', message TEXT NOT NULL, status TEXT DEFAULT 'open', admin_reply TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`); } catch(e) {}

    // Wallet transactions table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_txn_user_id ON wallet_transactions(user_id)`); } catch(e) {}

    // Galleries table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS galleries (id INTEGER PRIMARY KEY AUTOINCREMENT, outing_id INTEGER NOT NULL, title TEXT NOT NULL, cover_image TEXT DEFAULT '', created_by INTEGER NOT NULL, published INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (outing_id) REFERENCES outings(id), FOREIGN KEY (created_by) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_galleries_outing_id ON galleries(outing_id)`); } catch(e) {}

    // Gallery media table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS gallery_media (id INTEGER PRIMARY KEY AUTOINCREMENT, gallery_id INTEGER NOT NULL, media_url TEXT NOT NULL, media_type TEXT DEFAULT 'image', caption TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_media_gallery_id ON gallery_media(gallery_id)`); } catch(e) {}

    // Gallery likes table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS gallery_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, media_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(media_id, user_id), FOREIGN KEY (media_id) REFERENCES gallery_media(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_likes_media_id ON gallery_likes(media_id)`); } catch(e) {}

    // Trip expectations table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS trip_expectations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, booking_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, expectations TEXT NOT NULL, tags TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (booking_id) REFERENCES bookings(id), FOREIGN KEY (outing_id) REFERENCES outings(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_trip_expectations_user_id ON trip_expectations(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_trip_expectations_booking_id ON trip_expectations(booking_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_trip_expectations_outing_id ON trip_expectations(outing_id)`); } catch(e) {}

    // Partner applications table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS partner_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT NOT NULL, contact_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, property_type TEXT NOT NULL, location TEXT NOT NULL, description TEXT DEFAULT '', application_status TEXT DEFAULT 'Pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_applications(application_status)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_partner_apps_email ON partner_applications(email)`); } catch(e) {}

    // Digital passes table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS digital_passes (id INTEGER PRIMARY KEY AUTOINCREMENT, pass_id TEXT UNIQUE NOT NULL, booking_id INTEGER NOT NULL, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, qr_code TEXT NOT NULL, verification_token TEXT UNIQUE NOT NULL, boarding_status TEXT DEFAULT 'not_verified', verification_time DATETIME, scanned_by INTEGER, generated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (booking_id) REFERENCES bookings(id), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (outing_id) REFERENCES outings(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_digital_passes_booking_id ON digital_passes(booking_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_digital_passes_user_id ON digital_passes(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_digital_passes_outing_id ON digital_passes(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_digital_passes_pass_id ON digital_passes(pass_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_digital_passes_verification_token ON digital_passes(verification_token)`); } catch(e) {}

    // Boarding logs table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS boarding_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, pass_id TEXT NOT NULL, scanned_by INTEGER, scan_time DATETIME DEFAULT CURRENT_TIMESTAMP, device_info TEXT DEFAULT '', verification_result TEXT NOT NULL)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_boarding_logs_pass_id ON boarding_logs(pass_id)`); } catch(e) {}
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
        'INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)',
        [o.title, o.location, o.description, o.date, o.time, o.cost, o.max, o.img, JSON.stringify(o.images || []), o.category || '', o.trip_type || 'one_day']
      );
    }
  }

  // Migrations: add new columns to reviews if missing (for existing databases)
  const reviewMigrations = [
    { col: 'booking_id', sql: 'ALTER TABLE reviews ADD COLUMN booking_id INTEGER' },
    { col: 'title', sql: 'ALTER TABLE reviews ADD COLUMN title TEXT DEFAULT \'\'' },
    { col: 'images', sql: 'ALTER TABLE reviews ADD COLUMN images TEXT DEFAULT \'\'' },
    { col: 'recommend', sql: 'ALTER TABLE reviews ADD COLUMN recommend INTEGER DEFAULT 1' },
    { col: 'approved', sql: 'ALTER TABLE reviews ADD COLUMN approved INTEGER DEFAULT 1' },
    { col: 'helpful_count', sql: 'ALTER TABLE reviews ADD COLUMN helpful_count INTEGER DEFAULT 0' },
    { col: 'admin_reply', sql: 'ALTER TABLE reviews ADD COLUMN admin_reply TEXT DEFAULT \'\'' },
  ];
  for (const m of reviewMigrations) {
    await dbQuery(m.sql).catch(() => {}); // ignore if column already exists
  }

  // Migration: add category column to outings if missing
  await dbQuery("ALTER TABLE outings ADD COLUMN category TEXT DEFAULT ''").catch(() => {});

  // Migration: add images column to outings if missing
  await dbQuery("ALTER TABLE outings ADD COLUMN images TEXT DEFAULT '[]'").catch(() => {});

  // Migration: sync images, image_url, cost, title, location, description from default-outings.json
  const allOutingsForSync = (await dbQuery("SELECT id, title, image_url, cost, images FROM outings")).rows;
  const defaultOutingsSync = loadDefaultOutings();
  for (const o of allOutingsForSync) {
    const match = defaultOutingsSync.find(d => o.title && o.title.includes(d.title.replace(/^[^\w]+/, '').trim().substring(0, 15)));
    if (match) {
      const newImgUrl = match.img || '';
      const newCost = match.cost;
      const newImages = JSON.stringify(match.images || []);
      const currentImages = o.images || '[]';
      const needsUpdate = (newImgUrl !== o.image_url) || (newCost !== o.cost) || (newImages !== currentImages) || (match.title !== o.title);
      if (needsUpdate) {
        await dbQuery('UPDATE outings SET title = $1, location = $2, description = $3, image_url = $4, cost = $5, images = $6 WHERE id = $7',
          [match.title, match.location, match.description, newImgUrl, newCost, newImages, o.id]);
      }
    }
  }

  // Migration: remove seeded outings that no longer exist in default-outings.json
  for (const o of allOutingsForSync) {
    if (o.title && o.title.startsWith('Test ')) continue; // skip user-created
    const match = defaultOutingsSync.find(d => o.title && o.title.includes(d.title.replace(/^[^\w]+/, '').trim().substring(0, 15)));
    if (!match) {
      // Check if this was a default-seeded outing (created_by = 1) before deleting
      const detail = (await dbQuery("SELECT created_by FROM outings WHERE id = $1", [o.id])).rows[0];
      if (detail && (detail.created_by === 1 || detail.created_by === '1')) {
        await dbQuery("DELETE FROM outings WHERE id = $1", [o.id]);
        console.log(`🗑️ Removed obsolete seeded outing: ${o.title}`);
      }
    }
  }

  // Migration: seed new outings from default-outings.json that don't exist yet
  const existingTitles = allOutingsForSync.map(o => o.title);
  for (const o of defaultOutingsSync) {
    const titleCore = o.title.replace(/^[^\w]+/, '').trim().substring(0, 15);
    const exists = existingTitles.some(t => t && t.includes(titleCore));
    if (!exists) {
      await dbQuery(
        'INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)',
        [o.title, o.location, o.description, o.date, o.time, o.cost, o.max, o.img, JSON.stringify(o.images || []), o.category || '', o.trip_type || 'one_day']
      );
      console.log(`📌 Seeded new outing: ${o.title}`);
    }
  }

  // Migration: populate category for existing outings that have empty category
  const uncategorized = (await dbQuery("SELECT id, title, description, location FROM outings WHERE category IS NULL OR category = ''")).rows;
  if (uncategorized.length > 0) {
    const defaultOutings = loadDefaultOutings();
    for (const o of uncategorized) {
      // Try to match with default outings by title
      const match = defaultOutings.find(d => o.title && o.title.includes(d.title.replace(/^[^\w]+/, '').trim().substring(0, 15)));
      if (match && match.category) {
        await dbQuery('UPDATE outings SET category = $1 WHERE id = $2', [match.category, o.id]);
      } else {
        // Heuristic: guess category from title/description
        const text = ((o.title || '') + ' ' + (o.description || '') + ' ' + (o.location || '')).toLowerCase();
        let cat = '';
        if (/beach|goa|ocean|sea|coast|surf/.test(text)) cat = 'beaches';
        else if (/mountain|hill|trek|summit|peak|climb|ooty|chikmagalur|nandi/.test(text)) cat = 'mountains';
        else if (/festival|heritage|temple|cultural|music|carnival/.test(text)) cat = 'festivals';
        else if (/road trip|drive|route|road|mysore|coorg/.test(text)) cat = 'road_trips';
        else if (/adventure|kayak|zipline|rafting|camp|cave|canyon|waterfall/.test(text)) cat = 'adventure';
        else if (/night|party|club|bonfire|pub/.test(text)) cat = 'nightlife';
        if (cat) await dbQuery('UPDATE outings SET category = $1 WHERE id = $2', [cat, o.id]);
      }
    }
    console.log(`📂 Categorized ${uncategorized.length} existing outings`);
  }

  // Migration: add trip_type column to outings if missing
  await dbQuery("ALTER TABLE outings ADD COLUMN trip_type TEXT DEFAULT 'one_day'").catch(() => {});

  // Migration: add selected_date and departure_time columns to bookings if missing
  await dbQuery("ALTER TABLE bookings ADD COLUMN selected_date TEXT DEFAULT ''").catch(() => {});
  await dbQuery("ALTER TABLE bookings ADD COLUMN departure_time TEXT DEFAULT ''").catch(() => {});

  // Migration: auto-detect trip_type for existing outings (also fixes wrongly defaulted 'one_day')
  const allOutings = (await dbQuery("SELECT id, title, description FROM outings")).rows;
  const defaultOutings = loadDefaultOutings();
  for (const o of allOutings) {
    const match = defaultOutings.find(d => o.title && o.title.includes(d.title.replace(/^[^\w]+/, '').trim().substring(0, 15)));
    if (match && match.trip_type) {
      await dbQuery('UPDATE outings SET trip_type = $1 WHERE id = $2', [match.trip_type, o.id]);
    } else {
      const text = ((o.title || '') + ' ' + (o.description || '')).toLowerCase();
      if (/2d\/1n|2d1n|2-day|two day|overnight|stay|retreat|weekend stay/.test(text)) {
        await dbQuery('UPDATE outings SET trip_type = $1 WHERE id = $2', ['2d1n', o.id]);
      }
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
    const { category } = req.query;
    const validCategories = ['beaches', 'mountains', 'festivals', 'road_trips', 'adventure', 'nightlife'];
    let result;
    if (category && validCategories.includes(category)) {
      result = await dbQuery('SELECT * FROM outings WHERE status = $1 AND category = $2 ORDER BY date ASC', ['active', category]);
    } else {
      result = await dbQuery('SELECT * FROM outings WHERE status = $1 ORDER BY date ASC', ['active']);
    }
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

// ─── WEEKEND DATE AVAILABILITY ──────────────────────────────────
app.get('/api/outings/:id/available-dates', [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery('SELECT * FROM outings WHERE id = $1', [req.params.id]);
  const outing = result.rows[0];
  if (!outing) return res.status(404).json({ message: 'Not found' });

  const tripType = outing.trip_type || 'one_day';
  const targetDay = tripType === '2d1n' ? 5 : 6; // Friday=5, Saturday=6
  const departureTime = tripType === '2d1n' ? '10:00 PM' : '4:00 AM';
  const autoCloseHours = tripType === '2d1n' ? 12 : 6;
  const label = tripType === '2d1n' ? 'Weekend Night Departure' : 'Weekend Sunrise Trip';

  const dates = [];
  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setMonth(maxDate.getMonth() + 6);

  let cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  // Move to next target day
  while (cursor.getDay() !== targetDay) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (cursor <= maxDate && dates.length < 26) {
    // Check auto-close: skip if departure is within autoCloseHours
    const depDate = new Date(cursor);
    if (tripType === '2d1n') {
      depDate.setHours(22, 0, 0, 0); // 10 PM
    } else {
      depDate.setHours(4, 0, 0, 0); // 4 AM
    }
    const hoursUntilDeparture = (depDate - now) / (1000 * 60 * 60);
    if (hoursUntilDeparture > autoCloseHours) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      dates.push({
        date: `${yyyy}-${mm}-${dd}`,
        day: cursor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
        departure_time: departureTime,
        hours_until: Math.round(hoursUntilDeparture),
      });
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  res.json({
    trip_type: tripType,
    label,
    departure_time: departureTime,
    auto_close_hours: autoCloseHours,
    dates,
  });
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
  body('images').optional(),
  body('category').optional().trim().isIn(['', 'beaches', 'mountains', 'festivals', 'road_trips', 'adventure', 'nightlife']).withMessage('Invalid category'),
  body('trip_type').optional().trim().isIn(['one_day', '2d1n']).withMessage('Invalid trip type'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, location, description, date, time, cost, max_participants, image_url, images, category, trip_type } = req.body;
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  const result = await dbQuery(
    'INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
    [sanitize(title), sanitize(location), sanitize(description || ''), date, sanitize(time || '10:00 AM'), cost, max_participants || 20, image_url || '', imagesJson, sanitize(category || ''), sanitize(trip_type || 'one_day'), req.user.id]
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
  body('status').isIn(['active', 'inactive', 'cancelled', 'completed']),
  body('category').optional().trim().isIn(['', 'beaches', 'mountains', 'festivals', 'road_trips', 'adventure', 'nightlife']).withMessage('Invalid category'),
  body('trip_type').optional().trim().isIn(['one_day', '2d1n']).withMessage('Invalid trip type'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, location, description, date, time, cost, max_participants, image_url, images, status, category, trip_type } = req.body;
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  await dbQuery(
    'UPDATE outings SET title=$1, location=$2, description=$3, date=$4, time=$5, cost=$6, max_participants=$7, image_url=$8, images=$9, status=$10, category=$11, trip_type=$12 WHERE id=$13',
    [sanitize(title), sanitize(location), sanitize(description || ''), date, sanitize(time), cost, max_participants, image_url || '', imagesJson, status, sanitize(category || ''), sanitize(trip_type || 'one_day'), req.params.id]
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
  body('selected_date').optional().trim().isISO8601().withMessage('Valid selected date required'),
  body('departure_time').optional().trim().isLength({ max: 20 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, participants, participant_names, selected_date, departure_time } = req.body;
  const user_id = req.user.id; // IDOR prevention: use authenticated user

  const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1', [outing_id]);
  const outing = outingResult.rows[0];
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.status !== 'active') return res.status(400).json({ message: 'Outing is not active' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }

  // Validate selected_date if provided — must be a valid weekend day for the trip type
  if (selected_date) {
    const selDate = new Date(selected_date);
    const tripType = outing.trip_type || 'one_day';
    const expectedDay = tripType === '2d1n' ? 5 : 6; // Friday or Saturday
    if (selDate.getDay() !== expectedDay) {
      return res.status(400).json({ message: tripType === '2d1n' ? 'Selected date must be a Friday for 2D/1N trips' : 'Selected date must be a Saturday for One Day trips' });
    }
    if (selDate < new Date()) {
      return res.status(400).json({ message: 'Cannot select a past date' });
    }
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
      'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id, selected_date, departure_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
      [user_id, outing_id, participants, sanitize(participant_names || ''), totalAmount, tokenAmount, remainingAmount, 'pending', 'pending', order.id, sanitize(selected_date || ''), sanitize(departure_time || '')]
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
    // Create booking notification
    if (user && outing) {
      await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
        [booking.user_id, 'booking', 'Booking Confirmed! 🎉', `Your spot for "${outing.title}" on ${new Date(outing.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} is confirmed. Token ₹${booking.token_amount} paid.`]);
    }
    // Auto-generate Digital Trip Pass
    let digitalPass = null;
    try {
      digitalPass = await generateDigitalPass(booking_id, booking.user_id, booking.outing_id);
      if (user && outing && digitalPass) {
        await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
          [booking.user_id, 'boarding', 'Digital Pass Ready! 🎫', `Your digital trip pass (${digitalPass.pass_id}) for "${outing.title}" is ready. View it in My Digital Passes.`]);
        // Send boarding pass email
        sendBoardingPassEmail(user.email, user.name, outing, booking, digitalPass);
      }
    } catch (passErr) {
      console.error('[DIGITAL_PASS] Generation failed:', passErr.message);
    }
    const whatsappLink = (user && outing) ? getWhatsAppLink(user.phone, outing.title, outing.date, outing.location, booking.token_amount) : '';
    res.json({ success: true, payment_id: razorpay_payment_id, whatsapp_link: whatsappLink, token_amount: booking.token_amount, remaining_amount: booking.remaining_amount, outing_date: outing ? outing.date : '', digital_pass_id: digitalPass ? digitalPass.pass_id : null });
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
    // Create remaining payment notification
    const outing2 = (await dbQuery('SELECT title FROM outings WHERE id = $1', [booking.outing_id])).rows[0];
    if (outing2) {
      await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
        [booking.user_id, 'payment', 'Full Payment Complete! ✅', `Remaining ₹${booking.remaining_amount} paid for "${outing2.title}". You're all set!`]);
    }
    res.json({ success: true, payment_id: razorpay_payment_id });
  } else {
    res.status(400).json({ success: false, message: 'Payment verification failed' });
  }
});

// Fallback: direct booking without Razorpay (DISABLED in production)
app.post('/api/bookings', authMiddleware, async (req, res) => {
  if (IS_PROD) return res.status(403).json({ message: 'Demo bookings disabled in production' });

  const { outing_id, participants, participant_names, total_amount, selected_date, departure_time } = req.body;
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
    'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id, selected_date, departure_time) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
    [user_id, outing_id, participants, sanitize(participant_names || ''), total_amount, tokenAmount, remainingAmount, 'paid', 'pending', paymentId, sanitize(selected_date || ''), sanitize(departure_time || '')]
  );
  await dbQuery('UPDATE outings SET current_participants = current_participants + $1 WHERE id = $2', [participants, outing_id]);
  // Auto-generate Digital Trip Pass for demo booking
  let digitalPass = null;
  try {
    digitalPass = await generateDigitalPass(result.rows[0].id, user_id, outing_id);
  } catch (passErr) {
    console.error('[DIGITAL_PASS] Demo generation failed:', passErr.message);
  }
  res.json({ success: true, booking_id: result.rows[0].id, payment_id: paymentId, token_amount: tokenAmount, remaining_amount: remainingAmount, digital_pass_id: digitalPass ? digitalPass.pass_id : null });
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
  const openTickets = (await dbQuery("SELECT COUNT(*) as count FROM support_tickets WHERE status IN ($1, $2)", ['open', 'in-progress'])).rows[0];
  const totalReviews = (await dbQuery('SELECT COUNT(*) as count FROM reviews')).rows[0];
  const pendingBlogs = (await dbQuery("SELECT COUNT(*) as count FROM blogs WHERE status = $1", ['pending'])).rows[0];
  const totalBlogs = (await dbQuery('SELECT COUNT(*) as count FROM blogs')).rows[0];
  const totalGalleries = (await dbQuery('SELECT COUNT(*) as count FROM galleries')).rows[0];
  const publishedGalleries = (await dbQuery("SELECT COUNT(*) as count FROM galleries WHERE published = 1")).rows[0];
  const recentSecurityEvents = (await dbQuery(
    USE_PG
      ? "SELECT COUNT(*) as count FROM security_logs WHERE created_at > NOW() - INTERVAL '24 hours'"
      : "SELECT COUNT(*) as count FROM security_logs WHERE created_at > datetime('now', '-24 hours')"
  )).rows[0];
  const totalExpectations = (await dbQuery('SELECT COUNT(*) as count FROM trip_expectations')).rows[0];
  const pendingPartnerApps = (await dbQuery("SELECT COUNT(*) as count FROM partner_applications WHERE application_status = $1", ['Pending'])).rows[0];
  const totalPartnerApps = (await dbQuery('SELECT COUNT(*) as count FROM partner_applications')).rows[0];
  const totalPasses = (await dbQuery('SELECT COUNT(*) as count FROM digital_passes')).rows[0];
  const verifiedPasses = (await dbQuery("SELECT COUNT(*) as count FROM digital_passes WHERE boarding_status = 'verified'")).rows[0];
  const pendingPasses = (await dbQuery("SELECT COUNT(*) as count FROM digital_passes WHERE boarding_status = 'not_verified'")).rows[0];
  res.json({
    users: parseInt(users.count),
    outings: parseInt(outings.count),
    bookings: parseInt(bookings.count),
    revenue: parseInt(revenue.total),
    pendingSuggestions: parseInt(pendingSuggestions.count),
    pendingVerifications: parseInt(pendingVerifications.count),
    openTickets: parseInt(openTickets.count),
    totalReviews: parseInt(totalReviews.count),
    pendingBlogs: parseInt(pendingBlogs.count),
    totalBlogs: parseInt(totalBlogs.count),
    totalGalleries: parseInt(totalGalleries.count),
    publishedGalleries: parseInt(publishedGalleries.count),
    securityEvents24h: parseInt(recentSecurityEvents.count),
    totalExpectations: parseInt(totalExpectations.count),
    pendingPartnerApps: parseInt(pendingPartnerApps.count),
    totalPartnerApps: parseInt(totalPartnerApps.count),
    totalPasses: parseInt(totalPasses.count),
    verifiedPasses: parseInt(verifiedPasses.count),
    pendingPasses: parseInt(pendingPasses.count)
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

// ─── HELPER: Check if trip is completed ─────────────────────────
async function isTripCompleted(userId, outingId) {
  const booking = (await dbQuery(
    'SELECT b.id, b.payment_status, o.date as outing_date FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = $1 AND b.outing_id = $2 AND b.payment_status = $3',
    [userId, outingId, 'paid']
  )).rows[0];
  if (!booking) return { eligible: false, booking: null, reason: 'No paid booking found for this outing' };
  const tripDate = new Date(booking.outing_date);
  const now = new Date();
  if (now < tripDate) return { eligible: false, booking, reason: 'Trip has not been completed yet. You can review after the trip date.' };
  return { eligible: true, booking };
}

// ─── HELPER: Generate SEO-friendly slug ─────────────────────────
function generateSlug(title, userId) {
  const base = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60);
  return `${base}-${userId}-${Date.now().toString(36)}`;
}

// ─── REVIEW ROUTES (ENHANCED) ───────────────────────────────────
app.post('/api/reviews', authMiddleware, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('title').optional().trim().isLength({ max: 200 }).escape(),
  body('comment').optional().trim().isLength({ max: 2000 }).escape(),
  body('recommend').optional().isBoolean(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, rating, title, comment, recommend } = req.body;
  const user_id = req.user.id;

  // Check duplicate
  const existing = (await dbQuery('SELECT id FROM reviews WHERE user_id = $1 AND outing_id = $2', [user_id, outing_id])).rows[0];
  if (existing) return res.status(400).json({ success: false, message: 'You already reviewed this outing' });

  // Check trip completion
  const eligibility = await isTripCompleted(user_id, outing_id);
  if (!eligibility.eligible) return res.status(403).json({ success: false, message: eligibility.reason });

  await dbQuery(
    'INSERT INTO reviews (user_id, outing_id, booking_id, rating, title, comment, recommend) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user_id, outing_id, eligibility.booking.id, rating, sanitize(title || ''), sanitize(comment || ''), recommend !== false ? 1 : 0]
  );

  // Notify admin
  const outing = (await dbQuery('SELECT title FROM outings WHERE id = $1', [outing_id])).rows[0];
  securityLog('REVIEW_SUBMITTED', { userId: user_id, outingId: outing_id, rating });
  res.json({ success: true, message: 'Review submitted successfully!' });
});

app.get('/api/reviews/:outingId', [
  param('outingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const reviews = (await dbQuery(
    'SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.outing_id = $1 AND r.approved = 1 ORDER BY r.helpful_count DESC, r.created_at DESC',
    [req.params.outingId]
  )).rows;
  const avg = (await dbQuery('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE outing_id = $1 AND approved = 1', [req.params.outingId])).rows[0];
  // Rating breakdown
  const breakdown = (await dbQuery(
    'SELECT rating, COUNT(*) as count FROM reviews WHERE outing_id = $1 AND approved = 1 GROUP BY rating ORDER BY rating DESC',
    [req.params.outingId]
  )).rows;
  const ratingBreakdown = {};
  for (let i = 1; i <= 5; i++) ratingBreakdown[i] = 0;
  breakdown.forEach(r => { ratingBreakdown[r.rating] = parseInt(r.count); });

  res.json({
    reviews,
    average: Math.round((parseFloat(avg.avg) || 0) * 10) / 10,
    count: parseInt(avg.count),
    ratingBreakdown
  });
});

// Check review eligibility for a user
app.get('/api/reviews/eligibility/:outingId', authMiddleware, [
  param('outingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const eligibility = await isTripCompleted(req.user.id, parseInt(req.params.outingId));
  const existing = (await dbQuery('SELECT id FROM reviews WHERE user_id = $1 AND outing_id = $2', [req.user.id, req.params.outingId])).rows[0];
  res.json({ eligible: eligibility.eligible && !existing, alreadyReviewed: !!existing, reason: existing ? 'Already reviewed' : eligibility.reason || '' });
});

// Helpful vote for a review
app.post('/api/reviews/:id/helpful', authMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// User's own reviews
app.get('/api/my-reviews', authMiddleware, async (req, res) => {
  const reviews = (await dbQuery(
    'SELECT r.*, o.title as outing_title, o.location as outing_location, o.image_url FROM reviews r JOIN outings o ON r.outing_id = o.id WHERE r.user_id = $1 ORDER BY r.created_at DESC',
    [req.user.id]
  )).rows;
  res.json(reviews);
});

// ─── BLOG ROUTES ────────────────────────────────────────────────
const blogLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { success: false, message: 'Too many blog submissions. Try again later.' } });

app.post('/api/blogs', authMiddleware, blogLimiter, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('title').trim().notEmpty().isLength({ max: 300 }).withMessage('Blog title required (max 300 chars)').escape(),
  body('content').trim().notEmpty().isLength({ max: 50000 }).withMessage('Blog content required'),
  body('cover_image').optional().trim().isLength({ max: 500 }),
  body('tags').optional().trim().isLength({ max: 500 }).escape(),
  body('category').optional().trim().isIn(['Adventure', 'Family Trip', 'Solo Travel', 'Budget Travel', 'Luxury Experience', 'Food Journey', 'Weekend Getaway', 'Cultural', 'Nature', 'Other']),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, title, content, cover_image, tags, category } = req.body;
  const user_id = req.user.id;

  // Check trip completion
  const eligibility = await isTripCompleted(user_id, outing_id);
  if (!eligibility.eligible) return res.status(403).json({ success: false, message: eligibility.reason || 'Complete this trip before publishing a blog' });

  // Sanitize HTML content (allow safe tags)
  const sanitizedContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '');

  const slug = generateSlug(title, user_id);

  const result = await dbQuery(
    'INSERT INTO blogs (user_id, outing_id, booking_id, title, content, cover_image, tags, category, slug, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
    [user_id, outing_id, eligibility.booking.id, sanitize(title), sanitizedContent, sanitize(cover_image || ''), sanitize(tags || ''), category || 'Adventure', slug, 'pending']
  );

  securityLog('BLOG_SUBMITTED', { userId: user_id, outingId: outing_id, blogId: result.rows[0].id });
  res.json({ success: true, message: 'Blog submitted for review! It will be published after admin approval.', blogId: result.rows[0].id, slug });
});

// Public: get published blogs
app.get('/api/blogs', async (req, res) => {
  const { category, tag, featured } = req.query;
  let sql = `SELECT b.*, u.name as author_name, o.title as outing_title, o.location as outing_location, o.image_url as outing_image
    FROM blogs b JOIN users u ON b.user_id = u.id JOIN outings o ON b.outing_id = o.id WHERE b.status = 'approved'`;
  const params = [];
  let paramIdx = 1;
  if (category) { sql += ` AND b.category = $${paramIdx++}`; params.push(category); }
  if (featured === '1') { sql += ` AND b.featured = 1`; }
  sql += ' ORDER BY b.featured DESC, b.created_at DESC LIMIT 50';
  const result = await dbQuery(sql, params);
  res.json(result.rows);
});

// Public: get single blog by slug
app.get('/api/blogs/by-slug/:slug', async (req, res) => {
  const blog = (await dbQuery(
    `SELECT b.*, u.name as author_name, o.title as outing_title, o.location as outing_location, o.image_url as outing_image, o.date as outing_date
     FROM blogs b JOIN users u ON b.user_id = u.id JOIN outings o ON b.outing_id = o.id WHERE b.slug = $1 AND b.status = 'approved'`,
    [req.params.slug]
  )).rows[0];
  if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
  res.json(blog);
});

// Blog eligibility check
app.get('/api/blogs/eligibility/:outingId', authMiddleware, [
  param('outingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const eligibility = await isTripCompleted(req.user.id, parseInt(req.params.outingId));
  res.json({ eligible: eligibility.eligible, reason: eligibility.reason || '' });
});

// User's own blogs
app.get('/api/my-blogs', authMiddleware, async (req, res) => {
  const blogs = (await dbQuery(
    'SELECT b.*, o.title as outing_title, o.location as outing_location FROM blogs b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = $1 ORDER BY b.created_at DESC',
    [req.user.id]
  )).rows;
  res.json(blogs);
});

// ─── ADMIN: Review & Blog Moderation ────────────────────────────
app.get('/api/admin/reviews', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(
    'SELECT r.*, u.name as user_name, u.email as user_email, o.title as outing_title FROM reviews r JOIN users u ON r.user_id = u.id JOIN outings o ON r.outing_id = o.id ORDER BY r.created_at DESC'
  );
  res.json(result.rows);
});

app.put('/api/admin/reviews/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('approved').optional().isInt({ min: 0, max: 1 }),
  body('admin_reply').optional().trim().isLength({ max: 1000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { approved, admin_reply } = req.body;
  if (approved !== undefined) {
    await dbQuery('UPDATE reviews SET approved = $1 WHERE id = $2', [approved, req.params.id]);
  }
  if (admin_reply !== undefined) {
    await dbQuery('UPDATE reviews SET admin_reply = $1 WHERE id = $2', [admin_reply, req.params.id]);
  }
  res.json({ success: true });
});

app.get('/api/admin/blogs', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(
    'SELECT b.*, u.name as author_name, u.email as author_email, o.title as outing_title FROM blogs b JOIN users u ON b.user_id = u.id JOIN outings o ON b.outing_id = o.id ORDER BY b.created_at DESC'
  );
  res.json(result.rows);
});

app.put('/api/admin/blogs/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('status').optional().isIn(['pending', 'approved', 'rejected']),
  body('featured').optional().isInt({ min: 0, max: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { status, featured } = req.body;
  const blog = (await dbQuery('SELECT * FROM blogs WHERE id = $1', [req.params.id])).rows[0];
  if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });
  if (status !== undefined) {
    await dbQuery('UPDATE blogs SET status = $1 WHERE id = $2', [status, req.params.id]);
    // Notify author
    const statusLabel = status === 'approved' ? 'approved and published! 🎉' : status === 'rejected' ? 'rejected.' : 'updated.';
    await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
      [blog.user_id, 'blog', 'Blog ' + (status === 'approved' ? 'Published! ✍️' : 'Update'), `Your blog "${blog.title}" has been ${statusLabel}`]);
  }
  if (featured !== undefined) {
    await dbQuery('UPDATE blogs SET featured = $1 WHERE id = $2', [featured, req.params.id]);
  }
  res.json({ success: true });
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

// ─── NOTIFICATIONS API ──────────────────────────────────────────
app.get('/api/notifications/:userId', authMiddleware, [
  param('userId').isInt().toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  if (req.user.id !== req.params.userId && req.user.role !== 'admin') return res.status(403).json([]);
  const result = await dbQuery('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.userId]);
  res.json(result.rows);
});

app.put('/api/notifications/:id/read', authMiddleware, [
  param('id').isInt().toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ success: true });
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  await dbQuery('UPDATE notifications SET read = 1 WHERE user_id = $1', [req.user.id]);
  res.json({ success: true });
});

// ─── WALLET API ─────────────────────────────────────────────────
app.get('/api/wallet/:userId', authMiddleware, [
  param('userId').isInt().toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  if (req.user.id !== req.params.userId && req.user.role !== 'admin') return res.status(403).json({ balance: 0, transactions: [] });
  const txns = await dbQuery('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.userId]);
  const credits = txns.rows.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits = txns.rows.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  res.json({ balance: credits - debits, transactions: txns.rows });
});

// ─── SUPPORT TICKETS API ────────────────────────────────────────
app.post('/api/support-tickets', authMiddleware, [
  body('category').trim().notEmpty().escape(),
  body('subject').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('priority').trim().isIn(['Low', 'Medium', 'High', 'Urgent']),
  body('message').trim().notEmpty().isLength({ max: 2000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { category, subject, priority, message } = req.body;
  const result = await dbQuery(
    'INSERT INTO support_tickets (user_id, category, subject, priority, message) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, category, subject, priority, message]
  );
  const ticketId = result.rows[0].id;
  // Notify user via in-app notification
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [req.user.id, 'support', 'Ticket #' + ticketId + ' Created', 'We received your ' + category + ' ticket. We\'ll respond within 24 hours.']);
  // Send email to admin
  sendEmailWithLogging({
    to: 'vibesoutingsupport@gmail.com',
    subject: `🎫 New Support Ticket #${ticketId} — ${category}`,
    context: 'support_ticket_new',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="margin:0;font-size:24px">🎫 New Support Ticket</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
          <p><strong>Ticket ID:</strong> #${ticketId}</p>
          <p><strong>Category:</strong> ${sanitize(category)}</p>
          <p><strong>Priority:</strong> ${sanitize(priority)}</p>
          <p><strong>Subject:</strong> ${sanitize(subject)}</p>
          <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:12px 0">
            <p style="margin:0">${sanitize(message)}</p>
          </div>
          <p style="color:#64748B;font-size:14px">From user ID: ${req.user.id} (${sanitize(req.user.email)})</p>
        </div>
      </div>
    `,
  }).catch(() => {});
  res.json({ success: true, ticketId });
});

app.get('/api/support-tickets/mine', authMiddleware, async (req, res) => {
  const result = await dbQuery('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json(result.rows);
});

app.get('/api/admin/support-tickets', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(`
    SELECT st.*, u.name as user_name, u.email as user_email
    FROM support_tickets st JOIN users u ON st.user_id = u.id
    ORDER BY CASE st.priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END, st.created_at DESC
  `);
  res.json(result.rows);
});

app.put('/api/admin/support-tickets/:id', authMiddleware, adminMiddleware, [
  param('id').isInt().toInt(),
  body('status').trim().isIn(['open', 'in-progress', 'resolved', 'closed']),
  body('admin_reply').optional().trim().isLength({ max: 2000 }).escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { status, admin_reply } = req.body;
  const ticket = (await dbQuery('SELECT * FROM support_tickets WHERE id = $1', [req.params.id])).rows[0];
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  if (admin_reply) {
    await dbQuery('UPDATE support_tickets SET status = $1, admin_reply = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [status, admin_reply, req.params.id]);
  } else {
    await dbQuery('UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
  }
  // Notify user about ticket update
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [ticket.user_id, 'support', 'Ticket #' + ticket.id + ' Updated', 'Your support ticket has been updated to: ' + status + (admin_reply ? '. Reply: ' + admin_reply : '')]);
  res.json({ success: true });
});

// ─── GALLERY ROUTES ─────────────────────────────────────────────
const galleryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, message: 'Too many gallery requests. Try again later.' } });

// Gallery security: prevent indexing
app.use('/api/gallery', (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Admin: Create gallery for an outing
app.post('/api/gallery/create', authMiddleware, adminMiddleware, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('title').trim().notEmpty().isLength({ max: 300 }).withMessage('Gallery title required').escape(),
  body('cover_image').optional().trim().isLength({ max: 1000 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, title, cover_image } = req.body;
  const outing = (await dbQuery('SELECT id, title FROM outings WHERE id = $1', [outing_id])).rows[0];
  if (!outing) return res.status(404).json({ success: false, message: 'Outing not found' });
  // Check if gallery already exists for this outing
  const existing = (await dbQuery('SELECT id FROM galleries WHERE outing_id = $1', [outing_id])).rows[0];
  if (existing) return res.status(400).json({ success: false, message: 'Gallery already exists for this outing. Use the existing gallery.' });
  const result = await dbQuery(
    'INSERT INTO galleries (outing_id, title, cover_image, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
    [outing_id, sanitize(title), sanitize(cover_image || ''), req.user.id]
  );
  securityLog('GALLERY_CREATED', { galleryId: result.rows[0].id, outingId: outing_id, adminId: req.user.id });
  res.json({ success: true, galleryId: result.rows[0].id });
});

// Admin: Upload media to gallery (URL-based)
app.post('/api/gallery/upload', authMiddleware, adminMiddleware, galleryLimiter, [
  body('gallery_id').isInt({ min: 1 }).withMessage('Valid gallery ID required'),
  body('media').isArray({ min: 1, max: 50 }).withMessage('Provide 1-50 media items'),
  body('media.*.url').trim().notEmpty().isLength({ max: 1000 }).withMessage('Valid media URL required'),
  body('media.*.caption').optional().trim().isLength({ max: 500 }).escape(),
  body('media.*.media_type').optional().isIn(['image', 'video']),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { gallery_id, media } = req.body;
  const gallery = (await dbQuery('SELECT id FROM galleries WHERE id = $1', [gallery_id])).rows[0];
  if (!gallery) return res.status(404).json({ success: false, message: 'Gallery not found' });
  const maxSort = (await dbQuery('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM gallery_media WHERE gallery_id = $1', [gallery_id])).rows[0];
  let sortOrder = parseInt(maxSort.max_sort) + 1;
  let uploaded = 0;
  for (const item of media) {
    await dbQuery(
      'INSERT INTO gallery_media (gallery_id, media_url, media_type, caption, sort_order) VALUES ($1,$2,$3,$4,$5)',
      [gallery_id, sanitize(item.url), item.media_type || 'image', sanitize(item.caption || ''), sortOrder++]
    );
    uploaded++;
  }
  securityLog('GALLERY_MEDIA_UPLOADED', { galleryId: gallery_id, count: uploaded, adminId: req.user.id });
  res.json({ success: true, uploaded });
});

// Admin: Delete a media item
app.delete('/api/gallery/media/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  await dbQuery('DELETE FROM gallery_likes WHERE media_id = $1', [req.params.id]);
  await dbQuery('DELETE FROM gallery_media WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// Admin: Publish/unpublish gallery
app.put('/api/gallery/publish', authMiddleware, adminMiddleware, [
  body('gallery_id').isInt({ min: 1 }),
  body('published').isInt({ min: 0, max: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { gallery_id, published } = req.body;
  const gallery = (await dbQuery('SELECT g.*, o.title as outing_title FROM galleries g JOIN outings o ON g.outing_id = o.id WHERE g.id = $1', [gallery_id])).rows[0];
  if (!gallery) return res.status(404).json({ success: false, message: 'Gallery not found' });
  await dbQuery('UPDATE galleries SET published = $1 WHERE id = $2', [published, gallery_id]);
  // If publishing, send notifications to all users who booked this outing
  if (published === 1) {
    const bookedUsers = (await dbQuery(
      'SELECT DISTINCT b.user_id FROM bookings b WHERE b.outing_id = $1 AND b.payment_status = $2',
      [gallery.outing_id, 'paid']
    )).rows;
    for (const u of bookedUsers) {
      await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
        [u.user_id, 'gallery', 'Trip Memories Ready! 📸', `Your ${sanitize(gallery.outing_title)} trip memories are ready! Login now to view your gallery.`]
      );
    }
    securityLog('GALLERY_PUBLISHED', { galleryId: gallery_id, outingId: gallery.outing_id, notified: bookedUsers.length });
  }
  res.json({ success: true });
});

// Admin: Update gallery cover & title
app.put('/api/gallery/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
  body('title').optional().trim().isLength({ max: 300 }).escape(),
  body('cover_image').optional().trim().isLength({ max: 1000 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { title, cover_image } = req.body;
  if (title !== undefined) await dbQuery('UPDATE galleries SET title = $1 WHERE id = $2', [sanitize(title), req.params.id]);
  if (cover_image !== undefined) await dbQuery('UPDATE galleries SET cover_image = $1 WHERE id = $2', [sanitize(cover_image), req.params.id]);
  res.json({ success: true });
});

// Admin: List all galleries
app.get('/api/admin/galleries', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(`
    SELECT g.*, o.title as outing_title, o.location as outing_location, o.date as outing_date,
      (SELECT COUNT(*) FROM gallery_media gm WHERE gm.gallery_id = g.id) as media_count
    FROM galleries g JOIN outings o ON g.outing_id = o.id ORDER BY g.created_at DESC
  `);
  res.json(result.rows);
});

// Admin: Get gallery detail with media
app.get('/api/admin/gallery/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const gallery = (await dbQuery(
    'SELECT g.*, o.title as outing_title, o.location as outing_location, o.date as outing_date FROM galleries g JOIN outings o ON g.outing_id = o.id WHERE g.id = $1',
    [req.params.id]
  )).rows[0];
  if (!gallery) return res.status(404).json({ success: false, message: 'Gallery not found' });
  const media = (await dbQuery('SELECT * FROM gallery_media WHERE gallery_id = $1 ORDER BY sort_order ASC', [req.params.id])).rows;
  res.json({ ...gallery, media });
});

// Admin: Delete gallery
app.delete('/api/gallery/:id', authMiddleware, adminMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  // Delete likes, media, then gallery
  await dbQuery('DELETE FROM gallery_likes WHERE media_id IN (SELECT id FROM gallery_media WHERE gallery_id = $1)', [req.params.id]);
  await dbQuery('DELETE FROM gallery_media WHERE gallery_id = $1', [req.params.id]);
  await dbQuery('DELETE FROM galleries WHERE id = $1', [req.params.id]);
  securityLog('GALLERY_DELETED', { galleryId: req.params.id, adminId: req.user.id });
  res.json({ success: true });
});

// User: Get my galleries (completed trips with published galleries)
app.get('/api/user/galleries', authMiddleware, async (req, res) => {
  const galleries = (await dbQuery(`
    SELECT g.id, g.title, g.cover_image, g.created_at, o.title as outing_title, o.location as outing_location, o.date as outing_date, o.image_url as outing_image,
      (SELECT COUNT(*) FROM gallery_media gm WHERE gm.gallery_id = g.id) as media_count
    FROM galleries g
    JOIN outings o ON g.outing_id = o.id
    JOIN bookings b ON b.outing_id = g.outing_id AND b.user_id = $1 AND b.payment_status = 'paid'
    WHERE g.published = 1
    ORDER BY o.date DESC
  `, [req.user.id])).rows;
  res.json(galleries);
});

// User: Get gallery detail (with access check)
app.get('/api/gallery/:id', authMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const gallery = (await dbQuery(
    'SELECT g.*, o.title as outing_title, o.location as outing_location, o.date as outing_date FROM galleries g JOIN outings o ON g.outing_id = o.id WHERE g.id = $1',
    [req.params.id]
  )).rows[0];
  if (!gallery) return res.status(404).json({ success: false, message: 'Gallery not found' });
  if (!gallery.published && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Gallery not yet published' });
  // Verify user has a paid booking for this outing (unless admin)
  if (req.user.role !== 'admin') {
    const booking = (await dbQuery(
      'SELECT id FROM bookings WHERE user_id = $1 AND outing_id = $2 AND payment_status = $3',
      [req.user.id, gallery.outing_id, 'paid']
    )).rows[0];
    if (!booking) return res.status(403).json({ success: false, message: 'Gallery access denied. You must have a paid booking for this outing.' });
    // Check trip completion
    const tripDate = new Date(gallery.outing_date);
    if (new Date() < tripDate) return res.status(403).json({ success: false, message: 'Gallery will be available after trip completion.' });
  }
  const media = (await dbQuery(`
    SELECT gm.*, COALESCE((SELECT COUNT(*) FROM gallery_likes gl WHERE gl.media_id = gm.id), 0) as like_count,
      CASE WHEN EXISTS(SELECT 1 FROM gallery_likes gl WHERE gl.media_id = gm.id AND gl.user_id = $2) THEN 1 ELSE 0 END as liked_by_me
    FROM gallery_media gm WHERE gm.gallery_id = $1 ORDER BY gm.sort_order ASC
  `, [req.params.id, req.user.id])).rows;
  res.json({ ...gallery, media });
});

// User: Like/unlike a photo
app.post('/api/gallery/media/:id/like', authMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const existing = (await dbQuery('SELECT id FROM gallery_likes WHERE media_id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
  if (existing) {
    await dbQuery('DELETE FROM gallery_likes WHERE id = $1', [existing.id]);
    res.json({ success: true, liked: false });
  } else {
    await dbQuery('INSERT INTO gallery_likes (media_id, user_id) VALUES ($1, $2)', [req.params.id, req.user.id]);
    res.json({ success: true, liked: true });
  }
});

// ─── TRIP EXPECTATIONS ROUTES ───────────────────────────────────
// Get user's expectation for a specific booking
app.get('/api/expectations/booking/:bookingId', authMiddleware, [
  param('bookingId').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery(
    'SELECT * FROM trip_expectations WHERE booking_id = $1 AND user_id = $2',
    [req.params.bookingId, req.user.id]
  );
  res.json(result.rows[0] || null);
});

// Get all expectations for the current user
app.get('/api/expectations/my', authMiddleware, async (req, res) => {
  const result = await dbQuery(
    `SELECT te.*, o.title as outing_title, o.location as outing_location, o.date as outing_date
     FROM trip_expectations te
     JOIN outings o ON te.outing_id = o.id
     WHERE te.user_id = $1
     ORDER BY te.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Submit or update expectations
app.post('/api/expectations', authMiddleware, [
  body('booking_id').isInt({ min: 1 }).withMessage('Valid booking ID required'),
  body('expectations').trim().notEmpty().withMessage('Expectations text is required').isLength({ max: 2000 }).withMessage('Maximum 2000 characters allowed'),
  body('tags').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { booking_id, expectations, tags } = req.body;

  // Verify the booking belongs to this user and is paid
  const booking = (await dbQuery(
    'SELECT b.*, o.date as outing_date FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.id = $1 AND b.user_id = $2 AND b.payment_status = $3',
    [booking_id, req.user.id, 'paid']
  )).rows[0];

  if (!booking) {
    return res.status(403).json({ success: false, message: 'No confirmed booking found' });
  }

  // Check if outing date hasn't passed (allow editing until 24hrs before)
  const outingDate = new Date(booking.outing_date);
  const cutoff = new Date(outingDate.getTime() - 24 * 60 * 60 * 1000);
  if (new Date() > cutoff) {
    return res.status(400).json({ success: false, message: 'Cannot submit expectations within 24 hours of the outing' });
  }

  const sanitizedExpectations = sanitize(expectations);
  const sanitizedTags = sanitize(tags || '');

  // Check if already exists — update if so
  const existing = (await dbQuery(
    'SELECT id FROM trip_expectations WHERE booking_id = $1 AND user_id = $2',
    [booking_id, req.user.id]
  )).rows[0];

  if (existing) {
    await dbQuery(
      'UPDATE trip_expectations SET expectations = $1, tags = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [sanitizedExpectations, sanitizedTags, existing.id]
    );
    res.json({ success: true, message: 'Expectations updated successfully', updated: true });
  } else {
    await dbQuery(
      'INSERT INTO trip_expectations (user_id, booking_id, outing_id, expectations, tags) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, booking_id, booking.outing_id, sanitizedExpectations, sanitizedTags]
    );
    res.json({ success: true, message: 'Expectations submitted successfully', updated: false });
  }
});

// Delete expectations
app.delete('/api/expectations/:id', authMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const existing = (await dbQuery(
    'SELECT te.*, o.date as outing_date FROM trip_expectations te JOIN outings o ON te.outing_id = o.id WHERE te.id = $1 AND te.user_id = $2',
    [req.params.id, req.user.id]
  )).rows[0];
  if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

  const outingDate = new Date(existing.outing_date);
  const cutoff = new Date(outingDate.getTime() - 24 * 60 * 60 * 1000);
  if (new Date() > cutoff) {
    return res.status(400).json({ success: false, message: 'Cannot modify expectations within 24 hours of the outing' });
  }

  await dbQuery('DELETE FROM trip_expectations WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Expectations removed' });
});

// Admin: View all expectations (with filters)
app.get('/api/admin/expectations', authMiddleware, adminMiddleware, async (req, res) => {
  const { outing_id } = req.query;
  let sql = `SELECT te.*, u.name as user_name, u.email as user_email, o.title as outing_title, o.location as outing_location, o.date as outing_date
     FROM trip_expectations te
     JOIN users u ON te.user_id = u.id
     JOIN outings o ON te.outing_id = o.id`;
  const params = [];
  if (outing_id) {
    sql += ' WHERE te.outing_id = $1';
    params.push(parseInt(outing_id));
  }
  sql += ' ORDER BY te.created_at DESC';
  const result = await dbQuery(sql, params);
  res.json(result.rows);
});

// Admin: Get expectations summary per outing
app.get('/api/admin/expectations/summary', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await dbQuery(
    `SELECT o.id as outing_id, o.title, o.date, o.location, COUNT(te.id) as expectation_count
     FROM outings o
     LEFT JOIN trip_expectations te ON te.outing_id = o.id
     WHERE o.status = 'active'
     GROUP BY o.id, o.title, o.date, o.location
     ORDER BY o.date ASC`
  );
  res.json(result.rows);
});

// ─── PARTNER APPLICATION ROUTES ─────────────────────────────────
const partnerApplyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many applications submitted. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/partners/apply — public endpoint (no auth required)
app.post('/api/partners/apply', partnerApplyLimiter, [
  body('businessName').trim().notEmpty().withMessage('Business name is required').isLength({ max: 200 }),
  body('contactName').trim().notEmpty().withMessage('Contact name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10,15}$/).withMessage('Phone must be 10-15 digits'),
  body('propertyType').trim().notEmpty().withMessage('Property type is required').isLength({ max: 100 }),
  body('location').trim().notEmpty().withMessage('Location is required').isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const { businessName, contactName, email, phone, propertyType, location, description } = req.body;

    // Check for duplicate pending application from same email
    const existing = await dbQuery(
      "SELECT id FROM partner_applications WHERE email = $1 AND application_status = $2",
      [email, 'Pending']
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'You already have a pending application. We will contact you soon.' });
    }

    const result = await dbQuery(
      `INSERT INTO partner_applications (business_name, contact_name, email, phone, property_type, location, description, application_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
      [businessName, contactName, email, phone, propertyType, location, description || '', 'Pending']
    );

    securityLog('PARTNER_APPLICATION_SUBMITTED', { email, businessName, ip: req.ip });

    // Send confirmation email to applicant (non-blocking)
    sendEmailWithLogging({
      to: email,
      subject: 'Your Partner Application Received - Vibes Outing',
      context: 'partner_application_confirmation',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;font-size:22px">🤝 Application Received!</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
            <p>Hello <strong>${sanitize(contactName)}</strong>,</p>
            <p>Thank you for applying to become a partner with Vibes Outing.</p>
            <p>We have successfully received your application for:</p>
            <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
              <p style="margin:4px 0"><strong>${sanitize(businessName)}</strong></p>
              <p style="margin:4px 0;color:#64748B;font-size:14px">${sanitize(propertyType)} — ${sanitize(location)}</p>
            </div>
            <p>Our team will review your application and contact you shortly.</p>
            <p style="color:#64748B;font-size:14px;margin-top:24px">Regards,<br><strong>Vibes Outing Team</strong></p>
          </div>
        </div>
      `,
    }).catch(() => {});

    // Send notification email to admin (non-blocking)
    const adminEmail = process.env.ADMIN_EMAIL || 'support@vibesouting.in';
    sendEmailWithLogging({
      to: adminEmail,
      subject: 'New Partner Application Received',
      context: 'partner_application_admin_notification',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#F97316,#FB923C);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;font-size:22px">📋 New Partner Application</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
            <p>A new partner application has been submitted.</p>
            <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
              <p style="margin:4px 0"><strong>Business Name:</strong> ${sanitize(businessName)}</p>
              <p style="margin:4px 0"><strong>Contact Name:</strong> ${sanitize(contactName)}</p>
              <p style="margin:4px 0"><strong>Email:</strong> ${sanitize(email)}</p>
              <p style="margin:4px 0"><strong>Phone:</strong> ${sanitize(phone)}</p>
              <p style="margin:4px 0"><strong>Property Type:</strong> ${sanitize(propertyType)}</p>
              <p style="margin:4px 0"><strong>Location:</strong> ${sanitize(location)}</p>
              <p style="margin:4px 0"><strong>Description:</strong> ${sanitize(description || 'N/A')}</p>
            </div>
            <p>Please review the application in the admin dashboard.</p>
          </div>
        </div>
      `,
    }).catch(() => {});

    res.json({ success: true, message: 'Partner application submitted successfully' });
  } catch (err) {
    console.error('Partner application error:', err.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});

// Admin: Get all partner applications
app.get('/api/admin/partner-applications', authMiddleware, adminMiddleware, async (req, res) => {
  const { search, status } = req.query;
  let sql = 'SELECT * FROM partner_applications';
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status && status !== 'all') {
    conditions.push(`application_status = $${paramIdx++}`);
    params.push(status);
  }
  if (search) {
    conditions.push(`(LOWER(business_name) LIKE $${paramIdx} OR LOWER(location) LIKE $${paramIdx} OR LOWER(email) LIKE $${paramIdx})`);
    params.push(`%${search.toLowerCase()}%`);
    paramIdx++;
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  const result = await dbQuery(sql, params);
  res.json(result.rows);
});

// Admin: Update partner application status
app.put('/api/admin/partner-applications/:id/status', authMiddleware, adminMiddleware, [
  body('status').trim().isIn(['Pending', 'Approved', 'Rejected']).withMessage('Status must be Pending, Approved, or Rejected'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { id } = req.params;
  const { status } = req.body;

  const existing = await dbQuery('SELECT * FROM partner_applications WHERE id = $1', [parseInt(id)]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }

  await dbQuery(
    'UPDATE partner_applications SET application_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [status, parseInt(id)]
  );

  const app_data = existing.rows[0];
  securityLog('PARTNER_APPLICATION_STATUS_UPDATED', { applicationId: id, newStatus: status, adminId: req.user.id });

  // Send status email to applicant (non-blocking)
  if (status === 'Approved' || status === 'Rejected') {
    const statusEmoji = status === 'Approved' ? '✅' : '❌';
    const statusColor = status === 'Approved' ? '#10B981' : '#EF4444';
    const statusMessage = status === 'Approved'
      ? 'Congratulations! Your partner application has been approved. Our team will reach out to you shortly with the next steps to get your property listed on Vibes Outing.'
      : 'After careful review, we were unable to approve your application at this time. You are welcome to reapply in the future with updated details.';

    sendEmailWithLogging({
      to: app_data.email,
      subject: `${statusEmoji} Partner Application ${status} - Vibes Outing`,
      context: `partner_application_${status.toLowerCase()}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:${statusColor};color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;font-size:22px">${statusEmoji} Application ${status}</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
            <p>Hello <strong>${sanitize(app_data.contact_name)}</strong>,</p>
            <p>${statusMessage}</p>
            <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
              <p style="margin:4px 0"><strong>Business:</strong> ${sanitize(app_data.business_name)}</p>
              <p style="margin:4px 0"><strong>Location:</strong> ${sanitize(app_data.location)}</p>
            </div>
            <p style="color:#64748B;font-size:14px;margin-top:24px">Regards,<br><strong>Vibes Outing Team</strong></p>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  res.json({ success: true, message: `Application ${status.toLowerCase()} successfully` });
});

// Admin: Delete partner application
app.delete('/api/admin/partner-applications/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const existing = await dbQuery('SELECT id FROM partner_applications WHERE id = $1', [parseInt(id)]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }
  await dbQuery('DELETE FROM partner_applications WHERE id = $1', [parseInt(id)]);
  securityLog('PARTNER_APPLICATION_DELETED', { applicationId: id, adminId: req.user.id });
  res.json({ success: true, message: 'Application deleted successfully' });
});

// Admin: Get single partner application details
app.get('/api/admin/partner-applications/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const result = await dbQuery('SELECT * FROM partner_applications WHERE id = $1', [parseInt(id)]);
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Application not found' });
  }
  res.json(result.rows[0]);
});

// ─── DIGITAL PASS & BOARDING VERIFICATION SYSTEM ────────────────

// Helper: Generate a unique Pass ID
function generatePassId() {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const seq = Date.now().toString(36).toUpperCase().slice(-4);
  return `VO-${year}-TRIP-${random}${seq}`;
}

// Helper: Generate digital pass for a confirmed booking
async function generateDigitalPass(bookingId, userId, outingId) {
  // Check if pass already exists
  const existing = (await dbQuery('SELECT id, pass_id FROM digital_passes WHERE booking_id = $1', [bookingId])).rows[0];
  if (existing) return existing;

  const passId = generatePassId();
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // QR payload: JSON with pass_id, booking_id, and verification token
  const qrPayload = JSON.stringify({
    pass_id: passId,
    booking_id: bookingId,
    token: verificationToken,
    type: 'vibes_boarding_pass'
  });

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: { dark: '#1a1a2e', light: '#ffffff' }
  });

  const result = await dbQuery(
    'INSERT INTO digital_passes (pass_id, booking_id, user_id, outing_id, qr_code, verification_token) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [passId, bookingId, userId, outingId, qrDataUrl, verificationToken]
  );

  return { id: result.rows[0].id, pass_id: passId, qr_code: qrDataUrl, verification_token: verificationToken };
}

// User: Get my digital passes
app.get('/api/digital-passes/my', authMiddleware, async (req, res) => {
  const passes = (await dbQuery(`
    SELECT dp.*, o.title as outing_title, o.location as outing_location, o.date as outing_date,
           o.time as outing_time, o.image_url as outing_image,
           b.participants, b.participant_names, b.total_amount, b.token_amount, b.remaining_amount,
           b.payment_status, b.remaining_payment_status,
           u.name as user_name, u.email as user_email, u.phone as user_phone
    FROM digital_passes dp
    JOIN bookings b ON dp.booking_id = b.id
    JOIN outings o ON dp.outing_id = o.id
    JOIN users u ON dp.user_id = u.id
    WHERE dp.user_id = $1
    ORDER BY dp.generated_at DESC
  `, [req.user.id])).rows;
  res.json(passes);
});

// User: Get a specific digital pass
app.get('/api/digital-passes/:passId', authMiddleware, async (req, res) => {
  const pass = (await dbQuery(`
    SELECT dp.*, o.title as outing_title, o.location as outing_location, o.date as outing_date,
           o.time as outing_time, o.image_url as outing_image, o.description as outing_description,
           b.participants, b.participant_names, b.total_amount, b.token_amount, b.remaining_amount,
           b.payment_status, b.remaining_payment_status,
           u.name as user_name, u.email as user_email, u.phone as user_phone
    FROM digital_passes dp
    JOIN bookings b ON dp.booking_id = b.id
    JOIN outings o ON dp.outing_id = o.id
    JOIN users u ON dp.user_id = u.id
    WHERE dp.pass_id = $1
  `, [req.params.passId])).rows[0];

  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });
  // IDOR: users can only see their own passes, admins can see all
  if (req.user.role !== 'admin' && pass.user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  // Fetch emergency contact info if verified
  const idVerification = (await dbQuery('SELECT full_name, emergency_contact, emergency_name FROM id_verifications WHERE user_id = $1 AND status = $2', [pass.user_id, 'verified'])).rows[0];
  res.json({ ...pass, emergency_contact: idVerification?.emergency_contact || '', emergency_name: idVerification?.emergency_name || '' });
});

// QR Verification endpoint — admin/organizer scans QR to verify boarding
app.post('/api/digital-passes/verify-boarding', authMiddleware, adminMiddleware, [
  body('pass_id').trim().notEmpty().withMessage('Pass ID required'),
  body('verification_token').trim().notEmpty().withMessage('Verification token required'),
  body('device_info').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { pass_id, verification_token, device_info } = req.body;

  const pass = (await dbQuery(`
    SELECT dp.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
           o.title as outing_title, o.location as outing_location, o.date as outing_date, o.time as outing_time,
           b.participants, b.payment_status, b.remaining_payment_status, b.total_amount
    FROM digital_passes dp
    JOIN users u ON dp.user_id = u.id
    JOIN outings o ON dp.outing_id = o.id
    JOIN bookings b ON dp.booking_id = b.id
    WHERE dp.pass_id = $1
  `, [pass_id])).rows[0];

  if (!pass) {
    await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
      [pass_id, req.user.id, sanitize(device_info || ''), 'invalid_pass']);
    securityLog('BOARDING_INVALID_PASS', { passId: pass_id, scannedBy: req.user.id, ip: req.ip });
    return res.json({ success: false, status: 'invalid', message: 'Invalid Pass — No matching digital pass found', icon: '❌' });
  }

  // Verify token with constant-time comparison
  const tokenMatch = crypto.timingSafeEqual(
    Buffer.from(pass.verification_token),
    Buffer.from(verification_token)
  );
  if (!tokenMatch) {
    await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
      [pass_id, req.user.id, sanitize(device_info || ''), 'invalid_token']);
    securityLog('BOARDING_INVALID_TOKEN', { passId: pass_id, scannedBy: req.user.id, ip: req.ip });
    return res.json({ success: false, status: 'invalid', message: 'Invalid Pass — Verification token mismatch', icon: '❌' });
  }

  // Check if already boarded
  if (pass.boarding_status === 'verified') {
    await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
      [pass_id, req.user.id, sanitize(device_info || ''), 'duplicate_entry']);
    securityLog('BOARDING_DUPLICATE', { passId: pass_id, userId: pass.user_id, scannedBy: req.user.id, ip: req.ip });
    return res.json({
      success: false, status: 'duplicate', message: 'Duplicate Entry — This pass has already been used',
      icon: '⚠️', user: { name: pass.user_name, email: pass.user_email, phone: pass.user_phone },
      trip: { title: pass.outing_title, location: pass.outing_location, date: pass.outing_date, time: pass.outing_time },
      boarding_time: pass.verification_time
    });
  }

  // Check payment status
  if (pass.payment_status !== 'paid') {
    await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
      [pass_id, req.user.id, sanitize(device_info || ''), 'payment_incomplete']);
    return res.json({ success: false, status: 'payment_issue', message: 'Payment Incomplete — Token payment not confirmed', icon: '💳' });
  }

  // VERIFIED — Update boarding status
  await dbQuery('UPDATE digital_passes SET boarding_status = $1, verification_time = CURRENT_TIMESTAMP, scanned_by = $2 WHERE pass_id = $3',
    ['verified', req.user.id, pass_id]);
  await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
    [pass_id, req.user.id, sanitize(device_info || ''), 'verified']);

  // Notify user
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [pass.user_id, 'boarding', 'Boarding Verified! ✅', `You have been verified for "${pass.outing_title}". Enjoy your trip! 🎉`]);

  securityLog('BOARDING_VERIFIED', { passId: pass_id, userId: pass.user_id, scannedBy: req.user.id, ip: req.ip });

  res.json({
    success: true, status: 'verified', message: 'VERIFIED — Boarding Allowed', icon: '✅',
    user: { name: pass.user_name, email: pass.user_email, phone: pass.user_phone },
    trip: { title: pass.outing_title, location: pass.outing_location, date: pass.outing_date, time: pass.outing_time },
    booking: { participants: pass.participants, total_amount: pass.total_amount, payment_status: pass.payment_status, remaining_status: pass.remaining_payment_status }
  });
});

// Admin: Get all digital passes
app.get('/api/admin/digital-passes', authMiddleware, adminMiddleware, async (req, res) => {
  const { search, outing_id, boarding_status } = req.query;
  let sql = `SELECT dp.*, u.name as user_name, u.email as user_email,
             o.title as outing_title, o.location as outing_location, o.date as outing_date,
             b.payment_status, b.remaining_payment_status, b.participants
             FROM digital_passes dp
             JOIN users u ON dp.user_id = u.id
             JOIN outings o ON dp.outing_id = o.id
             JOIN bookings b ON dp.booking_id = b.id`;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (outing_id) { conditions.push(`dp.outing_id = $${paramIdx++}`); params.push(parseInt(outing_id)); }
  if (boarding_status && boarding_status !== 'all') { conditions.push(`dp.boarding_status = $${paramIdx++}`); params.push(boarding_status); }
  if (search) {
    conditions.push(`(LOWER(u.name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(dp.pass_id) LIKE $${paramIdx})`);
    params.push(`%${search.toLowerCase()}%`);
    paramIdx++;
  }

  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY dp.generated_at DESC';

  const result = await dbQuery(sql, params);
  res.json(result.rows);
});

// Admin: Get boarding logs
app.get('/api/admin/boarding-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const { pass_id } = req.query;
  let sql = `SELECT bl.*, u.name as scanned_by_name
             FROM boarding_logs bl
             LEFT JOIN users u ON bl.scanned_by = u.id`;
  const params = [];
  if (pass_id) { sql += ' WHERE bl.pass_id = $1'; params.push(pass_id); }
  sql += ' ORDER BY bl.scan_time DESC LIMIT 200';
  const result = await dbQuery(sql, params);
  res.json(result.rows);
});

// Admin: Manually verify a user's boarding
app.post('/api/admin/digital-passes/manual-verify', authMiddleware, adminMiddleware, [
  body('pass_id').trim().notEmpty().withMessage('Pass ID required'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { pass_id } = req.body;
  const pass = (await dbQuery('SELECT * FROM digital_passes WHERE pass_id = $1', [pass_id])).rows[0];
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });
  if (pass.boarding_status === 'verified') return res.status(400).json({ success: false, message: 'Already verified' });

  await dbQuery('UPDATE digital_passes SET boarding_status = $1, verification_time = CURRENT_TIMESTAMP, scanned_by = $2 WHERE pass_id = $3',
    ['verified', req.user.id, pass_id]);
  await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
    [pass_id, req.user.id, 'manual_verification', 'verified']);
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [pass.user_id, 'boarding', 'Boarding Verified! ✅', 'Your boarding has been manually verified by the organizer.']);
  securityLog('BOARDING_MANUAL_VERIFY', { passId: pass_id, adminId: req.user.id });
  res.json({ success: true, message: 'Pass manually verified' });
});

// Admin: Revoke/cancel a pass
app.post('/api/admin/digital-passes/revoke', authMiddleware, adminMiddleware, [
  body('pass_id').trim().notEmpty().withMessage('Pass ID required'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { pass_id } = req.body;
  const pass = (await dbQuery('SELECT * FROM digital_passes WHERE pass_id = $1', [pass_id])).rows[0];
  if (!pass) return res.status(404).json({ success: false, message: 'Pass not found' });

  await dbQuery('UPDATE digital_passes SET boarding_status = $1 WHERE pass_id = $2', ['revoked', pass_id]);
  await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
    [pass_id, req.user.id, 'admin_action', 'revoked']);
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [pass.user_id, 'boarding', 'Pass Revoked ❌', 'Your digital trip pass has been revoked. Contact support for details.']);
  securityLog('PASS_REVOKED', { passId: pass_id, adminId: req.user.id });
  res.json({ success: true, message: 'Pass revoked' });
});

// Public: QR Verification page data (used by scanner)
app.post('/api/digital-passes/scan', authMiddleware, adminMiddleware, [
  body('qr_data').trim().notEmpty().withMessage('QR data required'),
  body('device_info').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { qr_data, device_info } = req.body;

  try {
    const parsed = JSON.parse(qr_data);
    if (parsed.type !== 'vibes_boarding_pass' || !parsed.pass_id || !parsed.token) {
      return res.json({ success: false, status: 'invalid', message: 'Invalid QR Code — Not a valid boarding pass', icon: '❌' });
    }
    // Delegate to verify-boarding
    req.body.pass_id = parsed.pass_id;
    req.body.verification_token = parsed.token;
    req.body.device_info = device_info || '';

    // Re-use the verify-boarding logic
    const pass = (await dbQuery(`
      SELECT dp.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             o.title as outing_title, o.location as outing_location, o.date as outing_date, o.time as outing_time,
             b.participants, b.payment_status, b.remaining_payment_status, b.total_amount
      FROM digital_passes dp
      JOIN users u ON dp.user_id = u.id
      JOIN outings o ON dp.outing_id = o.id
      JOIN bookings b ON dp.booking_id = b.id
      WHERE dp.pass_id = $1
    `, [parsed.pass_id])).rows[0];

    if (!pass) {
      await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
        [parsed.pass_id, req.user.id, sanitize(device_info || ''), 'invalid_pass']);
      return res.json({ success: false, status: 'invalid', message: 'Invalid Pass', icon: '❌' });
    }

    const tokenMatch = crypto.timingSafeEqual(Buffer.from(pass.verification_token), Buffer.from(parsed.token));
    if (!tokenMatch) {
      await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
        [parsed.pass_id, req.user.id, sanitize(device_info || ''), 'invalid_token']);
      return res.json({ success: false, status: 'invalid', message: 'Invalid Token', icon: '❌' });
    }

    if (pass.boarding_status === 'verified') {
      await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
        [parsed.pass_id, req.user.id, sanitize(device_info || ''), 'duplicate_entry']);
      return res.json({
        success: false, status: 'duplicate', message: 'Already Boarded', icon: '⚠️',
        user: { name: pass.user_name }, trip: { title: pass.outing_title }, boarding_time: pass.verification_time
      });
    }

    if (pass.boarding_status === 'revoked') {
      await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
        [parsed.pass_id, req.user.id, sanitize(device_info || ''), 'revoked_pass']);
      return res.json({ success: false, status: 'revoked', message: 'Pass Revoked', icon: '🚫' });
    }

    if (pass.payment_status !== 'paid') {
      return res.json({ success: false, status: 'payment_issue', message: 'Payment Incomplete', icon: '💳' });
    }

    // Mark as verified
    await dbQuery('UPDATE digital_passes SET boarding_status = $1, verification_time = CURRENT_TIMESTAMP, scanned_by = $2 WHERE pass_id = $3',
      ['verified', req.user.id, parsed.pass_id]);
    await dbQuery('INSERT INTO boarding_logs (pass_id, scanned_by, device_info, verification_result) VALUES ($1,$2,$3,$4)',
      [parsed.pass_id, req.user.id, sanitize(device_info || ''), 'verified']);
    await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
      [pass.user_id, 'boarding', 'Boarding Verified! ✅', `Welcome aboard "${pass.outing_title}"! 🎉`]);
    securityLog('BOARDING_VERIFIED_QR', { passId: parsed.pass_id, userId: pass.user_id, scannedBy: req.user.id });

    return res.json({
      success: true, status: 'verified', message: 'VERIFIED — Boarding Allowed', icon: '✅',
      user: { name: pass.user_name, email: pass.user_email, phone: pass.user_phone },
      trip: { title: pass.outing_title, location: pass.outing_location, date: pass.outing_date, time: pass.outing_time },
      booking: { participants: pass.participants, total_amount: pass.total_amount, payment_status: pass.payment_status }
    });
  } catch (err) {
    return res.json({ success: false, status: 'invalid', message: 'Invalid QR Code format', icon: '❌' });
  }
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
app.all('/api/*', (req, res) => {
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
