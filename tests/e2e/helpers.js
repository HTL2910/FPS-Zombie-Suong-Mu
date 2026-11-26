"use strict";

const DEFAULT_PLAYWRIGHT_FALLBACK = "/Users/thanhlong/.npm/_npx/e41f203b7505f1fb/node_modules/playwright";
const DEFAULT_URL = process.env.FPS_TEST_URL || "http://localhost:8765/FPS-Zombie-Suong-Mu-Source-v6.4/index.html";

const SWIFTSHADER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--no-sandbox"
];

const DEFAULT_PROFILE = {
  bestScore: 0,
  bestWave: 1,
  highestLevel: 1,
  totalKills: 0,
  runs: 0,
  notesDiscovered: [],
  lang: "vi",
  quality: "auto"
};

const DESKTOP_HUD_SELECTORS = [
  "#hudTopLeft",
  "#hudTR",
  "#radarBox",
  "#hudBL",
  "#hudBR",
  "#muteBtn",
  "#lockHint",
  "#noteToast",
  "#weaponSlots",
  "#interactPrompt",
  "#shoveHud",
  "#bossWrap",
  "#extractBarWrap"
];

const MOBILE_HUD_SELECTORS = [
  "#hudTopLeft",
  "#btnPauseM",
  "#hudTR",
  "#radarBox",
  "#hudBL",
  "#joy",
  "#hudBR",
  "#noteToast",
  "#muteBtn",
  "#btnFire",
  "#btnReload",
  "#btnWeapon",
  "#btnJump",
  "#btnFlare",
  "#btnFlash",
  "#btnShove",
  "#btnInteract",
  "#weaponSlots",
  "#interactPrompt",
  "#shoveHud",
  "#bossWrap",
  "#extractBarWrap"
];

let _activeSession = null;

function requirePlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(DEFAULT_PLAYWRIGHT_FALLBACK);
  }
}

async function launchBrowser(opts = {}) {
  const { chromium } = requirePlaywright();
  return chromium.launch({
    headless: !opts.headed,
    args: SWIFTSHADER_ARGS
  });
}

function mergeProfile(cur, patch) {
  const b = patch || {};
  return {
    bestScore: Math.max(cur.bestScore || 0, Number(b.score) || Number(b.bestScore) || 0),
    bestWave: Math.max(cur.bestWave || 1, Number(b.wave) || Number(b.bestWave) || Number(b.level) || 1),
    highestLevel: Math.max(cur.highestLevel || 1, Number(b.highestLevel) || 1),
    totalKills: (cur.totalKills || 0) + (Number(b.killsDelta) || 0),
    runs: (cur.runs || 0) + (b.completedRun ? 1 : 0),
    notesDiscovered: Array.from(new Set([
      ...(cur.notesDiscovered || []),
      ...(Array.isArray(b.notes) ? b.notes : []),
      ...(Array.isArray(b.notesDiscovered) ? b.notesDiscovered : [])
    ])),
    lang: b.lang || cur.lang || "vi",
    quality: b.quality || cur.quality || "auto"
  };
}

