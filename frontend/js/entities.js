"use strict";
window.FPS = window.FPS || {};

FPS.entities = (function () {
  var W = FPS.world;
  var _glowTexCache = null;
  function getGlowTex() {
    if (W && W.lampGlowTex) return W.lampGlowTex;
    if (_glowTexCache) return _glowTexCache;
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,220,160,1)");
    gr.addColorStop(0.35, "rgba(255,175,90,0.45)");
    gr.addColorStop(1, "rgba(255,150,60,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    _glowTexCache = new THREE.CanvasTexture(c);
    _glowTexCache.needsUpdate = true;
    return _glowTexCache;
  }

  function getG() { return FPS.state ? FPS.state.G : null; }
  function getP() { return FPS.state ? FPS.state.playerPos : null; }

  // Weapon state & v9.0 Armory/Anvil tier helpers (never mutate FPS.WEAPONS!)
  var wState = {};
  var curWeapon = "pistol";
  var _autoReloadTimer = null;
  function clearAutoReloadTimer() {
    if (_autoReloadTimer) {
      clearTimeout(_autoReloadTimer);
      _autoReloadTimer = null;
    }
  }
  function _hasOwn(obj, k) {
    return !!(obj && typeof k === "string" && Object.prototype.hasOwnProperty.call(obj, k));
  }
  function getWeaponTier(k) {
    var G = getG();
    return (G && G.weaponTiers && _hasOwn(G.weaponTiers, k) && G.weaponTiers[k]) ? G.weaponTiers[k] : 1;
  }
  function isWeaponUnlocked(k) {
    if (!_hasOwn(FPS.WEAPONS, k)) return false;
    var G = getG();
    if (G && G.unlockedWeapons) return _hasOwn(G.unlockedWeapons, k) && !!G.unlockedWeapons[k];
    return k === "pistol" || k === "thuanthien";
  }
  function getWeaponStats(k) {
    var base = _hasOwn(FPS.WEAPONS, k) ? FPS.WEAPONS[k] : null;
    if (!base) return null;
    var tier = getWeaponTier(k);
    var tMap = FPS.UPGRADES && FPS.UPGRADES.tiers;
    var tDef = (tMap && tMap[tier]) || { tier: 1, dmgMul: 1, magBonus: 0, rateMul: 1, fireAmmo: false };
    return {
      dmg: Math.round(base.dmg * (tDef.dmgMul || 1)),
      mag: base.melee ? base.mag : Math.round(base.mag * (1 + (tDef.magBonus || 0))),
      rate: base.rate / (tDef.rateMul || 1),
      fireAmmo: !!tDef.fireAmmo,
      tier: tier
    };
  }
  function resetWeapons(reserveMul) {
    clearAutoReloadTimer();
    var rm = reserveMul || 1;
    var WEAPONS = FPS.WEAPONS;
    wState = {
      pistol: { mag: getWeaponStats("pistol").mag, maxMag: getWeaponStats("pistol").mag, reserve: Infinity },
      shotgun: { mag: getWeaponStats("shotgun").mag, maxMag: getWeaponStats("shotgun").mag, reserve: Math.round(WEAPONS.shotgun.reserve * rm) },
      rifle: { mag: getWeaponStats("rifle").mag, maxMag: getWeaponStats("rifle").mag, reserve: Math.round(WEAPONS.rifle.reserve * rm) },
      thuanthien: { mag: WEAPONS.thuanthien.mag, maxMag: WEAPONS.thuanthien.mag, reserve: Infinity }
    };
  }
  function unlockWeapon(k) {
    var G = getG();
    var base = _hasOwn(FPS.WEAPONS, k) ? FPS.WEAPONS[k] : null;
    if (!G || !base) return false;
    if (!G.unlockedWeapons) G.unlockedWeapons = { pistol: true, thuanthien: true, shotgun: false, rifle: false };
    if (_hasOwn(G.unlockedWeapons, k) && G.unlockedWeapons[k]) return false;
    var cost = (FPS.UPGRADES && FPS.UPGRADES.unlockCosts && _hasOwn(FPS.UPGRADES.unlockCosts, k) && FPS.UPGRADES.unlockCosts[k] !== undefined)
      ? FPS.UPGRADES.unlockCosts[k] : 0;
    if ((G.scrap || 0) < cost) {
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryNeedScrap"), 1400);
      return false;
    }
    G.scrap -= cost;
    G.unlockedWeapons[k] = true;
    var st = wState[k];
    var ws = getWeaponStats(k);
    if (st && ws) {
      st.maxMag = ws.mag;
      st.mag = ws.mag;
      if (base.reserve !== Infinity) st.reserve = Math.round(base.reserve * (G.reserveMul || 1));
    }
    if (FPS.audio && FPS.audio.sfxArmoryBuy) FPS.audio.sfxArmoryBuy();
    if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryBought") + ": " + base.name, 1600);
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    return true;
  }
  function upgradeWeapon(k) {
    var G = getG();
    var base = _hasOwn(FPS.WEAPONS, k) ? FPS.WEAPONS[k] : null;
    if (!G || !base) return false;
    if (!isWeaponUnlocked(k)) {
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryNeedUnlock"), 1400);
      return false;
    }
    var curT = getWeaponTier(k);
    var maxT = (FPS.UPGRADES && FPS.UPGRADES.maxTier) || 3;
    if (curT >= maxT) {
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryMaxTier"), 1400);
      return false;
    }
    var nextT = curT + 1;
    var tMap = FPS.UPGRADES && FPS.UPGRADES.tiers;
    var nextDef = tMap && tMap[nextT];
    var cost = (nextDef && nextDef.cost) || 0;
    if ((G.scrap || 0) < cost) {
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("armoryNeedScrap"), 1400);
      return false;
    }
    G.scrap -= cost;
    if (!G.weaponTiers) G.weaponTiers = { pistol: 1, shotgun: 1, rifle: 1, thuanthien: 1 };
    G.weaponTiers[k] = nextT;
    var ws = getWeaponStats(k);
    if (wState[k] && ws) {
      wState[k].maxMag = ws.mag;
      wState[k].mag = ws.mag;
    }
    if (FPS.audio && FPS.audio.sfxAnvilUpgrade) FPS.audio.sfxAnvilUpgrade();
    if (FPS.ui && FPS.ui.showToast) {
      FPS.ui.showToast(FPS.t("armoryForged") + " " + base.name + " " + ((nextDef && nextDef.label) || ("Mk." + nextT)), 1600);
    }
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    return true;
  }
  resetWeapons(1);

  // Viewmodel
  var gunParts = {};
  var gunBase = { x: 0.34, y: -0.34 };
  var swordSwingT = 0;
  var switchT = 0;
  var shoveAnimT = 0;

  var gunMats = {
    body: new THREE.MeshLambertMaterial({ color: 0x1e2126 }),
    metal: new THREE.MeshLambertMaterial({ color: 0x3c4148 }),
    grip: new THREE.MeshLambertMaterial({ color: 0x4a3826 })
  };
  var swordGlowMat = new THREE.MeshBasicMaterial({
    map: getGlowTex(),
    color: 0xffd269,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var flashGeo = new THREE.PlaneGeometry(0.32, 0.32);

  function makeFlashMesh(zPos) {
    var fl = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({
        map: getGlowTex(),
        color: 0xffd98a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    fl.position.set(0, 0.03, zPos);
    fl.visible = false;
    return fl;
  }

  var _gunCache = {};

  function _disposeObjGeos(root) {
    if (!root || !root.traverse) return;
    root.traverse(function (o) {
      if (o.geometry && o.geometry !== flashGeo && !o.geometry.userData.sharedGeo) {
        o.geometry.dispose();
      }
    });
  }

  function _getGunBase(kind) {
    return kind === "thuanthien"
      ? { x: 0.30, y: -0.28 }
      : (kind === "pistol" ? { x: 0.34, y: -0.34 } : { x: 0.25, y: -0.245 });
  }

  function _createGunEntry(kind, useGLB) {
    var entryWrap = new THREE.Group();
    var swordGlow = null;
    var fl;
    var base = _getGunBase(kind);

    if (useGLB && W.GUN_T && _hasOwn(W.GUN_T, kind) && W.GUN_T[kind]) {
      var m = W.GUN_T[kind].clone(true);
      if (W.hardenGunObj) W.hardenGunObj(m);

      var bb = new THREE.Box3().setFromObject(m);
      var sz = new THREE.Vector3();
      bb.getSize(sz);
      var len = Math.max(sz.x, sz.y, sz.z) || 1;
      var target = kind === "thuanthien" ? 0.78 : (kind === "pistol" ? 0.36 : (kind === "shotgun" ? 0.70 : 0.74));
      m.scale.setScalar(target / len);

      var wrap = new THREE.Group();
      wrap.add(m);
      var bb2 = new THREE.Box3().setFromObject(wrap);
      var c = new THREE.Vector3();
      bb2.getCenter(c);
      m.position.set(-c.x, -c.y, -c.z);

      if (kind === "thuanthien") {
        // ZERO PointLights, ZERO floating dark BoxGeometry hand/sleeve blocks
        m.traverse(function (o) {
          if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          for (var i = 0; i < mats.length; i++) {
            var mt = mats[i];
            if (!mt) continue;
            if (typeof mt.metalness === "number" && mt.metalness > 0.4) mt.metalness = 0.35;
            if (mt.emissive) {
              mt.emissive.setHex(0x704e10);
              mt.emissiveIntensity = 0.45;
            }
          }
        });
        wrap.rotation.set(0.32, -0.55, -0.22);
        wrap.position.set(0.02, 0.12, -0.12);
        var glow = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.74), swordGlowMat);
        glow.position.set(0, 0.06, 0);
        wrap.add(glow);
        swordGlow = glow;
      } else {
        // Sleek unobstructed 3D GLB weapon viewmodel (zero placeholder BoxGeometry hand/sleeve blocks)
        wrap.rotation.y = -Math.PI / 2 + (kind === "pistol" ? 0.05 : 0.17);
        wrap.position.set(kind === "pistol" ? 0 : -0.05, kind === "pistol" ? 0.01 : 0.055, kind === "pistol" ? 0.04 : -0.15);
      }

      entryWrap.add(wrap);
      fl = makeFlashMesh(kind === "pistol" ? -0.24 : -0.55);
      entryWrap.add(fl);
    } else {
      function bx(w, h, d, x, y, z, mat) {
        var bm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || gunMats.body);
        bm.position.set(x, y, z);
        entryWrap.add(bm);
        return bm;
      }
      if (kind === "thuanthien") {
        bx(0.035, 0.62, 0.06, 0, 0.22, -0.15, new THREE.MeshLambertMaterial({ color: 0xefc45c }));
        bx(0.16, 0.04, 0.06, 0, -0.04, -0.08, gunMats.metal);
        var bGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.72), swordGlowMat);
        bGlow.position.set(0, 0.22, -0.15);
        entryWrap.add(bGlow);
        swordGlow = bGlow;
      } else if (kind === "pistol") {
        bx(0.075, 0.11, 0.3, 0, 0.03, -0.05);
        bx(0.06, 0.16, 0.09, 0, -0.09, 0.06, gunMats.grip);
      } else if (kind === "shotgun") {
        bx(0.085, 0.1, 0.52, 0, 0.02, -0.12);
        bx(0.06, 0.15, 0.09, 0, -0.09, 0.1, gunMats.grip);
      } else {
        bx(0.07, 0.1, 0.56, 0, 0.03, -0.12);
        bx(0.05, 0.2, 0.07, 0, -0.13, -0.02, gunMats.metal);
      }
      fl = makeFlashMesh(-0.35);
      entryWrap.add(fl);
    }

    return {
      wrap: entryWrap,
      gunBase: base,
      swordGlow: swordGlow,
      flash: fl,
      muzzleZ: fl.position.z,
      isGLB: !!(useGLB && W.GUN_T && _hasOwn(W.GUN_T, kind) && W.GUN_T[kind])
    };
  }

  function _cacheGun(kind, forceReplace) {
    var hasGLB = !!(W.GUN_T && _hasOwn(W.GUN_T, kind) && W.GUN_T[kind]);
    var old = _hasOwn(_gunCache, kind) ? _gunCache[kind] : null;
    if (old && !forceReplace && (!hasGLB || old.isGLB)) return old;
    if (old) {
      W.gunGroup.remove(old.wrap);
      if (!old.isGLB) _disposeObjGeos(old.wrap);
    }
    var entry = _createGunEntry(kind, hasGLB);
    entry.wrap.visible = (kind === curWeapon);
    W.gunGroup.add(entry.wrap);
    _gunCache[kind] = entry;
    return entry;
  }

  function buildGun(kind) {
    var entry = _cacheGun(kind, false);
    for (var k in _gunCache) {
      if (Object.prototype.hasOwnProperty.call(_gunCache, k)) {
        _gunCache[k].wrap.visible = (k === kind);
      }
    }
    gunBase = entry.gunBase;
    gunParts.pump = null;
    gunParts.swordGlow = entry.swordGlow;
    gunParts.flash = entry.flash;
    gunParts.muzzleZ = entry.muzzleZ;
    if (gunParts.flash) {
      gunParts.flash.material.opacity = 0;
      gunParts.flash.visible = false;
    }
  }

  function onGunLoaded(kind) {
    _cacheGun(kind, true);
    if (kind === curWeapon) {
      buildGun(kind);
    }
  }
  buildGun("pistol");

  // Pooled FX
  var tracers = [];
  var particles = [];
  var casingsLive = [];
  var boomRings = [];
  var tracerPool = [];
  var partPool = [];
  var casingPool = [];
  var dmgPool = [];
  var boomPool = [];

  var PART_MAX = 72;
  var CASING_MAX = 12;
  var DECAL_MAX = 128;
  var ACID_MAX = 8;
  var partGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  var casingGeo = new THREE.BoxGeometry(0.018, 0.018, 0.05);
  var boomRingGeo = new THREE.RingGeometry(0.65, 1.0, 28);
  var decalGeo = new THREE.PlaneGeometry(1.1, 1.1);
  var acidGeo = new THREE.CircleGeometry(1.0, 24);
  var _pMat4 = new THREE.Matrix4();
  var _zeroMat4 = new THREE.Matrix4().makeScale(0, 0, 0);
  var _pCol = new THREE.Color(0xffffff);
  var _dCol = new THREE.Color(0xffffff);
  var _flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  var _dPos = new THREE.Vector3();
  var _dScale = new THREE.Vector3();
  var _dMat4 = new THREE.Matrix4();
  var _partColorDirty = false;
  var _partMatDirty = false;
  var _cPos = new THREE.Vector3();
  var _cEuler = new THREE.Euler();
  var _cQuat = new THREE.Quaternion();
  var _cScale = new THREE.Vector3();
  var _cMat4 = new THREE.Matrix4();
  var _casingMatDirty = false;
  var _decalCursor = 0;
  var acidPools = [];

  var TRACER_MAX = 16;
  var _tracerPosArr = new Float32Array(TRACER_MAX * 6);
  var _tracerColArr = new Float32Array(TRACER_MAX * 6);
  var _tracerGeo = new THREE.BufferGeometry();
  _tracerGeo.setAttribute("position", new THREE.BufferAttribute(_tracerPosArr, 3));
  _tracerGeo.setAttribute("color", new THREE.BufferAttribute(_tracerColArr, 3));
  var _tracerMesh = new THREE.LineSegments(
    _tracerGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })
  );
  _tracerMesh.frustumCulled = false;
  _tracerMesh.visible = false;
  W.scene.add(_tracerMesh);
  for (var i = 0; i < TRACER_MAX; i++) {
    tracerPool.push({ idx: i, active: false, t: 0 });
  }
  var partInst = new THREE.InstancedMesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), PART_MAX);
  partInst.frustumCulled = false;
  partInst.visible = false;
  for (var i = 0; i < PART_MAX; i++) {
    partInst.setMatrixAt(i, _zeroMat4);
    partInst.setColorAt(i, _pCol);
    partPool.push({ idx: i, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
  }
  partInst.instanceMatrix.needsUpdate = true;
  if (partInst.instanceColor) partInst.instanceColor.needsUpdate = true;
  W.scene.add(partInst);
  var casingInst = new THREE.InstancedMesh(casingGeo, new THREE.MeshBasicMaterial({ color: 0xd8a83c }), CASING_MAX);
  casingInst.frustumCulled = false;
  casingInst.visible = false;
  for (var i = 0; i < CASING_MAX; i++) {
    casingInst.setMatrixAt(i, _zeroMat4);
    casingPool.push({
      idx: i, active: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      rotX: 0, rotZ: 0, rx: 0, rz: 0,
      scale: 1, t: 0
    });
  }
  casingInst.instanceMatrix.needsUpdate = true;
  W.scene.add(casingInst);

  var decalInst = new THREE.InstancedMesh(
    decalGeo,
    new THREE.MeshBasicMaterial({
      map: getGlowTex(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide
    }),
    DECAL_MAX
  );
  decalInst.frustumCulled = false;
  decalInst.visible = false;
  _dCol.setHex(0xffffff);
  for (var di0 = 0; di0 < DECAL_MAX; di0++) {
    decalInst.setMatrixAt(di0, _zeroMat4);
    decalInst.setColorAt(di0, _dCol);
  }
  decalInst.instanceMatrix.needsUpdate = true;
  if (decalInst.instanceColor) decalInst.instanceColor.needsUpdate = true;
  W.scene.add(decalInst);

  var acidInst = new THREE.InstancedMesh(
    acidGeo,
    new THREE.MeshBasicMaterial({
      map: getGlowTex(),
      color: 0x39ff14,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide
    }),
    ACID_MAX
  );
  acidInst.frustumCulled = false;
  acidInst.visible = false;
  for (var ai0 = 0; ai0 < ACID_MAX; ai0++) {
    acidInst.setMatrixAt(ai0, _zeroMat4);
    acidPools.push({
      idx: ai0,
      active: false,
      t: 0,
      dur: 5.0,
      tickT: 0.2,
      tick: 0.5,
      dps: 14,
      r: 2.4,
      x: 0,
      y: 0,
      z: 0
    });
  }
  acidInst.instanceMatrix.needsUpdate = true;
  W.scene.add(acidInst);

  function spawnDecal(x, y, z, colorHex, scale) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    var py = Number.isFinite(y) ? y : 0;
    var idx = _decalCursor;
    _decalCursor = (_decalCursor + 1) % DECAL_MAX;
    var sc = (Number.isFinite(scale) && scale > 0) ? scale : 1.0;
    _dPos.set(x, py + 0.025, z);
    _dScale.set(sc, sc, 1);
    _dMat4.compose(_dPos, _flatQuat, _dScale);
    decalInst.setMatrixAt(idx, _dMat4);
    var hex = (typeof colorHex === "number" && Number.isFinite(colorHex)) ? colorHex : 0x8a0303;
    _dCol.setHex(hex);
    decalInst.setColorAt(idx, _dCol);
    decalInst.instanceMatrix.needsUpdate = true;
    if (decalInst.instanceColor) decalInst.instanceColor.needsUpdate = true;
    decalInst.visible = true;
  }

  function clearDecals() {
    for (var i = 0; i < DECAL_MAX; i++) {
      decalInst.setMatrixAt(i, _zeroMat4);
    }
    decalInst.instanceMatrix.needsUpdate = true;
    decalInst.visible = false;
    _decalCursor = 0;
  }

  function spawnAcidPool(x, y, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    var zt = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.spitter) || {};
    var dur = zt.acidDur || 5.0;
    var rad = zt.acidRadius || 2.4;
    var dps = zt.acidDps || 14;
    var tick = zt.acidTick || 0.5;
    var py = Number.isFinite(y) ? y : (W.groundY ? W.groundY(x, z, 0) : 0);
    if (!Number.isFinite(py)) py = 0;

    var slot = null;
    var oldest = 1e9;
    for (var i = 0; i < acidPools.length; i++) {
      if (!acidPools[i].active) { slot = acidPools[i]; break; }
      if (acidPools[i].t < oldest) { oldest = acidPools[i].t; slot = acidPools[i]; }
    }
    if (!slot) return null;

    slot.active = true;
    slot.t = dur;
    slot.dur = dur;
    slot.tickT = 0.05;
    slot._lastMs = performance.now();
    slot.tick = tick;
    slot.dps = dps;
    slot.r = rad;
    slot.x = x;
    slot.y = py;
    slot.z = z;

    _dPos.set(x, py + 0.035, z);
    _dScale.set(rad, rad, 1);
    _dMat4.compose(_dPos, _flatQuat, _dScale);
    acidInst.setMatrixAt(slot.idx, _dMat4);
    acidInst.instanceMatrix.needsUpdate = true;
    acidInst.visible = true;
    spawnDecal(x, py, z, 0x39ff14, 1.5);
    return slot;
  }

  function clearAcidPools() {
    for (var i = 0; i < acidPools.length; i++) {
      acidPools[i].active = false;
      acidPools[i].t = 0;
      acidInst.setMatrixAt(acidPools[i].idx, _zeroMat4);
    }
    acidInst.instanceMatrix.needsUpdate = true;
    acidInst.visible = false;
  }

  function updateAcidPools(dt, now) {
    var playerPos = getP();
    var pFootY = playerPos ? Math.max(0, playerPos.y - 1.7) : 0;
    var anyActive = false;
    var matDirty = false;
    var hitNotified = false;
    var curMs = now || performance.now();
    for (var i = 0; i < acidPools.length; i++) {
      var p = acidPools[i];
      if (!p.active) continue;
      var stepSec = Math.min(0.8, Math.max(dt, (curMs - (p._lastMs || curMs)) / 1000));
      p._lastMs = curMs;
      p.t -= stepSec;
      if (p.t <= 0) {
        p.active = false;
        p.t = 0;
        acidInst.setMatrixAt(p.idx, _zeroMat4);
        matDirty = true;
        continue;
      }
      anyActive = true;
      var fade = Math.min(1, p.t / 0.8);
      var pulse = (0.94 + 0.06 * Math.sin(curMs * 0.01 + i)) * fade;
      _dPos.set(p.x, p.y + 0.035, p.z);
      _dScale.set(p.r * pulse, p.r * pulse, 1);
      _dMat4.compose(_dPos, _flatQuat, _dScale);
      acidInst.setMatrixAt(p.idx, _dMat4);
      matDirty = true;

      p.tickT -= stepSec;
      while (p.tickT <= 0) {
        p.tickT += p.tick;
        if (playerPos) {
          var dx = playerPos.x - p.x;
          var dz = playerPos.z - p.z;
          if (dx * dx + dz * dz <= p.r * p.r && Math.abs(pFootY - p.y) <= 1.35) {
            if (FPS.game && FPS.game.hurtPlayer) {
              FPS.game.hurtPlayer(p.dps * p.tick, p.x, p.z, true);
            }
            if (!hitNotified && FPS.ui && FPS.ui.showToast) {
              hitNotified = true;
              FPS.ui.showToast("☣ " + FPS.t("spAcidHit"), 900);
            }
          }
        }
      }
    }
    if (matDirty) acidInst.instanceMatrix.needsUpdate = true;
    acidInst.visible = anyActive;
  }

  for (var i = 0; i < 6; i++) {
    var bm = new THREE.Mesh(
      boomRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff8a2b,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    bm.rotation.x = -Math.PI / 2;
    bm.visible = false;
    W.scene.add(bm);
    boomPool.push({ m: bm, active: false, t: 0, dur: 0.42 });
  }
  for (var i = 0; i < 16; i++) {
    var d = document.createElement("div");
    d.className = "dmgnum";
    d.style.display = "none";
    document.body.appendChild(d);
    dmgPool.push({ el: d, t: 0, hidden: true, wp: new THREE.Vector3() });
  }

  var _tCol = new THREE.Color(0xffd98a);
  function addTracer(a, b, colorHex) {
    var rec = null;
    for (var i = 0; i < tracerPool.length; i++) {
      if (!tracerPool[i].active) { rec = tracerPool[i]; break; }
    }
    if (!rec) return;
    var base = rec.idx * 6;
    _tracerPosArr[base] = a.x; _tracerPosArr[base + 1] = a.y; _tracerPosArr[base + 2] = a.z;
    _tracerPosArr[base + 3] = b.x; _tracerPosArr[base + 4] = b.y; _tracerPosArr[base + 5] = b.z;
    _tCol.setHex(colorHex || 0xffd98a);
    _tracerColArr[base] = _tCol.r; _tracerColArr[base + 1] = _tCol.g; _tracerColArr[base + 2] = _tCol.b;
    _tracerColArr[base + 3] = _tCol.r; _tracerColArr[base + 4] = _tCol.g; _tracerColArr[base + 5] = _tCol.b;
    _tracerGeo.attributes.position.needsUpdate = true;
    _tracerGeo.attributes.color.needsUpdate = true;
    _tracerMesh.visible = true;
    rec.active = true;
    rec.t = 0.09;
    tracers.push(rec);
  }

  var particleMul = 1;
  function setParticleMul(v) { particleMul = v; }

  function burst(pos, color, n) {
    n = Math.max(1, Math.round(n * particleMul));
    _pCol.setHex(color);
    for (var i = 0; i < n; i++) {
      var rec = null;
      for (var k = 0; k < partPool.length; k++) {
        if (!partPool[k].active) { rec = partPool[k]; break; }
      }
      if (!rec) return;
      rec.active = true;
      rec.x = pos.x;
      rec.y = pos.y;
      rec.z = pos.z;
      rec.vx = (Math.random() - 0.5) * 3.6;
      rec.vy = Math.random() * 3.4;
      rec.vz = (Math.random() - 0.5) * 3.6;
      rec.t = 0.42 + Math.random() * 0.25;
      _pMat4.makeTranslation(rec.x, rec.y, rec.z);
      partInst.setMatrixAt(rec.idx, _pMat4);
      partInst.setColorAt(rec.idx, _pCol);
      _partMatDirty = true;
      _partColorDirty = true;
      partInst.visible = true;
      particles.push(rec);
    }
  }

  function spawnBoomRing(x, z, y) {
    var rec = null;
    for (var i = 0; i < boomPool.length; i++) {
      if (!boomPool[i].active) { rec = boomPool[i]; break; }
    }
    if (!rec) return;
    rec.active = true;
    rec.t = rec.dur;
    rec.m.position.set(x, (y || 0) + 0.08, z);
    rec.m.scale.setScalar(0.6);
    rec.m.material.opacity = 0.9;
    rec.m.visible = true;
    boomRings.push(rec);
  }

  function dmgNum(worldPos, amt, crit) {
    for (var i = 0; i < dmgPool.length; i++) {
      var p = dmgPool[i];
      if (p.t <= 0) {
        p.t = 0.7;
        p.wp.copy(worldPos);
        p.wp.x += (Math.random() - 0.5) * 0.4;
        p.el.textContent = Math.round(amt);
        p.el.className = "dmgnum" + (crit ? " crit" : "");
        p.el.style.display = "block";
        p.hidden = false;
        return;
      }
    }
  }

  function spawnCasing(big) {
    if (FPS.game && FPS.game.getQualityLevel && FPS.game.getQualityLevel() >= 2) return;
    var rec = null;
    for (var i = 0; i < casingPool.length; i++) {
      if (!casingPool[i].active) { rec = casingPool[i]; break; }
    }
    if (!rec) return;
    var G = getG();
    if (!G) return;
    rec.active = true;
    _cPos.copy(W.gunGroup.position);
    W.camera.localToWorld(_cPos);
    _cPos.y -= 0.05;
    rec.x = _cPos.x;
    rec.y = _cPos.y;
    rec.z = _cPos.z;
    rec.rotX = 0;
    rec.rotZ = 0;
    rec.scale = big ? 1.7 : 1;
    var _rxv = Math.cos(G.yaw), _rzv = -Math.sin(G.yaw);
    var _fxv = -Math.sin(G.yaw), _fzv = -Math.cos(G.yaw);
    var _rs = 1.1 + Math.random() * 0.7;
    rec.vx = _rxv * _rs - _fxv * 0.25;
    rec.vz = _rzv * _rs - _fzv * 0.25;
    rec.vy = 1.5 + Math.random() * 0.8;
    rec.rx = (Math.random() - 0.5) * 14;
    rec.rz = (Math.random() - 0.5) * 14;
    rec.t = 0.55;
    _cEuler.set(0, 0, 0);
    _cQuat.setFromEuler(_cEuler);
    _cScale.setScalar(rec.scale);
    _cMat4.compose(_cPos, _cQuat, _cScale);
    casingInst.setMatrixAt(rec.idx, _cMat4);
    _casingMatDirty = true;
    casingInst.visible = true;
    casingsLive.push(rec);
  }

  // Zombies (shared materials + HIT_FLASH_MAT, obstacle-steering AI)
  var zombies = [];
  var zombiePool = {};
  var _zCounter = 0;
  var bossRef = null;

  var raycaster = new THREE.Raycaster();
  var _sv1 = new THREE.Vector3();
  var _sv2 = new THREE.Vector3();
  var _sv3 = new THREE.Vector3();
  var _sv4 = new THREE.Vector3();
  var _sv5 = new THREE.Vector3();
  var _sv6 = new THREE.Vector3();
  var _sv7 = new THREE.Vector3();
  var _hitPt = new THREE.Vector3();
  var _burstV = new THREE.Vector3();
  var _svE = new THREE.Vector3();
  var _tmpDir = new THREE.Vector3();
  var _tmpV = new THREE.Vector3();

  function isBossType(type) {
    return type === "boss" || type === "orcking" || type === "minotaur";
  }

  var _specialMatCache = {};
  function _getSpecialMat(type, variant, srcMat, emissiveHex, opacity) {
    if (!srcMat) return srcMat;
    var key = type + "_" + variant + "_" + srcMat.uuid;
    if (_specialMatCache[key]) return _specialMatCache[key];
    var cloned = srcMat.clone();
    if (cloned.emissive && emissiveHex) {
      cloned.emissive.setHex(emissiveHex);
      cloned.emissiveIntensity = (type === "bloater") ? 0.65 : 0.55;
    }
    if (opacity !== undefined && opacity < 1.0) {
      cloned.transparent = true;
      cloned.opacity = opacity;
      cloned.depthWrite = false;
    }
    _specialMatCache[key] = cloned;
    return cloned;
  }

  function setStalkerOpacity(z, isPounce) {
    if (!z || z.type !== "stalker") return;
    for (var i = 0; i < z.meshes.length; i++) {
      var m = z.meshes[i];
      var targetMat = isPounce ? (m.userData.pounceMat || m.userData.origMat) : (m.userData.prowlMat || m.userData.origMat);
      if (targetMat) {
        m.userData.origMat = targetMat;
        if (!z._flashing) m.material = targetMat;
      }
    }
  }

  function zombieStats(type) {
    var G = getG();
    var lv = G ? (G.levelIdx || 0) : 0;
    var ZT = FPS.ZOMBIE_TYPES || {};
    var resolved = (type === "boss") ? "orcking" : type;
    var st = (_hasOwn(ZT, resolved) ? ZT[resolved] : null)
      || (_hasOwn(ZT, "normal") ? ZT.normal : null)
      || { rig: "zombie", hp: 62, spd: 2.25, dmg: 11, score: 100, scrap: 10, hitR: 0.56, scale: 1.0, special: null, emissiveHex: 0, opacity: 1.0, isBoss: false };
    var isB = isBossType(type) || !!st.isBoss;
    var hp = isB ? st.hp : Math.round(st.hp * (1 + lv * 0.18));
    var spd = (st.spd || st.speed || 2.25) * (1 + lv * 0.04) * (0.92 + Math.random() * 0.16);
    var sc = st.scale || (isB ? 2.2 : 1.0);
    return {
      hp: hp,
      speed: spd,
      dmg: st.dmg || 11,
      score: st.score || 100,
      scrap: st.scrap || 10,
      scale: sc,
      hitR: st.hitR || (0.56 * sc),
      rig: st.rig || "zombie",
      special: st.special || null,
      emissiveHex: st.emissiveHex || 0,
      opacity: st.opacity !== undefined ? st.opacity : 1.0,
      pounceOpacity: st.pounceOpacity || 0.85,
      isBoss: isB
    };
  }

  function playZombieAct(z, name, fade) {
    var M = z.model;
    if (!M) return;
    var a = M.acts[name];
    if (!a && name === "idle") a = M.acts.walk;
    if (!a) return;
    if (M.cur === name) {
      if ((name === "attack" || name === "hit") && a.time >= a.getClip().duration - 0.02) {
        a.reset();
        a.play();
      }
      return;
    }
    var fadeSec = fade !== undefined ? fade : 0.15;
    var old = M.acts[M.cur];
    if (old && old !== a && fadeSec > 0) old.fadeOut(fadeSec);
    else if (old && old !== a) old.stop();
    a.reset();
    a.setEffectiveWeight(1);
    if (fadeSec > 0) a.fadeIn(fadeSec);
    a.play();
    M.cur = name;
  }

  function zombieModelAnim(z, dt, dist, frameNo, pFwdX, pFwdZ, playerPos) {
    var M = z.model;
    if (!M) return;
    var G = getG();
    var lv = G ? (G.levelIdx || 0) : 0;
    if (!playerPos) playerPos = getP();
    var baseY = z.baseY || 0;

    var want;
    if (z.spawnT > 0) {
      z.spawnT -= dt;
      if (z.spawnT <= 0) {
        z.spawnT = 0;
        z.group.position.y = baseY;
      } else {
        var sr = Math.max(0, z.spawnT / 1.1);
        z.group.position.y = baseY - 1.8 * z.group.scale.y * sr * sr;
      }
      want = "idle";
    } else {
      z.group.position.y = baseY;
      if (z.atkT > 0) {
        z.atkT -= dt;
        want = "attack";
        if (!M.acts.attack && playerPos) {
          want = (z.type === "runner" && lv >= 2 && M.acts.sprint) ? "sprint" : "run";
          var _ldx = playerPos.x - z.group.position.x;
          var _ldz = playerPos.z - z.group.position.z;
          var _ld = Math.hypot(_ldx, _ldz) || 1;
          z.group.position.x += (_ldx / _ld) * dt * 1.4;
          z.group.position.z += (_ldz / _ld) * dt * 1.4;
          W.collide(z.group.position, 0.52 * z.group.scale.x, true, baseY);
        }
      } else if (z.hitT > 0) {
        z.hitT -= dt;
        want = "hit";
      } else if (dist > 1.3) {
        want = (z.type === "runner" || z.type === "stalker")
          ? (lv >= 2 && M.acts.sprint ? "sprint" : "run")
          : (z.walkName || "walk");
      } else {
        want = "idle";
      }
    }

    z._acc = (z._acc || 0) + dt;

    if (playerPos && pFwdX !== undefined && dist > 4.5) {
      var dot = (z.group.position.x - playerPos.x) * pFwdX + (z.group.position.z - playerPos.z) * pFwdZ;
      if (dot < -2.5) return;
    }
    if (dist > 32 && !z.isBoss) return;
    if (!z.isBoss) {
      if (dist >= 22) {
        if (((frameNo + z._id) & 3) !== 0) return;
      } else if (dist >= 12) {
        if (((frameNo + z._id) & 1) !== 0) return;
      }
    }

    var animDt = z._acc;
    z._acc = 0;
    playZombieAct(z, want, z.spawnT > 0 ? 0.2 : 0.14);
    M.mixer.update(animDt);
  }

  function setZombieFlash(z, on) {
    if (z._flashing === on) return;
    z._flashing = on;
    for (var i = 0; i < z.meshes.length; i++) {
      var m = z.meshes[i];
      m.material = on ? W.HIT_FLASH_MAT : m.userData.origMat;
    }
  }

  var ZBAR_MAX = 32;
  var _zBarBgGeo = new THREE.PlaneGeometry(0.85, 0.11);
  var _zBarFgGeo = new THREE.PlaneGeometry(0.8, 0.075);
  var _zBarBgMat = new THREE.MeshBasicMaterial({ color: 0x101010, side: THREE.DoubleSide, depthTest: false });
  var _zBarFgInstMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false });
  var _zBarBgInst = new THREE.InstancedMesh(_zBarBgGeo, _zBarBgMat, ZBAR_MAX);
  var _zBarFgInst = new THREE.InstancedMesh(_zBarFgGeo, _zBarFgInstMat, ZBAR_MAX);
  var _zBarNormCol = new THREE.Color(0x7ec850);
  var _zBarBossCol = new THREE.Color(0xff3020);
  var _zBarPos = new THREE.Vector3();
  var _zBarScale = new THREE.Vector3();
  var _zBarMat4 = new THREE.Matrix4();
  var _prevBarCount = 0;
  _zBarBgInst.frustumCulled = false;
  _zBarFgInst.frustumCulled = false;
  _zBarBgInst.renderOrder = 5;
  _zBarFgInst.renderOrder = 6;
  _zBarBgInst.visible = false;
  _zBarFgInst.visible = false;
  for (var zbi = 0; zbi < ZBAR_MAX; zbi++) {
    _zBarBgInst.setMatrixAt(zbi, _zeroMat4);
    _zBarFgInst.setMatrixAt(zbi, _zeroMat4);
    _zBarFgInst.setColorAt(zbi, _zBarNormCol);
  }
  _zBarBgInst.instanceMatrix.needsUpdate = true;
  _zBarFgInst.instanceMatrix.needsUpdate = true;
  if (_zBarFgInst.instanceColor) _zBarFgInst.instanceColor.needsUpdate = true;
  W.scene.add(_zBarBgInst);
  W.scene.add(_zBarFgInst);

  function makeZombie(type) {
    var _st = zombieStats(type);
    var isBoss = _st.isBoss;
    var sc = _st.scale;
    var id = _zCounter++;
    var key;
    if (type === "spitter") key = "skeleton";
    else if (type === "bloater") key = "troll";
    else if (type === "stalker") key = "ghost";
    else if (type === "runner") key = "skeleton";
    else if (type === "minotaur") key = "minotaur";
    else if (isBoss) key = "orcking";
    else if (type === "brute") {
      var _bk = ["golem", "troll", "minotaur"];
      key = _bk[id % _bk.length];
      if (!W.ZB_T[key]) key = "golem";
    } else {
      key = (id % 3 === 2) ? "ghost" : "zombie";
    }
    if (W.ZB_T && (!_hasOwn(W.ZB_T, key) || !W.ZB_T[key])) key = (_st.rig && _hasOwn(W.ZB_T, _st.rig) && W.ZB_T[_st.rig]) ? _st.rig : "zombie";

    var tpl = (W.ZB_T && ((_hasOwn(W.ZB_T, key) && W.ZB_T[key]) || W.ZB_T.zombie)) || null;
    var g = new THREE.Group();
    g.rotation.order = "YXZ";
    var meshes = [];
    var modelObj = null;
    var _wn = "walk";

    if (tpl) {
      var model = window.SkeletonUtils.clone(tpl.scene);
      model.scale.setScalar(tpl.unitScale);
      model.position.y = tpl.yOffset;
      var mixer = new THREE.AnimationMixer(model);
      var acts = {};
      function reg(nm, clip, loop) {
        if (!clip) return;
        var a = mixer.clipAction(clip);
        if (!loop) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        acts[nm] = a;
      }
      reg("idle", tpl.clips.idle, true);
      reg("walk", tpl.clips.walk, true);
      reg("run", tpl.clips.run || tpl.clips.walk, true);
      reg("attack", tpl.clips.attack, false);
      reg("hit", tpl.clips.hit, false);
      reg("walk2", tpl.clips.walk2, true);
      reg("walk3", tpl.clips.walk3, true);
      reg("sprint", tpl.clips.sprint, true);
      reg("special", tpl.clips.special, false);

      if (key === "zombie") {
        var _wp = [];
        ["walk", "walk2", "walk3"].forEach(function (n) { if (acts[n]) _wp.push(n); });
        if (_wp.length) _wn = _wp[Math.floor(Math.random() * _wp.length)];
      }
      model.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) {
          o.frustumCulled = false;
          if (type === "stalker") {
            var prowlMat = _getSpecialMat("stalker", "prowl", o.material, _st.emissiveHex, _st.opacity);
            var pounceMat = _getSpecialMat("stalker", "pounce", o.material, _st.emissiveHex, _st.pounceOpacity);
            o.userData.prowlMat = prowlMat;
            o.userData.pounceMat = pounceMat;
            o.userData.origMat = prowlMat;
            o.material = prowlMat;
          } else if (type === "spitter" || type === "bloater") {
            var spMat = _getSpecialMat(type, "base", o.material, _st.emissiveHex, _st.opacity);
            o.userData.origMat = spMat;
            o.material = spMat;
          } else {
            o.userData.origMat = o.material;
          }
          meshes.push(o);
        }
      });
      g.add(model);
      modelObj = { mixer: mixer, acts: acts, cur: "" };
    } else {
      var fbHex = _st.emissiveHex || (isBoss ? 0x8f2222 : 0x5d7350);
      var fbMat = new THREE.MeshLambertMaterial({
        color: fbHex,
        emissive: _st.emissiveHex || 0,
        emissiveIntensity: _st.emissiveHex ? 0.5 : 0,
        transparent: _st.opacity < 1.0,
        opacity: _st.opacity
      });
      var fb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), fbMat);
      fb.position.y = 0.9;
      fb.userData.origMat = fbMat;
      meshes.push(fb);
      g.add(fb);
    }

    var barG = { visible: false };
    var barFg = { scale: { x: 1 }, position: { x: 0 } };

    g.scale.setScalar(sc);
    W.scene.add(g);

    var z = {
      _id: id,
      type: type,
      key: key,
      modelKey: key,
      name: FPS.t(isBoss && type === "minotaur" ? "bossNameMino" : (isBoss ? "bossNameOrc" : "bossName")),
      isBoss: isBoss,
      special: _st.special,
      group: g,
      meshes: meshes,
      barG: barG,
      barFg: barFg,
      hp: _st.hp,
      maxHp: _st.hp,
      speed: _st.speed,
      dmg: _st.dmg,
      score: _st.score,
      scrap: _st.scrap,
      hitR: _st.hitR,
      baseY: 0,
      vy: 0,
      bashCd: 0,
      spitCd: 1.2,
      warnT: 0,
      pounceState: "prowl",
      pounceT: 0,
      pounceCd: 0,
      burnT: 0,
      burnTickT: 0,
      trapSlowT: 0,
      trapSlowMul: 1.0,
      dead: false,
      deathT: 0,
      flashT: 0,
      hitT: 0,
      atkT: 0,
      atkCd: 0,
      graceT: 0,
      roarT: isBoss ? 5.0 : 0,
      spawnT: 1.1,
      steerDir: (id % 2 === 0 ? 1 : -1),
      stallT: 0,
      steerBias: 0,
      lastTangX: 0,
      lastTangZ: 0,
      _acc: 0,
      _progX: 0,
      _progZ: 0,
      _progT: -1,
      _flashing: false,
      phase: Math.random() * 10,
      model: modelObj,
      walkName: _wn
    };
    if (modelObj) playZombieAct(z, "idle", 0);
    return z;
  }

  function resetZombie(z) {
    var st = zombieStats(z.type);
    var isBoss = st.isBoss;
    var sc = st.scale;
    z.isBoss = isBoss;
    z.name = FPS.t(isBoss && z.type === "minotaur" ? "bossNameMino" : (isBoss ? "bossNameOrc" : "bossName"));
    z.special = st.special;
    z.hitR = st.hitR;
    z.hp = st.hp;
    z.maxHp = st.hp;
    z.speed = st.speed;
    z.dmg = st.dmg;
    z.score = st.score;
    z.scrap = st.scrap;
    z.baseY = 0;
    z.vy = 0;
    z.bashCd = 0;
    z.spitCd = 1.2;
    z.warnT = 0;
    z.pounceState = "prowl";
    z.pounceT = 0;
    z.pounceCd = 0;
    z.burnT = 0;
    z.burnTickT = 0;
    z.trapSlowT = 0;
    z.trapSlowMul = 1.0;
    z.dead = false;
    z.deathT = 0;
    z.flashT = 0;
    z.hitT = 0;
    z.atkT = 0;
    z.atkCd = 0;
    z.graceT = 0;
    z.roarT = z.isBoss ? 5.0 : 0;
    z.spawnT = 1.1;
    z.stallT = 0;
    z.steerBias = 0;
    z.steerDir = (z._id % 2 === 0 ? 1 : -1);
    z.lastTangX = 0;
    z.lastTangZ = 0;
    z._acc = 0;
    z._progX = 0;
    z._progZ = 0;
    z._progT = -1;
    z.phase = Math.random() * 10;
    z._culled = false;
    for (var zmi = 0; zmi < z.meshes.length; zmi++) z.meshes[zmi].frustumCulled = false;
    if (z.type === "stalker") setStalkerOpacity(z, false);
    setZombieFlash(z, false);
    z.group.scale.setScalar(sc);
    z.group.rotation.set(0, 0, 0);
    z.group.position.set(0, 0, 0);
    z.group.visible = true;
    if (z.model) {
      z.model.mixer.stopAllAction();
      for (var k in z.model.acts) {
        z.model.acts[k].stop();
        z.model.acts[k].setEffectiveWeight(1);
      }
      z.model.cur = "";
      playZombieAct(z, "idle", 0);
      z.model.mixer.update(0);
    }
    z.barG.visible = false;
    z.barFg.scale.x = 1;
    z.barFg.position.x = 0;
    W.scene.add(z.group);
  }

  var _prewarmStarted = false;
  var _prewarmDone = false;
  var _prewarmCbs = [];
  var _prewarmProgCbs = [];
  var _PREWARM_TYPES = [
    "normal", "normal", "normal", "normal", "normal", "normal",
    "runner", "runner", "runner", "runner",
    "brute", "brute",
    "spitter", "spitter",
    "bloater", "bloater",
    "stalker", "stalker"
  ];

  function prewarmZombiePool(onProgress, onDone) {
    var total = _PREWARM_TYPES.length;
    if (_prewarmDone) {
      if (typeof onProgress === "function") {
        try { onProgress(total, total); } catch (e) {}
      }
      if (typeof onDone === "function") {
        try { onDone(); } catch (e) {}
      }
      return;
    }
    if (typeof onProgress === "function") _prewarmProgCbs.push(onProgress);
    if (typeof onDone === "function") _prewarmCbs.push(onDone);
    if (_prewarmStarted) return;
    _prewarmStarted = true;

    if (!W.ZB_T || !Object.keys(W.ZB_T).length) {
      _prewarmDone = true;
      for (var pi0 = 0; pi0 < _prewarmProgCbs.length; pi0++) {
        try { _prewarmProgCbs[pi0](total, total); } catch (e) {}
      }
      var cbs0 = _prewarmCbs.slice();
      _prewarmCbs.length = 0;
      _prewarmProgCbs.length = 0;
      for (var ci0 = 0; ci0 < cbs0.length; ci0++) {
        try { cbs0[ci0](); } catch (e) { console.error("prewarm onDone error", e); }
      }
      return;
    }

    var cursor = 0;
    function step() {
      var batchEnd = Math.min(total, cursor + 2);
      for (; cursor < batchEnd; cursor++) {
        var t = _PREWARM_TYPES[cursor];
        var pt = zombiePool[t] || (zombiePool[t] = []);
        if (pt.length < 14) {
          var z = makeZombie(t);
          W.scene.remove(z.group);
          z.barG.visible = false;
          pt.push(z);
        }
      }
      for (var pi = 0; pi < _prewarmProgCbs.length; pi++) {
        try { _prewarmProgCbs[pi](cursor, total); } catch (e) {}
      }
      if (cursor < total) {
        requestAnimationFrame(step);
      } else {
        _prewarmDone = true;
        var cbs = _prewarmCbs.slice();
        _prewarmCbs.length = 0;
        _prewarmProgCbs.length = 0;
        for (var ci = 0; ci < cbs.length; ci++) {
          try { cbs[ci](); } catch (e) { console.error("prewarm onDone error", e); }
        }
      }
    }
    requestAnimationFrame(step);
  }

  function pickSpawnPoint(playerPos) {
    var lv = W.currentLevel;
    var halfA = lv ? lv.arena / 2 : 30;
    var spawners = (lv && Array.isArray(lv.spawners) && lv.spawners.length) ? lv.spawners : null;
    if (spawners) {
      var valid = [];
      var farthest = spawners[0];
      var farDist = -1;
      for (var i = 0; i < spawners.length; i++) {
        var sp = spawners[i];
        var d = playerPos ? Math.hypot(sp.x - playerPos.x, sp.z - playerPos.z) : 20;
        if (d > farDist) { farDist = d; farthest = sp; }
        if (d >= 12) valid.push(sp);
      }
      var chosen = valid.length ? valid[Math.floor(Math.random() * valid.length)] : farthest;
      return {
        x: Math.max(-halfA + 2, Math.min(halfA - 2, chosen.x + (Math.random() - 0.5) * 2.2)),
        z: Math.max(-halfA + 2, Math.min(halfA - 2, chosen.z + (Math.random() - 0.5) * 2.2))
      };
    }
    var ang = Math.random() * Math.PI * 2;
    var dist = 16 + Math.random() * 8;
    var px = playerPos ? playerPos.x : 0;
    var pz = playerPos ? playerPos.z : 0;
    return {
      x: Math.max(-halfA + 3, Math.min(halfA - 3, px + Math.cos(ang) * dist)),
      z: Math.max(-halfA + 3, Math.min(halfA - 3, pz + Math.sin(ang) * dist))
    };
  }

  function spawnZombie(type) {
    var ZT = FPS.ZOMBIE_TYPES || {};
    var safeType = (type === "boss") ? "boss" : (_hasOwn(ZT, type) ? type : "normal");
    var _zp = _hasOwn(zombiePool, safeType) ? zombiePool[safeType] : null;
    var z = (_zp && _zp.length) ? _zp.pop() : null;
    if (z) resetZombie(z);
    else z = makeZombie(safeType);

    var playerPos = getP();
    var pt = pickSpawnPoint(playerPos);
    var gy = W.groundY ? W.groundY(pt.x, pt.z, 0) : 0;
    z.baseY = gy;
    z.vy = 0;
    z.group.position.set(pt.x, gy, pt.z);
    W.collide(z.group.position, 0.52 * z.group.scale.x, true, gy);
    gy = W.groundY ? W.groundY(z.group.position.x, z.group.position.z, gy) : gy;
    z.baseY = gy;
    z.group.position.y = gy - 1.8 * z.group.scale.y;
    z.spawnT = 1.1;

    _burstV.set(z.group.position.x, gy + 0.4, z.group.position.z);
    burst(_burstV, 0x5a4a33, 6);
    zombies.push(z);

    if (z.isBoss) {
      bossRef = z;
      if (FPS.audio && FPS.audio.sfxSting) FPS.audio.sfxSting();
      var bn = document.getElementById("bossName");
      if (bn) bn.textContent = FPS.t(z.type === "minotaur" ? "bossNameMino" : "bossNameOrc");
      var bw = document.getElementById("bossWrap");
      if (bw) bw.classList.remove("hidden");
    }
    return z;
  }

  function triggerBossRoar(z) {
    if (!z || z.dead) return;
    var G = getG();
    z.roarT = 10;
    if (G) G.shake = Math.min(0.6, (G.shake || 0) + 0.36);
    var df = document.getElementById("dmgFlash");
    if (df) {
      df.style.transition = "none";
      df.style.opacity = 0.52;
      setTimeout(function () {
        df.style.transition = "opacity .55s";
        df.style.opacity = 0;
      }, 50);
    }
    if (FPS.audio && FPS.audio.sfxBossRoar) FPS.audio.sfxBossRoar();
    else if (FPS.audio && FPS.audio.sfxGroan) FPS.audio.sfxGroan();
    if (z.model) playZombieAct(z, (z.model.acts.special && Math.random() < 0.5) ? "special" : "attack", 0.1);

    var gp = z.group.position;
    _burstV.set(gp.x, (gp.y || 0) + 0.7, gp.z);
    burst(_burstV, 0xff3b28, 12);

    var lv = W.currentLevel;
    var halfA = (lv ? lv.arena / 2 : 40) - 2.5;
    var aliveCount = 0;
    for (var ai = 0; ai < zombies.length; ai++) if (!zombies[ai].dead) aliveCount++;
    var cap = (lv ? lv.maxAlive : 16) + 8;

    if (aliveCount < cap) {
      for (var k = 0; k < 2; k++) {
        var rz = spawnZombie("runner");
        var ang = z.group.rotation.y + (k === 0 ? 1.15 : -1.15);
        var rx = Math.max(-halfA, Math.min(halfA, gp.x + Math.cos(ang) * 4.2));
        var rzp = Math.max(-halfA, Math.min(halfA, gp.z + Math.sin(ang) * 4.2));
        var rgy = W.groundY ? W.groundY(rx, rzp, z.baseY || 0) : 0;
        rz.baseY = rgy;
        rz.vy = 0;
        rz.group.position.set(rx, rgy, rzp);
        W.collide(rz.group.position, 0.52 * rz.group.scale.x, true, rgy);
        rgy = W.groundY ? W.groundY(rz.group.position.x, rz.group.position.z, rgy) : rgy;
        rz.baseY = rgy;
        rz.group.position.y = rgy - 1.8 * rz.group.scale.y * 0.45;
        rz.spawnT = 0.55;
        rz.graceT = 0.5;
        _burstV.set(rz.group.position.x, rgy + 0.3, rz.group.position.z);
        burst(_burstV, 0x5a4a33, 4);
      }
    }
    if (FPS.ui && FPS.ui.announce) FPS.ui.announce("", FPS.t("bossRoar"));
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  // Pickups (shared geometries)
  var pickups = [];
  var _pkBoxGeo = new THREE.BoxGeometry(0.5, 0.34, 0.38);
  var _pkMedCrossGeo = new THREE.BoxGeometry(0.24, 0.06, 0.08);
  var _pkAmmoTipGeo = new THREE.BoxGeometry(0.4, 0.1, 0.28);
  var medMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
  var medCross = new THREE.MeshBasicMaterial({ color: 0xd21f2c });
  var ammoMat = new THREE.MeshLambertMaterial({ color: 0x5a6136 });
  var ammoTip = new THREE.MeshBasicMaterial({ color: 0xd8b34a });

  function dropPickup(x, z, y) {
    var py = (y !== undefined && y !== null) ? y : (W.groundY ? W.groundY(x, z, 0) : 0);
    var kind = Math.random() < 0.45 ? "med" : "ammo";
    var g = new THREE.Group();
    if (kind === "med") {
      var b = new THREE.Mesh(_pkBoxGeo, medMat);
      b.position.y = 0.32;
      g.add(b);
      var c = new THREE.Mesh(_pkMedCrossGeo, medCross);
      c.position.y = 0.5;
      g.add(c);
    } else {
      var b2 = new THREE.Mesh(_pkBoxGeo, ammoMat);
      b2.position.y = 0.32;
      g.add(b2);
      var tip = new THREE.Mesh(_pkAmmoTipGeo, ammoTip);
      tip.position.y = 0.54;
      g.add(tip);
    }
    g.position.set(x, py, z);
    W.scene.add(g);
    pickups.push({ g: g, kind: kind, baseY: py, t: Math.random() * 5 });
  }

  // Incendiary Flare fireZones pool (ZERO PointLights, 4.5m scorch radius, 5.5s, 0.4s ticks)
  var fireZones = [];
  var glowTex = getGlowTex();
  var fireGlowMatBase = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xff6a1a,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var fireCoreMatBase = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffe066,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var fireRingMatBase = new THREE.MeshBasicMaterial({
    color: 0xff9c2a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  for (var fi = 0; fi < 4; fi++) {
    var fg = new THREE.Group();
    var fDisc = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 9.0), fireGlowMatBase.clone());
    fDisc.rotation.x = -Math.PI / 2;
    fDisc.position.y = 0.04;
    fg.add(fDisc);
    var fCore = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.0), fireCoreMatBase.clone());
    fCore.rotation.x = -Math.PI / 2;
    fCore.position.y = 0.05;
    fg.add(fCore);
    var fRing = new THREE.Mesh(new THREE.RingGeometry(4.05, 4.5, 28), fireRingMatBase.clone());
    fRing.rotation.x = -Math.PI / 2;
    fRing.position.y = 0.06;
    fg.add(fRing);
    fg.visible = false;
    W.scene.add(fg);
    fireZones.push({
      g: fg,
      disc: fDisc,
      core: fCore,
      ring: fRing,
      active: false,
      t: 0,
      tickT: 0,
      sparkT: 0,
      x: 0,
      y: 0,
      z: 0,
      r: 4.5
    });
  }

  function clearFireZones() {
    for (var i = 0; i < fireZones.length; i++) {
      fireZones[i].active = false;
      fireZones[i].t = 0;
      fireZones[i].g.visible = false;
    }
  }

  function throwFlare() {
    var G = getG();
    var playerPos = getP();
    if (!G || !playerPos || G.state !== "playing" || G.armoryOpen || G.flareCd > 0) return false;
    G.flareCd = 12 * (G.flareCdMul || 1);

    var footY = Math.max(0, playerPos.y - 1.7);
    var fx = -Math.sin(G.yaw);
    var fz = -Math.cos(G.yaw);
    var tmp = _sv1.set(playerPos.x, playerPos.y, playerPos.z);
    for (var step = 0; step < 10; step++) {
      tmp.x += fx * 0.8;
      tmp.z += fz * 0.8;
      var col = W.collide(tmp, 0.4, false, footY);
      if (col && col.hit) break;
    }
    var halfA = (W.currentLevel ? W.currentLevel.arena / 2 : 30) - 2.2;
    var tx = Math.max(-halfA, Math.min(halfA, tmp.x));
    var tz = Math.max(-halfA, Math.min(halfA, tmp.z));
    var ty = W.groundY ? W.groundY(tx, tz, footY) : 0;

    addTracer(_sv2.set(playerPos.x + fx * 0.5, playerPos.y - 0.15, playerPos.z + fz * 0.5), _sv3.set(tx, ty + 0.2, tz));
    burst(_sv3, 0xff8c2a, 10);

    var zone = null;
    var oldest = 1e9;
    for (var i = 0; i < fireZones.length; i++) {
      if (!fireZones[i].active) { zone = fireZones[i]; break; }
      if (fireZones[i].t < oldest) { oldest = fireZones[i].t; zone = fireZones[i]; }
    }
    if (zone) {
      zone.active = true;
      zone.t = 5.5;
      zone.tickT = 0.05;
      zone.sparkT = 0;
      zone.x = tx;
      zone.y = ty;
      zone.z = tz;
      zone.g.position.set(tx, ty, tz);
      zone.g.visible = true;
      zone.disc.material.opacity = 0.75;
      zone.core.material.opacity = 0.65;
      zone.ring.material.opacity = 0.85;
      zone.ring.scale.setScalar(1);
    }
    if (FPS.audio && FPS.audio.playNoise) FPS.audio.playNoise(0.24, 1400, 0.45, "bandpass");
    if (FPS.audio && FPS.audio.playTone) FPS.audio.playTone(320, 0.22, 0.25, "sawtooth", 110);
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    return true;
  }

  function updateFireZones(dt, now) {
    var G = getG();
    var dmgMul = G ? (G.dmgMul || 1) : 1;
    for (var i = 0; i < fireZones.length; i++) {
      var z = fireZones[i];
      if (!z.active) continue;
      z.t -= dt;
      if (z.t <= 0) {
        z.active = false;
        z.g.visible = false;
        continue;
      }
      var fade = Math.min(1, z.t / 0.8);
      var pulse = 0.85 + 0.15 * Math.sin(now * 0.012 + i);
      z.disc.material.opacity = 0.72 * fade * pulse;
      z.core.material.opacity = 0.62 * fade;
      z.ring.material.opacity = 0.85 * fade;
      z.ring.scale.setScalar(0.96 + 0.05 * Math.sin(now * 0.01 + i));

      z.sparkT -= dt;
      if (z.sparkT <= 0) {
        z.sparkT = 0.18;
        var a = Math.random() * Math.PI * 2;
        var rad = Math.random() * z.r * 0.75;
        _burstV.set(z.x + Math.cos(a) * rad, (z.y || 0) + 0.25, z.z + Math.sin(a) * rad);
        burst(_burstV, 0xff7b22, 2);
      }

      z.tickT -= dt;
      while (z.tickT <= 0) {
        z.tickT += 0.4;
        for (var zi = zombies.length - 1; zi >= 0; zi--) {
          var zb = zombies[zi];
          if (zb.dead) continue;
          var gp = zb.group.position;
          if (Math.abs((gp.y || 0) - (z.y || 0)) > 1.8) continue;
          var rx = gp.x - z.x, rz = gp.z - z.z;
          var rr = z.r + zb.hitR * 0.35;
          if (rx * rx + rz * rz <= rr * rr) {
            var pt = _hitPt.set(gp.x, (gp.y || 0) + 1.1 * zb.group.scale.y, gp.z);
            damageZombie(zb, 28 * dmgMul, false, pt);
            burst(pt, 0xff8c2a, 3);
          }
        }
        // Detonate live explosive barrels touched by fire zone
        var barrels = W.explosiveBarrels || [];
        for (var bi = 0; bi < barrels.length; bi++) {
          var b = barrels[bi];
          if (!b || !b.alive) continue;
          if (Math.abs((b.y || 0) - (z.y || 0)) > 1.8) continue;
          var bx = b.x - z.x, bz = b.z - z.z;
          var brr = z.r + (b.r || 0.58);
          if (bx * bx + bz * bz <= brr * brr) {
            b.hp -= 35;
            if (b.hp <= 0) explodeBarrel(b);
          }
        }
      }
    }
  }

  // Explosive barrels + chain detonation
  function explodeBarrel(barrel) {
    if (!barrel || !barrel.alive) return;
    barrel.alive = false;
    var by = barrel.y || 0;
    var G = getG();
    var playerPos = getP();
    if (G) {
      G.barrelsPopped = (G.barrelsPopped || 0) + 1;
      G.shake = Math.min(0.85, (G.shake || 0) + 0.52);
    }
    if (W.detonateBarrelVisual) W.detonateBarrelVisual(barrel);
    if (FPS.audio && FPS.audio.sfxExplosion) FPS.audio.sfxExplosion();

    _burstV.set(barrel.x, by + 0.75, barrel.z);
    burst(_burstV, 0xff5a18, 18);
    _burstV.set(barrel.x, by + 1.15, barrel.z);
    burst(_burstV, 0xffd84d, 10);
    spawnBoomRing(barrel.x, barrel.z, by);
    spawnDecal(barrel.x, by, barrel.z, 0x2a1408, 1.9);

    var baseDmg = 240 * (G ? (G.dmgMul || 1) : 1);
    for (var zi = zombies.length - 1; zi >= 0; zi--) {
      var zb = zombies[zi];
      if (!zb || zb.dead) continue;
      var zp = zb.group.position;
      var zx = zp.x - barrel.x, zz = zp.z - barrel.z, zy = (zp.y || 0) - by;
      var dist2 = zx * zx + zz * zz + zy * zy;
      if (dist2 <= 64.0) {
        var bBlockedZ = false;
        if (W.raycastWallDist) {
          var bOrigZ = _sv5.set(barrel.x, by + 0.7, barrel.z);
          var zHitY = (zp.y || 0) + Math.min(1.0, 0.85 * zb.group.scale.y);
          var bToZ = _sv6.set(zp.x - barrel.x, zHitY - (by + 0.7), zp.z - barrel.z);
          var bLenZ = bToZ.length();
          if (bLenZ > 0.05) {
            bToZ.divideScalar(bLenZ);
            if (W.raycastWallDist(bOrigZ, bToZ, bLenZ) < bLenZ - 0.45) bBlockedZ = true;
          }
        }
        if (bBlockedZ) continue;
        var dist = Math.sqrt(dist2);
        var falloff = Math.max(0.25, 1 - (dist / 8.0) * 0.75);
        var pt = _hitPt.set(zp.x, (zp.y || 0) + 1.1 * zb.group.scale.y, zp.z);
        damageZombie(zb, baseDmg * falloff, dist < 2.2, pt, { fromBarrel: true });
      }
    }

    if (W.gate && W.gate.alive && Math.hypot(W.gate.x - barrel.x, W.gate.z - barrel.z) <= 7.5) {
      var grb = W.damageGate ? W.damageGate(baseDmg * 0.75) : null;
      if (grb && grb.destroyed && G) {
        G.scrap = (G.scrap || 0) + ((FPS.SCRAP && FPS.SCRAP.gateBonus) || 30);
        if (FPS.audio && FPS.audio.sfxBarricadeBreak) FPS.audio.sfxBarricadeBreak();
        if (FPS.ui && FPS.ui.announce) FPS.ui.announce("", FPS.t("objGateBroken"));
      }
    }
    var totemsB = W.totems || [];
    for (var tbi = 0; tbi < totemsB.length; tbi++) {
      var tb = totemsB[tbi];
      if (tb && tb.alive && Math.hypot(tb.x - barrel.x, tb.z - barrel.z) <= 7.5 && Math.abs((tb.y || 0) - by) <= 2.5) {
        if (W.damageTotem) W.damageTotem(tbi, baseDmg * 0.65);
      }
    }
    var barsB = W.barricades || [];
    for (var bbi = 0; bbi < barsB.length; bbi++) {
      var bb = barsB[bbi];
      if (bb && bb.alive && Math.hypot(bb.x - barrel.x, bb.z - barrel.z) <= 6.5 && Math.abs((bb.y || 0) - by) <= 2.5) {
        if (W.damageBarricade) W.damageBarricade(bbi, baseDmg * 0.65);
      }
    }

    if (playerPos && FPS.game && FPS.game.hurtPlayer) {
      var pFootY = Math.max(0, playerPos.y - 1.7);
      var pdx = playerPos.x - barrel.x, pdz = playerPos.z - barrel.z;
      var pd2 = pdx * pdx + pdz * pdz;
      if (pd2 < 6.25 && Math.abs(pFootY - by) <= 2.0) {
        var bBlocked = false;
        if (W.raycastWallDist) {
          var bOrig = _sv5.set(barrel.x, by + 0.7, barrel.z);
          var bToP = _sv6.set(playerPos.x - barrel.x, (playerPos.y - 0.5) - (by + 0.7), playerPos.z - barrel.z);
          var bLen = bToP.length();
          if (bLen > 0.05) {
            bToP.divideScalar(bLen);
            if (W.raycastWallDist(bOrig, bToP, bLen) < bLen - 0.15) bBlocked = true;
          }
        }
        if (!bBlocked) {
          var pDist = Math.sqrt(pd2);
          var selfDmg = Math.round(6 + 16 * (1 - pDist / 2.5));
          FPS.game.hurtPlayer(selfDmg, barrel.x, barrel.z);
        }
      }
    }

    // Chain explosions (110ms) to live barrels within 7.5m
    var lvId = W.currentLevel ? W.currentLevel.id : 0;
    var barrels = W.explosiveBarrels || [];
    for (var bi = 0; bi < barrels.length; bi++) {
      var other = barrels[bi];
      if (other !== barrel && other.alive) {
        var ox = other.x - barrel.x, oz = other.z - barrel.z, oy = (other.y || 0) - by;
        if (ox * ox + oz * oz + oy * oy <= 56.25) {
          (function (nb, expectedLv) {
            setTimeout(function () {
              var curG = getG();
              if (curG && curG.state === "playing" && nb.alive && W.currentLevel && W.currentLevel.id === expectedLv) {
                explodeBarrel(nb);
              }
            }, 110);
          })(other, lvId);
        }
      }
    }

    if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast("🛢 " + FPS.t("barrelBoom"), 1800);
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  // Ray vs active explosive barrels (vertical cylinder r = (b.r||0.58)*1.12, y in [by..by+1.42])
  function raycastBarrels(origin, dir, maxDist) {
    var barrels = W.explosiveBarrels || [];
    var bestBarrel = null;
    var bestDist = maxDist;
    var a = dir.x * dir.x + dir.z * dir.z;

    for (var i = 0; i < barrels.length; i++) {
      var b = barrels[i];
      if (!b || !b.alive) continue;
      var by = b.y || 0;
      var R = (b.r || 0.58) * 1.12;
      var ocx = origin.x - b.x;
      var ocz = origin.z - b.z;
      if (a > 1e-6) {
        var halfB = ocx * dir.x + ocz * dir.z;
        var c = ocx * ocx + ocz * ocz - R * R;
        var disc = halfB * halfB - a * c;
        if (disc >= 0) {
          var tCyl = (-halfB - Math.sqrt(disc)) / a;
          if (tCyl > 0 && tCyl < bestDist) {
            var hy = origin.y + dir.y * tCyl;
            if (hy >= by - 0.05 && hy <= by + 1.42) {
              bestDist = tCyl;
              bestBarrel = b;
            }
          }
        }
      }
      if (dir.y < -0.04) {
        var tCap = (by + 1.38 - origin.y) / dir.y;
        if (tCap > 0 && tCap < bestDist) {
          var hx = origin.x + dir.x * tCap - b.x;
          var hz = origin.z + dir.z * tCap - b.z;
          if (hx * hx + hz * hz <= R * R) {
            bestDist = tCap;
            bestBarrel = b;
          }
        }
      }
    }
    return bestBarrel ? { barrel: bestBarrel, dist: bestDist } : null;
  }

  function applyWorldTargetHit(tgtHit, dmg) {
    if (!tgtHit) return;
    var G = getG();
    if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(false);
    if (tgtHit.kind === "gate" && W.damageGate) {
      var gr = W.damageGate(dmg);
      if (gr && gr.destroyed) {
        if (G) G.scrap = (G.scrap || 0) + ((FPS.SCRAP && FPS.SCRAP.gateBonus) || 30);
        if (FPS.audio && FPS.audio.sfxBarricadeBreak) FPS.audio.sfxBarricadeBreak();
        if (FPS.ui && FPS.ui.announce) FPS.ui.announce("", FPS.t("objGateBroken"));
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      } else if (FPS.audio && FPS.audio.sfxBarricadeHit) {
        FPS.audio.sfxBarricadeHit();
      }
    } else if (tgtHit.kind === "totem" && W.damageTotem) {
      var tr = W.damageTotem(tgtHit.idx, dmg);
      if (tr && tr.destroyed) {
        if (G) G.scrap = (G.scrap || 0) + ((FPS.SCRAP && FPS.SCRAP.totemBonus) || 45);
        if (FPS.audio && FPS.audio.sfxTotemBreak) FPS.audio.sfxTotemBreak();
        var anyAlive = false;
        var ts = W.totems || [];
        for (var ti = 0; ti < ts.length; ti++) if (ts[ti].alive) { anyAlive = true; break; }
        if (FPS.ui && FPS.ui.announce) {
          FPS.ui.announce("", FPS.t(anyAlive ? "objTotemBroken" : "objTotemAllBroken"));
        }
        if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      }
    } else if (tgtHit.kind === "barricade" && W.damageBarricade) {
      var br = W.damageBarricade(tgtHit.idx, dmg);
      if (br && br.destroyed) {
        if (FPS.audio && FPS.audio.sfxBarricadeBreak) FPS.audio.sfxBarricadeBreak();
        if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("barricadeBroken"), 1600);
      } else if (FPS.audio && FPS.audio.sfxBarricadeHit) {
        FPS.audio.sfxBarricadeHit();
      }
    }
  }

  function shoot() {
    var G = getG();
    if (!G || G.state !== "playing" || G.reloading || G.armoryOpen) return;
    var now = performance.now();
    var WDef = FPS.WEAPONS[curWeapon];
    var wStats = getWeaponStats(curWeapon);
    var st = wState[curWeapon];
    if (now - G.lastShot < wStats.rate / (G.rateMul || 1)) return;

    if (WDef.melee) {
      G.lastShot = now;
      swordSwingT = 0.32;
      if (FPS.audio && FPS.audio.sfxShoot) FPS.audio.sfxShoot("thuanthien");
      G.xhairKick = Math.min(0.65, (G.xhairKick || 0) + 0.35);
      W.muzzleLight.intensity = 34;
      W.muzzleLight.position.set(W.gunGroup.position.x, W.gunGroup.position.y + 0.04, W.gunGroup.position.z - 0.35);
      G.shake = Math.min(0.4, (G.shake || 0) + 0.08);

      var origin = _sv1;
      W.camera.getWorldPosition(origin);
      var pFootY = Math.max(0, origin.y - 1.7);
      var fwd = _sv2.set(0, 0, -1).applyQuaternion(W.camera.quaternion).setY(0).normalize();
      _svE.copy(origin).addScaledVector(fwd, 2.2);
      _svE.y = origin.y - 0.5;
      burst(_svE, 0xffe478, 8);

      for (var zi = zombies.length - 1; zi >= 0; zi--) {
        var zz = zombies[zi];
        if (zz.dead) continue;
        var zp = zz.group.position;
        if (Math.abs((zp.y || 0) - pFootY) > 2.2) continue;
        var dx = zp.x - origin.x, dz = zp.z - origin.z;
        var dist = Math.hypot(dx, dz);
        if (dist <= 5.8 && (dx * fwd.x + dz * fwd.z) / Math.max(0.01, dist) > 0.28) {
          var dy = (zp.y || 0) + Math.min(1.0, 0.85 * zz.group.scale.y) - origin.y;
          var d3 = Math.hypot(dx, dy, dz);
          if (d3 > 0.05) _tmpDir.set(dx, dy, dz).divideScalar(d3);
          var wallBlock = (d3 > 0.05 && W.raycastWallDist) ? W.raycastWallDist(origin, _tmpDir, d3) : d3;
          if (wallBlock >= d3 - 0.35) {
            var pt = _hitPt.set(zp.x, (zp.y || 0) + 1.25 * zz.group.scale.y, zp.z);
            damageZombie(zz, wStats.dmg * (G.dmgMul || 1) * (0.9 + Math.random() * 0.25), dist < 3.2, pt, { fireAmmo: wStats.fireAmmo });
            burst(pt, 0xffd54f, 6);
          }
        }
      }
      var barrelsM = W.explosiveBarrels || [];
      for (var bm = 0; bm < barrelsM.length; bm++) {
        var mb = barrelsM[bm];
        if (!mb || !mb.alive) continue;
        var mby = mb.y || 0;
        if (Math.abs(mby - pFootY) > 2.0) continue;
        var bdx = mb.x - origin.x, bdz = mb.z - origin.z;
        var bdist = Math.hypot(bdx, bdz);
        if (bdist <= 4.0 && (bdx * fwd.x + bdz * fwd.z) / Math.max(0.01, bdist) > 0.35) {
          var bdy = mby + 0.7 - origin.y;
          var bD3 = Math.hypot(bdx, bdy, bdz);
          _tmpDir.set(bdx, bdy, bdz).normalize();
          var bWall = W.raycastWallDist ? W.raycastWallDist(origin, _tmpDir, bD3) : bD3;
          if (bWall >= bD3 - 0.35) {
            mb.hp -= wStats.dmg * (G.dmgMul || 1);
            if (mb.hp <= 0) explodeBarrel(mb);
          }
        }
      }
      if (W.raycastTarget) {
        var lookDir = _sv3.set(0, 0, -1).applyQuaternion(W.camera.quaternion).normalize();
        var meleeTgt = W.raycastTarget(origin, lookDir, 4.5);
        if (meleeTgt) {
          _hitPt.copy(origin).addScaledVector(lookDir, meleeTgt.dist);
          burst(_hitPt, meleeTgt.kind === "totem" ? 0xa855f7 : 0x8b6239, 6);
          applyWorldTargetHit(meleeTgt, wStats.dmg * (G.dmgMul || 1));
        }
      }
      if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
      return;
    }

    if (st.mag <= 0) {
      if (FPS.audio && FPS.audio.playTone) FPS.audio.playTone(900, 0.05, 0.12, "square");
      startReload();
      return;
    }

    G.lastShot = now;
    st.mag--;
    if (FPS.audio && FPS.audio.sfxShoot) FPS.audio.sfxShoot(curWeapon);
    if (gunParts.flash) {
      gunParts.flash.visible = true;
      gunParts.flash.material.opacity = 0.95;
      gunParts.flash.rotation.z = Math.random() * Math.PI;
      gunParts.flash.scale.setScalar(curWeapon === "shotgun" ? 1.5 : 1);
    }
    W.muzzleLight.intensity = curWeapon === "shotgun" ? 46 : 30;
    W.muzzleLight.position.set(W.gunGroup.position.x, W.gunGroup.position.y + 0.04, W.gunGroup.position.z + (gunParts.muzzleZ || -0.45));
    G.shake = Math.min(0.4, (G.shake || 0) + WDef.recoil * 4);
    G.xhairKick = Math.min(0.85, (G.xhairKick || 0) + (curWeapon === "shotgun" ? 0.65 : (curWeapon === "pistol" ? 0.38 : 0.25)));
    var _rk = WDef.recoil * (0.7 + Math.random() * 0.5);
    G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch + _rk));
    W.gunGroup.position.z = -0.62 + WDef.kick;
    spawnCasing(curWeapon === "shotgun");

    var origin = _sv1;
    W.camera.getWorldPosition(origin);
    var mzWorld = _sv7.set(0.3, -0.28, -0.9).applyMatrix4(W.camera.matrixWorld);
    var wallSfxPlayed = false;

    for (var p = 0; p < WDef.pellets; p++) {
      var dir = _sv2.set((Math.random() - 0.5) * 2 * WDef.spread, (Math.random() - 0.5) * 2 * WDef.spread, -1).normalize();
      dir.applyQuaternion(W.camera.quaternion);
      raycaster.set(origin, dir);
      raycaster.far = 95;

      var wallDist = W.raycastWallDist ? W.raycastWallDist(origin, dir, 95) : 95;
      var barrelHit = raycastBarrels(origin, dir, wallDist);
      var barrelDist = barrelHit ? barrelHit.dist : 95;
      var tgtHit = W.raycastTarget ? W.raycastTarget(origin, dir, Math.min(95, barrelDist)) : null;
      var maxAllowedDist = Math.min(wallDist, barrelDist);

      var best = null;
      var bestDist = maxAllowedDist;
      for (var i = 0; i < zombies.length; i++) {
        var z = zombies[i];
        if (z.dead) continue;
        var zp = z.group.position;
        var zpy = zp.y || 0;
        var center = _sv3.set(zp.x, zpy + 1.05 * z.group.scale.y, zp.z);
        var d = raycaster.ray.distanceToPoint(center);
        if (d < z.hitR) {
          var along = _sv4.copy(center).sub(origin).dot(dir);
          if (along > 0 && along < bestDist) {
            bestDist = along;
            best = { z: z, head: false, point: _hitPt.copy(origin).addScaledVector(dir, along) };
          }
        }
        var hc = _sv5.set(zp.x, zpy + 1.85 * z.group.scale.y, zp.z);
        var dh = raycaster.ray.distanceToPoint(hc);
        if (dh < 0.36 * z.group.scale.y) {
          var al2 = _sv4.copy(hc).sub(origin).dot(dir);
          if (al2 > 0 && al2 < bestDist) {
            bestDist = al2;
            best = { z: z, head: true, point: _hitPt.copy(origin).addScaledVector(dir, al2) };
          }
        }
      }

      var endDist;
      if (best) {
        endDist = bestDist;
        var dmg = wStats.dmg * (G.dmgMul || 1) * (best.head ? 2 : 1) * (0.9 + Math.random() * 0.2);
        damageZombie(best.z, dmg, best.head, best.point, { fireAmmo: wStats.fireAmmo });
      } else if (barrelHit && barrelDist < wallDist) {
        endDist = barrelDist;
        _hitPt.copy(origin).addScaledVector(dir, barrelDist);
        burst(_hitPt, 0xffaa33, 4);
        if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(false);
        barrelHit.barrel.hp -= wStats.dmg * (G.dmgMul || 1);
        if (barrelHit.barrel.hp <= 0) explodeBarrel(barrelHit.barrel);
      } else if (tgtHit && tgtHit.dist <= wallDist + 0.05) {
        endDist = tgtHit.dist;
        _hitPt.copy(origin).addScaledVector(dir, tgtHit.dist);
        burst(_hitPt, tgtHit.kind === "totem" ? 0xa855f7 : 0x8b6239, 5);
        applyWorldTargetHit(tgtHit, wStats.dmg * (G.dmgMul || 1));
      } else if (wallDist < 95) {
        endDist = wallDist;
        _hitPt.copy(origin).addScaledVector(dir, wallDist);
        burst(_hitPt, 0xffd27a, 4);
        if (!wallSfxPlayed && FPS.audio && FPS.audio.sfxBulletWall) {
          wallSfxPlayed = true;
          FPS.audio.sfxBulletWall();
        }
      } else {
        endDist = 55;
      }

      var end = _sv6.copy(origin).addScaledVector(dir, endDist);
      addTracer(mzWorld, end);
    }

    if (st.mag === 0) {
      clearAutoReloadTimer();
      var firedWeapon = curWeapon;
      _autoReloadTimer = setTimeout(function () {
        _autoReloadTimer = null;
        var curG = getG();
        if (curG && curG.state === "playing" && !curG.armoryOpen && curWeapon === firedWeapon) {
          startReload();
        }
      }, 250);
    }
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function applyArmorShield(dmg) {
    var totems = W.totems || [];
    if (!totems.length) return dmg || 0;
    var alive = 0;
    for (var i = 0; i < totems.length; i++) {
      if (totems[i].alive) alive++;
    }
    if (alive <= 0) return dmg || 0;
    var maxRed = (FPS.HAZARDS && FPS.HAZARDS.totemArmorReduction) || 0.65;
    var frac = alive / totems.length;
    return (dmg || 0) * (1 - maxRed * frac);
  }

  function damageZombie(z, dmg, head, point, opts) {
    if (!z || z.dead || !Number.isFinite(dmg) || dmg <= 0) return;
    var G = getG();
    if (!point) {
      point = _hitPt.set(
        z.group.position.x,
        (z.group.position.y || 0) + (head ? 1.75 : 1.15) * z.group.scale.y,
        z.group.position.z
      );
    }
    if (z.type === "orcking") dmg = applyArmorShield(dmg);
    if (z.model && z.model.acts.hit) {
      z.model.acts.hit.stop();
      z.model.cur = "";
    }
    z.hp -= dmg;
    z.flashT = 0.09;
    z.hitT = head ? 0.42 : 0.28;
    if (z.type === "stalker" && (z.pounceState === "telegraph" || z.pounceState === "pounce")) {
      var stDef = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.stalker) || {};
      z.pounceState = "prowl";
      z.pounceT = 0;
      z.pounceCd = stDef.pounceCd || 5.5;
      setStalkerOpacity(z, false);
    }
    if (head && G && !(opts && opts.fromBarrel) && !(opts && opts.fromBurn)) {
      var scCfg = FPS.SCRAP || {};
      var winSec = scCfg.comboWindowSec || 6.0;
      var stepM = scCfg.comboStepMult || 0.5;
      var maxM = scCfg.comboMaxMult || 3.0;
      G.hsStreak = (G.hsStreak || 0) + 1;
      G.hsTimer = winSec;
      G.hsMult = Math.min(maxM, 1.0 + (G.hsStreak >= 2 ? (G.hsStreak - 1) * stepM : 0));
      if (G.hsStreak >= 2 && FPS.audio && FPS.audio.sfxHeadshotStreak) {
        FPS.audio.sfxHeadshotStreak(G.hsStreak);
      }
    }
    if (opts && opts.fireAmmo) {
      var fa = (FPS.UPGRADES && FPS.UPGRADES.fireAmmo) || {};
      z.burnT = fa.duration || 3.0;
      z.burnTickT = fa.tick || 0.5;
    }
    setZombieFlash(z, true);
    if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(false);
    burst(point, (opts && opts.fromBurn) ? 0xff6a1a : 0xb01018, head ? 6 : 4);
    if (!(opts && opts.fromBurn)) {
      spawnDecal(z.group.position.x, z.baseY || z.group.position.y, z.group.position.z, 0x7a0505, head ? 0.95 : 0.72);
    }
    dmgNum(point, dmg, head);
    if (head && FPS.audio && FPS.audio.sfxHeadshot) FPS.audio.sfxHeadshot();
    else if (FPS.audio && FPS.audio.sfxHit) FPS.audio.sfxHit(false);
    if (z.hp <= 0 && !z.dead) killZombie(z, head, opts);
  }

  function _detonateBloater(z) {
    var G = getG();
    var playerPos = getP();
    var zt = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.bloater) || {};
    var rad = zt.boomRadius || 5.5;
    var r2 = rad * rad;
    var gp = z.group.position;
    var gx = gp.x, gz = gp.z;
    var by = z.baseY || gp.y || 0;

    if (FPS.audio && FPS.audio.sfxBloaterBoom) FPS.audio.sfxBloaterBoom();
    _burstV.set(gx, by + 0.9, gz);
    burst(_burstV, 0xff7b1a, 18);
    _burstV.set(gx, by + 1.3, gz);
    burst(_burstV, 0xffd27a, 10);
    spawnBoomRing(gx, gz, by);
    spawnDecal(gx, by, gz, 0xff7b1a, 1.85);

    var zDmg = zt.boomDmgZombie || 160;
    for (var zi = zombies.length - 1; zi >= 0; zi--) {
      var zb = zombies[zi];
      if (!zb || zb === z || zb.dead) continue;
      var zp = zb.group.position;
      var zx = zp.x - gx, zz = zp.z - gz, zy = (zp.y || 0) - by;
      var d2 = zx * zx + zz * zz + zy * zy;
      if (d2 <= r2) {
        if (W.raycastWallDist) {
          var blOrigZ = _sv5.set(gx, by + 0.9, gz);
          var zHitY = (zp.y || 0) + Math.min(1.0, 0.85 * zb.group.scale.y);
          var blToZ = _sv6.set(zp.x - gx, zHitY - (by + 0.9), zp.z - gz);
          var blLenZ = blToZ.length();
          if (blLenZ > 0.05) {
            blToZ.divideScalar(blLenZ);
            if (W.raycastWallDist(blOrigZ, blToZ, blLenZ) < blLenZ - 0.45) continue;
          }
        }
        var d = Math.sqrt(d2);
        var falloff = Math.max(0.3, 1 - (d / rad) * 0.7);
        var pt = _hitPt.set(zp.x, (zp.y || 0) + 1.1 * zb.group.scale.y, zp.z);
        damageZombie(zb, zDmg * falloff, false, pt, { fromExplosion: true });
      }
    }

    var barrels = W.explosiveBarrels || [];
    for (var bi = 0; bi < barrels.length; bi++) {
      var b = barrels[bi];
      if (!b || !b.alive) continue;
      var bY = b.y || 0;
      var bx = b.x - gx, bz = b.z - gz, bdy = bY - by;
      if (bx * bx + bz * bz + bdy * bdy <= r2) {
        if (W.raycastWallDist) {
          var blOrigB = _sv5.set(gx, by + 0.9, gz);
          var blToB = _sv6.set(bx, (bY + 0.7) - (by + 0.9), bz);
          var blLenB = blToB.length();
          if (blLenB > 0.05) {
            blToB.divideScalar(blLenB);
            if (W.raycastWallDist(blOrigB, blToB, blLenB) < blLenB - 0.45) continue;
          }
        }
        b.hp -= 90;
        if (b.hp <= 0) explodeBarrel(b);
      }
    }

    if (playerPos) {
      var pFootY = Math.max(0, playerPos.y - 1.7);
      var pdx = playerPos.x - gx, pdz = playerPos.z - gz, pdy = pFootY - by;
      var pDist = Math.hypot(pdx, pdy, pdz);
      if (pDist <= rad) {
        var pBlocked = false;
        if (W.raycastWallDist) {
          var blOrigP = _sv5.set(gx, by + 0.9, gz);
          var blToP = _sv6.set(playerPos.x - gx, (playerPos.y - 0.5) - (by + 0.9), playerPos.z - gz);
          var blLenP = blToP.length();
          if (blLenP > 0.05) {
            blToP.divideScalar(blLenP);
            if (W.raycastWallDist(blOrigP, blToP, blLenP) < blLenP - 0.45) pBlocked = true;
          }
        }
        if (!pBlocked) {
          var pFalloff = Math.max(0.35, 1 - (pDist / rad) * 0.65);
          if (FPS.game && FPS.game.hurtPlayer) {
            FPS.game.hurtPlayer(Math.round((zt.boomDmgPlayer || 28) * pFalloff), gx, gz, true);
          }
          var kb = (zt.boomKnockback || 7.5) * 0.32 * pFalloff;
          var hDist = Math.hypot(pdx, pdz);
          var knx = hDist > 0.01 ? pdx / hDist : 0;
          var knz = hDist > 0.01 ? pdz / hDist : 1;
          var lv = W.currentLevel;
          var halfA = (lv ? lv.arena / 2 : 30) - 0.8;
          for (var ks = 0; ks < 3; ks++) {
            playerPos.x = Math.max(-halfA, Math.min(halfA, playerPos.x + knx * (kb / 3)));
            playerPos.z = Math.max(-halfA, Math.min(halfA, playerPos.z + knz * (kb / 3)));
            W.collide(playerPos, 0.55, false, pFootY);
          }
          var blindDur = zt.blindDur || 1.8;
          if (G) {
            G.acidBlindT = Math.max(G.acidBlindT || 0, blindDur);
            G.shake = Math.min(0.85, (G.shake || 0) + 0.45);
          }
          if (FPS.ui && typeof FPS.ui.showBloaterBlind === "function") {
            FPS.ui.showBloaterBlind(blindDur);
          } else {
            var veil = document.getElementById("blackoutVeil");
            if (veil) veil.style.opacity = "0.92";
          }
          if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("spBloaterBoom"), 1600);
        }
      }
    }
  }

  function killZombie(z, head, opts) {
    if (!z || z.dead) return;
    var G = getG();
    z.dead = true;
    z.deathT = 0;
    setZombieFlash(z, false);
    if (z.model) {
      for (var _dk in z.model.acts) z.model.acts[_dk].fadeOut(0.12);
      z.model.cur = "";
    }
    var zt = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES[z.type]) || {};
    var scCfg = FPS.SCRAP || {};
    var baseScrap = z.scrap || zt.scrap || 10;
    var bonusScrap = (head ? (scCfg.headshotBonus || 4) : 0) + ((opts && opts.fromBarrel) ? (scCfg.barrelKillBonus || 5) : 0);
    var mult = (G && G.hsMult) || 1;
    if (G) {
      G.levelKills = (G.levelKills || 0) + 1;
      G.totalKills = (G.totalKills || 0) + 1;
      G.score = (G.score || 0) + z.score;
      G.scrap = (G.scrap || 0) + Math.round((baseScrap + bonusScrap) * mult);
    }
    if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(true);
    if (FPS.audio && FPS.audio.sfxHit) FPS.audio.sfxHit(true);
    var baseY = z.baseY || z.group.position.y || 0;
    _burstV.set(z.group.position.x, baseY + 1.2 * z.group.scale.y, z.group.position.z);
    burst(_burstV, 0x8f1420, 8);
    spawnDecal(z.group.position.x, baseY, z.group.position.z, 0x8f1420, 1.15);

    if (z.type === "bloater") _detonateBloater(z);

    if (z.isBoss) {
      if (bossRef === z) bossRef = null;
      if (G) {
        G.bossSlain = true;
        G.score += 1000;
      }
      var bw = document.getElementById("bossWrap");
      if (bw) bw.classList.add("hidden");
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast("☠ " + FPS.t("bossSlain"), 2400);
    }
    if (Math.random() < 0.22) dropPickup(z.group.position.x, z.group.position.z, baseY);
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function shove() {
    var G = getG();
    var playerPos = getP();
    if (!G || !playerPos || G.state !== "playing" || G.armoryOpen) return false;
    if ((G.shoveCd || 0) > 0) return false;
    var cfg = FPS.SHOVE || {};
    var stamCost = cfg.staminaCost !== undefined ? cfg.staminaCost : 22;
    if (G.stamina < stamCost) {
      if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("shoveNoStam"), 1200);
      return false;
    }

    G.stamina = Math.max(0, G.stamina - stamCost);
    G.shoveCd = cfg.cd || 0.65;
    G.shoveT = cfg.animDur || 0.28;
    G.shoveRegenLockT = 0.55;
    shoveAnimT = G.shoveT;
    G.shake = Math.min(0.4, (G.shake || 0) + 0.08);
    if (FPS.audio && FPS.audio.sfxShove) FPS.audio.sfxShove();

    var fwdX = -Math.sin(G.yaw);
    var fwdZ = -Math.cos(G.yaw);
    var pFootY = Math.max(0, playerPos.y - 1.7);
    var range = cfg.range || 2.4;
    var cosMin = cfg.cosMin || 0.45;
    var baseKb = cfg.knockback || 4.2;
    var baseStag = cfg.staggerSec || 1.15;
    var baseDmg = cfg.dmg || 12;
    var bossKbMul = cfg.bossKnockbackMul || 0.25;
    var bossStagMul = cfg.bossStaggerMul || 0.35;
    var lv = W.currentLevel;
    var halfA = (lv ? lv.arena / 2 : 30) - 0.8;
    var origin = _sv1.set(playerPos.x, playerPos.y - 0.15, playerPos.z);

    for (var zi = zombies.length - 1; zi >= 0; zi--) {
      var z = zombies[zi];
      if (!z || z.dead || z.spawnT > 0) continue;
      var gp = z.group.position;
      var sc = z.group.scale.x;
      var dx = gp.x - playerPos.x;
      var dz = gp.z - playerPos.z;
      var dist = Math.hypot(dx, dz);
      if (dist > range + z.hitR * 0.4) continue;
      if (Math.abs((gp.y || 0) - pFootY) > 1.65) continue;

      var nx = dist > 1e-4 ? dx / dist : fwdX;
      var nz = dist > 1e-4 ? dz / dist : fwdZ;
      if (dist >= 0.85 && (nx * fwdX + nz * fwdZ) < cosMin) continue;

      if (W.raycastWallDist) {
        var wallD = W.raycastWallDist(origin, _tmpDir.set(nx, 0, nz), dist);
        if (wallD < dist - 0.3) continue;
      }

      var kb = baseKb * (z.isBoss ? bossKbMul : 1);
      if (W.raycastWallDist) {
        var zOrig = _sv2.set(gp.x, (gp.y || 0) + 0.8, gp.z);
        var zWallD = W.raycastWallDist(zOrig, _tmpDir.set(nx, 0, nz), kb + 0.52 * sc);
        kb = Math.min(kb, Math.max(0, zWallD - 0.52 * sc));
      }
      var steps = Math.max(12, Math.ceil(kb / 0.25));
      var subStep = kb / steps;
      for (var s = 0; s < steps; s++) {
        gp.x = Math.max(-halfA, Math.min(halfA, gp.x + nx * subStep));
        gp.z = Math.max(-halfA, Math.min(halfA, gp.z + nz * subStep));
        var kCol = W.collide(gp, 0.52 * sc, true, z.baseY || 0);
        if (kCol && kCol.hit && (kCol.nx * nx + kCol.nz * nz) < -0.3) break;
      }
      z.baseY = W.groundY ? W.groundY(gp.x, gp.z, z.baseY || 0) : 0;
      gp.y = z.baseY;
      z.atkT = 0;
      z.atkCd = Math.max(z.atkCd, 0.9);
      var stag = baseStag * (z.isBoss ? bossStagMul : 1);
      z.hitT = Math.max(z.hitT, stag);
      if (z.type === "stalker") {
        var stDef = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.stalker) || {};
        z.pounceState = "prowl";
        z.pounceT = 0;
        z.pounceCd = stDef.pounceCd || 5.5;
        setStalkerOpacity(z, false);
      }
      damageZombie(z, baseDmg, false, _hitPt.set(gp.x, gp.y + 1.1 * sc, gp.z));
    }

    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    return true;
  }

  function startReload() {
    clearAutoReloadTimer();
    var G = getG();
    if (!G || G.state !== "playing" || G.armoryOpen) return;
    var st = wState[curWeapon];
    var WDef = FPS.WEAPONS[curWeapon];
    var cap = getWeaponStats(curWeapon).mag;
    if (WDef.melee || G.reloading || st.mag >= cap || st.reserve <= 0) return;
    G.reloading = true;
    G.reloadDur = WDef.reload * (G.reloadMul || 1);
    G.reloadEnd = performance.now() + G.reloadDur;
    if (FPS.audio && FPS.audio.sfxReload) FPS.audio.sfxReload();
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function finishReload() {
    var G = getG();
    if (!G) return;
    var st = wState[curWeapon];
    var cap = getWeaponStats(curWeapon).mag;
    var need = cap - st.mag;
    var take = st.reserve === Infinity ? need : Math.min(need, st.reserve);
    st.mag += take;
    if (st.reserve !== Infinity) st.reserve -= take;
    G.reloading = false;
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function switchWeapon(k) {
    if (!_hasOwn(FPS.WEAPONS, k) || k === curWeapon || !isWeaponUnlocked(k)) return false;
    clearAutoReloadTimer();
    var G = getG();
    if (G) G.reloading = false;
    curWeapon = k;
    switchT = 0.28;
    buildGun(k);
    if (FPS.audio && FPS.audio.playTone) FPS.audio.playTone(400, 0.06, 0.12, "square");
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
    return true;
  }

  function clearSpecialFX() {
    clearAutoReloadTimer();
    clearAcidPools();
    clearDecals();
    var bv = document.getElementById("blackoutVeil");
    if (bv) bv.style.opacity = "0";
    var sd = document.getElementById("shadowDash");
    if (sd) sd.style.opacity = "0";
  }

  function clearZombies() {
    clearAutoReloadTimer();
    for (var i = 0; i < zombies.length; i++) {
      W.scene.remove(zombies[i].group);
      var zt = zombies[i].type;
      var pt = (_hasOwn(zombiePool, zt) && zombiePool[zt]) ? zombiePool[zt] : (zombiePool[zt] = []);
      if (pt.length < 14) pt.push(zombies[i]);
    }
    zombies.length = 0;
    bossRef = null;
    for (var i = 0; i < pickups.length; i++) W.scene.remove(pickups[i].g);
    pickups.length = 0;
    for (var i = 0; i < dmgPool.length; i++) {
      dmgPool[i].t = 0;
      dmgPool[i].hidden = true;
      dmgPool[i].el.style.display = "none";
    }
    if (casingsLive.length) {
      for (var i = 0; i < casingsLive.length; i++) {
        casingsLive[i].active = false;
        casingInst.setMatrixAt(casingsLive[i].idx, _zeroMat4);
      }
      casingsLive.length = 0;
      casingInst.instanceMatrix.needsUpdate = true;
      casingInst.visible = false;
      _casingMatDirty = false;
    }
    for (var i = 0; i < boomRings.length; i++) {
      boomRings[i].active = false;
      boomRings[i].m.visible = false;
    }
    boomRings.length = 0;
    if (tracers.length) {
      for (var ti0 = 0; ti0 < TRACER_MAX; ti0++) {
        tracerPool[ti0].active = false;
        tracerPool[ti0].t = 0;
        var b0 = ti0 * 6;
        _tracerPosArr[b0] = _tracerPosArr[b0 + 1] = _tracerPosArr[b0 + 2] = 0;
        _tracerPosArr[b0 + 3] = _tracerPosArr[b0 + 4] = _tracerPosArr[b0 + 5] = 0;
      }
      tracers.length = 0;
      _tracerGeo.attributes.position.needsUpdate = true;
      _tracerMesh.visible = false;
    }
    if (_prevBarCount > 0) {
      for (var bi0 = 0; bi0 < _prevBarCount; bi0++) {
        _zBarBgInst.setMatrixAt(bi0, _zeroMat4);
        _zBarFgInst.setMatrixAt(bi0, _zeroMat4);
      }
      _zBarBgInst.instanceMatrix.needsUpdate = true;
      _zBarFgInst.instanceMatrix.needsUpdate = true;
      _zBarBgInst.visible = false;
      _zBarFgInst.visible = false;
      _prevBarCount = 0;
    }
    if (particles.length) {
      for (var pi0 = 0; pi0 < particles.length; pi0++) {
        particles[pi0].active = false;
        partInst.setMatrixAt(particles[pi0].idx, _zeroMat4);
      }
      particles.length = 0;
      partInst.instanceMatrix.needsUpdate = true;
    }
    partInst.visible = false;
    _partMatDirty = false;
    _partColorDirty = false;
    casingInst.visible = false;
    _tracerMesh.visible = false;
    _zBarBgInst.visible = false;
    _zBarFgInst.visible = false;
    clearSpecialFX();
  }

  var _bossWrapEl = null;
  var _bossBarEl = null;
  var _lastBossPctStr = "";
  var _rampTargetOut = { x: 0, z: 0 };
  var _navKeepDeck = false;
  var _navKeepPlat = null;
  var _platGraphLevel = null;
  var _platGraphLen = -1;
  var _platGraphFirst = null;
  var _platNext = [];
  var _platPortal = [];

  function _ensurePlatGraph() {
    var plats = W.platforms;
    if (!plats || !plats.length) {
      _platGraphLevel = W.currentLevel || null;
      _platGraphLen = 0;
      _platGraphFirst = null;
      _platNext.length = 0;
      _platPortal.length = 0;
      return;
    }
    if (_platGraphLevel === (W.currentLevel || null) && _platGraphLen === plats.length && _platGraphFirst === plats[0]) {
      return;
    }
    _platGraphLevel = W.currentLevel || null;
    _platGraphLen = plats.length;
    _platGraphFirst = plats[0];
    var n = plats.length;
    _platNext = [];
    _platPortal = [];
    var adj = [];
    for (var i = 0; i < n; i++) {
      _platNext[i] = [];
      _platPortal[i] = [];
      adj[i] = [];
      for (var j = 0; j < n; j++) {
        _platNext[i][j] = (i === j) ? i : -1;
        _platPortal[i][j] = null;
      }
    }
    for (var a = 0; a < n; a++) {
      var A = plats[a];
      if (A.rampOnly) continue;
      for (var b = a + 1; b < n; b++) {
        var B = plats[b];
        if (B.rampOnly || Math.abs(A.yTop - B.yTop) > 0.65) continue;
        if (!A.rot && !B.rot) {
          var ox0 = Math.max(A.x - A.hw, B.x - B.hw);
          var ox1 = Math.min(A.x + A.hw, B.x + B.hw);
          var oz0 = Math.max(A.z - A.hd, B.z - B.hd);
          var oz1 = Math.min(A.z + A.hd, B.z + B.hd);
          if (ox0 <= ox1 + 0.45 && oz0 <= oz1 + 0.45) {
            var cx = (ox0 + ox1) * 0.5;
            var cz = (oz0 + oz1) * 0.5;
            var txAtoB = cx, tzAtoB = cz;
            var txBtoA = cx, tzBtoA = cz;
            if (ox1 - ox0 < 1.2) {
              var sxB = Math.min(0.9, B.hw * 0.45);
              var sxA = Math.min(0.9, A.hw * 0.45);
              txAtoB = B.x >= cx ? Math.min(B.x + B.hw - 0.3, cx + sxB) : Math.max(B.x - B.hw + 0.3, cx - sxB);
              txBtoA = A.x >= cx ? Math.min(A.x + A.hw - 0.3, cx + sxA) : Math.max(A.x - A.hw + 0.3, cx - sxA);
            }
            if (oz1 - oz0 < 1.2) {
              var szB = Math.min(0.9, B.hd * 0.45);
              var szA = Math.min(0.9, A.hd * 0.45);
              tzAtoB = B.z >= cz ? Math.min(B.z + B.hd - 0.3, cz + szB) : Math.max(B.z - B.hd + 0.3, cz - szB);
              tzBtoA = A.z >= cz ? Math.min(A.z + A.hd - 0.3, cz + szA) : Math.max(A.z - A.hd + 0.3, cz - szA);
            }
            adj[a].push(b);
            adj[b].push(a);
            _platPortal[a][b] = { x: txAtoB, z: tzAtoB };
            _platPortal[b][a] = { x: txBtoA, z: tzBtoA };
          }
        } else {
          var sumX = 0, sumZ = 0, cnt = 0;
          for (var si = -4; si <= 4; si++) {
            for (var sj = -4; sj <= 4; sj++) {
              var alx = (si / 4) * A.hw;
              var alz = (sj / 4) * A.hd;
              var wx = A.x + (A.rot ? (alx * A.cos + alz * A.sin) : alx);
              var wz = A.z + (A.rot ? (-alx * A.sin + alz * A.cos) : alz);
              var bdx = wx - B.x, bdz = wz - B.z;
              var blx = B.rot ? (bdx * B.cos - bdz * B.sin) : bdx;
              var blz = B.rot ? (bdx * B.sin + bdz * B.cos) : bdz;
              if (Math.abs(blx) <= B.hw + 0.45 && Math.abs(blz) <= B.hd + 0.45) {
                sumX += wx; sumZ += wz; cnt++;
              }
            }
          }
          if (cnt > 0) {
            var pcx = sumX / cnt, pcz = sumZ / cnt;
            adj[a].push(b);
            adj[b].push(a);
            _platPortal[a][b] = { x: pcx, z: pcz };
            _platPortal[b][a] = { x: pcx, z: pcz };
          }
        }
      }
    }
    var q = [];
    for (var dst = 0; dst < n; dst++) {
      q.length = 0;
      q.push(dst);
      var head = 0;
      while (head < q.length) {
        var cur = q[head++];
        var nbrs = adj[cur];
        for (var k = 0; k < nbrs.length; k++) {
          var nb = nbrs[k];
          if (_platNext[nb][dst] === -1) {
            _platNext[nb][dst] = cur;
            q.push(nb);
          }
        }
      }
    }
  }

  function _findPlatIndexAt(x, z, footY, preferIdx) {
    var plats = W.platforms;
    if (!plats || !plats.length) return -1;
    if (preferIdx !== undefined && preferIdx >= 0 && preferIdx < plats.length) {
      var pp = plats[preferIdx];
      if (!pp.rampOnly && footY >= pp.yTop - 0.75 && footY <= pp.yTop + 1.8) {
        var pdx = x - pp.x, pdz = z - pp.z;
        var plx = pp.rot ? (pdx * pp.cos - pdz * pp.sin) : pdx;
        var plz = pp.rot ? (pdx * pp.sin + pdz * pp.cos) : pdz;
        var mx = Math.min(0.55, pp.hw * 0.4);
        var mz = Math.min(0.55, pp.hd * 0.4);
        if (Math.abs(plx) <= pp.hw - mx && Math.abs(plz) <= pp.hd - mz) return preferIdx;
      }
    }
    var bestIdx = -1;
    var bestScore = -1e9;
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (footY < 0.35 && Math.abs(p.yTop - footY) > 0.95) continue;
      var dx = x - p.x, dz = z - p.z;
      var lx = p.rot ? (dx * p.cos - dz * p.sin) : dx;
      var lz = p.rot ? (dx * p.sin + dz * p.cos) : dz;
      if (!p.rampOnly && footY >= p.yTop - 0.75 && footY <= p.yTop + 1.8) {
        var m = Math.min(p.hw - Math.abs(lx), p.hd - Math.abs(lz));
        if (m >= -0.2) {
          var sc = m - Math.abs(p.yTop - footY) * 0.5;
          if (sc > bestScore) { bestScore = sc; bestIdx = i; }
        }
      }
      if (bestIdx !== i && footY >= 0.35 && p.ramps && p.ramps.length && footY <= p.yTop + 0.65) {
        for (var ri = 0; ri < p.ramps.length; ri++) {
          var rm = p.ramps[ri];
          if (lx >= rm.xMin - 0.15 && lx <= rm.xMax + 0.15 && lz >= rm.zMin - 0.15 && lz <= rm.zMax + 0.15) {
            var rSc = -0.35 - Math.abs(p.yTop - footY) * 0.25;
            if (rSc > bestScore) { bestScore = rSc; bestIdx = i; }
            break;
          }
        }
      }
    }
    return bestIdx;
  }

  function _clampStepToDeck(gp, prevX, prevZ, baseY, keepPlat) {
    if (!W.groundY || W.groundY(gp.x, gp.z, baseY) >= baseY - 0.5) return;
    var tryX = gp.x, tryZ = gp.z;
    var okX = W.groundY(tryX, prevZ, baseY) >= baseY - 0.5;
    var okZ = W.groundY(prevX, tryZ, baseY) >= baseY - 0.5;
    if (okZ && (!okX || Math.abs(tryZ - prevZ) >= Math.abs(tryX - prevX))) {
      gp.x = prevX; gp.z = tryZ;
      return;
    }
    if (okX) {
      gp.x = tryX; gp.z = prevZ;
      return;
    }
    if (keepPlat && keepPlat.rot) {
      var dvx = tryX - prevX, dvz = tryZ - prevZ;
      var lvx = dvx * keepPlat.cos - dvz * keepPlat.sin;
      var lvz = dvx * keepPlat.sin + dvz * keepPlat.cos;
      var axX = prevX + lvx * keepPlat.cos, axZ = prevZ - lvx * keepPlat.sin;
      if (W.groundY(axX, axZ, baseY) >= baseY - 0.5) { gp.x = axX; gp.z = axZ; return; }
      var azX = prevX + lvz * keepPlat.sin, azZ = prevZ + lvz * keepPlat.cos;
      if (W.groundY(azX, azZ, baseY) >= baseY - 0.5) { gp.x = azX; gp.z = azZ; return; }
    }
    gp.x = prevX; gp.z = prevZ;
  }

  function _findRampTarget(zx, zz, curBaseY, px, pz, pFootY, zRad) {
    var plats = W.platforms;
    _navKeepDeck = false;
    _navKeepPlat = null;
    if (!plats || !plats.length) return false;
    _ensurePlatGraph();
    var pIdx = _findPlatIndexAt(px, pz, pFootY, -1);
    var zIdx = (curBaseY >= 0.85) ? _findPlatIndexAt(zx, zz, curBaseY, pIdx) : -1;
    var targetPlat = null;

    if (pIdx >= 0 && zIdx >= 0 && curBaseY >= 0.85) {
      if (zIdx === pIdx || (_platNext[zIdx] && _platNext[zIdx][pIdx] >= 0)) {
        if (pFootY >= curBaseY - 0.5) {
          _navKeepDeck = true;
          _navKeepPlat = plats[zIdx];
        }
        var curP = plats[zIdx];
        if (zIdx === pIdx) {
          if (curBaseY >= curP.yTop * 0.82) return false;
          targetPlat = curP;
        } else {
          if (curBaseY < curP.yTop * 0.82 && curP.ramps && curP.ramps.length) {
            targetPlat = curP;
          } else {
            var nextIdx = _platNext[zIdx][pIdx];
            var port = _platPortal[zIdx][nextIdx];
            if (port) {
              _rampTargetOut.x = port.x;
              _rampTargetOut.z = port.z;
              return true;
            }
          }
        }
      }
    }

    if (!targetPlat && pFootY <= curBaseY + 0.7) return false;
    if (!targetPlat) {
      var bestScore = 1e9;
      for (var i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (!p.ramps || !p.ramps.length) continue;
        if (pIdx >= 0 && i !== pIdx && (!_platNext[i] || _platNext[i][pIdx] < 0)) continue;
        if (pIdx < 0 && Math.abs(p.yTop - pFootY) > 1.4) continue;
        var pdx = px - p.x, pdz = pz - p.z;
        if (pIdx < 0) {
          var plx = p.rot ? (pdx * p.cos - pdz * p.sin) : pdx;
          var plz = p.rot ? (pdx * p.sin + pdz * p.cos) : pdz;
          if (Math.abs(plx) <= p.hw + 0.9 && Math.abs(plz) <= p.hd + 0.9) {
            targetPlat = p;
            break;
          }
        }
        var minRmD = 1e9;
        var zdx0 = zx - p.x, zdz0 = zz - p.z;
        var zlx0 = p.rot ? (zdx0 * p.cos - zdz0 * p.sin) : zdx0;
        var zlz0 = p.rot ? (zdx0 * p.sin + zdz0 * p.cos) : zdz0;
        for (var rci0 = 0; rci0 < p.ramps.length; rci0++) {
          var rm0 = p.ramps[rci0];
          var rmx = (rm0.xMin + rm0.xMax) * 0.5;
          var rmz = (rm0.zMin + rm0.zMax) * 0.5;
          var rd0 = Math.hypot(zlx0 - rmx, zlz0 - rmz);
          if (rd0 < minRmD) minRmD = rd0;
        }
        var score = minRmD + 0.35 * Math.hypot(pdx, pdz);
        if (score < bestScore) { bestScore = score; targetPlat = p; }
      }
    }
    if (!targetPlat) return false;
    var zdx = zx - targetPlat.x, zdz = zz - targetPlat.z;
    var zlx = targetPlat.rot ? (zdx * targetPlat.cos - zdz * targetPlat.sin) : zdx;
    var zlz = targetPlat.rot ? (zdx * targetPlat.sin + zdz * targetPlat.cos) : zdz;
    if (curBaseY >= targetPlat.yTop * 0.82 && Math.abs(zlx) <= targetPlat.hw + 0.6 && Math.abs(zlz) <= targetPlat.hd + 0.6) {
      return false;
    }
    var bestRm = null;
    var bestRmD = 1e9;
    for (var ri = 0; ri < targetPlat.ramps.length; ri++) {
      var rm = targetPlat.ramps[ri];
      var rcx = (rm.xMin + rm.xMax) * 0.5;
      var rcz = (rm.zMin + rm.zMax) * 0.5;
      var rdx = zlx - rcx, rdz = zlz - rcz;
      var rd = rdx * rdx + rdz * rdz;
      if (rd < bestRmD) { bestRmD = rd; bestRm = rm; }
    }
    if (!bestRm) return false;
    var rcx = (bestRm.xMin + bestRm.xMax) * 0.5;
    var rcz = (bestRm.zMin + bestRm.zMax) * 0.5;
    var padX = Math.min(0.3, Math.max(0.05, (bestRm.xMax - bestRm.xMin) * 0.2));
    var padZ = Math.min(0.3, Math.max(0.05, (bestRm.zMax - bestRm.zMin) * 0.2));
    var ax = (zlx >= bestRm.xMin + padX && zlx <= bestRm.xMax - padX);
    var az = (zlz >= bestRm.zMin + padZ && zlz <= bestRm.zMax - padZ);
    var onRamp = false;
    var tlx = rcx;
    var tlz = rcz;

    var clr = 0.95 + Math.max(0, (zRad || 0.52) - 0.52) * 1.15;
    if (bestRm.side === "s") {
      onRamp = (zlx >= bestRm.xMin + 0.05 && zlx <= bestRm.xMax - 0.05 && zlz >= bestRm.zMin - 0.15 && zlz <= bestRm.zMax + 0.25);
      if (onRamp || (ax && zlz >= bestRm.zMax - 0.15)) {
        tlz = bestRm.zMin - 0.7;
      } else if (zlz >= bestRm.zMax + 0.4) {
        tlz = bestRm.zMax + 0.75;
      } else {
        tlz = bestRm.zMax + clr;
        tlx = zlx >= rcx ? (bestRm.xMax + clr) : (bestRm.xMin - clr);
      }
    } else if (bestRm.side === "n") {
      onRamp = (zlx >= bestRm.xMin + 0.05 && zlx <= bestRm.xMax - 0.05 && zlz >= bestRm.zMin - 0.25 && zlz <= bestRm.zMax + 0.15);
      if (onRamp || (ax && zlz <= bestRm.zMin + 0.15)) {
        tlz = bestRm.zMax + 0.7;
      } else if (zlz <= bestRm.zMin - 0.4) {
        tlz = bestRm.zMin - 0.75;
      } else {
        tlz = bestRm.zMin - clr;
        tlx = zlx >= rcx ? (bestRm.xMax + clr) : (bestRm.xMin - clr);
      }
    } else if (bestRm.side === "e") {
      onRamp = (zlz >= bestRm.zMin + 0.05 && zlz <= bestRm.zMax - 0.05 && zlx >= bestRm.xMin - 0.15 && zlx <= bestRm.xMax + 0.25);
      if (onRamp || (az && zlx >= bestRm.xMax - 0.15)) {
        tlx = bestRm.xMin - 0.7;
      } else if (zlx >= bestRm.xMax + 0.4) {
        tlx = bestRm.xMax + 0.75;
      } else {
        tlx = bestRm.xMax + clr;
        tlz = zlz >= rcz ? (bestRm.zMax + clr) : (bestRm.zMin - clr);
      }
    } else if (bestRm.side === "w") {
      onRamp = (zlz >= bestRm.zMin + 0.05 && zlz <= bestRm.zMax - 0.05 && zlx >= bestRm.xMin - 0.25 && zlx <= bestRm.xMax + 0.15);
      if (onRamp || (az && zlx <= bestRm.xMin + 0.15)) {
        tlx = bestRm.xMax + 0.7;
      } else if (zlx <= bestRm.xMin - 0.4) {
        tlx = bestRm.xMin - 0.75;
      } else {
        tlx = bestRm.xMin - clr;
        tlz = zlz >= rcz ? (bestRm.zMax + clr) : (bestRm.zMin - clr);
      }
    }

    _rampTargetOut.x = targetPlat.x + (targetPlat.rot ? (tlx * targetPlat.cos + tlz * targetPlat.sin) : tlx);
    _rampTargetOut.z = targetPlat.z + (targetPlat.rot ? (-tlx * targetPlat.sin + tlz * targetPlat.cos) : tlz);
    return true;
  }

  // Obstacle-steering Zombie AI + Specials + Verticality + Barricade Bashing
  function updateZombies(dt, playing, frameNo) {
    var G = getG();
    var playerPos = getP();
    if (!playerPos) return;
    var pFootY = Math.max(0, playerPos.y - 1.7);
    var pFwdX = G ? -Math.sin(G.yaw) : 0;
    var pFwdZ = G ? -Math.cos(G.yaw) : -1;
    var pRightX = G ? Math.cos(G.yaw) : 1;
    var pRightZ = G ? -Math.sin(G.yaw) : 0;
    var barCount = 0;
    var camQuat = W.camera.quaternion;

    for (var zi = zombies.length - 1; zi >= 0; zi--) {
      var z = zombies[zi];
      var gp = z.group.position;
      if (z.dead) {
        z.deathT += dt;
        z.barG.visible = false;
        var mf = Math.min(1, z.deathT * 2.4);
        z.group.rotation.x = -Math.PI / 2 * mf * mf;
        if (z.deathT > 0.65) gp.y -= dt * 1.4;
        if (z.deathT > 1.25) {
          W.scene.remove(z.group);
          zombies.splice(zi, 1);
          var pt = zombiePool[z.type] || (zombiePool[z.type] = []);
          if (pt.length < 14) pt.push(z);
        }
        continue;
      }

      if (z.flashT > 0) {
        z.flashT -= dt;
        if (z.flashT <= 0) setZombieFlash(z, false);
      }
      if (!playing) continue;

      // Sync vertical ground / drop-down gravity
      if (z.spawnT <= 0) {
        var curY = Math.max(0, gp.y || 0);
        var targetGY = W.groundY ? W.groundY(gp.x, gp.z, curY) : 0;
        if (curY > targetGY + 0.08) {
          z.vy -= 18 * dt;
          gp.y = Math.max(targetGY, curY + z.vy * dt);
          z.baseY = gp.y;
          if (gp.y <= targetGY) z.vy = 0;
        } else {
          z.baseY = targetGY;
          z.vy = 0;
          gp.y = targetGY;
        }
      }

      // Incendiary Mk.III fireAmmo DoT
      if (z.burnT > 0) {
        var faCfg = (FPS.UPGRADES && FPS.UPGRADES.fireAmmo) || {};
        z.burnT -= dt;
        z.burnTickT -= dt;
        if (z.burnTickT <= 0) {
          z.burnTickT += (faCfg.tick || 0.5);
          var bDmg = (faCfg.dps || 14) * (faCfg.tick || 0.5);
          damageZombie(z, bDmg, false, _hitPt.set(gp.x, (gp.y || 0) + 1.1 * z.group.scale.y, gp.z), { fromBurn: true });
          if (z.dead) continue;
        }
      }

      if (z.trapSlowT > 0) {
        z.trapSlowT -= dt;
        if (z.trapSlowT <= 0) z.trapSlowMul = 1.0;
      }

      var dx = playerPos.x - gp.x;
      var dz2 = playerPos.z - gp.z;
      var dist2 = dx * dx + dz2 * dz2;
      var dist = Math.sqrt(dist2) || 0.01;
      var wantCull = dist > 14;
      if (wantCull !== !!z._culled) {
        z._culled = wantCull;
        for (var zci = 0; zci < z.meshes.length; zci++) z.meshes[zci].frustumCulled = wantCull;
      }
      var sc = z.group.scale.x;
      var nxP = dx / dist;
      var nzP = dz2 / dist;
      var moveDirX = nxP;
      var moveDirZ = nzP;
      var speedMul = z.trapSlowT > 0 ? (z.trapSlowMul || 1.0) : 1.0;

      // Special Infected AI hooks
      if (z.type === "bloater" && z.spawnT <= 0) {
        if (z.warnT > 0) z.warnT -= dt;
        if (dist <= 9.0 && z.warnT <= 0) {
          z.warnT = 6.5;
          if (FPS.audio && FPS.audio.sfxBloaterWarn) FPS.audio.sfxBloaterWarn();
        }
      } else if (z.type === "spitter" && z.spawnT <= 0) {
        var spDef = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.spitter) || {};
        z.spitCd -= dt;
        if (z.hitT <= 0 && dist <= (spDef.spitRange || 18.0) && dist >= (spDef.spitMinRange || 4.5) && z.spitCd <= 0) {
          var sOrig = _sv1.set(gp.x, (gp.y || 0) + 1.45, gp.z);
          var sTgt = _sv2.set(playerPos.x, playerPos.y - 0.15, playerPos.z);
          var sDiff = _sv3.copy(sTgt).sub(sOrig);
          var d3 = sDiff.length() || 1;
          sDiff.divideScalar(d3);
          var wallD = W.raycastWallDist ? W.raycastWallDist(sOrig, sDiff, d3) : d3;
          if (wallD >= d3 - 0.65) {
            z.spitCd = spDef.spitCd || 4.2;
            z.atkT = 0.35;
            var panS = Math.max(-1, Math.min(1, ((gp.x - playerPos.x) * pRightX + (gp.z - playerPos.z) * pRightZ) / Math.max(4, dist)));
            if (FPS.audio && FPS.audio.sfxSpitterSpit) FPS.audio.sfxSpitterSpit(panS);
            var poolY = W.groundY ? W.groundY(playerPos.x, playerPos.z, pFootY) : 0;
            addTracer(sOrig, _sv4.set(playerPos.x, poolY + 0.1, playerPos.z), 0x39ff14);
            spawnAcidPool(playerPos.x, poolY, playerPos.z);
          }
        }
      } else if (z.type === "stalker" && z.spawnT <= 0) {
        var stDef2 = (FPS.ZOMBIE_TYPES && FPS.ZOMBIE_TYPES.stalker) || {};
        if (z.pounceCd > 0) z.pounceCd -= dt;
        if (z.pounceState === "prowl") {
          if (dist <= (stDef2.pounceRange || 7.5) && z.pounceCd <= 0 && z.hitT <= 0) {
            z.pounceState = "telegraph";
            z.pounceT = stDef2.screamTelegraphSec || 1.5;
            setStalkerOpacity(z, true);
            var panSt = Math.max(-1, Math.min(1, ((gp.x - playerPos.x) * pRightX + (gp.z - playerPos.z) * pRightZ) / Math.max(4, dist)));
            if (FPS.audio && FPS.audio.sfxStalkerHiss) FPS.audio.sfxStalkerHiss(panSt);
            if (G) G.stalkerCueT = Math.max(G.stalkerCueT || 0, 1.5);
            if (FPS.ui && typeof FPS.ui.showStalkerWarn === "function") {
              FPS.ui.showStalkerWarn();
            } else {
              var sd = document.getElementById("shadowDash");
              if (sd) sd.style.opacity = "0.85";
            }
          }
        } else if (z.pounceState === "telegraph") {
          z.pounceT -= dt;
          speedMul *= 0.32;
          if (z.pounceT <= 0) {
            z.pounceState = "pounce";
            z.pounceT = 0.65;
          }
        } else if (z.pounceState === "pounce") {
          z.pounceT -= dt;
          speedMul *= (stDef2.pounceSpdMul || 1.85);
          if (dist < 1.55 * sc && Math.abs((gp.y || 0) - pFootY) <= 1.65) {
            if (FPS.game && FPS.game.hurtPlayer) FPS.game.hurtPlayer(z.dmg, gp.x, gp.z);
            z.pounceState = "prowl";
            z.pounceCd = stDef2.pounceCd || 5.5;
            setStalkerOpacity(z, false);
          } else if (z.pounceT <= 0) {
            z.pounceState = "prowl";
            z.pounceCd = stDef2.pounceCd || 5.5;
            setStalkerOpacity(z, false);
          }
        }
      }

      if (z.bashCd > 0) z.bashCd -= dt;
      var bashingBarricade = false;
      if (z.spawnT <= 0 && (dist > 1.25 * sc * 0.8 || Math.abs(pFootY - z.baseY) > 0.7)) {
        var prevX = gp.x, prevZ = gp.z;
        var goalDx = dx, goalDz = dz2, goalDist = dist;
        if (_findRampTarget(gp.x, gp.z, z.baseY, playerPos.x, playerPos.z, pFootY, 0.52 * sc)) {
          goalDx = _rampTargetOut.x - gp.x;
          goalDz = _rampTargetOut.z - gp.z;
          goalDist = Math.hypot(goalDx, goalDz) || 0.01;
          nxP = goalDx / goalDist;
          nzP = goalDz / goalDist;
          moveDirX = nxP;
          moveDirZ = nzP;
        } else if (z.type === "stalker" && z.pounceState === "prowl" && dist > 6.5) {
          var flX = nxP - nzP * z.steerDir * 0.45;
          var flZ = nzP + nxP * z.steerDir * 0.45;
          var flLen = Math.hypot(flX, flZ) || 1;
          moveDirX = flX / flLen;
          moveDirZ = flZ / flLen;
        }
        var keepOnDeck = _navKeepDeck;
        var keepPlat = _navKeepPlat;
        var wasSteerBias = z.steerBias > 0;

        var step = z.speed * speedMul * dt;
        if (wasSteerBias) {
          z.steerBias = Math.max(0, z.steerBias - dt);
          var bx = nxP * 0.35 + z.lastTangX * 0.65;
          var bz = nzP * 0.35 + z.lastTangZ * 0.65;
          var bl = Math.sqrt(bx * bx + bz * bz) || 1;
          moveDirX = bx / bl;
          moveDirZ = bz / bl;
        }

        gp.x += moveDirX * step;
        gp.z += moveDirZ * step;
        if (keepOnDeck) _clampStepToDeck(gp, prevX, prevZ, z.baseY, keepPlat);
        var preGroundY = W.groundY ? W.groundY(gp.x, gp.z, z.baseY) : z.baseY;
        if (keepOnDeck && preGroundY < z.baseY) preGroundY = z.baseY;
        var col = W.collide(gp, 0.52 * sc, true, preGroundY);

        // Read col.barricade IMMEDIATELY before tangent W.collide overwrites _colOut!
        if (col && col.hit && col.barricade && col.barricade.alive) {
          bashingBarricade = true;
          var brRef = col.barricade;
          moveDirX = (brRef.x - gp.x);
          moveDirZ = (brRef.z - gp.z);
          var brL = Math.hypot(moveDirX, moveDirZ) || 1;
          moveDirX /= brL;
          moveDirZ /= brL;
          if (z.bashCd <= 0) {
            var bCfg = FPS.BARRICADES || {};
            z.bashCd = bCfg.zombieBashCd || 0.85;
            z.atkT = 0.32;
            var bashDmg = bCfg.zombieBashDmg || 36;
            if (W.damageBarricade) {
              var bRes = W.damageBarricade(brRef.idx, bashDmg);
              _burstV.set(brRef.x, (brRef.y || 0) + 0.8, brRef.z);
              burst(_burstV, 0x8b6239, 5);
              if (bRes && bRes.destroyed) {
                if (FPS.audio && FPS.audio.sfxBarricadeBreak) FPS.audio.sfxBarricadeBreak();
                if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast(FPS.t("barricadeBroken"), 1600);
              } else if (FPS.audio && FPS.audio.sfxBarricadeHit) {
                FPS.audio.sfxBarricadeHit();
              }
            }
          }
        } else if (col && col.hit) {
          var cnx = col.nx, cnz = col.nz;
          var t1x = -cnz, t1z = cnx;
          var dot1 = t1x * nxP + t1z * nzP;
          if (z.stallT === 0 && z.steerBias <= 0.02 && Math.abs(dot1) > 0.22) {
            z.steerDir = dot1 >= 0 ? 1 : -1;
          }
          var tx = t1x * z.steerDir;
          var tz = t1z * z.steerDir;
          gp.x += tx * step * 0.92;
          gp.z += tz * step * 0.92;
          if (keepOnDeck) _clampStepToDeck(gp, prevX, prevZ, z.baseY, keepPlat);
          W.collide(gp, 0.52 * sc, true, preGroundY);

          z.lastTangX = tx;
          z.lastTangZ = tz;
          z.steerBias = 0.26;
          moveDirX = tx;
          moveDirZ = tz;

          var mvx = gp.x - prevX, mvz = gp.z - prevZ;
          if (mvx * mvx + mvz * mvz < (step * 0.3) * (step * 0.3)) {
            z.stallT += dt;
            if (z.stallT > 0.7) {
              z.steerDir = -z.steerDir;
              z.stallT = 0;
              z.lastTangX = t1x * z.steerDir;
              z.lastTangZ = t1z * z.steerDir;
              z.steerBias = 0.48;
            }
          } else {
            z.stallT = Math.max(0, z.stallT - dt * 0.5);
          }
        } else if (!wasSteerBias) {
          z.stallT = Math.max(0, z.stallT - dt);
        }

        if (bashingBarricade || z.hitT > 0 || z.atkT > 0 || (z.type === "stalker" && z.pounceState === "telegraph")) {
          z._progX = gp.x;
          z._progZ = gp.z;
          z._progT = 0;
        } else if (z._progT < 0) {
          z._progX = gp.x;
          z._progZ = gp.z;
          z._progT = 0;
        } else {
          z._progT += dt;
          var minProg = Math.max(0.75, z.speed * speedMul * 0.45);
          if (Math.hypot(gp.x - z._progX, gp.z - z._progZ) >= minProg) {
            z._progX = gp.x;
            z._progZ = gp.z;
            z._progT = 0;
          } else if (z._progT > 0.85 / Math.max(0.35, speedMul)) {
            z.steerDir = -z.steerDir;
            z.stallT = 0;
            z._progX = gp.x;
            z._progZ = gp.z;
            z._progT = 0;
            if (z.lastTangX !== 0 || z.lastTangZ !== 0) {
              z.lastTangX = -z.lastTangX;
              z.lastTangZ = -z.lastTangZ;
            } else {
              z.lastTangX = -nzP * z.steerDir;
              z.lastTangZ = nxP * z.steerDir;
            }
            z.steerBias = 0.65;
          }
        }

        if (keepOnDeck) _clampStepToDeck(gp, prevX, prevZ, z.baseY, keepPlat);
        // Update groundY after horizontal step
        var postGY = W.groundY ? W.groundY(gp.x, gp.z, z.baseY) : 0;
        if (postGY >= z.baseY - 0.08) {
          z.baseY = postGY;
          gp.y = postGY;
          z.vy = 0;
        }
      }

      z.group.rotation.y = Math.atan2(moveDirX, moveDirZ);
      if (z.model) {
        zombieModelAnim(z, dt, dist, frameNo || 0, pFwdX, pFwdZ, playerPos);
      } else if (z.spawnT > 0) {
        z.spawnT -= dt;
        if (z.spawnT <= 0) {
          z.spawnT = 0;
          gp.y = z.baseY;
        } else {
          gp.y = z.baseY - 1.8 * z.group.scale.y * Math.max(0, z.spawnT / 1.1);
        }
      } else {
        gp.y = z.baseY;
      }

      var showBar = !z.dead && (z.hp < z.maxHp || z.isBoss) && dist <= 24;
      z.barG.visible = showBar;
      if (showBar && barCount < ZBAR_MAX) {
        var hpFrac = Math.max(0.001, z.hp / z.maxHp);
        _zBarPos.set(gp.x, (gp.y || 0) + 2.15 * sc, gp.z);
        _zBarScale.set(sc, sc, sc);
        _zBarMat4.compose(_zBarPos, camQuat, _zBarScale);
        _zBarBgInst.setMatrixAt(barCount, _zBarMat4);

        _zBarPos.x += pFwdX * 0.01;
        _zBarPos.z += pFwdZ * 0.01;
        _zBarScale.set(sc * hpFrac, sc, sc);
        _zBarMat4.compose(_zBarPos, camQuat, _zBarScale);
        _zBarFgInst.setMatrixAt(barCount, _zBarMat4);
        _zBarFgInst.setColorAt(barCount, z.isBoss ? _zBarBossCol : _zBarNormCol);
        barCount++;
      }

      if (z.graceT > 0) z.graceT -= dt;
      if (z.atkCd > 0) z.atkCd -= dt;
      if (!bashingBarricade && z.spawnT <= 0 && z.graceT <= 0 && dist < 1.45 * sc && Math.abs((gp.y || 0) - pFootY) <= 1.65 && z.atkCd <= 0) {
        z.atkCd = 0.85;
        z.atkT = 0.32;
        if (FPS.game && FPS.game.hurtPlayer) FPS.game.hurtPlayer(z.dmg, gp.x, gp.z);
      }

      if (z.isBoss && z.spawnT <= 0) {
        z.roarT -= dt;
        if (z.roarT <= 0) triggerBossRoar(z);
      }
      if (z.isBoss && bossRef === z) {
        if (!_bossWrapEl || !_bossWrapEl.isConnected) _bossWrapEl = document.getElementById("bossWrap");
        if (!_bossBarEl || !_bossBarEl.isConnected) _bossBarEl = document.getElementById("bossBar");
        if (_bossWrapEl) _bossWrapEl.classList.remove("hidden");
        if (_bossBarEl) {
          var bPct = Math.max(0, (z.hp / z.maxHp) * 100).toFixed(1) + "%";
          if (_lastBossPctStr !== bPct) {
            _lastBossPctStr = bPct;
            _bossBarEl.style.width = bPct;
          }
        }
      }
    }

    if (barCount > 0 || _prevBarCount > 0) {
      for (var zbi2 = barCount; zbi2 < _prevBarCount; zbi2++) {
        _zBarBgInst.setMatrixAt(zbi2, _zeroMat4);
        _zBarFgInst.setMatrixAt(zbi2, _zeroMat4);
      }
      _zBarBgInst.instanceMatrix.needsUpdate = true;
      _zBarFgInst.instanceMatrix.needsUpdate = true;
      if (_zBarFgInst.instanceColor) _zBarFgInst.instanceColor.needsUpdate = true;
      _zBarBgInst.visible = barCount > 0;
      _zBarFgInst.visible = barCount > 0;
      _prevBarCount = barCount;
    }
  }

  function updateEntities(dt, now, playing, frameNo, realDt) {
    var G = getG();
    var playerPos = getP();
    var rdt = realDt || dt;

    if (playing && G && playerPos) {
      var pFootY = Math.max(0, playerPos.y - 1.7);
      updateFireZones(dt, now);
      updateAcidPools(rdt, now);

      if (G.hsTimer > 0) {
        G.hsTimer -= rdt;
        if (G.hsTimer <= 0) {
          G.hsTimer = 0;
          G.hsStreak = 0;
          G.hsMult = 1;
        }
      }
      if (G.acidBlindT > 0) {
        G.acidBlindT = Math.max(0, G.acidBlindT - rdt);
        if (!(FPS.ui && typeof FPS.ui.showBloaterBlind === "function")) {
          var bv = document.getElementById("blackoutVeil");
          if (bv) bv.style.opacity = G.acidBlindT > 0 ? Math.min(0.92, (G.acidBlindT / 1.8) * 0.92).toFixed(2) : "0";
        }
      }
      if (G.stalkerCueT > 0) {
        G.stalkerCueT = Math.max(0, G.stalkerCueT - rdt);
        if (!(FPS.ui && typeof FPS.ui.showStalkerWarn === "function")) {
          var sd = document.getElementById("shadowDash");
          if (sd) sd.style.opacity = G.stalkerCueT > 0 ? Math.min(0.85, (G.stalkerCueT / 1.5) * 0.85).toFixed(2) : "0";
        }
      }

      // Supply Nodes (+45 HP / Shotgun +12 / Rifle +45, 45s respawn)
      var supNodes = W.supplyNodes || [];
      var sgMax = Math.round(FPS.WEAPONS.shotgun.reserve * (G.reserveMul || 1));
      var rfMax = Math.round(FPS.WEAPONS.rifle.reserve * (G.reserveMul || 1));
      for (var si = 0; si < supNodes.length; si++) {
        var sp = supNodes[si];
        if (!sp.alive) {
          sp.respawnT -= dt;
          if (sp.respawnT <= 0) {
            sp.respawnT = 0;
            sp.alive = true;
            if (sp.mesh) sp.mesh.visible = true;
          }
          continue;
        }
        var sdx = sp.x - playerPos.x, sdz = sp.z - playerPos.z;
        if (sdx * sdx + sdz * sdz < 4.0 && Math.abs((sp.y || 0) - pFootY) <= 1.35) {
          sp.alive = false;
          sp.respawnT = 45;
          if (sp.mesh) sp.mesh.visible = false;
          if (sp.kind === "med") {
            G.hp = Math.min(G.maxHp, G.hp + 45);
          } else if (sp.kind === "ammo") {
            wState.shotgun.reserve = Math.min(sgMax, wState.shotgun.reserve + 12);
            wState.rifle.reserve = Math.min(rfMax, wState.rifle.reserve + 45);
          } else {
            G.hp = Math.min(G.maxHp, G.hp + 45);
            wState.shotgun.reserve = Math.min(sgMax, wState.shotgun.reserve + 12);
            wState.rifle.reserve = Math.min(rfMax, wState.rifle.reserve + 45);
          }
          if (FPS.audio && FPS.audio.sfxPickup) FPS.audio.sfxPickup();
          if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast("✚ " + FPS.t("pickSupply"), 2000);
          else if (FPS.ui && FPS.ui.announce) FPS.ui.announce("", FPS.t("pickSupply"));
          if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
        }
      }

      // Zombie Drop Pickups
      for (var i = pickups.length - 1; i >= 0; i--) {
        var pk = pickups[i];
        pk.t += dt * 3;
        pk.g.position.y = (pk.baseY || 0) + Math.sin(pk.t) * 0.06;
        pk.g.rotation.y += dt * 1.5;
        var pkx = pk.g.position.x - playerPos.x, pkz = pk.g.position.z - playerPos.z;
        if (pkx * pkx + pkz * pkz < 1.96 && Math.abs((pk.baseY || 0) - pFootY) <= 1.35) {
          if (pk.kind === "med" && G.hp < G.maxHp) {
            G.hp = Math.min(G.maxHp, G.hp + 35);
            if (FPS.audio && FPS.audio.sfxPickup) FPS.audio.sfxPickup();
            if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast("✚ " + FPS.t("pickHeal"), 1600);
            W.scene.remove(pk.g);
            pickups.splice(i, 1);
            if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
          } else if (pk.kind === "ammo") {
            wState.shotgun.reserve = Math.min(sgMax, wState.shotgun.reserve + 12);
            wState.rifle.reserve = Math.min(rfMax, wState.rifle.reserve + 60);
            if (FPS.audio && FPS.audio.sfxPickup) FPS.audio.sfxPickup();
            if (FPS.ui && FPS.ui.showToast) FPS.ui.showToast("▣ " + FPS.t("pickAmmo"), 1600);
            W.scene.remove(pk.g);
            pickups.splice(i, 1);
            if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
          }
        }
      }
    }

    updateZombies(dt, playing, frameNo);

    // Pooled FX ticks
    if (tracers.length > 0) {
      var trDirty = false;
      for (var ti = tracers.length - 1; ti >= 0; ti--) {
        var tr = tracers[ti];
        tr.t -= dt;
        if (tr.t <= 0) {
          tr.active = false;
          var b = tr.idx * 6;
          _tracerPosArr[b] = _tracerPosArr[b + 1] = _tracerPosArr[b + 2] = 0;
          _tracerPosArr[b + 3] = _tracerPosArr[b + 4] = _tracerPosArr[b + 5] = 0;
          tracers.splice(ti, 1);
          trDirty = true;
        }
      }
      if (trDirty) _tracerGeo.attributes.position.needsUpdate = true;
      _tracerMesh.visible = tracers.length > 0;
    }
    if (particles.length > 0 || _partMatDirty) {
      for (var pi = particles.length - 1; pi >= 0; pi--) {
        var pp = particles[pi];
        pp.t -= dt;
        if (pp.t <= 0) {
          pp.active = false;
          partInst.setMatrixAt(pp.idx, _zeroMat4);
          particles.splice(pi, 1);
        } else {
          pp.vy -= 6 * dt;
          pp.x += pp.vx * dt;
          pp.y += pp.vy * dt;
          pp.z += pp.vz * dt;
          _pMat4.makeTranslation(pp.x, pp.y, pp.z);
          partInst.setMatrixAt(pp.idx, _pMat4);
        }
      }
      partInst.instanceMatrix.needsUpdate = true;
      if (_partColorDirty && partInst.instanceColor) {
        partInst.instanceColor.needsUpdate = true;
        _partColorDirty = false;
      }
      _partMatDirty = false;
      partInst.visible = particles.length > 0;
    }
    if (casingsLive.length > 0 || _casingMatDirty) {
      for (var ci = casingsLive.length - 1; ci >= 0; ci--) {
        var cc = casingsLive[ci];
        cc.t -= dt;
        if (cc.t <= 0) {
          cc.active = false;
          casingInst.setMatrixAt(cc.idx, _zeroMat4);
          casingsLive.splice(ci, 1);
        } else {
          cc.vy -= 9 * dt;
          cc.x += cc.vx * dt;
          cc.y += cc.vy * dt;
          cc.z += cc.vz * dt;
          cc.rotX += cc.rx * dt;
          cc.rotZ += cc.rz * dt;
          _cPos.set(cc.x, cc.y, cc.z);
          _cEuler.set(cc.rotX, 0, cc.rotZ);
          _cQuat.setFromEuler(_cEuler);
          _cScale.setScalar(cc.scale);
          _cMat4.compose(_cPos, _cQuat, _cScale);
          casingInst.setMatrixAt(cc.idx, _cMat4);
        }
      }
      casingInst.instanceMatrix.needsUpdate = true;
      _casingMatDirty = false;
      casingInst.visible = casingsLive.length > 0;
    }
    for (var bi = boomRings.length - 1; bi >= 0; bi--) {
      var br = boomRings[bi];
      br.t -= dt;
      if (br.t <= 0) {
        br.active = false;
        br.m.visible = false;
        boomRings.splice(bi, 1);
      } else {
        var prog = 1 - br.t / br.dur;
        br.m.scale.setScalar(0.6 + prog * 7.6);
        br.m.material.opacity = Math.max(0, (1 - prog) * 0.9);
      }
    }
    for (var di = 0; di < dmgPool.length; di++) {
      var dp = dmgPool[di];
      if (dp.t > 0) {
        dp.t -= dt;
        if (dp.t <= 0) {
          if (!dp.hidden) {
            dp.el.style.display = "none";
            dp.hidden = true;
          }
          continue;
        }
        dp.wp.y += dt * 0.9;
        _tmpV.copy(dp.wp).project(W.camera);
        if (_tmpV.z < 1) {
          var sx = ((_tmpV.x * 0.5 + 0.5) * innerWidth).toFixed(1);
          var sy = ((-_tmpV.y * 0.5 + 0.5) * innerHeight).toFixed(1);
          if (dp.hidden) {
            dp.el.style.display = "block";
            dp.hidden = false;
          }
          dp.el.style.transform = "translate3d(" + sx + "px," + sy + "px,0) translate(-50%,-50%)";
          dp.el.style.opacity = Math.min(1, dp.t * 2).toFixed(2);
        } else if (!dp.hidden) {
          dp.el.style.display = "none";
          dp.hidden = true;
        }
      }
    }
  }

  function updateGunAnim(dt, now, G) {
    if (swordSwingT > 0) swordSwingT = Math.max(0, swordSwingT - dt);
    if (switchT > 0) switchT = Math.max(0, switchT - dt);
    if (shoveAnimT > 0) shoveAnimT = Math.max(0, shoveAnimT - dt);
    return {
      gunBase: gunBase,
      gunParts: gunParts,
      swordSwingT: swordSwingT,
      switchT: switchT,
      shoveT: shoveAnimT
    };
  }

  var api = {
    buildGun: buildGun,
    onGunLoaded: onGunLoaded,
    prewarmZombiePool: prewarmZombiePool,
    switchWeapon: switchWeapon,
    resetWeapons: resetWeapons,
    getWeaponStats: getWeaponStats,
    getWeaponTier: getWeaponTier,
    isWeaponUnlocked: isWeaponUnlocked,
    unlockWeapon: unlockWeapon,
    upgradeWeapon: upgradeWeapon,
    applyArmorShield: applyArmorShield,
    shove: shove,
    spawnAcidPool: spawnAcidPool,
    clearAcidPools: clearAcidPools,
    spawnDecal: spawnDecal,
    clearDecals: clearDecals,
    clearSpecialFX: clearSpecialFX,
    clearAutoReload: clearAutoReloadTimer,
    shoot: shoot,
    startReload: startReload,
    finishReload: finishReload,
    explodeBarrel: explodeBarrel,
    throwFlare: throwFlare,
    spawnZombie: spawnZombie,
    triggerBossRoar: triggerBossRoar,
    damageZombie: damageZombie,
    killZombie: killZombie,
    updateZombies: updateZombies,
    updateEntities: updateEntities,
    updateFireZones: updateFireZones,
    updateGunAnim: updateGunAnim,
    clearZombies: clearZombies,
    clearFireZones: clearFireZones,
    setParticleMul: setParticleMul,
    zombies: zombies,
    pickups: pickups,
    fireZones: fireZones,
    acidPools: acidPools
  };

  Object.defineProperty(api, "curWeapon", {
    get: function () { return curWeapon; },
    set: function (v) { curWeapon = v; }
  });
  Object.defineProperty(api, "wState", {
    get: function () { return wState; }
  });
  Object.defineProperty(api, "bossRef", {
    get: function () { return bossRef; },
    set: function (v) { bossRef = v; }
  });

  // Preserve required globals
  window.switchWeapon = switchWeapon;
  window.spawnZombie = spawnZombie;
  window.shoot = shoot;

  return api;
})();
