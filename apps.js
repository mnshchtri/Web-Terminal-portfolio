'use strict';

// Full-screen programs: the less/man pager, htop/top, vim, nano, cmatrix and sl.
// Each one runs through runApp() in script.js, which hands it the window until it quits.

function lineHeight(el) {
    return parseFloat(getComputedStyle(el).lineHeight) || 20;
}

function charWidth(el) {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(20);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    el.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 20;
    probe.remove();
    return w || 9;
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 100);

// ---------- less ----------

function openPager(lines, label) {
    const texts = lines.map(toText);
    let body;
    let status;
    let mode = 'view';
    let query = '';
    let search = null;
    let msg = '';

    const topIndex = () => {
        const kids = body.children;
        for (let i = 0; i < kids.length; i++) if (kids[i].offsetTop + kids[i].offsetHeight > body.scrollTop + 1) return i;
        return kids.length - 1;
    };

    function renderLines() {
        body.innerHTML = lines.map((l, i) => {
            const hit = search && search.test.test(texts[i]);
            return `<div class="line">${hit ? highlight(texts[i], search.all) : l}</div>`;
        }).join('');
    }

    function renderStatus() {
        if (mode === 'search') {
            status.innerHTML = `/${esc(query)}<span class="cursor"> </span>`;
            return;
        }
        const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
        const text = msg || `${label} line ${topIndex() + 1}/${lines.length}${atEnd ? ' (END)' : ''} (press h for help or q to quit)`;
        status.innerHTML = c('inverse', esc(text));
        msg = '';
    }

    function find(dir) {
        if (!search) return;
        const from = topIndex();
        const order = dir > 0
            ? texts.map((_, i) => i).filter((i) => i > from)
            : texts.map((_, i) => i).filter((i) => i < from).reverse();
        const hit = order.find((i) => search.test.test(texts[i]));
        if (hit === undefined) msg = 'Pattern not found  (press RETURN)';
        else body.scrollTop = body.children[hit].offsetTop;
    }

    return runApp({
        className: 'app-pager',
        init(el) {
            el.innerHTML = '<div class="pager"></div><div class="status"></div>';
            body = el.querySelector('.pager');
            status = el.querySelector('.status');
            renderLines();
            body.addEventListener('scroll', () => mode === 'view' && renderStatus());
            renderStatus();
        },
        onKey(e, close) {
            if ((e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.key === 'c')) return;
            e.preventDefault();
            if (mode === 'search') {
                if (e.key === 'Enter') {
                    mode = 'view';
                    if (query) {
                        const src = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        search = { test: new RegExp(src, 'i'), all: new RegExp(src, 'gi') };
                        renderLines();
                        find(1);
                    }
                } else if (e.key === 'Escape' || (e.key === 'Backspace' && !query)) {
                    mode = 'view';
                } else if (e.key === 'Backspace') {
                    query = query.slice(0, -1);
                } else if (e.key.length === 1) {
                    query += e.key;
                }
                return renderStatus();
            }
            if (e.ctrlKey) return close();
            const lh = lineHeight(body);
            const page = body.clientHeight - lh;
            switch (e.key) {
                case 'q': case 'Q': return close();
                case 'j': case 'e': case 'ArrowDown': case 'Enter': body.scrollTop += lh; break;
                case 'k': case 'y': case 'ArrowUp': body.scrollTop -= lh; break;
                case ' ': case 'f': case 'PageDown': body.scrollTop += page; break;
                case 'b': case 'PageUp': body.scrollTop -= page; break;
                case 'd': body.scrollTop += page / 2; break;
                case 'u': body.scrollTop -= page / 2; break;
                case 'g': case '<': case 'Home': body.scrollTop = 0; break;
                case 'G': case '>': case 'End': body.scrollTop = body.scrollHeight; break;
                case 'n': find(1); break;
                case 'N': find(-1); break;
                case '/':
                    mode = 'search';
                    query = '';
                    break;
                case 'h': case 'H':
                    msg = 'j/k line  space/b page  g/G top/end  /pattern search  n/N next/prev  q quit';
                    break;
            }
            renderStatus();
        },
        onClick(e, close) {
            if (e.target.closest('.status')) close();
        },
    });
}

