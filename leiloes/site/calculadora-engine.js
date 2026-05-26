/**
 * Calculadora de viabilidade — engine de cálculo.
 *
 * Reproduz fielmente as fórmulas da planilha calculadora-leilao.xlsx
 * (abas "Pagamento à Vista", "Pagamento Financiado", "PRICE", "SAC").
 *
 * Funções puras: recebem inputs, devolvem resultado. Sem efeitos colaterais,
 * sem DOM, testáveis isoladamente.
 *
 * MAPEAMENTO PLANILHA → ENGINE:
 *
 *   À Vista (aba "Pagamento à Vista"):
 *     E15 = D15*D11                                         (comissão leiloeiro R$)
 *     E16 = D16*D11                                         (ITBI R$)
 *     E26 = D26*D25                                         (IPTU × meses)
 *     E27 = D27*D25                                         (cond × meses)
 *     E28 = E26 + E27                                       (carrego total)
 *     E34 = D34*D12                                         (comissão corretor R$)
 *     E35 = D35 * (D12 - D11 - E15 - E16 - D17 - D21 - E34) (IR R$)
 *     D38 = D12 - E34 - E35                                 (valor real venda)
 *     D31 = D11 + E15 + E16 + D17 + D18 + D21 + D22 + E28   (total custos)
 *     D41 = (D38 - D31) / D31                               (lucro %)
 *     E41 = D38 - D31                                       (lucro R$)
 *     D42 = (1 + D41)^(1/D25) - 1                           (lucro mensal %)
 *
 *   Financiado (aba "Pagamento Financiado"):
 *     E16 = D11 * D16                                       (entrada R$)
 *     E17 = D11 * (1 - D16)                                 (financiado R$)
 *     D18 anual → taxa mensal = (1 + anual)^(1/12) - 1
 *     E22 = D22*D11                                         (comissão leiloeiro)
 *     E23 = D23*D11                                         (ITBI)
 *     E33 = D32*D33                                         (IPTU × meses)
 *     E34 = D32*D34                                         (cond × meses)
 *     F35/G35 = soma das parcelas 1..D32 (PRICE/SAC)
 *     F44/G44 = saldo devedor após D32 meses
 *     E42 = D42*D12                                         (comissão corretor)
 *     F43 = D43*(D12 - E42 - SUM(E16, F35, F44, E22, E23, D24, D28))   (IR PRICE)
 *     G43 = D43*(D12 - E42 - SUM(E16, G35, G44, E22, E23, D24, D28))   (IR SAC)
 *     F47/G47 = D12 - E42 - IR - saldo_devedor              (valor real venda)
 *     F39/G39 = E16 + E22 + E23 + D24 + D25 + D28 + D29 +
 *               E33 + E34 + parcelas_pagas                  (total custos)
 *     F51/G51 = F47 - F39                                   (lucro R$)
 *     F52/G52 = (F47 - F39) / F39                           (lucro %)
 *     F53/G53 = (1 + F52)^(1/D32) - 1                       (lucro mensal %)
 *
 *   PRICE:
 *     parcela = principal * ((1+i)^n * i) / ((1+i)^n - 1)   (constante)
 *     juros[t] = saldo[t-1] * i
 *     amort[t] = parcela - juros[t]
 *     saldo[t] = saldo[t-1] - amort[t]
 *
 *   SAC:
 *     amort = principal / n                                 (constante)
 *     juros[t] = (principal - (t-1) * amort) * i
 *     parcela[t] = amort + juros[t]                         (decrescente)
 *     saldo[t] = principal - t * amort
 */
