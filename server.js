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
const { body, param, query, validationResult } = require('express-validator');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const { OAuth2Client } = require('google-auth-library');
const { mountMcpRoutes } = require('./MCP_Server/mcp-server');
const { validateRequiredSecrets } = require('./backend/config/validate-env');
const { initSentry, getSentryBrowserConfig } = require('./backend/services/sentry');
const { snapshot: metricsSnapshot, markDbQuery } = require('./backend/services/metrics');
const { requestMetricsMiddleware } = require('./backend/middleware/request-metrics');
const {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  paymentLimiter,
  walletRechargeLimiter,
} = require('./backend/middleware/rate-limits');
const { mountModularRoutes } = require('./backend/routes');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';
const sentry = initSentry();

try {
  validateRequiredSecrets(process.env);
} catch (err) {
  console.error(`❌ FATAL: ${err.message}`);
  process.exit(1);
}

// ─── REAL-TIME NOTIFICATION HUB (SSE) ─────────────────────────
const notificationSseClients = new Map(); // userId -> Set<res>

function addNotificationSseClient(userId, res) {
  const key = String(userId);
  if (!notificationSseClients.has(key)) notificationSseClients.set(key, new Set());
  notificationSseClients.get(key).add(res);
}

function removeNotificationSseClient(userId, res) {
  const key = String(userId);
  const set = notificationSseClients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) notificationSseClients.delete(key);
}

function publishNotificationEvent(userId, event, payload = {}) {
  const key = String(userId);
  const set = notificationSseClients.get(key);
  if (!set || set.size === 0) return;
  const body = JSON.stringify({ event, ...payload, ts: new Date().toISOString() });
  for (const client of set) {
    try {
      client.write(`event: ${event}\n`);
      client.write(`data: ${body}\n\n`);
    } catch (_) {}
  }
}

function envFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function slugifyOutingTitle(title) {
  const cleaned = String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[_\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'outing';
}

function makeUniqueOutingSlug(title, id, used) {
  const base = slugifyOutingTitle(title);
  let slug = base;
  if (used.has(slug)) slug = `${base}-${id}`;
  let counter = 2;
  while (used.has(slug)) {
    slug = `${base}-${id}-${counter}`;
    counter += 1;
  }
  used.add(slug);
  return slug;
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
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_COOKIE_NAME = 'vibes_at';
const REFRESH_TOKEN_COOKIE_NAME = 'vibes_rt';
const BCRYPT_ROUNDS = 12;

// ─── SECURITY: Google OAuth 2.0 Client ──────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

const cspScriptHashes = (process.env.CSP_SCRIPT_HASHES || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// ─── SECURITY: Helmet — Comprehensive HTTP security headers ────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        ...cspScriptHashes,
        'https://checkout.razorpay.com',
        'https://cdnjs.cloudflare.com',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://accounts.google.com',
      ],
      styleSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com',
        'https://accounts.google.com',
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://*.unsplash.com", "https://img.icons8.com", "https://*.razorpay.com", "https://www.google-analytics.com", "https://lh3.googleusercontent.com", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://vibesouting.in", "https://www.vibesouting.in", "https://api.vibesouting.in", "https://www.google-analytics.com", "https://analytics.google.com", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      scriptSrcAttr: ["'none'"],
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
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT) || 300,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/signup', signupLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/bookings/create-order', paymentLimiter);
app.use('/api/bookings/verify-payment', paymentLimiter);
app.use('/api/bookings/pay-remaining', paymentLimiter);
app.use('/api/bookings/verify-remaining', paymentLimiter);
app.use('/api/bookings/payment-failed', paymentLimiter);
app.use('/api/wallet/recharge/create-order', walletRechargeLimiter);
app.use('/api/wallet/recharge/verify', walletRechargeLimiter);
app.use('/api/', requestMetricsMiddleware);

// ─── HEALTH CHECK (before body parsing, no rate limit) ──────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/api/metrics', (req, res) => {
  res.json(metricsSnapshot());
});

app.get('/api/metrics/dashboard', (req, res) => {
  const dashboardPath = path.join(__dirname, 'monitoring', 'dashboards.json');
  if (!fs.existsSync(dashboardPath)) {
    return res.status(404).json({ success: false, message: 'Dashboard definition not found' });
  }
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  return res.json({ success: true, dashboard });
});

app.get('/api/monitoring/sentry-config', (req, res) => {
  res.json({ success: true, ...getSentryBrowserConfig() });
});

// ─── LOGGING: Request logger for API debugging ─────────────────
app.use('/api/', (req, res, next) => {
  req.requestId = extractRequestId(req);
  res.setHeader('X-Request-ID', req.requestId);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 3000 || res.statusCode >= 400) {
      console.log(`[API] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms) reqId=${req.requestId} origin=${req.headers.origin || 'none'}`);
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
    index: false,
    dotfiles: 'deny',
    etag: true,
    maxAge: IS_PROD ? '1d' : 0,
  }));
}
// ─── IMAGE OPTIMIZATION: Redirect legacy .png/.jpg requests to .webp ─
app.use('/outing_pic', (req, res, next) => {
  if (/\.(png|jpe?g)$/i.test(req.path)) {
    const webpPath = req.path.replace(/\.(png|jpe?g)$/i, '.webp');
    const fullWebpPath = path.join(__dirname, 'public', 'outing_pic', webpPath);
    if (fs.existsSync(fullWebpPath)) {
      req.url = webpPath;
      res.setHeader('Content-Type', 'image/webp');
    }
  }
  next();
});
// Always serve outing images (needed by both API-only and monolith modes)
app.use('/outing_pic', express.static(path.join(__dirname, 'public', 'outing_pic'), {
  dotfiles: 'deny',
  etag: true,
  maxAge: IS_PROD ? '7d' : 0,
}));

// ─── SECURITY: CSRF Protection — require Authorization header for mutating requests ─
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    // If auth comes from cookie only (no Authorization header), check Origin/Referer
    const authHeader = req.headers.authorization;
    if (!authHeader && req.cookies && (req.cookies[ACCESS_TOKEN_COOKIE_NAME] || req.cookies[REFRESH_TOKEN_COOKIE_NAME])) {
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

mountModularRoutes(app);

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
    // Pool sizing — tune via env for higher concurrency during load/stress tests
    max: parseInt(process.env.PG_POOL_MAX) || 20,
    min: parseInt(process.env.PG_POOL_MIN) || 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT) || 5000,
    // Prevent a single slow/stuck query from holding a connection forever
    // (guards against pool exhaustion under DB stress / lock contention)
    statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT) || 15000,
    query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT) || 15000,
    // Keep TCP connections alive through proxies/load balancers
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    allowExitOnIdle: false,
  });
  // A pool 'error' on an idle client must never crash the process under load
  pool.on('error', (err) => console.error('PostgreSQL pool error (recovered):', err.message));
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
  const normalizedSql = String(sql || '').trim().toLowerCase();
  const started = process.hrtime.bigint();
  if (USE_PG) {
    const result = await pool.query(sql, params);
    markDbQuery(Number(process.hrtime.bigint() - started) / 1e6);
    if (normalizedSql.startsWith('insert into notifications')) {
      const userId = Number(params[0]);
      if (!Number.isNaN(userId) && userId > 0) {
        publishNotificationEvent(userId, 'notification.created', { userId });
      }
    }
    return { rows: result.rows, rowCount: result.rowCount };
  }
  // Translate $1,$2... → ? for SQLite
  const sqliteSql = sql.replace(/\$\d+/g, '?');
  // Detect query type
  const trimmed = sqliteSql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    const rows = sqliteDb.prepare(sqliteSql).all(...params);
    markDbQuery(Number(process.hrtime.bigint() - started) / 1e6);
    return { rows, rowCount: rows.length };
  }
  if (trimmed.startsWith('INSERT') && / RETURNING /i.test(sqliteSql)) {
    // SQLite doesn't support RETURNING — strip it, run, then fetch last insert
    const withoutReturning = sqliteSql.replace(/ RETURNING .*/i, '');
    const stmt = sqliteDb.prepare(withoutReturning);
    const info = stmt.run(...params);
    markDbQuery(Number(process.hrtime.bigint() - started) / 1e6);
    // Build a minimal returning row with id only when a row was inserted.
    if (info.changes > 0) return { rows: [{ id: info.lastInsertRowid }], rowCount: info.changes };
    return { rows: [], rowCount: info.changes };
  }
  const info = sqliteDb.prepare(sqliteSql).run(...params);
  markDbQuery(Number(process.hrtime.bigint() - started) / 1e6);
  if (normalizedSql.startsWith('insert into notifications')) {
    const userId = Number(params[0]);
    if (!Number.isNaN(userId) && userId > 0) {
      publishNotificationEvent(userId, 'notification.created', { userId });
    }
  }
  return { rows: [], rowCount: info.changes };
}

// ─── SECURITY: JWT Auth Middleware ──────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: Number(user.token_version || 0), typ: 'access' },
    JWT_SECRET_FINAL,
    { expiresIn: ACCESS_TOKEN_EXPIRES, issuer: 'vibes-outing', audience: 'vibes-outing-app' }
  );
}

function generateRefreshToken(user, rid) {
  return jwt.sign(
    { id: user.id, tv: Number(user.token_version || 0), rid, typ: 'refresh' },
    JWT_SECRET_FINAL,
    { expiresIn: REFRESH_TOKEN_EXPIRES, issuer: 'vibes-outing', audience: 'vibes-outing-app' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function storeRefreshSession(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_COOKIE_MAX_AGE_MS).toISOString();
  await dbQuery(
    'UPDATE users SET refresh_token_hash = $1, refresh_token_expires_at = $2 WHERE id = $3',
    [hashToken(refreshToken), expiresAt, userId]
  );
}

async function invalidateUserSession(userId, invalidateAccess = true) {
  if (!userId) return;
  if (invalidateAccess) {
    await dbQuery(
      'UPDATE users SET refresh_token_hash = NULL, refresh_token_expires_at = NULL, token_version = COALESCE(token_version, 0) + 1 WHERE id = $1',
      [userId]
    );
    return;
  }
  await dbQuery(
    'UPDATE users SET refresh_token_hash = NULL, refresh_token_expires_at = NULL WHERE id = $1',
    [userId]
  );
}

async function issueAuthSession(res, user) {
  const rid = crypto.randomBytes(16).toString('hex');
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user, rid);
  await storeRefreshSession(user.id, refreshToken);
  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken };
}

