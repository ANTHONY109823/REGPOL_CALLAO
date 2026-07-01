/*
  pdf_worker.js — Hilo dedicado a la generación de PDFs (PDFKit es síncrono/CPU-bound
  y bloquearía el event loop principal si corriera ahí). Recibe { id, fn, args },
  ejecuta la función correspondiente de pdf_gen.js y responde { id, ok, buffer|error }.
*/
const { parentPort } = require('worker_threads');
const pdfGen = require('./pdf_gen');

parentPort.on('message', async function(msg) {
  const id = msg && msg.id;
  try {
    const fnRef = pdfGen[msg.fn];
    if (typeof fnRef !== 'function') throw new Error('Función de PDF no disponible: ' + msg.fn);
    const buf = await fnRef.apply(null, msg.args || []);
    parentPort.postMessage({ id: id, ok: true, buffer: buf });
  } catch (e) {
    parentPort.postMessage({ id: id, ok: false, error: (e && e.message) || String(e) });
  }
});
