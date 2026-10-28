# Selected wall surfaces and terrain fitting

## Scope

Selected walls expose a surface brush in the shared inspector, replacing the whole-wall tint control. Radius, opacity, color and hardness are independent. Picking checks the nearest visible mesh before accepting a dab, and shallow back-face-culled decals project only onto meshes belonging to that wall. Source UVs, albedo, normal textures and lighting are preserved. Dabs are batched by source material with per-vertex brush data, avoiding one draw call per dab. One completed stroke creates one undo snapshot; dabs are serialized in `MapWallSegmentNode.paintDabs` and replayed after mesh rebuilds.

`terrainSmoothing` (0–100, default 75) continuously deforms each unique stamp mesh along a shared sampled terrain profile. Base vertices remain embedded while the top follows the smoothed profile. Zero preserves stepped fitting. Templates and other wall instances are never modified.

T junctions stop at the adjoining near face, corners meet at the adjoining outside face, and stamp geometry is clipped to solid spans. Door frames slightly overlap the cutout and inherit the wall base offset and scaled thickness.

## Verification

Run `node scripts/check-wall-surfaces.mjs` in `loommaps-studio`, `npm run build` there, and `dotnet build LoomWeaver.Server.csproj` in `backend`. Regression cases exercise junctions, brush feathering, unique slope geometry, selected/front-face paint isolation, and door embedding/cutout bounds. Inspect actual textured stamps and painting in a WebGL browser before deployment.

## Existing persistence boundary

The current Save Draft request sends studio/revision metadata, not the rendered scene graph. This change keeps dabs and terrain fit in the scene state and undo snapshots, but does not claim server persistence across reloads. Completing account-authorized scene graph persistence is a separate backend requirement; no new public asset paths or server permissions are added here.
