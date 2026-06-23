# Navigation & Routing Instability: Root Cause Analysis & Fix Report

## Executive Summary
Users experience unexpected navigation to the home page after clicking wallet, dashboard, notifications, blogs, wishlist, gallery, or other pages. The page opens briefly (1-2 seconds), then auto-redirects back to outings/home. This document outlines root causes, fixes, and regression tests.

---

## Root Causes Identified

### 1. **Race Condition in `navigate()` and `navigateToOuting()` (CRITICAL)**
**Location**: `public/index.html` lines 1750-1815

**Issue**:
```javascript
async function navigate(page, skipHistory) {
  if (_navigating && !skipHistory) {
    console.warn('[NAV] Blocked concurrent navigate to:', page);
    return;
  }
  _navigating = true;
  try {
    await _navigateInternal(page, skipHistory);
  } finally {
    _navigating = false;  // ← Set AFTER internal navigation
  }
}

async function navigateToOuting(outingRef, skipHistory) {
  // ...
  const outing = await api(...); // ← API call
  if (!outing || !outing.slug) {
    toast(...);
    return navigate('outings', !!skipHistory);  // ← Called HERE
  }
  return navigate('outing-slug:' + outing.slug, !!skipHistory); // ← AND HERE
}
```

**Problem**: 
- `navigateToOuting()` is called from `_navigateInternal()` while `_navigating = true`
- It then calls `navigate()` recursively, which:
  - Sees `_navigating = true` and returns immediately (blocked!)
  - OR proceeds and starts a nested render
- After the async API call completes, the outer `navigate()` finishes its render
- Both renders fight over the DOM → page jittering/flickering
- Timing races cause the wrong render to win

**Impact**: HIGH - Direct cause of page redirect/instability

---

### 2. **Popstate Handler Race Condition (HIGH)**
**Location**: `public/index.html` line 1165

**Issue**:
```javascript
window.addEventListener('popstate', (e) => {
  const page = (e.state && e.state.page) ? e.state.page : resolvePageFromUrl();
  currentPage = page;
  navigate(page, true);  // ← No guard against concurrent navigate
});
```

**Problem**:
- Back/forward button clicks trigger popstate
- If a `navigate()` is already in progress, this queues another `navigate()` immediately
- The `skipHistory=true` parameter doesn't prevent DOM mutation races
- Browser fast-clicks on back button cause multiple concurrent navigations

**Impact**: HIGH - Causes instability when user rapidly clicks back/forward

---

### 3. **API Response Race Condition (MEDIUM)**
**Location**: `public/index.html` lines 1210-1340 (renderHome, renderOutings, etc.)

**Issue**:
```javascript
async function renderHome(app) {
  const [outingsData, statsData, blogsData] = await Promise.all([
    api('/outings', { cacheTtl: 60000 }),  // Slow API
    api('/public-stats', { cacheTtl: 60000 }),
    api('/blogs?featured=1', { cacheTtl: 60000 })
  ]);
  
  app.innerHTML = `...`; // ← DOM mutation here
}
```

**Problem**:
- Multiple parallel API requests with different response times
- If a new `navigate()` is called while `renderHome()` awaits:
  - Old API response completes AFTER new navigation starts
  - Old response mutates the DOM of the NEW page
  - User sees incorrect content briefly before render completes

**Impact**: MEDIUM - Causes visual glitches and stale data display

---

### 4. **Page State Not Validated After Navigation (MEDIUM)**
**Location**: `public/index.html` line 1755

**Issue**:
```javascript
currentPage = page;
const app = document.getElementById('app');
cleanupHeroSlider();

// Browser history support
if (!skipHistory) {
  if (page === 'home') history.pushState({ page }, '', '/');
  else if (page === 'outings') history.pushState({ page }, '', '/outings');
  // ...
}

// Show loading spinner
app.innerHTML = '<div class="loading-spinner"></div>';
```

**Problem**:
- `currentPage` is updated immediately without validation
- URL is changed via `pushState()` BEFORE the page is fully rendered
- If render fails/is aborted, the URL is wrong but app state is incomplete
- No mechanism to validate that the rendered page matches `currentPage`

**Impact**: MEDIUM - Contributes to redirect issues when render fails mid-stream

---

### 5. **Missing Request Cancellation for Old Renders (MEDIUM)**
**Location**: No AbortController for render-level operations

