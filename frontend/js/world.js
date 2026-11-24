"use strict";
window.FPS = window.FPS || {};

(function () {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = new THREE.FogExp2(0x0a0e13, 0.021);

  var camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 260);
  camera.position.set(0, 1.7, 40);

  var renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  var gameEl = document.getElementById("game");
  if (gameEl) gameEl.appendChild(renderer.domElement);

  var clock = new THREE.Clock();

  // Fast 3-light world rig + player flashlight (NEVER add per-lamp PointLights!)
  scene.add(new THREE.AmbientLight(0x8a97ad, 0.9));
  scene.add(new THREE.HemisphereLight(0x5a6c8c, 0x1a1c14, 0.95));
  var moonLight = new THREE.DirectionalLight(0xa9c0e0, 1.15);
  moonLight.position.set(-30, 50, -20);
  scene.add(moonLight);

  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false })
  );
  moon.position.set(-55, 62, -70);
  moon.matrixAutoUpdate = false;
  moon.updateMatrix();
  scene.add(moon);

  var moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(5.2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x5a6d8f, transparent: true, opacity: 0.25, fog: false })
  );
  moonGlow.position.copy(moon.position);
  moonGlow.matrixAutoUpdate = false;
  moonGlow.updateMatrix();
  scene.add(moonGlow);

  // Player Flashlight & Camera Fill/Muzzle Lights
  var flashlight = new THREE.SpotLight(0xfff2cf, 58, 54, 0.48, 0.45, 1.1);
  camera.add(flashlight);
  flashlight.position.set(0.25, -0.22, 0.1);
  var flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, 0, -10);
  camera.add(flashTarget);
  flashlight.target = flashTarget;
  scene.add(camera);

  var fillLight = new THREE.PointLight(0xbfd0e8, 2.8, 9, 1.2);
  camera.add(fillLight);
  fillLight.position.set(0, 0, 0.3);

  var muzzleLight = new THREE.PointLight(0xffc46b, 0, 10, 1.2);
  muzzleLight.position.set(0.3, -0.25, -1.1);
  camera.add(muzzleLight);

  // Viewmodel Scene
  var gunScene = new THREE.Scene();
  var gunCam = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 12);
  gunScene.add(new THREE.HemisphereLight(0x9fb3d4, 0x2a2620, 1.1));
  var _gunKey = new THREE.DirectionalLight(0xfff1d6, 1.6);
  _gunKey.position.set(0.7, 1.3, 0.5);
  gunScene.add(_gunKey);
  var gunMuzzle = new THREE.PointLight(0xffc46b, 0, 6, 1.2);
  gunMuzzle.position.set(0.3, -0.2, -1.0);
  gunScene.add(gunMuzzle);
  var gunGroup = new THREE.Group();
  gunGroup.position.set(0.34, -0.34, -0.62);
  gunScene.add(gunGroup);

  // Atmospheric particle clouds (persist across levels)
  function makePoints(n, size, color, op) {
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 160;
      arr[i * 3 + 1] = 0.5 + Math.random() * 11;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    var p = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: color, size: size, transparent: true, opacity: op, depthWrite: false })
    );
    scene.add(p);
    return p;
  }
  var dustPts = makePoints(120, 0.05, 0xfff2cf, 0.45);
  var rainPts = makePoints(280, 0.08, 0x9fc0e0, 0.3);

  // Level container & persistent world arrays
  var levelGroup = new THREE.Group();
  scene.add(levelGroup);

  var ZB_T = {};
  var GUN_T = {};
  var ENV_T = {};
  var ENV_DIM = {};
  var HIT_FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  var colliders = [];
  var bulletWalls = [];
  var explosiveBarrels = [];
  var supplyNodes = [];
  var streetLights = [];
  var wisps = [];

  // ---------------------------------------------------------------------------
  // Procedural Tiled Textures & Cached Materials (generated ONCE at startup)
  // ---------------------------------------------------------------------------
  function _makePRNG(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function _makeTiledTex(size, drawFn) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    drawFn(ctx, size);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  var lampGlowTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,220,160,1)");
    gr.addColorStop(0.35, "rgba(255,175,90,0.45)");
    gr.addColorStop(1, "rgba(255,150,60,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  })();

  var stoneTex = _makeTiledTex(256, function (ctx, S) {
    var rnd = _makePRNG(104729);
    ctx.fillStyle = "#2b2f2d";
    ctx.fillRect(0, 0, S, S);
    var rows = 4, rowH = S / rows;
    for (var r = 0; r < rows; r++) {
      var cols = (r % 2 === 0) ? 3 : 4;
      var colW = S / cols;
      var offset = (r % 2) * (colW * 0.5);
      for (var c = -1; c <= cols; c++) {
        var bx = c * colW + offset;
        var by = r * rowH;
        var v = 86 + Math.floor(rnd() * 24);
        ctx.fillStyle = "rgb(" + (v - 2) + "," + v + "," + (v - 3) + ")";
        ctx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(bx + 3, by + 3, colW - 6, 3);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(bx + 3, by + rowH - 6, colW - 6, 3);
      }
    }
    for (var i = 0; i < 1400; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "rgba(0,0,0,0.16)" : "rgba(180,195,180,0.08)";
      ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    for (var m = 0; m < 45; m++) {
      ctx.fillStyle = "rgba(62,82,54,0.22)";
      ctx.fillRect(rnd() * S, rnd() * S, 8 + rnd() * 14, 4 + rnd() * 8);
    }
  });

  var brickTex = _makeTiledTex(256, function (ctx, S) {
    var rnd = _makePRNG(224737);
    ctx.fillStyle = "#2b2421";
    ctx.fillRect(0, 0, S, S);
    var rows = 8, cols = 4, rowH = S / rows, colW = S / cols;
    for (var r = 0; r < rows; r++) {
      var off = (r % 2) ? colW * 0.5 : 0;
      for (var c = -1; c <= cols; c++) {
        var x = c * colW + off;
        var y = r * rowH;
        var baseR = 112 + Math.floor(rnd() * 28);
        var baseG = 62 + Math.floor(rnd() * 16);
        var baseB = 52 + Math.floor(rnd() * 14);
        ctx.fillStyle = "rgb(" + baseR + "," + baseG + "," + baseB + ")";
        ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
        ctx.fillStyle = "rgba(255,210,190,0.07)";
        ctx.fillRect(x + 2, y + 2, colW - 4, 2);
      }
    }
    for (var i = 0; i < 1100; i++) {
      ctx.fillStyle = rnd() > 0.45 ? "rgba(15,10,8,0.18)" : "rgba(210,170,150,0.06)";
      ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 2, 2 + rnd() * 2);
    }
  });

  var woodTex = _makeTiledTex(256, function (ctx, S) {
    var rnd = _makePRNG(350377);
    ctx.fillStyle = "#3a291c";
    ctx.fillRect(0, 0, S, S);
    var planks = 6, pw = S / planks;
    for (var p = 0; p < planks; p++) {
      var px = p * pw;
      var shade = 78 + Math.floor(rnd() * 24);
      ctx.fillStyle = "rgb(" + shade + "," + Math.floor(shade * 0.68) + "," + Math.floor(shade * 0.46) + ")";
      ctx.fillRect(px + 2, 0, pw - 4, S);
      for (var g = 0; g < 18; g++) {
        ctx.fillStyle = rnd() > 0.5 ? "rgba(20,12,6,0.18)" : "rgba(210,165,115,0.08)";
        ctx.fillRect(px + 3 + rnd() * (pw - 8), 0, 1 + rnd() * 2, S);
      }
    }
    ctx.fillStyle = "#261a11";
    ctx.fillRect(0, 26, S, 8);
    ctx.fillRect(0, S - 34, S, 8);
    for (var n = 0; n < planks; n++) {
      ctx.fillStyle = "#8a8e94";
      ctx.fillRect(n * pw + pw * 0.5 - 2, 28, 4, 4);
      ctx.fillRect(n * pw + pw * 0.5 - 2, S - 32, 4, 4);
    }
  });

  var crateTex = _makeTiledTex(256, function (ctx, S) {
    var rnd = _makePRNG(479001);
    ctx.fillStyle = "#5c4329";
    ctx.fillRect(0, 0, S, S);
    // Inner plank lines
    for (var p = 0; p < 4; p++) {
      var y = p * (S / 4);
      ctx.fillStyle = (p % 2 === 0) ? "#6d5031" : "#64492d";
      ctx.fillRect(22, y + 2, S - 44, S / 4 - 4);
    }
    for (var i = 0; i < 650; i++) {
      ctx.fillStyle = rnd() > 0.5 ? "rgba(24,14,6,0.14)" : "rgba(220,185,130,0.07)";
      ctx.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 14, 1.5);
    }
    // Diagonal X cross-brace
    ctx.strokeStyle = "#7a5b39";
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(S - 16, S - 16);
    ctx.moveTo(S - 16, 16);
    ctx.lineTo(16, S - 16);
    ctx.stroke();
    // Outer frame border
    ctx.strokeStyle = "#876743";
    ctx.lineWidth = 26;
    ctx.strokeRect(13, 13, S - 26, S - 26);
    // Dark seam + metal corner brackets
    ctx.strokeStyle = "rgba(18,12,6,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, S - 52, S - 52);
    ctx.fillStyle = "#2c3035";
    [[6, 6], [S - 20, 6], [6, S - 20], [S - 20, S - 20]].forEach(function (pt) {
      ctx.fillRect(pt[0], pt[1], 14, 14);
    });
  });

  var groundTex = _makeTiledTex(256, function (ctx, S) {
    var rnd = _makePRNG(611953);
    ctx.fillStyle = "#333830";
    ctx.fillRect(0, 0, S, S);
    var cols = ["#2a2e26", "#3d4236", "#31352c", "#464c3c"];
    for (var i = 0; i < 2200; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(rnd() * S, rnd() * S, 3, 3);
    }
    for (var j = 0; j < 110; j++) {
      ctx.fillStyle = "#525c42";
      ctx.fillRect(rnd() * S, rnd() * S, 2, 7);
    }
  });

  var _mats = {
    stone: new THREE.MeshLambertMaterial({ map: stoneTex, color: 0xdadfd8 }),
    brick: new THREE.MeshLambertMaterial({ map: brickTex, color: 0xd8c6be }),
    wood: new THREE.MeshLambertMaterial({ map: woodTex, color: 0xcab9a4 }),
    crate: new THREE.MeshLambertMaterial({ map: crateTex, color: 0xd6c3a5 }),
    ground: new THREE.MeshLambertMaterial({ map: groundTex, color: 0xc2c7b2 }),
    fence: new THREE.MeshLambertMaterial({ color: 0x39312a }),
    darkStone: new THREE.MeshLambertMaterial({ color: 0x3b3f3a }),
    lampPole: new THREE.MeshLambertMaterial({ color: 0x22241f }),
    lampHead: new THREE.MeshBasicMaterial({ color: 0xffc37a }),
    lampHalo: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffb45e,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }),
    wisp: new THREE.MeshBasicMaterial({ color: 0x9fb2c8, transparent: true, opacity: 0.036, depthWrite: false }),
    barrelBody: new THREE.MeshLambertMaterial({ color: 0xc82424, emissive: 0x3a0606 }),
    barrelStripe: new THREE.MeshBasicMaterial({ color: 0xffcf38 }),
    barrelTop: new THREE.MeshBasicMaterial({ color: 0xff5a24, side: THREE.DoubleSide }),
    barrelFloorRing: new THREE.MeshBasicMaterial({
      color: 0xff4020,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }),
    scorchOuter: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0x0b0807,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    scorchRing: new THREE.MeshBasicMaterial({
      color: 0x1d1612,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    supMedBody: new THREE.MeshLambertMaterial({ color: 0xd9e3db }),
    supMedGlow: new THREE.MeshBasicMaterial({ color: 0x3eff8b }),
    supAmmoBody: new THREE.MeshLambertMaterial({ color: 0x4c5d36 }),
    supAmmoGlow: new THREE.MeshBasicMaterial({ color: 0xffcc48 }),
    supBothBody: new THREE.MeshLambertMaterial({ color: 0x2d5438 }),
    supBothGlow: new THREE.MeshBasicMaterial({ color: 0x42ff94 }),
    supFloorMed: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0x38ff8c,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    supFloorAmmo: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffb838,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    supFloorBoth: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0x38ff8c,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    extractColOuter: new THREE.MeshBasicMaterial({
      color: 0xffa833,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    extractColCore: new THREE.MeshBasicMaterial({
      color: 0xffa833,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    extractHalo: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffa833,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    extractRing: new THREE.MeshBasicMaterial({
      color: 0xffa833,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    extractProgress: new THREE.MeshBasicMaterial({
      color: 0x2dff88,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  };

  function _markShared(geo) {
    geo.userData.sharedGeo = true;
    return geo;
  }

  // Shared Geometries
  var _fencePostGeo = _markShared(new THREE.BoxGeometry(0.18, 1.32, 0.18));
  var _lampPoleGeo = _markShared(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6));
  var _lampHeadGeo = _markShared(new THREE.SphereGeometry(0.24, 8, 8));
  var _lampHaloGeo = _markShared(new THREE.PlaneGeometry(2.6, 2.6));
  var _wispGeo = _markShared(new THREE.PlaneGeometry(22, 4));

  var _barrelBodyGeo = _markShared(new THREE.CylinderGeometry(0.42, 0.44, 1.18, 12));
  var _barrelStripeGeo = _markShared(new THREE.CylinderGeometry(0.436, 0.436, 0.14, 12));
  var _barrelTopGeo = _markShared(new THREE.RingGeometry(0.22, 0.38, 16));
  var _barrelFloorGeo = _markShared(new THREE.RingGeometry(0.54, 0.72, 18));
  var _scorchOuterGeo = _markShared(new THREE.PlaneGeometry(3.6, 3.6));
  var _scorchRingGeo = _markShared(new THREE.RingGeometry(0.9, 1.65, 20));

  var _supBoxGeo = _markShared(new THREE.BoxGeometry(0.92, 0.54, 0.68));
  var _supBandGeo = _markShared(new THREE.BoxGeometry(0.96, 0.1, 0.72));
  var _supCross1Geo = _markShared(new THREE.BoxGeometry(0.36, 0.06, 0.12));
  var _supCross2Geo = _markShared(new THREE.BoxGeometry(0.12, 0.06, 0.36));
  var _supDiscGeo = _markShared(new THREE.PlaneGeometry(3.0, 3.0));
  var _supRingGeo = _markShared(new THREE.RingGeometry(0.85, 1.08, 24));

  var _portalColOuterGeo = _markShared(new THREE.CylinderGeometry(1.05, 1.55, 26, 16, 1, true));
  var _portalColCoreGeo = _markShared(new THREE.CylinderGeometry(0.26, 0.52, 26, 12, 1, true));

  // ---------------------------------------------------------------------------
  // Material Hardening & Diagnostics
  // ---------------------------------------------------------------------------
  function toFastLambert(root, fallbackHex, tintMul) {
    if (!root || !root.traverse) return;
    root.traverse(function (o) {
      if (o.geometry && o.geometry.userData) o.geometry.userData.sharedGeo = true;
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) { out.push(m); continue; }
        if (m.map) { try { m.map.needsUpdate = true; } catch (e) {} }
        var colHex = m.map ? 0xffffff : fallbackHex;
        var lm = new THREE.MeshLambertMaterial({
          map: m.map || null,
          color: colHex,
          transparent: false
        });
        if (tintMul && lm.color) lm.color.multiplyScalar(tintMul);
        out.push(lm);
      }
      o.material = Array.isArray(o.material) ? out : out[0];
      o.userData.origMat = o.material;
      o.frustumCulled = false;
    });
  }

  function hardenGunObj(root) {
    if (!root || !root.traverse) return;
    root.traverse(function (o) {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) continue;
        if (m.map) { try { m.map.needsUpdate = true; } catch (e) {} }
        else if (m.color) { try { m.color.setHex(0x23262b); } catch (e) {} }
        if (typeof m.envMapIntensity === "number") m.envMapIntensity = 0.5;
      }
    });
  }

  function _texCheck(root) {
    var detail = null, ok = false;
    if (!root || !root.traverse) return { hasMap: false, imageLoaded: false, ok: false, w: 0, h: 0 };
    root.traverse(function (o) {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) continue;
        if (m.map) {
          var img = m.map.image;
          var loaded = !!(img && ((img.width || 0) > 0 || (img.height || 0) > 0 || img.complete === true));
          if (!detail) detail = { hasMap: true, imageLoaded: loaded, w: img ? (img.width || 0) : 0, h: img ? (img.height || 0) : 0 };
          if (loaded) {
            ok = true;
            detail.imageLoaded = true;
            detail.w = img.width || detail.w;
            detail.h = img.height || detail.h;
          }
        }
      }
    });
    if (!detail) detail = { hasMap: false, imageLoaded: false, w: 0, h: 0 };
    detail.ok = ok;
    return detail;
  }

  window.__gunTexOk = function () {
    var out = {};
    ["pistol", "shotgun", "rifle", "thuanthien"].forEach(function (k) { out[k] = _texCheck(GUN_T[k]).ok; });
    var zt = ZB_T.zombie || ZB_T.orcking;
    var zc = _texCheck(zt && zt.scene);
    out.zombie = zc.ok;
    var curW = (FPS.entities && FPS.entities.curWeapon) || (typeof curWeapon !== "undefined" ? curWeapon : null);
    out.detail = {
      pistol: _texCheck(GUN_T.pistol),
      shotgun: _texCheck(GUN_T.shotgun),
      rifle: _texCheck(GUN_T.rifle),
      thuanthien: _texCheck(GUN_T.thuanthien),
      zombie: zc,
      currentViewmodel: _texCheck(gunGroup),
      currentWeapon: curW
    };
    return out;
  };

  window.__zbTexOk = function () {
    var out = { loaded: Object.keys(ZB_T).length, detail: {} };
    ["zombie", "ghost", "skeleton", "golem", "orcking", "troll", "minotaur"].forEach(function (k) {
      var c = _texCheck(ZB_T[k] && ZB_T[k].scene);
      out[k] = c.ok;
      out.detail[k] = c;
    });
    return out;
  };

  // ---------------------------------------------------------------------------
  // Collision & Bullet Raycast (zero-allocation hot loops, supports rotated OBB)
  // ---------------------------------------------------------------------------
  function _addBoxCollider(x, z, hw, hd, ry) {
    var ang = ry || 0;
    var rot = Math.abs(ang) > 0.01;
    var cos = rot ? Math.cos(ang) : 1;
    var sin = rot ? Math.sin(ang) : 0;
    var bx = rot ? (hw * Math.abs(cos) + hd * Math.abs(sin)) : hw;
    var bz = rot ? (hw * Math.abs(sin) + hd * Math.abs(cos)) : hd;
    colliders.push({
      box: true, x: x, z: z, hw: hw, hd: hd,
      ry: ang, rot: rot, cos: cos, sin: sin, bx: bx, bz: bz
    });
  }

  function _addCircleCollider(x, z, r, barrelRef) {
    colliders.push({
      box: false, x: x, z: z, r: r, bx: r, bz: r,
      barrelRef: barrelRef || null
    });
  }

  function _addBulletWall(x, z, hw, hd, maxY, ry) {
    var ang = ry || 0;
    var rot = Math.abs(ang) > 0.01;
    var cos = rot ? Math.cos(ang) : 1;
    var sin = rot ? Math.sin(ang) : 0;
    var bx = rot ? (hw * Math.abs(cos) + hd * Math.abs(sin)) : hw;
    var bz = rot ? (hw * Math.abs(sin) + hd * Math.abs(cos)) : hd;
    bulletWalls.push({
      x: x, z: z, hw: hw, hd: hd, maxY: maxY,
      ry: ang, rot: rot, cos: cos, sin: sin, bx: bx, bz: bz
    });
  }

  var _colOut = { hit: false, nx: 0, nz: 0 };

  function collide(pos, r, isZombie) {
    var rad = r || 0.5;
    var r2 = rad * rad;
    var hit = false;
    var hitNx = 0, hitNz = 0, lastNx = 0, lastNz = 0;

    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (c.barrelRef && !c.barrelRef.alive) continue;
      if (Math.abs(c.x - pos.x) > c.bx + rad || Math.abs(c.z - pos.z) > c.bz + rad) continue;

      if (c.box) {
        var dx = pos.x - c.x;
        var dz = pos.z - c.z;
        if (c.rot) {
          var lx = dx * c.cos - dz * c.sin;
          var lz = dx * c.sin + dz * c.cos;
          var clx = Math.max(-c.hw, Math.min(c.hw, lx));
          var clz = Math.max(-c.hd, Math.min(c.hd, lz));
          var ldx = lx - clx;
          var ldz = lz - clz;
          var ld2 = ldx * ldx + ldz * ldz;
          if (ld2 < r2) {
            var lnx, lnz;
            if (ld2 > 1e-8) {
              var ld = Math.sqrt(ld2);
              lnx = ldx / ld;
              lnz = ldz / ld;
              lx = clx + lnx * rad;
              lz = clz + lnz * rad;
            } else {
              var pl = (c.hw + rad) - Math.abs(lx);
              var pr = (c.hd + rad) - Math.abs(lz);
              if (pl < pr) {
                lnx = lx >= 0 ? 1 : -1;
                lnz = 0;
                lx = lnx * (c.hw + rad);
              } else {
                lnx = 0;
                lnz = lz >= 0 ? 1 : -1;
                lz = lnz * (c.hd + rad);
              }
            }
            pos.x = c.x + lx * c.cos + lz * c.sin;
            pos.z = c.z - lx * c.sin + lz * c.cos;
            var pnx = lnx * c.cos + lnz * c.sin;
            var pnz = -lnx * c.sin + lnz * c.cos;
            hit = true;
            hitNx += pnx;
            hitNz += pnz;
            lastNx = pnx;
            lastNz = pnz;
          }
        } else {
          var cx = Math.max(c.x - c.hw, Math.min(c.x + c.hw, pos.x));
          var cz = Math.max(c.z - c.hd, Math.min(c.z + c.hd, pos.z));
          var bdx = pos.x - cx;
          var bdz = pos.z - cz;
          var d2 = bdx * bdx + bdz * bdz;
          if (d2 < r2) {
            var bnx, bnz;
            if (d2 > 1e-8) {
              var d = Math.sqrt(d2);
              bnx = bdx / d;
              bnz = bdz / d;
              pos.x = cx + bnx * rad;
              pos.z = cz + bnz * rad;
            } else {
              var apl = (c.hw + rad) - Math.abs(dx);
              var apr = (c.hd + rad) - Math.abs(dz);
              if (apl < apr) {
                bnx = dx >= 0 ? 1 : -1;
                bnz = 0;
                pos.x = c.x + bnx * (c.hw + rad);
              } else {
                bnx = 0;
                bnz = dz >= 0 ? 1 : -1;
                pos.z = c.z + bnz * (c.hd + rad);
              }
            }
            hit = true;
            hitNx += bnx;
            hitNz += bnz;
            lastNx = bnx;
            lastNz = bnz;
          }
        }
      } else {
        var cdx = pos.x - c.x;
        var cdz = pos.z - c.z;
        var cd2 = cdx * cdx + cdz * cdz;
        var minR = c.r + rad;
        if (cd2 < minR * minR) {
          var cnx, cnz;
          if (cd2 > 1e-8) {
            var cd = Math.sqrt(cd2);
            cnx = cdx / cd;
            cnz = cdz / cd;
          } else {
            cnx = 1;
            cnz = 0;
          }
          pos.x = c.x + cnx * minR;
          pos.z = c.z + cnz * minR;
          hit = true;
          hitNx += cnx;
          hitNz += cnz;
          lastNx = cnx;
          lastNz = cnz;
        }
      }
    }

    var halfLimit = ((world.currentLevel ? world.currentLevel.arena : 135) * 0.5) - rad;
    if (halfLimit < 1) halfLimit = 1;
    if (pos.x < -halfLimit) {
      pos.x = -halfLimit;
      hit = true;
      hitNx += 1;
      lastNx = 1;
      lastNz = 0;
    } else if (pos.x > halfLimit) {
      pos.x = halfLimit;
      hit = true;
      hitNx -= 1;
      lastNx = -1;
      lastNz = 0;
    }
    if (pos.z < -halfLimit) {
      pos.z = -halfLimit;
      hit = true;
      hitNz += 1;
      lastNx = 0;
      lastNz = 1;
    } else if (pos.z > halfLimit) {
      pos.z = halfLimit;
      hit = true;
      hitNz -= 1;
      lastNx = 0;
      lastNz = -1;
    }

    if (hit) {
      var nLen = Math.hypot(hitNx, hitNz);
      if (nLen > 1e-5) {
        _colOut.nx = hitNx / nLen;
        _colOut.nz = hitNz / nLen;
      } else {
        _colOut.nx = lastNx;
        _colOut.nz = lastNz;
      }
      _colOut.hit = true;
    } else {
      _colOut.hit = false;
      _colOut.nx = 0;
      _colOut.nz = 0;
    }
    return _colOut;
  }

  function raycastWallDist(origin, dir, maxDist) {
    var bestDist = (maxDist !== undefined && maxDist > 0) ? maxDist : 100;
    var ox0 = origin.x, oy = origin.y, oz0 = origin.z;
    var dx0 = dir.x, dy = dir.y, dz0 = dir.z;
    var dLen2 = dx0 * dx0 + dy * dy + dz0 * dz0;
    if (dLen2 < 1e-10) return bestDist;
    if (Math.abs(dLen2 - 1) > 1e-4) {
      var invLen = 1 / Math.sqrt(dLen2);
      dx0 *= invLen;
      dy *= invLen;
      dz0 *= invLen;
    }

    // Ground plane y <= 0
    if (oy > 0 && dy < -1e-6) {
      var tg = -oy / dy;
      if (tg >= 0 && tg < bestDist) bestDist = tg;
    }

    for (var i = 0; i < bulletWalls.length; i++) {
      var w = bulletWalls[i];
      if (oy > w.maxY && dy >= 0) continue;
      if (oy < 0 && dy <= 0) continue;

      var rx = ox0 - w.x;
      var rz = oz0 - w.z;
      var ox, oz, dx, dz;
      if (w.rot) {
        ox = rx * w.cos - rz * w.sin;
        oz = rx * w.sin + rz * w.cos;
        dx = dx0 * w.cos - dz0 * w.sin;
        dz = dx0 * w.sin + dz0 * w.cos;
      } else {
        ox = rx;
        oz = rz;
        dx = dx0;
        dz = dz0;
      }

      var tmin = 0;
      var tmax = bestDist;
      var inv, t1, t2, tmp;

      // X slab [-w.hw, w.hw]
      if (dx > -1e-8 && dx < 1e-8) {
        if (ox < -w.hw || ox > w.hw) continue;
      } else {
        inv = 1 / dx;
        t1 = (-w.hw - ox) * inv;
        t2 = (w.hw - ox) * inv;
        if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }

      // Y slab [0, w.maxY]
      if (dy > -1e-8 && dy < 1e-8) {
        if (oy < 0 || oy > w.maxY) continue;
      } else {
        inv = 1 / dy;
        t1 = (0 - oy) * inv;
        t2 = (w.maxY - oy) * inv;
        if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }

      // Z slab [-w.hd, w.hd]
      if (dz > -1e-8 && dz < 1e-8) {
        if (oz < -w.hd || oz > w.hd) continue;
      } else {
        inv = 1 / dz;
        t1 = (-w.hd - oz) * inv;
        t2 = (w.hd - oz) * inv;
        if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }

      if (tmin >= 0 && tmin < bestDist) bestDist = tmin;
    }

    return bestDist;
  }

  // ---------------------------------------------------------------------------
  // Level Geometry Helpers
  // ---------------------------------------------------------------------------
  function _applyWallUVs(geo, w, h, d, matKey) {
    var uv = geo.attributes.uv;
    if (!uv) return;
    var arr = uv.array;
    var isCrate = matKey === "crate";
    var tile = isCrate ? 1.35 : 2.2;
    // BoxGeometry face order: +X(d,h), -X(d,h), +Y(w,d), -Y(w,d), +Z(w,h), -Z(w,h)
    var dims = [
      [d, h], [d, h],
      [w, d], [w, d],
      [w, h], [w, h]
    ];
    for (var f = 0; f < 6; f++) {
      var du = dims[f][0] / tile;
      var dv = dims[f][1] / tile;
      if (isCrate) {
        du = Math.max(1, Math.round(du));
        dv = Math.max(1, Math.round(dv));
      }
      var base = f * 8;
      for (var v = 0; v < 4; v++) {
        arr[base + v * 2] *= du;
        arr[base + v * 2 + 1] *= dv;
      }
    }
    uv.needsUpdate = true;
  }

  function _addFenceRun(x, z, len, rot, sp) {
    var g = new THREE.Group();
    var step = sp || 4.5;
    var n = Math.max(2, Math.floor(len / step));
    for (var k = 0; k <= n; k++) {
      var px = -len * 0.5 + (k / n) * len;
      var post = new THREE.Mesh(_fencePostGeo, _mats.fence);
      post.position.set(px, 0.66, 0);
      g.add(post);
    }
    var railGeo = new THREE.BoxGeometry(len, 0.12, 0.08);
    var rail1 = new THREE.Mesh(railGeo, _mats.fence);
    rail1.position.y = 0.98;
    g.add(rail1);
    var rail2 = new THREE.Mesh(railGeo, _mats.fence);
    rail2.position.y = 0.46;
    g.add(rail2);
    g.position.set(x, 0, z);
    if (rot) g.rotation.y = rot;
    g.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
    levelGroup.add(g);
  }

  function _lamp(x, z) {
    var pole = new THREE.Mesh(_lampPoleGeo, _mats.lampPole);
    pole.position.set(x, 2.2, z);
    pole.matrixAutoUpdate = false;
    pole.updateMatrix();
    levelGroup.add(pole);

    var head = new THREE.Mesh(_lampHeadGeo, _mats.lampHead);
    head.position.set(x, 4.5, z);
    head.matrixAutoUpdate = false;
    head.updateMatrix();
    levelGroup.add(head);

    var halo = new THREE.Mesh(_lampHaloGeo, _mats.lampHalo);
    halo.position.set(x, 4.5, z);
    halo.matrixAutoUpdate = true;
    levelGroup.add(halo);

    streetLights.push({ head: head, halo: halo, x: x, z: z, flick: Math.random() * 10, on: true });
    _addCircleCollider(x, z, 0.3);
  }

  var _solidBulletProps = { house: 1, watchtower: 1, pagoda: 1, windmill: 1, wall_step: 1 };

  function _buildOpenGate(p, sw, sh, sd) {
    var ry = p.rotY || 0;
    var g = new THREE.Group();
    var pW = Math.max(0.85, sw * 0.21);
    var pD = Math.max(0.85, sd * 1.15);
    var lintelH = Math.min(0.95, sh * 0.18);
    var pH = Math.max(3.6, sh - lintelH);
    var off = Math.max(2.2, sw * 0.40);

    var pGeoL = new THREE.BoxGeometry(pW, pH, pD);
    _applyWallUVs(pGeoL, pW, pH, pD, "stone");
    var leftP = new THREE.Mesh(pGeoL, _mats.stone);
    leftP.position.set(-off, pH * 0.5, 0);
    g.add(leftP);

    var pGeoR = new THREE.BoxGeometry(pW, pH, pD);
    _applyWallUVs(pGeoR, pW, pH, pD, "stone");
    var rightP = new THREE.Mesh(pGeoR, _mats.stone);
    rightP.position.set(off, pH * 0.5, 0);
    g.add(rightP);

    var beamW = off * 2 + pW + 0.35;
    var lGeo = new THREE.BoxGeometry(beamW, lintelH, pD + 0.16);
    _applyWallUVs(lGeo, beamW, lintelH, pD + 0.16, "brick");
    var lintel = new THREE.Mesh(lGeo, _mats.brick);
    lintel.position.set(0, pH + lintelH * 0.5, 0);
    g.add(lintel);

    var capGeo = new THREE.BoxGeometry(beamW + 0.2, 0.18, pD + 0.30);
    var cap = new THREE.Mesh(capGeo, _mats.darkStone);
    cap.position.set(0, pH + lintelH + 0.09, 0);
    g.add(cap);

    g.position.set(p.x, 0, p.z);
    if (ry) g.rotation.y = ry;
    g.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
    levelGroup.add(g);

    var cos = Math.cos(ry), sin = Math.sin(ry);
    var ghw = pW * 0.5;
    var ghd = pD * 0.5;
    var lx = p.x - off * cos, lz = p.z + off * sin;
    var rx = p.x + off * cos, rz = p.z - off * sin;
    _addBoxCollider(lx, lz, ghw, ghd, ry);
    _addBoxCollider(rx, rz, ghw, ghd, ry);
    _addBulletWall(lx, lz, ghw, ghd, pH + lintelH, ry);
    _addBulletWall(rx, rz, ghw, ghd, pH + lintelH, ry);

    window.__envPlaced = (window.__envPlaced || 0) + 1;
    return g;
  }

  function _envPlace(p) {
    var tpl = ENV_T[p.key], d = ENV_DIM[p.key];
    if (p.key === "wall_door" && p.coll === "gate") {
      var gh = p.h || (d ? d.h : 5.2);
      var gScale = d && d.h ? (gh / d.h) : 2.8;
      var gw = d ? d.w * gScale : 5.6;
      var gd = d ? d.d * gScale : 0.72;
      return _buildOpenGate(p, gw, gh, gd);
    }
    if (!tpl || !d || !d.h) return null;
    var scale, sink = p.sink || 0;
    if (p.w && !p.h && d.w) {
      scale = p.w / d.w;
      sink = (d.h * scale) - 0.06;
    } else {
      scale = (p.h || d.h) / d.h;
      if (p.key === "cobble" && !p.sink) sink = Math.max(0, (d.h * scale) - 0.08);
    }
    var m = tpl.clone(true);
    m.scale.setScalar(scale);
    m.position.set(p.x, -d.minY * scale - sink, p.z);
    if (p.rotY) m.rotation.y = p.rotY;
    m.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
    levelGroup.add(m);

    var sw = d.w * scale;
    var sd = d.d * scale;
    var sh = d.h * scale;
    var ry = p.rotY || 0;
    var coll = p.coll;
    if (coll === "box") {
      var hw = Math.max(0.3, sw * 0.5 * 0.92);
      var hd = Math.max(0.3, sd * 0.5 * 0.92);
      _addBoxCollider(p.x, p.z, hw, hd, ry);
      if (_solidBulletProps[p.key] && sh >= 1.6) {
        _addBulletWall(p.x, p.z, hw, hd, sh, ry);
      }
    } else if (coll === "circle") {
      _addCircleCollider(p.x, p.z, Math.max(0.25, Math.max(sw, sd) * 0.5 * 0.95));
    } else if (coll === "gate") {
      var cos = Math.cos(ry), sin = Math.sin(ry);
      var off = sw * 0.40;
      var ghw = Math.max(0.35, sw * 0.11);
      var ghd = Math.max(0.4, sd * 0.5);
      var lx = p.x - off * cos, lz = p.z + off * sin;
      var rx = p.x + off * cos, rz = p.z - off * sin;
      _addBoxCollider(lx, lz, ghw, ghd, ry);
      _addBoxCollider(rx, rz, ghw, ghd, ry);
      if (sh >= 1.6) {
        _addBulletWall(lx, lz, ghw, ghd, sh, ry);
        _addBulletWall(rx, rz, ghw, ghd, sh, ry);
      }
    }
    window.__envPlaced = (window.__envPlaced || 0) + 1;
    return m;
  }

  var _propsPlacedForLevel = null;

  function _placeLevelProps(levelDef) {
    if (!levelDef || _propsPlacedForLevel === levelDef) return;
    if (!Object.keys(ENV_T).length) return;
    _propsPlacedForLevel = levelDef;
    var props = levelDef.props || [];
    for (var i = 0; i < props.length; i++) {
      _envPlace(props[i]);
    }
  }

  function _buildBarrel(b) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(_barrelBodyGeo, _mats.barrelBody);
    body.position.y = 0.59;
    g.add(body);

    var s1 = new THREE.Mesh(_barrelStripeGeo, _mats.barrelStripe);
    s1.position.y = 0.36;
    g.add(s1);

    var s2 = new THREE.Mesh(_barrelStripeGeo, _mats.barrelStripe);
    s2.position.y = 0.84;
    g.add(s2);

    var topRing = new THREE.Mesh(_barrelTopGeo, _mats.barrelTop);
    topRing.rotation.x = -Math.PI * 0.5;
    topRing.position.y = 1.19;
    g.add(topRing);

    var floorRing = new THREE.Mesh(_barrelFloorGeo, _mats.barrelFloorRing);
    floorRing.rotation.x = -Math.PI * 0.5;
    floorRing.position.y = 0.03;
    g.add(floorRing);

    g.position.set(b.x, 0, b.z);
    g.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    levelGroup.add(g);

    var rec = { x: b.x, z: b.z, r: 0.58, hp: 30, alive: true, mesh: g };
    explosiveBarrels.push(rec);
    _addCircleCollider(b.x, b.z, 0.58, rec);
  }

  function _buildSupplyNode(s) {
    var kind = s.kind || "both";
    var bodyMat = kind === "med" ? _mats.supMedBody : (kind === "ammo" ? _mats.supAmmoBody : _mats.supBothBody);
    var glowMat = kind === "med" ? _mats.supMedGlow : (kind === "ammo" ? _mats.supAmmoGlow : _mats.supBothGlow);
    var floorMat = kind === "med" ? _mats.supFloorMed : (kind === "ammo" ? _mats.supFloorAmmo : _mats.supFloorBoth);

    var g = new THREE.Group();
    var boxGrp = new THREE.Group();
    boxGrp.position.y = 0.34;
    var box = new THREE.Mesh(_supBoxGeo, bodyMat);
    boxGrp.add(box);
    var band = new THREE.Mesh(_supBandGeo, glowMat);
    band.position.y = 0.08;
    boxGrp.add(band);
    var c1 = new THREE.Mesh(_supCross1Geo, glowMat);
    c1.position.y = 0.30;
    boxGrp.add(c1);
    if (kind !== "ammo") {
      var c2 = new THREE.Mesh(_supCross2Geo, glowMat);
      c2.position.y = 0.30;
      boxGrp.add(c2);
    }
    g.add(boxGrp);

    var disc = new THREE.Mesh(_supDiscGeo, floorMat);
    disc.rotation.x = -Math.PI * 0.5;
    disc.position.y = 0.04;
    g.add(disc);

    var ring = new THREE.Mesh(_supRingGeo, glowMat);
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.06;
    g.add(ring);

    g.position.set(s.x, 0, s.z);
    levelGroup.add(g);

    supplyNodes.push({
      x: s.x,
      z: s.z,
      kind: kind,
      alive: true,
      respawnT: 0,
      mesh: g,
      _box: boxGrp,
      _ring: ring,
      _t: Math.random() * 6
    });
  }

  function _buildExtractPortal(ep) {
    var x = ep ? ep.x : 0;
    var z = ep ? ep.z : 0;
    var r = (ep && ep.r) ? ep.r : 4.0;

    var g = new THREE.Group();
    g.position.set(x, 0, z);

    var pad = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.86, 0.22, 16), _mats.darkStone);
    pad.position.y = 0.11;
    pad.matrixAutoUpdate = false;
    pad.updateMatrix();
    g.add(pad);

    var plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.56, 0.06, 16), _mats.stone);
    plate.position.y = 0.24;
    plate.matrixAutoUpdate = false;
    plate.updateMatrix();
    g.add(plate);

    var outerRing = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r, 36), _mats.extractRing);
    outerRing.rotation.x = -Math.PI * 0.5;
    outerRing.position.y = 0.05;
    g.add(outerRing);

    var innerRing = new THREE.Mesh(new THREE.RingGeometry(r * 0.42, r * 0.62, 10), _mats.extractRing);
    innerRing.rotation.x = -Math.PI * 0.5;
    innerRing.position.y = 0.28;
    g.add(innerRing);

    var progRing = new THREE.Mesh(new THREE.RingGeometry(r * 0.64, r * 0.88, 32), _mats.extractProgress);
    progRing.rotation.x = -Math.PI * 0.5;
    progRing.position.y = 0.07;
    g.add(progRing);

    var halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.3, r * 2.3), _mats.extractHalo);
    halo.rotation.x = -Math.PI * 0.5;
    halo.position.y = 0.06;
    g.add(halo);

    var colOuter = new THREE.Mesh(_portalColOuterGeo, _mats.extractColOuter);
    colOuter.position.y = 13.0;
    g.add(colOuter);

    var colCore = new THREE.Mesh(_portalColCoreGeo, _mats.extractColCore);
    colCore.position.y = 13.0;
    g.add(colCore);

    levelGroup.add(g);

    return {
      group: g,
      pad: pad,
      outerRing: outerRing,
      innerRing: innerRing,
      progRing: progRing,
      halo: halo,
      colOuter: colOuter,
      colCore: colCore,
      x: x,
      z: z,
      r: r
    };
  }

  function _clearLevelGroup() {
    levelGroup.traverse(function (o) {
      if (o.geometry && (!o.geometry.userData || !o.geometry.userData.sharedGeo)) {
        o.geometry.dispose();
      }
    });
    while (levelGroup.children.length) {
      levelGroup.remove(levelGroup.children[0]);
    }
  }

  // ---------------------------------------------------------------------------
  // Level Loader
  // ---------------------------------------------------------------------------
  function loadLevel(levelDef) {
    if (typeof levelDef === "number") {
      var list = FPS.LEVELS || [];
      levelDef = list[levelDef - 1] || list[0];
    }
    if (!levelDef) return null;

    _clearLevelGroup();
    colliders.length = 0;
    bulletWalls.length = 0;
    explosiveBarrels.length = 0;
    supplyNodes.length = 0;
    streetLights.length = 0;
    wisps.length = 0;
    window.__envPlaced = 0;
    _propsPlacedForLevel = null;

    world.currentLevel = levelDef;

    // Atmosphere & Fog
    var skyHex = levelDef.skyHex !== undefined ? levelDef.skyHex : 0x070a0f;
    var fogHex = levelDef.fogHex !== undefined ? levelDef.fogHex : 0x0a0e13;
    var fogDensity = levelDef.fogDensity !== undefined ? levelDef.fogDensity : 0.022;
    if (scene.background && scene.background.isColor) scene.background.setHex(skyHex);
    else scene.background = new THREE.Color(skyHex);
    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.color.setHex(fogHex);
      scene.fog.density = fogDensity;
    } else {
      scene.fog = new THREE.FogExp2(fogHex, fogDensity);
    }

    // Ground (arena + 60)
    var arena = levelDef.arena || 80;
    var half = arena * 0.5;
    var gs = arena + 60;
    _mats.ground.color.setHex(levelDef.groundHex !== undefined ? levelDef.groundHex : 0xc2c7b2);
    var groundGeo = new THREE.PlaneGeometry(gs, gs);
    var gUv = groundGeo.attributes.uv;
    if (gUv) {
      var gRep = gs / 4.2;
      var gArr = gUv.array;
      for (var gi = 0; gi < gArr.length; gi++) gArr[gi] *= gRep;
      gUv.needsUpdate = true;
    }
    var ground = new THREE.Mesh(groundGeo, _mats.ground);
    ground.rotation.x = -Math.PI * 0.5;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    levelGroup.add(ground);

    // Perimeter barrier fences & boundary colliders at ±half
    _addFenceRun(0, -half - 0.35, arena + 0.7, 0, 4.5);
    _addFenceRun(0, half + 0.35, arena + 0.7, 0, 4.5);
    _addFenceRun(-half - 0.35, 0, arena + 0.7, Math.PI * 0.5, 4.5);
    _addFenceRun(half + 0.35, 0, arena + 0.7, Math.PI * 0.5, 4.5);

    _addBoxCollider(0, -half - 0.5, half + 1, 0.5, 0);
    _addBoxCollider(0, half + 0.5, half + 1, 0.5, 0);
    _addBoxCollider(-half - 0.5, 0, 0.5, half + 1, 0);
    _addBoxCollider(half + 0.5, 0, 0.5, half + 1, 0);

    // Tactical Walls (waist-high cover <= 1.35 lets bullets fly over; full walls h >= 1.6 block bullets)
    var walls = levelDef.walls || [];
    for (var wi = 0; wi < walls.length; wi++) {
      var w = walls[wi];
      var matKey = w.mat || "stone";
      var mat = _mats[matKey] || _mats.stone;
      var wGeo = new THREE.BoxGeometry(w.w, w.h, w.d);
      _applyWallUVs(wGeo, w.w, w.h, w.d, matKey);
      var wm = new THREE.Mesh(wGeo, mat);
      wm.position.set(w.x, w.h * 0.5, w.z);
      if (w.ry) wm.rotation.y = w.ry;
      wm.matrixAutoUpdate = false;
      wm.updateMatrix();
      levelGroup.add(wm);

      var hw = w.w * 0.5;
      var hd = w.d * 0.5;
      _addBoxCollider(w.x, w.z, hw, hd, w.ry || 0);
      if (w.h >= 1.6) {
        _addBulletWall(w.x, w.z, hw, hd, w.h, w.ry || 0);
      }
    }

    // GLB Props (placed immediately if templates loaded, otherwise completed when loadAllGLBs finishes)
    _placeLevelProps(levelDef);

    // Street Lamps (shared glow halos, zero PointLights)
    var lamps = levelDef.lamps || [];
    for (var li = 0; li < lamps.length; li++) {
      _lamp(lamps[li].x, lamps[li].z);
    }

    // Explosive Crimson Barrels
    var barrels = levelDef.explosiveBarrels || [];
    for (var bi = 0; bi < barrels.length; bi++) {
      _buildBarrel(barrels[bi]);
    }

    // Supply Nodes
    var supplies = levelDef.supplies || [];
    for (var si = 0; si < supplies.length; si++) {
      _buildSupplyNode(supplies[si]);
    }

    // Extraction Portal Beacon
    world.extractPortal = _buildExtractPortal(levelDef.extractPos);

    // Ground Fog Wisps
    var wCount = 12;
    for (var fi = 0; fi < wCount; fi++) {
      var wp = new THREE.Mesh(_wispGeo, _mats.wisp);
      wp.position.set((Math.random() - 0.5) * arena * 0.9, 1.1 + Math.random() * 1.1, (Math.random() - 0.5) * arena * 0.9);
      wp.rotation.y = Math.random() * Math.PI;
      wp.scale.x = 0.7 + Math.random() * 0.7;
      levelGroup.add(wp);
      wisps.push({ m: wp, s: 0.25 + Math.random() * 0.45, half: half });
    }

    return levelDef;
  }

  // ---------------------------------------------------------------------------
  // Visual Updates & Barrel Detonation
  // ---------------------------------------------------------------------------
  var _visT = 0;
  var _lockedHex = 0xffa833;
  var _unlockedHex = 0x2dff88;

  function updateWorldVisuals(dt, now, unlocked, extractPct) {
    var d = (dt !== undefined && dt > 0) ? dt : 0;
    _visT += d;
    var pct = Math.max(0, Math.min(1, extractPct || 0));

    // Extraction Portal Beacon
    var ep = world.extractPortal;
    if (ep) {
      var colHex = unlocked ? _unlockedHex : _lockedHex;
      _mats.extractColOuter.color.setHex(colHex);
      _mats.extractColCore.color.setHex(colHex);
      _mats.extractHalo.color.setHex(colHex);
      _mats.extractRing.color.setHex(colHex);

      var pulse = 0.85 + 0.15 * Math.sin(_visT * (unlocked ? 5.2 : 2.6));
      _mats.extractColOuter.opacity = (unlocked ? 0.30 : 0.14) * pulse + pct * 0.16;
      _mats.extractColCore.opacity = (unlocked ? 0.58 : 0.28) * pulse + pct * 0.22;
      _mats.extractHalo.opacity = (unlocked ? 0.72 : 0.38) * pulse;
      _mats.extractRing.opacity = unlocked ? 0.92 : 0.55;

      var spinRate = (unlocked ? 2.2 : 0.75) + pct * 3.8;
      ep.innerRing.rotation.z += d * spinRate;
      ep.halo.rotation.z -= d * (spinRate * 0.65);
      var colScale = (unlocked ? 1.0 : 0.85) + 0.08 * Math.sin(_visT * 4.2) + pct * 0.18;
      ep.colOuter.scale.set(colScale, 1, colScale);

      if (unlocked && pct > 0.001) {
        _mats.extractProgress.opacity = 0.35 + pct * 0.55;
        var ps = 0.25 + pct * 0.75;
        ep.progRing.scale.set(ps, ps, 1);
      } else {
        _mats.extractProgress.opacity = 0;
      }
    }

    // Supply Nodes visual sync & floating spin
    for (var si = 0; si < supplyNodes.length; si++) {
      var sn = supplyNodes[si];
      if (!sn.mesh) continue;
      sn.mesh.visible = !!sn.alive;
      if (!sn.alive) continue;
      sn._t += d * 2.4;
      if (sn._box) {
        sn._box.position.y = 0.34 + Math.sin(sn._t) * 0.065;
        sn._box.rotation.y += d * 0.95;
      }
      if (sn._ring) sn._ring.rotation.z += d * 1.25;
    }

    // Street Lamp halos billboard toward camera
    for (var li = 0; li < streetLights.length; li++) {
      var sl = streetLights[li];
      if (!sl.halo) continue;
      sl.halo.lookAt(camera.position);
      var fl = 1 + 0.045 * Math.sin(_visT * 6.5 + sl.flick);
      sl.halo.scale.set(fl, fl, 1);
    }

    // Atmospheric wisps & particles
    for (var wi = 0; wi < wisps.length; wi++) {
      var w = wisps[wi];
      w.m.position.x += Math.sin(_visT * 0.25 + wi) * w.s * d;
      if (w.m.position.x > w.half) w.m.position.x = -w.half;
      else if (w.m.position.x < -w.half) w.m.position.x = w.half;
    }
    if (dustPts.visible) dustPts.rotation.y += d * 0.015;
    if (rainPts.visible) {
      rainPts.position.y -= d * 3.2;
      if (rainPts.position.y < -3) rainPts.position.y = 0;
    }
  }

  function detonateBarrelVisual(barrel) {
    if (!barrel) return;
    barrel.alive = false;
    if (barrel.mesh) barrel.mesh.visible = false;

    var scorch = new THREE.Group();
    var outer = new THREE.Mesh(_scorchOuterGeo, _mats.scorchOuter);
    outer.rotation.x = -Math.PI * 0.5;
    outer.position.y = 0.025;
    scorch.add(outer);

    var ring = new THREE.Mesh(_scorchRingGeo, _mats.scorchRing);
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.03;
    scorch.add(ring);

    scorch.position.set(barrel.x, 0, barrel.z);
    scorch.traverse(function (o) { o.matrixAutoUpdate = false; o.updateMatrix(); });
    scorch.matrixAutoUpdate = false;
    scorch.updateMatrix();
    levelGroup.add(scorch);
  }

  // ---------------------------------------------------------------------------
  // GLB Loader
  // ---------------------------------------------------------------------------
  var _glbStarted = false;
  var _glbDone = false;
  var _readyCbs = [];

  function loadAllGLBs(onReady) {
    if (typeof onReady === "function") {
      if (_glbDone) { onReady(); return; }
      _readyCbs.push(onReady);
    }
    if (_glbStarted) return;
    if (!window.__glbLoaders || !window.GLTFLoader || !window.SkeletonUtils) {
      setTimeout(function () { loadAllGLBs(); }, 150);
      return;
    }
    _glbStarted = true;

    var loader = new window.GLTFLoader();
    if (window.MeshoptDecoder) {
      try { loader.setMeshoptDecoder(window.MeshoptDecoder); } catch (e) {}
    }

    function zbFind(anims, names) {
      for (var k = 0; k < names.length; k++) {
        for (var i = 0; i < anims.length; i++) if (anims[i].name === names[k]) return anims[i];
      }
      for (var k2 = 0; k2 < names.length; k2++) {
        var lk = names[k2].toLowerCase();
        for (var j = 0; j < anims.length; j++) if (anims[j].name.toLowerCase().indexOf(lk) >= 0) return anims[j];
      }
      return null;
    }

    function zbClipMap(anims, spec) {
      var out = {};
      if (!spec) return out;
      for (var r in spec) out[r] = spec[r].length ? zbFind(anims, spec[r]) : null;
      return out;
    }

    var zbKeys = ["zombie", "ghost", "skeleton", "golem", "orcking", "troll", "minotaur"];
    var gunKeys = ["pistol", "shotgun", "rifle", "thuanthien"];
    var envKeys = FPS.ENV_KEYS || window.ENV_KEYS || [];
    var envTint = FPS.ENV_TINT || window.ENV_TINT || {};
    var zbSpec = FPS.ZB_SPEC || window.ZB_SPEC || {};

    var envLeft = envKeys.length;
    var totalLeft = zbKeys.length + gunKeys.length + envKeys.length;

    function checkAllDone() {
      if (--totalLeft > 0) return;
      _glbDone = true;
      var cbs = _readyCbs.slice();
      _readyCbs.length = 0;
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](); } catch (e) { console.error("onReady cb error", e); }
      }
    }

    function finishEnvOne() {
      if (--envLeft === 0) {
        window.__envTemplatesLoaded = Object.keys(ENV_T).length;
        window.__envBuilt = true;
        if (!world.currentLevel && FPS.LEVELS && FPS.LEVELS.length) {
          loadLevel(FPS.LEVELS[0]);
        } else if (world.currentLevel) {
          _placeLevelProps(world.currentLevel);
        }
      }
      checkAllDone();
    }

    function startLoad() {
      zbKeys.forEach(function (key) {
        loader.load("assets/zb/zb_" + key + ".glb", function (g) {
          toFastLambert(g.scene, 0x353b32);
          var clips = zbClipMap(g.animations, zbSpec[key]);
          var tmpM = new THREE.AnimationMixer(g.scene);
          var c = clips.idle || clips.walk || clips.run;
          if (c) {
            var act = tmpM.clipAction(c);
            act.play();
            tmpM.update(0.04);
          }
          g.scene.updateMatrixWorld(true);
          var bb = new THREE.Box3().setFromObject(g.scene);
          var mh = (bb.max.y - bb.min.y) || 1.8;
          var unitScale = 2.02 / mh;
          var yOffset = -bb.min.y * unitScale;
          if (c) { tmpM.stopAllAction(); tmpM.update(0); }
          ZB_T[key] = { scene: g.scene, clips: clips, unitScale: unitScale, yOffset: yOffset };
          window.__zbLoaded = Object.keys(ZB_T).length;
          checkAllDone();
        }, undefined, function () {
          console.warn("zb GLB load fail", key);
          checkAllDone();
        });
      });

      gunKeys.forEach(function (kind) {
        loader.load("assets/weapons/wp_" + kind + ".glb", function (g) {
          hardenGunObj(g.scene);
          GUN_T[kind] = g.scene;
          if (FPS.entities) {
            if (typeof FPS.entities.onGunLoaded === "function") FPS.entities.onGunLoaded(kind);
            else if (FPS.entities.curWeapon === kind && typeof FPS.entities.buildGun === "function") FPS.entities.buildGun(kind);
          } else if (typeof curWeapon !== "undefined" && curWeapon === kind && typeof buildGun === "function") {
            buildGun(kind);
          }
          checkAllDone();
        }, undefined, function () {
          console.warn("weapon GLB load fail", kind);
          checkAllDone();
        });
      });

      if (envKeys.length === 0) {
        window.__envTemplatesLoaded = 0;
        window.__envBuilt = true;
        if (!world.currentLevel && FPS.LEVELS && FPS.LEVELS.length) loadLevel(FPS.LEVELS[0]);
      } else {
        envKeys.forEach(function (key) {
          loader.load("assets/env/env_" + key + ".glb", function (g) {
            toFastLambert(g.scene, 0x3c3a34, envTint[key] || 1);
            g.scene.updateMatrixWorld(true);
            var bb = new THREE.Box3().setFromObject(g.scene);
            var sz = new THREE.Vector3();
            bb.getSize(sz);
            ENV_T[key] = g.scene;
            ENV_DIM[key] = { w: sz.x || 1, h: sz.y || 1, d: sz.z || 1, minY: bb.min.y };
            finishEnvOne();
          }, undefined, function () {
            console.warn("env GLB load fail", key);
            finishEnvOne();
          });
        });
      }
    }

    if (window.MeshoptDecoder && window.MeshoptDecoder.ready) {
      window.MeshoptDecoder.ready.then(startLoad).catch(startLoad);
    } else {
      startLoad();
    }
  }

  var world = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    clock: clock,
    flashlight: flashlight,
    flashTarget: flashTarget,
    fillLight: fillLight,
    moonLight: moonLight,
    gunScene: gunScene,
    gunCam: gunCam,
    gunGroup: gunGroup,
    gunMuzzle: gunMuzzle,
    muzzleLight: muzzleLight,
    dustPts: dustPts,
    rainPts: rainPts,
    levelGroup: levelGroup,
    ZB_T: ZB_T,
    GUN_T: GUN_T,
    ENV_T: ENV_T,
    ENV_DIM: ENV_DIM,
    HIT_FLASH_MAT: HIT_FLASH_MAT,
    lampGlowTex: lampGlowTex,
    _mats: _mats,
    currentLevel: null,
    extractPortal: null,
    colliders: colliders,
    bulletWalls: bulletWalls,
    explosiveBarrels: explosiveBarrels,
    supplyNodes: supplyNodes,
    streetLights: streetLights,
    wisps: wisps,
    toFastLambert: toFastLambert,
    hardenGunObj: hardenGunObj,
    loadAllGLBs: loadAllGLBs,
    loadLevel: loadLevel,
    collide: collide,
    raycastWallDist: raycastWallDist,
    updateWorldVisuals: updateWorldVisuals,
    detonateBarrelVisual: detonateBarrelVisual
  };

  FPS.world = world;
})();
