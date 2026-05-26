#!/usr/bin/env bash
# Sobe o servidor Flask que serve o site + API de análise de imóveis.
#
# Uso:  ./site/serve.sh  [porta]
#       (porta default: 9000)
#
# Wizard de análise:  http://<host>:<porta>/imoveis
# Viewer de docs:      http://<host>:<porta>/docs

set -euo pipefail

PORT="${1:-9000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

# Regenera tree.json — usado pelo viewer de docs em /docs
.venv/bin/python site/generate_tree.py

# Descobre IP local pra mostrar URL acessível de outros dispositivos no wifi.
LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"

cat <<EOF

╭───────────────────────────────────────────────────╮
│  Servidor de análise de imóveis no ar             │
╰───────────────────────────────────────────────────╯

  Aqui na máquina:   http://localhost:$PORT/
EOF

if [ -n "$LOCAL_IP" ]; then
  cat <<EOF
  Outros no wifi:    http://$LOCAL_IP:$PORT/
EOF
fi

cat <<'EOF'

  Wizard de análise:  /imoveis
  Viewer de docs:     /docs

  Ctrl-C para parar.

EOF

exec .venv/bin/python scripts/server.py "$PORT"
