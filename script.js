'use strict';

// nsh — a small bash-like shell over the virtual filesystem in fs.js.

const terminal = document.getElementById('terminal');
const output = document.getElementById('output');
const inputLine = document.getElementById('input-line');
const promptEl = document.getElementById('prompt');
const input = document.getElementById('user-input');

const USER = 'visitor';
const HOST = 'neox';
const KERNEL = '6.17.0-neox';
const BOOT_TIME = Date.now();
const BUILD_DATE = new Date(document.lastModified);

const BANNER = String.raw`
 ███▄    █ ▓█████  ▒█████  ▒██   ██▒
 ██ ▀█   █ ▓█   ▀ ▒██▒  ██▒▒▒ █ █ ▒░
▓██  ▀█ ██▒▒███   ▒██░  ██▒░░  █   ░
▓██▒  ▐▌██▒▒▓█  ▄ ▒██   ██░ ░ █ █ ▒
▒██░   ▓██░░▒████▒░ ████▓▒░▒██▒ ▒██▒
░ ▒░   ▒ ▒ ░░ ▒░ ░░ ▒░▒░▒░ ▒▒ ░ ░▓ ░
░ ░░   ░ ▒░ ░ ░  ░  ░ ▒ ▒░ ░░   ░▒ ░
   ░   ░ ░    ░   ░ ░ ░ ▒   ░    ░
         ░    ░  ░    ░ ░   ░    ░`.slice(1);

