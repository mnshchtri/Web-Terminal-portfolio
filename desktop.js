'use strict';

// The desktop, modelled on neox's Omarchy setup: a Hyprland-style tiling window manager with
// workspace lanes, the Omarchy top bar, a Walker-style launcher, mako-style notifications
// and the InfraEye screensaver after 150 s idle.

const ttyEl = document.getElementById('tty');
const barEl = document.getElementById('bar');
const desktopEl = document.getElementById('desktop');
const launcherEl = document.getElementById('launcher');
const notifyEl = document.getElementById('notifications');
const saverEl = document.getElementById('screensaver');

// Workspace lanes from neox's hyprland.lua.
const KANJI_NUM = ' 一二三四五六七八九';
const LANES = ['Development', 'Development', 'Development', 'DevSecOps', 'DevSecOps', 'DevSecOps',
    'Security research', 'Security research', 'Security research'];
const GAPS_OUT = 10;
const GAPS_IN = 5;
const IDLE_MS = 150000; // screensaver timeout from neox's shell.json

const wm = { windows: [], active: 1, focused: null, nextId: 1, lastFocused: {}, deferred: [] };

const isMobile = () => matchMedia('(max-width: 700px)').matches;
// A command waiting at a prompt (claude, sudo, read) can't resume until its window has focus again,
// so it doesn't hold the desktop; one that is actually running does.
const shellBusy = (win) => !!win?.shell?.session.busy && !win.shell.session.pending;
const focusedBusy = () => shellBusy(wm.focused);

// ---------- window manager ----------

function windowTitle(win) {
    if (win.app) return win.app.title();
    const s = win.shell.session;
    const home = USERS[s.user].home;
    const cwd = s.cwd === home ? '~' : s.cwd.startsWith(home + '/') ? '~' + s.cwd.slice(home.length) : s.cwd;
    return `${s.user}@${HOST}:${cwd}`;
}

function flashBusy() {
    const win = wm.focused;
    if (!win) return;
    win.el.classList.add('busy-flash');
    setTimeout(() => win.el.classList.remove('busy-flash'), 600);
    notify('Terminal busy', 'Finish the running command first: Ctrl+C, or q in full-screen apps.');
}

// Inserts a window next to the focused one. Opening from inside a running command (ghostty,
// chromium, hyprctl dispatch) defers focus until that command finishes.
function addWindow(win, activate, fromCommand) {
    win.el.addEventListener('mousedown', () => focusWindow(win), true);
    const at = wm.focused?.ws === wm.active ? wm.windows.indexOf(wm.focused) + 1 : wm.windows.length;
    wm.windows.splice(at, 0, win);
    requestAnimationFrame(() => requestAnimationFrame(() => win.el.classList.remove('opening')));
    if (fromCommand && focusedBusy()) wm.deferred.push(activate);
    else activate();
    layout();
    return win;
}

function newWindowEl(extra = '') {
    const el = document.createElement('div');
    el.className = `win opening ${extra}`;
    desktopEl.appendChild(el);
    return el;
}

function openTerminal({ run, fromCommand } = {}) {
    if (!fromCommand && focusedBusy()) return flashBusy();
    const el = newWindowEl();
    const win = { id: wm.nextId++, ws: wm.active, el, shell: createShell(el), full: false };
    return addWindow(win, () => {
        focusWindow(win);
        if (run) runIn(win, run);
    }, fromCommand);
}

// Graphical apps (gui.js) draw their own UI into the window and run as the guest user.
// app: { cls, title(), mount(el, win), focus?(), cleanup?() }
function openApp(app, { fromCommand } = {}) {
    if (!fromCommand && focusedBusy()) return flashBusy();
    const el = newWindowEl(`gui ${app.cls}`);
    const win = { id: wm.nextId++, ws: wm.active, el, app, full: false };
    app.mount(el, win);
    return addWindow(win, () => focusWindow(win), fromCommand);
}

function refreshTitle(win) {
    if (wm.focused === win) document.title = windowTitle(win);
}

function focusWindow(win) {
    if (wm.focused === win) return true;
    if (focusedBusy()) {
        flashBusy();
        return false;
    }
    wm.focused?.el.classList.remove('focused');
    wm.focused = win;
    if (!win) {
        bindShell(null);
        document.title = `${HOST} — workspace ${wm.active}`;
        return true;
    }
    wm.active = win.ws;
    wm.lastFocused[win.ws] = win;
    win.el.classList.add('focused');
    if (win.app) {
        bindShell(null);
        document.title = windowTitle(win);
        win.app.focus?.();
    } else {
        bindShell(win.shell);
        if (!state.busy) {
            updatePrompt();
            setBusy(false);
        } else if (state.pending) input.focus();
        setTitle(state.running);
    }
    layout();
    return true;
}

function runIn(win, cmd) {
    if (wm.focused !== win || !win.shell || state.busy || state.app) return;
    input.value = cmd;
    submit();
}

function closeWindow(win) {
    if (win.shell?.session.busy) return flashBusy();
    win.app?.cleanup?.();
    const siblings = wm.windows.filter((w) => w.ws === win.ws);
    const pos = siblings.indexOf(win);
    wm.windows.splice(wm.windows.indexOf(win), 1);
    win.el.classList.add('closing');
    setTimeout(() => win.el.remove(), 180);
    if (wm.focused === win) {
        wm.focused = null;
        bindShell(null);
        const rest = siblings.filter((w) => w !== win);
        focusWindow(rest[Math.max(0, pos - 1)] || null);
    }
    layout();
}

