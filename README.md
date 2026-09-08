# CRIBS

A social online game where you build your own low-poly digital home — your
**crib** — and visit other people's. PS2-era chunky-pixel aesthetic, runs
entirely in the browser, no install.

## Status

- ✅ Walkable low-poly room, third-person avatar (WASD + drag to look)
- ✅ Build mode with a top-down layout view (V), place/move/rotate/delete furniture
- ✅ Sit on any chair or sofa (click it; W to stand)
- ✅ Local-first: build & explore with **no account**; saved to localStorage
- ✅ Go online (Google / Apple / email) to publish your crib to Firestore
- ✅ Visit a published crib via `?crib=<id>` (read-only, no account needed)
- ⏳ Next: live rooms — search a friend, request to enter, hang out together + chat

## Controls

| Key / action        | Does                          |
|---------------------|-------------------------------|
| **W A S D**         | Walk                          |
| **drag mouse**      | Orbit camera                  |
| **B**               | Toggle build mode             |
| click catalog item  | Arm it, then click floor to place |
| click an item       | Select it (then drag to move) |
| **V**               | Toggle top-down / 3D build view |
| **R**               | Rotate selected item          |
| **Delete / ⌫**      | Remove selected item          |
| click a seat        | Sit down (in explore mode)    |
| **W** (while sat)   | Stand up                      |
| **Save**            | Persist your crib             |

## Run locally

No build step — it's plain ES modules. Just serve the folder over HTTP
(opening `index.html` via `file://` won't work because of module CORS):

```bash
cd ~/cribs
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

```bash
git add -A && git commit -m "Cribs milestone 1"
git branch -M main
git remote add origin git@github.com:<you>/cribs.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: `main` / root**. Because there's
no build step, the pushed files *are* the site — it goes live as-is.

## Architecture

```
index.html        import map (loads Three.js from CDN) + DOM shell
css/style.css     HUD, title, builder panel
js/
  main.js         bootstraps modules, owns mode state + render loop
  world.js        renderer (PS2 low-res look), room shell, lighting
  player.js       avatar + third-person orbit camera + WASD
  catalog.js      procedural low-poly furniture (no asset files)
  builder.js      placement / select / move / rotate / delete
  storage.js      save format (JSON) — swap localStorage → Firebase later
  ui.js           DOM palette + buttons
```

The save format in `storage.js` is plain JSON `{ items: [{id,x,z,rot}] }` on
purpose: making cribs cloud-hosted is a matter of writing that same shape to
Firestore instead of localStorage, and live presence layers avatars on top.
