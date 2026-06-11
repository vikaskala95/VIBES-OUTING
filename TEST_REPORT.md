# 🧪 VIBES@Outing — Test Report

**Date:** 2026-06-11 11:32:58  
**Environment:** Development (localhost:3000)  
**Node.js:** v22.17.0  
**Total Duration:** 3.85s  

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 116 |
| ✅ Passed | 5 |
| ❌ Failed | 111 |
| ⚠ Skipped | 9 |
| Pass Rate | 4.3% |

---

## 📋 Test Categories

### Smoke (0/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Server is reachable | ❌ FAIL | 47ms | — |
| 2 | API returns JSON for outings | ❌ FAIL | 4ms | — |
| 3 | Unknown API returns 404 | ❌ FAIL | 3ms | — |
| 4 | Public stats endpoint works | ❌ FAIL | 2ms | — |
| 5 | Static files served | ❌ FAIL | 4ms | — |

### Auth (0/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Signup — valid user | ❌ FAIL | 3ms | — |
| 2 | Signup — duplicate email rejected | ❌ FAIL | 3ms | — |
| 3 | Signup — missing name rejected | ❌ FAIL | 3ms | — |
| 4 | Signup — weak password rejected | ❌ FAIL | 2ms | — |
| 5 | Signup — invalid email rejected | ❌ FAIL | 2ms | — |
| 6 | Login — valid credentials | ❌ FAIL | 2ms | — |
| 7 | Login — wrong password | ❌ FAIL | 2ms | — |
| 8 | Login — non-existent user | ❌ FAIL | 2ms | — |
| 9 | Login — missing fields | ❌ FAIL | 2ms | — |
| 10 | Admin login | ❌ FAIL | 3ms | — |
| 11 | Logout | ❌ FAIL | 1ms | — |
| 12 | Protected route rejects unauthenticated | ❌ FAIL | 1ms | — |
| 13 | Invalid token rejected | ❌ FAIL | 2ms | — |

### Outings (0/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/outings — list all | ❌ FAIL | 3ms | — |
| 2 | GET /api/outings/:id — valid ID | ❌ FAIL | 3ms | — |
| 3 | GET /api/outings/:id — invalid ID | ❌ FAIL | 2ms | — |
| 4 | GET /api/outings/:id — non-numeric ID | ❌ FAIL | 2ms | — |
| 5 | POST create — non-admin rejected | ❌ FAIL | 2ms | — |
| 6 | DELETE — non-admin rejected | ❌ FAIL | 2ms | — |

### Bookings (0/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST /api/bookings — demo booking | ❌ FAIL | 3ms | — |
| 2 | POST /api/bookings — unauthenticated rejected | ❌ FAIL | 2ms | — |
| 3 | GET /api/bookings/:userId — own bookings | ❌ FAIL | 2ms | — |
| 4 | GET /api/bookings/:userId — IDOR prevention (other user) | ❌ FAIL | 2ms | — |
| 5 | POST /api/bookings/create-order — Razorpay order | ❌ FAIL | 3ms | — |
| 6 | POST /api/bookings — non-existent outing | ❌ FAIL | 2ms | — |
| 7 | Booking — exceeding max participants | ❌ FAIL | 2ms | — |

### Suggestions (1/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — create suggestion | ❌ FAIL | 2ms | — |
| 2 | POST — unauthenticated rejected | ❌ FAIL | 1ms | — |
| 3 | GET — list suggestions | ❌ FAIL | 1ms | — |
| 4 | POST — missing title rejected | ❌ FAIL | 2ms | — |
| 5 | PUT — non-admin rejected | ✅ PASS | 0ms | — |

### Reviews (0/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/reviews/:outingId | ❌ FAIL | 2ms | — |
| 2 | POST — must have booked to review | ❌ FAIL | 2ms | — |
| 3 | POST — invalid rating rejected | ❌ FAIL | 2ms | — |
| 4 | POST — unauthenticated rejected | ❌ FAIL | 1ms | — |
| 5 | GET — invalid outing ID | ❌ FAIL | 2ms | — |

### Chat (0/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — unauthenticated rejected | ❌ FAIL | 3ms | — |
| 2 | GET — authenticated user can view | ❌ FAIL | 2ms | — |
| 3 | POST — empty message rejected | ❌ FAIL | 1ms | — |
| 4 | POST — unauthenticated rejected | ❌ FAIL | 2ms | — |

### Verification (0/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — submit verification | ❌ FAIL | 3ms | — |
| 2 | GET — own verification status | ❌ FAIL | 2ms | — |
| 3 | GET — IDOR prevention | ❌ FAIL | 2ms | — |
| 4 | POST — invalid ID type rejected | ❌ FAIL | 1ms | — |
| 5 | POST — unauthenticated rejected | ❌ FAIL | 1ms | — |

