require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── RAZORPAY SETUP ─────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_REPLACE',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE',
});
console.log('Razorpay Key:', process.env.RAZORPAY_KEY_ID ? 'Loaded ✓' : '⚠ Not set — update .env file');

// ─── EMAIL SETUP ────────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});
const emailEnabled = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
console.log('Email:', emailEnabled ? 'Configured ✓' : '⚠ Not set — add SMTP_USER/SMTP_PASS to .env');

async function sendBookingEmail(userEmail, userName, outingTitle, outingDate, outingLocation, amount, paymentId) {
  if (!emailEnabled) return console.log('📧 Email skipped (not configured). Would send to:', userEmail);
  try {
    await emailTransporter.sendMail({
      from: `"VIBES@Outing" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: `✅ Booking Confirmed — ${outingTitle}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;font-size:24px">🎉 Booking Confirmed!</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Your VIBES@Outing is locked in! 🔥</p>
            <div style="background:#F8FAFC;padding:16px;border-radius:8px;margin:16px 0">
              <p style="margin:4px 0"><strong>🗓 Outing:</strong> ${outingTitle}</p>
              <p style="margin:4px 0"><strong>📍 Location:</strong> ${outingLocation}</p>
              <p style="margin:4px 0"><strong>📅 Date:</strong> ${outingDate}</p>
              <p style="margin:4px 0"><strong>💰 Amount:</strong> ₹${amount}</p>
              <p style="margin:4px 0"><strong>🔑 Payment ID:</strong> ${paymentId}</p>
            </div>
            <p style="color:#64748B;font-size:14px">See you there! 🚀<br>— Team VIBES@Outing</p>
          </div>
        </div>
      `
    });
    console.log('📧 Booking email sent to:', userEmail);
  } catch (err) { console.error('Email error:', err.message); }
}

function getWhatsAppLink(phone, outingTitle, outingDate, outingLocation, amount) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const msg = encodeURIComponent(`🎉 *VIBES@Outing — Booking Confirmed!*\n\n🗓 *${outingTitle}*\n📍 ${outingLocation}\n📅 ${outingDate}\n💰 ₹${amount}\n\nSee you there! 🚀`);
  return cleanPhone ? `https://wa.me/91${cleanPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

// ─── DATABASE SETUP ─────────────────────────────────────────────
const db = new Database('furzi.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT NOT NULL,
    interests TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS outings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    image_url TEXT DEFAULT '',
    date TEXT NOT NULL,
    time TEXT DEFAULT '10:00 AM',
    cost INTEGER NOT NULL,
    max_participants INTEGER DEFAULT 20,
    current_participants INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    outing_id INTEGER NOT NULL,
    participants INTEGER DEFAULT 1,
    participant_names TEXT DEFAULT '',
    total_amount INTEGER NOT NULL,
    payment_status TEXT DEFAULT 'pending',
    payment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (outing_id) REFERENCES outings(id)
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    budget TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    outing_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (outing_id) REFERENCES outings(id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outing_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outing_id) REFERENCES outings(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS id_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    id_type TEXT NOT NULL,
    id_number TEXT NOT NULL,
    full_name TEXT NOT NULL,
    emergency_contact TEXT DEFAULT '',
    emergency_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Seed admin + sample data
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@furzi.com');
if (!adminExists) {
  db.prepare('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)').run(
    'Admin', 'admin@furzi.com', '9999999999', 'admin123', 'admin'
  );

  const sampleOutings = [
    { title: '🌄 Nandi Hills Sunrise Vibes', location: 'Nandi Hills', description: 'Pickup from Bangalore at 4 AM → chase the sunrise, aesthetic pics, and chill breakfast at a hilltop cafe. High-end Resort + Private Cab from Bangalore included. Perfect GenZ weekend escape!', date: '2026-05-10', time: '4:00 AM', cost: 2999, max: 25, img: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600' },
    { title: '🏞️ Bheemeshwari Adventure Day', location: 'Bheemeshwari', description: 'Starts from Bangalore → Kayaking, coracle ride, zipline & bonfire by the river. One epic day trip with High-end Resort + Private Cab from Bangalore. No boring stuff, only vibes!', date: '2026-05-17', time: '6:00 AM', cost: 4999, max: 20, img: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600' },
    { title: '⛰️ Chikmagalur Coffee & Chill (2D/1N)', location: 'Chikmagalur', description: 'Pickup from Bangalore → 2-day getaway — Mullayanagiri trek, coffee plantation tour, campfire & stargazing. High-end Resort + Private Cab from Bangalore. Peak aesthetic energy.', date: '2026-05-24', time: '6:00 AM', cost: 12999, max: 20, img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600' },
    { title: '🏰 Mysore Royal Day Out', location: 'Mysore', description: 'Starts from Bangalore → Palace visit, Chamundi Hills, street food crawl & Brindavan Gardens light show. One iconic day with High-end Resort + Private Cab from Bangalore.', date: '2026-06-07', time: '7:00 AM', cost: 1999, max: 30, img: 'https://images.unsplash.com/photo-1567337710282-00832b415979?w=600' },
    { title: '🌿 Ooty Mountain Escape (2D/1N)', location: 'Ooty', description: 'Pickup from Bangalore → Toy train, botanical gardens, lake boating & cozy resort stay. 2-day trip with High-end Resort + Private Cab from Bangalore. Main character energy guaranteed.', date: '2026-06-14', time: '5:00 AM', cost: 9999, max: 20, img: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=600' },
    { title: '☕ Coorg Rainforest Retreat (2D/1N)', location: 'Coorg', description: 'Starts from Bangalore → Abbey Falls, Raja Seat sunset, coffee trail & private villa stay. 2-day trip with High-end Resort + Private Cab from Bangalore. Touch grass, literally.', date: '2026-06-21', time: '6:00 AM', cost: 10999, max: 20, img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600' },
    { title: '🌊 Wayanad Wild Weekend (2D/1N)', location: 'Wayanad', description: 'Pickup from Bangalore → Edakkal Caves, bamboo rafting, Banasura dam & treehouse stay. 2-day trip with High-end Resort + Private Cab from Bangalore. Nature but make it aesthetic.', date: '2026-06-28', time: '5:00 AM', cost: 10999, max: 20, img: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600' },
    { title: '🏜️ Gandikota Grand Canyon (2D/1N)', location: 'Gandikota', description: 'Starts from Bangalore → India\'s Grand Canyon — cliff camping, Pennar river, fort ruins & astrophotography. 2-day trip with High-end Resort + Private Cab from Bangalore. Underrated gem!', date: '2026-07-05', time: '5:00 AM', cost: 10999, max: 20, img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600' },
    { title: '🛕 Lepakshi Heritage & Vibes', location: 'Lepakshi', description: 'Pickup from Bangalore → Hanging Pillar temple, Nandi bull statue, mural art & local food. One day cultural trip with High-end Resort + Private Cab from Bangalore. History but cool.', date: '2026-07-12', time: '7:00 AM', cost: 5999, max: 25, img: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600' },
    { title: '🌲 Sakleshpur Green Route Trek', location: 'Sakleshpur', description: 'Starts from Bangalore → Railway track trek, waterfall dip, homestay & campfire. High-end Resort + Private Cab from Bangalore. The most Insta-worthy trek near Bangalore!', date: '2026-07-19', time: '5:00 AM', cost: 9999, max: 20, img: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600' },
    { title: '🏖️ Goa Beach Blowout (2D/1N)', location: 'Goa', description: 'Fly from Bangalore → Beach hopping, water sports, sunset parties, night market crawl & seafood feast. 2-day trip with High-end Resort + Private Cab in Goa. The ultimate GenZ getaway. No FOMO!', date: '2026-07-26', time: '6:00 AM', cost: 11999, max: 25, img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600' },
  ];

  const ins = db.prepare('INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, created_by) VALUES (?,?,?,?,?,?,?,?,1)');
  for (const o of sampleOutings) ins.run(o.title, o.location, o.description, o.date, o.time, o.cost, o.max, o.img);
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────
app.post('/api/auth/signup', (req, res) => {
  const { name, email, phone, password, interests } = req.body;
  try {
    const result = db.prepare('INSERT INTO users (name, email, phone, password, interests) VALUES (?,?,?,?,?)').run(name, email, phone || '', password, interests || '');
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, user });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Email already exists' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE email = ? AND password = ?').get(email, password);
  if (user) res.json({ success: true, user });
  else res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// ─── OUTING ROUTES ──────────────────────────────────────────────
app.get('/api/outings', (req, res) => {
  const outings = db.prepare('SELECT * FROM outings WHERE status = ? ORDER BY date ASC').all('active');
  res.json(outings);
});

app.get('/api/outings/:id', (req, res) => {
  const outing = db.prepare('SELECT * FROM outings WHERE id = ?').get(req.params.id);
  if (outing) res.json(outing);
  else res.status(404).json({ message: 'Not found' });
});

app.post('/api/outings', (req, res) => {
  const { title, location, description, date, time, cost, max_participants, image_url } = req.body;
  const result = db.prepare('INSERT INTO outings (title, location, description, date, time, cost, max_participants, image_url, created_by) VALUES (?,?,?,?,?,?,?,?,1)').run(title, location, description, date, time || '10:00 AM', cost, max_participants || 20, image_url || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/outings/:id', (req, res) => {
  const { title, location, description, date, time, cost, max_participants, image_url, status } = req.body;
  db.prepare('UPDATE outings SET title=?, location=?, description=?, date=?, time=?, cost=?, max_participants=?, image_url=?, status=? WHERE id=?').run(title, location, description, date, time, cost, max_participants, image_url, status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/outings/:id', (req, res) => {
  db.prepare('DELETE FROM outings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── BOOKING ROUTES (RAZORPAY INTEGRATED) ───────────────────────
// Step 1: Create Razorpay order
app.post('/api/bookings/create-order', async (req, res) => {
  const { user_id, outing_id, participants, participant_names } = req.body;
  const outing = db.prepare('SELECT * FROM outings WHERE id = ?').get(outing_id);
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }
  const totalAmount = outing.cost * participants;
  try {
    const order = await razorpay.orders.create({
      amount: totalAmount * 100, // Razorpay uses paise
      currency: 'INR',
      receipt: 'outing_' + outing_id + '_' + Date.now(),
      notes: { user_id: String(user_id), outing_id: String(outing_id), participants: String(participants) }
    });
    // Save booking as pending
    const result = db.prepare('INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, payment_status, payment_id) VALUES (?,?,?,?,?,?,?)').run(user_id, outing_id, participants, participant_names || '', totalAmount, 'pending', order.id);
    res.json({ success: true, order_id: order.id, booking_id: result.lastInsertRowid, amount: totalAmount, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Razorpay order error:', err);
    res.status(500).json({ message: 'Payment gateway error. Check your Razorpay API keys in .env file.' });
  }
});

// Step 2: Verify payment after Razorpay checkout
app.post('/api/bookings/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;
  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'REPLACE')
    .update(body).digest('hex');

  if (expectedSignature === razorpay_signature) {
    // Payment verified — update booking
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id);
    db.prepare('UPDATE bookings SET payment_status = ?, payment_id = ? WHERE id = ?').run('paid', razorpay_payment_id, booking_id);
    db.prepare('UPDATE outings SET current_participants = current_participants + ? WHERE id = ?').run(booking.participants, booking.outing_id);
    // Send email & generate WhatsApp link
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.user_id);
    const outing = db.prepare('SELECT * FROM outings WHERE id = ?').get(booking.outing_id);
    if (user && outing) {
      sendBookingEmail(user.email, user.name, outing.title, outing.date, outing.location, booking.total_amount, razorpay_payment_id);
    }
    const whatsappLink = (user && outing) ? getWhatsAppLink(user.phone, outing.title, outing.date, outing.location, booking.total_amount) : '';
    res.json({ success: true, payment_id: razorpay_payment_id, whatsapp_link: whatsappLink });
  } else {
    db.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').run('failed', booking_id);
    res.status(400).json({ success: false, message: 'Payment verification failed' });
  }
});

// Fallback: direct booking without Razorpay (for testing if keys not set)
app.post('/api/bookings', (req, res) => {
  const { user_id, outing_id, participants, participant_names, total_amount } = req.body;
  const outing = db.prepare('SELECT * FROM outings WHERE id = ?').get(outing_id);
  if (!outing) return res.status(404).json({ message: 'Outing not found' });
  if (outing.current_participants + participants > outing.max_participants) {
    return res.status(400).json({ message: 'Not enough spots available' });
  }
  const paymentId = 'pay_demo_' + crypto.randomBytes(8).toString('hex');
  const result = db.prepare('INSERT INTO bookings (user_id, outing_id, participants, participant_names, total_amount, payment_status, payment_id) VALUES (?,?,?,?,?,?,?)').run(user_id, outing_id, participants, participant_names || '', total_amount, 'paid', paymentId);
  db.prepare('UPDATE outings SET current_participants = current_participants + ? WHERE id = ?').run(participants, outing_id);
  res.json({ success: true, booking_id: result.lastInsertRowid, payment_id: paymentId });
});

app.get('/api/bookings/:userId', (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, o.title, o.location, o.date, o.time, o.image_url
    FROM bookings b JOIN outings o ON b.outing_id = o.id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.params.userId);
  res.json(bookings);
});

// ─── SUGGESTION ROUTES ──────────────────────────────────────────
// Get Razorpay key for frontend
app.get('/api/razorpay-key', (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID || '' });
});
app.post('/api/suggestions', (req, res) => {
  const { user_id, title, location, description, budget } = req.body;
  db.prepare('INSERT INTO suggestions (user_id, title, location, description, budget) VALUES (?,?,?,?,?)').run(user_id, title, location, description, budget);
  res.json({ success: true });
});

app.get('/api/suggestions', (req, res) => {
  const suggestions = db.prepare('SELECT s.*, u.name as user_name FROM suggestions s JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC').all();
  res.json(suggestions);
});

app.put('/api/suggestions/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ─── ADMIN ROUTES ───────────────────────────────────────────────
app.get('/api/admin/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('user');
  const outings = db.prepare('SELECT COUNT(*) as count FROM outings').get();
  const bookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get();
  const revenue = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE payment_status = ?').get('paid');
  const pendingSuggestions = db.prepare('SELECT COUNT(*) as count FROM suggestions WHERE status = ?').get('pending');
  const pendingVerifications = db.prepare('SELECT COUNT(*) as count FROM id_verifications WHERE status = ?').get('pending');
  const totalReviews = db.prepare('SELECT COUNT(*) as count FROM reviews').get();
  res.json({ users: users.count, outings: outings.count, bookings: bookings.count, revenue: revenue.total, pendingSuggestions: pendingSuggestions.count, pendingVerifications: pendingVerifications.count, totalReviews: totalReviews.count });
});

app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, phone, interests, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.get('/api/admin/bookings', (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, u.name as user_name, u.email as user_email, o.title as outing_title
    FROM bookings b JOIN users u ON b.user_id = u.id JOIN outings o ON b.outing_id = o.id
    ORDER BY b.created_at DESC
  `).all();
  res.json(bookings);
});

// ─── SPA FALLBACK ───────────────────────────────────────────────

// ─── REVIEW ROUTES ──────────────────────────────────────────────
app.post('/api/reviews', (req, res) => {
  const { user_id, outing_id, rating, comment } = req.body;
  const existing = db.prepare('SELECT id FROM reviews WHERE user_id = ? AND outing_id = ?').get(user_id, outing_id);
  if (existing) return res.status(400).json({ message: 'You already reviewed this outing' });
  const hasBooked = db.prepare('SELECT id FROM bookings WHERE user_id = ? AND outing_id = ? AND payment_status = ?').get(user_id, outing_id, 'paid');
  if (!hasBooked) return res.status(403).json({ message: 'You must book this outing before reviewing' });
  db.prepare('INSERT INTO reviews (user_id, outing_id, rating, comment) VALUES (?,?,?,?)').run(user_id, outing_id, rating, comment || '');
  res.json({ success: true });
});

app.get('/api/reviews/:outingId', (req, res) => {
  const reviews = db.prepare('SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.outing_id = ? ORDER BY r.created_at DESC').all(req.params.outingId);
  const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE outing_id = ?').get(req.params.outingId);
  res.json({ reviews, average: Math.round((avg.avg || 0) * 10) / 10, count: avg.count });
});

// ─── CHAT ROUTES ────────────────────────────────────────────────
app.get('/api/chat/:outingId', (req, res) => {
  const messages = db.prepare('SELECT c.*, u.name as user_name FROM chat_messages c JOIN users u ON c.user_id = u.id WHERE c.outing_id = ? ORDER BY c.created_at ASC').all(req.params.outingId);
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { outing_id, user_id, message } = req.body;
  const hasBooked = db.prepare('SELECT id FROM bookings WHERE user_id = ? AND outing_id = ? AND payment_status = ?').get(user_id, outing_id, 'paid');
  if (!hasBooked) return res.status(403).json({ message: 'Only booked participants can chat' });
  db.prepare('INSERT INTO chat_messages (outing_id, user_id, message) VALUES (?,?,?)').run(outing_id, user_id, message);
  res.json({ success: true });
});

// ─── ID VERIFICATION ROUTES ─────────────────────────────────────
app.post('/api/verify-id', (req, res) => {
  const { user_id, id_type, id_number, full_name, emergency_contact, emergency_name } = req.body;
  try {
    db.prepare('INSERT OR REPLACE INTO id_verifications (user_id, id_type, id_number, full_name, emergency_contact, emergency_name, status, submitted_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(user_id, id_type, id_number, full_name, emergency_contact || '', emergency_name || '', 'pending');
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ message: 'Verification submission failed' });
  }
});

app.get('/api/verify-id/:userId', (req, res) => {
  const v = db.prepare('SELECT * FROM id_verifications WHERE user_id = ?').get(req.params.userId);
  res.json(v || { status: 'none' });
});

app.get('/api/admin/verifications', (req, res) => {
  const verifications = db.prepare('SELECT v.*, u.name as user_name, u.email FROM id_verifications v JOIN users u ON v.user_id = u.id ORDER BY v.submitted_at DESC').all();
  res.json(verifications);
});

app.put('/api/admin/verifications/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE id_verifications SET status = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ─── AI RECOMMENDATION ROUTE ────────────────────────────────────
app.get('/api/recommendations/:userId', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.json([]);
  const userInterests = (user.interests || '').toLowerCase().split(',').map(i => i.trim()).filter(Boolean);
  const bookedOutingIds = db.prepare('SELECT outing_id FROM bookings WHERE user_id = ? AND payment_status = ?').all(req.params.userId, 'paid').map(b => b.outing_id);
  const allOutings = db.prepare('SELECT * FROM outings WHERE status = ? ORDER BY date ASC').all('active');

  const scored = allOutings
    .filter(o => !bookedOutingIds.includes(o.id))
    .map(o => {
      let score = 0;
      const desc = ((o.description || '') + ' ' + o.title + ' ' + o.location).toLowerCase();
      // Interest matching
      userInterests.forEach(interest => { if (desc.includes(interest)) score += 30; });
      // Location-based: boost outings in locations user has visited
      const bookedLocations = db.prepare('SELECT DISTINCT o.location FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = ? AND b.payment_status = ?').all(req.params.userId, 'paid').map(r => r.location.toLowerCase());
      if (bookedLocations.includes(o.location.toLowerCase())) score += 15;
      // Budget preference: get avg spend
      const avgSpend = db.prepare('SELECT AVG(o.cost) as avg FROM bookings b JOIN outings o ON b.outing_id = o.id WHERE b.user_id = ? AND b.payment_status = ?').get(req.params.userId, 'paid');
      if (avgSpend.avg) { const diff = Math.abs(o.cost - avgSpend.avg); if (diff < 200) score += 20; else if (diff < 500) score += 10; }
      // Popularity bonus
      score += Math.min(o.current_participants * 2, 20);
      // Date proximity bonus (upcoming preferred)
      const daysAway = (new Date(o.date) - new Date()) / (1000*60*60*24);
      if (daysAway > 0 && daysAway < 30) score += 15;
      else if (daysAway > 0 && daysAway < 60) score += 8;
      // Review rating bonus
      const review = db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE outing_id = ?').get(o.id);
      if (review.avg) score += review.avg * 5;
      return { ...o, score, matchReasons: getMatchReasons(o, userInterests, bookedLocations, avgSpend.avg) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  res.json(scored);
});

function getMatchReasons(outing, interests, bookedLocations, avgBudget) {
  const reasons = [];
  const desc = ((outing.description || '') + ' ' + outing.title + ' ' + outing.location).toLowerCase();
  interests.forEach(i => { if (desc.includes(i)) reasons.push(`Matches your interest: ${i}`); });
  if (bookedLocations.includes(outing.location.toLowerCase())) reasons.push(`You've enjoyed ${outing.location} before`);
  if (avgBudget && Math.abs(outing.cost - avgBudget) < 200) reasons.push('Fits your budget range');
  if (outing.current_participants > 5) reasons.push('Popular with others');
  if (reasons.length === 0) reasons.push('Trending outing');
  return reasons;
}

// ─── WHATSAPP LINK ROUTE ────────────────────────────────────────
app.post('/api/whatsapp-link', (req, res) => {
  const { phone, outing_title, outing_date, outing_location, amount } = req.body;
  const link = getWhatsAppLink(phone, outing_title, outing_date, outing_location, amount);
  res.json({ link });
});

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ success: true }); // Don't reveal if email exists
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, expiresAt);
  if (emailEnabled) {
    const resetUrl = `${process.env.PASSWORD_RESET_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    try {
      await emailTransporter.sendMail({
        from: `"VIBES@Outing" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Reset your VIBES@Outing password',
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#6C3CE1,#8B5CF6);color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="margin:0;font-size:24px">🔑 Password Reset</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>We received a request to reset your password for VIBES@Outing.</p>
            <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#6C3CE1;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a></p>
            <p style="color:#64748B;font-size:14px">This link is valid for 30 minutes. If you didn't request this, just ignore this email.</p>
          </div>
        </div>`
      });
      console.log('📧 Password reset email sent to:', email);
    } catch (err) { console.error('Email error:', err.message); }
  } else {
    console.log('📧 Password reset email skipped (not configured). Token:', token);
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!reset) return res.status(400).json({ success: false, message: 'Invalid or expired token' });
  if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(password, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  res.json({ success: true });
});

// ─── SPA FALLBACK & START ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 VIBES@Outing Platform running at http://localhost:${PORT}\n`);
  console.log(`   Admin Login: admin@furzi.com / admin123\n`);
});