function switchWorkspace(n) {
    if (n === wm.active) return;
    if (focusedBusy()) return flashBusy();
    wm.active = n;
    const onWs = wm.windows.filter((w) => w.ws === n);
    const remembered = wm.lastFocused[n];
    focusWindow(onWs.includes(remembered) ? remembered : onWs[0] || null);
    layout();
}

function moveToWorkspace(n) {
    const win = wm.focused;
    if (!win || win.ws === n) return;
    win.ws = n;
    win.full = false;
    wm.active = n;
    wm.lastFocused[n] = win;
    layout();
}

function moveFocus(dir) {
    const cur = wm.focused;
    if (!cur?.rect || cur.full) return;
    const cx = cur.rect.x + cur.rect.w / 2;
    const cy = cur.rect.y + cur.rect.h / 2;
    const best = wm.windows
        .filter((w) => w !== cur && w.ws === wm.active && w.rect)
        .map((w) => ({ w, dx: w.rect.x + w.rect.w / 2 - cx, dy: w.rect.y + w.rect.h / 2 - cy }))
        .filter(({ dx, dy }) => ({ left: dx < -1, right: dx > 1, up: dy < -1, down: dy > 1 }[dir]))
        .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)))[0];
    if (best) focusWindow(best.w);
}

// Like Omarchy: 'full' (Super+F) covers the whole screen, bar included, and takes the browser
// fullscreen too; 'max' (Super+Alt+F, "full width") fills the desktop but keeps the bar.
function toggleFullscreen(mode = 'full') {
    if (!wm.focused) return;
    wm.focused.full = wm.focused.full === mode ? false : mode;
    layout();
}

// Browser fullscreen follows whether the active workspace shows a 'full' window. Browsers only allow
// it during a user gesture, and Chromium (Chrome, Brave, Edge) doesn't count browser shortcuts like
// ⌘F on macOS as one. When the request is refused, the next click or key press finishes the job.
let fullscreenRetry = false;

function syncBrowserFullscreen(wanted) {
    if (!wanted) fullscreenRetry = false;
    if (wanted && !document.fullscreenElement && !fullscreenRetry) {
        document.documentElement.requestFullscreen?.()?.catch(() => {
            fullscreenRetry = true;
            notify('Click or press any key to hide the browser tabs',
                /Mac/.test(navigator.platform) ? '⌘F is a browser shortcut, so it can’t do that alone. Option+F works in one step.' : 'The browser needs one more click or key press.', 6000);
        });
    } else if (!wanted && document.fullscreenElement) {
        document.exitFullscreen?.()?.catch(() => {});
    }
}

const wantsFullscreen = () => wm.windows.some((w) => w.ws === wm.active && w.full === 'full');

for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, (e) => {
        if (!fullscreenRetry || document.fullscreenElement) return;
        // Modifier keys and ⌘ shortcuts don't count as gestures either.
        if (type === 'keydown' && (e.metaKey || ['Meta', 'Control', 'Alt', 'Shift', 'Escape'].includes(e.key))) return;
        fullscreenRetry = false;
        if (wantsFullscreen()) document.documentElement.requestFullscreen?.()?.catch(() => {});
    }, true);
}

// Leaving browser fullscreen with Esc or F11 drops the window back into the tiling layout.
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    const win = wm.windows.find((w) => w.ws === wm.active && w.full === 'full');
    if (!win) return;
    win.full = false;
    layout();
})

function place(win, r) {
    win.rect = r;
    Object.assign(win.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}

// Hyprland's dwindle layout: each window takes half of the space left, alternating split direction.
function dwindle(wins, r, gap) {
    if (!wins.length) return;
    if (wins.length === 1) return place(wins[0], r);
    const [first, ...rest] = wins;
    if (r.w >= r.h) {
        const w = (r.w - gap) / 2;
        place(first, { ...r, w });
        dwindle(rest, { x: r.x + w + gap, y: r.y, w: r.w - w - gap, h: r.h }, gap);
    } else {
        const h = (r.h - gap) / 2;
        place(first, { ...r, h });
        dwindle(rest, { x: r.x, y: r.y + h + gap, w: r.w, h: r.h - h - gap }, gap);
    }
}

function layout() {
    const W = desktopEl.clientWidth;
    const H = desktopEl.clientHeight;
    const mobile = isMobile();
    const out = mobile ? 0 : GAPS_OUT;
    const visible = wm.windows.filter((w) => w.ws === wm.active);
    // Phones get a monocle layout: only the focused window is shown.
    const solo = visible.find((w) => w.full) || (mobile && visible.length ? (visible.includes(wm.focused) ? wm.focused : visible[0]) : null);
    const covering = solo?.full === 'full';
    for (const w of wm.windows) {
        w.el.classList.toggle('off', w.ws !== wm.active || (!!solo && w !== solo));
        w.el.classList.toggle('fs', w === solo && covering);
    }
    // True fullscreen hides the bar, so the desktop is measured again after toggling it.
    // Exactly one fullscreen request per change: a second one would be refused.
    if (document.body.classList.contains('fs-mode') !== covering) {
        document.body.classList.toggle('fs-mode', covering);
        syncBrowserFullscreen(covering);
        return layout();
    }
    if (solo) place(solo, { x: 0, y: 0, w: W, h: H });
    else dwindle(visible, { x: out, y: out, w: W - 2 * out, h: H - 2 * out }, mobile ? 0 : GAPS_IN * 2);
    desktopEl.classList.toggle('empty', !visible.length);
    renderWorkspaces();
    // Keep each terminal pinned to its newest output once the resize animation settles.
    setTimeout(() => visible.forEach((w) => { if (w.shell) w.shell.terminal.scrollTop = w.shell.terminal.scrollHeight; }), 220);
}

window.addEventListener('resize', layout);
// Themes can change the bar's height (yozakura floats it), which resizes the desktop without a window resize.
new ResizeObserver(() => layout()).observe(desktopEl);

// Called by script.js after every command line.
function afterCommand(session) {
    if (session.exited) {
        const win = wm.windows.find((w) => w.shell?.session === session);
        // A shell embedded in an app (VS Code's terminal panel) closes just the panel.
        if (win?.app?.shellExited) win.app.shellExited();
        else if (win) closeWindow(win);
    }
    // Shells inside apps shouldn't leave their prompt as the app's window title.
    const host = wm.windows.find((w) => w.app && w.shell?.session === session);
    if (host) refreshTitle(host);
    wm.deferred.splice(0).forEach((job) => job());
}

// shutdown and kernel panics drop back to a full-screen tty.
function enterTty() {
    barEl.hidden = true;
    desktopEl.hidden = true;
    launcherEl.hidden = true;
    ttyEl.hidden = false;
    bindShell(createShell(ttyEl));
}

// ---------- notifications ----------

function notify(title, body = '', ms = 6000) {
    // The same message again replaces the one on screen instead of stacking.
    for (const old of notifyEl.querySelectorAll('.toast')) {
        if (old.dataset.key === title + body) old.remove();
    }
    const toast = document.createElement('div');
    toast.dataset.key = title + body;
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-title">${esc(title)}</div>${body ? `<div class="toast-body">${esc(body)}</div>` : ''}`;
    const dismiss = () => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    };
    toast.addEventListener('click', dismiss);
    notifyEl.appendChild(toast);
    setTimeout(dismiss, ms);
}

