# 🧪 VIBES@Outing — Test Report

**Date:** 2026-06-15 12:39:34  
**Environment:** Development (localhost:3000)  
**Node.js:** v22.17.0  
**Total Duration:** 6.23s  

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 180 |
| ✅ Passed | 111 |
| ❌ Failed | 69 |
| ⚠ Skipped | 5 |
| Pass Rate | 61.7% |

---

## 📋 Test Categories

### Smoke (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Server is reachable | ✅ PASS | 36ms | — |
| 2 | API returns JSON for outings | ✅ PASS | 3ms | — |
| 3 | Unknown API returns 404 | ✅ PASS | 2ms | — |
| 4 | Public stats endpoint works | ✅ PASS | 2ms | — |
| 5 | Static files served | ✅ PASS | 6ms | — |

### Auth (7/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Signup — valid user | ❌ FAIL | 2ms | Signup failed: {"success":false,"message":"Too many accounts created. Try again later."} |
| 2 | Signup — duplicate email rejected | ❌ FAIL | 1ms | Expected 400, got 429 |
| 3 | Signup — missing name rejected | ❌ FAIL | 1ms | Expected 400, got 429 |
| 4 | Signup — weak password rejected | ❌ FAIL | 1ms | Expected 400, got 429 |
| 5 | Signup — invalid email rejected | ❌ FAIL | 1ms | Expected 400, got 429 |
| 6 | Login — valid credentials | ❌ FAIL | 280ms | Login failed: {"success":false,"message":"Invalid credentials"} |
| 7 | Login — wrong password | ✅ PASS | 294ms | — |
| 8 | Login — non-existent user | ✅ PASS | 295ms | — |
| 9 | Login — missing fields | ✅ PASS | 2ms | — |
| 10 | Admin login | ✅ PASS | 259ms | — |
| 11 | Logout | ✅ PASS | 1ms | — |
| 12 | Protected route rejects unauthenticated | ✅ PASS | 1ms | — |
| 13 | Invalid token rejected | ✅ PASS | 1ms | — |

### Outings (6/8 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/outings — list all | ✅ PASS | 6ms | — |
| 2 | GET /api/outings/:id — valid ID | ✅ PASS | 2ms | — |
| 3 | GET /api/outings/:id — invalid ID | ✅ PASS | 1ms | — |
| 4 | GET /api/outings/:id — non-numeric ID | ✅ PASS | 1ms | — |
| 5 | POST create — non-admin rejected | ❌ FAIL | 1ms | Expected 403, got 401 |
| 6 | POST create — admin can create | ✅ PASS | 3ms | — |
| 7 | DELETE — admin can delete | ✅ PASS | 4ms | — |
| 8 | DELETE — non-admin rejected | ❌ FAIL | 1ms | Expected 403, got 401 |

### Routing (19/19 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Every outing carries a valid SEO slug | ✅ PASS | 2ms | — |
| 2 | GET /api/outings/by-slug/:slug resolves to the right outing | ✅ PASS | 4ms | — |
| 3 | GET /api/outings/by-slug/:slug — unknown slug returns 404 | ✅ PASS | 1ms | — |
| 4 | GET /api/outings/by-slug/:slug — invalid slug rejected | ✅ PASS | 1ms | — |
| 5 | SPA fallback (no 404) → /outings | ✅ PASS | 5ms | — |
| 6 | SPA fallback (no 404) → /outings/goa-beach-trip | ✅ PASS | 5ms | — |
| 7 | SPA fallback (no 404) → /wallet | ✅ PASS | 4ms | — |
| 8 | SPA fallback (no 404) → /dashboard | ✅ PASS | 4ms | — |
| 9 | SPA fallback (no 404) → /blogs | ✅ PASS | 5ms | — |
| 10 | SPA fallback (no 404) → /wishlist | ✅ PASS | 4ms | — |
| 11 | SPA fallback (no 404) → /notifications | ✅ PASS | 3ms | — |
| 12 | SPA fallback (no 404) → /suggest | ✅ PASS | 5ms | — |
| 13 | SPA fallback (no 404) → /recommendations | ✅ PASS | 5ms | — |
| 14 | SPA fallback (no 404) → /galleries | ✅ PASS | 4ms | — |
| 15 | SPA fallback (no 404) → /for-you | ✅ PASS | 3ms | — |
| 16 | SPA fallback (no 404) → /profile | ✅ PASS | 4ms | — |
| 17 | SPA fallback (no 404) → /some/deep/unknown/path | ✅ PASS | 3ms | — |
| 18 | Refresh on deep outing URL serves app shell | ✅ PASS | 5ms | — |
| 19 | Static asset /manifest.json not swallowed by SPA fallback | ✅ PASS | 5ms | — |

