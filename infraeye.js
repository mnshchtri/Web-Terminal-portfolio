'use strict';

// A demo of InfraEye, neox's agentless observability platform, with simulated data. It mirrors the
// real app's dark theme, eye logo and sidebar, and shows its headline feature end to end: an alert
// rule firing and healing a server over SSH. Everything here is fake and labelled as such.

const IE_LOGO = `<svg viewBox="0 0 512 512" class="ie-logo" aria-hidden="true"><circle cx="256" cy="256" r="212" fill="none" stroke="#3874AD" stroke-width="64"/>
    <path d="M110 256 C172 172 340 172 402 256 C340 340 172 340 110 256 Z" fill="#3874AD"/><path d="M140 256 C194 202 318 202 372 256 C318 310 194 310 140 256 Z" fill="#fff"/>
    <circle cx="256" cy="256" r="60" fill="#3874AD"/><path d="M281 219 a24 24 0 1 1 -18 41 a15 15 0 0 0 18 -41 Z" fill="#fff"/></svg>`;

const IE_LINKS = {
    repo: 'https://github.com/mnshchtri/infra-eye',
    site: 'https://infraeye.manishkarki7.com.np',
};

const IE_NAV = [
    ['Overview', [['dashboard', 'Dashboard'], ['servers', 'Servers']]],
    ['Infrastructure', [['map', 'Infra Map'], ['kubernetes', 'Kubernetes'], ['resources', 'Resources'], ['alerts', 'Alert Rules'], ['vpn', 'VPN Tunnel']]],
    ['Operations', [['netra', 'AI Assistant'], ['agent', 'Agent']]],
    ['Audit', [['kernel', 'Kernel Scanner'], ['hardening', 'Server Hardening'], ['cluster', 'Cluster Security'], ['dast', 'DAST Scanner']]],
    ['Engineering', [['devtools', 'Developer Hub'], ['iac', 'IaC Sync'], ['settings', 'System Settings']]],
];
const IE_LIVE_PAGES = new Set(['dashboard', 'servers', 'kubernetes', 'alerts', 'netra', 'kernel']);

// ---------- the simulated fleet (shared by every InfraEye window) ----------

const IE_HISTORY = 60;

const ieFleet = {
    servers: [
        { name: 'web-01', host: '10.0.1.11', os: 'Ubuntu 24.04', tags: ['web', 'prod'], cpu: 34, mem: 52, disk: 41, ports: [[22, 'sshd'], [80, 'nginx'], [443, 'nginx'], [9100, 'node-exporter']] },
        { name: 'web-02', host: '10.0.1.12', os: 'Ubuntu 24.04', tags: ['web', 'prod'], cpu: 28, mem: 49, disk: 39, ports: [[22, 'sshd'], [80, 'nginx'], [443, 'nginx']] },
        { name: 'db-01', host: '10.0.2.21', os: 'Debian 12', tags: ['database', 'prod'], cpu: 22, mem: 71, disk: 68, ports: [[22, 'sshd'], [5432, 'postgres'], [6379, 'redis']] },
        { name: 'k8s-cp-01', host: '10.0.3.31', os: 'Rocky Linux 9', tags: ['k8s', 'control-plane'], cpu: 18, mem: 44, disk: 33, ports: [[22, 'sshd'], [6443, 'kube-apiserver'], [2379, 'etcd']] },
        { name: 'k8s-wk-01', host: '10.0.3.41', os: 'Rocky Linux 9', tags: ['k8s', 'worker'], cpu: 46, mem: 63, disk: 47, ports: [[22, 'sshd'], [10250, 'kubelet']] },
        { name: 'k8s-wk-02', host: '10.0.3.42', os: 'Rocky Linux 9', tags: ['k8s', 'worker'], cpu: 41, mem: 58, disk: 45, ports: [[22, 'sshd'], [10250, 'kubelet']] },
        { name: 'edge-pokhara', host: '172.16.8.5', os: 'Raspberry Pi OS', tags: ['edge'], cpu: 0, mem: 0, disk: 77, offline: true, ports: [] },
    ].map((s) => ({ ...s, base: s.cpu, hist: { cpu: Array(IE_HISTORY).fill(s.cpu), mem: Array(IE_HISTORY).fill(s.mem) }, rx: 0, tx: 0 })),
    activity: [
        { at: Date.now() - 41 * 60000, kind: 'ok', text: 'Rule “Disk cleanup” ran on db-01: journalctl --vacuum-size=500M (freed 1.8 GB)' },
        { at: Date.now() - 17 * 60000, kind: 'info', text: 'k8s-wk-02 reconnected via Distributed Bridge' },
    ],
    history: [
        { at: Date.now() - 41 * 60000, server: 'db-01', trigger: 'Disk usage ≥ 85%', action: 'journalctl --vacuum-size=500M', result: 'exit 0' },
    ],
    incident: null, // { step, t } while the simulated incident runs
    listeners: new Set(),
    timer: null,
};

