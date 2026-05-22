// Schema declarativo do checklist de análise.
//
// Princípio: TUDO que aparece na UI precisa ter origem rastreável na
// documentação do repo. Cada item carrega `fonte` (arquivo:linha) e
// `ajuda` (como verificar + teoria). O renderizador (analise-render.js)
// só desenha — toda a regra de negócio mora aqui.
//
// Estrutura de cada item:
//   {
//     id: 'cidade_mercado_alvo',           // chave única dentro da aba
//     label: 'Cidade no mercado-alvo',
//     tipo: 'tri' | 'radio' | 'texto' | 'numero' | 'flag',
//     autopreencher: 'edital.gates.mercado_alvo',   // path no JSON do imóvel
//     fonte: '2-analise/pontos-eliminatorios.md:13',
//     ajuda: { como: '...', teoria: '...' },
//     condicional?: { campo: 'id_outro_item', valor: 'X' },  // só mostra se outro item == valor
//     opcoes?: [...]   // pra tipo=radio
//   }

window.CHECKLIST_SCHEMA = {
  edital: {
    label: 'Jurídico — Edital',
    icone: '📄',
    items: [
      {
        id: 'leiloeiro_ok',
        label: 'Leiloeiro com nome + matrícula JUCEX',
        tipo: 'tri',
        autopreencher: 'edital.gates.leiloeiro_ok',
        fonte: '2-analise/pontos-eliminatorios.md:23',
        ajuda: {
          como: 'No rodapé/cabeçalho do edital, achar nome completo do leiloeiro oficial + número da matrícula na Junta Comercial (JUCESP, JUCEPAR, etc).',
          teoria: 'Edital sem dados do leiloeiro é forte indício de fraude. Valide o nome+matrícula na Junta Comercial do estado.',
        },
      },
      {
        id: 'comissao_ok',
        label: 'Comissão do leiloeiro = 5%',
        tipo: 'tri',
        autopreencher: 'edital.gates.comissao_ok',
        fonte: '2-analise/pontos-eliminatorios.md:24',
        ajuda: {
          como: 'Cláusula de comissão do leiloeiro. Padrão de mercado é 5%.',
          teoria: 'Comissões maiores estragam viabilidade. Comissão divergente sem justificativa clara é eliminatório.',
        },
      },
      {
        id: 'prazo_pagamento_ok',
        label: 'Prazo de pagamento > 1 dia útil',
        tipo: 'tri',
        autopreencher: 'edital.gates.prazo_pagamento_ok',
        fonte: '2-analise/pontos-eliminatorios.md:25',
        ajuda: {
          como: 'Cláusula de pagamento. Quantos dias úteis para quitar o lance?',
          teoria: 'Prazo ≤ 1 dia útil exige capital líquido imediato — só lança se já tiver capital separado. Para financiamento, costuma exigir dias.',
        },
      },
      {
        id: 'imovel_bate_matricula',
        label: 'Descrição do imóvel bate com a matrícula (área, endereço, vagas)',
        tipo: 'tri',
        fonte: '2-analise/pontos-eliminatorios.md:26',
        ajuda: {
          como: 'Compare a descrição do bem no edital com a matrícula: rua, número, área privativa, vagas. Divergências geram nulidade.',
          teoria: 'Edital que descreve imóvel diferente da matrícula pode causar nulidade futura ou imóvel errado.',
        },
      },
      {
        id: 'edital_mais_recente',
        label: 'É a versão mais recente do edital',
        tipo: 'tri',
        fonte: '2-analise/pontos-eliminatorios.md:27',
        ajuda: {
          como: 'Confira data de publicação. Se houver vários editais para o mesmo imóvel, usar o mais novo.',
          teoria: 'Risco de cláusula nova escondida em versão atualizada.',
        },
      },
      {
        id: 'meio_pagamento_aceito',
        label: 'Aceita seu meio de pagamento (vista/financiado/FGTS)',
        tipo: 'tri',
        fonte: '2-analise/pontos-eliminatorios.md:28',
        ajuda: {
          como: 'Cláusula de pagamento lista formas aceitas.',
          teoria: 'Se o edital só aceita à vista e você só tem financiamento → inviável operacionalmente.',
        },
      },
      {
        id: 'modalidade',
        label: 'Modalidade do leilão',
        tipo: 'radio',
        opcoes: [
          { valor: '1o_obrigatorio', label: '1º leilão obrigatório' },
          { valor: '2o_obrigatorio', label: '2º leilão obrigatório' },
          { valor: 'pos_leilao', label: 'Pós-leilão (3º, venda direta, online)' },
        ],
        autopreencher: 'edital.extraido.modalidade',
        fonte: '4b-extrajudicial/oportunidades-pos-leilao.md',
        ajuda: {
          como: 'Edital indica se é 1º/2º leilão obrigatório (Lei 9.514) ou pós-leilão (venda direta/online).',
          teoria: 'Pós-leilão tem regras diferentes para usucapião, IPTU/condomínio e lance mínimo. Atenção redobrada se >5 anos da consolidação (risco usucapião).',
        },
      },
      {
        id: 'dacao_em_pagamento',
        label: 'Houve dação em pagamento registrada na matrícula',
        tipo: 'tri',
        fonte: '2-analise/2-matricula.md',
        ajuda: {
          como: 'Procure na matrícula registro de "dação em pagamento" antes da consolidação.',
          teoria: 'Dação em pagamento sugere imóvel provavelmente desocupado — reduz custo de desocupação.',
        },
      },
    ],
  },

  matricula: {
    label: 'Jurídico — Matrícula',
    icone: '📜',
    items: [
      {
        id: 'consolidacao_averbada',
        label: 'Consolidação da propriedade averbada (Lei 9.514 §7º)',
        tipo: 'tri',
        autopreencher: 'matricula.gates.consolidacao',
        fonte: '2-analise/pontos-eliminatorios.md:38',
        ajuda: {
          como: 'Procurar na matrícula averbação de "consolidação da propriedade" em nome do credor.',
          teoria: 'Sem essa averbação, o leilão extrajudicial é NULO. Item central da Fase 1.',
        },
      },
      {
        id: 'sem_sequestro_criminal',
        label: 'Sem sequestro criminal',
        tipo: 'tri',
        autopreencher: 'matricula.gates.sem_sequestro_criminal',
        fonte: '2-analise/pontos-eliminatorios.md:39',
        ajuda: {
          como: 'Buscar na matrícula registro ou averbação de "sequestro" vinculado a vara criminal.',
          teoria: 'Imóvel produto ou adquirido com produto de crime. Padrão: ficar fora.',
        },
      },
      {
        id: 'afs_bem_encadeadas',
        label: 'AFs sucessivas bem-encadeadas (sem confusão cronológica)',
        tipo: 'tri',
        autopreencher: 'matricula.gates.afs_bem_encadeadas',
        fonte: '2-analise/pontos-eliminatorios.md:40',
        ajuda: {
          como: 'Ler cronologicamente as Alienações Fiduciárias (R-N AF) na matrícula. Cada AF deve ser cancelada antes da próxima.',
          teoria: 'AFs confusas geram risco de credor da AF posterior contestar a consolidação. Lei 14.711/2023 disciplina AFs sucessivas.',
        },
      },
      {
        id: 'cadeia_dominial_ok',
        label: 'Cadeia dominial limpa (sem lacunas)',
        tipo: 'tri',
        autopreencher: 'matricula.gates.cadeia_dominial_ok',
        fonte: '2-analise/pontos-eliminatorios.md:41',
        ajuda: {
          como: 'Verificar se cada transferência de propriedade tem registro (R-N) na matrícula, sem "buracos" entre vendas.',
          teoria: 'Lacunas (registros anulados, venda não-registrada) geram risco de evicção — alguém aparecer alegando propriedade.',
        },
      },
      {
        id: 'vaga_no_edital',
        label: 'Vaga em matrícula independente está referida no edital',
        tipo: 'tri',
        fonte: '2-analise/pontos-eliminatorios.md:42',
        ajuda: {
          como: 'Se a vaga tem matrícula própria, ela deve estar listada no edital também.',
          teoria: 'Vaga fora do edital = arrematar sem vaga. Inviabiliza revenda em condomínio.',
        },
      },
      {
        id: 'data_contrato_af',
        label: 'Data do contrato de Alienação Fiduciária',
        tipo: 'radio',
        opcoes: [
          { valor: 'pre_2017', label: 'Anterior a 06/09/2017 (purgação da mora)' },
          { valor: 'pos_2017', label: 'Posterior a 06/09/2017 (direito de preferência)' },
        ],
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Procurar o registro original da AF na matrícula (R-N AF) e ler a data do contrato de alienação fiduciária.',
          teoria: 'Pré-2017: devedor pode purgar a mora até o leilão (paga só atrasado e tira o imóvel). Pós-2017: tem direito de preferência mas não purgação. Pré-2017 + devedor com cacife é red flag.',
        },
      },
      {
        id: 'natureza_af',
        label: 'Natureza da Alienação Fiduciária',
        tipo: 'radio',
        opcoes: [
          { valor: 'residencial', label: 'Residencial' },
          { valor: 'nao_residencial', label: 'Não-residencial (comercial)' },
        ],
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Descrição do imóvel no edital/matrícula indica uso. Residencial: casa, apto. Não-residencial: loja, sala comercial.',
          teoria: 'Residencial: dívida do devedor extingue após arrematação. Não-residencial: devedor continua devendo a diferença (risco de impugnação maior).',
        },
      },
      {
        id: 'foreiro',
        label: 'Imóvel foreiro (enfiteuse)',
        tipo: 'tri',
        autopreencher: 'matricula.extraido.foreiro',
        fonte: '4b-extrajudicial/debitos.md',
        ajuda: {
          como: 'Matrícula menciona "domínio útil", "enfiteuse" ou "foreiro" — geralmente em imóveis da União/Marinha ou ordens religiosas.',
          teoria: 'Foreiro acrescenta laudêmio (% sobre arrematação) + foro anual. Entra no cálculo de viabilidade.',
        },
      },
      // Condicional: como foi a notificação?
      {
        id: 'tipo_notificacao',
        label: 'Como foi feita a notificação do devedor',
        tipo: 'radio',
        opcoes: [
          { valor: 'pessoal', label: 'Pessoal ou via AR' },
          { valor: 'edital', label: 'Por edital (publicação)' },
          { valor: 'sem_info', label: 'Sem informação' },
        ],
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Averbação na matrícula informa o método: "notificada pessoalmente", "via correio com AR", ou "por edital".',
          teoria: 'Notificação por edital só é válida quando devedor não foi encontrado pessoalmente nem por AR. Padrão de fraude: credor pula direto para edital.',
        },
      },
      {
        id: 'devedor_ocupa',
        label: 'Devedor ainda ocupa o imóvel',
        tipo: 'tri',
        condicional: { campo: 'tipo_notificacao', valor: 'edital' },
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Pesquisar nas redes/Google se o devedor mora no imóvel. Indícios: cadastro Caixa, endereço de processo, etc.',
          teoria: '🚨 NOTIFICAÇÃO POR EDITAL + DEVEDOR MORA = padrão crítico de risco. Argumento forte de nulidade do leilão por falha na notificação.',
        },
      },
    ],
  },

  processos: {
    label: 'Jurídico — Processos',
    icone: '⚖️',
    items: [
      {
        id: 'pesquisa_feita',
        label: 'Pesquisa de processos devedor × credor feita',
        tipo: 'tri',
        fonte: '4b-extrajudicial/processos-devedor-credor.md',
        ajuda: {
          como: 'Buscar nome do devedor (ré) × credor (autor) no tribunal correto. Caixa/Emgea → Justiça Federal + TRF. Outros → TJ do ESTADO do imóvel (não do domicílio do devedor).',
          teoria: 'Pesquisa é DINÂMICA — refazer na véspera/manhã do leilão. Devedor costuma impugnar às vésperas pra travar.',
        },
      },
      {
        id: 'situacao_processual',
        label: 'Situação processual atual',
        tipo: 'radio',
        opcoes: [
          { valor: 'sem_processo', label: 'Sem processo do devedor' },
          { valor: 'recente_sem_liminar', label: 'Processo recente, sem decisão sobre liminar' },
          { valor: 'liminar_deferida', label: 'Liminar deferida / agravo com efeito suspensivo' },
          { valor: 'liminar_indeferida_contestada', label: 'Liminar indeferida + agravo indeferido + credor contestou com provas (ponto 3)' },
          { valor: 'transito_julgado_credor', label: 'Trânsito em julgado a favor do credor (ponto 6)' },
        ],
        fonte: '4b-extrajudicial/processos-devedor-credor.md',
        ajuda: {
          como: 'Ler andamento dos processos encontrados. Liminar? Decisão? Agravo? Sentença?',
          teoria: 'Escala de "pontos de segurança" 1-6: ponto 1 = mínima (sem decisão), ponto 6 = máxima (trânsito). Mínimo razoável pra arrematar: ponto 3 (liminar+agravo indeferidos + credor contestou com provas).',
        },
      },
      {
        id: 'leilao_judicial_paralelo',
        label: 'Existe leilão judicial paralelo de direitos sobre o imóvel',
        tipo: 'tri',
        fonte: '4b-extrajudicial/onus-matricula.md',
        ajuda: {
          como: 'Buscar penhoras na matrícula que apontem para leilão judicial em andamento na mesma data ou próxima.',
          teoria: '🚨 Dois leilões sobrepostos = risco de impugnação cruzada. Ficar fora dos dois.',
        },
      },
      // Condicional: ônus na matrícula?
      {
        id: 'existe_onus',
        label: 'Existe ônus ativo na matrícula (penhora, arresto, indisponibilidade)',
        tipo: 'radio',
        opcoes: [
          { valor: 'nao', label: 'Não / só os cancelados' },
          { valor: 'propter_rem', label: 'Sim — dívida propter rem (IPTU/condomínio)' },
          { valor: 'pessoal_devedor', label: 'Sim — dívida pessoal do devedor' },
          { valor: 'sequestro_criminal', label: 'Sim — sequestro criminal' },
        ],
        fonte: '4b-extrajudicial/onus-matricula.md',
        ajuda: {
          como: 'Ler atos R-N e Av-N da matrícula. Procurar penhora, arresto, indisponibilidade que NÃO tenham averbação de cancelamento depois.',
          teoria: 'Tipo do ônus muda o tratamento: dívida pessoal cai com a consolidação (Lei 9.514 §11-12); propter rem exige pagamento prévio; sequestro criminal = eliminatório.',
        },
      },
      {
        id: 'quem_cancela_onus',
        label: 'Quem pede o cancelamento do ônus?',
        tipo: 'radio',
        opcoes: [
          { valor: 'credor', label: 'Credor (já fez ou vai fazer)' },
          { valor: 'arrematante', label: 'Arrematante (precisa advogado — custo extra)' },
        ],
        condicional: { campo: 'existe_onus', valor: 'pessoal_devedor' },
        fonte: '4b-extrajudicial/onus-matricula.md',
        ajuda: {
          como: 'Edital define quem é responsável pelos cancelamentos. Se for o arrematante, vai precisar de petição em cada vara.',
          teoria: 'Judiciário é inerte — se ninguém pedir, o ônus continua. Credor cancelar = custo zero pra você; arrematante = ~R$ 1.500-3.000 por vara.',
        },
      },
    ],
  },

  viabilidade: {
    label: 'Viabilidade Financeira',
    icone: '💰',
    items: [
      {
        id: 'valor_mercado',
        label: 'Valor de mercado pesquisado (R$)',
        tipo: 'numero',
        autopreencher: 'estimativas.valor_mercado',
        fonte: '2-analise/3-valor-mercado.md',
        ajuda: {
          como: 'Buscar imóveis comparáveis no ZAP, Viva Real, OLX. Mesmo bairro, mesma metragem, mesma idade. Pegar mediana.',
          teoria: 'Valor de mercado é o que vai entrar na fórmula de lucro. Subestimar pra ser conservador.',
        },
      },
      {
        id: 'lance_pretendido',
        label: 'Lance pretendido (R$)',
        tipo: 'numero',
        autopreencher: 'viabilidade.valor_arrematacao',
        fonte: '3-viabilidade/README.md',
        ajuda: {
          como: 'Quanto você pretende dar de lance? Comece pelo lance mínimo do 1º leilão.',
          teoria: 'O sistema vai calcular se passa em 30% de lucro e qual o lance máximo que ainda fecha.',
        },
      },
      {
        id: 'debitos_pagos_por_quem',
        label: 'IPTU + condomínio vencidos: quem paga?',
        tipo: 'radio',
        opcoes: [
          { valor: 'arrematante', label: 'Arrematante (assume — entra no custo)' },
          { valor: 'credor', label: 'Credor (propter rem, não entra)' },
          { valor: 'desconhecido', label: 'Edital omisso — pesquisar' },
        ],
        fonte: '2-analise/4-pesquisa-debitos.md',
        ajuda: {
          como: 'Edital define. Se omisso, vale a Lei 9.514/97 (propter rem fica com o imóvel).',
          teoria: 'Se for arrematante, pesquisar valor antes de lançar: leiloeiro → administradora → advogado condomínio → execução fiscal TJ.',
        },
      },
      {
        id: 'iptu_mensal',
        label: 'IPTU mensal estimado (R$)',
        tipo: 'numero',
        autopreencher: 'estimativas.iptu_mensal',
        fonte: '2-analise/4-pesquisa-debitos.md',
        ajuda: {
          como: 'IPTU anual ÷ 12. Pesquisar no site da prefeitura ou estimar pela metragem/região.',
          teoria: 'Carrego mensal durante o tempo até a revenda.',
        },
      },
      {
        id: 'condominio_mensal',
        label: 'Condomínio mensal estimado (R$)',
        tipo: 'numero',
        autopreencher: 'estimativas.condominio_mensal',
        fonte: '2-analise/4-pesquisa-debitos.md',
        ajuda: {
          como: 'Buscar com a administradora ou estimar pela metragem (~R$ 5-15 por m²).',
          teoria: 'Carrego mensal durante o tempo até a revenda.',
        },
      },
      {
        id: 'patologia_2o_caro',
        label: 'Patologia: 2º leilão tem lance ≥ valor de mercado',
        tipo: 'tri',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Compare o lance mínimo do 2º leilão com o valor de mercado pesquisado.',
          teoria: '🚨 Patologia detectada: 2º leilão pode ser MAIS CARO que 1º (devedor pagou pouco da dívida). Se 1º já fecha em viabilidade, não esperar o 2º.',
        },
      },
    ],
  },

  arrematacao: {
    label: 'Checklist Arrematação',
    icone: '🏆',
    items: [
      {
        id: 'lance_minimo_1o',
        label: 'Lance mínimo 1º leilão (R$)',
        tipo: 'numero',
        autopreencher: 'edital.extraido.lance_minimo_primeiro',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Edital define.',
          teoria: 'Lance mínimo 1º = saldo devedor + encargos. Geralmente alto. 1º leilão raramente vende.',
        },
      },
      {
        id: 'lance_minimo_2o',
        label: 'Lance mínimo 2º leilão (R$)',
        tipo: 'numero',
        autopreencher: 'edital.extraido.lance_minimo_segundo',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Edital define.',
          teoria: 'Lance mínimo 2º = ≥ valor da dívida atualizada (não necessariamente 50% do valor venal — depende do edital).',
        },
      },
      {
        id: 'comissao_5_confirmada',
        label: 'Comissão leiloeiro 5% confirmada na ata',
        tipo: 'tri',
        fonte: '5-arrematacao/README.md',
        ajuda: {
          como: 'Releia a cláusula de comissão da ata de arrematação assinada.',
          teoria: 'Não pagar comissão acima do edital. Padrão de mercado = 5%.',
        },
      },
      {
        id: 'itbi_calculado',
        label: 'ITBI calculado (alíquota da cidade × valor de arrematação)',
        tipo: 'tri',
        fonte: '5-arrematacao/README.md',
        ajuda: {
          como: 'Curitiba: 2,7% sobre o valor de arrematação (não sobre avaliação venal).',
          teoria: 'ITBI é o segundo maior custo depois da reforma. Confirmar alíquota da cidade do imóvel.',
        },
      },
      {
        id: 'ata_validada',
        label: 'Ata de arrematação validada com o leiloeiro',
        tipo: 'tri',
        fonte: '4b-extrajudicial/pos-arrematacao.md',
        ajuda: {
          como: 'Conferir: número da matrícula, descrição do imóvel, valor, prazo de pagamento, comissão.',
          teoria: 'A ata é título hábil para o registro. Erros geram trabalho extra com o cartório.',
        },
      },
      {
        id: 'pesquisa_processos_refeita',
        label: 'Pesquisa de processos refeita na véspera/manhã do leilão',
        tipo: 'tri',
        fonte: '4b-extrajudicial/processos-devedor-credor.md',
        ajuda: {
          como: 'Repetir busca nome × nome no(s) tribunal(is) relevante(s) horas antes do pregão.',
          teoria: 'Devedores costumam protocolar ações de última hora para travar o leilão.',
        },
      },
      {
        id: 'averbacao_leilao_negativo',
        label: 'Averbação de leilão negativo já na matrícula (se aplicável)',
        tipo: 'tri',
        condicional: { campo: 'modalidade', aba: 'edital', valor: 'pos_leilao' },
        fonte: '4b-extrajudicial/oportunidades-pos-leilao.md',
        ajuda: {
          como: 'Em pós-leilão, leilão negativo de 1º/2º já foi averbado? Se não, cai pro arrematante (custo de averbação).',
          teoria: 'Sem essa averbação, há ambiguidade sobre a fase. Documento pode ser exigido na escritura.',
        },
      },
    ],
  },
};
