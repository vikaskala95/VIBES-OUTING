# 🚀 Railway Deployment Checklist — Password Reset + Email Working

**Company Email:** vibesoutingsupport@gmail.com  
**Purpose:** Ensure forgot-password emails arrive in user inboxes when deployed to Railway.

---

## Step 1: Gmail App Password Setup (One-time)

> ⚠️ **Prerequisites:** Gmail account (vibesoutingsupport@gmail.com) with 2FA enabled.

1. Go to https://myaccount.google.com/
2. Left sidebar → **Security**
3. Scroll to "How you sign in to Google" → Enable **2-Step Verification** if not already on
4. Return to **Security** → Scroll down to "Your app passwords"
5. Select **Mail** and **Windows Computer** (or generic "Other")
6. Google generates a 16-character password → **Copy it**
7. **Store in Railway secret:** This is your `SMTP_PASS` value

---

## Step 2: Railway Environment Variables

Log into Railway dashboard → Your Project → Settings → **Variables**

### Required Variables

Add these exact key-value pairs:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Enables strict security mode |
| `JWT_SECRET` | `<generate random 64 char>` | `openssl rand -hex 32` or similar |
| `SESSION_SECRET` | `<generate random 64 char>` | Different from JWT_SECRET |
| `ADMIN_DEFAULT_PASSWORD` | `<strong password>` | Change immediately after first login |
| `APP_BASE_URL` | `https://vibesouting.in` | Your frontend domain |
| `PASSWORD_RESET_URL` | `https://vibesouting.in` | Where reset link points to |
| `ALLOWED_ORIGINS` | `https://vibesouting.in,https://www.vibesouting.in` | Frontend domains only (no API URL) |
| `RAZORPAY_KEY_ID` | `rzp_live_xxxxx` | From Razorpay live dashboard |
| `RAZORPAY_KEY_SECRET` | `xxxxx` | From Razorpay live dashboard |

### Email Variables (for forgot-password)

| Key | Value | Notes |
|-----|-------|-------|
| `MAIL_PROVIDER` | `smtp` | Always `smtp` for Gmail |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail SMTP server |
| `SMTP_PORT` | `587` | Standard TLS port |
| `SMTP_SECURE` | `false` | Gmail uses STARTTLS on port 587 |
| `SMTP_REQUIRE_TLS` | `true` | Enforce encryption |
| `SMTP_USER` | `vibesoutingsupport@gmail.com` | The company email |
| `SMTP_PASS` | `<16-char app password>` | From Step 1 above ⬆ |
| `SMTP_FROM` | `vibesoutingsupport@gmail.com` | Sender address |
| `SMTP_FROM_NAME` | `VIBES@Outing` | Display name in inbox |

### Database (auto-created by Railway)

| Key | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | Auto-populated | PostgreSQL connection string from Railway DB service |

---

## Step 3: DNS Email Authentication (Optional but Recommended)

To prevent emails from going to spam, add these DNS records for your domain (`vibesouting.in`):

### SPF Record
```
Host: @
Type: TXT
Value: v=spf1 include:sendgrid.net include:gmail.com ~all
```

### DKIM Record (Optional)
Contact SendGrid or Google for DKIM records if you own the domain.

### DMARC Record (Monitoring)
```
Host: _dmarc
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:vibesoutingsupport@gmail.com
```

---

## Step 4: Frontend Environment (if separate from backend)

### If frontend is on Vercel (separate from Railway backend):

In Vercel deployment settings or `next.config.js`, inject:
```javascript
window.VIBES_API_BASE = 'https://vibesouting-production.up.railway.app';
```

Or set build env var:
```
VITE_API_BASE=https://vibesouting-production.up.railway.app
```

### If frontend is on same Railway service:

No extra config needed — frontend uses `/api` routes automatically.

---

## Step 5: Redeploy and Verify

1. **Railway:** Update all env vars above
2. **Redeploy** backend service (Railway will auto-redeploy on var change, or manually trigger)
3. **Wait 2-3 minutes** for service to restart
4. **Test forgot-password endpoint:**

```bash
curl -X POST https://vibesouting-production.up.railway.app/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

Expected response:
```json
{
  "success": true,
  "message": "If your email is registered, a reset link has been sent."
}
```

5. **Check Railway logs** for one of:
   - ✅ `[EMAIL] Sent (password_reset) recipient=u***@example.com messageId=<id>`
   - ❌ `[EMAIL] Send failed: ...` (with error details)
   - ❌ `[PASSWORD_RESET] Email service unavailable: SMTP not configured`

---

## Step 6: User Testing

1. Go to https://vibesouting.in → **Login** → **Forgot Password**
2. Enter a registered email
3. Should see: "If your email is registered, a reset link has been sent. ✅"
4. **Check inbox** (and spam folder) for email from VIBES@Outing
5. Click reset link → should redirect to password reset form
6. Enter new password → should see "Password updated! Please login."
7. Login with new password ✅

---

## Troubleshooting

### ❌ Email not arriving (or in spam)

**Check in Railway logs:**
- `[EMAIL] Transport verify failed` → SMTP credentials wrong
- `[EMAIL] Send failed: EAUTH` → App password expired or wrong
- `[EMAIL] Send failed: No response to EHLO` → Host/port incorrect
- `[EMAIL] Send failed: 550 5.1.1` → Sender email not valid

**Fix:**
1. Verify SMTP_USER and SMTP_PASS in Railway vars
2. Re-generate Gmail app password and update SMTP_PASS
3. Ensure `MAIL_PROVIDER=smtp` and `SMTP_HOST=smtp.gmail.com`
4. Redeploy after changes

### ❌ "Email service temporarily unavailable"

Check Railway vars — missing `SMTP_USER` or `SMTP_PASS`.

### ❌ Email goes to spam

1. Add SPF/DKIM/DMARC DNS records (Step 3)
2. Mark email as "Not Spam" to warm up sender reputation
3. Or whitelist vibesoutingsupport@gmail.com in your mail client

### ❌ Reset link not working

1. Check `PASSWORD_RESET_URL` points to your real frontend domain
2. Check `ALLOWED_ORIGINS` includes frontend domain
3. Verify frontend can reach backend at the API URL in Railway

---

## Quick Reference: Environment Variables Summary

Copy this template and fill in YOUR values in Railway:

```
NODE_ENV=production
JWT_SECRET=<64 random hex chars>
SESSION_SECRET=<64 random hex chars>
ADMIN_DEFAULT_PASSWORD=<your strong password>
APP_BASE_URL=https://vibesouting.in
PASSWORD_RESET_URL=https://vibesouting.in
ALLOWED_ORIGINS=https://vibesouting.in,https://www.vibesouting.in

MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=vibesoutingsupport@gmail.com
SMTP_PASS=<Gmail 16-char app password from Step 1>
SMTP_FROM=vibesoutingsupport@gmail.com
SMTP_FROM_NAME=VIBES@Outing

RAZORPAY_KEY_ID=<your live key>
RAZORPAY_KEY_SECRET=<your live secret>

DATABASE_URL=<auto from Railway PostgreSQL service>
```

---

## Support

If emails still fail after this checklist:

1. **Share Railway logs** (sanitize secrets) showing the `[EMAIL]` error
2. **Verify Gmail 2FA is ON** and app password is fresh
3. **Check that SMTP_USER and SMTP_PASS match exactly** (no extra spaces)
4. **Ensure PASSWORD_RESET_URL doesn't have trailing slash**

---

**Last Updated:** May 2026  
**Status:** Production Ready ✅