const LOGO = String.raw`
                  -\`
                 .o+\`
                \`ooo/
               \`+oooo:
              \`+oooooo:
              -+oooooo+:
            \`/:-:++oooo+:
           \`/++++/+++++++:
          \`/++++++++++++++:
         \`/+++ooooooooooooo/\`
        ./ooosssso++osssssso+\`
       .oossssso-\`\`\`\`/ossssss+\`
      -osssssso.      :ssssssso.
     :osssssss/        osssso+++.
    /ossssssss/        +ssssooo/-
  \`/ossssso+/:-        -:/+osssso+-
 \`+sso+:-\`                 \`.-/+oso:
\`++:.                           \`-/+/
.\`                                 \`/`.slice(1).replace(/\\`/g, '`').split('\n');

const state = {
    cwd: HOME,
    env: {
        USER, LOGNAME: USER, HOME, HOSTNAME: HOST, SHELL: '/bin/nsh',
        TERM: 'xterm-256color', LANG: 'en_US.UTF-8', EDITOR: 'nvim',
        PATH: '/usr/local/bin:/usr/bin:/bin', PWD: HOME, OLDPWD: HOME,
    },
    aliases: {
        ll: 'ls -la',
        la: 'ls -a',
        '..': 'cd ..',
        whois: 'cat ~/about.txt',
        experience: 'cat ~/experience/*',
        projects: 'grep -h ^# ~/projects/*',
        skills: 'cat ~/skills.txt',
        education: 'cat ~/education.txt',
        certs: 'cat ~/certifications.txt',
        contact: 'cat ~/contact.txt',
        music: 'cat ~/music/README.txt',
        blogs: 'ls -l ~/links/medium',
    },
    history: JSON.parse(localStorage.getItem('nsh_history') || '[]'),
    histIndex: null,
    draft: '',
    status: 0,
    busy: false,
    abort: false,
    skip: false,
    pending: null,
    keyWaiter: null,
    lastTab: null,
};

// ---------- output helpers ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const c = (cls, html) => `<span class="${cls}">${html}</span>`;
const toText = (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent;
const sleep = (ms) => (state.skip ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

function linkify(escaped) {
    return escaped.replace(/https?:\/\/[^\s<]+[^\s<.,)]|[\w.+-]+@[\w-]+\.[\w.]+\w/g, (m) => {
        const href = m.includes('@') && !m.startsWith('http') ? `mailto:${m}` : m;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${m}</a>`;
    });
}

function print(lines) {
    for (const line of [].concat(lines)) {
        const div = document.createElement('div');
        div.className = 'line';
        div.innerHTML = line;
        output.appendChild(div);
    }
    terminal.scrollTop = terminal.scrollHeight;
}

function err(msg) {
    print(c('err', esc(msg)));
    state.status = 1;
}

function promptHtml() {
    return `${c('u', `${USER}@${HOST}`)}:${c('p', esc(tildify(state.cwd)))}$ `;
}

function updatePrompt() {
    promptEl.innerHTML = promptHtml();
}

// ---------- filesystem ----------

function normalize(path) {
    if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
    const abs = path.startsWith('/') ? path : `${state.cwd}/${path}`;
    const parts = [];
    for (const p of abs.split('/')) {
        if (!p || p === '.') continue;
        if (p === '..') parts.pop();
        else parts.push(p);
    }
    return '/' + parts.join('/');
}

function getNode(abs) {
    let node = FS;
    for (const p of abs.split('/').filter(Boolean)) {
        if (node.type !== 'dir' || !Object.hasOwn(node.children, p)) return null;
        node = node.children[p];
    }
    return node;
}

const tildify = (abs) => (abs === HOME ? '~' : abs.startsWith(HOME + '/') ? '~' + abs.slice(HOME.length) : abs);
const basename = (abs) => abs.split('/').filter(Boolean).pop() || '/';
const parentOf = (abs) => normalize(abs + '/..');
const isForbidden = (abs) => abs === '/root' || abs.startsWith('/root/');
const isSystem = (abs) => !(abs === HOME || abs.startsWith(HOME + '/') || abs === '/tmp' || abs.startsWith('/tmp/'));
const ownerOf = (abs, node) => node.owner || (isSystem(abs) ? 'root' : 'neox');

// The visitor may create new entries in ~ and /tmp, but only modify or delete their own.
function canModify(parentAbs, node) {
    if (node) return node.owner === USER;
    const parent = getNode(parentAbs);
    return parent.owner === USER || !isSystem(parentAbs);
}

function fmtTime(d) {
    const mon = d.toLocaleString('en-US', { month: 'short' });
    return `${mon} ${String(d.getDate()).padStart(2, ' ')} ${d.toTimeString().slice(0, 5)}`;
}

function fmtDate(d) {
    const day = d.toLocaleString('en-US', { weekday: 'short' });
    const tz = d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return `${day} ${fmtTime(d).slice(0, 6)} ${d.toTimeString().slice(0, 8)} ${tz} ${d.getFullYear()}`;
}

function fmtUptime() {
    const mins = Math.floor((Date.now() - BOOT_TIME) / 60000);
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`;
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

// Resolve a path argument to a readable file, printing the right error otherwise.
function readFile(path, cmd) {
    const abs = normalize(path);
    const node = getNode(abs);
    if (!node) return err(`${cmd}: ${path}: No such file or directory`);
    if (isForbidden(abs)) return err(`${cmd}: ${path}: Permission denied`);
    if (node.type === 'dir') return err(`${cmd}: ${path}: Is a directory`);
    return node.type === 'link' ? node.target + '\n' : node.content;
}

function textLines(text) {
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines;
}

function renderText(text) {
    return textLines(text).map((l) => (l.startsWith('# ') ? c('hl', linkify(esc(l))) : linkify(esc(l))));
}

function colorName(name, node) {
    if (node.type === 'dir') return c('dir', esc(name));
    if (node.type === 'link') return c('lnk', esc(name));
    if (node.exe) return c('exe', esc(name));
    return esc(name);
}

function parseFlags(args) {
    const flags = new Set();
    const rest = [];
    let opts = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-n' && /^\d+$/.test(args[i + 1] || '')) opts.n = +args[++i];
        else if (/^-\d+$/.test(a)) opts.n = +a.slice(1);
        else if (a.startsWith('-') && a.length > 1 && !rest.length) [...a.slice(1)].forEach((f) => flags.add(f));
        else rest.push(a);
    }
    return { flags, rest, opts };
}

// ---------- commands ----------

function cmdLs({ args, piped }) {
    const { flags, rest } = parseFlags(args);
    const all = flags.has('a');
    const long = flags.has('l');
    const targets = rest.length ? rest : ['.'];
    const out = [];
    targets.forEach((t, idx) => {
        const abs = normalize(t);
        const node = getNode(abs);
        if (!node) return err(`ls: cannot access '${t}': No such file or directory`);
        if (isForbidden(abs)) return err(`ls: cannot open directory '${t}': Permission denied`);
        let entries;
        if (node.type === 'dir') {
            entries = Object.keys(node.children)
                .filter((n) => all || !n.startsWith('.'))
                .sort((a, b) => a.localeCompare(b))
                .map((n) => [n, node.children[n], `${abs}/${n}`.replace('//', '/')]);
            if (all) entries.unshift(['.', node, abs], ['..', getNode(parentOf(abs)), parentOf(abs)]);
            if (targets.length > 1) {
                if (idx) out.push('');
                out.push(esc(t) + ':');
            }
        } else {
            entries = [[t, node, abs]];
        }
        if (long) {
            if (node.type === 'dir') out.push(`total ${entries.length * 4}`);
            entries.forEach(([n, e, p]) => out.push(longEntry(n, e, p)));
        } else if (piped || flags.has('1')) {
            entries.forEach(([n, e]) => out.push(colorName(n, e)));
        } else if (entries.length) {
            out.push(`<div class="ls-grid">${entries.map(([n, e]) => `<span>${colorName(n, e)}</span>`).join('')}</div>`);
        }
    });
    return out;
}

function longEntry(name, node, abs) {
    let perms = '-rw-r--r--';
    let size = 0;
    if (node.type === 'dir') {
        perms = 'drwxr-xr-x';
        size = 4096;
    } else if (node.type === 'link') {
        perms = 'lrwxrwxrwx';
        size = node.target.length;
    } else {
        if (node.exe) perms = '-rwxr-xr-x';
        size = node.content.length;
    }
    const nlink = node.type === 'dir' ? 2 + Object.values(node.children).filter((n) => n.type === 'dir').length : 1;
    const owner = ownerOf(abs, node).padEnd(7);
    const target = node.type === 'link' ? ` -> ${linkify(esc(node.target))}` : '';
    return `${perms} ${String(nlink).padStart(2)} ${owner} ${owner} ${String(size).padStart(5)} ${fmtTime(node.mtime || BUILD_DATE)} ${colorName(name, node)}${target}`;
}

function cmdCd({ args }) {
    let target = args[0] ?? HOME;
    if (target === '-') {
        target = state.env.OLDPWD;
        print(esc(tildify(target)));
    }
    const abs = normalize(target);
    const node = getNode(abs);
    if (!node) return err(`cd: no such file or directory: ${target}`);
    if (node.type !== 'dir') return err(`cd: not a directory: ${target}`);
    if (isForbidden(abs)) return err(`cd: permission denied: ${target}`);
    state.env.OLDPWD = state.cwd;
    state.cwd = state.env.PWD = abs;
}

function cmdCat({ args, stdin }) {
    const { flags, rest } = parseFlags(args);
    let text = '';
    if (!rest.length) text = stdin ?? '';
    for (const p of rest) text += readFile(p, 'cat') ?? '';
    const lines = renderText(text);
    return flags.has('n') ? lines.map((l, i) => `${c('dim', String(i + 1).padStart(6))}  ${l}`) : lines;
}

function cmdTree({ args }) {
    const { flags, rest } = parseFlags(args);
    const root = rest[0] || '.';
    const abs = normalize(root);
    const node = getNode(abs);
    if (!node || node.type !== 'dir') return err(`tree: ${root}: No such directory`);
    const out = [c('dir', esc(root))];
    let dirs = 0;
    let files = 0;
    (function walk(dirNode, dirAbs, prefix) {
        if (isForbidden(dirAbs)) return;
        const names = Object.keys(dirNode.children).filter((n) => flags.has('a') || !n.startsWith('.')).sort();
        names.forEach((n, i) => {
            const child = dirNode.children[n];
            const last = i === names.length - 1;
            const target = child.type === 'link' ? ` -> ${linkify(esc(child.target))}` : '';
            out.push(c('dim', prefix + (last ? '└── ' : '├── ')) + colorName(n, child) + target);
            if (child.type === 'dir') {
                dirs++;
                walk(child, `${dirAbs}/${n}`, prefix + (last ? '    ' : '│   '));
            } else {
                files++;
            }
        });
    })(node, abs, '');
    out.push('', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
    return out;
}

function cmdGrep({ args, stdin }) {
    const { flags, rest } = parseFlags(args);
    if (!rest.length) return err('usage: grep [-icnvrh] PATTERN [FILE...]');
    const [pattern, ...paths] = rest;
    let re;
    try {
        re = new RegExp(pattern, flags.has('i') ? 'gi' : 'g');
    } catch {
        re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'gi' : 'g');
    }

    const sources = [];
    if (!paths.length) sources.push([null, stdin ?? '']);
    for (const p of paths) {
        const abs = normalize(p);
        const node = getNode(abs);
        if (node?.type === 'dir' && flags.has('r')) {
            (function collect(n, display) {
                for (const [name, child] of Object.entries(n.children).sort()) {
                    if (child.type === 'dir') collect(child, `${display}/${name}`);
                    else if (child.type === 'file') sources.push([`${display}/${name}`, child.content]);
                }
            })(node, p.replace(/\/$/, ''));
        } else {
            const text = readFile(p, 'grep');
            if (text != null) sources.push([p, text]);
        }
    }

    const showName = sources.length > 1 && !flags.has('h');
    const out = [];
    let matched = false;
    for (const [name, text] of sources) {
        let count = 0;
        textLines(text).forEach((line, i) => {
            re.lastIndex = 0;
            if (re.test(line) === flags.has('v')) return;
            count++;
            matched = true;
            if (flags.has('c')) return;
            let prefix = showName ? c('lnk', esc(name)) + c('dim', ':') : '';
            if (flags.has('n')) prefix += c('exe', i + 1) + c('dim', ':');
            out.push(prefix + highlight(line, re, flags.has('v')));
        });
        if (flags.has('c')) out.push((showName ? c('lnk', esc(name)) + c('dim', ':') : '') + count);
    }
    if (!matched) state.status = 1;
    return out;
}

function highlight(line, re, inverted) {
    if (inverted) return linkify(esc(line));
    let html = '';
    let last = 0;
    re.lastIndex = 0;
    for (let m; (m = re.exec(line));) {
        if (!m[0].length) {
            re.lastIndex++;
            continue;
        }
        html += esc(line.slice(last, m.index)) + c('match', esc(m[0]));
        last = m.index + m[0].length;
    }
    return html + esc(line.slice(last));
}

function headTail(fromEnd) {
    return ({ args, stdin }) => {
        const { rest, opts } = parseFlags(args);
        const n = opts.n ?? 10;
        const sources = rest.length ? rest.map((p) => [p, readFile(p, fromEnd ? 'tail' : 'head')]) : [[null, stdin ?? '']];
        const out = [];
        sources.filter(([, t]) => t != null).forEach(([name, text], i, all) => {
            if (all.length > 1) {
                if (i) out.push('');
                out.push(`==&gt; ${esc(name)} &lt;==`);
            }
            const lines = renderText(text);
            out.push(...(fromEnd ? lines.slice(-n) : lines.slice(0, n)));
        });
        return out;
    };
}

function cmdWc({ args, stdin }) {
    const { flags, rest } = parseFlags(args);
    const pick = flags.size ? flags : new Set(['l', 'w', 'c']);
    const sources = rest.length ? rest.map((p) => [p, readFile(p, 'wc')]) : [['', stdin ?? '']];
    return sources.filter(([, t]) => t != null).map(([name, text]) => {
        const cols = [];
        if (pick.has('l')) cols.push((text.match(/\n/g) || []).length);
        if (pick.has('w')) cols.push(text.split(/\s+/).filter(Boolean).length);
        if (pick.has('c')) cols.push(text.length);
        return cols.map((n) => String(n).padStart(7)).join(' ') + (name ? ' ' + esc(name) : '');
    });
}

function cmdTouch({ args }) {
    if (!args.length) return err('touch: missing file operand');
    for (const p of args) {
        const abs = normalize(p);
        const node = getNode(abs);
        const parent = getNode(parentOf(abs));
        if (node) {
            if (canModify(parentOf(abs), node)) node.mtime = new Date();
            else err(`touch: cannot touch '${p}': Permission denied`);
        } else if (!parent || parent.type !== 'dir') {
            err(`touch: cannot touch '${p}': No such file or directory`);
        } else if (!canModify(parentOf(abs))) {
            err(`touch: cannot touch '${p}': Permission denied`);
        } else {
            parent.children[basename(abs)] = { type: 'file', content: '', owner: USER, mtime: new Date() };
        }
    }
}

function cmdMkdir({ args }) {
    const { flags, rest } = parseFlags(args);
    if (!rest.length) return err('mkdir: missing operand');
    for (const p of rest) {
        const parts = normalize(p).split('/').filter(Boolean);
        let cur = '';
        for (let i = 0; i < parts.length; i++) {
            const parentAbs = cur || '/';
            cur += '/' + parts[i];
            const last = i === parts.length - 1;
            const node = getNode(cur);
            if (node) {
                if (last && !flags.has('p')) err(`mkdir: cannot create directory '${p}': File exists`);
                continue;
            }
            if (!last && !flags.has('p')) return err(`mkdir: cannot create directory '${p}': No such file or directory`);
            if (!canModify(parentAbs)) return err(`mkdir: cannot create directory '${p}': Permission denied`);
            getNode(parentAbs).children[parts[i]] = { type: 'dir', children: {}, owner: USER, mtime: new Date() };
        }
    }
}

function cmdRm({ args }) {
    const { flags, rest } = parseFlags(args);
    const recursive = flags.has('r') || flags.has('R');
    if (recursive && rest.some((p) => p === '/' || p === '/*' || normalize(p) === '/')) {
        return print([
            c('err', "rm: it is dangerous to operate recursively on '/'"),
            c('err', 'rm: use --no-preserve-root to override this failsafe'),
            c('dim', '...and you would still need root. Nice try though.'),
        ]);
    }
    if (!rest.length) return err('rm: missing operand');
    for (const p of rest) {
        const abs = normalize(p);
        const node = getNode(abs);
        if (!node) {
            if (!flags.has('f')) err(`rm: cannot remove '${p}': No such file or directory`);
        } else if (node.type === 'dir' && !recursive) {
            err(`rm: cannot remove '${p}': Is a directory`);
        } else if (!canModify(parentOf(abs), node)) {
            err(`rm: cannot remove '${p}': Permission denied`);
        } else {
            delete getNode(parentOf(abs)).children[basename(abs)];
        }
    }
}

function cmdOpen({ args }) {
    if (!args.length) return err('usage: open <url | ~/links/name | name>');
    for (const a of args) {
        let url = /^https?:\/\//.test(a) ? a : null;
        if (!url) {
            const node = getNode(normalize(a)) || getNode(`${HOME}/links/${a}`);
            if (node?.type === 'link') url = node.target;
            else if (node) return err(`xdg-open: no application registered for '${a}' — try: cat ${a}`);
            else return err(`xdg-open: ${a}: No such file or directory (see: ls ~/links)`);
        }
        window.open(url, '_blank', 'noopener');
        print(`Opening ${linkify(esc(url))}`);
    }
}

function cmdNeofetch() {
    const kv = (k, v) => `${c('u', k)}: ${esc(v)}`;
    const title = `${USER}@${HOST}`;
    const palette = ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'];
    const info = [
        `${c('u', USER)}@${c('u', HOST)}`,
        '-'.repeat(title.length),
        kv('OS', 'NeoxOS (Arch-based) x86_64'),
        kv('Host', 'GitHub Pages'),
        kv('Kernel', KERNEL),
        kv('Uptime', fmtUptime()),
        kv('Packages', `${Object.keys(COMMANDS).length} (nsh)`),
        kv('Shell', 'nsh 1.0'),
        kv('Resolution', `${screen.width}x${screen.height}`),
        kv('WM', 'Hyprland'),
        kv('Terminal', 'web-tty'),
        kv('CPU', `${navigator.hardwareConcurrency || '?'} cores`),
        '',
        kv('Name', 'Manish Karki (Neox)'),
        kv('Role', 'DevSecOps Engineer @ Citytech'),
        kv('Focus', 'Offensive Security, Platform Eng'),
        kv('Location', 'Kathmandu, Nepal'),
        kv('Contact', 'cat ~/contact.txt'),
        '',
        palette.map((col) => `<span style="background:${col}">   </span>`).join(''),
    ];
    return [`<div class="neofetch"><pre class="logo">${esc(LOGO.join('\n'))}</pre><pre>${info.join('\n')}</pre></div>`];
}

function cmdHelp() {
    const groups = {};
    // 'Hidden' commands still work and have man pages; they just aren't advertised.
    for (const [name, cmd] of Object.entries(COMMANDS)) if (cmd.group !== 'Hidden') (groups[cmd.group] ||= []).push(name);
    const portfolio = Object.keys(state.aliases).filter((a) => state.aliases[a].includes('~'));
    const row = (names) => `  ${names.map((n) => c('exe', n)).join('  ')}`;
    return [
        'nsh, version 1.0 — the NeoxOS shell (bash-ish)',
        '',
        c('hl', 'Portfolio') + c('dim', ' (aliases — run `alias` to see what they do)'),
        row(portfolio),
        '',
        ...Object.entries(groups).flatMap(([g, names]) => [c('hl', g), row(names), '']),
        `Shell features: pipes ${c('y', '|')}, redirection ${c('y', '&gt; &gt;&gt;')}, ${c('y', '&amp;&amp; || ;')}, ${c('y', '$VARS')}, globs ${c('y', '*')}, ${c('y', '!!')}`,
        `Keys: Tab completes, ↑/↓ history, Ctrl+L clear, Ctrl+C cancel, Ctrl+U/W kill`,
        `Type ${c('exe', 'man &lt;command&gt;')} for details. New here? ${c('exe', 'cat README.md')}`,
    ];
}

function cmdMan({ args }) {
    if (!args.length) return err('What manual page do you want?\nFor example, try \'man man\'.');
    const name = args[0];
    const cmd = COMMANDS[name];
    if (!cmd) {
        if (state.aliases[name]) return [`${esc(name)} is aliased to \`${esc(state.aliases[name])}'`];
        return err(`No manual entry for ${name}`);
    }
    const up = name.toUpperCase();
    return [
        c('hl', `${esc(up)}(1)${' '.repeat(Math.max(4, 30 - up.length))}User Commands${' '.repeat(Math.max(4, 30 - up.length))}${esc(up)}(1)`),
        '',
        c('hl', 'NAME'),
        `       ${esc(name)} - ${esc(cmd.desc)}`,
        '',
        c('hl', 'SYNOPSIS'),
        `       ${esc(cmd.usage || name)}`,
        '',
        c('hl', 'DESCRIPTION'),
        `       ${esc(cmd.long || cmd.desc)}.`,
        '',
        c('dim', `NeoxOS                          ${fmtTime(BUILD_DATE)}                          ${esc(up)}(1)`),
    ];
}

function cmdWhich({ args }) {
    const out = [];
    for (const a of args) {
        if (state.aliases[a]) out.push(`${esc(a)}: aliased to ${esc(state.aliases[a])}`);
        else if (COMMANDS[a]?.builtin) out.push(`${esc(a)}: shell built-in command`);
        else if (COMMANDS[a]) out.push(`/usr/bin/${esc(a)}`);
        else err(`${a} not found`);
    }
    return out;
}

function cmdAlias({ args }) {
    if (!args.length) return Object.entries(state.aliases).map(([k, v]) => `alias ${esc(k)}='${esc(v)}'`);
    for (const a of args) {
        const eq = a.indexOf('=');
        if (eq > 0) state.aliases[a.slice(0, eq)] = a.slice(eq + 1);
        else if (state.aliases[a]) print(`alias ${esc(a)}='${esc(state.aliases[a])}'`);
        else err(`alias: ${a}: not found`);
    }
}

function cmdExport({ args }) {
    if (!args.length) return cmdEnv();
    for (const a of args) {
        const eq = a.indexOf('=');
        if (eq > 0) state.env[a.slice(0, eq)] = a.slice(eq + 1);
    }
}

function cmdEnv() {
    return Object.entries(state.env).map(([k, v]) => esc(`${k}=${v}`));
}

function cmdHistory({ args }) {
    if (args[0] === '-c') {
        state.history = [];
        localStorage.removeItem('nsh_history');
        return;
    }
    const width = String(state.history.length).length + 2;
    return state.history.map((h, i) => `${String(i + 1).padStart(width)}  ${esc(h)}`);
}

function cmdPs({ args }) {
    const rows = [['1', '?', '00:00:02', 'systemd']];
    if (args.length) {
        rows.push(
            ['412', '?', '00:01:37', 'Hyprland'],
            ['433', '?', '00:00:12', 'waybar'],
            ['501', '?', '00:00:04', 'infra-eye --agentless'],
            ['666', '?', '00:00:00', 'curiosity --never-stop'],
        );
    }
    rows.push(['1337', 'pts/0', '00:00:00', 'nsh'], ['1338', 'pts/0', '00:00:00', 'ps']);
    return ['    PID TTY          TIME CMD', ...rows.map(([pid, tty, time, cmd]) => `${pid.padStart(7)} ${tty.padEnd(8)} ${time} ${esc(cmd)}`)];
}

async function cmdSudo({ args }) {
    if (!args.length) return err('usage: sudo command');
    await ask(`[sudo] password for ${USER}: `, true);
    await sleep(600);
    err(`${USER} is not in the sudoers file. This incident will be reported.`);
}

async function cmdSu() {
    await ask('Password: ', true);
    await sleep(1200);
    err('su: Authentication failure');
}

async function cmdExit() {
    print('logout');
    await sleep(300);
    print(['', c('dim', `Connection to ${HOST} closed. Press any key to log in again.`)]);
    await waitKey();
    resetSession();
    await login(false);
}

async function cmdReboot() {
    state.skip = false;
    output.innerHTML = '';
    print(c('dim', 'Broadcast message from root@neox: The system will reboot now!'));
    await sleep(700);
    resetSession();
    await boot();
    await login(true);
}

async function cmdShutdown() {
    output.innerHTML = '';
    for (const s of ['Stopping user session...', 'Unmounting /home...', 'Reached target System Power Off.']) {
        print(`[  ${c('ok', 'OK')}  ] ${s}`);
        await sleep(250);
    }
    output.innerHTML = '';
    print(c('dim', 'System halted. Press any key to power on.'));
    await waitKey();
    await cmdReboot();
}

const FORTUNES = [
    'Talk is cheap. Show me the code.\n    — Linus Torvalds',
    'Security is a process, not a product.\n    — Bruce Schneier',
    'There is no place like 127.0.0.1',
    'The quieter you become, the more you are able to hear.',
    'It works on my machine.\n    — every developer, ever',
    'Without music, life would be a mistake.\n    — Friedrich Nietzsche',
    'Make it work, make it right, make it fast.\n    — Kent Beck',
];

function cmdCowsay({ args, stdin }) {
    const text = (args.length ? args.join(' ') : (stdin || 'Moo.')).trim().replace(/\s+/g, ' ');
    const lines = text.match(/.{1,40}(\s|$)|\S+/g).map((l) => l.trim());
    const width = Math.max(...lines.map((l) => l.length));
    const edges = lines.length === 1 ? [['&lt;', '&gt;']] : lines.map((_, i) => (
        i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']
    ));
    return [
        ' ' + '_'.repeat(width + 2),
        ...lines.map((l, i) => `${edges[i][0]} ${esc(l.padEnd(width))} ${edges[i][1]}`),
        ' ' + '-'.repeat(width + 2),
        '        \\   ^__^',
        '         \\  (oo)\\_______',
        '            (__)\\       )\\/\\',
        '                ||----w |',
        '                ||     ||',
    ];
}

const editor = ({ name }) => err(`${name}: this is a read-only session for visitors — try 'cat' instead (and :q! gets you out of vim).`);
const notRoot = ({ name }) => err(`${name === 'yay' ? 'yay' : 'error'}: you cannot perform this operation unless you are root.`);

const COMMANDS = {
    ls: { group: 'Files', usage: 'ls [-la1] [FILE...]', desc: 'list directory contents', run: cmdLs },
    cd: { group: 'Files', usage: 'cd [DIR | - | ~]', desc: 'change the working directory', builtin: true, run: cmdCd },
    pwd: { group: 'Files', usage: 'pwd', desc: 'print name of current directory', builtin: true, run: () => [esc(state.cwd)] },
    cat: { group: 'Files', usage: 'cat [-n] [FILE...]', desc: 'concatenate files and print on the standard output', run: cmdCat },
    tree: { group: 'Files', usage: 'tree [-a] [DIR]', desc: 'list contents of directories in a tree-like format', run: cmdTree },
    head: { group: 'Files', usage: 'head [-n N] [FILE...]', desc: 'output the first part of files', run: headTail(false) },
    tail: { group: 'Files', usage: 'tail [-n N] [FILE...]', desc: 'output the last part of files', run: headTail(true) },
    grep: { group: 'Files', usage: 'grep [-icnvrh] PATTERN [FILE...]', desc: 'print lines that match patterns', run: cmdGrep },
    wc: { group: 'Files', usage: 'wc [-lwc] [FILE...]', desc: 'print newline, word, and byte counts', run: cmdWc },
    touch: { group: 'Files', usage: 'touch FILE...', desc: 'change file timestamps or create empty files', run: cmdTouch },
    mkdir: { group: 'Files', usage: 'mkdir [-p] DIR...', desc: 'make directories', run: cmdMkdir },
    rm: { group: 'Files', usage: 'rm [-rf] FILE...', desc: 'remove files or directories', run: cmdRm },
    open: { group: 'Files', usage: 'open URL | ~/links/NAME', desc: 'open a link in the browser (alias: xdg-open)', run: cmdOpen },
    'xdg-open': { group: 'Hidden', usage: 'xdg-open URL', desc: 'open a link in the browser', run: cmdOpen },
    echo: { group: 'Shell', usage: 'echo [STRING...]', desc: 'display a line of text', builtin: true, run: ({ args }) => [linkify(esc(args.filter((a) => a !== '-n' && a !== '-e').join(' ')))] },
    alias: { group: 'Shell', usage: 'alias [NAME[=VALUE]...]', desc: 'define or display aliases', builtin: true, run: cmdAlias },
    unalias: { group: 'Hidden', usage: 'unalias NAME...', desc: 'remove aliases', builtin: true, run: ({ args }) => args.forEach((a) => delete state.aliases[a]) },
    export: { group: 'Shell', usage: 'export NAME=VALUE...', desc: 'set environment variables', builtin: true, run: cmdExport },
    env: { group: 'Shell', usage: 'env', desc: 'print the environment', run: cmdEnv },
    history: { group: 'Shell', usage: 'history [-c]', desc: 'display or clear the command history', builtin: true, run: cmdHistory },
    which: { group: 'Shell', usage: 'which COMMAND...', desc: 'locate a command', run: cmdWhich },
    type: { group: 'Hidden', usage: 'type COMMAND...', desc: 'describe a command', builtin: true, run: cmdWhich },
    man: { group: 'Shell', usage: 'man COMMAND', desc: 'an interface to the system reference manuals', run: cmdMan },
    help: { group: 'Shell', usage: 'help', desc: 'display information about available commands', builtin: true, run: cmdHelp },
    clear: { group: 'Shell', usage: 'clear', desc: 'clear the terminal screen', run: () => { output.innerHTML = ''; } },
    neofetch: { group: 'System', usage: 'neofetch', desc: 'show system information (and who runs this box)', run: cmdNeofetch },
    fastfetch: { group: 'Hidden', usage: 'fastfetch', desc: 'show system information', run: cmdNeofetch },
    whoami: { group: 'System', usage: 'whoami', desc: 'print effective user name', run: () => [USER] },
    id: { group: 'System', usage: 'id', desc: 'print user and group IDs', run: () => [`uid=1001(${USER}) gid=1001(${USER}) groups=1001(${USER}),100(users)`] },
    hostname: { group: 'System', usage: 'hostname', desc: 'show the system host name', run: () => [HOST] },
    uname: { group: 'System', usage: 'uname [-a]', desc: 'print system information', run: ({ args }) => [args.includes('-a') ? `Linux ${HOST} ${KERNEL} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux` : args.includes('-r') ? KERNEL : 'Linux'] },
    date: { group: 'System', usage: 'date', desc: 'print the system date and time', run: () => [fmtDate(new Date())] },
    uptime: { group: 'System', usage: 'uptime', desc: 'tell how long the system has been running', run: () => [` ${new Date().toTimeString().slice(0, 8)} up ${fmtUptime()},  1 user,  load average: 0.13, 0.08, 0.02`] },
    ps: { group: 'System', usage: 'ps [aux]', desc: 'report a snapshot of the current processes', run: cmdPs },
    sudo: { group: 'System', usage: 'sudo COMMAND', desc: 'execute a command as another user', run: cmdSudo },
    su: { group: 'Hidden', usage: 'su [USER]', desc: 'run a shell with substitute user ID', run: cmdSu },
    pacman: { group: 'Hidden', usage: 'pacman OPERATION', desc: 'package manager utility', run: notRoot },
    yay: { group: 'Hidden', usage: 'yay', desc: 'AUR helper', run: notRoot },
    exit: { group: 'System', usage: 'exit', desc: 'log out of the shell', builtin: true, run: cmdExit },
    logout: { group: 'Hidden', usage: 'logout', desc: 'log out of the shell', builtin: true, run: cmdExit },
    reboot: { group: 'System', usage: 'reboot', desc: 'reboot the machine', run: cmdReboot },
    shutdown: { group: 'System', usage: 'shutdown', desc: 'power off the machine', run: cmdShutdown },
    poweroff: { group: 'Hidden', usage: 'poweroff', desc: 'power off the machine', run: cmdShutdown },
    true: { group: 'Hidden', usage: 'true', desc: 'do nothing, successfully', run: () => {} },
    false: { group: 'Hidden', usage: 'false', desc: 'do nothing, unsuccessfully', run: () => { state.status = 1; } },
    fortune: { group: 'Fun', usage: 'fortune', desc: 'print a random, hopefully interesting, adage', run: () => FORTUNES[Math.floor(Math.random() * FORTUNES.length)].split('\n').map(esc) },
    cowsay: { group: 'Fun', usage: 'cowsay [MESSAGE]', desc: 'configurable speaking cow', run: cmdCowsay },
    vim: { group: 'Hidden', desc: 'Vi IMproved', run: editor },
    vi: { group: 'Hidden', desc: 'screen-oriented text editor', run: editor },
    nvim: { group: 'Hidden', desc: 'Neovim', run: editor },
    nano: { group: 'Hidden', desc: 'Nano\'s ANOther editor', run: editor },
    emacs: { group: 'Hidden', desc: 'a pretty good operating system lacking a decent editor', run: editor },
};
// Populate /bin and /usr/bin with an entry per command so `ls /bin` looks right.
for (const name of Object.keys(COMMANDS)) {
    if (COMMANDS[name].builtin) continue;
    FS.children.bin.children[name] = { type: 'file', exe: true, content: '\x7fELF' + '\0'.repeat(28) };
}
FS.children.usr.children.bin = FS.children.bin;

// ---------- parsing & execution ----------

function tokenize(line) {
    const tokens = [];
    let cur = null;
    const word = () => (cur ??= { type: 'word', value: '', glob: false });
    const push = () => {
        if (cur) tokens.push(cur);
        cur = null;
    };
    const readVar = (i) => {
        if (line[i + 1] === '?') return [String(state.status), i + 2];
        if (line[i + 1] === '{') {
            const end = line.indexOf('}', i);
            if (end > 0) return [state.env[line.slice(i + 2, end)] ?? '', end + 1];
        }
        const m = line.slice(i + 1).match(/^[A-Za-z_]\w*/);
        return m ? [state.env[m[0]] ?? '', i + 1 + m[0].length] : ['$', i + 1];
    };

    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        const two = line.slice(i, i + 2);
        if (/\s/.test(ch)) {
            push();
            i++;
        } else if (two === '&&' || two === '||' || two === '>>') {
            push();
            tokens.push({ type: 'op', value: two });
            i += 2;
        } else if (ch === '|' || ch === ';' || ch === '>') {
            push();
            tokens.push({ type: 'op', value: ch });
            i++;
        } else if (ch === "'") {
            const end = line.indexOf("'", i + 1);
            word().value += line.slice(i + 1, end < 0 ? undefined : end);
            i = end < 0 ? line.length : end + 1;
        } else if (ch === '"') {
            word();
            i++;
            while (i < line.length && line[i] !== '"') {
                if (line[i] === '\\' && '"\\$'.includes(line[i + 1])) {
                    cur.value += line[i + 1];
                    i += 2;
                } else if (line[i] === '$') {
                    const [val, next] = readVar(i);
                    cur.value += val;
                    i = next;
                } else {
                    cur.value += line[i++];
                }
            }
            i++;
        } else if (ch === '\\') {
            word().value += line[i + 1] ?? '';
            i += 2;
        } else if (ch === '$') {
            const [val, next] = readVar(i);
            word().value += val;
            i = next;
        } else if (ch === '~' && !cur && (i + 1 === line.length || /[\s/]/.test(line[i + 1]))) {
            word().value += HOME;
            i++;
        } else {
            if (ch === '*' || ch === '?') word().glob = true;
            word().value += ch;
            i++;
        }
    }
    push();
    return tokens;
}

function parse(tokens) {
    const lists = [];
    let pipeline = [];
    let cmd = { words: [], redirect: null };
    const endCmd = () => {
        if (!cmd.words.length) throw new Error("syntax error near unexpected token `|'");
        pipeline.push(cmd);
        cmd = { words: [], redirect: null };
    };
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'word') {
            cmd.words.push(t);
        } else if (t.value === '>' || t.value === '>>') {
            const target = tokens[++i];
            if (target?.type !== 'word') throw new Error("syntax error near unexpected token `newline'");
            cmd.redirect = { append: t.value === '>>', path: target.value };
        } else if (t.value === '|') {
            endCmd();
        } else {
            if (cmd.words.length) endCmd();
            if (pipeline.length) lists.push({ pipeline, op: t.value });
            pipeline = [];
        }
    }
    if (cmd.words.length) endCmd();
    if (pipeline.length) lists.push({ pipeline, op: null });
    return lists;
}

function expandGlob(t) {
    if (!t.glob) return [t.value];
    const slash = t.value.lastIndexOf('/');
    const dirPart = t.value.slice(0, slash + 1);
    const pat = t.value.slice(slash + 1);
    const node = getNode(normalize(dirPart || '.'));
    if (!node || node.type !== 'dir' || /[*?]/.test(dirPart)) return [t.value];
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const matches = Object.keys(node.children)
        .filter((n) => re.test(n) && (pat.startsWith('.') || !n.startsWith('.')))
        .sort();
    return matches.length ? matches.map((n) => dirPart + n) : [t.value];
}

async function exec(argv, stdin, piped, seen = new Set()) {
    const [name, ...args] = argv;
    if (Object.hasOwn(state.aliases, name) && !seen.has(name)) {
        seen.add(name);
        const expanded = tokenize(state.aliases[name]).filter((t) => t.type === 'word').flatMap(expandGlob);
        return exec([...expanded, ...args], stdin, piped, seen);
    }
    const cmd = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
    if (!cmd) {
        state.status = 127;
        if (name.includes('/')) {
            const node = getNode(normalize(name));
            print(c('err', esc(`nsh: ${node ? 'permission denied' : 'no such file or directory'}: ${name}`)));
            return [];
        }
        const guess = Object.keys(COMMANDS).find((k) => editDistance(k, name) === 1);
        print(c('err', esc(`nsh: command not found: ${name}`)) + (guess ? c('dim', ` — did you mean '${guess}'?`) : ''));
        return [];
    }
    if (args.includes('--help')) return cmdMan({ args: [name] });
    state.status = 0;
    try {
        return (await cmd.run({ name, args, stdin, piped })) || [];
    } catch (e) {
        err(`${name}: ${e.message}`);
        return [];
    }
}

function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return d[a.length][b.length];
}

