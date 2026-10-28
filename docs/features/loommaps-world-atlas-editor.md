# LoomMaps World Atlas editor

World Atlas is a dedicated mode at `https://maps.loom-weaver.com/?mode=atlas`. The battlemap editor stays mounted when changing modes, preserving its current in-memory work. The global campaign header and Loom launcher remain available.

## Shipped first slice

- Seeded island/continent heightfield, 256 × 256 editable cells divided into 32-cell render chunks. World scale defaults to 4,800 × 3,600 km and is independent of terrain resolution. Rectangular world proportions are respected in rendering and raster export.
- Continuous raise, lower/carve, mountain-ridge, smooth, and flatten brushes with radius, strength and edge feathering. One stroke is one undo step; undo/redo retains the current accepted server revision.
- Separate biome-color layer: natural, grassland, forest, desert, tundra, volcanic, and wetland. Procedural surface detail, slope-driven rock, high-altitude snow, directional relief shading, adjustable sea level, animated ocean and shallow shoreline foam. These are visual terrain tools, not geological or fluid simulation.
- Top-down and tilted 3D camera views, grid, location visibility, fit-world, and a terrain-following brush outline. Reduced-motion preference stops ocean animation.
- Asset-free city, town, village, castle, ruin and landmark miniatures, editable name/type/color/visibility/position. Each uses an existing canonical campaign `locationKey`, or creates a stable new one on save. Linking an existing key repositions its marker instead of duplicating the location.
- Durable MySQL documents, revision conflicts, explicit save/reopen, JSON import/export, and true raster player PNG export independent of WebGL. Imported documents are saved as new atlases. Unsaved work is exported before opening/replacing an atlas; closing a dirty editor triggers the browser's leave-page warning.

## Campaign location integration

`lw_atlas_documents` stores the versioned heightfield, biomes, scale, markers, and thumbnail. `lw_world_maps` receives the atlas identity and a protected preview URL. `lw_world_locations` remains the canonical shared location table. Atlas and location changes commit in one MySQL transaction. Canonical names, types, positions and visibility update; existing descriptions, history, child-map links and other lore fields are retained.

World Lore reloads the SQL locations and atlas map summaries, so new settlements appear there after restart. Existing location detail edits persist back to those SQL records. Removing a miniature unlinks its placement; it does not delete the location or its lore. The existing location model has a primary map placement; linking it in another atlas changes that primary placement. Cross-map and graph projection expansion is a later slice.

## Authorization and storage

All atlas endpoints require authenticated campaign GM ownership or canonical GM membership, matched by authenticated email against `lw_users` / `lw_campaign_members`. They never use the legacy anonymous demo-GM fallback or a client `role=gm` flag. Unknown campaigns and nonmember accounts are denied. World Lore endpoints now require campaign membership; GM previews can down-scope to player view. The terrain editor and thumbnails are currently GM-only. Player PNG exports exclude GM-only location names and symbols.

The first authenticated atlas request applies the idempotent table creation in `scripts/migrations/20261028_world_atlas.sql` through the application's existing MySQL connection. It does not query legacy schemas or change credentials. Request size, sample counts, finite heights, allowed biome/marker values, canonical location ownership and optimistic revisions are validated. Failed location ownership checks roll back the entire save.

## Operational verification

- `node loommaps-studio/scripts/check-atlas-tool.mjs`: deterministic terrain, brush continuity and feathering, independent biome painting, ridge/smoothing behavior, JSON round trip and invalid import rejection.
- `dotnet run --project backend/tests/Atlas.Checks/Atlas.Checks.csproj`: bounded document validation, duplicate references, round trip, anonymous denial and forged role/token denial.
- `dotnet build backend/LoomWeaver.Server.csproj` and `npm run build` in `loommaps-studio`.
- Browser verification of rendered geometry, marker placement, view switching, controls and horizontal containment. An authenticated campaign GM session is required to verify a live SQL save/reopen and cross-screen location detail.
- Deploy the shared API from current origin/master, preserving all studio modules and restarting both configured API services; deploy the standalone client with `scripts/deploy_maps_frontend.py`. Both preserve existing assets/configuration and retain rollback material.

## Boundaries

This is a bounded continent editor, not an infinite streamed globe. Dynamic LOD, erosion simulation, river drainage, political boundary polygons in the 3D editor, custom uploaded marker meshes, city street/interior generation and multiplayer terrain collaboration are not part of this slice. Terrain biomes are painted colors with procedural surface shading; this does not yet expose the battlemap asset texture library. Existing battlemap water, object painting, and room tools remain separate.


## Continental rendering and authoring update

New worlds default to 4,800 × 3,600 km and 256 × 256 editable cells. Existing documents retain their original heights, biomes, locations, and resolution. The generator builds warped connected ranges, cuts downhill drainage channels, and relaxes steep talus; the mountain brush uses the same continuous range field with bounded growth. These are deterministic terrain synthesis heuristics, not a full geological simulation.

World scale presets cover island, region, continent, and world extents. One normalized elevation unit represents 8 km; displayed relief uses 32-fold vertical exaggeration with bounded limits for readability. World coordinates, marker elevations, brush outlines, ocean depth, and terrain geometry share the same elevation data. Physical brush radii account for rectangular map proportions. Biome painting changes only the biome layer. Cross-chunk neighbour normals remove lighting seams.

The ocean uses fine multi-frequency animated noise, shallow-water color, restrained highlights, and a depth-based shoreline foam band. Procedural translucent cloud cover defaults on and can be toggled in the bottom viewport bar. Clouds are a view setting, not saved geographic data; JSON and player PNG remain terrain/location exports. Reduced-motion stops water and cloud animation.

Atlas now uses the shared battlemap tool dock, a compact file bar, contextual right-hand inspector, and bottom view controls. Right-drag orbits; middle-drag pans; wheel/pinch zoom stays inside the canvas. Cloud and rendering changes do not alter campaign location privacy or save permissions.

Validation adds deterministic drainage, mass-conserving talus relaxation, world-scale relief, and kilometre-consistent rectangular brushes to the atlas regression suite.
