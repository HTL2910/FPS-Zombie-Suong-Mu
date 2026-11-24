"use strict";
window.FPS = window.FPS || {};

(function () {
  var W = FPS.world;
  var E = FPS.entities;

  var G = {
    state: "menu",
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
    notesFound: 0
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
  var QNAMES = ["CAO", "TRUNG", "THẤP"];

  function setTxt(id, val) {
    var el = document.getElementById(id);
    if (el && el.textContent !== val) el.textContent = val;
  }

  function hideAllOverlays() {
    ["menu", "storyScr", "pauseScr", "endScr", "levelClearScr"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  }

  function resetRunState() {
    E.clearZombies();
    E.clearFireZones();
    G.score = 0;
    G.totalKills = 0;
    savedKills = 0;
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
    E.resetWeapons(1);
    E.curWeapon = "pistol";
    E.buildGun("pistol");
  }

  function pickLevelZombieType(levelId) {
    var r = Math.random();
    if (levelId >= 4 && r < 0.22) return "brute";
    if (levelId >= 3 && r < 0.16) return "brute";
    if (levelId >= 2 && r < 0.48) return "runner";
    if (levelId === 1 && r < 0.25) return "runner";
    return "normal";
  }

  function startLevel(levelId) {
    var levels = FPS.LEVELS || [];
    if (!levels.length) return;
    var id = Math.max(1, Math.min(levels.length, Number(levelId) || 1));
    var levelDef = levels[id - 1];

    if (G.state === "menu" || G.state === "end" || G.state === "story") {
      resetRunState();
    } else {
      E.clearZombies();
      E.clearFireZones();
    }

    if (FPS.audio) {
      FPS.audio.init();
      FPS.audio.startAmbient();
    }

    W.loadLevel(levelDef);
    var sp = levelDef.playerSpawn || { x: 0, z: 0, yaw: 0 };
    playerPos.set(sp.x, 1.7, sp.z);
    W.collide(playerPos, 0.55, false);
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
    document.body.classList.add("playing");

    var initCount = Math.min(levelDef.maxAlive || 12, 4 + id);
    for (var i = 0; i < initCount; i++) {
      E.spawnZombie(pickLevelZombieType(id));
    }

    var lvTitle = FPS.LANG === "en" ? levelDef.nameEn : levelDef.nameVi;
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

  function hurtPlayer(dmg, fromX, fromZ) {
    if (G.state !== "playing") return;
    var now = performance.now();
    if (now < hurtCd) return;
    hurtCd = now + 350;

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
    if (FPS.audio && FPS.audio.sfxHurt) FPS.audio.sfxHurt();
    G.shake = Math.min(0.5, G.shake + 0.22);

    var vf = document.getElementById("vignette");
    if (vf) vf.style.opacity = Math.min(1, 1 - G.hp / G.maxHp + 0.35);
    var df = document.getElementById("dmgFlash");
    if (df) {
      df.style.transition = "none";
      df.style.opacity = 1;
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
    var show = G.state === "playing" && !document.body.classList.contains("touch") && !isLocked();
    h.classList.toggle("hidden", !show);
    var tx = plFallback ? FPS.t("lockHintFb") : FPS.t("lockHint");
    if (h.textContent !== tx) h.textContent = tx;
  }

  function lockPointer() {
    if (document.body.classList.contains("touch") || isLocked()) return;
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
    G.state = "paused";
    G.mouseDown = false;
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
    E.clearZombies();
    E.clearFireZones();
    G.state = "menu";
    G.mouseDown = false;
    G.reloading = false;
    document.body.classList.remove("playing");
    if (document.exitPointerLock) document.exitPointerLock();
    ["hud", "pauseScr", "endScr", "levelClearScr", "storyScr"].forEach(function (id) {
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
    winWasCampaign = !!win;
    G.state = "end";
    G.mouseDown = false;
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
  if (btnStart) btnStart.onclick = function () { startCampaign(selectedLevelId); };

  var btnStory = document.getElementById("btnStory");
  if (btnStory) {
    btnStory.onclick = function () {
      document.getElementById("menu").classList.add("hidden");
      document.getElementById("storyScr").classList.remove("hidden");
    };
  }
  var btnStoryGo = document.getElementById("btnStoryGo");
  if (btnStoryGo) {
    btnStoryGo.onclick = function () {
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
      FPSApi.saveProfile({ lang: "vi" });
    };
  }
  var langEn = document.getElementById("langEn");
  if (langEn) {
    langEn.onclick = function () {
      if (FPS.ui && FPS.ui.applyLang) FPS.ui.applyLang("en");
      else FPS.LANG = "en";
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

  function applyQuality() {
    var dpr = QLEVEL === 0 ? Math.min(devicePixelRatio || 1, 1.25) : (QLEVEL === 1 ? 1 : 0.8);
    W.renderer.setPixelRatio(dpr);
    E.setParticleMul(QLEVEL === 0 ? 1 : (QLEVEL === 1 ? 0.6 : 0.3));
    if (W.dustPts) W.dustPts.visible = QLEVEL < 2;
    if (W.rainPts) W.rainPts.visible = QLEVEL < 2;
    var txt = "Q: " + QMODE.toUpperCase() + " · " + QNAMES[QLEVEL];
    if (FPS.ui && FPS.ui.setQualityBadge) FPS.ui.setQualityBadge(txt);
    else setTxt("qBadge", txt);
  }
  function setQualityMode(m) {
    QMODE = m;
    QLEVEL = m === "high" ? 0 : (m === "low" ? 2 : 1);
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

  // Desktop Input
  document.addEventListener("keydown", function (e) {
    G.keys[e.code] = true;
    if (G.state === "playing") {
      if (e.code === "KeyR") E.startReload();
      if (e.code === "Digit1") E.switchWeapon("pistol");
      if (e.code === "Digit2") E.switchWeapon("shotgun");
      if (e.code === "Digit3") E.switchWeapon("rifle");
      if (e.code === "Digit4") E.switchWeapon("thuanthien");
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
  document.addEventListener("keyup", function (e) { G.keys[e.code] = false; });
  document.addEventListener("mousemove", function (e) {
    if ((isLocked() || plFallback) && G.state === "playing") {
      G.yaw -= e.movementX * 0.0021;
      G.pitch -= e.movementY * 0.0021;
      G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch));
    }
  });
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || G.state !== "playing" || e.target.closest("button, #flareChip")) return;
    if (!isLocked() && !document.body.classList.contains("touch")) {
      lockPointer();
      if (!plFallback) return;
    }
    G.mouseDown = true;
    E.shoot();
  });
  document.addEventListener("mouseup", function () { G.mouseDown = false; });
  document.addEventListener("pointerlockchange", function () {
    var nowLocked = isLocked();
    if (nowLocked) {
      plHeld = true;
      plFallback = false;
    } else {
      if (plHeld && G.state === "playing" && !document.body.classList.contains("touch")) {
        pauseGame();
      }
      plHeld = false;
    }
    updateLockHint();
  });

  // Mobile Touch Controls
  var joyVec = { x: 0, y: 0 };
  var lookTouch = null;
  var joyTouch = null;
  var joyEl = document.getElementById("joy");
  var knob = document.getElementById("joyKnob");
  if (("ontouchstart" in window) || navigator.maxTouchPoints > 0) document.body.classList.add("touch");

  function bindBtn(id, down, up) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", function (e) { e.preventDefault(); down(); }, { passive: false });
    if (up) el.addEventListener("touchend", function (e) { e.preventDefault(); up(); }, { passive: false });
  }
  bindBtn("btnFire", function () { G.mouseDown = true; E.shoot(); }, function () { G.mouseDown = false; });
  bindBtn("btnReload", function () { E.startReload(); });
  bindBtn("btnJump", function () { if (G.grounded && G.state === "playing") { G.vy = 5.4; G.grounded = false; } });
  bindBtn("btnWeapon", function () {
    var w = E.curWeapon;
    E.switchWeapon(w === "pistol" ? "shotgun" : (w === "shotgun" ? "rifle" : (w === "rifle" ? "thuanthien" : "pistol")));
  });
  bindBtn("btnFlash", function () {
    G.flashOn = !G.flashOn;
    if (W.flashlight) W.flashlight.visible = G.flashOn;
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  });
  bindBtn("btnFlare", function () { E.throwFlare(); });
  var bf = document.getElementById("btnFlare");
  if (bf) bf.addEventListener("click", function (e) { e.preventDefault(); E.throwFlare(); });
  var fc = document.getElementById("flareChip");
  if (fc) {
    fc.addEventListener("click", function () { E.throwFlare(); });
    fc.addEventListener("touchstart", function (e) { e.preventDefault(); E.throwFlare(); }, { passive: false });
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

  if (joyEl) {
    joyEl.addEventListener("touchstart", function (e) {
      e.preventDefault();
      joyTouch = e.changedTouches[0].identifier;
    }, { passive: false });
  }
  W.renderer.domElement.addEventListener("touchstart", function (e) {
    if (G.state !== "playing") return;
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
      if (lookTouch && tc.identifier === lookTouch.id) {
        G.yaw -= (tc.clientX - lookTouch.x) * 0.005;
        G.pitch -= (tc.clientY - lookTouch.y) * 0.005;
        G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch));
        lookTouch.x = tc.clientX;
        lookTouch.y = tc.clientY;
      }
    }
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var tc = e.changedTouches[i];
      if (tc.identifier === joyTouch) {
        joyTouch = null;
        joyVec.x = 0;
        joyVec.y = 0;
        if (knob) knob.style.transform = "translate(-50%,-50%)";
      }
      if (lookTouch && tc.identifier === lookTouch.id) lookTouch = null;
    }
  });

  // Main Loop
  var _fpsFrames = 0;
  var _fpsWin = performance.now();
  var _frameNo = 0;

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
      if (QMODE === "auto" && G.state === "playing") {
        if (fps < 42 && QLEVEL < 2) { QLEVEL++; applyQuality(); }
        else if (fps > 57 && QLEVEL > 0) { QLEVEL--; applyQuality(); }
      }
    }

    var rawDt = W.clock.getDelta();
    var dt = Math.min(rawDt, 0.05);
    var realDt = Math.min(rawDt, 0.25);
    var playing = G.state === "playing";
    var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]) || null;

    if (playing && levelDef) {
      G.time += realDt;

      // Player Movement + Stamina
      var wantRun = !!(G.keys.ShiftLeft || G.keys.ShiftRight);
      var fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
      var rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      var mx = 0, mz = 0;
      if (G.keys.KeyW) { mx += fx; mz += fz; }
      if (G.keys.KeyS) { mx -= fx; mz -= fz; }
      if (G.keys.KeyA) { mx -= rx; mz -= rz; }
      if (G.keys.KeyD) { mx += rx; mz += rz; }
      mx += rx * joyVec.x + fx * (-joyVec.y);
      mz += rz * joyVec.x + fz * (-joyVec.y);
      var ml = Math.hypot(mx, mz);

      var run = wantRun && ml > 0.01 && !G.stamLocked && G.stamina > 0;
      if (run) {
        G.stamina = Math.max(0, G.stamina - 28 * dt);
        if (G.stamina <= 0) {
          G.stamina = 0;
          G.stamLocked = true;
        }
      } else {
        G.stamina = Math.min(G.maxStamina, G.stamina + (ml > 0.01 ? 16 : 24) * dt);
        if (G.stamLocked && G.stamina > G.maxStamina * 0.15) G.stamLocked = false;
      }

      var spd = (run ? 7.4 : 4.4) * G.speedMul;
      if (ml > 0.01) {
        mx /= Math.max(1, ml);
        mz /= Math.max(1, ml);
        playerPos.x += mx * spd * dt;
        playerPos.z += mz * spd * dt;
        G.bobT += dt * (run ? 11 : 8);
      } else {
        G.bobT += dt * 2;
      }
      W.collide(playerPos, 0.55, false);

      G.vy -= 14 * dt;
      playerPos.y += G.vy * dt;
      if (playerPos.y <= 1.7) {
        playerPos.y = 1.7;
        G.vy = 0;
        G.grounded = true;
      }

      if (G.mouseDown && FPS.WEAPONS[E.curWeapon] && FPS.WEAPONS[E.curWeapon].auto) E.shoot();
      if (G.reloading && now >= G.reloadEnd) E.finishReload();
      if (G.flareCd > 0) G.flareCd = Math.max(0, G.flareCd - realDt);

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

      // Trickle Spawning
      var aliveCount = 0;
      for (var ai = 0; ai < E.zombies.length; ai++) {
        if (!E.zombies[ai].dead) aliveCount++;
      }
      var maxAllowed = G.portalUnlocked ? Math.max(4, Math.floor((levelDef.maxAlive || 12) * 0.45)) : (levelDef.maxAlive || 12);
      if (aliveCount < maxAllowed) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnTimer = G.portalUnlocked ? 2.5 : Math.max(0.65, 1.55 - levelDef.id * 0.14);
          E.spawnZombie(pickLevelZombieType(levelDef.id));
        }
      }

      // Portal Unlock Check
      var bossDone = !levelDef.bossType || (G.bossSpawned && G.bossSlain);
      if (!G.portalUnlocked && G.levelKills >= G.killQuota && bossDone) {
        G.portalUnlocked = true;
        if (FPS.audio && FPS.audio.sfxPortalUnlock) FPS.audio.sfxPortalUnlock();
        if (FPS.ui && FPS.ui.announce) FPS.ui.announce(FPS.t("portalUnlocked"), FPS.t("portalSub"));
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      }

      // Extraction Hold Check
      if (G.portalUnlocked && levelDef.extractPos) {
        var ex = levelDef.extractPos;
        var exDist = Math.hypot(playerPos.x - ex.x, playerPos.z - ex.z);
        if (exDist <= (ex.r || 4.0)) {
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
    E.updateEntities(dt, now, playing, _frameNo);
    if (W.updateWorldVisuals) {
      var exPct = levelDef && levelDef.extractHoldSec ? (G.extractProg / levelDef.extractHoldSec) : 0;
      W.updateWorldVisuals(dt, now, G.portalUnlocked, exPct);
    }

    if (playing && (_frameNo % 2) === 0 && FPS.ui) {
      if (FPS.ui.drawRadar) FPS.ui.drawRadar();
      if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
    }

    // Camera + Viewmodel Feel
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

    W.gunGroup.position.x = ga.gunBase.x + Math.sin(G.bobT) * 0.01 + swayX - _swAng * 0.26;
    W.gunGroup.position.y = ga.gunBase.y + Math.abs(Math.sin(G.bobT)) * 0.01 - totalDip + _swAng * 0.08;
    W.gunGroup.rotation.x = gunDip * 0.55 + swayY - _swAng * 1.15;
    W.gunGroup.rotation.y = swayX * 1.5 + _swAng * 0.65;
    W.gunGroup.rotation.z = gunDip * 0.38 + _swAng * 0.75;
    W.gunGroup.position.z += (-0.62 - W.gunGroup.position.z) * Math.min(1, dt * 14);

    if (ga.gunParts.flash && ga.gunParts.flash.material.opacity > 0) {
      ga.gunParts.flash.material.opacity = Math.max(0, ga.gunParts.flash.material.opacity - dt * 9);
    }
    W.muzzleLight.intensity = Math.max(0, W.muzzleLight.intensity - dt * 520);
    if (G.xhairKick > 0) G.xhairKick = Math.max(0, G.xhairKick - dt * 5.5);
    if (playing && FPS.ui) {
      if (FPS.ui.updateCrosshair) FPS.ui.updateCrosshair(G);
      if (FPS.ui.updateReloadBar) FPS.ui.updateReloadBar(now, G);
      if ((_frameNo % 3) === 0 && FPS.ui.updateHUD) FPS.ui.updateHUD();
    }

    W.renderer.render(W.scene, W.camera);
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
    W.renderer.autoClear = true;
  }

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
    for (var k = 0; k < E.zombies.length; k++) if (!E.zombies[k].dead) zAlive++;
    var pointLights = 0;
    W.scene.traverse(function (o) { if (o.isPointLight) pointLights++; });
    W.gunScene.traverse(function (o) { if (o.isPointLight) pointLights++; });
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
      bossSpawned: !!G.bossSpawned,
      bossSlain: !!G.bossSlain,
      pointLights: pointLights,
      playerPos: { x: +playerPos.x.toFixed(2), y: +playerPos.y.toFixed(2), z: +playerPos.z.toFixed(2) }
    };
  }

  window.__fpsTest = {
    startLevel: function (n) { startLevel(n); return getTestState(); },
    getState: getTestState,
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
      if (E.wState[E.curWeapon].mag <= 0) E.wState[E.curWeapon].mag = FPS.WEAPONS[E.curWeapon].mag;

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
      var dir = new THREE.Vector3(dx, 0.7 - playerPos.y, dz).normalize();
      var wallD = W.raycastWallDist ? W.raycastWallDist(playerPos, dir, dist) : dist;
      if (wallD < dist - 0.8 || dist > 28 || !isLineClearOfZombies(playerPos, target.x, target.z)) {
        var placed = false;
        var angles = [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI];
        for (var ai = 0; ai < angles.length && !placed; ai++) {
          var a = angles[ai];
          var cx = target.x + Math.cos(a) * 5.2;
          var cz = target.z + Math.sin(a) * 5.2;
          var testP = new THREE.Vector3(cx, 1.7, cz);
          var c = W.collide(testP, 0.55, false);
          if (!c || !c.hit) {
            var td = new THREE.Vector3(target.x - testP.x, 0.7 - testP.y, target.z - testP.z).normalize();
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
      G.pitch = Math.atan2(0.7 - playerPos.y, dist);
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
      G.portalUnlocked = true;
      if (FPS.audio && FPS.audio.sfxPortalUnlock) FPS.audio.sfxPortalUnlock();
      if (FPS.ui) {
        if (FPS.ui.announce) FPS.ui.announce(FPS.t("portalUnlocked"), FPS.t("portalSub"));
        if (FPS.ui.updateHUD) FPS.ui.updateHUD();
        if (FPS.ui.drawRadar) FPS.ui.drawRadar();
        if (FPS.ui.updateExtractMarker) FPS.ui.updateExtractMarker();
      }
      return getTestState();
    },
    teleportToExtract: function () {
      var levelDef = W.currentLevel || (FPS.LEVELS && FPS.LEVELS[G.levelIdx]);
      if (!levelDef || !levelDef.extractPos) return getTestState();
      playerPos.set(levelDef.extractPos.x, 1.7, levelDef.extractPos.z);
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
    }
  };

  window.addEventListener("blur", function () {
    G.keys = {};
    G.mouseDown = false;
  });

  window.addEventListener("resize", function () {
    W.camera.aspect = innerWidth / innerHeight;
    W.camera.updateProjectionMatrix();
    W.renderer.setSize(innerWidth, innerHeight);
  });

  if (FPS.ui) {
    if (FPS.ui.applyLang) FPS.ui.applyLang();
    if (FPS.ui.updateHUD) FPS.ui.updateHUD();
  }
  refreshMenuUI();
  W.loadAllGLBs(function () {
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  });
  animate();
})();
