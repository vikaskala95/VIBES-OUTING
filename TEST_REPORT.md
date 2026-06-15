# 🧪 VIBES@Outing — Test Report

**Date:** 2026-06-15 03:18:48  
**Environment:** Development (localhost:3000)  
**Node.js:** v22.17.0  
**Total Duration:** 8.52s  

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 155 |
| ✅ Passed | 155 |
| ❌ Failed | 0 |
| ⚠ Skipped | 0 |
| Pass Rate | 100.0% |

---

## 📋 Test Categories

### Smoke (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Server is reachable | ✅ PASS | 44ms | — |
| 2 | API returns JSON for outings | ✅ PASS | 13ms | — |
| 3 | Unknown API returns 404 | ✅ PASS | 3ms | — |
| 4 | Public stats endpoint works | ✅ PASS | 3ms | — |
| 5 | Static files served | ✅ PASS | 6ms | — |

### Auth (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Signup — valid user | ✅ PASS | 281ms | — |
| 2 | Signup — duplicate email rejected | ✅ PASS | 246ms | — |
| 3 | Signup — missing name rejected | ✅ PASS | 3ms | — |
| 4 | Signup — weak password rejected | ✅ PASS | 3ms | — |
| 5 | Signup — invalid email rejected | ✅ PASS | 2ms | — |
| 6 | Login — valid credentials | ✅ PASS | 258ms | — |
| 7 | Login — wrong password | ✅ PASS | 250ms | — |
| 8 | Login — non-existent user | ✅ PASS | 232ms | — |
| 9 | Login — missing fields | ✅ PASS | 2ms | — |
| 10 | Admin login | ✅ PASS | 232ms | — |
| 11 | Logout | ✅ PASS | 1ms | — |
| 12 | Protected route rejects unauthenticated | ✅ PASS | 2ms | — |
| 13 | Invalid token rejected | ✅ PASS | 1ms | — |

### Outings (8/8 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/outings — list all | ✅ PASS | 3ms | — |
| 2 | GET /api/outings/:id — valid ID | ✅ PASS | 2ms | — |
| 3 | GET /api/outings/:id — invalid ID | ✅ PASS | 1ms | — |
| 4 | GET /api/outings/:id — non-numeric ID | ✅ PASS | 1ms | — |
| 5 | POST create — non-admin rejected | ✅ PASS | 2ms | — |
| 6 | POST create — admin can create | ✅ PASS | 3ms | — |
| 7 | DELETE — admin can delete | ✅ PASS | 6ms | — |
| 8 | DELETE — non-admin rejected | ✅ PASS | 2ms | — |

### Routing (19/19 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Every outing carries a valid SEO slug | ✅ PASS | 2ms | — |
| 2 | GET /api/outings/by-slug/:slug resolves to the right outing | ✅ PASS | 3ms | — |
| 3 | GET /api/outings/by-slug/:slug — unknown slug returns 404 | ✅ PASS | 1ms | — |
| 4 | GET /api/outings/by-slug/:slug — invalid slug rejected | ✅ PASS | 1ms | — |
| 5 | SPA fallback (no 404) → /outings | ✅ PASS | 6ms | — |
| 6 | SPA fallback (no 404) → /outings/goa-beach-trip | ✅ PASS | 4ms | — |
| 7 | SPA fallback (no 404) → /wallet | ✅ PASS | 4ms | — |
| 8 | SPA fallback (no 404) → /dashboard | ✅ PASS | 4ms | — |
| 9 | SPA fallback (no 404) → /blogs | ✅ PASS | 3ms | — |
| 10 | SPA fallback (no 404) → /wishlist | ✅ PASS | 4ms | — |
| 11 | SPA fallback (no 404) → /notifications | ✅ PASS | 4ms | — |
| 12 | SPA fallback (no 404) → /suggest | ✅ PASS | 6ms | — |
| 13 | SPA fallback (no 404) → /recommendations | ✅ PASS | 4ms | — |
| 14 | SPA fallback (no 404) → /galleries | ✅ PASS | 4ms | — |
| 15 | SPA fallback (no 404) → /for-you | ✅ PASS | 5ms | — |
| 16 | SPA fallback (no 404) → /profile | ✅ PASS | 6ms | — |
| 17 | SPA fallback (no 404) → /some/deep/unknown/path | ✅ PASS | 4ms | — |
| 18 | Refresh on deep outing URL serves app shell | ✅ PASS | 5ms | — |
| 19 | Static asset /manifest.json not swallowed by SPA fallback | ✅ PASS | 4ms | — |

### Bookings (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST /api/bookings — demo booking | ✅ PASS | 41ms | — |
| 2 | POST /api/bookings — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET /api/bookings/:userId — own bookings | ✅ PASS | 3ms | — |
| 4 | GET /api/bookings/:userId — IDOR prevention (other user) | ✅ PASS | 1ms | — |
| 5 | POST /api/bookings/create-order — Razorpay order | ✅ PASS | 355ms | — |
| 6 | POST /api/bookings — non-existent outing | ✅ PASS | 2ms | — |
| 7 | Booking — exceeding max participants | ✅ PASS | 2ms | — |

