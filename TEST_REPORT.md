# 🧪 VIBES@Outing — Test Report

**Date:** 2026-04-27 08:35:31  
**Environment:** Development (localhost:3000)  
**Node.js:** v22.17.0  
**Total Duration:** 5.43s  

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Tests | 105 |
| ✅ Passed | 105 |
| ❌ Failed | 0 |
| ⚠ Skipped | 3 |
| Pass Rate | 100.0% |

---

## 📋 Test Categories

### Smoke (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Server is reachable | ✅ PASS | 37ms | — |
| 2 | API returns JSON for outings | ✅ PASS | 12ms | — |
| 3 | Unknown API returns 404 | ✅ PASS | 5ms | — |
| 4 | Public stats endpoint works | ✅ PASS | 3ms | — |
| 5 | Static files served | ✅ PASS | 4ms | — |

### Auth (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Signup — valid user | ✅ PASS | 344ms | — |
| 2 | Signup — duplicate email rejected | ✅ PASS | 282ms | — |
| 3 | Signup — missing name rejected | ✅ PASS | 4ms | — |
| 4 | Signup — weak password rejected | ✅ PASS | 3ms | — |
| 5 | Signup — invalid email rejected | ✅ PASS | 3ms | — |
| 6 | Login — valid credentials | ✅ PASS | 248ms | — |
| 7 | Login — wrong password | ✅ PASS | 261ms | — |
| 8 | Login — non-existent user | ✅ PASS | 284ms | — |
| 9 | Login — missing fields | ✅ PASS | 3ms | — |
| 10 | Admin login | ✅ PASS | 249ms | — |
| 11 | Logout | ✅ PASS | 2ms | — |
| 12 | Protected route rejects unauthenticated | ✅ PASS | 2ms | — |
| 13 | Invalid token rejected | ✅ PASS | 2ms | — |

### Outings (8/8 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/outings — list all | ✅ PASS | 2ms | — |
| 2 | GET /api/outings/:id — valid ID | ✅ PASS | 3ms | — |
| 3 | GET /api/outings/:id — invalid ID | ✅ PASS | 2ms | — |
| 4 | GET /api/outings/:id — non-numeric ID | ✅ PASS | 2ms | — |
| 5 | POST create — non-admin rejected | ✅ PASS | 3ms | — |
| 6 | POST create — admin can create | ✅ PASS | 4ms | — |
| 7 | DELETE — admin can delete | ✅ PASS | 5ms | — |
| 8 | DELETE — non-admin rejected | ✅ PASS | 1ms | — |

### Bookings (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST /api/bookings — demo booking | ✅ PASS | 5ms | — |
| 2 | POST /api/bookings — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET /api/bookings/:userId — own bookings | ✅ PASS | 3ms | — |
| 4 | GET /api/bookings/:userId — IDOR prevention (other user) | ✅ PASS | 3ms | — |
| 5 | POST /api/bookings/create-order — Razorpay order | ✅ PASS | 339ms | — |
| 6 | POST /api/bookings — non-existent outing | ✅ PASS | 2ms | — |
| 7 | Booking — exceeding max participants | ✅ PASS | 2ms | — |

### Suggestions (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST — create suggestion | ✅ PASS | 3ms | — |
| 2 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 3 | GET — list suggestions | ✅ PASS | 3ms | — |
| 4 | POST — missing title rejected | ✅ PASS | 2ms | — |
| 5 | PUT — admin approve suggestion | ✅ PASS | 1ms | — |
| 6 | PUT — non-admin rejected | ✅ PASS | 2ms | — |

### Reviews (7/7 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/reviews/:outingId | ✅ PASS | 4ms | — |
| 2 | POST — must have booked to review | ✅ PASS | 3ms | — |
| 3 | POST — review booked outing | ✅ PASS | 2ms | — |
| 4 | POST — duplicate review rejected | ✅ PASS | 2ms | — |
| 5 | POST — invalid rating rejected | ✅ PASS | 1ms | — |
| 6 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |
| 7 | GET — invalid outing ID | ✅ PASS | 2ms | — |