// ---------- top bar ----------

const ICON = (paths) => `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true">${paths}</svg>`;
const ICONS = {
    palette: ICON('<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="16" cy="8.5" r="1.2"/><path d="M13 21c-1.5-2 0-4 2-4h3"/>'),
    bluetooth: ICON('<path d="m7 7 10 10-5 5V2l5 5L7 17"/>'),
    wifi: ICON('<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.5 16.3a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>'),
    volume: ICON('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>'),
    muted: ICON('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
    battery: (level, charging) => ICON(`<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><rect x="4" y="9" width="${Math.max(1, 13 * level)}" height="6" fill="currentColor" stroke="none"/>${charging ? '<path d="m11 8-2 4h3l-2 4" stroke="var(--bg)"/>' : ''}`),
};

// neox's Omarchy logo, traced from ~/.config/omarchy/branding/about.txt.
const OMARCHY_SVG = '<svg viewBox="0 0 54 13" preserveAspectRatio="none" class="logo-svg logo-omarchy" aria-hidden="true"><path fill="currentColor" d="M0 0h54v1h-54zM0 1h4v1h-4zM25 1h4v1h-4zM50 1h4v1h-4zM0 2h4v1h-4zM8 2h21v1h-21zM38 2h8v1h-8zM50 2h4v1h-4zM0 3h4v1h-4zM8 3h4v1h-4zM42 3h4v1h-4zM50 3h4v1h-4zM0 4h4v1h-4zM8 4h4v1h-4zM42 4h4v1h-4zM50 4h4v1h-4zM0 5h4v1h-4zM8 5h4v1h-4zM42 5h4v1h-4zM50 5h4v1h-4zM0 6h12v1h-12zM42 6h4v1h-4zM50 6h4v1h-4zM0 7h4v1h-4zM8 7h4v1h-4zM42 7h4v1h-4zM50 7h4v1h-4zM0 8h4v1h-4zM8 8h4v1h-4zM42 8h4v1h-4zM50 8h4v1h-4zM0 9h4v1h-4zM8 9h4v1h-4zM42 9h4v1h-4zM50 9h4v1h-4zM0 10h4v1h-4zM8 10h38v1h-38zM50 10h4v1h-4zM0 11h4v1h-4zM25 11h4v1h-4zM50 11h4v1h-4zM0 12h29v1h-29zM34 12h20v1h-20z"/></svg>';
// The yozakura theme swaps it for a torii (CSS picks which one shows).
const TORII_SVG = '<svg viewBox="0 0 24 24" class="logo-svg logo-torii" aria-hidden="true"><path fill="currentColor" d="M1 4.2Q12 6.8 23 4.2l-.5 2.6Q12 8.8 1.5 6.8zM3 10h18v2H3zM5 7.6h2.3V22H5zm11.7 0H19V22h-2.3zM10.9 8h2.2v2h-2.2z"/></svg>';
const LOGO_SVG = OMARCHY_SVG + TORII_SVG;

barEl.innerHTML = `
    <div class="bar-left">
        <button class="bar-logo" title="Launcher (Alt+Space)">${LOGO_SVG}</button>
        <div class="workspaces"></div>
    </div>
    <div class="bar-center">
        <button class="bar-clock" title="Click to switch format"></button>
        <span class="bar-jday" aria-hidden="true"></span>
        <span class="bar-wclock" data-label="TYO" data-offset="540"></span>
        <span class="bar-kb">en</span>
        <span class="bar-wclock" data-label="KTM" data-offset="345"></span>
        <button class="bar-weather" data-cmd="weather" title="Weather in Kathmandu" hidden></button>
        <span class="bar-cava" aria-hidden="true"></span>
    </div>
    <div class="bar-right">
        <button data-cmd="theme next" title="Next theme">${ICONS.palette}</button>
        <button data-cmd="systemctl status bluetooth" title="Bluetooth">${ICONS.bluetooth}</button>
        <button data-cmd="ip a" title="Network">${ICONS.wifi}</button>
        <button class="bar-audio" title="Volume">${ICONS.volume}</button>
        <span class="bar-power"></span>
    </div>`;

const $bar = (sel) => barEl.querySelector(sel);
let clockAlt = false;
let battery = null;
navigator.getBattery?.().then((b) => { battery = b; }).catch(() => {});

function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

function renderWorkspaces() {
    const used = new Set(wm.windows.map((w) => w.ws));
    const shown = [1, 2, 3, 4, 5, ...[6, 7, 8, 9].filter((n) => used.has(n) || n === wm.active)];
    $bar('.workspaces').innerHTML = shown.map((n) => {
        const cls = n === wm.active ? 'active' : used.has(n) ? 'used' : '';
        return `<button class="ws ${cls}" data-ws="${n}" title="Workspace ${n} — ${LANES[n - 1]} (Alt+${n})"><span class="ws-n">${n}</span><span class="ws-k">${KANJI_NUM[n]}</span></button>`;
    }).join('');
}

function updateBar() {
    const now = new Date();
    $bar('.bar-clock').textContent = clockAlt
        ? `${now.getDate()} ${now.toLocaleString('en-US', { month: 'long' })} W${isoWeek(now)} ${now.getFullYear()}`
        : `${now.toLocaleString('en-US', { weekday: 'long' })} ${now.toTimeString().slice(0, 5)}`;
    $bar('.bar-jday').textContent = `${'日月火水木金土'[now.getDay()]}曜日`;
    barEl.querySelectorAll('.bar-wclock').forEach((el) => {
        const t = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + el.dataset.offset * 60000);
        el.textContent = `${el.dataset.label} ${t.toTimeString().slice(0, 5)}`;
    });
    $bar('.bar-power').innerHTML = battery
        ? `${ICONS.battery(battery.level, battery.charging)} ${Math.round(battery.level * 100)}%`
        : '';
}
setInterval(updateBar, 1000);
updateBar();

