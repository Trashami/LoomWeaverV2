# lw-monster-detail-modal

Reusable standalone presentation component. Styles and responsive behavior belong to this component.

Inputs/models: open, detail, loading, errorMessage, campaignName, isGm, busy, sessions, encounters, characters, placements, collections, assignment, tokenOptions, modelOptions, sightings.

Outputs: closed, placementRequested, placementRemoved, collectionToggled, createCollectionRequested, assignmentSaved, sightingRecorded, publishRequested, editRequested.

Bind only authorized DTOs. Events express user intent; campaign authorization and persistence are enforced by the server. See the adjacent TypeScript and model files for payload types and defaults.