function redirect({ path, append }, lines) {
    const abs = normalize(path);
    const parentAbs = parentOf(abs);
    const parent = getNode(parentAbs);
    const text = lines.length ? lines.map(toText).join('\n') + '\n' : '';
    if (parent?.type !== 'dir') return err(`nsh: no such file or directory: ${path}`);
    const existing = parent.children[basename(abs)];
    if (existing?.type === 'dir') return err(`nsh: is a directory: ${path}`);
    if (!canModify(parentAbs, existing)) return err(`nsh: permission denied: ${path}`);
    if (existing && append) existing.content += text;
    else parent.children[basename(abs)] = { type: 'file', content: text, owner: USER, mtime: new Date() };
}

async function runPipeline(cmds) {
    let stdin = null;
    for (let i = 0; i < cmds.length; i++) {
        const { words, redirect: redir } = cmds[i];
        const last = i === cmds.length - 1;
        const out = await exec(words.flatMap(expandGlob), stdin, !last || !!redir);
        if (redir) redirect(redir, out);
        if (last && !redir) print(out);
        stdin = redir ? '' : out.map(toText).join('\n') + (out.length ? '\n' : '');
        if (state.abort) return;
    }
}

async function runLine(line) {
    let lists;
    try {
        lists = parse(tokenize(line));
    } catch (e) {
        state.status = 2;
        return print(c('err', esc(`nsh: ${e.message}`)));
    }
    for (let i = 0; i < lists.length; i++) {
        const prev = i ? lists[i - 1].op : null;
        if ((prev === '&&' && state.status !== 0) || (prev === '||' && state.status === 0)) continue;
        await runPipeline(lists[i].pipeline);
        if (state.abort) return;
    }
}

