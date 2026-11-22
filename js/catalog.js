// Furniture catalogue. Sizes are real-world metres (w = width, d = depth, h = height); prices are rough HK$ guides.
//
// layer:   floor (default) | rug | wall | ceil | top (sits on whatever surface is under it)
// slot:    which palette colour the piece takes by default (and which one a recolour replaces)
// front:   metres of clear floor needed in front of the piece so it can be used
// surface: other small things can stand on it
// tuck:    may slide under tables (chairs);  table: chairs may slide under it

export const CATEGORIES = ['seating', 'tables', 'beds', 'storage', 'lighting', 'decor', 'kitchen'];

export const CATALOG = {
  // seating
  sofa2:    { cat: 'seating', w: 1.6, d: 0.85, h: 0.8, price: 4500, slot: 'fabric', front: 0.35, kind: 'sofa', seat: true },
  sofa3:    { cat: 'seating', w: 2.1, d: 0.9, h: 0.8, price: 6500, slot: 'fabric', front: 0.35, kind: 'sofa', seat: true },
  sofaL:    { cat: 'seating', w: 2.5, d: 1.6, h: 0.8, price: 9800, slot: 'fabric', kind: 'sofaL', seat: true,
              rects: [[0, -0.35, 2.5, 0.9], [-0.8, 0, 0.9, 1.6]] },
  armchair: { cat: 'seating', w: 0.8, d: 0.8, h: 0.8, price: 2200, slot: 'accent', front: 0.3, kind: 'sofa', seat: true },
  pouf:     { cat: 'seating', w: 0.5, d: 0.5, h: 0.4, price: 600, slot: 'accent', round: true, kind: 'round' },
  chair:    { cat: 'seating', w: 0.45, d: 0.5, h: 0.85, price: 500, slot: 'wood', kind: 'chair', tuck: true },
  officeChair: { cat: 'seating', w: 0.6, d: 0.6, h: 1.0, price: 1200, slot: 'fabric', kind: 'chair', tuck: true },

  // tables
  coffee:      { cat: 'tables', w: 1.0, d: 0.55, h: 0.4, price: 1200, slot: 'wood', kind: 'table', surface: true },
  coffeeRound: { cat: 'tables', w: 0.75, d: 0.75, h: 0.4, price: 1000, slot: 'wood', kind: 'round', round: true, surface: true },
  sideTable:   { cat: 'tables', w: 0.45, d: 0.45, h: 0.5, price: 500, slot: 'wood', kind: 'round', round: true, surface: true },
  dining4:     { cat: 'tables', w: 1.2, d: 0.75, h: 0.75, price: 2800, slot: 'wood', kind: 'table', surface: true, table: true, dining: true },
  dining6:     { cat: 'tables', w: 1.6, d: 0.9, h: 0.75, price: 4200, slot: 'wood', kind: 'table', surface: true, table: true, dining: true },
  diningRound: { cat: 'tables', w: 1.0, d: 1.0, h: 0.75, price: 2600, slot: 'wood', kind: 'round', round: true, surface: true, table: true, dining: true },
  desk:        { cat: 'tables', w: 1.2, d: 0.6, h: 0.75, price: 1800, slot: 'wood', kind: 'table', surface: true, table: true, front: 0.6, deskLike: true },
  tv:          { cat: 'tables', w: 1.5, d: 0.4, h: 1.25, price: 5500, slot: 'wood', kind: 'tv', front: 0.4, back: true },

  // beds
  bedSingle: { cat: 'beds', w: 0.95, d: 2.0, h: 0.95, price: 2800, slot: 'fabric', kind: 'bed', bed: true, back: true },
  bedDouble: { cat: 'beds', w: 1.4, d: 2.0, h: 0.95, price: 4200, slot: 'fabric', kind: 'bed', bed: true, back: true },
  bedQueen:  { cat: 'beds', w: 1.55, d: 2.05, h: 0.95, price: 5200, slot: 'fabric', kind: 'bed', bed: true, back: true },
  bedside:   { cat: 'beds', w: 0.45, d: 0.4, h: 0.5, price: 600, slot: 'wood', kind: 'box', surface: true },

  // storage
  wardrobe:  { cat: 'storage', w: 1.2, d: 0.6, h: 2.0, price: 4500, slot: 'wood', kind: 'box', front: 0.6, tall: true, back: true },
  wardrobeL: { cat: 'storage', w: 1.8, d: 0.6, h: 2.1, price: 6500, slot: 'wood', kind: 'box', front: 0.6, tall: true, back: true },
  bookshelf: { cat: 'storage', w: 0.8, d: 0.3, h: 1.8, price: 1500, slot: 'wood', kind: 'box', front: 0.4, tall: true, back: true },
  cabinet:   { cat: 'storage', w: 1.2, d: 0.4, h: 0.8, price: 2500, slot: 'wood', kind: 'box', front: 0.4, surface: true, back: true },
  drawers:   { cat: 'storage', w: 0.8, d: 0.45, h: 0.9, price: 1800, slot: 'wood', kind: 'box', front: 0.5, surface: true, back: true },
  shoeCab:   { cat: 'storage', w: 0.8, d: 0.3, h: 1.0, price: 900, slot: 'wood', kind: 'box', front: 0.4, surface: true, back: true },

  // lighting
  floorLamp: { cat: 'lighting', w: 0.35, d: 0.35, h: 1.6, price: 700, slot: 'metal', kind: 'lamp', round: true, light: 1.45, corner: true },
  tableLamp: { cat: 'lighting', w: 0.26, d: 0.26, h: 0.45, price: 350, slot: 'metal', kind: 'lamp', round: true, layer: 'top', light: 0.35 },
  pendant:   { cat: 'lighting', w: 0.45, d: 0.45, h: 0.3, price: 800, slot: 'metal', kind: 'lamp', round: true, layer: 'ceil', light: 1.75 },

  // decor
  rugS:     { cat: 'decor', w: 1.6, d: 1.1, h: 0.012, price: 900, slot: 'rug', kind: 'rug', layer: 'rug' },
  rugL:     { cat: 'decor', w: 2.4, d: 1.7, h: 0.012, price: 1800, slot: 'rug', kind: 'rug', layer: 'rug' },
  rugRound: { cat: 'decor', w: 1.5, d: 1.5, h: 0.012, price: 1100, slot: 'rug', kind: 'rug', layer: 'rug', round: true },
  plantL:   { cat: 'decor', w: 0.5, d: 0.5, h: 1.5, price: 400, slot: 'pot', kind: 'plant', round: true, plant: true, corner: true },
  plantS:   { cat: 'decor', w: 0.2, d: 0.2, h: 0.32, price: 120, slot: 'pot', kind: 'plant', round: true, layer: 'top', plant: true },
  art:      { cat: 'decor', w: 0.8, d: 0.04, h: 0.6, price: 500, slot: 'accent', kind: 'wall', layer: 'wall', y: 1.15 },
  mirror:   { cat: 'decor', w: 0.5, d: 0.04, h: 1.5, price: 600, slot: 'metal', kind: 'wall', layer: 'wall', y: 0.3 },
  wallShelf:{ cat: 'decor', w: 0.8, d: 0.2, h: 0.3, price: 350, slot: 'wood', kind: 'wall', layer: 'wall', y: 1.35 },

  // kitchen
  kitchen: { cat: 'kitchen', w: 1.8, d: 0.6, h: 2.1, price: 9000, slot: 'white', kind: 'box', front: 0.9, back: true },
  fridge:  { cat: 'kitchen', w: 0.6, d: 0.65, h: 1.7, price: 4500, slot: 'white', kind: 'box', front: 0.6, tall: true, back: true },
};

export const ITEM_IDS = Object.keys(CATALOG);
export const layerOf = def => def.layer || 'floor';
export const isFloor = def => layerOf(def) === 'floor';

// Two floor pieces may share space only when a chair tucks under a table.
export function canShare(a, b) {
  return (a.tuck && b.table) || (b.tuck && a.table);
}

export const ROOM_TYPES = {
  living:  { sizes: [[3.2, 3.0], [4.2, 3.4], [5.4, 4.0]] },
  bedroom: { sizes: [[2.6, 2.4], [3.4, 3.0], [4.2, 3.6]] },
  dining:  { sizes: [[2.8, 2.6], [3.4, 3.2], [4.4, 3.6]] },
  office:  { sizes: [[2.4, 2.2], [3.0, 2.8], [3.8, 3.2]] },
  studio:  { sizes: [[4.6, 3.4], [5.6, 4.0], [6.6, 4.6]] },
};
export const ROOM_TYPE_IDS = Object.keys(ROOM_TYPES);

export const SQFT = 10.7639;