### Navigation (17/24 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Wallet page API endpoint exists | ❌ FAIL | 1ms | skip is not defined |
| 2 | Dashboard page API endpoint exists | ❌ FAIL | 0ms | skip is not defined |
| 3 | Notifications page API endpoint exists | ❌ FAIL | 0ms | skip is not defined |
| 4 | Blogs page API endpoint exists | ✅ PASS | 2ms | — |
| 5 | Wishlist page API endpoint exists | ❌ FAIL | 0ms | skip is not defined |
| 6 | Gallery page API endpoint exists | ❌ FAIL | 0ms | skip is not defined |
| 7 | For You (Recommendations) page API exists | ❌ FAIL | 0ms | skip is not defined |
| 8 | SPA fallback for /wallet path | ✅ PASS | 5ms | — |
| 9 | SPA fallback for /dashboard path | ✅ PASS | 4ms | — |
| 10 | SPA fallback for /blogs path | ✅ PASS | 4ms | — |
| 11 | SPA fallback for /wishlist path | ✅ PASS | 5ms | — |
| 12 | SPA fallback for /notifications path | ✅ PASS | 4ms | — |
| 13 | SPA fallback for /galleries path | ✅ PASS | 5ms | — |
| 14 | SPA fallback for /recommendations path | ✅ PASS | 6ms | — |
| 15 | SPA fallback for /outings/slug path | ✅ PASS | 4ms | — |
| 16 | SPA fallback for /blogs/slug path | ✅ PASS | 4ms | — |
| 17 | manifest.json is not swallowed by SPA rewrite | ✅ PASS | 2ms | — |
| 18 | 401 response does not trigger redirect to /home | ✅ PASS | 2ms | — |
| 19 | POST request invalidates API cache | ✅ PASS | 5ms | — |
| 20 | Navigation to outings page works | ✅ PASS | 5ms | — |
| 21 | Navigation to home page works | ✅ PASS | 5ms | — |
| 22 | Concurrent API requests do not cause race conditions | ❌ FAIL | 0ms | skip is not defined |
| 23 | Outings API returns array | ✅ PASS | 4ms | — |
| 24 | Blogs API returns array | ✅ PASS | 1ms | — |

### Bookings (2/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST /api/bookings — demo booking | ✅ PASS | 8ms | — |
| 2 | POST /api/bookings — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET /api/bookings/:userId — own bookings | ❌ FAIL | 1ms | Assertion failed |
| 4 | GET /api/bookings/:userId — IDOR prevention (other user) | ❌ FAIL | 1ms | Expected 403 for IDOR, got 401 |
| 5 | POST /api/bookings/create-order — Razorpay order | ❌ FAIL | 2ms | Unexpected status: 401 |
| 6 | POST /api/bookings — non-existent outing | ❌ FAIL | 1ms | Expected 404, got 401 |
| 7 | Booking — exceeding max participants | ❌ FAIL | 1ms | Expected 400 for overflow, got 401 |

