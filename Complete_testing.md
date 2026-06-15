Act as a Senior QA Engineer, Automation Test Architect, Security Tester, Performance Tester, and Product Quality Analyst.

Project Name: VibeSouting
Project Type: Travel & Weekend Outing Booking Platform

Project Overview:
VibeSouting is a travel and outing platform where users can discover, book, and join weekend trips and outings with strangers or friends. The platform includes:
- User authentication
- Google OAuth login
- Weekend trip booking
- Date and time-based trip logic
- Payment integration
- Digital trip pass generation
- QR code verification
- Admin dashboard
- Partner application system
- Email notifications
- Mobile responsive UI

Your task is to perform COMPLETE END-TO-END TESTING of the entire project and generate:
1. Test cases
2. Edge cases
3. Bug reports
4. Security vulnerabilities
5. Performance bottlenecks
6. UI/UX issues
7. API validation
8. Database consistency checks
9. Automation test suggestions
10. Production readiness report

==================================================
FUNCTIONAL TESTING REQUIREMENTS
==================================================

Test all flows thoroughly:

1. User Authentication
- Signup
- Login
- Logout
- Forgot password
- Session expiration
- Invalid credentials
- Google OAuth login
- Duplicate accounts

2. Trip Discovery
- Search outings
- Filter by vibe/category
- Filter by date
- Explore by vibe functionality
- Pagination
- Empty state handling

3. Booking Flow
- Select outing
- Seat selection
- Booking confirmation
- Slot availability
- Booking cancellation
- Booking history

4. Weekend Trip Logic Validation
- One-day trip should allow only Saturday early morning booking
- 2D/1N trip should allow Friday night booking
- Date picker should block invalid dates
- Time validation should work correctly

5. Payment Testing
- Successful payment
- Failed payment
- Payment timeout
- Double-click prevention
- Duplicate transaction prevention
- Refund workflow
- Invoice generation

6. Digital Pass System
- Generate unique pass ID
- Generate QR code
- Download pass
- Print compatibility
- Pass validation before boarding
- QR verification flow
- Prevent duplicate boarding

7. Partner Application System
- Form submission
- Database storage
- Email notification to admin
- Email notification to applicant
- Invalid form handling

8. Admin Dashboard
- Create/Edit/Delete outing
- Manage users
- View bookings
- Verify digital passes
- Export data
- Analytics visibility

==================================================
UI/UX TESTING
==================================================

Check:
- Mobile responsiveness
- Tablet responsiveness
- Desktop responsiveness
- Image loading
- Broken layouts
- Alignment issues
- Accessibility
- Font consistency
- Loading indicators
- Empty states
- Error messages
- Button states
- Navigation flow

Test on:
- Chrome
- Firefox
- Edge
- Safari
- Android devices
- iPhone devices

==================================================
API TESTING
==================================================

Validate:
- Authentication APIs
- Booking APIs
- Payment APIs
- Admin APIs
- Partner APIs

Check:
- Correct status codes
- Invalid payload handling
- Unauthorized access
- Token validation
- Rate limiting
- Error responses
- Response time

==================================================
DATABASE TESTING
==================================================

Validate:
- User data consistency
- Booking consistency
- Payment records
- QR/pass uniqueness
- Duplicate prevention
- Foreign key integrity
- Transaction rollback handling

==================================================
SECURITY TESTING
==================================================

Perform:
- SQL Injection testing
- XSS testing
- CSRF testing
- Authentication bypass attempts
- JWT/session validation
- Admin route protection
- File upload validation
- Sensitive data exposure check
- API authorization testing

Generate:
- Vulnerability severity
- Exploitation risk
- Recommended fixes

==================================================
PERFORMANCE TESTING
==================================================

Simulate:
- 100+ concurrent users
- Simultaneous bookings
- Multiple login requests
- Payment traffic spikes

Measure:
- Response time
- Server load
- Database performance
- API latency
- Memory usage
- CPU usage

Identify:
- Bottlenecks
- Slow queries
- Heavy APIs
- Unoptimized images
- Memory leaks

==================================================
SEO TESTING
==================================================

Validate:
- Meta tags
- Sitemap
- robots.txt
- OpenGraph tags
- Structured data
- Lighthouse score
- Mobile SEO
- Performance score

==================================================
ACCESSIBILITY TESTING
==================================================

Check:
- Keyboard navigation
- ARIA labels
- Screen reader support
- Color contrast
- Alt text
- Focus states

==================================================
AUTOMATION TESTING
==================================================

Suggest automation for:
- Login flow
- Booking flow
- Payment flow
- QR verification
- Admin workflows

Preferred tools:
- Playwright
- Cypress
- Jest
- Supertest

==================================================
EXPECTED OUTPUT FORMAT
==================================================

Generate:
1. Functional test cases
2. Edge cases
3. Severity-wise bugs
4. Security findings
5. Performance report
6. UI/UX improvement suggestions
7. Automation strategy
8. Production readiness checklist
9. Final QA summary

For every issue include:
- Title
- Severity
- Steps to reproduce
- Expected result
- Actual result
- Recommended fix

Also identify:
- Critical launch blockers
- High-risk modules
- Scalability concerns
- Production deployment risks

Finally provide:
- Overall project health score
- Launch readiness percentage
- Priority-wise fix recommendations