const IE_RULES = [
    { name: 'Auto-Restart Nginx', server: 'web-01', type: 'cpu', op: 'gt', value: 85, action: 'ssh_command', command: 'sudo systemctl restart nginx' },
    { name: 'Disk cleanup', server: 'db-01', type: 'disk', op: 'gte', value: 85, action: 'ssh_command', command: 'sudo journalctl --vacuum-size=500M' },
    { name: 'Restart crashed worker', server: 'k8s-wk-01', type: 'failing_pods', op: 'gt', value: 0, action: 'ssh_command', command: 'kubectl rollout restart deploy/payments-worker -n payments' },
    { name: 'Memory pressure', server: 'All servers', type: 'memory', op: 'gt', value: 92, action: 'notify', command: '' },
];
const IE_OP = { gt: '>', gte: '≥', lt: '<' };
const IE_METRIC = { cpu: 'CPU usage (%)', disk: 'Disk usage (%)', memory: 'Memory usage (%)', failing_pods: 'Failing pods (K8s)' };

const IE_PODS = [
    ['platform', 'api-gateway-6f8b9c7d4-k2x9p', 'Running', 0, '6d'],
    ['platform', 'api-gateway-6f8b9c7d4-m7q2w', 'Running', 0, '6d'],
    ['payments', 'payments-worker-7c9d8f6b5-r4t8n', 'CrashLoopBackOff', 14, '2h'],
    ['payments', 'payments-api-5b7c8d9e6-x1z3v', 'Running', 1, '3d'],
    ['observability', 'infra-eye-collector-0', 'Running', 0, '12d'],
    ['security', 'wazuh-manager-0', 'Running', 0, '21d'],
    ['kube-system', 'coredns-7db6d8ff4d-9wvxb', 'Running', 0, '42d'],
];

const IE_EVENTS = [
    ['Warning', 'BackOff', 'payments-worker-7c9d8f6b5-r4t8n', 'Back-off restarting failed container worker'],
    ['Warning', 'OOMKilled', 'payments-worker-7c9d8f6b5-r4t8n', 'Container worker exceeded memory limit 256Mi'],
    ['Normal', 'Pulled', 'payments-api-5b7c8d9e6-x1z3v', 'Successfully pulled image in 1.2s'],
    ['Normal', 'Scheduled', 'infra-eye-collector-0', 'Assigned to k8s-wk-01'],
];

const IE_KERNEL = [
    ['web-01', '6.8.0-45-generic', []],
    ['web-02', '6.8.0-45-generic', []],
    ['db-01', '6.1.0-13-amd64', [['CVE-2024-1086', 'nf_tables use-after-free → local privilege escalation', 'High']]],
    ['k8s-cp-01', '5.14.0-427.el9', []],
    ['k8s-wk-01', '5.14.0-362.el9', [['CVE-2023-0386', 'OverlayFS setuid copy-up → local privilege escalation', 'High'], ['CVE-2024-1086', 'nf_tables use-after-free → local privilege escalation', 'High']]],
    ['k8s-wk-02', '5.14.0-427.el9', []],
];

function ieLog(kind, text) {
    ieFleet.activity.unshift({ at: Date.now(), kind, text });
    ieFleet.activity.length = Math.min(ieFleet.activity.length, 30);
}

