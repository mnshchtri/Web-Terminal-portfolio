'use strict';

// Visual Studio Code: explorer, tabs, syntax highlighting, search, source control (live commits),
// quick open and an integrated terminal running a real nsh session. By default it opens the
// source code of this very website, loaded into ~/code/Web-Terminal-portfolio.

const SOURCE_DIR = `${HOME}/code/Web-Terminal-portfolio`;
const SOURCE_FILES = ['README.md', 'index.html', 'style.css', 'fs.js', 'script.js', 'apps.js', 'sys.js',
    'desktop.js', 'gui.js', 'vscode.js', 'obsidian.js'];

getNode(HOME).children.code = {
    type: 'dir',
    children: {
        'Web-Terminal-portfolio': {
            type: 'dir',
            repo: { owner: 'mnshchtri', name: 'Web-Terminal-portfolio', branch: 'main' },
            children: Object.fromEntries(SOURCE_FILES.map((f) => [f, { type: 'file', content: '' }])),
        },
    },
};

// The site's own files, fetched once (they're already in the browser cache).
const sourceLoaded = Promise.all(SOURCE_FILES.map(async (f) => {
    try {
        const res = await fetch(f);
        if (res.ok) getNode(`${SOURCE_DIR}/${f}`).content = await res.text();
    } catch {
        // Opened from file:// — the files just stay empty.
    }
}));

// ---------- syntax highlighting ----------

