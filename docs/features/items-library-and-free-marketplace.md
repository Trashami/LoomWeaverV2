# Items library and free homebrew marketplace

The authenticated `/items` route is available from the shell's Items link. It reuses the shared item cards, custom-item form, collection form, and medium detail dialog. Search updates immediately; filters cover category, rarity, source and collection, with name, price, rarity and weight sorting.

## Authoritative data and permissions

- `Items/ItemRepository.cs` creates `lw_item_library` in the configured `loomweaver` MySQL database. Items, collections and inventory entries are separate record kinds. A database failure is surfaced, never reported as a successful local save.
- Standard equipment is an embedded snapshot of the existing Character Creator equipment catalog. No fictional campaign examples are published as actual community creations.
- Custom items are always marked Homebrew. The authenticated account supplies creator identity. Store downloads are always free; GP remains the in-game value. New items default to private.
- Only the creator may publish an item. Collections are visible/editable only to their creator in a campaign where they have a `gm` membership. Publishing requires every included homebrew item to be published first.
- The marketplace exposes only published items and collections, with username credit. Merchant/location preparation and campaign identity are removed from public collection DTOs.
- Inventory endpoints resolve `lw_campaign_members.assigned_character_key` for the actual authenticated user and requested campaign. An account-level GM flag or an arbitrary client-selected character cannot grant inventory access. Missing membership or character binding denies the operation.
- Character Studio reloads persisted catalog inventory, merges using stable entry IDs, and clears it when the active account or campaign changes. The item page never falls back to a character in another campaign.

## Merchant preparation

Collections can save an intended merchant name and an authorized campaign location. These are preparation fields for future merchant pages, not a shipped merchant-commerce system. Publishing a collection does not publish the merchant/location preparation.

## Existing integration boundary

Some older campaign endpoints still read legacy membership tables. This feature deliberately uses the V2 `lw_campaign_members` records and never grants access by falling back to those legacy tables or demo identities. Campaigns must have matching V2 membership and character assignments. Legacy membership reconciliation is outside this slice.

## Verification

- `dotnet build backend/src/LoomWeaver.Api/LoomWeaver.Api.csproj --no-restore -m:1`
- `npm run build` in `frontend` (includes static public-route pre-rendering).
- `dotnet restore backend/tests/Items.Checks/Items.Checks.csproj -m:1`
- `dotnet run --project backend/tests/Items.Checks/Items.Checks.csproj --no-restore -p:BuildInParallel=false`

The checks cover character-binding denial, invalid item data and image URLs, canonical equipment loading, and actual endpoint authentication denials without storage access. Authenticated two-account MySQL round trips and browser visual QA remain required before production release.