function ieTick() {
    const inc = ieFleet.incident;
    for (const s of ieFleet.servers) {
        if (s.offline) continue;
        let target = s.base + (Math.random() - 0.5) * 14;
        if (inc && s.name === 'web-01') target = inc.step < 3 ? 60 + inc.step * 14 + Math.random() * 4 : inc.step < 5 ? 95 + Math.random() * 3 : 30 + Math.random() * 6;
        // During the incident web-01 tracks its target closely, so the spike and recovery read clearly.
        const follow = inc && s.name === 'web-01' ? 0.75 : 0.5;
        s.cpu = clamp(Math.round(s.cpu * (1 - follow) + target * follow), 2, 99);
        s.mem = clamp(Math.round(s.mem + (Math.random() - 0.5) * 3), 20, 95);
        s.rx = Math.round(20 + Math.random() * 180 + (s.tags.includes('web') ? 300 : 0));
        s.tx = Math.round(10 + Math.random() * 90 + (s.tags.includes('web') ? 500 : 0));
        s.hist.cpu.push(s.cpu);
        s.hist.mem.push(s.mem);
        s.hist.cpu.shift();
        s.hist.mem.shift();
    }
    if (inc) stepIncident(inc);
    ieFleet.listeners.forEach((fn) => fn());
}

// The self-healing story, one step per tick (2 s): CPU climbs, the rule fires, nginx restarts, recovery.
function stepIncident(inc) {
    const web = ieFleet.servers[0];
    inc.step++;
    if (inc.step === 2) ieLog('warn', `High CPU on web-01: ${web.cpu}% and climbing`);
    if (inc.step === 4) {
        ieLog('warn', 'Rule “Auto-Restart Nginx” fired on web-01 (CPU usage > 85% for 3 samples)');
        ieLog('run', 'web-01 $ sudo systemctl restart nginx');
    }
    if (inc.step === 5) {
        ieLog('ok', 'web-01: nginx.service restarted (exit 0) — workers recycled');
        ieFleet.history.unshift({ at: Date.now(), server: 'web-01', trigger: `CPU usage > 85% (${web.cpu}%)`, action: 'sudo systemctl restart nginx', result: 'exit 0' });
        notify('InfraEye · self-healing', 'web-01: CPU spike detected, nginx restarted automatically.');
    }
    if (inc.step === 7) {
        ieLog('ok', `web-01 recovered: CPU back to ${web.cpu}% — no human paged`);
        ieFleet.incident = null;
    }
}

function ieSubscribe(fn) {
    ieFleet.listeners.add(fn);
    ieFleet.timer ??= setInterval(ieTick, 2000);
    return () => {
        ieFleet.listeners.delete(fn);
        if (!ieFleet.listeners.size) {
            clearInterval(ieFleet.timer);
            ieFleet.timer = null;
        }
    };
}

// ---------- drawing helpers ----------

const ieAgo = (at) => {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const ieLevel = (v) => (v >= 85 ? 'danger' : v >= 70 ? 'warning' : 'ok');
const ieBar = (v, label) => `<div class="ie-meter" title="${label} ${v}%"><span class="ie-${ieLevel(v)}" style="width:${v}%"></span></div>`;

function ieChart(canvas, series) {
    const dpr = devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round((h * i) / 4) + 0.5);
        ctx.lineTo(w, Math.round((h * i) / 4) + 0.5);
        ctx.stroke();
    }
    for (const { data, color } of series) {
        const x = (i) => (i / (data.length - 1)) * w;
        const y = (v) => h - (v / 100) * (h - 4) - 2;
        ctx.beginPath();
        data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = `${color}22`;
        ctx.fill();
    }
}

const fleetAvg = (key) => {
    const live = ieFleet.servers.filter((s) => !s.offline);
    return Array.from({ length: IE_HISTORY }, (_, i) => live.reduce((sum, s) => sum + s.hist[key][i], 0) / live.length);
};

