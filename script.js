'use strict';

// nsh — a small bash-like shell over the virtual filesystem in fs.js.
// apps.js adds full-screen programs (less, htop, vim...), sys.js adds system tools and themes,
// desktop.js runs the Hyprland-style desktop that hosts one shell per terminal window.

// The focused terminal's elements and session. desktop.js rebinds these when focus moves.
let terminal, output, inputLine, promptEl, input, screenEl;

const GUEST = 'visitor';
const HOST = 'neox';
const KERNEL = '6.17.0-neox';
const BOOT_TIME = Date.now();
const BUILD_DATE = new Date(document.lastModified);

// Only the SHA-256 of neox's password lives in the code, so reading the source doesn't give it away.
// Finding the real thing is the privilege-escalation puzzle (run `hint` in the shell).
const NEOX_PASSWORD_SHA256 = '5519c2f0d725a4549c75f848120932742028780ff853794eab288c40a59e173b';

// Plain-JS SHA-256: crypto.subtle is unavailable when the page is opened from file://.
function sha256(text) {
    const rotr = (v, n) => (v >>> n) | (v << (32 - n));
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) | 0;
    const K = primes.map((p) => frac(Math.cbrt(p)));
    let H = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const bytes = [...new TextEncoder().encode(text)];
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    for (let off = 0; off < bytes.length; off += 64) {
        const w = [];
        for (let i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
        }
        H = H.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) | 0);
    }
    return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

const isNeoxPassword = (pw) => sha256(pw) === NEOX_PASSWORD_SHA256;

const USERS = {
    root: { uid: 0, home: '/root', groups: '0(root)' },
    neox: { uid: 1000, home: HOME, groups: '1000(neox),998(wheel),969(docker)' },
    visitor: { uid: 1001, home: HOME, groups: '1001(visitor),100(users)' },
};

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

// Shared by every terminal, like ~/.bash_history and the system journal.
const shared = {
    history: JSON.parse(localStorage.getItem('nsh_history') || '[]'),
    journal: [],
    booting: false,
    hintsSeen: 0,
};

const newSession = () => ({
    user: GUEST,
    sessions: [],   // users we su'd from, so `exit` can return to them
    sudoUntil: 0,   // sudo caches the password for a few minutes, like the real thing
    cwd: HOME,
    env: {
        USER: GUEST, LOGNAME: GUEST, HOME, HOSTNAME: HOST, SHELL: '/bin/nsh',
        TERM: 'xterm-ghostty', LANG: 'en_US.UTF-8', EDITOR: 'nvim',
        PATH: '/usr/local/bin:/usr/bin:/bin', PWD: HOME, OLDPWD: HOME,
    },
    aliases: {
        ll: 'ls -la',
        la: 'ls -a',
        '..': 'cd ..',
        whois: 'cat ~neox/about.txt',
        experience: 'cat ~neox/experience/*',
        projects: 'grep -h ^# ~neox/projects/*',
        skills: 'cat ~neox/skills.txt',
        education: 'cat ~neox/education.txt',
        certs: 'cat ~neox/certifications.txt',
        contact: 'cat ~neox/contact.txt',
        music: 'cat ~neox/music/README.txt',
        blogs: 'ls -l ~neox/links/medium',
    },
    histIndex: null,
    draft: '',
    status: 0,
    depth: 0,
    busy: false,
    abort: false,
    quietErr: false, // set while a command runs with 2>/dev/null
    skip: false,
    pending: null,
    keyWaiter: null,
    lastTab: null,
    app: null,
    exited: false,
});

let state = newSession();

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
    // Keep scrollback bounded (`yes` would otherwise grow the page forever).
    while (output.childElementCount > 4000) output.firstElementChild.remove();
    terminal.scrollTop = terminal.scrollHeight;
}

function err(msg) {
    if (!state.quietErr) print(c('err', esc(msg)));
    state.status = 1;
}

function journal(unit, msg) {
    shared.journal.push({ time: new Date(), unit, msg });
}

const isRoot = () => state.user === 'root';

function promptHtml() {
    const root = isRoot();
    return `${c(root ? 'r' : 'u', `${state.user}@${HOST}`)}:${c('p', esc(tildify(state.cwd)))}${root ? '#' : '$'} `;
}

function updatePrompt() {
    promptEl.innerHTML = promptHtml();
}

function setTitle(running) {
    document.title = running ? `${running} — ${state.user}@${HOST}` : `${state.user}@${HOST}:${tildify(state.cwd)}`;
}

// ---------- users ----------

function setUser(user, login) {
    state.user = user;
    Object.assign(state.env, { USER: user, LOGNAME: user, HOME: USERS[user].home });
    if (login) state.cwd = state.env.PWD = USERS[user].home;
}

function pushUser(user, login) {
    state.sessions.push({ user: state.user, cwd: state.cwd });
    setUser(user, login);
}

function popUser() {
    const prev = state.sessions.pop();
    setUser(prev.user);
    state.cwd = state.env.PWD = prev.cwd;
}

