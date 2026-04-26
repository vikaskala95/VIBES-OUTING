Harden my full-stack web application for production-grade security. Treat this as a real-world internet-facing startup handling user data and payments.

Requirements:

1. Authentication & Authorization:

* Implement secure authentication (JWT or session-based with httpOnly cookies).
* Passwords must be hashed using bcrypt with salt.
* Add rate limiting and account lockout after multiple failed login attempts.
* Implement role-based access control (RBAC).
* Prevent IDOR (Insecure Direct Object Reference).

2. Input Validation & Sanitization:

* Validate and sanitize all user inputs (frontend + backend).
* Prevent SQL Injection (use parameterized queries / ORM).
* Prevent XSS (escape output, sanitize HTML).
* Prevent command injection.

3. API Security:

* Protect all APIs with authentication middleware.
* Implement rate limiting (e.g., 100 requests/min per IP).
* Use proper HTTP status codes.
* Disable unnecessary endpoints.

4. Headers & Browser Security:

* Add security headers:

  * Content-Security-Policy (CSP)
  * X-Frame-Options (DENY)
  * X-Content-Type-Options (nosniff)
  * Strict-Transport-Security (HSTS)
* Enable CORS with strict origin rules.

5. HTTPS & Data Protection:

* Enforce HTTPS everywhere (no HTTP).
* Encrypt sensitive data in transit.
* Never store sensitive info in localStorage (use secure cookies).

6. Database Security:

* Use least privilege DB user.
* Prevent raw queries (use ORM like Prisma/Mongoose).
* Sanitize queries.
* Backup database securely.

7. Payment Security (IMPORTANT for your use case):

* Use trusted payment gateway (Razorpay/Stripe).
* Never store card details.
* Verify payment signatures/webhooks securely.

8. File Upload Security:

* Restrict file types and size.
* Scan uploads.
* Store outside public directory.

9. Logging & Monitoring:

* Log failed logins and suspicious activity.
* Add basic intrusion detection (rate spikes, unusual patterns).

10. Deployment Security:

* Use environment variables (.env) for secrets.
* Never expose API keys in frontend.
* Disable debug mode in production.
* Use secure hosting configs (Render/Hostinger).

11. Protection Against Common Attacks:

* CSRF protection (tokens)
* XSS protection
* SQL Injection protection
* Brute-force protection
* DDoS mitigation (rate limit + CDN like Cloudflare)

12. Code Quality:

* Remove unused code and endpoints.
* Use linting and security audit tools (npm audit).

Goal:
Make the application secure against real-world attacks and safe for handling user data, payments, and scaling to production users.