function clearAuthCookies(res) {
  const clearOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  };
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, clearOpts);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearOpts);
}

function authMiddleware(req, res, next) {
  // Support both Bearer token and httpOnly access token cookie
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE_NAME]) {
    token = req.cookies[ACCESS_TOKEN_COOKIE_NAME];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  (async () => {
    const decoded = jwt.verify(token, JWT_SECRET_FINAL, {
      issuer: 'vibes-outing',
      audience: 'vibes-outing-app',
    });
    if (decoded.typ !== 'access') {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }
    const userResult = await dbQuery('SELECT token_version FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];
    if (!user || Number(user.token_version || 0) !== Number(decoded.tv || 0)) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Session has been invalidated' });
    }
    req.user = decoded;
    return next();
  })().catch(() => {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  });
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

// ─── VIBES WALLET: New-user reward constants & helpers ──────────
const WALLET_REWARD_AMOUNT = parseInt(process.env.WALLET_REWARD_AMOUNT, 10) || 100;
const REWARD_DESC_PREFIX = 'New User Reward';
const BOOKING_RESERVATION_TTL_MINUTES = parseInt(process.env.BOOKING_RESERVATION_TTL_MINUTES, 10) || 15;

// New-user welcome bonus (credited once at first registration — manual or Google)
const WELCOME_BONUS_AMOUNT = parseInt(process.env.WELCOME_BONUS_AMOUNT, 10) || 100;
const WELCOME_BONUS_DESC = 'Welcome Bonus';

function extractRequestId(req) {
  const fromHeader = (req.headers['x-request-id'] || '').toString().trim();
  const fromBody = req.body && req.body.request_id ? String(req.body.request_id).trim() : '';
  const candidate = fromHeader || fromBody;
  if (candidate && /^[A-Za-z0-9._:-]{8,128}$/.test(candidate)) return candidate;
  return crypto.randomUUID();
}

function parseDbTimestamp(value) {
  if (!value) return null;
  const raw = String(value);
  // SQLite may return "YYYY-MM-DD HH:mm:ss" without timezone; interpret as UTC.
  const normalized = /Z$/i.test(raw) ? raw : raw.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function bookingAuditLog(eventType, payload = {}) {
  try {
    await dbQuery(
      'INSERT INTO booking_audit_logs (event_type, request_id, user_id, booking_id, outing_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        String(eventType || 'UNKNOWN'),
        payload.requestId || null,
        payload.userId || null,
        payload.bookingId || null,
        payload.outingId || null,
        JSON.stringify(payload.details || {}),
      ]
    );
  } catch (_) {
    // Audit logging must never block payment/booking flow.
  }
}

async function releaseExpiredReservations(targetOutingId = null) {
  return withTransaction(async (q) => {
    const whereOuting = targetOutingId ? ' AND outing_id = $1' : '';
    let expired = [];
    if (USE_PG) {
      expired = (await q(
        `UPDATE booking_reservations
         SET status = 'expired'
         WHERE status = 'reserved' AND expires_at <= NOW()${whereOuting}
         RETURNING id, booking_id, outing_id, user_id, seat_count`,
        targetOutingId ? [targetOutingId] : []
      )).rows;
    } else {
      expired = (await q(
        `SELECT id, booking_id, outing_id, user_id, seat_count
         FROM booking_reservations
         WHERE status = 'reserved' AND expires_at <= CURRENT_TIMESTAMP${whereOuting}`,
        targetOutingId ? [targetOutingId] : []
      )).rows;
      for (const row of expired) {
        await q("UPDATE booking_reservations SET status = 'expired' WHERE id = $1", [row.id]);
      }
    }

    for (const row of expired) {
      await q("UPDATE bookings SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'", [row.booking_id]);
      await bookingAuditLog('RESERVATION_EXPIRED', {
        bookingId: row.booking_id,
        userId: row.user_id,
        outingId: row.outing_id,
        details: { reservation_id: row.id, seat_count: row.seat_count },
      });
    }
    return expired.length;
  }).catch(() => 0);
}

// Run a set of DB operations inside a single atomic transaction.
// The callback receives a `q(sql, params)` function bound to the transaction.
async function withTransaction(fn) {
  if (USE_PG) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const q = async (sql, params = []) => {
        const r = await client.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount };
      };
      const result = await fn(q);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  }
  // SQLite (better-sqlite3) — synchronous engine; reuse dbQuery on the shared connection
  sqliteDb.exec('BEGIN');
  try {
    const result = await fn(dbQuery);
    sqliteDb.exec('COMMIT');
    return result;
  } catch (err) {
    try { sqliteDb.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

// Grant the one-time welcome bonus to a user inside an existing transaction.
// Idempotent & concurrency-safe: row is locked (PG) and the welcome_bonus_granted
// flag guarantees the ₹bonus is credited at most once per account.
// Returns true if the bonus was granted on this call, false if already granted.
async function grantWelcomeBonusTx(q, userId) {
  const lockClause = USE_PG ? ' FOR UPDATE' : '';
  const row = (await q(`SELECT welcome_bonus_granted FROM users WHERE id = $1${lockClause}`, [userId])).rows[0];
  if (!row) return false;
  const existingBonusTxn = (await q(
    `SELECT id FROM wallet_transactions WHERE user_id = $1 AND type = 'credit' AND (transaction_type = 'WELCOME_BONUS' OR description = $2) LIMIT 1`,
    [userId, WELCOME_BONUS_DESC]
  )).rows[0];
  if (existingBonusTxn) {
    await q(
      USE_PG
        ? 'UPDATE users SET welcome_bonus_granted = TRUE WHERE id = $1'
        : 'UPDATE users SET welcome_bonus_granted = 1 WHERE id = $1',
      [userId]
    );
    return false;
  }
  const alreadyGranted = USE_PG ? row.welcome_bonus_granted === true : !!row.welcome_bonus_granted;
  if (alreadyGranted) return false;
  await q(
    'INSERT INTO wallet_transactions (user_id, type, transaction_type, reference_id, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, 'credit', 'WELCOME_BONUS', `WELCOME_BONUS:${userId}`, WELCOME_BONUS_AMOUNT, WELCOME_BONUS_DESC]
  );
  await q(
    USE_PG
      ? 'UPDATE users SET welcome_bonus_granted = TRUE WHERE id = $1'
      : 'UPDATE users SET welcome_bonus_granted = 1 WHERE id = $1',
    [userId]
  );
  await q('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [userId, 'wallet', `🎉 ₹${WELCOME_BONUS_AMOUNT} Welcome Bonus!`, `Welcome to Vibes Outing! ₹${WELCOME_BONUS_AMOUNT} has been added to your Vibes Wallet.`]
  ).catch(() => {});
  securityLog('WELCOME_BONUS_CREDITED', { userId, amount: WELCOME_BONUS_AMOUNT });
  return true;
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Current wallet balance for a user (credits - debits)
async function getWalletBalance(userId) {
  const txns = (await dbQuery('SELECT type, amount FROM wallet_transactions WHERE user_id = $1', [userId])).rows;
  const credits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
  const debits = txns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
  return credits - debits;
}

// Anti-abuse: block reward if a different account sharing this user's email/phone already earned one
async function isRewardBlockedByDuplicate(user) {
  const phone = normalizePhone(user.phone);
  const candidates = (await dbQuery('SELECT id, email, phone FROM users WHERE id <> $1', [user.id])).rows;
  const siblingIds = candidates.filter(c => {
    const sameEmail = user.email && c.email && String(c.email).toLowerCase() === String(user.email).toLowerCase();
    const samePhone = phone && phone.length === 10 && normalizePhone(c.phone) === phone;
    return sameEmail || samePhone;
  }).map(c => c.id);
  if (!siblingIds.length) return false;
  const placeholders = siblingIds.map((_, i) => '$' + (i + 1)).join(',');
  const rewarded = (await dbQuery(
    `SELECT 1 FROM wallet_transactions WHERE user_id IN (${placeholders}) AND type = 'credit' AND description LIKE '${REWARD_DESC_PREFIX}%' LIMIT 1`,
    siblingIds
  )).rows;
  return rewarded.length > 0;
}

// Credit the new-user reward for a successful booking (idempotent per booking)
async function creditBookingReward(booking) {
  if (!booking || booking.reward_credited) return 0;
  const user = (await dbQuery('SELECT id, name, email, phone FROM users WHERE id = $1', [booking.user_id])).rows[0];
  if (!user) return 0;
  // Atomically claim the reward: only ONE caller can flip reward_credited 0→1.
  // Concurrent / retried verifications see rowCount 0 here and bail, so the
  // ₹reward is credited at most once per booking even under heavy load.
  const claim = await dbQuery('UPDATE bookings SET reward_credited = 1 WHERE id = $1 AND reward_credited = 0', [booking.id]);
  if (!claim.rowCount) return 0;
  if (await isRewardBlockedByDuplicate(user)) {
    securityLog('WALLET_REWARD_BLOCKED_DUPLICATE', { userId: user.id, bookingId: booking.id });
    return 0;
  }
  await dbQuery(
    'INSERT INTO wallet_transactions (user_id, type, transaction_type, reference_id, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [user.id, 'credit', 'BOOKING_REWARD', `BOOKING:${booking.id}`, WALLET_REWARD_AMOUNT, `${REWARD_DESC_PREFIX} — Booking #${booking.id}`]
  );
  await dbQuery('INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [user.id, 'wallet', `🎁 ₹${WALLET_REWARD_AMOUNT} Vibes Wallet Credit!`, `You earned ₹${WALLET_REWARD_AMOUNT} reward credit on your booking. Use it as a discount on your next adventure!`]).catch(() => {});
  securityLog('WALLET_REWARD_CREDITED', { userId: user.id, bookingId: booking.id, amount: WALLET_REWARD_AMOUNT });
  return WALLET_REWARD_AMOUNT;
}

// Cap how much wallet credit can be redeemed against a booking (keeps a small payable amount)
function walletRedeemCap(totalAmount) {
  return Math.max(0, Math.floor(Number(totalAmount) * 0.9));
}

// Redeem wallet credit as a booking discount (records a debit transaction).
// Concurrency-safe: locks the user row and recomputes the balance INSIDE the
// transaction so two simultaneous redemptions can never overspend the wallet.
async function redeemWalletDiscount(userId, bookingId, requestedAmount) {
  const want = Math.max(0, Number(requestedAmount) || 0);
  if (want <= 0) return 0;
  return withTransaction(async (q) => {
    const lockClause = USE_PG ? ' FOR UPDATE' : '';
    // Lock the user row to serialize concurrent wallet mutations for this account
    await q(`SELECT id FROM users WHERE id = $1${lockClause}`, [userId]);
    const txns = (await q('SELECT type, amount FROM wallet_transactions WHERE user_id = $1', [userId])).rows;
    const credits = txns.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const debits = txns.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    const balance = credits - debits;
    const redeem = Math.max(0, Math.min(balance, want));
    if (redeem <= 0) return 0;
    await q(
      'INSERT INTO wallet_transactions (user_id, type, transaction_type, reference_id, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, 'debit', 'BOOKING_DISCOUNT', `BOOKING:${bookingId}`, redeem, `Booking Discount — Booking #${bookingId}`]
    );
    securityLog('WALLET_DISCOUNT_REDEEMED', { userId, bookingId, amount: redeem });
    return redeem;
  });
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
        welcome_bonus_granted BOOLEAN DEFAULT FALSE,
        token_version INTEGER DEFAULT 0,
        refresh_token_hash TEXT,
        refresh_token_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery(`CREATE TABLE IF NOT EXISTS outings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
      slug TEXT DEFAULT '',
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
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_outings_slug ON outings(slug)').catch(() => {});
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

    // Wishlist table
    await dbQuery(`CREATE TABLE IF NOT EXISTS wishlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        outing_id INTEGER NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, outing_id)
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id)').catch(() => {});
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_wishlist_outing_id ON wishlist(outing_id)').catch(() => {});

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
        transaction_type TEXT DEFAULT 'GENERAL',
        reference_id TEXT,
        amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await dbQuery('CREATE INDEX IF NOT EXISTS idx_wallet_txn_user_id ON wallet_transactions(user_id)').catch(() => {});
    await dbQuery("CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_welcome_bonus ON wallet_transactions(user_id) WHERE transaction_type = 'WELCOME_BONUS'").catch(() => {});

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
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password TEXT NOT NULL, interests TEXT DEFAULT '', role TEXT DEFAULT 'user', must_change_password INTEGER DEFAULT 0, welcome_bonus_granted INTEGER DEFAULT 0, token_version INTEGER DEFAULT 0, refresh_token_hash TEXT, refresh_token_expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS outings (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT DEFAULT '', location TEXT NOT NULL, description TEXT, image_url TEXT DEFAULT '', images TEXT DEFAULT '[]', date TEXT NOT NULL, time TEXT DEFAULT '10:00 AM', cost INTEGER NOT NULL, max_participants INTEGER DEFAULT 20, current_participants INTEGER DEFAULT 0, status TEXT DEFAULT 'active', category TEXT DEFAULT '', trip_type TEXT DEFAULT 'one_day', created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
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
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_outings_slug ON outings(slug)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_chat_outing_id ON chat_messages(outing_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)`); } catch(e) {}

    // Notifications table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'general', title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`); } catch(e) {}

    // Wishlist table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS wishlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, outing_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, outing_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (outing_id) REFERENCES outings(id) ON DELETE CASCADE)`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_wishlist_outing_id ON wishlist(outing_id)`); } catch(e) {}

    // Support tickets table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS support_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, priority TEXT DEFAULT 'Medium', message TEXT NOT NULL, status TEXT DEFAULT 'open', admin_reply TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`); } catch(e) {}

    // Wallet transactions table
    sqliteDb.exec(`CREATE TABLE IF NOT EXISTS wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, transaction_type TEXT DEFAULT 'GENERAL', reference_id TEXT, amount INTEGER NOT NULL, description TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))`);
    try { sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_txn_user_id ON wallet_transactions(user_id)`); } catch(e) {}
    try { sqliteDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_welcome_bonus ON wallet_transactions(user_id) WHERE transaction_type = 'WELCOME_BONUS'`); } catch(e) {}

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
        'INSERT INTO outings (title, slug, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)',
        [o.title, o.slug || slugifyOutingTitle(o.title), o.location, o.description, o.date, o.time, o.cost, o.max, o.img, JSON.stringify(o.images || []), o.category || '', o.trip_type || 'one_day']
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

  // Migration: add outing slug column if missing
  await dbQuery("ALTER TABLE outings ADD COLUMN slug TEXT DEFAULT ''").catch(() => {});
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_outings_slug ON outings(slug)').catch(() => {});

  // Migration: add Google OAuth columns to users if missing
  await dbQuery("ALTER TABLE users ADD COLUMN google_id TEXT").catch(() => {});
  await dbQuery("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''").catch(() => {});
  await dbQuery("ALTER TABLE users ALTER COLUMN password DROP NOT NULL").catch(() => {
    // SQLite doesn't support ALTER COLUMN — password is already nullable for Google-only users
  });

  // Migration: add one-time welcome bonus flag to users if missing
  if (USE_PG) {
    await dbQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_bonus_granted BOOLEAN DEFAULT FALSE").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP").catch(() => {});
  } else {
    await dbQuery("ALTER TABLE users ADD COLUMN welcome_bonus_granted INTEGER DEFAULT 0").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN refresh_token_hash TEXT").catch(() => {});
    await dbQuery("ALTER TABLE users ADD COLUMN refresh_token_expires_at DATETIME").catch(() => {});
  }

  // Migration: wallet transaction classification for idempotent rewards/bonuses
  if (USE_PG) {
    await dbQuery("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'GENERAL'").catch(() => {});
    await dbQuery("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_id TEXT").catch(() => {});
  } else {
    await dbQuery("ALTER TABLE wallet_transactions ADD COLUMN transaction_type TEXT DEFAULT 'GENERAL'").catch(() => {});
    await dbQuery("ALTER TABLE wallet_transactions ADD COLUMN reference_id TEXT").catch(() => {});
  }
  await dbQuery("UPDATE wallet_transactions SET transaction_type = 'WELCOME_BONUS' WHERE transaction_type = 'GENERAL' AND type = 'credit' AND description = $1", [WELCOME_BONUS_DESC]).catch(() => {});
  if (USE_PG) {
    await dbQuery(`
      DELETE FROM wallet_transactions wt
      USING wallet_transactions newer
      WHERE wt.user_id = newer.user_id
        AND wt.id > newer.id
        AND wt.type = 'credit'
        AND newer.type = 'credit'
        AND (wt.transaction_type = 'WELCOME_BONUS' OR wt.description = $1)
        AND (newer.transaction_type = 'WELCOME_BONUS' OR newer.description = $1)
    `, [WELCOME_BONUS_DESC]).catch(() => {});
  } else {
    await dbQuery(`
      DELETE FROM wallet_transactions
      WHERE id IN (
        SELECT wt.id
        FROM wallet_transactions wt
        JOIN wallet_transactions newer
          ON wt.user_id = newer.user_id
         AND wt.id > newer.id
        WHERE wt.type = 'credit'
          AND newer.type = 'credit'
          AND (wt.transaction_type = 'WELCOME_BONUS' OR wt.description = $1)
          AND (newer.transaction_type = 'WELCOME_BONUS' OR newer.description = $1)
      )
    `, [WELCOME_BONUS_DESC]).catch(() => {});
  }
  if (USE_PG) {
    await dbQuery("CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_welcome_bonus ON wallet_transactions(user_id) WHERE transaction_type = 'WELCOME_BONUS'").catch(() => {});
  } else {
    await dbQuery("CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_welcome_bonus ON wallet_transactions(user_id) WHERE transaction_type = 'WELCOME_BONUS'").catch(() => {});
  }

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
        'INSERT INTO outings (title, slug, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)',
        [o.title, o.slug || slugifyOutingTitle(o.title), o.location, o.description, o.date, o.time, o.cost, o.max, o.img, JSON.stringify(o.images || []), o.category || '', o.trip_type || 'one_day']
      );
      console.log(`📌 Seeded new outing: ${o.title}`);
    }
  }

  // Migration: ensure every outing has a unique SEO slug derived from title
  const outingsForSlug = (await dbQuery('SELECT id, title, slug FROM outings ORDER BY id ASC')).rows;
  const usedSlugs = new Set();
  for (const row of outingsForSlug) {
    const nextSlug = makeUniqueOutingSlug(row.title, row.id, usedSlugs);
    if ((row.slug || '') !== nextSlug) {
      await dbQuery('UPDATE outings SET slug = $1 WHERE id = $2', [nextSlug, row.id]);
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
  await dbQuery("ALTER TABLE bookings ADD COLUMN payment_order_id TEXT").catch(() => {});
  await dbQuery("ALTER TABLE bookings ADD COLUMN create_request_id TEXT").catch(() => {});

  // Migration: Vibes Wallet rewards — track per-booking discount & reward issuance
  await dbQuery("ALTER TABLE bookings ADD COLUMN wallet_discount INTEGER DEFAULT 0").catch(() => {});
  await dbQuery("ALTER TABLE bookings ADD COLUMN reward_credited INTEGER DEFAULT 0").catch(() => {});

  // Migration: booking reservation + audit log tables for oversell prevention and reliability
  await dbQuery(`CREATE TABLE IF NOT EXISTS booking_reservations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      outing_id INTEGER NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seat_count INTEGER NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'reserved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(async () => {
      await dbQuery(`CREATE TABLE IF NOT EXISTS booking_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        outing_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        seat_count INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        status TEXT DEFAULT 'reserved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (outing_id) REFERENCES outings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`).catch(() => {});
    });

  await dbQuery(`CREATE TABLE IF NOT EXISTS booking_audit_logs (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      request_id TEXT,
      user_id INTEGER,
      booking_id INTEGER,
      outing_id INTEGER,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(async () => {
      await dbQuery(`CREATE TABLE IF NOT EXISTS booking_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        request_id TEXT,
        user_id INTEGER,
        booking_id INTEGER,
        outing_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).catch(() => {});
    });

  await dbQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_reservation_booking ON booking_reservations(booking_id)').catch(() => {});
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_booking_reservations_outing_status_expiry ON booking_reservations(outing_id, status, expires_at)').catch(() => {});
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_booking_audit_logs_booking ON booking_audit_logs(booking_id, created_at)').catch(() => {});
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_booking_audit_logs_request ON booking_audit_logs(request_id)').catch(() => {});
  await dbQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_create_request ON bookings(user_id, create_request_id)').catch(() => {});

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
function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    path: '/',
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
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
    // Atomic: create user + credit one-time ₹welcome bonus + flag — all-or-nothing
    const { user, bonusGranted } = await withTransaction(async (q) => {
      const result = await q(
        'INSERT INTO users (name, email, phone, password, interests) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [sanitize(name), email, sanitize(phone || ''), hashedPassword, sanitize(interests || '')]
      );
      const userId = result.rows[0].id;
      const granted = await grantWelcomeBonusTx(q, userId);
      const created = (await q('SELECT id, name, email, role, token_version FROM users WHERE id = $1', [userId])).rows[0];
      return { user: created, bonusGranted: granted };
    });
    const { accessToken } = await issueAuthSession(res, user);
    securityLog('SIGNUP', { userId: user.id, email, ip: req.ip });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: accessToken, bonusGranted, bonusAmount: bonusGranted ? WELCOME_BONUS_AMOUNT : 0 });
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

  const userResult = await dbQuery('SELECT id, name, email, role, token_version, password as hashed FROM users WHERE email = $1', [email]);
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
  const { accessToken } = await issueAuthSession(res, user);
  securityLog('LOGIN_SUCCESS', { userId: user.id, email, ip: req.ip });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: accessToken });
});