### Chat (6/6 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — unauthenticated rejected | ✅ PASS | 3ms | — |
| 2 | GET — authenticated user can view | ✅ PASS | 2ms | — |
| 3 | POST — booked user can send message | ✅ PASS | 2ms | — |
| 4 | POST — message appears in chat | ✅ PASS | 2ms | — |
| 5 | POST — empty message rejected | ✅ PASS | 2ms | — |
| 6 | POST — unauthenticated rejected | ✅ PASS | 1ms | — |

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
| 1 | GET /api/admin/stats | ✅ PASS | 6ms | — |
| 2 | GET /api/admin/users | ✅ PASS | 4ms | — |
| 3 | GET /api/admin/bookings | ✅ PASS | 3ms | — |
| 4 | GET /api/admin/security-logs | ✅ PASS | 3ms | — |
| 5 | Non-admin rejected from admin routes | ✅ PASS | 2ms | — |
| 6 | Admin — users list has no passwords | ✅ PASS | 2ms | — |

### Recommendations (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET — own recommendations | ✅ PASS | 4ms | — |
| 2 | GET — IDOR prevention | ✅ PASS | 3ms | — |
| 3 | GET — unauthenticated rejected | ✅ PASS | 2ms | — |
| 4 | Results exclude booked outings | ✅ PASS | 2ms | — |

### Security (13/13 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | X-Powered-By header is absent | ✅ PASS | 2ms | — |
| 2 | X-Content-Type-Options: nosniff | ✅ PASS | 1ms | — |
| 3 | X-Frame-Options present | ✅ PASS | 1ms | — |
| 4 | Content-Security-Policy present | ✅ PASS | 2ms | — |
| 5 | Referrer-Policy present | ✅ PASS | 2ms | — |
| 6 | Permissions-Policy present | ✅ PASS | 1ms | — |
| 7 | XSS in input is sanitized | ✅ PASS | 3ms | — |
| 8 | SQL injection in param is safe | ✅ PASS | 4ms | — |
| 9 | JSON body size limit enforced | ✅ PASS | 4ms | — |
| 10 | Password not in login response | ✅ PASS | 234ms | — |
| 11 | Dotfiles access denied | ✅ PASS | 3ms | — |
| 12 | No dev_reset_link in forgot-password response | ✅ PASS | 1ms | — |
| 13 | Compression header present | ✅ PASS | 2ms | — |

### PasswordReset (5/5 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | POST forgot-password — valid email (no leak) | ✅ PASS | 3ms | — |
| 2 | POST forgot-password — non-existent email (same response) | ✅ PASS | 1ms | — |
| 3 | POST forgot-password — invalid email rejected | ✅ PASS | 1ms | — |
| 4 | POST reset-password — invalid token | ✅ PASS | 2ms | — |
| 5 | POST reset-password — weak password rejected | ✅ PASS | 1ms | — |

### Edge (10/10 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET outing with ID 0 | ✅ PASS | 3ms | — |
| 2 | GET outing with negative ID | ✅ PASS | 2ms | — |
| 3 | GET outing with very large ID | ✅ PASS | 2ms | — |
| 4 | POST with empty JSON body | ✅ PASS | 1ms | — |
| 5 | POST with null body fields | ✅ PASS | 0ms | — |
| 6 | Special characters in search (GET) | ✅ PASS | 1ms | — |
| 7 | Very long title in suggestion | ✅ PASS | 2ms | — |
| 8 | Booking with 0 participants | ✅ PASS | 2ms | — |
| 9 | Review with rating 0 | ✅ PASS | 2ms | — |
| 10 | Review with rating 6 | ✅ PASS | 1ms | — |

### Misc (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | GET /api/razorpay-key | ✅ PASS | 3ms | — |
| 2 | SPA fallback — unknown route returns index.html | ✅ PASS | 4ms | — |
| 3 | Multiple concurrent requests handled | ✅ PASS | 6ms | — |
| 4 | OPTIONS request (CORS preflight) | ✅ PASS | 1ms | — |

### Integrity (4/4 passed)

| # | Test Name | Status | Time | Error |
|---|-----------|--------|------|-------|
| 1 | Outing data has required fields | ✅ PASS | 1ms | — |
| 2 | Booking amounts calculate correctly (20% token) | ✅ PASS | 0ms | — |
| 3 | Outing participant count is non-negative | ✅ PASS | 1ms | — |
| 4 | Review average is between 0 and 5 | ✅ PASS | 1ms | — |

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

---

*Generated by VIBES@Outing Test Runner*
