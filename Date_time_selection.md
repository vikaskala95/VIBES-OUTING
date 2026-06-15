Prompt: Weekend Auto Date & Time Selection for Booking System

When the user clicks the “Book” button, open a booking modal with an automatic Weekend Trip Date Selector.

Booking Rules
1. One Day Trips

Examples: Nandi Hills, Bheemeshwari, Sunrise rides, Day outings

User should only be able to select Saturday dates.
Trip start time should always be automatically set to:
Saturday – 4:00 AM
Only upcoming Saturdays should appear in the calendar.
Disable all other weekdays.
Show label:
"Weekend Sunrise Trip"
2. 2D/1N Trips

Examples: Chikmagalur, Coorg, Ooty, Weekend Stay Trips

User should only be able to select Friday dates.
Trip departure time should always be automatically set to:
Friday – 10:00 PM
Only upcoming Fridays should appear in the calendar.
Disable all other weekdays.
Show label:
"Weekend Night Departure"
Smart Weekend Logic

The system should automatically generate dates for:

Every upcoming weekend
Next 3–6 months dynamically
No manual admin date creation required

Example:

Friday Night → 2D/1N Trip
Saturday Early Morning → One Day Trip
UI Requirements
Inside Booking Modal

Show:

Selected trip name
Trip type (One Day or 2D/1N)
Auto-selected departure time
Available weekend dates dropdown/calendar
Remaining seats
Price calculation

Example:

One Day Trip
Saturday, 16 May 2026
Departure: 4:00 AM
2D/1N Trip
Friday, 15 May 2026
Departure: 10:00 PM
Validation Rules
Prevent selecting past dates
Prevent selecting weekdays other than allowed rules
If seats are full:
Disable booking button
Show "Sold Out"
Backend Requirements

Store in database:

Trip ID
User ID
Selected weekend date
Auto-generated departure time
Booking timestamp
Trip type
Payment status
Remaining seats count
Extra UX Enhancements

Add:

“Next Weekend Available” badge
Countdown timer:
"Trip starts in 4 Days"
Auto-close bookings:
6 hours before departure for One Day Trips
12 hours before departure for 2D/1N Trips
Expected Behavior Example
Nandi Hills Sunrise Vibes

(User clicks Book)

System automatically shows:

Available Saturdays only
Departure fixed at 4:00 AM
Chikmagalur Coffee & Chill (2D/1N)

(User clicks Book)

System automatically shows:

Available Fridays only
Departure fixed at 10:00 PM