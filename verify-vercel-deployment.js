#!/usr/bin/env node

/**
 * 🔍 Vercel Deployment Verification Script
 * 
 * Checks if all critical routes return HTTP 200
 * Tests both frontend SPA routes and API proxy
 * 
 * Usage: node verify-vercel-deployment.js [domain]
 * Example: node verify-vercel-deployment.js https://vibesouting.in
 */

const https = require('https');
const http = require('http');

const DOMAIN = process.argv[2] || 'https://vibesouting.in';
const TESTS = [
  { path: '/', name: 'Home (index.html)', expectedStatus: 200 },
  { path: '/outings', name: 'Outings SPA route', expectedStatus: 200 },
  { path: '/outings/nonexistent', name: 'Outings detail (SPA fallback)', expectedStatus: 200 },
  { path: '/blogs', name: 'Blogs SPA route', expectedStatus: 200 },
  { path: '/wallet', name: 'Wallet SPA route', expectedStatus: 200 },
  { path: '/dashboard', name: 'Dashboard SPA route', expectedStatus: 200 },
  { path: '/api/health', name: 'API health check (Railway proxy)', expectedStatus: 200 },
  { path: '/api/public-stats', name: 'API stats endpoint', expectedStatus: [200, 401, 403] },
  { path: '/nonexistent-api', name: 'Non-existent API (should rewrite to index.html)', expectedStatus: 200 },
];

const results = {
  passed: 0,
  failed: 0,
  errors: [],
};

async function testRoute(url, expectedStatuses) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { timeout: 5000 }, (res) => {
      const isExpected = expectedStatuses.includes(res.statusCode);
      const status = isExpected ? '✅' : '❌';
      
      console.log(`${status} ${res.statusCode} — ${url}`);
      
      if (!isExpected) {
        results.errors.push({
          url,
          statusCode: res.statusCode,
          expected: expectedStatuses,
        });
        results.failed++;
      } else {
        results.passed++;
      }
      
      // Consume response data
      res.on('data', () => {});
      res.on('end', () => resolve());
    }).on('error', (err) => {
      console.log(`❌ ERROR — ${url}: ${err.message}`);
      results.errors.push({
        url,
        error: err.message,
      });
      results.failed++;
      resolve();
    });
  });
}

async function runTests() {
  console.log(`\n🧪 Vercel Deployment Verification\n`);
  console.log(`Domain: ${DOMAIN}\n`);
  console.log(`Testing ${TESTS.length} routes...\n`);
  
  for (const test of TESTS) {
    const url = `${DOMAIN}${test.path}`;
    const expected = Array.isArray(test.expectedStatus) ? test.expectedStatus : [test.expectedStatus];
    
    console.log(`\n→ ${test.name}`);
    await testRoute(url, expected);
  }
  
  console.log(`\n${'='.repeat(50)}\n`);
  console.log(`SUMMARY:`);
  console.log(`✅ Passed: ${results.passed}/${TESTS.length}`);
  console.log(`❌ Failed: ${results.failed}/${TESTS.length}\n`);
  
  if (results.errors.length > 0) {
    console.log(`FAILURES:\n`);
    results.errors.forEach((err, idx) => {
      if (err.error) {
        console.log(`${idx + 1}. ${err.url}`);
        console.log(`   Error: ${err.error}\n`);
      } else {
        console.log(`${idx + 1}. ${err.url}`);
        console.log(`   Expected: ${err.expected.join(' or ')}`);
        console.log(`   Got: ${err.statusCode}\n`);
      }
    });
    process.exit(1);
  } else {
    console.log(`🎉 All tests passed! Deployment looks healthy.\n`);
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
