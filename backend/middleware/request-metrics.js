const { markApiRequest } = require('../services/metrics');

function requestMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    markApiRequest(res.statusCode, durationMs, req.path);
  });
  next();
}

module.exports = {
  requestMetricsMiddleware,
};
