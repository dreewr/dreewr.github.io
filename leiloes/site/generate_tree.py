#!/usr/bin/env python3
"""Gera tree.json com a árvore de arquivos do repositório para o viewer.

Inclui:
  - Markdowns (.md) — renderizáveis no site
  - Modelos .docx / .doc — linkados como download

Ignora:
  - Pastas ocultas (começam com .)
  - node_modules, __pycache__, venv, site
  - Pastas explicitamente listadas em IGNORE_DIRS

Uso:
  python3 site/generate_tree.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "tree.json"

IGNORE_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    "venv",
    ".venv",
    "site",
    ".claude",
    ".idea",
    ".vscode",
}

MD_EXT = {".md"}
MODEL_EXT = {".docx", ".doc"}


def build(path: Path):
    entries = []
    try:
        items = sorted(
            path.iterdir(),
            key=lambda p: (not p.is_dir(), p.name.lower()),
        )
    except PermissionError:
        return entries

    for item in items:
        if item.name.startswith("."):
            continue
        if item.is_dir():
            if item.name in IGNORE_DIRS:
                continue
            children = build(item)
            if children:
                entries.append(
                    {
                        "type": "dir",
                        "name": item.name,
                        "path": str(item.relative_to(ROOT)),
                        "children": children,
                    }
                )
        else:
            suffix = item.suffix.lower()
            if suffix in MD_EXT:
                entries.append(
                    {
                        "type": "md",
                        "name": item.name,
                        "path": str(item.relative_to(ROOT)),
                    }
                )
            elif suffix in MODEL_EXT:
                entries.append(
                    {
                        "type": "model",
                        "name": item.name,
                        "path": str(item.relative_to(ROOT)),
                    }
                )

    return entries


def main():
    tree = build(ROOT)
    OUT.write_text(json.dumps(tree, indent=2, ensure_ascii=False))

    def count(nodes):
        md = 0
        models = 0
        dirs = 0
        for n in nodes:
            if n["type"] == "dir":
                dirs += 1
                cmd, cmodels, cdirs = count(n["children"])
                md += cmd
                models += cmodels
                dirs += cdirs
            elif n["type"] == "md":
                md += 1
            elif n["type"] == "model":
                models += 1
        return md, models, dirs

    md, models, dirs = count(tree)
    print(
        f"Wrote {OUT.relative_to(ROOT)}: "
        f"{md} markdowns, {models} modelos, {dirs} pastas."
    )


if __name__ == "__main__":
    sys.exit(main())
