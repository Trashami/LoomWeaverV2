// Converts 5etools-style entry trees (data_json of dnd_book_nodes) into HTML.
// Text is HTML-escaped before inline tags are stripped, so the output is safe to bind with innerHTML.

const BLOCK_TYPES = new Set(['entries', 'section', 'inset', 'insetReadaloud', 'quote', 'variant', 'optfeature', 'abilityDc', 'abilityAttackMod']);

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Replaces {@tag content|extra} with its display text.
export function renderInlineTags(value: string): string {
  return value.replace(/\{@\w+\s*([^{}]*)\}/g, (_match, body: string) => body.split('|')[0] ?? '');
}

function inline(value: unknown): string {
  return renderInlineTags(escapeHtml(String(value ?? '')));
}

export function renderEntries(entries: unknown): string {
  if (!Array.isArray(entries)) {
    return entries === undefined || entries === null ? '' : renderEntry(entries);
  }
  return entries.map((entry) => renderEntry(entry)).join('');
}

export function renderEntry(entry: unknown): string {
  if (typeof entry === 'string') {
    return `<p>${inline(entry)}</p>`;
  }
  if (!entry || typeof entry !== 'object') {
    return '';
  }
  const node = entry as Record<string, unknown>;
  const type = typeof node['type'] === 'string' ? (node['type'] as string) : 'entries';

  switch (type) {
    case 'list':
      return `<ul>${(node['items'] as unknown[] ?? []).map((item) => `<li>${renderEntry(item)}</li>`).join('')}</ul>`;
    case 'table':
      return renderTable(node);
    case 'tableGroup':
      return ((node['tables'] as Record<string, unknown>[] | undefined) ?? []).map(renderTable).join('');
    case 'statblock':
      return `<div class="book-block">${node['name'] ? `<h4>${inline(node['name'])}</h4>` : ''}${renderEntries(node['entries'])}</div>`;
    case 'image':
    case 'gallery':
    case 'flowchart':
      return '';
    default:
      break;
  }

  if (BLOCK_TYPES.has(type) || Array.isArray(node['entries'])) {
    const heading = node['name'] ? `<h4>${inline(node['name'])}</h4>` : '';
    return `<div class="book-block">${heading}${renderEntries(node['entries'])}</div>`;
  }
  if (Array.isArray(node['items'])) {
    return `<ul>${(node['items'] as unknown[]).map((item) => `<li>${renderEntry(item)}</li>`).join('')}</ul>`;
  }
  if (typeof node['entry'] === 'string') {
    return `<p>${inline(node['entry'])}</p>`;
  }
  return '';
}

function renderTable(node: Record<string, unknown>): string {
  const caption = node['caption'] ? `<caption>${inline(node['caption'])}</caption>` : '';
  const labels = (node['colLabels'] as unknown[] | undefined) ?? [];
  const head = labels.length
    ? `<thead><tr>${labels.map((label) => `<th>${inline(label)}</th>`).join('')}</tr></thead>`
    : '';
  const rows = ((node['rows'] as unknown[][] | undefined) ?? [])
    .map((row) => `<tr>${row.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="book-table">${caption}${head}<tbody>${rows}</tbody></table>`;
}

function renderCell(cell: unknown): string {
  if (cell && typeof cell === 'object' && 'roll' in (cell as Record<string, unknown>)) {
    const roll = (cell as { roll: { exact?: number; min?: number; max?: number } }).roll;
    return roll.exact !== undefined ? String(roll.exact) : `${roll.min ?? ''}-${roll.max ?? ''}`;
  }
  return typeof cell === 'string' ? inline(cell) : renderEntry(cell);
}
