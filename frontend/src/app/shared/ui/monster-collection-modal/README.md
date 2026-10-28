# lw-monster-collection-modal

Reusable standalone presentation component. Styles and responsive behavior belong to this component.

Inputs/models: open, editing, campaigns, defaultCampaignId, pickerResults, monsterLabels, busy, errorMessage.

Outputs: pickerSearch, collectionSaved, collectionDeleted.

Bind only authorized DTOs. Events express user intent; campaign authorization and persistence are enforced by the server. See the adjacent TypeScript and model files for payload types and defaults.
