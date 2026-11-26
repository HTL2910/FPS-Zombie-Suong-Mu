#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const helpers = require("./helpers");

const VALID_TIERS = new Set(["1", "2", "3", "4", "5", "all"]);

function parseArgs(argv) {
  const args = {
    tier: "all",
    smoke: false,
    list: false,
    filter: "",
    headed: false,
    url: helpers.DEFAULT_URL,
    json: "",
    timeoutMs: 60000
  };
  function takeValue(flag, i) {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("-")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return argv[i + 1];
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--smoke") args.smoke = true;
    else if (a === "--list") args.list = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--tier") { args.tier = takeValue("--tier", i).toLowerCase(); i++; }
    else if (a.startsWith("--tier=")) args.tier = a.slice(7).toLowerCase();
    else if (a === "--filter") { args.filter = takeValue("--filter", i); i++; }
    else if (a.startsWith("--filter=")) args.filter = a.slice(9);
    else if (a === "--url") { args.url = takeValue("--url", i); i++; }
    else if (a.startsWith("--url=")) args.url = a.slice(6);
    else if (a === "--json") { args.json = takeValue("--json", i); i++; }
    else if (a.startsWith("--json=")) args.json = a.slice(7);
    else if (a === "--timeout") {
      const raw = takeValue("--timeout", i);
      i++;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --timeout=${raw}`);
      args.timeoutMs = Math.max(5000, n);
    } else if (a.startsWith("--timeout=")) {
      const raw = a.slice(10);
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --timeout=${raw}`);
      args.timeoutMs = Math.max(5000, n);
    } else if (a === "--help" || a === "-h") {
      console.log([
        "Usage: node tests/e2e/runner.js [options]",
        "  --tier=1|2|3|4|5|all Run selected test tier(s) (default: all)",
        "  --smoke              Run live baseline+v9 smoke checks (Desktop + Mobile) & v9 contract probe",
        "  --list               List test counts and descriptors without launching browser",
        "  --filter=<substr>    Filter tests by substring match on id, feature, or title",
        "  --headed             Launch Chromium in headed mode",
        "  --url=<url>          Override target game URL",
        "  --json=<filepath>    Write structured JSON report to file",
        "  --timeout=<ms>       Per-test timeout in ms (default: 60000)"
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!VALID_TIERS.has(args.tier)) {
    throw new Error(`Invalid --tier=${args.tier}; expected 1|2|3|4|5|all`);
  }
  return args;
}

function loadAllSpecs() {
  return [
    ...require("./tier1.spec"),
    ...require("./tier2.spec"),
    ...require("./tier3.spec"),
    ...require("./tier4.spec"),
    ...require("./tier5.spec")
  ];
}

function selectSpecs(specs, args) {
  let selected = specs;
  if (args.tier !== "all") {
    const tNum = Number(args.tier);
    selected = selected.filter((t) => t.tier === tNum);
  }
  const f = (args.filter || "").trim().toLowerCase();
  if (f) {
    selected = selected.filter((t) => `${t.id} ${t.feature} ${t.title}`.toLowerCase().includes(f));
  }
  return selected;
}

function writeJsonReport(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function printList(filtered, args) {
  const byTier = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byFeature = {};
  for (const t of filtered) {
    byTier[t.tier] = (byTier[t.tier] || 0) + 1;
    byFeature[t.feature] = (byFeature[t.feature] || 0) + 1;
  }

  console.log("=== FPS Zombie Suong Mu E2E Test Suite Inventory ===");
  console.log(`Total tests: ${filtered.length} (Tier 1: ${byTier[1]}, Tier 2: ${byTier[2]}, Tier 3: ${byTier[3]}, Tier 4: ${byTier[4]}, Tier 5: ${byTier[5]})`);
  console.log("By Feature:", Object.entries(byFeature).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log("");
  for (const t of filtered) {
    const dev = t.device || "desktop";
    console.log(`[T${t.tier}] ${t.id} (${t.feature}, ${dev}) — ${t.title}`);
  }

  if (args.json) {
    writeJsonReport(args.json, {
      mode: "list",
      tier: args.tier,
      filter: args.filter,
      total: filtered.length,
      byTier,
      byFeature,
      tests: filtered.map((t) => ({
        id: t.id,
        tier: t.tier,
        feature: t.feature,
        title: t.title,
        device: t.device || "desktop"
      }))
    });
  }
}

async function runWithTimeout(fn, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms in ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runSmoke(browser, args) {
  const startedAt = Date.now();
  const steps = [];
  let contractProbe = null;
  let mobileOverlapsDiag = [];

  async function step(name, fn) {
    const t0 = Date.now();
    try {
      const detail = await fn();
      const ms = Date.now() - t0;
      steps.push({ name, status: "PASS", durationMs: ms, detail: detail || "" });
      console.log(`  [PASS] ${name} (${ms}ms)${detail ? " — " + detail : ""}`);
    } catch (err) {
      const ms = Date.now() - t0;
      const msg = err && err.message ? err.message : String(err);
      steps.push({ name, status: "FAIL", durationMs: ms, error: msg });
      console.error(`  [FAIL] ${name} (${ms}ms) — ${msg}`);
      throw err;
    }
  }

  console.log(`=== E2E SMOKE MODE (${args.url}) ===`);

  // Phase 1: Desktop (1280x800)
  console.log("\n[Desktop 1280x800]");
  let dSession = null;
  let desktopFailed = false;
  try {
    dSession = await helpers.createSession(browser, {
      device: "desktop",
      initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" }
    });
    const { page, trackers, apiMock } = dSession;

    await step("Boot & Preload + SwiftShader WebGL", async () => {
      await helpers.bootAndWait(page, args.url, { timeoutMs: 45000 });
      const info = await page.evaluate(() => {
        const gl = window.FPS && FPS.world && FPS.world.renderer && FPS.world.renderer.getContext();
        const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
        const rendererStr = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : "none");
        const gunOk = window.__gunTexOk ? window.__gunTexOk() : {};
        const zbOk = window.__zbTexOk ? window.__zbTexOk() : {};
        const ls = window.__fpsTest ? window.__fpsTest.getLoadState() : {};
        return {
          rendererStr,
          loadDone: !!window.__loadDone,
          state: ls.state,
          gunAll: Object.values(gunOk).length >= 4 && Object.values(gunOk).every(Boolean),
          zbLoaded: zbOk.loaded || 0
        };
      });
      if (!info.loadDone || info.state !== "menu") throw new Error(`Bad boot state: ${JSON.stringify(info)}`);
      if (!info.gunAll || info.zbLoaded < 7) throw new Error(`Incomplete textures/models: ${JSON.stringify(info)}`);
      return `${info.rendererStr}; zb=${info.zbLoaded}/7`;
    });

    await step("API Mock Interception (zero disk write)", async () => {
      const gets = apiMock.apiLog.filter((x) => x.method === "GET");
      if (gets.length < 2) throw new Error(`Expected mocked profile+leaderboard GETs, got ${JSON.stringify(apiMock.apiLog)}`);
      return `intercepted=${apiMock.apiLog.length} calls`;
    });

    await step("VI <-> EN Language Toggle", async () => {
      await helpers.switchLang(page, "en");
      const enText = await page.textContent("#btnStart");
      await helpers.switchLang(page, "vi");
      const viText = await page.textContent("#btnStart");
      if (enText === viText) throw new Error(`Language toggle did not change #btnStart (${viText})`);
      return `EN="${enText.trim()}" VI="${viText.trim()}"`;
    });

    await step("Menu Launch (#btnStart) + Pointerlock Fallback & Input", async () => {
      await page.click("#btnStart");
      await page.waitForFunction(() => {
        const st = window.__fpsTest && window.__fpsTest.getState && window.__fpsTest.getState();
        return st && st.state === "playing";
      }, null, { timeout: 10000 });
      await helpers.waitFrames(page, 3);
      await page.mouse.click(640, 400, { button: "left" });
      await helpers.holdKey(page, "KeyW", 180);
      await page.keyboard.press("Space");
      await page.mouse.click(640, 400, { button: "right" });
      await helpers.waitFrames(page, 3);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      if (st.state !== "playing") throw new Error(`Unexpected state after input: ${st.state}`);
      return `pos=(${st.playerPos.x},${st.playerPos.y},${st.playerPos.z})`;
    });

    await step("5-Map Launch + Baseline Hooks + Perf Gate (0 PointLights, <=75 drawCalls)", async () => {
      const perMap = [];
      for (let lv = 1; lv <= 5; lv++) {
        await helpers.startLevelAndWait(page, lv, 15000);
        const perf = await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
        perMap.push(`M${lv}:dc=${perf.drawCalls}/pl=${perf.pointLights}`);
      }
      await helpers.startLevelAndWait(page, 1, 15000);
      await page.evaluate(() => {
        window.__fpsTest.shootBarrel(0);
        window.__fpsTest.throwFlare();
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await helpers.waitFrames(page, 2);
      return perMap.join(", ");
    });

    await step("v9.0 Contract Probe (non-failing diagnostic)", async () => {
      contractProbe = await helpers.probeV9Contracts(page);
      return `${contractProbe.ready}/${contractProbe.total} v9.0 contracts READY`;
    });

    await step("Desktop Zero Console/Page/Network Errors", async () => {
      helpers.assertZeroErrors(trackers, "smoke-desktop");
      return `warnings=${trackers.consoleWarnings.length}`;
    });
  } catch {
    desktopFailed = true;
  } finally {
    if (dSession) await dSession.close();
  }

  // Phase 2: Mobile (390x844, hasTouch: true)
  console.log("\n[Mobile 390x844]");
  let mSession = null;
  let mobileFailed = false;
  try {
    mSession = await helpers.createSession(browser, {
      device: "mobile",
      initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" }
    });
    const { page, trackers } = mSession;

    await step("Mobile Boot & Touch Controls Activation", async () => {
      await helpers.bootAndWait(page, args.url, { timeoutMs: 45000 });
      await page.click("#btnStart");
      await page.waitForFunction(() => {
        const st = window.__fpsTest && window.__fpsTest.getState && window.__fpsTest.getState();
        return st && st.state === "playing" && document.body.classList.contains("touch") && document.body.classList.contains("playing");
      }, null, { timeout: 10000 });
      await helpers.waitFrames(page, 3);
      const perf = await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
      await helpers.dragJoystick(page, 0, -28, 220);
      await helpers.tapTouch(page, "#btnFire");
      mobileOverlapsDiag = await helpers.findOverlaps(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2 });
      return `dc=${perf.drawCalls}, pl=${perf.pointLights}, dpr=${perf.dpr}, hudOverlapsDiag=${mobileOverlapsDiag.length}`;
    });

    await step("Mobile Zero Console/Page/Network Errors", async () => {
      helpers.assertZeroErrors(trackers, "smoke-mobile");
      return `warnings=${trackers.consoleWarnings.length}`;
    });
  } catch {
    mobileFailed = true;
  } finally {
    if (mSession) await mSession.close();
  }

  if (contractProbe) {
    console.log("\n[CONTRACT_PROBE]");
    for (const [k, v] of Object.entries(contractProbe.checks)) {
      console.log(`  ${v.padEnd(18)} ${k}`);
    }
    console.log(`Summary: ${contractProbe.ready}/${contractProbe.total} READY`);
  }
  if (mobileOverlapsDiag.length) {
    console.log("\n[DIAG] Mobile 390x844 baseline HUD overlaps (enforced strictly in Tier 1-4):");
    for (const o of mobileOverlapsDiag) {
      console.log(`  ${o.a} vs ${o.b}: ${o.ix}x${o.iy} (${o.area}px²)`);
    }
  }

  const passed = !desktopFailed && !mobileFailed && steps.every((s) => s.status === "PASS");
  const report = {
    mode: "smoke",
    url: args.url,
    passed,
    durationMs: Date.now() - startedAt,
    steps,
    contractProbe,
    mobileOverlapsDiag
  };

  if (args.json) {
    writeJsonReport(args.json, report);
  }

  console.log(`\nSmoke result: ${passed ? "PASS" : "FAIL"} (${report.durationMs}ms)`);
  return passed ? 0 : 1;
}

async function runSuite(browser, args, selected) {
  const startedAt = Date.now();
  console.log(`=== Running ${selected.length} E2E Test(s) (tier=${args.tier}${args.filter ? `, filter=${args.filter}` : ""}) ===`);

  const results = [];
  let session = null;
  let prevManualBoot = false;

  try {
    for (let idx = 0; idx < selected.length; idx++) {
      const test = selected[idx];
      const targetDevice = test.device || "desktop";
      const targetDpr = test.deviceScaleFactor != null
        ? test.deviceScaleFactor
        : (targetDevice === "mobile" ? 2 : 1);
      const targetProfileKey = JSON.stringify({
        initialProfile: test.initialProfile || null,
        initialLeaderboard: test.initialLeaderboard || null,
        rawEmptyProfile: !!test.rawEmptyProfile
      });

      const canReuse = Boolean(
        session &&
        !session.tainted &&
        !test.freshContext &&
        !test.manualBoot &&
        !prevManualBoot &&
        session.device === targetDevice &&
        session.deviceScaleFactor === targetDpr &&
        session._profileKey === targetProfileKey
      );

      prevManualBoot = !!test.manualBoot;
      const t0 = Date.now();
      let status = "PASS";
      let errorMsg = "";
      let awaitingV9Impl = false;

      try {
        if (!canReuse) {
          if (session) {
            await session.close();
            session = null;
          }
          session = await helpers.createSession(browser, {
            device: targetDevice,
            deviceScaleFactor: targetDpr,
            viewport: test.viewport,
            initialProfile: test.initialProfile,
            initialLeaderboard: test.initialLeaderboard,
            rawEmptyProfile: test.rawEmptyProfile
          });
          session._profileKey = targetProfileKey;
          if (!test.manualBoot) {
            await helpers.bootAndWait(session.page, args.url, { timeoutMs: 45000 });
          }
        } else {
          helpers.resetTrackers(session.trackers);
          session.apiMock.reset();
          await helpers.resetSessionState(session.page, { lang: (test.initialProfile && test.initialProfile.lang) || "vi" });
        }

        await runWithTimeout(
          () => test.run({
            page: session.page,
            browser,
            trackers: session.trackers,
            apiMock: session.apiMock,
            url: args.url,
            helpers
          }),
          test.timeoutMs || args.timeoutMs,
          test.id
        );
        helpers.assertZeroErrors(session.trackers, test.id);
        if (test.taintedAfter) session.tainted = true;
      } catch (err) {
        status = "FAIL";
        errorMsg = err && err.message ? err.message : String(err);
        awaitingV9Impl = errorMsg.includes("[AWAITING_V9_IMPL]");
        if (session) session.tainted = true;
      }

      const durationMs = Date.now() - t0;
      results.push({
        id: test.id,
        tier: test.tier,
        feature: test.feature,
        title: test.title,
        device: targetDevice,
        status,
        awaitingV9Impl,
        durationMs,
        error: errorMsg
      });

      const tag = status === "PASS"
        ? "PASS"
        : (awaitingV9Impl ? "FAIL(AWAITING_V9)" : "FAIL");
      console.log(`[${idx + 1}/${selected.length}] ${tag.padEnd(18)} ${test.id} (${durationMs}ms) — ${test.title}`);
      if (errorMsg) {
        console.log(`    -> ${errorMsg.split("\n")[0]}`);
      }
    }
  } finally {
    if (session) await session.close();
  }

  const passedCount = results.filter((r) => r.status === "PASS").length;
  const failedCount = results.length - passedCount;
  const awaitingCount = results.filter((r) => r.awaitingV9Impl).length;

  const summary = {
    mode: "suite",
    tier: args.tier,
    filter: args.filter,
    url: args.url,
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    awaitingV9Impl: awaitingCount,
    durationMs: Date.now() - startedAt,
    results
  };

  if (args.json) {
    writeJsonReport(args.json, summary);
  }

  console.log(`\n=== Summary: ${passedCount}/${results.length} PASS, ${failedCount} FAIL (${awaitingCount} awaiting v9.0 impl) in ${summary.durationMs}ms ===`);
  return failedCount === 0 ? 0 : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allSpecs = loadAllSpecs();

  if (args.list) {
    const selected = selectSpecs(allSpecs, args);
    printList(selected, args);
    process.exit(0);
  }

  let selected = null;
  if (!args.smoke) {
    selected = selectSpecs(allSpecs, args);
    if (!selected.length) {
      if (args.json) {
        writeJsonReport(args.json, {
          mode: "suite",
          tier: args.tier,
          filter: args.filter,
          url: args.url,
          total: 0,
          passed: 0,
          failed: 0,
          awaitingV9Impl: 0,
          durationMs: 0,
          results: []
        });
      }
      console.error("No tests matched selection criteria.");
      process.exit(1);
    }
  }

  const browser = await helpers.launchBrowser({ headed: args.headed });
  let exiting = false;
  const onSignal = async (sig) => {
    if (exiting) return;
    exiting = true;
    console.error(`\nReceived ${sig}; closing active session and browser...`);
    try { await helpers.closeActiveSession(); } catch {}
    try { await browser.close(); } catch {}
    process.exit(sig === "SIGTERM" ? 143 : 130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  let exitCode = 1;
  try {
    if (args.smoke) {
      exitCode = await runSmoke(browser, args);
    } else {
      exitCode = await runSuite(browser, args, selected);
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await helpers.closeActiveSession();
    await browser.close();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Runner fatal error:", err && err.message ? err.message : err);
  process.exit(1);
});
