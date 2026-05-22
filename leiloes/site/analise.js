// Controller da página de análise.
//
// Filosofia (definida pelo usuário):
// - Tudo é editável a qualquer momento — não é wizard linear
// - Abas livres EXCETO Entrada quando ainda não há imóvel criado
// - Cada aba tem botão "Salvar" próprio (PATCH na API)
// - Pré-preenchimento vem das extrações (regex + Claude); usuário ajusta
//
// Estado em memória: state.imovel é a fonte da verdade. PATCH sobe diff.

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { imovel: null };

  const ABAS = ['entrada', 'edital', 'matricula', 'processos', 'viabilidade', 'arrematacao'];

  // ---------- Navegação por abas ----------

  function setAbasHabilitadas(habilitar) {
    document.querySelectorAll('.aba-tab').forEach(tab => {
      if (tab.dataset.tab === 'entrada') return; // entrada sempre habilitada
      tab.disabled = !habilitar;
    });
  }

  function irPara(nomeAba) {
    document.querySelectorAll('.aba-tab').forEach(tab => {
      const ativo = tab.dataset.tab === nomeAba;
      tab.classList.toggle('ativo', ativo);
      tab.setAttribute('aria-selected', ativo ? 'true' : 'false');
    });
    document.querySelectorAll('.aba-conteudo').forEach(sec => {
      sec.hidden = sec.dataset.tabContent !== nomeAba;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.aba-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.disabled) return;
      irPara(tab.dataset.tab);
    });
  });

  // ---------- Renderiza cada aba a partir do schema + estado do imóvel ----------

  function renderTodasAbas() {
    ABAS.forEach(aba => {
      if (aba === 'entrada') return;
      const container = document.querySelector(`[data-checklist="${aba}"]`);
      if (!container) return;
      container.innerHTML = window.AnaliseRender.renderAba(aba, state.imovel);
      window.AnaliseRender.aplicarCondicionais(aba);
    });
  }

  // Cada mudança em radio dispara reavaliação de condicionais
  document.addEventListener('change', (e) => {
    if (e.target.matches('input[type="radio"]')) {
      const containerAba = e.target.closest('[data-checklist]');
      if (containerAba) {
        window.AnaliseRender.aplicarCondicionais(containerAba.dataset.checklist);
      }
      // Reset do indicador "salvo"
      const abaSec = e.target.closest('[data-tab-content]');
      if (abaSec) {
        const statusEl = document.querySelector(`[data-status-salvo="${abaSec.dataset.tabContent}"]`);
        if (statusEl) statusEl.hidden = true;
      }
    }
  });

  // ---------- Salvar uma aba (PATCH no JSON do imóvel) ----------

  async function salvarAba(nomeAba) {
    if (!state.imovel) {
      alert('Salve o imóvel primeiro (aba Entrada).');
      return;
    }
    const dadosAba = window.AnaliseRender.coletarAba(nomeAba);

    // Merge: state.imovel.checklist[aba] = dadosAba
    const checklistAtual = state.imovel.checklist || {};
    checklistAtual[nomeAba] = dadosAba;

    const patch = { checklist: checklistAtual };

    const btn = document.querySelector(`.btn-salvar-aba[data-aba="${nomeAba}"]`);
    const statusEl = document.querySelector(`[data-status-salvo="${nomeAba}"]`);
    btn.disabled = true;
    btn.textContent = 'Salvando…';

    try {
      const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(state.imovel.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      state.imovel = await resp.json();
      if (statusEl) {
        statusEl.hidden = false;
        setTimeout(() => { statusEl.hidden = true; }, 2500);
      }
    } catch (e) {
      alert('Falhou ao salvar: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar alterações';
    }
  }

  document.querySelectorAll('.btn-salvar-aba').forEach(btn => {
    btn.addEventListener('click', () => salvarAba(btn.dataset.aba));
  });

  // -- Botão re-analisar (re-roda pipeline com PDFs salvos) --
  const btnReanalisar = $('btn-reanalisar');
  if (btnReanalisar) {
    btnReanalisar.addEventListener('click', async () => {
      if (!state.imovel) return;
      if (!confirm('Re-analisar usando os PDFs já salvos? Isso atualiza a extração mas preserva o que você editou nas abas.')) return;

      const status = $('reanalisar-status');
      btnReanalisar.disabled = true;
      btnReanalisar.textContent = '⏳ Re-analisando…';
      status.hidden = true;
      try {
        const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(state.imovel.id)}/reanalisar`, {
          method: 'POST',
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.erro || `HTTP ${resp.status}`);
        state.imovel = data;
        aoCarregarImovel(true);
        status.textContent = '✅ Reanalisado';
        status.hidden = false;
        setTimeout(() => { status.hidden = true; }, 4000);
      } catch (e) {
        alert('Falhou: ' + e.message);
      } finally {
        btnReanalisar.disabled = false;
        btnReanalisar.textContent = '🔄 Re-analisar com pipeline atual';
      }
    });
  }

  // ---------- Carrega imóvel existente (?id=...) ----------

  async function carregarSeId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(id)}`);
    if (!resp.ok) {
      $('erro-analise').textContent = 'Imóvel não encontrado.';
      $('erro-analise').hidden = false;
      return;
    }
    state.imovel = await resp.json();
    aoCarregarImovel(true);
  }

  function avisosDeErroExtracao() {
    const ed = state.imovel?.edital || {};
    const mt = state.imovel?.matricula || {};
    const itens = [];
    if (ed.erro) itens.push(`<li><strong>Edital:</strong> ${ed.erro} <em>(caiu em regex puro — campos incompletos)</em></li>`);
    if (mt.erro) itens.push(`<li><strong>Matrícula:</strong> ${mt.erro} <em>(caiu em regex puro — campos incompletos)</em></li>`);
    if (ed.fonte_pdf === 'pdf_digital_curto' && ed.aviso) itens.push(`<li><strong>Edital PDF:</strong> ${ed.aviso}</li>`);
    if (mt.fonte_pdf === 'pdf_digital_curto' && mt.aviso) itens.push(`<li><strong>Matrícula PDF:</strong> ${mt.aviso}</li>`);

    const wrap = document.getElementById('avisos-pipeline');
    if (!wrap) return;
    if (!itens.length) { wrap.hidden = true; return; }
    wrap.innerHTML = `
      <h3>⚠️ Atenção: o pipeline teve problemas</h3>
      <ul>${itens.join('')}</ul>
      <p class="dica">Você pode preencher os campos manualmente nas abas — eles estão editáveis. Os PDFs ficaram salvos pra você revisar.</p>
    `;
    wrap.hidden = false;
  }

  function aoCarregarImovel(jaExistia) {
    setAbasHabilitadas(true);
    atualizarTitulo();
    atualizarAnexos();
    atualizarValidacoes();
    avisosDeErroExtracao();
    renderTodasAbas();
    if (jaExistia) {
      const b = $('cache-banner');
      b.innerHTML = `📦 Imóvel já analisado em ${new Date(state.imovel.atualizado_em).toLocaleString('pt-BR')} — retomando do estado salvo.`;
      b.hidden = false;
      irPara('edital');
    } else {
      irPara('edital');
    }
  }

  function atualizarTitulo() {
    const t = $('titulo-imovel');
    const end = state.imovel?.edital?.extraido?.endereco
              || state.imovel?.matricula?.extraido?.endereco_completo
              || state.imovel?.id;
    if (end) t.textContent = end;
  }

  function badgeValidacao(valor) {
    if (valor === true) return '<span class="val-badge val-ok">✅ OK</span>';
    if (valor === false) return '<span class="val-badge val-fail">❌ Falha</span>';
    return '<span class="val-badge val-pendente">⏳ Sem info</span>';
  }

  function atualizarValidacoes() {
    const v = state.imovel?.validacoes_entrada;
    const wrap = $('validacoes-entrada');
    const lista = $('lista-validacoes');
    if (!v) { wrap.hidden = true; return; }

    const linhas = [
      {
        ok: v.eh_edital,
        label: 'Arquivo do edital parece ser um edital',
        hint: 'Procuramos por "edital", "leilão", "leiloeiro", "lance mínimo", "arrematação" no texto.',
      },
      {
        ok: v.eh_matricula,
        label: 'Arquivo da matrícula parece ser uma matrícula',
        hint: 'Procuramos por "matrícula", "registro de imóveis", "averbação", "R-N", "Av-N" no texto.',
      },
      {
        ok: v.tem_link ? true : null,
        label: 'Link do anúncio do leiloeiro informado',
        hint: 'Recomendado pra você poder voltar ao anúncio original. Edita na parte de cima e salva via outra aba.',
      },
      {
        ok: v.mesmo_imovel,
        label: 'Edital e matrícula se referem ao mesmo imóvel',
        hint: v.detalhe_mesmo_imovel || 'Comparamos CEP — se falhar, comparamos rua + número.',
      },
    ];

    lista.innerHTML = linhas.map(l => `
      <li>
        ${badgeValidacao(l.ok)}
        <span class="val-label">${l.label}</span>
        <span class="val-hint" title="${l.hint}">ℹ️</span>
      </li>
    `).join('');
    wrap.hidden = false;
  }

  function atualizarAnexos() {
    if (!state.imovel) return;
    $('entrada-pdfs').hidden = false;

    const editalUrl = state.imovel?.edital?.pdf_url;
    const linkEdital = $('link-pdf-edital');
    if (editalUrl) {
      linkEdital.href = window.API_BASE + editalUrl;
      linkEdital.hidden = false;
    }

    const matriculaUrl = state.imovel?.matricula?.pdf_url;
    const linkMatricula = $('link-pdf-matricula');
    if (matriculaUrl) {
      linkMatricula.href = window.API_BASE + matriculaUrl;
      linkMatricula.hidden = false;
    }

    const link = state.imovel?.link;
    const linkAnuncio = $('link-anuncio-salvo');
    if (link) {
      linkAnuncio.href = link;
      linkAnuncio.hidden = false;
    }

    // Pré-preenche o campo de link na Entrada também
    if (link) $('link-imovel').value = link;
  }

  // ---------- Submit da Entrada (cria imóvel novo) ----------

  $('btn-analisar').addEventListener('click', async () => {
    const arqEdital = $('arq-edital').files[0];
    const arqMatricula = $('arq-matricula').files[0];
    if (!arqEdital && !arqMatricula) {
      $('erro-analise').textContent = 'Anexe pelo menos o edital ou a matrícula em PDF.';
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
      aoCarregarImovel(data.cache_hit);
    } catch (e) {
      $('erro-analise').textContent = 'Falhou: ' + e.message;
      $('erro-analise').hidden = false;
    } finally {
      $('loading').hidden = true;
      $('btn-analisar').disabled = false;
    }
  });

  // ---------- Calcular viabilidade ----------

  $('btn-calcular').addEventListener('click', async () => {
    if (!state.imovel) {
      alert('Carregue um imóvel primeiro.');
      return;
    }
    const dados = window.AnaliseRender.coletarAba('viabilidade');
    const valorVenda = dados.valor_mercado?.valor;
    const lance = dados.lance_pretendido?.valor;
    if (!valorVenda || !lance) {
      alert('Preencha valor de mercado e lance pretendido na aba Viabilidade.');
      return;
    }

    const entradas = {
      valor_arrematacao: lance,
      valor_venda: valorVenda,
      comissao_leiloeiro_perc: Number($('comissao-leiloeiro').value),
      itbi_perc: Number($('itbi').value),
      registro: Number($('registro').value),
      advogado: Number($('advogado').value),
      reforma: Number($('reforma').value),
      outros: Number($('outros').value),
      prazo_venda_meses: Number($('prazo').value),
      iptu_mensal: dados.iptu_mensal?.valor || 0,
      condominio_mensal: dados.condominio_mensal?.valor || 0,
    };

    const resp = await fetch(`${window.API_BASE}/api/calcular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entradas),
    });
    const viab = await resp.json();

    const ok = viab.resultado === 'passa';
    $('resultado-viab').innerHTML = `
      <div class="resultado-box ${ok ? 'ok' : 'fail'}">
        <p class="resultado-titulo">${ok ? '✅ Viabilidade passa em 30%' : '❌ Não fecha em 30%'}</p>
        <table class="resultado-tabela">
          <tr><th>Lucro líquido</th><td>${fmtPerc(viab.lucro_perc)} (${fmtBRL(viab.lucro_rs)})</td></tr>
          <tr><th>Lucro mensal</th><td>${fmtPerc(viab.lucro_mensal_perc)}</td></tr>
          <tr><th>Lance máximo p/ 30%</th><td>${fmtBRL(viab.lance_maximo)}</td></tr>
          <tr><th>Custo total</th><td>${fmtBRL(viab.total_custo)}</td></tr>
          <tr><th>Venda líquida</th><td>${fmtBRL(viab.valor_real_venda)}</td></tr>
        </table>
      </div>`;
  });

  function fmtBRL(v) {
    if (v == null || v === '') return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  function fmtPerc(v) {
    if (v == null || v === '') return '—';
    return Number(v).toFixed(2).replace('.', ',') + '%';
  }

  // ---------- Init ----------
  carregarSeId();
})();