// Minimal markdown for Netra: **bold**, `code`, ```blocks``` and bullet lines.
function ieMarkdown(text) {
    return text.split(/```/).map((part, i) => {
        if (i % 2) return `<pre>${esc(part.replace(/^\w*\n/, '').trim())}</pre>`;
        return part.trim().split('\n').map((line) => {
            const html = esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
            return line.startsWith('- ') ? `<li>${html.slice(2)}</li>` : html ? `<p>${html}</p>` : '';
        }).join('');
    }).join('');
}

// ---------- Netra (scripted for the demo) ----------

const NETRA_ANSWERS = {
    slow: {
        q: 'Why is web-01 slow?',
        a: `**Evidence** (last 10 min on web-01)
- CPU peaked at **96%**; load average 7.8 on 4 cores
- nginx error.log: \`worker_connections are not enough\` × 312
- Requests per second jumped 4× at the same moment

**Root cause:** a traffic spike exhausted nginx worker connections, so workers spun on accept() instead of serving.

**Fix (rollback-safe):**
\`\`\`
sudo sed -i 's/worker_connections 768/worker_connections 4096/' /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
\`\`\`
Your rule **Auto-Restart Nginx** already covers the symptom; this fixes the cause. To roll back, restore the line and reload.`,
    },
    pods: {
        q: 'Which pods are failing?',
        a: `**1 pod is failing** in \`payments\`:
- \`payments-worker-7c9d8f6b5-r4t8n\`: **CrashLoopBackOff**, 14 restarts in 2h
- Last state: **OOMKilled**, limit 256Mi, peak usage 412Mi

**Root cause:** the worker's memory limit is below its working set since the last release added a cache.

**Fix:**
\`\`\`
kubectl -n payments set resources deploy/payments-worker --limits=memory=512Mi --requests=memory=320Mi
kubectl -n payments rollout status deploy/payments-worker
\`\`\`
Roll back with \`kubectl -n payments rollout undo deploy/payments-worker\`.`,
    },
    security: {
        q: 'Audit my fleet’s security',
        a: `**Summary:** 6 Linux servers scanned, **2 need attention**.
- **k8s-wk-01**: kernel 5.14.0-362 is exposed to **CVE-2023-0386** and **CVE-2024-1086** (local privilege escalation)
- **db-01**: exposed to **CVE-2024-1086**
- **edge-pokhara** is offline, so it hasn't been scanned for 3 days

**Recommended:**
\`\`\`
sudo dnf update kernel && sudo reboot      # k8s-wk-01 (drain it first)
sudo apt update && sudo apt full-upgrade   # db-01
\`\`\`
Drain the worker before rebooting: \`kubectl drain k8s-wk-01 --ignore-daemonsets\`.`,
    },
    about: {
        q: 'What is InfraEye?',
        a: `**InfraEye** is an agentless observability platform built by Manish (Neox). It watches bare-metal servers and Kubernetes over SSH, with no per-node agents.
- Real-time CPU, memory, disk and network telemetry
- **Self-healing**: XML alert rules that run SSH remediation automatically
- Kubernetes explorer with one-click diagnostics
- **Netra** (that's me): AI troubleshooting with live fleet context
- OIDC SSO, a browser SSH terminal, and a native desktop app

Install the desktop app: \`brew tap mnshchtri/infra-eye && brew install --cask infra-eye\`
Code: github.com/mnshchtri/infra-eye`,
    },
};

function netraAnswerFor(text) {
    const t = text.toLowerCase();
    if (/slow|cpu|nginx|web-0|load|latency/.test(t)) return NETRA_ANSWERS.slow;
    if (/pod|k8s|kube|crash|oom|cluster/.test(t)) return NETRA_ANSWERS.pods;
    if (/secur|cve|audit|vuln|kernel|harden/.test(t)) return NETRA_ANSWERS.security;
    return NETRA_ANSWERS.about;
}

// ---------- the app ----------