// ---------- input handling ----------

function setBusy(busy) {
    state.busy = busy;
    inputLine.hidden = busy && !state.pending;
    if (!inputLine.hidden) input.focus();
}

function ask(label, secret) {
    return new Promise((resolve) => {
        state.pending = { label, secret, resolve };
        promptEl.textContent = label;
        input.type = secret ? 'password' : 'text';
        input.value = '';
        inputLine.hidden = false;
        input.focus();
    });
}

function waitKey() {
    return new Promise((resolve) => {
        state.keyWaiter = resolve;
    });
}

async function submit() {
    const raw = input.value;
    input.value = '';

    if (state.pending) {
        const { label, secret, resolve } = state.pending;
        state.pending = null;
        input.type = 'text';
        print(esc(label) + (secret ? '' : esc(raw)));
        inputLine.hidden = true;
        return resolve(raw);
    }

    print(promptHtml() + esc(raw));
    let line = raw;
    if (line.includes('!!')) {
        const last = state.history.at(-1);
        if (!last) return err('nsh: !!: event not found');
        line = line.replaceAll('!!', last);
        print(esc(line));
    }
    if (line.trim() && line !== state.history.at(-1)) {
        state.history.push(line);
        state.history = state.history.slice(-500);
        localStorage.setItem('nsh_history', JSON.stringify(state.history));
    }
    state.histIndex = null;
    state.lastTab = null;

    state.abort = false;
    setBusy(true);
    await runLine(line);
    setBusy(false);
    updatePrompt();
    terminal.scrollTop = terminal.scrollHeight;
}