### Suggestions (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — create suggestion | ✅ PASS | 4ms | — |
| 2 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET — list suggestions | ✅ PASS | 2ms | — |
| 4 | POST — missing title rejected | ✅ PASS | 1ms | — |
| 5 | PUT — admin approve suggestion | ✅ PASS | 3ms | — |
| 6 | PUT — non-admin rejected | ✅ PASS | 2ms | — |

### Reviews (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/reviews/:outingId | ✅ PASS | 3ms | — |
| 2 | POST — must have booked to review | ✅ PASS | 5ms | — |
| 3 | POST — review booked outing | ✅ PASS | 3ms | — |
| 4 | POST — duplicate review rejected | ✅ PASS | 2ms | — |
| 5 | POST — invalid rating rejected | ✅ PASS | 2ms | — |
| 6 | POST — unauthenticated rejected | ✅ PASS | 2ms | — |
| 7 | GET — invalid outing ID | ✅ PASS | 2ms | — |

### Chat (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — unauthenticated rejected | ✅ PASS | 2ms | — |
| 2 | GET — authenticated user can view | ✅ PASS | 3ms | — |
| 3 | POST — booked user can send message | ✅ PASS | 2ms | — |
| 4 | POST — message appears in chat | ✅ PASS | 2ms | — |
| 5 | POST — empty message rejected | ✅ PASS | 2ms | — |
| 6 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |

### Verification (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — submit verification | ✅ PASS | 7ms | — |
| 2 | GET — own verification status | ✅ PASS | 4ms | — |
| 3 | GET — IDOR prevention | ✅ PASS | 2ms | — |
| 4 | POST — invalid ID type rejected | ✅ PASS | 2ms | — |
| 5 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 6 | Admin — list verifications | ✅ PASS | 3ms | — |
| 7 | Admin — approve verification | ✅ PASS | 3ms | — |

### Admin (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/admin/stats | ✅ PASS | 4ms | — |
| 2 | GET /api/admin/users | ✅ PASS | 2ms | — |
| 3 | GET /api/admin/bookings | ✅ PASS | 1ms | — |
| 4 | GET /api/admin/security-logs | ✅ PASS | 2ms | — |
| 5 | Non-admin rejected from admin routes | ✅ PASS | 2ms | — |
| 6 | Admin — users list has no passwords | ✅ PASS | 2ms | — |

### Recommendations (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — own recommendations | ✅ PASS | 8ms | — |
| 2 | GET — IDOR prevention | ✅ PASS | 2ms | — |
| 3 | GET — unauthenticated rejected | ✅ PASS | 2ms | — |
| 4 | Results exclude booked outings | ✅ PASS | 3ms | — |

### Security (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | X-Powered-By header is absent | ✅ PASS | 3ms | — |
| 2 | X-Content-Type-Options: nosniff | ✅ PASS | 2ms | — |
| 3 | X-Frame-Options present | ✅ PASS | 2ms | — |
| 4 | Content-Security-Policy present | ✅ PASS | 5ms | — |
| 5 | Referrer-Policy present | ✅ PASS | 2ms | — |
| 6 | Permissions-Policy present | ✅ PASS | 2ms | — |
| 7 | XSS in input is sanitized | ✅ PASS | 2ms | — |
| 8 | SQL injection in param is safe | ✅ PASS | 1ms | — |
| 9 | JSON body size limit enforced | ✅ PASS | 3ms | — |
| 10 | Password not in login response | ✅ PASS | 228ms | — |
| 11 | Dotfiles access denied | ✅ PASS | 4ms | — |
| 12 | No dev_reset_link in forgot-password response | ✅ PASS | 2ms | — |
| 13 | Compression header present | ✅ PASS | 2ms | — |

### PasswordReset (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST forgot-password — valid email (no leak) | ✅ PASS | 1726ms | — |
| 2 | POST forgot-password — non-existent email (same response) | ✅ PASS | 3ms | — |
| 3 | POST forgot-password — invalid email rejected | ✅ PASS | 1ms | — |
| 4 | POST reset-password — invalid token | ✅ PASS | 1ms | — |
| 5 | POST reset-password — weak password rejected | ✅ PASS | 2ms | — |

### Edge (10/10 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET outing with ID 0 | ✅ PASS | 3ms | — |
| 2 | GET outing with negative ID | ✅ PASS | 2ms | — |
| 3 | GET outing with very large ID | ✅ PASS | 1ms | — |
| 4 | POST with empty JSON body | ✅ PASS | 2ms | — |
| 5 | POST with null body fields | ✅ PASS | 1ms | — |
| 6 | Special characters in search (GET) | ✅ PASS | 3ms | — |
| 7 | Very long title in suggestion | ✅ PASS | 2ms | — |
| 8 | Booking with 0 participants | ✅ PASS | 39ms | — |
| 9 | Review with rating 0 | ✅ PASS | 3ms | — |
| 10 | Review with rating 6 | ✅ PASS | 4ms | — |

