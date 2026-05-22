// URL base da API. Detecta o ambiente:
// - localhost / IP local / Tailscale → API na mesma origem (vazio)
// - qualquer outro host (ex: dreewr.github.io) → roteia pro túnel Tailscale Funnel
//   da máquina do André.
//
// Pra mudar o destino do túnel, edita só essa constante.
window.API_BASE = (() => {
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.') || h.startsWith('100.') || h.endsWith('.ts.net');
  return local ? '' : 'https://andrs-laptop.tail292b33.ts.net';
})();
