# Feature: Stage 4 — Dice Forge 3D, Music & Ambience Web Audio Engine & Campaign Analytics Ledgers

- **Slug:** `stage-4-dice-forge-audio-and-campaign-analytics`
- **Status:** Verified
- **Module owner:** `features/dice`, `features/assets`, `features/statistics` / `LoomWeaver.Modules.Dice`, `LoomWeaver.Modules.Audio`, `LoomWeaver.Modules.Statistics`
- **System support:** D&D 5e (`dnd5e`), Pathfinder 2e (`pf2e`), Vampire V5 (`vampire_v5`)
- **First written / Last updated:** 2026-10-27
- **Authoritative code paths:**
  - `frontend/src/app/shared/ui/dice-roller-tray/`
  - `frontend/src/app/features/dice/engine/models/` (`dice-model.types.ts`, `polyhedra-tables.model.ts`, `chamfer-geometry.builder.ts`, `dice-model.catalog.ts`)
  - `frontend/src/app/features/dice/engine/skins/` (`dice-skin.types.ts`, `obsidian.skin.ts`, `nordic.skin.ts`, `celtic.skin.ts`, `arcane-glyph.skin.ts`, `engraved-steel.skin.ts`, `glass.skin.ts`, `plastic.skin.ts`, `elven.skin.ts`, `void.skin.ts`, `bloodstone.skin.ts`, `clockwork-brass.skin.ts`, `index.ts`)
  - `frontend/src/app/features/dice/engine/materials/` (`face-patterns.drawer.ts`, `face-overlays.drawer.ts`, `normal-emissive.generator.ts`, `babylon-dice-material.factory.ts`)
  - `frontend/src/app/features/dice/engine/audio/` (`dice-sound.service.ts`)
  - `frontend/src/app/features/dice/engine/effects/` (`dice-crit-effects.catalog.ts`, `dice-crit-effects.runner.ts`)
  - `frontend/src/app/features/dice/engine/dice-physics-trajectory.ts`
  - `frontend/src/app/features/dice/engine/babylon-dice-stage.service.ts`
  - `frontend/src/app/features/dice/components/dice-customizer-panel/`
  - `frontend/src/app/features/dice/`
  - `frontend/src/app/shared/ui/audio-stem-mixer/`
  - `frontend/src/app/shared/ui/achievement-card/`
  - `frontend/src/app/features/assets/`
  - `frontend/src/app/features/statistics/`
  - `backend/src/LoomWeaver.Domain/Stage4Contracts.cs`
  - `backend/src/LoomWeaver.Modules/Dice/DiceForgeEndpoints.cs`
  - `backend/src/LoomWeaver.Modules/Audio/AudioAmbienceEndpoints.cs`
  - `backend/src/LoomWeaver.Modules/Statistics/CampaignAnalyticsEndpoints.cs`
- **Architecture docs:** `../architecture/module-roadmap.md`

## User story

As a GM or Player, I want:
1. **Dice Forge 3D (Module 6)**: An interactive Babylon.js 3D polyhedral dice forge with separate modular files for **3D models** (`engine/models/*.ts`, supporting both procedural chamfered polyhedra with custom bevel profiles and `.glb` meshes) and **skins** (`engine/skins/*.skin.ts`), full user customization (dice size `small / medium / large`, core dice color, number color, glow color & intensity, reflection/metallic specular, surface roughness, recessed/raised engraving, vein heartbeat pulse, Nat 20 & Crit Fail 3D effects, and material-matched roll sound profiles), plus **reward milestones, Loommarks redemption, and Vault store purchases**.
2. **Music & Ambience Engine (Module 7)**: A real browser Web Audio API multi-stem synthesizer and crossfade mixer (`Ambient Drone`, `Exploration Harmony`, `Tension Pulse`, `Combat Percussion`) synchronized with .NET campaign scene mood transitions (`Exploration`, `Intrigue`, `Sanctum`, `Combat`, `Boss`).
3. **Campaign Analytics & Ledgers (Module 11)**: A server-side .NET reporting engine and interactive analytics studio displaying party and per-character play-style radars (`lw-stat-radar`), damage by element/type distributions, d20 entropy telemetry, character performance ledgers, and automated campaign achievements.

## Reusable component audit (required for UI slices)