async function attachApiMock(page, opts = {}) {
  const initialProfile = opts.rawEmptyProfile
    ? {}
    : Object.assign({}, DEFAULT_PROFILE, opts.initialProfile || {});
  const initialLeaderboard = Array.isArray(opts.initialLeaderboard)
    ? opts.initialLeaderboard.map((x) => Object.assign({}, x))
    : [];

  const state = {
    profile: opts.rawEmptyProfile ? {} : Object.assign({}, initialProfile),
    leaderboard: initialLeaderboard.map((x) => Object.assign({}, x)),
    apiLog: []
  };

  await page.route("**/api/profile", async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    let body = null;
    if (method === "POST") {
      try {
        body = req.postDataJSON();
      } catch {
        try {
          body = JSON.parse(req.postData() || "{}");
        } catch {
          body = {};
        }
      }
      state.profile = mergeProfile(
        Object.assign({}, DEFAULT_PROFILE, state.profile),
        body
      );
      state.apiLog.push({ method, path: "/api/profile", body });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.profile)
      });
      return;
    }
    state.apiLog.push({ method, path: "/api/profile", body: null });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.profile)
    });
  });

  await page.route("**/api/leaderboard", async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    if (method === "POST") {
      let body = null;
      try {
        body = req.postDataJSON();
      } catch {
        try {
          body = JSON.parse(req.postData() || "{}");
        } catch {
          body = {};
        }
      }
      const lv = Number(body.level) || Number(body.wave) || 1;
      state.leaderboard.push({
        name: String(body.name || "Survivor").slice(0, 24),
        score: Number(body.score) || 0,
        wave: lv,
        level: lv,
        kills: Number(body.kills) || 0,
        win: !!body.win,
        date: new Date().toISOString().slice(0, 10)
      });
      state.leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));
      state.leaderboard = state.leaderboard.slice(0, 10);
      state.apiLog.push({ method, path: "/api/leaderboard", body });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.leaderboard)
      });
      return;
    }
    state.apiLog.push({ method, path: "/api/leaderboard", body: null });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.leaderboard)
    });
  });

  return {
    get profile() { return state.profile; },
    get leaderboard() { return state.leaderboard; },
    get apiLog() { return state.apiLog; },
    getPosts(kind) {
      return state.apiLog.filter((x) => x.method === "POST" && (!kind || x.path.includes(kind)));
    },
    setProfile(p) { state.profile = Object.assign({}, DEFAULT_PROFILE, p || {}); },
    setLeaderboard(lb) { state.leaderboard = Array.isArray(lb) ? lb.slice(0, 10) : []; },
    clearLog() { state.apiLog.length = 0; },
    reset() {
      state.profile = opts.rawEmptyProfile ? {} : Object.assign({}, initialProfile);
      state.leaderboard = initialLeaderboard.map((x) => Object.assign({}, x));
      state.apiLog.length = 0;
    }
  };
}

function attachErrorTrackers(page) {
  const trackers = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailed: [],
    badResponses: []
  };

  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error") {
      trackers.consoleErrors.push(msg.text());
    } else if (t === "warning") {
      trackers.consoleWarnings.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    trackers.pageErrors.push(err && err.stack ? err.stack : String(err));
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("favicon")) return;
    trackers.requestFailed.push(`${req.method()} ${url} :: ${(req.failure() && req.failure().errorText) || "failed"}`);
  });

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("favicon")) return;
    if (res.status() >= 400) {
      trackers.badResponses.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  });

  return trackers;
}

function resetTrackers(trackers) {
  trackers.consoleErrors.length = 0;
  trackers.consoleWarnings.length = 0;
  trackers.pageErrors.length = 0;
  trackers.requestFailed.length = 0;
  trackers.badResponses.length = 0;
}

function assertZeroErrors(trackers, contextLabel = "test") {
  const issues = [];
  if (trackers.consoleErrors.length) issues.push(`consoleErrors(${trackers.consoleErrors.length}): ${trackers.consoleErrors.join(" | ")}`);
  if (trackers.pageErrors.length) issues.push(`pageErrors(${trackers.pageErrors.length}): ${trackers.pageErrors.join(" | ")}`);
  if (trackers.requestFailed.length) issues.push(`requestFailed(${trackers.requestFailed.length}): ${trackers.requestFailed.join(" | ")}`);
  if (trackers.badResponses.length) issues.push(`badResponses(${trackers.badResponses.length}): ${trackers.badResponses.join(" | ")}`);
  if (issues.length) {
    throw new Error(`[${contextLabel}] Runtime/network errors detected:\n  ${issues.join("\n  ")}`);
  }
}

async function closeActiveSession() {
  if (_activeSession) {
    const s = _activeSession;
    _activeSession = null;
    try {
      await s.context.close();
    } catch {}
  }
}

