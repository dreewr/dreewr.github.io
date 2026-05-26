// Módulo de avaliação comparativa. Montável em qualquer container via
// `Avaliacao.mount(rootEl, opts)`. Usado tanto em avaliacao.html (standalone)
// quanto na aba "Avaliação" de analise.html.
//
// opts:
//   initialState  : { tipo, grupos, avaliando, nextVizId, resultado } | null
//   onStateChange : (state) => void   — chamado após calcular ou edições salvas
//   onCalcular    : (sumario) => void — { vCentral, vMin, vMax, amplitude, grauLabel }
(() => {
  'use strict';

  // ── Definição dos tipos ────────────────────────────────────────────────
  const TIPS = {
    quartos:    'Número de quartos (inclui suítes).',
    vagas:      'Vagas de garagem (cobertas + descobertas).',
    banheiros:  'Total de banheiros (inclui suítes e lavabo).',
    idade:      'Idade aparente em anos. Reformas recentes "rejuvenescem" o imóvel.',
    padrao:     'Padrão construtivo: 1=econômico/popular, 2=médio, 3=alto/luxo.',
    andar:      'Pavimento. Use 1 para térreo.',
    valor:      'Preço de venda anunciado em reais. Só números (sem R$, pontos ou vírgula).',
    fator:      'Fator de oferta: ajusta o valor anunciado para a venda real estimada. Anúncios são quase sempre acima do que fecha — usa-se um desconto típico de 5% (0,95). Exemplos: anúncio R$ 400k × 0,95 = R$ 380k entram no modelo. Use 1,00 se já é o valor de fechamento (escritura). Use 0,90 se sabe que o vendedor está aceitando proposta cheia.',
  };

  const TIPOS = {
    1: {
      label: 'Apartamento em condomínio',
      grupoLabel: 'condomínio',
      alvoNome: 'Mesmo condomínio (avaliando)',
      iconeVizinho: '🏢',
      colunas: [
        { id: 'area',     label: 'Área (m²)',    log: true, tip: 'Área privativa em m² (não inclui áreas comuns do condomínio).' },
        { id: 'quartos',  label: 'Quartos',                 tip: TIPS.quartos   },
        { id: 'vagas',    label: 'Vagas',                   tip: TIPS.vagas     },
        { id: 'banheiros',label: 'Banheiros',               tip: TIPS.banheiros },
        { id: 'idade',    label: 'Idade (anos)',            tip: TIPS.idade     },
        { id: 'padrao',   label: 'Padrão (1-3)',           tip: TIPS.padrao    },
        { id: 'andar',    label: 'Andar',                   tip: TIPS.andar     },
      ],
    },
    2: {
      label: 'Casa em condomínio',
      grupoLabel: 'condomínio',
      alvoNome: 'Mesmo condomínio (avaliando)',
      iconeVizinho: '🏘️',
      colunas: [
        { id: 'area',      label: 'Área priv. (m²)',  log: true, tip: 'Área construída privativa em m².' },
        { id: 'area_terr', label: 'Terreno (m²)',     log: true, tip: 'Área do lote/terreno em m².' },
        { id: 'quartos',   label: 'Quartos',                     tip: TIPS.quartos   },
        { id: 'vagas',     label: 'Vagas',                       tip: TIPS.vagas     },
        { id: 'banheiros', label: 'Banheiros',                   tip: TIPS.banheiros },
        { id: 'idade',     label: 'Idade (anos)',                tip: TIPS.idade     },
        { id: 'padrao',    label: 'Padrão (1-3)',               tip: TIPS.padrao    },
      ],
    },
    3: {
      label: 'Casa de rua',
      grupoLabel: 'rua / quadra',
      alvoNome: 'Mesma rua / quadra (avaliando)',
      iconeVizinho: '🛣️',
      colunas: [
        { id: 'area',      label: 'Área priv. (m²)', log: true, tip: 'Área construída privativa em m².' },
        { id: 'area_terr', label: 'Terreno (m²)',    log: true, tip: 'Área do lote em m². Opcional, mas melhora muito o modelo.' },
        { id: 'quartos',   label: 'Quartos',                    tip: TIPS.quartos   },
        { id: 'vagas',     label: 'Vagas',                      tip: TIPS.vagas     },
        { id: 'banheiros', label: 'Banheiros',                  tip: TIPS.banheiros },
        { id: 'idade',     label: 'Idade (anos)',               tip: TIPS.idade     },
        { id: 'padrao',    label: 'Padrão (1-3)',              tip: TIPS.padrao    },
      ],
    },
  };

  const LINHAS_INICIAIS_OUTROS = 5;

  // Colunas ocultas por padrão (continuam no JSON, só somem da UI).
  // Os "5 parâmetros principais" que o usuário pediu por default são:
  // area, quartos, banheiros, vagas + valor. As demais começam ocultas.
  const COLS_OCULTAS_DEFAULT = ['idade', 'padrao', 'andar', 'area_terr'];

  // ── Template HTML (todo elemento referenciado via data-aval-*) ─────────
  const TEMPLATE = `
    <details class="aval-help" open>
      <summary>Como funciona</summary>
      <div class="aval-help-body">
        <p>Estima o valor de um imóvel a partir de uma <strong>amostra de comparáveis</strong>
        (coletados em ZAP / VivaReal / OLX). Roda uma regressão OLS log-linear,
        seleciona variáveis significativas via <em>stepwise backward</em> (p &lt; 0,20)
        e entrega um intervalo de predição a 80%.</p>
        <p><strong>Quando usar:</strong> filtragem inicial de viabilidade (Fase 1).
        Para um laudo formal NBR 14653-2 você precisa complementar com análise
        de outliers, pontos influentes e validação dos pressupostos.</p>
        <p><strong>Agrupamento por condomínio:</strong> a primeira tabela é o
        condomínio (ou rua/quadra) do avaliando. Você pode criar tabelas extras
        para vizinhos relevantes; o modelo mede um prêmio/desconto por grupo
        que tiver ≥ 3 amostras. Amostras avulsas ficam na tabela "Outros"
        (referência).</p>
      </div>
    </details>

    <div class="aval-tipo-tabs" role="tablist" aria-label="Tipo de imóvel">
      <button type="button" class="aval-tipo-btn ativo" data-tipo="1"
              role="tab" aria-selected="true">Apartamento em condomínio</button>
      <button type="button" class="aval-tipo-btn" data-tipo="2"
              role="tab" aria-selected="false">Casa em condomínio</button>
      <button type="button" class="aval-tipo-btn" data-tipo="3"
              role="tab" aria-selected="false">Casa de rua</button>
    </div>

    <section class="aval-section aval-cols-section">
      <h2 class="aval-section-title">Parâmetros considerados</h2>
      <p class="aval-cols-dica">
        Ligue/desligue colunas. Os dados de colunas desligadas continuam salvos no JSON
        (retrocompatível) — só somem da tabela e do modelo.
      </p>
      <div class="aval-cols-toggles" data-aval="col-toggles"></div>
    </section>

    <section class="aval-section">
      <h2 class="aval-section-title">Dados</h2>
      <details class="aval-help">
        <summary>Como preencher</summary>
        <div class="aval-help-body">
          <ul>
            <li>A primeira tabela é o <strong>condomínio do avaliando</strong>. A linha destacada com 🏠 é o avaliando. As outras linhas são amostras desse mesmo condomínio (se você encontrou anúncios).</li>
            <li>Use <strong>"+ Novo condomínio"</strong> abaixo para criar tabelas adicionais quando tiver ≥ 3 amostras de um mesmo condomínio vizinho relevante. A <strong>primeira linha de cada tabela serve de base</strong> — as próximas herdam os valores dela (você só ajusta o que difere).</li>
            <li>Amostras avulsas vão para a tabela <strong>"Outros"</strong> (referência, sem prêmio/desconto).</li>
            <li><strong>Mínimo total: 5 amostras, ideal 12+.</strong> Áreas e Valores são obrigatórios em cada amostra. Demais campos podem ficar vazios (imputados pela mediana).</li>
            <li><strong>Fator oferta</strong> (default 0,95): desconto típico entre o anúncio e a venda fechada. Use 1,00 se o valor já é o de fechamento.</li>
            <li>Grupos com &lt; 3 amostras são silenciosamente agrupados a "Outros" no cálculo. Você verá o aviso no resultado.</li>
            <li>Passe o mouse sobre o nome da coluna para ver a definição.</li>
          </ul>
        </div>
      </details>

      <div data-aval="grupos-container"></div>

      <div class="aval-novo-grupo-wrap">
        <button type="button" class="aval-btn-novo-grupo" data-aval="btn-novo-grupo">
          + Novo condomínio
        </button>
        <button type="button" class="aval-btn-importar" data-aval="btn-importar"
                title="Cole Ctrl+V ou arraste screenshots de ZAP/VivaReal/OLX">
          📷 Importar via imagem
        </button>
      </div>
    </section>

    <div class="aval-modal" data-aval="modal" hidden aria-modal="true" role="dialog">
      <div class="aval-modal-backdrop" data-aval-fechar></div>
      <div class="aval-modal-content">

        <div class="aval-modal-fase" data-fase="upload">
          <header class="aval-modal-header">
            <h3>Importar amostras de imagem</h3>
            <button type="button" class="aval-modal-fechar" data-aval-fechar aria-label="Fechar">×</button>
          </header>
          <div class="aval-modal-body">
            <p class="aval-modal-dica">
              Cole (<kbd>Ctrl+V</kbd>), arraste imagens, ou clique pra selecionar.
              Funciona com screenshots de ZAP, VivaReal, OLX.
              Máximo 10 imagens por vez.
            </p>
            <div class="aval-modal-dropzone" data-aval="dropzone" tabindex="0">
              <input type="file" data-aval="file-input" accept="image/*" multiple hidden />
              <div class="aval-modal-thumbs" data-aval="thumbs"></div>
              <div class="aval-modal-dropzone-empty" data-aval="dropzone-empty">
                <span aria-hidden="true" class="aval-modal-dz-icon">📷</span>
                <span>
                  Arraste imagens aqui, cole com <kbd>Ctrl+V</kbd>,
                  ou <a href="#" data-aval="pick-file">clique pra selecionar</a>
                </span>
              </div>
            </div>
          </div>
          <footer class="aval-modal-actions">
            <button type="button" class="btn-secundario" data-aval-fechar>Cancelar</button>
            <button type="button" class="btn-primario" data-aval="btn-processar" disabled>
              Processar →
            </button>
          </footer>
        </div>

        <div class="aval-modal-fase" data-fase="processando" hidden>
          <header class="aval-modal-header">
            <h3>Processando…</h3>
          </header>
          <div class="aval-modal-body aval-modal-loading">
            <div class="aval-modal-spinner" aria-hidden="true"></div>
            <p data-aval="loading-msg">Lendo as imagens e extraindo amostras…</p>
            <p class="aval-modal-dica">Cada imagem leva 10–30s no modelo. Não feche essa janela.</p>
          </div>
        </div>

        <div class="aval-modal-fase" data-fase="preview" hidden>
          <header class="aval-modal-header">
            <h3 data-aval="preview-titulo">Amostras encontradas</h3>
            <button type="button" class="aval-modal-fechar" data-aval-fechar aria-label="Fechar">×</button>
          </header>
          <div class="aval-modal-body">
            <div data-aval="preview-avisos" class="aval-avisos" hidden></div>
            <div class="aval-modal-grupo-picker">
              <label>Adicionar em:</label>
              <select data-aval="grupo-destino"></select>
              <input type="text" data-aval="novo-grupo-nome"
                     placeholder="Nome do novo grupo" hidden />
            </div>
            <div class="aval-preview-table-wrap">
              <table class="aval-preview-table">
                <thead data-aval="preview-thead"></thead>
                <tbody data-aval="preview-tbody"></tbody>
              </table>
            </div>
          </div>
          <footer class="aval-modal-actions">
            <button type="button" class="btn-secundario" data-aval="btn-voltar">← Voltar</button>
            <button type="button" class="btn-secundario" data-aval-fechar>Cancelar</button>
            <button type="button" class="btn-primario" data-aval="btn-confirmar">
              ✓ Adicionar amostras
            </button>
          </footer>
        </div>

      </div>
    </div>

    <div class="aval-medias-banner" data-aval="medias-banner" hidden></div>

    <div class="acoes">
      <button type="button" class="btn-primario" data-aval="btn-calcular">Calcular valor estimado</button>
      <button type="button" class="btn-secundario" data-aval="btn-limpar">Limpar</button>
      <span class="erro" data-aval="erro" hidden></span>
    </div>

    <section class="aval-section" data-aval="resultado-section" hidden>
      <h2 class="aval-section-title">Resultado</h2>
      <div data-aval="resultado-content"></div>
    </section>
  `;

  // ═══════════════════════════════════════════════════════════════════════
  // Instância
  // ═══════════════════════════════════════════════════════════════════════
  class AvaliacaoInstance {
    constructor(root, opts = {}) {
      this.root = root;
      this.opts = opts;
      this.tipoAtivo = 1;
      this.grupos = [];
      this.avaliando = {};
      this.nextVizId = 1;
      this.ultimoResultado = null;   // { sumario, html }
      this.colsOcultas = new Set(COLS_OCULTAS_DEFAULT);  // ids de colunas ocultas pelo usuário

      this.modalArquivos = [];
      this.modalPreview  = null;

      root.innerHTML = TEMPLATE;
      this._bindEventos();

      if (opts.initialState && (opts.initialState.grupos?.length || opts.initialState.avaliando)) {
        this._carregarEstado(opts.initialState);
      } else {
        this._inicializar();
      }
    }

    $(sel)  { return this.root.querySelector(sel); }
    $$(sel) { return [...this.root.querySelectorAll(sel)]; }
    $a(name){ return this.root.querySelector(`[data-aval="${name}"]`); }

    // ── Bind de eventos ────────────────────────────────────────────────
    _bindEventos() {
      this.$$('.aval-tipo-btn').forEach(btn =>
        btn.addEventListener('click', () => this.selecionarTipo(Number(btn.dataset.tipo))));
      this.$a('btn-calcular').addEventListener('click', () => this.calcular());
      this.$a('btn-limpar').addEventListener('click', () => this.limpar());
      this.$a('btn-novo-grupo').addEventListener('click', () => this.adicionarGrupoVizinho());

      // ── Modal de importação ────────────────────────────────────────
      this.$a('btn-importar').addEventListener('click', () => this._abrirModal());
      this.$$('[data-aval-fechar]').forEach(el =>
        el.addEventListener('click', () => this._fecharModal()));
      this.$a('pick-file').addEventListener('click', e => {
        e.preventDefault();
        this.$a('file-input').click();
      });
      this.$a('file-input').addEventListener('change', e => {
        this._handleArquivos(e.target.files);
        e.target.value = '';
      });
      this.$a('btn-processar').addEventListener('click', () => this._processarImagens());
      this.$a('btn-voltar').addEventListener('click', () => this._mostrarFase('upload'));
      this.$a('btn-confirmar').addEventListener('click', () => this._confirmarImportacao());

      const dz = this.$a('dropzone');
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault();
        dz.classList.add('drag-over');
      }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault();
        if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('drag-over');
      }));
      dz.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) this._handleArquivos(e.dataTransfer.files);
      });

      // Paste global — só intercepta se o root estiver visível (offsetParent != null)
      document.addEventListener('paste', e => {
        if (!this.root.isConnected || this.root.offsetParent == null) return;
        const items = [...(e.clipboardData?.items || [])];
        const imgs = items.filter(it => it.kind === 'file' && it.type.startsWith('image/'));
        if (!imgs.length) return;
        e.preventDefault();
        const arqs = imgs.map(it => it.getAsFile()).filter(Boolean);
        if (this.$a('modal').hidden) this._abrirModal();
        this._handleArquivos(arqs);
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !this.$a('modal').hidden) this._fecharModal();
      });

      this.$a('grupo-destino').addEventListener('change', e => {
        const novo = this.$a('novo-grupo-nome');
        novo.hidden = e.target.value !== '__novo__';
        if (!novo.hidden) novo.focus();
      });

      // Atualiza banner de médias ao vivo conforme o usuário edita as células
      // (inputs numéricos da tabela). Delegação no root pra pegar tudo.
      this.root.addEventListener('input', e => {
        if (e.target.classList?.contains('aval-inp')) {
          this._renderMedias();
        }
      });
    }

    // ── Bootstrap ──────────────────────────────────────────────────────
    _inicializar() {
      const t = TIPOS[this.tipoAtivo];
      this.grupos = [
        { id: 'alvo',   papel: 'alvo',   nome: t.alvoNome,        amostras: [] },
        { id: 'outros', papel: 'outros', nome: 'Outros (avulsos)', amostras:
            Array.from({ length: LINHAS_INICIAIS_OUTROS }, () => ({})) },
      ];
      this.avaliando = {};
      this.nextVizId = 1;
      this.ultimoResultado = null;
      this.colsOcultas = new Set(COLS_OCULTAS_DEFAULT);
      this.$a('resultado-section').hidden = true;
      this._sincronizarTipoTabs();
      this.renderizar();
    }

    _carregarEstado(estado) {
      this.tipoAtivo = estado.tipo || 1;
      this.grupos = (estado.grupos && estado.grupos.length) ? estado.grupos : null;
      this.avaliando = estado.avaliando || {};
      this.nextVizId = estado.nextVizId || 1;
      this.ultimoResultado = estado.resultado || null;
      this.colsOcultas = new Set(
        Array.isArray(estado.colsOcultas) ? estado.colsOcultas : COLS_OCULTAS_DEFAULT
      );
      this.colsOcultas.delete('area');  // area é fixa, nunca ocultada
      this._sincronizarTipoTabs();
      if (!this.grupos) {
        // Fallback: inicializa do zero mantendo só o tipo
        this._inicializar();
        return;
      }
      this.renderizar();
      if (this.ultimoResultado?.html) {
        const sec = this.$a('resultado-section');
        sec.hidden = false;
        this.$a('resultado-content').innerHTML = this.ultimoResultado.html;
      }
    }

    obterEstado() {
      return {
        tipo: this.tipoAtivo,
        grupos: this.grupos,
        avaliando: this.avaliando,
        nextVizId: this.nextVizId,
        resultado: this.ultimoResultado,
        colsOcultas: [...this.colsOcultas],
      };
    }

    _colsVisiveis() {
      return TIPOS[this.tipoAtivo].colunas.filter(c => !this.colsOcultas.has(c.id));
    }

    _renderMedias() {
      const banner = this.$a('medias-banner');
      if (!banner) return;
      const area = this.avaliando.area;
      if (!area || area <= 0) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
      }

      const calcVU = (amostras) => {
        const vus = amostras
          .filter(am => am.area > 0 && am.valor > 0)
          .map(am => (am.valor * (am.fator ?? 0.95)) / am.area);
        if (!vus.length) return null;
        const media = vus.reduce((a, b) => a + b, 0) / vus.length;
        return { vu: media, n: vus.length };
      };

      const alvo = this.grupos.find(g => g.papel === 'alvo');
      const todasAmostras = this.grupos.flatMap(g => g.amostras);

      const mediaAlvo  = alvo ? calcVU(alvo.amostras) : null;
      const mediaGeral = calcVU(todasAmostras);
      const inferencia = this.ultimoResultado?.sumario;

      const boxes = [];
      if (mediaAlvo) {
        boxes.push({
          label: 'Média no condomínio',
          valor: fmt(mediaAlvo.vu * area),
          detalhe: `${mediaAlvo.n} amostra(s) · ${fmt(mediaAlvo.vu)}/m²`,
        });
      } else {
        boxes.push({
          label: 'Média no condomínio',
          valor: '—',
          detalhe: 'sem amostras com área+valor',
        });
      }
      if (mediaGeral) {
        boxes.push({
          label: 'Média geral',
          valor: fmt(mediaGeral.vu * area),
          detalhe: `${mediaGeral.n} amostra(s) · ${fmt(mediaGeral.vu)}/m²`,
        });
      } else {
        boxes.push({
          label: 'Média geral',
          valor: '—',
          detalhe: 'sem amostras com área+valor',
        });
      }
      if (inferencia?.vCentral) {
        boxes.push({
          label: 'Inferência (OLS)',
          valor: fmt(inferencia.vCentral),
          detalhe: inferencia.grauLabel || '',
        });
      } else {
        boxes.push({
          label: 'Inferência (OLS)',
          valor: '—',
          detalhe: 'rode "Calcular valor estimado"',
        });
      }

      banner.hidden = false;
      banner.innerHTML = boxes.map(b => `
        <div class="aval-media-box">
          <span class="aval-media-label">${b.label}</span>
          <span class="aval-media-valor">${b.valor}</span>
          <span class="aval-media-detalhe">${b.detalhe}</span>
        </div>
      `).join('');
    }

    _sincronizarTipoTabs() {
      this.$$('.aval-tipo-btn').forEach(btn => {
        const sel = Number(btn.dataset.tipo) === this.tipoAtivo;
        btn.classList.toggle('ativo', sel);
        btn.setAttribute('aria-selected', String(sel));
      });
    }

    _notifyChange() {
      this.opts.onStateChange?.(this.obterEstado());
    }

    // ── Tipo ───────────────────────────────────────────────────────────
    selecionarTipo(tipo) {
      this.tipoAtivo = tipo;
      this._inicializar();
    }

    // ── Render ─────────────────────────────────────────────────────────
    renderizar() {
      this._renderColToggles();
      const container = this.$a('grupos-container');
      container.innerHTML = '';
      this.grupos.forEach(g => container.appendChild(this._renderGrupo(g)));
      this.$a('btn-novo-grupo').textContent =
        `+ Novo ${TIPOS[this.tipoAtivo].grupoLabel}`;
      this._renderMedias();
    }

    _renderColToggles() {
      const cont = this.$a('col-toggles');
      if (!cont) return;
      const cols = TIPOS[this.tipoAtivo].colunas;
      // area é fixa — denominador do R$/m². Valor e fator são output, nem
      // entram na lista. Só mostramos os parâmetros explicativos.
      const togglaveis = cols.filter(c => c.id !== 'area');
      const fixos = ['Área (m²)', 'Valor', 'Fator'];

      cont.innerHTML = `
        ${togglaveis.map(c => {
          const ativo = !this.colsOcultas.has(c.id);
          return `
            <label class="aval-col-toggle ${ativo ? 'ativo' : ''}"
                   title="Clique para ligar/desligar essa coluna">
              <input type="checkbox" data-col-id="${c.id}" ${ativo ? 'checked' : ''} />
              <span>${c.label}</span>
            </label>`;
        }).join('')}
        <span class="aval-col-fixos" title="Colunas estruturais — sempre presentes">
          🔒 fixos: ${fixos.join(' · ')}
        </span>
      `;
      cont.querySelectorAll('input[type=checkbox]').forEach(inp => {
        inp.addEventListener('change', () => {
          const id = inp.dataset.colId;
          if (inp.checked) this.colsOcultas.delete(id);
          else this.colsOcultas.add(id);
          this.renderizar();
          this._notifyChange();
        });
      });
    }

    _renderGrupo(grupo) {
      const cols = this._colsVisiveis();
      const t = TIPOS[this.tipoAtivo];

      const wrap = document.createElement('div');
      wrap.className = `aval-grupo aval-grupo-${grupo.papel}`;
      wrap.dataset.grupoId = grupo.id;

      const header = wrap.appendChild(document.createElement('div'));
      header.className = 'aval-grupo-header';

      const icone = grupo.papel === 'alvo'   ? '🏠'
                  : grupo.papel === 'outros' ? '🌐'
                                              : t.iconeVizinho;

      const tituloDiv = header.appendChild(document.createElement('div'));
      tituloDiv.className = 'aval-grupo-titulo';

      const icSpan = tituloDiv.appendChild(document.createElement('span'));
      icSpan.className = 'aval-grupo-icone';
      icSpan.textContent = icone;

      if (grupo.papel === 'vizinho') {
        const inp = tituloDiv.appendChild(document.createElement('input'));
        inp.type        = 'text';
        inp.className   = 'aval-grupo-nome-edit';
        inp.value       = grupo.nome;
        inp.placeholder = `Nome do ${t.grupoLabel}`;
        inp.addEventListener('input', () => { grupo.nome = inp.value; });

        const btnRem = header.appendChild(document.createElement('button'));
        btnRem.type      = 'button';
        btnRem.className = 'aval-grupo-remover';
        btnRem.textContent = '× remover grupo';
        btnRem.title     = 'Remover este grupo e suas amostras';
        btnRem.addEventListener('click', () => this._removerGrupo(grupo.id));
      } else {
        const lbl = tituloDiv.appendChild(document.createElement('span'));
        lbl.className   = 'aval-grupo-nome-fixo';
        lbl.textContent = grupo.nome;
        if (grupo.papel === 'alvo') {
          const hint = tituloDiv.appendChild(document.createElement('span'));
          hint.className = 'aval-grupo-hint';
          hint.textContent = '— amostras desse mesmo condomínio (≥ 3 ativa o efeito)';
        }
      }

      const tableWrap = wrap.appendChild(document.createElement('div'));
      tableWrap.className = 'aval-table-wrap';

      const table = tableWrap.appendChild(document.createElement('table'));
      table.className = 'aval-table';

      const thead = table.appendChild(document.createElement('thead'));
      thead.appendChild(this._criarHeaderRow(cols));

      const tbody = table.appendChild(document.createElement('tbody'));

      if (grupo.papel === 'alvo') {
        tbody.appendChild(this._criarLinhaAvaliando(cols));
      }
      grupo.amostras.forEach((am, idx) => {
        tbody.appendChild(this._criarLinhaAmostra(grupo, am, idx, cols));
      });
      tbody.appendChild(this._criarLinhaAdd(grupo, cols.length + 3));

      return wrap;
    }

    _criarHeaderRow(cols) {
      const tr = document.createElement('tr');
      const headerCell = c => `<th title="${escapeAttr(c.tip)}"><span>${c.label}</span></th>`;
      const fatorCell = `
        <th title="${escapeAttr(TIPS.fator)}">
          <span>Fator</span>
          <span class="aval-fator-info" tabindex="0" role="button"
                aria-label="O que é o fator"
                title="${escapeAttr(TIPS.fator)}">ℹ</span>
        </th>`;
      tr.innerHTML = `
        <th class="aval-col-del" aria-label="Linha"></th>
        ${cols.map(headerCell).join('')}
        ${headerCell({ label: 'Valor oferta (R$)', tip: TIPS.valor })}
        ${fatorCell}
      `;
      return tr;
    }

    _criarLinhaAvaliando(cols) {
      const tr = document.createElement('tr');
      tr.className = 'aval-row-avaliando';

      const tdMark = tr.appendChild(document.createElement('td'));
      tdMark.className = 'aval-col-del aval-avaliando-mark';
      tdMark.title = 'Imóvel sendo avaliado';
      tdMark.textContent = '🏠';

      cols.forEach(col => {
        const td = tr.appendChild(document.createElement('td'));
        td.appendChild(makeNumInput(
          this.avaliando[col.id],
          v => { this.avaliando[col.id] = v; },
          '—'
        ));
      });

      tr.appendChild(disabledCell());
      tr.appendChild(disabledCell());
      return tr;
    }

    _criarLinhaAmostra(grupo, am, idx, cols) {
      const tr = document.createElement('tr');

      const tdDel = tr.appendChild(document.createElement('td'));
      tdDel.className = 'aval-col-del';
      const btnDel = tdDel.appendChild(document.createElement('button'));
      btnDel.type      = 'button';
      btnDel.className = 'btn-icone btn-remover';
      btnDel.textContent = '×';
      btnDel.title     = 'Remover linha';
      btnDel.addEventListener('click', () => {
        grupo.amostras.splice(idx, 1);
        this.renderizar();
      });

      cols.forEach(col => {
        const td = tr.appendChild(document.createElement('td'));
        td.appendChild(makeNumInput(am[col.id], v => { grupo.amostras[idx][col.id] = v; }));
      });

      const tdVal = tr.appendChild(document.createElement('td'));
      tdVal.appendChild(makeNumInput(am.valor, v => { grupo.amostras[idx].valor = v; }, 'ex: 350000'));

      const tdFat = tr.appendChild(document.createElement('td'));
      const inpFat = tdFat.appendChild(makeNumInput(am.fator, v => { grupo.amostras[idx].fator = v; }, '0,95'));
      inpFat.step = '0.01';
      inpFat.min  = '0.5';
      inpFat.max  = '1.0';

      return tr;
    }

    _criarLinhaAdd(grupo, colspan) {
      const tr = document.createElement('tr');
      tr.className = 'aval-row-add';
      const td = tr.appendChild(document.createElement('td'));
      td.colSpan = colspan;
      const btn = td.appendChild(document.createElement('button'));
      btn.type        = 'button';
      btn.className   = 'aval-btn-add';
      btn.textContent = '+ Adicionar amostra';
      btn.addEventListener('click', () => this._adicionarAmostra(grupo.id));
      return tr;
    }

    _adicionarAmostra(grupoId) {
      const grupo = this.grupos.find(g => g.id === grupoId);
      if (!grupo) return;

      const nova = {};
      const cols = TIPOS[this.tipoAtivo].colunas;

      // Vizinho herda só da PRIMEIRA linha da própria tabela (UX de comparar
      // diferenças). Alvo NÃO herda do avaliando — esses são imóveis distintos
      // que por acaso estão no mesmo condomínio.
      if (grupo.papel === 'vizinho' && grupo.amostras.length > 0) {
        const base = grupo.amostras[0];
        for (const col of cols) {
          if (base[col.id] != null) nova[col.id] = base[col.id];
        }
      }

      grupo.amostras.push(nova);
      this.renderizar();

      const wrap = this.root.querySelector(`[data-grupo-id="${grupoId}"]`);
      const novaLinha = wrap?.querySelector('tbody tr:nth-last-child(2)');
      const primeiroVazio = [...(novaLinha?.querySelectorAll('input[type=number]') || [])]
        .find(i => !i.value);
      primeiroVazio?.focus();
    }

    adicionarGrupoVizinho() {
      const id = `vz${this.nextVizId++}`;
      const novo = {
        id,
        papel: 'vizinho',
        nome: '',
        amostras: [{}],
      };
      const idxOutros = this.grupos.findIndex(g => g.papel === 'outros');
      this.grupos.splice(idxOutros, 0, novo);
      this.renderizar();

      this.root.querySelector(`[data-grupo-id="${id}"] .aval-grupo-nome-edit`)?.focus();
    }

    _removerGrupo(grupoId) {
      this.grupos = this.grupos.filter(g => g.id !== grupoId);
      this.renderizar();
    }

    limpar() {
      this._inicializar();
      this.$a('erro').hidden = true;
      this._notifyChange();
    }

    _mostrarErro(msg) {
      const el = this.$a('erro');
      el.textContent = msg;
      el.hidden = false;
    }

    _esconderErro() {
      this.$a('erro').hidden = true;
    }

    // ── Cálculo (idêntico ao original, scoped à instância) ─────────────
    calcular() {
      this._esconderErro();

      const tipo = TIPOS[this.tipoAtivo];
      const cols = this._colsVisiveis();

      if (!this.avaliando.area || this.avaliando.area <= 0) {
        return this._mostrarErro('Preencha a Área do imóvel avaliando.');
      }

      const todasAmostras = [];
      const contagemPorGrupo = {};
      for (const g of this.grupos) {
        const validas = g.amostras.filter(am =>
          am.area > 0 && am.valor > 0 && am.area != null && am.valor != null);
        contagemPorGrupo[g.id] = { papel: g.papel, nome: g.nome, total: validas.length };
        validas.forEach(am => todasAmostras.push({ ...am, _grupo: g.id }));
      }

      if (todasAmostras.length < 3) {
        return this._mostrarErro('Preencha pelo menos 3 amostras (com Área e Valor) no total.');
      }

      const gruposComDummy = {};
      const avisos = [];
      for (const g of this.grupos) {
        if (g.papel === 'outros') continue;
        const cnt = contagemPorGrupo[g.id].total;
        if (cnt >= 3) {
          gruposComDummy[g.id] = {
            protegida: g.papel === 'alvo',
            nome: g.nome,
            papel: g.papel,
          };
        } else if (cnt > 0) {
          const tipoLbl = g.papel === 'alvo' ? 'alvo' : 'vizinho';
          avisos.push(`Grupo ${tipoLbl} "${g.nome}" tem só ${cnt} amostra(s) — agrupado com "Outros" no modelo (mínimo 3 para criar dummy).`);
        }
      }

      const alvoSemDummy = !gruposComDummy['alvo'];
      if (alvoSemDummy) {
        avisos.push('Sem amostras suficientes no condomínio do avaliando — o valor central reflete a média do mercado, sem prêmio/desconto do condomínio.');
      }

      const dummyIds = Object.keys(gruposComDummy);
      todasAmostras.forEach(am => {
        for (const gid of dummyIds) {
          am[`cond_${gid}`] = am._grupo === gid ? 1 : 0;
        }
      });

      const colunasTratadas = {};
      for (const col of cols) {
        const vals = todasAmostras.map(am => am[col.id]).filter(v => v != null && isFinite(v));
        if (vals.length < 2) { colunasTratadas[col.id] = null; continue; }
        const mediana = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
        colunasTratadas[col.id] = mediana;
      }
      const colsAtivas = cols.filter(c => colunasTratadas[c.id] !== null);
      if (colsAtivas.length === 0) {
        return this._mostrarErro('Nenhuma coluna com dados suficientes além de área e valor.');
      }

      const lnVU = todasAmostras.map(am => {
        const fator = am.fator ?? 0.95;
        return Math.log((am.valor * fator) / am.area);
      });

      const features = todasAmostras.map(am => {
        const f = {};
        for (const col of colsAtivas) {
          const v = am[col.id] ?? colunasTratadas[col.id];
          f[col.id] = col.log ? Math.log(Math.max(v, 0.1)) : v;
        }
        for (const gid of dummyIds) {
          f[`cond_${gid}`] = am[`cond_${gid}`];
        }
        return f;
      });

      const comVariancia = (name) => {
        const vals = features.map(f => f[name]);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return vals.reduce((s, x) => s + (x - mean) ** 2, 0) > 1e-10;
      };

      let activeVars = [
        ...colsAtivas.filter(c => comVariancia(c.id)).map(c => c.id),
        ...dummyIds.filter(gid => comVariancia(`cond_${gid}`)).map(gid => `cond_${gid}`),
      ];

      const protegidas = dummyIds
        .filter(gid => gruposComDummy[gid].protegida && comVariancia(`cond_${gid}`))
        .map(gid => `cond_${gid}`);

      const buildX = vars => features.map(f => [1, ...vars.map(n => f[n])]);
      let model;
      for (;;) {
        const X = buildX(activeVars);
        model = ols(X, lnVU);

        if (!model) {
          let removed = false;
          for (let i = activeVars.length - 1; i >= 0; i--) {
            if (!protegidas.includes(activeVars[i])) {
              activeVars.splice(i, 1); removed = true; break;
            }
          }
          if (!removed) return this._mostrarErro('Amostras insuficientes mesmo com as variáveis mínimas.');
          continue;
        }

        let worstIdx = -1, worstP = 0.20;
        for (let i = 0; i < activeVars.length; i++) {
          if (protegidas.includes(activeVars[i])) continue;
          const p = model.pval[i + 1];
          if (p > worstP) { worstP = p; worstIdx = i; }
        }
        if (worstIdx === -1) break;
        activeVars.splice(worstIdx, 1);
      }

      const subjFeat = {};
      for (const col of colsAtivas) {
        const v = this.avaliando[col.id] ?? colunasTratadas[col.id];
        subjFeat[col.id] = col.log ? Math.log(Math.max(v, 0.1)) : v;
      }
      for (const gid of dummyIds) {
        subjFeat[`cond_${gid}`] = (gid === 'alvo') ? 1 : 0;
      }

      const xNew = [1, ...activeVars.map(n => subjFeat[n])];
      const pred = predictInterval(model, xNew, 0.20);

      const area = this.avaliando.area;
      const vCentral = Math.exp(pred.central) * area;
      const vMin     = Math.exp(pred.lower)   * area;
      const vMax     = Math.exp(pred.upper)   * area;
      const amplitude = (vMax - vMin) / vCentral;

      const gruposReport = this.grupos
        .filter(g => g.papel !== 'outros')
        .map(g => {
          const cnt = contagemPorGrupo[g.id]?.total ?? 0;
          const varName = `cond_${g.id}`;
          const incluso = gruposComDummy[g.id] != null;
          const inModel = activeVars.includes(varName);
          let premio = null, pval = null, removidoPeloStepwise = false;
          if (inModel) {
            const idx = activeVars.indexOf(varName);
            const coef = model.beta[idx + 1];
            premio = (Math.exp(coef) - 1) * 100;
            pval = model.pval[idx + 1];
          } else if (incluso) {
            removidoPeloStepwise = true;
          }
          return {
            nome: g.nome || `(${TIPOS[this.tipoAtivo].grupoLabel} sem nome)`,
            papel: g.papel,
            amostras: cnt,
            incluso,
            premio,
            pval,
            removidoPeloStepwise,
          };
        });

      const allColMap = Object.fromEntries(cols.map(c => [c.id, c]));

      this._mostrarResultado({
        model, activeVars, allColMap,
        vCentral, vMin, vMax, amplitude,
        avisos, gruposReport,
      });
    }

    _mostrarResultado({ model, activeVars, allColMap, vCentral, vMin, vMax, amplitude, avisos, gruposReport }) {
      let grauLabel, grauClasse;
      if      (amplitude <= 0.15) { grauLabel = 'III — Alta precisão';      grauClasse = 'ok';   }
      else if (amplitude <= 0.30) { grauLabel = 'II — Boa precisão';        grauClasse = 'warn'; }
      else if (amplitude <= 0.50) { grauLabel = 'I — Precisão limitada';    grauClasse = '';     }
      else                        { grauLabel = 'Insuficiente (>50%)';       grauClasse = 'fail'; }

      const varLabels = ['Intercepto', ...activeVars.map(n => {
        if (n.startsWith('cond_')) {
          const gid = n.slice(5);
          const grpState = this.grupos.find(gr => gr.id === gid);
          return `Cond. "${grpState?.nome ?? gid}"`;
        }
        const col = allColMap[n];
        if (!col) return n;
        return col.log ? `ln(${col.label})` : col.label;
      })];

      const coefRows = model.beta.map((b, i) => `
        <tr>
          <td>${varLabels[i]}</td>
          <td class="num">${b.toFixed(4)}</td>
          <td class="num">${model.tstat[i].toFixed(2)}</td>
          <td class="num">${model.pval[i].toFixed(3)}</td>
        </tr>`).join('');

      const gruposRows = gruposReport.map(gr => {
        let status, premioFmt = '—';
        if (!gr.incluso) {
          status = `<span class="badge badge-neutro">agrupado com Outros (${gr.amostras} amostra(s))</span>`;
        } else if (gr.removidoPeloStepwise) {
          status = `<span class="badge badge-neutro">indistinguível de Outros (p &gt; 0,20)</span>`;
        } else {
          const sig = gr.pval < 0.05 ? ' significativo' :
                      gr.pval < 0.20 ? ' marginal'      :
                                       ' não significativo';
          const cls = gr.pval < 0.05 ? 'badge-ok'
                    : gr.pval < 0.20 ? 'badge-pendente'
                    :                  'badge-neutro';
          status = `<span class="badge ${cls}">p = ${gr.pval.toFixed(3)}${sig}</span>`;
          premioFmt = `${gr.premio >= 0 ? '+' : ''}${gr.premio.toFixed(1)}%`;
        }
        const papelIcone = gr.papel === 'alvo' ? '🏠' : '🏢';
        return `<tr>
          <td>${papelIcone} ${escapeHtml(gr.nome)}</td>
          <td class="num">${gr.amostras}</td>
          <td class="num">${premioFmt}</td>
          <td>${status}</td>
        </tr>`;
      }).join('');

      const gruposBlock = gruposReport.length ? `
        <h3 class="aval-resultado-h3">Prêmio/desconto por condomínio (vs. Outros)</h3>
        <table class="resultado-tabela aval-grupos-table">
          <thead>
            <tr>
              <th>Grupo</th>
              <th class="num">Amostras</th>
              <th class="num">Prêmio</th>
              <th>Significância</th>
            </tr>
          </thead>
          <tbody>${gruposRows}</tbody>
        </table>` : '';

      const avisosBlock = avisos.length ? `
        <div class="aval-avisos">
          <strong>⚠ Avisos:</strong>
          <ul>${avisos.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        </div>` : '';

      const html = `
        <div class="resultado-box ${grauClasse}" style="margin-bottom:1rem">
          <p class="resultado-titulo">${fmt(vCentral)}</p>
          <table class="resultado-tabela">
            <tr><th>Intervalo 80%</th><td>${fmt(vMin)} — ${fmt(vMax)}</td></tr>
            <tr><th>Amplitude</th>    <td>${(amplitude * 100).toFixed(1)}% do valor central</td></tr>
            <tr><th>Grau de precisão</th><td>${grauLabel}</td></tr>
            <tr><th>R² ajustado</th>  <td>${(model.r2adj * 100).toFixed(1)}%</td></tr>
            <tr><th>Amostras / vars</th><td>${model.n} amostras, ${model.k - 1} variável(is) + intercepto</td></tr>
          </table>
        </div>
        ${avisosBlock}
        ${gruposBlock}
        <details class="aval-detalhes">
          <summary>Coeficientes do modelo</summary>
          <table class="resultado-tabela aval-coef-table">
            <thead>
              <tr><th>Variável</th><th class="num">Coef.</th><th class="num">t</th><th class="num">p-valor</th></tr>
            </thead>
            <tbody>${coefRows}</tbody>
          </table>
        </details>`;

      this.$a('resultado-content').innerHTML = html;
      const sec = this.$a('resultado-section');
      sec.hidden = false;
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const sumario = {
        vCentral, vMin, vMax, amplitude, grauLabel,
        calculadoEm: new Date().toISOString(),
      };
      this.ultimoResultado = { sumario, html };

      this.opts.onCalcular?.(sumario);
      this._notifyChange();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Importação de amostras via screenshots
    // ═══════════════════════════════════════════════════════════════════
    _abrirModal() {
      this.modalArquivos = [];
      this.modalPreview  = null;
      this._renderThumbs();
      this._mostrarFase('upload');
      this.$a('modal').hidden = false;
    }

    _fecharModal() {
      this.$a('modal').hidden = true;
      this.modalArquivos = [];
      this.modalPreview  = null;
    }

    _mostrarFase(fase) {
      this.$$('[data-fase]').forEach(f => { f.hidden = f.dataset.fase !== fase; });
    }

    _handleArquivos(arquivos) {
      for (const a of arquivos) {
        if (!a.type.startsWith('image/')) continue;
        if (this.modalArquivos.length >= 10) {
          alert('Máximo 10 imagens por importação. Faça em lotes se precisar.');
          break;
        }
        this.modalArquivos.push(a);
      }
      this._renderThumbs();
      this.$a('btn-processar').disabled = this.modalArquivos.length === 0;
    }

    _renderThumbs() {
      const cont  = this.$a('thumbs');
      const vazio = this.$a('dropzone-empty');
      cont.innerHTML = '';
      if (!this.modalArquivos.length) {
        vazio.hidden = false;
        return;
      }
      vazio.hidden = true;
      this.modalArquivos.forEach((arq, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'aval-modal-thumb';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(arq);
        img.alt = `Imagem ${i + 1}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aval-modal-thumb-remover';
        btn.textContent = '×';
        btn.title = 'Remover';
        btn.addEventListener('click', () => {
          this.modalArquivos.splice(i, 1);
          this._renderThumbs();
          this.$a('btn-processar').disabled = this.modalArquivos.length === 0;
        });
        thumb.append(img, btn);
        cont.appendChild(thumb);
      });
    }

    async _processarImagens() {
      if (!this.modalArquivos.length) return;
      this.$a('loading-msg').textContent =
        `Lendo ${this.modalArquivos.length} imagem(ns) e extraindo amostras…`;
      this._mostrarFase('processando');

      const fd = new FormData();
      fd.append('tipo', String(this.tipoAtivo));
      this.modalArquivos.forEach(arq => fd.append('imagens', arq));

      try {
        const base = (window.API_BASE ?? '');
        const resp = await fetch(`${base}/api/parse-amostras`, { method: 'POST', body: fd });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ erro: `HTTP ${resp.status}` }));
          alert(`Falha ao processar: ${err.erro || 'erro desconhecido'}`);
          this._mostrarFase('upload');
          return;
        }
        this.modalPreview = await resp.json();
        if (!this.modalPreview.amostras?.length) {
          const msg = this.modalPreview.avisos?.length
            ? this.modalPreview.avisos.join('\n')
            : 'Nenhuma amostra extraída.';
          alert('Nenhuma amostra encontrada nas imagens.\n\n' + msg);
          this._mostrarFase('upload');
          return;
        }
        this._renderPreview();
        this._mostrarFase('preview');
      } catch (e) {
        alert(`Erro de rede: ${e.message}`);
        this._mostrarFase('upload');
      }
    }

    _renderPreview() {
      const cols = TIPOS[this.tipoAtivo].colunas;
      const n = this.modalPreview.amostras.length;
      this.$a('preview-titulo').textContent =
        `${n} amostra(s) encontrada(s) em ${this.modalArquivos.length} imagem(ns)`;

      const avisosEl = this.$a('preview-avisos');
      if (this.modalPreview.avisos?.length) {
        avisosEl.hidden = false;
        avisosEl.innerHTML =
          '<strong>⚠ Avisos:</strong><ul>' +
          this.modalPreview.avisos.map(a => `<li>${escapeHtml(a)}</li>`).join('') +
          '</ul>';
      } else {
        avisosEl.hidden = true;
      }

      const thead = this.$a('preview-thead');
      thead.innerHTML = `
        <tr>
          <th><input type="checkbox" data-aval="preview-checkall" checked title="Marcar/desmarcar todas" /></th>
          ${cols.map(c => `<th title="${escapeAttr(c.tip)}">${c.label}</th>`).join('')}
          <th>Valor (R$)</th>
          <th>Origem</th>
        </tr>
      `;
      this.$a('preview-checkall').addEventListener('change', e => {
        this.root.querySelectorAll('.aval-preview-chk').forEach(c => { c.checked = e.target.checked; });
        this.modalPreview.amostras.forEach(a => { a._incluir = e.target.checked; });
      });

      const tbody = this.$a('preview-tbody');
      tbody.innerHTML = '';
      this.modalPreview.amostras.forEach(am => {
        am._incluir = true;
        const tr = tbody.appendChild(document.createElement('tr'));
        if (am._confianca != null && am._confianca < 0.7) {
          tr.classList.add('aval-preview-baixa-confianca');
        }

        const tdChk = tr.appendChild(document.createElement('td'));
        tdChk.style.textAlign = 'center';
        const chk = tdChk.appendChild(document.createElement('input'));
        chk.type = 'checkbox';
        chk.className = 'aval-preview-chk';
        chk.checked = true;
        chk.addEventListener('change', () => { am._incluir = chk.checked; });

        cols.forEach(col => {
          const td = tr.appendChild(document.createElement('td'));
          const inp = document.createElement('input');
          inp.type        = 'number';
          inp.className   = 'aval-preview-inp';
          inp.step        = 'any';
          inp.placeholder = '—';
          if (am[col.id] != null) inp.value = String(am[col.id]);
          inp.addEventListener('input', () => {
            am[col.id] = inp.value === '' ? null : Number(inp.value);
          });
          td.appendChild(inp);
        });

        const tdVal = tr.appendChild(document.createElement('td'));
        const inpVal = document.createElement('input');
        inpVal.type        = 'number';
        inpVal.className   = 'aval-preview-inp';
        inpVal.step        = 'any';
        inpVal.placeholder = '—';
        if (am.valor != null) inpVal.value = String(am.valor);
        inpVal.addEventListener('input', () => {
          am.valor = inpVal.value === '' ? null : Number(inpVal.value);
        });
        tdVal.appendChild(inpVal);

        const tdOrigem = tr.appendChild(document.createElement('td'));
        tdOrigem.className = 'aval-preview-origem';
        const idxImg = (am._origem_img ?? 0) + 1;
        const conf   = am._confianca != null ? ` · ${Math.round(am._confianca * 100)}%` : '';
        const end    = am._endereco_detectado ? ` · ${escapeHtml(am._endereco_detectado)}` : '';
        tdOrigem.innerHTML = `<small>img ${idxImg}${conf}${end}</small>`;
      });

      const select = this.$a('grupo-destino');
      select.innerHTML = '';
      const tipoCfg = TIPOS[this.tipoAtivo];
      this.grupos.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        const ic = g.papel === 'alvo' ? '🏠' : g.papel === 'outros' ? '🌐' : tipoCfg.iconeVizinho;
        opt.textContent = `${ic} ${g.nome || '(sem nome)'} (${g.amostras.length})`;
        select.appendChild(opt);
      });
      const optNovo = document.createElement('option');
      optNovo.value = '__novo__';
      optNovo.textContent = `+ Novo ${tipoCfg.grupoLabel}…`;
      select.appendChild(optNovo);

      select.value = 'outros';
      this.$a('novo-grupo-nome').hidden = true;
      this.$a('novo-grupo-nome').value = '';
    }

    _confirmarImportacao() {
      if (!this.modalPreview) return;

      const marcadas = this.modalPreview.amostras.filter(a => a._incluir);
      if (!marcadas.length) {
        alert('Nenhuma amostra marcada para adicionar.');
        return;
      }

      const destinoId = this.$a('grupo-destino').value;
      let grupoDest;

      if (destinoId === '__novo__') {
        const nome = this.$a('novo-grupo-nome').value.trim();
        if (!nome) {
          alert(`Dê um nome ao novo ${TIPOS[this.tipoAtivo].grupoLabel}.`);
          this.$a('novo-grupo-nome').focus();
          return;
        }
        const id = `vz${this.nextVizId++}`;
        grupoDest = { id, papel: 'vizinho', nome, amostras: [] };
        const idxOutros = this.grupos.findIndex(g => g.papel === 'outros');
        this.grupos.splice(idxOutros, 0, grupoDest);
      } else {
        grupoDest = this.grupos.find(g => g.id === destinoId);
        if (!grupoDest) {
          alert('Grupo destino inválido.');
          return;
        }
      }

      const cols = TIPOS[this.tipoAtivo].colunas;
      marcadas.forEach(am => {
        const nova = {};
        for (const col of cols) {
          if (am[col.id] != null && Number.isFinite(am[col.id])) nova[col.id] = am[col.id];
        }
        if (am.valor != null && Number.isFinite(am.valor)) nova.valor = am.valor;
        grupoDest.amostras.push(nova);
      });

      this.renderizar();
      this._fecharModal();

      const wrap = this.root.querySelector(`[data-grupo-id="${grupoDest.id}"]`);
      wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ── Helpers livres ─────────────────────────────────────────────────────
  function makeNumInput(currentVal, onChange, placeholder = '—') {
    const inp = document.createElement('input');
    inp.type        = 'number';
    inp.className   = 'aval-inp';
    inp.placeholder = placeholder;
    inp.step        = 'any';
    if (currentVal != null) inp.value = currentVal;
    inp.addEventListener('input', () => {
      onChange(inp.value === '' ? null : Number(inp.value));
    });
    return inp;
  }

  function disabledCell() {
    const td = document.createElement('td');
    td.className = 'aval-cell-disabled';
    td.innerHTML = '<span aria-hidden="true">—</span>';
    return td;
  }

  function escapeAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  // ── Matemática OLS ─────────────────────────────────────────────────────
  function lnGamma(z) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
               771.32342877765313, -176.61502916214059, 12.507343278686905,
               -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betaI(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
    const qab = a + b, qap = a + 1, qam = a - 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b)
                        + a * Math.log(x) + b * Math.log(1 - x));
    const cf = (aa, bb, xx) => {
      let c = 1, d = 1 - qab * xx / qap;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      d = 1 / d; let h = d;
      for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let av = m * (bb - m) * xx / ((qam + m2) * (aa + m2));
        d = 1 + av * d; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + av / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d; h *= d * c;
        av = -(aa + m) * (qab + m) * xx / ((aa + m2) * (qap + m2));
        d = 1 + av * d; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + av / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d; const del = d * c; h *= del;
        if (Math.abs(del - 1) < EPS) break;
      }
      return h;
    };
    if (x < (a + 1) / (a + b + 2)) return bt * cf(a, b, x) / a;
    return 1 - bt * cf(b, a, 1 - x) / b;
  }

  function tPvalue(t, df) {
    if (df <= 0) return 1;
    return betaI(df / (df + t * t), df / 2, 0.5);
  }

  function tQuantile(alpha, df) {
    let lo = 0, hi = 30;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (tPvalue(mid, df) > alpha) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function matMul(A, B) {
    const m = A.length, n = B[0].length, p = B.length;
    return Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (__, j) =>
        A[i].reduce((s, v, k) => s + v * B[k][j], 0)));
  }

  function matT(A) {
    return A[0].map((_, j) => A.map(r => r[j]));
  }

  function matInv(A) {
    const n = A.length;
    const aug = A.map((row, i) => {
      const e = new Array(n).fill(0); e[i] = 1;
      return [...row, ...e];
    });
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++)
        if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
      [aug[col], aug[piv]] = [aug[piv], aug[col]];
      const p = aug[col][col];
      if (Math.abs(p) < 1e-14) return null;
      for (let j = 0; j < 2 * n; j++) aug[col][j] /= p;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = aug[r][col];
        for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
      }
    }
    return aug.map(r => r.slice(n));
  }

  function ols(X, y) {
    const n = X.length, k = X[0].length;
    if (n <= k) return null;
    const Xt = matT(X);
    const XtXinv = matInv(matMul(Xt, X));
    if (!XtXinv) return null;
    const Xty = matMul(Xt, y.map(v => [v])).map(r => r[0]);
    const beta = matMul(XtXinv, Xty.map(v => [v])).map(r => r[0]);
    const yhat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const resid = y.map((v, i) => v - yhat[i]);
    const rss = resid.reduce((s, e) => s + e * e, 0);
    const df  = n - k;
    const s2  = rss / df;
    const ymean = y.reduce((a, b) => a + b) / n;
    const sst   = y.reduce((s, v) => s + (v - ymean) ** 2, 0);
    const r2    = sst > 0 ? 1 - rss / sst : 0;
    const r2adj = 1 - (1 - r2) * (n - 1) / df;
    const se    = XtXinv.map((row, i) => Math.sqrt(Math.abs(s2 * row[i])));
    const tstat = beta.map((b, i) => b / (se[i] || 1e-10));
    const pval  = tstat.map(t => tPvalue(Math.abs(t), df));
    return { beta, se, tstat, pval, r2, r2adj, s2, df, n, k, XtXinv };
  }

  function predictInterval(model, xNew, alpha = 0.20) {
    const { beta, s2, df, XtXinv } = model;
    const yhat = xNew.reduce((s, x, j) => s + x * beta[j], 0);
    const Xv   = matMul(XtXinv, xNew.map(v => [v])).map(r => r[0]);
    const h    = xNew.reduce((s, x, j) => s + x * Xv[j], 0);
    const tCrit  = tQuantile(alpha, df);
    const sePred = Math.sqrt(s2 * (1 + Math.max(0, h)));
    return { central: yhat, lower: yhat - tCrit * sePred, upper: yhat + tCrit * sePred, h };
  }

  // ── API pública ───────────────────────────────────────────────────────
  window.Avaliacao = {
    mount(rootEl, opts = {}) {
      return new AvaliacaoInstance(rootEl, opts);
    },
  };
})();
