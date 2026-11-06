/* worker.js — computes the design-space maps off the main thread */
importScripts('engine.js');
self.onmessage = (e) => {
  const j = e.data;
  const r = self.Engine.designMap(j.p, j.nx, j.ny, j.Nlo, j.Nhi, j.nlo, j.nhi);
  r.id = j.id;
  self.postMessage(r, [r.mrim.buffer, r.pinMax.buffer]);
};
