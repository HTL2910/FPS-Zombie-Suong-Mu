# FPS Zombie Sương Mù — Source v6.5

Version: **v6.5** (build stamp "BUILD v6.5" in the menu and in-game HUD)

Build layout: `index.html` plus external model/font folders: `assets/zb/` (7 zombie GLBs), `assets/env/` (25 environment GLBs), `assets/weapons/` (`wp_thuanthien.glb`, `wp_excalibur.glb`), and `assets/fonts/` (`BeVietnamPro`). **The game must keep `assets/` next to `index.html`** —
at runtime it fetches `assets/zb/zb_<name>.glb`, `assets/env/env_<name>.glb`, and `assets/weapons/wp_<name>.glb`. Serve the whole folder over HTTP rather
than copying `index.html` alone. Bilingual VI/EN, mobile touch controls
included.

## What changed in v6.5 (Thuận Thiên Divine Sword & Extra Brute Monsters)

- **Slot 4 Divine Sword (`thuanthien`):** Integrated 3D `wp_thuanthien.glb` ("Thuận Thiên Kiếm" from Bộ Kiếm Thần Khí) into the viewmodel pass (`gunScene`) with golden blade light, slash swing animation, and wide 5.8 m melee cleave arc (`Digit4` or mobile `SÚNG` cycle).
- **Expanded Brute Roster (`assets/zb/`):** Added `zb_troll.glb` (`warrior-troll`) and `zb_minotaur.glb` (`minotaur-warrior`) rotating alongside `zb_golem.glb` on Wave 3+.
- **Vietnamese Typography:** Bundled `BeVietnamPro-Regular.ttf` and `BeVietnamPro-Bold.ttf` in `assets/fonts/`.
- **HUD Polish:** Adjusted `#hudBR` positioning clear of `#muteBtn` and suppressed gun low-ammo warnings while wielding melee weapons.

## What changed in v6.4 (new Meshy library: characters + map rebuilt)

Rebuilt on the player's report that the previous build still showed
white/material-less models, an old-looking map, and a mouse that did not
hide on click. All characters and the whole environment now come from the
Meshy model library collected on 2026-11-21 (verified from inside the
files: embedded textures present, animation clips read from the GLBs),
packed with gltfpack (meshopt + WebP). The 3DLabTools environment set and
the old Meshy zombie payloads are gone.

### Characters (assets/zb/)

- **Normal walker:** `zb_zombie` (Walking / Stumble_Walk / Unsteady_Walk,
  attack = Left_Hook_from_Guard), in rotation with `zb_ghost`
  (Walking / Running, Idle_4 / Idle_12).
- **Runner:** `zb_skeleton` (Running; Lean_Forward_Sprint on high waves).
  No attack clip exists in the file — it lunges with its run cycle.
- **Brute:** `zb_golem` (Slow_Orc_Walk, attack = Skill_01, stagger =
  Mummy_Stagger), scaled large.
- **Boss (waves 5 & 10):** `zb_orcking` (Walking / Running, Attack,
  specials Weapon_Combo / Axe_Spin_Attack), scaled largest.
- None of the library models carries a dying clip, so death is
  code-driven: the body falls, sinks and fades — no T-pose corpses.
- The v6.2 material guard also covers the new zombies; runtime self-check
  `window.__zbTexOk()` reports per-model map bound + image loaded
  (companion to `__gunTexOk()` for the guns, which are unchanged).

### Map (assets/env/, 25 models)

- **South — Graveyard (spawn):** dungeon gate with wooden door, stepped
  stone walls, ancient pillars, hell torches, stone stairs, rock piles,
  cobblestone path; procedural tombstones kept.
- **North — Ruined Church:** gothic house as the ruined church hall,
  wooden watchtower; the code-built bell tower + glowing cross (boss
  arena) kept; torches and lanterns.
