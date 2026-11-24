"use strict";
window.FPS = window.FPS || {};

(function () {
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = new THREE.FogExp2(0x0a0e13, 0.021);

  var camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 85);
  camera.position.set(0, 1.7, 40);
  camera.updateProjectionMatrix();

  var renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    precision: "mediump",
    stencil: false
  });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  var gameEl = document.getElementById("game");
  if (gameEl) gameEl.appendChild(renderer.domElement);

  var clock = new THREE.Clock();

  // Fast 3-light world rig + player flashlight (ZERO PointLights anywhere!)
  scene.add(new THREE.AmbientLight(0x94a3b8, 1.12));
  scene.add(new THREE.HemisphereLight(0x667a9c, 0x22251c, 1.05));
  var moonLight = new THREE.DirectionalLight(0xa9c0e0, 1.15);
  moonLight.position.set(-30, 50, -20);
  scene.add(moonLight);

  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false })
  );
  moon.position.set(-36, 42, -52);
  moon.matrixAutoUpdate = false;
  moon.updateMatrix();
  scene.add(moon);

  var moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x5a6d8f, transparent: true, opacity: 0.25, fog: false })
  );
  moonGlow.position.copy(moon.position);
  moonGlow.matrixAutoUpdate = false;
  moonGlow.updateMatrix();
  scene.add(moonGlow);

  // Player Flashlight (ZERO PointLights!)
  var flashlight = new THREE.SpotLight(0xfff2cf, 58, 54, 0.48, 0.45, 1.1);
  camera.add(flashlight);
  flashlight.position.set(0.25, -0.22, 0.1);
  var flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, 0, -10);
  camera.add(flashTarget);
  flashlight.target = flashTarget;
  scene.add(camera);

  // Lightweight state-only light shims for backward compatibility (zero Three.js PointLights)
  var fillLight = { intensity: 0, position: new THREE.Vector3() };
  var muzzleLight = { intensity: 0, position: new THREE.Vector3() };

  // Viewmodel Scene (ZERO PointLights!)
  var gunScene = new THREE.Scene();
  var gunCam = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 12);
  gunScene.add(new THREE.HemisphereLight(0x9fb3d4, 0x2a2620, 1.15));
  var _gunKey = new THREE.DirectionalLight(0xfff1d6, 1.6);
  _gunKey.position.set(0.7, 1.3, 0.5);
  gunScene.add(_gunKey);
  var gunMuzzle = { intensity: 0, position: new THREE.Vector3() };
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
  var dustPts = makePoints(60, 0.05, 0xfff2cf, 0.45);
  var rainPts = makePoints(140, 0.08, 0x9fc0e0, 0.3);

  // Level container & persistent world arrays
  var levelGroup = new THREE.Group();
  scene.add(levelGroup);

  var ZB_T = {};
  var GUN_T = {};
  var ENV_T = {};
  var ENV_DIM = {};
  var _envSubCache = {};
  var HIT_FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  var colliders = [];
  var bulletWalls = [];
  var explosiveBarrels = [];
  var supplyNodes = [];
  var streetLights = [];
  var wisps = [];

  var _qualityLevel = 0;
  var _visFrame = 0;
  var _lampPoleInst = null;
  var _lampHeadInst = null;
  var _lampHaloInst = null;
  var _barrelBodyInst = null;
  var _barrelRingInst = null;
  var _scorchOuterInst = null;
  var _scorchRingInst = null;
  var _scorchCursor = 0;
  var _supBuckets = {};

  // Reusable zero-alloc transform scratch objects
  var _tmpPos = new THREE.Vector3();
  var _tmpScale = new THREE.Vector3();
  var _tmpQuat = new THREE.Quaternion();
  var _tmpEuler = new THREE.Euler();
  var _tmpMat4 = new THREE.Matrix4();
  var _tmpPlacementMat = new THREE.Matrix4();
  var _identQuat = new THREE.Quaternion();
  var _unitScale = new THREE.Vector3(1, 1, 1);
  var _upAxis = new THREE.Vector3(0, 1, 0);
  var _flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI * 0.5);
  var _zeroMat4 = new THREE.Matrix4().makeScale(0, 0, 0);

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

  var barrelTex = _makeTiledTex(128, function (ctx, S) {
    ctx.fillStyle = "#b81d1d";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#8a1212";
    ctx.fillRect(0, S * 0.46, S, S * 0.08);
    ctx.fillStyle = "#ffcf38";
    ctx.fillRect(0, S * 0.24, S, S * 0.12);
    ctx.fillRect(0, S * 0.64, S, S * 0.12);
    ctx.fillStyle = "#2b1614";
    ctx.fillRect(0, 0, S, 7);
    ctx.fillRect(0, S - 7, S, 7);
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
    barrelBody: new THREE.MeshLambertMaterial({ map: barrelTex, color: 0xffffff, emissive: 0x3a0606 }),
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
  function _disposeUnusedPbrMaps(m, keepMap, keepEmissive) {
    var slots = [m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, keepEmissive ? null : m.emissiveMap];
    for (var i = 0; i < slots.length; i++) {
      var t = slots[i];
      if (t && t !== keepMap && t !== keepEmissive && typeof t.dispose === "function") {
        try { t.dispose(); } catch (e) {}
      }
    }
  }

  function toFastLambert(root, fallbackHex, tintMul, isEnv) {
    if (!root || !root.traverse) return;
    var swaps = [];
    root.traverse(function (o) {
      if (o.geometry && o.geometry.userData) o.geometry.userData.sharedGeo = true;
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) { out.push(m); continue; }
        if (m.map) { try { m.map.needsUpdate = true; } catch (e) {} }
        if (m.isMeshLambertMaterial) {
          out.push(m);
          continue;
        }
        var colHex = m.map ? 0xffffff : fallbackHex;
        var lm = new THREE.MeshLambertMaterial({
          map: m.map || null,
          color: colHex,
          transparent: false
        });
        if (tintMul && lm.color) lm.color.multiplyScalar(tintMul);
        _disposeUnusedPbrMaps(m, m.map || null, null);
        if (typeof m.dispose === "function") { try { m.dispose(); } catch (e) {} }
        out.push(lm);
      }
      var outMat = Array.isArray(o.material) ? out : out[0];
      o.material = outMat;
      o.userData.origMat = outMat;
      o.frustumCulled = !o.isSkinnedMesh;
      if (isEnv && o.isSkinnedMesh && o.parent) {
        var nm = new THREE.Mesh(o.geometry, outMat);
        nm.position.copy(o.position);
        nm.rotation.copy(o.rotation);
        nm.scale.copy(o.scale);
        nm.name = o.name;
        nm.userData.origMat = outMat;
        nm.frustumCulled = true;
        swaps.push([o, nm]);
      }
    });
    for (var si = 0; si < swaps.length; si++) {
      var oldMesh = swaps[si][0];
      var newMesh = swaps[si][1];
      var parent = oldMesh.parent;
      if (parent) {
        while (oldMesh.children.length) newMesh.add(oldMesh.children[0]);
        parent.add(newMesh);
        parent.remove(oldMesh);
      }
    }
  }

  function hardenGunObj(root) {
    if (!root || !root.traverse) return;
    root.traverse(function (o) {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.material) return;
      var list = Array.isArray(o.material) ? o.material : [o.material];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (!m) { out.push(m); continue; }
        if (m.map) { try { m.map.needsUpdate = true; } catch (e) {} }
        if (m.isMeshLambertMaterial) {
          out.push(m);
          continue;
        }
        var lm = new THREE.MeshLambertMaterial({
          map: m.map || null,
          color: m.map ? 0xe6e8ec : 0x32363d,
          emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
          emissiveMap: m.emissiveMap || null,
          emissiveIntensity: m.emissiveIntensity !== undefined ? m.emissiveIntensity : 0.45,
          transparent: !!m.transparent,
          opacity: m.opacity !== undefined ? m.opacity : 1,
          alphaTest: m.alphaTest || 0,
          side: m.side !== undefined ? m.side : THREE.FrontSide
        });
        _disposeUnusedPbrMaps(m, m.map || null, m.emissiveMap || null);
        if (typeof m.dispose === "function") { try { m.dispose(); } catch (e) {} }
        out.push(lm);
      }
      o.material = Array.isArray(o.material) ? out : out[0];
      o.frustumCulled = false;
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

  function _mergeIndexedGeos(geoList) {
    if (!geoList || !geoList.length) return null;
    var totalVerts = 0;
    var totalIdx = 0;
    for (var i = 0; i < geoList.length; i++) {
      var g = geoList[i];
      totalVerts += g.attributes.position.count;
      totalIdx += g.index ? g.index.count : g.attributes.position.count;
    }
    var posArr = new Float32Array(totalVerts * 3);
    var normArr = new Float32Array(totalVerts * 3);
    var uvArr = new Float32Array(totalVerts * 2);
    var idxArr = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
    var vOff = 0;
    var iOff = 0;
    for (var i = 0; i < geoList.length; i++) {
      var geo = geoList[i];
      var p = geo.attributes.position.array;
      var n = geo.attributes.normal.array;
      var u = geo.attributes.uv ? geo.attributes.uv.array : null;
      posArr.set(p, vOff * 3);
      normArr.set(n, vOff * 3);
      if (u) uvArr.set(u, vOff * 2);
      if (geo.index) {
        var srcIdx = geo.index.array;
        for (var k = 0; k < srcIdx.length; k++) idxArr[iOff + k] = srcIdx[k] + vOff;
        iOff += srcIdx.length;
      } else {
        var vc = geo.attributes.position.count;
        for (var k2 = 0; k2 < vc; k2++) idxArr[iOff + k2] = vOff + k2;
        iOff += vc;
      }
      vOff += geo.attributes.position.count;
      geo.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
    out.setIndex(new THREE.BufferAttribute(idxArr, 1));
    out.computeBoundingSphere();
    return out;
  }

  var _supGlowBarGeo = (function () {
    var b = new THREE.BoxGeometry(0.96, 0.1, 0.72);
    b.translate(0, 0.08, 0);
    var c1 = new THREE.BoxGeometry(0.36, 0.06, 0.12);
    c1.translate(0, 0.30, 0);
    return _markShared(_mergeIndexedGeos([b, c1]));
  })();

  var _supGlowCrossGeo = (function () {
    var b = new THREE.BoxGeometry(0.96, 0.1, 0.72);
    b.translate(0, 0.08, 0);
    var c1 = new THREE.BoxGeometry(0.36, 0.06, 0.12);
    c1.translate(0, 0.30, 0);
    var c2 = new THREE.BoxGeometry(0.12, 0.06, 0.36);
    c2.translate(0, 0.30, 0);
    return _markShared(_mergeIndexedGeos([b, c1, c2]));
  })();

  function _collectFenceRun(x, z, len, rot, sp, postMatrices, railGeos) {
    var step = sp || 4.5;
    var n = Math.max(2, Math.floor(len / step));
    var cos = rot ? Math.cos(rot) : 1;
    var sin = rot ? Math.sin(rot) : 0;
    for (var k = 0; k <= n; k++) {
      var lx = -len * 0.5 + (k / n) * len;
      var mat4 = new THREE.Matrix4();
      if (rot) mat4.makeRotationY(rot);
      mat4.setPosition(x + lx * cos, 0.66, z - lx * sin);
      postMatrices.push(mat4);
    }
    var rHeights = [0.98, 0.46];
    for (var rh = 0; rh < rHeights.length; rh++) {
      var rg = new THREE.BoxGeometry(len, 0.12, 0.08);
      rg.translate(0, rHeights[rh], 0);
      if (rot) rg.rotateY(rot);
      rg.translate(x, 0, z);
      railGeos.push(rg);
    }
  }

  function _buildLampsInstanced(lamps) {
    if (!lamps || !lamps.length) return;
    _lampPoleInst = new THREE.InstancedMesh(_lampPoleGeo, _mats.lampPole, lamps.length);
    _lampHeadInst = new THREE.InstancedMesh(_lampHeadGeo, _mats.lampHead, lamps.length);
    _lampHaloInst = new THREE.InstancedMesh(_lampHaloGeo, _mats.lampHalo, lamps.length);

    for (var li = 0; li < lamps.length; li++) {
      var lp = lamps[li];
      _tmpPos.set(lp.x, 2.2, lp.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _lampPoleInst.setMatrixAt(li, _tmpMat4);

      _tmpPos.set(lp.x, 4.5, lp.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _lampHeadInst.setMatrixAt(li, _tmpMat4);

      _tmpMat4.compose(_tmpPos, camera.quaternion, _unitScale);
      _lampHaloInst.setMatrixAt(li, _tmpMat4);

      streetLights.push({ x: lp.x, y: 4.5, z: lp.z, flick: Math.random() * 10, on: true, instIdx: li });
      _addCircleCollider(lp.x, lp.z, 0.3);
    }

    var arr = [_lampPoleInst, _lampHeadInst, _lampHaloInst];
    for (var i = 0; i < arr.length; i++) {
      arr[i].instanceMatrix.needsUpdate = true;
      arr[i].matrixAutoUpdate = false;
      arr[i].updateMatrix();
      arr[i].frustumCulled = false;
      levelGroup.add(arr[i]);
    }
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

  function _getEnvSubs(key) {
    var tpl = ENV_T[key];
    if (!tpl) return null;
    var cached = _envSubCache[key];
    if (cached && cached.tpl === tpl) return cached.subs;
    tpl.updateMatrixWorld(true);
    var invRoot = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
    var subs = [];
    tpl.traverse(function (o) {
      if (o.isMesh && o.geometry) {
        if (o.geometry.userData) o.geometry.userData.sharedGeo = true;
        var localMat = new THREE.Matrix4().multiplyMatrices(invRoot, o.matrixWorld);
        subs.push({ geo: o.geometry, mat: o.material, localMat: localMat });
      }
    });
    _envSubCache[key] = { tpl: tpl, subs: subs };
    return subs;
  }

  function _registerPropColliders(p, sw, sd, sh) {
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
  }

  var _propsPlacedForLevel = null;

  function _placeLevelProps(levelDef) {
    if (!levelDef || _propsPlacedForLevel === levelDef) return;
    if (!Object.keys(ENV_T).length) return;
    _propsPlacedForLevel = levelDef;
    var props = levelDef.props || [];
    var propBuckets = {};
    var bucketOrder = [];

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var d = ENV_DIM[p.key];
      if (p.key === "wall_door" && p.coll === "gate") {
        var gh = p.h || (d ? d.h : 5.2);
        var gScale = d && d.h ? (gh / d.h) : 2.8;
        var gw = d ? d.w * gScale : 5.6;
        var gd = d ? d.d * gScale : 0.72;
        _buildOpenGate(p, gw, gh, gd);
        continue;
      }
      var subs = _getEnvSubs(p.key);
      if (!subs || !subs.length || !d || !d.h) continue;

      var scale, sink = p.sink || 0;
      if (p.w && !p.h && d.w) {
        scale = p.w / d.w;
        sink = (d.h * scale) - 0.06;
      } else {
        scale = (p.h || d.h) / d.h;
        if (p.key === "cobble" && !p.sink) sink = Math.max(0, (d.h * scale) - 0.08);
      }

      var ry = p.rotY || 0;
      _tmpPos.set(p.x, -d.minY * scale - sink, p.z);
      if (ry) _tmpQuat.setFromAxisAngle(_upAxis, ry);
      else _tmpQuat.copy(_identQuat);
      _tmpScale.setScalar(scale);
      _tmpPlacementMat.compose(_tmpPos, _tmpQuat, _tmpScale);

      var bList = propBuckets[p.key];
      if (!bList) {
        bList = [];
        for (var si = 0; si < subs.length; si++) {
          bList.push({ geo: subs[si].geo, mat: subs[si].mat, matrices: [] });
        }
        propBuckets[p.key] = bList;
        bucketOrder.push(p.key);
      }
      for (var sj = 0; sj < subs.length; sj++) {
        bList[sj].matrices.push(new THREE.Matrix4().multiplyMatrices(_tmpPlacementMat, subs[sj].localMat));
      }

      _registerPropColliders(p, d.w * scale, d.d * scale, d.h * scale);
      window.__envPlaced = (window.__envPlaced || 0) + 1;
    }

    for (var bi = 0; bi < bucketOrder.length; bi++) {
      var list = propBuckets[bucketOrder[bi]];
      for (var sbi = 0; sbi < list.length; sbi++) {
        var entry = list[sbi];
        if (!entry.matrices.length) continue;
        var inst = new THREE.InstancedMesh(entry.geo, entry.mat, entry.matrices.length);
        for (var mi = 0; mi < entry.matrices.length; mi++) {
          inst.setMatrixAt(mi, entry.matrices[mi]);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.matrixAutoUpdate = false;
        inst.updateMatrix();
        if (typeof inst.computeBoundingSphere === "function") {
          inst.computeBoundingSphere();
          inst.frustumCulled = true;
        } else {
          inst.frustumCulled = false;
        }
        levelGroup.add(inst);
      }
    }
  }

  function _buildBarrelsInstanced(barrels) {
    if (!barrels || !barrels.length) return;
    var n = barrels.length;
    _barrelBodyInst = new THREE.InstancedMesh(_barrelBodyGeo, _mats.barrelBody, n);
    _barrelRingInst = new THREE.InstancedMesh(_barrelFloorGeo, _mats.barrelFloorRing, n);
    _scorchOuterInst = new THREE.InstancedMesh(_scorchOuterGeo, _mats.scorchOuter, n);
    _scorchRingInst = new THREE.InstancedMesh(_scorchRingGeo, _mats.scorchRing, n);

    for (var bi = 0; bi < n; bi++) {
      var b = barrels[bi];
      _tmpPos.set(b.x, 0.59, b.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _barrelBodyInst.setMatrixAt(bi, _tmpMat4);

      _tmpPos.set(b.x, 0.03, b.z);
      _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
      _barrelRingInst.setMatrixAt(bi, _tmpMat4);

      _scorchOuterInst.setMatrixAt(bi, _zeroMat4);
      _scorchRingInst.setMatrixAt(bi, _zeroMat4);

      var rec = { x: b.x, z: b.z, r: 0.58, hp: 30, alive: true, mesh: null, instIdx: bi };
      explosiveBarrels.push(rec);
      _addCircleCollider(b.x, b.z, 0.58, rec);
    }

    var arr = [_barrelBodyInst, _barrelRingInst, _scorchOuterInst, _scorchRingInst];
    for (var i = 0; i < arr.length; i++) {
      arr[i].instanceMatrix.needsUpdate = true;
      arr[i].matrixAutoUpdate = false;
      arr[i].updateMatrix();
      arr[i].frustumCulled = false;
      levelGroup.add(arr[i]);
    }
  }

  function _buildSuppliesInstanced(supplies) {
    if (!supplies || !supplies.length) return;
    var supByKind = { med: [], ammo: [], both: [] };
    for (var si = 0; si < supplies.length; si++) {
      var s = supplies[si];
      var kind = s.kind || "both";
      if (!supByKind[kind]) supByKind[kind] = [];
      var idx = supByKind[kind].length;
      var rec = {
        x: s.x,
        z: s.z,
        kind: kind,
        alive: true,
        respawnT: 0,
        mesh: null,
        instIdx: idx,
        _t: Math.random() * 6,
        _ry: 0,
        _rz: 0,
        _wasAlive: true
      };
      supByKind[kind].push(rec);
      supplyNodes.push(rec);
    }

    for (var kKey in supByKind) {
      if (!Object.prototype.hasOwnProperty.call(supByKind, kKey)) continue;
      var list = supByKind[kKey];
      if (!list.length) continue;

      var bodyMat = kKey === "med" ? _mats.supMedBody : (kKey === "ammo" ? _mats.supAmmoBody : _mats.supBothBody);
      var glowMat = kKey === "med" ? _mats.supMedGlow : (kKey === "ammo" ? _mats.supAmmoGlow : _mats.supBothGlow);
      var floorMat = kKey === "med" ? _mats.supFloorMed : (kKey === "ammo" ? _mats.supFloorAmmo : _mats.supFloorBoth);
      var glowGeo = kKey === "ammo" ? _supGlowBarGeo : _supGlowCrossGeo;

      var boxInst = new THREE.InstancedMesh(_supBoxGeo, bodyMat, list.length);
      var glowInst = new THREE.InstancedMesh(glowGeo, glowMat, list.length);
      var discInst = new THREE.InstancedMesh(_supDiscGeo, floorMat, list.length);
      var ringInst = new THREE.InstancedMesh(_supRingGeo, glowMat, list.length);

      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        _tmpPos.set(item.x, 0.34 + Math.sin(item._t) * 0.065, item.z);
        _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
        boxInst.setMatrixAt(i, _tmpMat4);
        glowInst.setMatrixAt(i, _tmpMat4);

        _tmpPos.set(item.x, 0.04, item.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        discInst.setMatrixAt(i, _tmpMat4);

        _tmpPos.set(item.x, 0.06, item.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        ringInst.setMatrixAt(i, _tmpMat4);
      }

      var arr = [boxInst, glowInst, discInst, ringInst];
      for (var ai = 0; ai < arr.length; ai++) {
        arr[ai].instanceMatrix.needsUpdate = true;
        arr[ai].matrixAutoUpdate = false;
        arr[ai].updateMatrix();
        arr[ai].frustumCulled = false;
        levelGroup.add(arr[ai]);
      }

      _supBuckets[kKey] = {
        boxInst: boxInst,
        glowInst: glowInst,
        discInst: discInst,
        ringInst: ringInst,
        boxDirty: false,
        discDirty: false,
        ringDirty: false
      };
    }
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
      if (o.isInstancedMesh && typeof o.dispose === "function") {
        o.dispose();
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
    _lampPoleInst = null;
    _lampHeadInst = null;
    _lampHaloInst = null;
    _barrelBodyInst = null;
    _barrelRingInst = null;
    _scorchOuterInst = null;
    _scorchRingInst = null;
    _scorchCursor = 0;
    _supBuckets = {};
    _visFrame = 0;

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

    // Perimeter barrier fences (batched: 1 InstancedMesh for posts + 1 merged rail Mesh) & boundary colliders at ±half
    var fencePostMats = [];
    var fenceRailGeos = [];
    _collectFenceRun(0, -half - 0.35, arena + 0.7, 0, 4.5, fencePostMats, fenceRailGeos);
    _collectFenceRun(0, half + 0.35, arena + 0.7, 0, 4.5, fencePostMats, fenceRailGeos);
    _collectFenceRun(-half - 0.35, 0, arena + 0.7, Math.PI * 0.5, 4.5, fencePostMats, fenceRailGeos);
    _collectFenceRun(half + 0.35, 0, arena + 0.7, Math.PI * 0.5, 4.5, fencePostMats, fenceRailGeos);

    if (fencePostMats.length) {
      var postInst = new THREE.InstancedMesh(_fencePostGeo, _mats.fence, fencePostMats.length);
      for (var pi = 0; pi < fencePostMats.length; pi++) postInst.setMatrixAt(pi, fencePostMats[pi]);
      postInst.instanceMatrix.needsUpdate = true;
      postInst.matrixAutoUpdate = false;
      postInst.updateMatrix();
      levelGroup.add(postInst);
    }
    var mergedRailGeo = _mergeIndexedGeos(fenceRailGeos);
    if (mergedRailGeo) {
      var railMesh = new THREE.Mesh(mergedRailGeo, _mats.fence);
      railMesh.matrixAutoUpdate = false;
      railMesh.updateMatrix();
      levelGroup.add(railMesh);
    }

    _addBoxCollider(0, -half - 0.5, half + 1, 0.5, 0);
    _addBoxCollider(0, half + 0.5, half + 1, 0.5, 0);
    _addBoxCollider(-half - 0.5, 0, 0.5, half + 1, 0);
    _addBoxCollider(half + 0.5, 0, 0.5, half + 1, 0);

    // Tactical Walls merged per material bucket (26-34 walls -> <=4 draw calls)
    var walls = levelDef.walls || [];
    var wallBuckets = {};
    for (var wi = 0; wi < walls.length; wi++) {
      var w = walls[wi];
      var matKey = _mats[w.mat] ? w.mat : "stone";
      var wGeo = new THREE.BoxGeometry(w.w, w.h, w.d);
      _applyWallUVs(wGeo, w.w, w.h, w.d, matKey);
      if (w.ry) wGeo.rotateY(w.ry);
      wGeo.translate(w.x, w.h * 0.5, w.z);
      if (!wallBuckets[matKey]) wallBuckets[matKey] = [];
      wallBuckets[matKey].push(wGeo);

      var hw = w.w * 0.5;
      var hd = w.d * 0.5;
      _addBoxCollider(w.x, w.z, hw, hd, w.ry || 0);
      if (w.h >= 1.6) {
        _addBulletWall(w.x, w.z, hw, hd, w.h, w.ry || 0);
      }
    }
    for (var wk in wallBuckets) {
      if (!Object.prototype.hasOwnProperty.call(wallBuckets, wk)) continue;
      var mergedWallGeo = _mergeIndexedGeos(wallBuckets[wk]);
      if (mergedWallGeo) {
        var wallMesh = new THREE.Mesh(mergedWallGeo, _mats[wk]);
        wallMesh.matrixAutoUpdate = false;
        wallMesh.updateMatrix();
        levelGroup.add(wallMesh);
      }
    }

    // GLB Props (placed immediately if templates loaded, otherwise completed when loadAllGLBs finishes)
    _placeLevelProps(levelDef);

    // Street Lamps (batched into 3 InstancedMeshes, zero PointLights)
    _buildLampsInstanced(levelDef.lamps || []);

    // Explosive Crimson Barrels + Pooled Scorch Marks (batched into 4 InstancedMeshes)
    _buildBarrelsInstanced(levelDef.explosiveBarrels || []);

    // Supply Nodes (batched per kind via InstancedMesh + merged glow geometry)
    _buildSuppliesInstanced(levelDef.supplies || []);

    // Extraction Portal Beacon
    world.extractPortal = _buildExtractPortal(levelDef.extractPos);

    // Ground Fog Wisps (reduced count + respects quality level)
    var wCount = 4;
    var showWeather = _qualityLevel < 1;
    for (var fi = 0; fi < wCount; fi++) {
      var wp = new THREE.Mesh(_wispGeo, _mats.wisp);
      wp.position.set((Math.random() - 0.5) * arena * 0.9, 1.1 + Math.random() * 1.1, (Math.random() - 0.5) * arena * 0.9);
      wp.rotation.y = Math.random() * Math.PI;
      wp.scale.x = 0.7 + Math.random() * 0.7;
      wp.visible = showWeather;
      levelGroup.add(wp);
      wisps.push({ m: wp, s: 0.25 + Math.random() * 0.45, half: half });
    }

    return levelDef;
  }

  // ---------------------------------------------------------------------------
  // Visual Updates, Barrel Detonation & Quality API
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

    // Supply Nodes instanced visual sync & floating spin
    for (var si = 0; si < supplyNodes.length; si++) {
      var sn = supplyNodes[si];
      var bucket = _supBuckets[sn.kind];
      if (!bucket) continue;
      if (!sn.alive) {
        if (sn._wasAlive) {
          bucket.boxInst.setMatrixAt(sn.instIdx, _zeroMat4);
          bucket.glowInst.setMatrixAt(sn.instIdx, _zeroMat4);
          bucket.discInst.setMatrixAt(sn.instIdx, _zeroMat4);
          bucket.ringInst.setMatrixAt(sn.instIdx, _zeroMat4);
          bucket.boxDirty = true;
          bucket.discDirty = true;
          bucket.ringDirty = true;
          sn._wasAlive = false;
        }
        continue;
      }
      if (!sn._wasAlive) {
        _tmpPos.set(sn.x, 0.04, sn.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        bucket.discInst.setMatrixAt(sn.instIdx, _tmpMat4);
        bucket.discDirty = true;
        sn._wasAlive = true;
      }
      sn._t += d * 2.4;
      sn._ry += d * 0.95;
      sn._rz += d * 1.25;

      _tmpPos.set(sn.x, 0.34 + Math.sin(sn._t) * 0.065, sn.z);
      _tmpQuat.setFromAxisAngle(_upAxis, sn._ry);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
      bucket.boxInst.setMatrixAt(sn.instIdx, _tmpMat4);
      bucket.glowInst.setMatrixAt(sn.instIdx, _tmpMat4);
      bucket.boxDirty = true;

      _tmpPos.set(sn.x, 0.06, sn.z);
      _tmpEuler.set(-Math.PI * 0.5, 0, sn._rz, "XYZ");
      _tmpQuat.setFromEuler(_tmpEuler);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
      bucket.ringInst.setMatrixAt(sn.instIdx, _tmpMat4);
      bucket.ringDirty = true;
    }
    for (var sk in _supBuckets) {
      if (!Object.prototype.hasOwnProperty.call(_supBuckets, sk)) continue;
      var bk = _supBuckets[sk];
      if (bk.boxDirty) {
        bk.boxInst.instanceMatrix.needsUpdate = true;
        bk.glowInst.instanceMatrix.needsUpdate = true;
        bk.boxDirty = false;
      }
      if (bk.discDirty) {
        bk.discInst.instanceMatrix.needsUpdate = true;
        bk.discDirty = false;
      }
      if (bk.ringDirty) {
        bk.ringInst.instanceMatrix.needsUpdate = true;
        bk.ringDirty = false;
      }
    }

    // Street Lamp halos billboard toward camera (throttled to every 2nd call)
    if ((_visFrame++ % 2 === 0) && _lampHaloInst && streetLights.length) {
      for (var li = 0; li < streetLights.length; li++) {
        var sl = streetLights[li];
        var fl = 1 + 0.045 * Math.sin(_visT * 6.5 + sl.flick);
        _tmpPos.set(sl.x, 4.5, sl.z);
        _tmpScale.set(fl, fl, 1);
        _tmpMat4.compose(_tmpPos, camera.quaternion, _tmpScale);
        _lampHaloInst.setMatrixAt(li, _tmpMat4);
      }
      _lampHaloInst.instanceMatrix.needsUpdate = true;
    }

    // Atmospheric wisps & particles
    for (var wi = 0; wi < wisps.length; wi++) {
      var w = wisps[wi];
      if (!w.m.visible) continue;
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

    var idx = barrel.instIdx;
    if (typeof idx === "number") {
      if (_barrelBodyInst && idx < _barrelBodyInst.count) {
        _barrelBodyInst.setMatrixAt(idx, _zeroMat4);
        _barrelBodyInst.instanceMatrix.needsUpdate = true;
      }
      if (_barrelRingInst && idx < _barrelRingInst.count) {
        _barrelRingInst.setMatrixAt(idx, _zeroMat4);
        _barrelRingInst.instanceMatrix.needsUpdate = true;
      }
    }

    var sIdx = typeof idx === "number"
      ? idx
      : (_scorchOuterInst && _scorchCursor < _scorchOuterInst.count ? _scorchCursor++ : -1);
    if (sIdx >= 0) {
      if (_scorchOuterInst && sIdx < _scorchOuterInst.count) {
        _tmpPos.set(barrel.x, 0.025, barrel.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _scorchOuterInst.setMatrixAt(sIdx, _tmpMat4);
        _scorchOuterInst.instanceMatrix.needsUpdate = true;
      }
      if (_scorchRingInst && sIdx < _scorchRingInst.count) {
        _tmpPos.set(barrel.x, 0.03, barrel.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _scorchRingInst.setMatrixAt(sIdx, _tmpMat4);
        _scorchRingInst.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function setQuality(qLevel) {
    _qualityLevel = qLevel | 0;
    camera.far = _qualityLevel === 0 ? 85 : (_qualityLevel === 1 ? 72 : 60);
    camera.updateProjectionMatrix();
    var showWeather = _qualityLevel < 1;
    if (dustPts) dustPts.visible = showWeather;
    if (rainPts) rainPts.visible = showWeather;
    for (var i = 0; i < wisps.length; i++) {
      if (wisps[i] && wisps[i].m) wisps[i].m.visible = showWeather;
    }
  }

  function getPerfStats() {
    var mem = renderer && renderer.info && renderer.info.memory ? renderer.info.memory : {};
    return {
      textures: mem.textures || 0,
      geometries: mem.geometries || 0
    };
  }

  // ---------------------------------------------------------------------------
  // GLB Loader & GPU Warmup
  // ---------------------------------------------------------------------------
  var _glbStarted = false;
  var _glbDone = false;
  var _readyCbs = [];
  var _progCbs = [];
  var _warmupDone = false;
  var _warmupStarted = false;
  var _warmupCbs = [];

  function _initTex(tex) {
    if (tex && tex.isTexture && typeof renderer.initTexture === "function") {
      if (!tex.image || tex.image.width !== 0) {
        try { renderer.initTexture(tex); } catch (e) {}
      }
    }
  }

  function _initMatTextures(mat) {
    if (!mat) return;
    var arr = Array.isArray(mat) ? mat : [mat];
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m) continue;
      _initTex(m.map);
      _initTex(m.emissiveMap);
      _initTex(m.alphaMap);
      _initTex(m.normalMap);
    }
  }

  function _initObjTextures(root) {
    if (!root || typeof root.traverse !== "function") return;
    root.traverse(function (o) {
      if (o.isMesh || o.isSkinnedMesh) _initMatTextures(o.material);
    });
  }

  function compileCurrentLevel() {
    try {
      renderer.compile(scene, camera);
      renderer.compile(gunScene, gunCam);
    } catch (e) {}
  }

  function warmupGPU(onProgress, onDone) {
    var totalCount = 7 + 4 + ((FPS.ENV_KEYS || window.ENV_KEYS || []).length);
    if (_warmupDone) {
      if (typeof onProgress === "function") {
        try { onProgress({ loaded: totalCount, total: totalCount, pct: 100, phase: "warmup", label: "Sẵn sàng chiến đấu!" }); } catch (e) {}
      }
      if (typeof onDone === "function") {
        try { onDone(); } catch (e) {}
      }
      return;
    }
    if (typeof onDone === "function") _warmupCbs.push(onDone);
    if (_warmupStarted) return;
    _warmupStarted = true;

    function report(pct, label) {
      if (typeof onProgress === "function") {
        try { onProgress({ loaded: totalCount, total: totalCount, pct: pct, phase: "warmup", label: label }); } catch (e) {}
      }
    }

    function finishWarmup() {
      _warmupDone = true;
      window.__loadDone = true;
      var cbs = _warmupCbs.slice();
      _warmupCbs.length = 0;
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](); } catch (e) { console.error("warmup onDone error", e); }
      }
    }

    // Gather unique GPU textures once to upload in smooth batches (6/frame)
    var seenTex = new Set();
    var texQueue = [];
    function queueTex(tex) {
      if (tex && tex.isTexture && !seenTex.has(tex)) {
        if (!tex.image || tex.image.width !== 0) {
          seenTex.add(tex);
          texQueue.push(tex);
        }
      }
    }
    function queueMatTex(mat) {
      if (!mat) return;
      var arr = Array.isArray(mat) ? mat : [mat];
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        if (!m) continue;
        queueTex(m.map);
        queueTex(m.emissiveMap);
      }
    }
    function queueObjTex(root) {
      if (!root || typeof root.traverse !== "function") return;
      root.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) queueMatTex(o.material);
      });
    }

    queueTex(lampGlowTex);
    for (var mk in _mats) {
      if (Object.prototype.hasOwnProperty.call(_mats, mk)) queueMatTex(_mats[mk]);
    }
    queueMatTex(HIT_FLASH_MAT);
    for (var zk in ZB_T) if (ZB_T[zk] && ZB_T[zk].scene) queueObjTex(ZB_T[zk].scene);
    for (var gk in GUN_T) if (GUN_T[gk]) queueObjTex(GUN_T[gk]);
    for (var ek in ENV_T) if (ENV_T[ek]) queueObjTex(ENV_T[ek]);

    var cursor = 0;
    function uploadChunk() {
      var batchEnd = Math.min(texQueue.length, cursor + 6);
      if (typeof renderer.initTexture === "function") {
        for (; cursor < batchEnd; cursor++) {
          try { renderer.initTexture(texQueue[cursor]); } catch (e) {}
        }
      } else {
        cursor = texQueue.length;
      }
      var pct = 80 + Math.round((cursor / Math.max(1, texQueue.length)) * 10);
      report(Math.min(90, pct), "Đang nạp kết cấu GPU (" + cursor + "/" + texQueue.length + ")...");
      if (cursor < texQueue.length) {
        requestAnimationFrame(uploadChunk);
      } else {
        requestAnimationFrame(compileWeaponsStep);
      }
    }

    function compileWeaponsStep() {
      report(93, "Đang khởi tạo vũ khí 3D...");
      try {
        if (FPS.entities && typeof FPS.entities.buildGun === "function") {
          var gKinds = ["shotgun", "rifle", "thuanthien", "pistol"];
          for (var gi = 0; gi < gKinds.length; gi++) {
            FPS.entities.buildGun(gKinds[gi]);
          }
        }
        renderer.compile(gunScene, gunCam);
      } catch (e) {}
      requestAnimationFrame(compileWorldStep);
    }

    function compileWorldStep() {
      report(97, "Đang biên dịch shader GPU...");
      var warmupGroup = null;
      var wrapped = [];
      var savedCull = [];
      var helperGeos = [];
      var prevPos = camera.position.clone();
      var prevRot = camera.rotation.clone();
      try {
        if (!world.currentLevel && FPS.LEVELS && FPS.LEVELS.length) {
          loadLevel(FPS.LEVELS[0]);
        }
        camera.position.set(0, 1.7, 24);
        camera.lookAt(0, 1.2, 14);
        camera.updateMatrixWorld(true);

        warmupGroup = new THREE.Group();
        warmupGroup.position.set(0, 0, 14);

        // Compile 1 representative SkinnedMesh zombie (all 7 share identical Lambert+Skinning program)
        var repKey = ZB_T.zombie ? "zombie" : Object.keys(ZB_T)[0];
        var tpl = repKey ? ZB_T[repKey] : null;
        if (tpl && tpl.scene) {
          tpl.scene.traverse(function (o) {
            if (o.isMesh || o.isSkinnedMesh) {
              savedCull.push([o, o.frustumCulled]);
              o.frustumCulled = false;
            }
          });
          var wrapper = new THREE.Group();
          wrapper.add(tpl.scene);
          warmupGroup.add(wrapper);
          wrapped.push([wrapper, tpl.scene]);
        }

        var helperMats = [HIT_FLASH_MAT, _mats.scorchOuter, _mats.scorchRing];
        for (var hi = 0; hi < helperMats.length; hi++) {
          if (!helperMats[hi]) continue;
          var hg = new THREE.BoxGeometry(0.05, 0.05, 0.05);
          helperGeos.push(hg);
          var hm = new THREE.Mesh(hg, helperMats[hi]);
          hm.position.set(hi * 0.1 - 0.1, 0.5, 0);
          warmupGroup.add(hm);
        }

        scene.add(warmupGroup);
        renderer.compile(scene, camera);
        renderer.compile(gunScene, gunCam);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(gunScene, gunCam);
        renderer.autoClear = true;
      } catch (e) {
        renderer.autoClear = true;
      } finally {
        for (var wi = 0; wi < wrapped.length; wi++) wrapped[wi][0].remove(wrapped[wi][1]);
        for (var si = 0; si < savedCull.length; si++) savedCull[si][0].frustumCulled = savedCull[si][1];
        if (warmupGroup) scene.remove(warmupGroup);
        for (var hgi = 0; hgi < helperGeos.length; hgi++) helperGeos[hgi].dispose();
        camera.position.copy(prevPos);
        camera.rotation.copy(prevRot);
        camera.updateMatrixWorld(true);
      }

      requestAnimationFrame(function () {
        report(100, "Sẵn sàng chiến đấu!");
        try {
          renderer.clear();
          renderer.render(scene, camera);
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(gunScene, gunCam);
          renderer.autoClear = true;
        } catch (e) {
          renderer.autoClear = true;
        }
        finishWarmup();
      });
    }

    requestAnimationFrame(uploadChunk);
  }

  function loadAllGLBs(onReady, onProgress) {
    if (typeof onProgress === "function") _progCbs.push(onProgress);
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
    var totalAssets = zbKeys.length + gunKeys.length + envKeys.length;
    var loadedAssets = 0;
    var totalLeft = totalAssets;

    function emitProgress(label) {
      var pct = Math.min(80, Math.round((loadedAssets / Math.max(1, totalAssets)) * 80));
      var payload = {
        loaded: loadedAssets,
        total: totalAssets,
        pct: pct,
        phase: "assets",
        label: label || "Đang tải tài nguyên 3D..."
      };
      for (var i = 0; i < _progCbs.length; i++) {
        try { _progCbs[i](payload); } catch (e) {}
      }
    }

    function checkAllDone(label) {
      loadedAssets++;
      emitProgress(label);
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
      checkAllDone("Đang tải vật cản & bản đồ...");
    }

    function startLoad() {
      if (totalAssets === 0) {
        _glbDone = true;
        var cbs = _readyCbs.slice();
        _readyCbs.length = 0;
        for (var ci = 0; ci < cbs.length; ci++) {
          try { cbs[ci](); } catch (e) {}
        }
        return;
      }

      if (envKeys.length === 0) {
        window.__envTemplatesLoaded = 0;
        window.__envBuilt = true;
        if (!world.currentLevel && FPS.LEVELS && FPS.LEVELS.length) loadLevel(FPS.LEVELS[0]);
      }

      var jobs = [];
      gunKeys.forEach(function (kind) { jobs.push({ type: "gun", key: kind }); });
      zbKeys.forEach(function (key) { jobs.push({ type: "zb", key: key }); });
      envKeys.forEach(function (key) { jobs.push({ type: "env", key: key }); });

      var nextJob = 0;
      var MAX_CONCURRENT = 6;

      function runJob(job, doneCb) {
        if (job.type === "zb") {
          var key = job.key;
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
            checkAllDone("Đang tải mô hình xác sống...");
            doneCb();
          }, undefined, function () {
            console.warn("zb GLB load fail", key);
            checkAllDone("Đang tải mô hình xác sống...");
            doneCb();
          });
        } else if (job.type === "gun") {
          var kind = job.key;
          loader.load("assets/weapons/wp_" + kind + ".glb", function (g) {
            hardenGunObj(g.scene);
            GUN_T[kind] = g.scene;
            if (FPS.entities) {
              if (typeof FPS.entities.onGunLoaded === "function") FPS.entities.onGunLoaded(kind);
              else if (FPS.entities.curWeapon === kind && typeof FPS.entities.buildGun === "function") FPS.entities.buildGun(kind);
            } else if (typeof curWeapon !== "undefined" && curWeapon === kind && typeof buildGun === "function") {
              buildGun(kind);
            }
            checkAllDone("Đang tải vũ khí 3D...");
            doneCb();
          }, undefined, function () {
            console.warn("weapon GLB load fail", kind);
            checkAllDone("Đang tải vũ khí 3D...");
            doneCb();
          });
        } else {
          var eKey = job.key;
          loader.load("assets/env/env_" + eKey + ".glb", function (g) {
            toFastLambert(g.scene, 0x3c3a34, envTint[eKey] || 1, true);
            g.scene.updateMatrixWorld(true);
            var bb = new THREE.Box3().setFromObject(g.scene);
            var sz = new THREE.Vector3();
            bb.getSize(sz);
            ENV_T[eKey] = g.scene;
            ENV_DIM[eKey] = { w: sz.x || 1, h: sz.y || 1, d: sz.z || 1, minY: bb.min.y };
            finishEnvOne();
            doneCb();
          }, undefined, function () {
            console.warn("env GLB load fail", eKey);
            finishEnvOne();
            doneCb();
          });
        }
      }

      function pumpQueue() {
        if (nextJob >= jobs.length) return;
        var job = jobs[nextJob++];
        runJob(job, pumpQueue);
      }

      var initialWorkers = Math.min(MAX_CONCURRENT, jobs.length);
      for (var w = 0; w < initialWorkers; w++) pumpQueue();
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
    gunKey: _gunKey,
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
    compileCurrentLevel: compileCurrentLevel,
    warmupGPU: warmupGPU,
    loadLevel: loadLevel,
    collide: collide,
    raycastWallDist: raycastWallDist,
    updateWorldVisuals: updateWorldVisuals,
    detonateBarrelVisual: detonateBarrelVisual,
    setQuality: setQuality,
    getPerfStats: getPerfStats
  };

  FPS.world = world;
})();