// A tiny cava: animated audio bars, like the visualiser on neox's bar.
const cava = Array(8).fill(0.2);
setInterval(() => {
    for (let i = 0; i < cava.length; i++) cava[i] = Math.min(1, Math.max(0, cava[i] * 0.55 + Math.random() * 0.5));
    $bar('.bar-cava').textContent = cava.map((v) => '▁▂▃▄▅▆▇█'[Math.round(v * 7)]).join('');
}, 140);

// Live weather for Kathmandu from wttr.in, refreshed every 30 minutes.
async function updateWeather() {
    try {
        const res = await fetch('https://wttr.in/Kathmandu?format=%c%t');
        const text = (await res.text()).trim().replace(/\s+/g, ' ');
        if (res.ok && text.length < 20) {
            $bar('.bar-weather').textContent = text;
            $bar('.bar-weather').hidden = false;
        }
    } catch {
        // Offline or blocked; the module just stays hidden.
    }
}
updateWeather();
setInterval(updateWeather, 30 * 60 * 1000);

// Bar modules type their command into the focused terminal (or open one), so the bar doubles as a guide.
function runInTerminal(cmd) {
    if (shared.booting) return;
    if (focusedBusy()) return flashBusy();
    // Bar commands type into the focused terminal; with a GUI app focused they get a fresh one.
    if (wm.focused?.shell && !wm.focused.app && wm.focused.ws === wm.active) runIn(wm.focused, cmd);
    else openTerminal({ run: cmd });
}

barEl.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    if (target.dataset.ws) return switchWorkspace(+target.dataset.ws);
    if (target.dataset.cmd) return runInTerminal(target.dataset.cmd);
    if (target.classList.contains('bar-logo')) return openLauncher();
    if (target.classList.contains('bar-clock')) {
        clockAlt = !clockAlt;
        return updateBar();
    }
    if (target.classList.contains('bar-audio')) {
        const muted = target.classList.toggle('muted');
        target.innerHTML = muted ? ICONS.muted : ICONS.volume;
    }
});

// ---------- launcher ----------