### Suggestions (3/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — create suggestion | ❌ FAIL | 2ms | Assertion failed |
| 2 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET — list suggestions | ✅ PASS | 2ms | — |
| 4 | POST — missing title rejected | ❌ FAIL | 1ms | Expected 400, got 401 |
| 5 | PUT — admin approve suggestion | ✅ PASS | 2ms | — |
| 6 | PUT — non-admin rejected | ❌ FAIL | 1ms | Expected 403, got 401 |

### Reviews (3/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/reviews/:outingId | ✅ PASS | 4ms | — |
| 2 | POST — must have booked to review | ❌ FAIL | 3ms | Unexpected: 401 |
| 3 | POST — invalid rating rejected | ❌ FAIL | 1ms | Expected 400, got 401 |
| 4 | POST — unauthenticated rejected | ✅ PASS | 2ms | — |
| 5 | GET — invalid outing ID | ✅ PASS | 1ms | — |

### Chat (2/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — unauthenticated rejected | ✅ PASS | 1ms | — |
| 2 | GET — authenticated user can view | ❌ FAIL | 1ms | Assertion failed |
| 3 | POST — empty message rejected | ❌ FAIL | 1ms | Expected 400, got 401 |
| 4 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |

### Verification (3/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — submit verification | ❌ FAIL | 1ms | Assertion failed |
| 2 | GET — own verification status | ❌ FAIL | 1ms | Assertion failed |
| 3 | GET — IDOR prevention | ❌ FAIL | 1ms | Expected 403, got 401 |
| 4 | POST — invalid ID type rejected | ❌ FAIL | 1ms | Expected 400, got 401 |
| 5 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 6 | Admin — list verifications | ✅ PASS | 1ms | — |
| 7 | Admin — approve verification | ✅ PASS | 2ms | — |

### Admin (5/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/admin/stats | ✅ PASS | 5ms | — |
| 2 | GET /api/admin/users | ✅ PASS | 4ms | — |
| 3 | GET /api/admin/bookings | ✅ PASS | 4ms | — |
| 4 | GET /api/admin/security-logs | ✅ PASS | 2ms | — |
| 5 | Non-admin rejected from admin routes | ❌ FAIL | 2ms | Expected 403, got 401 |
| 6 | Admin — users list has no passwords | ✅ PASS | 2ms | — |

### Recommendations (2/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — own recommendations | ❌ FAIL | 2ms | Assertion failed |
| 2 | GET — IDOR prevention | ❌ FAIL | 1ms | Expected 403, got 401 |
| 3 | GET — unauthenticated rejected | ✅ PASS | 1ms | — |
| 4 | Results exclude booked outings | ✅ PASS | 1ms | — |

### Security (11/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | X-Powered-By header is absent | ✅ PASS | 3ms | — |
| 2 | X-Content-Type-Options: nosniff | ✅ PASS | 1ms | — |
| 3 | X-Frame-Options present | ✅ PASS | 1ms | — |
| 4 | Content-Security-Policy present | ✅ PASS | 4ms | — |
| 5 | Referrer-Policy present | ✅ PASS | 1ms | — |
| 6 | Permissions-Policy present | ✅ PASS | 2ms | — |
| 7 | XSS in input is sanitized | ❌ FAIL | 1ms | Assertion failed |
| 8 | SQL injection in param is safe | ✅ PASS | 1ms | — |
| 9 | JSON body size limit enforced | ❌ FAIL | 2ms | Should reject oversized input |
| 10 | Password not in login response | ✅ PASS | 267ms | — |
| 11 | Dotfiles access denied | ✅ PASS | 5ms | — |
| 12 | No dev_reset_link in forgot-password response | ✅ PASS | 1ms | — |
| 13 | Compression header present | ✅ PASS | 2ms | — |

### PasswordReset (3/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST forgot-password — valid email (no leak) | ❌ FAIL | 2ms | Assertion failed |
| 2 | POST forgot-password — non-existent email (same response) | ❌ FAIL | 0ms | Should not reveal user non-existence |
| 3 | POST forgot-password — invalid email rejected | ✅ PASS | 0ms | — |
| 4 | POST reset-password — invalid token | ✅ PASS | 2ms | — |
| 5 | POST reset-password — weak password rejected | ✅ PASS | 1ms | — |

