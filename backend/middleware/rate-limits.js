const rateLimit = require('express-rate-limit');

function createLimiter(windowMs, max, message) {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const loginLimiter = createLimiter(15 * 60 * 1000, Number(process.env.LOGIN_RATE_LIMIT || 20), 'Too many login attempts. Try again later.');
const signupLimiter = createLimiter(60 * 60 * 1000, Number(process.env.SIGNUP_RATE_LIMIT || 10), 'Too many signup attempts. Try again later.');
const forgotPasswordLimiter = createLimiter(15 * 60 * 1000, Number(process.env.FORGOT_PASSWORD_RATE_LIMIT || 5), 'Too many password reset requests. Try again later.');
const paymentLimiter = createLimiter(15 * 60 * 1000, Number(process.env.PAYMENT_RATE_LIMIT || 60), 'Too many payment requests. Try again later.');
const walletRechargeLimiter = createLimiter(15 * 60 * 1000, Number(process.env.WALLET_RECHARGE_RATE_LIMIT || 30), 'Too many wallet recharge requests. Try again later.');

module.exports = {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  paymentLimiter,
  walletRechargeLimiter,
};
