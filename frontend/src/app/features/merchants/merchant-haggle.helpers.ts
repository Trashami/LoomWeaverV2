export interface HaggleTargetOption {
  label: string;
  percent: number;
  dc: number;
}

export const TARGET_HAGGLE_OPTIONS: readonly HaggleTargetOption[] = [
  { label: '5% Discretionary Discount', percent: 5, dc: 10 },
  { label: '10% Fair Bargain', percent: 10, dc: 13 },
  { label: '15% Skilled Haggler', percent: 15, dc: 15 },
  { label: '20% Aggressive Barter', percent: 20, dc: 18 },
  { label: '25% Formidable Pressure', percent: 25, dc: 21 },
  { label: '35% Audacious Swindle', percent: 35, dc: 25 },
];

export interface HaggleOutcomeEvent {
  type: 'success' | 'failure';
  title: string;
  desc: string;
  priceHikePercent?: number;
  standingDelta?: number;
}

export const HAGGLE_SUCCESS_EVENTS = (discountPercent: number): readonly HaggleOutcomeEvent[] => [
  {
    type: 'success',
    title: 'Deal Struck!',
    desc: `The merchant grins and claps hands: "Fair enough, you've got a sharp tongue! ${discountPercent}% off for this entire visit."`,
  },
  {
    type: 'success',
    title: 'Honored Patron (Standing +1)',
    desc: `The merchant beams with respect: "It is rare to meet adventurers of such culture." Discount granted and your reputation rises!`,
    standingDelta: 1,
  },
  {
    type: 'success',
    title: "Baker's Dozen (Bonus Draught)",
    desc: `"Take your discount, and take this complimentary healing tonic on the house for safe travels!"`,
  },
  {
    type: 'success',
    title: 'Clandestine Rumor Shared',
    desc: `The shopkeeper leans in: "Between us... the patrols found strange tracks outside the old watchtower last eve." Discount granted + Rumor gained!`,
  },
];

export const HAGGLE_FAILURE_EVENTS: readonly HaggleOutcomeEvent[] = [
  {
    type: 'failure',
    title: 'Insulted Shopkeeper (15% Price Hike)',
    desc: `"Do you take me for a pauper? For that brazen insult, everything just went up 15%!" Prices increased for this visit.`,
    priceHikePercent: 15,
  },
  {
    type: 'failure',
    title: 'Cold Shoulder (No Further Haggling)',
    desc: `"Not another copper off. Take the marked price or step away from my counter." Haggling locked for this visit.`,
  },
  {
    type: 'failure',
    title: 'Suspicious Glare (Standing -1)',
    desc: `The merchant grips a hidden baton behind the counter. Standing drops and future negotiations will be harder!`,
    standingDelta: -1,
  },
  {
    type: 'failure',
    title: 'Outrageous Counter-Offer',
    desc: `"You want that price? Sure—bring me three basilisk scales from the marsh, or pay an extra 10 gp tariff!"`,
  },
];

export function pickRandomHaggleSuccess(percent: number): HaggleOutcomeEvent {
  const list = HAGGLE_SUCCESS_EVENTS(percent);
  return list[Math.floor(Math.random() * list.length)];
}

export function pickRandomHaggleFailure(): HaggleOutcomeEvent {
  return HAGGLE_FAILURE_EVENTS[Math.floor(Math.random() * HAGGLE_FAILURE_EVENTS.length)];
}

export const MERCHANT_TYPES_CATALOG: readonly string[] = [
  'Blacksmith & Armory',
  'Alchemist & Apothecary',
  'Arcane & Wandmaker',
  'General Goods & Provisions',
  'Jeweler & Gemcutter',
  'Curios & Antiquities',
  'Tavern & Brewer',
  'Fletcher & Bowyer',
  'Tailor & Weaver',
  'Wandering Exotic Trader',
];
