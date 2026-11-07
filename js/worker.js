/* worker.js — background thread for the "What-if" tab: sensitivities and design-space maps */
importScripts('engine.js');
self.onmessage = (e) => {
  const j = e.data;
  if (j.type === 'sens') {
    self.postMessage({ type: 'sens', id: j.id, sens: self.Engine.sensitivity(j.p) });
    return;
  }
  const r = self.Engine.designMap(j.p, j.nx, j.ny, j.Nlo, j.Nhi, j.nlo, j.nhi);
  r.id = j.id;
  self.postMessage(r, [r.mrim.buffer, r.pinMax.buffer]);
};