async function createSession(browser, opts = {}) {
  await closeActiveSession();

  const device = opts.device === "mobile" ? "mobile" : "desktop";
  const viewport = opts.viewport || (device === "mobile"
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 });
  const dpr = opts.deviceScaleFactor != null
    ? opts.deviceScaleFactor
    : (device === "mobile" ? 2 : 1);

  const contextOpts = device === "mobile"
    ? {
        viewport,
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: dpr
      }
    : {
        viewport,
        hasTouch: false,
        isMobile: false,
        deviceScaleFactor: dpr
      };

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const trackers = attachErrorTrackers(page);
  const apiMock = await attachApiMock(page, {
    initialProfile: opts.initialProfile,
    initialLeaderboard: opts.initialLeaderboard,
    rawEmptyProfile: opts.rawEmptyProfile
  });

  const session = {
    browser,
    context,
    page,
    trackers,
    apiMock,
    device,
    viewport,
    deviceScaleFactor: dpr,
    initialProfile: opts.initialProfile || null,
    tainted: false,
    async close() {
      if (_activeSession === session) _activeSession = null;
      try {
        await context.close();
      } catch {}
    }
  };

  _activeSession = session;
  return session;
}

async function bootAndWait(page, url = DEFAULT_URL, opts = {}) {
  const timeoutMs = opts.timeoutMs || 45000;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (opts.skipBootWait) return;
  await page.waitForFunction(() => window.__loadDone === true, null, { timeout: timeoutMs });
  await page.waitForFunction(() => {
    const ls = document.getElementById("loadScr");
    return !ls || ls.classList.contains("hidden");
  }, null, { timeout: 15000 });
  if (!opts.skipMenuCheck) {
    await page.waitForFunction(() => {
      const m = document.getElementById("menu");
      return m && !m.classList.contains("hidden");
    }, null, { timeout: 10000 });
  }
}

async function startLevelAndWait(page, levelId = 1, timeoutMs = 15000) {
  await page.evaluate((id) => {
    if (!window.__fpsTest || !window.__fpsTest.startLevel) {
      throw new Error("__fpsTest.startLevel missing");
    }
    window.__fpsTest.startLevel(id);
  }, levelId);
  await page.waitForFunction((id) => {
    const st = window.__fpsTest && window.__fpsTest.getState && window.__fpsTest.getState();
    const sl = document.getElementById("stageLoadScr");
    const slHidden = !sl || sl.classList.contains("hidden");
    return st && st.state === "playing" && st.level === id && slHidden;
  }, levelId, { timeout: timeoutMs });
  await waitFrames(page, 3);
}

async function waitFrames(page, count = 2) {
  await page.evaluate((n) => new Promise((resolve) => {
    let i = 0;
    function step() {
      if (++i >= n) resolve();
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }), count);
}

async function toMenuAndWait(page) {
  await page.evaluate(() => {
    const oldCard = document.querySelector("#levelGrid .lvlCard");
    if (oldCard) oldCard.__e2eStale = true;
    if (window.FPS && FPS.game && typeof FPS.game.toMenu === "function") {
      FPS.game.toMenu();
    }
  });
  await page.waitForFunction(() => {
    const st = window.__fpsTest && window.__fpsTest.getState && window.__fpsTest.getState();
    const m = document.getElementById("menu");
    if (!st || st.state !== "menu" || !m || m.classList.contains("hidden")) return false;
    const cards = document.querySelectorAll("#levelGrid .lvlCard");
    if (cards.length < 5) return false;
    const hasSync = !!(window.FPSApi && window.FPS && FPS.ui && typeof FPS.ui.syncBackendUI === "function");
    if (hasSync && cards[0].__e2eStale) return false;
    const lb = document.getElementById("lbBox");
    if (hasSync && lb && lb.children.length < 2) return false;
    return true;
  }, null, { timeout: 10000 });
  await waitFrames(page, 4);
}

async function resetSessionState(page, opts = {}) {
  if (opts.clearLocalStorage) {
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
    });
  }
  await toMenuAndWait(page);
  await page.evaluate(() => {
    if (window.FPS && FPS.perf && typeof FPS.perf.setQualityMode === "function") {
      FPS.perf.setQualityMode("auto");
    }
    if (document.body) document.body.classList.remove("lowhp");
    if (window.FPS && FPS.state && FPS.state.G) {
      FPS.state.G.hp = 100;
    }
    ["armoryScr", "bossWrap"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
    const toast = document.getElementById("noteToast");
    if (toast) toast.classList.remove("show");
  });
  if (opts.lang) {
    await switchLang(page, opts.lang);
  }
}

