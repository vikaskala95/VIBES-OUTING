Load & Stress Testing Prompt for VibeSouting

Objective:
Perform comprehensive Load Testing, Stress Testing, Spike Testing, Endurance Testing, and Scalability Testing for the VibeSouting platform to identify performance bottlenecks, stability issues, and capacity limits before production release.

Application Details

Website: VibeSouting
Core Features:

User Registration & Login (Email/Google Sign-In)
Wallet Management
Outing Browsing & Search
Outing Details Page
Booking & Payment Flow
User Profile Management
Booking History
Admin Dashboard
Notifications & Emails
Test Scenarios
1. Baseline Performance Test

Measure performance with normal traffic:

100 concurrent users
Browse outings
View outing details
Login/Logout
Book tickets
Add wallet balance

Expected:

Page load < 3 seconds
API response < 1 second
No errors
2. Load Testing

Gradually increase traffic:

Users	Duration
100	10 mins
250	10 mins
500	10 mins
1000	15 mins
2000	15 mins

Monitor:

CPU utilization
Memory usage
Database performance
API response times
Error rates
Network throughput

Expected:

System remains responsive
Error rate < 1%
3. Stress Testing

Push system beyond expected limits:

Users	Duration
3000	10 mins
5000	10 mins
10000	10 mins

Verify:

Graceful degradation
No data corruption
No duplicate bookings
No wallet balance inconsistencies
No payment processing failures

Expected:

System may slow down but should not crash
Recovery should occur automatically after traffic drops
4. Booking Surge Test

Simulate flash-sale conditions:

5000 users attempting booking simultaneously
Same outing selected
Concurrent payment requests
Concurrent wallet deductions

Verify:

No overselling
No duplicate tickets
Accurate wallet deductions
Correct booking confirmations
5. Endurance (Soak) Testing

Run:

500 concurrent users
Continuous traffic for 24 hours

Monitor:

Memory leaks
Database connection leaks
CPU growth
Response time degradation

Expected:

Stable performance throughout the test
6. Spike Testing

Traffic pattern:

100 users → 5000 users → 100 users

Repeat 5 times.

Verify:

Auto-recovery
No crashes
No session loss
No database failures
7. Wallet Transaction Testing

Simulate:

2000 concurrent wallet top-ups
2000 concurrent wallet deductions
Mixed booking and wallet usage

Verify:

Balance accuracy
Transaction consistency
No duplicate credits/debits
8. Database Stress Testing

Simulate:

Heavy booking writes
Search queries
User logins
Wallet transactions

Monitor:

Query execution time
Lock contention
Deadlocks
Connection pool exhaustion
Metrics to Capture
Throughput (Requests/sec)
Average Response Time
P95 Response Time
P99 Response Time
Error Percentage
CPU Usage
Memory Usage
Database Load
Network Utilization
Concurrent Sessions
Acceptance Criteria

✅ No crashes under expected peak load
✅ Booking flow success rate > 99%
✅ Wallet transaction accuracy = 100%
✅ API response time < 2 seconds under normal load
✅ Error rate < 1% under expected traffic
✅ Automatic recovery after stress conditions
✅ No memory leaks during 24-hour endurance testing

Deliverables

Generate a detailed report containing:

Test Summary
Performance Graphs
Bottleneck Analysis
Failed Requests Analysis
Database Performance Analysis
Infrastructure Recommendations
Scaling Recommendations
Final Go/No-Go Release Recommendation