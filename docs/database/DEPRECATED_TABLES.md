# Deprecated Tables and Stores

Track anything replaced by a better table or store. Remove the item once its data is migrated and no code reads it.

| Item | Type | Replaced by | Status | Notes |
|------|------|-------------|--------|-------|
| `WorldLoreCatalogStore.LoreByCampaign` | In-memory store | `lw_lore_entries` via `LoreEntryRepository` | Cache only | Now hydrated from MySQL on each lore workspace read. Still written directly by `ConnectedStoryEngine` region overlays, which are not persisted yet. |
| `lw_lore_entries.entry_key` | Column name (never existed on prod) | `lw_lore_entries.id` and `composite_key` | Removed from writers | The old `/loom/notes` INSERT referenced it, so it failed on prod. |
| `lw_lore_entries.summary` | Column name (never existed on prod) | `lw_lore_entries.excerpt` and `content` | Removed from writers | Same failed INSERT as above. |
| `lw_lore_entries.visibility_scope` | Column name (never existed on prod) | `lw_lore_entries.visibility` (enum `public`/`players`/`gm`) | Removed from writers | Same failed INSERT as above. |
| `DiceForgeEndpoints` and `CharacterSheetLiveTelemetryEndpoints` dead helpers | Code | None | Pending review | Confirm no callers before removal. |

## Removed

- `CampaignAnalyticsEndpoints.cs` hardcoded analytics: removed.
- Handouts seed fallback in `world-lore-facade.service.ts`: removed.