### Edge (6/10 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET outing with ID 0 | ✅ PASS | 2ms | — |
| 2 | GET outing with negative ID | ✅ PASS | 2ms | — |
| 3 | GET outing with very large ID | ✅ PASS | 1ms | — |
| 4 | POST with empty JSON body | ✅ PASS | 1ms | — |
| 5 | POST with null body fields | ✅ PASS | 1ms | — |
| 6 | Special characters in search (GET) | ✅ PASS | 2ms | — |
| 7 | Very long title in suggestion | ❌ FAIL | 1ms | Should reject too-long title |
| 8 | Booking with 0 participants | ❌ FAIL | 1ms | Unexpected: 401 |
| 9 | Review with rating 0 | ❌ FAIL | 1ms | Expected 400, got 401 |
| 10 | Review with rating 6 | ❌ FAIL | 0ms | Expected 400, got 401 |

### Misc (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/razorpay-key | ✅ PASS | 4ms | — |
| 2 | SPA fallback — unknown route returns index.html | ✅ PASS | 11ms | — |
| 3 | Multiple concurrent requests handled | ✅ PASS | 8ms | — |
| 4 | OPTIONS request (CORS preflight) | ✅ PASS | 1ms | — |

### Integrity (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Outing data has required fields | ✅ PASS | 2ms | — |
| 2 | Booking amounts calculate correctly (20% token) | ✅ PASS | 2ms | — |
| 3 | Outing participant count is non-negative | ✅ PASS | 2ms | — |
| 4 | Review average is between 0 and 5 | ✅ PASS | 2ms | — |

### Notifications (1/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get notifications — requires auth | ✅ PASS | 2ms | — |
| 2 | Get notifications — authenticated | ❌ FAIL | 1ms | Expected 200, got 401 |
| 3 | Get notifications — IDOR prevention | ❌ FAIL | 2ms | Expected 403 or empty 200, got 401 |
| 4 | Mark all read — authenticated | ❌ FAIL | 1ms | Expected 200, got 401 |
| 5 | Invalid user ID — validation | ❌ FAIL | 1ms | Expected 400/422, got 401 |

### Wishlist (1/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET wishlist — requires auth | ✅ PASS | 4ms | — |
| 2 | POST wishlist — add outing | ❌ FAIL | 1ms | Expected 200, got 401 |
| 3 | GET wishlist — authenticated list | ❌ FAIL | 1ms | Expected 200, got 401 |
| 4 | POST wishlist — idempotent add | ❌ FAIL | 1ms | Expected 200, got 401 |
| 5 | DELETE wishlist/:id — remove outing | ❌ FAIL | 1ms | Expected wishlist item to delete |

### Wallet (4/14 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get wallet — requires auth | ✅ PASS | 4ms | — |
| 2 | Get wallet — authenticated | ❌ FAIL | 3ms | Expected 200, got 401 |
| 3 | Get wallet — IDOR prevention (other user) | ❌ FAIL | 2ms | Expected 403, got 401 |
| 4 | Get wallet — admin can view any | ❌ FAIL | 2ms | Expected 200, got 400 |
| 5 | Invalid user ID — validation | ❌ FAIL | 2ms | Expected 400/422, got 401 |
| 6 | Welcome Bonus — ₹100 credited at signup | ❌ FAIL | 1ms | Expected 200, got 401 |
| 7 | Welcome Bonus — not re-credited on login | ❌ FAIL | 254ms | Login failed: 401 |
| 8 | Reward — ₹100 credited after booking | ❌ FAIL | 1ms | Expected 200, got 401 |
| 9 | Redemption — wallet credit applied as booking discount | ✅ PASS | 2ms | — |
| 10 | Recharge — create-order requires auth | ✅ PASS | 1ms | — |
| 11 | Recharge — create-order validates amount min | ❌ FAIL | 1ms | Expected 400/422, got 401 |
| 12 | Recharge — create-order validates amount max | ❌ FAIL | 1ms | Expected 400/422, got 401 |
| 13 | Recharge — verify requires auth | ✅ PASS | 0ms | — |
| 14 | Recharge — verify rejects invalid signature | ❌ FAIL | 0ms | Expected 400, got 401 |