// ---------- filesystem ----------

function expandTilde(path) {
    const m = path.match(/^~([a-z_][\w-]*)?(?=\/|$)/);
    if (!m) return path;
    const home = m[1] ? USERS[m[1]]?.home : state.env.HOME;
    return home ? home + path.slice(m[0].length) : path;
}

function normalize(path) {
    path = expandTilde(path);
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

const tildify = (abs) => {
    const home = state.env.HOME;
    return abs === home ? '~' : abs.startsWith(home + '/') ? '~' + abs.slice(home.length) : abs;
};
const basename = (abs) => abs.split('/').filter(Boolean).pop() || '/';
const parentOf = (abs) => normalize(abs + '/..');
const isSystem = (abs) => !(abs === HOME || abs.startsWith(HOME + '/') || abs === '/tmp' || abs.startsWith('/tmp/'));
const ownerOf = (abs, node) => node.owner || (isSystem(abs) ? 'root' : 'neox');

// Private nodes (/root, ~/.ssh, /etc/shadow...) are only readable by their owner and root.
function isForbidden(abs) {
    if (isRoot()) return false;
    let node = FS;
    let path = '';
    for (const p of abs.split('/').filter(Boolean)) {
        if (node.type !== 'dir' || !Object.hasOwn(node.children, p)) return false;
        node = node.children[p];
        path += '/' + p;
        if (node.private && ownerOf(path, node) !== state.user) return true;
    }
    return false;
}

// Existing files are protected by ownership; anyone may create new ones under ~ and /tmp.
function canModify(abs) {
    if (isRoot()) return true;
    if (isForbidden(abs)) return false;
    const node = getNode(abs);
    if (node) return ownerOf(abs, node) === state.user;
    const parentAbs = parentOf(abs);
    const parent = getNode(parentAbs);
    return parent?.type === 'dir' && (ownerOf(parentAbs, parent) === state.user || !isSystem(parentAbs));
}

function writeFile(abs, content, append) {
    const node = getNode(abs);
    if (node) {
        node.content = append ? node.content + content : content;
        node.mtime = new Date();
    } else {
        getNode(parentOf(abs)).children[basename(abs)] = { type: 'file', content, owner: state.user, mtime: new Date() };
    }
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
    node.onRead?.();
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
    return `${node.mode || perms} ${String(nlink).padStart(2)} ${owner} ${owner} ${String(size).padStart(5)} ${fmtTime(node.mtime || BUILD_DATE)} ${colorName(name, node)}${target}`;
}

function cmdCd({ args }) {
    let target = args[0] ?? state.env.HOME;
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
                walk(child, `${dirAbs}/${n}`.replace('//', '/'), prefix + (last ? '    ' : '│   '));
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
            (function collect(n, nAbs, display) {
                if (isForbidden(nAbs)) return err(`grep: ${display}: Permission denied`);
                for (const [name, child] of Object.entries(n.children).sort()) {
                    const childAbs = `${nAbs}/${name}`.replace('//', '/');
                    if (child.type === 'dir') collect(child, childAbs, `${display}/${name}`);
                    else if (child.type === 'file' && !child.bin && !isForbidden(childAbs)) sources.push([`${display}/${name}`, child.content]);
                }
            })(node, abs, p.replace(/\/$/, ''));
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

// Input for filters: the named files, or stdin when there are none.
function filterInput(cmd, files, stdin) {
    if (!files.length) return stdin ?? '';
    const texts = files.map((f) => readFile(f, cmd));
    return texts.includes(undefined) ? null : texts.join('');
}

function cmdBase64({ args, stdin }) {
    const decode = args.some((a) => a === '-d' || a === '--decode');
    const text = filterInput('base64', args.filter((a) => !a.startsWith('-')), stdin);
    if (text == null) return;
    const bytes = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
    if (decode) {
        try {
            return textLines(new TextDecoder().decode(bytes(atob(text.replace(/\s+/g, ''))))).map(esc);
        } catch {
            return err('base64: invalid input');
        }
    }
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    return (encoded.match(/.{1,76}/g) || ['']).map(esc);
}

function cmdSha256sum({ args, stdin }) {
    const files = args.filter((a) => !a.startsWith('-'));
    if (!files.length) return [`${sha256(stdin ?? '')}  -`];
    return files.map((f) => {
        const text = readFile(f, 'sha256sum');
        return text == null ? null : `${sha256(text)}  ${esc(f)}`;
    }).filter(Boolean);
}

function cmdEcho({ args }) {
    const noNewline = args[0] === '-n';
    const text = args.filter((a) => a !== '-n' && a !== '-e').join(' ');
    if (noNewline && !text) return [];
    const out = [linkify(esc(text))];
    // `echo -n` matters when piping into hashes: echo -n pw | sha256sum.
    out.noNewline = noNewline;
    return out;
}

function cmdTouch({ args }) {
    if (!args.length) return err('touch: missing file operand');
    for (const p of args) {
        const abs = normalize(p);
        const node = getNode(abs);
        if (!node && getNode(parentOf(abs))?.type !== 'dir') err(`touch: cannot touch '${p}': No such file or directory`);
        else if (!canModify(abs)) err(`touch: cannot touch '${p}': Permission denied`);
        else if (node) node.mtime = new Date();
        else writeFile(abs, '');
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
            if (!canModify(cur)) return err(`mkdir: cannot create directory '${p}': Permission denied`);
            getNode(parentAbs).children[parts[i]] = { type: 'dir', children: {}, owner: state.user, mtime: new Date() };
        }
    }
}

// Deleting any of these as root takes the whole system down.
const CRITICAL = ['/', '/bin', '/usr', '/etc', '/boot'];

function cmdRm({ args }) {
    const noPreserve = args.includes('--no-preserve-root');
    const { flags, rest } = parseFlags(args.filter((a) => !a.startsWith('--')));
    const recursive = flags.has('r') || flags.has('R');
    if (!rest.length) return err('rm: missing operand');
    const targets = rest.map(normalize);
    if (recursive && targets.includes('/') && !noPreserve) {
        err("rm: it is dangerous to operate recursively on '/'");
        err('rm: use --no-preserve-root to override this failsafe');
        return;
    }
    if (recursive && isRoot() && targets.some((t) => CRITICAL.includes(t))) return meltdown();
    rest.forEach((p, i) => {
        const abs = targets[i];
        const node = getNode(abs);
        if (!node) {
            if (!flags.has('f')) err(`rm: cannot remove '${p}': No such file or directory`);
        } else if (node.type === 'dir' && !recursive) {
            err(`rm: cannot remove '${p}': Is a directory`);
        } else if (!canModify(abs)) {
            err(`rm: cannot remove '${p}': Permission denied`);
        } else {
            delete getNode(parentOf(abs)).children[basename(abs)];
        }
    });
}

function cmdChmod({ args }) {
    const [mode, ...paths] = args.filter((a) => a !== '-R');
    if (!mode || !paths.length) return err(`chmod: missing operand${mode ? ` after '${mode}'` : ''}`);
    const numeric = /^[0-7]{3,4}$/.test(mode);
    if (!numeric && !/^[ugoa]*[+=-][rwx]+$/.test(mode)) return err(`chmod: invalid mode: '${mode}'`);
    for (const p of paths) {
        const abs = normalize(p);
        const node = getNode(abs);
        if (!node) {
            err(`chmod: cannot access '${p}': No such file or directory`);
        } else if (!canModify(abs)) {
            err(`chmod: changing permissions of '${p}': Operation not permitted`);
        } else if (numeric) {
            const bits = mode.slice(-3);
            const rwx = [...bits].map((d) => ['r', 'w', 'x'].map((ch, i) => (d & (4 >> i) ? ch : '-')).join('')).join('');
            node.mode = (node.type === 'dir' ? 'd' : '-') + rwx;
            node.exe = /[1357]/.test(bits);
        } else if (mode.includes('x')) {
            delete node.mode;
            node.exe = !mode.includes('-');
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
            else return err(`xdg-open: ${a}: No such file or directory (see: ls ~neox/links)`);
        }
        window.open(url, '_blank', 'noopener');
        print(`Opening ${linkify(esc(url))}`);
    }
}

// Run each line of a script through the shell. Output goes straight to the terminal.
async function runScript(text) {
    if (state.depth > 16) return err('nsh: maximum script nesting level exceeded');
    state.depth++;
    try {
        for (const line of text.split('\n')) {
            if (!line.trim() || line.trim().startsWith('#')) continue;
            await runLine(line);
            if (state.abort) break;
        }
    } finally {
        state.depth--;
    }
}

async function cmdSource({ name, args }) {
    if (!args.length) return err(`${name}: filename argument required`);
    const text = readFile(args[0], name);
    if (text != null) await runScript(text);
}

async function cmdShell({ name, args }) {
    if (!args.length) return err(`${name}: interactive subshells aren't supported here — try: ${name} script.sh`);
    return cmdSource({ name, args });
}

function cmdNeofetch() {
    const kv = (k, v) => `${c('u', k)}: ${esc(v)}`;
    const title = `${state.user}@${HOST}`;
    const palette = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'fg'];
    const info = [
        `${c('u', esc(state.user))}@${c('u', HOST)}`,
        '-'.repeat(title.length),
        kv('OS', 'NeoxOS (Arch-based) x86_64'),
        kv('Host', 'Cloudflare Edge'),
        kv('Kernel', KERNEL),
        kv('Uptime', fmtUptime()),
        kv('Packages', `${Object.keys(COMMANDS).length} (nsh)`),
        kv('Shell', 'nsh 1.1'),
        kv('Resolution', `${screen.width}x${screen.height}`),
        kv('WM', 'Hyprland'),
        kv('Theme', currentTheme()),
        kv('Terminal', 'ghostty (web)'),
        kv('Font', 'JetBrainsMono Nerd Font'),
        kv('CPU', `${navigator.hardwareConcurrency || '?'} cores`),
        '',
        kv('Name', 'Manish Karki (Neox)'),
        kv('Role', 'DevSecOps Engineer @ Citytech'),
        kv('Focus', 'Offensive Security, Platform Eng'),
        kv('Location', 'Kathmandu, Nepal'),
        kv('Contact', 'cat ~neox/contact.txt'),
        '',
        palette.map((col) => `<span style="background:var(--${col})">   </span>`).join(''),
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
        'nsh, version 1.1 — the NeoxOS shell (bash-ish)',
        '',
        c('hl', 'Portfolio') + c('dim', ' (aliases — run `alias` to see what they do)'),
        row(portfolio),
        '',
        ...Object.entries(groups).flatMap(([g, names]) => [c('hl', g), row(names), '']),
        `Shell features: pipes ${c('y', '|')}, redirection ${c('y', '&gt; &gt;&gt;')}, ${c('y', '&amp;&amp; || ;')}, ${c('y', '$VARS')}, globs ${c('y', '*')}, ${c('y', '!!')}, scripts ${c('y', './x.sh')}`,
        `Keys: Tab completes, ↑/↓ history, Ctrl+L clear, Ctrl+C interrupt, Ctrl+A/E/U line editing`,
        `Type ${c('exe', 'man &lt;command&gt;')} for details. New here? ${c('exe', 'cat README.md')}. Feeling brave? ${c('exe', 'ctf')}`,
    ];
}

