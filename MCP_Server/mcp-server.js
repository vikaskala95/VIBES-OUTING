/**
 * VibeSouting MCP Server
 * Exposes platform tools via Model Context Protocol (SSE transport)
 * Reuses the existing dbQuery interface from server.js
 */

const { z } = require('zod');
const crypto = require('crypto');

// ─── Lazy-load ESM MCP SDK (project is CommonJS) ───────────────
let McpServer, SSEServerTransport;

async function loadMcpSdk() {
  if (!McpServer) {
    const serverMod = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const sseMod = await import('@modelcontextprotocol/sdk/server/sse.js');
    McpServer = serverMod.McpServer;
    SSEServerTransport = sseMod.SSEServerTransport;
  }
}

// ─── Create and configure the MCP server instance ───────────────
function createMcpServer(dbQuery) {
  const mcp = new McpServer({
    name: 'vibesouting-mcp',
    version: '1.0.0',
  });

  // ──────────────────────────────────────────────────────────────
  // TOOL 1: searchTrips
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'searchTrips',
    'Search available outings/trips by destination, date, budget, category, or trip type',
    {
      destination: z.string().optional().describe('Destination or location to search for'),
      date: z.string().optional().describe('Trip date (YYYY-MM-DD)'),
      budget: z.number().optional().describe('Maximum budget in INR'),
      category: z.string().optional().describe('Category: mountains, beaches, adventure, road_trips, festivals, nightlife'),
      tripType: z.string().optional().describe('Trip type: one_day or 2d1n'),
    },
    async ({ destination, date, budget, category, tripType }) => {
      let sql = `SELECT id, title, location, description, date, time, cost, 
                 max_participants, current_participants, category, trip_type, image_url, images,
                 (max_participants - current_participants) AS slots_left
                 FROM outings WHERE status = 'active'`;
      const params = [];
      let paramIdx = 1;

      if (destination) {
        sql += ` AND (LOWER(location) LIKE $${paramIdx} OR LOWER(title) LIKE $${paramIdx})`;
        params.push(`%${destination.toLowerCase()}%`);
        paramIdx++;
      }
      if (date) {
        sql += ` AND date = $${paramIdx}`;
        params.push(date);
        paramIdx++;
      }
      if (budget) {
        sql += ` AND cost <= $${paramIdx}`;
        params.push(budget);
        paramIdx++;
      }
      if (category) {
        sql += ` AND LOWER(category) = $${paramIdx}`;
        params.push(category.toLowerCase());
        paramIdx++;
      }
      if (tripType) {
        sql += ` AND trip_type = $${paramIdx}`;
        params.push(tripType);
        paramIdx++;
      }

      sql += ` ORDER BY date ASC`;
      const result = await dbQuery(sql, params);

      const trips = result.rows.map(r => ({
        id: r.id,
        title: r.title,
        location: r.location,
        description: r.description,
        date: r.date,
        time: r.time,
        price: r.cost,
        category: r.category,
        tripType: r.trip_type,
        slotsLeft: r.slots_left,
        maxParticipants: r.max_participants,
        imageUrl: r.image_url,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ count: trips.length, trips }, null, 2) }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 2: getBooking
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'getBooking',
    'Fetch booking details by booking ID',
    {
      bookingId: z.number().describe('Booking ID'),
    },
    async ({ bookingId }) => {
      const result = await dbQuery(
        `SELECT b.*, o.title, o.location, o.date, o.time, o.cost, u.name AS user_name, u.email AS user_email
         FROM bookings b
         JOIN outings o ON b.outing_id = o.id
         JOIN users u ON b.user_id = u.id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (result.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Booking not found' }) }] };
      }

      const b = result.rows[0];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: b.id,
            userName: b.user_name,
            userEmail: b.user_email,
            tripTitle: b.title,
            location: b.location,
            date: b.date,
            time: b.time,
            participants: b.participants,
            participantNames: b.participant_names,
            totalAmount: b.total_amount,
            tokenAmount: b.token_amount,
            remainingAmount: b.remaining_amount,
            paymentStatus: b.payment_status,
            remainingPaymentStatus: b.remaining_payment_status,
            paymentId: b.payment_id,
            selectedDate: b.selected_date,
            departureTime: b.departure_time,
            createdAt: b.created_at,
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 3: createBooking
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'createBooking',
    'Create a new trip booking for a user',
    {
      userId: z.number().describe('User ID'),
      outingId: z.number().describe('Outing/trip ID'),
      participants: z.number().min(1).max(10).describe('Number of participants'),
      participantNames: z.string().optional().describe('Comma-separated participant names'),
      selectedDate: z.string().optional().describe('Selected date (YYYY-MM-DD)'),
      departureTime: z.string().optional().describe('Departure time'),
    },
    async ({ userId, outingId, participants, participantNames, selectedDate, departureTime }) => {
      // Verify outing exists and has slots
      const outingResult = await dbQuery('SELECT * FROM outings WHERE id = $1 AND status = $2', [outingId, 'active']);
      if (outingResult.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Outing not found or inactive' }) }] };
      }

      const outing = outingResult.rows[0];
      const slotsLeft = outing.max_participants - outing.current_participants;
      if (participants > slotsLeft) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Only ${slotsLeft} slots available` }) }] };
      }

      // Verify user exists
      const userResult = await dbQuery('SELECT id, name, email FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'User not found' }) }] };
      }

      const totalAmount = outing.cost * participants;
      const tokenAmount = Math.ceil(totalAmount * 0.3); // 30% token
      const remainingAmount = totalAmount - tokenAmount;

      const result = await dbQuery(
        `INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, token_amount, remaining_amount, payment_status, selected_date, departure_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [userId, outingId, participants, participantNames || '', totalAmount, tokenAmount, remainingAmount, 'pending', selectedDate || '', departureTime || '']
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            bookingId: result.rows[0].id,
            totalAmount,
            tokenAmount,
            remainingAmount,
            message: 'Booking created. Payment is pending.',
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 4: cancelBooking
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'cancelBooking',
    'Cancel an existing booking by booking ID',
    {
      bookingId: z.number().describe('Booking ID to cancel'),
    },
    async ({ bookingId }) => {
      const bookingResult = await dbQuery(
        `SELECT b.*, o.current_participants, o.id AS oid FROM bookings b
         JOIN outings o ON b.outing_id = o.id WHERE b.id = $1`,
        [bookingId]
      );
      if (bookingResult.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Booking not found' }) }] };
      }

      const booking = bookingResult.rows[0];
      if (booking.payment_status === 'cancelled') {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Booking is already cancelled' }) }] };
      }

      await dbQuery('UPDATE bookings SET payment_status = $1 WHERE id = $2', ['cancelled', bookingId]);

      // Restore participant slots if payment was confirmed
      if (booking.payment_status === 'confirmed' || booking.payment_status === 'paid') {
        await dbQuery(
          'UPDATE outings SET current_participants = current_participants - $1 WHERE id = $2',
          [booking.participants, booking.oid]
        );
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, message: 'Booking cancelled successfully', bookingId }),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 5: generatePass
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'generatePass',
    'Generate a digital QR pass for a confirmed booking',
    {
      bookingId: z.number().describe('Booking ID'),
    },
    async ({ bookingId }) => {
      const bookingResult = await dbQuery(
        `SELECT b.*, o.title, o.location, o.date, o.time, u.name AS user_name, u.email AS user_email
         FROM bookings b
         JOIN outings o ON b.outing_id = o.id
         JOIN users u ON b.user_id = u.id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Booking not found' }) }] };
      }

      const booking = bookingResult.rows[0];
      if (booking.payment_status !== 'confirmed' && booking.payment_status !== 'paid') {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Booking payment not confirmed. Cannot generate pass.' }) }] };
      }

      // Check if pass already exists
      const existingPass = await dbQuery('SELECT * FROM digital_passes WHERE booking_id = $1', [bookingId]);
      if (existingPass.rows.length > 0) {
        const p = existingPass.rows[0];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              passId: p.pass_id,
              boardingStatus: p.boarding_status,
              qrCode: p.qr_code,
              generatedAt: p.generated_at,
              message: 'Pass already exists',
            }, null, 2),
          }],
        };
      }

      // Generate pass
      const passId = `VIBE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const verificationToken = crypto.randomBytes(32).toString('hex');

      let QRCode;
      try {
        QRCode = require('qrcode');
      } catch (_) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'QR code generation unavailable' }) }] };
      }

      const qrData = JSON.stringify({
        passId,
        bookingId,
        userId: booking.user_id,
        outingId: booking.outing_id,
        token: verificationToken,
      });

      const qrCode = await QRCode.toDataURL(qrData);

      await dbQuery(
        `INSERT INTO digital_passes (pass_id, booking_id, user_id, outing_id, qr_code, verification_token)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [passId, bookingId, booking.user_id, booking.outing_id, qrCode, verificationToken]
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            passId,
            tripTitle: booking.title,
            location: booking.location,
            date: booking.date,
            time: booking.time,
            userName: booking.user_name,
            participants: booking.participants,
            qrCode,
            message: 'Digital pass generated successfully',
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 6: verifyPass
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'verifyPass',
    'Verify a digital pass for boarding',
    {
      passId: z.string().describe('Digital pass ID (e.g. VIBE-XXXXXX-XXXXXX)'),
    },
    async ({ passId }) => {
      const passResult = await dbQuery(
        `SELECT dp.*, o.title, o.location, o.date, o.time, u.name AS user_name,
                b.participants, b.participant_names
         FROM digital_passes dp
         JOIN outings o ON dp.outing_id = o.id
         JOIN users u ON dp.user_id = u.id
         JOIN bookings b ON dp.booking_id = b.id
         WHERE dp.pass_id = $1`,
        [passId]
      );

      if (passResult.rows.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Pass not found' }) }] };
      }

      const pass = passResult.rows[0];

      if (pass.boarding_status === 'verified') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: true,
              alreadyVerified: true,
              passId: pass.pass_id,
              userName: pass.user_name,
              tripTitle: pass.title,
              verifiedAt: pass.verification_time,
              message: 'Pass was already verified',
            }),
          }],
        };
      }

      // Mark as verified
      await dbQuery(
        `UPDATE digital_passes SET boarding_status = $1, verification_time = CURRENT_TIMESTAMP WHERE pass_id = $2`,
        ['verified', passId]
      );

      // Log boarding
      await dbQuery(
        `INSERT INTO boarding_logs (pass_id, verification_result) VALUES ($1, $2)`,
        [passId, 'verified']
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: true,
            passId: pass.pass_id,
            userName: pass.user_name,
            tripTitle: pass.title,
            location: pass.location,
            date: pass.date,
            time: pass.time,
            participants: pass.participants,
            participantNames: pass.participant_names,
            message: 'Boarding verified successfully ✓',
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 7: recommendTrips
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'recommendTrips',
    'Get trip recommendations based on budget, mood/vibe, group type, and adventure level',
    {
      budget: z.number().optional().describe('Maximum budget per person in INR'),
      vibe: z.string().optional().describe('Mood/vibe: chill, trekking, party, nature, spiritual, photography, solo'),
      groupType: z.string().optional().describe('Group type: solo, couple, friends, family, team'),
      adventureLevel: z.string().optional().describe('Adventure level: low, medium, high'),
      tripType: z.string().optional().describe('Trip type: one_day or 2d1n'),
    },
    async ({ budget, vibe, groupType, adventureLevel, tripType }) => {
      let sql = `SELECT id, title, location, description, date, time, cost, 
                 max_participants, current_participants, category, trip_type,
                 (max_participants - current_participants) AS slots_left
                 FROM outings WHERE status = 'active' AND (max_participants - current_participants) > 0`;
      const params = [];
      let paramIdx = 1;

      if (budget) {
        sql += ` AND cost <= $${paramIdx}`;
        params.push(budget);
        paramIdx++;
      }
      if (tripType) {
        sql += ` AND trip_type = $${paramIdx}`;
        params.push(tripType);
        paramIdx++;
      }

      sql += ` ORDER BY date ASC`;
      const result = await dbQuery(sql, params);

      let trips = result.rows;

      // Score & filter by vibe/category heuristics
      const vibeToCategory = {
        chill: ['road_trips', 'beaches'],
        trekking: ['mountains', 'adventure'],
        party: ['nightlife', 'festivals'],
        nature: ['mountains', 'beaches', 'road_trips'],
        spiritual: ['mountains'],
        photography: ['mountains', 'road_trips', 'beaches'],
        solo: ['mountains', 'adventure'],
      };

      if (vibe && vibeToCategory[vibe.toLowerCase()]) {
        const categories = vibeToCategory[vibe.toLowerCase()];
        const vibeMatched = trips.filter(t => categories.includes(t.category));
        if (vibeMatched.length > 0) trips = vibeMatched;
      }

      // Adventure level filter
      if (adventureLevel) {
        const adventureCategories = {
          low: ['road_trips', 'beaches', 'festivals'],
          medium: ['mountains'],
          high: ['adventure', 'mountains'],
        };
        const cats = adventureCategories[adventureLevel.toLowerCase()];
        if (cats) {
          const filtered = trips.filter(t => cats.includes(t.category));
          if (filtered.length > 0) trips = filtered;
        }
      }

      // Group type hint (used for descriptive response, not strict filter)
      const recommendations = trips.slice(0, 5).map(t => ({
        id: t.id,
        title: t.title,
        location: t.location,
        description: t.description,
        date: t.date,
        price: t.cost,
        category: t.category,
        tripType: t.trip_type,
        slotsLeft: t.slots_left,
        suitableFor: groupType || 'all',
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: recommendations.length,
            filters: { budget, vibe, groupType, adventureLevel, tripType },
            recommendations,
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 8: registerPartner
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'registerPartner',
    'Submit a partner application for onboarding',
    {
      businessName: z.string().describe('Business/property name'),
      contactName: z.string().describe('Contact person name'),
      email: z.string().email().describe('Contact email'),
      phone: z.string().describe('Contact phone number'),
      propertyType: z.string().describe('Type: hotel, resort, homestay, adventure_park, restaurant, transport'),
      location: z.string().describe('Business location'),
      description: z.string().optional().describe('Business description'),
    },
    async ({ businessName, contactName, email, phone, propertyType, location, description }) => {
      // Check for duplicate application
      const existing = await dbQuery('SELECT id FROM partner_applications WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Application already exists for this email' }) }] };
      }

      const result = await dbQuery(
        `INSERT INTO partner_applications (business_name, contact_name, email, phone, property_type, location, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [businessName, contactName, email, phone, propertyType, location, description || '']
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            applicationId: result.rows[0].id,
            status: 'Pending',
            message: 'Partner application submitted successfully. Our team will review it shortly.',
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 9: getUserTrips
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'getUserTrips',
    'Get all bookings/trip history for a user',
    {
      userId: z.number().describe('User ID'),
    },
    async ({ userId }) => {
      const result = await dbQuery(
        `SELECT b.id AS booking_id, b.participants, b.participant_names, b.total_amount,
                b.payment_status, b.selected_date, b.departure_time, b.created_at,
                o.title, o.location, o.date, o.time, o.cost, o.category, o.trip_type, o.image_url
         FROM bookings b
         JOIN outings o ON b.outing_id = o.id
         WHERE b.user_id = $1
         ORDER BY b.created_at DESC`,
        [userId]
      );

      const trips = result.rows.map(r => ({
        bookingId: r.booking_id,
        tripTitle: r.title,
        location: r.location,
        date: r.date,
        time: r.time,
        participants: r.participants,
        participantNames: r.participant_names,
        totalAmount: r.total_amount,
        paymentStatus: r.payment_status,
        selectedDate: r.selected_date,
        departureTime: r.departure_time,
        category: r.category,
        tripType: r.trip_type,
        bookedAt: r.created_at,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ userId, count: trips.length, trips }, null, 2) }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 10: getAdminStats
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'getAdminStats',
    'Get platform statistics — total users, bookings, revenue, occupancy (admin tool)',
    {},
    async () => {
      const [users, outings, bookings, revenue, occupancy] = await Promise.all([
        dbQuery('SELECT COUNT(*) AS count FROM users'),
        dbQuery('SELECT COUNT(*) AS count FROM outings WHERE status = $1', ['active']),
        dbQuery('SELECT COUNT(*) AS count FROM bookings'),
        dbQuery("SELECT COALESCE(SUM(total_amount), 0) AS total FROM bookings WHERE payment_status IN ('confirmed', 'paid')"),
        dbQuery('SELECT id, title, max_participants, current_participants FROM outings WHERE status = $1', ['active']),
      ]);

      const occupancyData = occupancy.rows.map(o => ({
        id: o.id,
        title: o.title,
        maxParticipants: o.max_participants,
        currentParticipants: o.current_participants,
        occupancyPercent: o.max_participants > 0 ? Math.round((o.current_participants / o.max_participants) * 100) : 0,
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalUsers: parseInt(users.rows[0].count),
            activeOutings: parseInt(outings.rows[0].count),
            totalBookings: parseInt(bookings.rows[0].count),
            totalRevenue: parseInt(revenue.rows[0].total),
            occupancy: occupancyData,
          }, null, 2),
        }],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TOOL 11: notifyUsers
  // ──────────────────────────────────────────────────────────────
  mcp.tool(
    'notifyUsers',
    'Send an in-app notification to a specific user',
    {
      userId: z.number().describe('User ID to notify'),
      title: z.string().describe('Notification title'),
      message: z.string().describe('Notification message'),
      type: z.string().optional().describe('Notification type: general, booking, payment, trip, system'),
    },
    async ({ userId, title, message, type }) => {
      await dbQuery(
        'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)',
        [userId, type || 'general', title, message]
      );

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Notification sent' }) }],
      };
    }
  );

  return mcp;
}

// ─── Mount MCP SSE transport on Express app ─────────────────────
async function mountMcpRoutes(app, dbQuery) {
  await loadMcpSdk();

  const mcp = createMcpServer(dbQuery);

  // Track active SSE transports by session
  const transports = {};

  // SSE endpoint — AI clients connect here
  app.get('/mcp/sse', async (req, res) => {
    const transport = new SSEServerTransport('/mcp/messages', res);
    transports[transport.sessionId] = transport;

    res.on('close', () => {
      delete transports[transport.sessionId];
    });

    await mcp.connect(transport);
  });

  // Message endpoint — AI clients send tool calls here
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];
    if (!transport) {
      return res.status(400).json({ error: 'Invalid or expired session. Reconnect to /mcp/sse' });
    }
    await transport.handlePostMessage(req, res);
  });

  console.log('MCP Server: mounted at /mcp/sse ✓');
}

module.exports = { mountMcpRoutes };
