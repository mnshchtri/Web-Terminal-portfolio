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
const LANES = ['Development', 'Development', 'Development', 'DevSecOps', 'DevSecOps', 'DevSecOps',
    'Security research', 'Security research', 'Security research'];
const GAPS_OUT = 10;
const GAPS_IN = 5;
const IDLE_MS = 150000; // screensaver timeout from neox's shell.json

const wm = { windows: [], active: 1, focused: null, nextId: 1, lastFocused: {}, deferred: [] };

const isMobile = () => matchMedia('(max-width: 700px)').matches;
const focusedBusy = () => !!wm.focused?.shell?.session.busy;

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
        }
        setTitle();
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

// Browser fullscreen follows whether the active workspace shows a 'full' window. Requests can only
// succeed during a key press or click, which is when layout() runs for these changes.
function syncBrowserFullscreen(wanted) {
    if (wanted && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (!wanted && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
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
    // True fullscreen hides the bar, so measure the desktop again once it's gone.
    if (document.body.classList.contains('fs-mode') !== covering) {
        document.body.classList.toggle('fs-mode', covering);
        syncBrowserFullscreen(covering);
        return layout();
    }
    syncBrowserFullscreen(covering);
    if (solo) place(solo, { x: 0, y: 0, w: W, h: H });
    else dwindle(visible, { x: out, y: out, w: W - 2 * out, h: H - 2 * out }, mobile ? 0 : GAPS_IN * 2);
    desktopEl.classList.toggle('empty', !visible.length);
    renderWorkspaces();
    // Keep each terminal pinned to its newest output once the resize animation settles.
    setTimeout(() => visible.forEach((w) => { if (w.shell) w.shell.terminal.scrollTop = w.shell.terminal.scrollHeight; }), 220);
}

window.addEventListener('resize', layout);

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
    const toast = document.createElement('div');
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
const LOGO_SVG = '<svg viewBox="0 0 54 13" preserveAspectRatio="none" class="logo-svg" aria-hidden="true"><path fill="currentColor" d="M0 0h54v1h-54zM0 1h4v1h-4zM25 1h4v1h-4zM50 1h4v1h-4zM0 2h4v1h-4zM8 2h21v1h-21zM38 2h8v1h-8zM50 2h4v1h-4zM0 3h4v1h-4zM8 3h4v1h-4zM42 3h4v1h-4zM50 3h4v1h-4zM0 4h4v1h-4zM8 4h4v1h-4zM42 4h4v1h-4zM50 4h4v1h-4zM0 5h4v1h-4zM8 5h4v1h-4zM42 5h4v1h-4zM50 5h4v1h-4zM0 6h12v1h-12zM42 6h4v1h-4zM50 6h4v1h-4zM0 7h4v1h-4zM8 7h4v1h-4zM42 7h4v1h-4zM50 7h4v1h-4zM0 8h4v1h-4zM8 8h4v1h-4zM42 8h4v1h-4zM50 8h4v1h-4zM0 9h4v1h-4zM8 9h4v1h-4zM42 9h4v1h-4zM50 9h4v1h-4zM0 10h4v1h-4zM8 10h38v1h-38zM50 10h4v1h-4zM0 11h4v1h-4zM25 11h4v1h-4zM50 11h4v1h-4zM0 12h29v1h-29zM34 12h20v1h-20z"/></svg>';

barEl.innerHTML = `
    <div class="bar-left">
        <button class="bar-logo" title="Launcher (Alt+Space)">${LOGO_SVG}</button>
        <div class="workspaces"></div>
    </div>
    <div class="bar-center">
        <button class="bar-clock" title="Click to switch format"></button>
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
        return `<button class="ws ${cls}" data-ws="${n}" title="Workspace ${n} — ${LANES[n - 1]} (Alt+${n})">${n}</button>`;
    }).join('');
}

function updateBar() {
    const now = new Date();
    $bar('.bar-clock').textContent = clockAlt
        ? `${now.getDate()} ${now.toLocaleString('en-US', { month: 'long' })} W${isoWeek(now)} ${now.getFullYear()}`
        : `${now.toLocaleString('en-US', { weekday: 'long' })} ${now.toTimeString().slice(0, 5)}`;
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
    { name: 'Get Root', hint: 'hint', run: 'hint' },
    { name: 'Matrix', hint: 'cmatrix', run: 'cmatrix' },
    { name: 'Screensaver', hint: 'idle 150s', action: () => showScreensaver() },
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
        `<div class="launcher-item${i === launcherSel ? ' sel' : ''}" data-i="${i}"><span>${esc(it.name)}</span><span class="dim">${esc(it.hint || '')}</span></div>`
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
];

window.addEventListener('keydown', (e) => {
    resetIdle();
    if (!saverEl.hidden) {
        e.preventDefault();
        e.stopPropagation();
        return hideScreensaver();
    }
    if (shared.booting || desktopEl.hidden) return;
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
    'omarchy-launch-screensaver': { group: 'Desktop', usage: 'omarchy-launch-screensaver', desc: 'start the screensaver now', run: () => { showScreensaver(); } },
    keybinds: { group: 'Desktop', usage: 'keybinds', desc: 'show the window manager keybindings', run: () => KEYBINDS.map(([k, v]) => `${c('y', k.padEnd(16))}${v}`) },
});

// Rooting the box earns a notification.
const flag = getNode('/root/flag.txt');
if (flag) flag.onRead = () => {
    if (flag.celebrated) return;
    flag.celebrated = true;
    notify('Achievement unlocked: root', 'You escalated from guest to root. Nicely done.');
};

// ---------- startup ----------

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
    if (!sessionStorage.getItem('nsh_welcomed')) {
        sessionStorage.setItem('nsh_welcomed', '1');
        setTimeout(() => notify('Welcome to NeoxOS', 'Alt+Enter opens a terminal, Alt+Space the launcher, Alt+1–9 switches workspaces. Or click the logo.', 9000), 600);
    }
}
