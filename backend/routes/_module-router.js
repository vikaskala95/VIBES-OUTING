const express = require('express');

function createModuleRouter(moduleName) {
  const router = express.Router();
  router.get('/_health', (_req, res) => {
    res.json({ success: true, module: moduleName, status: 'ok' });
  });
  return router;
}

module.exports = { createModuleRouter };
