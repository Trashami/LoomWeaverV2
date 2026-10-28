# Terrain-aware water editor

## Implemented scope

- A continuous river drag creates one waterbody and one undo entry. Existing water can be selected in the inspector, edited or removed.
- River levels are oriented downhill from sampled uncarved terrain. Sharp drops activate falling-water shading, faster streaks and capped plunge spray. This is a visual terrain-aware flow model, not a dynamic fluid-volume simulation.
- Pond mode creates a level circular basin, sized by click/drag or diameter. Its lowest bank sets the water level and directional current is disabled.
- Carving is a reversible terrain layer. Beds and feathered banks are recomputed from the original sculpted terrain, never accumulated into it. Removing/undoing water restores the bed.
- Shader controls cover flow speed, turbulence, waves, ripple scale, foam, opacity, shallow/deep colors, Fresnel reflectivity and captured-scene refraction. Reflection is a procedural environment approximation; refraction uses one shared 512px scene capture.
- Spray is capped at eight emitters per scene, 160 particles each. No third-party textures, remote Node Materials or demo models are required.
- Shared `lw-water-controls` owns inspector layout, presets, labels, keyboard focus and width containment. Existing real-2D water footprints use the same physical widths.

## Verification

Run `node scripts/check-water-tool.mjs` and `node scripts/check-wall-surfaces.mjs` in `loommaps-studio`, `npm run build` there, and `dotnet build LoomWeaver.Server.csproj` in `backend`.

Tests cover downhill direction, waterfall thresholds, level ponds, finite mesh data and winding, channel feathering, repeatable excavation and restoration, malformed points/settings, one history entry per drag, selected-body editing/removal and bounded spray. Browser checks cover drawing an animated river and a separate steep-terrain fixture with a waterfall and pond.

## Existing limitations

The platform Save Draft API still saves revision metadata rather than the full rendered scene. Water settings and paths are represented in scene state and undo snapshots but are not yet durably persisted across reloads. Terrain carving, shading and particles do not introduce new server authorization or asset-publication paths. Existing GM/player scene authorization remains the server's responsibility.

## References

- https://doc.babylonjs.com/toolsAndResources/assetLibraries/materialsLibrary/waterMat
- https://doc.babylonjs.com/features/featuresDeepDive/particles/fluid_renderer/fluid_demos
- User-supplied Playground https://playground.babylonjs.com/#XKPVRC#3 and pasted Node Material setup were visual references. This implementation does not import or redistribute that demo's third-party assets or camera behavior.

## Connected-surface correction

Water footprints are grouped into connected networks and remeshed as one clipped heightfield surface. Overlapping strokes and legacy circular dabs share an exterior shoreline, eliminating internal cap overlap, foam seams and transparent double layers. Junctions blend flow vectors, height and per-body material settings. Level-separated water remains independent.

Brush size controls channel width; bank blend distance and bank feathering control the carved bank transition. The preview shows both footprints. Stroke start is explicit, pointer capture keeps a slow drag active outside the canvas, and cancellation/blur ends the stroke. Stale movement callbacks after release cannot create new circles. The same start/end contract is used by the 2D canvas.

Regression coverage now includes slow held strokes, stale callbacks after release, T-junction topology, legacy circle repair and bank feathering, in addition to the original water tests.


## River volume and selected-asset scatter correction

Water now closes its exterior shoreline and underside down to the carved bed. This makes the water body readable from low camera angles; it remains a visual volume, not simulated fluid conservation. The surface network still has no internal junction walls. Slope continuously drives accelerated streaks and roughness, with turbulence decaying over a short downstream runout. Spray explicitly uses texture alpha and standard blending, with smaller, slower mist droplets instead of opaque bouncing squares.

Scatter clusters now use only their stored selected GLB. Pending or unavailable models do not become placeholder rocks/cones, and there is no six-model cutoff. Density scales with painted area, capped at 96 assets per dab and 1,500 per scene. Seeded positions, modest uniform size variation and random yaw repeat across rebuilds; pitch and roll stay zero. Collections remain future work; each cluster retains one source model URL.

Validation adds closed-volume topology, bed depth, rapids settling, selected-model counts above six, density, deterministic transforms, upright yaw and missing-model behavior. Build warnings remain the existing frontend bundle budget and network-limited NuGet audit lookup.


## Bank contact and texture relief

The render mesh now extends into the feathered bank and clips against the actual carved terrain sampler. Low exposed edges taper down to the ground, and shallow alpha/foam soften contact instead of outlining a raised blue skirt. Carving remains reversible and unchanged by texture relief.

Floor height maps are passed from asset selection through scene rebuilds and packed into the normal texture alpha for parallax occlusion. The Texture Height / Relief Depth control changes surface detail only; Raise/Lower owns terrain geometry. Missing height maps retain normal shading without synthetic vertex ridges. A texture-only effect does not change collisions or the floor silhouette.

The shared map inspector puts facing controls before placement/scale settings and provides relative 45-degree turns. Clear Painted Floor Layer uses lw-button with the danger variant; fullWidth now sizes the shared component host as well as its button. Tests cover terrain invariance, normal/height packing and bank contact in addition to the existing water/scatter suite.
