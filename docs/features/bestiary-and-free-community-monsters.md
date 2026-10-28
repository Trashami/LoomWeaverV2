# Bestiary and free community monsters

The authenticated `/bestiary` route and left navigation entry follow the Items library layout. Shared monster cards show an image, name, description, CR and creator username. A medium shared modal presents the complete statblock and campaign tools. The Marketplace reuses these cards for published community monsters, which are always free.

## Data and authorization

- Official monsters come from `loomweaver.dnd_monster_library`; user-created monsters and preparation/history records use `lw_custom_monsters`, `lw_monster_collections`, collection links, `lw_campaign_monster_assets`, `lw_campaign_monster_placements` and `lw_monster_sightings`.
- Creator identity comes from the authenticated account. Only its creator may edit or publish a custom monster. Private drafts do not appear in community results. SQL publication always sets price to zero.
- Campaign operations resolve `lw_campaign_members` on every request. Account roles, demo usernames and requested role parameters cannot grant DM access. DM player preview downscopes access.
- Collections are owner-only and can be assigned only to campaigns where the owner is DM. Players receive neither collections nor campaign-specific token/model assignments.
- Each monster supports two token URLs and two model URLs per campaign. Library options are ranked by normalized monster name. No private assignments are copied into published custom monsters.
- Sightings record outcome, time, session, encounter, location, witnesses and notes. Visibility is DM-only, party-wide or limited to bound witnessing characters. The Loom revalidates membership before citing these records, and witness-only events are not copied into the party event log.
- Writes commit in MySQL before updating process caches. Storage failures propagate instead of reporting a local save as durable.
- Encounter roster reads/saves now use campaign-authorized DM endpoints and `lw_saved_encounters`, replacing the previous shared process-local list. Bestiary placements are independently durable preparation records.

## References reconciled

Read repository and nested agent instructions, Angular/component/backend standards, Items requirements, and the Obsidian start page, vision, release gates, authorization, GraphRAG, Angular design and encounter notes. Legacy MythWeaver describes Monster entities, but does not replace current campaign membership or privacy requirements. The vault is a design archive; this feature does not claim every proposed graph projection or live combat feature is shipped.

## Verification and remaining release work

`backend/tests/Bestiary.Checks` checks campaign-role downscoping, witness visibility, asset URL validation, fractional challenge ratings and anonymous denial across every bestiary endpoint.

Run `dotnet build backend/src/LoomWeaver.Api/LoomWeaver.Api.csproj --no-restore -m:1`, `dotnet run --project backend/tests/Bestiary.Checks/Bestiary.Checks.csproj --no-restore -p:BuildInParallel=false`, and `npm run build` in frontend (includes public-route pre-rendering).

Authenticated two-account browser/database round trips, persistence across process restarts, responsive visual review and live encounter integration remain release gates. No local frontend was listening when browser verification was attempted. The global source-limit check also reports existing unrelated oversized files; new bestiary source files remain below 500 lines.

## Production preparation — 2026-10-28

Server-source import resolved 1,110 inherited statblocks and processed 5,201 definitions: 5,184 existing identities updated and 17 inserted. No catalog identities were deleted. Verified 3,369 image paths and 3,099 token paths. Expanded source_id to VARCHAR(128) to fit supplied source IDs. Catalog backup: `lw_bestiary_backup_20261028_072621`.

Eight QftIS definitions reference missing Human/Dragonborn (Silver) templates in both supplied server datasets: Cipolla, Iaseda, Isabela Folcarae, Juliana, Orlando, Piyarz, Shalfey, Uma. These existing records were left unchanged rather than inventing traits. The exporter emits a machine-readable source-error report.

Staged checks passed: 34 local regression checks, 37 authenticated API/permission checks, and 8 persistence checks after service restart. The authenticated test used existing users in different campaign roles, temporary records, guaranteed cleanup and a final cache restart. Backend build/publish and frontend build passed; frontend warnings and 19 global source-size violations are pre-existing outside this feature.