function infraEyeApp(startPage = 'dashboard') {
    let el;
    let win;
    let page = startPage;
    let selected = null;
    let unsubscribe;
    let typing = null;
    const chat = [{ from: 'netra', html: ieMarkdown('**नेत्र (Netra)** online — your DevSecOps copilot.\nI have live context on your fleet: metrics, logs, cluster events, alert rules and self-healing history. Pick a question below or ask your own.') }];
    const $ = (sel) => el.querySelector(sel);

    function nav() {
        return IE_NAV.map(([group, items]) => `<div class="ie-nav-group">${esc(group)}</div>${items.map(([id, label]) => (
            `<button class="ie-nav${id === page ? ' on' : ''}" data-page="${id}">${esc(label)}${IE_LIVE_PAGES.has(id) ? '' : '<span class="ie-lock">full app</span>'}</button>`
        )).join('')}`).join('');
    }

    function card(title, body, extra = '') {
        return `<section class="ie-card ${extra}"><h3>${title}</h3>${body}</section>`;
    }

    function pageHtml() {
        const live = ieFleet.servers.filter((s) => !s.offline);
        const alerts = live.filter((s) => s.cpu >= 85 || s.mem >= 92).length + 1;
        switch (page) {
            case 'dashboard':
                return `<div class="ie-stats">
                    <div class="ie-stat"><span>Servers online</span><b>${live.length}<small>/${ieFleet.servers.length}</small></b></div>
                    <div class="ie-stat"><span>K8s clusters</span><b>1</b></div>
                    <div class="ie-stat ${alerts > 1 ? 'warn' : ''}"><span>Active alerts</span><b>${alerts}</b></div>
                    <div class="ie-stat"><span>Self-healing actions</span><b>${ieFleet.history.length}</b></div></div>
                    <div class="ie-grid">
                    ${card('Fleet CPU &amp; memory <small>· last 2 min</small>', '<canvas class="ie-chart" data-chart="fleet"></canvas><div class="ie-legend"><i style="--c:#2b9af3"></i>CPU <i style="--c:#8b5cf6"></i>Memory</div>')}
                    ${card('Disk usage by server', ieFleet.servers.map((s) => `<div class="ie-row"><span>${esc(s.name)}</span>${ieBar(s.disk, 'Disk')}<span class="ie-num">${s.disk}%</span></div>`).join(''))}
                    ${card(`Automation activity <button class="ie-btn small" data-act="incident" ${ieFleet.incident ? 'disabled' : ''}>${ieFleet.incident ? 'Incident running…' : '⚡ Simulate incident'}</button>`, activityHtml(), 'wide')}
                    </div>`;
            case 'servers':
                return `${card(`Servers <small>· ${live.length} connected over SSH, no agents</small>`, `<table class="ie-table"><thead><tr><th>Name</th><th>Host</th><th>OS</th><th>CPU</th><th>Memory</th><th>Disk</th><th>Tags</th></tr></thead><tbody>
                    ${ieFleet.servers.map((s) => `<tr class="${s.name === selected ? 'sel' : ''}" data-server="${esc(s.name)}"><td><span class="ie-dot ${s.offline ? 'off' : ieLevel(s.cpu)}"></span>${esc(s.name)}</td><td class="ie-mono">${esc(s.host)}</td><td>${esc(s.os)}</td>
                    <td>${s.offline ? '<span class="ie-muted">offline</span>' : `${ieBar(s.cpu, 'CPU')}<span class="ie-num">${s.cpu}%</span>`}</td><td>${s.offline ? '' : `${ieBar(s.mem, 'Memory')}<span class="ie-num">${s.mem}%</span>`}</td>
                    <td>${ieBar(s.disk, 'Disk')}<span class="ie-num">${s.disk}%</span></td><td>${s.tags.map((t) => `<span class="ie-tag">${esc(t)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>`)}
                    ${selected ? serverDetail(ieFleet.servers.find((s) => s.name === selected)) : '<p class="ie-hint">Select a server to see its live metrics.</p>'}`;
            case 'kubernetes':
                return `<div class="ie-stats"><div class="ie-stat"><span>Cluster</span><b>ktm-prod</b></div><div class="ie-stat"><span>Nodes</span><b>3 <small>Ready</small></b></div>
                    <div class="ie-stat"><span>Pods</span><b>${IE_PODS.length}</b></div><div class="ie-stat warn"><span>Failing</span><b>1</b></div></div>
                    ${card('Pods', `<table class="ie-table"><thead><tr><th>Namespace</th><th>Name</th><th>Status</th><th>Restarts</th><th>Age</th><th></th></tr></thead><tbody>
                    ${IE_PODS.map(([ns, name, status, restarts, age]) => `<tr><td>${ns}</td><td class="ie-mono">${name}</td><td><span class="ie-pill ${status === 'Running' ? 'ok' : 'danger'}">${status}</span></td><td>${restarts}</td><td>${age}</td>
                    <td>${status === 'Running' ? '' : '<button class="ie-btn small" data-ask="pods">Diagnose</button>'}</td></tr>`).join('')}</tbody></table>`)}
                    ${card('Events', IE_EVENTS.map(([type, reason, obj, msg]) => `<div class="ie-event"><span class="ie-pill ${type === 'Warning' ? 'warning' : 'info'}">${type}</span><b>${reason}</b><span class="ie-mono">${obj}</span><span>${msg}</span></div>`).join(''))}`;
            case 'alerts':
                return `${card(`Alert Rules <small>· self-healing over SSH</small> <button class="ie-btn small" data-act="incident" ${ieFleet.incident ? 'disabled' : ''}>${ieFleet.incident ? 'Incident running…' : '⚡ Simulate incident'}</button>`,
                    `<table class="ie-table"><thead><tr><th>Name</th><th>Applies to</th><th>Condition</th><th>Action</th></tr></thead><tbody>
                    ${IE_RULES.map((r) => `<tr><td><span class="ie-dot ok"></span>${esc(r.name)}</td><td>${esc(r.server)}</td><td>${IE_METRIC[r.type]} ${IE_OP[r.op]} ${r.value}</td>
                    <td>${r.action === 'notify' ? '<span class="ie-muted">Notify only</span>' : `<code>${esc(r.command)}</code>`}</td></tr>`).join('')}</tbody></table>`)}
                    <div class="ie-grid">${card('Rules as XML <small>· import / export, or sync from Git</small>', `<pre class="ie-xml">${esc(rulesXml())}</pre>`)}
                    ${card('History', ieFleet.history.map((h) => `<div class="ie-event"><span class="ie-pill ok">${esc(h.result)}</span><b>${esc(h.server)}</b><span>${esc(h.trigger)} → <code>${esc(h.action)}</code></span><span class="ie-muted">${ieAgo(h.at)}</span></div>`).join(''))}</div>`;
            case 'netra':
                return `<div class="ie-chat">${chat.map((m) => `<div class="ie-msg ${m.from}">${m.from === 'netra' ? IE_LOGO : ''}<div class="ie-bubble">${m.html}</div></div>`).join('')}</div>
                    <div class="ie-suggest">${Object.entries(NETRA_ANSWERS).map(([k, v]) => `<button class="ie-chip" data-ask="${k}" ${typing ? 'disabled' : ''}>${esc(v.q)}</button>`).join('')}</div>
                    <form class="ie-ask"><input placeholder="Ask Netra about your infrastructure…" ${typing ? 'disabled' : ''}><button class="ie-btn" ${typing ? 'disabled' : ''}>Send</button></form>
                    <p class="ie-hint">Demo: Netra has a few prepared answers here. The real Netra queries live metrics and logs and uses your choice of LLM.</p>`;
            case 'kernel': {
                const flagged = IE_KERNEL.filter(([, , cves]) => cves.length).length;
                return `<div class="ie-stats"><div class="ie-stat"><span>Linux servers</span><b>${ieFleet.servers.length}</b></div><div class="ie-stat"><span>Scanned</span><b>${IE_KERNEL.length}</b></div>
                    <div class="ie-stat"><span>Tracked CVEs</span><b>2</b></div><div class="ie-stat warn"><span>Flagged</span><b>${flagged}</b></div></div>
                    ${card(`Kernel Scanner <button class="ie-btn small" data-ask="security">Ask Netra to triage</button>`, `<table class="ie-table"><thead><tr><th>Server</th><th>Kernel</th><th>Findings</th></tr></thead><tbody>
                    ${IE_KERNEL.map(([name, kernel, cves]) => `<tr><td><span class="ie-dot ${cves.length ? 'danger' : 'ok'}"></span>${name}</td><td class="ie-mono">${kernel}</td>
                    <td>${cves.length ? cves.map(([id, desc, sev]) => `<div><span class="ie-pill danger">${sev}</span> <b>${id}</b> <span class="ie-muted">${desc}</span></div>`).join('') : '<span class="ie-muted">No known kernel CVEs</span>'}</td></tr>`).join('')}</tbody></table>`)}`;
            }
            default: {
                const label = IE_NAV.flatMap(([, items]) => items).find(([id]) => id === page)?.[1] || page;
                return card(esc(label), `<div class="ie-full">${IE_LOGO}<p><b>${esc(label)}</b> is part of the full InfraEye app, and isn't simulated in this demo.</p>
                    <p class="ie-muted">Infra maps, VPN tunnels, server hardening, DAST, IaC sync and more run against real infrastructure.</p>
                    <div><button class="ie-btn" data-open="${IE_LINKS.repo}">View on GitHub</button> <button class="ie-btn ghost" data-open="${IE_LINKS.site}">infraeye.manishkarki7.com.np</button></div>
                    <p class="ie-mono ie-muted">brew tap mnshchtri/infra-eye && brew install --cask infra-eye</p></div>`);
            }
        }
    }

    function activityHtml() {
        return ieFleet.activity.slice(0, 9).map((a) => `<div class="ie-act ${a.kind}"><span class="ie-mono ie-muted">${ieAgo(a.at)}</span><span>${a.kind === 'run' ? `<code>${esc(a.text)}</code>` : esc(a.text)}</span></div>`).join('')
            || '<p class="ie-muted">No self-healing actions fired yet.</p>';
    }

    function serverDetail(s) {
        if (s.offline) return card(`${esc(s.name)} <span class="ie-pill danger">offline</span>`, '<p class="ie-muted">Last seen 3 days ago. The Distributed Bridge will reconnect automatically when SSH is reachable again.</p>');
        return card(`${esc(s.name)} <small class="ie-mono">${esc(s.host)} · ${esc(s.os)}</small>`, `<div class="ie-detail">
            <div><canvas class="ie-chart" data-chart="server"></canvas><div class="ie-legend"><i style="--c:#2b9af3"></i>CPU ${s.cpu}% <i style="--c:#8b5cf6"></i>Memory ${s.mem}%</div>
            <p class="ie-muted">Network ↓ ${s.rx} KB/s · ↑ ${s.tx} KB/s</p></div>
            <div><h4>Listening ports</h4>${s.ports.map(([port, proc]) => `<div class="ie-row"><span class="ie-mono">${port}/tcp</span><span>${proc}</span></div>`).join('')}</div></div>`);
    }

    function rulesXml() {
        const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- InfraEye alert / self-healing rules -->\n<AlertRules>\n${IE_RULES.map((r, i) => (
            `  <Rule id="${i + 1}" name="${attr(r.name)}" serverId="${attr(r.server)}" enabled="true">\n    <Condition type="${r.type}" op="${r.op}" value="${r.value}" />\n    <Action type="${r.action}">${r.command}</Action>\n  </Rule>`
        )).join('\n')}\n</AlertRules>`;
    }

    function render() {
        $('.ie-side').innerHTML = nav();
        const main = $('.ie-main');
        const keep = page === 'netra' ? $('.ie-chat')?.scrollTop : main.scrollTop;
        main.innerHTML = pageHtml();
        if (page === 'netra') {
            const box = $('.ie-chat');
            box.scrollTop = typing ? box.scrollHeight : keep ?? box.scrollHeight;
        } else {
            main.scrollTop = keep;
        }
        drawCharts();
        refreshTitle(win);
    }

    // Live pages refresh in place; the Netra chat is left alone so typing isn't interrupted.
    function update() {
        if (!el.isConnected || page === 'netra') return;
        render();
    }

    function drawCharts() {
        el.querySelectorAll('[data-chart]').forEach((cv) => {
            if (cv.dataset.chart === 'fleet') ieChart(cv, [{ data: fleetAvg('cpu'), color: '#2b9af3' }, { data: fleetAvg('mem'), color: '#8b5cf6' }]);
            else {
                const s = ieFleet.servers.find((x) => x.name === selected);
                ieChart(cv, [{ data: s.hist.cpu, color: '#2b9af3' }, { data: s.hist.mem, color: '#8b5cf6' }]);
            }
        });
    }

    function go(p) {
        page = p;
        render();
    }

    function ask(key, text) {
        const answer = key ? NETRA_ANSWERS[key] : netraAnswerFor(text);
        page = 'netra';
        chat.push({ from: 'you', html: `<p>${esc(text || answer.q)}</p>` });
        const msg = { from: 'netra', html: '<p class="ie-muted">Analyzing…</p>' };
        chat.push(msg);
        typing = { msg, full: answer.a, shown: 0 };
        render();
        // Type the answer out, a few characters at a time.
        const stepTyping = () => {
            if (!typing || !el.isConnected) return;
            typing.shown = Math.min(typing.full.length, typing.shown + 9);
            msg.html = ieMarkdown(typing.full.slice(0, typing.shown));
            const bubble = el.querySelector('.ie-msg:last-child .ie-bubble');
            if (bubble && page === 'netra') {
                bubble.innerHTML = msg.html;
                $('.ie-chat').scrollTop = $('.ie-chat').scrollHeight;
            }
            if (typing.shown < typing.full.length) return void setTimeout(stepTyping, 16);
            typing = null;
            if (page === 'netra') render();
        };
        setTimeout(stepTyping, 700);
    }

    return {
        cls: 'infraeye',
        title: () => `InfraEye — ${IE_NAV.flatMap(([, items]) => items).find(([id]) => id === page)?.[1] || 'Dashboard'} (demo)`,
        mount(node, w) {
            el = node;
            win = w;
            el.tabIndex = 0;
            el.innerHTML = `<header class="ie-top">${IE_LOGO}<b>InfraEye</b><span class="ie-demo">DEMO · simulated data</span><span class="ie-gap"></span>
                <button class="ie-btn ghost small" data-open="${IE_LINKS.repo}">GitHub</button><button class="ie-btn small" data-open="${IE_LINKS.site}">Get InfraEye</button></header>
                <div class="ie-body"><nav class="ie-side"></nav><main class="ie-main"></main></div>`;
            const fit = () => el.classList.toggle('ie-narrow', el.clientWidth < 860);
            new ResizeObserver(() => {
                fit();
                drawCharts();
            }).observe(el);
            fit();
            el.addEventListener('click', (e) => {
                const t = e.target;
                const open = t.closest('[data-open]');
                if (open) {
                    track(`out-${open.dataset.open.includes('github') ? 'infraeye-github' : 'infraeye-site'}`);
                    return void window.open(open.dataset.open, '_blank', 'noopener');
                }
                const p = t.closest('[data-page]');
                if (p) return go(p.dataset.page);
                const askBtn = t.closest('[data-ask]');
                if (askBtn && !typing) return ask(askBtn.dataset.ask);
                const row = t.closest('[data-server]');
                if (row) {
                    selected = row.dataset.server === selected ? null : row.dataset.server;
                    return render();
                }
                if (t.closest('[data-act="incident"]') && !ieFleet.incident) {
                    ieFleet.incident = { step: 0 };
                    track('infraeye-incident', 'Simulated an InfraEye incident');
                    ieLog('info', 'Simulation: a traffic spike hits web-01…');
                    render();
                }
            });
            el.addEventListener('submit', (e) => {
                e.preventDefault();
                const field = e.target.querySelector('input');
                const text = field.value.trim();
                if (text && !typing) ask(null, text);
            });
            unsubscribe = ieSubscribe(update);
            render();
        },
        focus() {
            if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
        },
        cleanup() {
            unsubscribe?.();
            typing = null;
        },
    };
}

// ---------- launcher, keybinding, commands ----------

LAUNCH.splice(3, 0, { name: 'InfraEye (demo)', hint: 'Alt+I', action: () => openApp(infraEyeApp()) });
KEYBINDS.splice(5, 0, ['Alt+I', 'InfraEye demo']);

window.addEventListener('keydown', (e) => {
    if (shared.booting || desktopEl.hidden || !launcherEl.hidden || !e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code !== 'KeyI') return;
    e.preventDefault();
    e.stopPropagation();
    openApp(infraEyeApp());
}, true);

function cmdInfraEye({ args }) {
    const pages = { dashboard: 'dashboard', servers: 'servers', k8s: 'kubernetes', kubernetes: 'kubernetes', alerts: 'alerts', rules: 'alerts', netra: 'netra', ai: 'netra', audit: 'kernel', kernel: 'kernel' };
    const start = pages[args[0]] || 'dashboard';
    openApp(infraEyeApp(start), { fromCommand: true });
}

Object.assign(COMMANDS, {
    infraeye: { group: 'Desktop', usage: 'infraeye [dashboard|servers|k8s|alerts|netra|audit]', desc: 'open the InfraEye demo (simulated data)', run: cmdInfraEye },
    'infra-eye': { group: 'Hidden', usage: 'infra-eye', desc: 'open the InfraEye demo', run: cmdInfraEye },
});
