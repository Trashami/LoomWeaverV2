/** Self-hosted numeral faces; legacy saved family strings resolve to the same catalog. */
export const DICE_FONTS = [
  { label: 'Royal serif', value: 'Cinzel, Georgia, serif', family: 'Loom Royal', file: 'cinzel' },
  { label: 'Nordic runes', value: '"Nordic Chance", Cinzel, serif', family: 'Loom Nordic Runes', file: 'nordic-runes' },
  { label: 'Elven flowing script', value: '"Loom Elven", serif', family: 'Loom Elven', file: 'elven-script' },
  { label: 'Ring inscription', value: '"Loom Ring Script", serif', family: 'Loom Ring Script', file: 'ring-script' },
  { label: 'Medieval', value: '"Loom Medieval", serif', family: 'Loom Medieval', file: 'medievalsharp' },
  { label: 'Gothic', value: '"Loom Gothic", serif', family: 'Loom Gothic', file: 'pirataone' },
  { label: 'Celtic uncial', value: '"Loom Uncial", serif', family: 'Loom Uncial', file: 'uncialantiqua' },
];
export function diceFontFamily(value: string): string {
  const font = DICE_FONTS.find(f => f.value === value || value.includes(f.family))
    ?? (value.includes('Nordic') ? DICE_FONTS[1] : value.includes('Cinzel') ? DICE_FONTS[0] : undefined);
  return font ? `"${font.family}", serif` : value;
}
let pending: Promise<void> | undefined;
export function loadDiceFonts(): Promise<void> {
  if (typeof FontFace === 'undefined') return Promise.resolve();
  return pending ??= Promise.all(DICE_FONTS.map(async font => {
    const face = new FontFace(font.family, `url(/dice-fonts/${font.file}.woff2)`);
    document.fonts.add(await face.load());
  })).then(() => undefined).catch(error => { pending = undefined; console.warn('Dice fonts could not load', error); });
}
