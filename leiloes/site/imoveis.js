// Listagem paginada de imóveis em análise.
(() => {
  const STATUS_LABELS = {
    fase1_passou: { label: 'Fase 1 passou', cls: 'badge-ok' },
    fase1_pendente_pesquisa: { label: 'Pendente pesquisa', cls: 'badge-pendente' },
    fase1_falhou_gates: { label: 'Falhou gates', cls: 'badge-fail' },
    descartado: { label: 'Descartado', cls: 'badge-neutro' },
    fase2_pendente: { label: 'Fase 2 em curso', cls: 'badge-pendente' },
    fase2_passou: { label: 'Fase 2 passou', cls: 'badge-ok' },
  };

  const filtroSel = document.getElementById('filtro-status');
  const contagemEl = document.getElementById('contagem');
  const placeholder = document.getElementById('placeholder-lista');
  const tabela = document.getElementById('tabela-imoveis');
  const tbody = document.getElementById('tabela-imoveis-body');
  const paginacao = document.getElementById('paginacao');
  const pagInfo = document.getElementById('pag-info');
  const btnPrev = document.getElementById('pag-prev');
  const btnNext = document.getElementById('pag-next');

  const state = { page: 1, size: 20, status: '', total: 0 };

  function badgeStatus(status) {
    const cfg = STATUS_LABELS[status] || { label: status || '—', cls: 'badge-neutro' };
    return `<span class="badge ${cfg.cls}">${cfg.label}</span>`;
  }

  function fmtBRL(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function fmtPerc(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toFixed(1).replace('.', ',') + '%';
  }

  function fmtData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  async function carregar() {
    placeholder.hidden = false;
    placeholder.textContent = 'Carregando…';
    tabela.hidden = true;
    paginacao.hidden = true;

    const params = new URLSearchParams({ page: state.page, size: state.size });
    if (state.status) params.set('status', state.status);

    let resp;
    try {
      resp = await fetch(`${window.API_BASE}/api/imoveis?${params}`);
    } catch (e) {
      placeholder.textContent = 'Erro ao carregar: ' + e.message;
      return;
    }

    if (!resp.ok) {
      placeholder.textContent = `Erro ${resp.status} ao carregar.`;
      return;
    }
    const data = await resp.json();
    state.total = data.total;
    contagemEl.textContent = `${data.total} imóvel(is)`;

    if (data.items.length === 0) {
      placeholder.innerHTML = state.status
        ? `Nenhum imóvel com status <code>${state.status}</code>.`
        : `Nenhum imóvel ainda. <a href="/analise">Analisar o primeiro</a>.`;
      return;
    }

    tbody.innerHTML = data.items.map(item => {
      const nome = item.endereco || item.id;
      const link = item.link
        ? `<a href="${item.link}" target="_blank" rel="noopener">🔗 anúncio</a>`
        : '—';
      return `
      <tr>
        <td><a href="/analise?id=${encodeURIComponent(item.id)}">${nome}</a></td>
        <td>${link}</td>
        <td>${badgeStatus(item.status)}</td>
        <td>${fmtPerc(item.lucro_perc)}</td>
        <td>${fmtBRL(item.lance_maximo)}</td>
        <td>${fmtData(item.atualizado_em)}</td>
      </tr>`;
    }).join('');

    placeholder.hidden = true;
    tabela.hidden = false;

    const totalPaginas = Math.max(1, Math.ceil(data.total / state.size));
    pagInfo.textContent = `página ${state.page} de ${totalPaginas}`;
    btnPrev.disabled = state.page <= 1;
    btnNext.disabled = state.page >= totalPaginas;
    paginacao.hidden = totalPaginas <= 1;
  }

  filtroSel.addEventListener('change', () => {
    state.status = filtroSel.value;
    state.page = 1;
    carregar();
  });
  btnPrev.addEventListener('click', () => { if (state.page > 1) { state.page--; carregar(); } });
  btnNext.addEventListener('click', () => { state.page++; carregar(); });

  // Exportar CSV — mesma origem do site
  document.getElementById('btn-exportar').addEventListener('click', () => {
    window.open(`${window.API_BASE}/api/exportar-csv`, '_blank');
  });

  carregar();
})();