async function requireV9(page, featureLabel, checkFn, arg) {
  const res = await page.evaluate(
    ({ fnStr, payload }) => {
      try {
        const fn = eval("(" + fnStr + ")");
        return fn(payload);
      } catch (e) {
        return { ok: false, detail: e && e.message ? e.message : String(e) };
      }
    },
    { fnStr: checkFn.toString(), payload: arg }
  );
  if (res === true) return true;
  if (res && res.ok === true) return res;
  const detail = (res && res.detail) ? res.detail : "missing or false";
  throw new Error(`[AWAITING_V9_IMPL] ${featureLabel}: ${detail}`);
}

async function getVisibleBox(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      if (p.classList && p.classList.contains("hidden")) return null;
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) <= 0.01) {
        return null;
      }
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0.5 || r.height <= 0.5) return null;
    const csEl = getComputedStyle(el);
    const zi = parseInt(csEl.zIndex, 10);
    return {
      selector: sel,
      x: +r.left.toFixed(2),
      y: +r.top.toFixed(2),
      width: +r.width.toFixed(2),
      height: +r.height.toFixed(2),
      right: +r.right.toFixed(2),
      bottom: +r.bottom.toFixed(2),
      zIndex: Number.isNaN(zi) ? 0 : zi
    };
  }, selector);
}

async function collectVisibleBoxes(page, selectors) {
  return page.evaluate((sels) => {
    function isVis(el) {
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
        if (p.classList && p.classList.contains("hidden")) return false;
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) <= 0.01) {
          return false;
        }
      }
      return true;
    }
    const out = [];
    for (const sel of sels) {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((el, idx) => {
        if (!isVis(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0.5 || r.height <= 0.5) return;
        const cs = getComputedStyle(el);
        const zi = parseInt(cs.zIndex, 10);
        out.push({
          selector: nodes.length > 1 ? `${sel}[${idx}]` : sel,
          baseSelector: sel,
          x: +r.left.toFixed(2),
          y: +r.top.toFixed(2),
          width: +r.width.toFixed(2),
          height: +r.height.toFixed(2),
          right: +r.right.toFixed(2),
          bottom: +r.bottom.toFixed(2),
          zIndex: Number.isNaN(zi) ? 0 : zi
        });
      });
    }
    return out;
  }, selectors);
}

async function assertInViewport(page, selectors, margin = 0) {
  const res = await page.evaluate(({ sels, m }) => {
    function isVis(el) {
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
        if (p.classList && p.classList.contains("hidden")) return false;
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) <= 0.01) {
          return false;
        }
      }
      return true;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sw = document.documentElement.scrollWidth;
    const violations = [];
    if (sw > vw + 1) {
      violations.push(`documentElement.scrollWidth (${sw}) > innerWidth (${vw})`);
    }
    for (const sel of sels) {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((el, idx) => {
        if (!isVis(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0.5 || r.height <= 0.5) return;
        if (r.left < -m || r.top < -m || r.right > vw + m || r.bottom > vh + m) {
          const name = nodes.length > 1 ? `${sel}[${idx}]` : sel;
          violations.push(
            `${name} out of viewport ${vw}x${vh}: [${r.left.toFixed(1)}, ${r.top.toFixed(1)}, ${r.right.toFixed(1)}, ${r.bottom.toFixed(1)}]`
          );
        }
      });
    }
    return { vw, vh, violations };
  }, { sels: selectors, m: margin });

  if (res.violations.length) {
    throw new Error(`Viewport containment failed (${res.vw}x${res.vh}):\n  ${res.violations.join("\n  ")}`);
  }
  return res;
}

