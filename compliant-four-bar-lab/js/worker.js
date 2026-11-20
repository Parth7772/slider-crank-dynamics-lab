/* worker.js — background thread for the "What-if" tab: sensitivities and flexure design maps */
importScripts('engine.js');
self.onmessage = (e) => {
  const j = e.data;
  if (j.type === 'sens') {
    self.postMessage({ type: 'sens', id: j.id, sens: self.Engine.sensitivity(j.p) });
    return;
  }
  const r = self.Engine.designMap(j.p, j.nx, j.ny, j.tlo, j.thi, j.llo, j.lhi);
  r.id = j.id;
  self.postMessage(r, [r.fn.buffer, r.nf.buffer]);
};
