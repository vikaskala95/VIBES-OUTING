const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const outingsRoutes = require('./outings.routes');
const bookingsRoutes = require('./bookings.routes');
const walletRoutes = require('./wallet.routes');
const notificationsRoutes = require('./notifications.routes');
const blogsRoutes = require('./blogs.routes');
const wishlistRoutes = require('./wishlist.routes');
const galleryRoutes = require('./gallery.routes');
const adminRoutes = require('./admin.routes');

function mountModularRoutes(app) {
  const router = express.Router();

  router.use('/auth', authRoutes);
  router.use('/users', usersRoutes);
  router.use('/outings', outingsRoutes);
  router.use('/bookings', bookingsRoutes);
  router.use('/wallet', walletRoutes);
  router.use('/notifications', notificationsRoutes);
  router.use('/blogs', blogsRoutes);
  router.use('/wishlist', wishlistRoutes);
  router.use('/gallery', galleryRoutes);
  router.use('/admin', adminRoutes);

  app.use('/api/modular', router);
}

module.exports = {
  mountModularRoutes,
};