function cmdLess({ name, args, stdin, piped }) {
    const files = args.filter((a) => !a.startsWith('-'));
    let text;
    let label;
    if (files.length) {
        text = readFile(files[0], name);
        if (text == null) return;
        label = files[0];
    } else if (stdin != null) {
        text = stdin;
        label = '(stdin)';
    } else {
        return err(`Missing filename ("${name} --help" for help)`);
    }
    // Like the real thing, less behaves like cat when its output isn't a terminal.
    return piped ? renderText(text) : openPager(renderText(text), label);
}

// ---------- htop / top ----------

function fmtKiB(kib) {
    if (kib < 100000) return String(Math.round(kib));
    if (kib < 1024 * 1024) return `${Math.round(kib / 1024)}M`;
    return `${(kib / 1024 / 1024).toFixed(1)}G`;
}

function fmtCpuTime(sec) {
    const m = Math.floor(sec / 60);
    return `${m}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
}

function processRows(top) {
    const self = { pid: 1400 + (Date.now() % 97), user: state.user, cpu: 0.7, mem: 0.1, cmd: top ? 'top' : 'htop', time: 0.4 };
    return [...SYS.procs, self].sort((a, b) => b.cpu - a.cpu).map((p) => {
        const resKiB = (p.mem / 100) * SYS.memTotal * 1024 + 2048;
        return {
            ...p,
            cells: [
                String(p.pid).padStart(top ? 7 : 6),
                p.user.slice(0, 8).padEnd(9),
                '20'.padStart(3),
                '0'.padStart(3),
                fmtKiB(resKiB * 3.4).padStart(top ? 7 : 6),
                fmtKiB(resKiB).padStart(top ? 6 : 5),
                fmtKiB(resKiB * 0.3).padStart(top ? 6 : 5),
                p.cpu > 2 ? 'R' : 'S',
                p.cpu.toFixed(1).padStart(5),
                p.mem.toFixed(1).padStart(5),
                fmtCpuTime(p.time).padStart(9),
                p.cmd,
            ],
        };
    });
}

function meter(label, fraction, text, width) {
    const inner = Math.max(4, width - label.length - 2);
    const fill = Math.round(Math.min(1, fraction) * Math.max(0, inner - text.length));
    const bar = '|'.repeat(fill).padEnd(inner - text.length);
    return `${c('p', esc(label))}[${c('ok', bar)}${c('dim', esc(text))}]`;
}

function htopApp(top) {
    let pre;
    let timer;
    let selected = 0;

    function render() {
        const cols = Math.max(40, Math.floor(pre.clientWidth / charWidth(pre)));
        const rows = Math.max(10, Math.floor(pre.clientHeight / lineHeight(pre)));
        const procs = processRows(top);
        const out = [];
        const header = 'PID USER      PRI  NI  VIRT   RES   SHR S  CPU% MEM%   TIME+  Command';
        const used = SYS.memUsed();

        if (top) {
            const now = new Date().toTimeString().slice(0, 8);
            const us = SYS.cpuAvg();
            out.push(
                esc(`top - ${now} up ${fmtUptime()},  1 user,  load average: ${SYS.load().join(', ')}`),
                esc(`Tasks: ${String(procs.length + 70).padStart(3)} total,   1 running, ${procs.length + 69} sleeping,   0 stopped,   0 zombie`),
                esc(`%Cpu(s): ${us.toFixed(1).padStart(4)} us,  ${(us / 3).toFixed(1)} sy,  0.0 ni, ${(100 - us * 1.33).toFixed(1)} id,  0.1 wa,  0.0 hi,  0.1 si,  0.0 st`),
                esc(`MiB Mem :  ${SYS.memTotal.toFixed(1)} total,  ${(SYS.memTotal - used - 1400).toFixed(1)} free,  ${used.toFixed(1)} used,   1400.0 buff/cache`),
                esc(`MiB Swap:   8192.0 total,   8192.0 free,      0.0 used.  ${(SYS.memTotal - used).toFixed(1)} avail Mem`),
                '',
                c('hdr', esc(`    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND`.padEnd(cols))),
            );
        } else {
            const half = Math.floor(cols / 2) - 1;
            const shown = SYS.cpu.slice(0, 8);
            const perCol = Math.ceil(shown.length / 2);
            for (let i = 0; i < perCol; i++) {
                const left = meter(String(i).padStart(4), shown[i] / 100, `${shown[i].toFixed(1)}%`, half);
                const j = i + perCol;
                const right = j < shown.length ? ' ' + meter(String(j).padStart(4), shown[j] / 100, `${shown[j].toFixed(1)}%`, half) : '';
                out.push(left + right);
            }
            const memText = `${(used / 1024).toFixed(2)}G/${(SYS.memTotal / 1024).toFixed(1)}G`;
            const info = [
                `Tasks: ${procs.length + 70}, 312 thr; 1 running`,
                `Load average: ${SYS.load().join(' ')}`,
                `Uptime: ${new Date(Date.now() - BOOT_TIME).toISOString().slice(11, 19)}`,
            ];
            out.push(meter(' Mem', used / SYS.memTotal, memText, half) + '  ' + esc(info[0]));
            out.push(meter(' Swp', 0, '0K/8.00G', half) + '  ' + esc(info[1]));
            out.push(' '.repeat(half + 2) + esc(info[2]));
            out.push('');
            out.push(c('hdr', esc(('  ' + header).padEnd(cols))));
        }

        const room = rows - out.length - (top ? 0 : 1);
        selected = Math.min(selected, procs.length - 1);
        procs.slice(0, room).forEach((p, i) => {
            const cells = p.cells;
            const text = top
                ? `${cells[0]} ${cells[1]}${cells[2]} ${cells[3]} ${cells[4]} ${cells[5]} ${cells[6]} ${cells[7]} ${cells[8]} ${cells[9]} ${cells[10]} ${cells[11]}`
                : `${cells.slice(0, 11).join(' ')}  ${cells[11]}`;
            const line = esc(text.slice(0, cols).padEnd(top ? 0 : cols));
            out.push(!top && i === selected ? c('sel', line) : p.user === state.user ? c('y', line) : line);
        });

        if (!top) {
            while (out.length < rows - 1) out.push('');
            const keys = [['F1', 'Help'], ['F2', 'Setup'], ['F3', 'Search'], ['F4', 'Filter'], ['F5', 'Tree'],
                ['F6', 'SortBy'], ['F7', 'Nice -'], ['F8', 'Nice +'], ['F9', 'Kill'], ['F10', 'Quit']];
            out.push(keys.map(([k, l]) => `${esc(k)}${c('fkey', esc(l.padEnd(6)))}`).join(''));
        }
        pre.innerHTML = out.join('\n');
    }

    return {
        className: 'app-htop',
        init(el) {
            pre = document.createElement('pre');
            pre.className = 'htop';
            el.appendChild(pre);
            render();
            timer = setInterval(render, top ? 3000 : 1500);
        },
        onKey(e, close) {
            if (e.metaKey) return;
            e.preventDefault();
            if (e.key === 'q' || e.key === 'F10' || (e.ctrlKey && e.key === 'c')) return close();
            if (e.key === 'ArrowDown' || e.key === 'j') selected++;
            if (e.key === 'ArrowUp' || e.key === 'k') selected = Math.max(0, selected - 1);
            render();
        },
        onClick(e, close) {
            close();
        },
        cleanup() {
            clearInterval(timer);
        },
    };
}

// ---------- editors ----------

function editorTarget(args) {
    const path = args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
    if (!path) return { path: null, abs: null, text: '', exists: false, readonly: false };
    const abs = normalize(path);
    const node = getNode(abs);
    if (node?.type === 'dir') return { error: `"${path}" is a directory` };
    const denied = isForbidden(abs);
    return {
        path,
        abs,
        denied,
        exists: !!node,
        text: denied ? '' : node?.content ?? (node?.type === 'link' ? node.target + '\n' : ''),
        readonly: !canModify(abs),
    };
}

function saveBuffer(abs, text) {
    if (!canModify(abs) || getNode(parentOf(abs))?.type !== 'dir' || getNode(abs)?.type === 'dir') return false;
    writeFile(abs, text);
    return true;
}

const countLines = (text) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

const VIM_INTRO = `VIM - Vi IMproved

version 9.1.1000
by Bram Moolenaar et al.
Vim is open source and freely distributable

type  :q<Enter>               to exit
type  :help<Enter>  or  <F1>  for on-line help`;

function vimApp(f) {
    let ta;
    let left;
    let right;
    let intro;
    let mode = 'normal';
    let cmdline = '';
    let pending = '';
    let register = '';
    let message = '';
    let messageIsError = false;
    let dirty = false;
    let warned = false;
    let cur = 0;
    let { path, abs, readonly } = f;
    const undo = [];

    const v = () => ta.value;
    const lineStart = (p) => v().lastIndexOf('\n', p - 1) + 1;
    const lineEnd = (p) => {
        const i = v().indexOf('\n', p);
        return i < 0 ? v().length : i;
    };
    const cls = (ch) => (ch === undefined || /\s/.test(ch) ? 0 : /\w/.test(ch) ? 1 : 2);

    function say(text, isError) {
        message = text;
        messageIsError = !!isError;
    }

    function place(p, insert) {
        p = Math.max(0, Math.min(p, v().length));
        const end = lineEnd(p);
        if (!insert && p === end && p > lineStart(p)) p--;
        cur = p;
        ta.setSelectionRange(p, insert || p === lineEnd(p) ? p : p + 1);
        const lh = lineHeight(ta);
        const y = (v().slice(0, p).match(/\n/g) || []).length * lh;
        if (y < ta.scrollTop) ta.scrollTop = y;
        else if (y + lh > ta.scrollTop + ta.clientHeight - 8) ta.scrollTop = y + lh - ta.clientHeight + 8;
        renderStatus();
    }

    function snap() {
        undo.push({ value: v(), cur });
        if (undo.length > 200) undo.shift();
    }

    function changed() {
        dirty = true;
        intro?.remove();
        if (readonly && !warned) {
            warned = true;
            say('W10: Warning: Changing a readonly file', true);
        }
    }

    function edit(value, p, insert) {
        ta.value = value;
        changed();
        place(p, insert);
    }

    function enterInsert(p) {
        snap();
        mode = 'insert';
        intro?.remove();
        message = '';
        place(p, true);
    }

    function moveLine(d) {
        const col = cur - lineStart(cur);
        if (d > 0) {
            const end = lineEnd(cur);
            if (end >= v().length) return;
            place(Math.min(end + 1 + col, lineEnd(end + 1)));
        } else {
            const start = lineStart(cur);
            if (start === 0) return;
            const prev = lineStart(start - 1);
            place(Math.min(prev + col, lineEnd(prev)));
        }
    }

    function renderStatus() {
        if (mode === 'command') {
            left.innerHTML = `:${esc(cmdline)}<span class="cursor"> </span>`;
        } else if (message) {
            left.innerHTML = messageIsError ? c('verr', esc(message)) : esc(message);
        } else {
            left.innerHTML = mode === 'insert' ? c('hl', '-- INSERT --') : '';
        }
        const text = v();
        const line = (text.slice(0, cur).match(/\n/g) || []).length + 1;
        const col = cur - lineStart(cur) + 1;
        const fits = ta.scrollHeight <= ta.clientHeight + 2;
        const where = fits ? 'All' : ta.scrollTop < 2 ? 'Top' : ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 2 ? 'Bot' : `${pct(ta.scrollTop, ta.scrollHeight - ta.clientHeight)}%`;
        right.textContent = `${text.length ? `${line},${col}` : '0,0-1'}`.padEnd(14) + where;
    }

    function write(target, force) {
        const name = target || path;
        if (!name) return say('E32: No file name', true), false;
        const targetAbs = normalize(name);
        if (targetAbs === abs && readonly && !force) return say("E45: 'readonly' option is set (add ! to override)", true), false;
        const isNew = !getNode(targetAbs);
        // Like vim, end the file with a newline.
        if (!saveBuffer(targetAbs, v() && !v().endsWith('\n') ? v() + '\n' : v())) return say(`"${name}" E212: Can't open file for writing`, true), false;
        say(`"${name}" ${isNew ? '[New] ' : ''}${countLines(v())}L, ${v().length}B written`);
        if (!path || targetAbs === abs) {
            path = name;
            abs = targetAbs;
            readonly = false;
            dirty = false;
        }
        return true;
    }

    function runCommand(raw, close) {
        const cmd = raw.trim();
        if (!cmd) return;
        if (/^\d+$/.test(cmd)) {
            const lines = v().split('\n');
            const n = Math.min(+cmd, lines.length) - 1;
            return place(lines.slice(0, Math.max(0, n)).join('\n').length + (n > 0 ? 1 : 0));
        }
        const m = cmd.match(/^([a-z]+)(!?)\s*(.*)$/i);
        if (!m) return say(`E492: Not an editor command: ${cmd}`, true);
        const [, name, bang, arg] = m;
        const force = bang === '!';
        switch (name) {
            case 'w': case 'write':
                write(arg, force);
                break;
            case 'q': case 'quit': case 'qa': case 'qall':
                if (dirty && !force) return say('E37: No write since last change (add ! to override)', true);
                close();
                break;
            case 'wq': case 'wqa': case 'x': case 'xit': case 'exit':
                if ((name.startsWith('x') || name === 'exit') && !dirty) return close();
                if (write(arg, force)) close();
                break;
            case 'set': case 'syntax': case 'noh': case 'nohlsearch': case 'colorscheme':
                break;
            case 'help': case 'h':
                say("Sorry, this vim is tiny: i a o x dd yy p u hjkl w b gg G :w :q :wq :q!");
                break;
            default:
                say(`E492: Not an editor command: ${cmd}`, true);
        }
    }

    function normalKey(e, close) {
        const k = e.key;
        if (pending) {
            const combo = pending + k;
            pending = '';
            if (combo === 'dd') {
                snap();
                const s = lineStart(cur);
                const end = lineEnd(cur);
                register = v().slice(s, end) + '\n';
                const text = v().slice(0, s) + v().slice(Math.min(end + 1, v().length));
                edit(end + 1 > v().length && s > 0 ? text.slice(0, -1) : text, s);
            } else if (combo === 'yy') {
                register = v().slice(lineStart(cur), lineEnd(cur)) + '\n';
            } else if (combo === 'gg') {
                place(0);
            } else if (combo === 'ZZ') {
                runCommand('x', close);
            } else if (combo === 'ZQ') {
                runCommand('q!', close);
            }
            return;
        }
        switch (k) {
            case 'i': return enterInsert(cur);
            case 'a': return enterInsert(cur === lineEnd(cur) ? cur : cur + 1);
            case 'A': return enterInsert(lineEnd(cur));
            case 'I': {
                const s = lineStart(cur);
                return enterInsert(s + v().slice(s).match(/^[ \t]*/)[0].length);
            }
            case 'o': case 'O': {
                snap();
                const at = k === 'o' ? lineEnd(cur) : lineStart(cur);
                ta.value = v().slice(0, at) + '\n' + v().slice(at);
                changed();
                mode = 'insert';
                return place(k === 'o' ? at + 1 : at, true);
            }
            case 'x': case 'Delete':
                if (cur < lineEnd(cur)) {
                    snap();
                    edit(v().slice(0, cur) + v().slice(cur + 1), cur);
                }
                return;
            case 'p':
                if (register) {
                    snap();
                    const end = lineEnd(cur);
                    edit(v().slice(0, end) + '\n' + register.replace(/\n$/, '') + v().slice(end), end + 1);
                }
                return;
            case 'u':
                if (!undo.length) return say('Already at oldest change');
                ({ value: ta.value, cur } = undo.pop());
                dirty = true;
                return place(cur);
            case 'h': case 'ArrowLeft': case 'Backspace': return place(Math.max(lineStart(cur), cur - 1));
            case 'l': case 'ArrowRight': case ' ': return place(Math.min(cur + 1, Math.max(lineStart(cur), lineEnd(cur) - 1)));
            case 'j': case 'ArrowDown': case 'Enter': return moveLine(1);
            case 'k': case 'ArrowUp': return moveLine(-1);
            case '0': case 'Home': return place(lineStart(cur));
            case '$': case 'End': return place(lineEnd(cur));
            case 'G': return place(lineStart(v().length));
            case 'w': {
                const t = v();
                let p = cur;
                const start = cls(t[p]);
                while (p < t.length && start && cls(t[p]) === start) p++;
                while (p < t.length && !cls(t[p])) p++;
                return place(p);
            }
            case 'b': {
                const t = v();
                let p = cur - 1;
                while (p > 0 && !cls(t[p])) p--;
                const kind = cls(t[p]);
                while (p > 0 && cls(t[p - 1]) === kind) p--;
                return place(Math.max(0, p));
            }
            case 'g': case 'd': case 'y': case 'Z':
                pending = k;
                return;
            case ':':
                mode = 'command';
                cmdline = '';
                return renderStatus();
        }
    }

    return {
        className: 'app-editor app-vim',
        init(el) {
            el.innerHTML = `<textarea class="ed-area" wrap="off" spellcheck="false" autocapitalize="off"></textarea>
                <div class="ed-status"><span class="ed-left"></span><span class="ed-right"></span></div>`;
            ta = el.querySelector('textarea');
            left = el.querySelector('.ed-left');
            right = el.querySelector('.ed-right');
            ta.value = f.text;
            ta.addEventListener('beforeinput', (e) => mode !== 'insert' && e.preventDefault());
            ta.addEventListener('input', () => {
                changed();
                cur = ta.selectionStart;
                renderStatus();
            });
            ta.addEventListener('mouseup', () => mode === 'normal' && place(ta.selectionStart));
            ta.addEventListener('scroll', renderStatus);
            if (!path && !f.text) {
                intro = document.createElement('div');
                intro.className = 'vim-intro';
                intro.textContent = VIM_INTRO;
                el.appendChild(intro);
            } else if (path) {
                const flags = f.denied ? ' [Permission Denied]' : !f.exists ? ' [New]' : readonly ? ' [readonly]' : '';
                say(`"${path}"${flags}${f.exists && !f.denied ? ` ${countLines(f.text)}L, ${f.text.length}B` : ''}`);
            }
            ta.focus();
            place(0);
        },
        onKey(e, close) {
            if (e.metaKey) return;
            const ctrlC = e.ctrlKey && e.key === 'c';
            if (mode === 'insert') {
                if (e.key === 'Escape' || ctrlC || (e.ctrlKey && e.key === '[')) {
                    e.preventDefault();
                    mode = 'normal';
                    message = '';
                    place(Math.max(lineStart(ta.selectionStart), ta.selectionStart - 1));
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
                    changed();
                }
                return;
            }
            e.preventDefault();
            if (mode === 'command') {
                if (e.key === 'Enter') {
                    mode = 'normal';
                    message = '';
                    runCommand(cmdline, close);
                } else if (e.key === 'Escape' || ctrlC || (e.key === 'Backspace' && !cmdline)) {
                    mode = 'normal';
                } else if (e.key === 'Backspace') {
                    cmdline = cmdline.slice(0, -1);
                } else if (e.key.length === 1 && !e.ctrlKey) {
                    cmdline += e.key;
                }
                if (state.app) {
                    renderStatus();
                    if (mode === 'normal') place(cur);
                }
                return;
            }
            if (ctrlC) {
                say('Type  :qa!  and press <Enter> to abandon all changes and exit Vim');
                return renderStatus();
            }
            if (e.ctrlKey || e.altKey) return;
            message = '';
            normalKey(e, close);
            if (state.app) renderStatus();
        },
    };
}