function cmdMan({ args, piped }) {
    if (!args.length) return err('What manual page do you want?\nFor example, try \'man man\'.');
    const name = args[0];
    const cmd = COMMANDS[name];
    if (!cmd) {
        if (state.aliases[name]) return [`${esc(name)} is aliased to \`${esc(state.aliases[name])}'`];
        return err(`No manual entry for ${name}`);
    }
    const up = name.toUpperCase();
    const pad = ' '.repeat(Math.max(4, 30 - up.length));
    const page = [
        c('hl', `${esc(up)}(1)${pad}User Commands${pad}${esc(up)}(1)`),
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
    return piped ? page : openPager(page, `Manual page ${name}(1)`);
}

// Commands outside the shell only exist while their binary is still in /bin.
const installed = (name) => COMMANDS[name]?.builtin || !!getNode(`/bin/${name}`);

function cmdWhich({ args }) {
    const out = [];
    for (const a of args) {
        if (state.aliases[a]) out.push(`${esc(a)}: aliased to ${esc(state.aliases[a])}`);
        else if (COMMANDS[a]?.builtin) out.push(`${esc(a)}: shell built-in command`);
        else if (installed(a)) out.push(`/usr/bin/${esc(a)}`);
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
        shared.history = [];
        localStorage.removeItem('nsh_history');
        return;
    }
    const width = String(shared.history.length).length + 2;
    return shared.history.map((h, i) => `${String(i + 1).padStart(width)}  ${esc(h)}`);
}

async function authenticate(prompt) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const pw = await ask(prompt, true);
        if (state.abort) return false;
        if (isNeoxPassword(pw)) return true;
        await sleep(900);
        if (attempt < 3) print('Sorry, try again.');
    }
    journal('sudo', `${state.user} : 3 incorrect password attempts ; TTY=pts/0 ; PWD=${state.cwd} ; USER=root`);
    err('sudo: 3 incorrect password attempts');
    return false;
}

