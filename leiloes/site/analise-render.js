// Renderizador do checklist. Lê CHECKLIST_SCHEMA e produz HTML.
//
// Coexistem dois formatos no schema:
//   - NOVO  (Edital, Matrícula): item tem `pergunta` + `afirmacoes` (binario)
//           ou `opcoes` com `nivel` (radio com semáforo).
//   - LEGADO (Processos, Viabilidade, Arrematação): `label` + tipo `tri`/`radio`/`numero`.
//
// O detector é simples: presença de `afirmacoes` OU `opcoes[].nivel` → novo formato.
//
// Estado por item (formato novo):
//   checklist.aba.id = {
//     valor:    boolean | string | number | null,
//     origem:   'ia' | 'usuario',
//     valor_ia: <valor que a IA originalmente sugeriu>,
//     editado_em: ISO string | null,
//   }
//
// Formato legado preservou `{ valor }`.

(() => {
  const $ = (id) => document.getElementById(id);

  function getPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  // Um item está no formato novo se declarar afirmações (binário) ou se
  // a primeira opção do radio carregar `nivel`.
  function isFormatoNovo(item) {
    if (item.afirmacoes) return true;
    if (item.opcoes && item.opcoes.length && item.opcoes[0].nivel) return true;
    return false;
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

  // ---------- Helpers do formato novo ----------

  // Nível do item dado o valor atual. Retorna 'seguro' | 'informativo' |
  // 'atencao' | 'bloqueante' | 'pendente'.
  function nivelAtual(item, valor) {
    if (valor == null || valor === '') return 'pendente';
    if (item.afirmacoes) {
      const chave = (valor === true || valor === 'true') ? 'sim'
                  : (valor === false || valor === 'false') ? 'nao'
                  : null;
      if (chave && item.afirmacoes[chave]) return item.afirmacoes[chave].nivel || 'pendente';
      return 'pendente';
    }
    if (item.opcoes) {
      const op = item.opcoes.find(o => o.valor === valor);
      return op?.nivel || 'pendente';
    }
    return 'pendente';
  }

  // Aplica regra de `combo`: se o item tem combo configurado e o outro item está
  // no valor-gatilho E este item está em `quando_meu_valor`, retorna o nível
  // elevado (bloqueante etc). Caso contrário, devolve null e o nível natural vale.
  function nivelDoComboSeAplica(item, valor, estadoChecklistAba) {
    if (!item.combo) return null;
    const meuValorBate = (
      valor === item.combo.quando_meu_valor ||
      String(valor) === String(item.combo.quando_meu_valor)
    );
    if (!meuValorBate) return null;
    const outro = estadoChecklistAba?.[item.combo.com]?.valor;
    if (outro == null) return null;
    if (String(outro) === String(item.combo.valor)) {
      return item.combo.nivel_combo;
    }
    return null;
  }

  function semaforoIcone(nivel) {
    return {
      seguro: '✅',
      informativo: 'ℹ️',
      atencao: '⚠️',
      bloqueante: '🚨',
      pendente: '⏳',
    }[nivel] || '';
  }

  function semaforoTextoCurto(nivel) {
    return {
      seguro: 'Seguro',
      informativo: 'Informativo',
      atencao: 'Atenção',
      bloqueante: 'Bloqueante',
      pendente: 'Sem info',
    }[nivel] || nivel;
  }

  function badgeOrigem(estadoItem) {
    if (!estadoItem) return '';
    if (estadoItem.origem === 'usuario') {
      return `<span class="badge-origem badge-origem-usuario" title="Você editou este valor manualmente.">✏️ você editou</span>`;
    }
    if (estadoItem.origem === 'ia') {
      return `<span class="badge-origem badge-origem-ia" title="Valor identificado automaticamente pela IA na extração do PDF.">🤖 identificado pela IA</span>`;
    }
    return '';
  }

  function badgeCriticidadeMaxima(item) {
    const c = item.criticidade;
    if (!c) return '';
    return `<span class="badge-criticidade badge-criticidade-${c}" title="Criticidade máxima possível deste item (quando responde no lado de risco).">${semaforoIcone(c)} ${semaforoTextoCurto(c)}</span>`;
  }

  function bannerComboCritico(item, valor, estadoAba) {
    const nivelCombo = nivelDoComboSeAplica(item, valor, estadoAba);
    if (!nivelCombo || nivelCombo !== 'bloqueante') return '';
    return `<div class="combo-critico">${item.combo.mensagem || '🚨 Combo crítico detectado.'}</div>`;
  }

  function bannerImpactoViabilidade(item, valor) {
    if (!item.impacto_viabilidade) return '';
    const iv = item.impacto_viabilidade;
    const bate = String(valor) === String(iv.quando_valor) || valor === iv.quando_valor;
    if (!bate) return '';
    return `<div class="impacto-viabilidade">→ <strong>Alimenta viabilidade:</strong> ${iv.mensagem}</div>`;
  }

  // ---------- Inputs ----------

  // Binário (sim/não/sem-info). Estilo: dois cards com a afirmação completa em
  // cada um — o usuário escolhe qual afirmação descreve a realidade.
  function inputBinario(item, valor) {
    const isSim  = valor === true  || valor === 'true';
    const isNao  = valor === false || valor === 'false';
    const isPend = !isSim && !isNao;
    const af = item.afirmacoes;
    return `
      <div class="grupo-binario" data-binario="${item.id}">
        <label class="card-afirmacao card-${af.sim.nivel} ${isSim ? 'is-ativo' : ''}">
          <input type="radio" name="${item.id}" value="true" ${isSim ? 'checked' : ''} data-bin-toggle />
          <span class="card-icone">${semaforoIcone(af.sim.nivel)}</span>
          <span class="card-texto"><strong>Sim</strong> — ${af.sim.label}</span>
        </label>
        <label class="card-afirmacao card-${af.nao.nivel} ${isNao ? 'is-ativo' : ''}">
          <input type="radio" name="${item.id}" value="false" ${isNao ? 'checked' : ''} data-bin-toggle />
          <span class="card-icone">${semaforoIcone(af.nao.nivel)}</span>
          <span class="card-texto"><strong>Não</strong> — ${af.nao.label}</span>
        </label>
        <span class="card-pendente ${isPend ? '' : 'is-oculto'}">${semaforoIcone('pendente')} Sem info — clique numa das duas afirmações acima</span>
      </div>`;
  }

  // Radio do formato novo: cada opção carrega `nivel` e vira um card colorido.
  function inputRadioNovo(item, valor) {
    return `
      <div class="grupo-radio-novo" data-radio="${item.id}">
        ${item.opcoes.map(op => {
          const ativo = valor === op.valor;
          return `
            <label class="card-afirmacao card-${op.nivel} ${ativo ? 'is-ativo' : ''}">
              <input type="radio" name="${item.id}" value="${op.valor}" ${ativo ? 'checked' : ''} data-radio-toggle />
              <span class="card-icone">${semaforoIcone(op.nivel)}</span>
              <span class="card-texto">${op.label}</span>
            </label>`;
        }).join('')}
      </div>`;
  }

  // ---------- Inputs legados (tri/radio/numero/texto) ----------

  function inputTri(item, valor) {
    const v = valor == null ? '' : String(valor);
    const semInfo = v === '';
    return `
      <div class="grupo-tri ${semInfo ? 'is-sem-info' : ''}" role="radiogroup" aria-labelledby="lbl-${item.id}" data-tri="${item.id}">
        <label class="radio-tri opt-ok" title="Marcar como OK (clique de novo para limpar)">
          <input type="radio" name="${item.id}" value="true" ${v === 'true' ? 'checked' : ''} data-tri-toggle />
          <span>✅ OK</span>
        </label>
        <label class="radio-tri opt-fail" title="Marcar como Falha (clique de novo para limpar)">
          <input type="radio" name="${item.id}" value="false" ${v === 'false' ? 'checked' : ''} data-tri-toggle />
          <span>❌ Falha</span>
        </label>
        <span class="tri-sem-info-label" ${semInfo ? '' : 'hidden'}>⏳ Sem info</span>
      </div>`;
  }

  function inputRadioLegado(item, valor) {
    return `
      <div class="grupo-radio">
        ${item.opcoes.map(op => `
          <label class="radio-opcao">
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

  // ---------- Sanity-check de IA (formato legado) ----------

  function badgeAutoLegado(item, valorAuto) {
    if (valorAuto == null || valorAuto === '') return '';
    let texto;
    if (item.tipo === 'tri') {
      const map = { 'true': '✅ OK', 'false': '❌ Falha' };
      texto = map[String(valorAuto)];
      if (!texto) return '';
    } else if (item.tipo === 'radio') {
      const op = (item.opcoes || []).find(o => o.valor === valorAuto);
      texto = op ? op.label : String(valorAuto);
    } else {
      texto = String(valorAuto);
    }
    return `<span class="badge-auto" title="Valor que a extração automática (regex/IA) sugeriu — guardado pra sanity check mesmo se você editar.">🤖 IA sugeriu: ${texto}</span>`;
  }

  // ---------- Render por item ----------

  function renderItemNovo(item, estadoItem, valor, estadoAba) {
    const nivel = nivelDoComboSeAplica(item, valor, estadoAba) || nivelAtual(item, valor);

    let inputHtml;
    if (item.tipo === 'binario' || item.afirmacoes) {
      inputHtml = inputBinario(item, valor);
    } else if (item.tipo === 'radio') {
      inputHtml = inputRadioNovo(item, valor);
    } else if (item.tipo === 'numero') {
      inputHtml = inputNumero(item, valor);
    } else {
      inputHtml = inputTexto(item, valor);
    }

    const condicionalAttr = item.condicional ? `data-condicional='${JSON.stringify(item.condicional)}'` : '';
    const valorIaAttr = (estadoItem && estadoItem.valor_ia != null) ? `data-valor-ia="${String(estadoItem.valor_ia).replace(/"/g, '&quot;')}"` : '';
    const editadoAttr = (estadoItem && estadoItem.origem === 'usuario') ? `data-editado="true"` : '';
    const editadoEmAttr = (estadoItem && estadoItem.editado_em) ? `data-editado-em="${estadoItem.editado_em}"` : '';

    return `
      <div class="item-checklist item-novo nivel-${nivel} ${item.combo ? 'tem-combo' : ''}"
           data-item-id="${item.id}"
           data-criticidade-max="${item.criticidade || ''}"
           ${valorIaAttr} ${editadoAttr} ${editadoEmAttr}
           ${condicionalAttr}>
        <div class="item-cabecalho">
          <div class="item-titulo-bloco">
            <label id="lbl-${item.id}" class="item-pergunta">${item.pergunta}</label>
            <div class="item-meta">
              ${badgeCriticidadeMaxima(item)}
              ${badgeOrigem(estadoItem)}
              ${tooltipFonte(item.fonte)}
            </div>
          </div>
        </div>
        <div class="item-input">${inputHtml}</div>
        ${bannerComboCritico(item, valor, estadoAba)}
        ${bannerImpactoViabilidade(item, valor)}
        ${blocoAjuda(item)}
      </div>`;
  }

  function renderItemLegado(item, valor, valorAuto) {
    let inputHtml;
    switch (item.tipo) {
      case 'tri':    inputHtml = inputTri(item, valor); break;
      case 'radio':  inputHtml = inputRadioLegado(item, valor); break;
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
        ${badgeAutoLegado(item, valorAuto)}
        ${blocoAjuda(item)}
      </div>`;
  }

  // ---------- Render por aba ----------

  // Normaliza o estado de um item — aceita tanto formato novo
  // `{ valor, origem, valor_ia, editado_em }` quanto legado `{ valor }` (ou
  // `valor` direto). Garante saída no formato novo pra simplificar consumo.
  function normalizarEstadoItem(itemId, estadoAba, valorAuto) {
    const cru = estadoAba?.[itemId];
    if (cru == null) {
      // Nada salvo → valor vem do autopreencher (origem IA) se houver, senão null
      return {
        valor: valorAuto != null ? valorAuto : null,
        origem: valorAuto != null ? 'ia' : null,
        valor_ia: valorAuto != null ? valorAuto : null,
        editado_em: null,
      };
    }
    if (typeof cru !== 'object' || !('valor' in cru)) {
      // Legado: só `{ valor }` ou valor cru
      const v = (typeof cru === 'object') ? cru.valor : cru;
      return {
        valor: v,
        origem: (v === valorAuto && valorAuto != null) ? 'ia' : 'usuario',
        valor_ia: valorAuto,
        editado_em: null,
      };
    }
    // Já no formato novo — só preenche defaults se faltar
    return {
      valor: cru.valor,
      origem: cru.origem || ((cru.valor === valorAuto && valorAuto != null) ? 'ia' : 'usuario'),
      valor_ia: 'valor_ia' in cru ? cru.valor_ia : valorAuto,
      editado_em: cru.editado_em || null,
    };
  }

  function renderAba(nomeAba, imovel) {
    const cfg = window.CHECKLIST_SCHEMA[nomeAba];
    if (!cfg) return '';
    const estadoAba = (imovel?.checklist?.[nomeAba]) || {};

    // Pre-computa estado normalizado de todos os items pra que combos/condicionais
    // possam consultá-lo facilmente.
    const estadoNormalizado = {};
    cfg.items.forEach(item => {
      let valorAuto = item.autopreencher ? getPath(imovel, item.autopreencher) : undefined;
      // Normalizar booleans pra binário (gates vêm como bool puro)
      if (item.afirmacoes && valorAuto != null) {
        valorAuto = (valorAuto === true || valorAuto === 'true');
      }
      estadoNormalizado[item.id] = normalizarEstadoItem(item.id, estadoAba, valorAuto);
    });

    return cfg.items.map(item => {
      const est = estadoNormalizado[item.id];
      const valor = est.valor;

      if (isFormatoNovo(item)) {
        return renderItemNovo(item, est, valor, estadoNormalizado);
      }
      return renderItemLegado(item, valor, est.valor_ia);
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
      const usaNovo = isFormatoNovo(item);

      if (usaNovo && item.afirmacoes) {
        const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
        if (!sel) valor = null;
        else valor = sel.value === 'true' ? true : (sel.value === 'false' ? false : null);
      } else if (usaNovo && item.opcoes) {
        const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
        valor = sel ? sel.value : null;
      } else if (item.tipo === 'tri') {
        const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
        if (!sel) valor = null;
        else if (sel.value === 'true') valor = true;
        else if (sel.value === 'false') valor = false;
        else valor = null;
      } else if (item.tipo === 'radio') {
        const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
        valor = sel ? sel.value : null;
      } else if (item.tipo === 'numero') {
        const inp = itemEl.querySelector(`input[name="${item.id}"]`);
        valor = inp && inp.value !== '' ? Number(inp.value) : null;
      } else {
        const inp = itemEl.querySelector(`input[name="${item.id}"]`);
        valor = inp ? inp.value : null;
      }

      if (usaNovo) {
        // Estado completo: { valor, origem, valor_ia, editado_em }
        const valorIa = itemEl.dataset.valorIa;
        let valorIaParsed = null;
        if (valorIa !== undefined && valorIa !== '') {
          if (valorIa === 'true') valorIaParsed = true;
          else if (valorIa === 'false') valorIaParsed = false;
          else if (!isNaN(Number(valorIa))) valorIaParsed = Number(valorIa);
          else valorIaParsed = valorIa;
        }
        const editado = itemEl.dataset.editado === 'true';
        const bateComIa = valorIaParsed !== null && String(valor) === String(valorIaParsed);
        resultado[item.id] = {
          valor,
          origem: editado && !bateComIa ? 'usuario' : (valorIaParsed !== null ? 'ia' : 'usuario'),
          valor_ia: valorIaParsed,
          editado_em: editado && !bateComIa ? new Date().toISOString() : (itemEl.dataset.editadoEm || null),
        };
      } else {
        resultado[item.id] = { valor };
      }
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
      const inputGatilho = container.querySelector(`input[name="${dependeDe}"]:checked`);
      const valorAtual = inputGatilho ? inputGatilho.value : null;
      const itemEl = container.querySelector(`[data-item-id="${item.id}"]`);
      if (itemEl) {
        itemEl.hidden = String(valorAtual) !== String(valorEsperado);
      }
    });
  }

  // Reaplica semáforo dinamicamente (combo + nivel) após mudança no DOM.
  function atualizarSemaforos(nomeAba) {
    const cfg = window.CHECKLIST_SCHEMA[nomeAba];
    if (!cfg) return;
    const container = document.querySelector(`[data-checklist="${nomeAba}"]`);
    if (!container) return;

    // Snapshot do estado atual de cada item (só os do formato novo)
    const estadoAba = {};
    cfg.items.forEach(item => {
      if (!isFormatoNovo(item)) return;
      const itemEl = container.querySelector(`[data-item-id="${item.id}"]`);
      if (!itemEl) return;
      const sel = itemEl.querySelector(`input[name="${item.id}"]:checked`);
      let v = null;
      if (sel) {
        if (item.afirmacoes) v = sel.value === 'true' ? true : (sel.value === 'false' ? false : null);
        else v = sel.value;
      }
      estadoAba[item.id] = { valor: v };
    });

    // Recalcula nível + combo + impacto pra cada item
    cfg.items.forEach(item => {
      if (!isFormatoNovo(item)) return;
      const itemEl = container.querySelector(`[data-item-id="${item.id}"]`);
      if (!itemEl) return;
      const v = estadoAba[item.id].valor;
      const nivelBase = nivelAtual(item, v);
      const nivelCombo = nivelDoComboSeAplica(item, v, estadoAba);
      const nivelFinal = nivelCombo || nivelBase;

      itemEl.classList.remove('nivel-seguro', 'nivel-informativo', 'nivel-atencao', 'nivel-bloqueante', 'nivel-pendente');
      itemEl.classList.add(`nivel-${nivelFinal}`);

      // Combo banner
      let comboEl = itemEl.querySelector('.combo-critico');
      const comboMsg = nivelCombo === 'bloqueante' ? (item.combo?.mensagem || '🚨 Combo crítico.') : null;
      if (comboMsg) {
        if (!comboEl) {
          comboEl = document.createElement('div');
          comboEl.className = 'combo-critico';
          const after = itemEl.querySelector('.item-input');
          if (after && after.nextSibling) after.parentNode.insertBefore(comboEl, after.nextSibling);
          else itemEl.appendChild(comboEl);
        }
        comboEl.textContent = comboMsg;
      } else if (comboEl) {
        comboEl.remove();
      }

      // Impacto viabilidade banner
      let impEl = itemEl.querySelector('.impacto-viabilidade');
      if (item.impacto_viabilidade) {
        const iv = item.impacto_viabilidade;
        const bate = String(v) === String(iv.quando_valor) || v === iv.quando_valor;
        if (bate) {
          if (!impEl) {
            impEl = document.createElement('div');
            impEl.className = 'impacto-viabilidade';
            const ajudaEl = itemEl.querySelector('.item-ajuda');
            if (ajudaEl) itemEl.insertBefore(impEl, ajudaEl);
            else itemEl.appendChild(impEl);
          }
          impEl.innerHTML = `→ <strong>Alimenta viabilidade:</strong> ${iv.mensagem}`;
        } else if (impEl) {
          impEl.remove();
        }
      }

      // Marca cards ativos
      itemEl.querySelectorAll('.card-afirmacao').forEach(card => {
        const inp = card.querySelector('input');
        card.classList.toggle('is-ativo', inp && inp.checked);
      });
      const pend = itemEl.querySelector('.card-pendente');
      if (pend) {
        const algumMarcado = itemEl.querySelector('.card-afirmacao input:checked');
        pend.classList.toggle('is-oculto', !!algumMarcado);
      }
    });
  }

  window.AnaliseRender = {
    renderAba,
    coletarAba,
    aplicarCondicionais,
    atualizarSemaforos,
    isFormatoNovo,
  };
})();
