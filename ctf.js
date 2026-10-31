'use strict';

// NeoxCTF: six flags hidden around the box, each a small real-world attack path, plus hidden quests.
// Flags are checked against SHA-256 hashes and the ones challenges print are XOR-veiled (`unveil`
// in fs.js), so reading the source is no shortcut. Hidden quests without a flag award themselves.
// Progress is kept in localStorage, so it survives `reboot`.

const CTF = [
    {
        id: 'dotfiles', cat: 'recon', name: 'Dotfiles', pts: 50,
        hash: 'dbd62aa6718e742fdd38400ebaedd98e02a4138eb600f6bc10d89fb3501e944f',
        brief: 'Every engagement starts with enumeration. Someone left a note in their home directory, but a plain `ls` won\'t show it.',
        hints: [
            'On Linux, files whose names start with a dot are hidden from ls.',
            `${c('exe', 'ls -la ~neox')}, then ${c('exe', 'cat')} whatever looks out of place.`,
        ],
    },
    {
        id: 'web', cat: 'web', name: 'Disallowed', pts: 100,
        hash: '0a063dd4ae6dd94935a87682687d37a24ed139d7c40f364bd15edd38e7d096eb',
        brief: 'A staging web server runs on this box. Its developer believes a file is safe because nothing links to it.',
        hints: [
            `Find the server first: ${c('exe', 'nmap localhost')}, then ${c('exe', 'curl localhost')}.`,
            'Read the page source properly. Comments too.',
            `robots.txt tells search engines where not to look, so attackers read it first: ${c('exe', 'curl localhost/robots.txt')}`,
            'Follow the Disallow entries. Directory listings and .bak files are a classic leak.',
        ],
    },
    {
        id: 'knock', cat: 'network', name: 'Knock Knock', pts: 150,
        hash: 'b7b1b00e5edd27e42df92cf1e90c1d6f32c8222d0bdaf5344ab4ec9bf6fdca10',
        brief: 'Something on this box listens on port 1337 and it isn\'t very welcoming. Talk to it, and get through the door it mentions.',
        hints: [
            `${c('exe', 'nc localhost 1337')}`,
            `Port knocking: a daemon opens a firewalled port after connections to a secret sequence of closed ports. Which daemon? ${c('exe', 'ps aux')}, ${c('exe', 'systemctl list-units')}`,
            `Its config should be private. Is it? ${c('exe', "find / -name '*knock*' 2>/dev/null")}`,
            `${c('exe', 'knock localhost P1 P2 P3')} in order, within the timeout. Then ${c('exe', 'nmap localhost')} again.`,
        ],
    },
    {
        id: 'k8s', cat: 'cloud', name: 'Secret Service', pts: 150,
        hash: 'b346beb1fd9680f717a67dec0ca93e023555b2eca5edcecc40f78de1c84ed7e3',
        brief: 'The cluster admins swear visitors can\'t read Kubernetes secrets. Audit their RBAC.',
        hints: [
            `${c('exe', 'kubectl get secrets')} is forbidden, so ask what you <em>can</em> do: ${c('exe', 'kubectl auth can-i --list')}`,
            `RBAC is per namespace. ${c('exe', 'kubectl get ns')}, then ${c('exe', 'kubectl auth can-i --list -n NAMESPACE')} for each.`,
            `${c('exe', 'kubectl get secret NAME -n NAMESPACE -o yaml')}`,
            `Secret data is base64-encoded, not encrypted: ${c('exe', "echo '…' | base64 -d")}`,
        ],
    },
    {
        id: 'dfir', cat: 'forensics', name: 'Persistence', pts: 200,
        hash: '62c2a87c5ec33644109b8cf0ec14eb4503cc5193366dd98434777809e5740a41',
        brief: 'At 02:11 last night Wazuh flagged SSH logins from an unknown IP. The intruder left something behind that lets them come back. Find it and recover the key it carries.',
        hints: [
            `Start with the logs: ${c('exe', 'cat /var/log/auth.log')}. Which account fell, and what did it do with sudo?`,
            `Cron is a favourite persistence spot, and dotfiles hide from ls: ${c('exe', 'ls -la /etc/cron.d')}`,
            `Follow the job to its binary. Don't cat binaries: ${c('exe', 'file')} and ${c('exe', 'strings')} them.`,
            `That key is a flag with every letter shifted 13 places (ROT13): ${c('exe', "echo '…' | tr 'A-Za-z' 'N-ZA-Mn-za-m'")}`,
        ],
    },
    {
        id: 'root', cat: 'privesc', name: 'Root', pts: 250,
        hash: '8d3d8d714a7e09c2956c6224b3e98958e3b5ae543fde72ab5d1d86ea123e1731',
        brief: 'There\'s a flag in /root, and you\'re a guest without sudo. Get root.',
        hints: HINTS,
    },
    // Hidden quests: listed as ??? until found.
    {
        id: 'devtools', cat: 'web', name: 'Inspector', pts: 100, hidden: true,
        hash: '9707b746b27d5f30538ee8308b000018545fdf8a2b35945638423dac3d2dbcd6',
        clue: 'Developers leave messages where only developers look.',
    },
    { id: 'konami', cat: 'misc', name: 'Old School', pts: 50, hidden: true, clue: 'Thirty lives, if you know the code.' },
    { id: 'pin', cat: 'crypto', name: 'Safecracker', pts: 50, hidden: true, clue: 'Some PINs fall to logic, not luck.' },
    { id: 'chaos', cat: 'misc', name: 'Chaos Monkey', pts: 50, hidden: true, clue: 'root\'s own history says never do it.' },
];

const CTF_TOTAL = CTF.reduce((sum, ch) => sum + ch.pts, 0);
const ctfSolved = () => JSON.parse(localStorage.getItem('nsh_ctf') || '{}');
const ctfScore = (solved = ctfSolved()) => CTF.filter((ch) => solved[ch.id]).reduce((sum, ch) => sum + ch.pts, 0);
const ctfHintsSeen = {};

function ctfRank(score) {
    if (score >= CTF_TOTAL) return 'legend';
    return [[900, 'root@neox'], [600, 'red teamer'], [300, 'packet sniffer'], [50, 'script kiddie'], [0, 'tourist']].find(([min]) => score >= min)[1];
}

function refreshCtfBadge() {
    const badge = barEl.querySelector('.bar-ctf span');
    if (badge) badge.textContent = `${Object.keys(ctfSolved()).filter((id) => CTF.some((ch) => ch.id === id)).length}/${CTF.length}`;
}

