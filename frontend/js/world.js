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

  // Full v9.0 verticality, interactive objects & hazard state
  var _platforms = [];
  var _rampList = [];
  var _barricades = [];
  var _traps = [];
  var _hazards = [];
  var _generators = [];
  var _relics = [];
  var _totems = [];
  var _gateObj = null;
  var _holdoutObj = null;
  var _armoryObj = null;
  var _anvilObj = null;
  var _waterMesh = null;
  var _toxicMesh = null;
  var _waterElectrified = false;
  var _marketLightsBright = false;

  var _barricadeInst = null;
  var _trapBaseInst = null;
  var _trapFxInst = null;
  var _stationRingInst = null;
  var _genInst = null;
  var _genLedInst = null;
  var _relicInst = null;
  var _relicHaloInst = null;
  var _totemInst = null;
  var _totemCoreInst = null;
  var _armoryFallbackMesh = null;
  var _anvilFallbackMesh = null;

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
  var _supShared = null;
  var _wispInst = null;

  // Reusable zero-alloc transform scratch objects
  var _tmpPos = new THREE.Vector3();
  var _tmpScale = new THREE.Vector3();
  var _tmpQuat = new THREE.Quaternion();
  var _tmpEuler = new THREE.Euler();
  var _tmpMat4 = new THREE.Matrix4();
  var _tmpPlacementMat = new THREE.Matrix4();
  var _tmpCol = new THREE.Color();
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
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
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
    lampHead: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lampHalo: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffffff,
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
    supBody: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    supGlow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    supFloor: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.63,
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
    }),
    barricadeWood: new THREE.MeshLambertMaterial({ map: woodTex, color: 0xc8aa82 }),
    gateIron: new THREE.MeshLambertMaterial({ color: 0x3b4046 }),
    genBody: new THREE.MeshLambertMaterial({ color: 0x3f4c58 }),
    genLed: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    relicBox: new THREE.MeshLambertMaterial({ color: 0xffe082, emissive: 0x553b08 }),
    relicHalo: new THREE.MeshBasicMaterial({
      map: lampGlowTex,
      color: 0xffd54f,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    totemStone: new THREE.MeshLambertMaterial({ color: 0x34283c, emissive: 0x220a2c }),
    totemCore: new THREE.MeshBasicMaterial({ color: 0xc84bff }),
    flareStand: new THREE.MeshLambertMaterial({ color: 0x454d54 }),
    flareBeacon: new THREE.MeshBasicMaterial({ color: 0xff8c2a }),
    boatWood: new THREE.MeshLambertMaterial({ map: woodTex, color: 0xa68964 }),
    trapBase: new THREE.MeshLambertMaterial({ color: 0x2a2f36 }),
    trapFx: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    stationRing: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    waterHazard: new THREE.MeshBasicMaterial({
      color: 0x245a7a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    toxicHazard: new THREE.MeshBasicMaterial({
      color: 0x34b848,
      transparent: true,
      opacity: 0.34,
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

  var _barricadeUnitGeo = _markShared(new THREE.BoxGeometry(1, 1, 1));
  var _genBodyGeo = _markShared(new THREE.BoxGeometry(1.1, 1.25, 0.85));
  var _genLedGeo = _markShared(new THREE.SphereGeometry(0.14, 8, 8));
  var _relicBoxGeo = _markShared(new THREE.BoxGeometry(0.55, 0.42, 0.40));
  var _relicHaloGeo = _markShared(new THREE.PlaneGeometry(1.9, 1.9));
  var _totemBodyGeo = _markShared(new THREE.CylinderGeometry(0.42, 0.56, 2.8, 6));
  var _totemCoreGeo = _markShared(new THREE.OctahedronGeometry(0.34, 0));
  var _trapBaseGeo = _markShared(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 16));
  var _trapFxGeo = _markShared(new THREE.RingGeometry(0.48, 0.96, 20));
  var _stationRingGeo = _markShared(new THREE.RingGeometry(0.95, 1.22, 24));

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
  // Collision, Verticality & Bullet Raycast (zero-allocation hot loops)
  // ---------------------------------------------------------------------------
  function _addBoxCollider(x, z, hw, hd, ry, opts) {
    var ang = ry || 0;
    var rot = Math.abs(ang) > 0.01;
    var cos = rot ? Math.cos(ang) : 1;
    var sin = rot ? Math.sin(ang) : 0;
    var bx = rot ? (hw * Math.abs(cos) + hd * Math.abs(sin)) : hw;
    var bz = rot ? (hw * Math.abs(sin) + hd * Math.abs(cos)) : hd;
    var rec = {
      box: true, x: x, z: z, hw: hw, hd: hd,
      ry: ang, rot: rot, cos: cos, sin: sin, bx: bx, bz: bz,
      yBase: (opts && opts.yBase !== undefined) ? opts.yBase : 0,
      maxY: (opts && opts.maxY !== undefined) ? opts.maxY : 1e6,
      isPlatformDeck: !!(opts && opts.isPlatformDeck),
      ramps: (opts && opts.ramps) || null,
      isProp: !!(opts && opts.isProp),
      barricade: (opts && opts.barricade) || null,
      gate: (opts && opts.gate) || null,
      totem: (opts && opts.totem) || null
    };
    colliders.push(rec);
    return rec;
  }

  function _addCircleCollider(x, z, r, barrelRef, opts) {
    var rec = {
      box: false, x: x, z: z, r: r, bx: r, bz: r,
      barrelRef: barrelRef || null,
      yBase: (opts && opts.yBase !== undefined) ? opts.yBase : 0,
      maxY: (opts && opts.maxY !== undefined) ? opts.maxY : 1e6,
      isProp: !!(opts && opts.isProp)
    };
    colliders.push(rec);
    return rec;
  }

  function _addBulletWall(x, z, hw, hd, maxY, ry, opts) {
    var ang = ry || 0;
    var rot = Math.abs(ang) > 0.01;
    var cos = rot ? Math.cos(ang) : 1;
    var sin = rot ? Math.sin(ang) : 0;
    var bx = rot ? (hw * Math.abs(cos) + hd * Math.abs(sin)) : hw;
    var bz = rot ? (hw * Math.abs(sin) + hd * Math.abs(cos)) : hd;
    var rec = {
      x: x, z: z, hw: hw, hd: hd, maxY: maxY,
      yBase: (opts && opts.yBase !== undefined) ? opts.yBase : 0,
      ry: ang, rot: rot, cos: cos, sin: sin, bx: bx, bz: bz,
      isProp: !!(opts && opts.isProp),
      gate: (opts && opts.gate) || null,
      totem: (opts && opts.totem) || null,
      barricade: (opts && opts.barricade) || null
    };
    bulletWalls.push(rec);
    return rec;
  }

  function _sampleRampY(rm, lx, lz) {
    if (lx < rm.xMin - 1e-4 || lx > rm.xMax + 1e-4 || lz < rm.zMin - 1e-4 || lz > rm.zMax + 1e-4) {
      return -1;
    }
    var span, t;
    if (rm.side === "s") {
      span = rm.zMax - rm.zMin;
      t = span > 1e-5 ? Math.max(0, Math.min(1, (rm.zMax - lz) / span)) : 0;
      return rm.yTop * t;
    }
    if (rm.side === "n") {
      span = rm.zMax - rm.zMin;
      t = span > 1e-5 ? Math.max(0, Math.min(1, (lz - rm.zMin) / span)) : 0;
      return rm.yTop * t;
    }
    if (rm.side === "e") {
      span = rm.xMax - rm.xMin;
      t = span > 1e-5 ? Math.max(0, Math.min(1, (rm.xMax - lx) / span)) : 0;
      return rm.yTop * t;
    }
    if (rm.side === "w") {
      span = rm.xMax - rm.xMin;
      t = span > 1e-5 ? Math.max(0, Math.min(1, (lx - rm.xMin) / span)) : 0;
      return rm.yTop * t;
    }
    return -1;
  }

  function groundY(x, z, curFootY) {
    var foot = (curFootY !== undefined && curFootY !== null) ? curFootY : 0;
    var best = 0;
    var stepUp = 0.65;
    for (var i = 0; i < _platforms.length; i++) {
      var p = _platforms[i];
      var dx = x - p.x;
      var dz = z - p.z;
      var lx = p.rot ? (dx * p.cos - dz * p.sin) : dx;
      var lz = p.rot ? (dx * p.sin + dz * p.cos) : dz;
      var surfY = -1;
      if (!p.rampOnly && Math.abs(lx) <= p.hw + 1e-4 && Math.abs(lz) <= p.hd + 1e-4) {
        surfY = p.yTop;
      }
      for (var ri = 0; ri < p.ramps.length; ri++) {
        var sy = _sampleRampY(p.ramps[ri], lx, lz);
        if (sy > surfY) surfY = sy;
      }
      if (surfY > best && surfY <= foot + stepUp) best = surfY;
    }
    return best;
  }

  var _colOut = { hit: false, nx: 0, nz: 0, barricade: null };

  function _onAttachedRampSeam(c, pos, rad, fy) {
    if (!c.isPlatformDeck || !c.ramps || !c.ramps.length) return false;
    var dx = pos.x - c.x;
    var dz = pos.z - c.z;
    var lx = c.rot ? (dx * c.cos - dz * c.sin) : dx;
    var lz = c.rot ? (dx * c.sin + dz * c.cos) : dz;
    for (var i = 0; i < c.ramps.length; i++) {
      var rm = c.ramps[i];
      if (rm.yTop !== c.maxY) continue;
      if (fy + 0.65 + (rm.yTop * rad / Math.max(0.5, rm.rLen)) < c.maxY) continue;
      if (rm.side === "s") {
        if (lx >= rm.xMin - 0.05 && lx <= rm.xMax + 0.05 && lz >= rm.zMin - rad - 0.15 && lz <= rm.zMin + rad + 0.25) return true;
      } else if (rm.side === "n") {
        if (lx >= rm.xMin - 0.05 && lx <= rm.xMax + 0.05 && lz >= rm.zMax - rad - 0.25 && lz <= rm.zMax + rad + 0.15) return true;
      } else if (rm.side === "e") {
        if (lz >= rm.zMin - 0.05 && lz <= rm.zMax + 0.05 && lx >= rm.xMin - rad - 0.15 && lx <= rm.xMin + rad + 0.25) return true;
      } else if (rm.side === "w") {
        if (lz >= rm.zMin - 0.05 && lz <= rm.zMax + 0.05 && lx >= rm.xMax - rad - 0.25 && lx <= rm.xMax + rad + 0.15) return true;
      }
    }
    return false;
  }

  function collide(pos, r, isZombie, footY, out) {
    var rad = r || 0.5;
    var r2 = rad * rad;
    var fy = (footY !== undefined && footY !== null)
      ? footY
      : (isZombie ? Math.max(0, pos.y || 0) : Math.max(0, (pos.y || 1.7) - 1.7));
    var hit = false;
    var hitNx = 0, hitNz = 0, lastNx = 0, lastNz = 0;
    var hitBarricade = null;

    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (c.barrelRef && !c.barrelRef.alive) continue;
      if (c.barricade && !c.barricade.alive) continue;
      if (c.gate && !c.gate.alive) continue;
      if (c.totem && !c.totem.alive) continue;
      if (c.maxY <= fy + (c.isPlatformDeck ? 0.65 : 0.45)) continue;
      if (c.yBase >= fy + 1.68) continue;
      if (Math.abs(c.x - pos.x) > c.bx + rad || Math.abs(c.z - pos.z) > c.bz + rad) continue;
      if (c.isPlatformDeck && _onAttachedRampSeam(c, pos, rad, fy)) continue;

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
            if (c.barricade) hitBarricade = c.barricade;
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
            if (c.barricade) hitBarricade = c.barricade;
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

    // Ramp side/back pushouts (blocks walking into tall side of ramp from ground level)
    for (var rli = 0; rli < _rampList.length; rli++) {
      var rm = _rampList[rli];
      if (fy >= rm.yTop - 0.1) continue;
      var rdx = pos.x - rm.x;
      var rdz = pos.z - rm.z;
      var rlx = rm.rot ? (rdx * rm.cos - rdz * rm.sin) : rdx;
      var rlz = rm.rot ? (rdx * rm.sin + rdz * rm.cos) : rdz;
      var rclx = Math.max(rm.xMin, Math.min(rm.xMax, rlx));
      var rclz = Math.max(rm.zMin, Math.min(rm.zMax, rlz));
      var ddx = rlx - rclx;
      var ddz = rlz - rclz;
      var dd2 = ddx * ddx + ddz * ddz;
      if (dd2 < r2) {
        var surf = _sampleRampY(rm, rclx, rclz);
        if (surf > fy + 0.55) {
          var rnx, rnz;
          if (dd2 > 1e-8) {
            var dd = Math.sqrt(dd2);
            rnx = ddx / dd;
            rnz = ddz / dd;
            rlx = rclx + rnx * rad;
            rlz = rclz + rnz * rad;
          } else {
            // Entity center is horizontally inside the ramp footprint:
            // skip pushout if within slope/top-seam climb allowance, otherwise eject laterally or down-slope (never backward through high back edge)
            if (surf <= fy + 0.65 + (rm.yTop * rad / Math.max(0.5, rm.rLen))) continue;
            var midX = (rm.xMin + rm.xMax) * 0.5;
            var midZ = (rm.zMin + rm.zMax) * 0.5;
            var halfW = (rm.xMax - rm.xMin) * 0.5;
            var halfD = (rm.zMax - rm.zMin) * 0.5;
            var px = (halfW + rad) - Math.abs(rlx - midX);
            var pz = (halfD + rad) - Math.abs(rlz - midZ);
            if (rm.side === "s" || rm.side === "n") {
              var pDownZ = rm.side === "s" ? ((rm.zMax + rad) - rlz) : (rlz - (rm.zMin - rad));
              if (px <= pDownZ) {
                rnx = (rlx >= midX) ? 1 : -1;
                rnz = 0;
                rlx = midX + rnx * (halfW + rad);
              } else {
                rnx = 0;
                rnz = rm.side === "s" ? 1 : -1;
                rlz = rm.side === "s" ? (rm.zMax + rad) : (rm.zMin - rad);
              }
            } else {
              var pDownX = rm.side === "e" ? ((rm.xMax + rad) - rlx) : (rlx - (rm.xMin - rad));
              if (pz <= pDownX) {
                rnx = 0;
                rnz = (rlz >= midZ) ? 1 : -1;
                rlz = midZ + rnz * (halfD + rad);
              } else {
                rnx = rm.side === "e" ? 1 : -1;
                rnz = 0;
                rlx = rm.side === "e" ? (rm.xMax + rad) : (rm.xMin - rad);
              }
            }
          }
          pos.x = rm.x + (rm.rot ? (rlx * rm.cos + rlz * rm.sin) : rlx);
          pos.z = rm.z + (rm.rot ? (-rlx * rm.sin + rlz * rm.cos) : rlz);
          var wnx = rm.rot ? (rnx * rm.cos + rnz * rm.sin) : rnx;
          var wnz = rm.rot ? (-rnx * rm.sin + rnz * rm.cos) : rnz;
          hit = true;
          hitNx += wnx;
          hitNz += wnz;
          lastNx = wnx;
          lastNz = wnz;
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

    var res = out || _colOut;
    if (hit) {
      var nLen = Math.hypot(hitNx, hitNz);
      if (nLen > 1e-5) {
        res.nx = hitNx / nLen;
        res.nz = hitNz / nLen;
      } else {
        res.nx = lastNx;
        res.nz = lastNz;
      }
      res.hit = true;
      res.barricade = hitBarricade;
    } else {
      res.hit = false;
      res.nx = 0;
      res.nz = 0;
      res.barricade = null;
    }
    return res;
  }

  function _raycastOBBWall(w, ox0, oy, oz0, dx0, dy, dz0, maxT) {
    var yb = w.yBase || 0;
    if (oy > w.maxY && dy >= 0) return -1;
    if (oy < yb && dy <= 0) return -1;

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
    var tmax = maxT;
    var inv, t1, t2, tmp;

    if (dx > -1e-8 && dx < 1e-8) {
      if (ox < -w.hw || ox > w.hw) return -1;
    } else {
      inv = 1 / dx;
      t1 = (-w.hw - ox) * inv;
      t2 = (w.hw - ox) * inv;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    if (dy > -1e-8 && dy < 1e-8) {
      if (oy < yb || oy > w.maxY) return -1;
    } else {
      inv = 1 / dy;
      t1 = (yb - oy) * inv;
      t2 = (w.maxY - oy) * inv;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    if (dz > -1e-8 && dz < 1e-8) {
      if (oz < -w.hd || oz > w.hd) return -1;
    } else {
      inv = 1 / dz;
      t1 = (-w.hd - oz) * inv;
      t2 = (w.hd - oz) * inv;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    return (tmin >= 0 && tmin <= maxT) ? tmin : -1;
  }

  function _raycastRamp(rm, ox0, oy, oz0, dx0, dy, dz0, maxT) {
    if (oy > rm.yTop && dy >= 0) return -1;
    if (oy < 0 && dy <= 0) return -1;
    var rx = ox0 - rm.x;
    var rz = oz0 - rm.z;
    var ox = rm.rot ? (rx * rm.cos - rz * rm.sin) : rx;
    var oz = rm.rot ? (rx * rm.sin + rz * rm.cos) : rz;
    var dx = rm.rot ? (dx0 * rm.cos - dz0 * rm.sin) : dx0;
    var dz = rm.rot ? (dx0 * rm.sin + dz0 * rm.cos) : dz0;

    var tmin = 0;
    var tmax = maxT;
    var inv, t1, t2, tmp;

    if (dx > -1e-8 && dx < 1e-8) {
      if (ox < rm.xMin || ox > rm.xMax) return -1;
    } else {
      inv = 1 / dx;
      t1 = (rm.xMin - ox) * inv;
      t2 = (rm.xMax - ox) * inv;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    if (dz > -1e-8 && dz < 1e-8) {
      if (oz < rm.zMin || oz > rm.zMax) return -1;
    } else {
      inv = 1 / dz;
      t1 = (rm.zMin - oz) * inv;
      t2 = (rm.zMax - oz) * inv;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }

    // y >= 0
    if (dy > -1e-8 && dy < 1e-8) {
      if (oy < 0 || oy > rm.yTop) return -1;
    } else {
      var ty0 = -oy / dy;
      if (dy > 0) { if (ty0 > tmin) tmin = ty0; }
      else { if (ty0 < tmax) tmax = ty0; }
      if (tmin > tmax) return -1;
    }

    // Sloped top half-space: A*x + B*z + y <= C
    var A = 0, B = 0, C = 0, span, s;
    if (rm.side === "s") {
      span = rm.zMax - rm.zMin;
      s = span > 1e-5 ? (rm.yTop / span) : 0;
      B = s; C = s * rm.zMax;
    } else if (rm.side === "n") {
      span = rm.zMax - rm.zMin;
      s = span > 1e-5 ? (rm.yTop / span) : 0;
      B = -s; C = -s * rm.zMin;
    } else if (rm.side === "e") {
      span = rm.xMax - rm.xMin;
      s = span > 1e-5 ? (rm.yTop / span) : 0;
      A = s; C = s * rm.xMax;
    } else if (rm.side === "w") {
      span = rm.xMax - rm.xMin;
      s = span > 1e-5 ? (rm.yTop / span) : 0;
      A = -s; C = -s * rm.xMin;
    }
    var num = C - (A * ox + B * oz + oy);
    var den = A * dx + B * dz + dy;
    if (den > -1e-8 && den < 1e-8) {
      if (num < 0) return -1;
    } else {
      var ts = num / den;
      if (den > 0) { if (ts < tmax) tmax = ts; }
      else { if (ts > tmin) tmin = ts; }
      if (tmin > tmax) return -1;
    }

    return (tmin >= 0 && tmin < maxT) ? tmin : -1;
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
      if (w.gate && !w.gate.alive) continue;
      if (w.totem && !w.totem.alive) continue;
      if (w.barricade && !w.barricade.alive) continue;
      var tHit = _raycastOBBWall(w, ox0, oy, oz0, dx0, dy, dz0, bestDist);
      if (tHit >= 0 && tHit < bestDist) bestDist = tHit;
    }

    for (var ri = 0; ri < _rampList.length; ri++) {
      var tRamp = _raycastRamp(_rampList[ri], ox0, oy, oz0, dx0, dy, dz0, bestDist);
      if (tRamp >= 0 && tRamp < bestDist) bestDist = tRamp;
    }

    return bestDist;
  }

  function raycastTarget(origin, dir, maxDist) {
    var ceiling = (maxDist !== undefined && maxDist > 0) ? maxDist : 100;
    var ox0 = origin.x, oy = origin.y, oz0 = origin.z;
    var dx0 = dir.x, dy = dir.y, dz0 = dir.z;
    var dLen2 = dx0 * dx0 + dy * dy + dz0 * dz0;
    if (dLen2 < 1e-10) return null;
    if (Math.abs(dLen2 - 1) > 1e-4) {
      var invLen = 1 / Math.sqrt(dLen2);
      dx0 *= invLen;
      dy *= invLen;
      dz0 *= invLen;
    }

    var bestDist = ceiling;
    var hasSolidOccluder = false;

    // Ground plane y <= 0
    if (oy > 0 && dy < -1e-6) {
      var tg = -oy / dy;
      if (tg >= 0 && tg < bestDist) {
        bestDist = tg;
        hasSolidOccluder = true;
      }
    }

    // Ramp wedges
    for (var ri = 0; ri < _rampList.length; ri++) {
      var tRamp = _raycastRamp(_rampList[ri], ox0, oy, oz0, dx0, dy, dz0, bestDist);
      if (tRamp >= 0 && tRamp <= bestDist) {
        if (tRamp < bestDist - 1e-7 || !hasSolidOccluder) {
          bestDist = tRamp;
          hasSolidOccluder = true;
        }
      }
    }

    // Non-target solid bulletWalls
    for (var si = 0; si < bulletWalls.length; si++) {
      var sw = bulletWalls[si];
      if (sw.gate || sw.totem || sw.barricade) continue;
      var tWall = _raycastOBBWall(sw, ox0, oy, oz0, dx0, dy, dz0, bestDist);
      if (tWall >= 0 && tWall <= bestDist) {
        bestDist = tWall;
        hasSolidOccluder = true;
      }
    }

    var hitRec = null;
    var targetCap = bestDist + 1e-5;
    for (var i = 0; i < bulletWalls.length; i++) {
      var w = bulletWalls[i];
      if (!w.gate && !w.totem && !w.barricade) continue;
      if (w.gate && !w.gate.alive) continue;
      if (w.totem && !w.totem.alive) continue;
      if (w.barricade && !w.barricade.alive) continue;
      var tHit = _raycastOBBWall(w, ox0, oy, oz0, dx0, dy, dz0, targetCap);
      if (tHit >= 0 && tHit <= targetCap) {
        if (hasSolidOccluder && tHit >= bestDist - 1e-6) continue;
        targetCap = tHit;
        if (w.gate) hitRec = { kind: "gate", obj: w.gate, idx: 0, dist: tHit };
        else if (w.totem) hitRec = { kind: "totem", obj: w.totem, idx: w.totem.idx, dist: tHit };
        else hitRec = { kind: "barricade", obj: w.barricade, idx: w.barricade.idx, dist: tHit };
      }
    }
    return hitRec;
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

  var _ZONE_HALO_HEX = { amber: 0xffb45e, emerald: 0x38ff8c, crimson: 0xff3b4e };
  var _ZONE_HEAD_HEX = { amber: 0xffc37a, emerald: 0x7bffb8, crimson: 0xff7a88 };

  function _buildLampsInstanced(lamps) {
    if (!lamps || !lamps.length) return;
    _lampPoleInst = new THREE.InstancedMesh(_lampPoleGeo, _mats.lampPole, lamps.length);
    _lampHeadInst = new THREE.InstancedMesh(_lampHeadGeo, _mats.lampHead, lamps.length);
    _lampHaloInst = new THREE.InstancedMesh(_lampHaloGeo, _mats.lampHalo, lamps.length);

    for (var li = 0; li < lamps.length; li++) {
      var lp = lamps[li];
      var ly = lp.y || 0;
      var zone = (lp.zone && _ZONE_HALO_HEX[lp.zone]) ? lp.zone : "amber";
      _tmpPos.set(lp.x, ly + 2.2, lp.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _lampPoleInst.setMatrixAt(li, _tmpMat4);

      _tmpPos.set(lp.x, ly + 4.5, lp.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _lampHeadInst.setMatrixAt(li, _tmpMat4);

      _tmpMat4.compose(_tmpPos, camera.quaternion, _unitScale);
      _lampHaloInst.setMatrixAt(li, _tmpMat4);

      _tmpCol.setHex(_ZONE_HEAD_HEX[zone]);
      _lampHeadInst.setColorAt(li, _tmpCol);
      _tmpCol.setHex(_ZONE_HALO_HEX[zone]);
      _lampHaloInst.setColorAt(li, _tmpCol);

      streetLights.push({
        x: lp.x,
        y: ly + 4.5,
        baseY: ly,
        z: lp.z,
        zone: zone,
        flick: Math.random() * 10,
        on: true,
        instIdx: li
      });
      _addCircleCollider(lp.x, lp.z, 0.3, null, { yBase: ly, maxY: ly + 4.4 });
    }

    if (_lampHeadInst.instanceColor) _lampHeadInst.instanceColor.needsUpdate = true;
    if (_lampHaloInst.instanceColor) _lampHaloInst.instanceColor.needsUpdate = true;

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

  function _buildOpenGate(p, sw, sh, sd, wallBuckets, collidersOnly) {
    var ry = p.rotY || 0;
    var py = p.y || 0;
    var pW = Math.max(0.85, sw * 0.21);
    var pD = Math.max(0.85, sd * 1.15);
    var lintelH = Math.min(0.95, sh * 0.18);
    var pH = Math.max(3.6, sh - lintelH);
    var off = Math.max(2.2, sw * 0.40);

    if (!collidersOnly) {
      var pGeoL = new THREE.BoxGeometry(pW, pH, pD);
      _applyWallUVs(pGeoL, pW, pH, pD, "stone");
      pGeoL.translate(-off, pH * 0.5, 0);

      var pGeoR = new THREE.BoxGeometry(pW, pH, pD);
      _applyWallUVs(pGeoR, pW, pH, pD, "stone");
      pGeoR.translate(off, pH * 0.5, 0);

      var beamW = off * 2 + pW + 0.35;
      var lGeo = new THREE.BoxGeometry(beamW, lintelH, pD + 0.16);
      _applyWallUVs(lGeo, beamW, lintelH, pD + 0.16, "brick");
      lGeo.translate(0, pH + lintelH * 0.5, 0);

      var capGeo = new THREE.BoxGeometry(beamW + 0.2, 0.18, pD + 0.30);
      capGeo.translate(0, pH + lintelH + 0.09, 0);

      var parts = [
        { geo: pGeoL, mat: "stone" },
        { geo: pGeoR, mat: "stone" },
        { geo: lGeo, mat: "brick" },
        { geo: capGeo, mat: "darkStone" }
      ];
      for (var pi = 0; pi < parts.length; pi++) {
        if (ry) parts[pi].geo.rotateY(ry);
        parts[pi].geo.translate(p.x, py, p.z);
      }

      if (wallBuckets) {
        for (var bi = 0; bi < parts.length; bi++) {
          var mk = parts[bi].mat;
          if (!wallBuckets[mk]) wallBuckets[mk] = [];
          wallBuckets[mk].push(parts[bi].geo);
        }
      } else {
        var stoneGeo = _mergeIndexedGeos([pGeoL, pGeoR]);
        if (stoneGeo) {
          var sm = new THREE.Mesh(stoneGeo, _mats.stone);
          sm.matrixAutoUpdate = false;
          sm.updateMatrix();
          levelGroup.add(sm);
          _placedPropMeshes.push(sm);
        }
        var lm = new THREE.Mesh(lGeo, _mats.brick);
        lm.matrixAutoUpdate = false;
        lm.updateMatrix();
        levelGroup.add(lm);
        _placedPropMeshes.push(lm);
        var cm = new THREE.Mesh(capGeo, _mats.darkStone);
        cm.matrixAutoUpdate = false;
        cm.updateMatrix();
        levelGroup.add(cm);
        _placedPropMeshes.push(cm);
      }
    }

    var cos = Math.cos(ry), sin = Math.sin(ry);
    var ghw = pW * 0.5;
    var ghd = pD * 0.5;
    var lx = p.x - off * cos, lz = p.z + off * sin;
    var rx = p.x + off * cos, rz = p.z - off * sin;
    var colOpts = { yBase: py, maxY: py + pH + lintelH, isProp: true };
    _addBoxCollider(lx, lz, ghw, ghd, ry, colOpts);
    _addBoxCollider(rx, rz, ghw, ghd, ry, colOpts);
    _addBulletWall(lx, lz, ghw, ghd, py + pH + lintelH, ry, { yBase: py, isProp: true });
    _addBulletWall(rx, rz, ghw, ghd, py + pH + lintelH, ry, { yBase: py, isProp: true });

    window.__envPlaced = (window.__envPlaced || 0) + 1;
    return null;
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
    var py = p.y || 0;
    var coll = p.coll;
    var opts = { yBase: py, maxY: py + sh, isProp: true };
    if (coll === "box") {
      var hw = Math.max(0.3, sw * 0.5 * 0.92);
      var hd = Math.max(0.3, sd * 0.5 * 0.92);
      _addBoxCollider(p.x, p.z, hw, hd, ry, opts);
      if (_solidBulletProps[p.key] && sh >= 1.6) {
        _addBulletWall(p.x, p.z, hw, hd, py + sh, ry, { yBase: py, isProp: true });
      }
    } else if (coll === "circle") {
      _addCircleCollider(p.x, p.z, Math.max(0.25, Math.max(sw, sd) * 0.5 * 0.95), null, opts);
    } else if (coll === "gate") {
      var cos = Math.cos(ry), sin = Math.sin(ry);
      var off = sw * 0.40;
      var ghw = Math.max(0.35, sw * 0.11);
      var ghd = Math.max(0.4, sd * 0.5);
      var lx = p.x - off * cos, lz = p.z + off * sin;
      var rx = p.x + off * cos, rz = p.z - off * sin;
      _addBoxCollider(lx, lz, ghw, ghd, ry, opts);
      _addBoxCollider(rx, rz, ghw, ghd, ry, opts);
      if (sh >= 1.6) {
        _addBulletWall(lx, lz, ghw, ghd, py + sh, ry, { yBase: py, isProp: true });
        _addBulletWall(rx, rz, ghw, ghd, py + sh, ry, { yBase: py, isProp: true });
      }
    }
  }

  var _propsPlacedForLevel = null;
  var _propsPlacedEnvCount = -1;
  var _placedPropMeshes = [];
  var _openGateInWallBuckets = false;

  function _pushPropToBucket(propBuckets, bucketOrder, key, subs, d, px, py, pz, ry, targetH, targetW, sinkOverride) {
    var scale, sink = sinkOverride || 0;
    if (targetW && !targetH && d.w) {
      scale = targetW / d.w;
      sink = (d.h * scale) - 0.06;
    } else {
      scale = (targetH || d.h) / d.h;
      if (key === "cobble" && !sinkOverride) sink = Math.max(0, (d.h * scale) - 0.08);
    }

    _tmpPos.set(px, py - d.minY * scale - sink, pz);
    if (ry) _tmpQuat.setFromAxisAngle(_upAxis, ry);
    else _tmpQuat.copy(_identQuat);
    _tmpScale.setScalar(scale);
    _tmpPlacementMat.compose(_tmpPos, _tmpQuat, _tmpScale);

    var bList = propBuckets[key];
    if (!bList) {
      bList = [];
      for (var si = 0; si < subs.length; si++) {
        bList.push({ geo: subs[si].geo, mat: subs[si].mat, matrices: [] });
      }
      propBuckets[key] = bList;
      bucketOrder.push(key);
    }
    for (var sj = 0; sj < subs.length; sj++) {
      bList[sj].matrices.push(new THREE.Matrix4().multiplyMatrices(_tmpPlacementMat, subs[sj].localMat));
    }
    return scale;
  }

  function _placeLevelProps(levelDef, wallBuckets) {
    if (!levelDef) return;
    var envCount = Object.keys(ENV_T).length;
    if (!envCount) return;
    if (_propsPlacedForLevel === levelDef && _propsPlacedEnvCount === envCount) return;

    if (_propsPlacedForLevel === levelDef) {
      for (var pm = 0; pm < _placedPropMeshes.length; pm++) {
        var oldObj = _placedPropMeshes[pm];
        levelGroup.remove(oldObj);
        if (oldObj.traverse) {
          oldObj.traverse(function (ch) {
            if (ch.geometry && (!ch.geometry.userData || !ch.geometry.userData.sharedGeo)) {
              ch.geometry.dispose();
            }
            if (ch.isInstancedMesh && typeof ch.dispose === "function") ch.dispose();
          });
        }
      }
      _placedPropMeshes.length = 0;
      for (var ci = colliders.length - 1; ci >= 0; ci--) {
        if (colliders[ci].isProp) colliders.splice(ci, 1);
      }
      for (var bwi = bulletWalls.length - 1; bwi >= 0; bwi--) {
        if (bulletWalls[bwi].isProp) bulletWalls.splice(bwi, 1);
      }
      window.__envPlaced = 0;
    }

    _propsPlacedForLevel = levelDef;
    _propsPlacedEnvCount = envCount;
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
        var skipMesh = !wallBuckets && _openGateInWallBuckets;
        if (wallBuckets) _openGateInWallBuckets = true;
        _buildOpenGate(p, gw, gh, gd, wallBuckets, skipMesh);
        continue;
      }
      var subs = _getEnvSubs(p.key);
      if (!subs || !subs.length || !d || !d.h) continue;

      var scale = _pushPropToBucket(propBuckets, bucketOrder, p.key, subs, d, p.x, p.y || 0, p.z, p.rotY || 0, p.h, p.w, p.sink || 0);
      _registerPropColliders(p, d.w * scale, d.d * scale, d.h * scale);
      window.__envPlaced = (window.__envPlaced || 0) + 1;
    }

    // Inject Armory (chest) & Anvil (table) GLB visuals ONLY (colliders already registered in loadLevel)
    if (levelDef.armory) {
      var cSubs = _getEnvSubs("chest");
      var cDim = ENV_DIM.chest;
      if (cSubs && cSubs.length && cDim && cDim.h) {
        if (_armoryFallbackMesh) {
          levelGroup.remove(_armoryFallbackMesh);
          if (_armoryFallbackMesh.geometry) _armoryFallbackMesh.geometry.dispose();
          _armoryFallbackMesh = null;
        }
        var ar = levelDef.armory;
        _pushPropToBucket(propBuckets, bucketOrder, "chest", cSubs, cDim, ar.x, ar.y || 0, ar.z, ar.rotY || 0, 1.15, 0, 0);
      }
    }
    if (levelDef.anvil) {
      var tSubs = _getEnvSubs("table");
      var tDim = ENV_DIM.table;
      if (tSubs && tSubs.length && tDim && tDim.h) {
        if (_anvilFallbackMesh) {
          levelGroup.remove(_anvilFallbackMesh);
          if (_anvilFallbackMesh.geometry) _anvilFallbackMesh.geometry.dispose();
          _anvilFallbackMesh = null;
        }
        var av = levelDef.anvil;
        _pushPropToBucket(propBuckets, bucketOrder, "table", tSubs, tDim, av.x, av.y || 0, av.z, av.rotY || 0, 1.15, 0, 0);
      }
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
        _placedPropMeshes.push(inst);
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
      var by = b.y || 0;
      _tmpPos.set(b.x, by + 0.59, b.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      _barrelBodyInst.setMatrixAt(bi, _tmpMat4);

      _tmpPos.set(b.x, by + 0.03, b.z);
      _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
      _barrelRingInst.setMatrixAt(bi, _tmpMat4);

      _scorchOuterInst.setMatrixAt(bi, _zeroMat4);
      _scorchRingInst.setMatrixAt(bi, _zeroMat4);

      var rec = { x: b.x, y: by, z: b.z, r: 0.58, hp: 30, alive: true, mesh: null, instIdx: bi };
      explosiveBarrels.push(rec);
      _addCircleCollider(b.x, b.z, 0.58, rec, { yBase: by, maxY: by + 1.25 });
    }

    var arr = [_barrelBodyInst, _barrelRingInst, _scorchOuterInst, _scorchRingInst];
    for (var i = 0; i < arr.length; i++) {
      arr[i].instanceMatrix.needsUpdate = true;
      arr[i].matrixAutoUpdate = false;
      arr[i].updateMatrix();
      arr[i].frustumCulled = false;
      levelGroup.add(arr[i]);
    }
    _scorchOuterInst.visible = false;
    _scorchRingInst.visible = false;
  }

  function _buildSuppliesInstanced(supplies) {
    if (!supplies || !supplies.length) return;
    var n = supplies.length;
    var crossCount = 0;
    var barCount = 0;
    for (var ci = 0; ci < n; ci++) {
      if ((supplies[ci].kind || "both") === "ammo") barCount++;
      else crossCount++;
    }

    var boxInst = new THREE.InstancedMesh(_supBoxGeo, _mats.supBody, n);
    var discInst = new THREE.InstancedMesh(_supDiscGeo, _mats.supFloor, n);
    var ringInst = new THREE.InstancedMesh(_supRingGeo, _mats.supGlow, n);
    var glowCrossInst = crossCount > 0 ? new THREE.InstancedMesh(_supGlowCrossGeo, _mats.supGlow, crossCount) : null;
    var glowBarInst = barCount > 0 ? new THREE.InstancedMesh(_supGlowBarGeo, _mats.supGlow, barCount) : null;

    var crossCursor = 0;
    var barCursor = 0;
    for (var si = 0; si < n; si++) {
      var s = supplies[si];
      var sy = s.y || 0;
      var kind = s.kind || "both";
      var isAmmo = kind === "ammo";
      var gInst = isAmmo ? glowBarInst : glowCrossInst;
      var gIdx = isAmmo ? barCursor++ : crossCursor++;

      var rec = {
        x: s.x,
        y: sy,
        z: s.z,
        kind: kind,
        alive: true,
        respawnT: 0,
        mesh: null,
        instIdx: si,
        glowInst: gInst,
        glowIdx: gIdx,
        _t: Math.random() * 6,
        _ry: 0,
        _rz: 0,
        _wasAlive: true
      };
      supplyNodes.push(rec);

      var bodyHex = kind === "med" ? 0xd9e3db : (isAmmo ? 0x4c5d36 : 0x2d5438);
      var glowHex = kind === "med" ? 0x3eff8b : (isAmmo ? 0xffcc48 : 0x42ff94);
      var floorHex = kind === "med" ? 0x38ff8c : (isAmmo ? 0xffb838 : 0x38ff8c);

      _tmpCol.setHex(bodyHex);
      boxInst.setColorAt(si, _tmpCol);
      _tmpCol.setHex(glowHex);
      ringInst.setColorAt(si, _tmpCol);
      if (gInst) gInst.setColorAt(gIdx, _tmpCol);
      _tmpCol.setHex(floorHex);
      discInst.setColorAt(si, _tmpCol);

      _tmpPos.set(rec.x, sy + 0.34 + Math.sin(rec._t) * 0.065, rec.z);
      _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
      boxInst.setMatrixAt(si, _tmpMat4);
      if (gInst) gInst.setMatrixAt(gIdx, _tmpMat4);

      _tmpPos.set(rec.x, sy + 0.04, rec.z);
      _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
      discInst.setMatrixAt(si, _tmpMat4);

      _tmpPos.set(rec.x, sy + 0.06, rec.z);
      _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
      ringInst.setMatrixAt(si, _tmpMat4);
    }

    var arr = [boxInst, discInst, ringInst];
    if (glowCrossInst) arr.push(glowCrossInst);
    if (glowBarInst) arr.push(glowBarInst);
    for (var ai = 0; ai < arr.length; ai++) {
      arr[ai].instanceMatrix.needsUpdate = true;
      if (arr[ai].instanceColor) arr[ai].instanceColor.needsUpdate = true;
      arr[ai].matrixAutoUpdate = false;
      arr[ai].updateMatrix();
      arr[ai].frustumCulled = false;
      levelGroup.add(arr[ai]);
    }

    _supShared = {
      boxInst: boxInst,
      discInst: discInst,
      ringInst: ringInst,
      glowCrossInst: glowCrossInst,
      glowBarInst: glowBarInst
    };
  }

  function _buildExtractPortal(ep) {
    var x = ep ? ep.x : 0;
    var y = (ep && ep.y) ? ep.y : 0;
    var z = ep ? ep.z : 0;
    var r = (ep && ep.r) ? ep.r : 4.0;

    var g = new THREE.Group();
    g.position.set(x, y, z);

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
    progRing.visible = false;
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
      y: y,
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

  function clearLevel() {
    _clearLevelGroup();
    colliders.length = 0;
    bulletWalls.length = 0;
    explosiveBarrels.length = 0;
    supplyNodes.length = 0;
    streetLights.length = 0;
    wisps.length = 0;
    _platforms.length = 0;
    _rampList.length = 0;
    _barricades.length = 0;
    _traps.length = 0;
    _hazards.length = 0;
    _generators.length = 0;
    _relics.length = 0;
    _totems.length = 0;
    _gateObj = null;
    _holdoutObj = null;
    _armoryObj = null;
    _anvilObj = null;
    _waterMesh = null;
    _toxicMesh = null;
    _waterElectrified = false;
    _marketLightsBright = false;
    _mats.lampHalo.opacity = 0.75;
    _mats.waterHazard.color.setHex(0x245a7a);
    _mats.waterHazard.opacity = 0.42;
    _mats.flareBeacon.color.setHex(0xff8c2a);

    window.__envPlaced = 0;
    _propsPlacedForLevel = null;
    _propsPlacedEnvCount = -1;
    _placedPropMeshes.length = 0;
    _openGateInWallBuckets = false;
    world.currentLevel = null;
    _lampPoleInst = null;
    _lampHeadInst = null;
    _lampHaloInst = null;
    _barrelBodyInst = null;
    _barrelRingInst = null;
    _scorchOuterInst = null;
    _scorchRingInst = null;
    _scorchCursor = 0;
    _supShared = null;
    _wispInst = null;
    _barricadeInst = null;
    _trapBaseInst = null;
    _trapFxInst = null;
    _stationRingInst = null;
    _genInst = null;
    _genLedInst = null;
    _relicInst = null;
    _relicHaloInst = null;
    _totemInst = null;
    _totemCoreInst = null;
    _armoryFallbackMesh = null;
    _anvilFallbackMesh = null;
    _visFrame = 0;
    world.extractPortal = null;
  }

  // ---------------------------------------------------------------------------
  // Full v9.0 Verticality, Interactive World Builders & Mutators
  // ---------------------------------------------------------------------------
  function _makeRampWedgeGeo(rm, matKey, px, pz, ry) {
    var tile = matKey === "crate" ? 1.35 : 2.2;
    var x0 = rm.xMin, x1 = rm.xMax;
    var z0 = rm.zMin, z1 = rm.zMax;
    var h = rm.yTop;
    var pos = [];
    var norm = [];
    var uvs = [];
    var idx = [];

    function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, u0, v0, u1, v1, u2, v2) {
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy;
      var ny = uz * vx - ux * vz;
      var nz = ux * vy - uy * vx;
      var nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;
      var base = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      uvs.push(u0, v0, u1, v1, u2, v2);
      idx.push(base, base + 1, base + 2);
    }

    function pushQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, uSpan, vSpan) {
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = dx - ax, vy = dy - ay, vz = dz - az;
      var nx = uy * vz - uz * vy;
      var ny = uz * vx - ux * vz;
      var nz = ux * vy - uy * vx;
      var nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;
      var base = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
      var su = uSpan / tile, sv = vSpan / tile;
      uvs.push(0, sv, 0, 0, su, 0, su, sv);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    var wSpan = x1 - x0;
    var dSpan = z1 - z0;
    if (rm.side === "s") {
      var slopeS = Math.hypot(dSpan, h);
      pushQuad(x0, h, z0, x0, 0, z1, x1, 0, z1, x1, h, z0, wSpan, slopeS);
      pushQuad(x1, h, z0, x1, 0, z0, x0, 0, z0, x0, h, z0, wSpan, h);
      pushTri(x0, 0, z0, x0, 0, z1, x0, h, z0, 0, 0, dSpan / tile, 0, 0, h / tile);
      pushTri(x1, 0, z0, x1, h, z0, x1, 0, z1, 0, 0, 0, h / tile, dSpan / tile, 0);
    } else if (rm.side === "n") {
      var slopeN = Math.hypot(dSpan, h);
      pushQuad(x1, h, z1, x1, 0, z0, x0, 0, z0, x0, h, z1, wSpan, slopeN);
      pushQuad(x0, h, z1, x0, 0, z1, x1, 0, z1, x1, h, z1, wSpan, h);
      pushTri(x0, 0, z1, x0, h, z1, x0, 0, z0, 0, 0, 0, h / tile, dSpan / tile, 0);
      pushTri(x1, 0, z1, x1, 0, z0, x1, h, z1, 0, 0, dSpan / tile, 0, 0, h / tile);
    } else if (rm.side === "e") {
      var slopeE = Math.hypot(wSpan, h);
      pushQuad(x0, h, z1, x1, 0, z1, x1, 0, z0, x0, h, z0, dSpan, slopeE);
      pushQuad(x0, h, z0, x0, 0, z0, x0, 0, z1, x0, h, z1, dSpan, h);
      pushTri(x0, 0, z0, x0, h, z0, x1, 0, z0, 0, 0, 0, h / tile, wSpan / tile, 0);
      pushTri(x0, 0, z1, x1, 0, z1, x0, h, z1, 0, 0, wSpan / tile, 0, 0, h / tile);
    } else {
      var slopeW = Math.hypot(wSpan, h);
      pushQuad(x1, h, z0, x0, 0, z0, x0, 0, z1, x1, h, z1, dSpan, slopeW);
      pushQuad(x1, h, z1, x1, 0, z1, x1, 0, z0, x1, h, z0, dSpan, h);
      pushTri(x1, 0, z0, x0, 0, z0, x1, h, z0, 0, 0, wSpan / tile, 0, 0, h / tile);
      pushTri(x1, 0, z1, x1, h, z1, x0, 0, z1, 0, 0, 0, h / tile, wSpan / tile, 0);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    if (ry) geo.rotateY(ry);
    geo.translate(px, 0, pz);
    return geo;
  }

  function _buildPlatforms(platforms, wallBuckets) {
    if (!platforms || !platforms.length) return;
    for (var pi = 0; pi < platforms.length; pi++) {
      var p = platforms[pi];
      var ry = p.ry || 0;
      var rot = Math.abs(ry) > 0.01;
      var cos = rot ? Math.cos(ry) : 1;
      var sin = rot ? Math.sin(ry) : 0;
      var hw = (p.w || 4) * 0.5;
      var hd = (p.d || 4) * 0.5;
      var yTop = p.yTop || 2.0;
      var matKey = _mats[p.mat] ? p.mat : "wood";

      var yBottom = 0;
      var deckH = yTop;
      if (!p.solid && yTop > 0.55) {
        deckH = Math.min(0.32, yTop * 0.2, p.thickness || 0.32);
        yBottom = yTop - deckH;
      }

      var platRamps = [];
      if (!p.rampOnly) {
        var dGeo = new THREE.BoxGeometry(hw * 2, deckH, hd * 2);
        _applyWallUVs(dGeo, hw * 2, deckH, hd * 2, matKey);
        dGeo.translate(0, yBottom + deckH * 0.5, 0);
        if (rot) dGeo.rotateY(ry);
        dGeo.translate(p.x, 0, p.z);
        if (!wallBuckets[matKey]) wallBuckets[matKey] = [];
        wallBuckets[matKey].push(dGeo);

        var colYBase = (yBottom < 1.68 && !p.underpass) ? 0 : yBottom;
        _addBoxCollider(p.x, p.z, hw, hd, ry, {
          yBase: colYBase,
          maxY: yTop,
          isPlatformDeck: true,
          ramps: platRamps
        });
        _addBulletWall(p.x, p.z, hw, hd, yTop, ry, { yBase: yBottom });
      }

      var sides = [];
      if (Array.isArray(p.rampSides) && p.rampSides.length) sides = p.rampSides;
      else if (p.rampSide) sides = [p.rampSide];

      for (var si = 0; si < sides.length; si++) {
        var side = sides[si];
        if (side !== "n" && side !== "s" && side !== "e" && side !== "w") continue;
        var rLen = p.rampLen || Math.max(2.8, yTop * 2.1);
        var rw = p.rampW || ((side === "n" || side === "s") ? (hw * 2) : (hd * 2));
        var rhw = rw * 0.5;
        var xMin, xMax, zMin, zMax;
        if (p.rampOnly) {
          xMin = -hw; xMax = hw; zMin = -hd; zMax = hd;
        } else if (side === "s") {
          xMin = -rhw; xMax = rhw; zMin = hd; zMax = hd + rLen;
        } else if (side === "n") {
          xMin = -rhw; xMax = rhw; zMin = -hd - rLen; zMax = -hd;
        } else if (side === "e") {
          xMin = hw; xMax = hw + rLen; zMin = -rhw; zMax = rhw;
        } else {
          xMin = -hw - rLen; xMax = -hw; zMin = -rhw; zMax = rhw;
        }

        var rm = {
          x: p.x, z: p.z, rot: rot, cos: cos, sin: sin,
          side: side, yTop: yTop, rLen: rLen, rw: rw,
          hw: hw, hd: hd, rampOnly: !!p.rampOnly,
          xMin: xMin, xMax: xMax, zMin: zMin, zMax: zMax
        };
        platRamps.push(rm);
        _rampList.push(rm);

        var rGeo = _makeRampWedgeGeo(rm, matKey, p.x, p.z, rot ? ry : 0);
        if (!wallBuckets[matKey]) wallBuckets[matKey] = [];
        wallBuckets[matKey].push(rGeo);
      }

      _platforms.push({
        id: p.id || ("plat_" + pi),
        x: p.x, z: p.z, hw: hw, hd: hd, yTop: yTop, yBottom: yBottom,
        rot: rot, cos: cos, sin: sin, rampOnly: !!p.rampOnly, ramps: platRamps
      });
    }
  }

  function _buildObjectiveObjects(obj) {
    if (!obj || !obj.type) return;
    if (obj.type === "gate") {
      var gw = obj.w || 4.8;
      var gh = obj.h || 3.2;
      var gd = obj.d || 0.7;
      var gy = obj.y || 0;
      var ry = obj.ry || 0;
      var gGeos = [];
      var p1 = new THREE.BoxGeometry(gw, gh, gd);
      _applyWallUVs(p1, gw, gh, gd, "wood");
      p1.translate(0, gh * 0.5, 0);
      gGeos.push(p1);
      var barH = 0.24;
      var b1 = new THREE.BoxGeometry(gw + 0.16, barH, gd + 0.16);
      _applyWallUVs(b1, gw + 0.16, barH, gd + 0.16, "crate");
      b1.translate(0, gh * 0.32, 0);
      gGeos.push(b1);
      var b2 = new THREE.BoxGeometry(gw + 0.16, barH, gd + 0.16);
      _applyWallUVs(b2, gw + 0.16, barH, gd + 0.16, "crate");
      b2.translate(0, gh * 0.72, 0);
      gGeos.push(b2);

      var merged = _mergeIndexedGeos(gGeos);
      var mesh = new THREE.Mesh(merged, _mats.barricadeWood);
      mesh.position.set(obj.x, gy, obj.z);
      if (ry) mesh.rotation.y = ry;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      levelGroup.add(mesh);

      var maxHp = obj.hp || 350;
      _gateObj = {
        x: obj.x, y: gy, z: obj.z, w: gw, h: gh, d: gd, ry: ry,
        hp: maxHp, maxHp: maxHp, alive: true, mesh: mesh
      };
      _addBoxCollider(obj.x, obj.z, gw * 0.5, gd * 0.5, ry, { yBase: gy, maxY: gy + gh, gate: _gateObj });
      _addBulletWall(obj.x, obj.z, gw * 0.5, gd * 0.5, gy + gh, ry, { yBase: gy, gate: _gateObj });
    } else if (obj.type === "generators" && Array.isArray(obj.items) && obj.items.length) {
      var items = obj.items;
      _genInst = new THREE.InstancedMesh(_genBodyGeo, _mats.genBody, items.length);
      _genLedInst = new THREE.InstancedMesh(_genLedGeo, _mats.genLed, items.length);
      for (var gi = 0; gi < items.length; gi++) {
        var it = items[gi];
        var iy = it.y || 0;
        var ryG = it.ry || 0;
        _tmpPos.set(it.x, iy + 0.625, it.z);
        if (ryG) _tmpQuat.setFromAxisAngle(_upAxis, ryG);
        else _tmpQuat.copy(_identQuat);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
        _genInst.setMatrixAt(gi, _tmpMat4);

        _tmpPos.set(it.x, iy + 1.38, it.z);
        _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
        _genLedInst.setMatrixAt(gi, _tmpMat4);
        _tmpCol.setHex(0xff3b3b);
        _genLedInst.setColorAt(gi, _tmpCol);

        var rec = {
          id: it.id || ("gen_" + gi),
          idx: gi,
          x: it.x, y: iy, z: it.z,
          holdSec: it.holdSec || 2.0,
          active: false
        };
        _generators.push(rec);
        _addBoxCollider(it.x, it.z, 0.6, 0.5, ryG, { yBase: iy, maxY: iy + 1.4 });
      }
      if (_genLedInst.instanceColor) _genLedInst.instanceColor.needsUpdate = true;
      [_genInst, _genLedInst].forEach(function (inst) {
        inst.instanceMatrix.needsUpdate = true;
        inst.matrixAutoUpdate = false;
        inst.updateMatrix();
        inst.frustumCulled = false;
        levelGroup.add(inst);
      });
    } else if (obj.type === "relics" && Array.isArray(obj.items) && obj.items.length) {
      var rItems = obj.items;
      _relicInst = new THREE.InstancedMesh(_relicBoxGeo, _mats.relicBox, rItems.length);
      _relicHaloInst = new THREE.InstancedMesh(_relicHaloGeo, _mats.relicHalo, rItems.length);
      for (var ri = 0; ri < rItems.length; ri++) {
        var rIt = rItems[ri];
        var ryPos = rIt.y || 0;
        _tmpPos.set(rIt.x, ryPos + 0.55, rIt.z);
        _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
        _relicInst.setMatrixAt(ri, _tmpMat4);

        _tmpPos.set(rIt.x, ryPos + 0.08, rIt.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _relicHaloInst.setMatrixAt(ri, _tmpMat4);

        _relics.push({
          id: rIt.id || ("relic_" + ri),
          idx: ri,
          x: rIt.x, y: ryPos, z: rIt.z,
          collected: false,
          _t: ri * 1.3
        });
      }
      [_relicInst, _relicHaloInst].forEach(function (inst) {
        inst.instanceMatrix.needsUpdate = true;
        inst.matrixAutoUpdate = false;
        inst.updateMatrix();
        inst.frustumCulled = false;
        levelGroup.add(inst);
      });
    } else if (obj.type === "totems" && Array.isArray(obj.items) && obj.items.length) {
      var tItems = obj.items;
      _totemInst = new THREE.InstancedMesh(_totemBodyGeo, _mats.totemStone, tItems.length);
      _totemCoreInst = new THREE.InstancedMesh(_totemCoreGeo, _mats.totemCore, tItems.length);
      for (var ti = 0; ti < tItems.length; ti++) {
        var tIt = tItems[ti];
        var ty = tIt.y || 0;
        _tmpPos.set(tIt.x, ty + 1.4, tIt.z);
        _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
        _totemInst.setMatrixAt(ti, _tmpMat4);

        _tmpPos.set(tIt.x, ty + 3.1, tIt.z);
        _tmpMat4.compose(_tmpPos, _identQuat, _unitScale);
        _totemCoreInst.setMatrixAt(ti, _tmpMat4);

        var tHp = tIt.hp || 260;
        var tRec = {
          id: tIt.id || ("totem_" + ti),
          idx: ti,
          x: tIt.x, y: ty, z: tIt.z,
          hp: tHp, maxHp: tHp, alive: true, _t: ti * 1.1
        };
        _totems.push(tRec);
        _addBoxCollider(tIt.x, tIt.z, 0.62, 0.62, 0, { yBase: ty, maxY: ty + 3.4, totem: tRec });
        _addBulletWall(tIt.x, tIt.z, 0.62, 0.62, ty + 3.4, 0, { yBase: ty, totem: tRec });
      }
      [_totemInst, _totemCoreInst].forEach(function (inst) {
        inst.instanceMatrix.needsUpdate = true;
        inst.matrixAutoUpdate = false;
        inst.updateMatrix();
        inst.frustumCulled = false;
        levelGroup.add(inst);
      });
    } else if (obj.type === "holdout" && obj.flarePos) {
      var fp = obj.flarePos;
      var fy = fp.y || 0;
      var standGeo = _mergeIndexedGeos([
        new THREE.CylinderGeometry(0.28, 0.36, 1.0, 10).translate(0, 0.5, 0),
        new THREE.BoxGeometry(0.75, 0.14, 0.75).translate(0, 0.07, 0)
      ]);
      var standMesh = new THREE.Mesh(standGeo, _mats.flareStand);
      standMesh.position.set(fp.x, fy, fp.z);
      standMesh.matrixAutoUpdate = false;
      standMesh.updateMatrix();
      levelGroup.add(standMesh);

      var beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), _mats.flareBeacon);
      beaconMesh.position.set(fp.x, fy + 1.18, fp.z);
      levelGroup.add(beaconMesh);

      // Boat hull approaching pier
      var boatHull = _mergeIndexedGeos([
        new THREE.BoxGeometry(3.2, 0.9, 7.6).translate(0, 0.45, 0),
        new THREE.BoxGeometry(2.2, 0.7, 2.2).translate(0, 1.2, -1.2)
      ]);
      var boatMesh = new THREE.Mesh(boatHull, _mats.boatWood);
      var ep = world.extractPortal;
      var dockX = ep ? ep.x : fp.x;
      var dockZ = ep ? ep.z : fp.z;
      var startZ = dockZ - 26;
      boatMesh.position.set(dockX, -0.15, startZ);
      boatMesh.visible = false;
      levelGroup.add(boatMesh);

      _holdoutObj = {
        x: fp.x, y: fy, z: fp.z,
        holdSec: obj.holdSec || 25,
        flareLit: false,
        boatArriving: false,
        beaconMesh: beaconMesh,
        boatMesh: boatMesh,
        dockX: dockX,
        dockZ: dockZ - 4.5,
        startZ: startZ
      };
      _addCircleCollider(fp.x, fp.z, 0.42, null, { yBase: fy, maxY: fy + 1.3 });
    }
  }

  function _buildStations(levelDef) {
    var stations = [];
    if (levelDef.armory) {
      var ar = levelDef.armory;
      var ay = ar.y || 0;
      _armoryObj = { id: ar.id || "armory", kind: "armory", x: ar.x, y: ay, z: ar.z, rotY: ar.rotY || 0 };
      stations.push({ obj: _armoryObj, hex: 0x38ff8c });
      _addBoxCollider(ar.x, ar.z, 0.85, 0.65, ar.rotY || 0, { yBase: ay, maxY: ay + 1.3 });
      if (!ENV_T.chest) {
        var fbA = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.85), _mats.crate);
        fbA.position.set(ar.x, ay + 0.425, ar.z);
        if (ar.rotY) fbA.rotation.y = ar.rotY;
        levelGroup.add(fbA);
        _armoryFallbackMesh = fbA;
      }
    }
    if (levelDef.anvil) {
      var av = levelDef.anvil;
      var vy = av.y || 0;
      _anvilObj = { id: av.id || "anvil", kind: "anvil", x: av.x, y: vy, z: av.z, rotY: av.rotY || 0 };
      stations.push({ obj: _anvilObj, hex: 0xff9e38 });
      _addBoxCollider(av.x, av.z, 0.85, 0.65, av.rotY || 0, { yBase: vy, maxY: vy + 1.3 });
      if (!ENV_T.table) {
        var fbV = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.85), _mats.stone);
        fbV.position.set(av.x, vy + 0.45, av.z);
        if (av.rotY) fbV.rotation.y = av.rotY;
        levelGroup.add(fbV);
        _anvilFallbackMesh = fbV;
      }
    }
    if (stations.length) {
      _stationRingInst = new THREE.InstancedMesh(_stationRingGeo, _mats.stationRing, stations.length);
      for (var si = 0; si < stations.length; si++) {
        var st = stations[si];
        _tmpPos.set(st.obj.x, st.obj.y + 0.06, st.obj.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _stationRingInst.setMatrixAt(si, _tmpMat4);
        _tmpCol.setHex(st.hex);
        _stationRingInst.setColorAt(si, _tmpCol);
      }
      if (_stationRingInst.instanceColor) _stationRingInst.instanceColor.needsUpdate = true;
      _stationRingInst.instanceMatrix.needsUpdate = true;
      _stationRingInst.matrixAutoUpdate = false;
      _stationRingInst.updateMatrix();
      _stationRingInst.frustumCulled = false;
      levelGroup.add(_stationRingInst);
    }
  }

  function _buildTrapsInstanced(traps) {
    if (!traps || !traps.length) return;
    _trapBaseInst = new THREE.InstancedMesh(_trapBaseGeo, _mats.trapBase, traps.length);
    _trapFxInst = new THREE.InstancedMesh(_trapFxGeo, _mats.trapFx, traps.length);

    for (var i = 0; i < traps.length; i++) {
      var tr = traps[i];
      var ty = tr.y || 0;
      var rad = tr.r || 2.8;
      var kind = tr.kind === "fire" ? "fire" : "electric";
      _tmpPos.set(tr.x, ty + 0.04, tr.z);
      _tmpScale.set(rad, 1, rad);
      _tmpMat4.compose(_tmpPos, _identQuat, _tmpScale);
      _trapBaseInst.setMatrixAt(i, _tmpMat4);

      _tmpPos.set(tr.x, ty + 0.09, tr.z);
      _tmpScale.set(rad * 0.85, rad * 0.85, 1);
      _tmpMat4.compose(_tmpPos, _flatQuat, _tmpScale);
      _trapFxInst.setMatrixAt(i, _tmpMat4);
      _tmpCol.setHex(kind === "fire" ? 0xff7b1a : 0x38d8ff);
      _trapFxInst.setColorAt(i, _tmpCol);

      _traps.push({
        id: tr.id || ("trap_" + i),
        idx: i,
        x: tr.x, y: ty, z: tr.z,
        r: rad,
        kind: kind,
        cd: tr.cd || 25,
        dur: tr.dur || 6,
        active: false,
        activeT: 0,
        cdT: 0
      });
    }
    if (_trapFxInst.instanceColor) _trapFxInst.instanceColor.needsUpdate = true;
    [_trapBaseInst, _trapFxInst].forEach(function (inst) {
      inst.instanceMatrix.needsUpdate = true;
      inst.matrixAutoUpdate = false;
      inst.updateMatrix();
      inst.frustumCulled = false;
      levelGroup.add(inst);
    });
  }

  function _buildBarricadesInstanced(barricades) {
    if (!barricades || !barricades.length) return;
    _barricadeInst = new THREE.InstancedMesh(_barricadeUnitGeo, _mats.barricadeWood, barricades.length);
    for (var i = 0; i < barricades.length; i++) {
      var b = barricades[i];
      var by = b.y || 0;
      var w = b.w || 3.0;
      var h = b.h || 1.65;
      var d = b.d || 0.45;
      var ry = b.ry || 0;
      var maxHp = b.hp || 180;

      _tmpPos.set(b.x, by + h * 0.5, b.z);
      if (ry) _tmpQuat.setFromAxisAngle(_upAxis, ry);
      else _tmpQuat.copy(_identQuat);
      _tmpScale.set(w, h, d);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
      _barricadeInst.setMatrixAt(i, _tmpMat4);
      _tmpCol.setHex(0xffffff);
      _barricadeInst.setColorAt(i, _tmpCol);

      var rec = {
        id: b.id || ("barricade_" + i),
        idx: i,
        x: b.x, y: by, z: b.z,
        w: w, h: h, d: d, ry: ry,
        hp: maxHp, maxHp: maxHp, alive: true
      };
      _barricades.push(rec);
      _addBoxCollider(b.x, b.z, w * 0.5, d * 0.5, ry, { yBase: by, maxY: by + h, barricade: rec });
      _addBulletWall(b.x, b.z, w * 0.5, d * 0.5, by + h, ry, { yBase: by, barricade: rec });
    }
    if (_barricadeInst.instanceColor) _barricadeInst.instanceColor.needsUpdate = true;
    _barricadeInst.instanceMatrix.needsUpdate = true;
    _barricadeInst.matrixAutoUpdate = false;
    _barricadeInst.updateMatrix();
    _barricadeInst.frustumCulled = false;
    levelGroup.add(_barricadeInst);
  }

  function _buildHazards(hazards) {
    if (!hazards || !hazards.length) return;
    var waterGeos = [];
    var toxicGeos = [];
    for (var i = 0; i < hazards.length; i++) {
      var hz = hazards[i];
      var kind = hz.kind === "water" ? "water" : "toxic";
      var hy = hz.y || 0;
      var shape = hz.shape || (hz.r && !hz.w ? "circle" : "rect");
      var ry = hz.ry || 0;
      var rot = Math.abs(ry) > 0.01;
      var cos = rot ? Math.cos(ry) : 1;
      var sin = rot ? Math.sin(ry) : 0;

      var geo;
      if (shape === "circle") {
        var r = hz.r || 4.0;
        geo = new THREE.CircleGeometry(r, 20);
        geo.rotateX(-Math.PI * 0.5);
        geo.translate(hz.x, hy + 0.035, hz.z);
        _hazards.push({ id: hz.id || ("hz_" + i), kind: kind, shape: "circle", x: hz.x, y: hy, z: hz.z, r: r });
      } else {
        var w = hz.w || 6.0;
        var d = hz.d || 6.0;
        geo = new THREE.PlaneGeometry(w, d);
        geo.rotateX(-Math.PI * 0.5);
        if (rot) geo.rotateY(ry);
        geo.translate(hz.x, hy + 0.035, hz.z);
        _hazards.push({
          id: hz.id || ("hz_" + i), kind: kind, shape: "rect",
          x: hz.x, y: hy, z: hz.z, hw: w * 0.5, hd: d * 0.5, rot: rot, cos: cos, sin: sin
        });
      }
      if (kind === "water") waterGeos.push(geo);
      else toxicGeos.push(geo);
    }

    if (waterGeos.length) {
      var wg = _mergeIndexedGeos(waterGeos);
      if (wg) {
        _waterMesh = new THREE.Mesh(wg, _mats.waterHazard);
        _waterMesh.matrixAutoUpdate = false;
        _waterMesh.updateMatrix();
        levelGroup.add(_waterMesh);
      }
    }
    if (toxicGeos.length) {
      var tg = _mergeIndexedGeos(toxicGeos);
      if (tg) {
        _toxicMesh = new THREE.Mesh(tg, _mats.toxicHazard);
        _toxicMesh.matrixAutoUpdate = false;
        _toxicMesh.updateMatrix();
        levelGroup.add(_toxicMesh);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive World Queries & Mutators
  // ---------------------------------------------------------------------------
  function getNearestInteractable(playerPos, camDir) {
    if (!playerPos) return null;
    var best = null;
    var bestScore = 1e9;
    var range = 3.0;
    var pEyeY = (playerPos.y !== undefined && playerPos.y !== null) ? playerPos.y : 1.7;
    var pFootY = Math.max(0, pEyeY - 1.7);

    function consider(kind, id, obj, idx, holdSec) {
      var objY = obj.y || 0;
      if (Math.abs(objY - pFootY) > 1.25) return;
      var dx = obj.x - playerPos.x;
      var dz = obj.z - playerPos.z;
      var dist = Math.hypot(dx, dz);
      if (dist > range) return;
      var dy = (objY + 0.9) - pEyeY;
      var d3 = Math.hypot(dx, dy, dz);
      var dot = 0;
      if (camDir && d3 > 1e-4) {
        dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / d3;
      }
      var score = dist - dot * 0.45;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: kind, id: id, obj: obj, idx: idx, dist: dist, holdSec: holdSec };
      }
    }

    if (_armoryObj) consider("armory", _armoryObj.id, _armoryObj, 0, 0);
    if (_anvilObj) consider("anvil", _anvilObj.id, _anvilObj, 0, 0);
    for (var gi = 0; gi < _generators.length; gi++) {
      var g = _generators[gi];
      if (!g.active) consider("generator", g.id, g, gi, g.holdSec || 2.0);
    }
    for (var ri = 0; ri < _relics.length; ri++) {
      var rl = _relics[ri];
      if (!rl.collected) consider("relic", rl.id, rl, ri, 0);
    }
    if (_holdoutObj && !_holdoutObj.flareLit) {
      consider("flare", "flare", _holdoutObj, 0, 0);
    }
    for (var ti = 0; ti < _traps.length; ti++) {
      var tr = _traps[ti];
      if (!tr.active && tr.cdT <= 0) consider("trap", tr.id, tr, ti, 0);
    }
    var barHold = (FPS.BARRICADES && FPS.BARRICADES.repairHoldSec) || 1.2;
    for (var bi = 0; bi < _barricades.length; bi++) {
      var br = _barricades[bi];
      if (!br.alive || br.hp < br.maxHp) consider("barricade", br.id, br, bi, barHold);
    }
    return best;
  }

  function getHazardAt(x, z, footY) {
    var fy = (footY !== undefined && footY !== null) ? footY : 0;
    for (var i = 0; i < _hazards.length; i++) {
      var hz = _hazards[i];
      if (Math.abs(fy - hz.y) > 0.75) continue;
      if (hz.shape === "circle") {
        var dx = x - hz.x, dz = z - hz.z;
        if (dx * dx + dz * dz <= hz.r * hz.r) return hz.kind;
      } else {
        var rx = x - hz.x, rz = z - hz.z;
        var lx = hz.rot ? (rx * hz.cos - rz * hz.sin) : rx;
        var lz = hz.rot ? (rx * hz.sin + rz * hz.cos) : rz;
        if (Math.abs(lx) <= hz.hw && Math.abs(lz) <= hz.hd) return hz.kind;
      }
    }
    return null;
  }

  function damageGate(dmg) {
    if (!_gateObj) return null;
    if (!_gateObj.alive) return { alive: false, destroyed: false, hp: 0, maxHp: _gateObj.maxHp };
    if (!Number.isFinite(dmg) || dmg <= 0) {
      return { alive: _gateObj.alive, destroyed: false, hp: _gateObj.hp, maxHp: _gateObj.maxHp };
    }
    _gateObj.hp = Math.max(0, _gateObj.hp - dmg);
    var destroyed = _gateObj.hp <= 0;
    if (destroyed) {
      _gateObj.alive = false;
      if (_gateObj.mesh) _gateObj.mesh.visible = false;
    }
    return { alive: _gateObj.alive, destroyed: destroyed, hp: _gateObj.hp, maxHp: _gateObj.maxHp };
  }

  function setGeneratorState(idx, active) {
    var g = _generators[idx];
    if (!g) return null;
    g.active = !!active;
    if (_genLedInst && idx < _genLedInst.count) {
      _tmpCol.setHex(g.active ? 0x38ff8c : 0xff3b3b);
      _genLedInst.setColorAt(idx, _tmpCol);
      if (_genLedInst.instanceColor) _genLedInst.instanceColor.needsUpdate = true;
    }
    return g;
  }

  function setMarketLightsBright(on) {
    _marketLightsBright = !!on;
    _mats.lampHalo.opacity = _marketLightsBright ? 0.95 : 0.75;
    if (_lampHaloInst && streetLights.length) {
      var mul = _marketLightsBright ? 1.55 : 1.0;
      for (var li = 0; li < streetLights.length; li++) {
        var sl = streetLights[li];
        var fl = (1 + 0.045 * Math.sin(_visT * 6.5 + sl.flick)) * mul;
        _tmpPos.set(sl.x, sl.y, sl.z);
        _tmpScale.set(fl, fl, 1);
        _tmpMat4.compose(_tmpPos, camera.quaternion, _tmpScale);
        _lampHaloInst.setMatrixAt(li, _tmpMat4);
      }
      _lampHaloInst.instanceMatrix.needsUpdate = true;
    }
  }

  function pickupRelic(idx) {
    var rl = _relics[idx];
    if (!rl || rl.collected) return false;
    rl.collected = true;
    if (_relicInst && idx < _relicInst.count) {
      _relicInst.setMatrixAt(idx, _zeroMat4);
      _relicInst.instanceMatrix.needsUpdate = true;
    }
    if (_relicHaloInst && idx < _relicHaloInst.count) {
      _relicHaloInst.setMatrixAt(idx, _zeroMat4);
      _relicHaloInst.instanceMatrix.needsUpdate = true;
    }
    return true;
  }

  function damageTotem(idx, dmg) {
    var t = _totems[idx];
    if (!t) return null;
    if (!t.alive) return { alive: false, destroyed: false, hp: 0, maxHp: t.maxHp };
    if (!Number.isFinite(dmg) || dmg <= 0) {
      return { alive: t.alive, destroyed: false, hp: t.hp, maxHp: t.maxHp };
    }
    t.hp = Math.max(0, t.hp - dmg);
    var destroyed = t.hp <= 0;
    if (destroyed) {
      t.alive = false;
      if (_totemInst && idx < _totemInst.count) {
        _totemInst.setMatrixAt(idx, _zeroMat4);
        _totemInst.instanceMatrix.needsUpdate = true;
      }
      if (_totemCoreInst && idx < _totemCoreInst.count) {
        _totemCoreInst.setMatrixAt(idx, _zeroMat4);
        _totemCoreInst.instanceMatrix.needsUpdate = true;
      }
    }
    return { alive: t.alive, destroyed: destroyed, hp: t.hp, maxHp: t.maxHp };
  }

  function setFlareLit(on) {
    if (!_holdoutObj) return null;
    _holdoutObj.flareLit = !!on;
    _holdoutObj.boatArriving = !!on;
    if (_holdoutObj.beaconMesh) {
      _mats.flareBeacon.color.setHex(on ? 0x38ff8c : 0xff8c2a);
    }
    if (_holdoutObj.boatMesh) {
      _holdoutObj.boatMesh.visible = !!on;
    }
    return _holdoutObj;
  }

  function _syncTrapVisual(idx) {
    var tr = _traps[idx];
    if (!tr || !_trapFxInst || idx >= _trapFxInst.count) return;
    var s = tr.active ? tr.r : (tr.cdT > 0 ? tr.r * 0.45 : tr.r * 0.85);
    _tmpPos.set(tr.x, tr.y + 0.09, tr.z);
    _tmpScale.set(s, s, 1);
    _tmpMat4.compose(_tmpPos, _flatQuat, _tmpScale);
    _trapFxInst.setMatrixAt(idx, _tmpMat4);
    _trapFxInst.instanceMatrix.needsUpdate = true;

    if (tr.active) _tmpCol.setHex(tr.kind === "fire" ? 0xffaa33 : 0x70f0ff);
    else if (tr.cdT > 0) _tmpCol.setHex(0x45505a);
    else _tmpCol.setHex(tr.kind === "fire" ? 0xff7b1a : 0x38d8ff);
    _trapFxInst.setColorAt(idx, _tmpCol);
    if (_trapFxInst.instanceColor) _trapFxInst.instanceColor.needsUpdate = true;
  }

  function activateTrap(idx) {
    var tr = _traps[idx];
    if (!tr) return false;
    tr.active = true;
    tr.activeT = tr.dur;
    tr.cdT = tr.cd;
    _syncTrapVisual(idx);
    return true;
  }

  function setTrapState(idx, active, cdT) {
    var tr = _traps[idx];
    if (!tr) return null;
    tr.active = !!active;
    if (cdT !== undefined) tr.cdT = Math.max(0, cdT);
    _syncTrapVisual(idx);
    return tr;
  }

  function _syncBarricadeVisual(idx) {
    var br = _barricades[idx];
    if (!br || !_barricadeInst || idx >= _barricadeInst.count) return;
    if (!br.alive) {
      _barricadeInst.setMatrixAt(idx, _zeroMat4);
    } else {
      var hpFrac = Math.max(0.25, br.hp / Math.max(1, br.maxHp));
      _tmpPos.set(br.x, br.y + (br.h * hpFrac * 0.5), br.z);
      if (br.ry) _tmpQuat.setFromAxisAngle(_upAxis, br.ry);
      else _tmpQuat.copy(_identQuat);
      _tmpScale.set(br.w, br.h * hpFrac, br.d);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
      _barricadeInst.setMatrixAt(idx, _tmpMat4);
      _tmpCol.setRGB(1, 0.5 + 0.5 * hpFrac, 0.4 + 0.6 * hpFrac);
      _barricadeInst.setColorAt(idx, _tmpCol);
      if (_barricadeInst.instanceColor) _barricadeInst.instanceColor.needsUpdate = true;
    }
    _barricadeInst.instanceMatrix.needsUpdate = true;
  }

  function damageBarricade(idx, dmg) {
    var br = _barricades[idx];
    if (!br) return null;
    if (!br.alive) return { alive: false, destroyed: false, hp: 0, maxHp: br.maxHp };
    if (!Number.isFinite(dmg) || dmg <= 0) {
      return { alive: br.alive, destroyed: false, hp: br.hp, maxHp: br.maxHp };
    }
    br.hp = Math.max(0, br.hp - dmg);
    var destroyed = br.hp <= 0;
    if (destroyed) br.alive = false;
    _syncBarricadeVisual(idx);
    return { alive: br.alive, destroyed: destroyed, hp: br.hp, maxHp: br.maxHp };
  }

  function repairBarricade(idx) {
    var br = _barricades[idx];
    if (!br) return null;
    br.hp = br.maxHp;
    br.alive = true;
    _syncBarricadeVisual(idx);
    return br;
  }

  function electrifyWater(on) {
    _waterElectrified = !!on;
    _mats.waterHazard.color.setHex(_waterElectrified ? 0x56d8ff : 0x245a7a);
    _mats.waterHazard.opacity = _waterElectrified ? 0.68 : 0.42;
    return _waterElectrified;
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

    clearLevel();

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

    // Multi-height Platforms & Ramps + Tactical Walls merged per material bucket
    var wallBuckets = {};
    _buildPlatforms(levelDef.platforms || [], wallBuckets);

    var walls = levelDef.walls || [];
    for (var wi = 0; wi < walls.length; wi++) {
      var w = walls[wi];
      var wy = w.yBase || 0;
      var matKey = _mats[w.mat] ? w.mat : "stone";
      var wGeo = new THREE.BoxGeometry(w.w, w.h, w.d);
      _applyWallUVs(wGeo, w.w, w.h, w.d, matKey);
      if (w.ry) wGeo.rotateY(w.ry);
      wGeo.translate(w.x, wy + w.h * 0.5, w.z);
      if (!wallBuckets[matKey]) wallBuckets[matKey] = [];
      wallBuckets[matKey].push(wGeo);

      var hw = w.w * 0.5;
      var hd = w.d * 0.5;
      _addBoxCollider(w.x, w.z, hw, hd, w.ry || 0, { yBase: wy, maxY: wy + w.h });
      if (w.h >= 1.6 || wy > 0) {
        _addBulletWall(w.x, w.z, hw, hd, wy + w.h, w.ry || 0, { yBase: wy });
      }
    }
    // Stations (Armory & Anvil colliders registered once here; GLB meshes placed in _placeLevelProps)
    _buildStations(levelDef);

    // GLB Props (placed before wallBuckets merge so open-gate geometry batches into wallBuckets)
    _placeLevelProps(levelDef, wallBuckets);

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

    // Street Lamps (batched into 3 InstancedMeshes, zero PointLights)
    _buildLampsInstanced(levelDef.lamps || []);

    // Explosive Crimson Barrels + Pooled Scorch Marks (batched into 4 InstancedMeshes)
    _buildBarrelsInstanced(levelDef.explosiveBarrels || []);

    // Supply Nodes (batched via InstancedMesh + setColorAt)
    _buildSuppliesInstanced(levelDef.supplies || []);

    // Extraction Portal Beacon
    world.extractPortal = _buildExtractPortal(levelDef.extractPos);

    // Stage Objectives, Chokepoint Traps, Destructible Barricades & Terrain Hazards
    _buildObjectiveObjects(levelDef.objective);
    _buildTrapsInstanced(levelDef.traps || []);
    _buildBarricadesInstanced(levelDef.barricades || []);
    _buildHazards(levelDef.hazards || []);

    // Ground Fog Wisps (batched into 1 InstancedMesh + respects quality level)
    var wCount = 4;
    var showWeather = _qualityLevel < 1;
    _wispInst = new THREE.InstancedMesh(_wispGeo, _mats.wisp, wCount);
    _wispInst.visible = showWeather;
    _wispInst.frustumCulled = false;
    for (var fi = 0; fi < wCount; fi++) {
      var wx = (Math.random() - 0.5) * arena * 0.9;
      var wy = 1.1 + Math.random() * 1.1;
      var wz = (Math.random() - 0.5) * arena * 0.9;
      var wry = Math.random() * Math.PI;
      var wsx = 0.7 + Math.random() * 0.7;
      _tmpPos.set(wx, wy, wz);
      _tmpQuat.setFromAxisAngle(_upAxis, wry);
      _tmpScale.set(wsx, 1, 1);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
      _wispInst.setMatrixAt(fi, _tmpMat4);
      wisps.push({ x: wx, y: wy, z: wz, ry: wry, sx: wsx, s: 0.25 + Math.random() * 0.45, half: half });
    }
    _wispInst.instanceMatrix.needsUpdate = true;
    _wispInst.matrixAutoUpdate = false;
    _wispInst.updateMatrix();
    levelGroup.add(_wispInst);

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
        ep.progRing.visible = true;
        _mats.extractProgress.opacity = 0.35 + pct * 0.55;
        var ps = 0.25 + pct * 0.75;
        ep.progRing.scale.set(ps, ps, 1);
      } else {
        ep.progRing.visible = false;
        _mats.extractProgress.opacity = 0;
      }
    }

    // Supply Nodes instanced visual sync & floating spin
    if (_supShared && supplyNodes.length) {
      var boxDirty = false;
      var discDirty = false;
      var ringDirty = false;
      var glowCrossDirty = false;
      var glowBarDirty = false;
      for (var si = 0; si < supplyNodes.length; si++) {
        var sn = supplyNodes[si];
        var gInst = sn.glowInst;
        var isBar = sn.kind === "ammo";
        if (!sn.alive) {
          if (sn._wasAlive) {
            _supShared.boxInst.setMatrixAt(sn.instIdx, _zeroMat4);
            _supShared.discInst.setMatrixAt(sn.instIdx, _zeroMat4);
            _supShared.ringInst.setMatrixAt(sn.instIdx, _zeroMat4);
            if (gInst) gInst.setMatrixAt(sn.glowIdx, _zeroMat4);
            boxDirty = true;
            discDirty = true;
            ringDirty = true;
            if (isBar) glowBarDirty = true; else glowCrossDirty = true;
            sn._wasAlive = false;
          }
          continue;
        }
        if (!sn._wasAlive) {
          _tmpPos.set(sn.x, (sn.y || 0) + 0.04, sn.z);
          _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
          _supShared.discInst.setMatrixAt(sn.instIdx, _tmpMat4);
          discDirty = true;
          sn._wasAlive = true;
        }
        sn._t += d * 2.4;
        sn._ry += d * 0.95;
        sn._rz += d * 1.25;

        var sy = sn.y || 0;
        _tmpPos.set(sn.x, sy + 0.34 + Math.sin(sn._t) * 0.065, sn.z);
        _tmpQuat.setFromAxisAngle(_upAxis, sn._ry);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
        _supShared.boxInst.setMatrixAt(sn.instIdx, _tmpMat4);
        if (gInst) gInst.setMatrixAt(sn.glowIdx, _tmpMat4);
        boxDirty = true;
        if (isBar) glowBarDirty = true; else glowCrossDirty = true;

        _tmpPos.set(sn.x, sy + 0.06, sn.z);
        _tmpEuler.set(-Math.PI * 0.5, 0, sn._rz, "XYZ");
        _tmpQuat.setFromEuler(_tmpEuler);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
        _supShared.ringInst.setMatrixAt(sn.instIdx, _tmpMat4);
        ringDirty = true;
      }
      if (boxDirty) _supShared.boxInst.instanceMatrix.needsUpdate = true;
      if (discDirty) _supShared.discInst.instanceMatrix.needsUpdate = true;
      if (ringDirty) _supShared.ringInst.instanceMatrix.needsUpdate = true;
      if (glowCrossDirty && _supShared.glowCrossInst) _supShared.glowCrossInst.instanceMatrix.needsUpdate = true;
      if (glowBarDirty && _supShared.glowBarInst) _supShared.glowBarInst.instanceMatrix.needsUpdate = true;
    }

    // Street Lamp halos billboard toward camera (throttled to every 2nd call)
    if ((_visFrame++ % 2 === 0) && _lampHaloInst && streetLights.length) {
      var brightMul = _marketLightsBright ? 1.55 : 1.0;
      for (var li = 0; li < streetLights.length; li++) {
        var sl = streetLights[li];
        var fl = (1 + 0.045 * Math.sin(_visT * 6.5 + sl.flick)) * brightMul;
        _tmpPos.set(sl.x, sl.y, sl.z);
        _tmpScale.set(fl, fl, 1);
        _tmpMat4.compose(_tmpPos, camera.quaternion, _tmpScale);
        _lampHaloInst.setMatrixAt(li, _tmpMat4);
      }
      _lampHaloInst.instanceMatrix.needsUpdate = true;
    }

    // Full v9.0 Interactive Objects Animations (zero-alloc)
    if (_relicInst && _relics.length) {
      var relDirty = false;
      for (var rli = 0; rli < _relics.length; rli++) {
        var rl = _relics[rli];
        if (rl.collected) continue;
        rl._t += d * 2.2;
        _tmpPos.set(rl.x, (rl.y || 0) + 0.55 + Math.sin(rl._t) * 0.1, rl.z);
        _tmpQuat.setFromAxisAngle(_upAxis, rl._t * 0.7);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _unitScale);
        _relicInst.setMatrixAt(rli, _tmpMat4);
        if (_relicHaloInst) {
          var hs = 0.9 + 0.12 * Math.sin(rl._t * 1.6);
          _tmpPos.set(rl.x, (rl.y || 0) + 0.08, rl.z);
          _tmpScale.set(hs, hs, 1);
          _tmpMat4.compose(_tmpPos, _flatQuat, _tmpScale);
          _relicHaloInst.setMatrixAt(rli, _tmpMat4);
        }
        relDirty = true;
      }
      if (relDirty) {
        _relicInst.instanceMatrix.needsUpdate = true;
        if (_relicHaloInst) _relicHaloInst.instanceMatrix.needsUpdate = true;
      }
    }

    if (_totemCoreInst && _totems.length) {
      var totDirty = false;
      for (var tti = 0; tti < _totems.length; tti++) {
        var tt = _totems[tti];
        if (!tt.alive) continue;
        tt._t += d * 2.6;
        var ts = 1 + 0.14 * Math.sin(_visT * 4 + tti);
        _tmpPos.set(tt.x, (tt.y || 0) + 3.1 + Math.sin(tt._t) * 0.08, tt.z);
        _tmpQuat.setFromAxisAngle(_upAxis, tt._t);
        _tmpScale.setScalar(ts);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
        _totemCoreInst.setMatrixAt(tti, _tmpMat4);
        totDirty = true;
      }
      if (totDirty) _totemCoreInst.instanceMatrix.needsUpdate = true;
    }

    if (_genLedInst && _generators.length) {
      var genDirty = false;
      for (var ggi = 0; ggi < _generators.length; ggi++) {
        var gg = _generators[ggi];
        var gs = gg.active ? (1.05 + 0.18 * Math.sin(_visT * 6 + ggi)) : (0.85 + 0.15 * Math.sin(_visT * 2.5 + ggi));
        _tmpPos.set(gg.x, (gg.y || 0) + 1.38, gg.z);
        _tmpScale.setScalar(gs);
        _tmpMat4.compose(_tmpPos, _identQuat, _tmpScale);
        _genLedInst.setMatrixAt(ggi, _tmpMat4);
        genDirty = true;
      }
      if (genDirty) _genLedInst.instanceMatrix.needsUpdate = true;
    }

    if (_trapFxInst && _traps.length) {
      var trDirty = false;
      for (var tri = 0; tri < _traps.length; tri++) {
        var tr = _traps[tri];
        if (!tr.active) continue;
        var fxS = tr.r * (0.92 + 0.14 * Math.sin(_visT * 14 + tri));
        _tmpPos.set(tr.x, tr.y + 0.09, tr.z);
        _tmpEuler.set(-Math.PI * 0.5, 0, _visT * 3.2 + tri, "XYZ");
        _tmpQuat.setFromEuler(_tmpEuler);
        _tmpScale.set(fxS, fxS, 1);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
        _trapFxInst.setMatrixAt(tri, _tmpMat4);
        trDirty = true;
      }
      if (trDirty) _trapFxInst.instanceMatrix.needsUpdate = true;
    }

    if (_holdoutObj) {
      if (_holdoutObj.beaconMesh) {
        var bs = _holdoutObj.flareLit ? (1.2 + 0.25 * Math.sin(_visT * 8)) : (0.95 + 0.1 * Math.sin(_visT * 3));
        _holdoutObj.beaconMesh.scale.setScalar(bs);
      }
      if (_holdoutObj.boatArriving && _holdoutObj.boatMesh) {
        var bm = _holdoutObj.boatMesh;
        bm.position.z += (_holdoutObj.dockZ - bm.position.z) * Math.min(1, d * 0.35);
        bm.position.y = -0.15 + 0.08 * Math.sin(_visT * 2.2);
      }
    }

    if (_waterMesh) {
      _mats.waterHazard.opacity = (_waterElectrified ? 0.62 : 0.40) + 0.06 * Math.sin(_visT * (_waterElectrified ? 16 : 2.5));
    }
    if (_toxicMesh) {
      _mats.toxicHazard.opacity = 0.32 + 0.05 * Math.sin(_visT * 2.5);
    }

    // Atmospheric wisps & particles
    if (_wispInst && _wispInst.visible && wisps.length) {
      for (var wi = 0; wi < wisps.length; wi++) {
        var w = wisps[wi];
        w.x += Math.sin(_visT * 0.25 + wi) * w.s * d;
        if (w.x > w.half) w.x = -w.half;
        else if (w.x < -w.half) w.x = w.half;
        _tmpPos.set(w.x, w.y, w.z);
        _tmpQuat.setFromAxisAngle(_upAxis, w.ry);
        _tmpScale.set(w.sx, 1, 1);
        _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
        _wispInst.setMatrixAt(wi, _tmpMat4);
      }
      _wispInst.instanceMatrix.needsUpdate = true;
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
      var by = barrel.y || 0;
      if (_scorchOuterInst && sIdx < _scorchOuterInst.count) {
        _scorchOuterInst.visible = true;
        _tmpPos.set(barrel.x, by + 0.025, barrel.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _scorchOuterInst.setMatrixAt(sIdx, _tmpMat4);
        _scorchOuterInst.instanceMatrix.needsUpdate = true;
      }
      if (_scorchRingInst && sIdx < _scorchRingInst.count) {
        _scorchRingInst.visible = true;
        _tmpPos.set(barrel.x, by + 0.03, barrel.z);
        _tmpMat4.compose(_tmpPos, _flatQuat, _unitScale);
        _scorchRingInst.setMatrixAt(sIdx, _tmpMat4);
        _scorchRingInst.instanceMatrix.needsUpdate = true;
      }
    }
  }

  function setQuality(qLevel) {
    _qualityLevel = qLevel | 0;
    camera.far = _qualityLevel === 0 ? 63 : (_qualityLevel === 1 ? 58 : 50);
    camera.updateProjectionMatrix();
    var showWeather = _qualityLevel < 1;
    if (dustPts) dustPts.visible = showWeather;
    if (rainPts) rainPts.visible = showWeather;
    if (_wispInst) _wispInst.visible = showWeather;
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
        try { onProgress({ loaded: totalCount, total: totalCount, pct: 100, phase: "warmup", label: FPS.t("warmupReady") }); } catch (e) {}
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
      report(Math.min(90, pct), FPS.t("warmupTex") + " (" + cursor + "/" + texQueue.length + ")...");
      if (cursor < texQueue.length) {
        requestAnimationFrame(uploadChunk);
      } else {
        requestAnimationFrame(compileWeaponsStep);
      }
    }

    function compileWeaponsStep() {
      report(93, FPS.t("warmupWeapons"));
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
      report(97, FPS.t("warmupShaders"));
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
        report(100, FPS.t("warmupReady"));
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
        label: label || FPS.t("loadStageAssets")
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
      checkAllDone(FPS.t("loadStageEnv"));
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
            checkAllDone(FPS.t("loadStageZombies"));
            doneCb();
          }, undefined, function () {
            console.warn("zb GLB load fail", key);
            checkAllDone(FPS.t("loadStageZombies"));
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
            checkAllDone(FPS.t("loadStageWeapons"));
            doneCb();
          }, undefined, function () {
            console.warn("weapon GLB load fail", kind);
            checkAllDone(FPS.t("loadStageWeapons"));
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
    clearLevel: clearLevel,
    groundY: groundY,
    collide: collide,
    raycastWallDist: raycastWallDist,
    raycastTarget: raycastTarget,
    getNearestInteractable: getNearestInteractable,
    getHazardAt: getHazardAt,
    damageGate: damageGate,
    setGeneratorState: setGeneratorState,
    setMarketLightsBright: setMarketLightsBright,
    pickupRelic: pickupRelic,
    damageTotem: damageTotem,
    setFlareLit: setFlareLit,
    activateTrap: activateTrap,
    setTrapState: setTrapState,
    damageBarricade: damageBarricade,
    repairBarricade: repairBarricade,
    electrifyWater: electrifyWater,
    updateWorldVisuals: updateWorldVisuals,
    detonateBarrelVisual: detonateBarrelVisual,
    setQuality: setQuality,
    getPerfStats: getPerfStats
  };

  Object.defineProperties(world, {
    gate: { get: function () { return _gateObj; } },
    generators: { get: function () { return _generators; } },
    relics: { get: function () { return _relics; } },
    totems: { get: function () { return _totems; } },
    holdout: { get: function () { return _holdoutObj; } },
    armory: { get: function () { return _armoryObj; } },
    anvil: { get: function () { return _anvilObj; } },
    traps: { get: function () { return _traps; } },
    barricades: { get: function () { return _barricades; } },
    hazards: { get: function () { return _hazards; } },
    platforms: { get: function () { return _platforms; } },
    waterElectrified: { get: function () { return _waterElectrified; } },
    _lampHaloInst: { get: function () { return _lampHaloInst; } }
  });

  FPS.world = world;
})();
