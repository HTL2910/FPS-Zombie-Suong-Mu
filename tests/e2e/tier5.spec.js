"use strict";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

module.exports = [
  {
    id: "T5-01",
    tier: 5,
    feature: "T5-Lifecycle",
    title: "Game Over -> Retry (#btnAgain) & Menu (#btnMenu2) Resets Flashlight, Vignette, Timers & VFX Overlays",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      // Turn flashlight OFF, trigger Bloater blind, Stalker warn, and Toast, then die
      await page.keyboard.press("KeyF");
      await page.evaluate(() => {
        FPS.ui.showBloaterBlind(3.0);
        FPS.ui.showStalkerWarn();
        FPS.ui.showToast("Stale Toast From M1", 5000);
        FPS.game.hurtPlayer(200, undefined, undefined, true);
      });

      await page.waitForFunction(() => {
        const es = document.getElementById("endScr");
        return es && !es.classList.contains("hidden");
      }, null, { timeout: 5000 });
      await helpers.waitFrames(page, 2);

      const onEnd = await page.evaluate(() => {
        const bv = document.getElementById("blackoutVeil");
        const sd = document.getElementById("shadowDash");
        const nt = document.getElementById("noteToast");
        const vg = document.getElementById("vignette");
        return {
          state: FPS.state.G.state,
          lowhp: document.body.classList.contains("lowhp"),
          veilOp: bv ? parseFloat(getComputedStyle(bv).opacity) : 0,
          dashOp: sd ? parseFloat(getComputedStyle(sd).opacity) : 0,
          toastShow: nt ? nt.classList.contains("show") : false,
          vignetteOp: vg ? parseFloat(getComputedStyle(vg).opacity) : 0
        };
      });
      assert(onEnd.state === "end", `Expected state=end, got ${onEnd.state}`);
      assert(!onEnd.lowhp, "body.lowhp must be cleared on endScr");
      assert(onEnd.veilOp <= 0.02, `#blackoutVeil must be cleared on endScr, got ${onEnd.veilOp}`);
      assert(onEnd.dashOp <= 0.02, `#shadowDash must be cleared on endScr, got ${onEnd.dashOp}`);
      assert(!onEnd.toastShow, "#noteToast.show must be cleared on endScr");
      assert(onEnd.vignetteOp <= 0.02, `#vignette must be cleared on endScr, got ${onEnd.vignetteOp}`);

      // Quit to menu via #btnMenu2 -> verify #vignette stays 0
      await page.click("#btnMenu2");
      await page.waitForFunction(() => FPS.state.G.state === "menu", null, { timeout: 5000 });
      await helpers.waitFrames(page, 2);
      const onMenu = await page.evaluate(() => {
        const vg = document.getElementById("vignette");
        return {
          vignetteOp: vg ? parseFloat(getComputedStyle(vg).opacity) : 0,
          lowhp: document.body.classList.contains("lowhp")
        };
      });
      assert(onMenu.vignetteOp <= 0.02, `#vignette on Menu after death must be 0, got ${onMenu.vignetteOp}`);
      assert(!onMenu.lowhp, "body.lowhp on Menu must be false");

      // Start M1 with toast -> startLevel(2) clears toast -> turn off flashlight -> die -> #btnAgain restores flashOn
      await helpers.startLevelAndWait(page, 1);
      await page.evaluate(() => { FPS.ui.showToast("Carryover Toast", 5000); });
      await helpers.startLevelAndWait(page, 2);
      const m2Toast = await page.evaluate(() => {
        const nt = document.getElementById("noteToast");
        return nt ? nt.classList.contains("show") : false;
      });
      assert(!m2Toast, "M1 toast must not bleed into M2 after startLevel(2)");

      await page.keyboard.press("KeyF");
      const flashOff = await page.evaluate(() => FPS.state.G.flashOn);
      assert(flashOff === false, "KeyF must toggle G.flashOn to false");
      await page.evaluate(() => { FPS.game.hurtPlayer(200, undefined, undefined, true); });
      await page.waitForFunction(() => !document.getElementById("endScr").classList.contains("hidden"), null, { timeout: 5000 });
      await page.click("#btnAgain");
      await page.waitForFunction(() => FPS.state.G.state === "playing", null, { timeout: 10000 });
      await helpers.waitFrames(page, 2);

      const afterAgain = await page.evaluate(() => ({
        state: FPS.state.G.state,
        hp: FPS.state.G.hp,
        flashOn: FPS.state.G.flashOn,
        flashVis: !!(FPS.world.flashlight && FPS.world.flashlight.visible)
      }));
      assert(afterAgain.state === "playing" && afterAgain.hp === 100, `Expected playing with hp=100, got ${JSON.stringify(afterAgain)}`);
      assert(afterAgain.flashOn === true && afterAgain.flashVis === true, `Retry must restore flashlight, got ${JSON.stringify(afterAgain)}`);
    }
  },
  {
    id: "T5-02",
    tier: 5,
    feature: "T5-Lifecycle",
    title: "Dying While #armoryScr Open + Pause #btnRestart2 & #btnQuit Lifecycle",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);

      await page.evaluate(() => {
        const a = FPS.LEVELS[1].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await page.keyboard.press("KeyE");
      await page.waitForFunction(() => !document.getElementById("armoryScr").classList.contains("hidden"), null, { timeout: 5000 });

      // Kill player while #armoryScr is open
      await page.evaluate(() => { FPS.game.hurtPlayer(200, undefined, undefined, true); });
      await page.waitForFunction(() => !document.getElementById("endScr").classList.contains("hidden"), null, { timeout: 5000 });
      const armoryClosed = await page.evaluate(() => ({
        armoryHidden: document.getElementById("armoryScr").classList.contains("hidden"),
        armoryOpen: FPS.state.G.armoryOpen
      }));
      assert(armoryClosed.armoryHidden && !armoryClosed.armoryOpen, `Armory must close on death: ${JSON.stringify(armoryClosed)}`);

      // #btnAgain restarts Stage 2 cleanly
      await page.click("#btnAgain");
      await page.waitForFunction(() => {
        const st = window.__fpsTest.getState();
        return st.state === "playing" && st.level === 2;
      }, null, { timeout: 10000 });

      // Pause -> #btnRestart2 resets Stage 2 state
      await page.evaluate(() => {
        window.__fpsTest.grantScrap(300);
        FPS.entities.unlockWeapon("shotgun");
      });
      await page.keyboard.press("KeyP");
      await page.waitForFunction(() => !document.getElementById("pauseScr").classList.contains("hidden"), null, { timeout: 5000 });
      await page.click("#btnRestart2");
      await page.waitForFunction(() => FPS.state.G.state === "playing", null, { timeout: 10000 });
      const afterRestart = await page.evaluate(() => ({
        ...window.__fpsTest.getState(),
        startingScrap: (FPS.SCRAP && FPS.SCRAP.starting) || 0
      }));
      assert(afterRestart.level === 2, `Expected level 2 after #btnRestart2, got ${afterRestart.level}`);
      assert(afterRestart.scrap === afterRestart.startingScrap, `Expected reset scrap=${afterRestart.startingScrap}, got ${afterRestart.scrap}`);
      assert(!afterRestart.unlockedWeapons.shotgun, "Expected shotgun locked again after #btnRestart2");

      // Pause -> #btnQuit returns to menu
      await page.keyboard.press("KeyP");
      await page.waitForFunction(() => !document.getElementById("pauseScr").classList.contains("hidden"), null, { timeout: 5000 });
      await page.click("#btnQuit");
      await page.waitForFunction(() => FPS.state.G.state === "menu", null, { timeout: 5000 });
    }
  },
  {
    id: "T5-03",
    tier: 5,
    feature: "T5-CombatRace",
    title: "Auto-Reload 250ms setTimeout Weapon-Swap Race Must Not Reload Swapped Rifle",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      const pre = await page.evaluate(() => {
        window.__fpsTest.grantScrap(500);
        FPS.entities.unlockWeapon("rifle");
        FPS.entities.wState.rifle.mag = 20;
        FPS.entities.wState.pistol.mag = 1;
        FPS.state.G.lastShot = 0;
        FPS.entities.shoot();
        // Immediately swap to rifle before 250ms auto-reload fires
        FPS.entities.switchWeapon("rifle");
        return {
          pistolMag: FPS.entities.wState.pistol.mag,
          curWeapon: FPS.entities.curWeapon,
          reloadingNow: FPS.state.G.reloading
        };
      });
      assert(pre.pistolMag === 0, `Expected pistolMag=0, got ${pre.pistolMag}`);
      assert(pre.curWeapon === "rifle", `Expected curWeapon=rifle, got ${pre.curWeapon}`);

      await page.waitForTimeout(380);
      const post = await page.evaluate(() => ({
        curWeapon: FPS.entities.curWeapon,
        reloading: FPS.state.G.reloading,
        rifleMag: FPS.entities.wState.rifle.mag
      }));
      assert(post.curWeapon === "rifle", `Expected curWeapon=rifle, got ${post.curWeapon}`);
      assert(post.reloading === false, `Auto-reload from emptied pistol must NOT trigger reload on swapped rifle (reloading=${post.reloading})`);
      assert(post.rifleMag === 20, `Expected rifleMag=20 unchanged, got ${post.rifleMag}`);
    }
  },
  {
    id: "T5-04",
    tier: 5,
    feature: "T5-MobileTouch",
    title: "Mobile 390x844 touchcancel Clears #joy Drift, #btnFire Auto-Fire & Look Touch Lock",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      // 1. #joy touchcancel clears joyTouch/joyVec/knob & stops drift
      const posAfterCancel = await page.evaluate(() => {
        const el = document.querySelector("#joy");
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const t0 = new Touch({ identifier: 301, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
        el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t0], targetTouches: [t0], changedTouches: [t0] }));
        const t1 = new Touch({ identifier: 301, target: el, clientX: cx, clientY: cy - 35, pageX: cx, pageY: cy - 35 });
        el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t1], targetTouches: [t1], changedTouches: [t1] }));
        el.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t1] }));
        return {
          p0: { x: FPS.state.playerPos.x, z: FPS.state.playerPos.z },
          knobTransform: document.getElementById("joyKnob").style.transform
        };
      });
      await page.waitForTimeout(300);
      const driftRes = await page.evaluate((p0) => ({
        drift: Math.hypot(FPS.state.playerPos.x - p0.x, FPS.state.playerPos.z - p0.z),
        knobTransform: document.getElementById("joyKnob").style.transform
      }), posAfterCancel.p0);
      assert(driftRes.drift < 0.03, `Expected zero drift after #joy touchcancel, got ${driftRes.drift}`);
      assert(!driftRes.knobTransform.includes("-35"), `Expected centered #joyKnob after touchcancel, got ${driftRes.knobTransform}`);

      // 2. #btnFire touchcancel clears G.mouseDown
      const mouseAfterFireCancel = await page.evaluate(() => {
        const bf = document.querySelector("#btnFire");
        const r = bf.getBoundingClientRect();
        const t = new Touch({ identifier: 302, target: bf, clientX: r.left + 10, clientY: r.top + 10 });
        bf.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        const downBefore = FPS.state.G.mouseDown;
        bf.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
        return { downBefore, downAfter: FPS.state.G.mouseDown };
      });
      assert(mouseAfterFireCancel.downBefore === true, "Expected G.mouseDown=true during #btnFire touchstart");
      assert(mouseAfterFireCancel.downAfter === false, "Expected G.mouseDown=false after #btnFire touchcancel");

      // 3. Canvas look touchcancel clears lookTouch so subsequent swipe works
      const yawBefore = await page.evaluate(() => {
        const c = FPS.world.renderer.domElement;
        const x0 = Math.round(window.innerWidth * 0.72);
        const y0 = Math.round(window.innerHeight * 0.40);
        const t0 = new Touch({ identifier: 303, target: c, clientX: x0, clientY: y0, pageX: x0, pageY: y0 });
        c.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t0], targetTouches: [t0], changedTouches: [t0] }));
        c.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t0] }));
        return FPS.state.G.yaw;
      });
      await helpers.swipeTouchLook(page, 80, 0);
      const yawAfter = await page.evaluate(() => FPS.state.G.yaw);
      assert(Math.abs(yawAfter - yawBefore) > 0.05, `Look swipe after touchcancel failed (${yawBefore} -> ${yawAfter})`);
    }
  },
  {
    id: "T5-05",
    tier: 5,
    feature: "T5-InputReset",
    title: "Input Reset Across window.blur, pauseGame(), openArmoryModal() & endGame()/Retry",
    device: "mobile",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      async function dragJoyActive() {
        await page.evaluate(() => {
          const el = document.querySelector("#joy");
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const t0 = new Touch({ identifier: 401, target: el, clientX: cx, clientY: cy, pageX: cx, pageY: cy });
          el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t0], targetTouches: [t0], changedTouches: [t0] }));
          const t1 = new Touch({ identifier: 401, target: el, clientX: cx, clientY: cy - 35, pageX: cx, pageY: cy - 35 });
          el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t1], targetTouches: [t1], changedTouches: [t1] }));
          FPS.state.G.keys.KeyW = true;
        });
      }

      // 1. window.blur clears joy & keys
      await dragJoyActive();
      const pBlur0 = await page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        return { x: FPS.state.playerPos.x, z: FPS.state.playerPos.z, keyW: !!FPS.state.G.keys.KeyW };
      });
      assert(!pBlur0.keyW, "G.keys.KeyW must clear on blur");
      await page.waitForTimeout(260);
      const driftBlur = await page.evaluate((p0) => Math.hypot(FPS.state.playerPos.x - p0.x, FPS.state.playerPos.z - p0.z), pBlur0);
      assert(driftBlur < 0.03, `Expected 0 drift after blur, got ${driftBlur}`);

      // 2. Pause -> Resume clears joy & keys
      await dragJoyActive();
      await page.click("#btnPauseM");
      await page.waitForFunction(() => FPS.state.G.state === "paused", null, { timeout: 5000 });
      await page.click("#btnResume");
      await page.waitForFunction(() => FPS.state.G.state === "playing", null, { timeout: 5000 });
      const pPause0 = await page.evaluate(() => ({ x: FPS.state.playerPos.x, z: FPS.state.playerPos.z, keyW: !!FPS.state.G.keys.KeyW }));
      assert(!pPause0.keyW, "G.keys.KeyW must clear on pause");
      await page.waitForTimeout(260);
      const driftPause = await page.evaluate((p0) => Math.hypot(FPS.state.playerPos.x - p0.x, FPS.state.playerPos.z - p0.z), pPause0);
      assert(driftPause < 0.03, `Expected 0 drift after pause/resume, got ${driftPause}`);

      // 3. Armory open -> close clears joy & keys
      await dragJoyActive();
      await page.evaluate(() => { FPS.ui.openArmory("armory"); });
      // Also trigger main's openArmoryModal via teleport + interact
      await page.click("#btnArmoryClose");
      await page.evaluate(() => {
        const a = FPS.LEVELS[0].armory;
        window.__fpsTest.teleportTo(a.x, (a.y || 0) + 1.7, a.z + 1.2);
      });
      await helpers.waitFrames(page, 2);
      await dragJoyActive();
      await helpers.tapTouch(page, "#btnInteract");
      await page.waitForFunction(() => FPS.state.G.armoryOpen === true, null, { timeout: 5000 });
      await page.click("#btnArmoryClose");
      const pArm0 = await page.evaluate(() => ({ x: FPS.state.playerPos.x, z: FPS.state.playerPos.z, keyW: !!FPS.state.G.keys.KeyW }));
      assert(!pArm0.keyW, "G.keys.KeyW must clear when opening Armory");
      await page.waitForTimeout(260);
      const driftArm = await page.evaluate((p0) => Math.hypot(FPS.state.playerPos.x - p0.x, FPS.state.playerPos.z - p0.z), pArm0);
      assert(driftArm < 0.03, `Expected 0 drift after Armory open/close, got ${driftArm}`);

      // 4. Death -> #btnAgain clears joy & keys
      await dragJoyActive();
      await page.evaluate(() => { FPS.game.hurtPlayer(200, undefined, undefined, true); });
      await page.waitForFunction(() => !document.getElementById("endScr").classList.contains("hidden"), null, { timeout: 5000 });
      await page.click("#btnAgain");
      await page.waitForFunction(() => FPS.state.G.state === "playing", null, { timeout: 10000 });
      const pEnd0 = await page.evaluate(() => ({ x: FPS.state.playerPos.x, z: FPS.state.playerPos.z, keyW: !!FPS.state.G.keys.KeyW }));
      assert(!pEnd0.keyW, "G.keys.KeyW must clear across death -> #btnAgain");
      await page.waitForTimeout(260);
      const driftEnd = await page.evaluate((p0) => Math.hypot(FPS.state.playerPos.x - p0.x, FPS.state.playerPos.z - p0.z), pEnd0);
      assert(driftEnd < 0.03, `Expected 0 drift after death -> #btnAgain, got ${driftEnd}`);
    }
  },
  {
    id: "T5-06",
    tier: 5,
    feature: "T5-MobileInteract",
    title: "Mobile #btnInteract Rejects Early Click/Tap Bypass on holdSec > 0 & Completes Real 2.2s Hold",
    device: "mobile",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 2);

      await page.evaluate(() => {
        const g = FPS.LEVELS[1].objective.items[0];
        window.__fpsTest.teleportTo(g.x, (g.y || 0) + 1.7, g.z + 1.2);
      });
      await helpers.waitFrames(page, 3);

      // Early 450ms touch + touchend + synthetic .click() must NOT activate 2.0s generator
      await page.evaluate(() => {
        const b = document.querySelector("#btnInteract");
        const r = b.getBoundingClientRect();
        const t = new Touch({ identifier: 501, target: b, clientX: r.left + 8, clientY: r.top + 8 });
        b.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
      });
      await page.waitForTimeout(450);
      await page.evaluate(() => {
        const b = document.querySelector("#btnInteract");
        const r = b.getBoundingClientRect();
        const t = new Touch({ identifier: 501, target: b, clientX: r.left + 8, clientY: r.top + 8 });
        b.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
        b.click();
      });
      await helpers.waitFrames(page, 2);

      const afterBypass = await page.evaluate(() => window.__fpsTest.getState().objState);
      assert(afterBypass.activatedCount === 0, `Early release + click must NOT activate holdSec=2.0 generator, got ${JSON.stringify(afterBypass)}`);

      // Wait >400ms and try pure click() as well
      await page.waitForTimeout(450);
      await page.evaluate(() => { document.querySelector("#btnInteract").click(); });
      const afterPureClick = await page.evaluate(() => window.__fpsTest.getState().objState);
      assert(afterPureClick.activatedCount === 0, `Pure #btnInteract.click() must NOT activate holdSec=2.0 generator, got ${JSON.stringify(afterPureClick)}`);

      // Now perform a real 2.25s continuous touch hold
      await page.evaluate(() => {
        const b = document.querySelector("#btnInteract");
        const r = b.getBoundingClientRect();
        const t = new Touch({ identifier: 502, target: b, clientX: r.left + 8, clientY: r.top + 8 });
        b.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
      });
      await page.waitForTimeout(2250);
      await page.evaluate(() => {
        const b = document.querySelector("#btnInteract");
        const r = b.getBoundingClientRect();
        const t = new Touch({ identifier: 502, target: b, clientX: r.left + 8, clientY: r.top + 8 });
        b.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
      });
      await helpers.waitFrames(page, 2);

      const afterHold = await page.evaluate(() => window.__fpsTest.getState().objState);
      assert(afterHold.activatedCount === 1, `Real 2.25s touch hold must activate generator 0, got ${JSON.stringify(afterHold)}`);
    }
  },
  {
    id: "T5-07",
    tier: 5,
    feature: "T5-MobileHUD",
    title: "Mobile 390x844 Full-HUD Simultaneous Stress (Mk.III x4 + 100% Vol + Boss + Extract + Interact + Combo + Toast)",
    device: "mobile",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 5);

      await page.evaluate(() => {
        window.__fpsTest.grantScrap(5000);
        FPS.entities.unlockWeapon("shotgun");
        FPS.entities.unlockWeapon("rifle");
        ["pistol", "shotgun", "rifle", "thuanthien"].forEach((w) => {
          FPS.entities.upgradeWeapon(w);
          FPS.entities.upgradeWeapon(w);
        });
        if (FPS.audio && FPS.audio.setVolume) FPS.audio.setVolume(1.0);
        FPS.state.G.hsStreak = 5;
        FPS.state.G.hsTimer = 5.0;
        FPS.state.G.hsMult = 3.0;
        FPS.state.G.portalUnlocked = true;
        FPS.state.G.extractProg = 0.55;
        FPS.state.G.objState = { type: "holdout", flareLit: true, holdLeft: 12.5 };
        const fp = FPS.LEVELS[4].armory;
        if (fp) window.__fpsTest.teleportTo(fp.x, (fp.y || 0) + 1.7, fp.z + 1.2);
        window.__fpsTest.triggerSpecial("minotaur");
        FPS.ui.showToast("HUD Simultaneous Stress Test", 5000);
        FPS.ui.updateHUD();
      });
      await helpers.waitFrames(page, 3);

      await helpers.assertInViewport(page, helpers.MOBILE_HUD_SELECTORS);
      await helpers.assertNoOverlap(page, helpers.MOBILE_HUD_SELECTORS, { minIntersectPx: 2, msg: "T5-07 Full Mobile HUD Stress" });
    }
  },
  {
    id: "T5-08",
    tier: 5,
    feature: "T5-MutatorFuzz",
    title: "Mutator & Prototype-Key Fuzzing: Rejects Prototype Keys, Negative/NaN Damage, Bad Decals/Acid, Bad Scrap/Teleport",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      const m1Res = await page.evaluate(() => {
        const E = FPS.entities;
        const W = FPS.world;
        const protoUnlock = E.isWeaponUnlocked("toString");
        const protoSwitch = E.switchWeapon("toString");
        const protoUpgrade = E.upgradeWeapon("constructor");
        const badUnlock = E.unlockWeapon("bad_weapon");
        const badStats = E.getWeaponStats("constructor");
        const badZombie = window.__fpsTest.triggerSpecial("unknown_mutant");
        const protoZombie = E.spawnZombie("toString");

        const gBefore = W.gate ? W.gate.hp : 0;
        W.damageGate(-50);
        W.damageGate(NaN);
        const gAfter = W.gate ? W.gate.hp : 0;

        const bBefore = W.barricades[0].hp;
        W.damageBarricade(0, -50);
        W.damageBarricade(0, NaN);
        const bAfter = W.barricades[0].hp;

        const z = E.spawnZombie("normal");
        const zHp0 = z.hp;
        E.damageZombie(z, -500, false);
        E.damageZombie(z, NaN, false);
        const zHpAfterBad = z.hp;
        E.damageZombie(z, 9999, false);
        const zDeadAfterKill = z.dead;

        const acidBad = E.spawnAcidPool(NaN, NaN, NaN);
        E.spawnDecal(NaN, NaN, NaN, "bad", -5);
        const acidArr = E.acidPools ? Array.from(FPS.world.scene.children.find((c) => c.isInstancedMesh && c.count === 8)?.instanceMatrix?.array || []) : [];

        window.__fpsTest.grantScrap(1000);
        const scrapBase = FPS.state.G.scrap;
        window.__fpsTest.grantScrap(-100);
        const scrapAfterNeg = FPS.state.G.scrap;
        window.__fpsTest.grantScrap(Infinity);
        const scrapAfterInf = FPS.state.G.scrap;

        window.__fpsTest.teleportTo(NaN, NaN, NaN);
        const posAfterNaN = { x: FPS.state.playerPos.x, y: FPS.state.playerPos.y, z: FPS.state.playerPos.z };
        window.__fpsTest.teleportTo(99999, -50, -99999);
        const posAfterHuge = { x: FPS.state.playerPos.x, y: FPS.state.playerPos.y, z: FPS.state.playerPos.z };

        return {
          protoUnlock,
          protoSwitch,
          protoUpgrade,
          badUnlock,
          badStats,
          badZombieType: badZombie ? badZombie.type : null,
          protoZombieType: protoZombie ? protoZombie.type : null,
          gBefore,
          gAfter,
          bBefore,
          bAfter,
          zHp0,
          zHpAfterBad,
          zDeadAfterKill,
          acidBad,
          acidHasNaN: acidArr.some((v) => Number.isNaN(v)),
          scrapBase,
          scrapAfterNeg,
          scrapAfterInf,
          posAfterNaN,
          posAfterHuge,
          arenaHalf: (FPS.LEVELS[0].arena || 64) * 0.5
        };
      });

      assert(m1Res.protoUnlock === false, `isWeaponUnlocked('toString') must be false`);
      assert(m1Res.protoSwitch === false, `switchWeapon('toString') must return false without throwing`);
      assert(m1Res.protoUpgrade === false, `upgradeWeapon('constructor') must return false`);
      assert(m1Res.badUnlock === false, `unlockWeapon('bad_weapon') must return false`);
      assert(m1Res.badStats === null, `getWeaponStats('constructor') must return null`);
      assert(m1Res.badZombieType === "normal" && m1Res.protoZombieType === "normal", `Unknown/proto zombie types must fallback to normal`);
      assert(m1Res.gAfter === m1Res.gBefore, `Gate HP must not change on negative/NaN dmg (${m1Res.gBefore} -> ${m1Res.gAfter})`);
      assert(m1Res.bAfter === m1Res.bBefore, `Barricade HP must not change on negative/NaN dmg (${m1Res.bBefore} -> ${m1Res.bAfter})`);
      assert(m1Res.zHpAfterBad === m1Res.zHp0 && m1Res.zDeadAfterKill === true, `Zombie must not heal or become NaN-immortal (${m1Res.zHp0} -> ${m1Res.zHpAfterBad}, dead=${m1Res.zDeadAfterKill})`);
      assert(m1Res.acidBad === null && !m1Res.acidHasNaN, "spawnAcidPool(NaN) must return null without polluting GPU matrix");
      assert(m1Res.scrapAfterNeg === m1Res.scrapBase && m1Res.scrapAfterInf === m1Res.scrapBase, `grantScrap(-100/Infinity) must be no-op, got ${m1Res.scrapAfterNeg}/${m1Res.scrapAfterInf} vs ${m1Res.scrapBase}`);
      assert(Number.isFinite(m1Res.posAfterNaN.x) && Number.isFinite(m1Res.posAfterNaN.y) && Number.isFinite(m1Res.posAfterNaN.z), `teleportTo(NaN) corrupted playerPos: ${JSON.stringify(m1Res.posAfterNaN)}`);
      assert(Math.abs(m1Res.posAfterHuge.x) <= m1Res.arenaHalf && Math.abs(m1Res.posAfterHuge.z) <= m1Res.arenaHalf && m1Res.posAfterHuge.y >= 1.7, `teleportTo out-of-bounds must clamp: ${JSON.stringify(m1Res.posAfterHuge)}`);

      // Also check M4 totem negative/NaN damage guard
      await helpers.startLevelAndWait(page, 4);
      const tRes = await page.evaluate(() => {
        const t0 = FPS.world.totems[0].hp;
        FPS.world.damageTotem(0, -100);
        FPS.world.damageTotem(0, NaN);
        return { t0, t1: FPS.world.totems[0].hp };
      });
      assert(tRes.t1 === tRes.t0, `Totem HP must not heal on negative/NaN dmg (${tRes.t0} -> ${tRes.t1})`);
    }
  },
  {
    id: "T5-09",
    tier: 5,
    feature: "T5-SpitterLOS",
    title: "Autonomous Spitter LOS: Clear LOS Spits Acid Pool While Wall-Blocked LOS Produces 0 Pools",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      // Phase A: Clear LOS
      await page.evaluate(() => {
        FPS.entities.clearZombies();
        FPS.entities.clearAcidPools();
        window.__fpsTest.teleportTo(2.0, 1.7, 14.0);
        const sp = window.__fpsTest.triggerSpecial("spitter");
        sp.group.position.set(2.0, 0, 24.0);
        sp.baseY = 0;
        sp.spitCd = 0.1;
      });
      await page.waitForFunction(() => FPS.entities.acidPools.some((p) => p.active), null, { timeout: 5000 });

      // Phase B: Wall-blocked LOS across M1 brick wall at (x=-10.0, z=16.5, h=3.6, d=9.5)
      await page.evaluate(() => {
        FPS.entities.clearZombies();
        FPS.entities.clearAcidPools();
        window.__fpsTest.teleportTo(-14.0, 1.7, 16.5);
        const sp = window.__fpsTest.triggerSpecial("spitter");
        sp.group.position.set(-6.0, 0, 16.5);
        sp.baseY = 0;
        sp.spitCd = 0.1;
      });
      await page.waitForTimeout(1800);
      const blockedPools = await page.evaluate(() => FPS.entities.acidPools.filter((p) => p.active).length);
      assert(blockedPools === 0, `Wall-blocked Spitter must not spit acid pools, got ${blockedPools}`);
    }
  },
  {
    id: "T5-10",
    tier: 5,
    feature: "T5-StalkerAI",
    title: "Autonomous Stalker State Machine (prowl -> telegraph -> pounce) & Shove Telegraph Interrupt",
    device: "desktop",
    async run({ page, helpers }) {
      await helpers.startLevelAndWait(page, 1);

      // Phase A: prowl at 10.5m -> closes to <=7.5m -> telegraph (opacity ~0.85, #shadowDash) -> pounce (20 dmg)
      const initSt = await page.evaluate(() => {
        FPS.entities.clearZombies();
        window.__fpsTest.teleportTo(2.0, 1.7, 12.0);
        const st = window.__fpsTest.triggerSpecial("stalker");
        st.group.position.set(2.0, 0, 22.5);
        st.baseY = 0;
        st.pounceCd = 0;
        const m0 = st.meshes[0] ? st.meshes[0].material.opacity : 1;
        return { pounceState: st.pounceState, op: m0, hp: FPS.state.G.hp };
      });
      assert(initSt.pounceState === "prowl" && initSt.op < 0.5, `Expected prowl low opacity, got ${JSON.stringify(initSt)}`);

      await page.waitForFunction(() => {
        const st = FPS.entities.zombies.find((z) => z.type === "stalker" && !z.dead);
        return st && st.pounceState === "telegraph";
      }, null, { timeout: 6000 });

      const teleSt = await page.evaluate(() => {
        const st = FPS.entities.zombies.find((z) => z.type === "stalker" && !z.dead);
        const sd = document.getElementById("shadowDash");
        return {
          pounceState: st.pounceState,
          op: st.meshes[0] ? st.meshes[0].material.opacity : 0,
          dashOp: sd ? parseFloat(getComputedStyle(sd).opacity) : 0
        };
      });
      assert(teleSt.op >= 0.75, `Expected telegraph opacity ~0.85, got ${teleSt.op}`);
      assert(teleSt.dashOp >= 0.4, `Expected #shadowDash visible during telegraph, got ${teleSt.dashOp}`);

      // Wait for pounce to land and deal 20 damage
      await page.waitForFunction(() => FPS.state.G.hp < 100, null, { timeout: 4000 });
      const hpAfterPounce = await page.evaluate(() => FPS.state.G.hp);
      assert(hpAfterPounce === 80, `Expected Stalker pounce to deal 20 dmg (hp=80), got ${hpAfterPounce}`);

      // Phase B: Interrupt second telegraph via Shove -> resets to prowl + opacity ~0.34
      await page.evaluate(() => {
        FPS.entities.clearZombies();
        window.__fpsTest.teleportTo(2.0, 1.7, 12.0);
        FPS.state.G.yaw = Math.PI; // face +Z toward stalker at z=13.6
        FPS.state.G.shoveCd = 0;
        FPS.state.G.stamina = 100;
        const st = window.__fpsTest.triggerSpecial("stalker");
        st.group.position.set(2.0, 0, 13.6);
        st.baseY = 0;
        st.pounceCd = 0;
      });
      await page.waitForFunction(() => {
        const st = FPS.entities.zombies.find((z) => z.type === "stalker" && !z.dead);
        return st && st.pounceState === "telegraph";
      }, null, { timeout: 3000 });

      const afterInterrupt = await page.evaluate(() => {
        const shoved = window.__fpsTest.triggerShove();
        const st = FPS.entities.zombies.find((z) => z.type === "stalker" && !z.dead);
        return {
          shoved,
          pounceState: st ? st.pounceState : null,
          origOp: st && st.meshes[0] && st.meshes[0].userData.origMat ? st.meshes[0].userData.origMat.opacity : 1
        };
      });
      assert(afterInterrupt.shoved === true, "Shove must succeed");
      assert(afterInterrupt.pounceState === "prowl", `Shove must interrupt telegraph back to prowl, got ${afterInterrupt.pounceState}`);
      assert(afterInterrupt.origOp < 0.5, `Interrupted stalker opacity must restore to ~0.34, got ${afterInterrupt.origOp}`);
    }
  },
  {
    id: "T5-11",
    tier: 5,
    feature: "T5-BarricadeAndOrc",
    title: "Autonomous Zombie Barricade-Bash (3-4s Break) + M4 Orc Actual Damage Scaling & Totem Add Spawn",
    device: "desktop",
    initialProfile: { highestLevel: 5, lang: "vi", quality: "auto" },
    async run({ page, helpers }) {
      // Part A: M1 Autonomous Zombie Barricade Bash (~3.65s break without manual damageBarricade)
      await helpers.startLevelAndWait(page, 1);
      const tStart = Date.now();
      await page.evaluate(() => {
        FPS.entities.clearZombies();
        const br = FPS.world.barricades[0];
        window.__fpsTest.teleportTo(br.x, 1.7, br.z + 2.4);
        const z = FPS.entities.spawnZombie("normal");
        z.spawnT = 0;
        z.baseY = 0;
        z.group.position.set(br.x, 0, br.z - 1.8);
      });
      await page.waitForFunction(() => !FPS.world.barricades[0].alive, null, { timeout: 6000 });
      const breakSec = (Date.now() - tStart) / 1000;
      assert(breakSec >= 2.7 && breakSec <= 5.2, `Expected barricade break around 3-4s (36 dmg @ 0.85s CD), got ${breakSec.toFixed(2)}s`);

      // Part B: M4 Orc Grave Lord actual damageZombie scaling across 3/2/1/0 totems + totem add spawn
      await helpers.startLevelAndWait(page, 4);
      const orcScaling = await page.evaluate(() => {
        FPS.entities.clearZombies();
        const orc = window.__fpsTest.triggerSpecial("orcking");
        const dealt = [];
        for (let step = 0; step < 4; step++) {
          const hpBefore = orc.hp;
          FPS.entities.damageZombie(orc, 100, false);
          dealt.push(+(hpBefore - orc.hp).toFixed(2));
          if (step < 3) FPS.world.damageTotem(step, 9999);
        }
        return { dealt, totemsLeft: FPS.world.totems.filter((t) => t.alive).length };
      });
      assert(orcScaling.totemsLeft === 0, `Expected 0 totems left, got ${orcScaling.totemsLeft}`);
      const d = orcScaling.dealt;
      assert(
        d[0] < d[1] && d[1] < d[2] && d[2] < d[3] && Math.abs(d[0] - 35) < 1 && Math.abs(d[3] - 100) < 1,
        `Expected monotonic Orc damage scaling (~35 -> 56.67 -> 78.33 -> 100), got ${JSON.stringify(d)}`
      );

      // Verify M4 Totem Add Spawning while totems are alive (fill to breather cap so ONLY totem add can exceed it)
      await helpers.startLevelAndWait(page, 4);
      const beforeTotemAdds = await page.evaluate(() => {
        FPS.entities.clearZombies();
        FPS.state.G.directorPhase = "breather";
        FPS.state.G.directorT = 20;
        const baseMax = FPS.LEVELS[3].maxAlive || 14;
        const breatherCap = Math.max(4, Math.floor(baseMax * 0.7));
        for (let i = 0; i < breatherCap; i++) {
          const z = FPS.entities.spawnZombie("normal");
          if (z) z.spawnT = 0;
        }
        return FPS.entities.zombies.filter((z) => !z.dead).length;
      });
      await page.waitForFunction((n0) => FPS.entities.zombies.filter((z) => !z.dead).length > n0, beforeTotemAdds, { timeout: 12000 });
    }
  },
  {
    id: "T5-12",
    tier: 5,
    feature: "T5-ItchAndPerfStress",
    title: "__ITCH_STATIC__ Corrupt localStorage Recovery + QLEVEL=0 M1-M5 Peak Combat Reload Stress (<=75 dc, 0 PointLights)",
    device: "desktop",
    freshContext: true,
    manualBoot: true,
    taintedAfter: true,
    async run({ page, url, apiMock, helpers }) {
      // Inject __ITCH_STATIC__=true + corrupt localStorage before boot
      await page.addInitScript(() => {
        window.__ITCH_STATIC__ = true;
        try {
          localStorage.setItem("fps_zombie_profile_v8", "{bad_json");
          localStorage.setItem("fps_zombie_leaderboard_v8", "456");
        } catch {}
      });

      await helpers.bootAndWait(page, url, { timeoutMs: 45000 });
      assert(apiMock.apiLog.length === 0, `Expected 0 /api/ calls in __ITCH_STATIC__ mode, got ${apiMock.apiLog.length}`);

      const storageCases = await page.evaluate(async () => {
        const cases = [
          { p: "{bad", lb: "456" },
          { p: '"hello"', lb: '"world"' },
          { p: "[1,2,3]", lb: '{"a":1}' },
          { p: JSON.stringify({ bestScore: -999, highestLevel: -10, totalKills: "not_a_num", notesDiscovered: "not_an_array" }), lb: "[null]" }
        ];
        const out = [];
        for (const c of cases) {
          localStorage.setItem("fps_zombie_profile_v8", c.p);
          localStorage.setItem("fps_zombie_leaderboard_v8", c.lb);
          const prof = await FPSApi.loadProfile();
          const lb = await FPSApi.loadLeaderboard();
          const saved = await FPSApi.saveProfile({ score: -50, highestLevel: -2, killsDelta: -10, notes: ["n1"] });
          const top = await FPSApi.submitScore({ name: "T5", score: -100, level: -3, kills: -20 });
          out.push({ prof, lb, saved, top });
        }
        return out;
      });
      assert(apiMock.apiLog.length === 0, `Expected still 0 /api/ calls after storage ops, got ${apiMock.apiLog.length}`);
      for (const r of storageCases) {
        assert(r.prof && typeof r.prof === "object" && !Array.isArray(r.prof), "loadProfile must return plain object");
        assert(Array.isArray(r.lb), "loadLeaderboard must return array");
        assert(r.saved.bestScore >= 0 && r.saved.highestLevel >= 1 && typeof r.saved.totalKills === "number" && r.saved.totalKills >= 0 && Array.isArray(r.saved.notesDiscovered), `Corrupt saveProfile result: ${JSON.stringify(r.saved)}`);
        assert(Array.isArray(r.top) && r.top.length === 1 && r.top[0].score === 0 && r.top[0].level === 1 && r.top[0].kills === 0, `Corrupt submitScore result: ${JSON.stringify(r.top)}`);
      }

      // Part B: QLEVEL=0 M1 -> M2 -> M3 -> M4 -> M5 -> M1 peak combat reload stress
      await helpers.startLevelAndWait(page, 1);
      await page.evaluate(() => { FPS.perf.setQualityMode("high"); });
      const seq = [1, 2, 3, 4, 5];
      for (const lv of seq) {
        await helpers.startLevelAndWait(page, lv);
        await page.evaluate(() => {
          window.__fpsTest.shootBarrel(0);
          window.__fpsTest.throwFlare();
          for (let i = 0; i < 10; i++) {
            const z = FPS.entities.spawnZombie(i % 3 === 0 ? "spitter" : "normal");
            if (z) {
              z.spawnT = 0;
              FPS.entities.damageZombie(z, 10, false);
            }
          }
          const pp = FPS.state.playerPos;
          FPS.entities.spawnAcidPool(pp.x + 3, 0, pp.z + 3);
        });
        await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
      }

      // Reload cleanly back to M1 and verify clean idle state + perf gate
      await helpers.startLevelAndWait(page, 1);
      await helpers.checkPerfGate(page, { maxDrawCalls: 75, maxPointLights: 0, maxDpr: 1.0 });
      const idleChk = await page.evaluate(() => {
        const ep = FPS.world.extractPortal;
        const gunAnim = FPS.entities.updateGunAnim(0, 0, FPS.state.G);
        return {
          progRingVis: ep && ep.progRing ? ep.progRing.visible : false,
          flashVis: gunAnim && gunAnim.gunParts && gunAnim.gunParts.flash ? gunAnim.gunParts.flash.visible : false
        };
      });
      assert(!idleChk.progRingVis, "extractPortal.progRing must be hidden when not extracting");
      assert(!idleChk.flashVis, "gunParts.flash must be hidden when not firing");
    }
  }
];
