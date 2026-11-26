"use strict";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

const VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

module.exports = [
  // ======================== F1: Boot, Preload & Bilingual VI/EN ========================
  {
    id: "T1-F1-01",
    tier: 1,
    feature: "F1",
    title: "Boot & Preload Completion (#loadScr -> hidden, #menu visible, GLB textures loaded)",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    async run({ page, url, helpers }) {
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      const res = await page.evaluate(() => {
        const ls = window.__fpsTest.getLoadState();
        const gunOk = window.__gunTexOk ? window.__gunTexOk() : {};
        const zbOk = window.__zbTexOk ? window.__zbTexOk() : {};
        const menu = document.getElementById("menu");
        return {
          loadDone: !!window.__loadDone,
          loadState: ls,
          menuVisible: !!menu && !menu.classList.contains("hidden"),
          gunOk,
          zbOk
        };
      });
      assert(res.loadDone === true, "window.__loadDone must be true");
      assert(res.loadState.loadScrHidden === true, "#loadScr must have class hidden");
      assert(res.loadState.state === "menu", `Expected state=menu, got ${res.loadState.state}`);
      assert(res.menuVisible === true, "#menu must be visible");
      const gunKeys = ["pistol", "shotgun", "rifle", "thuanthien"];
      for (const k of gunKeys) {
        assert(res.gunOk[k] === true, `Weapon texture ${k} not loaded: ${JSON.stringify(res.gunOk)}`);
      }
      assert(res.zbOk.loaded === 7, `Expected 7 zombie rigs loaded, got ${res.zbOk.loaded}`);
    }
  },
  {
    id: "T1-F1-02",
    tier: 1,
    feature: "F1",
    title: "SwiftShader WebGL Context & GLTFLoader / SkeletonUtils Readiness",
    device: "desktop",
    async run({ page }) {
      const info = await page.evaluate(() => {
        const canvas = FPS.world && FPS.world.renderer && FPS.world.renderer.domElement;
        const gl = FPS.world && FPS.world.renderer && FPS.world.renderer.getContext();
        const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
        return {
          glbLoaders: !!window.__glbLoaders,
          hasGLTFLoader: typeof window.GLTFLoader === "function",
          hasSkeletonUtils: typeof window.SkeletonUtils === "object" && window.SkeletonUtils !== null,
          hasMeshopt: !!window.MeshoptDecoder,
          canvasW: canvas ? canvas.width : 0,
          canvasH: canvas ? canvas.height : 0,
          glValid: !!gl && !gl.isContextLost(),
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : "")
        };
      });
      assert(info.glbLoaders, "window.__glbLoaders must be true");
      assert(info.hasGLTFLoader, "window.GLTFLoader must be a function");
      assert(info.hasSkeletonUtils, "window.SkeletonUtils must be an object");
      assert(info.hasMeshopt, "window.MeshoptDecoder must be defined");
      assert(info.canvasW > 0 && info.canvasH > 0, `Invalid WebGL canvas size ${info.canvasW}x${info.canvasH}`);
      assert(info.glValid, "WebGL context must be valid and not lost");
    }
  },
  {
    id: "T1-F1-03",
    tier: 1,
    feature: "F1",
    title: "VI/EN Language Toggle & FPS.T Key Symmetry (including v9.0 keys)",
    device: "desktop",
    async run({ page, helpers }) {
      const audit = await helpers.auditI18nSymmetry(page);
      assert(audit.missingInEn.length === 0, `FPS.T.vi keys missing in en: ${audit.missingInEn.join(", ")}`);
      assert(audit.missingInVi.length === 0, `FPS.T.en keys missing in vi: ${audit.missingInVi.join(", ")}`);
      assert(audit.missingDataIInVi.length === 0, `[data-i] missing in vi: ${audit.missingDataIInVi.join(", ")}`);
      assert(audit.missingDataIInEn.length === 0, `[data-i] missing in en: ${audit.missingDataIInEn.join(", ")}`);

      await helpers.requireV9(page, "FPS.T v9.0 keys", () => {
        const req = ["objGate", "objGen", "objRelic", "objTotem", "objHoldout", "pressE", "holdE", "shoveV", "qHigh", "qMed", "qLow"];
        const missing = req.filter((k) => !FPS.T.vi[k] || !FPS.T.en[k]);
        return missing.length ? { ok: false, detail: "missing " + missing.join(",") } : { ok: true };
      });

      await helpers.switchLang(page, "en");
      const enCheck = await page.evaluate(() => ({
        htmlLang: document.documentElement.lang,
        btnStart: document.getElementById("btnStart").textContent.trim(),
        expected: FPS.T.en.start.trim(),
        enOn: document.getElementById("langEn").classList.contains("on")
      }));
      assert(enCheck.htmlLang === "en" && enCheck.enOn, "EN toggle did not activate html[lang='en'] and #langEn.on");
      assert(enCheck.btnStart === enCheck.expected, `#btnStart mismatch: "${enCheck.btnStart}" vs "${enCheck.expected}"`);

      await helpers.switchLang(page, "vi");
      const viLang = await page.evaluate(() => document.documentElement.lang);
      assert(viLang === "vi", `Expected vi after toggle back, got ${viLang}`);
    }
  },
  {
    id: "T1-F1-04",
    tier: 1,
    feature: "F1",
    title: "Localized Boot, Quality Badge & v9.0 HUD Strings in EN",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    initialProfile: { highestLevel: 5, lang: "en", quality: "auto" },
    async run({ page, url, helpers }) {
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      await helpers.requireV9(page, "v9.0 EN badges & UI strings", () => {
        const vb = (document.getElementById("verBadge") && document.getElementById("verBadge").textContent) || "";
        const vm = (document.getElementById("volMute") && document.getElementById("volMute").textContent) || "";
        if (!vb.includes("9.0")) return { ok: false, detail: `#verBadge="${vb}" does not mention 9.0` };
        if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(vb)) {
          return { ok: false, detail: `Vietnamese characters in #verBadge: ${vb}` };
        }
        if (!vm.trim()) return { ok: false, detail: "Empty #volMute" };
        return { ok: true };
      });

      await helpers.startLevelAndWait(page, 1);
      const hudCheck = await page.evaluate(() => ({
        verHud: (document.getElementById("verHud")?.textContent || "").trim(),
        qBadge: (document.getElementById("qBadge")?.textContent || "").trim(),
        missionTitle: (document.getElementById("missionTitle")?.textContent || "").trim(),
        objDetail: (document.getElementById("objDetail")?.textContent || "").trim()
      }));
      assert(hudCheck.verHud.includes("9.0"), `Expected #verHud to show v9.0, got "${hudCheck.verHud}"`);
      assert(!VI_DIACRITIC_RE.test(hudCheck.qBadge), `Leftover Vietnamese in #qBadge: "${hudCheck.qBadge}"`);
      assert(!VI_DIACRITIC_RE.test(hudCheck.missionTitle), `Leftover Vietnamese in #missionTitle: "${hudCheck.missionTitle}"`);
    }
  },
  {
    id: "T1-F1-05",
    tier: 1,
    feature: "F1",
    title: "Story Screen Flow & Clean Backend API Mock Interception",
    device: "desktop",
    async run({ page, apiMock, helpers }) {
      apiMock.clearLog();
      // Toggle language via #langEn while #menu is visible so FPSApi.saveProfile({ lang }) fires
      await helpers.switchLang(page, "en");
      for (let i = 0; i < 15 && apiMock.getPosts("profile").length === 0; i++) {
        await page.waitForTimeout(50);
      }
      const profilePosts = apiMock.getPosts("profile");
      assert(
        profilePosts.length >= 1 && profilePosts.some((p) => p.body && p.body.lang === "en"),
        `Expected mocked POST /api/profile with lang='en' on #langEn click, got ${JSON.stringify(profilePosts)}`
      );

      await page.click("#btnStory");
      await page.waitForFunction(() => {
        const s = document.getElementById("storyScr");
        return s && !s.classList.contains("hidden");
      }, null, { timeout: 5000 });

      const storyTxt = await page.textContent("#storyScr [data-i='storyIntro']");
      assert(storyTxt && storyTxt.trim().length > 20, "Story intro text must be populated");

      await page.click("#btnStoryGo");
      await page.waitForFunction(() => {
        const st = window.__fpsTest.getState();
        return st && st.state === "playing" && st.level === 1;
      }, null, { timeout: 10000 });
    }
  },

  // ======================== F2: 5-Map Selection & Verticality ========================
  {
    id: "T1-F2-01",
    tier: 1,
    feature: "F2",
    title: "All 5 Maps Asymmetric (ry!=0), Multi-Height Platforms, Zone Lamps & Cobble Lines",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.requireV9(page, "FPS.LEVELS v9.0 schema", () => {
        if (!FPS.LEVELS || FPS.LEVELS.length !== 5) return { ok: false, detail: "LEVELS length != 5" };
        for (let i = 0; i < 5; i++) {
          const lv = FPS.LEVELS[i];
          if (!lv.walls || !lv.walls.some((w) => Math.abs(w.ry || 0) > 0.05)) {
            return { ok: false, detail: `Map ${i + 1} lacks rotated ry!=0 walls` };
          }
          if (!Array.isArray(lv.platforms) || lv.platforms.length < 1) {
            return { ok: false, detail: `Map ${i + 1} lacks platforms` };
          }
          if (!lv.lamps || !lv.lamps.some((l) => ["amber", "emerald", "crimson"].includes(l.zone))) {
            return { ok: false, detail: `Map ${i + 1} lacks zone-colored lamps` };
          }
          if (!lv.props || !lv.props.some((p) => p.key === "cobble")) {
            return { ok: false, detail: `Map ${i + 1} lacks cobble leading lines` };
          }
          const hasPillar = lv.props.some((p) => p.key === "pillar");
          const hasElevatedWall = lv.walls.some((w) => (w.yBase || 0) > 0);
          if (!hasPillar || !hasElevatedWall) {
            return { ok: false, detail: `Map ${i + 1} lacks walk-through pillar+lintel structure` };
          }
        }
        return { ok: true };
      });
    }
  },
  {
    id: "T1-F2-02",
    tier: 1,
    feature: "F2",
    title: "5-Map Menu Card Selection & UI Launch (Maps 1..5 unlocked)",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      const cardCount = await page.locator("#levelGrid .lvlCard").count();
      assert(cardCount === 5, `Expected 5 .lvlCard buttons, got ${cardCount}`);

      for (const mapId of [3, 5]) {
        await helpers.toMenuAndWait(page);
        const card = page.locator(`#levelGrid .lvlCard[data-level-id="${mapId}"]`);
        await card.click();
        const isSelected = await card.evaluate((el) => el.classList.contains("selected") || el.classList.contains("on"));
        assert(isSelected, `Card ${mapId} did not mark selected after click`);
        await page.click("#btnStart");
        await page.waitForFunction((id) => {
          const st = window.__fpsTest.getState();
          return st && st.state === "playing" && st.level === id;
        }, mapId, { timeout: 15000 });
      }
    }
  },
  {
    id: "T1-F2-03",
    tier: 1,
    feature: "F2",
    title: "Ramp Climb & groundY(x, z, curFootY) Elevation",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "world.groundY & __fpsTest.teleportTo & ramp platform", () => {
        if (typeof FPS.world.groundY !== "function") return { ok: false, detail: "FPS.world.groundY missing" };
        if (typeof window.__fpsTest.teleportTo !== "function") return { ok: false, detail: "__fpsTest.teleportTo missing" };
        const plats = FPS.world.platforms || [];
        const p = plats.find((pl) => pl.ramps && pl.ramps.length > 0 && pl.yTop >= 1.5);
        if (!p) return { ok: false, detail: "No ramped runtime platform >= 1.5m on Map 1" };
        return { ok: true };
      });

      const rampSetup = await page.evaluate(() => {
        const p = FPS.world.platforms.find((pl) => pl.ramps && pl.ramps.length > 0 && pl.yTop >= 1.5);
        const rm = p.ramps[0];
        let lx = 0, lz = 0, ldx = 0, ldz = 0;
        if (rm.side === "s") {
          lx = (rm.xMin + rm.xMax) * 0.5;
          lz = rm.zMax + 0.6;
          ldx = 0; ldz = -1;
        } else if (rm.side === "n") {
          lx = (rm.xMin + rm.xMax) * 0.5;
          lz = rm.zMin - 0.6;
          ldx = 0; ldz = 1;
        } else if (rm.side === "e") {
          lx = rm.xMax + 0.6;
          lz = (rm.zMin + rm.zMax) * 0.5;
          ldx = -1; ldz = 0;
        } else {
          lx = rm.xMin - 0.6;
          lz = (rm.zMin + rm.zMax) * 0.5;
          ldx = 1; ldz = 0;
        }
        const sx = rm.x + (rm.rot ? (lx * rm.cos + lz * rm.sin) : lx);
        const sz = rm.z + (rm.rot ? (-lx * rm.sin + lz * rm.cos) : lz);
        const wdx = rm.rot ? (ldx * rm.cos + ldz * rm.sin) : ldx;
        const wdz = rm.rot ? (-ldx * rm.sin + ldz * rm.cos) : ldz;
        const yaw = Math.atan2(-wdx, -wdz);
        window.__fpsTest.teleportTo(sx, 1.7, sz);
        FPS.state.G.yaw = yaw;
        FPS.state.G.pitch = 0;
        return { yTop: p.yTop, sx, sz, px: p.x, pz: p.z, rLen: rm.rLen, side: rm.side };
      });

      await helpers.holdKey(page, "KeyW", 1800);
      await helpers.waitFrames(page, 3);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(
        st.playerPos.y > 1.7 + rampSetup.yTop * 0.6,
        `Expected playerPos.y to climb ramp toward ${1.7 + rampSetup.yTop}, got ${st.playerPos.y}`
      );
      assert(st.groundY > rampSetup.yTop * 0.5, `Expected groundY > ${rampSetup.yTop * 0.5}, got ${st.groundY}`);
    }
  },
  {
    id: "T1-F2-04",
    tier: 1,
    feature: "F2",
    title: "Walk-Through Central Landmark & Elevated yBase Bullet/Collider Clearance",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "yBase lintel wall & height-aware collide/raycastWallDist", () => {
        const lv = FPS.world.currentLevel;
        const plats = (lv && lv.platforms) || [];
        const hasNonUnderpassPlatAt = (wx, wz) => plats.some((p) => {
          if (p.underpass || p.rampOnly) return false;
          const ry = p.ry || 0;
          const cos = Math.abs(ry) > 0.01 ? Math.cos(ry) : 1;
          const sin = Math.abs(ry) > 0.01 ? Math.sin(ry) : 0;
          const dx = wx - p.x;
          const dz = wz - p.z;
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          return Math.abs(lx) <= (p.w || 4) * 0.5 + 0.6 && Math.abs(lz) <= (p.d || 4) * 0.5 + 0.6;
        });
        const lintel = lv && lv.walls && lv.walls.find((w) => (w.yBase || 0) >= 2.0 && !hasNonUnderpassPlatAt(w.x, w.z));
        if (!lintel) return { ok: false, detail: "No elevated lintel wall (yBase >= 2.0) over clear ground in Map 1" };
        const under = new THREE.Vector3(lintel.x, 1.7, lintel.z);
        const c = FPS.world.collide(under, 0.55, false, 0);
        if (c && c.hit) return { ok: false, detail: "collide() blocked player under elevated lintel" };
        const upDist = FPS.world.raycastWallDist(under, new THREE.Vector3(0, 1, 0), 10);
        if (!(upDist > 0.2 && upDist < 6.0)) return { ok: false, detail: `Upward raycast under lintel gave ${upDist}` };
        return { ok: true };
      });
    }
  },
  {
    id: "T1-F2-05",
    tier: 1,
    feature: "F2",
    title: "Zone Lamp Tints (instanceColor) & Zero PointLights Across All 5 Maps",
    device: "desktop",
    async run({ page, helpers }) {
      for (let lv = 1; lv <= 5; lv++) {
        await helpers.startLevelAndWait(page, lv);
        const perf = await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
        assert(perf.pointLights === 0, `Map ${lv} has ${perf.pointLights} PointLights`);
        await helpers.requireV9(page, `Map ${lv} _lampHaloInst.instanceColor`, () => {
          const inst = FPS.world._lampHaloInst;
          if (!inst || !inst.instanceColor || inst.count <= 0) {
            return { ok: false, detail: "_lampHaloInst missing instanceColor or count <= 0" };
          }
          const arr = inst.instanceColor.array;
          const distinctColors = new Set();
          for (let i = 0; i < inst.count; i++) {
            const r = Math.round(arr[i * 3] * 255);
            const g = Math.round(arr[i * 3 + 1] * 255);
            const b = Math.round(arr[i * 3 + 2] * 255);
            distinctColors.add(`${r},${g},${b}`);
          }
          const zones = new Set((FPS.world.currentLevel && FPS.world.currentLevel.lamps || []).map((l) => l.zone).filter(Boolean));
          if (zones.size > 1 && distinctColors.size <= 1) {
            return { ok: false, detail: `Map has ${zones.size} lamp zones but _lampHaloInst has only ${distinctColors.size} color` };
          }
          return { ok: true, detail: `count=${inst.count}, colors=${distinctColors.size}` };
        });
      }
    }
  },

  // ======================== F3: 5 Stage Dynamic Objectives ========================
  {
    id: "T1-F3-01",
    tier: 1,
    feature: "F3",
    title: "M1 Mist Dead-End — Quota + Destructible Wooden Exit Gate",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "M1 objective.type === 'gate'", () => {
        const obj = FPS.LEVELS[0] && FPS.LEVELS[0].objective;
        if (!obj || obj.type !== "gate") return { ok: false, detail: "Map 1 objective != gate" };
        if (typeof window.__fpsTest.damageObjective !== "function") return { ok: false, detail: "__fpsTest.damageObjective missing" };
        return { ok: true };
      });

      const afterQuota = await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        return window.__fpsTest.getState();
      });
      // Gate still alive -> portal should wait for gate destruction OR gate blocks exfil
      assert(
        afterQuota.portalUnlocked === false || (afterQuota.objState && !afterQuota.objState.gateBroken),
        "M1 gate should not already be broken before damaging gate"
      );

      await page.evaluate(() => {
        window.__fpsTest.damageObjective(9999);
      });
      await helpers.waitFrames(page, 3);
      const afterGate = await page.evaluate(() => window.__fpsTest.getState());
      assert(afterGate.portalUnlocked === true, "Portal must unlock after quota + gate destroyed");

      await page.evaluate(() => { window.__fpsTest.teleportToExtract(); });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "levelclear", null, { timeout: 8000 });
    }
  },
  {
    id: "T1-F3-02",
    tier: 1,
    feature: "F3",
    title: "M2 Night Market — 2 Generators (2s Hold E) + Panic Horde + Bright Lamps",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "M2 generators objective", () => {
        const obj = FPS.LEVELS[1] && FPS.LEVELS[1].objective;
        if (!obj || obj.type !== "generators" || !Array.isArray(obj.items) || obj.items.length < 2) {
          return { ok: false, detail: "Map 2 objective != 2 generators" };
        }
        return { ok: true };
      });

      for (let gi = 0; gi < 2; gi++) {
        await page.evaluate((idx) => {
          const g = FPS.LEVELS[1].objective.items[idx];
          window.__fpsTest.teleportTo(g.x, (g.y || 0) + 1.7, g.z + 1.2);
        }, gi);
        await helpers.holdKey(page, "KeyE", 2250);
        await helpers.waitFrames(page, 2);
      }

      const st = await page.evaluate(() => window.__fpsTest.getState());
      const activated = st.objState && (st.objState.activatedCount ?? st.objState.done ?? 0);
      assert(activated >= 2, `Expected 2 generators activated, got ${JSON.stringify(st.objState)}`);
      assert(
        Boolean(st.objState && st.objState.lightsBright) && (st.panicT > 0 || Boolean(st.objState && st.objState.panicActive)),
        `Expected BOTH bright lamps AND panic horde active, got ${JSON.stringify(st.objState)} (panicT=${st.panicT})`
      );
    }
  },
  {
    id: "T1-F3-03",
    tier: 1,
    feature: "F3",
    title: "M3 Pine Forest — Carry 2 Linh's Relics + -12% Sprint Speed Penalty",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 3);
      await helpers.requireV9(page, "M3 relics objective", () => {
        const obj = FPS.LEVELS[2] && FPS.LEVELS[2].objective;
        if (!obj || obj.type !== "relics" || !Array.isArray(obj.items) || obj.items.length < 2) {
          return { ok: false, detail: "Map 3 objective != 2 relics" };
        }
        return { ok: true };
      });

      // Baseline sprint speed (m/s across fixed frames, atomically bracketed by G.time)
      const baseDist = await (async () => {
        await page.evaluate(() => {
          const sp = FPS.LEVELS[2].playerSpawn;
          window.__fpsTest.teleportTo(sp.x, 1.7, sp.z);
          FPS.state.G.yaw = sp.yaw || 0;
          FPS.state.G.stamina = 100;
        });
        await page.keyboard.down("ShiftLeft");
        await page.keyboard.down("KeyW");
        await helpers.waitFrames(page, 1);
        const start = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await helpers.waitFrames(page, 6);
        const end = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await page.keyboard.up("KeyW");
        await page.keyboard.up("ShiftLeft");
        return Math.hypot(end.p.x - start.p.x, end.p.z - start.p.z) / Math.max(0.01, end.t - start.t);
      })();

      // Pick up Relic 0
      await page.evaluate(() => {
        const r = FPS.LEVELS[2].objective.items[0];
        window.__fpsTest.teleportTo(r.x, (r.y || 0) + 1.7, r.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 3);
      const afterR0 = await page.evaluate(() => window.__fpsTest.getState());
      assert(afterR0.carryingRelics >= 1, `Expected carryingRelics >= 1 after KeyE, got ${afterR0.carryingRelics}`);

      // Measure encumbered sprint speed
      const relicDist = await (async () => {
        await page.evaluate(() => {
          const sp = FPS.LEVELS[2].playerSpawn;
          window.__fpsTest.teleportTo(sp.x, 1.7, sp.z);
          FPS.state.G.yaw = sp.yaw || 0;
          FPS.state.G.stamina = 100;
        });
        await page.keyboard.down("ShiftLeft");
        await page.keyboard.down("KeyW");
        await helpers.waitFrames(page, 1);
        const start = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await helpers.waitFrames(page, 6);
        const end = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await page.keyboard.up("KeyW");
        await page.keyboard.up("ShiftLeft");
        return Math.hypot(end.p.x - start.p.x, end.p.z - start.p.z) / Math.max(0.01, end.t - start.t);
      })();

      const ratio = relicDist / Math.max(0.01, baseDist);
      assert(ratio < 0.96 && ratio > 0.75, `Expected ~12% sprint penalty (ratio ~0.88), got ${ratio.toFixed(3)} (${relicDist.toFixed(2)}/${baseDist.toFixed(2)})`);

      // Pick up Relic 1 & deliver
      await page.evaluate(() => {
        const r = FPS.LEVELS[2].objective.items[1];
        window.__fpsTest.teleportTo(r.x, (r.y || 0) + 1.7, r.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 3);
      const afterR1 = await page.evaluate(() => window.__fpsTest.getState());
      assert(afterR1.carryingRelics === 2 || (afterR1.objState && afterR1.objState.collected >= 2), "Expected 2 relics collected");
    }
  },
  {
    id: "T1-F3-04",
    tier: 1,
    feature: "F3",
    title: "M4 Graveyard — 3 Cursed Totems & Orc Grave Lord Armor Debuff",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "M4 totems objective", () => {
        const obj = FPS.LEVELS[3] && FPS.LEVELS[3].objective;
        if (!obj || obj.type !== "totems" || !Array.isArray(obj.items) || obj.items.length < 3) {
          return { ok: false, detail: "Map 4 objective != 3 totems" };
        }
        if (typeof FPS.entities.applyArmorShield !== "function") {
          return { ok: false, detail: "FPS.entities.applyArmorShield missing" };
        }
        return { ok: true };
      });

      const shieldTest = await page.evaluate(() => {
        const armored = FPS.entities.applyArmorShield(100);
        window.__fpsTest.damageObjective(9999);
        const unarmored = FPS.entities.applyArmorShield(100);
        const st = window.__fpsTest.getState();
        return { armored, unarmored, objState: st.objState };
      });
      assert(
        shieldTest.armored < shieldTest.unarmored,
        `Expected Orc shield damage (${shieldTest.armored}) < unshielded (${shieldTest.unarmored})`
      );
      const broken = shieldTest.objState && (shieldTest.objState.brokenTotems ?? shieldTest.objState.broken ?? 0);
      assert(broken >= 3, `Expected all 3 totems broken, got ${JSON.stringify(shieldTest.objState)}`);
    }
  },
  {
    id: "T1-F3-05",
    tier: 1,
    feature: "F3",
    title: "M5 Ghost River — Signal Flare + 25s Pier Holdout + Minotaur + Boat Exfil",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "M5 holdout objective", () => {
        const obj = FPS.LEVELS[4] && FPS.LEVELS[4].objective;
        if (!obj || obj.type !== "holdout" || !obj.flarePos) {
          return { ok: false, detail: "Map 5 objective != holdout with flarePos" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const fp = FPS.LEVELS[4].objective.flarePos;
        window.__fpsTest.teleportTo(fp.x, (fp.y || 0) + 1.7, fp.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 4);

      const afterFlare = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const os = st.objState || {};
        const timerVal = os.holdLeft ?? os.holdoutLeft ?? os.timeLeft ?? os.remaining ?? os.holdRemaining ?? os.holdElapsed ?? os.elapsed ?? FPS.state?.G?.objProgress ?? null;
        return { objState: st.objState, timerVal };
      });
      assert(
        afterFlare.objState && (afterFlare.objState.flareLit || afterFlare.objState.holdoutActive),
        `Expected flare lit / holdout active, got ${JSON.stringify(afterFlare.objState)}`
      );

      // Verify holdout countdown ticks and Minotaur spawns during holdout before completing via test hook
      await page.waitForTimeout(1100);
      const midHoldout = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const os = st.objState || {};
        const timerVal = os.holdLeft ?? os.holdoutLeft ?? os.timeLeft ?? os.remaining ?? os.holdRemaining ?? os.holdElapsed ?? os.elapsed ?? FPS.state?.G?.objProgress ?? null;
        const hasMinotaur = FPS.entities.zombies.some((z) => z.type === "minotaur");
        return { objState: st.objState, timerVal, hasMinotaur };
      });
      assert(
        afterFlare.timerVal !== null && midHoldout.timerVal !== null && midHoldout.timerVal !== afterFlare.timerVal,
        `Expected M5 holdout timer countdown to progress over 1100ms (${afterFlare.timerVal} -> ${midHoldout.timerVal})`
      );
      assert(midHoldout.hasMinotaur, "Expected Minotaur boss to spawn during M5 holdout");

      // Complete holdout + Minotaur via test hook and extract to Campaign Win
      await page.evaluate(() => {
        window.__fpsTest.damageObjective(9999);
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "end", null, { timeout: 10000 });
      const endText = await page.textContent("#endTitle");
      const expectedWin = await page.evaluate(() => FPS.t("winT"));
      assert(endText.trim() === expectedWin.trim(), `Expected win title "${expectedWin}", got "${endText}"`);
    }
  },

  // ======================== F4: 3 Special Infected ========================
  {
    id: "T1-F4-01",
    tier: 1,
    feature: "F4",
    title: "FPS.ZOMBIE_TYPES Schema (normal/runner/brute/spitter/bloater/stalker/orcking/minotaur)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.requireV9(page, "FPS.ZOMBIE_TYPES", () => {
        const zt = FPS.ZOMBIE_TYPES;
        if (!zt) return { ok: false, detail: "FPS.ZOMBIE_TYPES missing" };
        const req = ["normal", "runner", "brute", "spitter", "bloater", "stalker", "orcking", "minotaur"];
        const miss = req.filter((k) => !zt[k]);
        if (miss.length) return { ok: false, detail: "missing " + miss.join(",") };
        if (zt.spitter.rig !== "skeleton" || zt.bloater.rig !== "troll" || zt.stalker.rig !== "ghost") {
          return { ok: false, detail: "Invalid special rigs" };
        }
        if (!(zt.spitter.scrap > 0 && zt.bloater.scrap > 0 && zt.stalker.scrap > 0)) {
          return { ok: false, detail: "Specials missing scrap reward" };
        }
        return { ok: true };
      });
    }
  },
  {
    id: "T1-F4-02",
    tier: 1,
    feature: "F4",
    title: "Acid Spitter Ranged Spit & 5s Acid Pool Hazard",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "triggerSpecial('spitter') & spawnAcidPool", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "__fpsTest.triggerSpecial missing" };
        if (typeof FPS.entities.spawnAcidPool !== "function") return { ok: false, detail: "FPS.entities.spawnAcidPool missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const z = window.__fpsTest.triggerSpecial("spitter");
        const pos = window.__fpsTest.getState().playerPos;
        FPS.entities.spawnAcidPool(pos.x, 0, pos.z);
        const st = window.__fpsTest.getState();
        return { spawned: !!z, st };
      });
      assert(res.spawned, "triggerSpecial('spitter') must spawn a Spitter");
      assert(res.st.specialsAlive >= 1, `Expected specialsAlive >= 1, got ${res.st.specialsAlive}`);

      const hpBefore = await page.evaluate(() => window.__fpsTest.getState().hp);
      await page.waitForTimeout(1200);
      const hpAfter = await page.evaluate(() => window.__fpsTest.getState().hp);
      assert(hpAfter < hpBefore, `Expected player standing in acid pool to lose HP (${hpBefore} -> ${hpAfter})`);
    }
  },
  {
    id: "T1-F4-03",
    tier: 1,
    feature: "F4",
    title: "Bloater Death AoE Explosion, Player Knockback & Screen Blind (#blackoutVeil)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "triggerSpecial('bloater') & showBloaterBlind", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "__fpsTest.triggerSpecial missing" };
        if (typeof FPS.ui.showBloaterBlind !== "function") return { ok: false, detail: "FPS.ui.showBloaterBlind missing" };
        return { ok: true };
      });

      const before = await page.evaluate(() => {
        const st0 = window.__fpsTest.getState();
        FPS.entities.zombies.forEach((z) => { delete z.__t1f403Target; });
        const b = window.__fpsTest.triggerSpecial("bloater") || FPS.entities.zombies.find((z) => !z.dead && z.type === "bloater");
        if (b && b.group) {
          b.__t1f403Target = true;
          const bx = st0.playerPos.x;
          const bz = st0.playerPos.z - 2.5;
          const gy = FPS.world.groundY ? FPS.world.groundY(bx, bz, 0) : 0;
          b.spawnT = 0;
          b.group.position.set(bx, gy, bz);
        }
        return { pos: st0.playerPos, hp: st0.hp, ok: Boolean(b && b.group) };
      });
      assert(before.ok, "Failed to spawn bloater");

      // Kill bloater cleanly via entities.killZombie or lethal damage
      await page.evaluate(() => {
        const bloater = FPS.entities.zombies.find((z) => !z.dead && z.__t1f403Target);
        if (bloater) FPS.entities.damageZombie(bloater, 9999, false);
      });
      await helpers.waitFrames(page, 3);

      const after = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const veil = document.getElementById("blackoutVeil");
        const veilOp = veil ? parseFloat(getComputedStyle(veil).opacity || "0") : 0;
        return { pos: st.playerPos, hp: st.hp, veilOp };
      });
      assert(after.hp < before.hp, `Expected close bloater explosion to damage player (${before.hp} -> ${after.hp})`);
      const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
      assert(moved > 0.1 || after.veilOp > 0.05, "Expected bloater knockback or #blackoutVeil blind effect");
    }
  },
  {
    id: "T1-F4-04",
    tier: 1,
    feature: "F4",
    title: "Phantom Stalker Translucent Flank & 1.5s Scream Telegraph (#shadowDash)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "triggerSpecial('stalker') & showStalkerWarn", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "__fpsTest.triggerSpecial missing" };
        if (typeof FPS.ui.showStalkerWarn !== "function") return { ok: false, detail: "FPS.ui.showStalkerWarn missing" };
        return { ok: true };
      });

      const stalkerInfo = await page.evaluate(async () => {
        const s = window.__fpsTest.triggerSpecial("stalker") || FPS.entities.zombies.find((z) => !z.dead && z.type === "stalker");
        let minOpacity = 1;
        if (s && s.group) {
          s.group.traverse((o) => {
            if (o.isMesh && o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m) => { if (typeof m.opacity === "number") minOpacity = Math.min(minOpacity, m.opacity); });
            }
          });
        }
        FPS.ui.showStalkerWarn();
        const dash = document.getElementById("shadowDash");
        const op0 = dash ? parseFloat(getComputedStyle(dash).opacity || "0") : 0;
        await new Promise((r) => setTimeout(r, 120));
        const op1 = dash ? parseFloat(getComputedStyle(dash).opacity || "0") : 0;
        return { ok: Boolean(s && s.group), minOpacity, dashOp: Math.max(op0, op1) };
      });
      assert(stalkerInfo.ok, "Failed to spawn stalker");
      assert(stalkerInfo.minOpacity <= 0.55, `Expected translucent stalker opacity <= 0.55, got ${stalkerInfo.minOpacity}`);
      assert(stalkerInfo.dashOp > 0.05, `Expected #shadowDash opacity > 0.05 on showStalkerWarn(), got ${stalkerInfo.dashOp}`);
    }
  },
  {
    id: "T1-F4-05",
    tier: 1,
    feature: "F4",
    title: "Special Infected Pool & Reset Integrity Across Level Transitions",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "triggerSpecial & specialsAlive", () => {
        const st = window.__fpsTest.getState();
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "__fpsTest.triggerSpecial missing" };
        if (!("specialsAlive" in st)) return { ok: false, detail: "getState().specialsAlive missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.triggerSpecial("spitter");
        window.__fpsTest.triggerSpecial("bloater");
        window.__fpsTest.triggerSpecial("stalker");
      });
      await helpers.waitFrames(page, 2);
      const mid = await page.evaluate(() => window.__fpsTest.getState());
      assert(mid.specialsAlive >= 3, `Expected >= 3 specialsAlive, got ${mid.specialsAlive}`);

      await helpers.startLevelAndWait(page, 2);
      const resetSt = await page.evaluate(() => window.__fpsTest.getState());
      assert(resetSt.specialsAlive === 0, `Expected specialsAlive === 0 after level reset, got ${resetSt.specialsAlive}`);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
    }
  },

  // ======================== F5: Scrap Economy, Streak, Armory & Anvil ========================
  {
    id: "T1-F5-01",
    tier: 1,
    feature: "F5",
    title: "Starting Loadout (Pistol + Thuan Thien Sword) & Locked Shotgun/Rifle",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "unlockedWeapons & weaponTiers", () => {
        const st = window.__fpsTest.getState();
        if (!st.unlockedWeapons) return { ok: false, detail: "getState().unlockedWeapons missing" };
        if (!st.weaponTiers) return { ok: false, detail: "getState().weaponTiers missing" };
        return { ok: true };
      });

      const st0 = await page.evaluate(() => window.__fpsTest.getState());
      assert(st0.curWeapon === "pistol", `Expected starting curWeapon=pistol, got ${st0.curWeapon}`);
      assert(st0.unlockedWeapons.pistol === true && st0.unlockedWeapons.thuanthien === true, "Pistol & Thuan Thien must be unlocked at start");
      assert(st0.unlockedWeapons.shotgun === false && st0.unlockedWeapons.rifle === false, "Shotgun & Rifle must be locked at start");

      await page.keyboard.press("Digit2");
      await page.keyboard.press("Digit3");
      await helpers.waitFrames(page, 2);
      const afterLocked = await page.evaluate(() => window.__fpsTest.getState().curWeapon);
      assert(afterLocked === "pistol", `Pressing 2/3 must NOT switch to locked weapons, got ${afterLocked}`);

      await page.keyboard.press("Digit4");
      await helpers.waitFrames(page, 2);
      const afterSword = await page.evaluate(() => window.__fpsTest.getState().curWeapon);
      assert(afterSword === "thuanthien", `Pressing 4 must switch to thuanthien, got ${afterSword}`);
    }
  },
  {
    id: "T1-F5-02",
    tier: 1,
    feature: "F5",
    title: "Scrap Gain on Headshot Kill & Streak Combo x1.5–x3.0 (#scrapVal, #comboBadge)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "scrap & hsStreak & #scrapVal/#comboBadge", () => {
        const st = window.__fpsTest.getState();
        if (!("scrap" in st) || !("hsStreak" in st) || !("hsMult" in st)) {
          return { ok: false, detail: "Missing scrap/hsStreak/hsMult in getState()" };
        }
        if (!document.getElementById("scrapVal") || !document.getElementById("comboBadge")) {
          return { ok: false, detail: "Missing #scrapVal or #comboBadge DOM" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        for (let i = 0; i < 4; i++) {
          const z = FPS.entities.spawnZombie("normal");
          if (z) FPS.entities.damageZombie(z, 999, true);
        }
        FPS.ui.updateHUD();
        return {
          st: window.__fpsTest.getState(),
          scrapTxt: document.getElementById("scrapVal").textContent,
          comboTxt: document.getElementById("comboBadge").textContent
        };
      });
      assert(res.st.scrap > 0, `Expected scrap > 0 after kills, got ${res.st.scrap}`);
      assert(res.st.hsStreak >= 4, `Expected hsStreak >= 4, got ${res.st.hsStreak}`);
      assert(res.st.hsMult >= 1.5 && res.st.hsMult <= 3.0, `Expected hsMult in [1.5, 3.0], got ${res.st.hsMult}`);
      assert(res.scrapTxt.includes(String(res.st.scrap)), `#scrapVal ("${res.scrapTxt}") should display ${res.st.scrap}`);
      const comboTrim = (res.comboTxt || "").trim();
      assert(
        comboTrim.length > 0 && (
          comboTrim.includes(String(res.st.hsMult)) ||
          comboTrim.includes(res.st.hsMult.toFixed(1)) ||
          /x\s*[123]/i.test(comboTrim)
        ),
        `#comboBadge ("${res.comboTxt}") must be non-empty and reflect active multiplier ${res.st.hsMult}`
      );
    }
  },
  {
    id: "T1-F5-03",
    tier: 1,
    feature: "F5",
    title: "Armory Chest Unlock of Shotgun & Rifle via #armoryScr",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Armory modal & __fpsTest.grantScrap", () => {
        if (typeof window.__fpsTest.grantScrap !== "function") return { ok: false, detail: "__fpsTest.grantScrap missing" };
        if (!FPS.LEVELS[0].armory) return { ok: false, detail: "Map 1 armory station missing" };
        if (!document.getElementById("armoryScr")) return { ok: false, detail: "#armoryScr missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(400);
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => {
        const el = document.getElementById("armoryScr");
        return el && !el.classList.contains("hidden");
      }, null, { timeout: 5000 });

      await helpers.assertZOrderAbove(page, "#armoryScr", ["#hud", "#muteBtn"]);

      // Click unlock shotgun & rifle inside #armoryList
      await helpers.clickArmoryAction(page, "unlock", "shotgun");
      await helpers.clickArmoryAction(page, "unlock", "rifle");
      await page.click("#btnArmoryClose");
      await helpers.waitFrames(page, 2);

      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.unlockedWeapons.shotgun === true && st.unlockedWeapons.rifle === true, "Shotgun & Rifle should both be unlocked");
      assert(st.scrap < 400, `Expected scrap deducted from 400, got ${st.scrap}`);

      await page.keyboard.press("Digit2");
      await helpers.waitFrames(page, 2);
      const curW = await page.evaluate(() => window.__fpsTest.getState().curWeapon);
      assert(curW === "shotgun", `Expected Digit2 to equip unlocked shotgun, got ${curW}`);
    }
  },
  {
    id: "T1-F5-04",
    tier: 1,
    feature: "F5",
    title: "Upgrade Anvil Mk.I -> Mk.II -> Mk.III & FPS.WEAPONS Immutability",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      const weaponsBefore = await page.evaluate(() => JSON.stringify(FPS.WEAPONS));
      await helpers.requireV9(page, "Anvil station & upgradeWeapon", () => {
        if (!FPS.LEVELS[1].anvil) return { ok: false, detail: "Map 2 anvil station missing" };
        if (typeof FPS.entities.upgradeWeapon !== "function") return { ok: false, detail: "FPS.entities.upgradeWeapon missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(1000);
        const anv = FPS.LEVELS[1].anvil;
        window.__fpsTest.teleportTo(anv.x, (anv.y || 0) + 1.7, anv.z + 1.2);
      });
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => {
        const el = document.getElementById("armoryScr");
        return el && !el.classList.contains("hidden");
      }, null, { timeout: 5000 });

      await helpers.clickArmoryAction(page, "upgrade", "pistol"); // Mk.I -> Mk.II
      await helpers.clickArmoryAction(page, "upgrade", "pistol"); // Mk.II -> Mk.III
      await page.click("#btnArmoryClose");

      const after = await page.evaluate(() => {
        const ws = FPS.entities.wState.pistol;
        const cap = (FPS.entities.getWeaponStats ? FPS.entities.getWeaponStats("pistol").mag : null)
          ?? ws.maxMag
          ?? ws.mag;
        return {
          st: window.__fpsTest.getState(),
          weaponsAfter: JSON.stringify(FPS.WEAPONS),
          pistolMag: ws.mag,
          pistolMaxMag: ws.maxMag ?? null,
          pistolCap: cap
        };
      });
      assert(after.st.weaponTiers.pistol === 3, `Expected pistol tier 3, got ${after.st.weaponTiers.pistol}`);
      assert(after.pistolCap > 12 || after.pistolMag > 12, `Expected Mk.III pistol capacity > 12, got cap=${after.pistolCap}, mag=${after.pistolMag}`);
      assert(after.weaponsAfter === weaponsBefore, "FPS.WEAPONS base config MUST NOT be mutated by upgrades!");
    }
  },
  {
    id: "T1-F5-05",
    tier: 1,
    feature: "F5",
    title: "Mk.III Incendiary Fire DoT Verification",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "Mk.III fire DoT", () => {
        if (typeof FPS.entities.upgradeWeapon !== "function") return { ok: false, detail: "upgradeWeapon missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        window.__fpsTest.grantScrap(1000);
        FPS.entities.upgradeWeapon("pistol");
        FPS.entities.upgradeWeapon("pistol");
        FPS.entities.zombies.forEach((z) => { delete z.__t1f505Target; });
        const brute = FPS.entities.spawnZombie("brute");
        if (!brute || !brute.group) throw new Error("Failed to spawn brute");
        brute.__t1f505Target = true;
        const st = window.__fpsTest.getState();
        const origin = new THREE.Vector3(st.playerPos.x, 1.4, st.playerPos.z);
        const dirs = [
          [0, -1], [1, 0], [0, 1], [-1, 0],
          [0.707, -0.707], [-0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]
        ];
        let chosen = [0, -1];
        for (const [dx, dz] of dirs) {
          const dist = FPS.world.raycastWallDist(origin, new THREE.Vector3(dx, 0, dz), 10);
          if (dist >= 4.5) {
            chosen = [dx, dz];
            break;
          }
        }
        const tx = st.playerPos.x + chosen[0] * 4.0;
        const tz = st.playerPos.z + chosen[1] * 4.0;
        const gy = FPS.world.groundY ? FPS.world.groundY(tx, tz, 0) : 0;
        const yaw = Math.atan2(-chosen[0], -chosen[1]);
        brute.spawnT = 0;
        brute.group.position.set(tx, gy, tz);
        FPS.state.G.yaw = yaw;
        FPS.state.G.pitch = 0;
        FPS.world.camera.position.set(st.playerPos.x, st.playerPos.y, st.playerPos.z);
        FPS.world.camera.rotation.set(0, yaw, 0, "YXZ");
        FPS.world.camera.updateMatrixWorld(true);
        FPS.entities.shoot();
        return { hp0: brute.hp, baseHp: FPS.ZOMBIE_TYPES.brute.hp };
      });
      assert(res.hp0 > 0 && res.hp0 < res.baseHp, `Expected single Mk.III shot to damage brute (hp=${res.hp0})`);
      await page.waitForTimeout(1400);
      const hp1 = await page.evaluate(() => {
        const brute = FPS.entities.zombies.find((z) => !z.dead && z.__t1f505Target);
        return brute ? brute.hp : 0;
      });
      assert(hp1 < res.hp0, `Expected Mk.III fire DoT to reduce brute HP over 1.4s (${res.hp0} -> ${hp1})`);
    }
  },

  // ======================== F6: Traps, Barricades & Quick Shove ========================
  {
    id: "T1-F6-01",
    tier: 1,
    feature: "F6",
    title: "Quick Melee Shove via KeyV & Right-Click (22 Stamina, Contextmenu Suppressed)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "FPS.entities.shove & KeyV", () => {
        if (typeof FPS.entities.shove !== "function") return { ok: false, detail: "FPS.entities.shove missing" };
        return { ok: true };
      });

      const s0 = await page.evaluate(() => window.__fpsTest.getState().stamina);
      await page.keyboard.press("KeyV");
      await helpers.waitFrames(page, 2);
      const afterV = await page.evaluate(() => window.__fpsTest.getState());
      assert(afterV.curWeapon === "pistol", "Shove must not swap away from pistol");
      assert(afterV.stamina <= s0 - 18 && afterV.stamina >= s0 - 25, `Expected ~22 stamina used, got ${s0} -> ${afterV.stamina}`);

      // Wait for shove CD + restore stamina, then test Right-Click
      await page.waitForTimeout(800);
      await page.evaluate(() => { FPS.state.G.stamina = 100; });
      await page.mouse.click(640, 400, { button: "right" });
      await helpers.waitFrames(page, 2);
      const afterRmb = await page.evaluate(() => window.__fpsTest.getState());
      assert(afterRmb.stamina <= 82, `Expected RMB shove to consume 22 stamina, got ${afterRmb.stamina}`);
    }
  },
  {
    id: "T1-F6-02",
    tier: 1,
    feature: "F6",
    title: "Shove 2.4m Cone Knockback & Stagger",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "FPS.entities.shove knockback", () => {
        if (typeof FPS.entities.shove !== "function") return { ok: false, detail: "shove missing" };
        return { ok: true };
      });

      const d0 = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        FPS.entities.zombies.forEach((x) => { delete x.__t1f602Target; });
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        z.__t1f602Target = true;
        const origin = new THREE.Vector3(st.playerPos.x, 1.4, st.playerPos.z);
        const dirs = [
          [0, -1], [1, 0], [0, 1], [-1, 0],
          [0.707, -0.707], [-0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]
        ];
        let chosen = [0, -1];
        for (const [dx, dz] of dirs) {
          if (FPS.world.raycastWallDist(origin, new THREE.Vector3(dx, 0, dz), 10) >= 4.5) {
            chosen = [dx, dz];
            break;
          }
        }
        const zx = st.playerPos.x + chosen[0] * 1.5;
        const zz = st.playerPos.z + chosen[1] * 1.5;
        const gy = FPS.world.groundY ? FPS.world.groundY(zx, zz, 0) : 0;
        z.spawnT = 0;
        z.group.position.set(zx, gy, zz);
        FPS.state.G.yaw = Math.atan2(-chosen[0], -chosen[1]);
        FPS.state.G.stamina = 100;
        return 1.5;
      });

      await page.keyboard.press("KeyV");
      await helpers.waitFrames(page, 4);

      const d1 = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const z = FPS.entities.zombies.find((x) => !x.dead && x.__t1f602Target);
        if (!z) return 0;
        return Math.hypot(z.group.position.x - st.playerPos.x, z.group.position.z - st.playerPos.z);
      });
      assert(d1 > d0 + 0.5, `Expected zombie knocked back from ${d0}m to > ${d0 + 0.5}m, got ${d1.toFixed(2)}m`);
    }
  },
  {
    id: "T1-F6-03",
    tier: 1,
    feature: "F6",
    title: "Chokepoint Trap Activation (E), Zombie Damage & 25s Cooldown",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "traps & activateTrap", () => {
        if (!FPS.LEVELS[0].traps || !FPS.LEVELS[0].traps.length) return { ok: false, detail: "Map 1 traps missing" };
        if (typeof FPS.world.activateTrap !== "function") return { ok: false, detail: "activateTrap missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const t = FPS.LEVELS[0].traps[0];
        window.__fpsTest.teleportTo(t.x, (t.y || 0) + 1.7, t.z + 1.0);
        FPS.entities.zombies.forEach((x) => { delete x.__t1f603Target; });
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        z.__t1f603Target = true;
        const gy = FPS.world.groundY ? FPS.world.groundY(t.x, t.z, 0) : (t.y || 0);
        z.spawnT = 0;
        z.group.position.set(t.x, gy, t.z);
      });
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(700);

      const trapState = await page.evaluate(() => {
        const t = FPS.world.traps && FPS.world.traps[0];
        const z = FPS.entities.zombies.find((x) => x.__t1f603Target);
        return {
          active: !!(t && t.active),
          cd: t ? (t.cdT ?? t.cdLeft ?? -1) : -1,
          zHp: z ? z.hp : 0,
          baseHp: FPS.ZOMBIE_TYPES.normal.hp
        };
      });
      assert(trapState.active || trapState.cd > 0, `Trap should be active or cooling down, got ${JSON.stringify(trapState)}`);
      assert(trapState.zHp < trapState.baseHp, `Zombie inside trap should take damage (${trapState.zHp}/${trapState.baseHp})`);
    }
  },
  {
    id: "T1-F6-04",
    tier: 1,
    feature: "F6",
    title: "Destructible Wooden Barricade Blocks Movement & Breaks",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "barricades & damageBarricade", () => {
        if (!FPS.LEVELS[0].barricades || !FPS.LEVELS[0].barricades.length) return { ok: false, detail: "Map 1 barricades missing" };
        if (typeof FPS.world.damageBarricade !== "function") return { ok: false, detail: "damageBarricade missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const b = FPS.LEVELS[0].barricades[0];
        const pos = new THREE.Vector3(b.x, (b.y || 0) + 1.7, b.z);
        const cBefore = FPS.world.collide(pos, 0.55, false, b.y || 0);
        const blockedBefore = !!(cBefore && cBefore.hit);
        FPS.world.damageBarricade(0, 9999);
        const cAfter = FPS.world.collide(pos, 0.55, false, b.y || 0);
        return { blockedBefore, blockedAfter: !!(cAfter && cAfter.hit) };
      });
      assert(res.blockedBefore === true, "Intact barricade must block collide()");
      assert(res.blockedAfter === false, "Broken barricade must stop blocking collide()");
    }
  },
  {
    id: "T1-F6-05",
    tier: 1,
    feature: "F6",
    title: "Barricade Repair via E & Prompt Display",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "barricade repair via E", () => {
        if (!FPS.LEVELS[0].barricades || !FPS.LEVELS[0].barricades.length) return { ok: false, detail: "Map 1 barricades missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(100);
        FPS.world.damageBarricade(0, 80);
        const b = FPS.LEVELS[0].barricades[0];
        window.__fpsTest.teleportTo(b.x, (b.y || 0) + 1.7, b.z + 1.4);
      });
      await helpers.waitFrames(page, 3);
      const promptBox = await helpers.getVisibleBox(page, "#interactPrompt");
      const promptTxt = await page.textContent("#interactPrompt");
      assert(promptBox !== null && promptTxt && promptTxt.trim().length > 0, `#interactPrompt must be visible near damaged barricade, got box=${JSON.stringify(promptBox)}, txt="${promptTxt}"`);
      const hpMid = await page.evaluate(() => FPS.world.barricades[0].hp);
      await helpers.holdKey(page, "KeyE", 1400);
      await helpers.waitFrames(page, 2);
      const hpAfter = await page.evaluate(() => FPS.world.barricades[0].hp);
      assert(hpAfter > hpMid, `Expected barricade HP to increase on repair (${hpMid} -> ${hpAfter})`);
    }
  },

  // ======================== F7: AI Director 2-Beat & Terrain Hazards ========================
  {
    id: "T1-F7-01",
    tier: 1,
    feature: "F7",
    title: "AI Director 2-Beat Cycle (surge <-> breather)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "AI Director phase in getState()", () => {
        const st = window.__fpsTest.getState();
        if (!["surge", "breather"].includes(st.directorPhase)) {
          return { ok: false, detail: `Invalid directorPhase: ${st.directorPhase}` };
        }
        return { ok: true };
      });

      const phase0 = await page.evaluate(() => window.__fpsTest.getState().directorPhase);
      // Fast-forward directorT close to 0 and let tick transition it
      await page.evaluate(() => { FPS.state.G.directorT = 0.05; });
      await helpers.waitFrames(page, 4);
      const phase1 = await page.evaluate(() => window.__fpsTest.getState().directorPhase);
      assert(phase1 !== phase0, `Expected directorPhase to toggle from ${phase0}, stayed ${phase1}`);
    }
  },
  {
    id: "T1-F7-02",
    tier: 1,
    feature: "F7",
    title: "M5 Shallow Water Hazard Slows Player Movement",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "world.getHazardAt & M5 water hazard", () => {
        if (typeof FPS.world.getHazardAt !== "function") return { ok: false, detail: "getHazardAt missing" };
        const hz = FPS.LEVELS[4].hazards && FPS.LEVELS[4].hazards.find((h) => h.kind === "water");
        if (!hz) return { ok: false, detail: "M5 water hazard missing" };
        return { ok: true };
      });

      // Dry walk (with >= 4.5m wall clearance)
      const dryDist = await (async () => {
        await page.evaluate(() => {
          const sp = FPS.LEVELS[4].playerSpawn;
          window.__fpsTest.teleportTo(sp.x, 1.7, sp.z);
          const origin = new THREE.Vector3(sp.x, 1.4, sp.z);
          let yaw = sp.yaw || 0;
          const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
          if (FPS.world.raycastWallDist(origin, new THREE.Vector3(fx, 0, fz), 10) < 4.5) {
            const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [0.707, -0.707], [-0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]];
            for (const [dx, dz] of dirs) {
              if (FPS.world.raycastWallDist(origin, new THREE.Vector3(dx, 0, dz), 10) >= 4.5) {
                yaw = Math.atan2(-dx, -dz);
                break;
              }
            }
          }
          FPS.state.G.yaw = yaw;
        });
        await page.keyboard.down("KeyW");
        await helpers.waitFrames(page, 1);
        const start = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await helpers.waitFrames(page, 5);
        const end = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await page.keyboard.up("KeyW");
        return Math.hypot(end.p.x - start.p.x, end.p.z - start.p.z) / Math.max(0.01, end.t - start.t);
      })();

      // Water walk (with >= 4.5m wall clearance)
      const waterRes = await (async () => {
        const hzKind = await page.evaluate(() => {
          const hz = FPS.LEVELS[4].hazards.find((h) => h.kind === "water");
          window.__fpsTest.teleportTo(hz.x, 1.7, hz.z);
          const origin = new THREE.Vector3(hz.x, 1.4, hz.z);
          const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [0.707, -0.707], [-0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]];
          let yaw = 0;
          for (const [dx, dz] of dirs) {
            if (FPS.world.raycastWallDist(origin, new THREE.Vector3(dx, 0, dz), 10) >= 4.5) {
              yaw = Math.atan2(-dx, -dz);
              break;
            }
          }
          FPS.state.G.yaw = yaw;
          return FPS.world.getHazardAt(hz.x, hz.z, 0);
        });
        await page.keyboard.down("KeyW");
        await helpers.waitFrames(page, 1);
        const start = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await helpers.waitFrames(page, 5);
        const end = await page.evaluate(() => ({
          p: window.__fpsTest.getState().playerPos,
          t: FPS.state.G.time
        }));
        await page.keyboard.up("KeyW");
        return {
          hzKind,
          dist: Math.hypot(end.p.x - start.p.x, end.p.z - start.p.z) / Math.max(0.01, end.t - start.t)
        };
      })();

      assert(waterRes.hzKind === "water", `Expected getHazardAt === 'water', got ${waterRes.hzKind}`);
      assert(waterRes.dist < dryDist * 0.9, `Expected water walk (${waterRes.dist.toFixed(2)}) < 0.9 * dry (${dryDist.toFixed(2)})`);
    }
  },
  {
    id: "T1-F7-03",
    tier: 1,
    feature: "F7",
    title: "M5 Electric Trap Conduction Across Shallow Water",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "M5 electric trap + electrifyWater", () => {
        const t = FPS.LEVELS[4].traps && FPS.LEVELS[4].traps.find((x) => x.kind === "electric");
        if (!t) return { ok: false, detail: "No electric trap on Map 5" };
        if (typeof FPS.world.electrifyWater !== "function") return { ok: false, detail: "electrifyWater missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const t = FPS.LEVELS[4].traps.find((x) => x.kind === "electric");
        const hz = FPS.LEVELS[4].hazards.find((h) => h.kind === "water");
        window.__fpsTest.teleportTo(t.x, (t.y || 0) + 1.7, t.z + 1.0);
        FPS.entities.zombies.forEach((x) => { delete x.__t1f703Target; });
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        z.__t1f703Target = true;
        const gy = FPS.world.groundY ? FPS.world.groundY(hz.x, hz.z, 0) : 0;
        z.spawnT = 0;
        z.group.position.set(hz.x, gy, hz.z);
      });
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(800);

      const zHp = await page.evaluate(() => {
        const z = FPS.entities.zombies.find((x) => x.__t1f703Target);
        return z ? z.hp : 0;
      });
      assert(zHp < 62, `Expected zombie in electrified water to take shock damage, hp=${zHp}`);
    }
  },
  {
    id: "T1-F7-04",
    tier: 1,
    feature: "F7",
    title: "M4 Toxic Fog Edge Hazard Slow + Periodic Damage",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "M4 toxic fog hazard", () => {
        const hz = FPS.LEVELS[3].hazards && FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        if (!hz) return { ok: false, detail: "M4 toxic hazard missing" };
        return { ok: true };
      });

      const info = await page.evaluate(() => {
        const hz = FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        window.__fpsTest.teleportTo(hz.x, 1.7, hz.z);
        return {
          kind: FPS.world.getHazardAt(hz.x, hz.z, 0),
          hp0: window.__fpsTest.getState().hp
        };
      });
      assert(info.kind === "toxic", `Expected getHazardAt === 'toxic', got ${info.kind}`);
      await page.waitForTimeout(1200);
      const hp1 = await page.evaluate(() => window.__fpsTest.getState().hp);
      assert(hp1 < info.hp0, `Expected toxic fog to drain HP over 1.2s (${info.hp0} -> ${hp1})`);
    }
  },
  {
    id: "T1-F7-05",
    tier: 1,
    feature: "F7",
    title: "Instanced Decal Pool for Blood & Acid Preserves DrawCalls <= 75",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "FPS.entities.spawnDecal instanced pool", () => {
        if (typeof FPS.entities.spawnDecal !== "function") return { ok: false, detail: "spawnDecal missing" };
        return { ok: true };
      });

      const dcBefore = (await helpers.checkPerfGate(page)).drawCalls;
      await page.evaluate(() => {
        for (let i = 0; i < 30; i++) {
          FPS.entities.spawnDecal((i % 5) - 2, 0.02, (i % 6) - 3, i % 2 === 0 ? 0x8a0303 : 0x39ff14, 0.8);
        }
      });
      const perfAfter = await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0 });
      assert(
        perfAfter.drawCalls <= 75 && perfAfter.drawCalls <= dcBefore + 6,
        `Spawning 30 decals inflated drawCalls ${dcBefore} -> ${perfAfter.drawCalls}`
      );
    }
  },

  // ======================== F8: Desktop/Mobile HUD & Performance Gate ========================
  {
    id: "T1-F8-01",
    tier: 1,
    feature: "F8",
    title: "Desktop 1280x800 v9.0 HUD Elements Visible, Inside Viewport & Zero Overlap",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Desktop v9.0 HUD DOM (#scrapVal, #objDetail, #weaponSlots, #shoveHud)", () => {
        const ids = ["scrapVal", "objDetail", "weaponSlots", "shoveHud"];
        const miss = ids.filter((id) => !document.getElementById(id));
        if (miss.length) return { ok: false, detail: "missing " + miss.join(",") };
        const slots = document.querySelectorAll("#weaponSlots .wslot").length;
        if (slots !== 4) return { ok: false, detail: `Expected 4 .wslot items, got ${slots}` };
        return { ok: true };
      });

      await page.evaluate(() => { FPS.ui.showToast("HUD overlap check", 1200); });
      await page.waitForTimeout(420);
      await helpers.assertInViewport(page, helpers.DESKTOP_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.DESKTOP_HUD_SELECTORS, { minIntersectPx: 2, msg: "Desktop HUD" });
    }
  },
  {
    id: "T1-F8-02",
    tier: 1,
    feature: "F8",
    title: "Mobile 390x844 Touch Controls (#btnShove, #btnInteract) & Zero HUD Overlap",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Mobile #btnShove & #btnInteract", () => {
        if (!document.getElementById("btnShove") || !document.getElementById("btnInteract")) {
          return { ok: false, detail: "Missing #btnShove or #btnInteract" };
        }
        return { ok: true };
      });

      // Move near armory so #btnInteract becomes visible too
      await page.evaluate(() => {
        const a = FPS.LEVELS[0].armory;
        if (a) window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
        FPS.ui.showToast("Mobile toast overlap check", 1200);
      });
      await page.waitForTimeout(420);

      const touchCls = await page.evaluate(() => document.body.classList.contains("touch") && document.body.classList.contains("playing"));
      assert(touchCls, "body must have touch + playing classes on 390x844");
      assert((await helpers.getVisibleBox(page, "#btnShove")) !== null, "#btnShove must be visible on mobile");
      assert((await helpers.getVisibleBox(page, "#btnInteract")) !== null, "#btnInteract must appear near Armory");

      await helpers.assertInViewport(page, helpers.MOBILE_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2, msg: "Mobile 390x844 HUD" });
    }
  },
  {
    id: "T1-F8-03",
    tier: 1,
    feature: "F8",
    title: "Mobile 390x844 Armory Modal z-index >= 45 & Touch-Look Isolation",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Mobile Armory Modal & #btnInteract", () => {
        if (!document.getElementById("armoryScr") || !document.getElementById("btnInteract")) {
          return { ok: false, detail: "Missing #armoryScr or #btnInteract" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await helpers.waitFrames(page, 3);
      await helpers.tapTouch(page, "#btnInteract");
      await page.waitForFunction(() => {
        const el = document.getElementById("armoryScr");
        return el && !el.classList.contains("hidden");
      }, null, { timeout: 5000 });

      await helpers.assertZOrderAbove(page, "#armoryScr", ["#mobile", "#btnPauseM", "#muteBtn", "#hud"]);
      await helpers.assertInViewport(page, ["#armoryScr", "#armoryList", "#btnArmoryClose"]);

      const yaw0 = await page.evaluate(() => FPS.state.G.yaw);
      await helpers.swipeTouchLook(page, 100, 20);
      const yaw1 = await page.evaluate(() => FPS.state.G.yaw);
      assert(Math.abs(yaw1 - yaw0) < 0.001, "Touch-look must not rotate camera while Armory modal is open");

      await helpers.tapTouch(page, "#btnArmoryClose");
      await page.waitForFunction(() => document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });
    }
  },
  {
    id: "T1-F8-04",
    tier: 1,
    feature: "F8",
    title: "DPR Cap <= 1.0 & FPS.perf Quality Mode Switching on deviceScaleFactor=2",
    device: "desktop",
    deviceScaleFactor: 2,
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      for (const [mode, expectedMax] of [["high", 1.0], ["med", 0.85], ["low", 0.70]]) {
        await page.evaluate((m) => { FPS.perf.setQualityMode(m); }, mode);
        await helpers.waitFrames(page, 2);
        const stats = await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: expectedMax });
        assert(stats.dpr <= expectedMax + 0.001, `Mode ${mode} dpr=${stats.dpr} exceeded ${expectedMax}`);
      }
    }
  },
  {
    id: "T1-F8-05",
    tier: 1,
    feature: "F8",
    title: "Global Performance Gate Across All 5 Maps (0 PointLights, <= 75 drawCalls, DPR <= 1.0)",
    device: "desktop",
    async run({ page, helpers }) {
      for (let lv = 1; lv <= 5; lv++) {
        await helpers.startLevelAndWait(page, lv);
        await page.waitForTimeout(400);
        await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
      }
    }
  }
];