### Recommendations (1/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — own recommendations | ❌ FAIL | 3ms | — |
| 2 | GET — IDOR prevention | ❌ FAIL | 2ms | — |
| 3 | GET — unauthenticated rejected | ❌ FAIL | 2ms | — |
| 4 | Results exclude booked outings | ✅ PASS | 0ms | — |

### Security (0/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | X-Powered-By header is absent | ❌ FAIL | 3ms | — |
| 2 | X-Content-Type-Options: nosniff | ❌ FAIL | 2ms | — |
| 3 | X-Frame-Options present | ❌ FAIL | 1ms | — |
| 4 | Content-Security-Policy present | ❌ FAIL | 2ms | — |
| 5 | Referrer-Policy present | ❌ FAIL | 2ms | — |
| 6 | Permissions-Policy present | ❌ FAIL | 1ms | — |
| 7 | XSS in input is sanitized | ❌ FAIL | 1ms | — |
| 8 | SQL injection in param is safe | ❌ FAIL | 2ms | — |
| 9 | JSON body size limit enforced | ❌ FAIL | 2ms | — |
| 10 | Password not in login response | ❌ FAIL | 2ms | — |
| 11 | Dotfiles access denied | ❌ FAIL | 2ms | — |
| 12 | No dev_reset_link in forgot-password response | ❌ FAIL | 1ms | — |
| 13 | Compression header present | ❌ FAIL | 2ms | — |

### PasswordReset (0/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST forgot-password — valid email (no leak) | ❌ FAIL | 2ms | — |
| 2 | POST forgot-password — non-existent email (same response) | ❌ FAIL | 1ms | — |
| 3 | POST forgot-password — invalid email rejected | ❌ FAIL | 2ms | — |
| 4 | POST reset-password — invalid token | ❌ FAIL | 1ms | — |
| 5 | POST reset-password — weak password rejected | ❌ FAIL | 1ms | — |

### Edge (0/10 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET outing with ID 0 | ❌ FAIL | 2ms | — |
| 2 | GET outing with negative ID | ❌ FAIL | 2ms | — |
| 3 | GET outing with very large ID | ❌ FAIL | 1ms | — |
| 4 | POST with empty JSON body | ❌ FAIL | 2ms | — |
| 5 | POST with null body fields | ❌ FAIL | 1ms | — |
| 6 | Special characters in search (GET) | ❌ FAIL | 1ms | — |
| 7 | Very long title in suggestion | ❌ FAIL | 2ms | — |
| 8 | Booking with 0 participants | ❌ FAIL | 2ms | — |
| 9 | Review with rating 0 | ❌ FAIL | 1ms | — |
| 10 | Review with rating 6 | ❌ FAIL | 2ms | — |

### Misc (0/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/razorpay-key | ❌ FAIL | 3ms | — |
| 2 | SPA fallback — unknown route returns index.html | ❌ FAIL | 2ms | — |
| 3 | Multiple concurrent requests handled | ❌ FAIL | 4ms | — |
| 4 | OPTIONS request (CORS preflight) | ❌ FAIL | 4ms | — |

### Integrity (0/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Outing data has required fields | ❌ FAIL | 3ms | — |
| 2 | Booking amounts calculate correctly (20% token) | ❌ FAIL | 2ms | — |
| 3 | Outing participant count is non-negative | ❌ FAIL | 2ms | — |
| 4 | Review average is between 0 and 5 | ❌ FAIL | 2ms | — |

### Notifications (0/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get notifications — requires auth | ❌ FAIL | 2ms | — |
| 2 | Get notifications — authenticated | ❌ FAIL | 2ms | — |
| 3 | Get notifications — IDOR prevention | ❌ FAIL | 2ms | — |
| 4 | Mark all read — authenticated | ❌ FAIL | 2ms | — |
| 5 | Invalid user ID — validation | ❌ FAIL | 2ms | — |

### Wallet (0/9 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get wallet — requires auth | ❌ FAIL | 3ms | — |
| 2 | Get wallet — authenticated | ❌ FAIL | 3ms | — |
| 3 | Get wallet — IDOR prevention (other user) | ❌ FAIL | 2ms | — |
| 4 | Get wallet — admin can view any | ❌ FAIL | 2ms | — |
| 5 | Invalid user ID — validation | ❌ FAIL | 2ms | — |
| 6 | Welcome Bonus — ₹100 credited at signup | ❌ FAIL | 2ms | — |
| 7 | Welcome Bonus — not re-credited on login | ❌ FAIL | 2ms | — |
| 8 | Reward — ₹100 credited after booking | ❌ FAIL | 2ms | — |
| 9 | Redemption — wallet credit applied as booking discount | ❌ FAIL | 2ms | — |

