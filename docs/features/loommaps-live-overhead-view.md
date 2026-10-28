# Live overhead map view

The 2D Top Down and 2D Live controls now show the same Babylon scene used by 3D. The orthographic camera locks heading and tilt while allowing pan and zoom. Water shaders, particle effects, lights, terrain, and actual loaded models remain live. Switching views does not rebuild or save scene data.

Split mode renders that scene through an orbit camera and a locked overhead camera. Pointer picking and camera controls follow the viewport under the pointer. The old flat Canvas2D renderer is no longer mounted in the editor. This deliberately supersedes older lightweight-2D editor guidance for visual parity; it still requires WebGL and split mode renders two views.

Validation: `node loommaps-studio/scripts/check-camera-views.mjs`, Angular production build, .NET build, and browser verification of the overhead and split scene with water and GLB plants. Tests cover angular locks, orthographic zoom, switching back to perspective, shared scene identity, and split pointer camera routing.
