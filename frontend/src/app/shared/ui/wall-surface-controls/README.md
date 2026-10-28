# Wall surface controls

`lw-wall-surface-controls` is a shared, standalone Angular inspector section.

- `brush`: typed `WallBrushSettings`; defaults to a disabled moss brush.
- `smoothing`: continuous terrain-fit percentage, 0–100 (default 75).
- `brushChange`: emits a complete immutable brush configuration.
- `smoothingChange`: emits the requested fit percentage.

No singleton state, asset requests, persistence, or permissions live in this component. Two instances have independent input bindings and emit only user intent. Labels, pressed state, keyboard focus, wrapping controls and component-owned styles are included.
