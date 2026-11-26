"use strict";
var FPS = (window.FPS = window.FPS || {});

FPS.LEVELS = [
  {
    id: 1,
    nameVi: "Màn 1: Ngõ Cụt Sương Mù",
    nameEn: "Stage 1: Foggy Back-Alley",
    descVi: "Ngõ hẻm gấp khúc dẫn qua Đình Làng đi xuyên được và đài gác gỗ tới cổng thoát hiểm bị chặn.",
    descEn: "Crooked alleys through a walk-through Village Shrine and elevated veranda toward a barricaded exit gate.",
    arena: 64,
    skyHex: 0x090d14,
    fogHex: 0x0c121b,
    fogDensity: 0.026,
    groundHex: 0x42473d,
    playerSpawn: { x: -16, z: 24, yaw: -0.35 },
    extractPos: { x: 18, z: -23, y: 0, r: 4.0 },
    killQuota: 14,
    bossType: null,
    extractHoldSec: 2.5,
    maxAlive: 9,
    platforms: [
      { id: "plat_m1_loft", x: 14.5, z: 2.0, w: 6.0, d: 7.0, yTop: 2.1, rampSide: "s", rampLen: 4.6, mat: "wood", ry: 0.12, underpass: true }
    ],
    walls: [
      // Beat 1 (SW Alley Push — first ground rotated cover has d <= 1.5m for clean tangent slide)
      { x: -13.5, z: 20.5, w: 3.6, h: 1.15, d: 1.2, mat: "crate", ry: 0.22 },
      { x: -22.5, z: 18.0, w: 2.0, h: 3.6, d: 12.0, mat: "brick", ry: 0.15 },
      { x: -10.0, z: 16.5, w: 2.2, h: 3.6, d: 9.5, mat: "brick", ry: -0.18 },
      { x: -18.5, z: 3.5, w: 9.0, h: 3.4, d: 2.0, mat: "stone", ry: 0.25 },

      // Beat 2 (Walk-through Village Dinh Core + Flank Alleys)
      { x: 3.0, z: 1.0, yBase: 3.4, w: 10.6, h: 0.5, d: 10.6, mat: "wood", ry: 0.12 },
      { x: 3.58, z: -3.86, yBase: 2.85, w: 8.8, h: 0.6, d: 0.7, mat: "brick", ry: 0.12 },
      { x: 2.42, z: 5.86, yBase: 2.85, w: 8.8, h: 0.6, d: 0.7, mat: "brick", ry: 0.12 },
      { x: 5.5, z: 2.2, w: 2.4, h: 1.15, d: 1.1, mat: "crate", ry: 0.12 },
      { x: -4.5, z: 9.5, w: 2.8, h: 1.2, d: 1.3, mat: "wood", ry: -0.3 },
      { x: -12.0, z: -6.5, w: 8.5, h: 3.6, d: 2.2, mat: "stone", ry: -0.22 },
      { x: -24.5, z: -8.5, w: 2.2, h: 3.4, d: 11.0, mat: "brick", ry: 0.12 },
      { x: 24.5, z: 9.5, w: 2.2, h: 3.5, d: 11.5, mat: "brick", ry: -0.2 },
      { x: 21.0, z: -4.0, w: 2.8, h: 1.15, d: 1.2, mat: "crate", ry: 0.3 },
      { x: -8.0, z: -20.0, w: 8.0, h: 3.5, d: 2.0, mat: "stone", ry: 0.28 },

      // Beat 3 (Sealed NE Exfil Pocket behind Destructible Gate)
      { x: 2.0, z: -22.5, w: 2.2, h: 3.8, d: 19.0, mat: "stone", ry: 0 },
      { x: 6.7, z: -13.0, w: 9.0, h: 3.8, d: 2.0, mat: "stone", ry: 0 },
      { x: 24.4, z: -13.0, w: 15.4, h: 3.8, d: 2.0, mat: "stone", ry: 0 },
      { x: 14.0, z: -13.0, yBase: 3.2, w: 5.6, h: 1.0, d: 2.0, mat: "stone", ry: 0 },
      { x: 24.0, z: -18.5, w: 2.4, h: 1.15, d: 1.2, mat: "crate", ry: -0.25 }
    ],
    props: [
      { key: "pillar", x: -1.4, z: -3.4, h: 4.5, rotY: 0.12, coll: "circle" },
      { key: "pillar", x: 7.4, z: -3.4, h: 4.5, rotY: 0.12, coll: "circle" },
      { key: "pillar", x: -1.4, z: 5.4, h: 4.5, rotY: 0.12, coll: "circle" },
      { key: "pillar", x: 7.4, z: 5.4, h: 4.5, rotY: 0.12, coll: "circle" },
      { key: "pillar", x: 11.4, z: -13.0, h: 4.5, rotY: 0, coll: "circle" },
      { key: "pillar", x: 16.6, z: -13.0, h: 4.5, rotY: 0, coll: "circle" },
      { key: "stairs", x: 15.19, z: 7.76, y: 0, h: 0.8, rotY: 0.12, coll: null },
      { key: "house", x: -27.5, z: 27.0, h: 6.0, rotY: 0.35, coll: "box" },
      { key: "house", x: -27.5, z: -25.0, h: 6.2, rotY: -0.3, coll: "box" },
      { key: "cart", x: -3.0, z: 18.0, h: 1.6, rotY: 0.45, coll: "box" },
      { key: "well", x: -6.5, z: -0.5, h: 1.5, rotY: 0.2, coll: "circle" },
      { key: "barrelstack", x: 21.0, z: 21.0, h: 1.6, rotY: 0.4, coll: "circle" },
      { key: "torch", x: 11.2, z: -10.8, h: 2.2, rotY: 0, coll: "circle" },
      { key: "torch", x: 16.8, z: -10.8, h: 2.2, rotY: 0, coll: "circle" },
      { key: "cobble", x: -14.0, z: 21.0, w: 3.4, rotY: -0.35, coll: null },
      { key: "cobble", x: -8.0, z: 12.0, w: 3.4, rotY: -0.45, coll: null },
      { key: "cobble", x: 2.5, z: 3.0, w: 3.6, rotY: 0.12, coll: null },
      { key: "cobble", x: 9.0, z: -7.0, w: 3.4, rotY: -0.4, coll: null },
      { key: "cobble", x: 14.0, z: -15.5, w: 3.4, rotY: 0, coll: null }
    ],
    objective: { type: "gate", x: 14.0, z: -13.0, y: 0, w: 3.8, h: 3.2, d: 0.7, ry: 0, hp: 260 },
    armory: { x: -26.5, z: 16.0, y: 0, rotY: 0 },
    anvil: { x: -6.5, z: 24.5, y: 0, rotY: 0 },
    traps: [
      { id: "trap_m1_fire", x: 3.0, z: 12.5, y: 0, kind: "fire", r: 2.8, cd: 25, dur: 6 },
      { id: "trap_m1_elec", x: -7.5, z: -13.0, y: 0, kind: "electric", r: 2.8, cd: 25, dur: 6 }
    ],
    barricades: [
      { id: "bar_m1_w", x: -16.5, z: 10.5, y: 0, w: 3.4, h: 1.65, d: 0.45, ry: 0.2, hp: 180 },
      { id: "bar_m1_e", x: 19.5, z: -8.0, y: 0, w: 3.6, h: 1.65, d: 0.45, ry: -0.25, hp: 180 }
    ],
    hazards: [],
    explosiveBarrels: [
      { x: -14.5, z: 14.0 },
      { x: -0.5, z: 8.5 },
      { x: 9.0, z: 1.0 },
      { x: -10.5, z: -10.5 },
      { x: 14.0, z: -7.5 },
      { x: 12.8, z: 0.2, y: 2.1 },
      { x: 24.0, z: 1.5 }
    ],
    supplies: [
      { x: -26.0, z: 20.0, kind: "ammo" },
      { x: 16.0, z: 19.0, kind: "med" },
      { x: -18.5, z: -17.0, kind: "ammo" },
      { x: 14.5, z: 0.0, y: 2.1, kind: "ammo" },
      { x: 26.5, z: -25.0, kind: "med" }
    ],
    spawners: [
      { x: -28.0, z: 1.0 },
      { x: -28.0, z: -16.0 },
      { x: -8.0, z: -28.0 },
      { x: 28.0, z: 1.0 },
      { x: 28.0, z: 23.0 },
      { x: 6.0, z: 28.0 }
    ],
    lamps: [
      { x: -19.0, z: 22.0, y: 0, zone: "amber" },
      { x: -7.0, z: 21.0, y: 0, zone: "amber" },
      { x: -14.0, z: 0.0, y: 0, zone: "crimson" },
      { x: 8.5, z: 8.5, y: 0, zone: "crimson" },
      { x: 16.2, z: -0.6, y: 2.1, zone: "crimson" },
      { x: -12.0, z: -16.0, y: 0, zone: "crimson" },
      { x: 10.5, z: -10.0, y: 0, zone: "emerald" },
      { x: 21.0, z: -26.0, y: 0, zone: "emerald" }
    ]
  },
  {
    id: 2,
    nameVi: "Màn 2: Chợ Đêm",
    nameEn: "Stage 2: Night Market",
    descVi: "Dãy sạp chợ xéo góc mái hở, cầu đi bộ trên cao và 2 máy phát điện gọi đợt quái tràn.",
    descEn: "Angled open-roof night market stalls, elevated catwalk, and 2 power generators triggering a panic horde.",
    arena: 78,
    skyHex: 0x100c09,
    fogHex: 0x16110d,
    fogDensity: 0.023,
    groundHex: 0x4f4539,
    playerSpawn: { x: -31, z: 13, yaw: -1.35 },
    extractPos: { x: 29, z: -12, y: 0, r: 4.0 },
    killQuota: 20,
    bossType: null,
    extractHoldSec: 2.5,
    maxAlive: 11,
    platforms: [
      { id: "plat_m2_catwalk", x: 3.0, z: -14.0, w: 12.0, d: 3.8, yTop: 2.2, rampSide: "w", rampLen: 5.0, mat: "wood", ry: -0.18, underpass: true },
      { id: "plat_m2_east", x: 16.0, z: 10.0, w: 6.2, d: 5.8, yTop: 2.1, rampSide: "s", rampLen: 4.6, mat: "wood", ry: 0.22, underpass: true }
    ],
    walls: [
      // Beat 1 (West Market Entry)
      { x: -23.0, z: 22.0, w: 10.0, h: 3.3, d: 2.0, mat: "wood", ry: 0.22 },
      { x: -22.0, z: -4.0, w: 9.5, h: 3.3, d: 2.0, mat: "brick", ry: -0.18 },
      { x: -25.0, z: 8.5, w: 2.8, h: 1.15, d: 1.2, mat: "crate", ry: 0.28 },

      // Beat 2 (Slatted Open-Roof Stall Canopies + Angled Alleys)
      { x: -2.0, z: -2.5, yBase: 3.1, w: 12.0, h: 0.45, d: 3.6, mat: "wood", ry: 0.14 },
      { x: -2.8, z: 4.5, yBase: 3.1, w: 12.0, h: 0.45, d: 3.6, mat: "wood", ry: 0.14 },
      { x: -14.0, z: -20.0, w: 8.5, h: 3.4, d: 2.2, mat: "brick", ry: -0.24 },
      { x: -11.0, z: 15.0, w: 9.5, h: 3.4, d: 2.2, mat: "wood", ry: 0.2 },
      { x: 0.5, z: 1.3, w: 3.0, h: 1.15, d: 1.2, mat: "crate", ry: 0.14 },
      { x: 5.5, z: -4.0, w: 2.8, h: 1.2, d: 1.3, mat: "wood", ry: -0.28 },
      { x: 4.0, z: 26.0, w: 10.0, h: 3.5, d: 2.2, mat: "stone", ry: -0.15 },
      { x: -14.0, z: 28.0, w: 2.2, h: 3.3, d: 9.0, mat: "wood", ry: 0.22 },
      { x: 16.0, z: -26.0, w: 10.5, h: 3.4, d: 2.2, mat: "brick", ry: 0.25 },
      { x: 15.0, z: -2.0, w: 2.6, h: 1.15, d: 1.2, mat: "crate", ry: 0.35 },

      // Beat 3 (NE Market Archway Exfil)
      { x: 23.0, z: -23.0, w: 2.2, h: 3.5, d: 10.0, mat: "stone", ry: -0.22 },
      { x: 28.0, z: 2.0, w: 9.5, h: 3.5, d: 2.2, mat: "brick", ry: 0.18 },
      { x: 24.0, z: -6.0, w: 2.8, h: 1.15, d: 1.2, mat: "crate", ry: -0.3 }
    ],
    props: [
      { key: "pillar", x: -8.0, z: -5.0, h: 4.3, rotY: 0.14, coll: "circle" },
      { key: "pillar", x: 4.0, z: -3.3, h: 4.3, rotY: 0.14, coll: "circle" },
      { key: "pillar", x: -9.0, z: 6.2, h: 4.3, rotY: 0.14, coll: "circle" },
      { key: "pillar", x: 3.5, z: 7.9, h: 4.3, rotY: 0.14, coll: "circle" },
      { key: "wall_door", x: 23.5, z: -12.0, h: 5.0, rotY: 1.4, coll: "gate" },
      { key: "stairs", x: -5.36, z: -15.52, y: 0, h: 0.85, rotY: 1.39, coll: null },
      { key: "stairs", x: 17.13, z: 15.07, y: 0, h: 0.8, rotY: 0.22, coll: null },
      { key: "horsecart", x: -24.0, z: -18.0, h: 1.8, rotY: 0.65, coll: "box" },
      { key: "cart", x: -12.0, z: -7.5, h: 1.7, rotY: 0.3, coll: "box" },
      { key: "cart", x: 6.5, z: 17.5, h: 1.7, rotY: 2.2, coll: "box" },
      { key: "barrelstack", x: -22.0, z: 28.0, h: 1.7, rotY: 0.4, coll: "circle" },
      { key: "house", x: -33.0, z: -29.0, h: 6.4, rotY: 0.35, coll: "box" },
      { key: "windmill", x: 32.0, z: 28.0, h: 9.0, rotY: -0.5, coll: "box" },
      { key: "torch", x: 33.5, z: -16.0, h: 2.2, rotY: 0, coll: "circle" },
      { key: "torch", x: 33.5, z: -8.0, h: 2.2, rotY: 0, coll: "circle" },
      { key: "cobble", x: -26.0, z: 12.0, w: 3.6, rotY: -1.3, coll: null },
      { key: "cobble", x: -16.0, z: 5.0, w: 3.6, rotY: 0.14, coll: null },
      { key: "cobble", x: -4.2, z: 0.7, w: 3.6, rotY: 0.14, coll: null },
      { key: "cobble", x: 11.0, z: -5.0, w: 3.6, rotY: -0.45, coll: null },
      { key: "cobble", x: 22.0, z: -11.0, w: 3.6, rotY: -0.2, coll: null }
    ],
    objective: {
      type: "generators",
      items: [
        { id: "gen_north", x: 5.0, z: -14.4, y: 2.2, ry: -0.18, holdSec: 2.0 },
        { id: "gen_south", x: -4.0, z: 21.0, y: 0, ry: 0.3, holdSec: 2.0 }
      ]
    },
    armory: { x: -29.0, z: 21.0, y: 0, rotY: 0 },
    anvil: { x: -26.5, z: 2.0, y: 0, rotY: 0 },
    traps: [
      { id: "trap_m2_fire", x: -9.5, z: 9.0, y: 0, kind: "fire", r: 3.0, cd: 25, dur: 6 },
      { id: "trap_m2_elec", x: 10.5, z: -3.5, y: 0, kind: "electric", r: 3.0, cd: 25, dur: 6 }
    ],
    barricades: [
      { id: "bar_m2_1", x: -15.5, z: -10.5, y: 0, w: 3.6, h: 1.65, d: 0.45, ry: 0.25, hp: 180 },
      { id: "bar_m2_2", x: 17.0, z: -16.5, y: 0, w: 3.6, h: 1.65, d: 0.45, ry: -0.35, hp: 180 }
    ],
    hazards: [],
    explosiveBarrels: [
      { x: -19.0, z: 12.0 },
      { x: -7.5, z: 1.5 },
      { x: 1.5, z: -8.0 },
      { x: -1.5, z: 14.5 },
      { x: 11.5, z: 3.5 },
      { x: 16.0, z: 10.0, y: 2.1 },
      { x: 20.5, z: -20.5 },
      { x: 24.0, z: 15.0 }
    ],
    supplies: [
      { x: -30.0, z: -10.0, kind: "ammo" },
      { x: -8.0, z: -26.0, kind: "med" },
      { x: 1.0, z: -13.6, y: 2.2, kind: "ammo" },
      { x: 16.0, z: 12.0, y: 2.1, kind: "med" },
      { x: 28.0, z: 14.0, kind: "both" }
    ],
    spawners: [
      { x: -24.0, z: -34.0 },
      { x: -2.0, z: -34.0 },
      { x: 20.0, z: -34.0 },
      { x: -26.0, z: 34.0 },
      { x: 2.0, z: 34.0 },
      { x: 24.0, z: 34.0 },
      { x: 35.0, z: 6.0 }
    ],
    lamps: [
      { x: -30.0, z: 17.0, y: 0, zone: "amber" },
      { x: -18.0, z: 12.0, y: 0, zone: "amber" },
      { x: -12.0, z: -12.0, y: 0, zone: "crimson" },
      { x: 0.4, z: -15.2, y: 2.2, zone: "crimson" },
      { x: -3.0, z: 24.0, y: 0, zone: "crimson" },
      { x: 15.0, z: 8.0, y: 2.1, zone: "crimson" },
      { x: 21.0, z: -10.0, y: 0, zone: "emerald" },
      { x: 32.0, z: -16.0, y: 0, zone: "emerald" }
    ]
  },
  {
    id: 3,
    nameVi: "Màn 3: Rừng Thông",
    nameEn: "Stage 3: Pine Woods",
    descVi: "Đường mòn rừng thông quanh trạm gác gỗ đi xuyên được, đài canh 2.6m và 2 Di Vật của Linh.",
    descEn: "Winding pine trails around a walk-through timber watchpost, 2.6m lookout deck, and 2 of Linh's Relics.",
    arena: 92,
    skyHex: 0x07100e,
    fogHex: 0x0b1714,
    fogDensity: 0.022,
    groundHex: 0x354437,
    playerSpawn: { x: -36, z: 35, yaw: -0.78 },
    extractPos: { x: 31, z: -31, y: 1.8, r: 4.0 },
    killQuota: 26,
    bossType: null,
    extractHoldSec: 2.5,
    maxAlive: 13,
    platforms: [
      { id: "plat_m3_lookout", x: 9.4, z: -4.0, w: 6.6, d: 6.6, yTop: 2.6, rampSides: ["s", "w"], rampLen: 4.5, mat: "wood", ry: 0.25, underpass: true },
      { id: "plat_m3_ridge", x: -19.0, z: -16.0, w: 6.4, d: 5.4, yTop: 2.1, rampSide: "e", rampLen: 4.8, mat: "stone", ry: -0.28, underpass: true },
      { id: "plat_m3_shrine", x: 31.0, z: -31.0, w: 9.5, d: 9.5, yTop: 1.8, rampSide: "w", rampLen: 4.5, mat: "stone", ry: 0.78, solid: true }
    ],
    walls: [
      // Beat 1 (SW Pine Trailhead)
      { x: -24.0, z: 27.0, w: 11.0, h: 3.4, d: 2.2, mat: "stone", ry: 0.42 },
      { x: -31.0, z: 14.0, w: 2.2, h: 3.4, d: 10.0, mat: "stone", ry: -0.32 },
      { x: -12.0, z: 29.0, w: 2.2, h: 3.2, d: 9.5, mat: "wood", ry: 0.35 },
      { x: -23.0, z: 19.0, w: 2.8, h: 1.15, d: 1.3, mat: "crate", ry: 0.45 },

      // Beat 2 (Walk-through Timber Watchpost + Forest Cover)
      { x: -4.0, z: 6.0, yBase: 3.2, w: 9.5, h: 0.45, d: 9.5, mat: "wood", ry: 0.32 },
      { x: -1.3, z: 7.1, w: 2.8, h: 1.15, d: 1.2, mat: "crate", ry: 0.32 },
      { x: -16.0, z: 1.0, w: 9.0, h: 3.6, d: 2.2, mat: "stone", ry: -0.38 },
      { x: -3.0, z: -18.0, w: 10.0, h: 3.5, d: 2.2, mat: "stone", ry: 0.25 },
      { x: 18.0, z: 15.0, w: 10.5, h: 3.4, d: 2.2, mat: "wood", ry: -0.45 },
      { x: 24.0, z: -2.0, w: 2.2, h: 3.5, d: 10.0, mat: "stone", ry: 0.3 },
      { x: -4.0, z: 15.5, w: 2.8, h: 1.15, d: 1.2, mat: "crate", ry: -0.2 },
      { x: 14.0, z: -14.0, w: 2.8, h: 1.2, d: 1.3, mat: "stone", ry: 0.55 },

      // Beat 3 (Elevated NE Pagoda Shrine)
      { x: 16.0, z: -32.0, w: 2.4, h: 3.6, d: 11.0, mat: "stone", ry: 0.22 },
      { x: 34.0, z: -14.0, w: 10.0, h: 3.6, d: 2.2, mat: "stone", ry: -0.25 }
    ],
    props: [
      { key: "pillar", x: -8.0, z: 2.0, h: 4.4, rotY: 0.32, coll: "circle" },
      { key: "pillar", x: 0.0, z: 2.0, h: 4.4, rotY: 0.32, coll: "circle" },
      { key: "pillar", x: -8.0, z: 10.0, h: 4.4, rotY: 0.32, coll: "circle" },
      { key: "pillar", x: 0.0, z: 10.0, h: 4.4, rotY: 0.32, coll: "circle" },
      { key: "well", x: -11.5, z: 12.0, h: 1.6, rotY: 0.3, coll: "circle" },
      { key: "pagoda", x: 40.0, z: -40.0, h: 6.8, rotY: -0.78, coll: "box" },
      { key: "stairs", x: 26.02, z: -26.08, y: 0, h: 0.75, rotY: 0.78, coll: null },
      { key: "stairs", x: 10.77, z: 1.38, y: 0, h: 0.9, rotY: 0.25, coll: null },
      { key: "pine", x: -40.0, z: 16.0, h: 6.2, rotY: 0.3, coll: "circle" },
      { key: "pine", x: -39.0, z: -12.0, h: 6.6, rotY: 1.2, coll: "circle" },
      { key: "pine", x: -34.0, z: -38.0, h: 6.4, rotY: 2.1, coll: "circle" },
      { key: "pine", x: -14.0, z: -39.0, h: 5.8, rotY: 0.8, coll: "circle" },
      { key: "pine", x: 18.0, z: 38.0, h: 6.2, rotY: 1.7, coll: "circle" },
      { key: "pine", x: 39.0, z: 16.0, h: 6.4, rotY: 2.4, coll: "circle" },
      { key: "oak", x: -3.0, z: 38.0, h: 5.5, rotY: 0.5, coll: "circle" },
      { key: "oak", x: 38.0, z: -2.0, h: 5.4, rotY: 1.4, coll: "circle" },
      { key: "deadtree", x: -24.0, z: -4.0, h: 4.8, rotY: 0.9, coll: "circle" },
      { key: "rocks", x: -29.0, z: -24.0, h: 1.5, rotY: 0.6, coll: "circle" },
      { key: "rocks", x: 24.0, z: 22.0, h: 1.6, rotY: 1.3, coll: "circle" },
      { key: "cobble", x: -30.0, z: 30.0, w: 3.8, rotY: -0.78, coll: null },
      { key: "cobble", x: -15.0, z: 16.0, w: 3.8, rotY: -0.7, coll: null },
      { key: "cobble", x: -4.0, z: 6.0, w: 3.8, rotY: -0.5, coll: null },
      { key: "cobble", x: 11.0, z: -12.0, w: 3.8, rotY: -0.78, coll: null },
      { key: "cobble", x: 21.0, z: -21.0, w: 3.8, rotY: -0.78, coll: null }
    ],
    objective: {
      type: "relics",
      items: [
        { id: "relic_lookout", x: 9.4, z: -4.0, y: 2.6 },
        { id: "relic_hollow", x: -19.0, z: -16.0, y: 2.1 }
      ]
    },
    armory: { x: -30.0, z: 36.0, y: 0, rotY: 0 },
    anvil: { x: -38.0, z: 26.0, y: 0, rotY: 0 },
    traps: [
      { id: "trap_m3_fire", x: -10.0, z: 19.0, y: 0, kind: "fire", r: 3.0, cd: 25, dur: 6 },
      { id: "trap_m3_elec", x: 18.0, z: -18.0, y: 0, kind: "electric", r: 3.0, cd: 25, dur: 6 }
    ],
    barricades: [
      { id: "bar_m3_1", x: -15.0, z: 10.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: 0.45, hp: 180 },
      { id: "bar_m3_2", x: 14.0, z: 6.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: -0.35, hp: 180 }
    ],
    hazards: [],
    explosiveBarrels: [
      { x: -20.0, z: 23.0 },
      { x: -9.5, z: 4.0 },
      { x: 8.6, z: -6.2, y: 2.6 },
      { x: -13.0, z: -10.0 },
      { x: 13.0, z: 10.0 },
      { x: 3.0, z: -23.0 },
      { x: 21.0, z: -10.0 },
      { x: -26.0, z: -16.0 }
    ],
    supplies: [
      { x: -20.0, z: 35.0, kind: "ammo" },
      { x: -34.0, z: 5.0, kind: "med" },
      { x: 10.9, z: -5.5, y: 2.6, kind: "ammo" },
      { x: -17.5, z: -17.5, y: 2.1, kind: "med" },
      { x: 20.5, z: -36.5, kind: "both" }
    ],
    spawners: [
      { x: -41.0, z: -2.0 },
      { x: -40.0, z: -32.0 },
      { x: -4.0, z: -41.0 },
      { x: 22.0, z: -41.0 },
      { x: 41.0, z: -8.0 },
      { x: 40.0, z: 30.0 },
      { x: 2.0, z: 41.0 }
    ],
    lamps: [
      { x: -33.0, z: 38.0, y: 0, zone: "amber" },
      { x: -18.0, z: 24.0, y: 0, zone: "amber" },
      { x: -4.0, z: 13.0, y: 0, zone: "crimson" },
      { x: 11.9, z: -6.5, y: 2.6, zone: "crimson" },
      { x: -21.5, z: -14.0, y: 2.1, zone: "crimson" },
      { x: 15.0, z: -8.0, y: 0, zone: "crimson" },
      { x: 24.5, z: -18.5, y: 0, zone: "emerald" },
      { x: 33.0, z: -28.2, y: 1.8, zone: "emerald" }
    ]
  },
  {
    id: 4,
    nameVi: "Màn 4: Nghĩa Địa",
    nameEn: "Stage 4: Cursed Cemetery",
    descVi: "Cổng tam quan nghĩa địa, hầm mộ 2 tầng, 3 Trụ Nguyền, sương độc rìa map và Vua Orc Hộ Mộ.",
    descEn: "Tam Quan cemetery gate, elevated ossuary crypt, 3 Cursed Totems, toxic edge fog, and Orc Grave Lord.",
    arena: 102,
    skyHex: 0x0c0914,
    fogHex: 0x130f1e,
    fogDensity: 0.020,
    groundHex: 0x3d3a44,
    playerSpawn: { x: -10, z: 43, yaw: -0.15 },
    extractPos: { x: 8, z: -42, y: 0, r: 4.0 },
    killQuota: 32,
    bossType: "orcking",
    extractHoldSec: 3.0,
    maxAlive: 14,
    platforms: [
      { id: "plat_m4_crypt", x: 16.8, z: -4.0, w: 8.5, d: 7.5, yTop: 2.3, rampSides: ["s", "w"], rampLen: 4.4, mat: "stone", ry: 0.2, underpass: true },
      { id: "plat_m4_west", x: -23.0, z: 8.0, w: 6.8, d: 6.0, yTop: 2.1, rampSide: "e", rampLen: 4.8, mat: "brick", ry: -0.25, underpass: true }
    ],
    walls: [
      // Beat 1 (South Tam Quan Gate Push)
      { x: -18.0, z: 32.0, w: 12.0, h: 3.6, d: 2.2, mat: "stone", ry: 0.22 },
      { x: 14.0, z: 31.0, w: 13.0, h: 3.6, d: 2.2, mat: "stone", ry: -0.18 },
      { x: -2.0, z: 25.0, w: 2.8, h: 1.15, d: 1.3, mat: "stone", ry: 0.15 },

      // Beat 2 (Walk-through Ruined Nave + Angled Tombs)
      { x: 0.0, z: 3.0, yBase: 3.2, w: 11.0, h: 0.55, d: 10.0, mat: "stone", ry: -0.18 },
      { x: 2.5, z: 4.0, w: 3.2, h: 1.2, d: 1.3, mat: "crate", ry: -0.18 },
      { x: -13.5, z: 17.0, w: 9.5, h: 3.6, d: 2.2, mat: "brick", ry: -0.28 },
      { x: 12.5, z: 14.5, w: 9.5, h: 3.6, d: 2.2, mat: "brick", ry: 0.24 },
      { x: -11.0, z: -12.0, w: 2.4, h: 4.0, d: 11.0, mat: "stone", ry: 0.22 },
      { x: 4.0, z: -17.0, w: 10.0, h: 3.8, d: 2.2, mat: "stone", ry: -0.2 },
      { x: -28.0, z: -8.0, w: 2.4, h: 3.5, d: 11.0, mat: "brick", ry: 0.18 },
      { x: 28.0, z: 12.0, w: 2.4, h: 3.5, d: 11.0, mat: "brick", ry: -0.22 },
      { x: 27.0, z: -18.0, w: 10.0, h: 3.6, d: 2.2, mat: "stone", ry: 0.3 },

      // Beat 3 (NE Sanctuary Arch Exfil)
      { x: -20.0, z: -27.0, w: 10.0, h: 3.6, d: 2.2, mat: "stone", ry: -0.25 },
      { x: 18.0, z: -31.0, w: 10.5, h: 3.7, d: 2.2, mat: "brick", ry: 0.2 },
      { x: -13.0, z: -33.0, w: 2.8, h: 1.15, d: 1.2, mat: "stone", ry: 0.3 },
      { x: 6.0, z: -29.0, w: 2.8, h: 1.15, d: 1.2, mat: "stone", ry: -0.22 }
    ],
    props: [
      { key: "wall_door", x: -3.0, z: 31.5, h: 5.4, rotY: 0.15, coll: "gate" },
      { key: "pillar", x: -4.8, z: -1.2, h: 4.4, rotY: -0.18, coll: "circle" },
      { key: "pillar", x: 4.8, z: -1.2, h: 4.4, rotY: -0.18, coll: "circle" },
      { key: "pillar", x: -4.8, z: 7.2, h: 4.4, rotY: -0.18, coll: "circle" },
      { key: "pillar", x: 4.8, z: 7.2, h: 4.4, rotY: -0.18, coll: "circle" },
      { key: "stairs", x: 17.98, z: 1.83, y: 0, h: 0.85, rotY: 0.2, coll: null },
      { key: "stairs", x: -17.38, z: 9.43, y: 0, h: 0.8, rotY: -1.82, coll: null },
      { key: "watchtower", x: -40.0, z: 38.0, h: 8.2, rotY: 0.4, coll: "box" },
      { key: "watchtower", x: 38.0, z: -37.0, h: 8.2, rotY: -0.5, coll: "box" },
      { key: "house", x: -39.0, z: -36.0, h: 7.0, rotY: 0.35, coll: "box" },
      { key: "house", x: 40.0, z: 36.0, h: 7.0, rotY: -0.35, coll: "box" },
      { key: "deadtree", x: -24.0, z: 26.0, h: 5.0, rotY: 0.5, coll: "circle" },
      { key: "deadtree", x: 25.0, z: 25.0, h: 5.0, rotY: 1.6, coll: "circle" },
      { key: "rocks", x: -19.0, z: -12.0, h: 1.4, rotY: 0.7, coll: "circle" },
      { key: "rocks", x: 22.0, z: -26.0, h: 1.4, rotY: 1.9, coll: "circle" },
      { key: "torch", x: 2.5, z: -44.0, h: 2.3, rotY: 0, coll: "circle" },
      { key: "torch", x: 13.5, z: -44.0, h: 2.3, rotY: 0, coll: "circle" },
      { key: "cobble", x: -7.0, z: 38.0, w: 3.8, rotY: 0.15, coll: null },
      { key: "cobble", x: -2.0, z: 20.0, w: 3.8, rotY: -0.15, coll: null },
      { key: "cobble", x: 0.0, z: 3.0, w: 3.8, rotY: -0.18, coll: null },
      { key: "cobble", x: -3.0, z: -14.0, w: 3.8, rotY: 0.2, coll: null },
      { key: "cobble", x: 4.0, z: -34.0, w: 3.8, rotY: -0.35, coll: null }
    ],
    objective: {
      type: "totems",
      items: [
        { id: "totem_west", x: -23.0, z: 8.0, y: 2.1, hp: 220 },
        { id: "totem_crypt", x: 16.8, z: -4.0, y: 2.3, hp: 220 },
        { id: "totem_north", x: -7.0, z: -23.0, y: 0, hp: 220 }
      ]
    },
    armory: { x: -19.0, z: 40.0, y: 0, rotY: 0 },
    anvil: { x: 4.0, z: 40.0, y: 0, rotY: 0 },
    traps: [
      { id: "trap_m4_fire", x: -2.0, z: 15.0, y: 0, kind: "fire", r: 3.0, cd: 25, dur: 6 },
      { id: "trap_m4_elec", x: 4.0, z: -9.5, y: 0, kind: "electric", r: 3.0, cd: 25, dur: 6 }
    ],
    barricades: [
      { id: "bar_m4_1", x: -19.0, z: 22.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: 0.2, hp: 180 },
      { id: "bar_m4_2", x: 19.0, z: -15.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: -0.3, hp: 180 }
    ],
    hazards: [
      { id: "tox_w1", kind: "toxic", shape: "circle", x: -37.0, z: 14.0, y: 0, r: 6.5 },
      { id: "tox_w2", kind: "toxic", shape: "circle", x: -37.0, z: -14.0, y: 0, r: 7.0 },
      { id: "tox_e1", kind: "toxic", shape: "circle", x: 37.0, z: 12.0, y: 0, r: 6.5 },
      { id: "tox_e2", kind: "toxic", shape: "circle", x: 36.0, z: -16.0, y: 0, r: 7.0 }
    ],
    explosiveBarrels: [
      { x: -1.0, z: 21.0 },
      { x: -14.5, z: 3.5 },
      { x: 7.0, z: 9.0 },
      { x: 14.8, z: -6.0, y: 2.3 },
      { x: -22.5, z: 6.0, y: 2.1 },
      { x: -15.0, z: -19.0 },
      { x: 14.0, z: -22.0 },
      { x: -2.0, z: -34.0 }
    ],
    supplies: [
      { x: -25.0, z: 40.0, kind: "ammo" },
      { x: 20.0, z: 39.0, kind: "med" },
      { x: -24.5, z: 10.0, y: 2.1, kind: "ammo" },
      { x: 18.8, z: -2.5, y: 2.3, kind: "med" },
      { x: -16.0, z: -38.0, kind: "ammo" },
      { x: 19.0, z: -39.0, kind: "both" }
    ],
    spawners: [
      { x: -44.0, z: 22.0 },
      { x: 44.0, z: 22.0 },
      { x: -45.0, z: -2.0 },
      { x: 45.0, z: -2.0 },
      { x: -43.0, z: -24.0 },
      { x: 43.0, z: -24.0 },
      { x: -24.0, z: -44.0 },
      { x: 24.0, z: -44.0 }
    ],
    lamps: [
      { x: -12.0, z: 39.0, y: 0, zone: "amber" },
      { x: 2.0, z: 38.0, y: 0, zone: "amber" },
      { x: -25.2, z: 6.5, y: 2.1, zone: "crimson" },
      { x: 19.8, z: -6.5, y: 2.3, zone: "crimson" },
      { x: -9.5, z: -20.0, y: 0, zone: "crimson" },
      { x: 6.0, z: 12.0, y: 0, zone: "crimson" },
      { x: -4.0, z: -35.0, y: 0, zone: "emerald" },
      { x: 13.0, z: -39.0, y: 0, zone: "emerald" }
    ]
  },
  {
    id: 5,
    nameVi: "Màn 5: Bến Sông Ma",
    nameEn: "Stage 5: Haunted River Pier",
    descVi: "Pháo đài bến sông, cầu tàu 2 nhánh trên nước nông dẫn điện, bắn pháo hiệu thủ 25s trước Minotaur.",
    descEn: "Riverfront fortress, conductive shallow-water 2-branch pier, 25s flare holdout vs Minotaur, and boat exfil.",
    arena: 112,
    skyHex: 0x12080a,
    fogHex: 0x180c0f,
    fogDensity: 0.019,
    groundHex: 0x3a3437,
    playerSpawn: { x: -14, z: 46, yaw: 0.12 },
    extractPos: { x: 5, z: -25.5, y: 2.1, r: 4.2 },
    killQuota: 40,
    bossType: "minotaur",
    extractHoldSec: 3.0,
    maxAlive: 16,
    platforms: [
      { id: "plat_m5_pier_w", x: -7.5, z: -11.5, w: 5.5, d: 23.0, yTop: 2.1, rampSide: "s", rampLen: 5.0, mat: "wood", ry: 0, underpass: true },
      { id: "plat_m5_pier_e", x: 11.0, z: -11.5, w: 5.5, d: 23.0, yTop: 2.1, rampSide: "s", rampLen: 5.0, mat: "wood", ry: 0, underpass: true },
      { id: "plat_m5_cross", x: 1.75, z: -10.0, w: 13.0, d: 4.6, yTop: 2.1, rampSides: [], mat: "wood", ry: 0, underpass: true },
      { id: "plat_m5_dock", x: 2.0, z: -26.0, w: 24.0, d: 10.0, yTop: 2.1, rampSides: [], mat: "wood", ry: 0, underpass: true },
      { id: "plat_m5_shoal", x: -26.0, z: -6.0, w: 5.4, d: 8.5, yTop: 2.1, rampSide: "s", rampLen: 4.8, mat: "stone", ry: 0.32, underpass: true }
    ],
    walls: [
      // Beat 1 (South Fortress Courtyard)
      { x: -24.0, z: 36.0, w: 13.0, h: 4.0, d: 2.4, mat: "stone", ry: 0.22 },
      { x: 16.0, z: 35.0, w: 14.0, h: 4.0, d: 2.4, mat: "stone", ry: -0.18 },
      { x: -5.0, z: 31.0, w: 3.2, h: 1.2, d: 1.3, mat: "stone", ry: 0.15 },
      { x: -16.0, z: 22.0, w: 12.0, h: 3.8, d: 2.4, mat: "brick", ry: -0.15 },
      { x: 14.0, z: 20.0, w: 13.0, h: 3.8, d: 2.4, mat: "brick", ry: 0.18 },

      // Beat 2 (Seawall & Walk-Through Riverbank Canopy)
      { x: 1.75, z: 11.0, yBase: 3.4, w: 9.8, h: 0.5, d: 8.2, mat: "wood", ry: 0.1 },
      { x: -34.0, z: 14.0, w: 2.4, h: 3.8, d: 14.0, mat: "stone", ry: 0.24 },
      { x: 34.0, z: 16.0, w: 2.4, h: 3.8, d: 14.0, mat: "stone", ry: -0.22 },
      { x: -20.0, z: 6.0, w: 11.0, h: 3.6, d: 2.2, mat: "stone", ry: 0.16 },
      { x: 24.0, z: 4.0, w: 11.0, h: 3.6, d: 2.2, mat: "stone", ry: -0.24 },
      { x: 4.6, z: 11.5, w: 2.8, h: 1.2, d: 1.2, mat: "crate", ry: -0.12 },
      { x: -12.0, z: 14.0, w: 3.0, h: 1.15, d: 1.2, mat: "crate", ry: 0.28 },
      { x: 14.0, z: 11.0, w: 3.0, h: 1.15, d: 1.2, mat: "wood", ry: -0.25 },

      // Beat 3 (Pier Dock Cover yBase=2.1)
      { x: -5.5, z: -24.0, yBase: 2.1, w: 2.6, h: 1.15, d: 1.1, mat: "crate", ry: 0.25 },
      { x: 9.5, z: -23.5, yBase: 2.1, w: 2.6, h: 1.15, d: 1.1, mat: "crate", ry: -0.2 }
    ],
    props: [
      { key: "wall_door", x: -2.0, z: 21.5, h: 5.4, rotY: -0.12, coll: "gate" },
      { key: "pillar", x: -2.5, z: 7.5, h: 4.5, rotY: 0.1, coll: "circle" },
      { key: "pillar", x: 6.0, z: 7.5, h: 4.5, rotY: 0.1, coll: "circle" },
      { key: "pillar", x: -2.5, z: 14.5, h: 4.5, rotY: 0.1, coll: "circle" },
      { key: "pillar", x: 6.0, z: 14.5, h: 4.5, rotY: 0.1, coll: "circle" },
      { key: "stairs", x: -7.5, z: 2.5, y: 0, h: 0.85, rotY: 0, coll: null },
      { key: "stairs", x: 11.0, z: 2.5, y: 0, h: 0.85, rotY: 0, coll: null },
      { key: "watchtower", x: -42.0, z: 40.0, h: 8.8, rotY: 0.4, coll: "box" },
      { key: "watchtower", x: 42.0, z: 38.0, h: 8.8, rotY: -0.4, coll: "box" },
      { key: "house", x: -43.0, z: -4.0, h: 6.8, rotY: 0.35, coll: "box" },
      { key: "windmill", x: 43.0, z: -2.0, h: 9.5, rotY: -0.5, coll: "box" },
      { key: "horsecart", x: -22.0, z: 30.0, h: 1.8, rotY: 0.65, coll: "box" },
      { key: "cart", x: 24.0, z: 28.0, h: 1.7, rotY: 2.2, coll: "box" },
      { key: "barrelstack", x: -28.0, z: 42.0, h: 1.7, rotY: 0.4, coll: "circle" },
      { key: "deadtree", x: -44.0, z: 20.0, h: 5.2, rotY: 0.9, coll: "circle" },
      { key: "deadtree", x: 44.0, z: 20.0, h: 5.2, rotY: 1.7, coll: "circle" },
      { key: "cobble", x: -11.0, z: 40.0, w: 3.8, rotY: 0.2, coll: null },
      { key: "cobble", x: -3.0, z: 24.0, w: 3.8, rotY: -0.1, coll: null },
      { key: "cobble", x: 1.5, z: 10.0, w: 3.8, rotY: 0.15, coll: null },
      { key: "cobble", x: -7.5, z: 6.0, w: 3.6, rotY: 0, coll: null },
      { key: "cobble", x: 11.0, z: 6.0, w: 3.6, rotY: 0, coll: null }
    ],
    objective: { type: "holdout", flarePos: { x: -1.5, z: -26.5, y: 2.1 }, holdSec: 25 },
    armory: { x: -22.0, z: 42.0, y: 0, rotY: 0 },
    anvil: { x: -4.0, z: 42.0, y: 0, rotY: 0 },
    traps: [
      { id: "trap_m5_elec_w", x: -12.5, z: -5.5, y: 0, kind: "electric", r: 3.4, cd: 25, dur: 6 },
      { id: "trap_m5_elec_e", x: 16.0, z: -5.5, y: 0, kind: "electric", r: 3.4, cd: 25, dur: 6 },
      { id: "trap_m5_fire_dock", x: 2.0, z: -22.5, y: 2.1, kind: "fire", r: 3.2, cd: 25, dur: 6 }
    ],
    barricades: [
      { id: "bar_m5_1", x: -9.5, z: 19.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: 0.2, hp: 180 },
      { id: "bar_m5_2", x: 5.5, z: 18.0, y: 0, w: 3.8, h: 1.65, d: 0.45, ry: -0.25, hp: 180 }
    ],
    hazards: [
      { id: "water_main", kind: "water", shape: "rect", x: 0.0, z: -25.5, y: 0, w: 102.0, d: 47.0 }
    ],
    explosiveBarrels: [
      { x: -10.0, z: 27.0 },
      { x: 6.0, z: 26.0 },
      { x: -14.0, z: 10.0 },
      { x: 16.0, z: 9.0 },
      { x: -7.5, z: -15.0, y: 2.1 },
      { x: 11.0, z: -15.0, y: 2.1 },
      { x: -26.8, z: -9.2, y: 2.1 },
      { x: 1.5, z: -27.5, y: 2.1 },
      { x: -18.0, z: -18.0 }
    ],
    supplies: [
      { x: -27.0, z: 47.0, kind: "ammo" },
      { x: 12.0, z: 45.0, kind: "med" },
      { x: -28.0, z: 14.0, kind: "ammo" },
      { x: 26.0, z: 14.0, kind: "med" },
      { x: 1.75, z: -10.0, y: 2.1, kind: "both" },
      { x: -26.0, z: -8.0, y: 2.1, kind: "ammo" }
    ],
    spawners: [
      { x: -46.0, z: 32.0 },
      { x: 46.0, z: 32.0 },
      { x: -46.0, z: 8.0 },
      { x: 46.0, z: 8.0 },
      { x: -42.0, z: -16.0 },
      { x: 42.0, z: -16.0 },
      { x: -24.0, z: 50.0 },
      { x: 24.0, z: 50.0 }
    ],
    lamps: [
      { x: -18.0, z: 43.0, y: 0, zone: "amber" },
      { x: 2.0, z: 42.0, y: 0, zone: "amber" },
      { x: -11.0, z: 16.0, y: 0, zone: "crimson" },
      { x: 10.0, z: 15.0, y: 0, zone: "crimson" },
      { x: -9.5, z: -12.0, y: 2.1, zone: "crimson" },
      { x: 13.0, z: -12.0, y: 2.1, zone: "crimson" },
      { x: -24.8, z: -8.6, y: 2.1, zone: "crimson" },
      { x: -7.0, z: -29.5, y: 2.1, zone: "emerald" },
      { x: 12.0, z: -29.5, y: 2.1, zone: "emerald" }
    ]
  }
];
