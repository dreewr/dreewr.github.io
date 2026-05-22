// Centraliza a URL do backend.
//
// Funciona em três modos:
//
// 1) Servido pelo backend Flask local (mesma origem): URL vazia → chamadas
//    relativas tipo /api/imoveis.
//
// 2) Servido pelo GitHub Pages estático (origem cross-domain): a URL precisa
//    apontar pro servidor que está rodando na máquina do André. Em rede
//    wifi local: http://192.168.X.Y:9000. Pela internet: URL do túnel
//    (cloudflared, ngrok). O valor fica salvo em localStorage.
//
// 3) Override por querystring ?backend=http://... — pra trocar rápido sem
//    abrir o painel de config.

(() => {
  const KEY = 'leiloes:backend_url';

  function fromQuery() {
    const p = new URLSearchParams(window.location.search);
    return p.get('backend') || '';
  }

  function get() {
    const fromQs = fromQuery();
    if (fromQs) {
      localStorage.setItem(KEY, fromQs);
      return fromQs;
    }
    const salvo = localStorage.getItem(KEY) || '';
    if (salvo) return salvo;
    // Se estamos rodando localhost, presume mesma origem
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return '';
    }
    return '';  // GH Pages sem config → vai falhar até usuário configurar
  }

  function set(url) {
    if (!url) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, url.replace(/\/$/, ''));
    }
  }

  function url(path) {
    const base = get();
    if (!base) return path;
    return base + path;
  }

  async function fetchAPI(path, opts) {
    const u = url(path);
    if (!get() && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('Backend não configurado. Clique em "⚙ Configurar backend".');
    }
    return fetch(u, opts);
  }

  window.LeiloesConfig = { get, set, url, fetchAPI };
})();