function browseHistory(dir) {
    const h = state.history;
    if (!h.length) return;
    if (state.histIndex === null) {
        if (dir > 0) return;
        state.draft = input.value;
        state.histIndex = h.length;
    }
    state.histIndex = Math.max(0, state.histIndex + dir);
    if (state.histIndex >= h.length) {
        state.histIndex = null;
        input.value = state.draft;
    } else {
        input.value = h[state.histIndex];
    }
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
}

function complete() {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const word = before.match(/\S*$/)[0];
    const start = pos - word.length;
    const isCommand = /(^|[|;&]\s*)\s*$/.test(before.slice(0, start)) && !word.includes('/');

    let candidates;
    if (isCommand) {
        candidates = [...new Set([...Object.keys(COMMANDS), ...Object.keys(state.aliases)])]
            .filter((n) => n.startsWith(word))
            .sort()
            .map((n) => ({ text: n, label: c('exe', esc(n)), suffix: ' ' }));
    } else {
        const slash = word.lastIndexOf('/');
        const dirPart = word.slice(0, slash + 1);
        const base = word.slice(slash + 1);
        const node = getNode(normalize(dirPart || '.'));
        if (!node || node.type !== 'dir') return;
        candidates = Object.keys(node.children)
            .filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
            .sort()
            .map((n) => {
                const child = node.children[n];
                return { text: dirPart + n, label: colorName(n, child), suffix: child.type === 'dir' ? '/' : ' ' };
            });
    }
    if (!candidates.length) return;

    const replace = (text) => {
        input.value = input.value.slice(0, start) + text + input.value.slice(pos);
        const caret = start + text.length;
        input.setSelectionRange(caret, caret);
    };
    if (candidates.length === 1) return replace(candidates[0].text + candidates[0].suffix);

    let prefix = candidates[0].text;
    for (const cand of candidates) while (!cand.text.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (prefix.length > word.length) return replace(prefix);

    if (state.lastTab === input.value) {
        print(promptHtml() + esc(input.value));
        print(`<div class="ls-grid">${candidates.map((cand) => `<span>${cand.label}</span>`).join('')}</div>`);
    }
    state.lastTab = input.value;
}

document.addEventListener('keydown', (e) => {
    if (state.keyWaiter) {
        e.preventDefault();
        const resolve = state.keyWaiter;
        state.keyWaiter = null;
        return resolve();
    }
    if (state.booting) {
        state.skip = true;
        return;
    }

    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    if (ctrl && e.key === 'c') {
        if (window.getSelection().toString()) return; // let the browser copy
        e.preventDefault();
        if (state.busy) {
            state.abort = true;
            state.skip = true;
            if (state.pending) {
                const { resolve, label } = state.pending;
                state.pending = null;
                input.type = 'text';
                print(esc(label) + '^C');
                inputLine.hidden = true;
                resolve('');
            }
            return;
        }
        print(promptHtml() + esc(input.value) + '^C');
        input.value = '';
        state.histIndex = null;
        state.status = 130;
        return;
    }
    if (state.busy && !state.pending) return e.preventDefault();

    if (document.activeElement !== input && !e.metaKey && !ctrl && !e.altKey) input.focus();

    if (e.key === 'Enter') {
        e.preventDefault();
        submit();
    } else if (state.pending) {
        // password prompts only take plain typing
    } else if (e.key === 'Tab') {
        e.preventDefault();
        complete();
    } else if (e.key === 'ArrowUp' || (ctrl && e.key === 'p')) {
        e.preventDefault();
        browseHistory(-1);
    } else if (e.key === 'ArrowDown' || (ctrl && e.key === 'n')) {
        e.preventDefault();
        browseHistory(1);
    } else if (ctrl && e.key === 'l') {
        e.preventDefault();
        output.innerHTML = '';
    } else if (ctrl && e.key === 'u') {
        e.preventDefault();
        input.value = input.value.slice(input.selectionStart);
        input.setSelectionRange(0, 0);
    } else if (ctrl && e.key === 'w') {
        e.preventDefault();
        const pos = input.selectionStart;
        const before = input.value.slice(0, pos).replace(/\S+\s*$/, '');
        input.value = before + input.value.slice(pos);
        input.setSelectionRange(before.length, before.length);
    } else if (ctrl && e.key === 'a') {
        e.preventDefault();
        input.setSelectionRange(0, 0);
    } else if (ctrl && e.key === 'e') {
        e.preventDefault();
        input.setSelectionRange(input.value.length, input.value.length);
    } else if (ctrl && e.key === 'd' && !input.value) {
        e.preventDefault();
        input.value = 'exit';
        submit();
    }
});

terminal.addEventListener('click', () => {
    if (state.keyWaiter) {
        const resolve = state.keyWaiter;
        state.keyWaiter = null;
        return resolve();
    }
    if (state.booting) state.skip = true;
    if (!window.getSelection().toString() && !inputLine.hidden) input.focus();
});

// ---------- boot & login ----------

const BOOT_UNITS = [
    'Mounted /boot', 'Started Journal Service', 'Started Rule-based Manager for Device Events and Files',
    'Reached target Local File Systems', 'Started Network Time Synchronization', 'Reached target System Initialization',
    'Started Daily Cleanup of Temporary Directories', 'Listening on D-Bus System Message Bus Socket',
    'Started D-Bus System Message Bus', 'Started iwd — Wireless Daemon', 'Started Network Configuration',
    'Started OpenSSH Daemon', 'Started Firewall (nftables)', 'Started Docker Application Container Engine',
    'Started containerd container runtime', 'Started Wazuh agent', 'Started InfraEye agentless collector',
    'Reached target Multi-User System', 'Started Getty on tty1', 'Reached target Graphical Interface',
];

function resetSession() {
    state.cwd = state.env.PWD = state.env.OLDPWD = HOME;
    state.status = 0;
}

async function boot() {
    state.booting = true;
    state.skip = false;
    inputLine.hidden = true;
    output.innerHTML = '';
    print(c('dim', `:: running early hook [udev]`));
    print(c('dim', `Starting systemd-udevd version 258`));
    print(c('dim', `:: running hook [encrypt]`));
    await sleep(350);
    for (const unit of BOOT_UNITS) {
        print(`[  ${c('ok', 'OK')}  ] ${unit}.`);
        await sleep(40 + Math.random() * 70);
    }
    await sleep(300);
    output.innerHTML = '';
    print([`NeoxOS 1.0 ${HOST} tty1`, '']);
    const loginLine = document.createElement('div');
    loginLine.className = 'line';
    loginLine.textContent = `${HOST} login: `;
    output.appendChild(loginLine);
    for (const ch of USER) {
        await sleep(90);
        loginLine.textContent += ch;
    }
    await sleep(250);
    print('Password: ');
    await sleep(400);
    state.booting = false;
    state.skip = false;
}

async function login(clear) {
    if (clear) output.innerHTML = '';
    const last = localStorage.getItem('nsh_last_login');
    if (last) print(`Last login: ${fmtDate(new Date(last))} from 127.0.0.1 on pts/0`);
    localStorage.setItem('nsh_last_login', new Date().toISOString());
    print(['', ...BANNER.split('\n').map((l) => c('banner', esc(l))), '']);
    print(renderText(getNode('/etc/motd').content));
    updatePrompt();
    setBusy(false);
}

(async () => {
    if (sessionStorage.getItem('nsh_booted')) {
        await login(true);
    } else {
        await boot();
        sessionStorage.setItem('nsh_booted', '1');
        await login(false);
    }
})();
