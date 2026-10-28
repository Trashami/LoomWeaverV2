# lw-monster-campaign-panel

Reusable standalone presentation component. Styles and responsive behavior belong to this component.

Inputs/models: monsterKey, campaignName, sessions, encounters, placements, collections, busy.

Outputs: placementRequested, placementRemoved, collectionToggled, createCollectionRequested.

Bind only authorized DTOs. Events express user intent; campaign authorization and persistence are enforced by the server. See the adjacent TypeScript and model files for payload types and defaults.