function nanoApp(f) {
    let ta;
    let msgEl;
    let keysEl;
    let nameEl;
    let modEl;
    let dirty = false;
    let cutBuffer = '';
    let prompt = null;
    let { path, abs } = f;

    const KEYS = [['^G', 'Help'], ['^O', 'Write Out'], ['^F', 'Where Is'], ['^K', 'Cut'], ['^X', 'Exit'], ['^C', 'Location'], ['^U', 'Paste']];

    function renderKeys(keys = KEYS) {
        keysEl.innerHTML = keys.map(([k, l]) => `<span>${c('inverse', esc(k))} ${esc(l)}</span>`).join('');
    }

    function renderHead() {
        nameEl.textContent = path || 'New Buffer';
        modEl.textContent = dirty ? 'Modified' : '';
    }

    function say(text) {
        msgEl.innerHTML = text ? c('inverse', esc(`[ ${text} ]`)) : '';
    }

    function ask(label, value, onEnter) {
        msgEl.innerHTML = `<div class="nano-prompt"><span>${esc(label)}: </span><input spellcheck="false" autocapitalize="off"></div>`;
        const field = msgEl.querySelector('input');
        field.value = value;
        field.focus();
        prompt = { field, onEnter };
        renderKeys([['^C', 'Cancel'], ['Enter', 'Accept']]);
    }

    function endPrompt() {
        prompt = null;
        renderKeys();
        ta.focus();
    }

    function write(name) {
        const targetAbs = normalize(name);
        if (!saveBuffer(targetAbs, ta.value)) {
            say(`Error writing ${name}: Permission denied`);
            return false;
        }
        path = name;
        abs = targetAbs;
        dirty = false;
        renderHead();
        say(`Wrote ${countLines(ta.value)} line${countLines(ta.value) === 1 ? '' : 's'}`);
        return true;
    }

    function location() {
        const text = ta.value;
        const p = ta.selectionStart;
        const lines = text.split('\n');
        const line = text.slice(0, p).split('\n').length;
        const col = p - text.lastIndexOf('\n', p - 1);
        const lineLen = lines[line - 1].length + 1;
        say(`line ${line}/${lines.length} (${pct(line, lines.length)}%), col ${col}/${lineLen} (${pct(col, lineLen)}%), char ${p}/${text.length} (${pct(p, text.length)}%)`);
    }

    function exit(close) {
        if (!dirty) return close();
        msgEl.innerHTML = c('inverse', 'Save modified buffer?') + ' ';
        renderKeys([['Y', 'Yes'], ['N', 'No'], ['^C', 'Cancel']]);
        prompt = {
            yesNo: true,
            onAnswer(yes) {
                endPrompt();
                if (!yes) return close();
                ask('File Name to Write', path || '', (name) => name && write(name) && close());
            },
        };
    }

    return {
        className: 'app-editor app-nano',
        init(el) {
            el.innerHTML = `<div class="nano-head"><span>  GNU nano 8.6</span><span class="nano-name"></span><span class="nano-mod"></span></div>
                <textarea class="ed-area" wrap="off" spellcheck="false" autocapitalize="off"></textarea>
                <div class="nano-msg"></div><div class="nano-keys"></div>`;
            ta = el.querySelector('textarea');
            msgEl = el.querySelector('.nano-msg');
            keysEl = el.querySelector('.nano-keys');
            nameEl = el.querySelector('.nano-name');
            modEl = el.querySelector('.nano-mod');
            ta.value = f.text;
            ta.addEventListener('input', () => {
                if (!dirty) {
                    dirty = true;
                    renderHead();
                }
            });
            renderHead();
            renderKeys();
            if (f.denied) say(`Error reading ${path}: Permission denied`);
            else if (path && f.exists && f.readonly) say(`File '${path}' is unwritable`);
            else if (path && !f.exists) say('New File');
            else if (path) say(`Read ${countLines(f.text)} line${countLines(f.text) === 1 ? '' : 's'}`);
            ta.focus();
            ta.setSelectionRange(0, 0);
        },
        onKey(e, close) {
            const ctrl = e.ctrlKey && !e.metaKey;
            const key = e.key.toLowerCase();
            if (prompt?.yesNo) {
                e.preventDefault();
                if (key === 'y') prompt.onAnswer(true);
                else if (key === 'n') prompt.onAnswer(false);
                else if (ctrl && key === 'c') {
                    endPrompt();
                    say('Cancelled');
                }
                return;
            }
            if (prompt) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const { field, onEnter } = prompt;
                    endPrompt();
                    say('');
                    onEnter(field.value);
                } else if ((ctrl && key === 'c') || e.key === 'Escape') {
                    e.preventDefault();
                    endPrompt();
                    say('Cancelled');
                }
                return;
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end');
                ta.dispatchEvent(new Event('input'));
                return;
            }
            if (!ctrl) return;
            const text = ta.value;
            const p = ta.selectionStart;
            const s = text.lastIndexOf('\n', p - 1) + 1;
            const end = text.indexOf('\n', p) < 0 ? text.length : text.indexOf('\n', p);
            switch (key) {
                case 'o':
                    e.preventDefault();
                    return ask('File Name to Write', path || '', (name) => name && write(name));
                case 'x':
                    e.preventDefault();
                    return exit(close);
                case 'k':
                    e.preventDefault();
                    cutBuffer = text.slice(s, end + 1);
                    ta.value = text.slice(0, s) + text.slice(end + 1);
                    ta.setSelectionRange(s, s);
                    return ta.dispatchEvent(new Event('input'));
                case 'u':
                    e.preventDefault();
                    if (!cutBuffer) return;
                    ta.value = text.slice(0, s) + cutBuffer + text.slice(s);
                    ta.setSelectionRange(s + cutBuffer.length, s + cutBuffer.length);
                    return ta.dispatchEvent(new Event('input'));
                case 'c':
                    e.preventDefault();
                    return location();
                case 'g':
                    e.preventDefault();
                    return say('^O save, ^X exit, ^K/^U cut & paste a line, ^F search, ^C cursor position');
                case 'f':
                    e.preventDefault();
                    return ask('Search', '', (q) => {
                        const i = q ? text.indexOf(q, p + 1) : -1;
                        const hit = i >= 0 ? i : text.indexOf(q);
                        if (!q) return;
                        if (hit < 0) return say(`"${q}" not found`);
                        ta.setSelectionRange(hit, hit);
                        ta.blur();
                        ta.focus();
                    });
            }
        },
    };
}