async function cmdSudo({ args, stdin, piped }) {
    if (!args.length) return err('usage: sudo [-i | -s | -l | -k] [command [arg ...]]');
    if (args[0] === '-k') {
        state.sudoUntil = 0;
        return;
    }
    if (state.user === GUEST) {
        await ask(`[sudo] password for ${GUEST}: `, true);
        if (state.abort) return;
        await sleep(600);
        journal('sudo', `${GUEST} : user NOT in sudoers ; TTY=pts/0 ; PWD=${state.cwd} ; USER=root ; COMMAND=${args.join(' ')}`);
        return err(`${GUEST} is not in the sudoers file. This incident will be reported.`);
    }
    if (!isRoot() && Date.now() > state.sudoUntil) {
        if (!(await authenticate(`[sudo] password for ${state.user}: `))) return;
        state.sudoUntil = Date.now() + 5 * 60 * 1000;
    }
    const [first, ...rest] = args;
    if (first === '-l') return [`User ${esc(state.user)} may run the following commands on ${HOST}:`, '    (ALL : ALL) ALL'];
    journal('sudo', `${state.user} : TTY=pts/0 ; PWD=${state.cwd} ; USER=root ; COMMAND=${args.join(' ')}`);
    if (['-i', '-s', 'su', 'bash', 'sh', 'nsh'].includes(first) && rest.every((a) => a === '-')) {
        pushUser('root', first !== '-s');
        return;
    }
    const prev = state.user;
    setUser('root');
    try {
        return await exec(args, stdin, piped);
    } finally {
        if (state.user === 'root') setUser(prev);
    }
}

