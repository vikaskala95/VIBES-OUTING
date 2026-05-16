# 🧪 VIBES@Outing — Test Report

**Date:** 2026-05-16 07:27:58  
**Environment:** Development (localhost:3000)  
**Node.js:** v22.17.0  
**Total Duration:** 6.57s  

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 123 |
| ✅ Passed | 123 |
| ❌ Failed | 0 |
| ⚠ Skipped | 1 |
| Pass Rate | 100.0% |

---

## 📋 Test Categories

### Smoke (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Server is reachable | ✅ PASS | 39ms | — |
| 2 | API returns JSON for outings | ✅ PASS | 12ms | — |
| 3 | Unknown API returns 404 | ✅ PASS | 7ms | — |
| 4 | Public stats endpoint works | ✅ PASS | 4ms | — |
| 5 | Static files served | ✅ PASS | 5ms | — |

### Auth (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Signup — valid user | ✅ PASS | 292ms | — |
| 2 | Signup — duplicate email rejected | ✅ PASS | 229ms | — |
| 3 | Signup — missing name rejected | ✅ PASS | 3ms | — |
| 4 | Signup — weak password rejected | ✅ PASS | 2ms | — |
| 5 | Signup — invalid email rejected | ✅ PASS | 2ms | — |
| 6 | Login — valid credentials | ✅ PASS | 227ms | — |
| 7 | Login — wrong password | ✅ PASS | 227ms | — |
| 8 | Login — non-existent user | ✅ PASS | 229ms | — |
| 9 | Login — missing fields | ✅ PASS | 2ms | — |
| 10 | Admin login | ✅ PASS | 230ms | — |
| 11 | Logout | ✅ PASS | 1ms | — |
| 12 | Protected route rejects unauthenticated | ✅ PASS | 4ms | — |
| 13 | Invalid token rejected | ✅ PASS | 3ms | — |

### Outings (8/8 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/outings — list all | ✅ PASS | 4ms | — |
| 2 | GET /api/outings/:id — valid ID | ✅ PASS | 3ms | — |
| 3 | GET /api/outings/:id — invalid ID | ✅ PASS | 2ms | — |
| 4 | GET /api/outings/:id — non-numeric ID | ✅ PASS | 2ms | — |
| 5 | POST create — non-admin rejected | ✅ PASS | 3ms | — |
| 6 | POST create — admin can create | ✅ PASS | 5ms | — |
| 7 | DELETE — admin can delete | ✅ PASS | 4ms | — |
| 8 | DELETE — non-admin rejected | ✅ PASS | 2ms | — |

### Bookings (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST /api/bookings — demo booking | ✅ PASS | 5ms | — |
| 2 | POST /api/bookings — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET /api/bookings/:userId — own bookings | ✅ PASS | 3ms | — |
| 4 | GET /api/bookings/:userId — IDOR prevention (other user) | ✅ PASS | 3ms | — |
| 5 | POST /api/bookings/create-order — Razorpay order | ✅ PASS | 342ms | — |
| 6 | POST /api/bookings — non-existent outing | ✅ PASS | 2ms | — |
| 7 | Booking — exceeding max participants | ✅ PASS | 2ms | — |

### Suggestions (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — create suggestion | ✅ PASS | 5ms | — |
| 2 | POST — unauthenticated rejected | ✅ PASS | 2ms | — |
| 3 | GET — list suggestions | ✅ PASS | 4ms | — |
| 4 | POST — missing title rejected | ✅ PASS | 2ms | — |
| 5 | PUT — admin approve suggestion | ✅ PASS | 3ms | — |
| 6 | PUT — non-admin rejected | ✅ PASS | 2ms | — |

### Reviews (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/reviews/:outingId | ✅ PASS | 5ms | — |
| 2 | POST — must have booked to review | ✅ PASS | 4ms | — |
| 3 | POST — invalid rating rejected | ✅ PASS | 2ms | — |
| 4 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 5 | GET — invalid outing ID | ✅ PASS | 4ms | — |

### Chat (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — unauthenticated rejected | ✅ PASS | 3ms | — |
| 2 | GET — authenticated user can view | ✅ PASS | 2ms | — |
| 3 | POST — empty message rejected | ✅ PASS | 2ms | — |
| 4 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |

### Verification (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — submit verification | ✅ PASS | 3ms | — |
| 2 | GET — own verification status | ✅ PASS | 4ms | — |
| 3 | GET — IDOR prevention | ✅ PASS | 3ms | — |
| 4 | POST — invalid ID type rejected | ✅ PASS | 2ms | — |
| 5 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 6 | Admin — list verifications | ✅ PASS | 3ms | — |
| 7 | Admin — approve verification | ✅ PASS | 4ms | — |

### Admin (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/admin/stats | ✅ PASS | 5ms | — |
| 2 | GET /api/admin/users | ✅ PASS | 4ms | — |
| 3 | GET /api/admin/bookings | ✅ PASS | 4ms | — |
| 4 | GET /api/admin/security-logs | ✅ PASS | 3ms | — |
| 5 | Non-admin rejected from admin routes | ✅ PASS | 2ms | — |
| 6 | Admin — users list has no passwords | ✅ PASS | 1ms | — |

