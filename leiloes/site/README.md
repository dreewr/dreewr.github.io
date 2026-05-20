# Viewer do repositório

Site local para navegar pelos markdowns deste repositório com **boa legibilidade** e **alto contraste**. Não há build — é HTML + CSS + JS estáticos. Roda em qualquer máquina com Python 3.

## Como rodar

```bash
./site/serve.sh           # porta 8765 (padrão)
./site/serve.sh 8000      # porta custom
```

Depois abre [http://localhost:8765/site/](http://localhost:8765/site/) no navegador.

> O script regenera `tree.json` automaticamente (capta novos arquivos) e serve o repositório inteiro a partir do raiz — o viewer está em `/site/`, mas precisa acessar todos os markdowns em paths como `/analise/extrajudicial/onus-matricula.md`.

### Sem o script

```bash
python3 site/generate_tree.py       # gera site/tree.json
python3 -m http.server 8765         # rodar do raiz do repo
```

## Funcionalidades

- **Sidebar em árvore** com as pastas e arquivos `.md` do repositório. Pastas expandem/colapsam. Modelos `.docx` aparecem como link de download.
- **Renderização de markdown** com tabelas, code blocks, blockquotes, listas, checkboxes do GFM, headings com âncoras.
- **Links relativos** entre markdowns funcionam — ao clicar, navega na própria SPA. Links externos abrem em nova aba.
- **Âncoras de seção** funcionam (`arquivo.md#secao`).
- **Roteamento por hash** — URL reflete o documento aberto, pode compartilhar / favoritar.

## Acessibilidade

- Fonte base **18px**, headings escalonados; controle `A− / A+` no header (mantém escolha em `localStorage`).
- **Contraste alto** em ambos os temas (light/dark). Texto principal acima de **14:1**, links acima de **7:1**.
- **Tema claro / escuro / automático** (segue `prefers-color-scheme`). Toggle no header, persistente.
- **Foco visível** em todos os elementos interativos (outline laranja de 3px).
- **Navegação por teclado**: skip-link para o conteúdo, sidebar inteira tabbable, árvore com `role=tree` e `aria-expanded`.
- **`prefers-reduced-motion`** respeitado — desliga animações.
- **Estrutura semântica**: `<header>`, `<nav aria-label>`, `<main tabindex=-1>`, `<article aria-live>`, `<footer>`.
- Cores **nunca** são o único portador de informação (link ativo tem fundo amarelo + bold; foco tem outline; expansão tem rotação do triângulo).

## Estrutura

```
site/
├── index.html              # SPA shell
├── style.css               # tema light/dark, controles de fonte, layout
├── app.js                  # routing, render, tree, theme, font
├── tree.json               # árvore gerada do repositório
├── generate_tree.py        # gera tree.json
├── serve.sh                # atalho: gera + serve do raiz
├── vendor/
│   └── marked.min.js       # parser markdown (offline, v9.1.6)
└── README.md               # este arquivo
```

## Limites por enquanto

- Sem busca textual.
- Sem renderização de Mermaid (o fluxograma no `CLAUDE.md` aparece como code block).
- Modelos `.docx` baixam, não renderizam.
- Sem visualização de planilhas (`analise/viabilidade/calculadora-leilao.xlsx`).
- Sem visualização de CSVs (`garimpo/*.csv`).
- `tree.json` é gerado sob demanda — não há watcher; novos arquivos pedem regerar.
