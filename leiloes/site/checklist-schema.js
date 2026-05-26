// Schema declarativo do checklist de análise.
//
// Princípio: TUDO que aparece na UI precisa ter origem rastreável na
// documentação do repo. Cada item carrega `fonte` (arquivo:linha) e
// `ajuda` (como verificar + teoria). O renderizador (analise-render.js)
// só desenha — toda a regra de negócio mora aqui.
//
// Há dois formatos coexistindo:
//
// FORMATO NOVO (abas Edital e Matrícula):
//   {
//     id: 'consolidacao_averbada',
//     pergunta: 'Há averbação de consolidação?',     // título neutro
//     tipo: 'binario' | 'radio' | 'numero',
//     afirmacoes: {                                   // só pra binario
//       sim: { label: '...', nivel: 'seguro' },
//       nao: { label: '...', nivel: 'bloqueante' },
//     },
//     opcoes: [{ valor, label, nivel }],              // só pra radio com semáforo
//     criticidade: 'bloqueante' | 'atencao' | 'informativo',  // pior caso
//     combo?: { com, valor, quando_meu_valor, nivel_combo, mensagem },
//     condicional?: { campo, valor },
//     impacto_viabilidade?: { quando_valor, mensagem },
//     autopreencher?: 'matricula.gates.consolidacao',
//     fonte: '2-analise/pontos-eliminatorios.md:38',
//     ajuda: { como, teoria },
//   }
//
//   `nivel` por afirmação/opção: 'seguro' | 'informativo' | 'atencao' | 'bloqueante' | 'pendente'
//   é o semáforo. Permite que cada lado da resposta tenha gravidade própria
//   (ex.: foreiro=sim é 'informativo', foreiro=não é 'seguro').
//
// FORMATO ANTIGO (abas Processos, Viabilidade, Arrematação — não pediram refactor):
//   {
//     id: '...', label: '...', tipo: 'tri' | 'radio' | 'numero',
//     autopreencher, fonte, ajuda, opcoes?, condicional?
//   }