### Recommendations (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — own recommendations | ✅ PASS | 6ms | — |
| 2 | GET — IDOR prevention | ✅ PASS | 3ms | — |
| 3 | GET — unauthenticated rejected | ✅ PASS | 1ms | — |
| 4 | Results exclude booked outings | ✅ PASS | 0ms | — |

### Security (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | X-Powered-By header is absent | ✅ PASS | 3ms | — |
| 2 | X-Content-Type-Options: nosniff | ✅ PASS | 2ms | — |
| 3 | X-Frame-Options present | ✅ PASS | 2ms | — |
| 4 | Content-Security-Policy present | ✅ PASS | 4ms | — |
| 5 | Referrer-Policy present | ✅ PASS | 3ms | — |
| 6 | Permissions-Policy present | ✅ PASS | 2ms | — |
| 7 | XSS in input is sanitized | ✅ PASS | 3ms | — |
| 8 | SQL injection in param is safe | ✅ PASS | 2ms | — |
| 9 | JSON body size limit enforced | ✅ PASS | 5ms | — |
| 10 | Password not in login response | ✅ PASS | 227ms | — |
| 11 | Dotfiles access denied | ✅ PASS | 4ms | — |
| 12 | No dev_reset_link in forgot-password response | ✅ PASS | 2ms | — |
| 13 | Compression header present | ✅ PASS | 1ms | — |

### PasswordReset (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST forgot-password — valid email (no leak) | ✅ PASS | 628ms | — |
| 2 | POST forgot-password — non-existent email (same response) | ✅ PASS | 1ms | — |
| 3 | POST forgot-password — invalid email rejected | ✅ PASS | 1ms | — |
| 4 | POST reset-password — invalid token | ✅ PASS | 2ms | — |
| 5 | POST reset-password — weak password rejected | ✅ PASS | 2ms | — |

### Edge (10/10 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET outing with ID 0 | ✅ PASS | 3ms | — |
| 2 | GET outing with negative ID | ✅ PASS | 2ms | — |
| 3 | GET outing with very large ID | ✅ PASS | 2ms | — |
| 4 | POST with empty JSON body | ✅ PASS | 1ms | — |
| 5 | POST with null body fields | ✅ PASS | 1ms | — |
| 6 | Special characters in search (GET) | ✅ PASS | 2ms | — |
| 7 | Very long title in suggestion | ✅ PASS | 2ms | — |
| 8 | Booking with 0 participants | ✅ PASS | 1ms | — |
| 9 | Review with rating 0 | ✅ PASS | 2ms | — |
| 10 | Review with rating 6 | ✅ PASS | 2ms | — |

### Misc (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/razorpay-key | ✅ PASS | 3ms | — |
| 2 | SPA fallback — unknown route returns index.html | ✅ PASS | 4ms | — |
| 3 | Multiple concurrent requests handled | ✅ PASS | 9ms | — |
| 4 | OPTIONS request (CORS preflight) | ✅ PASS | 1ms | — |

### Integrity (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Outing data has required fields | ✅ PASS | 3ms | — |
| 2 | Booking amounts calculate correctly (20% token) | ✅ PASS | 2ms | — |
| 3 | Outing participant count is non-negative | ✅ PASS | 2ms | — |
| 4 | Review average is between 0 and 5 | ✅ PASS | 2ms | — |

### Notifications (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get notifications — requires auth | ✅ PASS | 3ms | — |
| 2 | Get notifications — authenticated | ✅ PASS | 4ms | — |
| 3 | Get notifications — IDOR prevention | ✅ PASS | 3ms | — |
| 4 | Mark all read — authenticated | ✅ PASS | 2ms | — |
| 5 | Invalid user ID — validation | ✅ PASS | 3ms | — |

### Wallet (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Get wallet — requires auth | ✅ PASS | 6ms | — |
| 2 | Get wallet — authenticated | ✅ PASS | 6ms | — |
| 3 | Get wallet — IDOR prevention (other user) | ✅ PASS | 3ms | — |
| 4 | Get wallet — admin can view any | ✅ PASS | 3ms | — |
| 5 | Invalid user ID — validation | ✅ PASS | 3ms | — |

### Tickets (12/12 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Submit ticket — requires auth | ✅ PASS | 2ms | — |
| 2 | Submit ticket — valid | ✅ PASS | 5ms | — |
| 3 | Submit ticket — missing fields | ✅ PASS | 2ms | — |
| 4 | Submit ticket — invalid priority | ✅ PASS | 1ms | — |
| 5 | Get my tickets — user | ✅ PASS | 3ms | — |
| 6 | Admin — list all tickets | ✅ PASS | 3ms | — |
| 7 | Admin — list tickets denied for user | ✅ PASS | 2ms | — |
| 8 | Admin — update ticket status | ✅ PASS | 2ms | — |
| 9 | Admin — reply to ticket | ✅ PASS | 2ms | — |
| 10 | Admin — update non-existent ticket | ✅ PASS | 2ms | — |
| 11 | Admin — invalid status value | ✅ PASS | 1ms | — |
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
| 17 | **Wallet Tests** | Balance, transactions, access control | 5 |
| 18 | **Support Ticket Tests** | Create, admin manage, XSS prevention | 12 |

---

*Generated by VIBES@Outing Test Runner*