### Misc (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/razorpay-key | ✅ PASS | 2ms | — |
| 2 | SPA fallback — unknown route returns index.html | ✅ PASS | 8ms | — |
| 3 | Multiple concurrent requests handled | ✅ PASS | 13ms | — |
| 4 | OPTIONS request (CORS preflight) | ✅ PASS | 1ms | — |

### Integrity (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Outing data has required fields | ✅ PASS | 4ms | — |
| 2 | Booking amounts calculate correctly (20% token) | ✅ PASS | 3ms | — |
| 3 | Outing participant count is non-negative | ✅ PASS | 2ms | — |
| 4 | Review average is between 0 and 5 | ✅ PASS | 2ms | — |

### Notifications (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get notifications — requires auth | ✅ PASS | 2ms | — |
| 2 | Get notifications — authenticated | ✅ PASS | 3ms | — |
| 3 | Get notifications — IDOR prevention | ✅ PASS | 4ms | — |
| 4 | Mark all read — authenticated | ✅ PASS | 3ms | — |
| 5 | Invalid user ID — validation | ✅ PASS | 3ms | — |

### Wallet (14/14 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get wallet — requires auth | ✅ PASS | 2ms | — |
| 2 | Get wallet — authenticated | ✅ PASS | 6ms | — |
| 3 | Get wallet — IDOR prevention (other user) | ✅ PASS | 3ms | — |
| 4 | Get wallet — admin can view any | ✅ PASS | 3ms | — |
| 5 | Invalid user ID — validation | ✅ PASS | 4ms | — |
| 6 | Welcome Bonus — ₹100 credited at signup | ✅ PASS | 2ms | — |
| 7 | Welcome Bonus — not re-credited on login | ✅ PASS | 385ms | — |
| 8 | Reward — ₹100 credited after booking | ✅ PASS | 3ms | — |
| 9 | Redemption — wallet credit applied as booking discount | ✅ PASS | 35ms | — |
| 10 | Recharge — create-order requires auth | ✅ PASS | 1ms | — |
| 11 | Recharge — create-order validates amount min | ✅ PASS | 2ms | — |
| 12 | Recharge — create-order validates amount max | ✅ PASS | 3ms | — |
| 13 | Recharge — verify requires auth | ✅ PASS | 2ms | — |
| 14 | Recharge — verify rejects invalid signature | ✅ PASS | 4ms | — |

### Tickets (12/12 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Submit ticket — requires auth | ✅ PASS | 2ms | — |
| 2 | Submit ticket — valid | ✅ PASS | 5ms | — |
| 3 | Submit ticket — missing fields | ✅ PASS | 2ms | — |
| 4 | Submit ticket — invalid priority | ✅ PASS | 3ms | — |
| 5 | Get my tickets — user | ✅ PASS | 2ms | — |
| 6 | Admin — list all tickets | ✅ PASS | 2ms | — |
| 7 | Admin — list tickets denied for user | ✅ PASS | 4ms | — |
| 8 | Admin — update ticket status | ✅ PASS | 4ms | — |
| 9 | Admin — reply to ticket | ✅ PASS | 3ms | — |
| 10 | Admin — update non-existent ticket | ✅ PASS | 2ms | — |
| 11 | Admin — invalid status value | ✅ PASS | 3ms | — |
| 12 | XSS prevention in ticket | ✅ PASS | 7ms | — |

---

## 🧪 Test Types Covered

| # | Test Type | Description | Count |
|---|-----------|-------------|-------|
| 1 | **Smoke Tests** | Server health, reachability, basic responses | 5 |
| 2 | **Authentication Tests** | Signup, login, logout, JWT, session management | 13 |
| 3 | **CRUD Tests** | Create, Read, Update, Delete for outings | 8 |
| 4 | **Booking Tests** | Payment flow, demo booking, participant limits | 7 |
| 5 | **Suggestion Tests** | User suggestions, admin approval | 6 |
| 6 | **Review Tests** | Ratings, comments, duplicate prevention | 7 |
| 7 | **Chat Tests** | Group messaging, access control | 6 |
| 8 | **Verification Tests** | ID verification, admin approval flow | 7 |
| 9 | **Admin Tests** | Dashboard stats, user management, security logs | 6 |
| 10 | **AI Recommendation Tests** | Personalized suggestions, IDOR prevention | 4 |
| 11 | **Security Tests** | Headers, XSS, SQLi, IDOR, data exposure | 13 |
| 12 | **Password Reset Tests** | Forgot/reset flow, token validation | 5 |
| 13 | **Edge Case Tests** | Boundary values, null inputs, overflow | 10 |
| 14 | **Miscellaneous Tests** | CORS, concurrency, SPA fallback | 4 |
| 15 | **Data Integrity Tests** | Schema validation, calculation accuracy | 4 |
| 16 | **Notification Tests** | In-app notifications, read/unread, IDOR | 5 |
| 17 | **Wallet Tests** | Balance, transactions, access control | 14 |
| 18 | **Support Ticket Tests** | Create, admin manage, XSS prevention | 12 |

---

*Generated by VIBES@Outing Test Runner*
