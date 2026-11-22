# 築夢家 Dream Home Studio

A real-time interior design web app for people with no design knowledge. You pick a room, its size and a style; the app lays out a sensible starting room in 3D, and a built-in design coach explains in plain words what could be better and why. Everything updates live as you drag furniture around.

介面支援繁體中文及英文。Interface in Traditional Chinese and English.

## What a beginner can do

- **Start from a ready layout.** A three-step wizard (room type → size → style) creates a furnished room. Five room types: living room, bedroom, dining room, home office, studio flat.
- **Edit live in 3D or on a floor plan.** Drag furniture in either view; both update together. Switch between dollhouse, top-down and walk-in (eye-level) cameras.
- **Learn while designing.** The design coach checks the room on every change and gives a 0–100 score. It teaches real rules of thumb:
  - walkways at least 55 cm wide, a clear 90 cm inside the door (checked with a path search from the door)
  - room in front of wardrobes, drawers and desks to open them
  - sofa-to-TV distance (2–3.5 m for a 55" TV), sofa-to-coffee-table gap (35–45 cm)
  - bed head against a wall with space on both sides, chairs that can pull out from the dining table
  - no more than about half the floor covered, tall furniture kept off windows
  - layered lighting, the 60-30-10 colour rule, rugs that anchor furniture
  Many tips come with an "add one for me" button.
- **Change the whole look in one tap.** Eight style palettes (Japandi, Scandinavian, Cream, Modern minimal, Industrial, Mid-century, Boho, Modern luxe) recolour walls, floor and every piece so everything matches. Individual pieces can be recoloured from the same palette.
- **See it at any time of day.** A time slider moves the sun; at night the lamps you placed light the room.
- **Know the cost.** A shopping list with rough Hong Kong prices and a whole-home total.
- **Keep and share.** Designs save automatically in the browser. A share link or code opens the same design on another device. Take a photo of the 3D view.

## Running it

It is a static site with no build step. Serve the folder with any web server and open `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening the file directly with `file://` does not work because browsers block ES modules there.)

To publish it, any static host works, for example GitHub Pages pointed at this branch's root.

### Single-file build (optional)

`tools/build-single.mjs` bundles everything, three.js included, into one self-contained `dist/dream-home.html`:

```sh
npm install --no-save esbuild
node tools/build-single.mjs
```

## Code map

| File | What it does |
| --- | --- |
| `js/catalog.js` | Furniture catalogue: real sizes in metres, prices, clearance needs |
| `js/styles.js` | Style palettes, floor finishes, colour helpers |
| `js/geo.js` | Oriented-box geometry: overlap tests, clearance zones, walls |
| `js/layout.js` | Placement rules, snapping, free-spot search and the auto-layout for each room type |
| `js/coach.js` | The design coach: every check, the walkway flood-fill, the score and the budget |
| `js/models.js` | Procedural low-poly 3D furniture |
| `js/scene3d.js` | three.js scene: room shell, lighting by time of day, cameras, drag-to-move |
| `js/plan2d.js` | Canvas floor plan editor with dimensions, door swings and walking-space overlay |
| `js/i18n.js` | All interface text in Traditional Chinese and English |
| `js/main.js` | App state, undo/redo, panels, wizard, sharing |
| `vendor/` | three.js r170 (MIT licence) |

Keyboard: `R` rotate, `D` duplicate, `Delete` remove, arrow keys nudge (Shift for bigger steps), `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo.
