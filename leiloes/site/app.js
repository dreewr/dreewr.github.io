(() => {
  "use strict";

  let currentPath = null;
  let tree = [];

  // ----- slugify (replica GFM-ish anchor) ---------------------------------
  // Tudo lowercase; remove pontuação ASCII mas preserva letras/números
  // Unicode (acentos); cada espaço vira um hífen (substituição 1:1, não
  // colapsada — assim "rem — acompanha" vira "rem--acompanha" porque os
  // dois espaços ao redor do em-dash se mantêm depois que ele é removido,
  // que é como o GitHub gera).
  function slugify(text) {
    return text
      .toLowerCase()
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s/g, "-");
  }

  // ----- hash routing ------------------------------------------------------
  function parseHash() {
    const raw = (location.hash || "").slice(1).replace(/^\//, "");
    if (!raw) return { path: null, anchor: null };
    const m = raw.match(/^(.+?\.md)(?:#(.*))?$/);
    if (m) return { path: m[1], anchor: m[2] || null };
    return { path: null, anchor: raw };
  }

  // ----- path resolver -----------------------------------------------------
  function resolveRelative(basePath, rel) {
    if (rel.startsWith("/")) return rel.replace(/^\/+/, "");
    const baseDir = basePath.split("/").slice(0, -1);
    const parts = baseDir.slice();
    rel.split("/").forEach((seg) => {
      if (seg === "" || seg === ".") return;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    });
    return parts.join("/");
  }

  // ----- tree DOM ----------------------------------------------------------
  function buildTreeDOM(entries, depth) {
    const ul = document.createElement("ul");
    ul.setAttribute("role", depth === 0 ? "tree" : "group");

    for (const entry of entries) {
      const li = document.createElement("li");
      li.setAttribute("role", "treeitem");

      if (entry.type === "dir") {
        li.classList.add("tree-folder");
        const isOpen = depth === 0;
        li.setAttribute("data-open", isOpen ? "true" : "false");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = entry.name;
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        btn.addEventListener("click", () => {
          const open = li.getAttribute("data-open") === "true";
          li.setAttribute("data-open", open ? "false" : "true");
          btn.setAttribute("aria-expanded", open ? "false" : "true");
        });
        li.appendChild(btn);
        li.appendChild(buildTreeDOM(entry.children, depth + 1));
      } else if (entry.type === "md") {
        const a = document.createElement("a");
        a.classList.add("file-md");
        a.href = "#" + entry.path;
        a.textContent = entry.name.replace(/\.md$/, "");
        a.title = entry.path;
        a.dataset.path = entry.path;
        li.appendChild(a);
      } else if (entry.type === "model") {
        const a = document.createElement("a");
        a.classList.add("file-model");
        a.href = "/" + entry.path;
        a.textContent = entry.name;
        a.title = "Download — " + entry.path;
        a.setAttribute("download", "");
        li.appendChild(a);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  // ----- expand ancestors of active link -----------------------------------
  function highlightInTree(path) {
    document.querySelectorAll(".tree a").forEach((a) => {
      if (a.dataset.path === path) {
        a.setAttribute("aria-current", "page");
        let folder = a.closest("li").parentElement?.closest(".tree-folder");
        while (folder) {
          folder.setAttribute("data-open", "true");
          const btn = folder.querySelector(":scope > button");
          if (btn) btn.setAttribute("aria-expanded", "true");
          folder = folder.parentElement?.closest(".tree-folder");
        }
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  // ----- markdown render ---------------------------------------------------
  function configureMarked() {
    const renderer = new marked.Renderer();
    const baseHeading = renderer.heading.bind(renderer);
    renderer.heading = function (text, level, raw) {
      // raw vem com o texto bruto (sem inline parsing); use para o slug.
      const id = slugify(raw || text);
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    };
    marked.setOptions({
      renderer,
      gfm: true,
      breaks: false,
      pedantic: false,
      smartypants: false,
    });
  }

  function rewriteLinks(htmlString, basePath) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = htmlString;

    wrapper.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return;
      }
      if (href.startsWith("#")) return; // âncora dentro do doc atual
      const [pathPart, anchorPart] = href.split("#");
      const resolved = resolveRelative(basePath, pathPart);
      if (resolved.toLowerCase().endsWith(".md")) {
        a.setAttribute(
          "href",
          "#" + resolved + (anchorPart ? "#" + anchorPart : "")
        );
      } else {
        // arquivo não-md (docx, xlsx, pdf, csv, py): link direto absoluto
        a.setAttribute("href", "/" + resolved);
        a.setAttribute("download", "");
        a.title = "Download — " + resolved;
      }
    });

    wrapper.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;
      if (/^(https?:|data:)/i.test(src)) return;
      const resolved = resolveRelative(basePath, src);
      img.setAttribute("src", "/" + resolved);
      if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
    });

    return wrapper.innerHTML;
  }

  // ----- load markdown -----------------------------------------------------
  async function loadMd(path, anchor) {
    const article = document.getElementById("article");
    article.setAttribute("aria-busy", "true");
    article.innerHTML = '<p class="placeholder">Carregando…</p>';

    try {
      const resp = await fetch("../" + path);
      if (!resp.ok) {
        article.innerHTML = `<h1>Arquivo não encontrado</h1><p>Não consegui abrir <code>${escapeHTML(
          path
        )}</code> (HTTP ${resp.status}).</p><p>Verifique se você está rodando o servidor a partir do raiz do repositório — veja o <a href="#site/README.md">README do site</a>.</p>`;
        document.getElementById("file-meta-path").textContent = path;
        return;
      }
      const md = await resp.text();
      const html = rewriteLinks(marked.parse(md), path);
      article.innerHTML = html;
      currentPath = path;
      highlightInTree(path);

      document.getElementById("file-meta-path").textContent = path;
      const title = path.split("/").pop().replace(/\.md$/, "");
      document.title = title + " — Leilões";

      if (anchor) {
        // Aguarda pintura, depois rola para a âncora.
        requestAnimationFrame(() => {
          const target = document.getElementById(anchor);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      } else {
        window.scrollTo(0, 0);
        document.getElementById("main-content").focus();
      }
    } catch (err) {
      article.innerHTML = `<h1>Erro ao carregar</h1><p>${escapeHTML(
        err.message
      )}</p>`;
    } finally {
      article.setAttribute("aria-busy", "false");
    }
  }

  function escapeHTML(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ----- theme -------------------------------------------------------------
  const THEME_KEY = "leiloes-theme";
  const THEME_ICONS = { light: "☀️", dark: "🌙", auto: "🌓" };
  const THEME_LABELS = {
    light: "Tema claro",
    dark: "Tema escuro",
    auto: "Tema automático (segue o sistema)",
  };

  function applyTheme(mode) {
    if (mode === "auto") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
    document.getElementById("theme-icon").textContent = THEME_ICONS[mode];
    document.getElementById("theme-label").textContent = THEME_LABELS[mode];
    document
      .getElementById("theme-toggle")
      .setAttribute("aria-label", THEME_LABELS[mode] + " — clicar para alternar");
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "auto";
    applyTheme(saved);
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const current = localStorage.getItem(THEME_KEY) || "auto";
      const next =
        current === "auto" ? "light" : current === "light" ? "dark" : "auto";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  // ----- font size --------------------------------------------------------
  const FONT_KEY = "leiloes-font-scale";
  const FONT_STEPS = [0.85, 0.95, 1, 1.1, 1.25, 1.4];

  function applyFontScale(scale) {
    document.documentElement.style.setProperty("--font-scale", scale);
  }

  function initFontControls() {
    let idx = FONT_STEPS.indexOf(parseFloat(localStorage.getItem(FONT_KEY)));
    if (idx === -1) idx = FONT_STEPS.indexOf(1);
    applyFontScale(FONT_STEPS[idx]);

    document.getElementById("font-larger").addEventListener("click", () => {
      if (idx < FONT_STEPS.length - 1) {
        idx++;
        localStorage.setItem(FONT_KEY, FONT_STEPS[idx]);
        applyFontScale(FONT_STEPS[idx]);
      }
    });
    document.getElementById("font-smaller").addEventListener("click", () => {
      if (idx > 0) {
        idx--;
        localStorage.setItem(FONT_KEY, FONT_STEPS[idx]);
        applyFontScale(FONT_STEPS[idx]);
      }
    });
  }

  // ----- sidebar toggle (mobile) ------------------------------------------
  function initSidebarToggle() {
    const sidebar = document.getElementById("sidebar");
    const btn = document.getElementById("sidebar-toggle");
    btn.addEventListener("click", () => {
      const collapsed = sidebar.getAttribute("data-collapsed") === "true";
      sidebar.setAttribute("data-collapsed", collapsed ? "false" : "true");
      btn.setAttribute("aria-expanded", collapsed ? "true" : "false");
    });
  }

  // ----- init --------------------------------------------------------------
  async function init() {
    configureMarked();
    initTheme();
    initFontControls();
    initSidebarToggle();

    const treeEl = document.getElementById("tree");
    try {
      const resp = await fetch("tree.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      tree = await resp.json();
      treeEl.innerHTML = "";
      treeEl.appendChild(buildTreeDOM(tree, 0));
    } catch (err) {
      treeEl.innerHTML = `<p class="placeholder">Não consegui carregar a árvore: ${escapeHTML(
        err.message
      )}.<br>Rode <code>python3 site/generate_tree.py</code> e recarregue.</p>`;
    }

    window.addEventListener("hashchange", () => {
      const { path, anchor } = parseHash();
      if (path && path !== currentPath) {
        loadMd(path, anchor);
      } else if (anchor) {
        const target = document.getElementById(anchor);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
    });

    const initial = parseHash();
    const startPath = initial.path || "CLAUDE.md";
    loadMd(startPath, initial.anchor);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
