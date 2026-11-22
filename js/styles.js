// Style presets: each one is a ready-made palette so a beginner never starts from a blank colour wheel.
// fabric = big soft pieces (the "30%"), accents = small pops (the "10%"), walls + floor = the "60%".

export const STYLES = {
  japandi: {
    wall: '#ece6da', floor: 'oak', fabric: '#c9bfab', wood: '#c4a077', metal: '#2e2c29', rug: '#ddd5c5',
    accents: ['#7b8a6c', '#3a3835', '#b7a58a'], white: '#f4f0e8',
    walls: ['#ece6da', '#f3efe7', '#d9d2c2', '#c5c8b8', '#b9ad9b', '#8f9783'],
  },
  scandi: {
    wall: '#f2f3f0', floor: 'birch', fabric: '#b4bec6', wood: '#d9c19c', metal: '#ecebe6', rug: '#dfe4e7',
    accents: ['#e0ad33', '#587889', '#2f3a40'], white: '#fafaf7',
    walls: ['#f2f3f0', '#e4e9ea', '#d3dde0', '#c9d6cb', '#f1e3c4', '#9fb3bd'],
  },
  cream: {
    wall: '#f5eee2', floor: 'birch', fabric: '#ece1cf', wood: '#dcc4a3', metal: '#d2b283', rug: '#efe6d8',
    accents: ['#d39c6d', '#b98a80', '#a8b094'], white: '#fbf7ef',
    walls: ['#f5eee2', '#faf5ec', '#ecdcc6', '#e6cdb4', '#d9c7b8', '#cfd2bf'],
  },
  modern: {
    wall: '#e9e9e7', floor: 'concrete', fabric: '#494e56', wood: '#3a3633', metal: '#b08d57', rug: '#a3a7ab',
    accents: ['#c8502f', '#b08d57', '#1f2226'], white: '#f3f3f1',
    walls: ['#e9e9e7', '#f5f5f3', '#cfd0cf', '#9a9c9d', '#55595e', '#2e3136'],
  },
  industrial: {
    wall: '#bdb7ae', floor: 'walnut', fabric: '#6d4a35', wood: '#7b5437', metal: '#1e1e1e', rug: '#5f5d59',
    accents: ['#c06a2b', '#39484f', '#d8c7a3'], white: '#e4dfd6',
    walls: ['#bdb7ae', '#d6d1c8', '#9c968d', '#8a5a44', '#5b5f61', '#34383a'],
  },
  midcentury: {
    wall: '#f0e9dc', floor: 'walnut', fabric: '#2f6d68', wood: '#8a5936', metal: '#b08d57', rug: '#dac8a8',
    accents: ['#d8872a', '#c4ae45', '#7a2f2a'], white: '#f6f0e4',
    walls: ['#f0e9dc', '#f7f2e8', '#dfd0b4', '#cbb98a', '#8fae9f', '#2f6d68'],
  },
  boho: {
    wall: '#f2e8d6', floor: 'oak', fabric: '#c66d48', wood: '#b88354', metal: '#8a6a45', rug: '#c98b5e',
    accents: ['#3e7b69', '#dfae48', '#7c3f52'], white: '#f8f1e3',
    walls: ['#f2e8d6', '#f8f2e6', '#e7cfae', '#dba98a', '#b9c2a0', '#3e7b69'],
  },
  luxe: {
    wall: '#e6e2db', floor: 'tile', fabric: '#283a59', wood: '#2f2a27', metal: '#c8a149', rug: '#b9b4ad',
    accents: ['#c8a149', '#6a2c3b', '#8b8992'], white: '#f5f2ec',
    walls: ['#e6e2db', '#f3f0ea', '#cfc8bd', '#8b8992', '#283a59', '#24272c'],
  },
};
export const STYLE_IDS = Object.keys(STYLES);

export const FLOORS = {
  birch:    { kind: 'wood', base: '#dcc7a4', dark: '#c9b28c' },
  oak:      { kind: 'wood', base: '#c9a676', dark: '#b28d5d' },
  walnut:   { kind: 'wood', base: '#7c5638', dark: '#644329' },
  greywood: { kind: 'wood', base: '#a8a199', dark: '#928b83' },
  concrete: { kind: 'concrete', base: '#b4b2ae', dark: '#a2a09c' },
  tile:     { kind: 'tile', base: '#e8e5df', dark: '#cfcbc3' },
};
export const FLOOR_IDS = Object.keys(FLOORS);

// --- colour utilities -------------------------------------------------------
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// amt > 0 lightens toward white, amt < 0 darkens toward black.
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt > 0 ? 255 : 0, k = Math.abs(amt);
  return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function hsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

// The working palette for a room: style defaults plus the room's own wall / floor choices.
export function paletteFor(room) {
  const s = STYLES[room.style] || STYLES.japandi;
  return {
    ...s,
    wall: room.wall || s.wall,
    floorId: room.floor || s.floor,
    leaf: '#5d8a55', leafDark: '#3f6b45', pot: s.white, black: '#1b1c1e', screen: '#0f1114',
  };
}

// Colours offered when recolouring a single piece: everything already in the palette, so any pick still matches.
export function swatchesFor(room) {
  const s = STYLES[room.style] || STYLES.japandi;
  const out = [s.fabric, ...s.accents, s.wood, s.white, shade(s.fabric, 0.35), shade(s.wood, -0.3)];
  return [...new Set(out)];
}