async function findOverlaps(page, selectors, opts = {}) {
  const minPx = opts.minIntersectPx != null ? opts.minIntersectPx : 2;
  return page.evaluate(({ sels, minPx }) => {
    function isVis(el) {
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
        if (p.classList && p.classList.contains("hidden")) return false;
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) <= 0.01) {
          return false;
        }
      }
      return true;
    }
    const items = [];
    for (const sel of sels) {
      const nodes = document.querySelectorAll(sel);
      nodes.forEach((el, idx) => {
        if (!isVis(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0.5 || r.height <= 0.5) return;
        const label = nodes.length > 1 ? `${sel}[${idx}]` : sel;
        items.push({ sel: label, el, r });
      });
    }
    const overlaps = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const ix = Math.max(0, Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left));
        const iy = Math.max(0, Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top));
        if (ix > minPx && iy > minPx) {
          overlaps.push({
            a: A.sel,
            b: B.sel,
            ix: +ix.toFixed(1),
            iy: +iy.toFixed(1),
            area: +(ix * iy).toFixed(1),
            rectA: [A.r.left, A.r.top, A.r.right, A.r.bottom].map((n) => +n.toFixed(1)),
            rectB: [B.r.left, B.r.top, B.r.right, B.r.bottom].map((n) => +n.toFixed(1))
          });
        }
      }
    }
    return overlaps;
  }, { sels: selectors, minPx });
}

async function assertNoOverlap(page, selectors, opts = {}) {
  const overlaps = await findOverlaps(page, selectors, opts);
  if (overlaps.length) {
    const desc = overlaps.map((o) =>
      `${o.a} (${o.rectA.join(",")}) vs ${o.b} (${o.rectB.join(",")}) => ${o.ix}x${o.iy} (${o.area}px²)`
    );
    throw new Error(`${opts.msg ? opts.msg + ": " : ""}HUD/UI overlap detected:\n  ${desc.join("\n  ")}`);
  }
}

async function assertZOrderAbove(page, upperSelector, lowerSelectors) {
  const res = await page.evaluate(({ upper, lowers }) => {
    function isVis(el) {
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
        if (p.classList && p.classList.contains("hidden")) return false;
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) <= 0.01) {
          return false;
        }
      }
      return true;
    }
    function zVal(el) {
      const z = parseInt(getComputedStyle(el).zIndex, 10);
      return Number.isNaN(z) ? 0 : z;
    }
    const uEl = document.querySelector(upper);
    if (!uEl || !isVis(uEl)) {
      return { ok: false, err: `Upper element ${upper} is not visible` };
    }
    const uZ = zVal(uEl);
    const failures = [];
    for (const lSel of lowers) {
      const lEl = document.querySelector(lSel);
      if (!lEl || !isVis(lEl)) continue;
      const lZ = zVal(lEl);
      if (!(uZ > lZ)) {
        failures.push(`${upper}(z=${uZ}) is NOT above ${lSel}(z=${lZ})`);
      }
    }
    return { ok: failures.length === 0, uZ, failures };
  }, { upper: upperSelector, lowers: lowerSelectors });

  if (!res.ok) {
    throw new Error(res.err || `Z-order check failed:\n  ${res.failures.join("\n  ")}`);
  }
  return res;
}

async function switchLang(page, lang) {
  const target = lang === "en" ? "en" : "vi";
  const btnId = target === "en" ? "#langEn" : "#langVi";
  const menuVisible = await getVisibleBox(page, "#menu");
  if (menuVisible) {
    await page.click(btnId);
  } else {
    await page.evaluate((l) => {
      if (window.FPS && FPS.ui && typeof FPS.ui.applyLang === "function") {
        FPS.ui.applyLang(l);
      }
    }, target);
  }
  await page.waitForFunction(({ l, btn }) => {
    const b = document.querySelector(btn);
    return document.documentElement.lang === l && (!b || b.classList.contains("on"));
  }, { l: target, btn: btnId }, { timeout: 5000 });
}

