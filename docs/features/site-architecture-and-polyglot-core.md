# Feature: LoomWeaver V2 Site Architecture, Working Navigation & Polyglot Core (`loomweaver` DB + Neo4j)

- **Slug:** `site-architecture-and-polyglot-core`
- **Status:** Verified
- **Module owner:** Frontend Core Shell + All Route Pages / Backend Polyglot Core (`LoomWeaver.*`)
- **System support:** System-aware (D&D 5e, Pathfinder 2e, Vampire V5)
- **First written / Last updated:** 2026-10-25
- **Authoritative code paths:** `frontend/src/app/`, `backend/src/`, `scripts/provision_loomweaver_mysql.sql`, `scripts/provision_loomweaver_neo4j.cypher`
- **Architecture docs:** `../architecture/repository-layout.md`, `../architecture/component-system.md`, `../architecture/component-catalog-and-instances.md`, `../architecture/engine-placement-and-ownership.md`, `../standards/ui-and-product-rules.md`

## User story

As a GM, player, or creator, I want a clean, modular LoomWeaver V2 application with every navigation link, feature route, header control, Loom drawer citation, and role preview switch working end-to-end, backed by a dedicated `loomweaver` MySQL database and `loomweaver` Neo4j node graph (completely decoupled from the retired legacy schema), using our official `/LoomWeaver.png` logo and reusable configured Angular components.

## Boundaries and non-goals

**In scope:**
- Dedicated `loomweaver` MySQL database and `loomweaver_test` schema with normalized `lw_*` tables and canonical seed data.
- Dedicated `loomweaver` Neo4j graph constraints, composite keys (`{campaignId}:{entityType}:{entityId}`), and role-filtered graph neighborhood & Loom retrieval.
- Clean .NET 10 modular backend (`LoomWeaver.Domain`, `LoomWeaver.GameSystems`, `LoomWeaver.Infrastructure`, `LoomWeaver.Modules`, `LoomWeaver.Api`).
- Reusable Angular component library (`lw-icon`, `lw-button`, `lw-badge`, `lw-panel`, `lw-empty-state`, `lw-asset-card`, `lw-entity-card`, `lw-stat-radar`, `lw-inspector-drawer`, `lw-loom-launcher`) with separate `.ts`, `.html`, `.scss` files and typed `input()` / `output()` APIs.
- Consistent application shell with official `/LoomWeaver.png` logo, global left navigation, campaign selector, GM/Player preview switch, independent Weave toggle, and persistent Loom launcher on every route.
- All 13 primary feature workspaces and sub-links working with zero broken links.

**Explicitly out of scope this slice:**
- Full GPU shader compilers or heavy Meshy AI 3D generation pipelines (those will be migrated one slice at a time into `features/maps/engine/` and `features/effects/`).

## Reusable component audit (required for UI slices)

- **New components created once and reused across routes:**
  - `lw-icon`: Zero-emoji crisp vector icon component.
  - `lw-button`: Domain-neutral action button/link (`primary`, `emerald`, `gold`, `ghost`, `danger`; `sm`, `md`, `lg`).
  - `lw-badge`: Audience/visibility marker (`gm`, `players`, `public`), entitlement badge (`free`, `included`, `purchased`, `locked`), and subscription tier tag.
  - `lw-panel`: Dark charcoal/emerald/gold surface container with header/actions slots and variants.
  - `lw-empty-state`: Standardized loading, empty, error, and unauthorized views.
  - `lw-asset-card`: Multi-instance asset card (`compact`, `standard`, `detailed`) reused across Marketplace, Map Studio, Dice Forge, and Asset Library.
  - `lw-entity-card`: Multi-instance domain card (`compact`, `standard`, `detailed`) reused for Campaigns, Characters, NPCs, Creatures, Quests, Factions, Locations, and Encounters.
  - `lw-stat-radar`: Configurable SVG radar/bar analytics widget reused across Statistics and Characters.
  - `lw-inspector-drawer`: Right-hand contextual Act / Location / Session / Entity inspector with deep-link navigation.
  - `lw-loom-launcher`: Persistent header trigger + desktop-reflowing / mobile-modal Campaign Memory drawer with clickable deep links.
- **Need for actual browser Custom Element export:** Optional adapter stub in `integrations/elements/register-elements.ts` for external marketplace embeds only; internal app uses native standalone Angular components.

## Security, role and visibility matrix

| Scenario | GM (`role = 'gm'`) | Authorized Player (`role = 'players'`) | Unauthorized |
| --- | --- | --- | --- |
| Read public/player entities | Allowed | Allowed | Denied |
| Read `visibility = 'gm'` secrets & unrevealed clues | Allowed | Filtered out server-side | Denied |
| Modify campaign canon / approve Weave drafts | Allowed | Denied (403) | Denied |
| Search The Loom / traverse Neo4j graph | Full campaign graph | Only `visibility IN ['public', 'players']` | Denied |

## Acceptance criteria

- [x] Official `/LoomWeaver.png` logo used in global shell and home headers.
- [x] Every navigation link, header control, card deep-link, and Loom source link navigates to a working route.
- [x] Reusable Angular components configured via typed `input()` and `output()` with separate `.ts`, `.html`, `.scss` files.
- [x] MySQL database provisioned under `loomweaver` (not `jane`) and Neo4j graph seeded with `loomweaver` composite keys.
- [x] All hand-written files under 500 lines (`python scripts/check_source_limits.py`).
- [x] `dotnet build` and `npm run build` succeed with zero errors.
