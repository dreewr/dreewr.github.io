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
  const state = { imovel: null, avaliacaoInstance: null };

  const ABAS = ['entrada', 'edital', 'matricula', 'avaliacao', 'viabilidade', 'processos', 'arrematacao'];

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
      if (aba === 'entrada' || aba === 'avaliacao') return;
      const container = document.querySelector(`[data-checklist="${aba}"]`);
      if (!container) return;
      container.innerHTML = window.AnaliseRender.renderAba(aba, state.imovel);
      window.AnaliseRender.aplicarCondicionais(aba);
    });
    // Número da matrícula ao lado do título da aba Jurídico
    const numEl = document.getElementById('titulo-matricula-numero');
    if (numEl) {
      const numCampo = state.imovel?.matricula?.extraido?.numero_matricula;
      const num = (numCampo && typeof numCampo === 'object') ? numCampo.valor : numCampo;
      numEl.textContent = num ? ` ${num}` : '';
    }
    montarAvaliacao();
    renderBannerAvaliacao();
  }

  // ---------- Aba Avaliação (módulo embedado) ----------

  function montarAvaliacao() {
    const root = document.getElementById('aval-mount');
    if (!root || !window.Avaliacao) return;
    // Só monta uma vez — re-mount duplicaria listeners globais (paste, keydown).
    // Reanálise muda o JSON do imóvel, mas o estado da avaliação foi gravado
    // pelo usuário; preservamos. Para resetar, use o botão "Limpar" da aba.
    if (state.avaliacaoInstance) return;
    state.avaliacaoInstance = window.Avaliacao.mount(root, {
      initialState: state.imovel?.avaliacao || null,
      onStateChange: (estado) => salvarAvaliacao(estado),
      onCalcular: () => renderBannerAvaliacao(),
    });
  }

  async function salvarAvaliacao(estado) {
    if (!state.imovel) return;
    state.imovel.avaliacao = estado;
    try {
      const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(state.imovel.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avaliacao: estado }),
      });
      if (resp.ok) state.imovel = await resp.json();
    } catch (e) {
      console.warn('Falha ao salvar avaliação:', e);
    }
    renderBannerAvaliacao();
  }

  function renderBannerAvaliacao() {
    const banner = $('banner-avaliacao');
    if (!banner) return;
    const sumario = state.imovel?.avaliacao?.resultado?.sumario;
    if (!sumario || !sumario.vCentral) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    const calc = sumario.calculadoEm ? new Date(sumario.calculadoEm).toLocaleString('pt-BR') : '';
    banner.innerHTML = `
      📊 <strong>Avaliação estimada:</strong>
      <span class="banner-aval-valor">${fmtBRL(sumario.vCentral)}</span>
      <span class="banner-aval-faixa">(80%: ${fmtBRL(sumario.vMin)} — ${fmtBRL(sumario.vMax)} · ${sumario.grauLabel || ''})</span>
      <a href="#" class="banner-aval-link" data-ir-aval>ajustar →</a>
      ${calc ? `<small class="banner-aval-calc"> · ${calc}</small>` : ''}
    `;
    banner.hidden = false;
    banner.querySelector('[data-ir-aval]')?.addEventListener('click', e => {
      e.preventDefault();
      irPara('avaliacao');
    });
  }

  // Toggle de tri-state, binário-novo e radio-novo: clicar de novo em opção
  // marcada limpa a seleção. mousedown roda ANTES do browser marcar o radio —
  // usamos pra detectar a intenção de limpar.
  const SEL_TOGGLE_INPUT = 'input[data-tri-toggle], input[data-bin-toggle], input[data-radio-toggle]';
  const SEL_TOGGLE_GRUPO = '.grupo-tri, .grupo-binario, .grupo-radio-novo';

  document.addEventListener('mousedown', (e) => {
    const inp = e.target.closest(SEL_TOGGLE_INPUT);
    if (!inp) return;
    const grupo = inp.closest(SEL_TOGGLE_GRUPO);
    if (!grupo) return;
    if (inp.checked) {
      grupo.dataset.toggleOff = inp.value;
    } else {
      delete grupo.dataset.toggleOff;
    }
  });

  document.addEventListener('click', (e) => {
    const inp = e.target.closest(SEL_TOGGLE_INPUT);
    if (!inp) return;
    const grupo = inp.closest(SEL_TOGGLE_GRUPO);
    if (!grupo) return;
    if (grupo.dataset.toggleOff === inp.value) {
      delete grupo.dataset.toggleOff;
      inp.checked = false;
      if (grupo.classList.contains('grupo-tri')) {
        grupo.classList.add('is-sem-info');
        const lbl = grupo.querySelector('.tri-sem-info-label');
        if (lbl) lbl.hidden = false;
      }
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Cada mudança em radio/input dispara reavaliação de condicionais + semáforos
  document.addEventListener('change', (e) => {
    if (!e.target.matches('input, select, textarea')) return;

    const containerAba = e.target.closest('[data-checklist]');
    const aba = containerAba?.dataset.checklist;

    if (e.target.matches('input[type="radio"]') && aba) {
      window.AnaliseRender.aplicarCondicionais(aba);
      // Tri legado
      if (e.target.matches('input[data-tri-toggle]')) {
        const grupo = e.target.closest('.grupo-tri');
        if (grupo) {
          const algumMarcado = grupo.querySelector('input[data-tri-toggle]:checked');
          grupo.classList.toggle('is-sem-info', !algumMarcado);
          const lbl = grupo.querySelector('.tri-sem-info-label');
          if (lbl) lbl.hidden = !!algumMarcado;
        }
      }
    }

    // Marca item como editado pelo usuário (formato novo)
    const itemEl = e.target.closest('.item-checklist.item-novo');
    if (itemEl) {
      itemEl.dataset.editado = 'true';
      itemEl.dataset.editadoEm = new Date().toISOString();
      // Atualiza badge de origem in-place
      atualizarBadgeOrigem(itemEl);
    }

    // Recalcula semáforos da aba (formato novo)
    if (aba && window.AnaliseRender.atualizarSemaforos) {
      window.AnaliseRender.atualizarSemaforos(aba);
    }

    // Reset do indicador "salvo"
    const abaSec = e.target.closest('[data-tab-content]');
    if (abaSec) {
      const statusEl = document.querySelector(`[data-status-salvo="${abaSec.dataset.tabContent}"]`);
      if (statusEl) statusEl.hidden = true;
    }
  });

  // Substitui o badge de origem dentro de um item por "✏️ você editou"
  // (ou tira o "🤖 identificado pela IA" se ainda estiver lá).
  function atualizarBadgeOrigem(itemEl) {
    const meta = itemEl.querySelector('.item-meta');
    if (!meta) return;
    const badgeAtual = meta.querySelector('.badge-origem');
    const novo = document.createElement('span');
    novo.className = 'badge-origem badge-origem-usuario';
    novo.title = 'Você editou este valor manualmente.';
    novo.innerHTML = '✏️ você editou';
    if (badgeAtual) badgeAtual.replaceWith(novo);
    else meta.insertBefore(novo, meta.firstChild);
  }

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

  // Escape HTML para evitar XSS em mensagens vindas do backend.
  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Normaliza o `erro` que vem do backend. Hoje pode ser:
  //   - dict { tipo, mensagem, sugestao }    (pipeline novo)
  //   - string                                (caches antigos / código legado)
  //   - falsy                                 (sem erro explícito)
  // Devolve dict normalizado ou null.
  function _normalizarErro(erro) {
    if (!erro) return null;
    if (typeof erro === 'string') {
      return { tipo: 'llm_falha_execucao', mensagem: erro, sugestao: null };
    }
    if (typeof erro === 'object') {
      return {
        tipo: erro.tipo || 'llm_falha_execucao',
        mensagem: erro.mensagem || erro.message || 'Erro desconhecido no pipeline.',
        sugestao: erro.sugestao || null,
      };
    }
    return null;
  }

  // Detecta falha de extração — seja por erro explícito ou pela fonte ter caído
  // em regex_fallback (que significa: LLM não voltou JSON utilizável). Retorna
  // null se está tudo OK, ou um dict { tipo, mensagem, sugestao } pra exibir.
  function _diagnosticarFalha(secao) {
    const erro = _normalizarErro(secao?.erro);
    if (erro) return erro;
    if (secao?.fonte_extracao === 'regex_fallback') {
      return {
        tipo: 'llm_indisponivel',
        mensagem: 'A extração pelo LLM não foi concluída — o pipeline caiu em regex puro.',
        sugestao: 'Re-analise. Se persistir, verifique se o `claude` CLI tem auth (`claude setup-token`) ou se `ANTHROPIC_API_KEY` no `.env` é válida.',
      };
    }
    return null;
  }

  // Monta a lista <li> dos avisos do pipeline (edital + matrícula + PDFs).
  // Retorna { html, temFalhaLlm } — a flag controla a severidade do banner.
  function _montarAvisosPipeline() {
    const ed = state.imovel?.edital || {};
    const mt = state.imovel?.matricula || {};
    const itens = [];
    let temFalhaLlm = false;

    const falhaEd = _diagnosticarFalha(ed);
    if (falhaEd) {
      temFalhaLlm = true;
      const sug = falhaEd.sugestao ? `<div class="erro-sugestao">→ ${_esc(falhaEd.sugestao)}</div>` : '';
      itens.push(
        `<li><strong>Edital:</strong> ${_esc(falhaEd.mensagem)} ` +
        `<span class="erro-tipo">[${_esc(falhaEd.tipo)}]</span>${sug}</li>`
      );
    }
    const falhaMt = _diagnosticarFalha(mt);
    if (falhaMt) {
      temFalhaLlm = true;
      const sug = falhaMt.sugestao ? `<div class="erro-sugestao">→ ${_esc(falhaMt.sugestao)}</div>` : '';
      itens.push(
        `<li><strong>Matrícula:</strong> ${_esc(falhaMt.mensagem)} ` +
        `<span class="erro-tipo">[${_esc(falhaMt.tipo)}]</span>${sug}</li>`
      );
    }
    if (ed.fonte_pdf === 'pdf_digital_curto' && ed.aviso) {
      itens.push(`<li><strong>Edital PDF:</strong> ${_esc(ed.aviso)}</li>`);
    }
    if (mt.fonte_pdf === 'pdf_digital_curto' && mt.aviso) {
      itens.push(`<li><strong>Matrícula PDF:</strong> ${_esc(mt.aviso)}</li>`);
    }
    return { html: itens.join(''), temFalhaLlm, vazio: itens.length === 0 };
  }

  function avisosDeErroExtracao() {
    const { html, temFalhaLlm, vazio } = _montarAvisosPipeline();

    // Banner global (na aba Entrada, mas visível no topo da página).
    const wrap = document.getElementById('avisos-pipeline');
    if (wrap) {
      if (vazio) {
        wrap.hidden = true;
        wrap.classList.remove('avisos-pipeline--erro');
      } else {
        wrap.classList.toggle('avisos-pipeline--erro', temFalhaLlm);
        const titulo = temFalhaLlm
          ? '❌ A extração pelo LLM falhou — os campos abaixo estão vazios POR ISSO, não por problema na leitura do PDF'
          : '⚠️ Atenção: o pipeline teve problemas';
        const explicacao = temFalhaLlm
          ? `<p class="dica">Os PDFs foram salvos OK e estão disponíveis pra revisar. Você pode <strong>re-analisar</strong> (botão acima) depois de resolver o problema do LLM, ou preencher os campos manualmente nas abas — todas são editáveis.</p>`
          : `<p class="dica">Você pode preencher os campos manualmente nas abas — eles estão editáveis. Os PDFs ficaram salvos pra você revisar.</p>`;
        wrap.innerHTML = `<h3>${titulo}</h3><ul>${html}</ul>${explicacao}`;
        wrap.hidden = false;
      }
    }

    // Banner replicado no topo das abas Edital e Matrícula — quando o usuário
    // pula direto pra essas abas e vê os campos vazios, encontra ali a
    // explicação de que o problema foi o LLM (e não a captura do PDF).
    _renderAvisoAba('edital', state.imovel?.edital);
    _renderAvisoAba('matricula', state.imovel?.matricula);
  }

  function _renderAvisoAba(aba, secao) {
    const conteudo = document.querySelector(`[data-tab-content="${aba}"]`);
    if (!conteudo) return;
    let banner = conteudo.querySelector('.aviso-aba-extracao');
    const falha = _diagnosticarFalha(secao);
    if (!falha) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'aviso-aba-extracao';
      // Insere logo após o <h2> da aba pra ficar bem visível no topo.
      const h2 = conteudo.querySelector('h2');
      if (h2 && h2.nextSibling) h2.parentNode.insertBefore(banner, h2.nextSibling);
      else conteudo.prepend(banner);
    }
    const sug = falha.sugestao ? `<div class="erro-sugestao">→ ${_esc(falha.sugestao)}</div>` : '';
    banner.innerHTML =
      `<strong>❌ Extração do ${aba === 'edital' ? 'edital' : 'da matrícula'} pelo LLM falhou.</strong> ` +
      `${_esc(falha.mensagem)} <span class="erro-tipo">[${_esc(falha.tipo)}]</span>` +
      `${sug}` +
      `<div class="erro-aviso-rodape">Os campos abaixo estão vazios porque o LLM não respondeu — <strong>não</strong> porque o PDF está ilegível. Re-analise depois de resolver, ou edite manualmente.</div>`;
  }

  function aoCarregarImovel(jaExistia) {
    setAbasHabilitadas(true);
    atualizarTitulo();
    atualizarAnexos();
    atualizarValidacoes();
    avisosDeErroExtracao();
    renderTodasAbas();
    atualizarLinkCalculadora();
    // Imóvel carregado: esconde uploads e o botão "Analisar" vira "Reanalisar".
    const uploads = $('entrada-uploads');
    if (uploads) uploads.hidden = true;
    $('btn-analisar').textContent = '🔄 Reanalisar com pipeline atual';
    if (jaExistia) {
      const b = $('cache-banner');
      b.innerHTML = `📦 Imóvel já analisado em ${new Date(state.imovel.atualizado_em).toLocaleString('pt-BR')} — retomando do estado salvo.`;
      b.hidden = false;
      irPara('edital');
    } else {
      irPara('edital');
    }
  }

  function atualizarLinkCalculadora() {
    const link = $('link-calc-completa');
    if (!link) return;
    const dadosViab = window.AnaliseRender?.coletarAba?.('viabilidade') || {};
    const valorVenda = dadosViab.valor_mercado?.valor;
    const lance = dadosViab.lance_pretendido?.valor;
    const iptu = dadosViab.iptu_mensal?.valor;
    const cond = dadosViab.condominio_mensal?.valor;
    if (!lance && !valorVenda) {
      link.href = 'calculadora.html';
      return;
    }
    const seed = {
      arrematacao: lance || 0,
      venda: valorVenda || 0,
      iptuMensal: iptu || 0,
      condominioMensal: cond || 0,
    };
    try {
      const s = btoa(unescape(encodeURIComponent(JSON.stringify(seed))));
      link.href = `calculadora.html?s=${s}`;
    } catch (e) {
      link.href = 'calculadora.html';
    }
  }

  function atualizarTitulo() {
    const t = $('titulo-imovel');
    const valorDe = (campo) => (campo && typeof campo === 'object' && 'valor' in campo) ? campo.valor : campo;
    const end = valorDe(state.imovel?.edital?.extraido?.endereco)
              || valorDe(state.imovel?.matricula?.extraido?.endereco_completo)
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

    // <details> clicável em vez de só title (que só aparece em hover lento)
    lista.innerHTML = linhas.map(l => `
      <li>
        <div class="val-linha">
          ${badgeValidacao(l.ok)}
          <span class="val-label">${l.label}</span>
          <details class="val-hint-details">
            <summary aria-label="Ver detalhes">ℹ️</summary>
            <div class="val-hint-conteudo">${l.hint}</div>
          </details>
        </div>
      </li>
    `).join('');
    wrap.hidden = false;
  }

  function atualizarAnexos() {
    if (!state.imovel) return;
    $('entrada-pdfs').hidden = false;

    const editalUrl = state.imovel?.edital?.pdf_url;
    const linkEdital = $('link-pdf-edital');
    const linkEditalAba = $('link-pdf-edital-aba');
    if (editalUrl) {
      const fullUrl = window.API_BASE + editalUrl;
      linkEdital.href = fullUrl;
      linkEdital.hidden = false;
      if (linkEditalAba) { linkEditalAba.href = fullUrl; linkEditalAba.hidden = false; }
    }

    const matriculaUrl = state.imovel?.matricula?.pdf_url;
    const linkMatricula = $('link-pdf-matricula');
    const linkMatriculaAba = $('link-pdf-matricula-aba');
    if (matriculaUrl) {
      const fullUrl = window.API_BASE + matriculaUrl;
      linkMatricula.href = fullUrl;
      linkMatricula.hidden = false;
      if (linkMatriculaAba) { linkMatriculaAba.href = fullUrl; linkMatriculaAba.hidden = false; }
    }

    // Matrícula anotada (highlights da IA). Pode falhar — só mostra se gerou.
    const anotadaUrl = state.imovel?.matricula?.pdf_anotada_url;
    const linkAnotada = $('link-pdf-matricula-anotada');
    const linkAnotadaAba = $('link-pdf-matricula-anotada-aba');
    if (anotadaUrl) {
      const fullUrl = window.API_BASE + anotadaUrl;
      const stats = state.imovel?.matricula?.anotacoes_stats || {};
      const tooltipStats = stats.anotacoes_ok != null
        ? `${stats.anotacoes_ok} campos destacados${stats.anotacoes_falhas ? ` (${stats.anotacoes_falhas} não localizados)` : ''}`
        : '';
      if (linkAnotada) {
        linkAnotada.href = fullUrl;
        linkAnotada.hidden = false;
        if (tooltipStats) linkAnotada.title = tooltipStats;
      }
      if (linkAnotadaAba) {
        linkAnotadaAba.href = fullUrl;
        linkAnotadaAba.hidden = false;
        if (tooltipStats) linkAnotadaAba.title = tooltipStats;
      }
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
    if (state.imovel) {
      await reanalisarImovelAtual();
      return;
    }

    const arqEdital = $('arq-edital').files[0];
    const arqMatricula = $('arq-matricula').files[0];
    const urlEdital = $('url-edital').value.trim();
    const urlMatricula = $('url-matricula').value.trim();
    const temEdital = arqEdital || urlEdital;
    const temMatricula = arqMatricula || urlMatricula;
    if (!temEdital && !temMatricula) {
      $('erro-analise').textContent = 'Anexe pelo menos o edital ou a matrícula (PDF ou link de download).';
      $('erro-analise').hidden = false;
      return;
    }
    $('erro-analise').hidden = true;
    $('loading').hidden = false;
    $('loading').textContent = arqEdital || arqMatricula
      ? '⏳ Analisando…'
      : '⏳ Baixando PDFs e analisando…';
    $('btn-analisar').disabled = true;

    const fd = new FormData();
    if (arqEdital) fd.append('edital', arqEdital);
    else if (urlEdital) fd.append('edital_url', urlEdital);
    if (arqMatricula) fd.append('matricula', arqMatricula);
    else if (urlMatricula) fd.append('matricula_url', urlMatricula);
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

  async function reanalisarImovelAtual() {
    if (!confirm('Reanalisar usando os PDFs já salvos? Isso atualiza a extração mas preserva o que você editou nas abas.')) return;

    const btn = $('btn-analisar');
    const loading = $('loading');
    const status = $('reanalisar-status');
    btn.disabled = true;
    loading.textContent = '⏳ Reanalisando…';
    loading.hidden = false;
    status.hidden = true;

    try {
      const resp = await fetch(`${window.API_BASE}/api/imoveis/${encodeURIComponent(state.imovel.id)}/reanalisar`, { method: 'POST' });
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
      btn.disabled = false;
      loading.hidden = true;
    }
  }

  // ---------- Calculadora de viabilidade (mount sob demanda) ----------

  let calcMounted = false;
  function montarCalculadoraViab() {
    if (calcMounted) return;
    const el = document.getElementById('calc-mount-viabilidade');
    if (!el || !window.Calculadora) return;
    window.Calculadora.mount(el);
    calcMounted = true;
  }

  document.querySelectorAll('.aba-tab[data-tab="viabilidade"]').forEach(tab => {
    tab.addEventListener('click', () => { if (!tab.disabled) montarCalculadoraViab(); });
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