// ─── GOOGLE OAUTH: Sign in / Sign up with Google ────────────────
app.post('/api/auth/google', [
  body('credential').notEmpty().withMessage('Google credential is required'),
], async (req, res) => {
  if (!validate(req, res)) return;
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(503).json({ success: false, message: 'Google sign-in is not configured' });
  }

  const { credential } = req.body;
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('[GOOGLE_AUTH] Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, picture } = payload;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Google account has no email' });
  }

  try {
    // Check if user exists by google_id or email
    let user = (await dbQuery('SELECT id, name, email, role, token_version, google_id, avatar_url FROM users WHERE google_id = $1', [googleId])).rows[0];
    let bonusGranted = false;

    if (!user) {
      // Check by email — link Google account to existing email user
      user = (await dbQuery('SELECT id, name, email, role, token_version, google_id, avatar_url FROM users WHERE email = $1', [email])).rows[0];

      if (user) {
        // Link Google account to existing user — NO welcome bonus (account already registered)
        await dbQuery('UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3', [googleId, picture || '', user.id]);
        user.google_id = googleId;
        user.avatar_url = picture || '';
        securityLog('GOOGLE_ACCOUNT_LINKED', { userId: user.id, email, ip: req.ip });
      } else {
        // First-time Google registration — create user + credit ₹welcome bonus atomically
        const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
        const { created, granted } = await withTransaction(async (q) => {
          const result = await q(
            'INSERT INTO users (name, email, password, google_id, avatar_url) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [name, email, randomPassword, googleId, picture || '']
          );
          const userId = result.rows[0].id;
          const g = await grantWelcomeBonusTx(q, userId);
          const row = (await q('SELECT id, name, email, role, token_version FROM users WHERE id = $1', [userId])).rows[0];
          return { created: row, granted: g };
        });
        user = created;
        user.avatar_url = picture || '';
        bonusGranted = granted;
        securityLog('GOOGLE_SIGNUP', { userId: user.id, email, ip: req.ip });
      }
    } else {
      // Returning Google user — update avatar if changed, NO welcome bonus
      if (picture && picture !== user.avatar_url) {
        await dbQuery('UPDATE users SET avatar_url = $1 WHERE id = $2', [picture, user.id]);
        user.avatar_url = picture;
      }
    }

    const { accessToken } = await issueAuthSession(res, user);
    securityLog('GOOGLE_LOGIN', { userId: user.id, email, ip: req.ip });
    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url || '' },
      token: accessToken,
      bonusGranted,
      bonusAmount: bonusGranted ? WELCOME_BONUS_AMOUNT : 0,
    });
  } catch (err) {
    console.error('[GOOGLE_AUTH] Database error:', err.message);
    res.status(500).json({ success: false, message: 'Authentication failed. Please try again.' });
  }
});