function cmdEditor({ name, args }) {
    const f = editorTarget(args);
    if (f.error) return err(`${name}: ${f.error}`);
    return runApp(name === 'nano' ? nanoApp(f) : vimApp(f));
}

// ---------- cmatrix & sl ----------

function cmdCmatrix() {
    let timer;
    return runApp({
        className: 'app-matrix',
        init(el) {
            const canvas = document.createElement('canvas');
            el.appendChild(canvas);
            canvas.width = el.clientWidth;
            canvas.height = el.clientHeight;
            const ctx = canvas.getContext('2d');
            const size = 16;
            const drops = Array.from({ length: Math.ceil(canvas.width / size) }, () => Math.floor(Math.random() * -40));
            const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
            const green = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#0f0';
            ctx.font = `${size}px monospace`;
            timer = setInterval(() => {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                drops.forEach((y, i) => {
                    const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
                    ctx.fillStyle = Math.random() < 0.08 ? '#e8ffe8' : green;
                    ctx.fillText(ch, i * size, y * size);
                    drops[i] = y * size > canvas.height && Math.random() > 0.97 ? 0 : y + 1;
                });
            }, 50);
        },
        onKey(e, close) {
            if (e.metaKey) return;
            e.preventDefault();
            close();
        },
        onClick(e, close) {
            close();
        },
        cleanup() {
            clearInterval(timer);
        },
    });
}