const KEYWORDS = 'const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|async|await|try|catch|finally|throw|switch|case|break|continue|default|typeof|instanceof|this|null|undefined|true|false|import|export|from';
const LANGS = {
    js: [
        [/\/\/.*|\/\*[\s\S]*?\*\//, 'cm'],
        [/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/, 'st'],
        [new RegExp(`\\b(?:${KEYWORDS})\\b`), 'kw'],
        [/\b\d+(?:\.\d+)?\b/, 'nu'],
        [/\b[A-Za-z_$][\w$]*(?=\s*\()/, 'fn'],
    ],
    css: [
        [/\/\*[\s\S]*?\*\//, 'cm'],
        [/'[^'\n]*'|"[^"\n]*"/, 'st'],
        [/@[\w-]+/, 'kw'],
        [/(?<![\w-])--?[a-z][\w-]*(?=\s*:)/, 'fn'],
        [/#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|%|em|rem|s|vh|vw|ch|deg|fr)?\b/, 'nu'],
    ],
    html: [
        [/<!--[\s\S]*?-->/, 'cm'],
        [/<\/?[a-zA-Z][\w-]*|\/?>/, 'kw'],
        [/\b[a-zA-Z-]+(?==)/, 'fn'],
        [/"[^"\n]*"|'[^'\n]*'/, 'st'],
    ],
    md: [
        [/^#{1,6} .*$/m, 'kw'],
        [/```[\s\S]*?```|`[^`\n]+`/, 'st'],
        [/\[\[[^\]\n]+\]\]|\[[^\]\n]*\]\([^)\n]*\)/, 'fn'],
        [/\*\*[^*\n]+\*\*/, 'nu'],
        [/^\s*(?:[-*]|\d+\.) /m, 'cm'],
    ],
    sh: [
        [/#.*$/m, 'cm'],
        [/'[^'\n]*'|"(?:\\.|[^"\\\n])*"/, 'st'],
        [/\b(?:if|then|else|fi|for|do|done|while|case|esac|function|export|echo|sudo|cd)\b/, 'kw'],
        [/\$\{?\w+\}?/, 'fn'],
    ],
};
const LANG_NAMES = { js: 'JavaScript', css: 'CSS', html: 'HTML', md: 'Markdown', sh: 'Shell Script', txt: 'Plain Text' };
const LANG_RE = Object.fromEntries(Object.entries(LANGS).map(([k, rules]) => [k, new RegExp(rules.map(([r]) => `(${r.source})`).join('|'), 'gm')]));

function langOf(name) {
    const ext = name.split('.').pop().toLowerCase();
    return { js: 'js', mjs: 'js', css: 'css', html: 'html', htm: 'html', md: 'md', sh: 'sh', bashrc: 'sh' }[ext]
        || (name === '.bashrc' || name === '.bash_history' ? 'sh' : 'txt');
}

function highlightCode(text, lang) {
    const re = LANG_RE[lang];
    if (!re) return esc(text) + '\n';
    let out = '';
    let last = 0;
    for (const m of text.matchAll(re)) {
        if (!m[0]) continue;
        const kind = LANGS[lang][m.slice(1).findIndex((g) => g !== undefined)][1];
        out += esc(text.slice(last, m.index)) + `<span class="t-${kind}">${esc(m[0])}</span>`;
        last = m.index + m[0].length;
    }
    return out + esc(text.slice(last)) + '\n';
}

// ---------- the app ----------

const VS = (paths) => GI(paths, 'vsicon');
const VSI = {
    files: VS('<path d="M14 3H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M3 7v13a1 1 0 0 0 1 1h10"/>'),
    search: VS('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    git: VS('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10"/><path d="M18 10c0 4-6 3-12 7"/>'),
    ext: VS('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7" transform="rotate(45 17.5 6.5)"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
    term: VS('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 9l3 3-3 3"/><path d="M12 15h5"/>'),
    close: GI('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 'vsx'),
    chevron: GI('<path d="M9 6l6 6-6 6"/>', 'vschev'),
};

const EXTENSIONS = [
    ['Claude Code', 'Anthropic', 'Claude in your editor.'],
    ['Tokyo Night', 'enkia', 'A clean Visual Studio Code theme that celebrates the lights of Downtown Tokyo.'],
    ['Container Tools', 'Microsoft', 'Build, run and debug containers.'],
    ['Dev Containers', 'Microsoft', 'Open any folder inside a container.'],
    ['Live Server', 'Ritwick Dey', 'Launch a local development server with live reload.'],
    ['Noctokai', 'farigab', 'A dark theme.'],
    ['vscode-pdf', 'tomoki1207', 'Display PDF files in VS Code.'],
    ['Omarchy Theme', 'omarchy', 'Follows the current Omarchy theme.'],
];

function vscodeApp(folder = SOURCE_DIR, openFile = null) {
    let el;
    let win;
    let view = 'explorer';
    let sidebarOpen = !isMobile();
    let panel = null; // { shell, el }
    let lastFocus = 'editor';
    const expanded = new Set([folder]);
    const tabs = []; // { abs, dirty }
    let active = null;
    const changed = new Set();
    const readonly = (abs) => asGuest(() => !canModify(abs) || isForbidden(abs));
    const rel = (abs) => abs.slice(folder.length + 1) || basename(abs);
    const $ = (sel) => el.querySelector(sel);

    function workspaceFiles(dir = folder, out = []) {
        const node = getNode(dir);
        if (!node || node.type !== 'dir' || asGuest(() => isForbidden(dir))) return out;
        for (const [n, child] of Object.entries(node.children).sort()) {
            const abs = `${dir}/${n}`.replace('//', '/');
            if (child.type === 'dir') workspaceFiles(abs, out);
            else if (child.type === 'file' && !child.bin && !child.image) out.push(abs);
        }
        return out;
    }

    // ----- sidebar views -----

    function treeHtml(dir, depth) {
        const node = getNode(dir);
        if (asGuest(() => isForbidden(dir))) return `<div class="vs-row dim" style="--d:${depth}">permission denied</div>`;
        return Object.keys(node.children)
            .sort((a, b) => (node.children[b].type === 'dir') - (node.children[a].type === 'dir') || a.localeCompare(b))
            .map((n) => {
                const abs = `${dir}/${n}`.replace('//', '/');
                const child = node.children[n];
                if (child.type === 'dir') {
                    const open = expanded.has(abs);
                    return `<button class="vs-row dir${open ? ' open' : ''}" data-dir="${esc(abs)}" style="--d:${depth}">${VSI.chevron}${esc(n)}</button>${open ? treeHtml(abs, depth + 1) : ''}`;
                }
                const cls = abs === active ? ' active' : '';
                return `<button class="vs-row file${cls}" data-file="${esc(abs)}" style="--d:${depth}"><span class="vs-dot l-${langOf(n)}"></span>${esc(n)}</button>`;
            }).join('');
    }

    function renderSidebar() {
        const side = $('.vs-side');
        side.hidden = !sidebarOpen;
        el.querySelectorAll('.vs-act [data-view]').forEach((b) => b.classList.toggle('on', sidebarOpen && b.dataset.view === view));
        if (!sidebarOpen) return keepFocus();
        if (view === 'explorer') {
            side.innerHTML = `<div class="vs-side-title">EXPLORER</div><div class="vs-folder">${VSI.chevron}${esc(basename(folder).toUpperCase())}</div>
                <div class="vs-tree">${treeHtml(folder, 1)}</div>`;
        } else if (view === 'search') {
            side.innerHTML = `<div class="vs-side-title">SEARCH</div><input class="vs-search" placeholder="Search" spellcheck="false"><div class="vs-results"></div>`;
            const box = $('.vs-search');
            box.addEventListener('input', () => renderResults(box.value));
            box.focus();
        } else if (view === 'git') {
            const repo = repoAt(folder);
            side.innerHTML = `<div class="vs-side-title">SOURCE CONTROL</div>
                <div class="vs-sub">CHANGES</div>${changed.size ? [...changed].map((abs) => `<button class="vs-row file" data-file="${esc(abs)}" style="--d:1">${esc(rel(abs))} <span class="vs-m">M</span></button>`).join('') : '<div class="vs-note">No changes.</div>'}
                <div class="vs-sub">COMMITS${repo ? ` · ${esc(repo.owner)}/${esc(repo.name)}` : ''}</div><div class="vs-commits">${repo ? '<div class="vs-note">Loading…</div>' : '<div class="vs-note">This folder is not a git repository.</div>'}</div>`;
            if (repo) {
                github(`/repos/${repo.owner}/${repo.name}/commits?per_page=15`).then((commits) => {
                    const box = $('.vs-commits');
                    if (box) box.innerHTML = commits.map((cm) => `<div class="vs-commit"><span>${esc(cm.commit.message.split('\n')[0])}</span><span class="dim">${cm.sha.slice(0, 7)} · ${esc(cm.commit.author.name)}</span></div>`).join('');
                }).catch((e) => {
                    const box = $('.vs-commits');
                    if (box) box.innerHTML = `<div class="vs-note">${esc(e.message)}</div>`;
                });
            }
        } else {
            side.innerHTML = `<div class="vs-side-title">EXTENSIONS</div><div class="vs-sub">INSTALLED</div>${EXTENSIONS.map(([n, pub, d]) => (
                `<div class="vs-extn"><b>${esc(n)}</b><span class="dim">${esc(d)}</span><span class="vs-pub">${esc(pub)}</span></div>`
            )).join('')}`;
        }
        keepFocus();
    }

    // Re-rendering removes the clicked element; keep focus in the window so shortcuts keep working.
    function keepFocus() {
        if (wm.focused === win && !el.contains(document.activeElement)) ($('.vs-input') || el).focus({ preventScroll: true });
    }

    function renderResults(q) {
        const box = $('.vs-results');
        if (!q.trim()) return void (box.innerHTML = '');
        const needle = q.toLowerCase();
        let total = 0;
        const groups = [];
        for (const abs of workspaceFiles()) {
            const lines = (getNode(abs).content || '').split('\n');
            const hits = [];
            lines.forEach((l, i) => l.toLowerCase().includes(needle) && hits.push([i, l]));
            if (!hits.length) continue;
            total += hits.length;
            groups.push(`<div class="vs-hit-file">${esc(rel(abs))} <span class="vs-count">${hits.length}</span></div>` + hits.slice(0, 30).map(([i, l]) => {
                const at = l.toLowerCase().indexOf(needle);
                const start = Math.max(0, at - 20);
                const snippet = esc(l.slice(start, at)) + `<mark>${esc(l.slice(at, at + q.length))}</mark>` + esc(l.slice(at + q.length, at + q.length + 50));
                return `<button class="vs-hit" data-file="${esc(abs)}" data-line="${i}">${snippet}</button>`;
            }).join(''));
        }
        box.innerHTML = `<div class="vs-note">${total} result${total === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}</div>${groups.join('')}`;
    }

    // ----- editor -----

    function openTab(abs, line) {
        if (!tabs.some((t) => t.abs === abs)) tabs.push({ abs, dirty: false });
        active = abs;
        renderEditor();
        if (line != null) {
            const ta = $('.vs-input');
            const pos = ta.value.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
            ta.focus({ preventScroll: true });
            ta.setSelectionRange(pos, pos);
            $('.vs-scroll').scrollTop = Math.max(0, line * lineHeight(ta) - 80);
            updateStatus();
        }
        renderSidebar();
    }

    function closeTab(abs) {
        const i = tabs.findIndex((t) => t.abs === abs);
        if (i < 0) return;
        if (tabs[i].dirty && !confirmDiscard(abs)) return;
        tabs.splice(i, 1);
        if (active === abs) active = tabs[Math.min(i, tabs.length - 1)]?.abs || null;
        renderEditor();
        renderSidebar();
    }

    // Unsaved edits to a read-only file can't be kept anyway; writable ones get saved on close.
    function confirmDiscard(abs) {
        if (!readonly(abs)) save(abs);
        return true;
    }

    function renderTabs() {
        $('.vs-tabs').innerHTML = tabs.map((t) => `<div class="vs-tab${t.abs === active ? ' on' : ''}" data-tab="${esc(t.abs)}">
            <span class="vs-dot l-${langOf(basename(t.abs))}"></span>${esc(basename(t.abs))}${readonly(t.abs) ? '<span class="vs-lock" title="Read-only">🔒</span>' : ''}
            <button class="vs-tab-x" data-close="${esc(t.abs)}" title="Close">${t.dirty ? '●' : VSI.close}</button></div>`).join('');
    }

    function welcome() {
        return `<div class="vs-welcome"><h1>Visual Studio Code</h1><p class="dim">Editing evolved</p>
            <div class="vs-wl"><b>Start</b>
            <button data-cmd="quick">Go to File… <span class="dim">Ctrl+P</span></button>
            <button data-cmd="terminal">Toggle Terminal <span class="dim">Ctrl+\`</span></button>
            <button data-cmd="search">Search in Files <span class="dim">Ctrl+Shift+F</span></button></div>
            <div class="vs-wl"><b>Recent</b>${['README.md', 'desktop.js', 'script.js'].map((f) => `<button data-file="${SOURCE_DIR}/${f}">${f} <span class="dim">~/code/Web-Terminal-portfolio</span></button>`).join('')}</div></div>`;
    }

    function renderEditor() {
        renderTabs();
        const body = $('.vs-body');
        if (!active) {
            $('.vs-crumbs').textContent = '';
            body.innerHTML = welcome();
            updateStatus();
            refreshTitle(win);
            return;
        }
        const node = getNode(active);
        const denied = asGuest(() => isForbidden(active));
        const text = denied ? '' : node?.content ?? '';
        $('.vs-crumbs').innerHTML = rel(active).split('/').map(esc).join(' <span class="dim">›</span> ');
        body.innerHTML = `<div class="vs-scroll"><pre class="vs-gutter"></pre><div class="vs-code"><pre class="vs-hl"></pre>
            <textarea class="vs-input" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div></div>`;
        const ta = $('.vs-input');
        ta.value = text;
        ta.readOnly = readonly(active);
        ta.setSelectionRange(0, 0);
        paint();
        ta.addEventListener('input', () => {
            const tab = tabs.find((t) => t.abs === active);
            if (!tab.dirty) {
                tab.dirty = true;
                renderTabs();
                refreshTitle(win);
            }
            paint();
        });
        ta.addEventListener('beforeinput', (e) => {
            if (ta.readOnly) {
                e.preventDefault();
                toast(denied ? 'Permission denied.' : 'Cannot edit in read-only editor.');
            }
        });
        ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, updateStatus));
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !ta.readOnly) {
                e.preventDefault();
                ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
                ta.dispatchEvent(new Event('input'));
            }
        });
        updateStatus();
        refreshTitle(win);
    }

    let painting = 0;
    function paint() {
        cancelAnimationFrame(painting);
        painting = requestAnimationFrame(() => {
            const ta = $('.vs-input');
            if (!ta) return;
            const lines = ta.value.split('\n').length;
            $('.vs-gutter').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
            $('.vs-hl').innerHTML = highlightCode(ta.value, langOf(basename(active)));
        });
    }

    function save(abs = active) {
        if (!abs) return;
        const tab = tabs.find((t) => t.abs === abs);
        if (readonly(abs)) return toast(`Failed to save '${basename(abs)}': Insufficient permissions (owned by neox).`);
        const value = abs === active ? $('.vs-input').value : getNode(abs).content;
        asGuest(() => writeFile(abs, value));
        if (tab) tab.dirty = false;
        changed.add(abs);
        renderTabs();
        refreshTitle(win);
        if (view === 'git') renderSidebar();
    }

    function updateStatus() {
        const ta = $('.vs-input');
        const repo = repoAt(folder);
        let pos = '';
        if (ta) {
            const before = ta.value.slice(0, ta.selectionStart);
            const line = before.split('\n').length;
            pos = `Ln ${line}, Col ${before.length - before.lastIndexOf('\n')}`;
        }
        $('.vs-status').innerHTML = `<span class="vs-sb-l">${repo ? `${VSI.git.replace('vsicon', 'vsicon sm')} ${esc(repo.branch)}` : ''}<span>⊗ 0 ⚠ 0</span></span>
            <span class="vs-sb-r">${active ? `<span>${pos}</span><span>Spaces: 4</span><span>UTF-8</span><span>LF</span><span>${LANG_NAMES[langOf(basename(active))]}</span>${readonly(active) ? '<span>Read-only</span>' : ''}` : ''}</span>`;
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.className = 'vs-toast';
        t.textContent = msg;
        el.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    // ----- quick open -----

    function quickOpen() {
        const files = workspaceFiles();
        const box = document.createElement('div');
        box.className = 'vs-quick';
        box.innerHTML = '<input placeholder="Search files by name" spellcheck="false"><div class="vs-quick-list"></div>';
        el.appendChild(box);
        const field = box.querySelector('input');
        let sel = 0;
        let shown = [];
        const render = () => {
            const q = field.value.toLowerCase();
            shown = files.filter((f) => rel(f).toLowerCase().includes(q)).slice(0, 12);
            sel = Math.min(sel, Math.max(0, shown.length - 1));
            box.querySelector('.vs-quick-list').innerHTML = shown.map((f, i) => `<button class="${i === sel ? 'on' : ''}" data-i="${i}">${esc(basename(f))} <span class="dim">${esc(rel(f))}</span></button>`).join('') || '<div class="vs-note">No matching results</div>';
        };
        const done = (f) => {
            box.remove();
            if (f) openTab(f);
            ($('.vs-input') || el.querySelector('.vs-act button')).focus({ preventScroll: true });
        };
        field.addEventListener('input', render);
        field.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') done();
            if (e.key === 'Enter') done(shown[sel]);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
                render();
            }
        });
        box.addEventListener('click', (e) => {
            const b = e.target.closest('[data-i]');
            if (b) done(shown[+b.dataset.i]);
        });
        field.addEventListener('blur', () => setTimeout(() => box.isConnected && box.remove(), 150));
        render();
        field.focus();
    }

    // ----- integrated terminal -----

    function toggleTerminal(show = !panel) {
        if (!show) {
            if (panel?.shell.session.busy) return flashBusy();
            panel.el.remove();
            panel = null;
            win.shell = undefined;
            bindShell(null);
            refreshTitle(win);
            lastFocus = 'editor';
            $('.vs-input')?.focus({ preventScroll: true });
            return;
        }
        if (panel) return panel.shell.input.focus({ preventScroll: true });
        const wrap = document.createElement('div');
        wrap.className = 'vs-panel';
        wrap.innerHTML = `<div class="vs-panel-head"><span class="on">TERMINAL</span><span class="dim">nsh</span><button class="vs-panel-x" title="Close panel">${VSI.close}</button></div><div class="vs-panel-body"></div>`;
        $('.vs-main').appendChild(wrap);
        const shell = createShell(wrap.querySelector('.vs-panel-body'));
        shell.session.cwd = shell.session.env.PWD = folder;
        panel = { shell, el: wrap };
        win.shell = shell;
        wrap.querySelector('.vs-panel-x').addEventListener('click', () => toggleTerminal(false));
        // The shell binds while the panel has focus, so keystrokes reach nsh and not the editor.
        wrap.addEventListener('focusin', () => {
            lastFocus = 'terminal';
            if (wm.focused !== win || state === shell.session) return;
            bindShell(shell);
            if (!shell.session.busy) {
                updatePrompt();
                setBusy(false);
            }
        });
        wrap.addEventListener('mousedown', () => setTimeout(() => !window.getSelection().toString() && shell.input.focus({ preventScroll: true })));
        bindShell(shell);
        updatePrompt();
        setBusy(false);
    }

    return {
        cls: 'code',
        title: () => `${active ? `${tabs.find((t) => t.abs === active)?.dirty ? '● ' : ''}${basename(active)} - ` : ''}${basename(folder)} - Visual Studio Code`,
        mount(node, w) {
            el = node;
            win = w;
            el.tabIndex = -1;
            el.innerHTML = `<div class="vs-wrap">
                <nav class="vs-act"><button data-view="explorer" title="Explorer (Ctrl+Shift+E)">${VSI.files}</button><button data-view="search" title="Search (Ctrl+Shift+F)">${VSI.search}</button>
                <button data-view="git" title="Source Control">${VSI.git}</button><button data-view="ext" title="Extensions">${VSI.ext}</button>
                <button class="vs-act-term" data-cmd="terminal" title="Toggle Terminal (Ctrl+\`)">${VSI.term}</button></nav>
                <aside class="vs-side"></aside>
                <section class="vs-main"><div class="vs-tabs"></div><div class="vs-crumbs"></div><div class="vs-body"></div></section>
                </div><footer class="vs-status"></footer>`;
            el.addEventListener('click', (e) => {
                const t = e.target;
                const viewBtn = t.closest('[data-view]');
                if (viewBtn) {
                    sidebarOpen = !(sidebarOpen && view === viewBtn.dataset.view);
                    view = viewBtn.dataset.view;
                    return renderSidebar();
                }
                const closeBtn = t.closest('[data-close]');
                if (closeBtn) return closeTab(closeBtn.dataset.close);
                const dirBtn = t.closest('[data-dir]');
                if (dirBtn) {
                    const d = dirBtn.dataset.dir;
                    if (expanded.has(d)) expanded.delete(d);
                    else expanded.add(d);
                    return renderSidebar();
                }
                const fileBtn = t.closest('[data-file]');
                if (fileBtn) return openTab(fileBtn.dataset.file, fileBtn.dataset.line != null ? +fileBtn.dataset.line : undefined);
                const tab = t.closest('[data-tab]');
                if (tab) {
                    active = tab.dataset.tab;
                    renderEditor();
                    return renderSidebar();
                }
                const cmd = t.closest('[data-cmd]')?.dataset.cmd;
                if (cmd === 'terminal') toggleTerminal();
                if (cmd === 'quick') quickOpen();
                if (cmd === 'search') {
                    sidebarOpen = true;
                    view = 'search';
                    renderSidebar();
                }
            });
            el.addEventListener('focusin', (e) => {
                if (panel?.el.contains(e.target)) return;
                lastFocus = 'editor';
                // Leaving the terminal: unbind its shell so typing stays in the editor.
                if (panel && state === panel.shell.session && !panel.shell.session.busy) bindShell(null);
            });
            el.addEventListener('keydown', (e) => {
                const k = e.key.toLowerCase();
                const run = (fn) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fn();
                };
                if (e.ctrlKey && !e.altKey && (k === '`' || e.code === 'Backquote')) return run(() => toggleTerminal());
                if (panel?.el.contains(e.target)) return;
                if (e.ctrlKey && !e.shiftKey && k === 'p') return run(quickOpen);
                if (e.ctrlKey && !e.shiftKey && k === 's') return run(() => save());
                if (e.ctrlKey && !e.shiftKey && k === 'b') return run(() => { sidebarOpen = !sidebarOpen; renderSidebar(); });
                if (e.ctrlKey && e.shiftKey && k === 'f') return run(() => { sidebarOpen = true; view = 'search'; renderSidebar(); });
                if (e.ctrlKey && e.shiftKey && k === 'e') return run(() => { sidebarOpen = true; view = 'explorer'; renderSidebar(); });
            });
            renderSidebar();
            renderEditor();
            sourceLoaded.then(() => {
                if (!el.isConnected) return;
                const target = openFile || (folder === SOURCE_DIR ? `${SOURCE_DIR}/README.md` : null);
                if (target && getNode(target)) openTab(target);
            });
        },
        focus() {
            if (lastFocus === 'terminal' && panel) panel.shell.input.focus({ preventScroll: true });
            else ($('.vs-input') || el.querySelector('.vs-act button')).focus({ preventScroll: true });
        },
        shellExited() {
            panel.shell.session.exited = false;
            panel.shell.session.busy = false;
            toggleTerminal(false);
        },
    };
}