// ─── SECURITY: Logout — clear cookie ────────────────────────────
app.post('/api/auth/logout', async (req, res) => {
  let userId = null;
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : (req.cookies ? req.cookies[ACCESS_TOKEN_COOKIE_NAME] : null);
    const refreshToken = req.cookies ? req.cookies[REFRESH_TOKEN_COOKIE_NAME] : null;
    if (accessToken) {
      const decoded = jwt.verify(accessToken, JWT_SECRET_FINAL, { issuer: 'vibes-outing', audience: 'vibes-outing-app' });
      if (decoded && decoded.id) userId = decoded.id;
    } else if (refreshToken) {
      const decoded = jwt.verify(refreshToken, JWT_SECRET_FINAL, { issuer: 'vibes-outing', audience: 'vibes-outing-app' });
      if (decoded && decoded.id) userId = decoded.id;
    }
  } catch (_) {}

  if (userId) {
    await invalidateUserSession(userId, true).catch(() => {});
    securityLog('LOGOUT', { userId, ip: req.ip });
  }

  clearAuthCookies(res);
  res.json({ success: true });
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies ? req.cookies[REFRESH_TOKEN_COOKIE_NAME] : null;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token missing' });

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET_FINAL, {
      issuer: 'vibes-outing',
      audience: 'vibes-outing-app',
    });
    if (decoded.typ !== 'refresh') {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Invalid refresh token type' });
    }

    const userResult = await dbQuery(
      'SELECT id, name, email, role, token_version, refresh_token_hash, refresh_token_expires_at FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const dbTokenVersion = Number(user.token_version || 0);
    if (dbTokenVersion !== Number(decoded.tv || 0)) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Session has been invalidated' });
    }

    const refreshExpiry = user.refresh_token_expires_at ? new Date(user.refresh_token_expires_at) : null;
    const refreshHash = user.refresh_token_hash || '';
    if (!refreshHash || refreshHash !== hashToken(refreshToken) || (refreshExpiry && refreshExpiry.getTime() <= Date.now())) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Refresh token expired or rotated' });
    }

    // Rotation: issue a new refresh token and invalidate the old one atomically.
    const { accessToken } = await issueAuthSession(res, user);
    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token: accessToken,
    });
  } catch (_) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

// ─── PUBLIC CONFIG: Expose non-secret client config ─────────────
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || '',
  });
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

app.get('/api/outings/by-slug/:slug', [
  param('slug').matches(/^[a-z0-9-]+$/).withMessage('Invalid outing slug'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery('SELECT * FROM outings WHERE slug = $1', [req.params.slug]);
  if (result.rows[0]) res.json(result.rows[0]);
  else res.status(404).json({ message: 'Not found' });
});

// ─── DETAILED TRIP PLAN ─────────────────────────────────────────
const detailedPlansData = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'data', 'detailed-plans.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) { console.warn('⚠ detailed-plans.json not found'); return {}; }
})();