async function auditI18nSymmetry(page) {
  return page.evaluate(() => {
    const vi = Object.keys((window.FPS && FPS.T && FPS.T.vi) || {});
    const en = Object.keys((window.FPS && FPS.T && FPS.T.en) || {});
    const viSet = new Set(vi);
    const enSet = new Set(en);
    const missingInEn = vi.filter((k) => !enSet.has(k));
    const missingInVi = en.filter((k) => !viSet.has(k));
    const dataIKeys = Array.from(new Set(
      Array.from(document.querySelectorAll("[data-i]")).map((el) => el.getAttribute("data-i"))
    ));
    const missingDataIInVi = dataIKeys.filter((k) => !viSet.has(k) || !String(FPS.T.vi[k] || "").trim());
    const missingDataIInEn = dataIKeys.filter((k) => !enSet.has(k) || !String(FPS.T.en[k] || "").trim());
    return {
      viCount: vi.length,
      enCount: en.length,
      dataICount: dataIKeys.length,
      missingInEn,
      missingInVi,
      missingDataIInVi,
      missingDataIInEn
    };
  });
}

async function checkPerfGate(page, opts = {}) {
  const maxDrawCalls = opts.maxDrawCalls != null ? opts.maxDrawCalls : 75;
  const maxPointLights = opts.maxPointLights != null ? opts.maxPointLights : 0;
  const maxDpr = opts.maxDpr != null ? opts.maxDpr : 1.0;

  await waitFrames(page, 3);
  const stats = await page.evaluate(() => {
    const st = window.__fpsTest && window.__fpsTest.getState ? window.__fpsTest.getState() : {};
    const perf = window.FPS && FPS.perf && FPS.perf.getStats ? FPS.perf.getStats() : {};
    const renderer = window.FPS && FPS.world && FPS.world.renderer;
    const pixelRatio = renderer && typeof renderer.getPixelRatio === "function" ? renderer.getPixelRatio() : (perf.dpr || 1);
    return {
      pointLights: st.pointLights,
      drawCalls: st.drawCalls != null ? st.drawCalls : perf.drawCalls,
      dpr: perf.dpr != null ? perf.dpr : pixelRatio,
      pixelRatio,
      triangles: st.triangles != null ? st.triangles : perf.triangles,
      textures: st.textures != null ? st.textures : perf.textures,
      qLevel: perf.qLevel,
      qMode: perf.qMode
    };
  });

  const errs = [];
  if (stats.pointLights == null || stats.pointLights > maxPointLights) {
    errs.push(`pointLights=${stats.pointLights} > ${maxPointLights}`);
  }
  if (stats.drawCalls == null || stats.drawCalls > maxDrawCalls) {
    errs.push(`drawCalls=${stats.drawCalls} > ${maxDrawCalls}`);
  }
  if (stats.dpr > maxDpr + 0.001 || stats.pixelRatio > maxDpr + 0.001) {
    errs.push(`dpr=${stats.dpr} / pixelRatio=${stats.pixelRatio} > ${maxDpr}`);
  }
  if (errs.length) {
    throw new Error(`Performance Gate failed: ${errs.join("; ")} (stats=${JSON.stringify(stats)})`);
  }
  return stats;
}