// Records a capture. Returns false if it was already captured.
function ctfSolve(id) {
    const ch = CTF.find((x) => x.id === id);
    const solved = ctfSolved();
    if (!ch || solved[id]) return false;
    solved[id] = new Date().toISOString();
    localStorage.setItem('nsh_ctf', JSON.stringify(solved));
    refreshCtfBadge();
    const score = ctfScore(solved);
    notify(ch.hidden ? `Hidden quest found: ${ch.name}` : `Flag captured: ${ch.name}`, `+${ch.pts} pts · ${score}/${CTF_TOTAL} · rank: ${ctfRank(score)}`, 8000);
    if (score === CTF_TOTAL) setTimeout(() => notify('NeoxCTF complete', 'Every flag and every hidden quest. Run `ctf` for your certificate.', 12000), 1500);
    return true;
}

function ctfPick(arg) {
    const visible = CTF.filter((ch) => !ch.hidden);
    return /^\d+$/.test(arg ?? '') ? visible[Number(arg) - 1] : visible.find((ch) => ch.id === arg || ch.name.toLowerCase() === arg?.toLowerCase());
}

function ctfBoard() {
    const solved = ctfSolved();
    const score = ctfScore(solved);
    const width = 30;
    const filled = Math.round((score / CTF_TOTAL) * width);
    const out = [
        c('hl', 'NeoxCTF') + c('dim', ' — capture the flags hidden on this box'),
        `${c('ok', '█'.repeat(filled))}${c('dim', '░'.repeat(width - filled))}  ${score}/${CTF_TOTAL} pts  rank: ${c('y', ctfRank(score))}`,
        '',
        c('dim', '  #  CATEGORY   CHALLENGE        PTS'),
    ];
    CTF.filter((ch) => !ch.hidden).forEach((ch, i) => {
        const row = `  ${i + 1}  ${ch.cat.padEnd(10)} ${ch.name.padEnd(15)} ${String(ch.pts).padStart(4)}`;
        out.push(solved[ch.id] ? `${c('ok', row)}  ${c('ok', '✔')}` : row);
    });
    const hidden = CTF.filter((ch) => ch.hidden);
    out.push('', c('dim', `  hidden quests: ${hidden.filter((ch) => solved[ch.id]).length}/${hidden.length} found`));
    for (const ch of hidden) {
        out.push(solved[ch.id]
            ? `  ${c('ok', '✔')}  ${c('ok', `${ch.cat.padEnd(10)} ${ch.name.padEnd(15)} ${String(ch.pts).padStart(4)}`)}`
            : `  ${c('dim', '?')}  ${c('dim', `${'???'.padEnd(10)} ${esc(ch.clue)}`)}`);
    }
    out.push('');
    if (score === CTF_TOTAL) {
        const first = Object.values(solved).sort()[0];
        const days = Math.max(1, Math.ceil((Date.now() - new Date(first)) / 86400000));
        const text = [
            'CERTIFICATE OF PWNAGE',
            `NeoxCTF · ${CTF_TOTAL}/${CTF_TOTAL} pts · every hidden quest`,
            `rank: legend · ${new Date().toISOString().slice(0, 10)} · ${days} day${days === 1 ? '' : 's'}`,
        ];
        const w = Math.max(...text.map((t) => t.length)) + 6;
        out.push(...[`╔${'═'.repeat(w)}╗`, ...text.map((t) => `║   ${t.padEnd(w - 3)}║`), `╚${'═'.repeat(w)}╝`].map((l) => c('y', esc(l))),
            linkify('Screenshot this and tag me, or just say hi: mnshchtri@gmail.com'), '');
    }
    out.push(`In Chromium (Alt+B): ${c('exe', 'http://ctf.neox')} · ${c('exe', 'ctf web')} opens it`);
    out.push(`${c('exe', 'ctf info N')} story · ${c('exe', 'ctf hint N')} nudge · ${c('exe', 'ctf submit flag{…}')} score · ${c('exe', 'ctf reset')} start over`);
    return out;
}

// Checks a flag for both the terminal and the ctf.neox site: { error } or { ch, fresh }.
function ctfCheck(flag) {
    if (!flag) return { error: 'usage: ctf submit flag{...}' };
    if (!/^flag\{.+\}$/.test(flag)) return { error: 'Flags look like flag{...}' };
    const ch = CTF.find((x) => x.hash === sha256(flag));
    if (!ch) return { wrong: true };
    return { ch, fresh: ctfSolve(ch.id) };
}

function ctfSubmit(flag) {
    const { error, wrong, ch, fresh } = ctfCheck(flag);
    if (error) return err(`ctf: ${error}`);
    if (wrong) {
        state.status = 1;
        return [c('err', '✗ Not a flag on this box.') + c('dim', ' Close only counts in horseshoes.')];
    }
    if (!fresh) return [c('dim', `Already captured: ${ch.name}.`)];
    const score = ctfScore();
    const out = [`${c('ok', '✔ Correct!')} ${c('hl', esc(ch.name))} ${c('dim', `(${ch.cat})`)} +${ch.pts} pts · ${score}/${CTF_TOTAL} · rank: ${c('y', ctfRank(score))}`];
    const next = CTF.find((x) => !x.hidden && !ctfSolved()[x.id]);
    if (next) out.push(c('dim', `Next up: ctf info ${CTF.filter((x) => !x.hidden).indexOf(next) + 1}  (${next.name})`));
    else if (score < CTF_TOTAL) out.push(c('dim', 'Every main flag is yours. The hidden quests are still out there.'));
    return out;
}