app.get('/api/outings/:id/detailed-plan', [
  param('id').isInt({ min: 1 }).withMessage('Invalid outing ID'),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
    const result = await dbQuery('SELECT * FROM outings WHERE id = $1', [req.params.id]);
    const outing = result.rows[0];
    if (!outing) return res.status(404).json({ message: 'Outing not found' });
    const plan = detailedPlansData[outing.title];
    if (!plan) return res.status(404).json({ message: 'Detailed plan not available for this outing yet' });
    res.json({ success: true, outing_id: outing.id, outing_title: outing.title, plan });
  } catch (error) {
    console.error('[detailed-plan] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch detailed plan' });
  }
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
  const baseSlug = slugifyOutingTitle(title);
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  const result = await dbQuery(
    'INSERT INTO outings (title, slug, location, description, date, time, cost, max_participants, image_url, images, category, trip_type, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
    [sanitize(title), baseSlug, sanitize(location), sanitize(description || ''), date, sanitize(time || '10:00 AM'), cost, max_participants || 20, image_url || '', imagesJson, sanitize(category || ''), sanitize(trip_type || 'one_day'), req.user.id]
  );
  const outingId = result.rows[0].id;
  const slugConflict = (await dbQuery('SELECT id FROM outings WHERE slug = $1 AND id <> $2 LIMIT 1', [baseSlug, outingId])).rows[0];
  const finalSlug = slugConflict ? `${baseSlug}-${outingId}` : baseSlug;
  if (finalSlug !== baseSlug) {
    await dbQuery('UPDATE outings SET slug = $1 WHERE id = $2', [finalSlug, outingId]);
  }
  res.json({ success: true, id: outingId, slug: finalSlug });
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
  const baseSlug = slugifyOutingTitle(title);
  const imagesJson = Array.isArray(images) ? JSON.stringify(images) : (images || '[]');
  const outingId = parseInt(req.params.id, 10);
  const slugConflict = (await dbQuery('SELECT id FROM outings WHERE slug = $1 AND id <> $2 LIMIT 1', [baseSlug, outingId])).rows[0];
  const finalSlug = slugConflict ? `${baseSlug}-${outingId}` : baseSlug;
  await dbQuery(
    'UPDATE outings SET title=$1, slug=$2, location=$3, description=$4, date=$5, time=$6, cost=$7, max_participants=$8, image_url=$9, images=$10, status=$11, category=$12, trip_type=$13 WHERE id=$14',
    [sanitize(title), finalSlug, sanitize(location), sanitize(description || ''), date, sanitize(time), cost, max_participants, image_url || '', imagesJson, status, sanitize(category || ''), sanitize(trip_type || 'one_day'), req.params.id]
  );
  res.json({ success: true, slug: finalSlug });
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
  body('use_wallet').optional().isBoolean().toBoolean(),
  body('request_id').optional().trim().isLength({ min: 8, max: 128 }).matches(/^[A-Za-z0-9._:-]+$/),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, participants, participant_names, selected_date, departure_time, use_wallet } = req.body;
  const user_id = req.user.id; // IDOR prevention: use authenticated user
  const requestId = req.requestId || extractRequestId(req);

  await releaseExpiredReservations(outing_id).catch(() => {});

  // Retry-safe: return the same pending order for the same request id.
  const sameRequest = (await dbQuery(
    'SELECT id, payment_id, payment_order_id, token_amount, total_amount, remaining_amount, wallet_discount, payment_status FROM bookings WHERE user_id = $1 AND create_request_id = $2 ORDER BY id DESC LIMIT 1',
    [user_id, requestId]
  )).rows[0];
  if (sameRequest && sameRequest.payment_status === 'pending') {
    return res.json({
      success: true,
      request_id: requestId,
      order_id: sameRequest.payment_order_id || sameRequest.payment_id,
      booking_id: sameRequest.id,
      amount: sameRequest.token_amount,
      total_amount: sameRequest.total_amount,
      remaining_amount: sameRequest.remaining_amount,
      wallet_discount: sameRequest.wallet_discount,
      key_id: process.env.RAZORPAY_KEY_ID,
      reused: true,
    });
  }

  const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1', [outing_id]);
  const outing = outingResult.rows[0];
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.status !== 'active') return res.status(400).json({ message: 'Outing is not active' });

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
  // Vibes Wallet: optionally apply available credit as a discount (debited on payment success)
  let walletDiscount = 0;
  if (use_wallet) {
    const balance = await getWalletBalance(user_id);
    walletDiscount = Math.max(0, Math.min(balance, walletRedeemCap(totalAmount)));
  }
  const payableTotal = totalAmount - walletDiscount;
  const tokenAmount = Math.ceil(payableTotal * 0.20);
  const remainingAmount = payableTotal - tokenAmount;

  try {
    const order = await razorpay.orders.create({
      amount: tokenAmount * 100,
      currency: 'INR',
      receipt: 'outing_' + outing_id + '_' + Date.now(),
      notes: { user_id: String(user_id), outing_id: String(outing_id), participants: String(participants), type: 'token', request_id: requestId }
    });

    const bookingData = await withTransaction(async (q) => {
      const outingLock = USE_PG ? ' FOR UPDATE' : '';
      const lockedOuting = (await q(`SELECT id, max_participants, current_participants, status FROM outings WHERE id = $1${outingLock}`, [outing_id])).rows[0];
      if (!lockedOuting || lockedOuting.status !== 'active') {
        throw new Error('Outing is not active');
      }

      // Retry-safe guard: reuse active pending booking for same user+outing.
      const activePending = (await q(
        `SELECT b.id, b.payment_id, b.payment_order_id, b.token_amount, b.total_amount, b.remaining_amount, b.wallet_discount
         FROM bookings b
         JOIN booking_reservations r ON r.booking_id = b.id
         WHERE b.user_id = $1 AND b.outing_id = $2 AND b.payment_status = 'pending'
           AND r.status = 'reserved'
           AND ${USE_PG ? 'r.expires_at > NOW()' : 'r.expires_at > CURRENT_TIMESTAMP'}
         ORDER BY b.created_at DESC
         LIMIT 1`,
        [user_id, outing_id]
      )).rows[0];
      if (activePending) return { reused: true, ...activePending };

      const reservedSeats = (await q(
        `SELECT COALESCE(SUM(seat_count), 0) AS reserved
         FROM booking_reservations
         WHERE outing_id = $1 AND status = 'reserved'
           AND ${USE_PG ? 'expires_at > NOW()' : 'expires_at > CURRENT_TIMESTAMP'}`,
        [outing_id]
      )).rows[0];
      const currentParticipants = Number(lockedOuting.current_participants || 0);
      const maxParticipants = Number(lockedOuting.max_participants || 0);
      const activeReserved = Number(reservedSeats?.reserved || 0);
      const available = maxParticipants - currentParticipants - activeReserved;
      if (available < participants) {
        throw new Error('Not enough spots available');
      }

      const bookingInsert = await q(
        'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id, payment_order_id, selected_date, departure_time, wallet_discount, create_request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id',
        [user_id, outing_id, participants, sanitize(participant_names || ''), totalAmount, tokenAmount, remainingAmount, 'pending', 'pending', order.id, order.id, sanitize(selected_date || ''), sanitize(departure_time || ''), walletDiscount, requestId]
      );
      const bookingId = bookingInsert.rows[0].id;
      await q(
        `INSERT INTO booking_reservations (booking_id, outing_id, user_id, seat_count, expires_at, status)
         VALUES ($1, $2, $3, $4, ${USE_PG ? `NOW() + ($5 || ' minutes')::interval` : `datetime('now', '+' || $5 || ' minutes')`}, 'reserved')`,
        [bookingId, outing_id, user_id, participants, BOOKING_RESERVATION_TTL_MINUTES]
      );
      return {
        reused: false,
        id: bookingId,
        payment_id: order.id,
        payment_order_id: order.id,
        token_amount: tokenAmount,
        total_amount: totalAmount,
        remaining_amount: remainingAmount,
        wallet_discount: walletDiscount,
      };
    });

    await bookingAuditLog('ORDER_CREATED_AND_RESERVED', {
      requestId,
      userId: user_id,
      bookingId: bookingData.id,
      outingId: outing_id,
      details: {
        participants,
        token_amount: bookingData.token_amount,
        ttl_minutes: BOOKING_RESERVATION_TTL_MINUTES,
        reused: bookingData.reused,
      },
    });

    res.json({
      success: true,
      request_id: requestId,
      order_id: bookingData.payment_order_id || bookingData.payment_id,
      booking_id: bookingData.id,
      amount: bookingData.token_amount,
      total_amount: bookingData.total_amount,
      remaining_amount: bookingData.remaining_amount,
      wallet_discount: bookingData.wallet_discount,
      key_id: process.env.RAZORPAY_KEY_ID,
      reused: bookingData.reused,
    });
  } catch (err) {
    console.error('Razorpay order/reservation error:', err);
    await bookingAuditLog('ORDER_CREATE_FAILED', {
      requestId,
      userId: user_id,
      outingId: outing_id,
      details: { message: err.message },
    });
    if (String(err.message || '').includes('Not enough spots available')) {
      return res.status(400).json({ success: false, request_id: requestId, message: 'Not enough spots available' });
    }
    if (String(err.message || '').includes('Outing is not active')) {
      return res.status(400).json({ success: false, request_id: requestId, message: 'Outing is not active' });
    }
    res.status(500).json({ success: false, request_id: requestId, message: 'Payment gateway error. Check your Razorpay API keys in .env file.' });
  }
});

