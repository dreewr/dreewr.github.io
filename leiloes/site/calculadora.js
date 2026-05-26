/**
 * Calculadora de viabilidade — UI unificada.
 *
 * Substitui as 2 abas da planilha (à vista / financiado) por uma única
 * interface dinâmica. O usuário escolhe quais modos comparar
 * (à vista, financiado PRICE, financiado SAC, parcelado), alterna
 * pior/melhor cenário, liga/desliga IR, e visualiza tudo lado a lado.
 *
 * Lógica de cálculo: window.CalcEngine (calculadora-engine.js).
 * UI: componentizada via funções puras que retornam HTML + listeners.
 */
(function () {
  'use strict';

  const LS_KEY = 'leiloes:calculadora:v1';
  const LS_CENARIOS = 'leiloes:calculadora:cenarios:v1';

  const DEFAULTS = {
    nome: '',
    arrematacaoMin: 200000,
    arrematacaoMax: 240000,
    venda: 380000,
    vendaDescontoPct: 5, // % inteiro entre 2 e 10 — define o pior caso de venda

    comissaoLeiloeiroPct: 0.05,
    itbiPct: 0.027,
    registroBase: 1500,
    advogado: 4500,

    reforma: 10000,
    outros: 1500,

    prazoVenda: 12,
    iptuMensal: 100,
    condominioMensal: 500,

    corretorPct: 0.06,
    irPct: 0.15,
    irLigado: true,

    entradaPct: 0.20,
    jurosAnual: 0.12,
    prazoFinancSac: 420,
    prazoFinancPrice: 360,
    taxaAvaliacaoBanco: 2000,
    averbacoes: 0,

    parcSinalPct: 0.25,
    parcParcelas: 24,
    parcJurosMensal: 0.01,

    indexadorLigado: false,
    indexadorAnualPct: 0.04, // 4% a.a. — palpite razoável p/ IGP-M/IPCA
    indexadorSimplificado: false, // true = soma à taxa efetiva; false = aplica mês a mês ao saldo

    modo: 'vista',
    financTipo: 'sac',
    cdbAnualPct: 0.13,
    outrosItens: [],
    outrosVendaItens: [],
    corretorLigado: true,
    cenarioTipo: 'personalizado',
  };

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { ...DEFAULTS };
      const saved = JSON.parse(raw);
      const merged = { ...DEFAULTS, ...saved };
      // Migração: state.modos (array) → state.modo + financTipo
      if (Array.isArray(saved.modos) && saved.modos.length && !saved.modo) {
        const first = saved.modos[0];
        if (first === 'price' || first === 'sac') {
          merged.modo = 'financiado';
          merged.financTipo = first;
        } else if (first === 'parcelado') {
          merged.modo = 'parcelado';
        } else {
          merged.modo = 'vista';
        }
      }
      delete merged.modos;
      // Migração: arrematacao único → min/max
      if (saved.arrematacao != null && saved.arrematacaoMin == null && saved.arrematacaoMax == null) {
        merged.arrematacaoMin = saved.arrematacao;
        merged.arrematacaoMax = saved.arrematacao;
      }
      delete merged.arrematacao;
      delete merged.cenarioTipo;
      // Migração: prazoFinanc único → por tipo (SAC/PRICE)
      if (saved.prazoFinanc != null && saved.prazoFinancSac == null && saved.prazoFinancPrice == null) {
        const tipo = saved.financTipo === 'price' ? 'price' : 'sac';
        if (tipo === 'price') {
          merged.prazoFinancPrice = Math.min(saved.prazoFinanc, 360);
          merged.prazoFinancSac = 420;
        } else {
          merged.prazoFinancSac = Math.min(saved.prazoFinanc, 420);
          merged.prazoFinancPrice = 360;
        }
      }
      delete merged.prazoFinanc;
      return merged;
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function persistState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadCenarios() {
    try {
      const raw = localStorage.getItem(LS_CENARIOS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveCenarios(arr) {
    try {
      localStorage.setItem(LS_CENARIOS, JSON.stringify(arr));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // Helpers de formatação
  // ---------------------------------------------------------------------
  const fmtBRL = (n) =>
    isFinite(n)
      ? n.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 0,
        })
      : '—';

  const fmtBRLDec = (n) =>
    isFinite(n)
      ? n.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—';

  const fmtPct = (x, casas) =>
    isFinite(x)
      ? (x * 100).toLocaleString('pt-BR', {
          minimumFractionDigits: casas != null ? casas : 1,
          maximumFractionDigits: casas != null ? casas : 1,
        }) + '%'
      : '—';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Derivação dos inputs do engine
  // ---------------------------------------------------------------------
  function sumItens(arr) {
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((s, it) => s + (Number(it && it.valor) || 0), 0);
  }

  function vendaDescontada() {
    const pct = Number(state.vendaDescontoPct || 0) / 100;
    return state.venda * (1 - pct);
  }

  function prazoFinancKey(financTipo) {
    return financTipo === 'price' ? 'prazoFinancPrice' : 'prazoFinancSac';
  }
  function prazoFinancMax(financTipo) {
    return financTipo === 'price' ? 360 : 420;
  }
  function prazoFinancAtual() {
    return state[prazoFinancKey(state.financTipo)];
  }

  function getCenarios() {
    return [
      { key: 'melhor', label: 'Melhor caso', arrematacao: state.arrematacaoMin, venda: state.venda },
      { key: 'pior',   label: 'Pior caso',   arrematacao: state.arrematacaoMax, venda: vendaDescontada() },
    ];
  }

  function buildEngineInputs(modo, scenario) {
    const isFinanciado = modo === 'price' || modo === 'sac';
    // Registro: à vista = base + averbações; financiado = 2× base + taxa banco + averbações
    const registroTotal = isFinanciado
      ? 2 * state.registroBase + state.taxaAvaliacaoBanco + state.averbacoes
      : state.registroBase + state.averbacoes;

    const outrosTotal = sumItens(state.outrosItens) + sumItens(state.outrosVendaItens);

    // Default = pior caso (conservador). Helpers em compute*().
    const arrematacao = scenario ? scenario.arrematacao : state.arrematacaoMax;
    const venda = scenario ? scenario.venda : vendaDescontada();

    return {
      arrematacao,
      venda,
      comissaoLeiloeiroPct: state.comissaoLeiloeiroPct,
      itbiPct: state.itbiPct,
      registro: registroTotal,
      advogado: state.advogado,
      reforma: state.reforma,
      outros: outrosTotal,
      prazoVenda: state.prazoVenda,
      iptuMensal: state.iptuMensal,
      condominioMensal: state.condominioMensal,
      corretorPct: state.corretorLigado ? state.corretorPct : 0,
      irPct: state.irLigado ? state.irPct : 0,

      entradaPct: state.entradaPct,
      jurosAnual: state.jurosAnual,
      prazoFinanc: prazoFinancAtual(),

      parcSinalPct: state.parcSinalPct,
      parcParcelas: state.parcParcelas,
      parcJurosMensal: state.parcJurosMensal,

      indexadorAnualPct: state.indexadorLigado ? state.indexadorAnualPct : 0,
      indexadorSimplificado: !!state.indexadorSimplificado,
    };
  }

  function modoEngine() {
    if (state.modo === 'financiado') return state.financTipo === 'sac' ? 'sac' : 'price';
    if (state.modo === 'parcelado') return 'parcelado';
    return 'vista';
  }

  function computeAtual() {
    // Compat: alguns lugares (CSV, lance-máx) ainda usam um único resultado.
    // Devolve o pior caso (cenário usado pelos cálculos principais).
    const m = modoEngine();
    return window.CalcEngine.compute(buildEngineInputs(m), m);
  }

  function computeCenarios() {
    const m = modoEngine();
    return getCenarios().map(c => ({
      key: c.key,
      label: c.label,
      arrematacao: c.arrematacao,
      venda: c.venda,
      res: window.CalcEngine.compute(buildEngineInputs(m, c), m),
    }));
  }

  function custoOportunidade(capital, meses) {
    if (!isFinite(capital) || capital <= 0) return 0;
    if (!isFinite(meses) || meses <= 0) return 0;
    const r = state.cdbAnualPct || 0;
    return capital * (Math.pow(1 + r, meses / 12) - 1);
  }

  // ---------------------------------------------------------------------
  // Cenários melhor/pior (presets de variáveis qualitativas)
  // ---------------------------------------------------------------------
  function aplicarCenarioPreset(tipo) {
    state.cenarioTipo = tipo;
    if (tipo === 'melhor') {
      state.advogado = 0;
      state.outros = 1500;
      state.prazoVenda = 10;
    } else if (tipo === 'pior') {
      state.advogado = 4500;
      state.outros = 2500;
      state.prazoVenda = 16;
    } else {
      // personalizado: não muda nada
    }
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  function mount(root) {
    if (!root) return;
    root.innerHTML = template();
    bindHandlers(root);
    rerender(root);
  }

  function template() {
    return `
      <div class="calc">
        <div class="calc-grid">
          <aside class="calc-sidebar">
            ${renderInputs()}
          </aside>

          <section class="calc-results">
            ${renderToolbar()}
            ${renderResultsSlot()}
          </section>
        </div>

        <details class="calc-cenarios">
          <summary>Cenários salvos</summary>
          <div id="calc-cenarios-body"></div>
        </details>

        <details class="calc-formulas">
          <summary>Fórmulas usadas (auditoria)</summary>
          ${renderFormulasBlock()}
        </details>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // Painel de inputs
  // ---------------------------------------------------------------------
  function renderInputs() {
    return `
      <h2 class="calc-h2">Parâmetros</h2>

      <fieldset>
        <legend>Imóvel</legend>
        ${inputMoneyWithSlider('arrematacaoMin', 'Lance mínimo (R$)', '', 0, Math.max(state.venda * 1.1, 600000), 1000)}
        ${inputMoneyWithSlider('arrematacaoMax', 'Lance máximo (R$)', '', 0, Math.max(state.venda * 1.1, 600000), 1000)}
        ${inputMoney('venda', 'Valor de venda esperado (R$)', '')}
        ${inputNumWithSlider('vendaDescontoPct', 'Desconto p/ venda rápida (%)', '', 2, 10, 1, 0)}
        <div class="campo readout-line">
          <span class="campo-label">Valor de venda descontado</span>
          <div class="readout-valor" data-readout="vendaDescontada">${fmtBRL(vendaDescontada())}</div>
        </div>
      </fieldset>

      <fieldset class="meio-pagto-fieldset">
        <legend>Meio de pagamento</legend>
        <div class="modo-radios" role="radiogroup" aria-label="Meio de pagamento">
          <label class="modo-radio ${state.modo === 'financiado' ? 'on' : ''}">
            <input type="radio" name="modo" value="financiado" ${state.modo === 'financiado' ? 'checked' : ''}>
            <span>Financiado</span>
          </label>
          <label class="modo-radio ${state.modo === 'parcelado' ? 'on' : ''}">
            <input type="radio" name="modo" value="parcelado" ${state.modo === 'parcelado' ? 'checked' : ''}>
            <span>Parcelado</span>
          </label>
          <label class="modo-radio ${state.modo === 'vista' ? 'on' : ''}">
            <input type="radio" name="modo" value="vista" ${state.modo === 'vista' ? 'checked' : ''}>
            <span>À vista</span>
          </label>
        </div>
        ${state.modo === 'financiado' ? `
          <div class="financ-inline">
            <div class="modo-radios sub-radios" role="radiogroup" aria-label="Sistema de amortização">
              <label class="modo-radio ${state.financTipo === 'sac' ? 'on' : ''}">
                <input type="radio" name="financTipo" value="sac" ${state.financTipo === 'sac' ? 'checked' : ''}>
                <span>SAC <small>· parcelas decrescentes · máx 420m</small></span>
              </label>
              <label class="modo-radio ${state.financTipo === 'price' ? 'on' : ''}">
                <input type="radio" name="financTipo" value="price" ${state.financTipo === 'price' ? 'checked' : ''}>
                <span>PRICE <small>· parcelas constantes · máx 360m</small></span>
              </label>
            </div>
            <div class="financ-grid">
              ${inputPct('entradaPct', '% da entrada', 'Padrão de mercado 20%. Caixa em alguns casos aceita até 1%.', 0.01)}
              ${inputPct('jurosAnual', 'Juros efetivos anual (%)', '', 0.001)}
              ${inputNumWithSlider(prazoFinancKey(state.financTipo), 'Prazo do financiamento (meses)', state.financTipo === 'price' ? 'PRICE máx 360. SAC salvo separado.' : 'SAC máx 420. PRICE salvo separado.', 1, prazoFinancMax(state.financTipo), 1, 0)}
              ${inputMoney('taxaAvaliacaoBanco', 'Taxa de avaliação do banco (R$)', 'Faixa típica: R$ 1.800 a 3.000. Já entra no registro total.')}
            </div>
            ${renderIndexadorBlock()}
            <p class="hint">Registro total financiado: <code>2 × registro_estado + taxa_banco + averbações</code> = <strong>${fmtBRL(2 * state.registroBase + state.taxaAvaliacaoBanco + state.averbacoes)}</strong>.</p>
          </div>
        ` : ''}
        ${state.modo === 'parcelado' ? `
          <div class="financ-inline">
            <p class="hint">Pagamento ao leiloeiro/juízo em parcelas (sem banco). Não há alienação fiduciária, então o registro NÃO é dobrado.</p>
            <div class="financ-grid">
              ${inputPct('parcSinalPct', '% sinal / entrada', '', 0.01)}
              ${inputNumWithSlider('parcParcelas', 'Nº de parcelas', '', 1, 60, 1, 0)}
              ${inputPct('parcJurosMensal', 'Correção mensal (%)', 'Correção monetária ou juros mensal das parcelas. Zero se não houver.', 0.001)}
            </div>
            ${renderIndexadorBlock()}
          </div>
        ` : ''}
      </fieldset>

      <fieldset class="custos-fieldset">
        <legend>Custos da arrematação</legend>
        ${inputPct('comissaoLeiloeiroPct', 'Comissão do leiloeiro (%)', 'Padrão 5%. Conferir no edital.', 0.001)}
        ${inputPct('itbiPct', 'ITBI (%)', 'Alíquota municipal. Curitiba 2,7%, SP 3%. Sobre a arrematação.', 0.001)}
        ${inputMoney('registroBase', 'Registro — valor base do estado (R$)', 'Valor unitário da tabela do estado pela faixa de preço da arrematação. No financiado, esse valor é DOBRADO (compra e venda + alienação fiduciária).')}
        ${inputMoney('averbacoes', 'Cancelamento de ônus no cartório (R$)', 'Se a matrícula tem penhora/indisponibilidade pra cancelar depois da arrematação, o cartório cobra por ato — PR ~R$ 100-200 cada. Conta: nº de ônus × valor unitário. Matrícula limpa = 0.')}
        <div class="dobro-disclaimer">
          <strong>⚠️ Atenção:</strong> no financiamento, o registro é
          <strong>dobrado</strong> (compra e venda + alienação fiduciária)
          <span class="tooltip" tabindex="0" aria-label="Mais sobre o dobro do registro">
            ℹ️
            <span class="tooltip-content">
              No leilão à vista paga-se 1× o registro do estado (escritura + compra e venda).<br>
              No financiamento, há 2 atos na matrícula que custam o mesmo: compra e venda + alienação fiduciária do banco. A planilha trata como
              <code>D24 = 2 × registro_estado + taxa_avaliação_banco + averbações</code>.
              Esta calculadora aplica o dobro automaticamente quando "financiado" está ativo.
            </span>
          </span>
        </div>
        ${inputMoney('advogado', 'Advogado para desocupação (R$)', 'Pior caso (imissão) ~4500. Melhor caso (acordo) ~0.')}
      </fieldset>

      <fieldset>
        <legend>Extras pós-imissão</legend>
        ${inputMoney('reforma', 'Reforma (R$)', 'Pintura+laminado popular 60–70 m²: ~10k. Maior precisa orçamento real.')}
        ${renderOutrosTabela('outrosItens', 'Outros custos (não abate IR)', 'Caminhão de mudança, chaveiro, dívidas IPTU/cond anteriores, contrapartida ao devedor, etc.')}
      </fieldset>

      <fieldset>
        <legend>Pós-arrematação</legend>
        ${inputNumWithSlider('prazoVenda', 'Prazo até a venda (meses)', '', 1, 18, 1, 0)}
        ${inputMoney('iptuMensal', 'IPTU mensal (R$)', 'Carnê ÷ 12.')}
        ${inputMoney('condominioMensal', 'Condomínio mensal (R$)', '')}
      </fieldset>

      <fieldset>
        <legend>Pós-venda</legend>
        <div class="toggle-row">
          <label class="toggle-mini">
            <input type="checkbox" id="corretor-toggle" ${state.corretorLigado ? 'checked' : ''}>
            <span>Comissão do corretor</span>
          </label>
          ${inputPctInline('corretorPct', '%', 'SP: 6%. Outros estados variam.', 0.01, !state.corretorLigado)}
        </div>
        <div class="toggle-row">
          <label class="toggle-mini">
            <input type="checkbox" id="ir-toggle" ${state.irLigado ? 'checked' : ''}>
            <span>IR sobre ganho de capital</span>
          </label>
          ${inputPctInline('irPct', '%', '15% padrão. Acima de R$ 5 mi: alíquota progressiva.', 0.001, !state.irLigado)}
        </div>
        ${renderOutrosTabela('outrosVendaItens', 'Outros custos de venda', 'Divulgação, anúncios, fotos profissionais, home staging, etc.')}
      </fieldset>

      <fieldset>
        <legend>Custo de oportunidade</legend>
        ${inputPct('cdbAnualPct', 'CDB / renda fixa equivalente (% ao ano)', 'Quanto o capital do bolso renderia parado em CDB no mesmo prazo. Tipicamente 100% do CDI ≈ 13%/ano.', 0.001)}
      </fieldset>

    `;
  }

  function renderInputsFinanciado() {
    return `
      <fieldset>
        <legend>Financiamento bancário</legend>
        ${inputPct('entradaPct', '% da entrada', 'Padrão de mercado 20%. Caixa em alguns casos aceita até 1%.', 0.01)}
        ${inputPct('jurosAnual', 'Juros efetivos anual (%)', '', 0.001)}
        ${inputNumWithSlider(prazoFinancKey(state.financTipo), 'Prazo do financiamento (meses)', state.financTipo === 'price' ? 'PRICE máx 360. SAC salvo separado.' : 'SAC máx 420. PRICE salvo separado.', 1, prazoFinancMax(state.financTipo), 1, 0)}
        ${inputMoney('taxaAvaliacaoBanco', 'Taxa de avaliação do banco (R$)', 'Faixa típica: R$ 1.800 a 3.000. Já entra no registro total.')}
        <p class="hint">
          O registro total financiado é calculado como
          <code>2 × registro_estado + taxa_banco + averbações</code> =
          <strong>${fmtBRL(2 * state.registroBase + state.taxaAvaliacaoBanco + state.averbacoes)}</strong>.
        </p>
      </fieldset>
    `;
  }

  function renderInputsParcelado() {
    return `
      <fieldset>
        <legend>Parcelamento direto</legend>
        <p class="hint">Pagamento ao leiloeiro/juízo em parcelas (sem banco). Não há alienação fiduciária, então o registro NÃO é dobrado.</p>
        ${inputPct('parcSinalPct', '% sinal/entrada', '', 0.01)}
        ${inputNumWithSlider('parcParcelas', 'Nº de parcelas', '', 1, 60, 1, 0)}
        ${inputPct('parcJurosMensal', 'Juros mensal (%)', 'Algumas modalidades têm correção monetária ou juros. Zero se não houver.', 0.001)}
      </fieldset>
    `;
  }

  function hasFinanciado() {
    return state.modo === 'financiado';
  }
  function hasParcelado() {
    return state.modo === 'parcelado';
  }

  function inputMoney(key, label, hint) {
    const v = state[key] != null ? state[key] : 0;
    return `
      <label class="campo">
        <span class="campo-label">${label}</span>
        <input type="number" data-input="${key}" value="${v}" step="100" min="0">
        ${hint ? `<span class="campo-hint">${hint}</span>` : ''}
      </label>
    `;
  }

  function inputMoneyWithSlider(key, label, hint, min, max, step) {
    const v = state[key] != null ? state[key] : 0;
    return `
      <label class="campo">
        <span class="campo-label">${label}</span>
        <div class="campo-controls">
          <input type="number" data-input="${key}" value="${v}" step="${step}" min="${min}">
          <input type="range" data-slider="${key}" value="${v}" min="${min}" max="${max}" step="${step}">
        </div>
        ${hint ? `<span class="campo-hint">${hint}</span>` : ''}
      </label>
    `;
  }

  function inputNumWithSlider(key, label, hint, min, max, step, casas) {
    const v = state[key] != null ? state[key] : 0;
    return `
      <label class="campo">
        <span class="campo-label">${label}</span>
        <div class="campo-controls">
          <input type="number" data-input="${key}" value="${v}" step="${step}" min="${min}" max="${max}">
          <input type="range" data-slider="${key}" value="${v}" min="${min}" max="${max}" step="${step}">
        </div>
        ${hint ? `<span class="campo-hint">${hint}</span>` : ''}
      </label>
    `;
  }

  function inputPct(key, label, hint, step) {
    const v = state[key] != null ? state[key] : 0;
    const display = (v * 100).toFixed(2).replace(/\.?0+$/, '');
    return `
      <label class="campo">
        <span class="campo-label">${label}</span>
        <input type="number" data-input-pct="${key}" value="${display}" step="${step ? step * 100 : 0.1}" min="0">
        ${hint ? `<span class="campo-hint">${hint}</span>` : ''}
      </label>
    `;
  }

  function inputPctInline(key, suffix, hint, step, disabled) {
    const v = state[key] != null ? state[key] : 0;
    const display = (v * 100).toFixed(2).replace(/\.?0+$/, '');
    return `
      <span class="campo-inline" title="${hint ? hint.replace(/"/g, '&quot;') : ''}">
        <input type="number" data-input-pct="${key}" value="${display}" step="${step ? step * 100 : 0.1}" min="0" ${disabled ? 'disabled' : ''}>
        <span class="campo-suffix">${suffix}</span>
      </span>
    `;
  }

  function renderIndexadorBlock() {
    const on = !!state.indexadorLigado;
    const simpl = !!state.indexadorSimplificado;
    return `
      <div class="indexador-block">
        <label class="toggle-mini">
          <input type="checkbox" id="indexador-toggle" ${on ? 'checked' : ''}>
          <span>Aplicar indexador (TR / IGP-M / IPCA)</span>
        </label>
        ${on ? `
          <div class="indexador-controls">
            ${inputPct('indexadorAnualPct', '% ao ano', 'Estimativa: IGP-M ~4-6%/ano, IPCA ~4%/ano, TR ~1-2%/ano.', 0.001)}
            <label class="toggle-mini" title="Quando ligado, soma o indexador à taxa efetiva (rápido). Desligado: aplica mês a mês ao saldo devedor (fiel ao contrato).">
              <input type="checkbox" id="indexador-simpl-toggle" ${simpl ? 'checked' : ''}>
              <span>Aplicação simplificada (somar à taxa de juros)</span>
            </label>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderOutrosTabela(key, label, hint) {
    const itens = Array.isArray(state[key]) ? state[key] : [];
    const total = itens.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    const linhas = itens.map((it, i) => `
      <tr>
        <td><input type="text" data-outros="${key}" data-outros-idx="${i}" data-outros-field="descricao" value="${escapeHtml(it.descricao || '')}" placeholder="Descrição"></td>
        <td><input type="number" data-outros="${key}" data-outros-idx="${i}" data-outros-field="valor" value="${it.valor != null ? it.valor : 0}" step="50" min="0"></td>
        <td><button type="button" class="btn-icone btn-remover" data-outros-del="${key}" data-outros-idx="${i}" aria-label="Remover">🗑</button></td>
      </tr>
    `).join('');
    return `
      <div class="outros-tabela campo" data-outros-block="${key}">
        <span class="campo-label">${label}</span>
        ${hint ? `<span class="campo-hint">${hint}</span>` : ''}
        <table class="tabela-outros">
          <thead><tr><th>Descrição</th><th>R$</th><th></th></tr></thead>
          <tbody>${linhas || '<tr class="empty"><td colspan="3"><em>Nenhum item ainda.</em></td></tr>'}</tbody>
          <tfoot><tr><th>Total</th><td>${fmtBRL(total)}</td><td></td></tr></tfoot>
        </table>
        <button type="button" class="btn-secundario btn-small" data-outros-add="${key}">+ adicionar item</button>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // Toolbar (modos a comparar, IR, salvar/exportar)
  // ---------------------------------------------------------------------
  function renderToolbar() {
    // Toolbar removida: salvar é automático via persistState() em cada mudança.
    return `<div class="calc-toolbar" hidden></div>`;
  }

  function renderResultsSlot() {
    return `<div id="calc-results-slot" aria-live="polite"></div>`;
  }

  // ---------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------
  function rerender(root) {
    // re-rendera inputs (sidebar) só estruturalmente, mantém valores
    const sidebar = root.querySelector('.calc-sidebar');
    const oldFocus = document.activeElement ? document.activeElement.dataset : null;
    if (sidebar) {
      sidebar.innerHTML = renderInputs();
      bindSidebar(root);
    }
    const tb = root.querySelector('.calc-toolbar');
    if (tb) {
      tb.outerHTML = renderToolbar();
      bindToolbar(root);
    }
    // Resultados
    const slot = root.querySelector('#calc-results-slot');
    if (slot) slot.innerHTML = renderResults();
    // Cenários
    const cs = root.querySelector('#calc-cenarios-body');
    if (cs) cs.innerHTML = renderCenarios();

    // restaurar foco se possível
    if (oldFocus && (oldFocus.input || oldFocus.inputPct || oldFocus.slider)) {
      const sel =
        (oldFocus.input && `[data-input="${oldFocus.input}"]`) ||
        (oldFocus.inputPct && `[data-input-pct="${oldFocus.inputPct}"]`) ||
        (oldFocus.slider && `[data-slider="${oldFocus.slider}"]`);
      const el = root.querySelector(sel);
      if (el) el.focus();
    }
  }

  function renderResults() {
    const m = modoEngine();
    const cenarios = computeCenarios();
    const pior = cenarios.find(c => c.key === 'pior');
    return `
      <div class="cards-result two-scenarios">
        ${cenarios.map(c => renderCard(m, c.res, c)).join('')}
      </div>
      ${m === 'price' || m === 'sac' || m === 'parcelado' ? renderCronograma({ [m]: pior.res }) : ''}
    `;
  }

  function renderCard(modo, res, cenario) {
    const titulo =
      {
        vista: 'À vista',
        price: 'Financiado PRICE',
        sac: 'Financiado SAC',
        parcelado: 'Parcelado',
      }[modo] || modo;

    const lucroOk = res.resultado.lucro_pct >= 0.3;
    const lucroBad = res.resultado.lucro_pct < 0;
    const lucroAlerta = res.resultado.lucro_pct >= 0 && res.resultado.lucro_pct < 0.3;

    const capital = res.custos.total;
    const oport = custoOportunidade(capital, state.prazoVenda);
    const lucroVsOport = res.resultado.lucro_rs - oport;

    return `
      <article class="card-result ${cenario ? `cenario-${cenario.key}` : ''} ${lucroOk ? 'lucro-ok' : lucroBad ? 'lucro-bad' : 'lucro-warn'}">
        <header class="card-result-header">
          ${cenario ? `<div class="card-cenario-label">${cenario.label}</div>` : ''}
          <h3>${titulo}</h3>
          ${cenario ? `<div class="card-cenario-meta">Lance ${fmtBRL(cenario.arrematacao)} · Venda ${fmtBRL(cenario.venda)}</div>` : ''}
          <div class="card-result-badges">
            ${lucroOk ? `<span class="badge badge-ok">Lucro ${fmtPct(res.resultado.lucro_pct, 1)}</span>` : ''}
            ${lucroAlerta ? `<span class="badge badge-pendente">Lucro ${fmtPct(res.resultado.lucro_pct, 1)} · abaixo do alvo</span>` : ''}
            ${lucroBad ? `<span class="badge badge-fail">Prejuízo ${fmtPct(res.resultado.lucro_pct, 1)}</span>` : ''}
          </div>
        </header>

        <div class="card-destaques">
          <div class="destaque">
            <span class="destaque-label">Capital do bolso</span>
            <span class="destaque-valor">${fmtBRL(res.custos.total)}</span>
          </div>
          <div class="destaque">
            <span class="destaque-label">Custo de oportunidade (CDB ${fmtPct(state.cdbAnualPct, 1)})</span>
            <span class="destaque-valor">${fmtBRL(oport)}</span>
            <span class="destaque-sub">o que o capital renderia em ${state.prazoVenda} m</span>
          </div>
          <div class="destaque ${lucroVsOport >= 0 ? '' : 'negativo'}">
            <span class="destaque-label">Ganho vs CDB</span>
            <span class="destaque-valor">${fmtBRL(lucroVsOport)}</span>
            <span class="destaque-sub">lucro − custo de oportunidade</span>
          </div>
          <div class="destaque destaque-principal ${res.resultado.lucro_rs >= 0 ? '' : 'negativo'}">
            <span class="destaque-label">Lucro líquido</span>
            <span class="destaque-valor">${fmtBRL(res.resultado.lucro_rs)}</span>
            <span class="destaque-sub">${fmtPct(res.resultado.lucro_pct, 1)} total · ${fmtPct(res.resultado.lucro_mensal, 2)} mensal</span>
          </div>
          <div class="destaque">
            <span class="destaque-label">Valor real venda</span>
            <span class="destaque-valor">${fmtBRL(res.pos_venda.valor_real_venda)}</span>
          </div>
          ${
            modo === 'price' || modo === 'sac' || modo === 'parcelado'
              ? `<div class="destaque">
                  <span class="destaque-label">Saldo devedor quitado na venda</span>
                  <span class="destaque-valor">${fmtBRL(res.pos_venda.saldo_devedor_quitado)}</span>
                </div>`
              : ''
          }
        </div>

        <details class="card-breakdown">
          <summary>Detalhamento dos custos</summary>
          <table class="tabela-breakdown">
            <tbody>
              <tr>
                <th>${modo === 'vista' ? 'Arrematação' : modo === 'parcelado' ? 'Sinal' : 'Entrada'}</th>
                <td>${fmtBRL(res.custos.capital_inicial)}</td>
              </tr>
              <tr><th>Comissão leiloeiro</th><td>${fmtBRL(res.custos.comissao_leiloeiro)}</td></tr>
              <tr><th>ITBI</th><td>${fmtBRL(res.custos.itbi)}</td></tr>
              <tr><th>Registro ${modo === 'vista' ? '(1×)' : modo === 'parcelado' ? '(1×)' : '(2× + taxa banco)'}</th><td>${fmtBRL(res.custos.registro)}</td></tr>
              <tr><th>Advogado</th><td>${fmtBRL(res.custos.advogado)}</td></tr>
              <tr><th>Reforma</th><td>${fmtBRL(res.custos.reforma)}</td></tr>
              <tr><th>Outros</th><td>${fmtBRL(res.custos.outros)}</td></tr>
              <tr><th>IPTU (${state.prazoVenda}m)</th><td>${fmtBRL(res.custos.iptu_total)}</td></tr>
              <tr><th>Cond. (${state.prazoVenda}m)</th><td>${fmtBRL(res.custos.cond_total)}</td></tr>
              ${res.custos.parcelas_pagas > 0 ? `<tr><th>Parcelas pagas (${state.prazoVenda}m)</th><td>${fmtBRL(res.custos.parcelas_pagas)}</td></tr>` : ''}
              <tr class="row-total"><th>Total de custos</th><td>${fmtBRL(res.custos.total)}</td></tr>
            </tbody>
          </table>
          <table class="tabela-breakdown">
            <tbody>
              <tr><th>Comissão corretor (${fmtPct(state.corretorPct, 1)})</th><td>${fmtBRL(res.pos_venda.comissao_corretor)}</td></tr>
              <tr><th>Base IR</th><td>${fmtBRL(res.pos_venda.ir_base)}</td></tr>
              <tr><th>IR ${state.irLigado ? `(${fmtPct(state.irPct, 1)})` : '(desligado)'}</th><td>${fmtBRL(res.pos_venda.ir)}</td></tr>
              ${res.pos_venda.saldo_devedor_quitado > 0 ? `<tr><th>Saldo devedor quitado</th><td>${fmtBRL(res.pos_venda.saldo_devedor_quitado)}</td></tr>` : ''}
              <tr class="row-total"><th>Valor real de venda</th><td>${fmtBRL(res.pos_venda.valor_real_venda)}</td></tr>
            </tbody>
          </table>
        </details>
      </article>
    `;
  }

  function renderResumoComparativo(results) {
    if (Object.keys(results).length < 2) return '';
    const modos = Object.keys(results);
    const sortable = modos.map((m) => ({
      modo: m,
      ...results[m].resultado,
      custos_total: results[m].custos.total,
    }));
    const melhor = sortable.reduce((acc, x) => (x.lucro_rs > acc.lucro_rs ? x : acc), sortable[0]);
    const menorCap = sortable.reduce(
      (acc, x) => (x.custos_total < acc.custos_total ? x : acc),
      sortable[0]
    );
    return `
      <div class="resumo-comparativo">
        <h3>Resumo comparativo</h3>
        <table class="tabela-comparativa">
          <thead>
            <tr>
              <th>Modo</th>
              <th>Capital do bolso</th>
              <th>Lucro R$</th>
              <th>Lucro % total</th>
              <th>Lucro % mensal</th>
            </tr>
          </thead>
          <tbody>
            ${modos.map((m) => {
              const r = results[m];
              return `
                <tr ${m === melhor.modo ? 'class="row-melhor"' : ''}>
                  <td>${labelModo(m)}</td>
                  <td>${fmtBRL(r.custos.total)} ${m === menorCap.modo ? '<span class="tag-menor">menor</span>' : ''}</td>
                  <td>${fmtBRL(r.resultado.lucro_rs)}</td>
                  <td>${fmtPct(r.resultado.lucro_pct, 1)}</td>
                  <td>${fmtPct(r.resultado.lucro_mensal, 2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function labelModo(m) {
    return {
      vista: 'À vista',
      price: 'PRICE',
      sac: 'SAC',
      parcelado: 'Parcelado',
    }[m] || m;
  }

  function renderCronograma(results) {
    const m0 = modoEngine();
    const modo = (m0 === 'price' || m0 === 'sac' || m0 === 'parcelado') ? m0 : null;
    if (!modo) return '';
    const r = results[modo];
    if (!r || !r.cronograma || r.cronograma.length === 0) return '';
    const linhas = r.cronograma.slice(0, Math.min(r.cronograma.length, 24));
    return `
      <details class="cronograma-block">
        <summary>Cronograma do ${labelModo(modo)} — primeiros ${linhas.length} meses</summary>
        <div class="cronograma-grafico">${renderGrafico(r.cronograma)}</div>
        <table class="tabela-cronograma">
          <thead>
            <tr><th>Mês</th><th>Parcela</th><th>Juros</th><th>Amortização</th><th>Saldo devedor</th></tr>
          </thead>
          <tbody>
            ${linhas.map((row) => `
              <tr ${row.mes === state.prazoVenda ? 'class="row-prazo-venda"' : ''}>
                <td>${row.mes}${row.mes === state.prazoVenda ? ' <span class="tag-vendido">venda</span>' : ''}</td>
                <td>${fmtBRLDec(row.parcela)}</td>
                <td>${fmtBRLDec(row.juros)}</td>
                <td>${fmtBRLDec(row.amort)}</td>
                <td>${fmtBRLDec(row.saldo)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </details>
    `;
  }

  function renderGrafico(cronograma) {
    if (!cronograma || cronograma.length === 0) return '';
    const maxP = Math.max(...cronograma.map((r) => r.parcela));
    const maxS = Math.max(...cronograma.map((r) => r.saldo));
    const n = cronograma.length;
    const W = 600;
    const H = 200;
    const pad = 20;
    const xStep = (W - 2 * pad) / Math.max(1, n - 1);

    const ptsParcela = cronograma
      .map((r, i) => {
        const x = pad + i * xStep;
        const y = H - pad - ((r.parcela / maxP) * (H - 2 * pad));
        return `${x},${y}`;
      })
      .join(' ');
    const ptsSaldo = cronograma
      .map((r, i) => {
        const x = pad + i * xStep;
        const y = H - pad - ((r.saldo / maxS) * (H - 2 * pad));
        return `${x},${y}`;
      })
      .join(' ');
    const xVenda = pad + (state.prazoVenda - 1) * xStep;

    return `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de parcelas e saldo devedor ao longo do financiamento">
        <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" />
        ${state.prazoVenda > 0 && state.prazoVenda <= n
          ? `<line x1="${xVenda}" y1="${pad}" x2="${xVenda}" y2="${H - pad}" stroke="var(--color-warn-fg)" stroke-dasharray="4 3" stroke-width="1.5"/>
             <text x="${xVenda + 4}" y="${pad + 12}" fill="var(--color-warn-fg)" font-size="11">venda (m${state.prazoVenda})</text>`
          : ''}
        <polyline points="${ptsSaldo}" fill="none" stroke="var(--color-link)" stroke-width="2"/>
        <polyline points="${ptsParcela}" fill="none" stroke="var(--color-ok-fg)" stroke-width="2"/>
        <text x="${pad}" y="${H - 4}" fill="var(--color-fg-muted)" font-size="10">mês 1</text>
        <text x="${W - pad - 20}" y="${H - 4}" fill="var(--color-fg-muted)" font-size="10">mês ${n}</text>
        <text x="${pad}" y="${pad + 8}" fill="var(--color-link)" font-size="11">— saldo devedor</text>
        <text x="${pad}" y="${pad + 22}" fill="var(--color-ok-fg)" font-size="11">— parcela</text>
      </svg>
    `;
  }

  // ---------------------------------------------------------------------
  // Cenários salvos (localStorage)
  // ---------------------------------------------------------------------
  function renderCenarios() {
    const cs = loadCenarios();
    if (cs.length === 0) {
      return `<p class="placeholder-soft">Nenhum cenário salvo. Clique em "💾 Salvar cenário" para armazenar o estado atual.</p>`;
    }
    return `
      <table class="tabela-cenarios">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Arrematação</th>
            <th>Venda</th>
            <th>Modos</th>
            <th>Salvo em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${cs.map((c, i) => `
            <tr>
              <td>${escapeHtml(c.nome || '(sem nome)')}</td>
              <td>${fmtBRL(c.state.arrematacaoMax ?? c.state.arrematacao)}</td>
              <td>${fmtBRL(c.state.venda)}</td>
              <td>${labelModo(c.state.modo || (c.state.modos && c.state.modos[0]) || 'vista')}</td>
              <td>${new Date(c.ts).toLocaleString('pt-BR')}</td>
              <td>
                <button type="button" class="btn-link" data-cenario-load="${i}">carregar</button>
                <button type="button" class="btn-link danger" data-cenario-del="${i}">excluir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderFormulasBlock() {
    return `
      <div class="formulas-block">
        <h3>À vista</h3>
        <pre>
Comissão leiloeiro = arrematação × %_leiloeiro
ITBI               = arrematação × %_itbi
Carrego            = (IPTU + condomínio) × meses
Total custos       = arrematação + comiss + ITBI + registro + advogado
                   + reforma + outros + carrego
Comissão corretor  = venda × %_corretor
Base IR            = venda − arrematação − comiss − ITBI − registro
                   − reforma − comiss_corretor
IR                 = base × %_IR
Valor real venda   = venda − comiss_corretor − IR
Lucro R$           = valor_real − total_custos
Lucro % total      = lucro_R$ / total_custos
Lucro % mensal     = (1 + lucro_pct)^(1/meses) − 1
        </pre>
        <h3>Financiado (PRICE/SAC)</h3>
        <pre>
Entrada            = arrematação × %_entrada
Financiado         = arrematação − entrada
Taxa mensal        = (1 + juros_anual)^(1/12) − 1
Registro           = 2 × registro_estado + taxa_banco + averbações
                     ← DOBRO porque há 2 atos: compra-venda + AF

PRICE:  parcela = financ × (1+i)^n × i / ((1+i)^n − 1)   (constante)
SAC:    amort   = financ / n                              (constante)
        parcela[t] = amort + (financ − (t−1)×amort) × i   (decrescente)

Parcelas pagas até venda = soma das parcelas 1..prazo_venda
Saldo devedor na venda   = saldo[prazo_venda]

Base IR            = venda − comiss_corretor − (entrada + parcelas_pagas
                     + saldo_devedor + comiss + ITBI + registro + reforma)
Valor real venda   = venda − comiss_corretor − IR − saldo_devedor
Total custos       = entrada + comiss + ITBI + registro + advogado + reforma
                   + outros + IPTU_total + cond_total + parcelas_pagas
        </pre>
      </div>
    `;
  }

  // ---------------------------------------------------------------------
  // Bindings
  // ---------------------------------------------------------------------
  function bindHandlers(root) {
    bindSidebar(root);
    bindToolbar(root);
    bindCenarios(root);

    // Restaurar de query string (compartilhamento por link)
    restoreFromUrl(root);
  }

  function bindSidebar(root) {
    const sidebar = root.querySelector('.calc-sidebar');
    if (!sidebar) return;

    const refreshReadouts = () => {
      const r = sidebar.querySelector('[data-readout="vendaDescontada"]');
      if (r) r.textContent = fmtBRL(vendaDescontada());
    };

    sidebar.querySelectorAll('[data-input]').forEach((el) => {
      const sync = () => {
        const k = el.dataset.input;
        let v = parseFloat(el.value) || 0;
        let clamped = false;
        const max = el.max ? parseFloat(el.max) : null;
        if (max != null && isFinite(max) && v > max) { v = max; clamped = true; }
        state[k] = v;
        const slider = sidebar.querySelector(`[data-slider="${k}"]`);
        if (slider) slider.value = v;
        persistState();
        refreshReadouts();
        rerenderResults(root);
        return { clamped, v };
      };
      el.addEventListener('input', sync);
      el.addEventListener('blur', () => {
        const { clamped, v } = sync();
        if (clamped) el.value = v;
      });
    });

    sidebar.querySelectorAll('[data-input-pct]').forEach((el) => {
      el.addEventListener('input', (e) => {
        const k = el.dataset.inputPct;
        const v = parseFloat(el.value);
        state[k] = isFinite(v) ? v / 100 : 0;
        persistState();
        rerenderResults(root);
      });
    });

    sidebar.querySelectorAll('[data-slider]').forEach((el) => {
      el.addEventListener('input', (e) => {
        const k = el.dataset.slider;
        let v = parseFloat(el.value) || 0;
        state[k] = v;
        const num = sidebar.querySelector(`[data-input="${k}"]`);
        if (num) num.value = v;
        persistState();
        refreshReadouts();
        rerenderResults(root);
      });
    });

    sidebar.querySelectorAll('input[name="cenarioTipo"]').forEach((el) => {
      el.addEventListener('change', () => {
        aplicarCenarioPreset(el.value);
        persistState();
        rerender(root);
      });
    });

    sidebar.querySelectorAll('input[name="modo"]').forEach((el) => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        state.modo = el.value;
        persistState();
        rerender(root);
      });
    });

    sidebar.querySelectorAll('input[name="financTipo"]').forEach((el) => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        state.financTipo = el.value;
        persistState();
        rerender(root);
      });
    });

    const ir = sidebar.querySelector('#ir-toggle');
    if (ir) {
      ir.addEventListener('change', () => {
        state.irLigado = ir.checked;
        persistState();
        rerender(root);
      });
    }

    const corretor = sidebar.querySelector('#corretor-toggle');
    if (corretor) {
      corretor.addEventListener('change', () => {
        state.corretorLigado = corretor.checked;
        persistState();
        rerender(root);
      });
    }

    const idx = sidebar.querySelector('#indexador-toggle');
    if (idx) {
      idx.addEventListener('change', () => {
        state.indexadorLigado = idx.checked;
        persistState();
        rerender(root);
      });
    }
    const idxSimpl = sidebar.querySelector('#indexador-simpl-toggle');
    if (idxSimpl) {
      idxSimpl.addEventListener('change', () => {
        state.indexadorSimplificado = idxSimpl.checked;
        persistState();
        rerenderResults(root);
      });
    }

    sidebar.querySelectorAll('[data-outros-add]').forEach((el) => {
      el.addEventListener('click', () => {
        const k = el.dataset.outrosAdd;
        if (!Array.isArray(state[k])) state[k] = [];
        state[k].push({ descricao: '', valor: 0 });
        persistState();
        rerender(root);
      });
    });

    sidebar.querySelectorAll('[data-outros-del]').forEach((el) => {
      el.addEventListener('click', () => {
        const k = el.dataset.outrosDel;
        const i = Number(el.dataset.outrosIdx);
        if (!Array.isArray(state[k])) return;
        state[k].splice(i, 1);
        persistState();
        rerender(root);
      });
    });

    sidebar.querySelectorAll('[data-outros]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.outros;
        const i = Number(el.dataset.outrosIdx);
        const f = el.dataset.outrosField;
        if (!Array.isArray(state[k])) return;
        if (!state[k][i]) return;
        state[k][i][f] = f === 'valor' ? (parseFloat(el.value) || 0) : el.value;
        persistState();
        // Atualiza total no tfoot e resultados sem perder foco
        const bloco = sidebar.querySelector(`[data-outros-block="${k}"]`);
        if (bloco) {
          const tot = sumItens(state[k]);
          const tf = bloco.querySelector('tfoot td');
          if (tf) tf.textContent = fmtBRL(tot);
        }
        rerenderResults(root);
      });
    });

    const btnReset = sidebar.querySelector('#btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Restaurar todos os parâmetros para os valores padrão?')) {
          state = { ...DEFAULTS };
          persistState();
          rerender(root);
        }
      });
    }

    const btnLance = sidebar.querySelector('#btn-lance-max');
    if (btnLance) {
      btnLance.addEventListener('click', () => {
        const modoPrincipal = modoEngine();
        const out = window.CalcEngine.lanceMaximo(buildEngineInputs(modoPrincipal), modoPrincipal, 0.30);
        if (!out) {
          alert('Não foi possível calcular o lance máximo. Verifique o valor de venda.');
          return;
        }
        state.arrematacaoMax = Math.floor(out.arrematacao / 100) * 100;
        persistState();
        rerender(root);
        alert(
          `Lance máximo (${labelModo(modoPrincipal)}) para 30% de lucro: ${fmtBRL(state.arrematacaoMax)}.\n` +
          `Lucro projetado: ${fmtPct(out.resultado.resultado.lucro_pct, 1)} (${fmtBRL(out.resultado.resultado.lucro_rs)}).`
        );
      });
    }
  }

  function bindToolbar(root) {
    const btnSalvar = root.querySelector('#btn-salvar-cenario');
    if (btnSalvar) {
      btnSalvar.addEventListener('click', () => {
        const nome = prompt('Nome do cenário:', state.nome || `Cenário ${new Date().toLocaleDateString('pt-BR')}`);
        if (!nome) return;
        const cs = loadCenarios();
        cs.unshift({
          nome,
          ts: Date.now(),
          state: { ...state, nome },
        });
        saveCenarios(cs.slice(0, 50));
        rerender(root);
      });
    }

    const btnCsv = root.querySelector('#btn-export-csv');
    if (btnCsv) btnCsv.addEventListener('click', exportCsv);
    const btnJson = root.querySelector('#btn-export-json');
    if (btnJson) btnJson.addEventListener('click', exportJson);
    const btnShare = root.querySelector('#btn-share');
    if (btnShare) btnShare.addEventListener('click', share);
  }

  function bindCenarios(root) {
    root.addEventListener('click', (e) => {
      const tLoad = e.target.dataset.cenarioLoad;
      const tDel = e.target.dataset.cenarioDel;
      if (tLoad != null) {
        const cs = loadCenarios();
        const c = cs[+tLoad];
        if (c) {
          state = { ...DEFAULTS, ...c.state };
          persistState();
          rerender(root);
        }
      } else if (tDel != null) {
        const cs = loadCenarios();
        cs.splice(+tDel, 1);
        saveCenarios(cs);
        rerender(root);
      }
    });
  }

  function rerenderResults(root) {
    const slot = root.querySelector('#calc-results-slot');
    if (slot) slot.innerHTML = renderResults();
    // hint do registro financiado
    const hint = root.querySelector('.calc-sidebar fieldset .hint');
    if (hint) {
      hint.innerHTML = `O registro total financiado é calculado como
        <code>2 × registro_estado + taxa_banco + averbações</code> =
        <strong>${fmtBRL(2 * state.registroBase + state.taxaAvaliacaoBanco + state.averbacoes)}</strong>.`;
    }
  }

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------
  function exportCsv() {
    const m0 = modoEngine();
    const results = { [m0]: computeAtual() };
    const linhas = [
      ['Calculadora de viabilidade — Leilões'],
      [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
      [],
      ['Parâmetros'],
      ['Lance mínimo', state.arrematacaoMin],
      ['Lance máximo', state.arrematacaoMax],
      ['Venda esperada', state.venda],
      ['Desconto p/ venda rápida (%)', state.vendaDescontoPct],
      ['Venda descontada', vendaDescontada()],
      ['Comissão leiloeiro (%)', state.comissaoLeiloeiroPct * 100],
      ['ITBI (%)', state.itbiPct * 100],
      ['Registro base estado (R$)', state.registroBase],
      ['Averbações (R$)', state.averbacoes],
      ['Advogado (R$)', state.advogado],
      ['Reforma (R$)', state.reforma],
      ['Outros (R$)', state.outros],
      ['Prazo até venda (meses)', state.prazoVenda],
      ['IPTU mensal', state.iptuMensal],
      ['Condomínio mensal', state.condominioMensal],
      ['Corretor (%)', state.corretorPct * 100],
      ['IR ligado', state.irLigado ? 'Sim' : 'Não'],
      ['IR (%)', state.irPct * 100],
      [],
      ['Resultados'],
      ['Modo', 'Capital do bolso', 'Comissão leiloeiro', 'ITBI', 'Registro', 'Advogado', 'Reforma', 'Outros', 'IPTU total', 'Cond total', 'Parcelas pagas', 'Total custos', 'Comissão corretor', 'IR', 'Saldo devedor quitado', 'Valor real venda', 'Lucro R$', 'Lucro %', 'Lucro mensal %'],
    ];
    [modoEngine()].forEach((m) => {
      const r = results[m];
      linhas.push([
        labelModo(m).replace(/[^\w \-áéíóúãõçâêô]/g, ''),
        r.custos.capital_inicial,
        r.custos.comissao_leiloeiro,
        r.custos.itbi,
        r.custos.registro,
        r.custos.advogado,
        r.custos.reforma,
        r.custos.outros,
        r.custos.iptu_total,
        r.custos.cond_total,
        r.custos.parcelas_pagas,
        r.custos.total,
        r.pos_venda.comissao_corretor,
        r.pos_venda.ir,
        r.pos_venda.saldo_devedor_quitado,
        r.pos_venda.valor_real_venda,
        r.resultado.lucro_rs,
        (r.resultado.lucro_pct * 100).toFixed(2),
        (r.resultado.lucro_mensal * 100).toFixed(4),
      ]);
    });
    const csv = linhas
      .map((row) =>
        row
          .map((c) => {
            const s = c == null ? '' : String(c);
            return s.includes(';') || s.includes('"') || s.includes('\n')
              ? '"' + s.replace(/"/g, '""') + '"'
              : s;
          })
          .join(';')
      )
      .join('\n');
    download('calculadora-viabilidade.csv', csv, 'text/csv;charset=utf-8');
  }

  function exportJson() {
    const m0 = modoEngine();
    const results = { [m0]: computeAtual() };
    const payload = {
      gerado_em: new Date().toISOString(),
      parametros: state,
      registro_total: {
        a_vista: state.registroBase + state.averbacoes,
        financiado: 2 * state.registroBase + state.taxaAvaliacaoBanco + state.averbacoes,
      },
      resultados: results,
    };
    download(
      'calculadora-viabilidade.json',
      JSON.stringify(payload, null, 2),
      'application/json'
    );
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function share() {
    const params = new URLSearchParams();
    params.set('s', btoa(unescape(encodeURIComponent(JSON.stringify(state)))));
    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    navigator.clipboard
      .writeText(url)
      .then(() => alert('Link copiado para a área de transferência. Compartilhe para que outra pessoa abra o mesmo cenário.'))
      .catch(() => prompt('Copie o link manualmente:', url));
  }

  function restoreFromUrl(root) {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    if (!s) return;
    try {
      const json = decodeURIComponent(escape(atob(s)));
      const parsed = JSON.parse(json);
      state = { ...DEFAULTS, ...parsed };
      persistState();
      rerender(root);
    } catch (e) {
      console.warn('Estado da URL inválido:', e);
    }
  }

  window.Calculadora = { mount };
})();