### Tickets (3/12 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Submit ticket — requires auth | ❌ FAIL | 2ms | — |
| 2 | Submit ticket — valid | ❌ FAIL | 2ms | — |
| 3 | Submit ticket — missing fields | ❌ FAIL | 2ms | — |
| 4 | Submit ticket — invalid priority | ❌ FAIL | 2ms | — |
| 5 | Get my tickets — user | ❌ FAIL | 3ms | — |
| 6 | Admin — list all tickets | ❌ FAIL | 2ms | — |
| 7 | Admin — list tickets denied for user | ❌ FAIL | 1ms | — |
| 8 | Admin — update ticket status | ✅ PASS | 0ms | — |
| 9 | Admin — reply to ticket | ✅ PASS | 0ms | — |
| 10 | Admin — update non-existent ticket | ❌ FAIL | 1ms | — |
| 11 | Admin — invalid status value | ✅ PASS | 0ms | — |
| 12 | XSS prevention in ticket | ❌ FAIL | 2ms | — |

---

## 🧪 Test Types Covered

| # | Test Type | Description | Count |
|---|-----------|-------------|-------|
| 1 | **Smoke Tests** | Server health, reachability, basic responses | 5 |
| 2 | **Authentication Tests** | Signup, login, logout, JWT, session management | 13 |
| 3 | **CRUD Tests** | Create, Read, Update, Delete for outings | 6 |
| 4 | **Booking Tests** | Payment flow, demo booking, participant limits | 7 |
| 5 | **Suggestion Tests** | User suggestions, admin approval | 5 |
| 6 | **Review Tests** | Ratings, comments, duplicate prevention | 5 |
| 7 | **Chat Tests** | Group messaging, access control | 4 |
| 8 | **Verification Tests** | ID verification, admin approval flow | 5 |
| 9 | **Admin Tests** | Dashboard stats, user management, security logs | 0 |
| 10 | **AI Recommendation Tests** | Personalized suggestions, IDOR prevention | 4 |
| 11 | **Security Tests** | Headers, XSS, SQLi, IDOR, data exposure | 13 |
| 12 | **Password Reset Tests** | Forgot/reset flow, token validation | 5 |
| 13 | **Edge Case Tests** | Boundary values, null inputs, overflow | 10 |
| 14 | **Miscellaneous Tests** | CORS, concurrency, SPA fallback | 4 |
| 15 | **Data Integrity Tests** | Schema validation, calculation accuracy | 4 |
| 16 | **Notification Tests** | In-app notifications, read/unread, IDOR | 5 |
| 17 | **Wallet Tests** | Balance, transactions, access control | 9 |
| 18 | **Support Ticket Tests** | Create, admin manage, XSS prevention | 12 |

---

## ❌ Failed Tests Detail