app.post('/api/bookings/verify-payment', authMiddleware, [
  body('razorpay_order_id').trim().notEmpty(),
  body('razorpay_payment_id').trim().notEmpty(),
  body('razorpay_signature').trim().notEmpty(),
  body('booking_id').isInt({ min: 1 }),
  body('request_id').optional().trim().isLength({ min: 8, max: 128 }).matches(/^[A-Za-z0-9._:-]+$/),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;
  const requestId = req.requestId || extractRequestId(req);

  await releaseExpiredReservations().catch(() => {});

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
  const providedSignature = String(razorpay_signature || '');

  // Constant-time comparison to prevent timing attacks
  if (providedSignature.length === expectedSignature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
    // Atomically confirm the booking exactly once and convert the seat
    // reservation to a confirmed booking.
    const confirmResult = await withTransaction(async (q) => {
      const lock = USE_PG ? ' FOR UPDATE' : '';
      const fresh = (await q(`SELECT * FROM bookings WHERE id = $1${lock}`, [booking_id])).rows[0];
      if (!fresh) return { status: 'missing' };
      if (fresh.payment_status === 'paid') {
        return { status: 'already_paid', payment_id: fresh.payment_id || razorpay_payment_id };
      }

      const duplicatePayment = (await q(
        `SELECT id FROM bookings WHERE payment_status = 'paid' AND payment_id = $1 AND id <> $2 LIMIT 1${USE_PG ? ' FOR UPDATE' : ''}`,
        [razorpay_payment_id, booking_id]
      )).rows[0];
      if (duplicatePayment) {
        return { status: 'duplicate_payment_id' };
      }

      const reservation = (await q(`SELECT * FROM booking_reservations WHERE booking_id = $1${lock}`, [booking_id])).rows[0];
      if (!reservation) {
        return { status: 'reservation_missing' };
      }
      const reservationExpiry = parseDbTimestamp(reservation.expires_at);
      const isExpired = reservation.status !== 'reserved' || (reservationExpiry && reservationExpiry <= new Date());
      if (isExpired) {
        await q("UPDATE bookings SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'", [booking_id]);
        await q("UPDATE booking_reservations SET status = 'released' WHERE id = $1", [reservation.id]);
        return { status: 'reservation_expired' };
      }

      const outingLock = USE_PG ? ' FOR UPDATE' : '';
      const lockedOuting = (await q(`SELECT id FROM outings WHERE id = $1${outingLock}`, [fresh.outing_id])).rows[0];
      if (!lockedOuting) {
        return { status: 'outing_missing' };
      }

      await q('UPDATE bookings SET payment_status = $1, payment_id = $2 WHERE id = $3', ['paid', razorpay_payment_id, booking_id]);
      await q('UPDATE booking_reservations SET status = $1 WHERE id = $2', ['confirmed', reservation.id]);
      await q('UPDATE outings SET current_participants = current_participants + $1 WHERE id = $2', [reservation.seat_count, fresh.outing_id]);
      return { status: 'confirmed', payment_id: razorpay_payment_id, reservation_id: reservation.id };
    });

    if (confirmResult.status === 'already_paid') {
      // Idempotent: booking was already confirmed by a prior verification call
      securityLog('PAYMENT_DUPLICATE_VERIFY', { userId: req.user.id, bookingId: booking_id, ip: req.ip });
      await bookingAuditLog('PAYMENT_VERIFY_DUPLICATE', {
        requestId,
        userId: req.user.id,
        bookingId: booking_id,
        outingId: booking.outing_id,
        details: { payment_id: confirmResult.payment_id },
      });
      return res.json({ success: true, request_id: requestId, payment_id: confirmResult.payment_id, token_amount: booking.token_amount, remaining_amount: booking.remaining_amount, already_confirmed: true });
    }
    if (confirmResult.status === 'duplicate_payment_id') {
      await bookingAuditLog('PAYMENT_VERIFY_REJECTED_DUPLICATE_PAYMENT_ID', {
        requestId,
        userId: req.user.id,
        bookingId: booking_id,
        outingId: booking.outing_id,
        details: { payment_id: razorpay_payment_id },
      });
      return res.status(409).json({ success: false, request_id: requestId, message: 'Duplicate payment detected. Contact support.' });
    }
    if (confirmResult.status === 'reservation_expired') {
      await bookingAuditLog('PAYMENT_VERIFY_REJECTED_RESERVATION_EXPIRED', {
        requestId,
        userId: req.user.id,
        bookingId: booking_id,
        outingId: booking.outing_id,
      });
      return res.status(409).json({ success: false, request_id: requestId, message: 'Reservation expired. Please create a new order.' });
    }
    if (confirmResult.status !== 'confirmed') {
      await bookingAuditLog('PAYMENT_VERIFY_REJECTED', {
        requestId,
        userId: req.user.id,
        bookingId: booking_id,
        outingId: booking.outing_id,
        details: { reason: confirmResult.status },
      });
      return res.status(400).json({ success: false, request_id: requestId, message: 'Unable to verify payment for this booking' });
    }

    // Vibes Wallet: redeem any reserved discount, then credit the new-user reward
    let walletDiscountApplied = 0;
    if (booking.wallet_discount && Number(booking.wallet_discount) > 0) {
      walletDiscountApplied = await redeemWalletDiscount(booking.user_id, booking.id, booking.wallet_discount);
    }
    const rewardCredited = await creditBookingReward(booking);

    const user = (await dbQuery('SELECT * FROM users WHERE id = $1', [booking.user_id])).rows[0];
    const outing = (await dbQuery('SELECT * FROM outings WHERE id = $1', [booking.outing_id])).rows[0];
    if (user && outing) {
      sendBookingEmail(user.email, user.name, outing.title, outing.date, outing.location, booking.token_amount, razorpay_payment_id);
    }
    await bookingAuditLog('PAYMENT_VERIFIED_SUCCESS', {
      requestId,
      userId: req.user.id,
      bookingId: booking_id,
      outingId: booking.outing_id,
      details: { payment_id: razorpay_payment_id },
    });
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
    res.json({ success: true, request_id: requestId, payment_id: razorpay_payment_id, whatsapp_link: whatsappLink, token_amount: booking.token_amount, remaining_amount: booking.remaining_amount, wallet_discount: walletDiscountApplied, reward_credited: rewardCredited, outing_date: outing ? outing.date : '', digital_pass_id: digitalPass ? digitalPass.pass_id : null });
  } else {
    await withTransaction(async (q) => {
      const lock = USE_PG ? ' FOR UPDATE' : '';
      const fresh = (await q(`SELECT payment_status FROM bookings WHERE id = $1${lock}`, [booking_id])).rows[0];
      if (!fresh || fresh.payment_status === 'paid') return;
      await q('UPDATE bookings SET payment_status = $1 WHERE id = $2', ['failed', booking_id]);
      await q("UPDATE booking_reservations SET status = 'released' WHERE booking_id = $1 AND status = 'reserved'", [booking_id]);
    });
    await bookingAuditLog('PAYMENT_VERIFY_SIGNATURE_FAILED', {
      requestId,
      userId: req.user.id,
      bookingId: booking_id,
      outingId: booking.outing_id,
      details: { payment_id: razorpay_payment_id },
    });
    securityLog('PAYMENT_VERIFICATION_FAILED', { userId: req.user.id, bookingId: booking_id, ip: req.ip });
    res.status(400).json({ success: false, request_id: requestId, message: 'Payment verification failed' });
  }
});

app.post('/api/bookings/payment-failed', authMiddleware, [
  body('booking_id').isInt({ min: 1 }),
  body('reason').optional().trim().isLength({ max: 300 }),
  body('request_id').optional().trim().isLength({ min: 8, max: 128 }).matches(/^[A-Za-z0-9._:-]+$/),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { booking_id, reason } = req.body;
  const requestId = req.requestId || extractRequestId(req);
  const releaseResult = await withTransaction(async (q) => {
    const lock = USE_PG ? ' FOR UPDATE' : '';
    const booking = (await q(`SELECT * FROM bookings WHERE id = $1 AND user_id = $2${lock}`, [booking_id, req.user.id])).rows[0];
    if (!booking) return { status: 'missing' };
    if (booking.payment_status === 'paid') return { status: 'already_paid' };
    await q("UPDATE bookings SET payment_status = 'failed' WHERE id = $1", [booking_id]);
    const release = await q("UPDATE booking_reservations SET status = 'released' WHERE booking_id = $1 AND status = 'reserved'", [booking_id]);
    return { status: 'released', released: release.rowCount || 0, outing_id: booking.outing_id };
  });

  if (releaseResult.status === 'missing') {
    return res.status(404).json({ success: false, request_id: requestId, message: 'Booking not found' });
  }
  await bookingAuditLog('PAYMENT_MARKED_FAILED', {
    requestId,
    userId: req.user.id,
    bookingId: booking_id,
    outingId: releaseResult.outing_id,
    details: { reason: sanitize(reason || 'payment_failed_callback'), released_count: releaseResult.released || 0 },
  });
  if (releaseResult.status === 'already_paid') {
    return res.json({ success: true, request_id: requestId, already_paid: true });
  }
  res.json({ success: true, request_id: requestId, released: true, released_count: releaseResult.released || 0 });
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
    // Idempotent: only the first verification flips pending→paid and notifies
    const claim = await dbQuery('UPDATE bookings SET remaining_payment_status = $1, remaining_payment_id = $2 WHERE id = $3 AND remaining_payment_status <> $1', ['paid', razorpay_payment_id, booking_id]);
    if (!claim.rowCount) {
      return res.json({ success: true, payment_id: razorpay_payment_id, already_confirmed: true });
    }
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

  const { outing_id, participants, participant_names, total_amount, selected_date, departure_time, use_wallet } = req.body;
  const user_id = req.user.id; // IDOR prevention
  const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1', [outing_id]);
  const outing = outingResult.rows[0];
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }
  // Vibes Wallet: optionally apply available credit as a discount
  let walletDiscount = 0;
  if (use_wallet) {
    const balance = await getWalletBalance(user_id);
    walletDiscount = Math.max(0, Math.min(balance, walletRedeemCap(total_amount)));
  }
  const payableTotal = total_amount - walletDiscount;
  const tokenAmount = Math.ceil(payableTotal * 0.20);
  const remainingAmount = payableTotal - tokenAmount;
  const paymentId = 'pay_demo_' + crypto.randomBytes(8).toString('hex');
  const result = await dbQuery(
    'INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, remaining_payment_status, payment_id, selected_date, departure_time, wallet_discount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
    [user_id, outing_id, participants, sanitize(participant_names || ''), total_amount, tokenAmount, remainingAmount, 'paid', 'pending', paymentId, sanitize(selected_date || ''), sanitize(departure_time || ''), walletDiscount]
  );
  const bookingId = result.rows[0].id;
  await dbQuery('UPDATE outings SET current_participants = current_participants + $1 WHERE id = $2', [participants, outing_id]);
  // Vibes Wallet: redeem reserved discount, then credit the new-user reward
  let walletDiscountApplied = 0;
  if (walletDiscount > 0) {
    walletDiscountApplied = await redeemWalletDiscount(user_id, bookingId, walletDiscount);
  }
  const rewardCredited = await creditBookingReward({ id: bookingId, user_id, reward_credited: 0 });
  // Auto-generate Digital Trip Pass for demo booking
  let digitalPass = null;
  try {
    digitalPass = await generateDigitalPass(bookingId, user_id, outing_id);
  } catch (passErr) {
    console.error('[DIGITAL_PASS] Demo generation failed:', passErr.message);
  }
  res.json({ success: true, booking_id: bookingId, payment_id: paymentId, token_amount: tokenAmount, remaining_amount: remainingAmount, wallet_discount: walletDiscountApplied, reward_credited: rewardCredited, digital_pass_id: digitalPass ? digitalPass.pass_id : null });
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

// ─── CHAT ROUTES ────────────────────────────────────────────────
app.get('/api/chat/:outingId', authMiddleware, [
  param('outingId').isInt({ min: 1 }).withMessage('Invalid outing ID'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery(
    'SELECT cm.*, u.name as user_name FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.outing_id = $1 ORDER BY cm.created_at ASC LIMIT 200',
    [req.params.outingId]
  );
  res.json(result.rows);
});

app.post('/api/chat', authMiddleware, [
  body('outing_id').isInt({ min: 1 }).withMessage('Valid outing ID required'),
  body('message').trim().notEmpty().isLength({ max: 1000 }).withMessage('Message is required (max 1000 chars)').escape(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { outing_id, message } = req.body;
  const user_id = req.user.id;
  await dbQuery(
    'INSERT INTO chat_messages (outing_id, user_id, message) VALUES ($1,$2,$3)',
    [outing_id, user_id, sanitize(message)]
  );
  res.json({ success: true });
});

// ─── SUGGESTION ROUTES ──────────────────────────────────────────
app.get('/api/razorpay-key', (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID || '' });
});

// ─── CLIENT ERROR LOGGING ───────────────────────────────────────
app.post('/api/log/error', rateLimit({ windowMs: 60000, max: 20 }), [
  body('message').trim().isLength({ max: 500 }),
  body('source').optional().trim().isLength({ max: 200 }),
  body('context').optional().trim().isLength({ max: 500 }),
], (req, res) => {
  const { message, source, context } = req.body || {};
  console.error(`[CLIENT_ERROR] ${message || 'unknown'} | src=${source || '-'} | ctx=${context || '-'} | ip=${req.ip}`);
  res.json({ logged: true });
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
app.get('/api/notifications/stream', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  addNotificationSseClient(userId, res);
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ event: 'connected', userId, ts: new Date().toISOString() })}\n\n`);

  const pingTimer = setInterval(() => {
    try {
      res.write(`event: ping\n`);
      res.write(`data: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(pingTimer);
    removeNotificationSseClient(userId, res);
    try { res.end(); } catch (_) {}
  });
});

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
  publishNotificationEvent(req.user.id, 'notifications.sync', { userId: req.user.id });
  res.json({ success: true });
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  await dbQuery('UPDATE notifications SET read = 1 WHERE user_id = $1', [req.user.id]);
  publishNotificationEvent(req.user.id, 'notifications.sync', { userId: req.user.id });
  res.json({ success: true });
});

