export type CreateMenuTrigger = '@' | '/';

export interface ReferenceCategory {
  readonly kind: string;
  readonly count: number;
}

export interface ReferenceItem {
  readonly compositeKey: string;
  readonly kind: string;
  readonly label: string;
  readonly subtitle: string;
  readonly visibility: string;
}

export const REFERENCE_KIND_LABELS: Readonly<Record<string, string>> = {
  PlayerCharacter: 'Character',
  NPC: 'NPC',
  Monster: 'Monster',
  Location: 'Location',
  Faction: 'Faction',
  Quest: 'Quest',
  Artifact: 'Artifact',
  Encounter: 'Encounter',
  Session: 'Session',
  Event: 'Event',
  Secret: 'Secret',
  Clue: 'Clue',
  Claim: 'Claim',
  Lore: 'Lore',
  Room: 'Room',
  Scene: 'Scene',
  Chapter: 'Chapter',
  Handout: 'Handout',
};

export function referenceKindLabel(kind: string): string {
  return REFERENCE_KIND_LABELS[kind] ?? kind;
}

// A trigger counts only at the start of the text or after whitespace, so values like 1/2 never open the menu.
export function findMenuTrigger(textBeforeCaret: string): { trigger: CreateMenuTrigger; query: string; index: number } | null {
  const match = /(^|\s)([@/])([^\s@/]*)$/.exec(textBeforeCaret);
  if (!match) return null;
  return { trigger: match[2] as CreateMenuTrigger, query: match[3], index: match.index + match[1].length };
}

export function buildReferenceChip(item: ReferenceItem): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'lw-ref';
  chip.setAttribute('contenteditable', 'false');
  chip.dataset['refKind'] = item.kind;
  chip.dataset['refKey'] = item.compositeKey;
  chip.textContent = item.label;
  return chip;
}
