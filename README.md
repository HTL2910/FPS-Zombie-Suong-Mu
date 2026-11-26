# FPS Zombie Sương Mù — Dead Fog (v9.0)

> **Play Online in Browser (Itch.io):** https://hathanhlong2910.itch.io/fps-zombie

**FPS Zombie Sương Mù (Dead Fog)** is a bilingual (**VI / EN**) 3D WebGL tactical extraction survival FPS built with Three.js. Set in mist-shrouded **Làng Hạ Đồn** at 02:14 AM, you fight through 5 remade multi-height arenas, complete dynamic stage objectives, upgrade weapons with Scrap, survive special infected & bosses, and uncover a 5-act mystery dossier before dawn.

## Highlights in v9.0

### 5 Multi-Level Tactical Maps & Dynamic Objectives
1. **Stage 1 — Ngõ Cụt Sương Mù (`Cổng Làng Cổ`):** Asymmetric alleyways, timber loft (`underpass: true`), and destructible **Wooden Barricade Gate** blocking extraction.
2. **Stage 2 — Chợ Đêm (`Chợ Đêm Bỏ Hoang`):** Open-roof angled market stalls, elevated catwalk, and **2 Power Generators (`Hold E 2s`)** that flood the market with light and trigger a **Panic Horde**.
3. **Stage 3 — Rừng Thông (`Sân Đình Linh Miếu`):** Winding forest ridges, central shrine (`yTop: 1.8m`), and **2 Linh Relics** imposing a carry sprint penalty.
4. **Stage 4 — Nghĩa Trang (`Nghĩa Trang Sương Mù`):** Crypt platform, toxic swamp pools, **3 Cursed Totems** shielding the **Orc Grave Lord**, and an **Armory/Anvil** forward cache.
5. **Stage 5 — Bến Sông Ma (`Bến Tàu Tận Thế`):** Riverfront fortress, conductive shallow-water 2-branch pier, **Signal Flare**, **25s Holdout** against the **Minotaur**, and boat exfil.

### Special Infected & Bosses
- **Acid Spitter** (`zb_skeleton.glb`) — launches ranged acid puddles that deal area damage.
- **Bloater** (`zb_troll.glb`) — detonates in a toxic blast and temporarily blinds vision.
- **Phantom Stalker** (`zb_ghost.glb`) — shadowswitch dash & ambush pounce with UI warning pulse.
- **Bosses:** **Orc Grave Lord** (`zb_orcking.glb`, totem-armored on Stage 4) & **Minotaur** (`zb_minotaur.glb`, Stage 5 holdout).

### Combat, Economy & Systems
- **Weapons (`1`–`4`):** `Pistol`, unlockable `Shotgun`, unlockable `Rifle`, and `Thuận Thiên Kiếm` (`wp_thuanthien.glb`) 3D divine cleave blade (`5.8m` arc).
- **Scrap Economy & Field Armory (`E`):** Earn Scrap from kills, **Headshot Streak (`x1.0`–`x3.0`)**, and red barrel chains. Unlock `Shotgun` / `Rifle` at the Field Armory and upgrade weapons from **Mk.I → Mk.III (Incendiary DoT)** at the Upgrade Anvil.
- **Quick Melee Shove (`V` / Right-Click):** Emergency knockback push (`22` stamina) to break grapples.
- **Tactical Environment:** Electric & Fire Traps (conductive through shallow water), destructible/repairable **Wooden Barricades**, **Holy Flare (`G`)**, **AI Director (`Surge ↔ Breather`)**, instanced decals (`DECAL_MAX=128`), `41` WebAudio cues, and `0` dynamic `THREE.PointLight`s for smooth 60 FPS WebGL rendering.
- **Desktop + Mobile (`390×844`):** Pointer-lock mouse look (plus sandbox iframe fallback) and responsive touch controls (dual-stick + dedicated `#btnShove` & `#btnInteract`).

### 5-Act Story — *Làng Hạ Đồn: Hồ Sơ Đêm Sương Mù*
- **In-Game Dossier (`#storyScr`):** 5 chapters & 5 collectible field notes (`note1`–`note5`) saved persistently, Linh live radio beats during objectives, 5 stage-specific defeat epilogues, and a True Ending upon Stage 5 boat extraction.

---

## Controls

| Key / Input | Action |
| --- | --- |
| `W A S D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `Mouse / Touch Drag` | Aim & Look (click canvas for Pointer Lock) |
| `Left Click` | Fire Weapon / Swing Sword (hold for Rifle) |
| `V` or `Right Click` | Quick Melee Shove (knockback) |
| `R` | Reload |
| `E` / `Hold E` | Interact (Armory, Anvil, Generators, Traps, Barricades, Relics, Flare) |
| `1` · `2` · `3` · `4` | Switch Weapon (`Pistol`, `Shotgun`, `Rifle`, `Thuận Thiên Kiếm`) |
| `F` | Toggle Flashlight |
| `G` | Throw Holy Flare (`12s` cooldown) |
| `P` / `Esc` | Pause / Release Cursor |

---

## Project Layout

- `index.html` — Game shell, HUD, Armory/Anvil, Story Dossier, and Mobile Touch controls.
- `frontend/css/style.css` — Responsive HUD & overlay styles.
- `frontend/js/config.js` — Weapon stats, Scrap & Director tuning, VI/EN localization, `FPS.STORY` narrative data.
- `frontend/js/levels.js` — 5 multi-height level definitions (ramps, underpasses, traps, barricades, objectives, lighting halos).
- `frontend/js/world.js` — Three.js renderer, `groundY` vertical collision/OBB solver, GLB loader (`meshopt`), decal/halo instancing.
- `frontend/js/entities.js` — Weapons, Mk.I–Mk.III upgrades, Incendiary DoT, zombie pool, Specials, Bosses, traps, shove.
- `frontend/js/ui.js` — Bilingual HUD, Armory UI, Story Dossier, between-stage Perk Draft + lore cards, Radar.
- `frontend/js/main.js` — Game loop, input/pointer-lock handling, AI Director, objective progression, `window.__fpsTest`.
- `frontend/js/audio.js` — Procedural WebAudio synthesizer (`41` cues).
- `frontend/js/api.js` — Express API client + automatic `localStorage` static fallback (`window.__ITCH_STATIC__`).
- `assets/` — Packed Meshy GLB models (`assets/zb/`, `assets/env/`, `assets/weapons/`), `assets/fonts/BeVietnamPro`, `assets/story_intro.jpg`.
- `backend/` — Optional Node.js profile & leaderboard persistence.
- `tests/e2e/` — 110-case Playwright E2E test suite (`runner.js`, `tier1.spec.js`–`tier5.spec.js`).

---

## Running Locally & Testing

Browsers restrict `fetch()` for `.glb` assets over `file://`, so serve over HTTP from the repository root (or parent workspace gateway):

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Run the Playwright smoke or full E2E verification suite:

```bash
node tests/e2e/runner.js --smoke
node tests/e2e/runner.js
```

Build standalone static Itch.io HTML5 package (from parent `Muse Game` workspace):

```bash
node build-itch.mjs
```

---

## Asset Credits

- Character, creature, weapon, and environment 3D models: Meshy AI model library (`zb_*`, `env_*`, `wp_*`), optimized with `gltfpack` (meshopt + WebP textures).
- Typography: `BeVietnamPro` (`Regular` & `Bold`).
