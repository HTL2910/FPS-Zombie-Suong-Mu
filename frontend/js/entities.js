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

  // Weapon state
  var wState = {};
  var curWeapon = "pistol";
  function resetWeapons(reserveMul) {
    var rm = reserveMul || 1;
    var WEAPONS = FPS.WEAPONS;
    wState = {
      pistol: { mag: WEAPONS.pistol.mag, reserve: Infinity },
      shotgun: { mag: WEAPONS.shotgun.mag, reserve: Math.round(WEAPONS.shotgun.reserve * rm) },
      rifle: { mag: WEAPONS.rifle.mag, reserve: Math.round(WEAPONS.rifle.reserve * rm) },
      thuanthien: { mag: WEAPONS.thuanthien.mag, reserve: Infinity }
    };
  }
  resetWeapons(1);

  // Viewmodel
  var gunParts = {};
  var gunBase = { x: 0.34, y: -0.34 };
  var swordSwingT = 0;
  var switchT = 0;

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

    if (useGLB && W.GUN_T && W.GUN_T[kind]) {
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
      isGLB: !!(useGLB && W.GUN_T && W.GUN_T[kind])
    };
  }

  function _cacheGun(kind, forceReplace) {
    var hasGLB = !!(W.GUN_T && W.GUN_T[kind]);
    var old = _gunCache[kind];
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
    if (gunParts.flash) gunParts.flash.material.opacity = 0;
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
  var partGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  var casingGeo = new THREE.BoxGeometry(0.018, 0.018, 0.05);
  var boomRingGeo = new THREE.RingGeometry(0.65, 1.0, 28);
  var _pMat4 = new THREE.Matrix4();
  var _zeroMat4 = new THREE.Matrix4().makeScale(0, 0, 0);
  var _pCol = new THREE.Color(0xffffff);
  var _partColorDirty = false;
  var _partMatDirty = false;
  var _cPos = new THREE.Vector3();
  var _cEuler = new THREE.Euler();
  var _cQuat = new THREE.Quaternion();
  var _cScale = new THREE.Vector3();
  var _cMat4 = new THREE.Matrix4();
  var _casingMatDirty = false;

  for (var i = 0; i < 16; i++) {
    var lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    var l = new THREE.Line(lGeo, new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85 }));
    l.frustumCulled = false;
    l.visible = false;
    W.scene.add(l);
    tracerPool.push({ l: l, active: false, t: 0 });
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

  function addTracer(a, b) {
    var rec = null;
    for (var i = 0; i < tracerPool.length; i++) {
      if (!tracerPool[i].active) { rec = tracerPool[i]; break; }
    }
    if (!rec) return;
    var pa = rec.l.geometry.attributes.position.array;
    pa[0] = a.x; pa[1] = a.y; pa[2] = a.z;
    pa[3] = b.x; pa[4] = b.y; pa[5] = b.z;
    rec.l.geometry.attributes.position.needsUpdate = true;
    rec.l.material.opacity = 0.85;
    rec.l.visible = true;
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

  function spawnBoomRing(x, z) {
    var rec = null;
    for (var i = 0; i < boomPool.length; i++) {
      if (!boomPool[i].active) { rec = boomPool[i]; break; }
    }
    if (!rec) return;
    rec.active = true;
    rec.t = rec.dur;
    rec.m.position.set(x, 0.08, z);
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

  function zombieStats(type) {
    var G = getG();
    var lv = G ? (G.levelIdx || 0) : 0;
    var table = {
      normal: { hp: 62, speed: 2.25, dmg: 11, score: 100 },
      runner: { hp: 44, speed: 4.35, dmg: 8, score: 150 },
      brute: { hp: 230, speed: 1.6, dmg: 22, score: 300 },
      orcking: { hp: 980, speed: 2.05, dmg: 28, score: 1500 },
      minotaur: { hp: 1450, speed: 2.2, dmg: 34, score: 2500 },
      boss: { hp: 1100, speed: 2.05, dmg: 30, score: 2000 }
    };
    var st = table[type] || table.normal;
    var isB = isBossType(type);
    var hp = isB ? st.hp : Math.round(st.hp * (1 + lv * 0.18));
    var spd = st.speed * (1 + lv * 0.04) * (0.92 + Math.random() * 0.16);
    return { hp: hp, speed: spd, dmg: st.dmg, score: st.score };
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

    var want;
    if (z.spawnT > 0) {
      z.spawnT -= dt;
      if (z.spawnT <= 0) {
        z.spawnT = 0;
        z.group.position.y = 0;
      } else {
        var sr = Math.max(0, z.spawnT / 1.1);
        z.group.position.y = -1.8 * z.group.scale.y * sr * sr;
      }
      want = "idle";
    } else {
      z.group.position.y = 0;
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
          W.collide(z.group.position, 0.52 * z.group.scale.x, true);
        }
      } else if (z.hitT > 0) {
        z.hitT -= dt;
        want = "hit";
      } else if (dist > 1.3) {
        want = z.type === "runner"
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

  var _zBarBgGeo = new THREE.PlaneGeometry(0.85, 0.11);
  var _zBarFgGeo = new THREE.PlaneGeometry(0.8, 0.075);
  var _zBarBgMat = new THREE.MeshBasicMaterial({ color: 0x101010, side: THREE.DoubleSide, depthTest: false });
  var _zBarFgMat = new THREE.MeshBasicMaterial({ color: 0x7ec850, side: THREE.DoubleSide, depthTest: false });
  var _zBarBossFgMat = new THREE.MeshBasicMaterial({ color: 0xff3020, side: THREE.DoubleSide, depthTest: false });

  function makeZombie(type) {
    var isBoss = isBossType(type);
    var sc = isBoss ? 2.2 : (type === "brute" ? 1.5 : (type === "runner" ? 0.95 : 1.0));
    var id = _zCounter++;
    var key;
    if (type === "runner") key = "skeleton";
    else if (type === "minotaur") key = "minotaur";
    else if (isBoss) key = "orcking";
    else if (type === "brute") {
      var _bk = ["golem", "troll", "minotaur"];
      key = _bk[id % _bk.length];
      if (!W.ZB_T[key]) key = "golem";
    } else {
      key = (id % 3 === 2) ? "ghost" : "zombie";
    }

    var tpl = (W.ZB_T && (W.ZB_T[key] || W.ZB_T.zombie)) || null;
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
          o.userData.origMat = o.material;
          meshes.push(o);
        }
      });
      g.add(model);
      modelObj = { mixer: mixer, acts: acts, cur: "" };
    } else {
      var fbMat = new THREE.MeshLambertMaterial({ color: isBoss ? 0x8f2222 : 0x5d7350 });
      var fb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), fbMat);
      fb.position.y = 0.9;
      fb.userData.origMat = fbMat;
      meshes.push(fb);
      g.add(fb);
    }

    var barG = new THREE.Group();
    barG.position.y = 2.15;
    barG.visible = isBoss;
    g.add(barG);
    var barBg = new THREE.Mesh(_zBarBgGeo, _zBarBgMat);
    barBg.renderOrder = 5;
    barG.add(barBg);
    var barFg = new THREE.Mesh(_zBarFgGeo, isBoss ? _zBarBossFgMat : _zBarFgMat);
    barFg.renderOrder = 6;
    barFg.position.z = 0.005;
    barG.add(barFg);

    g.scale.setScalar(sc);
    W.scene.add(g);

    var _st = zombieStats(type);
    var z = {
      _id: id,
      type: type,
      key: key,
      modelKey: key,
      name: FPS.t(isBoss && type === "minotaur" ? "bossNameMino" : (isBoss ? "bossNameOrc" : "bossName")),
      isBoss: isBoss,
      group: g,
      meshes: meshes,
      barG: barG,
      barFg: barFg,
      hp: _st.hp,
      maxHp: _st.hp,
      speed: _st.speed,
      dmg: _st.dmg,
      score: _st.score,
      hitR: 0.56 * sc,
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
      _flashing: false,
      phase: Math.random() * 10,
      model: modelObj,
      walkName: _wn
    };
    if (modelObj) playZombieAct(z, "idle", 0);
    return z;
  }

  function resetZombie(z) {
    var isBoss = isBossType(z.type);
    var sc = isBoss ? 2.2 : (z.type === "brute" ? 1.5 : (z.type === "runner" ? 0.95 : 1.0));
    var st = zombieStats(z.type);
    z.isBoss = isBoss;
    z.hitR = 0.56 * sc;
    z.hp = st.hp;
    z.maxHp = st.hp;
    z.speed = st.speed;
    z.dmg = st.dmg;
    z.score = st.score;
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
    z.phase = Math.random() * 10;
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
    "brute", "brute"
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
    var _zp = zombiePool[type];
    var z = (_zp && _zp.length) ? _zp.pop() : null;
    if (z) resetZombie(z);
    else z = makeZombie(type);

    var playerPos = getP();
    var pt = pickSpawnPoint(playerPos);
    z.group.position.set(pt.x, 0, pt.z);
    W.collide(z.group.position, 0.52 * z.group.scale.x, true);
    z.group.position.y = -1.8 * z.group.scale.y;
    z.spawnT = 1.1;

    _burstV.set(z.group.position.x, 0.4, z.group.position.z);
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
    _burstV.set(gp.x, 0.7, gp.z);
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
        rz.group.position.set(rx, 0, rzp);
        W.collide(rz.group.position, 0.52 * rz.group.scale.x, true);
        rz.group.position.y = -1.8 * rz.group.scale.y * 0.45;
        rz.spawnT = 0.55;
        rz.graceT = 0.5;
        _burstV.set(rz.group.position.x, 0.3, rz.group.position.z);
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

  function dropPickup(x, z) {
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
    g.position.set(x, 0, z);
    W.scene.add(g);
    pickups.push({ g: g, kind: kind, t: Math.random() * 5 });
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
    if (!G || !playerPos || G.state !== "playing" || G.flareCd > 0) return false;
    G.flareCd = 12 * (G.flareCdMul || 1);

    var fx = -Math.sin(G.yaw);
    var fz = -Math.cos(G.yaw);
    var tmp = _sv1.set(playerPos.x, 1.7, playerPos.z);
    for (var step = 0; step < 10; step++) {
      tmp.x += fx * 0.8;
      tmp.z += fz * 0.8;
      var col = W.collide(tmp, 0.4, false);
      if (col && col.hit) break;
    }
    var halfA = (W.currentLevel ? W.currentLevel.arena / 2 : 30) - 2.2;
    var tx = Math.max(-halfA, Math.min(halfA, tmp.x));
    var tz = Math.max(-halfA, Math.min(halfA, tmp.z));

    addTracer(_sv2.set(playerPos.x + fx * 0.5, playerPos.y - 0.15, playerPos.z + fz * 0.5), _sv3.set(tx, 0.2, tz));
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
      zone.z = tz;
      zone.g.position.set(tx, 0, tz);
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
        _burstV.set(z.x + Math.cos(a) * rad, 0.25, z.z + Math.sin(a) * rad);
        burst(_burstV, 0xff7b22, 2);
      }

      z.tickT -= dt;
      while (z.tickT <= 0) {
        z.tickT += 0.4;
        for (var zi = zombies.length - 1; zi >= 0; zi--) {
          var zb = zombies[zi];
          if (zb.dead) continue;
          var gp = zb.group.position;
          var rx = gp.x - z.x, rz = gp.z - z.z;
          var rr = z.r + zb.hitR * 0.35;
          if (rx * rx + rz * rz <= rr * rr) {
            var pt = _hitPt.set(gp.x, 1.1 * zb.group.scale.y, gp.z);
            damageZombie(zb, 28 * dmgMul, false, pt);
            burst(pt, 0xff8c2a, 3);
          }
        }
        // Detonate live explosive barrels touched by fire zone
        var barrels = W.explosiveBarrels || [];
        for (var bi = 0; bi < barrels.length; bi++) {
          var b = barrels[bi];
          if (!b || !b.alive) continue;
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
    var G = getG();
    var playerPos = getP();
    if (G) {
      G.barrelsPopped = (G.barrelsPopped || 0) + 1;
      G.shake = Math.min(0.85, (G.shake || 0) + 0.52);
    }
    if (W.detonateBarrelVisual) W.detonateBarrelVisual(barrel);
    if (FPS.audio && FPS.audio.sfxExplosion) FPS.audio.sfxExplosion();

    _burstV.set(barrel.x, 0.75, barrel.z);
    burst(_burstV, 0xff5a18, 18);
    _burstV.set(barrel.x, 1.15, barrel.z);
    burst(_burstV, 0xffd84d, 10);
    spawnBoomRing(barrel.x, barrel.z);

    var baseDmg = 240 * (G ? (G.dmgMul || 1) : 1);
    for (var zi = zombies.length - 1; zi >= 0; zi--) {
      var zb = zombies[zi];
      if (!zb || zb.dead) continue;
      var zp = zb.group.position;
      var zx = zp.x - barrel.x, zz = zp.z - barrel.z;
      var dist2 = zx * zx + zz * zz;
      if (dist2 <= 64.0) {
        var dist = Math.sqrt(dist2);
        var falloff = Math.max(0.25, 1 - (dist / 8.0) * 0.75);
        var pt = _hitPt.set(zp.x, 1.1 * zb.group.scale.y, zp.z);
        damageZombie(zb, baseDmg * falloff, dist < 2.2, pt);
      }
    }

    if (playerPos && FPS.game && FPS.game.hurtPlayer) {
      var pdx = playerPos.x - barrel.x, pdz = playerPos.z - barrel.z;
      var pd2 = pdx * pdx + pdz * pdz;
      if (pd2 < 6.25) {
        var pDist = Math.sqrt(pd2);
        var selfDmg = Math.round(6 + 16 * (1 - pDist / 2.5));
        FPS.game.hurtPlayer(selfDmg, barrel.x, barrel.z);
      }
    }

    // Chain explosions (110ms) to live barrels within 7.5m
    var lvId = W.currentLevel ? W.currentLevel.id : 0;
    var barrels = W.explosiveBarrels || [];
    for (var bi = 0; bi < barrels.length; bi++) {
      var other = barrels[bi];
      if (other !== barrel && other.alive) {
        var ox = other.x - barrel.x, oz = other.z - barrel.z;
        if (ox * ox + oz * oz <= 56.25) {
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

  // Ray vs active explosive barrels (vertical cylinder r = (b.r||0.58)*1.12, y in [0..1.42])
  function raycastBarrels(origin, dir, maxDist) {
    var barrels = W.explosiveBarrels || [];
    var bestBarrel = null;
    var bestDist = maxDist;
    var a = dir.x * dir.x + dir.z * dir.z;

    for (var i = 0; i < barrels.length; i++) {
      var b = barrels[i];
      if (!b || !b.alive) continue;
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
            if (hy >= -0.05 && hy <= 1.42) {
              bestDist = tCyl;
              bestBarrel = b;
            }
          }
        }
      }
      if (dir.y < -0.04) {
        var tCap = (1.38 - origin.y) / dir.y;
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

  function shoot() {
    var G = getG();
    if (!G || G.state !== "playing" || G.reloading) return;
    var now = performance.now();
    var WDef = FPS.WEAPONS[curWeapon];
    var st = wState[curWeapon];
    if (now - G.lastShot < WDef.rate / (G.rateMul || 1)) return;

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
      var fwd = _sv2.set(0, 0, -1).applyQuaternion(W.camera.quaternion).setY(0).normalize();
      _svE.copy(origin).addScaledVector(fwd, 2.2);
      _svE.y = 1.2;
      burst(_svE, 0xffe478, 8);

      for (var zi = zombies.length - 1; zi >= 0; zi--) {
        var zz = zombies[zi];
        if (zz.dead) continue;
        var zp = zz.group.position;
        var dx = zp.x - origin.x, dz = zp.z - origin.z;
        var dist = Math.hypot(dx, dz);
        if (dist <= 5.8 && (dx * fwd.x + dz * fwd.z) / Math.max(0.01, dist) > 0.28) {
          _tmpDir.set(dx, 1.0 * zz.group.scale.y - origin.y, dz).normalize();
          var wallBlock = W.raycastWallDist ? W.raycastWallDist(origin, _tmpDir, dist) : dist;
          if (wallBlock >= dist - 0.35) {
            var pt = _hitPt.set(zp.x, 1.25 * zz.group.scale.y, zp.z);
            damageZombie(zz, WDef.dmg * (G.dmgMul || 1) * (0.9 + Math.random() * 0.25), dist < 3.2, pt);
            burst(pt, 0xffd54f, 6);
          }
        }
      }
      var barrelsM = W.explosiveBarrels || [];
      for (var bm = 0; bm < barrelsM.length; bm++) {
        var mb = barrelsM[bm];
        if (!mb || !mb.alive) continue;
        var bdx = mb.x - origin.x, bdz = mb.z - origin.z;
        var bdist = Math.hypot(bdx, bdz);
        if (bdist <= 4.0 && (bdx * fwd.x + bdz * fwd.z) / Math.max(0.01, bdist) > 0.35) {
          _tmpDir.set(bdx, 0.7 - origin.y, bdz).normalize();
          var bWall = W.raycastWallDist ? W.raycastWallDist(origin, _tmpDir, bdist) : bdist;
          if (bWall >= bdist - 0.35) {
            mb.hp -= WDef.dmg * (G.dmgMul || 1);
            if (mb.hp <= 0) explodeBarrel(mb);
          }
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
      var maxAllowedDist = Math.min(wallDist, barrelDist);

      var best = null;
      var bestDist = maxAllowedDist;
      for (var i = 0; i < zombies.length; i++) {
        var z = zombies[i];
        if (z.dead) continue;
        var zp = z.group.position;
        var center = _sv3.set(zp.x, 1.05 * z.group.scale.y, zp.z);
        var d = raycaster.ray.distanceToPoint(center);
        if (d < z.hitR) {
          var along = _sv4.copy(center).sub(origin).dot(dir);
          if (along > 0 && along < bestDist) {
            bestDist = along;
            best = { z: z, head: false, point: _hitPt.copy(origin).addScaledVector(dir, along) };
          }
        }
        var hc = _sv5.set(zp.x, 1.85 * z.group.scale.y, zp.z);
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
        var dmg = WDef.dmg * (G.dmgMul || 1) * (best.head ? 2 : 1) * (0.9 + Math.random() * 0.2);
        damageZombie(best.z, dmg, best.head, best.point);
      } else if (barrelHit && barrelDist < wallDist) {
        endDist = barrelDist;
        _hitPt.copy(origin).addScaledVector(dir, barrelDist);
        burst(_hitPt, 0xffaa33, 4);
        if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(false);
        barrelHit.barrel.hp -= WDef.dmg * (G.dmgMul || 1);
        if (barrelHit.barrel.hp <= 0) explodeBarrel(barrelHit.barrel);
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
      setTimeout(function () {
        var curG = getG();
        if (curG && curG.state === "playing") startReload();
      }, 250);
    }
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function damageZombie(z, dmg, head, point) {
    if (!z || z.dead) return;
    if (z.model && z.model.acts.hit) {
      z.model.acts.hit.stop();
      z.model.cur = "";
    }
    z.hp -= dmg;
    z.flashT = 0.09;
    z.hitT = head ? 0.42 : 0.28;
    setZombieFlash(z, true);
    if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(false);
    burst(point, 0xb01018, head ? 6 : 4);
    dmgNum(point, dmg, head);
    if (head && FPS.audio && FPS.audio.sfxHeadshot) FPS.audio.sfxHeadshot();
    else if (FPS.audio && FPS.audio.sfxHit) FPS.audio.sfxHit(false);
    if (z.hp <= 0 && !z.dead) killZombie(z);
  }

  function killZombie(z) {
    if (!z || z.dead) return;
    var G = getG();
    z.dead = true;
    z.deathT = 0;
    setZombieFlash(z, false);
    if (z.model) {
      for (var _dk in z.model.acts) z.model.acts[_dk].fadeOut(0.12);
      z.model.cur = "";
    }
    if (G) {
      G.levelKills = (G.levelKills || 0) + 1;
      G.totalKills = (G.totalKills || 0) + 1;
      G.score = (G.score || 0) + z.score;
    }
    if (FPS.ui && FPS.ui.showHitmarker) FPS.ui.showHitmarker(true);
    if (FPS.audio && FPS.audio.sfxHit) FPS.audio.sfxHit(true);
    _burstV.copy(z.group.position);
    _burstV.y = 1.2;
    burst(_burstV, 0x8f1420, 8);

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
    if (Math.random() < 0.22) dropPickup(z.group.position.x, z.group.position.z);
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function startReload() {
    var G = getG();
    if (!G || G.state !== "playing") return;
    var st = wState[curWeapon];
    var WDef = FPS.WEAPONS[curWeapon];
    if (WDef.melee || G.reloading || st.mag >= WDef.mag || st.reserve <= 0) return;
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
    var WDef = FPS.WEAPONS[curWeapon];
    var need = WDef.mag - st.mag;
    var take = st.reserve === Infinity ? need : Math.min(need, st.reserve);
    st.mag += take;
    if (st.reserve !== Infinity) st.reserve -= take;
    G.reloading = false;
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function switchWeapon(k) {
    if (!FPS.WEAPONS[k] || k === curWeapon) return;
    var G = getG();
    if (G) G.reloading = false;
    curWeapon = k;
    switchT = 0.28;
    buildGun(k);
    if (FPS.audio && FPS.audio.playTone) FPS.audio.playTone(400, 0.06, 0.12, "square");
    if (FPS.ui && FPS.ui.updateHUD) FPS.ui.updateHUD();
  }

  function clearZombies() {
    for (var i = 0; i < zombies.length; i++) {
      W.scene.remove(zombies[i].group);
      var pt = zombiePool[zombies[i].type] || (zombiePool[zombies[i].type] = []);
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
  }

  var _bossWrapEl = null;
  var _bossBarEl = null;
  var _lastBossPctStr = "";

  // Obstacle-steering Zombie AI + Boss Roar
  function updateZombies(dt, playing, frameNo) {
    var G = getG();
    var playerPos = getP();
    if (!playerPos) return;
    var pFwdX = G ? -Math.sin(G.yaw) : 0;
    var pFwdZ = G ? -Math.cos(G.yaw) : -1;

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

      var dx = playerPos.x - gp.x;
      var dz2 = playerPos.z - gp.z;
      var dist2 = dx * dx + dz2 * dz2;
      var dist = Math.sqrt(dist2) || 0.01;
      var sc = z.group.scale.x;
      var moveDirX = dx / dist;
      var moveDirZ = dz2 / dist;

      if (z.spawnT <= 0 && dist > 1.25 * sc * 0.8) {
        var prevX = gp.x, prevZ = gp.z;
        var step = z.speed * dt;
        var nxP = dx / dist, nzP = dz2 / dist;

        if (z.steerBias > 0) {
          z.steerBias = Math.max(0, z.steerBias - dt);
          var bx = nxP * 0.35 + z.lastTangX * 0.65;
          var bz = nzP * 0.35 + z.lastTangZ * 0.65;
          var bl = Math.sqrt(bx * bx + bz * bz) || 1;
          moveDirX = bx / bl;
          moveDirZ = bz / bl;
        }

        gp.x += moveDirX * step;
        gp.z += moveDirZ * step;
        var col = W.collide(gp, 0.52 * sc, true);
        if (col && col.hit) {
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
          W.collide(gp, 0.52 * sc, true);

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
        } else {
          z.stallT = Math.max(0, z.stallT - dt);
        }
      }

      z.group.rotation.y = Math.atan2(moveDirX, moveDirZ);
      if (z.model) {
        zombieModelAnim(z, dt, dist, frameNo || 0, pFwdX, pFwdZ, playerPos);
      } else if (z.spawnT > 0) {
        z.spawnT -= dt;
        if (z.spawnT <= 0) {
          z.spawnT = 0;
          gp.y = 0;
        } else {
          gp.y = -1.8 * z.group.scale.y * Math.max(0, z.spawnT / 1.1);
        }
      } else {
        gp.y = 0;
      }

      var showBar = !z.dead && (z.hp < z.maxHp || z.isBoss) && dist <= 24;
      z.barG.visible = showBar;
      if (showBar) {
        z.barG.lookAt(W.camera.position);
        z.barFg.scale.x = Math.max(0, z.hp / z.maxHp);
      }

      if (z.graceT > 0) z.graceT -= dt;
      if (z.atkCd > 0) z.atkCd -= dt;
      if (z.spawnT <= 0 && z.graceT <= 0 && dist < 1.45 * sc && z.atkCd <= 0) {
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
  }

  function updateEntities(dt, now, playing, frameNo) {
    var G = getG();
    var playerPos = getP();

    if (playing && G && playerPos) {
      updateFireZones(dt, now);

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
        if (sdx * sdx + sdz * sdz < 4.0) {
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
        pk.g.position.y = Math.sin(pk.t) * 0.06;
        pk.g.rotation.y += dt * 1.5;
        var pkx = pk.g.position.x - playerPos.x, pkz = pk.g.position.z - playerPos.z;
        if (pkx * pkx + pkz * pkz < 1.96) {
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
    for (var ti = tracers.length - 1; ti >= 0; ti--) {
      var tr = tracers[ti];
      tr.t -= dt;
      tr.l.material.opacity = Math.max(0, tr.t / 0.09) * 0.85;
      if (tr.t <= 0) { tr.active = false; tr.l.visible = false; tracers.splice(ti, 1); }
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
    return {
      gunBase: gunBase,
      gunParts: gunParts,
      swordSwingT: swordSwingT,
      switchT: switchT
    };
  }

  var api = {
    buildGun: buildGun,
    onGunLoaded: onGunLoaded,
    prewarmZombiePool: prewarmZombiePool,
    switchWeapon: switchWeapon,
    resetWeapons: resetWeapons,
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
    fireZones: fireZones
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
