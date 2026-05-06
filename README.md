# VIBES@Outing Platform 🔥

**GenZ-Only Group Outings — Premium Resorts + Private Cab, Zero Planning**

## Quick Start
```bash
npm install
node server.js
```

Open http://localhost:3000

## Admin Login
- Email: `vibesoutingsupport@gmail.com`
- Password: `Admin@Vibes2026`

## Adding New Outings
- No code change is needed for live outings if you create them from the admin dashboard.
- To change the default seeded catalog for fresh databases, edit `data/default-outings.json`.

## Environment Variables
Create a `.env` file:
```
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

For production, use `.env.example` as the full source of truth.

## Password Reset + Email Setup (Production)

### Required Variables
Set these on Railway (backend) and locally:

```
NODE_ENV=production
APP_BASE_URL=https://yourdomain.com
PASSWORD_RESET_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://your-railway-url.up.railway.app
ALLOW_VERCEL_PREVIEWS=false

MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=your-email@gmail.com
SMTP_FROM_NAME=VIBES@Outing
```

SendGrid SMTP alternative:

```
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxx
SMTP_FROM=verified-sender@yourdomain.com
SMTP_FROM_NAME=VIBES@Outing
```

### Gmail Notes
1. Turn on 2FA for the Gmail account.
2. Create an App Password in Google Account settings.
3. Use that app password in `SMTP_PASS`.
4. Never use your normal Gmail account password.

### DNS Auth (Custom Domain)
1. Add SPF TXT record for your mail provider.
2. Add DKIM records exactly as provider gives them.
3. Add DMARC TXT record to monitor/enforce policy.
4. Wait for DNS propagation and verify in provider dashboard.

### Railway + Vercel Deployment Checklist
1. Railway: set all backend env vars from `.env.example`.
2. Railway: ensure `PASSWORD_RESET_URL` points to your frontend domain.
3. Railway: ensure `ALLOWED_ORIGINS` includes frontend domain(s) and Railway API URL if used.
4. Vercel/frontend: if frontend is separate, set `window.VIBES_API_BASE` to your Railway API domain in hosted HTML build process.
5. Redeploy both services after env var changes.
6. Trigger forgot-password once and check Railway logs for `[EMAIL]` verify/send events.

### Why Password-Reset Emails Commonly Fail
1. Missing `SMTP_USER` / `SMTP_PASS` in deployment env.
2. Gmail app password not configured (or normal password used instead).
3. `PASSWORD_RESET_URL` points to wrong domain.
4. `ALLOWED_ORIGINS` missing frontend URL, causing request failure before email route executes.
5. `SMTP_FROM` not accepted by provider (unverified sender/domain).
6. SPF/DKIM/DMARC not set, causing spam/junk or silent rejection.

## Features
- 10 curated premium outings (₹1,999 – ₹12,999) with High-end Resort + Private Cab
- Browse & book group outings with Razorpay payments
- AI-powered recommendations
- Group chat for booked participants
- Ratings & reviews
- ID verification system
- WhatsApp & Email notifications
- Admin dashboard with full management
- Built for GenZ — aesthetic UI, zero friction