const TRAIN = String.raw`
                        (  ) (@@) ( )  (@)  ()    @@    O     @     O     @
                   (@@@)
               (    )
            (@@@@)
          (   )
      ====        ________                ___________
  _D _|  |_______/        \__I_I_____===__|_________|
   |(_)---  |   H\________/ |   |        =|___ ___|      _________________
   /     |  |   H  |  |     |   |         ||_| |_||     _|                \_____A
  |      |  |   H  |__--------------------| [___] |   =|                        |
  | ________|___H__/__|_____/[][]~\_______|       |   -|                        |
  |/ |   |-----------I_____I [][] []  D   |=======|____|________________________|_
__/ =| o |=-~~\  /~~\  /~~\  /~~\ ____Y___________|__|__________________________|_
 |/-=|___|=    ||    ||    ||    |_____/~\___/          |_D__D__D_|  |_D__D__D_|
  \_/      \O=====O=====O=====O_/      \_/               \_/   \_/    \_/   \_/`.slice(1).split('\n');

// sl ignores Ctrl+C on purpose. That's the joke.
function cmdSl() {
    let timer;
    return runApp({
        className: 'app-sl',
        init(el, close) {
            const pre = document.createElement('pre');
            el.appendChild(pre);
            const cols = Math.floor(el.clientWidth / charWidth(pre));
            const width = Math.max(...TRAIN.map((l) => l.length));
            let x = cols;
            timer = setInterval(() => {
                pre.textContent = TRAIN.map((l) => (x >= 0 ? ' '.repeat(x) + l : l.slice(-x)).slice(0, cols)).join('\n');
                if (--x < -width) close();
            }, 35);
        },
        onKey(e) {
            e.preventDefault();
        },
        cleanup() {
            clearInterval(timer);
        },
    });
}