async function cmdSu({ args }) {
    const login = args.some((a) => ['-', '-l', '--login'].includes(a));
    const target = args.find((a) => !a.startsWith('-')) || 'root';
    if (!USERS[target]) return err(`su: user ${target} does not exist or the user entry does not contain all the required fields`);
    if (!isRoot() && target !== GUEST) {
        const pw = await ask('Password: ', true);
        if (state.abort) return;
        await sleep(800);
        // root's account is locked (see /etc/shadow), so only neox's password ever works here.
        if (target === 'root' || !isNeoxPassword(pw)) {
            journal('su', `pam_unix(su:auth): authentication failure; logname=${state.user} tty=pts/0 user=${target}`);
            return err('su: Authentication failure');
        }
    }
    journal('su', `(to ${target}) ${state.user} on pts/0`);
    pushUser(target, login);
}

function cmdExit() {
    if (state.sessions.length) {
        print('logout');
        popUser();
        return;
    }
    // desktop.js closes the window once the command line finishes.
    state.exited = true;
    state.abort = true;
}

function reboot() {
    sessionStorage.removeItem('nsh_booted');
    location.reload();
}

async function cmdReboot() {
    print(c('dim', `Broadcast message from ${state.user}@${HOST}: The system will reboot now!`));
    await sleep(700);
    reboot();
}

async function cmdShutdown() {
    enterTty();
    for (const s of ['Stopping user session...', 'Unmounting /home...', 'Reached target System Power Off.']) {
        print(`[  ${c('ok', 'OK')}  ] ${s}`);
        await sleep(250);
    }
    output.innerHTML = '';
    print(c('dim', 'System halted. Press any key to power on.'));
    await waitKey();
    reboot();
}

// What happens when root deletes the system (or kills init). A reboot restores everything.
async function meltdown(fromRm = true) {
    state.skip = false;
    if (fromRm) {
        const victims = [];
        (function walk(node, path) {
            for (const [n, child] of Object.entries(node.children)) {
                const p = `${path}/${n}`;
                if (child.type === 'dir') walk(child, p);
                victims.push(`removed ${child.type === 'dir' ? 'directory ' : ''}'${p}'`);
            }
        })(FS, '');
        for (const v of victims) {
            print(esc(v));
            await sleep(10);
        }
    }
    FS.children = {};
    await sleep(800);
    enterTty();
    const t = (Date.now() - BOOT_TIME) / 1000;
    const stamp = (i) => `[${(t + i * 0.000013).toFixed(6).padStart(12)}]`;
    const panic = 'Kernel panic - not syncing: Attempted to kill init! exitcode=0x00007f00';
    print([
        panic,
        `CPU: 0 UID: 0 PID: 1 Comm: systemd Not tainted ${KERNEL} #1`,
        'Hardware name: Cloudflare Edge/NeoxOS, BIOS 1.1',
        'Call Trace:',
        ' <TASK>',
        ' dump_stack_lvl+0x5d/0x80',
        ' panic+0x118/0x2e0',
        ' do_exit.cold+0x15/0x15',
        ' do_group_exit+0x2d/0x90',
        ' __x64_sys_exit_group+0x18/0x20',
        ' do_syscall_64+0x82/0x190',
        ' entry_SYSCALL_64_after_hwframe+0x76/0x7e',
        ' </TASK>',
        'Kernel Offset: disabled',
        `---[ end ${panic} ]---`,
    ].map((l, i) => c('err', esc(`${stamp(i)} ${l}`))));
    print(['', c('dim', 'Well, you had root. Press any key to reboot.')]);
    await waitKey();
    reboot();
}

