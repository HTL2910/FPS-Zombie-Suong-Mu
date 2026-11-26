"use strict";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

module.exports = [
  // ======================== F1: Boot, Preload & Bilingual Boundaries ========================
  {
    id: "T2-F1-01",
    tier: 2,
    feature: "F1",
    title: "Missing data-i Fallback & Rapid VI<->EN Toggle x10 Without 'undefined' Text",
    device: "desktop",
    async run({ page, helpers }) {
      const fallback = await page.evaluate(() => FPS.t("__nonexistent_key__"));
      assert(fallback === "__nonexistent_key__", `Expected key fallback, got "${fallback}"`);

      for (let i = 0; i < 10; i++) {
        await page.click(i % 2 === 0 ? "#langEn" : "#langVi");
      }
      await page.waitForFunction(() => document.documentElement.lang === "vi", null, { timeout: 3000 });
      const badNodes = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("[data-i]"));
        return els
          .filter((el) => /undefined|null/i.test(el.textContent || ""))
          .map((el) => el.getAttribute("data-i"));
      });
      assert(badNodes.length === 0, `Found undefined/null text in [data-i] nodes: ${badNodes.join(", ")}`);
    }
  },
  {
    id: "T2-F1-02",
    tier: 2,
    feature: "F1",
    title: "Empty {} Profile Payload Resilience (Defaults highestLevel=1, lang='vi')",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    rawEmptyProfile: true,
    async run({ page, url, helpers }) {
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      const info = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("#levelGrid .lvlCard"));
        return {
          lang: FPS.LANG,
          unlockedCount: cards.filter((c) => !c.classList.contains("locked")).length,
          totalCards: cards.length
        };
      });
      assert(info.lang === "vi", `Expected default lang='vi', got ${info.lang}`);
      assert(info.totalCards === 5, `Expected 5 cards, got ${info.totalCards}`);
      assert(info.unlockedCount === 1, `Expected only Stage 1 unlocked on empty profile, got ${info.unlockedCount}`);
    }
  },
  {
    id: "T2-F1-03",
    tier: 2,
    feature: "F1",
    title: "Empty Leaderboard & __ITCH_STATIC__ LocalStorage Fallback (Zero Network Calls)",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    taintedAfter: true,
    initialLeaderboard: [],
    async run({ page, url, helpers }) {
      await page.addInitScript(() => {
        window.__ITCH_STATIC__ = true;
      });
      let apiHits = 0;
      page.on("request", (req) => {
        if (req.url().includes("/api/")) apiHits++;
      });
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      const lbText = await page.textContent("#lbBox");
      assert(apiHits === 0, `Expected 0 /api/ calls in __ITCH_STATIC__ mode, saw ${apiHits}`);
      assert(lbText && lbText.trim().length > 0, "#lbBox must still render cleanly with empty leaderboard");
    }
  },
  {
    id: "T2-F1-04",
    tier: 2,
    feature: "F1",
    title: "Clicking #btnStart & #btnStory During Loading State Does Not Break Boot",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    async run({ page, url, helpers }) {
      await helpers.bootAndWait(page, url, { skipBootWait: true, skipMenuCheck: true, timeoutMs: 45000 });
      const earlyState = await page.evaluate(() => {
        const bStart = document.getElementById("btnStart");
        const bStory = document.getElementById("btnStory");
        if (bStart) bStart.click();
        if (bStory) bStory.click();
        return {
          loadDone: !!window.__loadDone,
          state: window.__fpsTest ? window.__fpsTest.getLoadState().state : "uninit"
        };
      });
      if (!earlyState.loadDone) {
        assert(earlyState.state !== "playing", "Game must not enter 'playing' while still loading");
      }
      await page.waitForFunction(() => window.__loadDone === true, null, { timeout: 45000 });
      await page.waitForFunction(() => {
        const m = document.getElementById("menu");
        return m && !m.classList.contains("hidden");
      }, null, { timeout: 15000 });
    }
  },
  {
    id: "T2-F1-05",
    tier: 2,
    feature: "F1",
    title: "Mid-Game Viewport Resize (1280x800 -> 1024x640 -> 1280x800) Updates Camera & Canvas",
    device: "desktop",
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await page.setViewportSize({ width: 1024, height: 640 });
      await helpers.waitFrames(page, 4);
      const mid = await page.evaluate(() => ({
        aspect: +FPS.world.camera.aspect.toFixed(3),
        w: FPS.world.renderer.domElement.clientWidth,
        h: FPS.world.renderer.domElement.clientHeight
      }));
      assert(Math.abs(mid.aspect - 1024 / 640) < 0.05, `Expected aspect ~1.60, got ${mid.aspect}`);
      assert(mid.w === 1024 && mid.h === 640, `Canvas client size mismatch: ${mid.w}x${mid.h}`);
      await page.setViewportSize({ width: 1280, height: 800 });
      await helpers.waitFrames(page, 3);
    }
  },

  // ======================== F2: 5-Map & Verticality Boundaries ========================
  {
    id: "T2-F2-01",
    tier: 2,
    feature: "F2",
    title: "Drop-Down Off Elevated Platform Edge Smoothly Returns groundY -> 0",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "platform drop-down", () => {
        if (typeof FPS.world.groundY !== "function" || typeof window.__fpsTest.teleportTo !== "function") {
          return { ok: false, detail: "groundY or teleportTo missing" };
        }
        const p = (FPS.world.platforms || []).find((x) => !x.rampOnly && x.yTop >= 1.5);
        if (!p) return { ok: false, detail: "No platform >= 1.5m" };
        return { ok: true };
      });

      const nonRampYaw = await page.evaluate(() => {
        const p = FPS.world.platforms.find((x) => !x.rampOnly && x.yTop >= 1.5);
        const rampSides = new Set((p.ramps || []).map((r) => r.side));
        const walkOffSide = ["n", "s", "e", "w"].find((s) => !rampSides.has(s)) || "n";
        let lx = 0, lz = 0, ldx = 0, ldz = 0;
        if (walkOffSide === "n") { lz = -p.hd + 0.35; ldz = -1; }
        else if (walkOffSide === "s") { lz = p.hd - 0.35; ldz = 1; }
        else if (walkOffSide === "e") { lx = p.hw - 0.35; ldx = 1; }
        else { lx = -p.hw + 0.35; ldx = -1; }
        const sx = p.x + (p.rot ? (lx * p.cos + lz * p.sin) : lx);
        const sz = p.z + (p.rot ? (-lx * p.sin + lz * p.cos) : lz);
        const wdx = p.rot ? (ldx * p.cos + ldz * p.sin) : ldx;
        const wdz = p.rot ? (-ldx * p.sin + ldz * p.cos) : ldz;
        window.__fpsTest.teleportTo(sx, p.yTop + 1.7, sz);
        FPS.state.G.yaw = Math.atan2(-wdx, -wdz);
        FPS.state.G.pitch = 0;
        return p.yTop;
      });

      await helpers.holdKey(page, "KeyW", 1100);
      await page.waitForTimeout(500);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.groundY < 0.1, `Expected groundY ~0 after drop-down from yTop=${nonRampYaw}, got ${st.groundY}`);
      assert(st.playerPos.y >= 1.65 && st.playerPos.y <= 1.85, `Expected playerPos.y settled at ~1.7, got ${st.playerPos.y}`);
    }
  },
  {
    id: "T2-F2-02",
    tier: 2,
    feature: "F2",
    title: "Step-Up Wall Block (> 0.45m) Prevents Climbing Non-Ramp Platform Face from Ground",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "height-aware step-up block", () => {
        if (typeof FPS.world.groundY !== "function" || typeof window.__fpsTest.teleportTo !== "function") {
          return { ok: false, detail: "groundY or teleportTo missing" };
        }
        const p = (FPS.world.platforms || []).find((x) => !x.rampOnly && x.yTop >= 1.5);
        if (!p) return { ok: false, detail: "No platform >= 1.5m" };
        return { ok: true };
      });

      const yTop = await page.evaluate(() => {
        const p = FPS.world.platforms.find((x) => !x.rampOnly && x.yTop >= 1.5);
        const rampSides = new Set((p.ramps || []).map((r) => r.side));
        const side = ["s", "n", "e", "w"].find((s) => !rampSides.has(s)) || "n";
        let lx = 0, lz = 0, ldx = 0, ldz = 0;
        if (side === "n") { lz = -p.hd - 0.9; ldz = 1; }
        else if (side === "s") { lz = p.hd + 0.9; ldz = -1; }
        else if (side === "e") { lx = p.hw + 0.9; ldx = -1; }
        else { lx = -p.hw - 0.9; ldx = 1; }
        const sx = p.x + (p.rot ? (lx * p.cos + lz * p.sin) : lx);
        const sz = p.z + (p.rot ? (-lx * p.sin + lz * p.cos) : lz);
        const wdx = p.rot ? (ldx * p.cos + ldz * p.sin) : ldx;
        const wdz = p.rot ? (-ldx * p.sin + ldz * p.cos) : ldz;
        window.__fpsTest.teleportTo(sx, 1.7, sz);
        FPS.state.G.yaw = Math.atan2(-wdx, -wdz);
        return p.yTop;
      });
      await helpers.holdKey(page, "KeyW", 700);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.playerPos.y < 1.7 + yTop * 0.4, `Player must NOT snap up ${yTop}m non-ramp face from ground (y=${st.playerPos.y})`);
    }
  },
  {
    id: "T2-F2-03",
    tier: 2,
    feature: "F2",
    title: "Under-Overpass groundY(x, z, 0) === 0 & Jump Clearance Under Lintel",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      const lintelInfo = await helpers.requireV9(page, "under-lintel groundY(x,z,0)", () => {
        if (typeof FPS.world.groundY !== "function") return { ok: false, detail: "groundY missing" };
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
        if (!lintel) return { ok: false, detail: "No yBase>=2.0 lintel over clear ground" };
        const gy = FPS.world.groundY(lintel.x, lintel.z, 0);
        if (gy !== 0) return { ok: false, detail: `groundY under lintel returned ${gy}, expected 0` };
        return { ok: true, x: lintel.x, z: lintel.z, yBase: lintel.yBase };
      });
      await page.evaluate(({ x, z }) => {
        window.__fpsTest.teleportTo(x, 1.7, z);
      }, { x: lintelInfo.x, z: lintelInfo.z });
      await helpers.waitFrames(page, 2);
      await page.keyboard.press("Space");
      const samples = [];
      await page.waitForTimeout(50);
      for (let i = 0; i < 10; i++) {
        const y = await page.evaluate(() => window.__fpsTest.getState().playerPos.y);
        samples.push(y);
        await page.waitForTimeout(25);
      }
      const peakY = Math.max(...samples);
      assert(
        !Number.isNaN(peakY) && peakY > 1.75 && peakY < lintelInfo.yBase,
        `Jump under lintel (yBase=${lintelInfo.yBase}) expected peakY in (1.75, ${lintelInfo.yBase}), got peakY=${peakY} (samples=${JSON.stringify(samples)})`
      );
    }
  },
  {
    id: "T2-F2-04",
    tier: 2,
    feature: "F2",
    title: "Arena Boundary Clamp at +/- arena/2 Prevents Escaping Map Fence",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "__fpsTest.teleportTo", () => {
        if (typeof window.__fpsTest.teleportTo !== "function") return { ok: false, detail: "teleportTo missing" };
        return { ok: true };
      });
      const half = await page.evaluate(() => {
        const h = FPS.LEVELS[0].arena * 0.5;
        window.__fpsTest.teleportTo(h - 1.0, 1.7, 0);
        FPS.state.G.yaw = -Math.PI / 2; // face +X
        return h;
      });
      await helpers.holdKey(page, "KeyW", 900);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.playerPos.x <= half - 0.4, `Player escaped arena +X boundary: ${st.playerPos.x} > ${half}`);
    }
  },
  {
    id: "T2-F2-05",
    tier: 2,
    feature: "F2",
    title: "Rotated OBB Wall Sliding (ry != 0) Produces Smooth Tangent Motion Without NaN",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "rotated wall ry != 0", () => {
        const rw = FPS.LEVELS[0].walls && FPS.LEVELS[0].walls.find((w) => Math.abs(w.ry || 0) > 0.1 && (w.yBase || 0) === 0);
        if (!rw) return { ok: false, detail: "No ground-level rotated wall ry!=0 in Map 1" };
        return { ok: true };
      });
      const p0 = await page.evaluate(() => {
        const rw = FPS.LEVELS[0].walls.find((w) => Math.abs(w.ry || 0) > 0.1 && (w.yBase || 0) === 0);
        const startX = rw.x + Math.sin(rw.ry) * 1.4;
        const startZ = rw.z + Math.cos(rw.ry) * 1.4;
        window.__fpsTest.teleportTo(startX, 1.7, startZ);
        FPS.state.G.yaw = rw.ry + 0.4;
        return { x: startX, z: startZ };
      });
      await helpers.holdKey(page, "KeyW", 600);
      const p1 = await page.evaluate(() => window.__fpsTest.getState().playerPos);
      assert(!Number.isNaN(p1.x) && !Number.isNaN(p1.z), "Player position became NaN sliding against rotated OBB");
      assert(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.05, "Player got completely stuck instead of sliding along rotated OBB");
    }
  },

  // ======================== F3: Stage Objective Boundaries ========================
  {
    id: "T2-F3-01",
    tier: 2,
    feature: "F3",
    title: "M1 Portal Locked When Quota Met But Gate Intact, AND When Gate Broken But Quota Unmet",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "M1 gate half-conditions", () => {
        if (typeof window.__fpsTest.damageObjective !== "function") return { ok: false, detail: "damageObjective missing" };
        if (!FPS.LEVELS[0].objective || FPS.LEVELS[0].objective.type !== "gate") return { ok: false, detail: "M1 objective != gate" };
        return { ok: true };
      });

      // Condition A: Quota met, gate still intact -> portalUnlocked === false
      const condA = await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        return window.__fpsTest.getState();
      });
      assert(condA.portalUnlocked === false, "M1 portal must stay locked while gate is still intact");

      // Restart fresh M1 for Condition B: Gate broken, quota unmet -> portalUnlocked === false
      await helpers.startLevelAndWait(page, 1);
      const condB = await page.evaluate(() => {
        window.__fpsTest.damageObjective(9999);
        return window.__fpsTest.getState();
      });
      assert(condB.portalUnlocked === false, "M1 portal must stay locked while killQuota is unmet");
    }
  },
  {
    id: "T2-F3-02",
    tier: 2,
    feature: "F3",
    title: "M2 Generator Hold Interruption (< 2.0s) Does Not Activate Generator",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "M2 generator hold interruption", () => {
        const obj = FPS.LEVELS[1].objective;
        if (!obj || obj.type !== "generators") return { ok: false, detail: "M2 objective != generators" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const g = FPS.LEVELS[1].objective.items[0];
        window.__fpsTest.teleportTo(g.x, (g.y || 0) + 1.7, g.z + 1.2);
      });
      await helpers.holdKey(page, "KeyE", 750);
      await helpers.waitFrames(page, 3);
      const mid = await page.evaluate(() => window.__fpsTest.getState());
      const cnt = mid.objState && (mid.objState.activatedCount ?? mid.objState.done ?? 0);
      assert(cnt === 0, `Generator must NOT activate on 750ms hold, got count=${cnt}`);
    }
  },
  {
    id: "T2-F3-03",
    tier: 2,
    feature: "F3",
    title: "M3 Relic Partial Carry (1/2) Blocks Extraction & 2nd Relic Does Not Double Speed Penalty",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 3);
      await helpers.requireV9(page, "M3 relic carry capping", () => {
        const obj = FPS.LEVELS[2].objective;
        if (!obj || obj.type !== "relics") return { ok: false, detail: "M3 objective != relics" };
        return { ok: true };
      });

      const measureSprint = async () => {
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
      };

      await page.evaluate(() => {
        const r0 = FPS.LEVELS[2].objective.items[0];
        window.__fpsTest.teleportTo(r0.x, (r0.y || 0) + 1.7, r0.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      const dist1 = await measureSprint();

      // Check portal blocked at 1/2
      await page.evaluate(() => { window.__fpsTest.completeQuota(); });
      const stPartial = await page.evaluate(() => window.__fpsTest.getState());
      assert(stPartial.portalUnlocked === false, "M3 portal must remain locked with only 1/2 relics");

      await page.evaluate(() => {
        const r1 = FPS.LEVELS[2].objective.items[1];
        window.__fpsTest.teleportTo(r1.x, (r1.y || 0) + 1.7, r1.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      const dist2 = await measureSprint();
      assert(Math.abs(dist2 - dist1) < dist1 * 0.1, `2nd relic should not double sprint penalty (${dist1.toFixed(2)} vs ${dist2.toFixed(2)})`);
    }
  },
  {
    id: "T2-F3-04",
    tier: 2,
    feature: "F3",
    title: "M4 Orc Grave Lord Shield Scales Down Stepwise as 3 Totems Break",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "M4 stepwise totem armor", () => {
        if (typeof FPS.entities.applyArmorShield !== "function") return { ok: false, detail: "applyArmorShield missing" };
        if (typeof FPS.world.damageTotem !== "function") return { ok: false, detail: "damageTotem missing" };
        return { ok: true };
      });

      const steps = await page.evaluate(() => {
        const d3 = FPS.entities.applyArmorShield(100);
        FPS.world.damageTotem(0, 9999);
        const d2 = FPS.entities.applyArmorShield(100);
        FPS.world.damageTotem(1, 9999);
        const d1 = FPS.entities.applyArmorShield(100);
        FPS.world.damageTotem(2, 9999);
        const d0 = FPS.entities.applyArmorShield(100);
        return [d3, d2, d1, d0];
      });
      assert(steps[0] < steps[3] && steps[1] >= steps[0] && steps[2] >= steps[1], `Expected monotonic armor drop, got ${JSON.stringify(steps)}`);
    }
  },
  {
    id: "T2-F3-05",
    tier: 2,
    feature: "F3",
    title: "Extract Hold Progress Decays Cleanly When Stepping Outside Ring",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "M1 extract decay", () => {
        if (typeof window.__fpsTest.damageObjective !== "function") return { ok: false, detail: "damageObjective missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        window.__fpsTest.damageObjective(9999);
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForTimeout(900);
      const progIn = await page.evaluate(() => window.__fpsTest.getState().extractProg);
      assert(progIn > 0.1 && progIn < 2.5, `Expected partial extractProg inside ring, got ${progIn}`);

      await page.evaluate(() => {
        const ep = FPS.LEVELS[0].extractPos;
        window.__fpsTest.teleportTo(ep.x + 8, 1.7, ep.z);
      });
      await page.waitForTimeout(700);
      const progOut = await page.evaluate(() => window.__fpsTest.getState().extractProg);
      assert(progOut < progIn && progOut >= 0, `Expected extractProg to decay outside ring (${progIn} -> ${progOut})`);
    }
  },

  // ======================== F4: Special Infected Boundaries ========================
  {
    id: "T2-F4-01",
    tier: 2,
    feature: "F4",
    title: "Acid Pool Expires at 5.0s and Stops Damaging Player",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "spawnAcidPool expiry", () => {
        if (typeof FPS.entities.spawnAcidPool !== "function") return { ok: false, detail: "spawnAcidPool missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const pos = window.__fpsTest.getState().playerPos;
        FPS.entities.spawnAcidPool(pos.x, 0, pos.z);
      });
      await page.waitForTimeout(900);
      const hpActive = await page.evaluate(() => window.__fpsTest.getState().hp);
      assert(hpActive < 100, "Acid pool must damage player while active");

      await page.waitForTimeout(4800);
      const hpExp0 = await page.evaluate(() => window.__fpsTest.getState().hp);
      await page.waitForTimeout(800);
      const hpExp1 = await page.evaluate(() => window.__fpsTest.getState().hp);
      assert(hpExp1 === hpExp0, `Expired acid pool still damaged player (${hpExp0} -> ${hpExp1})`);
    }
  },
  {
    id: "T2-F4-02",
    tier: 2,
    feature: "F4",
    title: "Bloater Killed at Range (> 10m) Does NOT Damage or Blind Player",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "triggerSpecial('bloater') far kill", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "triggerSpecial missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const st0 = window.__fpsTest.getState();
        const b = window.__fpsTest.triggerSpecial("bloater") || FPS.entities.zombies.find((z) => !z.dead && z.type === "bloater");
        if (!b || !b.group) throw new Error("Failed to spawn bloater");
        const bx = st0.playerPos.x;
        const bz = st0.playerPos.z - 14;
        const gy = FPS.world.groundY ? FPS.world.groundY(bx, bz, 0) : 0;
        b.spawnT = 0;
        b.group.position.set(bx, gy, bz);
        FPS.entities.damageZombie(b, 9999, false);
        const st1 = window.__fpsTest.getState();
        const veil = document.getElementById("blackoutVeil");
        return { hp0: st0.hp, hp1: st1.hp, veilOp: veil ? parseFloat(getComputedStyle(veil).opacity || "0") : 0 };
      });
      assert(res.hp1 === res.hp0, `Far bloater (>10m) should not damage player (${res.hp0} -> ${res.hp1})`);
      assert(res.veilOp < 0.05, `Far bloater should not blind player (opacity=${res.veilOp})`);
    }
  },
  {
    id: "T2-F4-03",
    tier: 2,
    feature: "F4",
    title: "Bloater Death AoE Blast Damages Nearby Zombies",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "bloater AoE zombie damage", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function") return { ok: false, detail: "triggerSpecial missing" };
        return { ok: true };
      });

      const zHpAfter = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const b = window.__fpsTest.triggerSpecial("bloater") || FPS.entities.zombies.find((z) => !z.dead && z.type === "bloater");
        const n = FPS.entities.spawnZombie("brute");
        if (!b || !b.group) throw new Error("Failed to spawn bloater");
        if (!n || !n.group) throw new Error("Failed to spawn brute");
        const bx = st.playerPos.x + 10, bz = st.playerPos.z;
        const nx = st.playerPos.x + 12, nz = st.playerPos.z;
        b.spawnT = 0;
        n.spawnT = 0;
        b.group.position.set(bx, FPS.world.groundY ? FPS.world.groundY(bx, bz, 0) : 0, bz);
        n.group.position.set(nx, FPS.world.groundY ? FPS.world.groundY(nx, nz, 0) : 0, nz);
        FPS.entities.damageZombie(b, 9999, false);
        return n.hp;
      });
      assert(zHpAfter < 230, `Nearby zombie must take bloater AoE blast damage (hp=${zHpAfter}/230)`);
    }
  },
  {
    id: "T2-F4-04",
    tier: 2,
    feature: "F4",
    title: "Phantom Stalker Pounce Interrupted by Shove During Scream Telegraph",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "stalker + shove interrupt", () => {
        if (typeof window.__fpsTest.triggerSpecial !== "function" || typeof FPS.entities.shove !== "function") {
          return { ok: false, detail: "triggerSpecial or shove missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const st0 = window.__fpsTest.getState();
        const s = window.__fpsTest.triggerSpecial("stalker") || FPS.entities.zombies.find((z) => !z.dead && z.type === "stalker");
        if (!s || !s.group) throw new Error("Failed to spawn stalker");
        const sx = st0.playerPos.x;
        const sz = st0.playerPos.z - 1.6;
        const gy = FPS.world.groundY ? FPS.world.groundY(sx, sz, 0) : 0;
        s.spawnT = 0;
        s.group.position.set(sx, gy, sz);
        FPS.state.G.yaw = 0;
        FPS.state.G.stamina = 100;
        const okShove = FPS.entities.shove();
        const st1 = window.__fpsTest.getState();
        return { okShove, hp0: st0.hp, hp1: st1.hp, dist: Math.hypot(s.group.position.x - st1.playerPos.x, s.group.position.z - st1.playerPos.z) };
      });
      assert(res.okShove, "Shove failed to trigger against stalker");
      assert(res.hp1 === res.hp0, `Interrupted stalker should deal 0 pounce damage (${res.hp0} -> ${res.hp1})`);
      assert(res.dist > 1.8, `Stalker should be shoved back (dist=${res.dist.toFixed(2)})`);
    }
  },
  {
    id: "T2-F4-05",
    tier: 2,
    feature: "F4",
    title: "Elevated Zombie Hitbox zp.y Synced on Platform (Raycast Hits at yTop + 1.2m)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "elevated zombie hitbox zp.y", () => {
        if (typeof FPS.world.groundY !== "function" || typeof window.__fpsTest.teleportTo !== "function") {
          return { ok: false, detail: "groundY or teleportTo missing" };
        }
        const p = (FPS.world.platforms || []).find((x) => !x.rampOnly && x.yTop >= 1.5);
        if (!p) return { ok: false, detail: "No elevated platform" };
        return { ok: true };
      });

      const hitRes = await page.evaluate(() => {
        const p = FPS.world.platforms.find((x) => !x.rampOnly && x.yTop >= 1.5);
        const zOffP = Math.min(2.2, Math.max(0.8, p.hd - 0.4));
        const zOffZ = -Math.min(1.5, Math.max(0.6, p.hd - 0.4));
        const px = p.x + (p.rot ? (zOffP * p.sin) : 0);
        const pz = p.z + (p.rot ? (zOffP * p.cos) : zOffP);
        const zx = p.x + (p.rot ? (zOffZ * p.sin) : 0);
        const zz = p.z + (p.rot ? (zOffZ * p.cos) : zOffZ);
        const wdx = zx - px, wdz = zz - pz;
        const yaw = Math.atan2(-wdx, -wdz);
        window.__fpsTest.teleportTo(px, p.yTop + 1.7, pz);
        const z = FPS.entities.spawnZombie("brute");
        if (!z || !z.group) throw new Error("Failed to spawn brute");
        z.spawnT = 0;
        z.group.position.set(zx, p.yTop, zz);
        FPS.state.G.yaw = yaw;
        FPS.state.G.pitch = 0;
        FPS.world.camera.position.set(px, p.yTop + 1.7, pz);
        FPS.world.camera.rotation.set(0, yaw, 0, "YXZ");
        FPS.world.camera.updateMatrixWorld(true);
        const hpBefore = z.hp;
        FPS.entities.shoot();
        return { hpBefore, hpAfter: z.hp };
      });
      assert(hitRes.hpAfter < hitRes.hpBefore, `Expected elevated shot to hit elevated brute (${hitRes.hpBefore} -> ${hitRes.hpAfter})`);
    }
  },

  // ======================== F5: Scrap, Armory & Anvil Boundaries ========================
  {
    id: "T2-F5-01",
    tier: 2,
    feature: "F5",
    title: "Insufficient Scrap Purchase Rejection (Never Negative, Weapon Stays Locked)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "armory insufficient scrap guard", () => {
        if (typeof FPS.entities.unlockWeapon !== "function" || typeof window.__fpsTest.grantScrap !== "function") {
          return { ok: false, detail: "unlockWeapon or grantScrap missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        window.__fpsTest.grantScrap(10);
        const ok = FPS.entities.unlockWeapon("shotgun");
        const st = window.__fpsTest.getState();
        return { ok, scrap: st.scrap, unlocked: st.unlockedWeapons.shotgun };
      });
      assert(res.ok === false, "unlockWeapon('shotgun') with 10 scrap must return false");
      assert(res.scrap === 10, `Scrap must remain 10, got ${res.scrap}`);
      assert(res.unlocked === false, "Shotgun must stay locked");
    }
  },
  {
    id: "T2-F5-02",
    tier: 2,
    feature: "F5",
    title: "Headshot Streak Multiplier Capped at x3.0 & Resets After Timer Expiry",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "hsMult cap & decay", () => {
        const st = window.__fpsTest.getState();
        if (!("hsMult" in st) || !("hsStreak" in st)) return { ok: false, detail: "hsMult/hsStreak missing" };
        return { ok: true };
      });

      const maxMult = await page.evaluate(() => {
        for (let i = 0; i < 12; i++) {
          const z = FPS.entities.spawnZombie("normal");
          if (z) FPS.entities.damageZombie(z, 999, true);
        }
        return window.__fpsTest.getState().hsMult;
      });
      assert(maxMult <= 3.0 && maxMult >= 2.5, `Expected hsMult capped at <=3.0, got ${maxMult}`);

      // Fast-forward hsTimer close to 0 and let tick expire it
      await page.evaluate(() => { FPS.state.G.hsTimer = 0.05; });
      await page.waitForTimeout(250);
      const decayed = await page.evaluate(() => window.__fpsTest.getState());
      assert(decayed.hsStreak === 0 && decayed.hsMult === 1, `Expected hsStreak/hsMult reset, got ${decayed.hsStreak}/${decayed.hsMult}`);
    }
  },
  {
    id: "T2-F5-03",
    tier: 2,
    feature: "F5",
    title: "Anvil Max Tier Cap at Mk.III (tier === 3) Rejects 4th Upgrade",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "upgradeWeapon Mk.III cap", () => {
        if (typeof FPS.entities.upgradeWeapon !== "function") return { ok: false, detail: "upgradeWeapon missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        window.__fpsTest.grantScrap(5000);
        const u2 = FPS.entities.upgradeWeapon("pistol");
        const u3 = FPS.entities.upgradeWeapon("pistol");
        const scrapAt3 = window.__fpsTest.getState().scrap;
        const u4 = FPS.entities.upgradeWeapon("pistol");
        const scrapAfter4 = window.__fpsTest.getState().scrap;
        return { u2, u3, u4, scrapAt3, scrapAfter4, tier: window.__fpsTest.getState().weaponTiers.pistol };
      });
      assert(res.u2 && res.u3, "Upgrades to Mk.II and Mk.III must succeed");
      assert(res.u4 === false, "4th upgrade past Mk.III must return false");
      assert(res.tier === 3, `Tier must cap at 3, got ${res.tier}`);
      assert(res.scrapAfter4 === res.scrapAt3, "Scrap must not be deducted on rejected Mk.IV attempt");
    }
  },
  {
    id: "T2-F5-04",
    tier: 2,
    feature: "F5",
    title: "Zero-Reserve Shotgun Reload Safety (No Infinite Reload Lock or Negative Ammo)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "unlockWeapon('shotgun') reload boundary", () => {
        if (typeof FPS.entities.unlockWeapon !== "function") return { ok: false, detail: "unlockWeapon missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        FPS.entities.unlockWeapon("shotgun");
        FPS.entities.switchWeapon("shotgun");
        FPS.entities.wState.shotgun.mag = 0;
        FPS.entities.wState.shotgun.reserve = 0;
      });
      await page.keyboard.press("KeyR");
      await helpers.waitFrames(page, 3);
      const st = await page.evaluate(() => ({
        reloading: window.__fpsTest.getState().reloading,
        mag: FPS.entities.wState.shotgun.mag,
        reserve: FPS.entities.wState.shotgun.reserve
      }));
      assert(st.reloading === false, "Zero-reserve weapon must not lock into reloading=true");
      assert(st.mag >= 0 && st.reserve >= 0, "Ammo must never become negative");
    }
  },
  {
    id: "T2-F5-05",
    tier: 2,
    feature: "F5",
    title: "Scrap & Unlocked Weapons Persist Across Stage Transition, Reset on New Campaign",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "scrap persistence & reset", () => {
        if (typeof FPS.entities.unlockWeapon !== "function") return { ok: false, detail: "unlockWeapon missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        FPS.entities.unlockWeapon("shotgun");
      });
      const scrapAfterBuy = await page.evaluate(() => window.__fpsTest.getState().scrap);
      // Advance directly to stage 2 while in playing state (simulating stage transition)
      await helpers.startLevelAndWait(page, 2);
      const mid = await page.evaluate(() => window.__fpsTest.getState());
      assert(mid.unlockedWeapons.shotgun === true, "Unlocked shotgun must persist into Stage 2");
      assert(mid.scrap === scrapAfterBuy, `Scrap must carry into Stage 2 (${scrapAfterBuy} vs ${mid.scrap})`);

      await helpers.toMenuAndWait(page);
      await helpers.startLevelAndWait(page, 1);
      const fresh = await page.evaluate(() => window.__fpsTest.getState());
      assert(fresh.scrap === 0 && fresh.unlockedWeapons.shotgun === false, "New campaign from menu must reset scrap & unlocks");
    }
  },

  // ======================== F6: Traps, Barricades & Shove Boundaries ========================
  {
    id: "T2-F6-01",
    tier: 2,
    feature: "F6",
    title: "Shove Blocked When Stamina < 22 (Never Goes Negative)",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "shove stamina gate", () => {
        if (typeof FPS.entities.shove !== "function") return { ok: false, detail: "shove missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        FPS.state.G.stamina = 15;
        const ok = FPS.entities.shove();
        return { ok, stamina: FPS.state.G.stamina };
      });
      assert(res.ok === false, "Shove with stamina=15 (<22) must return false");
      assert(res.stamina >= 15, `Stamina must not go negative on blocked shove, got ${res.stamina}`);
    }
  },
  {
    id: "T2-F6-02",
    tier: 2,
    feature: "F6",
    title: "Shove Cooldown Spam Guard & Wall-Safe Knockback Clamp",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "shove CD & wall clamp", () => {
        if (typeof FPS.entities.shove !== "function") return { ok: false, detail: "shove missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        FPS.state.G.stamina = 100;
        const st = window.__fpsTest.getState();
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        const zx = st.playerPos.x;
        const zz = st.playerPos.z - 1.4;
        const gy = FPS.world.groundY ? FPS.world.groundY(zx, zz, 0) : 0;
        z.spawnT = 0;
        z.group.position.set(zx, gy, zz);
        FPS.state.G.yaw = 0;
        const s1 = FPS.entities.shove();
        const stam1 = FPS.state.G.stamina;
        const s2 = FPS.entities.shove();
        const stam2 = FPS.state.G.stamina;
        const half = FPS.LEVELS[0].arena * 0.5;
        return { s1, s2, stam1, stam2, zInArena: Math.abs(z.group.position.x) <= half && Math.abs(z.group.position.z) <= half };
      });
      assert(res.s1 === true && res.s2 === false, "Second immediate shove within CD must be blocked");
      assert(res.stam1 === res.stam2, "Spam-guard must prevent double stamina deduction");
      assert(res.zInArena, "Shoved zombie escaped arena bounds");
    }
  },
  {
    id: "T2-F6-03",
    tier: 2,
    feature: "F6",
    title: "Trap Out-of-Range (> 3.0m) No-Op & 25s Cooldown Guard",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "trap range & CD", () => {
        if (!FPS.LEVELS[0].traps || !FPS.LEVELS[0].traps.length || typeof FPS.world.activateTrap !== "function" || typeof FPS.world.getNearestInteractable !== "function") {
          return { ok: false, detail: "traps/activateTrap/getNearestInteractable missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const t = FPS.LEVELS[0].traps[0];
        window.__fpsTest.teleportTo(t.x, (t.y || 0) + 1.7, t.z + 5.5);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 2);
      const farActive = await page.evaluate(() => FPS.world.traps[0].active);
      assert(farActive === false, "Trap must NOT activate from > 5m away");

      await page.evaluate(() => {
        const t = FPS.LEVELS[0].traps[0];
        window.__fpsTest.teleportTo(t.x, (t.y || 0) + 1.7, t.z + 1.0);
      });
      await helpers.waitFrames(page, 2);
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 3);

      const firstTrigger = await page.evaluate(() => {
        const t = FPS.world.traps[0];
        const st = window.__fpsTest.getState();
        const pos = new THREE.Vector3(st.playerPos.x, st.playerPos.y, st.playerPos.z);
        const dir = new THREE.Vector3(0, 0, -1);
        const nearest = FPS.world.getNearestInteractable(pos, dir);
        return {
          id: t.id,
          active: !!t.active,
          activeT: t.activeT || 0,
          cd: t.cdT ?? t.cdLeft ?? -1,
          nearestKind: nearest ? nearest.kind : null,
          nearestId: nearest ? nearest.id : null
        };
      });
      assert(firstTrigger.active === true, `First KeyE within range must activate trap, got ${JSON.stringify(firstTrigger)}`);
      assert(firstTrigger.cd >= 20, `Expected ~25s cooldown (cdT), got ${firstTrigger.cd}`);
      assert(
        !(firstTrigger.nearestKind === "trap" && firstTrigger.nearestId === firstTrigger.id),
        `Cooling/active trap must NOT remain selectable via getNearestInteractable: ${JSON.stringify(firstTrigger)}`
      );

      await page.waitForTimeout(150);
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 2);
      const secondTrigger = await page.evaluate(() => {
        const t = FPS.world.traps[0];
        return {
          active: !!t.active,
          activeT: t.activeT || 0,
          cd: t.cdT ?? t.cdLeft ?? -1
        };
      });
      assert(
        secondTrigger.cd <= firstTrigger.cd + 0.05 && secondTrigger.activeT <= firstTrigger.activeT + 0.05,
        `Second KeyE while cooling must NOT reset trap cooldown/duration (${JSON.stringify(firstTrigger)} -> ${JSON.stringify(secondTrigger)})`
      );
    }
  },
  {
    id: "T2-F6-04",
    tier: 2,
    feature: "F6",
    title: "Broken Barricade Disables Both Movement Collider and raycastWallDist",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "barricade raycastWallDist pass-through", () => {
        if (!FPS.LEVELS[0].barricades || !FPS.LEVELS[0].barricades.length || typeof FPS.world.damageBarricade !== "function") {
          return { ok: false, detail: "barricades/damageBarricade missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const b = FPS.LEVELS[0].barricades[0];
        const ry = b.ry || 0;
        const sin = Math.sin(ry), cos = Math.cos(ry);
        const origin = new THREE.Vector3(b.x + sin * 4.0, (b.y || 0) + 1.0, b.z + cos * 4.0);
        const dir = new THREE.Vector3(-sin, 0, -cos);
        const dBefore = FPS.world.raycastWallDist(origin, dir, 10);
        FPS.world.damageBarricade(0, 9999);
        const dAfter = FPS.world.raycastWallDist(origin, dir, 10);
        return { dBefore, dAfter };
      });
      assert(res.dBefore < 4.5, `Intact barricade should block bullet raycast (d=${res.dBefore})`);
      assert(res.dAfter > res.dBefore + 0.5, `Broken barricade must let bullet raycast pass (${res.dBefore} -> ${res.dAfter})`);
    }
  },
  {
    id: "T2-F6-05",
    tier: 2,
    feature: "F6",
    title: "Pause/Resume Preserves State & Blocks Shove/Interact Input Leak",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "pause input isolation with v9.0 keys", () => {
        if (typeof FPS.entities.shove !== "function") return { ok: false, detail: "shove missing" };
        return { ok: true };
      });

      const stam0 = await page.evaluate(() => {
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
        FPS.state.G.stamina = 100;
        return 100;
      });
      await page.keyboard.press("KeyP");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "paused", null, { timeout: 5000 });
      await page.keyboard.press("KeyV");
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 2);

      const whilePaused = await page.evaluate(() => ({
        stamina: window.__fpsTest.getState().stamina,
        armoryHidden: document.getElementById("armoryScr").classList.contains("hidden")
      }));
      assert(whilePaused.stamina === stam0, "KeyV while paused must not consume stamina");
      assert(whilePaused.armoryHidden === true, "KeyE while paused must not open Armory");

      await page.click("#btnResume");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "playing", null, { timeout: 5000 });
    }
  },

  // ======================== F7: AI Director & Hazard Boundaries ========================
  {
    id: "T2-F7-01",
    tier: 2,
    feature: "F7",
    title: "AI Director Breather Window Bounded 6–8s & Lower Spawn Pressure Than Surge",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "AI Director breather duration", () => {
        if (!FPS.DIRECTOR) return { ok: false, detail: "FPS.DIRECTOR missing" };
        const st = window.__fpsTest.getState();
        if (!("directorPhase" in st)) return { ok: false, detail: "directorPhase missing" };
        return { ok: true };
      });

      const dur = await page.evaluate(() => {
        FPS.state.G.directorPhase = "surge";
        FPS.state.G.directorT = 0.01;
        return { min: FPS.DIRECTOR.breatherDurMin, max: FPS.DIRECTOR.breatherDurMax, mul: FPS.DIRECTOR.breatherSpawnMul };
      });
      await page.waitForTimeout(200);
      const st = await page.evaluate(() => ({ phase: window.__fpsTest.getState().directorPhase, t: FPS.state.G.directorT }));
      assert(st.phase === "breather", `Expected transition to breather, got ${st.phase}`);
      assert(st.t >= 5.5 && st.t <= 8.2, `Expected breather duration 6-8s, got ${st.t}`);
      assert(dur.mul > 1.0, "Breather spawn interval multiplier must slow spawns (> 1.0)");
    }
  },
  {
    id: "T2-F7-02",
    tier: 2,
    feature: "F7",
    title: "Exiting Hazard Restores Dry Walk Speed & Stops Toxic Fog DoT",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "toxic hazard exit", () => {
        const hz = FPS.LEVELS[3].hazards && FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        if (!hz || typeof FPS.world.getHazardAt !== "function") return { ok: false, detail: "toxic hazard missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const hz = FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        window.__fpsTest.teleportTo(hz.x, 1.7, hz.z);
      });
      await page.waitForTimeout(800);
      const hpIn = await page.evaluate(() => window.__fpsTest.getState().hp);

      await page.evaluate(() => {
        const sp = FPS.LEVELS[3].playerSpawn;
        window.__fpsTest.teleportTo(sp.x, 1.7, sp.z);
      });
      const hzAfter = await page.evaluate(() => {
        const p = window.__fpsTest.getState().playerPos;
        return FPS.world.getHazardAt(p.x, p.z, 0);
      });
      assert(hzAfter === null, `Expected null hazard at spawn, got ${hzAfter}`);
      await page.waitForTimeout(900);
      const hpOut = await page.evaluate(() => window.__fpsTest.getState().hp);
      assert(hpOut >= hpIn, `Toxic DoT continued after exiting hazard (${hpIn} -> ${hpOut})`);
    }
  },
  {
    id: "T2-F7-03",
    tier: 2,
    feature: "F7",
    title: "Electric Water Conduction Expires Cleanly When Turned Off",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "electrifyWater toggle off", () => {
        if (typeof FPS.world.electrifyWater !== "function") return { ok: false, detail: "electrifyWater missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        FPS.world.electrifyWater(true);
        const on = !!FPS.world.waterElectrified;
        FPS.world.electrifyWater(false);
        const off = !!FPS.world.waterElectrified;
        return { on, off };
      });
      assert(res.on === true && res.off === false, `electrifyWater toggle mismatch: ${JSON.stringify(res)}`);
    }
  },
  {
    id: "T2-F7-04",
    tier: 2,
    feature: "F7",
    title: "Zombie maxAlive Cap Under Surge + Boss Roar Keeps DrawCalls <= 75",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "M4 Surge + Boss Roar cap", () => {
        if (!FPS.DIRECTOR) return { ok: false, detail: "FPS.DIRECTOR missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        FPS.state.G.directorPhase = "surge";
        FPS.state.G.directorT = 15;
      });
      await page.waitForTimeout(1000);
      const check = await page.evaluate(() => ({
        zAlive: window.__fpsTest.getState().zombiesAlive,
        cap: FPS.LEVELS[3].maxAlive + (FPS.DIRECTOR.surgeMaxAliveBonus || 4) + 8
      }));
      assert(check.zAlive <= check.cap, `Zombie count ${check.zAlive} exceeded cap ${check.cap}`);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0 });
    }
  },
  {
    id: "T2-F7-05",
    tier: 2,
    feature: "F7",
    title: "Instanced Decal Pool Ring-Buffer Wrap at DECAL_MAX Limit",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "spawnDecal ring buffer", () => {
        if (typeof FPS.entities.spawnDecal !== "function") return { ok: false, detail: "spawnDecal missing" };
        return { ok: true };
      });

      await page.evaluate(() => {
        for (let i = 0; i < 160; i++) {
          FPS.entities.spawnDecal((i % 10) - 5, 0.02, Math.floor(i / 10) - 8, 0x7a0505, 0.7);
        }
      });
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0 });
    }
  },

  // ======================== F8: Desktop/Mobile HUD & Performance Boundaries ========================
  {
    id: "T2-F8-01",
    tier: 2,
    feature: "F8",
    title: "Narrow (1024x768) & Wide (1440x900) Desktop Zero-Overlap HUD Check",
    device: "desktop",
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "v9 HUD desktop layout", () => {
        if (!document.getElementById("scrapVal") || !document.getElementById("weaponSlots")) {
          return { ok: false, detail: "v9 HUD DOM missing" };
        }
        return { ok: true };
      });

      for (const vp of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(vp);
        await page.evaluate(() => { FPS.ui.showToast("Viewport check", 1200); });
        await page.waitForTimeout(420);
        await helpers.assertInViewport(page, helpers.DESKTOP_HUD_SELECTORS);
        await helpers.assertNoOverlap(page, helpers.DESKTOP_HUD_SELECTORS, { minIntersectPx: 2, msg: `${vp.width}x${vp.height}` });
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  },
  {
    id: "T2-F8-02",
    tier: 2,
    feature: "F8",
    title: "Mobile 390x844 Simultaneous BossBar + Toast + #btnInteract Zero Overlap",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "Mobile simultaneous BossBar + Toast + #btnInteract", () => {
        if (!document.getElementById("btnInteract") || !document.getElementById("btnShove")) {
          return { ok: false, detail: "#btnInteract / #btnShove missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const a = FPS.LEVELS[3].armory;
        if (a) window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
        const bw = document.getElementById("bossWrap");
        if (bw) bw.classList.remove("hidden");
        FPS.ui.showToast("Boss + Interact + Toast stress test", 1400);
      });
      await page.waitForTimeout(440);
      await helpers.assertInViewport(page, helpers.MOBILE_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2, msg: "Mobile stress" });
    }
  },
  {
    id: "T2-F8-03",
    tier: 2,
    feature: "F8",
    title: "Mobile Multi-Touch Joystick Move + Look Swipe + Pause Without Stuck Controls",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      const before = await page.evaluate(() => ({
        pos: window.__fpsTest.getState().playerPos,
        yaw: FPS.state.G.yaw
      }));

      await helpers.dragJoystick(page, 0, -36, 350);
      await helpers.swipeTouchLook(page, 90, 0);
      const after = await page.evaluate(() => ({
        pos: window.__fpsTest.getState().playerPos,
        yaw: FPS.state.G.yaw
      }));

      const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z);
      assert(moved > 0.1, `Joystick drag did not move player (moved=${moved.toFixed(3)})`);
      assert(Math.abs(after.yaw - before.yaw) > 0.05, `Touch swipe did not rotate yaw (${before.yaw} -> ${after.yaw})`);

      await helpers.tapTouch(page, "#btnPauseM");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "paused", null, { timeout: 5000 });
      await page.click("#btnResume");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "playing", null, { timeout: 5000 });
    }
  },
  {
    id: "T2-F8-04",
    tier: 2,
    feature: "F8",
    title: "Quality Modes (low/med/high/auto) Update DPR, Fog Far & Weather Particles",
    device: "desktop",
    deviceScaleFactor: 2,
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await page.evaluate(() => FPS.perf.setQualityMode("low"));
      await helpers.waitFrames(page, 2);
      const lowStats = await page.evaluate(() => ({
        stats: FPS.perf.getStats(),
        far: FPS.world.camera.far,
        dustVis: FPS.world.dustPts.visible
      }));
      assert(lowStats.stats.dpr <= 0.71, `Expected low DPR ~0.70, got ${lowStats.stats.dpr}`);
      assert(lowStats.dustVis === false, "Expected dustPts hidden in low quality");

      await page.evaluate(() => FPS.perf.setQualityMode("high"));
      await helpers.waitFrames(page, 2);
      const highStats = await page.evaluate(() => ({
        stats: FPS.perf.getStats(),
        far: FPS.world.camera.far,
        dustVis: FPS.world.dustPts.visible
      }));
      assert(highStats.stats.dpr <= 1.0 && highStats.stats.dpr >= 0.99, `Expected high DPR capped at 1.0, got ${highStats.stats.dpr}`);
      assert(highStats.dustVis === true, "Expected dustPts visible in high quality");
      assert(highStats.far > lowStats.far, `Expected high camera.far (${highStats.far}) > low (${lowStats.far})`);
    }
  },
  {
    id: "T2-F8-05",
    tier: 2,
    feature: "F8",
    title: "Repeated Level Reloads (M1->M2->M3->M4->M5->M1) Preserve DrawCall & Memory Stability",
    device: "desktop",
    async run({ page, helpers }) {
      const seq = [1, 2, 3, 4, 5, 1];
      for (const lv of seq) {
        await helpers.startLevelAndWait(page, lv);
        await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
      }
    }
  }
];
