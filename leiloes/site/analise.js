// Wizard de análise de imóvel: 4 etapas (entrada → gates → estimativas → resultado).
(() => {
  const GATE_LABELS = {
    mercado_alvo: 'Cidade no mercado-alvo (Curitiba + RMC)',
    leiloeiro_ok: 'Leiloeiro com nome + JUCEX',
    comissao_ok: 'Comissão do leiloeiro = 5%',
    prazo_pagamento_ok: 'Prazo de pagamento > 1 dia útil',
    consolidacao: 'Consolidação averbada (extrajudicial)',
    sem_sequestro_criminal: 'Sem sequestro criminal',
    afs_bem_encadeadas: 'AFs sucessivas bem encadeadas',
    cadeia_dominial_ok: 'Cadeia dominial sem lacunas',
  };

  const $ = (id) => document.getElementById(id);
  const passos = document.querySelectorAll('#passos li');
  const etapas = document.querySelectorAll('.etapa');

  // Estado em memória — sincronizado com backend ao salvar
  const state = { imovel: null };

  function irPara(n) {
    passos.forEach(li => li.classList.toggle('ativo', Number(li.dataset.step) === n));
    etapas.forEach(et => et.hidden = Number(et.dataset.step) !== n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderMarkdown(elId, md) {
    const el = $(elId);
    if (!md) { el.innerHTML = '<p class="placeholder">Sem dados.</p>'; return; }
    el.innerHTML = window.marked ? marked.parse(md) : `<pre>${md}</pre>`;
  }

  function gateBadge(valor) {
    if (valor === true) return '<span class="gate gate-ok">✅ OK</span>';
    if (valor === false) return '<span class="gate gate-fail">❌ Falhou</span>';
    return '<span class="gate gate-pending">⏳ Sem info</span>';
  }

  function renderGates(imovel) {
    const todos = { ...(imovel.edital?.gates || {}), ...(imovel.matricula?.gates || {}) };
    const linhas = Object.entries(todos).map(([k, v]) => {
      const label = GATE_LABELS[k] || k;
      return `<div class="gate-linha">${gateBadge(v)} <span>${label}</span></div>`;
    }).join('');
    const algumFalhou = Object.values(todos).some(v => v === false);
    const avisoFalhou = algumFalhou ? '<p class="aviso-falha">⚠️ Um ou mais gates falharam — recomenda-se descartar.</p>' : '';
    $('gates').innerHTML = avisoFalhou + linhas;
    $('btn-para-estimativas').disabled = algumFalhou;
  }

  function fmtBRL(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function fmtPerc(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toFixed(2).replace('.', ',') + '%';
  }

  function renderResultado(viab) {
    const ok = viab.resultado === 'passa';
    $('resultado-viab').innerHTML = `
      <div class="resultado-box ${ok ? 'ok' : 'fail'}">
        <p class="resultado-titulo">${ok ? '✅ Viabilidade passa' : '❌ Não fecha em 30%'}</p>
        <table class="resultado-tabela">
          <tr><th>Lucro líquido</th><td>${fmtPerc(viab.lucro_perc)} (${fmtBRL(viab.lucro_rs)})</td></tr>
          <tr><th>Lucro mensal</th><td>${fmtPerc(viab.lucro_mensal_perc)}</td></tr>
          <tr><th>Lance máximo p/ 30%</th><td>${fmtBRL(viab.lance_maximo)}</td></tr>
          <tr><th>Custo total</th><td>${fmtBRL(viab.total_custo)}</td></tr>
          <tr><th>Venda líquida</th><td>${fmtBRL(viab.valor_real_venda)}</td></tr>
        </table>
      </div>`;
  }

  function renderPendentes(pendentes) {
    if (!pendentes || pendentes.length === 0) {
      $('lista-pendentes').innerHTML = '<li>Nada pendente nos gates iniciais. Próxima fase: deepdive (Fase 2 do guia).</li>';
      return;
    }
    $('lista-pendentes').innerHTML = pendentes.map(p => `<li>${p}</li>`).join('');
  }

  // -- Carregar imóvel existente (?id=...) --
  async function carregarSeId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(id)}`);
    // (carregar imóvel existente da lista)
    if (!resp.ok) {
      $('erro-analise').textContent = 'Imóvel não encontrado.';
      $('erro-analise').hidden = false;
      return;
    }
    state.imovel = await resp.json();
    preencherForms();
    renderMarkdown('md-edital', state.imovel.edital?.markdown);
    renderMarkdown('md-matricula', state.imovel.matricula?.markdown);
    renderGates(state.imovel);
    irPara(2);
  }

  function preencherForms() {
    const i = state.imovel;
    if (!i) return;
    $('link-imovel').value = i.link || '';
    // Arquivos PDF não são pré-preenchidos (browser não permite por segurança)

    const e = i.estimativas || {};
    if (e.valor_mercado) $('valor-mercado').value = e.valor_mercado;
    if (e.iptu_mensal) $('iptu').value = e.iptu_mensal;
    if (e.condominio_mensal) $('condominio').value = e.condominio_mensal;

    const v = i.viabilidade || {};
    if (v.valor_arrematacao) $('valor-arrematacao').value = v.valor_arrematacao;
  }

  // -- Etapa 1 → Análise --
  $('btn-analisar').addEventListener('click', async () => {
    const arqEdital = $('arq-edital').files[0];
    const arqMatricula = $('arq-matricula').files[0];
    if (!arqEdital && !arqMatricula) {
      $('erro-analise').textContent = 'Anexe o edital e/ou a matrícula em PDF.';
      $('erro-analise').hidden = false;
      return;
    }
    $('erro-analise').hidden = true;
    $('loading').hidden = false;
    $('btn-analisar').disabled = true;

    const fd = new FormData();
    if (arqEdital) fd.append('edital', arqEdital);
    if (arqMatricula) fd.append('matricula', arqMatricula);
    const link = $('link-imovel').value.trim();
    if (link) fd.append('link', link);

    try {
      const resp = await fetch(`${window.API_BASE}/api/analisar`, { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || `Erro ${resp.status}`);

      state.imovel = data.imovel;

      if (data.cache_hit) {
        const b = $('cache-banner');
        b.innerHTML = `📦 Imóvel já analisado em ${new Date(data.imovel.atualizado_em).toLocaleString('pt-BR')} — retomando do cache.`;
        b.hidden = false;
      }

      renderMarkdown('md-edital', state.imovel.edital?.markdown);
      renderMarkdown('md-matricula', state.imovel.matricula?.markdown);
      renderGates(state.imovel);
      irPara(2);
    } catch (e) {
      $('erro-analise').textContent = 'Falhou: ' + e.message;
      $('erro-analise').hidden = false;
    } finally {
      $('loading').hidden = true;
      $('btn-analisar').disabled = false;
    }
  });

  // -- Etapa 2 → ações --
  $('btn-descartar').addEventListener('click', async () => {
    if (!state.imovel) return;
    state.imovel.status = 'descartado';
    await salvarImovel();
    window.location.href = '/imoveis';
  });

  $('btn-para-estimativas').addEventListener('click', () => irPara(3));

  // -- Etapa 3 → calcular --
  $('btn-voltar-2').addEventListener('click', () => irPara(2));

  $('btn-calcular').addEventListener('click', async () => {
    const entradas = {
      valor_arrematacao: Number($('valor-arrematacao').value),
      valor_venda: Number($('valor-mercado').value),
      comissao_leiloeiro_perc: Number($('comissao-leiloeiro').value),
      itbi_perc: Number($('itbi').value),
      registro: Number($('registro').value),
      advogado: Number($('advogado').value),
      reforma: Number($('reforma').value),
      outros: Number($('outros').value),
      prazo_venda_meses: Number($('prazo').value),
      iptu_mensal: Number($('iptu').value),
      condominio_mensal: Number($('condominio').value),
    };
    if (!entradas.valor_arrematacao || !entradas.valor_venda) {
      alert('Preencha valor de mercado e valor da arrematação.');
      return;
    }
    const resp = await fetch(`${window.API_BASE}/api/calcular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entradas),
    });
    const viab = await resp.json();

    // Salva no estado
    state.imovel = state.imovel || {};
    state.imovel.estimativas = {
      valor_mercado: entradas.valor_venda,
      iptu_mensal: entradas.iptu_mensal,
      condominio_mensal: entradas.condominio_mensal,
    };
    state.imovel.viabilidade = { ...viab, valor_arrematacao: entradas.valor_arrematacao };

    if (viab.resultado === 'passa') {
      state.imovel.status = 'fase1_passou';
    } else {
      state.imovel.status = 'viabilidade_nao_fecha';
    }

    renderResultado(viab);
    renderPendentes(state.imovel.pendentes);
    irPara(4);
  });

  // -- Etapa 4 → salvar --
  $('btn-voltar-3').addEventListener('click', () => irPara(3));

  $('btn-salvar').addEventListener('click', async () => {
    await salvarImovel();
    window.location.href = '/imoveis';
  });

  async function salvarImovel() {
    if (!state.imovel) return;
    const resp = await fetch(`${window.API_BASE}/api/imoveis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.imovel),
    });
    if (!resp.ok) {
      const erro = await resp.json().catch(() => ({}));
      alert('Erro ao salvar: ' + (erro.erro || resp.status));
      throw new Error('save failed');
    }
    state.imovel = await resp.json();
  }

  carregarSeId();
})();