function cmdCtf({ args }) {
    const [sub, ...rest] = args;
    if (!sub || sub === 'score' || sub === 'board') return ctfBoard();
    if (sub === 'submit') return ctfSubmit(rest.join(' ').trim());
    if (sub === 'web') return void openApp(browserApp('http://ctf.neox/'), { fromCommand: true });
    if (sub === 'reset') {
        localStorage.removeItem('nsh_ctf');
        refreshCtfBadge();
        return ['Scoreboard cleared. Every flag is back in place. Good hunting.'];
    }
    if (sub === 'info' || sub === 'hint') {
        const ch = ctfPick(rest[0]);
        if (!ch) return err(`usage: ctf ${sub} N   (1-${CTF.filter((x) => !x.hidden).length})`);
        if (sub === 'info') {
            return [
                `${c('hl', esc(ch.name))} ${c('dim', `· ${ch.cat} · ${ch.pts} pts`)}${ctfSolved()[ch.id] ? ` ${c('ok', '✔ captured')}` : ''}`,
                esc(ch.brief).replace(/`([^`]+)`/g, (_, code) => c('exe', code)),
                c('dim', `Stuck? ctf hint ${rest[0]}  (${ch.hints.length} hints, one at a time)`),
            ];
        }
        const n = Math.min((ctfHintsSeen[ch.id] = (ctfHintsSeen[ch.id] || 0) + 1), ch.hints.length);
        return [`${c('hl', `${esc(ch.name)} hint ${n}/${ch.hints.length}:`)} ${ch.hints[n - 1]}`];
    }
    if (/^flag\{/.test(sub)) return ctfSubmit(args.join(' '));
    return err(`ctf: unknown subcommand '${sub}'. Try: ctf | ctf info N | ctf hint N | ctf submit flag{...} | ctf reset`);
}

// ---------- shared plumbing: users, units, processes, tools ----------

UNITS.knockd = { desc: 'Port-knock server', pid: 488, bin: '/usr/bin/knockd -c /etc/knockd.conf', active: true };
SYS.procs.push(
    { pid: 488, user: 'root', base: 0, cpu: 0, mem: 0.1, cmd: '/usr/bin/knockd -c /etc/knockd.conf', time: 3 },
    // The implant renamed itself to look like a kernel thread, but kernel threads show in [brackets].
    { pid: 2323, user: 'root', base: 0.1, cpu: 0.1, mem: 0.1, cmd: 'kworker/u8:2', time: 41 },
);
SYS.procs.sort((a, b) => a.pid - b.pid);

const rot13 = (s) => s.replace(/[a-z]/gi, (ch) => String.fromCharCode((ch <= 'Z' ? 65 : 97) + ((ch.charCodeAt(0) - (ch <= 'Z' ? 65 : 97) + 13) % 26)));

function cmdStrings({ args, stdin }) {
    const nIdx = args.indexOf('-n');
    const min = nIdx >= 0 ? Number(args[nIdx + 1]) || 4 : 4;
    const text = filterInput('strings', args.filter((a, i) => !a.startsWith('-') && (nIdx < 0 || i !== nIdx + 1)), stdin);
    if (text == null) return;
    return (text.match(new RegExp(`[\\x20-\\x7e\\t]{${min},}`, 'g')) || []).map(esc);
}

function expandSet(set) {
    const out = [];
    for (let i = 0; i < set.length; i++) {
        if (set[i + 1] === '-' && i + 2 < set.length) {
            for (let code = set.charCodeAt(i); code <= set.charCodeAt(i + 2); code++) out.push(String.fromCharCode(code));
            i += 2;
        } else {
            out.push(set[i] === '\\' && set[i + 1] === 'n' ? (i++, '\n') : set[i]);
        }
    }
    return out;
}

function cmdTr({ args, stdin }) {
    const del = args[0] === '-d';
    const [from, to] = args.filter((a) => a !== '-d');
    if (!from || (!del && to == null)) return err("tr: missing operand\nTry: echo hello | tr 'a-z' 'A-Z'");
    if (stdin == null) return err('tr: reads standard input: pipe something into it, e.g. echo hello | tr a-z A-Z');
    const a = expandSet(from);
    const b = del ? [] : expandSet(to);
    const map = new Map(a.map((ch, i) => [ch, del ? '' : b[Math.min(i, b.length - 1)] ?? '']));
    return textLines([...stdin].map((ch) => (map.has(ch) ? map.get(ch) : ch)).join('')).map(esc);
}

function cmdRev({ args, stdin }) {
    const text = filterInput('rev', args, stdin);
    if (text == null) return;
    return textLines(text).map((l) => esc([...l].reverse().join('')));
}

function cmdFile({ args }) {
    if (!args.length) return err('Usage: file [-bchikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding] [--mime-type] file ...');
    return args.map((p) => {
        const abs = normalize(p);
        const node = getNode(abs);
        if (!node) return `${esc(p)}: cannot open \`${esc(p)}' (No such file or directory)`;
        if (node.type === 'dir') return `${esc(p)}: directory`;
        if (node.type === 'link') return `${esc(p)}: symbolic link to ${esc(node.target)}`;
        if (isForbidden(abs)) return `${esc(p)}: regular file, no read permission`;
        const text = node.content;
        if (text.startsWith('\x7fELF')) return `${esc(p)}: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, stripped`;
        if (!text) return `${esc(p)}: empty`;
        if (/^#!/.test(text)) return `${esc(p)}: ${esc(text.split('\n')[0].slice(2).split('/').pop())} script, ASCII text executable`;
        if (/^-----BEGIN OPENSSH PRIVATE KEY/.test(text)) return `${esc(p)}: OpenSSH private key`;
        return `${esc(p)}: ${/[^\x00-\x7f]/.test(text) ? 'Unicode text, UTF-8' : 'ASCII'} text`;
    });
}

function cmdFind({ args }) {
    const starts = [];
    let i = 0;
    while (i < args.length && !args[i].startsWith('-')) starts.push(args[i++]);
    const tests = [];
    let maxdepth = Infinity;
    for (; i < args.length; i++) {
        const [a, v] = [args[i], args[i + 1]];
        const needsValue = ['-name', '-iname', '-type', '-user', '-perm', '-maxdepth'].includes(a);
        if (needsValue && v == null) return err(`find: missing argument to \`${a}'`);
        if (a === '-name' || a === '-iname') {
            const re = new RegExp('^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', a === '-iname' ? 'i' : '');
            tests.push((e) => re.test(e.name));
        } else if (a === '-type') {
            const want = { f: 'file', d: 'dir', l: 'link' }[v];
            if (!want) return err(`find: Unknown argument to -type: ${v}`);
            tests.push((e) => e.node.type === want);
        } else if (a === '-user') {
            tests.push((e) => ownerOf(e.abs, e.node) === v);
        } else if (a === '-perm') {
            // Only SUID/SGID searches make sense here, and this box has no such binaries.
            tests.push((e) => /[sS]/.test(e.node.mode || ''));
        } else if (a === '-maxdepth') {
            maxdepth = Number(v);
        } else if (a !== '-print') {
            return err(`find: unknown predicate \`${a}'`);
        }
        if (needsValue) i++;
    }
    const out = [];
    const walk = (abs, shown, node, depth) => {
        if (tests.every((t) => t({ abs, name: basename(abs), node }))) out.push(esc(shown));
        if (node.type !== 'dir' || depth >= maxdepth) return;
        if (isForbidden(abs)) return err(`find: '${shown}': Permission denied`);
        for (const name of Object.keys(node.children).sort()) {
            walk(abs === '/' ? `/${name}` : `${abs}/${name}`, shown.endsWith('/') ? shown + name : `${shown}/${name}`, node.children[name], depth + 1);
        }
    };
    for (const start of starts.length ? starts : ['.']) {
        const abs = normalize(start);
        const node = getNode(abs);
        if (!node) {
            err(`find: '${start}': No such file or directory`);
            continue;
        }
        walk(abs, start, node, 0);
    }
    return out;
}

function cmdCrontab({ args }) {
    if (args.includes('-e')) return err(`crontab: ${state.user} is not allowed to edit crontabs on this box. (System jobs live in /etc/cron.d.)`);
    if (args.includes('-l') || !args.length) return [`no crontab for ${esc(state.user)}`];
    return err('usage: crontab [-l | -e]');
}

// ---------- Disallowed: the staging web server (nginx on 80/443, document root /srv/http) ----------

const WEB_FLAG = 'CAkOHxUXXxpeERwnGh0bJ18WMBZeETBMDQZcCx06DEgAER1IAhg=';
FS.children.srv = dir({
    http: Object.assign(secret(dir({
        'index.html': file(`
<!doctype html>
<html>
<head><title>neox · staging</title></head>
<body>
  <h1>It works!</h1>
  <p>Staging box for neox's side projects. Nothing public lives here.</p>
  <!-- TODO(neox): robots.txt still lists the old backup dir. Delete both before go-live. -->
</body>
</html>
`),
        'robots.txt': file(`
User-agent: *
Disallow: /admin/
Disallow: /backup-2025/
`),
        admin: Object.assign(dir({ 'index.html': file('<h1>admin</h1>\n') }), { auth: true }),
        'backup-2025': Object.assign(dir({
            'deployforge.env.bak': file(`
# DeployForge staging config. DO NOT COMMIT, DO NOT SERVE.
NODE_ENV=staging
DATABASE_URL=postgres://deployforge:********@127.0.0.1:5432/deployforge
JWT_SECRET=${unveil(WEB_FLAG)}
# rotate after the demo (neox, 2025-03-14)
`),
            'nginx.conf.old': file(`
server {
    listen 80;
    root /srv/http;
    autoindex on;   # handy for staging. TODO: turn off
}
`),
        }), { autoindex: true }),
    }), 'drwxr-x---'), { owner: 'http' }),
});

const HTTP_REASONS = { 200: 'OK', 301: 'Moved Permanently', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found' };

const nginxPage = (code) => `<html>
<head><title>${code} ${HTTP_REASONS[code]}</title></head>
<body>
<center><h1>${code} ${HTTP_REASONS[code]}</h1></center>
<hr><center>nginx/1.29.1</center>
</body>
</html>
`;

function webServe(path) {
    const docroot = '/srv/http';
    const rel = decodeURIComponent(path.split('?')[0]).replace(/\/+$/, '');
    const abs = normalize(docroot + '/' + rel);
    if (abs !== docroot && !abs.startsWith(docroot + '/')) return { status: 403, body: nginxPage(403) };
    let node = getNode(abs);
    if (!node) return { status: 404, body: nginxPage(404) };
    if (node.auth) return { status: 401, body: nginxPage(401), headers: ['WWW-Authenticate: Basic realm="neox staging admin"'] };
    if (node.type === 'dir') {
        if (!path.endsWith('/') && path) return { status: 301, body: nginxPage(301), headers: [`Location: ${path}/`] };
        if (node.children['index.html']) {
            return { status: 200, body: node.children['index.html'].content, type: 'text/html' };
        } else if (node.autoindex) {
            const url = abs.slice(docroot.length) + '/';
            const rows = Object.entries(node.children).map(([n, child]) => {
                const label = n + (child.type === 'dir' ? '/' : '');
                return `<a href="${label}">${label}</a>${' '.repeat(Math.max(1, 51 - label.length))}31-Oct-2026 02:10 ${String(child.content?.length ?? '-').padStart(8)}`;
            });
            return { status: 200, body: `<html>\n<head><title>Index of ${url}</title></head>\n<body>\n<h1>Index of ${url}</h1><hr><pre><a href="../">../</a>\n${rows.join('\n')}\n</pre><hr></body>\n</html>\n` };
        } else {
            return { status: 403, body: nginxPage(403) };
        }
    }
    const type = /\.html$/.test(abs) ? 'text/html' : 'text/plain';
    return { status: 200, body: node.content, type };
}

// Other local services that speak HTTP.
function localHttp(port, path) {
    if (port === 80 || port === 443) return webServe(path);
    if (port === 8443) return { status: 200, type: 'application/json', body: '{"service":"deployforge-api","version":"0.9.2","status":"ok","auth":"required"}\n' };
    if (port === 9100) return { status: 200, body: '# HELP infraeye_up Collector health\n# TYPE infraeye_up gauge\ninfraeye_up 1\ninfraeye_hosts_monitored 12\n' };
    return null;
}

function httpResponse(res, withHeaders) {
    const head = [
        `HTTP/1.1 ${res.status} ${HTTP_REASONS[res.status]}`,
        'Server: nginx/1.29.1',
        `Date: ${new Date().toUTCString()}`,
        `Content-Type: ${res.type || 'text/html'}`,
        `Content-Length: ${res.body.length}`,
        ...(res.headers || []),
    ];
    return withHeaders ? [...head, ''] : [];
}

// The same server in Chromium: http://localhost, view-source:, and every visit counts as a knock.
function localBrowse(url) {
    const source = url.startsWith('view-source:');
    let u;
    try {
        u = new URL(source ? url.slice(12) : url);
    } catch {
        return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname === 'ctf.neox') return source ? { source: CTF_SITE_SOURCE } : ctfSite();
    if (!/^(localhost|neox|127(\.\d+){3})$/.test(u.hostname)) return null;
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    knockHit(port);
    if (!portOpen(port)) return { html: browserError(`${u.hostname} refused to connect.`, 'ERR_CONNECTION_REFUSED') };
    const res = localHttp(port, u.pathname);
    if (!res) return { html: browserError(`${u.hostname} sent an invalid response.`, 'ERR_INVALID_HTTP_RESPONSE') };
    // Follow redirects (a directory without its trailing slash), keeping links relative to the new URL.
    if (res.status === 301) return localBrowse((source ? 'view-source:' : '') + new URL(res.headers[0].slice(10), u).href);
    if (source) return { source: res.body };
    return (res.type || 'text/html') === 'text/html' ? { doc: res.body, base: u.href.endsWith('/') || /\.[a-z]+$/i.test(u.pathname) ? u.href : `${u.href}/` } : { text: res.body };
}
LOCAL_SITES.push(localBrowse);

function browserError(title, code) {
    return `<div class="refused">${G.sad}<h2>This site can't be reached</h2><p>${esc(title)}</p><p class="dim">${code}</p></div>`;
}

const realCurl = COMMANDS.curl.run;
COMMANDS.curl.run = async (ctx) => {
    const target = ctx.args.find((a) => !a.startsWith('-'));
    let url;
    try {
        url = target && new URL(/^https?:\/\//.test(target) ? target : `http://${target}`);
    } catch {
        // realCurl reports the malformed URL.
    }
    if (!url || !resolve(url.hostname)?.startsWith('127.')) return realCurl(ctx);
    const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
    knockHit(port);
    if (!portOpen(port)) return err(`curl: (7) Failed to connect to ${url.hostname} port ${port} after 0 ms: Couldn't connect to server`);
    await sleep(120);
    const res = localHttp(port, url.pathname);
    if (!res) return err(port === 5432 ? 'curl: (52) Empty reply from server' : 'curl: (1) Received HTTP/0.9 when not allowed');
    const headOnly = ctx.args.includes('-I') || ctx.args.includes('--head');
    const lines = httpResponse(res, headOnly || ctx.args.includes('-i'));
    if (headOnly) return lines.slice(0, -1).map(esc);
    return [...lines, ...textLines(res.body)].map(esc);
};

// ---------- Knock Knock: knockd guards a debug shell on 31337 ----------

const KNOCK_SEQ = [7331, 4919, 8008];
const knockd = { stage: 0, first: 0, openUntil: 0 };
const OPEN_PORTS = [22, 80, 443, 1337, 5432, 8443, 9100];
const portOpen = (port) => OPEN_PORTS.includes(port) || (port === 31337 && Date.now() < knockd.openUntil);

FS.children.etc.children['knockd.conf'] = file(`
[options]
    UseSyslog
    Interface = lo

[openDebug]
    sequence      = ${KNOCK_SEQ.join(',')}
    seq_timeout   = 15
    tcpflags      = syn
    start_command = /usr/bin/nft add element inet filter debug_allow { %IP% timeout 300s }
    # opens tcp/31337 (neox-debug) to whoever knocks

# TODO(neox): chmod 600, this should not be world-readable
`);

// Every connection attempt is a potential knock, whether it comes from knock, nc or curl.
function knockHit(port) {
    const now = Date.now();
    if (now - knockd.first > 15000) knockd.stage = 0;
    if (port === KNOCK_SEQ[knockd.stage]) {
        if (knockd.stage === 0) knockd.first = now;
        knockd.stage++;
        journal('knockd', `127.0.0.1: openDebug: Stage ${knockd.stage}`);
    } else if (!OPEN_PORTS.includes(port)) {
        knockd.stage = port === KNOCK_SEQ[0] ? 1 : 0;
        knockd.first = now;
    }
    if (knockd.stage === KNOCK_SEQ.length) {
        knockd.stage = 0;
        knockd.openUntil = now + 300000;
        journal('knockd', '127.0.0.1: openDebug: OPEN SESAME');
        journal('knockd', 'openDebug: running command: /usr/bin/nft add element inet filter debug_allow { 127.0.0.1 timeout 300s }');
    }
}

async function cmdKnock({ args }) {
    const [host, ...ports] = args.filter((a) => !a.startsWith('-'));
    if (!host || !ports.length) return err('usage: knock [options] <host> <port[:proto]> [port[:proto]] ...');
    const ip = resolve(host);
    if (!ip) return err(`Cannot resolve hostname ${host}`);
    for (const p of ports) {
        const port = Number(p.split(':')[0]);
        if (!port) return err(`knock: invalid port: ${p}`);
        print(`hitting tcp ${ip}:${port}`);
        if (ip.startsWith('127.')) knockHit(port);
        await sleep(150);
    }
}

const realNmap = COMMANDS.nmap.run;
COMMANDS.nmap.run = async (ctx) => {
    const out = await realNmap(ctx);
    if (!Array.isArray(out) || !portOpen(31337)) return out;
    const versions = ctx.args.includes('-sV') || ctx.args.includes('-A');
    const at = out.findIndex((l) => l === '');
    out.splice(at, 0, `31337/tcp ${c('ok', 'open')}  ${'Elite?'.padEnd(11)}${versions ? 'neox-debug 0.3 (knock-protected)' : ''}`);
    return out;
};

async function cmdNc({ args, stdin }) {
    if (args.includes('-l')) return err("nc: listening works, but nobody's going to connect back to a browser tab.");
    const [host, portArg] = args.filter((a) => !a.startsWith('-'));
    const port = Number(portArg);
    if (!host || !port) return err('usage: nc [-vz] host port');
    const ip = resolve(host);
    if (!ip) return err(`nc: getaddrinfo for host "${host}" port ${portArg}: Name or service not known`);
    if (!ip.startsWith('127.')) {
        await sleep(1500);
        return err(`nc: connect to ${host} port ${port} (tcp) failed: Connection timed out (this box only talks to itself)`);
    }
    knockHit(port);
    if (!portOpen(port)) return err(`nc: connect to ${host} (${ip}) port ${port} (tcp) failed: Connection refused`);
    if (args.includes('-z')) return [`Connection to ${esc(host)} (${ip}) ${port} port [tcp/*] succeeded!`];
    await sleep(200);
    if (port === 22) return ['SSH-2.0-OpenSSH_10.2', ...(stdin ? ['Invalid SSH identification string.'] : [])];
    if (port === 1337) {
        return [
            c('y', 'NSH-1337 debug relay · neox@neox'),
            '> This port is the decoy. The real debug shell moved to 31337,',
            '> and the firewall keeps it shut until it hears the right knock.',
            '> -- ops: the sequence lives in the knock daemon\'s config. Don\'t lose it.',
        ];
    }
    if (port === 31337) {
        return [
            c('ok', 'neox-debug 0.3 · knock accepted from 127.0.0.1'),
            '$ cat /opt/debug/flag',
            c('hl', esc(unveil('CAkOHxUOAUgNDjATAFUMEzESB0gdOhsQXRdcJ11UXEtZGA=='))),
            '$ exit',
            c('dim', 'Port knocking is obscurity, not security: the sequence sat in a world-readable config.'),
        ];
    }
    const http = stdin?.match(/^(GET|HEAD) (\S+)/);
    if (!http) return port === 5432 ? [] : [c('dim', `(connected. This one speaks HTTP: printf 'GET / HTTP/1.0\\n\\n' | nc ${esc(host)} ${port})`)];
    const res = localHttp(port, http[2]);
    return [...httpResponse(res, true), ...(http[1] === 'GET' ? textLines(res.body) : [])].map(esc);
}

// ---------- Secret Service: a RoleBinding that lets every authenticated user read secrets ----------

const K8S_FLAG = 'CAkOHxUXDUwNOgJJHQZfFghUCCcdVgwKXREcJ1oXXCcEEBwMMQdbC11TWwU=';
const K8S_SECRETS = {
    security: {
        'cyberlynx-api-token': { type: 'Opaque', age: '8d', data: () => ({ token: unveil(K8S_FLAG) }) },
        'wazuh-manager-tls': { type: 'kubernetes.io/tls', age: '42d', data: () => ({ 'tls.crt': '-----BEGIN CERTIFICATE-----\n(demo certificate)\n-----END CERTIFICATE-----\n', 'tls.key': '-----BEGIN PRIVATE KEY-----\nnice try, this one is a dud\n-----END PRIVATE KEY-----\n' }) },
        'ghcr-pull': { type: 'kubernetes.io/dockerconfigjson', age: '42d', data: () => ({ '.dockerconfigjson': '{"auths":{"ghcr.io":{"auth":"bm90OmEtcmVhbC10b2tlbg=="}}}' }) },
    },
    platform: { 'deployforge-db': { type: 'Opaque', age: '3d', data: () => ({ username: 'deployforge', password: 'not-the-real-one' }) } },
    observability: { 'infra-eye-collector': { type: 'Opaque', age: '12d', data: () => ({ 'api-key': 'demo-only' }) } },
    default: {},
};
const k8sAdmin = () => isRoot() || state.user === 'neox';
// The misconfiguration: security/secret-readers binds a read-secrets Role to system:authenticated.
const canReadSecrets = (ns) => k8sAdmin() || ns === 'security';
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

function parseKubectl(args) {
    const pos = [];
    const opt = { ns: 'default', out: null };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        let m;
        if (a === '-n' || a === '--namespace') opt.ns = args[++i] ?? 'default';
        else if ((m = a.match(/^--namespace=(.+)/))) opt.ns = m[1];
        else if (a === '-o' || a === '--output') opt.out = args[++i];
        else if ((m = a.match(/^(?:-o=?|--output=)(.+)/))) opt.out = m[1];
        else if (a === '-A' || a === '--all-namespaces') opt.all = true;
        else if (a === '--list') opt.list = true;
        else if (!a.startsWith('-')) pos.push(a);
    }
    return { pos, ...opt };
}

function k8sForbidden(verb, resource, ns, all) {
    return err(`Error from server (Forbidden): ${resource} is forbidden: User "${state.user}" cannot ${verb} resource "${resource}" in API group "${resource === 'rolebindings' ? 'rbac.authorization.k8s.io' : ''}" ${all ? 'at the cluster scope' : `in the namespace "${ns}"`}`);
}

function secretYaml(name, ns, secret, json) {
    const data = Object.entries(secret.data());
    if (json) {
        return JSON.stringify({ apiVersion: 'v1', kind: 'Secret', metadata: { name, namespace: ns }, type: secret.type, data: Object.fromEntries(data.map(([k, v]) => [k, b64(v)])) }, null, 4).split('\n');
    }
    return ['apiVersion: v1', 'data:', ...data.map(([k, v]) => `  ${k}: ${b64(v)}`), 'kind: Secret', 'metadata:', `  name: ${name}`, `  namespace: ${ns}`, `type: ${secret.type}`];
}

function kubectlSecrets({ pos, ns, out, all }) {
    const name = pos[2];
    if (all ? !k8sAdmin() : !canReadSecrets(ns)) return k8sForbidden(name ? 'get' : 'list', 'secrets', ns, all);
    const namespaces = all ? Object.keys(K8S_SECRETS) : [ns];
    if (name) {
        const secret = K8S_SECRETS[ns]?.[name];
        if (!secret) return err(`Error from server (NotFound): secrets "${name}" not found`);
        if (out === 'yaml' || out === 'json') return secretYaml(name, ns, secret, out === 'json').map(esc);
        const path = out?.match(/^jsonpath=['"]?\{\.data\.(.+?)\}['"]?$/);
        if (path) {
            const value = secret.data()[path[1].replace(/\\\./g, '.')];
            return value == null ? [] : Object.assign([esc(b64(value))], { noNewline: true });
        }
    }
    const rows = namespaces.flatMap((n) => Object.entries(K8S_SECRETS[n] || {}).filter(([s]) => !name || s === name).map(([s, sec]) => [n, s, sec]));
    if (!rows.length) return [`No resources found in ${esc(ns)} namespace.`];
    return [
        `${all ? 'NAMESPACE       ' : ''}NAME                  TYPE                             DATA   AGE`,
        ...rows.map(([n, s, sec]) => `${all ? n.padEnd(16) : ''}${s.padEnd(22)}${sec.type.padEnd(33)}${String(Object.keys(sec.data()).length).padEnd(7)}${sec.age}`),
    ].map(esc);
}

function kubectlAuth({ pos, ns, list }) {
    const [, sub, verb, resource] = pos;
    if (sub === 'whoami') {
        return ['ATTRIBUTE   VALUE', `Username    ${esc(k8sAdmin() ? 'kubernetes-admin' : state.user)}`, `Groups      [${k8sAdmin() ? 'kubeadm:cluster-admins ' : ''}system:authenticated]`];
    }
    if (sub !== 'can-i') return err('error: unknown command. Try: kubectl auth can-i --list | kubectl auth whoami');
    if (list) {
        if (k8sAdmin()) return ['Resources   Non-Resource URLs   Resource Names   Verbs', '*.*         []                  []               [*]', '            [*]                 []               [*]'];
        return [
            'Resources                                       Non-Resource URLs   Resource Names   Verbs',
            'selfsubjectreviews.authentication.k8s.io        []                  []               [create]',
            'selfsubjectaccessreviews.authorization.k8s.io   []                  []               [create]',
            'selfsubjectrulesreviews.authorization.k8s.io    []                  []               [create]',
            ...(ns === 'security' ? [c('y', 'secrets                                         []                  []               [get list]')] : []),
            'pods                                            []                  []               [get list watch]',
            'namespaces                                      []                  []               [get list]',
            'services                                        []                  []               [get list]',
            '                                                [/healthz]          []               [get]',
            '                                                [/version]          []               [get]',
        ];
    }
    if (!verb || !resource) return err('error: you must specify two arguments: verb resource, or --list');
    const res = resource.replace(/\/.*/, '');
    const yes = k8sAdmin()
        || (/^secrets?$/.test(res) && ['get', 'list'].includes(verb) && ns === 'security')
        || (/^(pods?|namespaces?|services?|ns|svc)$/.test(res) && ['get', 'list', 'watch'].includes(verb));
    state.status = yes ? 0 : 1;
    return [yes ? 'yes' : 'no'];
}

function kubectlRoleBindings({ ns }) {
    if (!k8sAdmin() && ns !== 'security') return k8sForbidden('list', 'rolebindings', ns);
    const rows = {
        security: [['secret-readers', 'Role/secret-reader', '', 'system:authenticated'], ['wazuh-manager', 'Role/wazuh', '', 'security/wazuh']],
        platform: [['deployforge', 'Role/deployer', 'neox', '']],
    }[ns] || [];
    if (!rows.length) return [`No resources found in ${esc(ns)} namespace.`];
    return ['NAME             ROLE                 AGE   USERS   GROUPS                 SERVICEACCOUNTS',
        ...rows.map(([n, r, u, g]) => `${n.padEnd(17)}${r.padEnd(21)}42d   ${(u || '').padEnd(8)}${g.includes('/') ? ''.padEnd(23) + g : g}`)].map(esc);
}

const realKubectl = COMMANDS.kubectl.run;
COMMANDS.kubectl.run = (ctx) => {
    const opts = parseKubectl(ctx.args);
    const [verb, kind = ''] = opts.pos;
    if (verb === 'get' && /^(secrets?)$/.test(kind)) return kubectlSecrets(opts);
    if (verb === 'describe' && /^(secrets?)$/.test(kind) && opts.pos[2]) {
        if (!canReadSecrets(opts.ns)) return k8sForbidden('get', 'secrets', opts.ns);
        const secret = K8S_SECRETS[opts.ns]?.[opts.pos[2]];
        if (!secret) return err(`Error from server (NotFound): secrets "${opts.pos[2]}" not found`);
        return [`Name:         ${opts.pos[2]}`, `Namespace:    ${opts.ns}`, `Type:         ${secret.type}`, '', 'Data', '====',
            ...Object.entries(secret.data()).map(([k, v]) => `${k}:  ${v.length} bytes`)].map(esc);
    }
    if (verb === 'get' && /^(rolebindings?|rb)$/.test(kind)) return kubectlRoleBindings(opts);
    if (verb === 'auth') return kubectlAuth(opts);
    return realKubectl(ctx);
};

// ---------- Persistence: an intruder's cron job and implant ----------

const DFIR_FLAG = 'CAkOHxUGHUgAOh9LHBZeCxpWARtdOh1IGlRcJ18WAQwxBh0BHhFfBQ==';
FS.children.etc.children['cron.d'] = dir({
    '0hourly': file(`
SHELL=/bin/bash
PATH=/sbin:/bin:/usr/sbin:/usr/bin
01 * * * * root run-parts /etc/cron.hourly
`),
    'certbot-renew': file('0 3 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"\n'),
    '.sys-update': file(`
# system update check
*/5 * * * * root /dev/shm/.x/kworker -q >/dev/null 2>&1
`),
});

// Binary noise between the strings, none of it printable, so `strings` pulls out just the text.
const elf = (...strs) => '\x7fELF\x02\x01\x01' + '\0'.repeat(9) + '\x03\0>\0\x01\0\0\0\x90\x10' + strs.join('\0\x8b\xc5\xfc\0\x01') + '\0\0\x89\xe5\x90\xc3';
FS.children.dev.children.shm = dir({
    '.x': dir({
        kworker: Object.assign(file(elf(
            '/lib64/ld-linux-x86-64.so.2', 'libc.so.6', 'socket', 'connect', 'dup2', 'execve', 'prctl', 'sleep', 'GLIBC_2.34',
            'kworker/u8:2', '203.0.113.66', '4444', '/bin/sh', 'beacon every 300s', `key=${rot13(unveil(DFIR_FLAG))}`,
            'nobody ever checks rot13', 'GCC: (GNU) 15.2.1 20251022', '.shstrtab', '.text', '.rodata', '.data',
        )), { mode: '-rwxr-xr-x', mtime: new Date('2026-10-31T02:15:00') }),
    }),
});

for (const msg of [
    'Alert 5712 (level 10): sshd brute force trying to get access to the system. srcip=203.0.113.66',
    'Alert 5715 (level 3): sshd authentication success. user=backup srcip=203.0.113.66',
    'Alert 5402 (level 3): Successful sudo to ROOT executed. user=backup',
    'Alert 554 (level 5): File added to the system: /etc/cron.d/.sys-update',
    'Alert 510 (level 7): Host-based anomaly detection event (rootcheck): process hidden as a kernel thread (pid 2323)',
]) journal('wazuh-agent', msg);

// ---------- hidden quests ----------

// Inspector: a message for whoever opens DevTools.
console.log(
    '%c NeoxOS %c Opening DevTools on a security engineer\'s site? Respect.',
    'background:#c4746e;color:#111;font-weight:bold;padding:2px 6px;border-radius:3px', 'color:inherit',
);
console.log(`Hidden quest for the curious: ${unveil('CAkOHxUBXA4aVV8UHTpbCl06WycGUQwTXRccJwxWHAwxAx1JXQsLBQ==')}\nSubmit it in any terminal: ctf submit flag{...}`);

// Old School: the Konami code, anywhere on the desktop.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiAt = 0;
window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiAt = key === KONAMI[konamiAt] ? konamiAt + 1 : key === KONAMI[0] ? 1 : 0;
    if (konamiAt === KONAMI.length) {
        konamiAt = 0;
        if (!ctfSolve('konami')) notify('↑↑↓↓←→←→BA', 'Still works. Still 30 lives.');
    }
}, true);

// Chaos Monkey: root deleting the whole system (or killing init).
const realMeltdown = meltdown;
meltdown = (...args) => {
    ctfSolve('chaos');
    return realMeltdown(...args);
};

// Safecracker is awarded by `bruteforce` in games.js.

// ---------- ctf.neox: the scoreboard as a website in Chromium ----------

const CTF_CAT_COLOR = { recon: 'cyan', web: 'yellow', network: 'green', cloud: 'blue', forensics: 'magenta', privesc: 'red', misc: 'dim', crypto: 'yellow' };

function ctfSite() {
    const solved = ctfSolved();
    const score = ctfScore(solved);
    const main = CTF.filter((ch) => !ch.hidden);
    const card = (ch, i) => {
        const done = !!solved[ch.id];
        const seen = ctfHintsSeen[ch.id] || 0;
        return `<article class="ctfw-card${done ? ' done' : ''}" style="--cat: var(--${CTF_CAT_COLOR[ch.cat]})">
            <div class="ctfw-card-head"><span class="ctfw-cat">${esc(ch.cat)}</span><span class="ctfw-pts">${done ? '✔ ' : ''}${ch.pts} pts</span></div>
            <h3>${i + 1}. ${esc(ch.name)}</h3>
            <p>${esc(ch.brief).replace(/`([^`]+)`/g, (_, code) => c('exe', code))}</p>
            ${seen ? `<ol class="ctfw-hints">${ch.hints.slice(0, seen).map((h) => `<li>${h}</li>`).join('')}</ol>` : ''}
            ${done ? '<p class="ctfw-ok">Captured.</p>' : seen < ch.hints.length ? `<button class="ctfw-hint" data-hint="${ch.id}">${seen ? 'Another hint' : 'Show a hint'} (${seen}/${ch.hints.length})</button>` : ''}
        </article>`;
    };
    const quest = (ch) => (solved[ch.id]
        ? `<article class="ctfw-card done" style="--cat: var(--${CTF_CAT_COLOR[ch.cat]})"><div class="ctfw-card-head"><span class="ctfw-cat">${esc(ch.cat)}</span><span class="ctfw-pts">✔ ${ch.pts} pts</span></div><h3>${esc(ch.name)}</h3></article>`
        : `<article class="ctfw-card locked"><div class="ctfw-card-head"><span class="ctfw-cat">???</span><span class="ctfw-pts">${ch.pts} pts</span></div><p>${esc(ch.clue)}</p></article>`);
    const complete = score === CTF_TOTAL;
    const html = `<div class="ctfw">
        <header class="ctfw-head">
            <div><h1>⚑ NeoxCTF</h1><p>Six flags hidden on this box, each a real attack path in miniature. Plus quests nobody will tell you about.</p></div>
            <div class="ctfw-score"><b>${score}</b> / ${CTF_TOTAL} pts<span>rank: ${esc(ctfRank(score))}</span>
                <div class="ctfw-bar"><i style="width:${(score / CTF_TOTAL) * 100}%"></i></div></div>
        </header>
        <form class="ctfw-submit"><input placeholder="flag{...}" spellcheck="false" autocomplete="off" aria-label="Flag"><button>Submit flag</button><span class="ctfw-msg" role="status"></span></form>
        ${complete ? `<div class="ctfw-cert"><h2>Certificate of Pwnage</h2><p>Every flag and every hidden quest. Rank: legend.</p><p>Screenshot this and say hi: <a href="mailto:mnshchtri@gmail.com">mnshchtri@gmail.com</a></p></div>` : ''}
        <p class="ctfw-how">Most challenges are solved in a terminal (Alt+Enter); <span class="exe">ctf</span> there shows this same board.
            The web one can be done right here: try <a data-url="http://localhost/">http://localhost</a>, and <b>Ctrl+U</b> shows a page's source.</p>
        <div class="ctfw-grid">${main.map(card).join('')}</div>
        <h2 class="ctfw-sub">Hidden quests · ${CTF.filter((ch) => ch.hidden && solved[ch.id]).length}/${CTF.filter((ch) => ch.hidden).length} found</h2>
        <div class="ctfw-grid">${CTF.filter((ch) => ch.hidden).map(quest).join('')}</div>
        <p class="ctfw-foot">Progress is saved in this browser. <button class="ctfw-reset">Reset progress</button></p>
    </div>`;
    return {
        html,
        mount(root, { reload }) {
            const form = root.querySelector('.ctfw-submit');
            const msg = form.querySelector('.ctfw-msg');
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = form.querySelector('input');
                const { error, wrong, ch, fresh } = ctfCheck(input.value.trim());
                if (fresh) return reload();
                msg.className = `ctfw-msg ${ch ? 'dim' : 'bad'}`;
                msg.textContent = error || (wrong ? '✗ Not a flag on this box.' : `Already captured: ${ch.name}.`);
                input.select();
            });
            root.addEventListener('click', (e) => {
                const hint = e.target.closest('[data-hint]');
                if (hint) {
                    const ch = CTF.find((x) => x.id === hint.dataset.hint);
                    ctfHintsSeen[ch.id] = Math.min((ctfHintsSeen[ch.id] || 0) + 1, ch.hints.length);
                    reload();
                }
                if (e.target.closest('.ctfw-reset')) {
                    localStorage.removeItem('nsh_ctf');
                    refreshCtfBadge();
                    reload();
                }
            });
        },
    };
}

// What Ctrl+U shows on ctf.neox. Its comment points at the Inspector quest.
const CTF_SITE_SOURCE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>NeoxCTF</title>
  <link rel="stylesheet" href="/static/board.css">
</head>
<body>
  <!-- Scoreboard is rendered client-side. Nothing to steal here, I promise. -->
  <!-- ...but the console of the browser you're reading this in (the real one, F12) might be chattier. -->
  <div id="board"></div>
  <script src="/static/board.js" defer></script>
</body>
</html>
`;

// ---------- bar badge, launcher, commands ----------

barEl.querySelector('.bar-right').insertAdjacentHTML('afterbegin', `<button class="bar-ctf" data-cmd="ctf" title="NeoxCTF scoreboard">${ICON('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>')}<span></span></button>`);
refreshCtfBadge();

Object.assign(COMMANDS, {
    ctf: { group: 'Fun', usage: 'ctf [info N | hint N | submit FLAG | web | reset]', desc: 'NeoxCTF: the scoreboard for the flags hidden on this box', run: cmdCtf },
    submit: { group: 'Hidden', usage: 'submit flag{...}', desc: 'submit a CTF flag', run: ({ args }) => ctfSubmit(args.join(' ').trim()) },
    find: { group: 'Files', usage: 'find [PATH...] [-name PAT] [-type f|d] [-user U] [-maxdepth N]', desc: 'search for files in a directory hierarchy', run: cmdFind },
    file: { group: 'Files', usage: 'file FILE...', desc: 'determine file type', run: cmdFile },
    strings: { group: 'Files', usage: 'strings [-n N] [FILE]', desc: 'print the printable strings in a binary', run: cmdStrings },
    tr: { group: 'Files', usage: "tr [-d] SET1 [SET2]", desc: "translate or delete characters (echo hi | tr 'a-z' 'A-Z')", run: cmdTr },
    rev: { group: 'Files', usage: 'rev [FILE]', desc: 'reverse lines characterwise', run: cmdRev },
    crontab: { group: 'System', usage: 'crontab -l', desc: 'list scheduled jobs', run: cmdCrontab },
    nc: { group: 'Network', usage: 'nc [-vz] HOST PORT', desc: 'netcat: open a TCP connection and talk to whatever answers', run: cmdNc },
    ncat: { group: 'Hidden', usage: 'ncat HOST PORT', desc: 'netcat', run: cmdNc },
    knock: { group: 'Network', usage: 'knock HOST PORT...', desc: 'port-knock client', run: cmdKnock },
});
