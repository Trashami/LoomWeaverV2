# Water controls

`lw-water-controls` is a reusable standalone inspector with component-owned wrapping styles.

Inputs: `settings` (`WaterSettings`, defaults to clear stream), `bodies` (authorized scene water records), `selectedId` (null means a new waterbody).

Outputs: `settingsChange` emits a complete immutable configuration; `selected` emits a body ID or an empty string for new water; `remove` and `clear` express deletion intent. The parent owns history and scene edits. Separate instances have no shared mutable UI state.

Sections: waterbody and presets; channel/banks; flow/surface; appearance; waterfalls. Range and color controls have accessible labels, mode buttons expose pressed state and keyboard focus is visible.