**Issue**:
```javascript
async function renderOutingDetailBySlug(app, slug) {
  const outing = await api('/outings/by-slug/' + encodeURIComponent(safeSlug));
  
  // If navigate() is called here, previous render continues
  // Its API response mutates the DOM below
  
  await renderOutingDetail(app, outing.id, outing);
}
```

**Problem**:
- No way to cancel old render's API requests when user navigates away
- Each render function independently awaits API calls
- Old API responses complete and mutate DOM even after new navigation

**Impact**: MEDIUM - Causes stale data and visual corruption

---

### 6. **Service Worker Still Active in Some Browsers (LOW)**
**Location**: `public/sw.js`

**Issue**: 
- The kill-switch SW in `sw.js` is well-designed but:
  - Doesn't guarantee immediate unregistration on first run
  - Some old browsers don't support `self.registration.unregister()`
  - Cached pages might persist in offline-capable browsers

**Problem**:
- Returning users might still have stale SW serving old code
- The old code had bugs that caused 401 → logout() → navigate('home')

**Impact**: LOW - Previous issue, mostly mitigated by current kill-switch

---

## Required Fixes

### Fix #1: Prevent Nested navigate() Calls (CRITICAL)
**Strategy**: Use a navigation queue system instead of a simple flag

```javascript
// NEW: Navigation queue
let _navigationQueue = [];
let _activeNavigation = null;

async function navigate(page, skipHistory) {
  return new Promise((resolve) => {
    _navigationQueue.push({ page, skipHistory, resolve });
    if (!_activeNavigation) {
      _processNavigationQueue();
    }
  });
}

async function _processNavigationQueue() {
  while (_navigationQueue.length > 0) {
    const { page, skipHistory, resolve } = _navigationQueue.shift();
    _activeNavigation = { page, timestamp: Date.now() };
    
    try {
      await _navigateInternal(page, skipHistory);
      resolve();
    } catch (err) {
      console.error('[NAV] Error:', err);
      resolve();
    } finally {
      _activeNavigation = null;
    }
  }
}

// navigateToOuting MUST NOT call navigate() while already navigating
async function navigateToOuting(outingRef, skipHistory) {
  // This function is called from WITHIN navigate()
  // It should resolve the outing and return the final page, not call navigate()
  
  if (typeof outingRef === 'string' && !/^\d+$/.test(outingRef)) {
    const slug = normalizeSlug(outingRef);
    if (!slug) return null;
    return 'outing-slug:' + slug;  // Return, don't navigate
  }

  const outingId = parseInt(outingRef, 10);
  if (!outingId) return null;
  const outing = await api('/outings/' + outingId, { showToast: false });
  if (!outing || !outing.slug) {
    toast('Outing not found', 'error');
    return 'outings';  // Return fallback page
  }
  return 'outing-slug:' + outing.slug;  // Return the resolved page
}
```

---

### Fix #2: Render Request Cancellation
**Strategy**: Add AbortController to each render to cancel stale API calls

```javascript
let _currentRenderController = null;

async function _navigateInternal(page, skipHistory) {
  // Cancel any in-flight render
  if (_currentRenderController) {
    _currentRenderController.abort();
  }
  
  _currentRenderController = new AbortController();
  const renderSignal = _currentRenderController.signal;

  currentPage = page;
  const app = document.getElementById('app');
  
  // ... update URL ...
  
  app.innerHTML = '<div class="loading-spinner"></div>';

  // Check if this render was cancelled before proceeding
  if (renderSignal.aborted) {
    _currentRenderController = null;
    return;
  }

  // Pass signal to all render functions
  if (page === 'home') await renderHome(app, renderSignal);
  else if (page === 'outings') await renderOutings(app, renderSignal);
  // ... etc ...

  _currentRenderController = null;
}

// Update render functions to accept signal parameter
async function renderHome(app, signal) {
  const [outingsData, statsData, blogsData] = await Promise.all([
    api('/outings', { cacheTtl: 60000, signal }),
    api('/public-stats', { cacheTtl: 60000, signal }),
    api('/blogs?featured=1', { cacheTtl: 60000, signal })
  ]);

  // Check if cancelled before mutating DOM
  if (signal.aborted) return;

  app.innerHTML = `...`;
}
```

---

### Fix #3: Popstate Queue Handler
**Strategy**: Queue popstate events instead of calling navigate directly