const LAUNCH_ICONS = [
    [/^terminal/i, '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>'],
    [/r[ée]sum[ée]|cv/i, '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>'],
    [/chromium/i, '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
    [/^files/i, '<path d="M3 6h6l2 2h10v11H3z"/>'],
    [/music/i, '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
    [/image|background/i, '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'],
    [/claude/i, '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'],
    [/code|neovim/i, '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>'],
    [/obsidian/i, '<path d="M12 2 5 9l2 11 5 2 5-2 2-11z"/><path d="m12 2-2 9 2 11"/>'],
    [/infraeye/i, '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    [/monitor/i, '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
    [/about/i, '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
    [/experience/i, '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3"/>'],
    [/projects/i, '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'],
    [/skills/i, '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
    [/contact/i, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'],
    [/github/i, '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-10 7"/>'],
    [/weather/i, '<path d="M7 18a4 4 0 1 1 1-7.9A6 6 0 0 1 19 12a3 3 0 0 1-1 6z"/>'],
    [/fetch/i, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'],
    [/ctf/i, '<path d="M5 21V4h11l-2 4 2 4H5"/>'],
    [/matrix/i, '<path d="M6 4v16M12 4v10M18 4v14"/>'],
    [/screensaver/i, '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>'],
    [/^lock/i, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
    [/^theme/i, '<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="16" cy="8.5" r="1.2"/><path d="M13 21c-1.5-2 0-4 2-4h3"/>'],
    [/reboot/i, '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'],
];
// Anything without its own icon is an arcade game.
const GAMEPAD_ICON = '<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>';
const launchIcon = (it) => ICON((LAUNCH_ICONS.find(([re]) => re.test(it.name)) || [, GAMEPAD_ICON])[1]);

const LAUNCH = [
    { name: 'Terminal', hint: 'Alt+Enter' },
    { name: 'System Monitor', hint: 'htop', run: 'htop' },
    { name: 'Neovim', hint: 'vim', run: 'vim' },
    { name: 'About Neox', hint: 'whois', run: 'whois' },
    { name: 'Experience', hint: 'experience', run: 'experience' },
    { name: 'Projects', hint: 'projects', run: 'projects' },
    { name: 'Skills', hint: 'skills', run: 'skills' },
    { name: 'Contact', hint: 'contact', run: 'contact' },
    { name: 'GitHub Repositories', hint: 'gh repo list', run: 'gh repo list' },
    { name: 'Weather', hint: 'weather', run: 'weather' },
    { name: 'Fastfetch', hint: 'neofetch', run: 'neofetch' },
    { name: 'NeoxCTF (capture the flag)', hint: 'ctf', run: 'ctf' },
    { name: 'Matrix', hint: 'cmatrix', run: 'cmatrix' },
    { name: 'Screensaver', hint: 'idle 150s', action: () => showScreensaver() },
    { name: 'Lock Screen', hint: 'Alt+Shift+L', action: () => lockScreen() },
    ...THEMES.map((t) => ({ name: `Theme: ${t}`, hint: 'theme', action: () => cmdTheme({ args: [t] }) })),
    { name: 'Reboot', hint: 'reboot', run: 'reboot' },
];
let launcherItems = [];
let launcherSel = 0;

function openLauncher() {
    if (shared.booting) return;
    launcherEl.hidden = false;
    launcherEl.innerHTML = '<div class="launcher-box"><input class="launcher-input" placeholder="Search…" spellcheck="false" autocomplete="off"><div class="launcher-list"></div></div>';
    const field = launcherEl.querySelector('input');
    field.addEventListener('input', renderLauncher);
    launcherEl.querySelector('.launcher-list').addEventListener('click', (e) => {
        const item = e.target.closest('[data-i]');
        if (item) launch(launcherItems[+item.dataset.i]);
    });
    renderLauncher();
    field.focus();
}

function closeLauncher() {
    launcherEl.hidden = true;
    launcherEl.innerHTML = '';
    if (wm.focused?.shell && !state.app) input.focus();
    else wm.focused?.app?.focus?.();
}

function renderLauncher() {
    const q = launcherEl.querySelector('input').value.trim().toLowerCase();
    launcherItems = LAUNCH.filter((it) => !q || `${it.name} ${it.hint}`.toLowerCase().includes(q))
        .sort((a, b) => (q ? b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) : 0));
    launcherSel = Math.min(launcherSel, Math.max(0, launcherItems.length - 1));
    launcherEl.querySelector('.launcher-list').innerHTML = launcherItems.map((it, i) => (
        `<div class="launcher-item${i === launcherSel ? ' sel' : ''}" data-i="${i}"><span>${launchIcon(it)}${esc(it.name)}</span><span class="dim">${esc(it.hint || '')}</span></div>`
    )).join('') || '<div class="launcher-item dim">No results</div>';
    launcherEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}

function launch(item) {
    closeLauncher();
    if (!item) return;
    if (item.action) return item.action();
    openTerminal({ run: item.run });
}

function launcherKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.altKey && e.code === 'Space')) {
        e.preventDefault();
        return closeLauncher();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
        e.preventDefault();
        const step = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
        launcherSel = (launcherSel + step + launcherItems.length) % Math.max(1, launcherItems.length);
        return renderLauncher();
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        launch(launcherItems[launcherSel]);
    }
}

launcherEl.addEventListener('mousedown', (e) => {
    if (e.target === launcherEl) closeLauncher();
});

// ---------- screensaver ----------

const SAVER_ART = String.raw`
            ▄▄▄████████▄▄▄                            ▄▄▄████████▄▄▄
        ▄▄██████████████████▄                     ▄▄██████████████████▄▄
      ▄████████████████████████▄                ▄████████████████████████▄
    ▄█████████▀▀▀▀▀▀▀▀▀▀█████████▄            ▄█████████▀▀▀▀▀▀▀▀▀▀█████████▄
   ████████▀              ▀████████▄        ▄████████▀              ▀████████
  ███████▀                  ▀████████▄    ▄████████▀         ▄█       ▀███████
 ███████                      ▀████████ ▄████████▀          ▄█         ▀███████
▄██████       ▄▄███████▄▄       ▀████▀ ▄███████▀          ▄██▀          ▀██████▄
███████     ▄█▀ ▄███    ▀▀█▄      ▀▀ ▄███████▀           ▄███▄▄▄▄        ███████
███████    ██   █████▄██   ██      ▄████████▀          ▄████████▀        ███████
███████     ▀█▄ ▀██████▀▄▄█▀      ▄███████▀ ▄▄         ▀▀▀▀████          ███████
▀██████       ▀▀███████▀▀       ▄███████▀ ▄████▄           ██▀          ▄██████▀
 ███████                      ▄████████▀ ████████▄        ██           ▄███████
  ███████▄                  ▄████████▀    ▀████████▄      ▀           ▄███████
   ████████▄              ▄████████▀        ▀████████▄              ▄████████
    ▀█████████▄▄▄▄  ▄▄▄▄█████████▀            ▀█████████▄▄▄▄  ▄▄▄▄█████████▀
      ▀████████████████████████▀                ▀████████████████████████▀
        ▀▀██████████████████▀▀                    ▀▀██████████████████▀▀
            ▀▀▀████████▀▀▀                            ▀▀▀████████▀▀▀

                                I N F R A E Y E

                              OBSERVING THE UNSEEN`.slice(1);

let idleTimer;
let saverTimer;
let saverShownAt = 0;

function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showScreensaver, IDLE_MS);
}

function showScreensaver() {
    if (shared.booting || !saverEl.hidden) return;
    saverEl.hidden = false;
    saverShownAt = Date.now();
    if (currentTheme() === 'yozakura') return showEnso();
    saverEl.innerHTML = '<pre></pre>';
    const pre = saverEl.querySelector('pre');
    const target = [...SAVER_ART];
    const hidden = new Set(target.map((ch, i) => (/\s/.test(ch) ? -1 : i)).filter((i) => i >= 0));
    const noise = '░▒▓01<>/\\|';
    // Decrypt-style reveal, then the CSS colour sweep takes over.
    saverTimer = setInterval(() => {
        for (const i of [...hidden].filter(() => Math.random() < 0.06)) hidden.delete(i);
        pre.textContent = target.map((ch, i) => (hidden.has(i) ? noise[Math.floor(Math.random() * noise.length)] : ch)).join('');
        if (!hidden.size) clearInterval(saverTimer);
    }, 40);
}

// yozakura's screensaver: an ensō brushed in one stroke, with 一期一会 in vertical kanji.
function showEnso() {
    saverEl.innerHTML = `<div class="enso">
        <svg viewBox="0 0 400 400" aria-hidden="true">
            <filter id="brush"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter>
            <g filter="url(#brush)" fill="none" stroke-linecap="round">
                <path class="enso-stroke" pathLength="1" d="M251 59A150 150 0 1 1 187 51" stroke-width="30"/>
                <path class="enso-stroke dry" pathLength="1" d="M256 52A158 158 0 1 1 184 43" stroke-width="3"/>
            </g>
        </svg>
        <p class="enso-jp" lang="ja">一期一会</p>
        <p class="enso-en"><span lang="ja-Latn">ichi-go ichi-e</span>: this moment comes only once</p>
    </div>`;
}

function hideScreensaver() {
    clearInterval(saverTimer);
    saverEl.hidden = true;
    saverEl.innerHTML = '';
    resetIdle();
}

for (const type of ['mousemove', 'mousedown', 'wheel', 'touchstart']) {
    window.addEventListener(type, () => {
        if (!saverEl.hidden && Date.now() - saverShownAt > 600) hideScreensaver();
        else if (saverEl.hidden) resetIdle();
    }, { passive: true });
}

// ---------- lock screen ----------

const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Modelled on neox's own lock (neox.lock): the wallpaper under a night wash, a large serif clock
// and a glass password field. In yozakura it adds the kanji date and InfraEye's motto as a
// hanging scroll. The visitor account has no password, so Enter unlocks.
const lockEl = document.createElement('div');
lockEl.id = 'lock';
lockEl.hidden = true;
lockEl.setAttribute('role', 'dialog');
lockEl.setAttribute('aria-label', 'Screen locked');
document.body.appendChild(lockEl);
let lockTimer;

function renderLockClock() {
    const now = new Date();
    lockEl.querySelector('.lock-time').textContent = now.toTimeString().slice(0, 5);
    lockEl.querySelector('.lock-date').textContent = currentTheme() === 'yozakura'
        ? `${now.getMonth() + 1}月${now.getDate()}日　${'日月火水木金土'[now.getDay()]}曜日`
        : now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function lockScreen() {
    if (shared.booting || !lockEl.hidden) return;
    closeLauncher();
    lockEl.hidden = false;
    lockEl.innerHTML = `
        <div class="lock-center">
            <div class="lock-time"></div>
            <div class="lock-date"></div>
            <form class="lock-field">
                <input type="password" placeholder="Press Enter to unlock" aria-label="Password for ${GUEST}" autocomplete="off">
            </form>
            <p class="lock-user">${GUEST}@${HOST}</p>
        </div>
        <div class="lock-scroll" lang="ja" aria-hidden="true"><span>見えないものを観る</span><b>観</b></div>`;
    renderLockClock();
    lockTimer = setInterval(renderLockClock, 1000);
    const field = lockEl.querySelector('input');
    // Keys typed here must not also reach the terminal behind the lock.
    field.addEventListener('keydown', (e) => e.stopPropagation());
    lockEl.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        unlockScreen();
    });
    lockEl.addEventListener('mousedown', (e) => {
        if (e.target !== field) {
            e.preventDefault();
            field.focus();
        }
    });
    field.focus();
    journal('systemd-logind', `Session 1 of user ${GUEST} locked.`);
}

function unlockScreen() {
    clearInterval(lockTimer);
    lockEl.classList.add('leaving');
    setTimeout(() => {
        lockEl.hidden = true;
        lockEl.classList.remove('leaving');
        lockEl.innerHTML = '';
        if (wm.focused?.shell && !state.app) input.focus();
        else wm.focused?.app?.focus?.();
    }, calmMotion.matches ? 0 : 260);
    journal('systemd-logind', `Session 1 of user ${GUEST} unlocked.`);
}

// ---------- yozakura petals ----------

// A handful of sakura petals drift across the wallpaper, behind the windows.
const petalsEl = document.createElement('canvas');
petalsEl.id = 'petals';
petalsEl.setAttribute('aria-hidden', 'true');
document.body.prepend(petalsEl);
const petalCtx = petalsEl.getContext('2d');
const PETAL_COLORS = ['#f2b8c8', '#eba6bb', '#f6cdd8', '#e48fa8'];
let petals = [];

function newPetal(anywhere) {
    const w = innerWidth;
    const h = innerHeight;
    return {
        x: anywhere ? Math.random() * w : -20 - Math.random() * w * 0.3,
        y: anywhere ? Math.random() * h : Math.random() * h * 0.6 - 40,
        size: 5 + Math.random() * 6,
        vx: 0.35 + Math.random() * 0.5,
        vy: 0.25 + Math.random() * 0.4,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.03,
        sway: Math.random() * Math.PI * 2,
        color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    };
}

function drawPetal(p) {
    petalCtx.save();
    petalCtx.translate(p.x, p.y);
    petalCtx.rotate(p.rot);
    // Tumbling: squash the petal along one axis as it turns.
    petalCtx.scale(1, Math.abs(Math.cos(p.sway)) * 0.7 + 0.3);
    petalCtx.fillStyle = p.color;
    petalCtx.globalAlpha = 0.75;
    const s = p.size;
    petalCtx.beginPath();
    petalCtx.moveTo(0, s);
    petalCtx.bezierCurveTo(-s, s * 0.2, -s * 0.8, -s * 0.9, -s * 0.25, -s);
    petalCtx.lineTo(0, -s * 0.7);
    petalCtx.lineTo(s * 0.25, -s);
    petalCtx.bezierCurveTo(s * 0.8, -s * 0.9, s, s * 0.2, 0, s);
    petalCtx.fill();
    petalCtx.restore();
}

function petalFrame() {
    const on = currentTheme() === 'yozakura' && !calmMotion.matches && !desktopEl.hidden;
    petalsEl.hidden = !on;
    if (on && !document.hidden) {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        if (petalsEl.width !== Math.round(innerWidth * dpr)) {
            petalsEl.width = Math.round(innerWidth * dpr);
            petalsEl.height = Math.round(innerHeight * dpr);
        }
        if (!petals.length) petals = Array.from({ length: isMobile() ? 10 : 22 }, () => newPetal(true));
        petalCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        petalCtx.clearRect(0, 0, innerWidth, innerHeight);
        petals.forEach((p, i) => {
            p.sway += 0.02;
            p.x += p.vx + Math.sin(p.sway) * 0.4;
            p.y += p.vy;
            p.rot += p.spin;
            if (p.x > innerWidth + 20 || p.y > innerHeight + 20) petals[i] = newPetal(false);
            drawPetal(p);
        });
    }
    requestAnimationFrame(petalFrame);
}
requestAnimationFrame(petalFrame);

// ---------- keybindings (Alt stands in for Super, which the OS or browser keeps for itself) ----------

const KEYBINDS = [
    ['Alt+Enter', 'New terminal'],
    ['Alt+Space', 'Launcher'],
    ['Alt+W', 'Close window'],
    ['Alt+F', 'Fullscreen (Super+F where the browser allows)'],
    ['Alt+Shift+F', 'Full width, keeps the bar'],
    ['Alt+Arrows', 'Move focus'],
    ['Alt+1..9', 'Switch workspace'],
    ['Alt+Shift+1..9', 'Move window to workspace'],
    ['Alt+Shift+L', 'Lock screen'],
];

window.addEventListener('keydown', (e) => {
    resetIdle();
    if (!saverEl.hidden) {
        e.preventDefault();
        e.stopPropagation();
        return hideScreensaver();
    }
    if (shared.booting || desktopEl.hidden) return;
    // While locked, every key belongs to the password field.
    if (!lockEl.hidden) {
        if (e.target !== lockEl.querySelector('input')) {
            e.preventDefault();
            e.stopPropagation();
            lockEl.querySelector('input')?.focus();
        }
        return;
    }
    if (!launcherEl.hidden) return launcherKey(e);
    // Super+F where the browser lets it through (⌘+F on macOS); Linux and Windows keep Super for the OS.
    if (e.metaKey && !e.altKey && !e.ctrlKey && e.code === 'KeyF') {
        e.preventDefault();
        e.stopPropagation();
        return toggleFullscreen(e.shiftKey ? 'max' : 'full');
    }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const digit = e.code.match(/^Digit([1-9])$/)?.[1];
    const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (digit && e.shiftKey) moveToWorkspace(+digit);
    else if (digit) switchWorkspace(+digit);
    else if (e.key === 'Enter') openTerminal();
    else if (e.code === 'Space' && !e.shiftKey) openLauncher();
    else if (e.code === 'KeyW' || e.code === 'KeyQ') wm.focused && closeWindow(wm.focused);
    else if (e.code === 'KeyF') toggleFullscreen(e.shiftKey ? 'max' : 'full');
    else if (e.code === 'KeyL' && e.shiftKey) lockScreen();
    else if (arrow) moveFocus(arrow);
    else return;
    e.preventDefault();
    e.stopPropagation();
}, true);

// ---------- desktop commands ----------

function cmdTerminal({ args }) {
    const e = args.indexOf('-e');
    openTerminal({ run: e >= 0 ? args.slice(e + 1).join(' ') : undefined, fromCommand: true });
}

function cmdHyprctl({ args }) {
    const [sub, action, ...rest] = args;
    const describe = (w) => [
        `Window ${(0x55d1c0 + w.id).toString(16)} -> ${esc(windowTitle(w))}:`,
        `\tworkspace: ${w.ws} (${w.ws})`,
        `\tclass: ${w.app ? w.app.cls : 'com.mitchellh.ghostty'}`,
        `\ttitle: ${esc(windowTitle(w))}`,
        `\tsize: ${Math.round(w.rect?.w || 0)},${Math.round(w.rect?.h || 0)}`,
        `\tfullscreen: ${w.full === 'full' ? 2 : w.full ? 1 : 0}`,
        `\tfocused: ${w === wm.focused ? 1 : 0}`,
        '',
    ];
    switch (sub) {
        case 'clients':
            return wm.windows.flatMap(describe);
        case 'activewindow':
            return wm.focused ? describe(wm.focused) : ['Invalid'];
        case 'workspaces':
            return [...new Set(wm.windows.map((w) => w.ws))].sort().flatMap((n) => [
                `workspace ID ${n} (${n}) on monitor eDP-1:`,
                `\twindows: ${wm.windows.filter((w) => w.ws === n).length}`,
                `\tlane: ${LANES[n - 1]}`,
                '',
            ]);
        case 'version':
            return ['Hyprland 0.51.1 built from branch  at commit  (tag: v0.51.1)', 'Running on NeoxOS (the web)'];
        case 'dispatch': {
            const jobs = {
                workspace: () => switchWorkspace(Math.min(9, Math.max(1, +rest[0] || 1))),
                movetoworkspace: () => moveToWorkspace(Math.min(9, Math.max(1, +rest[0] || 1))),
                killactive: () => wm.focused && closeWindow(wm.focused),
                fullscreen: () => toggleFullscreen(rest[0] === '1' ? 'max' : 'full'),
                exec: () => openTerminal({ run: rest.slice(1).join(' ') || undefined }),
            };
            if (!jobs[action]) return err(`Invalid dispatcher: ${action ?? ''}`);
            wm.deferred.push(jobs[action]);
            return ['ok'];
        }
        default:
            return ['usage: hyprctl [clients | activewindow | workspaces | version | dispatch DISPATCHER ARGS]'];
    }
}

function cmdNotifySend({ args }) {
    if (!args.length) return err('No summary specified.');
    notify(args[0], args.slice(1).join(' '));
}

Object.assign(COMMANDS, {
    ghostty: { group: 'Desktop', usage: 'ghostty [-e COMMAND]', desc: 'open a new terminal window', run: cmdTerminal },
    alacritty: { group: 'Hidden', usage: 'alacritty [-e COMMAND]', desc: 'open a new terminal window', run: cmdTerminal },
    kitty: { group: 'Hidden', usage: 'kitty', desc: 'open a new terminal window', run: cmdTerminal },
    hyprctl: { group: 'Desktop', usage: 'hyprctl clients | workspaces | dispatch workspace N', desc: 'control the Hyprland window manager', run: cmdHyprctl },
    'notify-send': { group: 'Desktop', usage: 'notify-send SUMMARY [BODY]', desc: 'send a desktop notification', run: cmdNotifySend },
    'omarchy-lock-screen': { group: 'Desktop', usage: 'omarchy-lock-screen', desc: 'lock the screen (Alt+Shift+L)', run: () => { lockScreen(); } },
    hyprlock: { group: 'Hidden', usage: 'hyprlock', desc: 'lock the screen', run: () => { lockScreen(); } },
    lock: { group: 'Hidden', usage: 'lock', desc: 'lock the screen', run: () => { lockScreen(); } },
    'omarchy-launch-screensaver': { group: 'Desktop', usage: 'omarchy-launch-screensaver', desc: 'start the screensaver now', run: () => { showScreensaver(); } },
    keybinds: { group: 'Desktop', usage: 'keybinds', desc: 'show the window manager keybindings', run: () => KEYBINDS.map(([k, v]) => `${c('y', k.padEnd(16))}${v}`) },
});

// Rooting the box earns a notification.
const flag = getNode('/root/flag.txt');
if (flag) flag.onRead = () => {
    if (flag.celebrated) return;
    flag.celebrated = true;
    notify('Achievement unlocked: root', 'You escalated from guest to root. Now submit the flag: ctf submit flag{…}');
};

// ---------- startup ----------

// Later scripts (resume.js) can run code once the desktop is up.
const desktopReadyHooks = [];

function startDesktop() {
    ttyEl.hidden = true;
    ttyEl.innerHTML = '';
    barEl.hidden = false;
    desktopEl.hidden = false;
    const hint = document.createElement('button');
    hint.className = 'empty-hint';
    hint.innerHTML = `${LOGO_SVG}<span>Alt+Enter  new terminal\nAlt+Space  launcher</span>`;
    hint.addEventListener('click', () => openTerminal());
    desktopEl.appendChild(hint);
    openTerminal();
    greet();
    resetIdle();
    // Visitors arriving on a résumé link came for the CV, not the tour.
    if (!sessionStorage.getItem('nsh_welcomed') && !/^#(resume|cv)$/i.test(location.hash)) {
        sessionStorage.setItem('nsh_welcomed', '1');
        setTimeout(() => notify('Welcome to NeoxOS', 'Looking for my CV? Click “Hire me” in the top bar. Otherwise: Alt+Enter opens a terminal, Alt+Space the launcher.', 9000), 600);
    }
    desktopReadyHooks.forEach((hook) => hook());
}