- **East — Night Market:** hand carts, a horse cart, crate stacks,
  barrels, tavern tables, a treasure chest, a windmill at the far edge,
  lantern posts.
- **West — Fog Pine Forest:** GLB pine trees, dead trees, oaks, bushes,
  mushroom clusters, rocks.
- **Center — Crossroads:** wishing well centerpiece, Japanese pagoda,
  cobblestone plaza, amber lanterns, a second house at the NE corner,
  stairs at the pagoda.

### Pointer lock — root cause found and fixed

The lock request was sent with an options argument
(`{unadjustedMovement: true}`); on platforms that do not support it the
request rejects with NotSupportedError and the cursor never hid. The game
now retries the request without options, so pointer lock engages where
the browser permits it (verified engaged on the canvas in a top-level
page). Inside the Muse app's sandboxed embed frame the browser blocks
pointer lock by policy (SecurityError — the frame lacks the
allow-pointer-lock permission); there the game silently uses its fallback
(mouse-look + click-to-shoot) and the on-screen hint describes the
fallback honestly instead of promising a lock.

### Also

- Build stamp updated to **BUILD v6.4** (menu header/footer + HUD).
- Page weight dropped sharply (the old build's index.html was ~12.1 MB;
  zombie payloads are now ~2.8 MB total in `assets/zb/`).

Unchanged: the 3 guns + v6.2 gun material guard, gameplay, the
"Đi tìm Linh" story, 5 districts, 10 waves with bosses at 5 & 10,
between-wave upgrades, lore notes, slim UI, VI/EN, mobile touch, quality
tiers, fallback shooting.

## Controls

- **W A S D** — Move / Di chuyển
- **SHIFT** — Run / Chạy nhanh
- **SPACE** — Jump / Nhảy
- **MOUSE** — Look around / Nhìn xung quanh (click to pointer-lock where
  the browser permits it)
- **CLICK** — Shoot / Bắn (hold with Rifle)
- **R** — Reload / Nạp đạn
- **1 · 2 · 3** — Switch weapon / Đổi súng
- **F** — Flashlight / Đèn pin
- **P / ESC** — Release mouse + pause / Thả chuột + tạm dừng
- **10 waves** — Boss on waves 5 & 10

Mobile touch controls are included.

## Asset credits

Character and environment models: Meshy AI-generated models from the
library collected 2026-11-21 (`zb_*` from the library's monsters group;
`env_*` from its dungeon / architecture / nature / props / vehicles
groups), packed with gltfpack. Gun models unchanged from v5/v6 (Meshy,
embedded in `index.html`).

## Verification (2026-11-21)

- Builder verification in real local Chromium sessions against the served
  build at forced minimum quality: `__zbTexOk()` true for all 5 zombie
  models, `__gunTexOk()` true for all 3 guns, textured close-ups of every
  zombie type, district screenshots, code-driven death fall measured,
  pointer lock engaged top-level, sandboxed-frame fallback firing with
  the honest hint, VI/EN round-trip, 390 px no overflow, both inline
  scripts pass `node --check`.
- Independent re-verification of the exported package (this folder served
  over local HTTP, headless Chromium): all 5 zombie templates and all 3
  guns report map bound + image loaded; 0 console errors in every
  session; menu shows the v6.4 stamp and the Meshy-library credit; the
  spawn view shows the new gate/stairs/torches/walls textured; the pistol
  renders dark and textured; a real click during play engaged pointer
  lock on the canvas (`document.pointerLockElement` = CANVAS) and fired
  (magazine 12 → 11); a forced boss spawn raised the boss HP bar.
- Not verified end-to-end: full wave-5 / wave-10 boss fights in live flow
  (boss model, clips and HP bar verified via forced spawn). The
  platform's automated audit could not capture this heavy WebGL page
  (180 s timeout, as with previous builds); its content and security
  reviews ran clean. FPS under SwiftShader software rendering is not
  representative; use a real-GPU machine as the yardstick.
