"use strict";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

module.exports = [
  {
    id: "T4-01",
    tier: 4,
    feature: "E2E-M1",
    title: "M1 Mist Dead-End Full Run: Boot -> EN Toggle -> Platform Climb -> Scrap/Shove -> Gate Break -> Exfil + Perf Gate",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    async run({ page, url, apiMock, helpers }) {
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      await helpers.switchLang(page, "en");
      await page.click("#btnStart");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "playing", null, { timeout: 10000 });

      await helpers.requireV9(page, "T4-01 v9.0 M1 runtime", () => {
        if (typeof FPS.world.groundY !== "function" || typeof FPS.entities.shove !== "function" || typeof window.__fpsTest.damageObjective !== "function") {
          return { ok: false, detail: "Missing groundY, shove, or damageObjective" };
        }
        return { ok: true };
      });

      // Climb elevated platform via ramp using runtime descriptor (handles ry != 0 & rampLen)
      await page.evaluate(() => {
        const p = FPS.world.platforms.find((pl) => pl.ramps && pl.ramps.length > 0 && pl.yTop >= 1.5);
        if (!p) throw new Error("No ramped runtime platform >= 1.5m on Map 1");
        const rm = p.ramps[0];
        let lx = 0, lz = 0, ldx = 0, ldz = 0;
        if (rm.side === "s") { lx = (rm.xMin + rm.xMax) * 0.5; lz = rm.zMax + 0.5; ldz = -1; }
        else if (rm.side === "n") { lx = (rm.xMin + rm.xMax) * 0.5; lz = rm.zMin - 0.5; ldz = 1; }
        else if (rm.side === "e") { lx = rm.xMax + 0.5; lz = (rm.zMin + rm.zMax) * 0.5; ldx = -1; }
        else { lx = rm.xMin - 0.5; lz = (rm.zMin + rm.zMax) * 0.5; ldx = 1; }
        const sx = rm.x + (rm.rot ? (lx * rm.cos + lz * rm.sin) : lx);
        const sz = rm.z + (rm.rot ? (-lx * rm.sin + lz * rm.cos) : lz);
        const wdx = rm.rot ? (ldx * rm.cos + ldz * rm.sin) : ldx;
        const wdz = rm.rot ? (-ldx * rm.sin + ldz * rm.cos) : ldz;
        window.__fpsTest.teleportTo(sx, 1.7, sz);
        FPS.state.G.yaw = Math.atan2(-wdx, -wdz);
      });
      await helpers.holdKey(page, "KeyW", 1600);
      const onPlat = await page.evaluate(() => window.__fpsTest.getState());
      assert(onPlat.groundY > 1.0, `Expected elevated groundY > 1.0, got ${onPlat.groundY}`);

      // Combat: barrel + headshots + shove
      await page.evaluate(() => {
        window.__fpsTest.shootBarrel(0);
        for (let i = 0; i < 3; i++) {
          const z = FPS.entities.spawnZombie("normal");
          if (z) FPS.entities.damageZombie(z, 999, true);
        }
      });
      await page.keyboard.press("KeyV");
      await helpers.waitFrames(page, 2);

      // Performance Gate & Desktop HUD non-overlap
      await helpers.assertInViewport(page, helpers.DESKTOP_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.DESKTOP_HUD_SELECTORS, { minIntersectPx: 2, msg: "T4-01 M1 HUD" });
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });

      // Quota + Gate break -> Exfil -> Level Clear -> Pick Perk -> M2
      await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        window.__fpsTest.damageObjective(9999);
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "levelclear", null, { timeout: 10000 });
      await page.locator("#perkCards .upcard").first().click();
      await page.waitForFunction(() => {
        const st = window.__fpsTest.getState();
        return st.state === "playing" && st.level === 2;
      }, null, { timeout: 15000 });
      assert(apiMock.apiLog.some((x) => x.path === "/api/profile"), "Expected mocked profile API activity");
    }
  },
  {
    id: "T4-02",
    tier: 4,
    feature: "E2E-M2",
    title: "M2 Night Market Panic Holdout: Armory Shotgun Unlock -> 2 Generators (2s E) -> Trap + Horde -> Exfil + Perf Gate",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "T4-02 v9.0 M2 runtime", () => {
        if (!FPS.LEVELS[1].objective || FPS.LEVELS[1].objective.type !== "generators" || !FPS.LEVELS[1].armory) {
          return { ok: false, detail: "M2 generators/armory missing" };
        }
        return { ok: true };
      });

      // Open Armory & unlock Shotgun
      await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        const a = FPS.LEVELS[1].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => !document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });
      await helpers.clickArmoryAction(page, "unlock", "shotgun");
      await page.click("#btnArmoryClose");
      await page.keyboard.press("Digit2");

      // Hold E 2.1s on both generators
      for (let gi = 0; gi < 2; gi++) {
        await page.evaluate((idx) => {
          const g = FPS.LEVELS[1].objective.items[idx];
          window.__fpsTest.teleportTo(g.x, (g.y || 0) + 1.7, g.z + 1.2);
        }, gi);
        await helpers.holdKey(page, "KeyE", 2200);
      }

      // Activate trap during Panic Horde
      await page.evaluate(() => {
        const t = FPS.LEVELS[1].traps[0];
        if (t) window.__fpsTest.teleportTo(t.x, (t.y || 0) + 1.7, t.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 3);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });

      await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "levelclear", null, { timeout: 10000 });
    }
  },
  {
    id: "T4-03",
    tier: 4,
    feature: "E2E-M3",
    title: "M3 Pine Forest Relic Run: Lookout Platform + Spitter Acid Drop-Down + 2 Relics (-12% Sprint) + Shove + Exfil",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 3);
      await helpers.requireV9(page, "T4-03 v9.0 M3 runtime", () => {
        if (!FPS.LEVELS[2].objective || FPS.LEVELS[2].objective.type !== "relics" || typeof window.__fpsTest.triggerSpecial !== "function") {
          return { ok: false, detail: "M3 relics or triggerSpecial missing" };
        }
        return { ok: true };
      });

      // Climb/drop from lookout platform while evading Spitter acid
      await page.evaluate(() => {
        const p = (FPS.world.platforms || []).find((pl) => !pl.rampOnly && pl.yTop >= 1.8);
        if (!p) throw new Error("No elevated platform >= 1.8m on Map 3");
        const rampSides = new Set((p.ramps || []).map((r) => r.side));
        const edgeSide = ["n", "s", "e", "w"].find((s) => !rampSides.has(s)) || "n";
        let lx = 0, lz = 0, ldx = 0, ldz = 0;
        if (edgeSide === "n") { lz = -p.hd + 0.35; ldz = -1; }
        else if (edgeSide === "s") { lz = p.hd - 0.35; ldz = 1; }
        else if (edgeSide === "e") { lx = p.hw - 0.35; ldx = 1; }
        else { lx = -p.hw + 0.35; ldx = -1; }
        const sx = p.x + (p.rot ? (lx * p.cos + lz * p.sin) : lx);
        const sz = p.z + (p.rot ? (-lx * p.sin + lz * p.cos) : lz);
        const wdx = p.rot ? (ldx * p.cos + ldz * p.sin) : ldx;
        const wdz = p.rot ? (-ldx * p.sin + ldz * p.cos) : ldz;
        window.__fpsTest.teleportTo(sx, p.yTop + 1.7, sz);
        window.__fpsTest.triggerSpecial("spitter");
        FPS.entities.spawnAcidPool(sx, p.yTop, sz);
        FPS.state.G.yaw = Math.atan2(-wdx, -wdz);
      });
      await helpers.holdKey(page, "KeyW", 1200);

      // Pick up both relics & shove pursuing zombies
      for (let ri = 0; ri < 2; ri++) {
        await page.evaluate((idx) => {
          const r = FPS.LEVELS[2].objective.items[idx];
          window.__fpsTest.teleportTo(r.x, (r.y || 0) + 1.7, r.z + 1.0);
        }, ri);
        await page.keyboard.press("KeyE");
        await helpers.waitFrames(page, 2);
      }
      await page.keyboard.press("KeyV");

      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.carryingRelics >= 2 || (st.objState && st.objState.collected >= 2), "Must carry/collect both M3 relics");
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });

      await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "levelclear", null, { timeout: 10000 });
    }
  },
  {
    id: "T4-04",
    tier: 4,
    feature: "E2E-M4",
    title: "M4 Graveyard Boss & Totems: Toxic Fog + Rifle Upgrade + 3 Totems + Bloater/Stalker + Orc Grave Lord",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "T4-04 v9.0 M4 runtime", () => {
        if (!FPS.LEVELS[3].objective || FPS.LEVELS[3].objective.type !== "totems" || !FPS.LEVELS[3].anvil) {
          return { ok: false, detail: "M4 totems/anvil missing" };
        }
        return { ok: true };
      });

      // Toxic fog check + Armory/Anvil rifle unlock+upgrade
      await page.evaluate(() => {
        const hz = FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        if (hz) window.__fpsTest.teleportTo(hz.x, 1.7, hz.z);
        window.__fpsTest.grantScrap(1200);
        FPS.entities.unlockWeapon("rifle");
        FPS.entities.upgradeWeapon("rifle");
        FPS.entities.switchWeapon("rifle");
        window.__fpsTest.triggerSpecial("bloater");
        window.__fpsTest.triggerSpecial("stalker");
      });

      // Destroy all 3 Cursed Totems
      await page.evaluate(() => { window.__fpsTest.damageObjective(9999); });
      await helpers.waitFrames(page, 3);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });

      // Defeat Orc Grave Lord & extract
      await page.evaluate(() => {
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "levelclear", null, { timeout: 10000 });
    }
  },
  {
    id: "T4-05",
    tier: 4,
    feature: "E2E-M5",
    title: "M5 Ghost River Finale: Anvil Mk.III + Electric Water Trap + Flare 25s Holdout + Minotaur + Boat Exfil",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, apiMock, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "T4-05 v9.0 M5 runtime", () => {
        if (!FPS.LEVELS[4].objective || FPS.LEVELS[4].objective.type !== "holdout") {
          return { ok: false, detail: "M5 holdout missing" };
        }
        return { ok: true };
      });

      apiMock.clearLog();
      await page.evaluate(() => {
        window.__fpsTest.grantScrap(1500);
        FPS.entities.unlockWeapon("rifle");
        FPS.entities.upgradeWeapon("rifle");
        FPS.entities.upgradeWeapon("rifle");
        FPS.entities.switchWeapon("rifle");
        const ti = FPS.LEVELS[4].traps.findIndex((t) => t.kind === "electric");
        FPS.world.activateTrap(ti >= 0 ? ti : 0);
        const fp = FPS.LEVELS[4].objective.flarePos;
        window.__fpsTest.teleportTo(fp.x, (fp.y || 0) + 1.7, fp.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 4);

      const hold0 = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const os = st.objState || {};
        const timerVal = os.holdLeft ?? os.holdoutLeft ?? os.timeLeft ?? os.remaining ?? os.holdRemaining ?? os.holdElapsed ?? os.elapsed ?? FPS.state?.G?.objProgress ?? null;
        return { os, timerVal };
      });
      assert(
        hold0.os && (hold0.os.flareLit || hold0.os.holdoutActive),
        `Expected flare lit / holdout active, got ${JSON.stringify(hold0.os)}`
      );

      await page.waitForTimeout(1100);
      const hold1 = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const os = st.objState || {};
        const timerVal = os.holdLeft ?? os.holdoutLeft ?? os.timeLeft ?? os.remaining ?? os.holdRemaining ?? os.holdElapsed ?? os.elapsed ?? FPS.state?.G?.objProgress ?? null;
        const hasMinotaur = FPS.entities.zombies.some((z) => z.type === "minotaur");
        return { os, timerVal, hasMinotaur };
      });
      assert(
        hold0.timerVal !== null && hold1.timerVal !== null && hold1.timerVal !== hold0.timerVal,
        `Expected M5 holdout timer countdown to progress over 1100ms (${hold0.timerVal} -> ${hold1.timerVal})`
      );
      assert(hold1.hasMinotaur, "Expected Minotaur boss to spawn during M5 holdout");

      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });

      await page.evaluate(() => {
        window.__fpsTest.damageObjective(9999);
        window.__fpsTest.completeQuota();
        window.__fpsTest.teleportToExtract();
      });
      await page.waitForFunction(() => window.__fpsTest.getState().state === "end", null, { timeout: 10000 });

      const lbPosts = apiMock.apiLog.filter((x) => x.path === "/api/leaderboard" && x.method === "POST");
      assert(lbPosts.length >= 1, "Campaign victory must submit score to mocked POST /api/leaderboard");
      assert(lbPosts[0].body && lbPosts[0].body.win === true, "Submitted leaderboard payload must mark win: true");
    }
  },
  {
    id: "T4-06",
    tier: 4,
    feature: "E2E-Mobile",
    title: "Mobile 390x844 Full Touch Combat & Armory Flow (Zero Overlap + Perf Gate)",
    device: "mobile",
    freshContext: true,
    manualBoot: true,
    async run({ page, url, helpers }) {
      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      await helpers.switchLang(page, "en");
      await page.click("#btnStart");
      await page.waitForFunction(() => {
        const st = window.__fpsTest.getState();
        return st && st.state === "playing" && document.body.classList.contains("touch") && document.body.classList.contains("playing");
      }, null, { timeout: 10000 });

      await helpers.requireV9(page, "T4-06 Mobile v9.0 controls", () => {
        if (!document.getElementById("btnShove") || !document.getElementById("btnInteract") || !document.getElementById("armoryScr")) {
          return { ok: false, detail: "Missing #btnShove, #btnInteract, or #armoryScr" };
        }
        return { ok: true };
      });

      // Touch combat actions
      await helpers.dragJoystick(page, 0, -34, 300);
      await helpers.swipeTouchLook(page, 70, 0);
      await helpers.tapTouch(page, "#btnFire");
      await helpers.tapTouch(page, "#btnJump");
      await helpers.tapTouch(page, "#btnShove");

      // Open Armory via #btnInteract, unlock Shotgun, close modal
      await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
        FPS.ui.showToast("Mobile E2E Run", 1400);
      });
      await page.waitForTimeout(440);
      await helpers.assertInViewport(page, helpers.MOBILE_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2, msg: "T4-06 Mobile HUD" });

      await helpers.tapTouch(page, "#btnInteract");
      await page.waitForFunction(() => !document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });
      await helpers.assertZOrderAbove(page, "#armoryScr", ["#mobile", "#btnPauseM", "#muteBtn", "#hud"]);
      await helpers.clickArmoryAction(page, "unlock", "shotgun");
      await helpers.tapTouch(page, "#btnArmoryClose");

      // Pause & resume check
      await helpers.tapTouch(page, "#btnPauseM");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "paused", null, { timeout: 5000 });
      await page.click("#btnResume");
      await page.waitForFunction(() => window.__fpsTest.getState().state === "playing", null, { timeout: 5000 });

      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
    }
  }
];