const FORTUNES = [
    'Talk is cheap. Show me the code.\n    — Linus Torvalds',
    'Security is a process, not a product.\n    — Bruce Schneier',
    'There is no place like 127.0.0.1',
    'The quieter you become, the more you are able to hear.',
    'It works on my machine.\n    — every developer, ever',
    'Without music, life would be a mistake.\n    — Friedrich Nietzsche',
    'Make it work, make it right, make it fast.\n    — Kent Beck',
    'With great power comes great responsibility.\n    — /etc/sudoers.d/lecture',
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
    base64: { group: 'Files', usage: 'base64 [-d] [FILE]', desc: 'base64 encode/decode data and print to standard output', run: cmdBase64 },
    sha256sum: { group: 'Files', usage: 'sha256sum [FILE...]', desc: 'compute SHA-256 message digests', run: cmdSha256sum },
    touch: { group: 'Files', usage: 'touch FILE...', desc: 'change file timestamps or create empty files', run: cmdTouch },
    mkdir: { group: 'Files', usage: 'mkdir [-p] DIR...', desc: 'make directories', run: cmdMkdir },
    rm: { group: 'Files', usage: 'rm [-rf] FILE...', desc: 'remove files or directories', run: cmdRm },
    chmod: { group: 'Files', usage: 'chmod MODE FILE...', desc: 'change file mode bits (chmod +x script.sh)', run: cmdChmod },
    open: { group: 'Files', usage: 'open URL | ~/links/NAME', desc: 'open a link in the browser (alias: xdg-open)', run: cmdOpen },
    'xdg-open': { group: 'Hidden', usage: 'xdg-open URL', desc: 'open a link in the browser', run: cmdOpen },
    echo: { group: 'Shell', usage: 'echo [-n] [STRING...]', desc: 'display a line of text', builtin: true, run: cmdEcho },
    alias: { group: 'Shell', usage: 'alias [NAME[=VALUE]...]', desc: 'define or display aliases', builtin: true, run: cmdAlias },
    unalias: { group: 'Hidden', usage: 'unalias NAME...', desc: 'remove aliases', builtin: true, run: ({ args }) => args.forEach((a) => delete state.aliases[a]) },
    export: { group: 'Shell', usage: 'export NAME=VALUE...', desc: 'set environment variables', builtin: true, run: cmdExport },
    env: { group: 'Shell', usage: 'env', desc: 'print the environment', run: cmdEnv },
    history: { group: 'Shell', usage: 'history [-c]', desc: 'display or clear the command history', builtin: true, run: cmdHistory },
    source: { group: 'Shell', usage: 'source FILE', desc: 'execute commands from a file in the current shell', builtin: true, run: cmdSource },
    '.': { group: 'Hidden', usage: '. FILE', desc: 'execute commands from a file in the current shell', builtin: true, run: cmdSource },
    sh: { group: 'Hidden', usage: 'sh FILE', desc: 'run a shell script', run: cmdShell },
    bash: { group: 'Hidden', usage: 'bash FILE', desc: 'run a shell script', run: cmdShell },
    which: { group: 'Shell', usage: 'which COMMAND...', desc: 'locate a command', run: cmdWhich },
    type: { group: 'Hidden', usage: 'type COMMAND...', desc: 'describe a command', builtin: true, run: cmdWhich },
    man: { group: 'Shell', usage: 'man COMMAND', desc: 'an interface to the system reference manuals', run: cmdMan },
    help: { group: 'Shell', usage: 'help', desc: 'display information about available commands', builtin: true, run: cmdHelp },
    clear: { group: 'Shell', usage: 'clear', desc: 'clear the terminal screen', run: () => { output.innerHTML = ''; } },
    neofetch: { group: 'System', usage: 'neofetch', desc: 'show system information (and who runs this box)', run: cmdNeofetch },
    fastfetch: { group: 'Hidden', usage: 'fastfetch', desc: 'show system information', run: cmdNeofetch },
    whoami: { group: 'System', usage: 'whoami', desc: 'print effective user name', run: () => [state.user] },
    id: { group: 'System', usage: 'id', desc: 'print user and group IDs', run: () => {
        const { uid, groups } = USERS[state.user];
        return [`uid=${uid}(${state.user}) gid=${uid}(${state.user}) groups=${groups}`];
    } },
    hostname: { group: 'System', usage: 'hostname', desc: 'show the system host name', run: () => [HOST] },
    uname: { group: 'System', usage: 'uname [-a]', desc: 'print system information', run: ({ args }) => [args.includes('-a') ? `Linux ${HOST} ${KERNEL} #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux` : args.includes('-r') ? KERNEL : 'Linux'] },
    date: { group: 'System', usage: 'date', desc: 'print the system date and time', run: () => [fmtDate(new Date())] },
    sudo: { group: 'System', usage: 'sudo [-i | -l] COMMAND', desc: 'execute a command as root', run: cmdSudo },
    su: { group: 'System', usage: 'su [-] [USER]', desc: 'run a shell as another user', run: cmdSu },
    exit: { group: 'System', usage: 'exit', desc: 'leave the current shell', builtin: true, run: cmdExit },
    logout: { group: 'Hidden', usage: 'logout', desc: 'log out of the shell', builtin: true, run: cmdExit },
    reboot: { group: 'System', usage: 'reboot', desc: 'reboot the machine (restores everything)', run: cmdReboot },
    shutdown: { group: 'System', usage: 'shutdown', desc: 'power off the machine', run: cmdShutdown },
    poweroff: { group: 'Hidden', usage: 'poweroff', desc: 'power off the machine', run: cmdShutdown },
    true: { group: 'Hidden', usage: 'true', desc: 'do nothing, successfully', run: () => {} },
    false: { group: 'Hidden', usage: 'false', desc: 'do nothing, unsuccessfully', run: () => { state.status = 1; } },
    fortune: { group: 'Fun', usage: 'fortune', desc: 'print a random, hopefully interesting, adage', run: () => FORTUNES[Math.floor(Math.random() * FORTUNES.length)].split('\n').map(esc) },
    cowsay: { group: 'Fun', usage: 'cowsay [MESSAGE]', desc: 'configurable speaking cow', run: cmdCowsay },
};

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
        const tilde = ch === '~' && !cur && line.slice(i).match(/^~([a-z_][\w-]*)?(?=[\s/;|&>]|$)/);
        const stderr = !cur && line.slice(i).match(/^2>(&1)?/);
        if (/\s/.test(ch)) {
            push();
            i++;
        } else if (stderr) {
            tokens.push({ type: 'op', value: stderr[0] });
            i += stderr[0].length;
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
        } else if (tilde) {
            word().value += expandTilde(tilde[0]);
            i += tilde[0].length;
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
        } else if (t.value === '2>') {
            // Errors are discarded wherever they're sent (usually 2>/dev/null); 2>&1 is accepted as is.
            if (tokens[++i]?.type !== 'word') throw new Error("syntax error near unexpected token `newline'");
            cmd.quietErr = true;
        } else if (t.value === '2>&1') {
            continue;
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

// Running a path: binaries in /bin dispatch to their command, executable files run as scripts.
async function execPath(path, args, stdin, piped) {
    const abs = normalize(path);
    const node = getNode(abs);
    if (!node) {
        state.status = 127;
        return print(c('err', esc(`nsh: no such file or directory: ${path}`)));
    }
    if (node.type === 'dir' || isForbidden(abs) || !node.exe) {
        state.status = 126;
        return print(c('err', esc(`nsh: ${node.type === 'dir' ? 'is a directory' : 'permission denied'}: ${path}`)));
    }
    if (node.bin) return exec([basename(abs), ...args], stdin, piped, new Set([basename(abs)]));
    await runScript(node.content);
}

async function exec(argv, stdin, piped, seen = new Set()) {
    const [name, ...args] = argv;
    if (Object.hasOwn(state.aliases, name) && !seen.has(name)) {
        seen.add(name);
        const expanded = tokenize(state.aliases[name]).filter((t) => t.type === 'word').flatMap(expandGlob);
        return exec([...expanded, ...args], stdin, piped, seen);
    }
    if (name.includes('/')) return (await execPath(name, args, stdin, piped)) || [];
    const cmd = Object.hasOwn(COMMANDS, name) && installed(name) ? COMMANDS[name] : null;
    if (!cmd) {
        state.status = 127;
        const guess = Object.keys(COMMANDS).find((k) => editDistance(k, name) === 1 && installed(k));
        print(c('err', esc(`nsh: command not found: ${name}`)) + (guess ? c('dim', ` — did you mean '${guess}'?`) : ''));
        return [];
    }
    if (args.includes('--help')) return cmdMan({ args: [name], piped: true });
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
    if (abs === '/dev/null') return;
    const parent = getNode(parentOf(abs));
    const text = lines.length ? lines.map(toText).join('\n') + (lines.noNewline ? '' : '\n') : '';
    if (parent?.type !== 'dir') return err(`nsh: no such file or directory: ${path}`);
    if (getNode(abs)?.type === 'dir') return err(`nsh: is a directory: ${path}`);
    if (!canModify(abs)) return err(`nsh: permission denied: ${path}`);
    writeFile(abs, text, append);
}

async function runPipeline(cmds) {
    let stdin = null;
    for (let i = 0; i < cmds.length; i++) {
        const { words, redirect: redir, quietErr } = cmds[i];
        const last = i === cmds.length - 1;
        state.quietErr = !!quietErr;
        const out = await exec(words.flatMap(expandGlob), stdin, !last || !!redir).finally(() => { state.quietErr = false; });
        if (redir) redirect(redir, out);
        if (last && !redir) print(out);
        stdin = redir ? '' : out.map(toText).join('\n') + (out.length && !out.noNewline ? '\n' : '');
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

// ---------- full-screen apps ----------

// Takes over the window like a real TUI (less, htop, vim...). Resolves when the app closes.
function runApp(app) {
    return new Promise((resolve) => {
        const handle = {
            onKey: (e) => app.onKey?.(e, close),
            onClick: (e) => app.onClick?.(e, close),
        };
        function close() {
            if (state.app !== handle) return;
            state.app = null;
            app.cleanup?.();
            screenEl.hidden = true;
            screenEl.className = 'screen';
            screenEl.innerHTML = '';
            resolve();
        }
        state.app = handle;
        screenEl.hidden = false;
        screenEl.className = `screen ${app.className || ''}`;
        screenEl.innerHTML = '';
        app.init(screenEl, close);
    });
}

// ---------- terminal instances ----------

function createShell(container) {
    container.innerHTML = `<div class="term"><div class="output" aria-live="polite"></div>
        <div class="input-line" hidden><span class="prompt"></span><input type="text" class="user-input" autocomplete="off"
        autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Terminal input"></div></div>
        <div class="screen" hidden></div>`;
    const sh = {
        session: newSession(),
        terminal: container.querySelector('.term'),
        output: container.querySelector('.output'),
        inputLine: container.querySelector('.input-line'),
        promptEl: container.querySelector('.prompt'),
        input: container.querySelector('.user-input'),
        screenEl: container.querySelector('.screen'),
    };
    sh.screenEl.addEventListener('click', (e) => sh.session.app?.onClick(e));
    sh.terminal.addEventListener('click', () => {
        if (state !== sh.session) return;
        if (state.keyWaiter) {
            const resolve = state.keyWaiter;
            state.keyWaiter = null;
            return resolve();
        }
        if (shared.booting) state.skip = true;
        if (!window.getSelection().toString() && !inputLine.hidden) input.focus();
    });
    return sh;
}

function bindShell(sh) {
    ({ terminal, output, inputLine, promptEl, input, screenEl } = sh || {});
    state = sh ? sh.session : null;
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
        const last = shared.history.at(-1);
        if (!last) return err('nsh: !!: event not found');
        line = line.replaceAll('!!', last);
        print(esc(line));
    }
    if (line.trim() && line !== shared.history.at(-1)) {
        shared.history.push(line);
        shared.history = shared.history.slice(-500);
        localStorage.setItem('nsh_history', JSON.stringify(shared.history));
    }
    state.histIndex = null;
    state.lastTab = null;

    state.abort = false;
    state.skip = false;
    setBusy(true);
    setTitle(line.trim());
    await runLine(line);
    setBusy(false);
    setTitle();
    updatePrompt();
    terminal.scrollTop = terminal.scrollHeight;
    afterCommand(state);
}

function browseHistory(dir) {
    const h = shared.history;
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
        candidates = [...new Set([...Object.keys(COMMANDS).filter(installed), ...Object.keys(state.aliases)])]
            .filter((n) => n.startsWith(word))
            .sort()
            .map((n) => ({ text: n, label: c('exe', esc(n)), suffix: ' ' }));
    } else {
        const slash = word.lastIndexOf('/');
        const dirPart = word.slice(0, slash + 1);
        const base = word.slice(slash + 1);
        const dirAbs = normalize(dirPart || '.');
        const node = getNode(dirAbs);
        if (!node || node.type !== 'dir' || isForbidden(dirAbs)) return;
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
    if (!state) return;
    if (state.keyWaiter) {
        e.preventDefault();
        const resolve = state.keyWaiter;
        state.keyWaiter = null;
        return resolve();
    }
    if (state.app) return state.app.onKey(e);
    if (shared.booting) {
        state.skip = true;
        return;
    }

    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    if (ctrl && e.key === 'c') {
        if (window.getSelection().toString()) return; // let the browser copy
        e.preventDefault();
        if (state.busy) {
            if (state.abort) return;
            state.abort = true;
            state.skip = true;
            if (state.pending) {
                const { resolve, label } = state.pending;
                state.pending = null;
                input.type = 'text';
                print(esc(label) + '^C');
                inputLine.hidden = true;
                resolve('');
            } else {
                print('^C');
            }
            state.status = 130;
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

async function boot() {
    shared.booting = true;
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
    print([`NeoxOS 1.1 ${HOST} tty1`, '']);
    const loginLine = document.createElement('div');
    loginLine.className = 'line';
    loginLine.textContent = `${HOST} login: `;
    output.appendChild(loginLine);
    for (const ch of GUEST) {
        await sleep(90);
        loginLine.textContent += ch;
    }
    await sleep(250);
    print('Password: ');
    await sleep(400);
    print(['', c('dim', 'Starting Hyprland...')]);
    await sleep(500);
    shared.booting = false;
    state.skip = false;
}

// The greeting printed in the first terminal after login.
function greet() {
    const last = localStorage.getItem('nsh_last_login');
    if (last) print(`Last login: ${fmtDate(new Date(last))} from 127.0.0.1 on pts/0`);
    localStorage.setItem('nsh_last_login', new Date().toISOString());
    journal('systemd-logind', `New session 1 of user ${GUEST}.`);
    print(['', ...BANNER.split('\n').map((l) => c('banner', esc(l))), '']);
    print(renderText(getNode('/etc/motd').content));
}

// Runs once every script has registered its commands.
document.addEventListener('DOMContentLoaded', async () => {
    // /bin holds a binary per command, so `ls /bin` looks right and deleting one really removes it.
    for (const [name, cmd] of Object.entries(COMMANDS)) {
        if (!cmd.builtin) FS.children.bin.children[name] = { type: 'file', exe: true, bin: true, content: '\x7fELF\x02\x01\x01' + '\0'.repeat(25) };
    }
    FS.children.usr.children.bin = FS.children.bin;

    bindShell(createShell(document.getElementById('tty')));
    // Résumé links (#resume) skip the boot animation: recruiters shouldn't have to wait.
    if (!sessionStorage.getItem('nsh_booted') && !/^#(resume|cv)$/i.test(location.hash)) {
        await boot();
        sessionStorage.setItem('nsh_booted', '1');
    }
    startDesktop();
});