// ─── WISHLIST API ───────────────────────────────────────────────
app.get('/api/wishlist', authMiddleware, async (req, res) => {
  const result = await dbQuery(
    `SELECT w.id, w.user_id, w.outing_id, w.created_at,
            o.title as outing_title, o.location as outing_location, o.image_url as outing_image,
            o.date as outing_date, o.cost as outing_cost
     FROM wishlist w
     JOIN outings o ON o.id = w.outing_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

app.post('/api/wishlist', authMiddleware, [
  body('outing_id').isInt({ min: 1 }).toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const outingId = req.body.outing_id;
  const outing = (await dbQuery('SELECT id FROM outings WHERE id = $1', [outingId])).rows[0];
  if (!outing) return res.status(404).json({ success: false, message: 'Outing not found' });

  const inserted = await dbQuery(
    `INSERT INTO wishlist (user_id, outing_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, outing_id) DO NOTHING
     RETURNING id, user_id, outing_id, created_at`,
    [req.user.id, outingId]
  );

  if (inserted.rows[0]) return res.json({ success: true, item: inserted.rows[0], created: true });

  const existing = (await dbQuery(
    'SELECT id, user_id, outing_id, created_at FROM wishlist WHERE user_id = $1 AND outing_id = $2',
    [req.user.id, outingId]
  )).rows[0];
  return res.json({ success: true, item: existing || null, created: false });
});

app.delete('/api/wishlist/:id', authMiddleware, [
  param('id').isInt({ min: 1 }).toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  const result = await dbQuery('DELETE FROM wishlist WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ success: true, deleted: result.rowCount > 0 });
});

// ─── WALLET API ─────────────────────────────────────────────────
app.get('/api/wallet/:userId', authMiddleware, [
  param('userId').isInt().toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
], async (req, res) => {
  if (!validate(req, res)) return;
  if (req.user.id !== req.params.userId && req.user.role !== 'admin') return res.status(403).json({ balance: 0, transactions: [] });
  const userId = req.params.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  const offset = (page - 1) * pageSize;

  const [balanceRow, countRow, pageTxns, summaryRow] = await Promise.all([
    dbQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS credits,
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS debits
       FROM wallet_transactions
       WHERE user_id = $1`,
      [userId]
    ),
    dbQuery('SELECT COUNT(*) as count FROM wallet_transactions WHERE user_id = $1', [userId]),
    dbQuery(
      'SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, pageSize, offset]
    ),
    dbQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' AND description LIKE 'Wallet Recharge%' THEN amount ELSE 0 END), 0) AS recharge_credits,
         COALESCE(COUNT(CASE WHEN type = 'credit' AND description LIKE 'Wallet Recharge%' THEN 1 END), 0) AS recharge_count,
         COALESCE(SUM(CASE WHEN type = 'credit' AND (description LIKE '${REWARD_DESC_PREFIX}%' OR description = '${WELCOME_BONUS_DESC}') THEN amount ELSE 0 END), 0) AS reward_credits,
         COALESCE(COUNT(CASE WHEN type = 'credit' AND (description LIKE '${REWARD_DESC_PREFIX}%' OR description = '${WELCOME_BONUS_DESC}') THEN 1 END), 0) AS reward_count,
         COALESCE(SUM(CASE WHEN type = 'debit' AND description LIKE 'Booking Discount%' THEN amount ELSE 0 END), 0) AS booking_debits,
         COALESCE(COUNT(CASE WHEN type = 'debit' AND description LIKE 'Booking Discount%' THEN 1 END), 0) AS booking_debit_count
       FROM wallet_transactions
       WHERE user_id = $1`,
      [userId]
    )
  ]);

  const credits = Number(balanceRow.rows[0]?.credits || 0);
  const debits = Number(balanceRow.rows[0]?.debits || 0);
  const totalTransactions = Number(countRow.rows[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));
  const summary = summaryRow.rows[0] || {};

  res.json({
    balance: credits - debits,
    transactions: pageTxns.rows,
    pagination: {
      page,
      pageSize,
      totalTransactions,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    summary: {
      rechargeCredits: Number(summary.recharge_credits || 0),
      rechargeTransactions: Number(summary.recharge_count || 0),
      rewardCredits: Number(summary.reward_credits || 0),
      rewardTransactions: Number(summary.reward_count || 0),
      bookingDebits: Number(summary.booking_debits || 0),
      bookingDeductions: Number(summary.booking_debit_count || 0)
    },
    asOf: new Date().toISOString()
  });
});

// ─── WALLET RECHARGE API ────────────────────────────────────────

// Create Razorpay order for wallet recharge
app.post('/api/wallet/recharge/create-order', authMiddleware, [
  body('amount').isInt({ min: 100, max: 50000 }).withMessage('Amount must be between ₹100 and ₹50,000'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { amount } = req.body;

  if (!RAZORPAY_CONFIGURED) {
    return res.status(503).json({ success: false, message: 'Payment gateway not configured. Please set Razorpay API keys.' });
  }

  try {
    const idempotencyKey = `wallet_recharge_${req.user.id}_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: `wallet_${req.user.id}_${Date.now()}`,
      notes: {
        user_id: String(req.user.id),
        type: 'wallet_recharge',
        amount: String(amount),
        idempotency_key: idempotencyKey
      }
    });

    securityLog('WALLET_RECHARGE_ORDER_CREATED', { userId: req.user.id, amount, orderId: order.id, ip: req.ip });

    res.json({
      success: true,
      order_id: order.id,
      amount,
      key_id: process.env.RAZORPAY_KEY_ID,
      idempotency_key: idempotencyKey
    });
  } catch (err) {
    console.error('Wallet recharge order error:', err);
    securityLog('WALLET_RECHARGE_ORDER_FAILED', { userId: req.user.id, amount, error: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: 'Failed to create recharge order. Please try again.' });
  }
});