Object.assign(COMMANDS, {
    less: { group: 'Apps', usage: 'less FILE', desc: 'view a file one screen at a time (q quits, / searches)', run: cmdLess },
    more: { group: 'Hidden', usage: 'more FILE', desc: 'file perusal filter', run: cmdLess },
    vim: { group: 'Apps', usage: 'vim [FILE]', desc: 'Vi IMproved — i to insert, Esc, :wq to save and quit', run: cmdEditor },
    vi: { group: 'Hidden', usage: 'vi [FILE]', desc: 'screen-oriented text editor', run: cmdEditor },
    nvim: { group: 'Hidden', usage: 'nvim [FILE]', desc: 'Neovim (well, vim)', run: cmdEditor },
    nano: { group: 'Apps', usage: 'nano [FILE]', desc: 'Nano\'s ANOther text editor — ^O saves, ^X exits', run: cmdEditor },
    htop: { group: 'Apps', usage: 'htop', desc: 'interactive process viewer (q quits)', run: () => runApp(htopApp(false)) },
    top: { group: 'Apps', usage: 'top', desc: 'display Linux processes (q quits)', run: () => runApp(htopApp(true)) },
    cmatrix: { group: 'Fun', usage: 'cmatrix', desc: 'shows a scrolling Matrix-like screen (any key quits)', run: cmdCmatrix },
    sl: { group: 'Fun', usage: 'sl', desc: 'cure your bad habit of mistyping ls', run: cmdSl },
});
