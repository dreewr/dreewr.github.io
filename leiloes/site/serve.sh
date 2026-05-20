#!/usr/bin/env bash
# Serve o repositório a partir do raiz, para o viewer em site/ acessar
# todos os markdowns por path absoluto.
#
# Uso:  ./site/serve.sh  [porta]
#       (porta default: 8765)

set -euo pipefail

PORT="${1:-8765}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

# Regenera tree.json sempre que o servidor sobe — captura novos arquivos
# adicionados desde a última geração.
python3 site/generate_tree.py

echo
echo "Servindo $REPO_ROOT em http://localhost:$PORT/"
echo "Viewer:           http://localhost:$PORT/site/"
echo
echo "Ctrl-C para parar."
echo

python3 -m http.server "$PORT"