(function () {
  'use strict';

  function annualToMonthly(annualRate) {
    if (!annualRate || annualRate <= 0) return 0;
    return Math.pow(1 + annualRate, 1 / 12) - 1;
  }

  function pricePayment(principal, i, n) {
    if (!principal || !n) return 0;
    if (!i) return principal / n;
    const f = Math.pow(1 + i, n);
    return (principal * f * i) / (f - 1);
  }

  /**
   * PRICE com (opcional) correção monetária mensal no saldo devedor.
   *
   * Sem indexador (im=0): parcela constante padrão.
   * Com indexador: re-amortiza a cada mês sobre o saldo corrigido →
   * parcela varia mês a mês (igual contrato real Caixa/Bradesco com TR/IGP-M).
   *
   * opts.indexadorMensal: taxa equivalente mensal do indexador (0 = sem).
   */
  function priceSchedule(principal, i, n, opts) {
    const im = (opts && opts.indexadorMensal) || 0;
    const out = [];
    if (!principal || !n) return out;
    let saldo = principal;
    for (let t = 1; t <= n; t++) {
      if (im) saldo = saldo * (1 + im);
      const nRest = n - (t - 1);
      const parcela = pricePayment(saldo, i, nRest);
      const juros = saldo * i;
      const amort = parcela - juros;
      saldo = saldo - amort;
      out.push({ mes: t, parcela, juros, amort, saldo: Math.max(0, saldo) });
    }
    return out;
  }

  /**
   * SAC com (opcional) correção monetária mensal no saldo devedor.
   *
   * Sem indexador: amort constante = P/n (formulação clássica).
   * Com indexador: amort = saldo_corrigido / n_restante a cada mês —
   * mantém prazo n e converge saldo a 0. Juros sobre saldo corrigido.
   */
  function sacSchedule(principal, i, n, opts) {
    const im = (opts && opts.indexadorMensal) || 0;
    const out = [];
    if (!principal || !n) return out;
    let saldo = principal;
    for (let t = 1; t <= n; t++) {
      if (im) saldo = saldo * (1 + im);
      const nRest = n - (t - 1);
      const amort = saldo / nRest;
      const juros = saldo * i;
      const parcela = amort + juros;
      saldo = saldo - amort;
      out.push({ mes: t, parcela, juros, amort, saldo: Math.max(0, saldo) });
    }
    return out;
  }

  function sumParcelas(schedule, prazoVenda) {
    let total = 0;
    const k = Math.min(prazoVenda, schedule.length);
    for (let i = 0; i < k; i++) total += schedule[i].parcela;
    return total;
  }

  function saldoNoMes(schedule, mes) {
    if (mes <= 0 || schedule.length === 0) return 0;
    const idx = Math.min(mes, schedule.length) - 1;
    return schedule[idx].saldo;
  }

  /**
   * Cálculo para pagamento à vista.
   *
   * inputs = {
   *   arrematacao, venda,
   *   comissaoLeiloeiroPct, itbiPct, registro, advogado, reforma, outros,
   *   prazoVenda, iptuMensal, condominioMensal,
   *   corretorPct, irPct
   * }
   * Todos os percentuais em forma decimal (0.05 = 5%).
   */
  function computeVista(inp) {
    const arremat = num(inp.arrematacao);
    const venda = num(inp.venda);
    const meses = Math.max(1, num(inp.prazoVenda) || 1);
    const comissaoLeiloeiro = num(inp.comissaoLeiloeiroPct) * arremat;
    const itbi = num(inp.itbiPct) * arremat;
    const registro = num(inp.registro);
    const advogado = num(inp.advogado);
    const reforma = num(inp.reforma);
    const outros = num(inp.outros);
    const iptuTotal = num(inp.iptuMensal) * meses;
    const condTotal = num(inp.condominioMensal) * meses;
    const carregoTotal = iptuTotal + condTotal;

    const comissaoCorretor = num(inp.corretorPct) * venda;
    const irPct = num(inp.irPct);
    const irBase = Math.max(
      0,
      venda - arremat - comissaoLeiloeiro - itbi - registro - reforma - comissaoCorretor
    );
    const ir = irPct * irBase;

    const valorRealVenda = venda - comissaoCorretor - ir;

    const totalCustos =
      arremat + comissaoLeiloeiro + itbi + registro + advogado + reforma + outros + carregoTotal;

    const lucroRs = valorRealVenda - totalCustos;
    const lucroPct = totalCustos > 0 ? lucroRs / totalCustos : 0;
    const lucroMensal =
      totalCustos > 0 && (1 + lucroPct) > 0
        ? Math.pow(1 + lucroPct, 1 / meses) - 1
        : 0;

    return {
      modo: 'vista',
      custos: {
        capital_inicial: arremat,
        comissao_leiloeiro: comissaoLeiloeiro,
        itbi,
        registro,
        advogado,
        reforma,
        outros,
        iptu_total: iptuTotal,
        cond_total: condTotal,
        parcelas_pagas: 0,
        total: totalCustos,
      },
      pos_venda: {
        comissao_corretor: comissaoCorretor,
        ir_base: irBase,
        ir,
        saldo_devedor_quitado: 0,
        valor_real_venda: valorRealVenda,
      },
      resultado: {
        lucro_rs: lucroRs,
        lucro_pct: lucroPct,
        lucro_mensal: lucroMensal,
      },
      cronograma: [],
    };
  }

  /**
   * Cálculo para financiamento bancário (PRICE ou SAC).
   *
   * inputs (estende vista):
   *   entradaPct, jurosAnual, prazoFinanc, sistema ('PRICE'|'SAC'),
   *   taxaAvaliacaoBanco (opcional — somada ao registro)
   *
   * IMPORTANTE: o campo `registro` na entrada deve ser o valor que vai para
   * a célula D24 da planilha — ou seja, JÁ DOBRADO (compra e venda + AF) +
   * taxa de avaliação do banco + averbações. A UI calcula isso para o usuário.
   */
  function computeFinanciado(inp, sistemaOverride) {
    const sistema = (sistemaOverride || inp.sistema || 'PRICE').toUpperCase();
    const arremat = num(inp.arrematacao);
    const venda = num(inp.venda);
    const meses = Math.max(1, num(inp.prazoVenda) || 1);

    const entradaPct = num(inp.entradaPct);
    const entrada = arremat * entradaPct;
    const financiado = arremat * (1 - entradaPct);
    const jurosAnual = num(inp.jurosAnual);
    const indexadorAnual = num(inp.indexadorAnualPct);
    const simplificado = !!inp.indexadorSimplificado;

    // Modo simplificado: indexador absorvido na taxa efetiva, sem aplicar mês a mês.
    // Modo fiel (default): indexador aplicado mensalmente ao saldo devedor.
    let i, indexadorMensal;
    if (simplificado && indexadorAnual > 0) {
      const total = (1 + jurosAnual) * (1 + indexadorAnual) - 1;
      i = annualToMonthly(total);
      indexadorMensal = 0;
    } else {
      i = annualToMonthly(jurosAnual);
      indexadorMensal = annualToMonthly(indexadorAnual);
    }
    const n = Math.max(0, Math.round(num(inp.prazoFinanc) || 0));

    const schedule =
      sistema === 'SAC'
        ? sacSchedule(financiado, i, n, { indexadorMensal })
        : priceSchedule(financiado, i, n, { indexadorMensal });

    const parcelasPagas = sumParcelas(schedule, meses);
    const saldoDevedor = saldoNoMes(schedule, meses);

    const comissaoLeiloeiro = num(inp.comissaoLeiloeiroPct) * arremat;
    const itbi = num(inp.itbiPct) * arremat;
    const registro = num(inp.registro);
    const advogado = num(inp.advogado);
    const reforma = num(inp.reforma);
    const outros = num(inp.outros);
    const iptuTotal = num(inp.iptuMensal) * meses;
    const condTotal = num(inp.condominioMensal) * meses;

    const comissaoCorretor = num(inp.corretorPct) * venda;
    const irPct = num(inp.irPct);
    // Base IR (planilha F43/G43):
    //   IR_base = D12 - E42 - (E16 + Fxx[parcelas] + Fxx[saldo] + E22 + E23 + D24 + D28)
    const irBase = Math.max(
      0,
      venda -
        comissaoCorretor -
        (entrada + parcelasPagas + saldoDevedor + comissaoLeiloeiro + itbi + registro + reforma)
    );
    const ir = irPct * irBase;

    const valorRealVenda = venda - comissaoCorretor - ir - saldoDevedor;

    const totalCustos =
      entrada +
      comissaoLeiloeiro +
      itbi +
      registro +
      advogado +
      reforma +
      outros +
      iptuTotal +
      condTotal +
      parcelasPagas;

    const lucroRs = valorRealVenda - totalCustos;
    const lucroPct = totalCustos > 0 ? lucroRs / totalCustos : 0;
    const lucroMensal =
      totalCustos > 0 && (1 + lucroPct) > 0
        ? Math.pow(1 + lucroPct, 1 / meses) - 1
        : 0;

    return {
      modo: sistema === 'SAC' ? 'sac' : 'price',
      custos: {
        capital_inicial: entrada,
        comissao_leiloeiro: comissaoLeiloeiro,
        itbi,
        registro,
        advogado,
        reforma,
        outros,
        iptu_total: iptuTotal,
        cond_total: condTotal,
        parcelas_pagas: parcelasPagas,
        total: totalCustos,
      },
      pos_venda: {
        comissao_corretor: comissaoCorretor,
        ir_base: irBase,
        ir,
        saldo_devedor_quitado: saldoDevedor,
        valor_real_venda: valorRealVenda,
      },
      resultado: {
        lucro_rs: lucroRs,
        lucro_pct: lucroPct,
        lucro_mensal: lucroMensal,
      },
      financiamento: {
        entrada,
        financiado,
        juros_anual: jurosAnual,
        juros_mensal: i,
        prazo_financiamento: n,
        sistema,
      },
      cronograma: schedule,
    };
  }

  /**
   * Pagamento PARCELADO diretamente ao leiloeiro/juízo.
   * Modelo simples: sinal (entrada) + N parcelas iguais com juros mensais opcional.
   * Não há "saldo devedor a quitar na venda" — se ainda houver parcelas pendentes
   * no momento da venda, elas saem do valor da venda (igual saldo devedor financiado).
   *
   * inputs (estende vista):
   *   parcSinalPct, parcParcelas, parcJurosMensal
   */
  function computeParcelado(inp) {
    const arremat = num(inp.arrematacao);
    const venda = num(inp.venda);
    const meses = Math.max(1, num(inp.prazoVenda) || 1);

    const sinalPct = num(inp.parcSinalPct);
    const sinal = arremat * sinalPct;
    const financiado = arremat * (1 - sinalPct);
    const jurosMensal = num(inp.parcJurosMensal);
    const indexadorAnual = num(inp.indexadorAnualPct);
    const simplificado = !!inp.indexadorSimplificado;
    let i, indexadorMensal;
    if (simplificado && indexadorAnual > 0) {
      const indMensal = annualToMonthly(indexadorAnual);
      i = (1 + jurosMensal) * (1 + indMensal) - 1;
      indexadorMensal = 0;
    } else {
      i = jurosMensal;
      indexadorMensal = annualToMonthly(indexadorAnual);
    }
    const n = Math.max(0, Math.round(num(inp.parcParcelas) || 0));

    // PRICE direto (parcela constante quando sem indexador, varia quando com).
    const schedule = priceSchedule(financiado, i, n, { indexadorMensal });

    const parcelasPagas = sumParcelas(schedule, meses);
    const saldoDevedor = saldoNoMes(schedule, meses);

    const comissaoLeiloeiro = num(inp.comissaoLeiloeiroPct) * arremat;
    const itbi = num(inp.itbiPct) * arremat;
    const registro = num(inp.registro);
    const advogado = num(inp.advogado);
    const reforma = num(inp.reforma);
    const outros = num(inp.outros);
    const iptuTotal = num(inp.iptuMensal) * meses;
    const condTotal = num(inp.condominioMensal) * meses;

    const comissaoCorretor = num(inp.corretorPct) * venda;
    const irPct = num(inp.irPct);
    const irBase = Math.max(
      0,
      venda -
        comissaoCorretor -
        (sinal + parcelasPagas + saldoDevedor + comissaoLeiloeiro + itbi + registro + reforma)
    );
    const ir = irPct * irBase;

    const valorRealVenda = venda - comissaoCorretor - ir - saldoDevedor;

    const totalCustos =
      sinal +
      comissaoLeiloeiro +
      itbi +
      registro +
      advogado +
      reforma +
      outros +
      iptuTotal +
      condTotal +
      parcelasPagas;

    const lucroRs = valorRealVenda - totalCustos;
    const lucroPct = totalCustos > 0 ? lucroRs / totalCustos : 0;
    const lucroMensal =
      totalCustos > 0 && (1 + lucroPct) > 0
        ? Math.pow(1 + lucroPct, 1 / meses) - 1
        : 0;

    return {
      modo: 'parcelado',
      custos: {
        capital_inicial: sinal,
        comissao_leiloeiro: comissaoLeiloeiro,
        itbi,
        registro,
        advogado,
        reforma,
        outros,
        iptu_total: iptuTotal,
        cond_total: condTotal,
        parcelas_pagas: parcelasPagas,
        total: totalCustos,
      },
      pos_venda: {
        comissao_corretor: comissaoCorretor,
        ir_base: irBase,
        ir,
        saldo_devedor_quitado: saldoDevedor,
        valor_real_venda: valorRealVenda,
      },
      resultado: {
        lucro_rs: lucroRs,
        lucro_pct: lucroPct,
        lucro_mensal: lucroMensal,
      },
      parcelamento: {
        sinal,
        financiado,
        juros_mensal: i,
        parcelas: n,
      },
      cronograma: schedule,
    };
  }

  function compute(inputs, modo) {
    switch ((modo || inputs.modo || 'vista').toLowerCase()) {
      case 'price':
        return computeFinanciado(inputs, 'PRICE');
      case 'sac':
        return computeFinanciado(inputs, 'SAC');
      case 'parcelado':
        return computeParcelado(inputs);
      case 'vista':
      default:
        return computeVista(inputs);
    }
  }

  /**
   * Busca binária do lance máximo para um lucro líquido alvo.
   * Mantém os outros campos fixos, varia somente `arrematacao`.
   * Retorna o maior valor de arrematação que ainda atinge `targetPct`.
   */
  function lanceMaximo(inputs, modo, targetPct, opts) {
    const o = opts || {};
    const venda = num(inputs.venda);
    if (!venda) return null;
    let lo = 0;
    let hi = venda;
    const tol = o.tol || 1;
    let best = null;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const out = compute({ ...inputs, arrematacao: mid }, modo);
      const pct = out.resultado.lucro_pct;
      if (pct >= targetPct) {
        best = { arrematacao: mid, resultado: out };
        lo = mid;
      } else {
        hi = mid;
      }
      if (hi - lo < tol) break;
    }
    return best;
  }

  function num(x) {
    if (x === null || x === undefined || x === '') return 0;
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  window.CalcEngine = {
    annualToMonthly,
    pricePayment,
    priceSchedule,
    sacSchedule,
    sumParcelas,
    saldoNoMes,
    computeVista,
    computeFinanciado,
    computeParcelado,
    compute,
    lanceMaximo,
  };
})();