```javascript
let _popstateQueue = [];
let _processingPopstate = false;

window.addEventListener('popstate', (e) => {
  const page = (e.state && e.state.page) ? e.state.page : resolvePageFromUrl();
  
  _popstateQueue.push({ page, state: e.state });
  
  if (!_processingPopstate) {
    _processPopstateQueue();
  }
});

async function _processPopstateQueue() {
  _processingPopstate = true;
  
  while (_popstateQueue.length > 0) {
    const { page, state } = _popstateQueue.shift();
    currentPage = page;
    
    // await navigate with skipHistory=true to prevent pushing new history
    await navigate(page, true);
  }
  
  _processingPopstate = false;
  
  // Process any new events added while we were processing
  if (_popstateQueue.length > 0) {
    _processPopstateQueue();
  }
}
```

---

### Fix #4: Validate Page Render Completion
**Strategy**: Add render state tracking and validation

```javascript
let _renderState = {
  currentPage: null,
  isRendering: false,
  renderError: null
};

async function _navigateInternal(page, skipHistory) {
  _renderState.isRendering = true;
  _renderState.currentPage = page;
  _renderState.renderError = null;

  try {
    // ... rest of navigation ...
    
    _renderState.isRendering = false;
  } catch (err) {
    _renderState.renderError = err;
    _renderState.isRendering = false;
    console.error('[NAV] Render failed:', err);
    throw err;
  }
}

// New validation function
function validatePageState() {
  const urlPage = resolvePageFromUrl();
  if (currentPage !== urlPage) {
    console.warn('[NAV] URL/state mismatch:', { 
      currentPage, 
      urlPage, 
      isRendering: _renderState.isRendering 
    });
    return false;
  }
  return true;
}
```

---

### Fix #5: Defensive Session Handling
**Strategy**: Ensure 401 responses never trigger unintended navigation

```javascript
const _apiAttempt = async (url, opts = {}, _retryCount = 0) => {
  // ... existing code ...
  
  if (res.status === 401) {
    if (opts.background) return { success: false, sessionExpired: true };
    
    // IMPORTANT: Do NOT navigate. Only clear session.
    if (currentUser || authToken) {
      clearSession();  // This does NOT call navigate()
      
      // Only show toast if this is a user-initiated call
      if (!opts.background && opts.showToast !== false) {
        toast('Session expired. Please login again.', 'error');
      }
    }
    
    return { success: false, sessionExpired: true };
  }
  
  // ... rest of function ...
};

function clearSession() {
  currentUser = null;
  authToken = null;
  sessionStorage.removeItem('vibes_user');
  sessionStorage.removeItem('vibes_token');
  renderNav();
  // ← NO navigate() call here
}
```

---

## Browser Refresh Handling
**Current**: Works correctly with `resolvePageFromUrl()`
**Preserved**: No changes needed

---

## Deep Links & Direct Navigation
**Current**: `resolvePageFromUrl()` handles all paths correctly
**Preserved**: No changes needed

---

## Testing Requirements

### Unit Tests
1. **Navigation queue blocking**: Verify rapid navigates are queued
2. **Popstate queue processing**: Verify back/forward works without race conditions
3. **Render cancellation**: Verify old renders don't mutate DOM
4. **Session expiry**: Verify 401 doesn't cause navigation

### Integration Tests
1. **Multi-page navigation**: Click wallet → dashboard → blogs → wallet (no flicker)
2. **Rapid back/forward**: Click back 5 times rapidly (no instability)
3. **Refresh preservation**: Reload on any page (stays on same page)
4. **Deep link access**: Direct URL to /wallet, /dashboard, /blogs (loads correctly)
5. **API slowness simulation**: Artificially delay API responses (no redirect)
6. **Network errors**: Simulate 500/502/503 errors (no redirect to home)

### Regression Tests (in tests/test_all.js)
See `## Regression Tests` section below

---

## Testing Results
*To be populated after fixes are implemented*

---

## Files Modified
- `public/index.html` - Core navigation fixes
- `tests/test_all.js` - New regression tests

---

## Deployment Notes
- No infrastructure changes required
- No database migration needed
- Service Worker already has kill-switch
- Vercel configuration already correct
- Deploy to production after testing passes all regression tests

---

## Success Criteria
✅ User clicks Wallet → page loads and stays on Wallet
✅ Refresh on any page preserves that page
✅ Back button works correctly
✅ Forward button works correctly
✅ Deep links (/wallet, /dashboard, /blogs) resolve immediately
✅ No more unexpected redirects to home
✅ No more page flickering/jittering
✅ All regression tests pass
✅ No console errors related to navigation

