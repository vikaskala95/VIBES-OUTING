# 🚀 VERCEL DEPLOYMENT CHECKLIST — Production Outage Recovery

**Status:** Critical - All routes returning NOT_FOUND  
**Root Cause:** Vercel project missing critical configuration settings  
**Fix:** Update Vercel Project Settings per instructions below

---

## ✅ VERCEL PROJECT SETTINGS (REQUIRED)

Go to **https://vercel.com/dashboard** → Select **vibesouting** project → **Settings**

### 1. **Build & Deployment**

Navigate: **Settings → Build & Deployment**

| Setting | Value | Why |
|---------|-------|-----|
| **Framework Preset** | `Other` | Static frontend SPA (no framework build needed) |
| **Build Command** | `npm run build` | Optimizes images in public/ folder |
| **Output Directory** | `public` | ⚠️ **CRITICAL** — Vercel serves from this folder |
| **Install Command** | `npm install` | (leave default) |
| **Node.js Version** | `18.x` or `20.x` | Match package.json engines requirement |

✅ **Apply changes**

### 2. **Environment Variables**

Navigate: **Settings → Environment Variables**

These variables are needed for the frontend to work correctly:

| Key | Value | Scope |
|-----|-------|-------|
| `VITE_API_URL` | `https://vibesouting-production.up.railway.app` | Production |
| `NODE_ENV` | `production` | Production |

> Note: If your frontend code reads environment variables (e.g., for API endpoint configuration), add them here. If hardcoded in index.html, skip this step.

### 3. **Git Settings**

Navigate: **Settings → Git** → **Deploy Hooks / Automatic Deployments**

- ✅ Ensure `automatic deployments` is enabled for your branch
- ✅ Redeploy on every push to ensure latest `public/` files are deployed

### 4. **Domains**

Navigate: **Settings → Domains**

- ✅ Verify `vibesouting.in` is connected and configured
- ✅ Verify `www.vibesouting.in` redirects to `vibesouting.in` (handled by vercel.json)

---

## 🔄 DEPLOYMENT PROCESS

### Step 1: Push Changes

```bash
git add vercel.json package.json .vercelignore
git commit -m "fix: correct Vercel configuration for frontend SPA deployment"
git push origin main
```

Vercel will automatically trigger a new deployment.

### Step 2: Monitor Deployment

1. Go to https://vercel.com/dashboard → `vibesouting` project
2. Click **Deployments** tab
3. Watch for the latest deployment to complete (green checkmark ✅)
4. **Check build logs** if deployment fails:
   - Look for errors in the Build & Development section
   - Common issues:
     - ❌ "Output directory does not exist" → Check `outputDirectory: "public"` in vercel.json
     - ❌ "Build command failed" → Check node_modules installed, optimize-images.js exists
     - ❌ "404 on all routes" → Rewrite rule not matching, check vercel.json syntax

### Step 3: Test Production Routes

After deployment completes, test each route:

```bash
# Using curl or browser:
curl -I https://vibesouting.in/                    # Should return 200
curl -I https://vibesouting.in/outings             # Should return 200 (rewrites to index.html)
curl -I https://vibesouting.in/blogs               # Should return 200 (rewrites to index.html)
curl -I https://vibesouting.in/wallet              # Should return 200 (rewrites to index.html)
curl -I https://vibesouting.in/api/health          # Should proxy to Railway API
```

---

## 🔍 TROUBLESHOOTING

### All Routes Return 404

**Symptom:** Every URL returns NOT_FOUND  
**Debug:** Check vercel.json — Missing `outputDirectory: "public"` or rewrite rule syntax

**Fix:**
```json
{
  "outputDirectory": "public",  // ← MUST be present
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://..." },
    { "source": "/(.*)", "destination": "/index.html" }  // ← SPA fallback
  ]
}
```

### Build Fails: "optimize-images.js not found"

**Debug:** Vercel can't find the build script  
**Fix:** Ensure optimize-images.js exists in root directory:
```bash
ls -la optimize-images.js
```

If missing, restore from git:
```bash
git checkout optimize-images.js
git push
```

### Public Folder Empty

**Symptom:** "Output directory `public` is empty" build error  
**Debug:** Vercel isn't staging files correctly  
**Fix:**
1. Verify `public/index.html` exists locally:
   ```bash
   ls -la public/index.html
   ```
2. Check `.vercelignore` isn't excluding `public/`:
   ```bash
   grep "public" .vercelignore  # Should NOT exclude public/
   ```
3. Force redeploy:
   ```bash
   git push origin $(git rev-parse --abbrev-ref HEAD)
   ```

### API Requests Fail (502/503)

**Symptom:** `/api/*` routes return 502 Bad Gateway  
**Cause:** Railway backend unreachable  
**Debug:**
```bash
# Test API directly:
curl https://vibesouting-production.up.railway.app/api/health
```

**Fix:**
- Verify Railway is running (check https://railway.app dashboard)
- Update Vercel proxy URL if Railway URL changed:
  ```json
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://new-railway-url/api/:path*" }
  ]
  ```

---

## 📋 CHECKLIST FOR SUCCESSFUL DEPLOYMENT

- [ ] `vercel.json` has `outputDirectory: "public"`
- [ ] `vercel.json` has `buildCommand: "npm run build"`
- [ ] `package.json` build script is `node optimize-images.js`
- [ ] `public/index.html` exists
- [ ] `.vercelignore` excludes unnecessary files
- [ ] Vercel Project Settings → Build & Deployment → Output Directory = `public`
- [ ] All routes return HTTP 200:
  - [ ] GET / → 200 (index.html)
  - [ ] GET /outings → 200 (SPA fallback)
  - [ ] GET /blogs → 200 (SPA fallback)
  - [ ] GET /wallet → 200 (SPA fallback)
  - [ ] GET /api/health → 200 (Railway proxy)
- [ ] No "NOT_FOUND" errors
- [ ] No "Output directory does not exist" build errors

---

## 🚨 QUICK REDEPLOY

If issues persist after checklist:

```powershell
# Force redeploy from CLI
npm install -g vercel
vercel deploy --prod --force

# Or via git:
git push origin main --force
```

---

**Last Updated:** 2026-06-15  
**Deployment Type:** Static SPA on Vercel + API proxy to Railway  
**Next Steps:** Monitor vercel.com/dashboard for deployment success
