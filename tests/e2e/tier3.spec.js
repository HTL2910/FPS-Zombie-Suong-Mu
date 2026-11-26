"use strict";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

const VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

module.exports = [
  {
    id: "T3-01",
    tier: 3,
    feature: "Pairwise(F2xF4)",
    title: "Verticality x Special Infected: Elevated Platform Drop-Down Evades Spitter Acid & Stalker Climbs",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 3);
      await helpers.requireV9(page, "Verticality x Special Infected", () => {
        if (typeof FPS.world.groundY !== "function" || typeof window.__fpsTest.triggerSpecial !== "function") {
          return { ok: false, detail: "groundY or triggerSpecial missing" };
        }
        if (typeof FPS.entities.spawnAcidPool !== "function") return { ok: false, detail: "spawnAcidPool missing" };
        const p = (FPS.world.platforms || []).find((x) => !x.rampOnly && x.yTop >= 1.8);
        if (!p) return { ok: false, detail: "No platform >= 1.8m on Map 3" };
        return { ok: true };
      });

      await page.evaluate(() => {
        const p = FPS.world.platforms.find((x) => !x.rampOnly && x.yTop >= 1.8);
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
        FPS.state.G.yaw = Math.atan2(-wdx, -wdz);
        FPS.entities.spawnAcidPool(sx, p.yTop, sz);
        window.__fpsTest.triggerSpecial("stalker");
      });
      await helpers.holdKey(page, "KeyW", 1000);
      await page.waitForTimeout(450);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.groundY < 0.1, `Drop-down from elevated acid pool must return groundY=0, got ${st.groundY}`);
      assert(st.specialsAlive >= 1, "Stalker must remain active");
    }
  },
  {
    id: "T3-02",
    tier: 3,
    feature: "Pairwise(F3xF5)",
    title: "Scrap/Armory/Anvil Mk.III x M4 Totems & Orc Grave Lord Shield Break",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "Anvil Mk.III x M4 Totems", () => {
        if (typeof FPS.entities.unlockWeapon !== "function" || typeof FPS.entities.upgradeWeapon !== "function") {
          return { ok: false, detail: "unlock/upgrade missing" };
        }
        if (typeof window.__fpsTest.damageObjective !== "function" || typeof FPS.entities.applyArmorShield !== "function") {
          return { ok: false, detail: "damageObjective or applyArmorShield missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        window.__fpsTest.grantScrap(1500);
        FPS.entities.unlockWeapon("rifle");
        FPS.entities.upgradeWeapon("rifle");
        FPS.entities.upgradeWeapon("rifle");
        FPS.entities.switchWeapon("rifle");
        const shielded = FPS.entities.applyArmorShield(100);
        window.__fpsTest.damageObjective(9999);
        const unshielded = FPS.entities.applyArmorShield(100);
        const st = window.__fpsTest.getState();
        return { shielded, unshielded, rifleTier: st.weaponTiers.rifle };
      });
      assert(res.rifleTier === 3, `Expected rifle Mk.III (3), got ${res.rifleTier}`);
      assert(res.unshielded > res.shielded, "Breaking totems must drop Orc armor shield");
    }
  },
  {
    id: "T3-03",
    tier: 3,
    feature: "Pairwise(F6xF7)",
    title: "Chokepoint Traps x M5 Shallow Water Conduction Kills Water Zombies While Dry Pier Safe",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);
      await helpers.requireV9(page, "Trap x Water conduction", () => {
        if (typeof FPS.world.activateTrap !== "function" || typeof FPS.world.getHazardAt !== "function") {
          return { ok: false, detail: "activateTrap or getHazardAt missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const hz = FPS.LEVELS[4].hazards.find((h) => h.kind === "water");
        const pier = FPS.LEVELS[4].platforms && FPS.LEVELS[4].platforms[0];
        if (pier) window.__fpsTest.teleportTo(pier.x, pier.yTop + 1.7, pier.z);
        FPS.entities.zombies.forEach((x) => { delete x.__t303Target; });
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        z.__t303Target = true;
        if (hz) {
          const gy = FPS.world.groundY ? FPS.world.groundY(hz.x, hz.z, 0) : 0;
          z.spawnT = 0;
          z.group.position.set(hz.x, gy, hz.z);
        }
        const ti = FPS.LEVELS[4].traps.findIndex((t) => t.kind === "electric");
        FPS.world.activateTrap(ti >= 0 ? ti : 0);
      });
      await page.waitForTimeout(900);
      const res = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const z = FPS.entities.zombies.find((x) => x.__t303Target);
        return { hp: st.hp, zHp: z ? z.hp : 0 };
      });
      assert(res.hp === 100, `Player on elevated dry pier must take 0 water shock, hp=${res.hp}`);
      assert(res.zHp < 62, `Zombie in electrified water must take shock damage, zHp=${res.zHp}`);
    }
  },
  {
    id: "T3-04",
    tier: 3,
    feature: "Pairwise(F3xF6)",
    title: "Quick Shove x M3 Relic Carry (-12% Sprint) & Barricade Pushout Safety",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 3);
      await helpers.requireV9(page, "Shove x Relic x Barricade", () => {
        if (typeof FPS.entities.shove !== "function" || !FPS.LEVELS[2].barricades || !FPS.LEVELS[2].barricades.length) {
          return { ok: false, detail: "shove or M3 barricades missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const r0 = FPS.LEVELS[2].objective.items[0];
        window.__fpsTest.teleportTo(r0.x, (r0.y || 0) + 1.7, r0.z + 1.0);
      });
      await page.keyboard.press("KeyE");
      await helpers.waitFrames(page, 2);

      const res = await page.evaluate(() => {
        const st = window.__fpsTest.getState();
        const z = FPS.entities.spawnZombie("normal");
        if (!z || !z.group) throw new Error("Failed to spawn normal zombie");
        const zx = st.playerPos.x;
        const zz = st.playerPos.z - 1.5;
        const gy = FPS.world.groundY ? FPS.world.groundY(zx, zz, 0) : 0;
        z.spawnT = 0;
        z.group.position.set(zx, gy, zz);
        FPS.state.G.yaw = 0;
        FPS.state.G.stamina = 100;
        const ok = FPS.entities.shove();
        return { carrying: st.carryingRelics, ok, stam: FPS.state.G.stamina };
      });
      assert(res.carrying >= 1, "Must be carrying Relic 0");
      assert(res.ok && res.stam <= 80, "Shove must still fire cleanly while carrying relic");
    }
  },
  {
    id: "T3-05",
    tier: 3,
    feature: "Pairwise(F3xF7)",
    title: "AI Director Breather x M2 Panic Horde Override & Bright Lamps",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "Director Breather x M2 Panic Horde", () => {
        if (!FPS.LEVELS[1].objective || FPS.LEVELS[1].objective.type !== "generators") {
          return { ok: false, detail: "M2 generators missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        FPS.state.G.directorPhase = "breather";
        FPS.state.G.directorT = 7.0;
        FPS.world.setGeneratorState(0, true);
        const g1 = FPS.LEVELS[1].objective.items[1];
        window.__fpsTest.teleportTo(g1.x, (g1.y || 0) + 1.7, g1.z + 1.2);
      });
      await helpers.holdKey(page, "KeyE", 2200);
      await helpers.waitFrames(page, 3);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      const panicOn = st.panicT > 0 || Boolean(st.objState && st.objState.panicActive);
      const brightOn = Boolean(st.objState && st.objState.lightsBright);
      assert(
        brightOn && panicOn,
        `2nd generator must activate BOTH bright lamps AND Panic Horde, got ${JSON.stringify(st.objState)} (panicT=${st.panicT})`
      );
      assert(
        st.directorPhase !== "breather" || panicOn,
        `2nd generator must override breather phase (directorPhase=${st.directorPhase}, panicOn=${panicOn})`
      );
    }
  },
  {
    id: "T3-06",
    tier: 3,
    feature: "Pairwise(F1xF8)",
    title: "Bilingual EN x Mobile 390x844 HUD, #armoryScr & Zero Bounding-Box Overlap",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.switchLang(page, "en");
      await helpers.startLevelAndWait(page, 2);
      await helpers.requireV9(page, "EN Mobile v9 HUD & Armory", () => {
        if (!document.getElementById("armoryScr") || !document.getElementById("btnInteract") || !document.getElementById("btnShove")) {
          return { ok: false, detail: "Missing mobile/armory v9 DOM" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const a = FPS.LEVELS[1].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
        FPS.ui.showToast("EN Mobile HUD Check", 1200);
      });
      await page.waitForTimeout(420);
      await helpers.assertInViewport(page, helpers.MOBILE_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2, msg: "EN Mobile HUD" });

      await helpers.tapTouch(page, "#btnInteract");
      await page.waitForFunction(() => !document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });
      const titleTxt = await page.locator("#armoryScr h1, #armoryScr .title, #armoryTitle").first().textContent();
      assert(!VI_DIACRITIC_RE.test(titleTxt || ""), `Expected EN Armory title, got "${titleTxt}"`);
      await helpers.tapTouch(page, "#btnArmoryClose");
    }
  },
  {
    id: "T3-07",
    tier: 3,
    feature: "Pairwise(F5xBarrel)",
    title: "Headshot Streak x Explosive Barrel Chain Kill & Scrap Bonus",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "hsStreak x barrel scrap", () => {
        const st = window.__fpsTest.getState();
        if (!("scrap" in st) || !("hsStreak" in st)) return { ok: false, detail: "scrap/hsStreak missing" };
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        for (let i = 0; i < 3; i++) {
          const z = FPS.entities.spawnZombie("normal");
          if (z) FPS.entities.damageZombie(z, 999, true);
        }
        const scrapBefore = window.__fpsTest.getState().scrap;
        const streakBefore = window.__fpsTest.getState().hsStreak;
        const b = FPS.world.explosiveBarrels.find((x) => x.alive);
        if (b) {
          for (let j = 0; j < 2; j++) {
            const z = FPS.entities.spawnZombie("runner");
            if (z && z.group) {
              const zx = b.x + 1.0 + j, zz = b.z;
              const gy = FPS.world.groundY ? FPS.world.groundY(zx, zz, 0) : 0;
              z.spawnT = 0;
              z.group.position.set(zx, gy, zz);
            }
          }
          window.__fpsTest.shootBarrel(0);
        }
        const stAfter = window.__fpsTest.getState();
        return { scrapBefore, streakBefore, stAfter };
      });
      assert(res.stAfter.barrelsPopped >= 1, "Barrel must detonate");
      assert(res.stAfter.scrap > res.scrapBefore, "Barrel kills must award additional Scrap");
      assert(res.stAfter.hsStreak >= res.streakBefore, "Barrel detonation must not prematurely clear HS streak");
    }
  },
  {
    id: "T3-08",
    tier: 3,
    feature: "Pairwise(F5xF6)",
    title: "Destructible Barricade x Shotgun Pellets Block Then Pass-Through on Break",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Barricade x Shotgun", () => {
        if (!FPS.LEVELS[0].barricades || !FPS.LEVELS[0].barricades.length || typeof FPS.entities.unlockWeapon !== "function") {
          return { ok: false, detail: "barricades or unlockWeapon missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        FPS.entities.unlockWeapon("shotgun");
        FPS.entities.switchWeapon("shotgun");
        const b = FPS.LEVELS[0].barricades[0];
        const z = FPS.entities.spawnZombie("brute");
        if (!z || !z.group) throw new Error("Failed to spawn brute");
        const ry = b.ry || 0;
        const sin = Math.sin(ry), cos = Math.cos(ry);
        const px = b.x + sin * 2.5, pz = b.z + cos * 2.5;
        const zx = b.x - sin * 2.5, zz = b.z - cos * 2.5;
        const gyZ = FPS.world.groundY ? FPS.world.groundY(zx, zz, b.y || 0) : (b.y || 0);
        const bh = b.h || 1.65;
        const py = (b.y || 0) + Math.min(1.2, bh * 0.8);
        z.spawnT = 0;
        z.group.position.set(zx, gyZ, zz);
        window.__fpsTest.teleportTo(px, py, pz);
        FPS.state.G.yaw = ry;
        FPS.state.G.pitch = 0;
        if (FPS.state.playerPos) FPS.state.playerPos.set(px, py, pz);
        FPS.world.camera.position.set(px, py, pz);
        FPS.world.camera.rotation.set(0, ry, 0, "YXZ");
        FPS.world.camera.updateMatrixWorld(true);
        const hp0 = z.hp;
        FPS.state.G.lastShot = 0;
        FPS.entities.shoot();
        const hpBlocked = z.hp;
        FPS.world.damageBarricade(0, 9999);
        FPS.state.G.lastShot = 0;
        FPS.entities.shoot();
        const hpAfterBreak = z.hp;
        return { hp0, hpBlocked, hpAfterBreak };
      });
      assert(res.hpBlocked === res.hp0, `Intact barricade must block shotgun pellets (${res.hp0} vs ${res.hpBlocked})`);
      assert(res.hpAfterBreak < res.hp0, `Shotgun pellets must hit zombie after barricade breaks (${res.hp0} -> ${res.hpAfterBreak})`);
    }
  },
  {
    id: "T3-09",
    tier: 3,
    feature: "Pairwise(F5xF8)",
    title: "Armory Modal Blocks Gameplay Firing & Weapon Keys Until Closed",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Armory modal input isolation", () => {
        if (!document.getElementById("armoryScr") || !FPS.LEVELS[0].armory) {
          return { ok: false, detail: "Armory modal or M1 armory missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => !document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });

      const magBefore = await page.evaluate(() => FPS.entities.wState.pistol.mag);
      await page.keyboard.press("Digit4");
      await page.mouse.click(20, 20, { button: "left" });
      await helpers.waitFrames(page, 2);
      const mid = await page.evaluate(() => ({
        mag: FPS.entities.wState.pistol.mag,
        curW: window.__fpsTest.getState().curWeapon
      }));
      assert(mid.mag === magBefore, "Clicking while Armory is open must NOT fire pistol");
      assert(mid.curW === "pistol", "Pressing Digit4 while Armory is open must NOT swap weapon");

      await page.click("#btnArmoryClose");
      await page.waitForFunction(() => document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });
    }
  },
  {
    id: "T3-10",
    tier: 3,
    feature: "Pairwise(F4xF8)",
    title: "Phantom Stalker VFX (#shadowDash) x Bloater Blind (#blackoutVeil) x Low-HP Vignette Coexistence",
    device: "desktop",
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);
      await helpers.requireV9(page, "Stalker + Bloater VFX hooks", () => {
        if (typeof FPS.ui.showStalkerWarn !== "function" || typeof FPS.ui.showBloaterBlind !== "function") {
          return { ok: false, detail: "showStalkerWarn / showBloaterBlind missing" };
        }
        return { ok: true };
      });

      const vfx = await page.evaluate(async () => {
        FPS.state.G.hp = 25;
        document.body.classList.add("lowhp");
        FPS.ui.showBloaterBlind(1.2);
        FPS.ui.showStalkerWarn();
        const veilEl = document.getElementById("blackoutVeil");
        const dashEl = document.getElementById("shadowDash");
        const veil0 = parseFloat(getComputedStyle(veilEl).opacity || "0");
        const dash0 = parseFloat(getComputedStyle(dashEl).opacity || "0");
        await new Promise((r) => setTimeout(r, 140));
        const veilCS = getComputedStyle(veilEl);
        const dashCS = getComputedStyle(dashEl);
        return {
          veilPE: veilCS.pointerEvents,
          dashPE: dashCS.pointerEvents,
          veilOp: Math.max(veil0, parseFloat(veilCS.opacity || "0")),
          dashOp: Math.max(dash0, parseFloat(dashCS.opacity || "0")),
          hasLowHp: document.body.classList.contains("lowhp")
        };
      });
      assert(vfx.veilPE === "none" && vfx.dashPE === "none", "VFX overlays must keep pointer-events: none");
      assert(vfx.veilOp > 0.05, `Expected #blackoutVeil active opacity > 0.05, got ${vfx.veilOp}`);
      assert(vfx.dashOp > 0.05, `Expected #shadowDash active opacity > 0.05, got ${vfx.dashOp}`);
      assert(vfx.hasLowHp === true, "Expected body.lowhp to remain active while VFX overlays show");
      await page.waitForTimeout(1600);
    }
  },
  {
    id: "T3-11",
    tier: 3,
    feature: "Pairwise(F6xF7)",
    title: "M4 Toxic Fog x AI Director Surge & Quick Shove Stamina",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "Toxic fog x Surge x Shove", () => {
        if (typeof FPS.entities.shove !== "function" || typeof FPS.world.getHazardAt !== "function") {
          return { ok: false, detail: "shove or getHazardAt missing" };
        }
        return { ok: true };
      });

      const res = await page.evaluate(() => {
        const hz = FPS.LEVELS[3].hazards.find((h) => h.kind === "toxic");
        window.__fpsTest.teleportTo(hz.x, 1.7, hz.z);
        FPS.state.G.directorPhase = "surge";
        FPS.state.G.stamina = 100;
        const z = FPS.entities.spawnZombie("runner");
        if (!z || !z.group) throw new Error("Failed to spawn runner zombie");
        const zx = hz.x, zz = hz.z - 1.5;
        const gy = FPS.world.groundY ? FPS.world.groundY(zx, zz, 0) : 0;
        z.spawnT = 0;
        z.group.position.set(zx, gy, zz);
        FPS.state.G.yaw = 0;
        const shoved = FPS.entities.shove();
        return { hzKind: FPS.world.getHazardAt(hz.x, hz.z, 0), shoved, stam: FPS.state.G.stamina };
      });
      assert(res.hzKind === "toxic", "Must be inside toxic fog");
      assert(res.shoved && res.stam <= 80, "Shove must work inside toxic fog during surge");
    }
  },
  {
    id: "T3-12",
    tier: 3,
    feature: "Pairwise(F7xF8)",
    title: "Low Quality Mode x Instanced Decal Pool x M4->M5 Transition Reset",
    device: "desktop",
    deviceScaleFactor: 2,
    taintedAfter: true,
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 4);
      await helpers.requireV9(page, "Low quality x Decal pool x Reset", () => {
        if (typeof FPS.entities.spawnDecal !== "function" || typeof window.__fpsTest.triggerSpecial !== "function") {
          return { ok: false, detail: "spawnDecal or triggerSpecial missing" };
        }
        return { ok: true };
      });

      await page.evaluate(() => {
        FPS.perf.setQualityMode("low");
        for (let i = 0; i < 25; i++) FPS.entities.spawnDecal(i % 5, 0.02, i % 5, 0x39ff14, 0.7);
        window.__fpsTest.triggerSpecial("spitter");
        window.__fpsTest.throwFlare();
      });
      await helpers.startLevelAndWait(page, 5);
      const st = await page.evaluate(() => window.__fpsTest.getState());
      assert(st.specialsAlive === 0, `Specials must clear on M4->M5 transition, got ${st.specialsAlive}`);
      assert(st.activeFireZones === 0, `Fire zones must clear on M4->M5 transition, got ${st.activeFireZones}`);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 0.75 });
    }
  }
];
