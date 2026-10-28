# Feature: EffectBuilder Standalone Studio (`effectbuilder.loom-weaver.com`)

- **Slug:** `effectbuilder-standalone-studio`
- **Status:** Verified
- **Module owner:** `effectbuilder-studio` (Standalone Angular 22 App) / `LoomWeaver.Modules.EffectStudio` (.NET 10 Backend Module)
- **First written / Last updated:** 2026-10-26
- **Authoritative code paths:**
  - `effectbuilder-studio/src/app/shared/ui/effect-top-navbar/`
  - `effectbuilder-studio/src/app/shared/ui/effect-sub-header/`
  - `effectbuilder-studio/src/app/shared/ui/effect-tool-rail/`
  - `effectbuilder-studio/src/app/shared/ui/emitter-library-panel/`
  - `effectbuilder-studio/src/app/shared/ui/effect-viewport-stage/`
  - `effectbuilder-studio/src/app/shared/ui/effect-timeline-dock/`
  - `effectbuilder-studio/src/app/shared/ui/effect-properties-inspector/`
  - `effectbuilder-studio/src/app/features/effect-studio/engine/babylon-effect-studio-stage.service.ts`
  - `effectbuilder-studio/src/app/features/effect-studio/engine/dungeon-environment.builder.ts`
  - `effectbuilder-studio/src/app/features/effect-studio/engine/rune-vortex-shader.builder.ts`
  - `effectbuilder-studio/src/app/features/effect-studio/services/effect-studio-store.service.ts`
  - `backend/src/LoomWeaver.Domain/EffectStudioContracts.cs`
  - `backend/src/LoomWeaver.Modules/EffectStudio/Domain/EffectEmitterCatalog.cs`
  - `backend/src/LoomWeaver.Modules/EffectStudio/Engine/EffectTimelineValidationEngine.cs`
  - `backend/src/LoomWeaver.Modules/EffectStudio/EffectStudioEndpoints.cs`

## Overview

`effectbuilder.loom-weaver.com` is built as its own dedicated Angular 22 + Babylon.js project (`effectbuilder-studio`) sharing the core LoomWeaver web component library (`src/app/shared/ui`) and connecting to the unified .NET 10 backend (`LoomWeaver.Api` / `LoomWeaver.Modules.EffectStudio`).

## Engine & Component Separation

1. **Frontend Babylon.js Engines (Focused Classes <= 300 lines)**:
   - `DungeonEnvironmentBuilder`: Procedural 3D dungeon floor tiles, stone pillars, wall sconces with dynamic point lights, mage caster miniature, and three skeleton warrior miniatures on red combat plinth rings.
   - `RuneVortexShaderBuilder`: Inscribed golden runic circle on the dungeon floor, concentric rotating rings, 3 helical ascending light ribbons, and rising golden spark particles with real-time timeline visibility and reduced-motion support.
   - `BabylonEffectStudioStageService`: Lifecycle, resize observer, camera presets (`Isometric`, `Top-Down`, `Tactical Orbit`, `Caster POV`), and outside-Angular-zone render loop.
2. **Backend .NET 10 Engines (Focused Classes <= 300 lines)**:
   - `EffectEmitterCatalog`: Authoritative catalog of 18 emitter presets (`Magic Bolt`, `Fire Burst`, `Ice Shards`, `Shadow Swirl`, `Holy Light`, `Poison Cloud`, `Rune Circle`, `Healing Aura`, `Lightning Arc`, `Smoke`, `Embers`, `Water Splash`, `Wind Gust`, `Leaf Swirl`, `Blood Mist`, `Arcane Sigil`, `Portal`, `Energy Beam`).
   - `EffectTimelineValidationEngine`: Validates emitter curves, clamps parameters, normalizes timeline track windows (`Light Beam`, `Rising Particles`, `Rune Circle`, `Dust`, `Sound`), evaluates in-game combat test telemetry, and computes SHA-256 export bundle checksums.
   - `EffectStudioEndpoints`: Exposes `/api/v2/effects/studio`, `/api/v2/effects/emitters`, `/api/v2/effects/save`, `/api/v2/effects/test-in-game`, and `/api/v2/effects/{effectId}/export`.

## Layer inspector control catalog (2026-10-27)

The active standalone client lives in `effectbuilder-studio/src/app/app.component.*` and its renderer is `effects/babylon/native-frame.ts`; the earlier engine/component paths above describe the original implementation.

- `effects/core-layer-controls.json` declares all 29 families, 145 variants, shared numeric control groups, variant exclusions and bounded renderer settings. The backend embeds this same catalog for variant and settings validation.
- `effects/layer-control-profile.ts` resolves controls for the active family, variant and renderer. `shared/components/layer-controls/` renders independent signal-input instances with a patch output and ng-primitives inputs.
- Composition name is the saved visual's title. Associated spell comes from the existing searchable, paginated database spell picker; a custom-name field remains available. Choosing a spell does not replace layers or change gameplay rules.
- Global identity, preview choreography, optional particle emitters, surface lighting and gameplay riders have separate collapsible sections. Shared controls are grouped into geometry, appearance, particles, motion and aura ribbons. Disabled lighting hides its dependent settings.
- Aura vortex/orbit/halo layers support strand count, spiral turns, height, ribbon width, signed rotation and orbiting mote count through `AuraSettings`. Missing settings retain legacy geometry defaults. Settings survive import/export and server persistence; changing family clears incompatible aura settings.
- `scripts/update-control-schema.mjs` refreshes renderer-setting bounds and variants from the existing typed settings definitions. Commit the regenerated JSON with changes to those definitions.

Validation: `npm test` checks native frame generation and lifecycle, all 145 styles' exposed numeric controls against actual rendered output, aura JSON round trips and unsupported-control filtering. Afterward run `dotnet run --project backend/tests/EffectControls.Checks -- effectbuilder-studio/dist/control-fixtures.json` from the repository root to verify all core styles and spell/ambient presets pass server validation and malformed aura settings fail. Build the frontend with `npm run build` and backend with `dotnet build` before release.