// ---------- launcher, keybinding, commands ----------

LAUNCH.splice(4, 0, { name: 'Visual Studio Code', hint: 'Alt+Shift+N', action: () => openApp(vscodeApp()) });
KEYBINDS.splice(5, 0, ['Alt+Shift+N', 'VS Code']);

window.addEventListener('keydown', (e) => {
    if (shared.booting || desktopEl.hidden || !launcherEl.hidden || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code !== 'KeyN') return;
    e.preventDefault();
    e.stopPropagation();
    openApp(vscodeApp());
}, true);

function cmdCode({ args }) {
    const target = args.find((a) => !a.startsWith('-'));
    if (!target) return void openApp(vscodeApp(), { fromCommand: true });
    const abs = normalize(target);
    const node = getNode(abs);
    if (!node) return err(`code: ${target}: No such file or directory`);
    if (node.type === 'dir') return void openApp(vscodeApp(abs), { fromCommand: true });
    openApp(vscodeApp(parentOf(abs), abs), { fromCommand: true });
}

Object.assign(COMMANDS, {
    code: { group: 'Desktop', usage: 'code [DIR | FILE]', desc: 'Visual Studio Code (opens this site\'s source by default)', run: cmdCode },
    vscode: { group: 'Hidden', usage: 'vscode [DIR | FILE]', desc: 'Visual Studio Code', run: cmdCode },
});
