"use strict";
window.FPS = window.FPS || {};

(function () {
  var W = FPS.world;
  var E = FPS.entities;

  var G = {
    state: "loading",
    levelIdx: 0,
    levelKills: 0,
    killQuota: 14,
    portalUnlocked: false,
    extractProg: 0,
    bossSpawned: false,
    bossSlain: true,
    totalKills: 0,
    score: 0,
    time: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    stamLocked: false,
    flareCd: 0,
    barrelsPopped: 0,
    xhairKick: 0,
    perks: [],
    dmgMul: 1,
    rateMul: 1,
    speedMul: 1,
    reloadMul: 1,
    flareCdMul: 1,
    reserveMul: 1,
    armor: 0,
    yaw: 0,
    pitch: 0,
    vy: 0,
    grounded: true,
    lastShot: 0,
    reloading: false,
    reloadEnd: 0,
    reloadDur: 0,
    shake: 0,
    bobT: 0,
    flashOn: true,
    mouseDown: false,
    keys: {},
    notesFound: 0,
    scrap: 0,
    hsStreak: 0,
    hsTimer: 0,
    hsMult: 1,
    unlockedWeapons: { pistol: true, thuanthien: true, shotgun: false, rifle: false },
    weaponTiers: { pistol: 1, shotgun: 1, rifle: 1, thuanthien: 1 },
    directorPhase: "surge",
    directorT: 16,
    panicT: 0,
    carryingRelics: 0,
    objProgress: 0,
    objState: null,
    interactTarget: null,
    interactProg: 0,
    armoryOpen: false,
    shoveCd: 0,
    shoveT: 0,
    shoveRegenLockT: 0,
    acidBlindT: 0,
    stalkerCueT: 0
  };

  var playerPos = new THREE.Vector3(0, 1.7, 24);
  FPS.state = { G: G, playerPos: playerPos };

  var selectedLevelId = 1;
  var spawnTimer = 0.8;
  var groanTimer = 3.5;
  var hurtCd = 0;
  var savedKills = 0;
  var gunDip = 0;
  var swayX = 0;
  var swayY = 0;
  var lastYaw = 0;
  var lastPitch = 0;
  var QMODE = "auto";
  var QLEVEL = 1;
  var _lastQSwitch = 0;
  var _lastIdleRender = 0;
  var _maxLoadPct = 0;

  var _upOrigin = new THREE.Vector3();
  var _upDir = new THREE.Vector3(0, 1, 0);
  var _camDir = new THREE.Vector3();
  var _holdTargetId = null;
  var _holdLastMs = 0;
  var _holdDownAtMs = 0;
  var _genTickAudioT = 0;
  var _mobileInteractDown = false;
  var _lastInteractTouchMs = 0;
  var _hazTickT = 0;
  var _hazToastCd = 0;
  var _waterShockTickT = 0;
  var _waterLastMs = 0;
  var _totemAddTimer = 10.0;
  var _trapTickTimers = [];
  var _prevElecWater = false;
  var _gateBrokenAnnounced = false;
  var _gateHintShown = false;
  var _gensDoneTriggered = false;
  var _totemsBrokenCount = 0;
  var _holdLeft = 0;
  var _holdoutDoneAnnounced = false;
  var joyVec = { x: 0, y: 0 };
  var lookTouch = null;
  var joyTouch = null;
  var joyEl = null;
  var knob = null;

  function resetInputs() {
    G.keys = {};
    G.mouseDown = false;
    _mobileInteractDown = false;
    _holdTargetId = null;
    _holdLastMs = 0;
    _holdDownAtMs = 0;
    G.interactProg = 0;
    joyTouch = null;
    joyVec.x = 0;
    joyVec.y = 0;
    lookTouch = null;
    if (knob) knob.style.transform = "translate(-50%,-50%)";
  }

  function setTxt(id, val) {
    var el = document.getElementById(id);
    if (el && el.textContent !== val) el.textContent = val;
  }

  var _lastTipIdx = -1;

  function updateLoadUI(pct, stageTxt, detailTxt) {
    var p = Math.max(_maxLoadPct, Math.min(100, Math.round(pct || 0)));
    _maxLoadPct = p;
    var bar = document.getElementById("loadBarFill");
    if (bar) bar.style.width = p + "%";
    setTxt("loadPct", p + "%");
    if (stageTxt) setTxt("loadStage", stageTxt);
    if (detailTxt) setTxt("loadDetail", detailTxt);
    var tipIdx = Math.min(3, Math.floor(p / 26));
    if (tipIdx !== _lastTipIdx) {
      _lastTipIdx = tipIdx;
      setTxt("loadTip", FPS.t("loadTip" + (tipIdx + 1)));
    }
  }

  var _stageTransTimer = null;
  function flashStageTransition(label) {
    var el = document.getElementById("stageLoadScr");
    var tx = document.getElementById("stageLoadTxt");
    if (!el) return;
    if (_stageTransTimer) { clearTimeout(_stageTransTimer); _stageTransTimer = null; }
    if (tx && label) tx.textContent = label;
    el.classList.remove("hidden", "fadeOut");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add("fadeOut");
        _stageTransTimer = setTimeout(function () {
          el.classList.add("hidden");
          el.classList.remove("fadeOut");
        }, 200);
      });
    });
  }

  function hideAllOverlays() {
    ["loadScr", "menu", "storyScr", "pauseScr", "endScr", "levelClearScr", "armoryScr"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  }

  function openArmoryModal(mode) {
    var hasUi = !!(FPS.ui && typeof FPS.ui.openArmory === "function");
    var scr = document.getElementById("armoryScr");
    if (!hasUi && !scr) return false;
    G.armoryOpen = true;
    resetInputs();
    if (E.clearAutoReload) E.clearAutoReload();
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    if (hasUi) FPS.ui.openArmory(mode);
    else if (scr) scr.classList.remove("hidden");
    updateLockHint();
    return true;
  }

  function closeArmoryModal(silent) {
    G.armoryOpen = false;
    G.mouseDown = false;
    if (FPS.ui && typeof FPS.ui.closeArmory === "function") {
      FPS.ui.closeArmory();
    } else {
      var scr = document.getElementById("armoryScr");
      if (scr) scr.classList.add("hidden");
    }
    if (!silent) updateLockHint();
  }

  function buildObjState(levelDef) {
    var obj = (levelDef && levelDef.objective) || null;
    if (!obj || !obj.type) return { type: "none" };
    if (obj.type === "gate") {
      var gt = W.gate;
      return {
        type: "gate",
        gateBroken: !(gt && gt.alive),
        gateHp: gt ? gt.hp : 0,
        gateMaxHp: gt ? gt.maxHp : (obj.hp || 350)
      };
    }
    if (obj.type === "generators") {
      var gens = W.generators || [];
      var act = 0;
      for (var i = 0; i < gens.length; i++) if (gens[i].active) act++;
      var tot = gens.length || (obj.items ? obj.items.length : 2);
      return {
        type: "generators",
        activatedCount: act,
        done: act,
        total: tot,
        lightsBright: !!_gensDoneTriggered,
        panicActive: G.panicT > 0
      };
    }
    if (obj.type === "relics") {
      var rls = W.relics || [];
      var col = 0;
      for (var ri = 0; ri < rls.length; ri++) if (rls[ri].collected) col++;
      var rTot = rls.length || (obj.items ? obj.items.length : 2);
      return {
        type: "relics",
        collected: col,
        delivered: G.portalUnlocked && G.extractProg > 0 ? col : 0,
        carrying: G.carryingRelics || 0,
        total: rTot
      };
    }
    if (obj.type === "totems") {
      var ts = W.totems || [];
      var broken = 0;
      var alive = 0;
      for (var ti = 0; ti < ts.length; ti++) {
        if (ts[ti].alive) alive++;
        else broken++;
      }
      var tTot = ts.length || (obj.items ? obj.items.length : 3);
      return {
        type: "totems",
        brokenTotems: broken,
        broken: broken,
        aliveTotems: alive,
        total: tTot
      };
    }
    if (obj.type === "holdout") {
      var ho = W.holdout || {};
      var lit = !!ho.flareLit;
      return {
        type: "holdout",
        flareLit: lit,
        holdoutActive: lit && _holdLeft > 0,
        holdLeft: +_holdLeft.toFixed(2),
        holdDone: lit && _holdLeft <= 0,
        boatArrived: lit && _holdLeft <= 0,
        total: obj.holdSec || 25
      };
    }
    return { type: obj.type };
  }

  function isObjectiveComplete(levelDef) {
    var obj = levelDef && levelDef.objective;
    if (!obj || !obj.type) return true;
    if (obj.type === "gate") return !(W.gate && W.gate.alive);
    if (obj.type === "generators") {
      var gens = W.generators || [];
      if (!gens.length) return true;
      for (var i = 0; i < gens.length; i++) if (!gens[i].active) return false;
      return true;
    }
    if (obj.type === "relics") {
      var rls = W.relics || [];
      if (!rls.length) return true;
      for (var ri = 0; ri < rls.length; ri++) if (!rls[ri].collected) return false;
      return true;
    }
    if (obj.type === "totems") {
      var ts = W.totems || [];
      if (!ts.length) return true;
      for (var ti = 0; ti < ts.length; ti++) if (ts[ti].alive) return false;
      return true;
    }
    if (obj.type === "holdout") {
      return !!(W.holdout && W.holdout.flareLit && _holdLeft <= 0);
    }
    return true;
  }

  function resetRunState() {
    resetInputs();
    E.clearZombies();
    E.clearFireZones();
    if (E.clearSpecialFX) E.clearSpecialFX();
    if (FPS.ui && FPS.ui.clearTransientUI) FPS.ui.clearTransientUI();
    G.score = 0;
    G.totalKills = 0;
    savedKills = 0;
    hurtCd = 0;
    G.time = 0;
    G.hp = 100;
    G.maxHp = 100;
    G.stamina = 100;
    G.maxStamina = 100;
    G.stamLocked = false;
    G.flareCd = 0;
    G.barrelsPopped = 0;
    G.xhairKick = 0;
    G.perks = [];
    G.dmgMul = 1;
    G.rateMul = 1;
    G.speedMul = 1;
    G.reloadMul = 1;
    G.flareCdMul = 1;
    G.reserveMul = 1;
    G.armor = 0;
    G.reloading = false;
    G.reloadEnd = 0;
    G.reloadDur = 0;
    G.shake = 0;
    G.bobT = 0;
    G.lastShot = 0;
    G.mouseDown = false;
    G.flashOn = true;
    if (W.flashlight) W.flashlight.visible = true;
    G.shoveCd = 0;
    G.shoveT = 0;
    G.shoveRegenLockT = 0;
    G.acidBlindT = 0;
    G.stalkerCueT = 0;
    G.scrap = (FPS.SCRAP && FPS.SCRAP.starting) || 0;
    G.hsStreak = 0;
    G.hsTimer = 0;
    G.hsMult = 1;
    G.unlockedWeapons = { pistol: true, thuanthien: true, shotgun: false, rifle: false };
    G.weaponTiers = { pistol: 1, shotgun: 1, rifle: 1, thuanthien: 1 };
    E.resetWeapons(1);
    E.curWeapon = "pistol";
    E.buildGun("pistol");
  }

  function pickLevelZombieType(levelId, allowSpecials) {
    if (allowSpecials) {
      var r = Math.random();
      if (levelId >= 2) {
        if (r < 0.05) return "spitter";
        if (r < 0.095) return "bloater";
        if (r < 0.14) return "stalker";
      } else if ((G.levelKills || 0) >= 4 && r < 0.045) {
        return r < 0.015 ? "spitter" : (r < 0.03 ? "bloater" : "stalker");
      }
    }
    var r2 = Math.random();
    if (levelId >= 4 && r2 < 0.22) return "brute";
    if (levelId >= 3 && r2 < 0.16) return "brute";
    if (levelId >= 2 && r2 < 0.40) return "runner";
    if (levelId === 1 && r2 < 0.20) return "runner";
    return "normal";
  }

  function startLevel(levelId) {
    var levels = FPS.LEVELS || [];
    if (!levels.length) return;
    var id = Math.max(1, Math.min(levels.length, Number(levelId) || 1));
    var levelDef = levels[id - 1];
    var prevLevel = W.currentLevel;
    var prevState = G.state;

    if (G.state === "loading" || G.state === "menu" || G.state === "end" || G.state === "story") {
      resetRunState();
    } else {
      E.clearZombies();
      E.clearFireZones();
      if (prevState === "levelclear") {
        var stageHeal = Math.round((G.maxHp || 100) * 0.35);
        var stageFloor = Math.round((G.maxHp || 100) * 0.65);
        G.hp = Math.min(G.maxHp || 100, Math.max(stageFloor, (G.hp || 0) + stageHeal));
        G.stamina = G.maxStamina || 100;
        G.stamLocked = false;
      }
    }
    closeArmoryModal(true);
    resetInputs();

    if (FPS.audio) {
      FPS.audio.init();
      FPS.audio.startAmbient();
    }

    W.loadLevel(levelDef);
    if (W.compileCurrentLevel) W.compileCurrentLevel();

    var sp = levelDef.playerSpawn || { x: 0, z: 0, yaw: 0 };
    var spFootY = W.groundY ? W.groundY(sp.x, sp.z, 0) : 0;
    playerPos.set(sp.x, spFootY + 1.7, sp.z);
    W.collide(playerPos, 0.55, false, spFootY);
    G.yaw = sp.yaw || 0;
    G.pitch = 0;
    G.vy = 0;
    G.grounded = true;
    lastYaw = G.yaw;
    lastPitch = G.pitch;

    G.levelIdx = id - 1;
    G.levelKills = 0;
    G.killQuota = levelDef.killQuota;
    G.portalUnlocked = false;
    G.extractProg = 0;
    G.bossSpawned = false;
    G.bossSlain = !levelDef.bossType;
    G.reloading = false;
    G.mouseDown = false;
    G.hsStreak = 0;
    G.hsTimer = 0;
    G.hsMult = 1;
    G.directorPhase = "surge";
    G.directorT = 14 + Math.random() * 6;
    G.panicT = 0;
    G.carryingRelics = 0;
    G.objProgress = 0;
    G.interactTarget = null;
    G.interactProg = 0;
    G.shoveCd = 0;
    G.shoveT = 0;
    G.shoveRegenLockT = 0;
    G.acidBlindT = 0;
    G.stalkerCueT = 0;
    _holdTargetId = null;
    _holdLastMs = 0;
    _holdDownAtMs = 0;
    _genTickAudioT = 0;
    _mobileInteractDown = false;
    _hazTickT = 0;
    _hazToastCd = 0;
    _waterShockTickT = 0.02;
    _waterLastMs = 0;
    _totemAddTimer = 10.0;
    _trapTickTimers = [];
    _prevElecWater = false;
    _gateBrokenAnnounced = false;
    _gateHintShown = false;
    _gensDoneTriggered = false;
    _totemsBrokenCount = 0;
    _holdoutDoneAnnounced = false;
    _holdLeft = (levelDef.objective && levelDef.objective.type === "holdout") ? (levelDef.objective.holdSec || 25) : 0;
    G.objState = buildObjState(levelDef);
    E.bossRef = null;
    spawnTimer = 1.0;

    hideAllOverlays();
    var hud = document.getElementById("hud");
    if (hud) hud.classList.remove("hidden");
    var bw = document.getElementById("bossWrap");
    if (bw) bw.classList.add("hidden");
    var eb = document.getElementById("extractBarWrap");
    if (eb) eb.classList.add("hidden");

    G.state = "playing";
    _lastIdleRender = 0;
    document.body.classList.add("playing");
    if (typeof startAnimLoop === "function") startAnimLoop();

    var initCount = Math.min(levelDef.maxAlive || 12, 3 + Math.min(1, Math.floor(id / 2)));
    for (var i = 0; i < initCount; i++) {
      E.spawnZombie(pickLevelZombieType(id, false));
    }

    if (E.clearSpecialFX) E.clearSpecialFX();
    if (FPS.ui && FPS.ui.clearTransientUI) FPS.ui.clearTransientUI();
    var lvTitle = FPS.LANG === "en" ? levelDef.nameEn : levelDef.nameVi;
    if (prevLevel && prevLevel !== levelDef) {
      flashStageTransition(FPS.t("stagePreparing") + " " + lvTitle + "...");
    }
    if (FPS.ui) {
      if (FPS.ui.announce) FPS.ui.announce(lvTitle, FPS.t("stageStartSub"));
      if (FPS.ui.updateHUD) FPS.ui.updateHUD();
      if (FPS.ui.drawRadar) FPS.ui.drawRadar();
      if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
    }
    updateLockHint();
  }

  function applyPerk(perk) {
    if (!perk) return;
    G.perks.push(perk.id);
    if (perk.id === "dmg") G.dmgMul *= 1.22;
    else if (perk.id === "rate") G.rateMul *= 1.16;
    else if (perk.id === "hp") {
      G.maxHp += 30;
      G.hp = Math.min(G.maxHp, G.hp + 50);
    } else if (perk.id === "speed") {
      G.speedMul *= 1.12;
      G.maxStamina += 25;
      G.stamina = G.maxStamina;
      G.stamLocked = false;
    } else if (perk.id === "ammo") {
      G.reserveMul *= 1.2;
      E.wState.shotgun.reserve = Math.round(FPS.WEAPONS.shotgun.reserve * G.reserveMul);
      E.wState.rifle.reserve = Math.round(FPS.WEAPONS.rifle.reserve * G.reserveMul);
    } else if (perk.id === "reload") {
      G.reloadMul *= 0.75;
      G.flareCdMul *= 0.8;
    } else if (perk.id === "armor") {
      G.armor = Math.min(0.45, G.armor + 0.15);
    }
  }

  function hurtPlayer(dmg, fromX, fromZ, bypassCd) {
    if (G.state !== "playing") return;
    var now = performance.now();
    if (!bypassCd && now < hurtCd) return;
    if (!bypassCd) hurtCd = now + 520;

    if (fromX !== undefined && fromZ !== undefined) {
      if (FPS.ui && FPS.ui.setDamageDir) {
        FPS.ui.setDamageDir(fromX, fromZ);
      } else {
        var _ddx = fromX - playerPos.x;
        var _ddz = fromZ - playerPos.z;
        var _ang = Math.atan2(
          _ddx * Math.cos(G.yaw) + _ddz * (-Math.sin(G.yaw)),
          _ddx * (-Math.sin(G.yaw)) + _ddz * (-Math.cos(G.yaw))
        ) * 180 / Math.PI;
        var _de = document.getElementById("dmgDir");
        var _dr = document.getElementById("dmgDirRot");
        if (_dr) _dr.style.transform = "rotate(" + _ang + "deg)";
        if (_de) {
          _de.style.opacity = 1;
          setTimeout(function () { _de.style.opacity = 0; }, 420);
        }
      }
    }

    G.hp -= dmg * (1 - G.armor);
    if (FPS.audio && FPS.audio.sfxHurt && !bypassCd) FPS.audio.sfxHurt();
    G.shake = Math.min(0.5, G.shake + (bypassCd ? 0.08 : 0.22));

    var vf = document.getElementById("vignette");
    if (vf) vf.style.opacity = Math.min(1, 1 - G.hp / G.maxHp + 0.35);
    var df = document.getElementById("dmgFlash");
    if (df) {
      df.style.transition = "none";
      df.style.opacity = bypassCd ? 0.55 : 1;
      setTimeout(function () {
        df.style.transition = "opacity .5s";
        df.style.opacity = 0;
      }, 40);
    }
    if (G.hp <= 0) {
      G.hp = 0;
      endGame(false);
    }
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  // Pointer lock + automatic plFallback
  var plHeld = false;
  var plFallback = false;
  var plFailCount = 0;
  var plReqAt = 0;

  function isLocked() {
    return document.pointerLockElement === W.renderer.domElement;
  }

  function updateLockHint() {
    if (FPS.ui && FPS.ui.updateLockHint) {
      FPS.ui.updateLockHint(plFallback);
      return;
    }
    var h = document.getElementById("lockHint");
    if (!h) return;
    var show = G.state === "playing" && !G.armoryOpen && !document.body.classList.contains("touch") && !isLocked();
    h.classList.toggle("hidden", !show);
    var tx = plFallback ? FPS.t("lockHintFb") : FPS.t("lockHint");
    if (h.textContent !== tx) h.textContent = tx;
  }

  function lockPointer() {
    if (document.body.classList.contains("touch") || isLocked() || G.armoryOpen) return;
    if (plFallback && plFailCount > 0 && performance.now() - plReqAt < 3000) {
      updateLockHint();
      return;
    }
    var now = performance.now();
    if (now - plReqAt < 350) return;
    plReqAt = now;
    try {
      var res = W.renderer.domElement.requestPointerLock();
      if (res && typeof res.catch === "function") {
        res.catch(function () {
          plFailCount++;
          plFallback = true;
          updateLockHint();
        });
      }
    } catch (e) {
      plFailCount++;
      plFallback = true;
      updateLockHint();
    }
  }

  function completeStage(levelDef) {
    closeArmoryModal(true);
    resetInputs();
    if (E.clearAutoReload) E.clearAutoReload();
    G.interactTarget = null;
    G.carryingRelics = 0;
    if (FPS.audio && FPS.audio.sfxLevelClear) FPS.audio.sfxLevelClear();
    var deltaKills = Math.max(0, G.totalKills - savedKills);
    savedKills = G.totalKills;
    var nextLv = Math.min(FPS.LEVELS.length, levelDef.id + 1);
    selectedLevelId = nextLv;

    if (levelDef.id < FPS.LEVELS.length) {
      FPSApi.saveProfile({
        highestLevel: nextLv,
        score: G.score,
        wave: levelDef.id,
        level: levelDef.id,
        killsDelta: deltaKills
      });
      G.state = "levelclear";
      _lastIdleRender = 0;
      G.mouseDown = false;
      document.body.classList.remove("playing");
      if (document.exitPointerLock) document.exitPointerLock();
      updateLockHint();
      if (FPS.ui && FPS.ui.showLevelClear) {
        FPS.ui.showLevelClear(levelDef, function (perk) {
          applyPerk(perk);
          lockPointer();
          startLevel(levelDef.id + 1);
        });
      } else {
        startLevel(levelDef.id + 1);
      }
    } else {
      endGame(true);
    }
  }

  function startCampaign(levelId) {
    resetRunState();
    if (FPS.audio) {
      FPS.audio.init();
      FPS.audio.startAmbient();
    }
    startLevel(levelId || selectedLevelId || 1);
    lockPointer();
  }

  function pauseGame() {
    if (G.state !== "playing") return;
    closeArmoryModal(true);
    resetInputs();
    if (E.clearAutoReload) E.clearAutoReload();
    G.interactTarget = null;
    G.state = "paused";
    _lastIdleRender = 0;
    document.body.classList.remove("playing");
    if (document.exitPointerLock) document.exitPointerLock();
    var ps = document.getElementById("pauseScr");
    if (ps) ps.classList.remove("hidden");
    updateLockHint();
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function resumeGame() {
    if (G.state !== "paused") return;
    var ps = document.getElementById("pauseScr");
    if (ps) ps.classList.add("hidden");
    G.state = "playing";
    _lastIdleRender = 0;
    document.body.classList.add("playing");
    lockPointer();
    updateLockHint();
  }

  function refreshMenuUI() {
    if (FPS.ui && FPS.ui.syncBackendUI) {
      FPS.ui.syncBackendUI(selectedLevelId, function (lvlId) {
        selectedLevelId = lvlId;
      });
    }
  }

  function toMenu() {
    closeArmoryModal(true);
    resetInputs();
    if (E.clearAutoReload) E.clearAutoReload();
    G.interactTarget = null;
    E.clearZombies();
    E.clearFireZones();
    if (E.clearSpecialFX) E.clearSpecialFX();
    if (FPS.ui && FPS.ui.clearTransientUI) FPS.ui.clearTransientUI();
    G.state = "menu";
    _lastIdleRender = 0;
    G.reloading = false;
    document.body.classList.remove("playing");
    if (document.exitPointerLock) document.exitPointerLock();
    ["hud", "pauseScr", "endScr", "levelClearScr", "storyScr", "armoryScr"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
    var mn = document.getElementById("menu");
    if (mn) mn.classList.remove("hidden");
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    refreshMenuUI();
  }

  var winWasCampaign = false;
  function endGame(win) {
    closeArmoryModal(true);
    resetInputs();
    if (E.clearAutoReload) E.clearAutoReload();
    G.interactTarget = null;
    if (E.clearSpecialFX) E.clearSpecialFX();
    if (FPS.ui && FPS.ui.clearTransientUI) FPS.ui.clearTransientUI();
    winWasCampaign = !!win;
    G.state = "end";
    _lastIdleRender = 0;
    G.reloading = false;
    document.body.classList.remove("playing");
    if (document.exitPointerLock) document.exitPointerLock();

    var curLv = G.levelIdx + 1;
    var highestSave = win ? FPS.LEVELS.length : curLv;
    var deltaKills = Math.max(0, G.totalKills - savedKills);
    savedKills = G.totalKills;

    if (FPS.ui && FPS.ui.showEndScreen) {
      FPS.ui.showEndScreen(win, { score: G.score, kills: G.totalKills, level: curLv, time: G.time });
    } else {
      var et = document.getElementById("endTitle");
      if (et) {
        et.textContent = win ? FPS.t("winT") : FPS.t("loseT");
        et.className = "title" + (win ? " win" : "");
      }
      var es = document.getElementById("endSub");
      if (es) es.textContent = win ? FPS.t("winS") : FPS.t("loseS");
      setTxt("eScore", String(G.score));
      setTxt("eKills", String(G.totalKills));
      setTxt("eLevel", String(curLv));
      var esScr = document.getElementById("endScr");
      if (esScr) esScr.classList.remove("hidden");
    }

    FPSApi.saveProfile({
      highestLevel: highestSave,
      score: G.score,
      wave: curLv,
      level: curLv,
      killsDelta: deltaKills,
      completedRun: true
    });
    FPSApi.submitScore({
      name: "Player",
      score: G.score,
      wave: curLv,
      level: curLv,
      kills: G.totalKills,
      win: !!win
    });
  }

  // Menu & overlay buttons
  var btnStart = document.getElementById("btnStart");
  if (btnStart) btnStart.onclick = function () {
    if (G.state === "loading") return;
    startCampaign(selectedLevelId);
  };

  var btnStory = document.getElementById("btnStory");
  if (btnStory) {
    btnStory.onclick = function () {
      if (G.state === "loading") return;
      document.getElementById("menu").classList.add("hidden");
      document.getElementById("storyScr").classList.remove("hidden");
    };
  }
  var btnStoryGo = document.getElementById("btnStoryGo");
  if (btnStoryGo) {
    btnStoryGo.onclick = function () {
      if (G.state === "loading") return;
      document.getElementById("storyScr").classList.add("hidden");
      startCampaign(selectedLevelId);
    };
  }
  var btnResume = document.getElementById("btnResume");
  if (btnResume) btnResume.onclick = resumeGame;
  var btnRestart2 = document.getElementById("btnRestart2");
  if (btnRestart2) btnRestart2.onclick = function () { startCampaign(G.levelIdx + 1); };
  var btnQuit = document.getElementById("btnQuit");
  if (btnQuit) btnQuit.onclick = toMenu;
  var btnAgain = document.getElementById("btnAgain");
  if (btnAgain) btnAgain.onclick = function () { startCampaign(winWasCampaign ? 1 : (G.levelIdx + 1)); };
  var btnMenu2 = document.getElementById("btnMenu2");
  if (btnMenu2) btnMenu2.onclick = toMenu;

  var langVi = document.getElementById("langVi");
  if (langVi) {
    langVi.onclick = function () {
      if (FPS.ui && FPS.ui.applyLang) FPS.ui.applyLang("vi");
      else FPS.LANG = "vi";
      applyQuality();
      FPSApi.saveProfile({ lang: "vi" });
    };
  }
  var langEn = document.getElementById("langEn");
  if (langEn) {
    langEn.onclick = function () {
      if (FPS.ui && FPS.ui.applyLang) FPS.ui.applyLang("en");
      else FPS.LANG = "en";
      applyQuality();
      FPSApi.saveProfile({ lang: "en" });
    };
  }

  // Volume & Quality
  var volSlider = document.getElementById("volSlider");
  var volVal = document.getElementById("volVal");
  var volMute = document.getElementById("volMute");
  var muteBtn = document.getElementById("muteBtn");

  function setVol(v) {
    v = Math.max(0, Math.min(100, Number(v) || 0));
    if (FPS.audio && FPS.audio.setVolume) FPS.audio.setVolume(v);
    if (volVal) volVal.textContent = v + "%";
    if (muteBtn) muteBtn.textContent = v === 0 ? "🔇 0%" : "🔊 " + v + "%";
  }
  if (volSlider) {
    volSlider.oninput = function () {
      if (FPS.audio) FPS.audio.init();
      setVol(Number(volSlider.value));
    };
  }
  function toggleMute() {
    if (FPS.audio) FPS.audio.init();
    var cur = volSlider ? Number(volSlider.value) : 70;
    var next = cur > 0 ? 0 : 70;
    if (volSlider) volSlider.value = next;
    setVol(next);
  }
  if (volMute) volMute.onclick = toggleMute;
  if (muteBtn) muteBtn.onclick = toggleMute;

  function getTargetDpr() {
    return QLEVEL === 0 ? Math.min(window.devicePixelRatio || 1, 1.0) : (QLEVEL === 1 ? 0.85 : 0.70);
  }

  function applyQuality() {
    var dpr = getTargetDpr();
    W.renderer.setPixelRatio(dpr);
    W.renderer.setSize(innerWidth, innerHeight);
    if (W.setQuality) {
      W.setQuality(QLEVEL);
    } else {
      if (W.dustPts) W.dustPts.visible = QLEVEL < 1;
      if (W.rainPts) W.rainPts.visible = QLEVEL < 1;
      if (W.camera) {
        W.camera.far = QLEVEL === 0 ? 63 : (QLEVEL === 1 ? 58 : 50);
        W.camera.updateProjectionMatrix();
      }
    }
    E.setParticleMul(QLEVEL === 0 ? 1 : (QLEVEL === 1 ? 0.6 : 0.3));
    _lastIdleRender = 0;
    var qNames = [FPS.t("qHigh"), FPS.t("qMed"), FPS.t("qLow")];
    var qModeTxt = QMODE === "auto" ? FPS.t("qAuto") : QMODE.toUpperCase();
    var txt = "Q: " + qModeTxt + " · " + qNames[QLEVEL];
    if (FPS.ui && FPS.ui.setQualityBadge) FPS.ui.setQualityBadge(txt);
    else setTxt("qBadge", txt);
  }
  function setQualityMode(m) {
    QMODE = m;
    QLEVEL = m === "high" ? 0 : (m === "low" ? 2 : 1);
    _lastQSwitch = performance.now();
    applyQuality();
    var s1 = document.getElementById("qSel");
    var s2 = document.getElementById("qSelP");
    if (s1) s1.value = m;
    if (s2) s2.value = m;
  }
  var qSel = document.getElementById("qSel");
  var qSelP = document.getElementById("qSelP");
  if (qSel) qSel.addEventListener("change", function () { setQualityMode(this.value); });
  if (qSelP) qSelP.addEventListener("change", function () { setQualityMode(this.value); });
  applyQuality();

  function trySwitchWeapon(k) {
    if (typeof E.isWeaponUnlocked === "function" && !E.isWeaponUnlocked(k)) return false;
    if (G.unlockedWeapons && (!Object.prototype.hasOwnProperty.call(G.unlockedWeapons, k) || !G.unlockedWeapons[k])) return false;
    return E.switchWeapon(k);
  }

  function queryInteractTarget() {
    if (!W.getNearestInteractable) return null;
    _camDir.set(0, 0, -1).applyQuaternion(W.camera.quaternion);
    return W.getNearestInteractable(playerPos, _camDir);
  }

  function executeInteract(tgt) {
    if (!tgt) return false;
    var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;
    if (tgt.kind === "armory" || tgt.kind === "anvil") {
      return openArmoryModal(tgt.kind);
    }
    if (tgt.kind === "relic") {
      if (W.pickupRelic && W.pickupRelic(tgt.idx)) {
        G.carryingRelics = (G.carryingRelics || 0) + 1;
        G.scrap = (G.scrap || 0) + ((FPS.SCRAP && FPS.SCRAP.relicBonus) || 35);
        if (FPS.audio && FPS.audio.sfxRelicPickup) FPS.audio.sfxRelicPickup();
        if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("objRelicPickup"), 1600);
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
        return true;
      }
      return false;
    }
    if (tgt.kind === "flare") {
      if (W.setFlareLit && W.setFlareLit(true)) {
        _holdLeft = (levelDef && levelDef.objective && levelDef.objective.holdSec) || 25;
        G.objProgress = +_holdLeft.toFixed(2);
        if (FPS.audio && FPS.audio.sfxFlareLaunch) FPS.audio.sfxFlareLaunch();
        if (levelDef && levelDef.bossType && !G.bossSpawned) {
          G.bossSpawned = true;
          E.spawnZombie(levelDef.bossType);
          if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("bossMinoAnn"), FPS.t("bossMinoSub"));
        } else if (FPS.ui && FPS.ui.announce) {
          FPS.ui.announce(FPS.t("objHoldoutActive"), "");
        }
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
        return true;
      }
      return false;
    }
    if (tgt.kind === "trap") {
      if (W.activateTrap && W.activateTrap(tgt.idx)) {
        _trapTickTimers[tgt.idx] = 0.08;
        if (FPS.audio && FPS.audio.sfxTrapActivate) FPS.audio.sfxTrapActivate(tgt.obj && tgt.obj.kind);
        if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("trapActive"), 1400);
        return true;
      }
      return false;
    }
    if (tgt.kind === "generator") {
      if (W.setGeneratorState && W.setGeneratorState(tgt.idx, true)) {
        G.scrap = (G.scrap || 0) + ((FPS.SCRAP && FPS.SCRAP.genBonus) || 40);
        if (FPS.audio && FPS.audio.sfxGeneratorOn) FPS.audio.sfxGeneratorOn();
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
        return true;
      }
      return false;
    }
    if (tgt.kind === "barricade") {
      var cost = (FPS.BARRICADES && FPS.BARRICADES.repairCost) || 20;
      if ((G.scrap || 0) < cost) {
        if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryNeedScrap"), 1400);
        return false;
      }
      G.scrap -= cost;
      if (W.repairBarricade) W.repairBarricade(tgt.idx);
      if (FPS.audio && FPS.audio.sfxArmoryBuy) FPS.audio.sfxArmoryBuy();
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("barricadeRepaired"), 1400);
      if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      return true;
    }
    return false;
  }

  var btnArmoryClose = document.getElementById("btnArmoryClose");
  if (btnArmoryClose) {
    btnArmoryClose.addEventListener("click", function () { closeArmoryModal(); });
  }

  // Desktop Input
  document.addEventListener("keydown", function (e) {
    G.keys[e.code] = true;
    if (G.state === "playing") {
      if (G.armoryOpen) {
        if (e.code === "Escape" || (e.code === "KeyE" && !e.repeat)) {
          closeArmoryModal();
          e.preventDefault();
        }
        return;
      }
      if (e.code === "KeyR") E.startReload();
      if (e.code === "Digit1") trySwitchWeapon("pistol");
      if (e.code === "Digit2") trySwitchWeapon("shotgun");
      if (e.code === "Digit3") trySwitchWeapon("rifle");
      if (e.code === "Digit4") trySwitchWeapon("thuanthien");
      if (e.code === "KeyV" && !e.repeat) {
        if (typeof E.shove === "function") E.shove();
      }
      if (e.code === "KeyE" && !e.repeat) {
        _holdDownAtMs = performance.now();
        var tgt = G.interactTarget || queryInteractTarget();
        if (tgt && !(tgt.holdSec > 0)) executeInteract(tgt);
      }
      if (e.code === "KeyF") {
        G.flashOn = !G.flashOn;
        if (W.flashlight) W.flashlight.visible = G.flashOn;
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      }
      if (e.code === "KeyG") E.throwFlare();
      if (e.code === "KeyP" || e.code === "Escape") pauseGame();
      if (e.code === "Space" && G.grounded) {
        G.vy = 5.4;
        G.grounded = false;
        e.preventDefault();
      }
    } else if (G.state === "paused" && (e.code === "KeyP" || e.code === "Escape")) {
      resumeGame();
    }
  });
  document.addEventListener("keyup", function (e) {
    if (e.code === "KeyE" && G.state === "playing" && !G.armoryOpen && _holdTargetId && G.interactTarget && G.interactTarget.id === _holdTargetId && G.interactTarget.holdSec > 0) {
      var nowUp = performance.now();
      var tailSec = Math.max(0, Math.min(0.5, (nowUp - (_holdLastMs || _holdDownAtMs || nowUp)) / 1000));
      if (G.interactProg + tailSec / G.interactTarget.holdSec >= 1) {
        executeInteract(G.interactTarget);
        G.interactProg = 0;
        _holdTargetId = null;
        _holdLastMs = 0;
      }
    }
    if (e.code === "KeyE") _holdDownAtMs = 0;
    G.keys[e.code] = false;
  });
  document.addEventListener("mousemove", function (e) {
    if ((isLocked() || plFallback) && G.state === "playing" && !G.armoryOpen) {
      G.yaw -= e.movementX * 0.0021;
      G.pitch -= e.movementY * 0.0021;
      G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch));
    }
  });
  document.addEventListener("mousedown", function (e) {
    if (G.state !== "playing" || G.armoryOpen || e.target.closest("button, #flareChip, #armoryScr")) return;
    if (e.button === 2) {
      e.preventDefault();
      if (typeof E.shove === "function") E.shove();
      return;
    }
    if (e.button !== 0) return;
    if (!isLocked() && !document.body.classList.contains("touch")) {
      lockPointer();
      if (!plFallback) return;
    }
    G.mouseDown = true;
    E.shoot();
  });
  document.addEventListener("contextmenu", function (e) {
    if (G.state === "playing") e.preventDefault();
  });
  document.addEventListener("mouseup", function () { G.mouseDown = false; });
  document.addEventListener("pointerlockchange", function () {
    var nowLocked = isLocked();
    if (nowLocked) {
      plHeld = true;
      plFallback = false;
    } else {
      if (plHeld && G.state === "playing" && !G.armoryOpen && !document.body.classList.contains("touch")) {
        pauseGame();
      }
      plHeld = false;
    }
    updateLockHint();
  });

  // Mobile Touch Controls
  joyEl = document.getElementById("joy");
  knob = document.getElementById("joyKnob");
  if (("ontouchstart" in window) || navigator.maxTouchPoints > 0) document.body.classList.add("touch");

  function bindBtn(id, down, up) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", function (e) { e.preventDefault(); down(); }, { passive: false });
    if (up) {
      el.addEventListener("touchend", function (e) { e.preventDefault(); up(); }, { passive: false });
      el.addEventListener("touchcancel", function (e) { e.preventDefault(); up(); }, { passive: false });
    }
  }
  bindBtn("btnFire", function () { if (!G.armoryOpen) { G.mouseDown = true; E.shoot(); } }, function () { G.mouseDown = false; });
  bindBtn("btnReload", function () { if (!G.armoryOpen) E.startReload(); });
  bindBtn("btnJump", function () { if (G.grounded && G.state === "playing" && !G.armoryOpen) { G.vy = 5.4; G.grounded = false; } });
  bindBtn("btnWeapon", function () {
    if (G.armoryOpen) return;
    var order = ["pistol", "shotgun", "rifle", "thuanthien"];
    var curIdx = Math.max(0, order.indexOf(E.curWeapon));
    for (var step = 1; step <= order.length; step++) {
      var cand = order[(curIdx + step) % order.length];
      if (trySwitchWeapon(cand)) break;
    }
  });
  bindBtn("btnShove", function () {
    if (G.state === "playing" && !G.armoryOpen && typeof E.shove === "function") E.shove();
  });
  var bShove = document.getElementById("btnShove");
  if (bShove) bShove.addEventListener("click", function (e) {
    e.preventDefault();
    if (G.state === "playing" && !G.armoryOpen && typeof E.shove === "function") E.shove();
  });
  var bInteract = document.getElementById("btnInteract");
  if (bInteract) {
    bInteract.addEventListener("touchstart", function (e) {
      e.preventDefault();
      _lastInteractTouchMs = performance.now();
      _holdDownAtMs = _lastInteractTouchMs;
      _mobileInteractDown = true;
      if (G.state === "playing" && !G.armoryOpen) {
        var tgt = G.interactTarget || queryInteractTarget();
        if (tgt && !(tgt.holdSec > 0)) executeInteract(tgt);
      }
    }, { passive: false });
    bInteract.addEventListener("touchend", function (e) {
      e.preventDefault();
      if (_mobileInteractDown && G.state === "playing" && !G.armoryOpen && _holdTargetId && G.interactTarget && G.interactTarget.id === _holdTargetId && G.interactTarget.holdSec > 0) {
        var nowUp = performance.now();
        var tailSec = Math.max(0, Math.min(0.5, (nowUp - (_holdLastMs || _holdDownAtMs || nowUp)) / 1000));
        if (G.interactProg + tailSec / G.interactTarget.holdSec >= 1) {
          executeInteract(G.interactTarget);
          G.interactProg = 0;
          _holdTargetId = null;
          _holdLastMs = 0;
        }
      }
      _mobileInteractDown = false;
      _holdDownAtMs = 0;
    }, { passive: false });
    bInteract.addEventListener("touchcancel", function () { _mobileInteractDown = false; _holdDownAtMs = 0; });
    bInteract.addEventListener("click", function (e) {
      e.preventDefault();
      if (performance.now() - _lastInteractTouchMs < 400) return;
      if (G.state === "playing" && !G.armoryOpen) {
        var tgt = G.interactTarget || queryInteractTarget();
        if (tgt && !(tgt.holdSec > 0)) executeInteract(tgt);
      }
    });
  }
  bindBtn("btnFlash", function () {
    G.flashOn = !G.flashOn;
    if (W.flashlight) W.flashlight.visible = G.flashOn;
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  });
  bindBtn("btnFlare", function () { if (!G.armoryOpen) E.throwFlare(); });
  var bf = document.getElementById("btnFlare");
  if (bf) bf.addEventListener("click", function (e) { e.preventDefault(); if (!G.armoryOpen) E.throwFlare(); });
  var fc = document.getElementById("flareChip");
  if (fc) {
    fc.addEventListener("click", function () { if (!G.armoryOpen) E.throwFlare(); });
    fc.addEventListener("touchstart", function (e) { e.preventDefault(); if (!G.armoryOpen) E.throwFlare(); }, { passive: false });
  }
  bindBtn("btnPauseM", function () {
    if (G.state === "playing") pauseGame();
    else if (G.state === "paused") resumeGame();
  });
  var bpm = document.getElementById("btnPauseM");
  if (bpm) bpm.addEventListener("click", function () {
    if (G.state === "playing") pauseGame();
    else if (G.state === "paused") resumeGame();
  });

  function clearJoyTouch() {
    joyTouch = null;
    joyVec.x = 0;
    joyVec.y = 0;
    if (knob) knob.style.transform = "translate(-50%,-50%)";
  }
  function handleTouchEndOrCancel(e) {
    if (!e || !e.changedTouches) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var tc = e.changedTouches[i];
      if (tc.identifier === joyTouch) clearJoyTouch();
      if (lookTouch && tc.identifier === lookTouch.id) lookTouch = null;
    }
  }
  if (joyEl) {
    joyEl.addEventListener("touchstart", function (e) {
      e.preventDefault();
      joyTouch = e.changedTouches[0].identifier;
    }, { passive: false });
    joyEl.addEventListener("touchcancel", function (e) {
      e.preventDefault();
      if (!e.changedTouches || !e.changedTouches.length) {
        clearJoyTouch();
      } else {
        handleTouchEndOrCancel(e);
      }
    }, { passive: false });
  }
  W.renderer.domElement.addEventListener("touchstart", function (e) {
    if (G.state !== "playing" || G.armoryOpen) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var tc = e.changedTouches[i];
      if (tc.identifier !== joyTouch && !lookTouch) {
        lookTouch = { id: tc.identifier, x: tc.clientX, y: tc.clientY };
      }
    }
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var tc = e.changedTouches[i];
      if (joyTouch === tc.identifier && joyEl && knob) {
        var r = joyEl.getBoundingClientRect();
        var dx = tc.clientX - (r.left + r.width / 2);
        var dy = tc.clientY - (r.top + r.height / 2);
        var d = Math.hypot(dx, dy);
        var max = 38;
        if (d > max) { dx *= max / d; dy *= max / d; }
        knob.style.transform = "translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px))";
        joyVec.x = dx / max;
        joyVec.y = dy / max;
      }
      if (lookTouch && tc.identifier === lookTouch.id && G.state === "playing" && !G.armoryOpen) {
        G.yaw -= (tc.clientX - lookTouch.x) * 0.005;
        G.pitch -= (tc.clientY - lookTouch.y) * 0.005;
        G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch));
        lookTouch.x = tc.clientX;
        lookTouch.y = tc.clientY;
      }
    }
  }, { passive: true });
  document.addEventListener("touchend", handleTouchEndOrCancel);
  document.addEventListener("touchcancel", handleTouchEndOrCancel);

  // Main Loop
  var _fpsFrames = 0;
  var _fpsWin = performance.now();
  var _frameNo = 0;
  var _lastSceneCalls = 0;
  var _lastSceneTris = 0;
  var _lastGunCalls = 0;
  var _lastGunTris = 0;

  function animate() {
    requestAnimationFrame(animate);
    if (document.hidden) {
      W.clock.getDelta();
      return;
    }
    _frameNo++;
    _fpsFrames++;
    var now = performance.now();
    if (now - _fpsWin >= 1000) {
      var fps = Math.round(_fpsFrames * 1000 / (now - _fpsWin));
      _fpsFrames = 0;
      _fpsWin = now;
      window.__fpsAvg = fps;
      setTxt("qFps", "FPS: " + fps);
      setTxt("qFpsP", "FPS: " + fps);
      if (QMODE === "auto" && G.state === "playing" && (now - _lastQSwitch > 3000)) {
        if (fps < 44 && QLEVEL < 2) {
          QLEVEL++;
          _lastQSwitch = now;
          applyQuality();
        } else if (fps > 57 && QLEVEL > 0) {
          QLEVEL--;
          _lastQSwitch = now;
          applyQuality();
        }
      }
    }

    var rawDt = W.clock.getDelta();
    var dt = Math.min(rawDt, 0.05);
    var realDt = Math.min(rawDt, 0.25);
    var playing = G.state === "playing";
    if (!playing) {
      if (_lastIdleRender !== 0 && (now - _lastIdleRender < 500)) return;
      _lastIdleRender = now;
    }
    var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;

    if (playing && levelDef) {
      G.time += realDt;
      if (G.armoryOpen) {
        var ascr = document.getElementById("armoryScr");
        if (ascr && ascr.classList.contains("hidden")) G.armoryOpen = false;
      }
      if (G.shoveCd > 0) G.shoveCd = Math.max(0, G.shoveCd - realDt);
      if (G.shoveT > 0) G.shoveT = Math.max(0, G.shoveT - realDt);
      if (G.panicT > 0) G.panicT = Math.max(0, G.panicT - realDt);
      if (_genTickAudioT > 0) _genTickAudioT = Math.max(0, _genTickAudioT - realDt);
      if (_hazToastCd > 0) _hazToastCd = Math.max(0, _hazToastCd - realDt);

      // Player Movement + Stamina + Verticality + Hazards
      var curFootY = Math.max(0, playerPos.y - 1.7);
      var pHaz = W.getHazardAt ? W.getHazardAt(playerPos.x, playerPos.z, curFootY) : null;
      var hazMul = pHaz === "water"
        ? ((FPS.HAZARDS && FPS.HAZARDS.water && FPS.HAZARDS.water.speedMul) || 0.78)
        : (pHaz === "toxic" ? ((FPS.HAZARDS && FPS.HAZARDS.toxic && FPS.HAZARDS.toxic.speedMul) || 0.82) : 1.0);
      var relicMul = (G.carryingRelics || 0) > 0
        ? ((FPS.HAZARDS && FPS.HAZARDS.relicCarrySpeedMul) || 0.88)
        : 1.0;

      var wantRun = !G.armoryOpen && !!(G.keys.ShiftLeft || G.keys.ShiftRight);
      var fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
      var rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      var mx = 0, mz = 0;
      if (!G.armoryOpen) {
        if (G.keys.KeyW) { mx += fx; mz += fz; }
        if (G.keys.KeyS) { mx -= fx; mz -= fz; }
        if (G.keys.KeyA) { mx -= rx; mz -= rz; }
        if (G.keys.KeyD) { mx += rx; mz += rz; }
        mx += rx * joyVec.x + fx * (-joyVec.y);
        mz += rz * joyVec.x + fz * (-joyVec.y);
      }
      var ml = Math.hypot(mx, mz);
      var moveDt = Math.min(rawDt, 0.32);
      var mSteps = Math.max(1, Math.ceil(moveDt / 0.045));
      var mDt = moveDt / mSteps;
      if (ml > 0.01) {
        mx /= Math.max(1, ml);
        mz /= Math.max(1, ml);
      }
      var anyRun = false;
      for (var ms = 0; ms < mSteps; ms++) {
        var runStep = wantRun && ml > 0.01 && !G.stamLocked && G.stamina > 0;
        if (runStep) {
          anyRun = true;
          G.stamina = Math.max(0, G.stamina - 24 * mDt);
          if (G.stamina <= 0) {
            G.stamina = 0;
            G.stamLocked = true;
          }
        } else if ((G.shoveT || 0) <= 0 && (G.shoveRegenLockT || 0) <= 0) {
          G.stamina = Math.min(G.maxStamina, G.stamina + (ml > 0.01 ? 20 : 30) * mDt);
          if (G.stamLocked && G.stamina > G.maxStamina * 0.15) G.stamLocked = false;
        }
        if (ml > 0.01) {
          var stepSpd = (runStep ? 7.9 : 4.8) * G.speedMul * hazMul * relicMul;
          var stepFootY = Math.max(0, playerPos.y - 1.7);
          playerPos.x += mx * stepSpd * mDt;
          playerPos.z += mz * stepSpd * mDt;
          W.collide(playerPos, 0.55, false, stepFootY);
          if (G.grounded && W.groundY) {
            var stepGY = W.groundY(playerPos.x, playerPos.z, stepFootY);
            if (stepGY >= stepFootY - 0.12) playerPos.y = stepGY + 1.7;
          }
        }
      }
      if (G.shoveRegenLockT > 0) G.shoveRegenLockT = Math.max(0, G.shoveRegenLockT - realDt);
      if (ml > 0.01) {
        G.bobT += moveDt * (anyRun ? 11 : 8);
      } else {
        G.bobT += dt * 2;
        W.collide(playerPos, 0.55, false, curFootY);
      }

      var footAfterMove = Math.max(0, playerPos.y - 1.7);
      var gY = W.groundY ? W.groundY(playerPos.x, playerPos.z, footAfterMove) : 0;
      var targetEyeY = gY + 1.7;

      if (!G.grounded || playerPos.y > targetEyeY + 0.08) {
        G.grounded = false;
        G.vy -= 14 * dt;
        playerPos.y += G.vy * dt;
        var newFootY = Math.max(0, playerPos.y - 1.7);
        gY = W.groundY ? W.groundY(playerPos.x, playerPos.z, newFootY) : 0;
        targetEyeY = gY + 1.7;
        if (G.vy > 0 && W.raycastWallDist) {
          var rayBaseY = Math.max(0.1, gY + 1.65);
          var ceilDist = W.raycastWallDist(_upOrigin.set(playerPos.x, rayBaseY, playerPos.z), _upDir, 3.5);
          if (ceilDist > 0.02 && ceilDist < 3.5) {
            var maxEyeY = Math.max(targetEyeY, rayBaseY + ceilDist - 0.05);
            if (playerPos.y > maxEyeY) {
              playerPos.y = maxEyeY;
              G.vy = 0;
            }
          }
        }
        if (G.vy <= 0 && playerPos.y <= targetEyeY) {
          playerPos.y = targetEyeY;
          G.vy = 0;
          G.grounded = true;
        }
      } else {
        playerPos.y = targetEyeY;
        G.vy = 0;
        G.grounded = true;
      }

      if (!G.armoryOpen && G.mouseDown && FPS.WEAPONS[E.curWeapon] && FPS.WEAPONS[E.curWeapon].auto) E.shoot();
      if (G.reloading && now >= G.reloadEnd) E.finishReload();
      if (G.flareCd > 0) G.flareCd = Math.max(0, G.flareCd - realDt);

      // Interaction Scanner & Hold-E Progress
      if (!G.armoryOpen) {
        G.interactTarget = queryInteractTarget();
        if (G.interactTarget && G.interactTarget.holdSec > 0 && (G.keys.KeyE || _mobileInteractDown)) {
          if (_holdTargetId !== G.interactTarget.id) {
            _holdTargetId = G.interactTarget.id;
            _holdLastMs = (_holdDownAtMs > 0 && now - _holdDownAtMs < 600) ? _holdDownAtMs : now;
            G.interactProg = 0;
          }
          var holdStepSec = Math.max(realDt, Math.min(0.5, (now - (_holdLastMs || now)) / 1000));
          _holdLastMs = now;
          G.interactProg = Math.min(1, G.interactProg + holdStepSec / G.interactTarget.holdSec);
          if (G.interactTarget.kind === "generator" && _genTickAudioT <= 0) {
            _genTickAudioT = 0.38;
            if (FPS.audio && FPS.audio.sfxGeneratorTick) FPS.audio.sfxGeneratorTick();
          }
          if (G.interactProg >= 1) {
            executeInteract(G.interactTarget);
            G.interactProg = 0;
            _holdTargetId = null;
            _holdLastMs = 0;
          }
        } else {
          _holdTargetId = null;
          _holdLastMs = 0;
          G.interactProg = 0;
        }
      } else {
        G.interactTarget = null;
        G.interactProg = 0;
        _holdTargetId = null;
        _holdLastMs = 0;
      }

      // Fallback prompt visibility if M4 ui.js hasn't updated it
      if (!FPS.ui || !FPS.ui.updateInteractPrompt) {
        var ipEl = document.getElementById("interactPrompt");
        if (ipEl) ipEl.classList.toggle("hidden", !(G.interactTarget && !G.armoryOpen));
        var biEl = document.getElementById("btnInteract");
        if (biEl) biEl.classList.toggle("hidden", !(G.interactTarget && !G.armoryOpen));
      }

      // Traps + Electrified Water + Toxic Fog
      var traps = W.traps || [];
      var hasWater = false;
      var hzList = W.hazards || [];
      for (var hi = 0; hi < hzList.length; hi++) {
        if (hzList[hi].kind === "water") { hasWater = true; break; }
      }
      var anyActiveElecOnWater = false;
      var trapCfg = FPS.TRAPS || {};
      var trapTickInterval = trapCfg.tick || 0.5;
      for (var ti = 0; ti < traps.length; ti++) {
        var tr = traps[ti];
        if (tr.cdT > 0) {
          tr.cdT = Math.max(0, tr.cdT - realDt);
          if (tr.cdT === 0 && !tr.active && W.setTrapState) W.setTrapState(ti, false, 0);
        }
        if (tr.active) {
          tr.activeT = (tr.activeT !== undefined ? tr.activeT : (tr.dur || 6.0)) - realDt;
          if (tr.kind === "electric") {
            var trHz = W.getHazardAt ? W.getHazardAt(tr.x, tr.z, tr.y || 0) : null;
            if (trHz === "water" || !hasWater || (tr.y || 0) <= 0.35) {
              if (hasWater) anyActiveElecOnWater = true;
            }
          }
          if (_trapTickTimers[ti] === undefined) _trapTickTimers[ti] = 0.05;
          _trapTickTimers[ti] -= realDt;
          while (_trapTickTimers[ti] <= 0) {
            _trapTickTimers[ti] += trapTickInterval;
            var tDef = tr.kind === "fire" ? (trapCfg.fire || {}) : (trapCfg.electric || {});
            var tDmg = (tDef.dps || 48) * trapTickInterval;
            var tSlow = tDef.slowMul || 0.5;
            var trR = tr.r || 3.0;
            for (var zti = E.zombies.length - 1; zti >= 0; zti--) {
              var zt = E.zombies[zti];
              if (!zt || zt.dead) continue;
              var zgp = zt.group.position;
              if (Math.abs((zgp.y || 0) - (tr.y || 0)) > 1.35) continue;
              var zdx = zgp.x - tr.x, zdz = zgp.z - tr.z;
              var zrr = trR + (zt.hitR || 0.56) * 0.5;
              if (zdx * zdx + zdz * zdz <= zrr * zrr) {
                zt.trapSlowT = 0.7;
                zt.trapSlowMul = tSlow;
                E.damageZombie(zt, tDmg, false);
              }
            }
          }
          if (tr.activeT <= 0) {
            tr.active = false;
            tr.activeT = 0;
            if (W.setTrapState) W.setTrapState(ti, false, tr.cdT);
          }
        }
      }
      if (hasWater && anyActiveElecOnWater !== _prevElecWater) {
        _prevElecWater = anyActiveElecOnWater;
        if (W.electrifyWater) W.electrifyWater(anyActiveElecOnWater);
      }
      if (hasWater && W.waterElectrified) {
        var wStep = Math.min(0.65, Math.max(realDt, (now - (_waterLastMs || now)) / 1000));
        _waterLastMs = now;
        _waterShockTickT -= wStep;
        while (_waterShockTickT <= 0) {
          _waterShockTickT += trapTickInterval;
          var wDmg = ((trapCfg.electric && trapCfg.electric.waterDps) || 60) * trapTickInterval;
          for (var zwi = E.zombies.length - 1; zwi >= 0; zwi--) {
            var zw = E.zombies[zwi];
            if (!zw || zw.dead) continue;
            var zwPos = zw.group.position;
            if (W.getHazardAt && W.getHazardAt(zwPos.x, zwPos.z, zwPos.y || 0) === "water") {
              zw.trapSlowT = 0.7;
              zw.trapSlowMul = 0.45;
              E.damageZombie(zw, wDmg, false);
            }
          }
        }
      } else {
        _waterShockTickT = 0.02;
        _waterLastMs = 0;
      }

      // Player environmental hazard DoT (Toxic fog or Electrified water)
      var pFootCur = Math.max(0, playerPos.y - 1.7);
      var pHazNow = W.getHazardAt ? W.getHazardAt(playerPos.x, playerPos.z, pFootCur) : null;
      if (pHazNow === "toxic" || (pHazNow === "water" && W.waterElectrified)) {
        if (_hazTickT <= 0) {
          var toxCfg = (FPS.HAZARDS && FPS.HAZARDS.toxic) || {};
          var hTick = toxCfg.tick || 0.5;
          _hazTickT = hTick;
          var hDmg = pHazNow === "water"
            ? (((trapCfg.electric && trapCfg.electric.waterDps) || 60) * 0.35 * hTick)
            : ((toxCfg.dps || 6) * hTick);
          hurtPlayer(hDmg, undefined, undefined, true);
          if (_hazToastCd <= 0 && FPS.ui && FPS.ui.showToast) {
            _hazToastCd = 2.5;
            FPS.ui.showToast(FPS.t(pHazNow === "water" ? "spWaterShock" : "spToxicHit"), 1200);
          }
        } else {
          _hazTickT -= realDt;
        }
      } else {
        _hazTickT = 0.08;
      }

      // Stage Objectives State Machine
      var obj = levelDef.objective;
      if (obj && obj.type === "gate") {
        var gateBroken = !(W.gate && W.gate.alive);
        if (gateBroken && !_gateBrokenAnnounced) {
          _gateBrokenAnnounced = true;
        } else if (!gateBroken && G.levelKills >= G.killQuota && !_gateHintShown) {
          _gateHintShown = true;
          if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("objGateHint"), 2200);
        }
      } else if (obj && obj.type === "generators") {
        var gens = W.generators || [];
        var gAct = 0;
        for (var gi = 0; gi < gens.length; gi++) if (gens[gi].active) gAct++;
        if (gens.length > 0 && gAct >= gens.length && !_gensDoneTriggered) {
          _gensDoneTriggered = true;
          if (W.setMarketLightsBright) W.setMarketLightsBright(true);
          G.panicT = (FPS.DIRECTOR && FPS.DIRECTOR.panicHordeDur) || 10;
          G.directorPhase = "surge";
          G.directorT = Math.max(G.directorT, G.panicT);
          if (FPS.audio && FPS.audio.sfxSting) FPS.audio.sfxSting();
          if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("objGenDone"), FPS.t("panicHorde"));
        }
      } else if (obj && obj.type === "totems") {
        var ts = W.totems || [];
        var tAliveList = [];
        var tBroken = 0;
        for (var tti = 0; tti < ts.length; tti++) {
          if (ts[tti].alive) tAliveList.push(ts[tti]);
          else tBroken++;
        }
        if (tBroken > _totemsBrokenCount) {
          _totemsBrokenCount = tBroken;
        }
        if (tAliveList.length > 0) {
          _totemAddTimer -= realDt;
          if (_totemAddTimer <= 0) {
            _totemAddTimer = 10.0;
            var curAliveZ = 0;
            for (var azi = 0; azi < E.zombies.length; azi++) if (!E.zombies[azi].dead) curAliveZ++;
            if (curAliveZ < (levelDef.maxAlive || 12) + 2) {
              var pickedTotem = tAliveList[Math.floor(Math.random() * tAliveList.length)];
              var addZ = E.spawnZombie(Math.random() < 0.45 ? "runner" : "normal");
              if (addZ) {
                var tx = pickedTotem.x + (Math.random() - 0.5) * 3.0;
                var tz = pickedTotem.z + (Math.random() - 0.5) * 3.0;
                var tgy = W.groundY ? W.groundY(tx, tz, pickedTotem.y || 0) : (pickedTotem.y || 0);
                addZ.baseY = tgy;
                addZ.group.position.set(tx, tgy, tz);
                W.collide(addZ.group.position, 0.52 * addZ.group.scale.x, true, tgy);
              }
            }
          }
        }
      } else if (obj && obj.type === "holdout") {
        if (W.holdout && W.holdout.flareLit) {
          if (levelDef.bossType && !G.bossSpawned) {
            G.bossSpawned = true;
            E.spawnZombie(levelDef.bossType);
            if (FPS.ui && FPS.ui.announce) {
              FPS.ui.announce(FPS.t("bossMinoAnn"), FPS.t("bossMinoSub"));
            }
          }
          if (_holdLeft > 0) {
            _holdLeft = Math.max(0, _holdLeft - realDt);
            G.objProgress = +_holdLeft.toFixed(2);
          }
          if (_holdLeft <= 0 && !_holdoutDoneAnnounced) {
            _holdoutDoneAnnounced = true;
            if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("objBoatHere"), "");
          }
        }
      }
      G.objState = buildObjState(levelDef);

      // AI Director 2-Beat (Surge <-> 6-8s Breather)
      var dirCfg = FPS.DIRECTOR || {};
      var forceSurge = G.panicT > 0 || (obj && obj.type === "holdout" && W.holdout && W.holdout.flareLit && _holdLeft > 0) || G.portalUnlocked;
      if (forceSurge) {
        G.directorPhase = "surge";
        if (G.directorT <= 0) G.directorT = dirCfg.surgeDurMin || 14;
      } else {
        G.directorT -= realDt;
        if (G.directorT <= 0) {
          if (G.directorPhase === "surge") {
            G.directorPhase = "breather";
            var bMin = dirCfg.breatherDurMin || 6;
            var bMax = dirCfg.breatherDurMax || 8;
            G.directorT = bMin + Math.random() * (bMax - bMin);
            if (FPS.audio && FPS.audio.sfxBreather) FPS.audio.sfxBreather();
            if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("dirBreather"), 1800);
          } else {
            G.directorPhase = "surge";
            var sMin = dirCfg.surgeDurMin || 14;
            var sMax = dirCfg.surgeDurMax || 20;
            G.directorT = sMin + Math.random() * (sMax - sMin);
            if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("dirSurge"), 1600);
          }
        }
      }

      // Boss spawn at 50% level killQuota
      if (levelDef.bossType && !G.bossSpawned && G.levelKills >= Math.ceil(G.killQuota * 0.5)) {
        G.bossSpawned = true;
        E.spawnZombie(levelDef.bossType);
        if (FPS.ui && FPS.ui.announce) {
          FPS.ui.announce(
            FPS.t(levelDef.bossType === "minotaur" ? "bossMinoAnn" : "bossOrcAnn"),
            FPS.t(levelDef.bossType === "minotaur" ? "bossMinoSub" : "bossOrcSub")
          );
        }
      }

      // Director-modulated Spawning
      var aliveCount = 0;
      for (var ai = 0; ai < E.zombies.length; ai++) {
        if (!E.zombies[ai].dead) aliveCount++;
      }
      var baseMax = levelDef.maxAlive || 12;
      var maxAllowed = G.portalUnlocked
        ? Math.max(4, Math.floor(baseMax * 0.45))
        : (G.directorPhase === "surge" ? Math.min(16, baseMax + (dirCfg.surgeMaxAliveBonus !== undefined ? dirCfg.surgeMaxAliveBonus : 2)) : Math.max(4, Math.floor(baseMax * 0.7)));
      if (aliveCount < maxAllowed) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          var baseInterval = Math.max(0.85, 1.85 - levelDef.id * 0.16);
          if (G.panicT > 0) spawnTimer = dirCfg.panicSpawnInterval || 0.65;
          else if (G.portalUnlocked) spawnTimer = 2.2;
          else if (G.directorPhase === "breather") spawnTimer = baseInterval * (dirCfg.breatherSpawnMul || 2.2);
          else spawnTimer = baseInterval * (dirCfg.surgeSpawnMul || 0.72);
          E.spawnZombie(pickLevelZombieType(levelDef.id, true));
        }
      }

      // Portal Unlock Check (Kill Quota + Boss + Dynamic Objective)
      var bossDone = !levelDef.bossType || (G.bossSpawned && G.bossSlain);
      var objDone = isObjectiveComplete(levelDef);
      if (!G.portalUnlocked && G.levelKills >= G.killQuota && bossDone && objDone) {
        G.portalUnlocked = true;
        if (FPS.audio && FPS.audio.sfxPortalUnlock) FPS.audio.sfxPortalUnlock();
        if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("portalUnlocked"), FPS.t("portalSub"));
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      }

      // Extraction Hold Check (3D vertical check)
      if (G.portalUnlocked && levelDef.extractPos) {
        var ex = levelDef.extractPos;
        var exY = ex.y || 0;
        var pFootEx = Math.max(0, playerPos.y - 1.7);
        var exDist = Math.hypot(playerPos.x - ex.x, playerPos.z - ex.z);
        if (exDist <= (ex.r || 4.0) && Math.abs(pFootEx - exY) <= 1.25) {
          G.extractProg = Math.min(levelDef.extractHoldSec, G.extractProg + realDt);
          if (G.extractProg >= levelDef.extractHoldSec) {
            completeStage(levelDef);
          }
        } else if (G.extractProg > 0) {
          G.extractProg = Math.max(0, G.extractProg - realDt * 0.65);
        }
      }

      groanTimer -= dt;
      if (groanTimer <= 0) {
        groanTimer = 3.2 + Math.random() * 4;
        if (aliveCount > 0 && FPS.audio && FPS.audio.sfxGroan) FPS.audio.sfxGroan();
      }
    }

    // Update entities & world visuals
    E.updateEntities(dt, now, playing, _frameNo, realDt);
    if (W.updateWorldVisuals) {
      var exPct = levelDef && levelDef.extractHoldSec ? (G.extractProg / levelDef.extractHoldSec) : 0;
      W.updateWorldVisuals(dt, now, G.portalUnlocked, exPct);
    }

    if (playing && (_frameNo % 3) === 0 && FPS.ui) {
      if (FPS.ui.drawRadar) FPS.ui.drawRadar();
      if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
    }

    // Camera + Viewmodel Feel (with Shove gun-bash)
    G.shake = Math.max(0, G.shake - dt * 1.8);
    W.camera.position.copy(playerPos);
    if (G.shake > 0) {
      W.camera.position.x += (Math.random() - 0.5) * G.shake * 0.18;
      W.camera.position.y += (Math.random() - 0.5) * G.shake * 0.18;
    }
    var _dyw = G.yaw - lastYaw, _dpt = G.pitch - lastPitch;
    lastYaw = G.yaw;
    lastPitch = G.pitch;
    swayX += ((Math.max(-0.045, Math.min(0.045, -_dyw * 0.55))) - swayX) * Math.min(1, dt * 9);
    swayY += ((Math.max(-0.03, Math.min(0.03, _dpt * 0.5))) - swayY) * Math.min(1, dt * 9);
    W.camera.rotation.order = "YXZ";
    W.camera.rotation.y = G.yaw;
    W.camera.rotation.x = G.pitch;

    if (G.reloading && G.reloadDur) {
      gunDip = Math.sin(Math.min(1, Math.max(0, 1 - (G.reloadEnd - now) / G.reloadDur)) * Math.PI);
    } else {
      gunDip += (0 - gunDip) * Math.min(1, dt * 10);
    }
    var ga = E.updateGunAnim(dt, now, G);
    var totalDip = gunDip * 0.22 + (ga.switchT > 0 ? Math.sin((0.28 - Math.max(0, ga.switchT)) / 0.28 * Math.PI) * 0.26 : 0);
    var _swAng = ga.swordSwingT > 0 ? Math.sin((0.32 - ga.swordSwingT) / 0.32 * Math.PI) : 0;
    var _shoveAng = ga.shoveT > 0 ? Math.sin((0.28 - Math.min(0.28, ga.shoveT)) / 0.28 * Math.PI) : 0;

    W.gunGroup.position.x = ga.gunBase.x + Math.sin(G.bobT) * 0.01 + swayX - _swAng * 0.26 - _shoveAng * 0.14;
    W.gunGroup.position.y = ga.gunBase.y + Math.abs(Math.sin(G.bobT)) * 0.01 - totalDip + _swAng * 0.08 + _shoveAng * 0.04;
    W.gunGroup.rotation.x = gunDip * 0.55 + swayY - _swAng * 1.15 - _shoveAng * 0.12;
    W.gunGroup.rotation.y = swayX * 1.5 + _swAng * 0.65 + _shoveAng * 0.45;
    W.gunGroup.rotation.z = gunDip * 0.38 + _swAng * 0.75 + _shoveAng * 0.28;
    var targetGunZ = -0.62 - _shoveAng * 0.18;
    W.gunGroup.position.z += (targetGunZ - W.gunGroup.position.z) * Math.min(1, dt * 14);

    if (ga.gunParts.flash) {
      if (ga.gunParts.flash.material.opacity > 0) {
        ga.gunParts.flash.material.opacity = Math.max(0, ga.gunParts.flash.material.opacity - dt * 9);
      }
      ga.gunParts.flash.visible = ga.gunParts.flash.material.opacity > 0;
    }
    W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt * 520);
    if (W.gunKey) W.gunKey.intensity = 1.6 + W.muzzleLight.intensity * 0.04;
    if (W.flashlight) {
      W.flashlight.visible = G.flashOn || W.muzzleLight.intensity > 2;
      W.flashlight.intensity = (G.flashOn ? 58 : 0) + W.muzzleLight.intensity * 0.85;
    }
    if (G.xhairKick > 0) G.xhairKick = Math.max(0, G.xhairKick - dt * 5.5);
    if (playing && FPS.ui) {
      if (FPS.ui.updateCrosshair) FPS.ui.updateCrosshair(G);
      if (FPS.ui.updateReloadBar) FPS.ui.updateReloadBar(now, G);
      if ((_frameNo % 3) === 0 && FPS.ui.updateHUD) FPS.ui.updateHUD();
    }

    W.renderer.render(W.scene, W.camera);
    _lastSceneCalls = W.renderer.info.render.calls;
    _lastSceneTris = W.renderer.info.render.triangles;
    W.gunCam.fov = W.camera.fov;
    if (W.gunCam.aspect !== W.camera.aspect) {
      W.gunCam.aspect = W.camera.aspect;
      W.gunCam.updateProjectionMatrix();
    }
    W.gunMuzzle.intensity = W.muzzleLight.intensity;
    W.gunMuzzle.position.set(
      W.gunGroup.position.x,
      W.gunGroup.position.y + 0.04,
      W.gunGroup.position.z + (ga.gunParts.muzzleZ || -0.45)
    );
    W.renderer.autoClear = false;
    W.renderer.clearDepth();
    W.renderer.render(W.gunScene, W.gunCam);
    _lastGunCalls = W.renderer.info.render.calls;
    _lastGunTris = W.renderer.info.render.triangles;
    W.renderer.autoClear = true;
  }

  FPS.perf = {
    getQualityMode: function () { return QMODE; },
    getQualityLevel: function () { return QLEVEL; },
    getDpr: getTargetDpr,
    setQualityMode: setQualityMode,
    applyQuality: applyQuality,
    getStats: function () {
      var wStats = (W.getPerfStats && W.getPerfStats()) || {};
      return {
        fps: window.__fpsAvg || 0,
        qMode: QMODE,
        qLevel: QLEVEL,
        dpr: getTargetDpr(),
        drawCalls: _lastSceneCalls + _lastGunCalls,
        sceneCalls: _lastSceneCalls,
        gunCalls: _lastGunCalls,
        triangles: _lastSceneTris + _lastGunTris,
        textures: wStats.textures !== undefined ? wStats.textures : (W.renderer && W.renderer.info && W.renderer.info.memory ? W.renderer.info.memory.textures : 0),
        geometries: wStats.geometries !== undefined ? wStats.geometries : (W.renderer && W.renderer.info && W.renderer.info.memory ? W.renderer.info.memory.geometries : 0)
      };
    }
  };

  FPS.game = {
    startLevel: startLevel,
    startCampaign: startCampaign,
    pauseGame: pauseGame,
    resumeGame: resumeGame,
    toMenu: toMenu,
    endGame: endGame,
    hurtPlayer: hurtPlayer,
    getQualityLevel: function () { return QLEVEL; },
    getSelectedLevel: function () { return selectedLevelId; }
  };

  function getTestState() {
    var barrels = W.explosiveBarrels || [];
    var liveBarrels = 0;
    for (var i = 0; i < barrels.length; i++) if (barrels[i].alive) liveBarrels++;
    var activeFireZones = 0;
    for (var j = 0; j < E.fireZones.length; j++) if (E.fireZones[j].active) activeFireZones++;
    var zAlive = 0;
    var specialsAlive = 0;
    for (var k = 0; k < E.zombies.length; k++) {
      var zk = E.zombies[k];
      if (!zk.dead) {
        zAlive++;
        if (zk.type === "spitter" || zk.type === "bloater" || zk.type === "stalker") specialsAlive++;
      }
    }
    var pointLights = 0;
    W.scene.traverse(function (o) { if (o.isPointLight) pointLights++; });
    W.gunScene.traverse(function (o) { if (o.isPointLight) pointLights++; });
    var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;
    var footY = Math.max(0, playerPos.y - 1.7);
    var curGroundY = W.groundY ? W.groundY(playerPos.x, playerPos.z, footY) : 0;
    return {
      state: G.state,
      level: G.levelIdx + 1,
      levelKills: G.levelKills,
      killQuota: G.killQuota,
      portalUnlocked: G.portalUnlocked,
      extractProg: +G.extractProg.toFixed(3),
      colliders: (W.colliders || []).length,
      barrels: liveBarrels,
      barrelsPopped: G.barrelsPopped,
      stamina: +G.stamina.toFixed(1),
      stamLocked: !!G.stamLocked,
      flareCd: +G.flareCd.toFixed(2),
      reloading: !!G.reloading,
      hp: G.hp,
      maxHp: G.maxHp,
      curWeapon: E.curWeapon,
      activeFireZones: activeFireZones,
      zombiesAlive: zAlive,
      specialsAlive: specialsAlive,
      bossSpawned: !!G.bossSpawned,
      bossSlain: !!G.bossSlain,
      pointLights: pointLights,
      drawCalls: _lastSceneCalls + _lastGunCalls,
      triangles: _lastSceneTris + _lastGunTris,
      textures: W.renderer && W.renderer.info && W.renderer.info.memory ? W.renderer.info.memory.textures : 0,
      playerPos: { x: +playerPos.x.toFixed(2), y: +playerPos.y.toFixed(2), z: +playerPos.z.toFixed(2) },
      groundY: +curGroundY.toFixed(3),
      scrap: G.scrap || 0,
      hsStreak: G.hsStreak || 0,
      hsMult: G.hsMult || 1,
      unlockedWeapons: Object.assign({}, G.unlockedWeapons || { pistol: true, thuanthien: true, shotgun: false, rifle: false }),
      weaponTiers: Object.assign({}, G.weaponTiers || { pistol: 1, shotgun: 1, rifle: 1, thuanthien: 1 }),
      directorPhase: G.directorPhase || "surge",
      panicT: +(G.panicT || 0).toFixed(2),
      carryingRelics: G.carryingRelics || 0,
      objState: buildObjState(levelDef)
    };
  }

  window.__fpsTest = {
    startLevel: function (n) { startLevel(n); return getTestState(); },
    getState: getTestState,
    grantScrap: function (n) {
      var val = Number(n);
      if (Number.isFinite(val) && val > 0) {
        G.scrap = Math.max(0, (G.scrap || 0) + val);
      } else {
        G.scrap = Math.max(0, Number.isFinite(G.scrap) ? G.scrap : 0);
      }
      if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      return getTestState();
    },
    triggerSpecial: function (type) {
      var z = E.spawnZombie(type || "spitter");
      if (z && z.group) {
        var gy = W.groundY ? W.groundY(z.group.position.x, z.group.position.z, 0) : 0;
        z.baseY = gy;
        z.spawnT = 0;
        z.group.position.y = gy;
      }
      return z;
    },
    interactNearest: function () {
      var tgt = queryInteractTarget();
      if (!tgt) return false;
      return executeInteract(tgt);
    },
    triggerShove: function () {
      return typeof E.shove === "function" ? E.shove() : false;
    },
    damageObjective: function (dmg) {
      var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;
      var obj = levelDef && levelDef.objective;
      var val = Number(dmg) || 0;
      if (!obj) return null;
      if (obj.type === "gate" && W.damageGate) {
        var gr = W.damageGate(val);
        G.objState = buildObjState(levelDef);
        return gr;
      }
      if (obj.type === "totems" && W.damageTotem) {
        var ts = W.totems || [];
        for (var i = 0; i < ts.length; i++) {
          if (ts[i].alive) W.damageTotem(i, val);
        }
        G.objState = buildObjState(levelDef);
        return G.objState;
      }
      if (obj.type === "holdout") {
        if (W.setFlareLit) W.setFlareLit(true);
        _holdLeft = 0;
        G.objProgress = 0;
        _holdoutDoneAnnounced = true;
        G.objState = buildObjState(levelDef);
        return G.objState;
      }
      if (obj.type === "generators" && val >= 9999 && W.setGeneratorState) {
        var gens = W.generators || [];
        for (var gi = 0; gi < gens.length; gi++) {
          if (!gens[gi].active) W.setGeneratorState(gi, true);
        }
        G.objState = buildObjState(levelDef);
        return G.objState;
      }
      if (obj.type === "relics" && val >= 9999 && W.pickupRelic) {
        var rls = W.relics || [];
        for (var ri = 0; ri < rls.length; ri++) {
          if (!rls[ri].collected && W.pickupRelic(ri)) G.carryingRelics++;
        }
        G.objState = buildObjState(levelDef);
        return G.objState;
      }
      return null;
    },
    teleportTo: function (x, y, z) {
      var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;
      var half = ((levelDef && levelDef.arena) || 80) * 0.5 - 0.6;
      var rawX = Number(x);
      var rawZ = Number(z);
      var nx = Number.isFinite(rawX) ? Math.max(-half, Math.min(half, rawX)) : playerPos.x;
      var nz = Number.isFinite(rawZ) ? Math.max(-half, Math.min(half, rawZ)) : playerPos.z;
      if (!Number.isFinite(nx)) nx = 0;
      if (!Number.isFinite(nz)) nz = 0;
      var rawY = (y !== undefined && y !== null) ? Number(y) : NaN;
      var yGuess = Number.isFinite(rawY) ? rawY : 1.7;
      var gy = W.groundY ? W.groundY(nx, nz, Math.max(0, yGuess - 1.7)) : 0;
      if (!Number.isFinite(gy)) gy = 0;
      var ny = Number.isFinite(rawY) ? Math.max(gy + 1.7, Math.min(gy + 25, rawY)) : (gy + 1.7);
      playerPos.set(nx, ny, nz);
      G.vy = 0;
      G.grounded = Math.abs((ny - 1.7) - gy) <= 0.18;
      W.camera.position.copy(playerPos);
      W.camera.updateMatrixWorld(true);
      if (FPS.ui) {
        if (FPS.ui.updateHUD) FPS.ui.updateHUD();
        if (FPS.ui.drawRadar) FPS.ui.drawRadar();
        if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
      }
      return getTestState();
    },
    shootBarrel: function (idx) {
      var barrels = W.explosiveBarrels || [];
      var target = (typeof idx === "number" && barrels[idx] && barrels[idx].alive) ? barrels[idx] : null;
      if (!target) {
        for (var i = 0; i < barrels.length; i++) {
          if (barrels[i].alive) { target = barrels[i]; break; }
        }
      }
      if (!target) return false;
      if (G.state !== "playing") startLevel(G.levelIdx + 1);
      if (FPS.WEAPONS[E.curWeapon] && FPS.WEAPONS[E.curWeapon].melee) E.switchWeapon("pistol");
      G.reloading = false;
      G.lastShot = 0;
      if (E.wState[E.curWeapon].mag <= 0) E.wState[E.curWeapon].mag = E.getWeaponStats ? E.getWeaponStats(E.curWeapon).mag : FPS.WEAPONS[E.curWeapon].mag;

      var by = target.y || 0;
      var aimY = by + 0.7;

      // Ensure unobstructed line-of-sight (no tall wall or zombie blocking barrel)
      function isLineClearOfZombies(fromP, toX, toZ) {
        var vx = toX - fromP.x, vz = toZ - fromP.z;
        var len = Math.hypot(vx, vz) || 1;
        var ux = vx / len, uz = vz / len;
        for (var zi = 0; zi < E.zombies.length; zi++) {
          var z = E.zombies[zi];
          if (z.dead) continue;
          var zx = z.group.position.x - fromP.x, zz = z.group.position.z - fromP.z;
          var proj = zx * ux + zz * uz;
          if (proj > 0 && proj < len) {
            var perp = Math.abs(zx * (-uz) + zz * ux);
            if (perp < z.hitR + 0.35) return false;
          }
        }
        return true;
      }
      var dx = target.x - playerPos.x;
      var dz = target.z - playerPos.z;
      var dist = Math.hypot(dx, dz) || 1;
      var dir = new THREE.Vector3(dx, aimY - playerPos.y, dz).normalize();
      var wallD = W.raycastWallDist ? W.raycastWallDist(playerPos, dir, dist) : dist;
      if (wallD < dist - 0.8 || dist > 28 || !isLineClearOfZombies(playerPos, target.x, target.z)) {
        var placed = false;
        var angles = [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI];
        for (var ai = 0; ai < angles.length && !placed; ai++) {
          var a = angles[ai];
          var cx = target.x + Math.cos(a) * 5.2;
          var cz = target.z + Math.sin(a) * 5.2;
          var testP = new THREE.Vector3(cx, by + 1.7, cz);
          var c = W.collide(testP, 0.55, false, by);
          if (!c || !c.hit) {
            var td = new THREE.Vector3(target.x - testP.x, aimY - testP.y, target.z - testP.z).normalize();
            var tdDist = Math.hypot(target.x - testP.x, target.z - testP.z);
            var wd = W.raycastWallDist ? W.raycastWallDist(testP, td, tdDist) : tdDist;
            if (wd >= tdDist - 0.8 && isLineClearOfZombies(testP, target.x, target.z)) {
              playerPos.copy(testP);
              placed = true;
            }
          }
        }
        dx = target.x - playerPos.x;
        dz = target.z - playerPos.z;
        dist = Math.hypot(dx, dz) || 1;
      }

      G.yaw = Math.atan2(-dx, -dz);
      G.pitch = Math.atan2(aimY - playerPos.y, dist);
      W.camera.position.copy(playerPos);
      W.camera.rotation.order = "YXZ";
      W.camera.rotation.y = G.yaw;
      W.camera.rotation.x = G.pitch;
      W.camera.updateMatrixWorld(true);
      E.shoot();
      return !target.alive || target.hp < 30;
    },
    completeQuota: function () {
      var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]);
      G.levelKills = Math.max(G.levelKills, G.killQuota);
      if (levelDef && levelDef.bossType) {
        G.bossSpawned = true;
        G.bossSlain = true;
        if (E.bossRef && !E.bossRef.dead) E.killZombie(E.bossRef);
      }
      if (isObjectiveComplete(levelDef)) {
        G.portalUnlocked = true;
        if (FPS.audio && FPS.audio.sfxPortalUnlock) FPS.audio.sfxPortalUnlock();
        if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("portalUnlocked"), FPS.t("portalSub"));
      }
      if (FPS.ui) {
        if (FPS.ui.updateHUD) FPS.ui.updateHUD();
        if (FPS.ui.drawRadar) FPS.ui.drawRadar();
        if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
      }
      return getTestState();
    },
    teleportToExtract: function () {
      var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]);
      if (!levelDef || !levelDef.extractPos) return getTestState();
      var ex = levelDef.extractPos;
      var exFootY = (ex.y !== undefined && ex.y !== null) ? ex.y : (W.groundY ? W.groundY(ex.x, ex.z, 0) : 0);
      playerPos.set(ex.x, exFootY + 1.7, ex.z);
      G.vy = 0;
      G.grounded = true;
      W.camera.position.copy(playerPos);
      W.camera.updateMatrixWorld(true);
      if (FPS.ui) {
        if (FPS.ui.updateHUD) FPS.ui.updateHUD();
        if (FPS.ui.drawRadar) FPS.ui.drawRadar();
        if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
      }
      return getTestState();
    },
    throwFlare: function () {
      return E.throwFlare();
    },
    getLoadState: function () {
      var ls = document.getElementById("loadScr");
      var mn = document.getElementById("menu");
      return {
        loadDone: !!window.__loadDone,
        state: G.state,
        loadScrHidden: !ls || ls.classList.contains("hidden"),
        menuHidden: !mn || mn.classList.contains("hidden")
      };
    }
  };

  window.addEventListener("blur", function () {
    resetInputs();
  });

  window.addEventListener("resize", function () {
    W.camera.aspect = innerWidth / innerHeight;
    W.camera.updateProjectionMatrix();
    if (W.gunCam) {
      W.gunCam.aspect = W.camera.aspect;
      W.gunCam.updateProjectionMatrix();
    }
    W.renderer.setPixelRatio(getTargetDpr());
    W.renderer.setSize(innerWidth, innerHeight);
    _lastIdleRender = 0;
  });

  var _animStarted = false;
  function startAnimLoop() {
    if (_animStarted) return;
    _animStarted = true;
    W.clock.getDelta();
    animate();
  }

  if (FPS.ui) {
    if (FPS.ui.applyLang) FPS.ui.applyLang();
    if (FPS.ui.updateHUD) FPS.ui.updateHUD();
  }
  applyQuality();
  refreshMenuUI();

  var _bootFinished = false;
  var _prewarmBegun = false;
  var _warmupBegun = false;
  var _loadSafetyTimer = null;

  function finishBoot() {
    if (_bootFinished) return;
    _bootFinished = true;
    if (_loadSafetyTimer) { clearTimeout(_loadSafetyTimer); _loadSafetyTimer = null; }
    var totRes = (FPS.ENV_KEYS ? FPS.ENV_KEYS.length : 22) + 11;
    updateLoadUI(100, FPS.t("warmupReady"), totRes + " / " + totRes + " " + FPS.t("loadDetailAssets") + " · " + FPS.t("loadDetailCompiled"));
    _lastIdleRender = 0;
    startAnimLoop();

    if (G.state === "loading") {
      G.state = "menu";
      var mn = document.getElementById("menu");
      if (mn) mn.classList.remove("hidden");
    }
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    refreshMenuUI();

    var ls = document.getElementById("loadScr");
    if (ls && !ls.classList.contains("hidden")) {
      ls.classList.add("loadFadeOut");
      setTimeout(function () {
        ls.classList.add("hidden");
        ls.classList.remove("loadFadeOut");
      }, 260);
    }
  }

  function handleLoadProgress(p) {
    if (!p) return;
    var pct = Math.min(76, Math.round((p.pct || 0) * 0.95));
    var detail = (p.loaded || 0) + " / " + (p.total || _initTot) + " " + FPS.t("loadDetailAssets");
    updateLoadUI(pct, p.label, detail);
  }

  function beginWarmup() {
    if (_warmupBegun) return;
    _warmupBegun = true;
    updateLoadUI(88, FPS.t("warmupShaders"), FPS.t("loadDetailShader"));
    if (typeof W.warmupGPU === "function") {
      W.warmupGPU(function (p) {
        if (!p) return;
        var wp = 88 + Math.round(Math.max(0, (p.pct || 80) - 80) * 0.6);
        updateLoadUI(Math.min(100, wp), p.label, FPS.t("loadDetailShader"));
      }, finishBoot);
    } else {
      window.__loadDone = true;
      finishBoot();
    }
  }

  function beginPrewarm() {
    if (_prewarmBegun) return;
    _prewarmBegun = true;
    updateLoadUI(76, FPS.t("loadStagePrewarm"), "0 / 18 " + FPS.t("loadDetailModels"));
    if (typeof E.prewarmZombiePool === "function") {
      E.prewarmZombiePool(function (done, tot) {
        updateLoadUI(
          76 + Math.round((done / Math.max(1, tot)) * 12),
          FPS.t("loadStagePrewarm"),
          done + " / " + tot + " " + FPS.t("loadDetailModels")
        );
      }, beginWarmup);
    } else {
      beginWarmup();
    }
  }

  var _initTot = (FPS.ENV_KEYS ? FPS.ENV_KEYS.length : 22) + 11;
  updateLoadUI(2, FPS.t("loadStageInit"), "0 / " + _initTot + " " + FPS.t("loadDetailAssets"));
  _loadSafetyTimer = setTimeout(function () {
    if (_bootFinished) return;
    if (!_prewarmBegun) {
      beginPrewarm();
      _loadSafetyTimer = setTimeout(function () {
        if (_bootFinished) return;
        if (!_warmupBegun) beginWarmup();
        else { window.__loadDone = true; finishBoot(); }
      }, 5000);
    } else if (!_warmupBegun) {
      beginWarmup();
      _loadSafetyTimer = setTimeout(function () {
        if (!_bootFinished) { window.__loadDone = true; finishBoot(); }
      }, 5000);
    } else {
      window.__loadDone = true;
      finishBoot();
    }
  }, 15000);

  W.loadAllGLBs(beginPrewarm, handleLoadProgress);
})();