- **Existing components reused:** `lw-card`, `lw-button`, `lw-badge`, `lw-icon`, `lw-stat-card`, `lw-asset-card`, `lw-stat-radar`.
- **Components created and reused across routes:**
  - `lw-dice-roller-tray`: Polyhedral die selector (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`), die count, modifier stepper, Advantage/Normal/Disadvantage mode selector, and cryptographic roll trigger.
  - `lw-dice-customizer-panel`: Modular 3D Dice Customizer panel for dice size (`small`, `medium`, `large`), 3D geometry model selection/unlocking, core & number pigments, glow & reflection sliders, engraving mode, Nat 20 / Crit Fail 3D effect presets with live preview triggers, and roll audio profile selector.
  - `lw-audio-stem-mixer`: 4-stem adaptive Web Audio mixer (`Ambient Drone`, `Exploration Harmony`, `Tension Pulse`, `Combat Percussion`) with scene mood crossfade presets and live level meters.
  - `lw-achievement-card`: Displays campaign and character achievements with rarity tier, unlock progress bar, and XP reward metadata.

## Security, role and visibility matrix

| Scenario | GM (`role = 'gm'`) | Authorized Player (`role = 'players'`) |
| --- | --- | --- |
| Roll authoritative cryptographic dice & customize 3D skin/model/size/FX | Allowed | Allowed |
| Claim campaign milestone dice rewards or redeem Loommarks | Allowed | Allowed |
| Trigger global campaign audio scene transition | Allowed | Local preview only |
| View campaign telemetry, radars, and unlocked achievements | Allowed (full ledger) | Allowed (party-visible ledger) |

## Acceptance criteria

- [x] Separate modular files for 3D models (`engine/models/*.ts`) and skins (`engine/skins/*.skin.ts`) with runtime registration (`registerDiceModel`, `registerDiceSkin`, `registerDiceSoundProfile`) so new models, skins, and sounds can be added cleanly.
- [x] Full live 3D customization: Dice Size (`Small`, `Medium`, `Large`), Core Dice Color, Dice Number Color, Glow Color & Intensity, Metallic Specular Reflection, Surface Roughness, Recessed/Raised Engraving, Vein Heartbeat Pulse, Nat 20 3D Effects, Crit Fail 3D Effects, and Roll Sound Profiles.
- [x] Reward & Purchase Economy: Users earn Loommarks on every roll (`+15` standard, `+35` on Nat 20), claim Campaign Milestone rewards, redeem Loommarks, or unlock sets in the Vault Store (`/api/v2/campaigns/{campaignId}/dice-forge/unlock`).
- [x] Backend .NET 10 endpoints provide cryptographic dice rolls (`RandomNumberGenerator.GetInt32`) with SHA-256 verification digests, adaptive audio scene presets, and live campaign analytics aggregation.
- [x] Every file in `features/dice/` and `LoomWeaver.Modules/Dice` stays strictly under 300 lines, and both `dotnet build` and `npm run build` succeed with zero errors.

## Dice material and usability revision (2026-10-27)

- Shared renderer now uses PBR materials with a studio reflection environment, clear glass transmission, polished black obsidian, warm wood grain and irregular stone relief. Cached procedural color and height maps use matching fields; glass and obsidian have smooth surfaces rather than stone pits.
- Shared inspector puts styles and material before shape, uses shorter labels and a bounded responsive width. Choosing a material clears decorative body overlays that would hide its texture; explicit number styling remains configurable.
- Dice route starts with the global navigation collapsed. Forge rolls retain engraved numerals and report results through Alertify without floating result badges.
- Notifications use a compact panel, at most two visible cards, and 4.5-second roll / 3-second status defaults.
- Validation: `node scripts/test_dice_surfaces.cjs`, frontend production build with public prerender, and serial .NET API build. Repository-wide source limits have existing violations outside this slice.

## Face layout, engraving and model revision (2026-10-27)

- Mesh UVs and glyph placement share a projected face polygon. Lettering uses one world-space em size for the set, measured against every printable face including corner labels, percentile pairs, tracking and stroke. Glyphs and their effects are clipped to the actual face boundary.
- D4 vertex identities determine its labels. The three faces sharing a vertex repeat its value, and settling that value puts the corresponding point upward. All saved circular face overlays are ignored; the border UI is removed. Resin uses a cloud field rather than circular strokes.
- Carved/flush/raised lettering changes signed height, beveled inlay shading and parallax occlusion. Customization rebuilds settled dice in place and queues changes made during a throw.
- Selecting a model applies that model's bevel instead of retaining the previous model's value. The five included profiles are balanced, sharp, deep-beveled, an open edge cage with inset number panels, and a double-faceted cut. The missing built-in GLB placeholder is replaced by the working faceted profile; registered external GLB definitions remain supported.
- Regression commands: `node scripts/test_dice_geometry.cjs` and `node scripts/test_dice_surfaces.cjs`. The browser preview additionally checks real-font fit, signed engraving pixel differences and saved overlay compatibility. Required release checks remain the production frontend build/prerender and .NET build.

## Natural result-preserving roll motion (2026-10-28)

- Removed the late target-face interpolation and both renderer completion-time pose resets. The same shared pool planner now drives forge and fullscreen rolls.
- The unnumbered solid is simulated through impacts, friction and damped rocking until it sleeps. A constant local rotational symmetry is applied to the complete trajectory before playback so the supplied result lands face-up (or d4 point-up) without changing the path or seeking the result at the end. Final yaw is preserved rather than realigned to the camera.
- Floor support follows the actual supplied die mesh vertices. Renderer timers finish the complete planned trajectory, including per-die delays, instead of cutting off active motion at a timeout. Low duration settings speed the entire planned roll rather than truncating it.
- Motion regressions cover 112 seeded rolls, every target-face symmetry for all seven die types, identical motion across different supplied results, near-zero final velocity, extreme physics settings, and ground contact for all five model profiles: `node scripts/test_dice_motion.cjs`.
- Motion remains cosmetic; the planner consumes supplied outcomes and does not change result generation or authorization.
