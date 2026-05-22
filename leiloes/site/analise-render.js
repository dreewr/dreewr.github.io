// Renderizador genérico do checklist. Lê CHECKLIST_SCHEMA e produz HTML.
//
// Separado de analise.js (controller) pra manter a lógica de exibição
// independente da lógica de navegação/fetch.

(() => {
  const $ = (id) => document.getElementById(id);

  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  function tooltipFonte(fonte) {
    if (!fonte) return '';
    return `<span class="fonte-tag" title="Origem desta verificação na documentação do repo">📚 ${fonte}</span>`;
  }

  function blocoAjuda(item) {
    if (!item.ajuda) return '';
    const como = item.ajuda.como ? `<p><strong>Como verificar:</strong> ${item.ajuda.como}</p>` : '';
    const teoria = item.ajuda.teoria ? `<p><strong>Por quê:</strong> ${item.ajuda.teoria}</p>` : '';
    return `
      <details class="item-ajuda">
        <summary>Como fazer essa verificação</summary>
        ${como}${teoria}
        ${tooltipFonte(item.fonte)}
      </details>`;
  }

  // ---------- Inputs por tipo ----------

  function inputTri(item, valor) {
    const v = valor == null ? '' : String(valor);
    return `
      <div class="grupo-tri" role="radiogroup" aria-labelledby="lbl-${item.id}">
        <label class="radio-tri ${v === 'true' ? 'sel-ok' : ''}">
          <input type="radio" name="${item.id}" value="true" ${v === 'true' ? 'checked' : ''} />
          <span>✅ OK</span>
        </label>
        <label class="radio-tri ${v === 'false' ? 'sel-fail' : ''}">
          <input type="radio" name="${item.id}" value="false" ${v === 'false' ? 'checked' : ''} />
          <span>❌ Falha</span>
        </label>
        <label class="radio-tri ${v === '' ? 'sel-pendente' : ''}">
          <input type="radio" name="${item.id}" value="" ${v === '' ? 'checked' : ''} />
          <span>⏳ Sem info</span>
        </label>
      </div>`;
  }

  function inputRadio(item, valor) {
    return `
      <div class="grupo-radio">
        ${item.opcoes.map(op => `
          <label class="radio-opcao ${valor === op.valor ? 'sel' : ''}">
            <input type="radio" name="${item.id}" value="${op.valor}" ${valor === op.valor ? 'checked' : ''} />
            <span>${op.label}</span>
          </label>
        `).join('')}
      </div>`;
  }

  function inputNumero(item, valor) {
    const v = valor == null || valor === '' ? '' : valor;
    return `<input type="number" class="input-numero" name="${item.id}" value="${v}" step="any" />`;
  }

  function inputTexto(item, valor) {
    const v = valor == null ? '' : String(valor).replace(/"/g, '&quot;');
    return `<input type="text" class="input-texto" name="${item.id}" value="${v}" />`;
  }

  function renderItem(item, valor) {
    let inputHtml;
    switch (item.tipo) {
      case 'tri':    inputHtml = inputTri(item, valor); break;
      case 'radio':  inputHtml = inputRadio(item, valor); break;
      case 'numero': inputHtml = inputNumero(item, valor); break;
      case 'texto':  inputHtml = inputTexto(item, valor); break;
      default:       inputHtml = `<em>tipo não suportado: ${item.tipo}</em>`;
    }

    return `
      <div class="item-checklist" data-item-id="${item.id}" ${item.condicional ? `data-condicional='${JSON.stringify(item.condicional)}'` : ''}>
        <div class="item-cabecalho">
          <label id="lbl-${item.id}" class="item-label">${item.label}</label>
          ${tooltipFonte(item.fonte)}
        </div>
        <div class="item-input">${inputHtml}</div>
        ${blocoAjuda(item)}
      </div>`;
  }

  // ---------- Render por aba ----------

  function renderAba(nomeAba, imovel) {
    const cfg = window.CHECKLIST_SCHEMA[nomeAba];
    if (!cfg) return '';
    const checklistEstado = (imovel?.checklist?.[nomeAba]) || {};

    return cfg.items.map(item => {
      // Valor: prioridade pra edição manual (checklist[aba][id].valor)
      //        fallback pra auto-preenchimento via path
      let valor = checklistEstado[item.id]?.valor;
      if (valor === undefined && item.autopreencher) {
        valor = getPath(imovel, item.autopreencher);
      }
      // Normaliza pra string nos casos tri/radio
      if (item.tipo === 'tri' && valor != null) valor = String(valor);
      return renderItem(item, valor);
    }).join('');
  }

  // ---------- Coleta valores do DOM da aba ----------

  function coletarAba(nomeAba) {
    const cfg = window.CHECKLIST_SCHEMA[nomeAba];
    if (!cfg) return {};
    const container = document.querySelector(`[data-checklist="${nomeAba}"]`);
    if (!container) return {};

    const resultado = {};
    cfg.items.forEach(item => {
      const itemEl = container.querySelector(`[data-item-id="${item.id}"]`);
      if (!itemEl) return;
      let valor;
      if (item.tipo === 'tri' || item.tipo === 'radio') {
        const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
        valor = sel ? sel.value : null;
        // Normaliza tri pra boolean/null
        if (item.tipo === 'tri') {
          if (valor === 'true') valor = true;
          else if (valor === 'false') valor = false;
          else valor = null;
        }
        if (valor === '') valor = null;
      } else if (item.tipo === 'numero') {
        const inp = itemEl.querySelector(`input[name="${item.id}"]`);
        valor = inp && inp.value !== '' ? Number(inp.value) : null;
      } else {
        const inp = itemEl.querySelector(`input[name="${item.id}"]`);
        valor = inp ? inp.value : null;
      }
      resultado[item.id] = { valor };
    });
    return resultado;
  }

  // ---------- Visibilidade condicional ----------

  function aplicarCondicionais(nomeAba) {
    const cfg = window.CHECKLIST_SCHEMA[nomeAba];
    if (!cfg) return;
    const container = document.querySelector(`[data-checklist="${nomeAba}"]`);
    if (!container) return;

    cfg.items.forEach(item => {
      if (!item.condicional) return;
      const dependeDe = item.condicional.campo;
      const valorEsperado = item.condicional.valor;
      // Procura o campo gatilho (na mesma aba ou em outra via item.condicional.aba)
      let valorAtual;
      const inputGatilho = container.querySelector(`input[name="${dependeDe}"]:checked`);
      if (inputGatilho) {
        valorAtual = inputGatilho.value;
      }
      const itemEl = container.querySelector(`[data-item-id="${item.id}"]`);
      if (itemEl) {
        itemEl.hidden = valorAtual !== valorEsperado;
      }
    });
  }

  // ---------- Exporta ----------

  window.AnaliseRender = {
    renderAba,
    coletarAba,
    aplicarCondicionais,
  };
})();