### Tickets (3/12 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Submit ticket — requires auth | ❌ FAIL | 3ms | Expected 401, got 429 |
| 2 | Submit ticket — valid | ❌ FAIL | 1ms | Expected 200, got 429 |
| 3 | Submit ticket — missing fields | ❌ FAIL | 1ms | Expected 400/422, got 429 |
| 4 | Submit ticket — invalid priority | ❌ FAIL | 1ms | Expected 400/422, got 429 |
| 5 | Get my tickets — user | ❌ FAIL | 1ms | Expected 200, got 429 |
| 6 | Admin — list all tickets | ❌ FAIL | 1ms | Expected 200, got 429 |
| 7 | Admin — list tickets denied for user | ❌ FAIL | 0ms | Expected 403, got 429 |
| 8 | Admin — update ticket status | ✅ PASS | 0ms | — |
| 9 | Admin — reply to ticket | ✅ PASS | 0ms | — |
| 10 | Admin — update non-existent ticket | ❌ FAIL | 1ms | Expected 404, got 429 |
| 11 | Admin — invalid status value | ✅ PASS | 0ms | — |
| 12 | XSS prevention in ticket | ❌ FAIL | 1ms | Expected 200, got 429 |

---

## 🧪 Test Types Covered

| # | Test Type | Description | Count |
|---|-----------|-------------|-------|
| 1 | **Smoke Tests** | Server health, reachability, basic responses | 5 |
| 2 | **Authentication Tests** | Signup, login, logout, JWT, session management | 13 |
| 3 | **CRUD Tests** | Create, Read, Update, Delete for outings | 8 |
| 4 | **Booking Tests** | Payment flow, demo booking, participant limits | 7 |
| 5 | **Suggestion Tests** | User suggestions, admin approval | 6 |
| 6 | **Review Tests** | Ratings, comments, duplicate prevention | 5 |
| 7 | **Chat Tests** | Group messaging, access control | 4 |
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

## ❌ Failed Tests Detail