- **[Smoke] Server is reachable**: 
- **[Smoke] API returns JSON for outings**: 
- **[Smoke] Unknown API returns 404**: 
- **[Smoke] Public stats endpoint works**: 
- **[Smoke] Static files served**: 
- **[Auth] Signup — valid user**: 
- **[Auth] Signup — duplicate email rejected**: 
- **[Auth] Signup — missing name rejected**: 
- **[Auth] Signup — weak password rejected**: 
- **[Auth] Signup — invalid email rejected**: 
- **[Auth] Login — valid credentials**: 
- **[Auth] Login — wrong password**: 
- **[Auth] Login — non-existent user**: 
- **[Auth] Login — missing fields**: 
- **[Auth] Admin login**: 
- **[Auth] Logout**: 
- **[Auth] Protected route rejects unauthenticated**: 
- **[Auth] Invalid token rejected**: 
- **[Outings] GET /api/outings — list all**: 
- **[Outings] GET /api/outings/:id — valid ID**: 
- **[Outings] GET /api/outings/:id — invalid ID**: 
- **[Outings] GET /api/outings/:id — non-numeric ID**: 
- **[Outings] POST create — non-admin rejected**: 
- **[Outings] DELETE — non-admin rejected**: 
- **[Bookings] POST /api/bookings — demo booking**: 
- **[Bookings] POST /api/bookings — unauthenticated rejected**: 
- **[Bookings] GET /api/bookings/:userId — own bookings**: 
- **[Bookings] GET /api/bookings/:userId — IDOR prevention (other user)**: 
- **[Bookings] POST /api/bookings/create-order — Razorpay order**: 
- **[Bookings] POST /api/bookings — non-existent outing**: 
- **[Bookings] Booking — exceeding max participants**: 
- **[Suggestions] POST — create suggestion**: 
- **[Suggestions] POST — unauthenticated rejected**: 
- **[Suggestions] GET — list suggestions**: 
- **[Suggestions] POST — missing title rejected**: 
- **[Reviews] GET /api/reviews/:outingId**: 
- **[Reviews] POST — must have booked to review**: 
- **[Reviews] POST — invalid rating rejected**: 
- **[Reviews] POST — unauthenticated rejected**: 
- **[Reviews] GET — invalid outing ID**: 
- **[Chat] GET — unauthenticated rejected**: 
- **[Chat] GET — authenticated user can view**: 
- **[Chat] POST — empty message rejected**: 
- **[Chat] POST — unauthenticated rejected**: 
- **[Verification] POST — submit verification**: 
- **[Verification] GET — own verification status**: 
- **[Verification] GET — IDOR prevention**: 
- **[Verification] POST — invalid ID type rejected**: 
- **[Verification] POST — unauthenticated rejected**: 
- **[Recommendations] GET — own recommendations**: 
- **[Recommendations] GET — IDOR prevention**: 
- **[Recommendations] GET — unauthenticated rejected**: 
- **[Security] X-Powered-By header is absent**: 
- **[Security] X-Content-Type-Options: nosniff**: 
- **[Security] X-Frame-Options present**: 
- **[Security] Content-Security-Policy present**: 
- **[Security] Referrer-Policy present**: 
- **[Security] Permissions-Policy present**: 
- **[Security] XSS in input is sanitized**: 
- **[Security] SQL injection in param is safe**: 
- **[Security] JSON body size limit enforced**: 
- **[Security] Password not in login response**: 
- **[Security] Dotfiles access denied**: 
- **[Security] No dev_reset_link in forgot-password response**: 
- **[Security] Compression header present**: 
- **[PasswordReset] POST forgot-password — valid email (no leak)**: 
- **[PasswordReset] POST forgot-password — non-existent email (same response)**: 
- **[PasswordReset] POST forgot-password — invalid email rejected**: 
- **[PasswordReset] POST reset-password — invalid token**: 
- **[PasswordReset] POST reset-password — weak password rejected**: 
- **[Edge] GET outing with ID 0**: 
- **[Edge] GET outing with negative ID**: 
- **[Edge] GET outing with very large ID**: 
- **[Edge] POST with empty JSON body**: 
- **[Edge] POST with null body fields**: 
- **[Edge] Special characters in search (GET)**: 
- **[Edge] Very long title in suggestion**: 
- **[Edge] Booking with 0 participants**: 
- **[Edge] Review with rating 0**: 
- **[Edge] Review with rating 6**: 
- **[Misc] GET /api/razorpay-key**: 
- **[Misc] SPA fallback — unknown route returns index.html**: 
- **[Misc] Multiple concurrent requests handled**: 
- **[Misc] OPTIONS request (CORS preflight)**: 
- **[Integrity] Outing data has required fields**: 
- **[Integrity] Booking amounts calculate correctly (20% token)**: 
- **[Integrity] Outing participant count is non-negative**: 
- **[Integrity] Review average is between 0 and 5**: 
- **[Notifications] Get notifications — requires auth**: 
- **[Notifications] Get notifications — authenticated**: 
- **[Notifications] Get notifications — IDOR prevention**: 
- **[Notifications] Mark all read — authenticated**: 
- **[Notifications] Invalid user ID — validation**: 
- **[Wallet] Get wallet — requires auth**: 
- **[Wallet] Get wallet — authenticated**: 
- **[Wallet] Get wallet — IDOR prevention (other user)**: 
- **[Wallet] Get wallet — admin can view any**: 
- **[Wallet] Invalid user ID — validation**: 
- **[Wallet] Welcome Bonus — ₹100 credited at signup**: 
- **[Wallet] Welcome Bonus — not re-credited on login**: 
- **[Wallet] Reward — ₹100 credited after booking**: 
- **[Wallet] Redemption — wallet credit applied as booking discount**: 
- **[Tickets] Submit ticket — requires auth**: 
- **[Tickets] Submit ticket — valid**: 
- **[Tickets] Submit ticket — missing fields**: 
- **[Tickets] Submit ticket — invalid priority**: 
- **[Tickets] Get my tickets — user**: 
- **[Tickets] Admin — list all tickets**: 
- **[Tickets] Admin — list tickets denied for user**: 
- **[Tickets] Admin — update non-existent ticket**: 
- **[Tickets] XSS prevention in ticket**: 

---

*Generated by VIBES@Outing Test Runner*