// Verify wallet recharge payment and credit wallet
app.post('/api/wallet/recharge/verify', authMiddleware, [
  body('razorpay_order_id').trim().notEmpty().withMessage('Order ID required'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('Payment ID required'),
  body('razorpay_signature').trim().notEmpty().withMessage('Signature required'),
  body('amount').isInt({ min: 100, max: 50000 }).withMessage('Invalid amount'),
], async (req, res) => {
  if (!validate(req, res)) return;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpaySecret) {
    securityLog('WALLET_RECHARGE_NO_SECRET', { userId: req.user.id, ip: req.ip });
    return res.status(500).json({ success: false, message: 'Payment gateway not configured' });
  }

  // Verify signature using HMAC SHA256 (constant-time comparison)
  const body_str = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto.createHmac('sha256', razorpaySecret).update(body_str).digest('hex');

  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));
  } catch (e) {
    sigValid = false;
  }

  if (!sigValid) {
    securityLog('WALLET_RECHARGE_SIGNATURE_INVALID', { userId: req.user.id, orderId: razorpay_order_id, ip: req.ip });
    return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
  }

  // Validate payment/order metadata to prevent amount tampering and account mismatch.
  try {
    const [orderDetails, paymentDetails] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id)
    ]);

    if (!orderDetails || !paymentDetails) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. Unable to fetch payment details.' });
    }

    const expectedAmountPaise = Number(amount) * 100;
    const orderAmount = Number(orderDetails.amount || 0);
    const paymentAmount = Number(paymentDetails.amount || 0);
    const orderUserId = String(orderDetails.notes?.user_id || '');
    const paymentOrderId = String(paymentDetails.order_id || '');
    const paymentStatus = String(paymentDetails.status || '').toLowerCase();

    if (orderUserId !== String(req.user.id)) {
      securityLog('WALLET_RECHARGE_USER_MISMATCH', { userId: req.user.id, orderId: razorpay_order_id, orderUserId, ip: req.ip });
      return res.status(403).json({ success: false, message: 'Payment does not belong to this user.' });
    }

    if (orderAmount !== expectedAmountPaise || paymentAmount !== expectedAmountPaise || paymentOrderId !== razorpay_order_id) {
      securityLog('WALLET_RECHARGE_AMOUNT_MISMATCH', {
        userId: req.user.id,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        requestedAmount: expectedAmountPaise,
        orderAmount,
        paymentAmount,
        paymentOrderId,
        ip: req.ip
      });
      return res.status(400).json({ success: false, message: 'Payment amount verification failed.' });
    }

    if (!['authorized', 'captured'].includes(paymentStatus)) {
      securityLog('WALLET_RECHARGE_PAYMENT_STATUS_INVALID', {
        userId: req.user.id,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        paymentStatus,
        ip: req.ip
      });
      return res.status(400).json({ success: false, message: 'Payment is not in a valid state for wallet credit.' });
    }
  } catch (fetchErr) {
    console.error('Wallet recharge verification fetch error:', fetchErr);
    securityLog('WALLET_RECHARGE_VERIFY_FETCH_FAILED', { userId: req.user.id, orderId: razorpay_order_id, paymentId: razorpay_payment_id, error: fetchErr.message, ip: req.ip });
    return res.status(502).json({ success: false, message: 'Unable to verify payment details. Please retry in a moment.' });
  }

  // Prevent duplicate credits: check if this payment_id already credited
  const existingTxn = await dbQuery(
    "SELECT id FROM wallet_transactions WHERE user_id = $1 AND description LIKE $2",
    [req.user.id, `%${razorpay_payment_id}%`]
  );
  if (existingTxn.rows.length > 0) {
    securityLog('WALLET_RECHARGE_DUPLICATE', { userId: req.user.id, paymentId: razorpay_payment_id, ip: req.ip });
    return res.json({ success: true, message: 'Payment already credited', balance: await getWalletBalance(req.user.id), duplicate: true });
  }

  // Credit the wallet
  await dbQuery(
    'INSERT INTO wallet_transactions (user_id, type, transaction_type, reference_id, amount, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.user.id, 'credit', 'RECHARGE', razorpay_payment_id, amount, `Wallet Recharge — ₹${amount} (Ref: ${razorpay_payment_id})`]
  );

  // Create notification
  await dbQuery(
    'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
    [req.user.id, 'wallet', 'Wallet Recharged! 💰', `₹${amount} has been added to your Vibes Wallet. Payment ID: ${razorpay_payment_id}`]
  );

  const newBalance = await getWalletBalance(req.user.id);
  securityLog('WALLET_RECHARGE_SUCCESS', { userId: req.user.id, amount, paymentId: razorpay_payment_id, newBalance, ip: req.ip });

  res.json({ success: true, message: 'Wallet recharged successfully', balance: newBalance, amount, payment_id: razorpay_payment_id });
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
  try {
    const result = await dbQuery(
      'SELECT * FROM trip_expectations WHERE booking_id = $1 AND user_id = $2',
      [req.params.bookingId, req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching expectations for booking:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load expectations' });
  }
});

// Get all expectations for the current user
app.get('/api/expectations/my', authMiddleware, async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT te.*, o.title as outing_title, o.location as outing_location, o.date as outing_date
       FROM trip_expectations te
       JOIN outings o ON te.outing_id = o.id
       WHERE te.user_id = $1
       ORDER BY te.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user expectations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load expectations' });
  }
});

// Submit or update expectations
app.post('/api/expectations', authMiddleware, [
  body('booking_id').isInt({ min: 1 }).withMessage('Valid booking ID required'),
  body('expectations').trim().notEmpty().withMessage('Expectations text is required').isLength({ max: 2000 }).withMessage('Maximum 2000 characters allowed'),
  body('tags').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
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
  } catch (err) {
    console.error('Error submitting expectations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit expectations. Please try again.' });
  }
});

// Delete expectations
app.delete('/api/expectations/:id', authMiddleware, [
  param('id').isInt({ min: 1 }),
], async (req, res) => {
  if (!validate(req, res)) return;
  try {
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
  } catch (err) {
    console.error('Error deleting expectation:', err.message);
    res.status(500).json({ success: false, message: 'Failed to remove expectations' });
  }
});

// Admin: View all expectations (with filters)
app.get('/api/admin/expectations', authMiddleware, adminMiddleware, async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error fetching admin expectations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load expectations' });
  }
});

// Admin: Get expectations summary per outing
app.get('/api/admin/expectations/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT o.id as outing_id, o.title, o.date, o.location, COUNT(te.id) as expectation_count
       FROM outings o
       LEFT JOIN trip_expectations te ON te.outing_id = o.id
       WHERE o.status = 'active'
       GROUP BY o.id, o.title, o.date, o.location
       ORDER BY o.date ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching expectations summary:', err.message);
    res.status(500).json({ success: false, message: 'Failed to load expectations summary' });
  }
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
  if (sentry) {
    sentry.captureException(err, {
      tags: { scope: 'express_error_handler' },
      extra: { path: req.path, method: req.method },
    });
  }
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
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const appIndexPath = path.join(__dirname, 'public', 'app', 'index.html');
  const injectNonce = (html, nonce) => {
    if (!nonce) return html;
    return html
      .replace(/<style>/gi, `<style nonce="${nonce}">`)
      .replace(/<script(?![^>]*\bsrc=)/gi, `<script nonce="${nonce}"`);
  };

  app.get(['/app', '/app/*'], (req, res) => {
    if (!fs.existsSync(appIndexPath)) return res.status(404).send('app index not found');
    const appHtml = fs.readFileSync(appIndexPath, 'utf8');
    return res.type('html').send(injectNonce(appHtml, res.locals.cspNonce));
  });

  app.get('*', (req, res) => {
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('index.html not found');
    }
    const html = fs.readFileSync(indexPath, 'utf8');
    return res.type('html').send(injectNonce(html, res.locals.cspNonce));
  });
}

// ─── GLOBAL ERROR HANDLER ───────────────────────────────────────
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  console.error(`[UNHANDLED_ERROR] ${req.method} ${req.path}:`, err.message || err);
  securityLog('UNHANDLED_ROUTE_ERROR', { method: req.method, path: req.path, error: err.message, ip: req.ip });
  if (sentry) {
    sentry.captureException(err, {
      tags: { scope: 'global_route_handler' },
      extra: { method: req.method, path: req.path },
    });
  }
  if (!res.headersSent) {
    res.status(status).json({ success: false, message: status === 500 ? 'Internal server error' : err.message });
  }
});

// ─── START SERVER (after DB init) ───────────────────────────────
const PORT = process.env.PORT || 3000;

initDatabase().then(async () => {
  // Mount MCP Server (SSE transport for AI agents)
  await mountMcpRoutes(app, dbQuery).catch(err => {
    console.error('MCP Server mount failed (non-fatal):', err.message);
  });

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 VIBES@Outing Platform running at http://localhost:${PORT}`);
    console.log(`   Environment: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log('   Database: PostgreSQL ✓');
    if (!IS_PROD) console.log(`   Admin Login: vibesoutingsupport@gmail.com / ${process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Vibes2026'}`);
    console.log('');
    verifyEmailTransport().catch((err) => {
      console.error('Email transport verification error:', err.message);
    });

    const cleanupMs = Math.max(15000, (parseInt(process.env.BOOKING_RESERVATION_CLEANUP_MS, 10) || 30000));
    setInterval(() => {
      releaseExpiredReservations().catch(() => {});
    }, cleanupMs).unref();
  });

  // Tune socket timeouts for load behind proxies/load balancers.
  // keepAliveTimeout must exceed the typical LB idle timeout to avoid
  // races that surface as 502s under sustained/spike traffic.
  server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000;
  server.headersTimeout = parseInt(process.env.HEADERS_TIMEOUT) || 66000;
  server.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000;

  // ─── GRACEFUL SHUTDOWN ────────────────────────────────────────
  // Drain in-flight requests and close the DB pool on restart/deploy so
  // spike, endurance and rolling-restart scenarios don't drop connections
  // or leak resources.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(async () => {
      try {
        if (USE_PG && pool) await pool.end();
        else if (sqliteDb) sqliteDb.close();
      } catch (e) {
        console.error('Error during DB shutdown:', e.message);
      }
      console.log('Shutdown complete.');
      process.exit(0);
    });
    // Force-exit if connections refuse to drain in time
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, parseInt(process.env.SHUTDOWN_TIMEOUT) || 15000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(err => {
  console.error('❌ Failed to initialize database:', err.message || err.code || err);
  console.error('   DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, '://***@') : 'NOT SET');
  process.exit(1);
});

// ─── PROCESS-LEVEL SAFETY NETS ──────────────────────────────────
// A single unhandled rejection/exception must never silently kill the
// process mid-load. Log and keep serving; rely on the platform's health
// checks + graceful shutdown for genuinely fatal states.
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err && err.stack ? err.stack : err);
});