window.CHECKLIST_SCHEMA = {
  edital: {
    label: 'Jurídico — Edital',
    icone: '📄',
    items: [
      {
        id: 'leiloeiro_ok',
        pergunta: 'Edital traz nome + matrícula JUCEX do leiloeiro?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Leiloeiro identificado (nome + matrícula JUCEX)', nivel: 'seguro' },
          nao: { label: 'Edital SEM dados do leiloeiro — indício forte de fraude', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        autopreencher: 'edital.gates.leiloeiro_ok',
        fonte: '2-analise/pontos-eliminatorios.md:23',
        ajuda: {
          como: 'No <strong>rodapé/cabeçalho do edital</strong> ou na seção de qualificação do leiloeiro (primeira página), procurar nome completo + nº de matrícula na Junta Comercial — formato típico: "Leiloeiro Oficial JUCESP nº 1234" ou "JUCEPAR nº 567". Confirmar a matrícula no site da Junta Comercial do estado (JUCESP, JUCEPAR, JUCERJA etc.) — busca pública por nome ou número. Se a matrícula não constar, estiver suspensa ou cancelada, descartar.',
          teoria: 'Leiloeiro oficial é profissional <strong>matriculado na Junta Comercial</strong> (Decreto 21.981/1932 + IN 17/2013 da DREI), e só ele pode conduzir leilão de imóveis. Edital sem identificação clara é forte indício de <strong>fraude</strong> (golpe do leilão fake, sites clonando leiloeiros reais) ou de leiloeiro suspenso tentando ainda operar. Sem leiloeiro válido, a arrematação é <strong>nula desde a origem</strong> e o cartório recusa o registro da carta.',
        },
      },
      {
        id: 'imovel_bate_matricula',
        pergunta: 'Descrição do imóvel no edital bate com a matrícula?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Endereço, área e vagas do edital batem com a matrícula', nivel: 'seguro' },
          nao: { label: 'Edital descreve imóvel diferente da matrícula — nulidade futura ou imóvel errado', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        fonte: '2-analise/pontos-eliminatorios.md:26',
        ajuda: {
          como: 'Pegar a <strong>descrição do bem</strong> no edital e comparar campo-a-campo com a matrícula atualizada. Pontos críticos: <strong>nº da matrícula, CRI, endereço completo, área privativa em m², nº de vagas</strong> e se essas vagas têm matrícula própria. Divergência em qualquer um exige ler até entender se é erro material (corrigível) ou se o edital descreve outro imóvel. Em breve um diff automático vai pré-preencher esse item.',
          teoria: 'A matrícula é o <strong>documento canônico do imóvel</strong> (Lei 6.015/73, art. 167). O edital tem que descrever o que está sendo leiloado de forma idêntica à matrícula — qualquer divergência relevante (área, número da vaga, ausência de quintal/depósito) gera <strong>nulidade do leilão</strong> por descrição imprecisa do bem ou, pior, leva você a arrematar uma unidade diferente da que pesquisou.',
        },
      },
      {
        id: 'edital_mais_recente',
        pergunta: 'É a versão mais recente do edital para esse imóvel?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Versão mais recente do edital confirmada', nivel: 'seguro' },
          nao: { label: 'Há edital mais novo publicado — buscar versão atualizada', nivel: 'atencao' },
        },
        criticidade: 'atencao',
        fonte: '2-analise/pontos-eliminatorios.md:27',
        ajuda: {
          como: 'Conferir a <strong>data de publicação</strong> do edital (geralmente na primeira página ou rodapé). Buscar no site do leiloeiro e no Diário Oficial se há edital mais novo para o mesmo imóvel — palavra-chave: <strong>nº da matrícula</strong>. Se houver versão mais nova, descartar a antiga e ler a atual.',
          teoria: 'O credor pode publicar <strong>edital retificado</strong> incluindo cláusulas novas: ônus assumido pelo arrematante, prazo de pagamento diferente, novo lance mínimo, alteração de propter rem. Comprar com base em edital desatualizado pode levar a surpresa no dia do pregão. Não é bloqueante porque é facilmente sanável (basta buscar a versão correta), mas exige atenção.',
        },
      },
      {
        id: 'modalidade',
        pergunta: 'Modalidade do leilão',
        tipo: 'radio',
        opcoes: [
          { valor: '1o_obrigatorio', label: '1º leilão obrigatório (Lei 9.514)', nivel: 'informativo' },
          { valor: '2o_obrigatorio', label: '2º leilão obrigatório (Lei 9.514)', nivel: 'informativo' },
          { valor: 'pos_leilao', label: 'Pós-leilão (3º, venda direta, online, concorrência)', nivel: 'informativo' },
        ],
        criticidade: 'informativo',
        autopreencher: 'edital.extraido.modalidade',
        fonte: '4b-extrajudicial/oportunidades-pos-leilao.md',
        ajuda: {
          como: 'Edital indica o tipo do leilão em destaque: <strong>"1º leilão (Lei 9.514, art. 27 §1º)"</strong>, <strong>"2º leilão"</strong> ou <strong>"venda direta / leilão online / 3º leilão"</strong>. Conferir também as datas: se a data do leilão obrigatório já passou e o imóvel ainda está disponível, é pós-leilão. Em sites grandes (Caixa, Resale, leiloeiros) o status costuma ficar no topo.',
          teoria: 'O 1º e 2º leilão obrigatórios (Lei 9.514/97, art. 27) têm <strong>regras rígidas</strong>: lance mínimo amarrado à dívida/avaliação, prazos de purgação, ônus do credor. Pós-leilão (venda direta após 2 leilões negativos) tem <strong>flexibilidade</strong> — credor define preço e regras. Atenção: pós-leilão antigo (>5 anos da consolidação) traz <strong>risco de usucapião do ocupante</strong>, IPTU/condomínio podem ter virado bola de neve, e a validade da notificação fica mais frágil pelo tempo decorrido.',
        },
      },
      {
        id: 'quem_cancela_onus',
        pergunta: 'Quem é responsável por pedir o cancelamento de ônus na matrícula?',
        tipo: 'radio',
        opcoes: [
          { valor: 'credor', label: 'Credor — já fez ou vai fazer (custo zero pra você)', nivel: 'seguro' },
          { valor: 'arrematante', label: 'Arrematante — exige advogado + petição por vara', nivel: 'informativo' },
          { valor: 'omisso', label: 'Edital omisso — pesquisar', nivel: 'pendente' },
        ],
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: 'arrematante',
          mensagem: 'Soma honorários de advogado (~R$ 1,5-3 k por vara) na linha "advogado" da viabilidade.',
        },
        fonte: '4b-extrajudicial/onus-matricula.md',
        ajuda: {
          como: 'No edital, procurar cláusula <strong>"cancelamento de gravames / ônus"</strong>, "obrigações do credor" ou "obrigações do arrematante". Se está omisso, é red flag — pedir esclarecimento ao leiloeiro <strong>por escrito</strong> antes de lançar (email salvo serve de prova).',
          teoria: 'A consolidação fiduciária <strong>extingue automaticamente</strong> a maioria dos ônus que recaem sobre o direito do fiduciante (Lei 9.514, §§11-12 do art. 27) — mas o cancelamento na matrícula <strong>não é automático</strong>: alguém precisa apresentar a documentação ao cartório, vara por vara. Cada penhora em vara diferente exige petição própria com cópia da ata + matrícula + provas. Honorários típicos: <strong>R$ 1.500-3.000 por vara</strong>. Credor que assume esse custo dá vantagem real; arrematante que assume precisa orçar antes de lançar.',
        },
      },
      {
        id: 'quem_paga_propter_rem',
        pergunta: 'Quem paga IPTU + condomínio vencidos até o leilão?',
        tipo: 'radio',
        opcoes: [
          { valor: 'credor', label: 'Credor quita até a data do leilão (Caixa típica)', nivel: 'seguro' },
          { valor: 'arrematante', label: 'Arrematante assume — entra no custo', nivel: 'informativo' },
          { valor: 'omisso', label: 'Edital omisso — vale a Lei 9.514 (propter rem fica com o imóvel)', nivel: 'pendente' },
        ],
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: 'arrematante',
          mensagem: 'Pesquisar IPTU e condomínio em aberto antes de lançar — entra como linha "débitos propter rem" na calculadora.',
        },
        fonte: '2-analise/debitos.md',
        ajuda: {
          como: 'Procurar cláusula <strong>"débitos sobre o imóvel"</strong>, "obrigações do arrematante" ou "IPTU e condomínio". Edital tem precedência sobre a Lei 9.514. Caixa costuma quitar; particulares costumam empurrar pro arrematante. Se omisso, vale o §13 do art. 27 da Lei 9.514 (propter rem permanece com o imóvel). Pesquisar valor: leiloeiro → administradora do condomínio → execução fiscal no TJ.',
          teoria: 'Dívidas <strong>propter rem</strong> ("em razão da coisa") seguem o imóvel, não a pessoa — IPTU, condomínio, taxa de incêndio. Caem para o novo proprietário. Já dívidas <strong>de consumo</strong> (água, luz, gás, internet) são <strong>pessoais do devedor</strong> por jurisprudência consolidada do STJ — a concessionária pode tentar cobrar do novo dono, mas não pode cortar o serviço pelo passado. Pesquisar antes de lançar evita transformar um lance no valor "ok" em uma operação no vermelho.',
        },
      },
      {
        id: 'clausula_imissao',
        pergunta: 'Edital traz cláusula específica sobre imissão na posse?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Cláusula de imissão presente — ler condições específicas', nivel: 'informativo' },
          nao: { label: 'Edital omisso — vale a regra geral da Lei 9.514 (mandado liminar via ata)', nivel: 'seguro' },
        },
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: true,
          mensagem: 'Cláusulas específicas podem trazer prazo de tolerância, multa diária ou exigência de notificação extrajudicial prévia — afeta estratégia de desocupação (6a-desocupação).',
        },
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Procurar termos como <strong>"imissão na posse"</strong>, "desocupação", "prazo para entrega das chaves", "notificação extrajudicial prévia" no edital. Caixa costuma ter cláusulas específicas (prazo de 60 dias, multa diária por permanência, oferta de "auxílio mudança"). Anotar prazos e custos pra entrar na viabilidade.',
          teoria: 'A regra-base do <strong>art. 30 da Lei 9.514</strong> é: arrematante apresenta a ata ao juiz e <strong>obtém mandado liminar de imissão em até 60 dias</strong>, sem ação ordinária. Cláusulas específicas no edital podem <strong>adicionar etapas</strong> (notificação extrajudicial prévia, prazo de tolerância indenizado) ou <strong>simplificar</strong> (acordo amigável com taxa de ocupação 1% do lance mínimo por mês). Afeta diretamente o tempo+custo da fase 6a — leitura cuidadosa aqui evita meses de desocupação.',
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
        pergunta: 'Há averbação de consolidação da propriedade (Lei 9.514 §7º)?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Consolidação averbada em nome do credor fiduciário', nivel: 'seguro' },
          nao: { label: 'SEM consolidação averbada — leilão extrajudicial NULO', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        autopreencher: 'matricula.gates.consolidacao',
        fonte: '2-analise/pontos-eliminatorios.md:38',
        ajuda: {
          como: 'Varrer os <strong>atos Av-N (averbações)</strong> da matrícula procurando "consolidação da propriedade" em nome do <strong>credor fiduciário</strong> (banco ou securitizadora). Texto típico: "averbação da consolidação da propriedade em nome de [Banco X], com fundamento no art. 26 §7º da Lei 9.514/97, em razão do inadimplemento do contrato de alienação fiduciária". Conferir se a averbação é <strong>anterior à publicação do edital</strong> — averbação posterior é vício formal.',
          teoria: 'A consolidação é o <strong>marco jurídico</strong> que transfere a propriedade plena do devedor para o credor depois de notificado e não purgado o débito. Sem essa averbação, o credor <strong>não é proprietário</strong> — logo não pode leiloar. Leilão extrajudicial publicado antes da averbação é <strong>nulo de base</strong> (vício insanável). Item central da Fase 1: falhou aqui, descarta sem pensar.',
        },
      },
      {
        id: 'sem_sequestro_criminal',
        pergunta: 'A matrícula NÃO tem sequestro criminal?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Sem sequestro criminal averbado', nivel: 'seguro' },
          nao: { label: 'Sequestro criminal averbado — imóvel envolvido em crime, ficar fora', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        autopreencher: 'matricula.gates.sem_sequestro_criminal',
        fonte: '2-analise/pontos-eliminatorios.md:39',
        ajuda: {
          como: 'Varrer todos os atos R-N e Av-N procurando a palavra "sequestro" vinculada a <strong>vara criminal</strong> (estadual) ou <strong>federal criminal</strong> — não confundir com sequestro cível (vara cível, briga de propriedade) nem com arresto/penhora/indisponibilidade. Se aparecer: anotar nº do processo + vara, abrir o processo no eSAJ-Criminal (TJ) ou no PJe da Justiça Federal e verificar se já houve decisão de levantamento/restituição. Sem decisão de levantamento averbada na matrícula, considerar ativo. Padrão da casa: descartar.',
          teoria: 'Sequestro criminal é medida cautelar penal (arts. 125-144 do CPP) — o juízo criminal apreende o imóvel por entender que ele é <strong>produto ou instrumento de crime</strong>, ou foi <strong>adquirido com proveito de crime</strong> (lavagem de dinheiro, corrupção, tráfico, perdimento de bens). Difere fundamentalmente dos outros ônus: a penhora cível e o sequestro cível caem com a consolidação fiduciária (Lei 9.514, §§11-12) ou são canceláveis pelo arrematante via petição simples; o sequestro criminal não — o cancelamento depende de decisão da <strong>justiça criminal</strong>, no tempo dela, vinculado à conclusão do processo penal (que pode levar anos). Mesmo com a carta de arrematação em mãos, o cartório pode <strong>travar o registro do título</strong> enquanto o sequestro estiver ativo. Risco extra: MP ou União como parte (se federal), exposição de mídia, possível perdimento em favor da União ao final. Não vale o desconto — ficar fora.',
        },
      },
      {
        id: 'cadeia_dominial_ok',
        pergunta: 'A cadeia dominial está limpa, sem lacunas?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Cadeia dominial limpa — cada transferência registrada', nivel: 'seguro' },
          nao: { label: 'Lacunas na cadeia dominial — risco de evicção', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        autopreencher: 'matricula.gates.cadeia_dominial_ok',
        fonte: '2-analise/pontos-eliminatorios.md:41',
        ajuda: {
          como: 'Ler na matrícula a <strong>sequência de registros R-N</strong> (R-1, R-2, R-3...) que representam transferências de propriedade. Cada R-N deve ter como <strong>vendedor o comprador do R-N anterior</strong> — não pode haver "saltos". Se o R-3 vende para "João", mas o R-4 mostra "Pedro" vendendo, sem nenhum registro intermediário transferindo de João para Pedro, é uma lacuna. Conferir também averbações de retificação (Av-N) que possam ter corrigido descontinuidades.',
          teoria: 'O princípio da <strong>continuidade registral</strong> (Lei 6.015/73, art. 195) exige que cada novo registro tenha como vendedor o atual proprietário registrado. Lacunas surgem de: venda sem registro (compromisso particular nunca levado ao CRI), registro anulado por nulidade, fracionamento mal feito, fraude em averbação. Lacuna = <strong>risco de evicção</strong>: terceiro pode aparecer alegando que era ele o real proprietário no elo perdido e anular toda a cadeia. Você fica sem imóvel e processa quem te vendeu (boa sorte).',
        },
      },
      {
        id: 'vaga_no_edital',
        pergunta: 'Se a vaga tem matrícula independente, ela está listada no edital?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Vaga listada no edital (ou inclusa na mesma matrícula)', nivel: 'seguro' },
          nao: { label: 'Vaga em matrícula independente FORA do edital — arremata sem vaga', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        fonte: '2-analise/pontos-eliminatorios.md:42',
        ajuda: {
          como: 'Na descrição do imóvel na matrícula, procurar texto <strong>"vaga indicada na matrícula nº X"</strong>, "vaga de garagem com matrícula própria nº X" ou "box / vaga autônoma". Se aparecer, a vaga é um <strong>imóvel autônomo</strong> — conferir no edital se essa segunda matrícula está sendo leiloada junto. Em condomínios mais novos (especialmente verticais) é comum vagas terem matrícula própria.',
          teoria: 'A vaga de garagem pode ser <strong>parte da matrícula da unidade</strong> (vinculada, não vende separado) ou <strong>matrícula autônoma</strong> (vende separado, contagem de IPTU própria). No segundo caso, se o edital leiloa só a matrícula do apartamento, você arremata <strong>sem vaga</strong>. Em condomínios fechados e prédios verticais, isso <strong>destrói a liquidez de revenda</strong> — apartamento sem vaga vale 20-30% menos e leva muito mais tempo pra vender.',
        },
      },
      {
        id: 'matricula_completa',
        pergunta: 'O documento em mãos é a matrícula completa?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Matrícula completa — sem continuação pendente', nivel: 'seguro' },
          nao: { label: 'Matrícula incompleta ("continua na ficha N") — pedir versão integral antes de arrematar', nivel: 'bloqueante' },
        },
        criticidade: 'bloqueante',
        fonte: '2-analise/2-matricula.md:16',
        ajuda: {
          como: 'Olhar o <strong>final do documento</strong>. Se aparecer "continua na ficha N", "v. ficha N" ou houver salto na numeração dos atos (ex.: pula de Av-12 para Av-15 sem explicação), o documento está incompleto. Solicitar 2ª via <strong>integral</strong> ao Cartório de Registro de Imóveis competente. Curitiba: 13registros.com.br, custo aproximado R$ 50-80 + frete. Vale sempre a pena.',
          teoria: 'A matrícula é o histórico <strong>cronológico e linear</strong> do imóvel; quando uma ficha física enche, o CRI abre continuação numerada. Tudo que importa pra análise (consolidação, ônus, AFs sucessivas, sequestro, indisponibilidade) pode estar exatamente nas páginas que faltam — frequentemente os atos recentes ficam na continuação. Decidir arrematar com matrícula parcial é apostar no escuro contra um documento que custa R$ 50.',
        },
      },
      {
        id: 'notificacao_devedor',
        pergunta: 'Como o devedor foi notificado da consolidação?',
        tipo: 'radio',
        opcoes: [
          { valor: 'pessoal', label: 'Pessoalmente ou via AR (forma preferencial da lei)', nivel: 'seguro' },
          { valor: 'edital', label: 'Por edital (publicação) — exige verificar quem ocupa', nivel: 'atencao' },
          { valor: 'sem_info', label: 'Sem informação na matrícula', nivel: 'pendente' },
        ],
        criticidade: 'atencao',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Na averbação de consolidação (Av-N), ler como o devedor foi <strong>intimado pelo oficial do CRI</strong>: "notificado pessoalmente" (entregue na mão), "via correio com AR" (carta com aviso de recebimento) ou "por edital" (publicação em jornal/diário oficial). A forma costuma estar literal no texto da averbação. Se a matrícula só registra a consolidação sem indicar a forma, marcar como "sem info" e pedir a certidão de intimação ao CRI.',
          teoria: 'O <strong>art. 26 da Lei 9.514</strong> estabelece hierarquia: <strong>pessoal/AR é a regra</strong>; edital só vale quando o devedor "não foi localizado em qualquer dos endereços conhecidos" (§4º). Notificação por edital usada indevidamente é a <strong>causa mais comum de ação anulatória vencida pelo devedor</strong> — especialmente quando ele morava no imóvel dado em garantia, porque aí o credor sabia exatamente onde encontrá-lo. Combinar este campo com o próximo (devedor ocupa?).',
        },
      },
      {
        id: 'devedor_ocupa',
        pergunta: 'Devedor ainda mora no imóvel?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Devedor mora no imóvel', nivel: 'atencao' },
          nao: { label: 'Devedor não ocupa o imóvel', nivel: 'seguro' },
        },
        criticidade: 'atencao',
        condicional: { campo: 'notificacao_devedor', valor: 'edital' },
        combo: {
          com: 'notificacao_devedor',
          valor: 'edital',
          quando_meu_valor: true,
          nivel_combo: 'bloqueante',
          mensagem: '🚨 COMBO CRÍTICO: notificação por edital + devedor morando no imóvel = alto risco de nulidade do leilão por vício na notificação. Reconsiderar arrematação.',
        },
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Cruzar evidências: <strong>(1)</strong> Google + redes sociais — endereço público do devedor; <strong>(2)</strong> rodapés de petições recentes no e-SAJ/PJe (cadastro processual); <strong>(3)</strong> conversa com síndico, porteiro ou vizinhos próximos; <strong>(4)</strong> titular do cadastro de IPTU se a unidade tem inscrição própria; <strong>(5)</strong> endereço da residência declarada no contrato original de AF (se disponível). Mais de uma evidência convergindo = forte indício.',
          teoria: 'Se o devedor mora no imóvel da garantia, ele <strong>nunca foi inacessível</strong> — logo o credor não tinha justificativa legal para pular a notificação pessoal e usar edital. O combo <strong>"notificação por edital + devedor morador"</strong> é tese clássica de <strong>anulação por vício na notificação</strong>, e os tribunais costumam acolher. Padrão da casa: se este combo aparecer, reconsiderar a arrematação — o desconto raramente compensa o risco de perder o imóvel meses depois numa ação anulatória.',
        },
      },
      {
        id: 'afs_bem_encadeadas',
        pergunta: 'AFs sucessivas estão bem-encadeadas (ordem cronológica clara)?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'AFs em ordem cronológica clara (ou só uma AF ativa)', nivel: 'seguro' },
          nao: { label: 'AFs com ordem duvidosa — risco de credor posterior contestar a consolidação', nivel: 'atencao' },
        },
        criticidade: 'atencao',
        autopreencher: 'matricula.gates.afs_bem_encadeadas',
        fonte: '2-analise/pontos-eliminatorios.md:40',
        ajuda: {
          como: 'Ler em <strong>ordem cronológica</strong> os registros R-N de Alienação Fiduciária na matrícula. Cada AF deve ter <strong>data de contrato clara</strong>, identificação do credor, e (se cancelada) uma averbação Av-N de cancelamento com referência ao R-N que cancela. Procurar inconsistências: datas trocadas, cancelamento sem documento referenciado, AFs sobrepostas sem justificativa, AF nova sem averbação prévia do cancelamento da anterior.',
          teoria: 'Antes da <strong>Lei 14.711/2023</strong>, a 2ª AF sobre o mesmo imóvel era controvertida. Hoje, AFs sucessivas são <strong>válidas e disciplinadas</strong>: a 1ª AF tem prioridade na excussão, mas o credor da 2ª pode contestar a consolidação se houver vício formal (encadeamento confuso, datas inconsistentes). Encadeamento limpo blinda a operação; encadeamento ruim <strong>convida impugnação</strong> do credor da 2ª AF — que pode pedir nulidade do leilão para fazer a sua própria excussão.',
        },
      },
      {
        id: 'data_contrato_af',
        pergunta: 'Quando foi assinado o contrato de Alienação Fiduciária?',
        tipo: 'radio',
        opcoes: [
          { valor: 'pos_2017', label: 'Posterior a 06/09/2017 (sem purgação ampla — só direito de preferência)', nivel: 'seguro' },
          { valor: 'pre_2017', label: 'Anterior a 06/09/2017 — risco de purgação da mora até o leilão', nivel: 'atencao' },
          { valor: 'sem_info', label: 'Sem informação clara na matrícula', nivel: 'pendente' },
        ],
        criticidade: 'atencao',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Localizar o <strong>R-N original da AF</strong> (não a averbação de consolidação — o registro do contrato em si). Ler a data do contrato de alienação fiduciária. Marco crítico: <strong>06/09/2017</strong>, data da promulgação da Lei 13.465/2017 que alterou o art. 26 da Lei 9.514.',
          teoria: 'Contratos <strong>anteriores a 06/09/2017</strong> permitem ao devedor <strong>purgar a mora até o leilão</strong> (paga o atrasado + encargos, recupera o imóvel inteiro). Contratos <strong>posteriores</strong> só permitem <strong>direito de preferência</strong> (cobrir o melhor lance no leilão), mas não purgação ampla. Pré-2017 + devedor com cacife é red flag: você pode ganhar o leilão e perder pra purgação no dia — o lance é devolvido, mas você perde o tempo de pesquisa e a oportunidade. Se cair em pré-2017 com sinais de devedor solvente, descartar.',
        },
      },
      {
        id: 'natureza_af',
        pergunta: 'Natureza da Alienação Fiduciária',
        tipo: 'radio',
        opcoes: [
          { valor: 'residencial', label: 'Residencial — dívida do devedor extingue após leilão', nivel: 'seguro' },
          { valor: 'nao_residencial', label: 'Não-residencial (comercial) — devedor segue devendo, maior risco de impugnação', nivel: 'atencao' },
          { valor: 'sem_info', label: 'Sem informação clara', nivel: 'pendente' },
        ],
        criticidade: 'atencao',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Triangular três sinais: <strong>(1)</strong> descrição do imóvel — apartamento residencial em condomínio residencial é indício forte de AF residencial; <strong>(2)</strong> data do R-N de venda + R-N+1 de AF — se forem <strong>na mesma data</strong> ou em sequência imediata, é o caso típico residencial (financiamento da compra); datas distantes indicam AF em garantia de outro empréstimo (provável não-residencial); <strong>(3)</strong> menção literal: contratos habitacionais costumam citar "financiamento habitacional", "SFH/SFI residencial", "FGTS".',
          teoria: 'AF <strong>residencial</strong> (Lei 9.514, art. 27 §5º): se o produto do leilão não cobrir a dívida, o saldo remanescente é <strong>extinto</strong> — o devedor sai zerado, sem incentivo financeiro para impugnar. AF <strong>não-residencial</strong> (comercial, terreno, AF em garantia de capital de giro): o saldo devedor remanescente <strong>continua existindo</strong> — o devedor é cobrado pessoalmente depois do leilão. Logo o devedor não-residencial tem motivo concreto pra brigar (cada R$ a menos no leilão é R$ a mais na cobrança contra ele), e o risco de impugnação aumenta.',
        },
      },
      {
        id: 'onus_ativos',
        pergunta: 'Há ônus ativos não-cancelados na matrícula?',
        tipo: 'radio',
        opcoes: [
          { valor: 'nao', label: 'Sem ônus ativos (ou só os cancelados)', nivel: 'seguro' },
          { valor: 'propter_rem', label: 'Sim — dívida propter rem (IPTU/condomínio) — exige pagamento prévio', nivel: 'atencao' },
          { valor: 'pessoal_devedor', label: 'Sim — dívida pessoal do devedor — cai com a consolidação', nivel: 'atencao' },
          { valor: 'criminal', label: 'Sim — sequestro criminal — ficar fora', nivel: 'bloqueante' },
        ],
        criticidade: 'bloqueante',
        fonte: '4b-extrajudicial/onus-matricula.md',
        impacto_viabilidade: {
          quando_valor: 'propter_rem',
          mensagem: 'Dívida propter rem (IPTU/condomínio) exige pagamento prévio para cancelar o ônus — soma na linha de débitos da calculadora.',
        },
        ajuda: {
          como: 'Varrer <strong>todos os atos R-N e Av-N</strong> da matrícula, listando: penhora, arresto, indisponibilidade, sequestro, hipoteca, usufruto, indisponibilidade do CNJ. Para cada um, procurar averbação <strong>posterior</strong> de cancelamento (texto típico: "cancelada a penhora supra averbada em virtude de..." + referência ao R-N original). Ônus sem averbação de cancelamento = ativo. Classificar pela natureza para escolher a opção correta.',
          teoria: 'O efeito da consolidação fiduciária sobre os ônus depende da <strong>natureza</strong>: <strong>(1) penhora cível / arresto contra o devedor pessoal</strong> — cai automaticamente pela sub-rogação no saldo (§§11-12 do art. 27 da Lei 9.514); <strong>(2) IPTU/condomínio (propter rem)</strong> — segue o imóvel, exige pagamento ou negociação; <strong>(3) sequestro criminal</strong> — não cai com consolidação, exige decisão criminal (ver item específico); <strong>(4) hipoteca anterior à AF</strong> — questão complexa, exige análise específica do caso. Sempre filtrar pelo <strong>pior</strong> dos itens encontrados.',
        },
      },
      {
        id: 'leilao_judicial_paralelo',
        pergunta: 'Existe leilão judicial dos direitos do fiduciante em andamento?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Há leilão judicial paralelo dos direitos — ficar fora dos dois', nivel: 'bloqueante' },
          nao: { label: 'Sem leilão judicial paralelo identificado', nivel: 'seguro' },
        },
        criticidade: 'bloqueante',
        fonte: '4b-extrajudicial/onus-matricula.md#6',
        ajuda: {
          como: 'Para <strong>cada penhora</strong> ativa listada na matrícula, abrir o processo no <strong>PJe ou eSAJ</strong> e procurar decisão recente determinando "leilão judicial dos direitos do executado", "praceamento" ou "expedição de mandado de leilão". Se houver, é um segundo leilão tentando vender o mesmo imóvel — em vara cível ou trabalhista, vendendo os direitos do fiduciante (não a propriedade plena).',
          teoria: 'Em tese, a consolidação fiduciária extingue os direitos do fiduciante e o leilão judicial paralelo <strong>perde objeto</strong>. Mas, na prática, esse confronto pode <strong>travar o registro</strong> da carta de arrematação no cartório, gerar <strong>impugnação cruzada</strong> e <strong>briga entre arrematantes</strong> dos dois leilões. Mesmo ganhando a tese ao final, o tempo + custo de advogado destrói a margem. Não vale o desconto: descartar.',
        },
      },
      {
        id: 'dacao_em_pagamento',
        pergunta: 'Houve dação em pagamento registrada na matrícula?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Dação em pagamento registrada — provável imóvel desocupado', nivel: 'informativo' },
          nao: { label: 'Sem dação em pagamento registrada', nivel: 'seguro' },
        },
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: true,
          mensagem: 'Dação em pagamento sugere imóvel já desocupado (devedor entregou voluntariamente) — pode zerar custo de desocupação na viabilidade.',
        },
        fonte: '2-analise/2-matricula.md:172',
        ajuda: {
          como: 'Procurar na matrícula <strong>registro R-N</strong> com texto "transmitiu a título de <strong>dação em pagamento</strong>" ou "escritura pública de confissão de dívida, assunção de obrigações, dação em pagamento e outras avenças". Costuma aparecer como alternativa à consolidação (em vez de leilão obrigatório, o devedor entregou o imóvel ao credor voluntariamente).',
          teoria: 'Dação em pagamento é entrega <strong>voluntária</strong> do imóvel pelo devedor ao credor, em quitação da dívida. Quem assina dação geralmente já <strong>aceitou a saída</strong> — então o imóvel costuma estar desocupado (ou em vias de desocupar). É sinal forte para zerar o custo de desocupação na viabilidade (fase 6a). Confirmar via visita ou contato com síndico antes de lançar — a dação não garante que o devedor saiu, só que ele juridicamente abriu mão.',
        },
      },
      {
        id: 'foreiro',
        pergunta: 'O imóvel é foreiro (enfiteuse)?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Foreiro — soma laudêmio (na arrematação) + foro anual', nivel: 'informativo' },
          nao: { label: 'Não foreiro (propriedade plena)', nivel: 'seguro' },
        },
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: true,
          mensagem: 'Foreiro acrescenta laudêmio (% sobre arrematação) + foro anual à viabilidade. Confirmar com Secretaria de Patrimônio da União (foreiro federal) ou ordem religiosa.',
        },
        autopreencher: 'matricula.extraido.foreiro',
        fonte: '2-analise/debitos.md',
        ajuda: {
          como: 'Procurar na matrícula palavras-chave: <strong>"domínio útil"</strong>, "enfiteuse", "foreiro", "senhorio direto", "aforamento", "terreno de Marinha", "SPU", "ordem religiosa". Em <strong>Curitiba é raríssimo</strong>; mais comum em cidades litorâneas (terreno de Marinha — União é senhorio) e cidades com forte presença de ordens religiosas (Olinda, Petrópolis, partes de SP). Se aparecer foreiro federal, consultar o SisREI da SPU para confirmar o valor atualizado.',
          teoria: 'A enfiteuse é uma <strong>dupla propriedade</strong>: o <strong>senhorio direto</strong> (União, ordem religiosa) é dono do terreno; o <strong>enfiteuta</strong> é dono do "domínio útil" (uso, gozo, disposição). Custos extras: <strong>laudêmio</strong> (~2,5% do valor da transação, pago na compra ao senhorio direto) e <strong>foro anual</strong> (taxa anual recorrente). O Código Civil de 2002 proibiu novas enfiteuses civis, mas <strong>preservou as existentes</strong> — pode aparecer em imóveis antigos.',
        },
      },
      {
        id: 'contribuinte_unidade',
        pergunta: 'Há averbação do contribuinte municipal da unidade?',
        tipo: 'binario',
        afirmacoes: {
          sim: { label: 'Inscrição municipal da unidade averbada — IPTU consultável online', nivel: 'seguro' },
          nao: { label: 'Só "contribuinte em área maior" — IPTU da unidade não consultável online', nivel: 'informativo' },
        },
        criticidade: 'informativo',
        impacto_viabilidade: {
          quando_valor: false,
          mensagem: 'IPTU da unidade só pesquisável após averbar via prefeitura, ou via execução fiscal no TJ. Dificulta a pesquisa de débitos da Fase 1.',
        },
        fonte: '2-analise/2-matricula.md:39',
        ajuda: {
          como: 'Procurar averbação com texto <strong>"atualmente cadastrado pelo contribuinte [número]"</strong> ou "indicação fiscal nº..." ou "certidão de dados cadastrais do imóvel". Se aparecer, anotar o número — é a chave para consultar IPTU da unidade no portal da prefeitura. Se não aparecer, o início da matrícula geralmente traz apenas "contribuinte em área maior" (terreno do condomínio inteiro).',
          teoria: 'A prefeitura atribui inscrição própria a cada unidade autônoma quando o construtor/condomínio pede a <strong>individualização fiscal</strong>. Sem isso, a única forma de saber o IPTU é via execução fiscal no TJ (e só se já houver execução em curso) ou indo presencialmente ao balcão da prefeitura com a matrícula. Não impede a arrematação, mas <strong>dificulta a Fase 1</strong> (pesquisa de débitos) e atrasa a regularização pós-arrematação — você só consegue o cadastro próprio depois do registro da carta.',
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
          como: '<strong>Identificar o tribunal correto:</strong> Caixa/Emgea → Justiça Federal + TRF da região (PJe). Bancos privados, securitizadoras ou particulares → TJ do <strong>estado do imóvel</strong> (não do domicílio do devedor — a competência é do foro da situação do bem). Buscar nos dois sentidos: <strong>(1)</strong> devedor como autor × credor como réu (ação anulatória, revisional, embargos à execução); <strong>(2)</strong> devedor como réu × credor como autor (execução, retomada, busca e apreensão). Ferramentas: e-SAJ (TJSP, TJPR), PJe (TRFs, TJs novos), Projudi. <strong>Repetir na véspera e na manhã do leilão</strong>.',
          teoria: 'Devedores costumam protocolar ações <strong>às vésperas do leilão</strong> (ação anulatória com pedido de tutela de urgência) para tentar travar. Pesquisa antiga é pesquisa morta — a análise é <strong>dinâmica</strong>: refazer próximo do pregão é tão importante quanto fazer no início. Erro comum: pesquisar no tribunal do <strong>domicílio do devedor</strong> em vez do tribunal do <strong>estado do imóvel</strong> — a pesquisa fica vazia e dá falsa sensação de segurança.',
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
          como: 'Para cada processo encontrado, ler o <strong>último andamento decisivo</strong>: foi pedida liminar? deferida ou indeferida? houve agravo de instrumento? credor já se manifestou com provas (contestação substancial, juntada de documentos)? há sentença em 1ª instância? acórdão de 2ª? trânsito em julgado? A natureza do último ato relevante define o ponto da escala.',
          teoria: 'Escala de <strong>pontos de segurança 1-6</strong> (do menos para o mais seguro): <strong>(1)</strong> processo recente sem decisão sobre liminar; <strong>(2)</strong> liminar pendente; <strong>(3)</strong> liminar indeferida + agravo indeferido + credor contestou com provas; <strong>(4)</strong> sentença em primeira instância a favor do credor; <strong>(5)</strong> sentença em 2ª instância (acórdão) a favor do credor; <strong>(6)</strong> trânsito em julgado. <strong>Mínimo razoável para arrematar: ponto 3</strong>. Abaixo disso, o devedor ainda tem caminho processual aberto e o risco de reversão é real.',
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
          como: 'Buscar <strong>3-5 imóveis comparáveis</strong> no ZAP, Viva Real, OLX, QuintoAndar: <strong>mesmo bairro</strong> (ou vizinhança imediata), <strong>mesma metragem (±10%)</strong>, idade próxima, mesmo padrão construtivo. Anotar o preço pedido (e o histórico de preço, se possível — anúncios antigos costumam estar acima). Pegar a <strong>mediana</strong>, não a média (média é puxada por outliers). Para refinar, ligar para 1-2 corretores locais perguntando "quanto realmente vende, não quanto anuncia".',
          teoria: 'O valor de mercado é o <strong>denominador da fórmula de lucro</strong> da viabilidade — superestimar destrói a operação. Subestimar 5-10% para ser <strong>conservador</strong>, porque o preço de venda real costuma ser 5-15% abaixo do preço anunciado (poder de barganha do comprador, tempo de venda, descontos no fechamento). Se a viabilidade só fecha com valor de mercado otimista, o imóvel não fecha — descartar.',
        },
      },
      {
        id: 'lance_pretendido',
        label: 'Lance pretendido (R$)',
        tipo: 'numero',
        autopreencher: 'viabilidade.valor_arrematacao',
        fonte: '3-viabilidade/README.md',
        ajuda: {
          como: 'Começar pelo <strong>lance mínimo do 1º leilão</strong> e rodar a viabilidade. Se passa na margem alvo (30% de lucro líquido), tem espaço para subir; se não passa, partir pro 2º (lance mínimo menor) e refazer a conta. A calculadora deve indicar o <strong>lance máximo</strong> que ainda fecha — esse é o <strong>teto absoluto</strong> pra subir no pregão.',
          teoria: 'O lance é uma decisão tática: começar baixo dá espaço de subida no pregão sem queimar a margem. Definir o <strong>teto antes do pregão</strong> e segurar firme — leilão é ambiente emocional, é comum pessoas pagarem acima do teto na disputa e quebrarem a operação inteira. Escrever o teto no papel antes do pregão é trivial e funciona como âncora.',
        },
      },
      {
        id: 'iptu_mensal',
        label: 'IPTU mensal estimado (R$)',
        tipo: 'numero',
        autopreencher: 'estimativas.iptu_mensal',
        fonte: '2-analise/4-pesquisa-debitos.md',
        ajuda: {
          como: 'IPTU anual ÷ 12. Em <strong>Curitiba</strong>: portal da prefeitura → "Consulta IPTU" → digitar contribuinte (vem da matrícula). Se o imóvel não tem contribuinte próprio (ver item "contribuinte da unidade" na matrícula), estimar por <strong>analogia</strong> com apartamento similar no mesmo bairro. Padrão Curitiba para 60-100 m²: <strong>R$ 150-400/mês</strong>.',
          teoria: 'IPTU é <strong>carrego mensal</strong> durante o período entre arrematação e revenda (6-18 meses típicos). Não é grande individualmente, mas acumula em 12+ meses. Importante separar dois conceitos: <strong>(a)</strong> IPTU futuro (carrego mensal, entra aqui); <strong>(b)</strong> IPTU vencido propter rem (fica com o imóvel, entra na linha de débitos da calculadora, não aqui).',
        },
      },
      {
        id: 'condominio_mensal',
        label: 'Condomínio mensal estimado (R$)',
        tipo: 'numero',
        autopreencher: 'estimativas.condominio_mensal',
        fonte: '2-analise/4-pesquisa-debitos.md',
        ajuda: {
          como: 'Ligar para a <strong>administradora do condomínio</strong> (geralmente listada no boleto, no site do prédio ou em uma plaquinha no térreo) e pedir o valor da cota condominial atual da unidade. Se não conseguir, estimar por metragem — Curitiba: <strong>R$ 5-15/m²</strong> em prédios médios, mais em alto-padrão. Confirmar também se há <strong>cota extra em andamento</strong> (reforma, troca de elevador, fundo de obra).',
          teoria: 'Condomínio é o <strong>maior carrego mensal</strong> — costuma superar o IPTU. Em prédios com áreas comuns grandes (piscina, salão, sauna, academia), pode passar de R$ 1.500-2.000 mesmo em apartamento médio. Cotas extras em andamento somam centenas por mês até quitar. Subestimar aqui inverte o sinal da viabilidade — superestimar 10-15% é prudente.',
        },
      },
      {
        id: 'patologia_2o_caro',
        label: 'Patologia: 2º leilão tem lance ≥ valor de mercado',
        tipo: 'tri',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Comparar diretamente: <strong>lance mínimo do 2º leilão</strong> (no edital) vs <strong>valor de mercado pesquisado</strong>. Se 2º ≥ valor de mercado, é a patologia. Acontece principalmente quando o devedor pagou pouco da dívida e os juros + encargos acumularam acima do venal.',
          teoria: 'Em tese, o 2º leilão deveria ser <strong>mais barato</strong> que o 1º (lance mínimo cai). Mas pela Lei 9.514, o lance mínimo do 2º é <strong>"dívida atualizada + encargos"</strong> — se o devedor pagou pouca coisa da dívida (financiamento recente, atrasos curtos, juros altos no contrato), a dívida atualizada pode estar <strong>acima do valor venal e até do valor de mercado</strong>. Patologia detectada: <strong>não esperar pelo 2º</strong>. Se o 1º já fecha em viabilidade, lançar no 1º.',
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
          como: 'Procurar no edital <strong>"lance mínimo 1º leilão"</strong>, "valor do 1º leilão" ou "preço mínimo de 1ª praça". Costuma vir destacado na primeira ou segunda página, junto com a data do pregão.',
          teoria: 'O lance mínimo do 1º leilão é <strong>dívida total atualizada + encargos</strong> (juros, multa, custas de notificação extrajudicial, custas de cartório, custas de leilão). Por isso é tipicamente alto e o 1º <strong>raramente vende</strong> — é praticamente o "salvar o credor". Vale lançar no 1º quando: o imóvel valorizou muito desde a AF (mercado pulou e a dívida ficou pra trás), edital tem outras vantagens (credor banca propter rem, prazos longos), ou o 2º está pior (patologia 2º caro).',
        },
      },
      {
        id: 'lance_minimo_2o',
        label: 'Lance mínimo 2º leilão (R$)',
        tipo: 'numero',
        autopreencher: 'edital.extraido.lance_minimo_segundo',
        fonte: '4b-extrajudicial/notificacao.md',
        ajuda: {
          como: 'Procurar no edital "lance mínimo 2º leilão" ou "valor da 2ª praça". Em geral é menor que o 1º, mas <strong>nem sempre</strong> — atenção à patologia "2º mais caro" descrita no item de viabilidade.',
          teoria: 'O lance mínimo do 2º leilão, pela Lei 9.514, é o <strong>maior valor entre dívida atualizada e valor de avaliação</strong>. Importante: <strong>não é</strong> automaticamente 50% do valor venal (essa regra de "lance vil = 50%" é específica do leilão judicial — CPC art. 891). Cada edital especifica. Se a dívida estiver alta, o lance mínimo do 2º pode estar acima do valor de mercado — patologia.',
        },
      },
      {
        id: 'comissao_5_confirmada',
        label: 'Comissão leiloeiro 5% confirmada na ata',
        tipo: 'tri',
        fonte: '5-arrematacao/README.md',
        ajuda: {
          como: 'Reler a <strong>ata de arrematação</strong> antes de assinar, na linha "comissão do leiloeiro". Deve bater com a cláusula do edital. Se na ata aparece percentual maior que no edital, exigir correção <strong>antes</strong> de pagar — assinou e pagou, a correção depois é via judicial e custa mais que o desconto.',
          teoria: 'A comissão é devida ao leiloeiro <strong>pelo arrematante</strong> (não desconta do lance — soma sobre o lance). Padrão de mercado e regra do <strong>Decreto 21.981/32, art. 24</strong>: <strong>5% sobre o valor de arrematação</strong>. Edital pode definir outro percentual; o que vale é o do edital. Tentativa de cobrança acima do edital é abuso — basta apontar o documento e o leiloeiro recua.',
        },
      },
      {
        id: 'itbi_calculado',
        label: 'ITBI calculado (alíquota da cidade × valor de arrematação)',
        tipo: 'tri',
        fonte: '5-arrematacao/README.md',
        ajuda: {
          como: 'Confirmar a alíquota do <strong>ITBI da cidade do imóvel</strong> (não da sua cidade). Curitiba: <strong>2,7% sobre o valor de arrematação</strong> (não sobre venal). Pagamento via portal da prefeitura, <strong>antes do registro da carta</strong> no CRI. Curitiba dá tipicamente 30 dias após a ata para emitir o DAM sem multa — confirmar prazo atual.',
          teoria: 'O ITBI é o <strong>segundo maior custo</strong> da arrematação depois da reforma — em Curitiba, com 2,7%, um lance de R$ 300k paga R$ 8.100 de ITBI. Importante precedente: o <strong>STF (Tema 1.124, 2023)</strong> firmou que a base de cálculo é o <strong>valor de arrematação</strong> (mais baixo, em geral) e <strong>não a avaliação venal</strong> — se a prefeitura tentar cobrar sobre venal, contestar com referência ao Tema 1.124.',
        },
      },
      {
        id: 'ata_validada',
        label: 'Ata de arrematação validada com o leiloeiro',
        tipo: 'tri',
        fonte: '4b-extrajudicial/pos-arrematacao.md',
        ajuda: {
          como: 'Antes de assinar, conferir na ata: <strong>(1)</strong> nº da matrícula; <strong>(2)</strong> descrição do imóvel idêntica à matrícula; <strong>(3)</strong> valor de arrematação; <strong>(4)</strong> prazo de pagamento (à vista? parcelado? quando vence?); <strong>(5)</strong> comissão do leiloeiro; <strong>(6)</strong> responsável por propter rem; <strong>(7)</strong> dados completos do arrematante (nome, CPF, estado civil, regime de bens, endereço). Erro nesses pontos atrasa o registro depois.',
          teoria: 'A ata de arrematação é o <strong>título hábil para registro</strong> da propriedade no CRI (Lei 9.514, art. 27 §1º + Provimento CNJ 87/2019). O cartório pode <strong>devolver com nota de exigência</strong> se algum dado estiver errado ou incompleto — e o registro destravado é o que libera ITBI, financiamento e revenda. Conferir tudo antes de assinar é o investimento de 10 minutos que pode poupar 30+ dias de retrabalho.',
        },
      },
      {
        id: 'pesquisa_processos_refeita',
        label: 'Pesquisa de processos refeita na véspera/manhã do leilão',
        tipo: 'tri',
        fonte: '4b-extrajudicial/processos-devedor-credor.md',
        ajuda: {
          como: '<strong>Horas antes do pregão</strong>, repetir a busca devedor × credor no(s) tribunal(is) relevante(s). Se aparecer processo novo, especialmente com tutela de urgência pedida, decidir antes do pregão: desistir, lançar com ciência do risco, ou consultar advogado de plantão. Anotar nº do processo e tese.',
          teoria: 'Devedores cientes do leilão protocolam <strong>ações de última hora</strong> (ação anulatória + tutela de urgência) para tentar suspender o pregão. <strong>Liminar concedida na manhã do pregão</strong> pode suspender o leilão; <strong>concedida depois</strong> pode anular a arrematação. Pesquisa do dia é a única forma de não ser pego de surpresa — e custa 15 minutos.',
        },
      },
      {
        id: 'averbacao_leilao_negativo',
        label: 'Averbação de leilão negativo já na matrícula (se aplicável)',
        tipo: 'tri',
        condicional: { campo: 'modalidade', aba: 'edital', valor: 'pos_leilao' },
        fonte: '4b-extrajudicial/oportunidades-pos-leilao.md',
        ajuda: {
          como: 'Para <strong>pós-leilão</strong> (venda direta após 2 leilões negativos), conferir se há <strong>averbação Av-N</strong> na matrícula com texto "leilão negativo", "leilões obrigatórios encerrados sem licitante" ou similar, para 1º e 2º leilão. Se não houver, o arrematante terá que <strong>provar documentalmente</strong> ao cartório (cópias das atas dos leilões negativos) — pode virar nota de exigência no registro.',
          teoria: 'Sem essa averbação, a fase do imóvel fica <strong>ambígua</strong> no cartório — o credor pode estar tentando vender direto antes dos leilões obrigatórios, o que é nulo. A averbação é a forma oficial de carimbar "leilões obrigatórios já aconteceram e foram negativos, agora cabe venda direta". Documento útil também para a escritura de compra e venda subsequente, se houver revenda rápida.',
        },
      },
    ],
  },
};