- **[Auth] Signup — valid user**: Signup failed: {"success":false,"message":"Too many accounts created. Try again later."}
- **[Auth] Signup — duplicate email rejected**: Expected 400, got 429
- **[Auth] Signup — missing name rejected**: Expected 400, got 429
- **[Auth] Signup — weak password rejected**: Expected 400, got 429
- **[Auth] Signup — invalid email rejected**: Expected 400, got 429
- **[Auth] Login — valid credentials**: Login failed: {"success":false,"message":"Invalid credentials"}
- **[Outings] POST create — non-admin rejected**: Expected 403, got 401
- **[Outings] DELETE — non-admin rejected**: Expected 403, got 401
- **[Navigation] Wallet page API endpoint exists**: skip is not defined
- **[Navigation] Dashboard page API endpoint exists**: skip is not defined
- **[Navigation] Notifications page API endpoint exists**: skip is not defined
- **[Navigation] Wishlist page API endpoint exists**: skip is not defined
- **[Navigation] Gallery page API endpoint exists**: skip is not defined
- **[Navigation] For You (Recommendations) page API exists**: skip is not defined
- **[Navigation] Concurrent API requests do not cause race conditions**: skip is not defined
- **[Bookings] GET /api/bookings/:userId — own bookings**: Assertion failed
- **[Bookings] GET /api/bookings/:userId — IDOR prevention (other user)**: Expected 403 for IDOR, got 401
- **[Bookings] POST /api/bookings/create-order — Razorpay order**: Unexpected status: 401
- **[Bookings] POST /api/bookings — non-existent outing**: Expected 404, got 401
- **[Bookings] Booking — exceeding max participants**: Expected 400 for overflow, got 401
- **[Suggestions] POST — create suggestion**: Assertion failed
- **[Suggestions] POST — missing title rejected**: Expected 400, got 401
- **[Suggestions] PUT — non-admin rejected**: Expected 403, got 401
- **[Reviews] POST — must have booked to review**: Unexpected: 401
- **[Reviews] POST — invalid rating rejected**: Expected 400, got 401
- **[Chat] GET — authenticated user can view**: Assertion failed
- **[Chat] POST — empty message rejected**: Expected 400, got 401
- **[Verification] POST — submit verification**: Assertion failed
- **[Verification] GET — own verification status**: Assertion failed
- **[Verification] GET — IDOR prevention**: Expected 403, got 401
- **[Verification] POST — invalid ID type rejected**: Expected 400, got 401
- **[Admin] Non-admin rejected from admin routes**: Expected 403, got 401
- **[Recommendations] GET — own recommendations**: Assertion failed
- **[Recommendations] GET — IDOR prevention**: Expected 403, got 401
- **[Security] XSS in input is sanitized**: Assertion failed
- **[Security] JSON body size limit enforced**: Should reject oversized input
- **[PasswordReset] POST forgot-password — valid email (no leak)**: Assertion failed
- **[PasswordReset] POST forgot-password — non-existent email (same response)**: Should not reveal user non-existence
- **[Edge] Very long title in suggestion**: Should reject too-long title
- **[Edge] Booking with 0 participants**: Unexpected: 401
- **[Edge] Review with rating 0**: Expected 400, got 401
- **[Edge] Review with rating 6**: Expected 400, got 401
- **[Notifications] Get notifications — authenticated**: Expected 200, got 401
- **[Notifications] Get notifications — IDOR prevention**: Expected 403 or empty 200, got 401
- **[Notifications] Mark all read — authenticated**: Expected 200, got 401
- **[Notifications] Invalid user ID — validation**: Expected 400/422, got 401
- **[Wishlist] POST wishlist — add outing**: Expected 200, got 401
- **[Wishlist] GET wishlist — authenticated list**: Expected 200, got 401
- **[Wishlist] POST wishlist — idempotent add**: Expected 200, got 401
- **[Wishlist] DELETE wishlist/:id — remove outing**: Expected wishlist item to delete
- **[Wallet] Get wallet — authenticated**: Expected 200, got 401
- **[Wallet] Get wallet — IDOR prevention (other user)**: Expected 403, got 401
- **[Wallet] Get wallet — admin can view any**: Expected 200, got 400
- **[Wallet] Invalid user ID — validation**: Expected 400/422, got 401
- **[Wallet] Welcome Bonus — ₹100 credited at signup**: Expected 200, got 401
- **[Wallet] Welcome Bonus — not re-credited on login**: Login failed: 401
- **[Wallet] Reward — ₹100 credited after booking**: Expected 200, got 401
- **[Wallet] Recharge — create-order validates amount min**: Expected 400/422, got 401
- **[Wallet] Recharge — create-order validates amount max**: Expected 400/422, got 401
- **[Wallet] Recharge — verify rejects invalid signature**: Expected 400, got 401
- **[Tickets] Submit ticket — requires auth**: Expected 401, got 429
- **[Tickets] Submit ticket — valid**: Expected 200, got 429
- **[Tickets] Submit ticket — missing fields**: Expected 400/422, got 429
- **[Tickets] Submit ticket — invalid priority**: Expected 400/422, got 429
- **[Tickets] Get my tickets — user**: Expected 200, got 429
- **[Tickets] Admin — list all tickets**: Expected 200, got 429
- **[Tickets] Admin — list tickets denied for user**: Expected 403, got 429
- **[Tickets] Admin — update non-existent ticket**: Expected 404, got 429
- **[Tickets] XSS prevention in ticket**: Expected 200, got 429

---

*Generated by VIBES@Outing Test Runner*