async function holdKey(page, code, ms = 300) {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function tapTouch(page, selector) {
  const box = await getVisibleBox(page, selector);
  if (!box) throw new Error(`Cannot tap invisible touch target: ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(80);
}

async function dragJoystick(page, dx = 0, dy = -35, holdMs = 350) {
  const box = await getVisibleBox(page, "#joy");
  if (!box) throw new Error("Cannot drag invisible #joy");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(({ x0, y0, x1, y1 }) => {
    const el = document.querySelector("#joy");
    const t0 = new Touch({ identifier: 101, target: el, clientX: x0, clientY: y0, pageX: x0, pageY: y0 });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t0], targetTouches: [t0], changedTouches: [t0] }));
    const t1 = new Touch({ identifier: 101, target: el, clientX: x1, clientY: y1, pageX: x1, pageY: y1 });
    el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t1], targetTouches: [t1], changedTouches: [t1] }));
  }, { x0: cx, y0: cy, x1: cx + dx, y1: cy + dy });
  await page.waitForTimeout(holdMs);
  await waitFrames(page, 4);
  await page.evaluate(({ x1, y1 }) => {
    const el = document.querySelector("#joy");
    const t1 = new Touch({ identifier: 101, target: el, clientX: x1, clientY: y1, pageX: x1, pageY: y1 });
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t1] }));
  }, { x1: cx + dx, y1: cy + dy });
  await page.waitForTimeout(80);
}

async function swipeTouchLook(page, dx = 60, dy = 0) {
  await page.evaluate(({ dx, dy }) => {
    const x0 = Math.round(window.innerWidth * 0.72);
    const y0 = Math.round(window.innerHeight * 0.40);
    const target = document.elementFromPoint(x0, y0)
      || (window.FPS && FPS.world && FPS.world.renderer && FPS.world.renderer.domElement)
      || document.body;
    const t0 = new Touch({ identifier: 202, target, clientX: x0, clientY: y0, pageX: x0, pageY: y0 });
    target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t0], targetTouches: [t0], changedTouches: [t0] }));
    const t1 = new Touch({ identifier: 202, target, clientX: x0 + dx, clientY: y0 + dy, pageX: x0 + dx, pageY: y0 + dy });
    target.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t1], targetTouches: [t1], changedTouches: [t1] }));
    target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t1] }));
  }, { dx, dy });
  await page.waitForTimeout(80);
}

async function clickArmoryAction(page, action, weapon) {
  const primary = page.locator(`#armoryList button[data-action='${action}'][data-w='${weapon}']`);
  if (await primary.count() > 0) {
    await primary.first().click();
    return;
  }
  const byWeapon = page.locator(`#armoryList button[data-w='${weapon}']`);
  if (await byWeapon.count() > 0) {
    await byWeapon.first().click();
    return;
  }
  const clicked = await page.evaluate(({ act, wp }) => {
    const list = document.getElementById("armoryList");
    if (!list) return false;
    const btns = Array.from(list.querySelectorAll("button"));
    const wpRe = new RegExp(wp, "i");
    const actRe = act === "unlock"
      ? /unlock|mở|buy|mua/i
      : /upgrade|nâng|mk\./i;
    let target = btns.find((b) => wpRe.test(b.textContent || "") && actRe.test(b.textContent || ""));
    if (!target) {
      target = btns.find((b) => {
        const card = b.closest("[data-w], .armoryItem, .card, .row, div");
        const txt = (card ? card.textContent : b.textContent) || "";
        return wpRe.test(txt) && actRe.test(b.textContent || "");
      });
    }
    if (!target) target = btns.find((b) => wpRe.test(b.textContent || ""));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, { act: action, wp: weapon });
  if (!clicked) {
    throw new Error(`Armory button not found for action=${action}, weapon=${weapon}`);
  }
}

async function probeV9Contracts(page) {
  return page.evaluate(() => {
    const W = window.FPS && FPS.world;
    const E = window.FPS && FPS.entities;
    const U = window.FPS && FPS.ui;
    const L = window.FPS && FPS.LEVELS;
    const T = window.__fpsTest;
    const st = T && T.getState ? T.getState() : {};
    const lv0 = L && L[0];
    const has = (cond) => (cond ? "READY" : "AWAITING_V9_IMPL");

    const checks = {
      "config.ZOMBIE_TYPES(spitter,bloater,stalker)": has(FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.spitter && FPS.ZOMBIE_TYPES.bloater && FPS.ZOMBIE_TYPES.stalker),
      "config.UPGRADES(Mk.I..III)": has(FPS.UPGRADES && FPS.UPGRADES.tiers && FPS.UPGRADES.tiers[3] && FPS.UPGRADES.unlockCosts),
      "config.T.v9_keys(objGate,shoveV,pressE)": has(FPS.T && FPS.T.vi && FPS.T.vi.objGate && FPS.T.en && FPS.T.en.objGate && FPS.T.en.shoveV),
      "levels.platforms_and_ry": has(L && L.length === 5 && L.every((x) => Array.isArray(x.platforms) && x.platforms.length >= 1 && x.walls && x.walls.some((w) => Math.abs(w.ry || 0) > 0.05))),
      "levels.objectives_1_to_5": has(L && L[0].objective && L[0].objective.type === "gate" && L[1].objective && L[1].objective.type === "generators" && L[2].objective && L[2].objective.type === "relics" && L[3].objective && L[3].objective.type === "totems" && L[4].objective && L[4].objective.type === "holdout"),
      "levels.armory_anvil_traps_barricades_hazards": has(lv0 && lv0.armory && Array.isArray(lv0.traps) && Array.isArray(lv0.barricades) && L[4] && Array.isArray(L[4].hazards)),
      "world.groundY": has(W && typeof W.groundY === "function"),
      "world.getHazardAt": has(W && typeof W.getHazardAt === "function"),
      "world.getNearestInteractable": has(W && typeof W.getNearestInteractable === "function"),
      "world.mutators(gate,gen,relic,totem,trap,barricade,flare)": has(W && typeof W.damageGate === "function" && typeof W.setGeneratorState === "function" && typeof W.pickupRelic === "function" && typeof W.damageTotem === "function" && typeof W.activateTrap === "function" && typeof W.damageBarricade === "function" && typeof W.setFlareLit === "function"),
      "entities.shove": has(E && typeof E.shove === "function"),
      "entities.unlock_and_upgrade": has(E && typeof E.unlockWeapon === "function" && typeof E.upgradeWeapon === "function" && typeof E.getWeaponTier === "function" && typeof E.isWeaponUnlocked === "function"),
      "entities.acid_and_decal_pool": has(E && typeof E.spawnAcidPool === "function" && typeof E.spawnDecal === "function"),
      "entities.applyArmorShield": has(E && typeof E.applyArmorShield === "function"),
      "ui.armory_and_special_vfx": has(U && typeof U.openArmory === "function" && typeof U.closeArmory === "function" && typeof U.showStalkerWarn === "function" && typeof U.showBloaterBlind === "function"),
      "dom.hud_v9(#scrapVal,#comboBadge,#objDetail,#weaponSlots,#interactPrompt,#shoveHud)": has(
        document.getElementById("scrapVal") &&
        document.getElementById("comboBadge") &&
        document.getElementById("objDetail") &&
        document.getElementById("weaponSlots") &&
        document.getElementById("interactPrompt") &&
        document.getElementById("shoveHud")
      ),
      "dom.armory(#armoryScr,#armoryList,#btnArmoryClose)": has(
        document.getElementById("armoryScr") &&
        document.getElementById("armoryList") &&
        document.getElementById("btnArmoryClose")
      ),
      "dom.mobile(#btnShove,#btnInteract)": has(
        document.getElementById("btnShove") &&
        document.getElementById("btnInteract")
      ),
      "fpsTest.getState_v9_fields": has(
        "scrap" in st &&
        "hsStreak" in st &&
        "unlockedWeapons" in st &&
        "weaponTiers" in st &&
        "directorPhase" in st &&
        "objState" in st &&
        "groundY" in st
      ),
      "fpsTest.methods_v9(grantScrap,triggerSpecial,interactNearest,triggerShove,damageObjective,teleportTo)": has(
        T &&
        typeof T.grantScrap === "function" &&
        typeof T.triggerSpecial === "function" &&
        typeof T.interactNearest === "function" &&
        typeof T.triggerShove === "function" &&
        typeof T.damageObjective === "function" &&
        typeof T.teleportTo === "function"
      )
    };

    const ready = Object.values(checks).filter((v) => v === "READY").length;
    return { ready, total: Object.keys(checks).length, checks };
  });
}

module.exports = {
  DEFAULT_URL,
  DEFAULT_PROFILE,
  SWIFTSHADER_ARGS,
  DESKTOP_HUD_SELECTORS,
  MOBILE_HUD_SELECTORS,
  requirePlaywright,
  launchBrowser,
  attachApiMock,
  attachErrorTrackers,
  resetTrackers,
  assertZeroErrors,
  closeActiveSession,
  createSession,
  bootAndWait,
  startLevelAndWait,
  waitFrames,
  toMenuAndWait,
  resetSessionState,
  requireV9,
  getVisibleBox,
  collectVisibleBoxes,
  assertInViewport,
  findOverlaps,
  assertNoOverlap,
  assertZOrderAbove,
  switchLang,
  auditI18nSymmetry,
  checkPerfGate,
  holdKey,
  tapTouch,
  dragJoystick,
  swipeTouchLook,
  clickArmoryAction,
  probeV9Contracts
};
