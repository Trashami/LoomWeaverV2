# Layer controls

`lw-layer-controls` accepts one required `layer: EffectLayer` signal input and emits a `changed: Partial<EffectLayer>` patch. It never mutates the input or persists data. Each instance derives its own groups from the shared JSON catalog. Parent state owns undo/redo and patch application.

Groups use native keyboard-accessible disclosure controls. Inputs use ng-primitives and have explicit accessible labels, bounded values and focus outlines. Styles are owned by this component. The width follows the parent inspector; labels wrap without horizontal overflow.

Control-profile tests exercise every family and variant against rendered output. Add a catalog entry and renderer regression coverage whenever a new control becomes available.
