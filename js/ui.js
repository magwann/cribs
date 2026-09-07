import { CATALOG } from './catalog.js';

// ---------------------------------------------------------------------------
// UI
// Thin DOM layer. Builds the catalog palette, wires buttons, and exposes small
// setters that main.js calls. Keeps all querySelector noise out of main.js.
// ---------------------------------------------------------------------------

export function createUI(handlers) {
  const $ = (id) => document.getElementById(id);

  const el = {
    title: $('title'),
    start: $('start-btn'),
    hud: $('hud'),
    modePill: $('mode-pill'),
    buildToggle: $('build-toggle'),
    builder: $('builder'),
    buildClose: $('build-close'),
    viewToggle: $('view-toggle'),
    catalog: $('catalog'),
    saveBtn: $('save-btn'),
    saveStatus: $('save-status'),
    objTools: $('obj-tools'),
  };

  // --- build catalog palette ---
  for (const item of CATALOG) {
    const btn = document.createElement('button');
    btn.className = 'cat-item';
    btn.innerHTML = `<span class="swatch" style="background:${item.swatch}"></span>${item.label}`;
    btn.addEventListener('click', () => handlers.onPick(item.id));
    el.catalog.appendChild(btn);
  }

  // --- wire controls ---
  el.start.addEventListener('click', () => { el.title.classList.add('hidden'); handlers.onStart(); });
  el.buildToggle.addEventListener('click', () => handlers.onToggleBuild());
  el.buildClose.addEventListener('click', () => handlers.onToggleBuild());
  el.viewToggle.addEventListener('click', () => handlers.onToggleView());
  el.saveBtn.addEventListener('click', () => handlers.onSave());
  el.objTools.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => handlers.onObjAction(b.dataset.act));
  });

  return {
    setMode(building) {
      el.modePill.textContent = building ? 'BUILD' : 'EXPLORE';
      el.buildToggle.textContent = building ? 'DONE (B)' : 'BUILD (B)';
      el.builder.classList.toggle('hidden', !building);
      if (!building) el.objTools.classList.add('hidden');
    },
    setSelected(has) {
      el.objTools.classList.toggle('hidden', !has);
    },
    setView(topDown) {
      // label shows the view you'll switch TO
      el.viewToggle.textContent = topDown ? '⬔ 3D (V)' : '⬒ TOP (V)';
    },
    showHUD() { el.hud.classList.remove('hidden'); },
    flashSave(text) {
      el.saveStatus.textContent = text;
      setTimeout(() => { el.saveStatus.textContent = ''; }, 2000);
    },
  };
}
