'use strict';

// Obsidian with a public slice of neox's second brain: notes linked by [[wikilinks]], backlinks,
// tags, search and the graph view. The vault lives at ~/Documents/Neox Vault.

const VAULT = `${HOME}/Documents/Neox Vault`;

const VAULT_NOTES = {
    'Home.md': `---
tags: [index]
updated: 2026-10-30
---
# Neox

DevSecOps engineer who came up through offensive security. This vault is the public slice of my second brain — start anywhere and follow the links, or open the **graph view** to see how it all connects.

## Work
- [[Citytech]] — DevSecOps Engineer, now
- [[InRED Labs]] — Offensive Security Intern

## Building
- [[InfraEye]] · [[DeployForge]] · [[CyberLynX]]
- [[TrimurtiSec]] · [[secaudit]]

## Craft
- [[Kubernetes on bare metal]] · [[Zero Trust]]
- [[Recon workflow]] · [[Privilege escalation]]

## Life
- [[Music]] · [[Audio DSP]] · [[Now]]

> [!tip] Try it live
> This whole site is a Linux box. It's also a CTF: seven flags and some hidden quests (run \`ctf\`). For the root one, see [[Privilege escalation]] for the mindset.

#index`,

    'Work/Citytech.md': `---
tags: [work, devsecops]
role: DevSecOps Engineer
since: 2026-05
---
# Citytech

DevSecOps Engineer since May 2026, on bare-metal infrastructure for a fintech/banking production system — no managed cloud to lean on.

## What I do
- Provision, harden and run the servers end to end
- Run microservices on self-hosted Kubernetes → [[Kubernetes on bare metal]]
- Jenkins CI/CD for build, test and release
- PostgreSQL behind the microservices
- Least privilege, segmentation, service-level auth → [[Zero Trust]]

## The win I'm proudest of
Releases were taking the bank's live services down: bare-metal Kubernetes has no managed load-balancer failover. I designed a rolling deployment fronted by HAProxy and Nginx with health-check-gated cutover. Now releases are near zero-downtime.

Came here from [[InRED Labs]]. Built [[InfraEye]] partly because I wanted this kind of visibility.

#work #devsecops`,

    'Work/InRED Labs.md': `---
tags: [work, offsec]
role: Offensive Security Intern
period: 2025-07 → 2025-10
---
# InRED Labs

Offensive Security Intern, July – October 2025, Kamal Pokhari, Kathmandu.

- Vulnerability assessments and pentests on web apps and networks
- Full kill chain: recon → enumeration → exploitation → post-exploitation
- Findings documented with CVE references and mitigations
- Python and Bash tooling to automate recon and reporting → [[Recon workflow]]
- Purple-team sessions with the blue team; techniques mapped to MITRE ATT&CK
- Privilege escalation testing → [[Privilege escalation]]

What I took with me: [[TrimurtiSec]] grew out of the scripts I kept rewriting here.

Next: [[Citytech]].

#work #offsec`,

    'Projects/InfraEye.md': `---
tags: [project, observability]
status: production
repo: https://github.com/mnshchtri/infra-eye
---
# InfraEye

> Observing the unseen · healing the broken

Agentless infrastructure observability. I'm the creator and maintainer.

- Real-time CPU, memory, disk and network across bare metal and Kubernetes
- **Self-healing engine**: alert rules trigger SSH remediation
- Kubernetes explorer with one-click diagnostics
- AI log analysis and cluster troubleshooting over LLM/MCP
- Enterprise SSO (OIDC: Keycloak, Auth0, Okta, Azure AD)
- Native desktop app (Wails + SQLite), shipped through a Homebrew tap

Website: https://infraeye.manishkarki7.com.np

> [!tip] Try the demo
> Press Alt+I on this desktop, or run \`infraeye\` in a terminal. Hit **Simulate incident** to watch a self-healing rule fire.

Related: [[Kubernetes on bare metal]] · [[DeployForge]] · born from work at [[Citytech]]

#project`,

    'Projects/DeployForge.md': `---
tags: [project, platform]
status: done (private)
---
# DeployForge

A self-hosted deployment platform in the spirit of Vercel, Render and Coolify — on your own Kubernetes cluster.

Push or press Deploy: it builds the exact commit with BuildKit, streams logs, rolls the new version out beside the live one and only switches traffic once it's healthy. The same idea as my rollout fix at [[Citytech]], turned into a product.

- Platform subdomains and verified custom domains
- Encrypted per-environment secrets
- Preview deployments per branch, one-click rollback and promotion
- Hardened with failure injection, load tests and an authz sweep

Runs on [[Kubernetes on bare metal]]. Observed by [[InfraEye]].

#project`,

    'Projects/CyberLynX.md': `---
tags: [project, offsec]
status: private
---
# CyberLynX

Security orchestration and automation: one interface over the scanners I use anyway.

Integrates Nmap, Naabu, Nuclei, Nikto, Trivy, Subfinder, httpx, ffuf, Katana, CVEMap and Wappalyzer, with a Helm chart for cluster installs.

It's my [[Recon workflow]] as a product. Pairs with [[TrimurtiSec]].

#project #offsec`,

    'Projects/TrimurtiSec.md': `---
tags: [project, offsec]
repo: https://github.com/mnshchtri/TrimurtiSec
---
# TrimurtiSec

A Python penetration-testing framework named after the Hindu trinity.

| Mode | Phase |
| --- | --- |
| Brahma | Reconnaissance |
| Vishnu | Persistence |
| Shiva | Exploitation |
| God | Control |

Generates structured markdown reports with CVE mapping. Started from scripts at [[InRED Labs]]; the recon side overlaps with [[Recon workflow]] and [[CyberLynX]].

#project #offsec`,

    'Projects/secaudit.md': `---
tags: [project, linux]
repo: https://github.com/mnshchtri/secaudit
---
# secaudit

A read-only security audit for Arch Linux and Omarchy: checks the machine, scores it, explains each finding and suggests a safe fix. Bash engine, a Textual TUI and a gum front-end. Now part of OmaPhoenix as \`omaphoenix audit\`.

The defensive mirror of [[Privilege escalation]] — every check is something an attacker would look for.

#project #linux`,

    'Craft/Kubernetes on bare metal.md': `---
tags: [devsecops, kubernetes]
---
# Kubernetes on bare metal

Notes from running it for real at [[Citytech]].

## No cloud load balancer
The first surprise. Rollouts that look fine on managed Kubernetes cause outages when nothing outside the cluster knows a pod is draining.

> [!note] What worked
> HAProxy + Nginx in front, rolling deployments, and cutover gated on health checks. Traffic only moves once the new version answers.

## Other lessons
- Multi-arch images (\`docker buildx\`, amd64 + arm64) save a lot of pain
- Gateway API over classic Ingress for routing
- Observe everything → [[InfraEye]]
- Least privilege from day one → [[Zero Trust]]

Productised in [[DeployForge]].

#devsecops #kubernetes`,

    'Craft/Zero Trust.md': `---
tags: [security, devsecops]
---
# Zero Trust

Never trust the network position; verify every request.

- [ ] Least-privilege service accounts and humans
- [x] Network segmentation between workloads
- [x] Service-level authentication
- [ ] Short-lived credentials everywhere

Applied at [[Citytech]] on [[Kubernetes on bare metal]]. The attacker's view of why it matters: [[Privilege escalation]].

#security #devsecops`,

    'Craft/Recon workflow.md': `---
tags: [offsec]
---
# Recon workflow

My default pipeline for authorised engagements:

\`\`\`sh
subfinder -d target.tld -silent | httpx -silent -title -tech-detect
nuclei -l live.txt -severity medium,high,critical
katana -u https://target.tld -d 3 | ffuf ...
\`\`\`

> [!warning] Scope first
> Written authorisation before a single packet. No exceptions.

Automated in [[CyberLynX]] and [[TrimurtiSec]]. Learned the hard way at [[InRED Labs]].

#offsec`,

    'Craft/Privilege escalation.md': `---
tags: [offsec, linux]
---
# Privilege escalation

Linux checklist, in the order I actually run it:

1. \`id\`, \`sudo -l\` — what can I already do?
2. \`cat /etc/passwd\` — who else lives here?
3. Readable history and dotfiles — people paste secrets into commands
4. SUID binaries, writable cron jobs and PATH entries
5. Credentials in configs, environment, backups

> [!tip] Practice on this site
> You start as \`visitor\` on this very box. Open a terminal (Alt+Enter) and try to read \`/root/flag.txt\`. Stuck? Run \`ctf hint 6\`. The scoreboard (\`ctf\`) has five more challenges.

The defensive side: [[secaudit]] and [[Zero Trust]]. Practised at [[InRED Labs]].

#offsec #linux`,

    'Life/Music.md': `---
tags: [music]
---
# Music

Guitar player and producer — making beats when inspiration strikes. Where music and code meet is my favourite place to be → [[Audio DSP]].

## Recent uploads (Neox Music)
- E8 Lattice
- साइकेडेलिक सपना (Psychedelic dreams)
- मनको बन्धन (Maan ko Bandhan)
- अँध्यारो मानसिकता (Adhyaro mansikta)
- अन्धकारको प्राचीन कथा (The Ancient Tale of Darkness)

Listen: https://www.youtube.com/@lynthrax · Beats: https://www.beatstars.com/kazibaubeat

Or press Alt+M on this desktop.

#music`,

    'Life/Audio DSP.md': `---
tags: [music, project]
---
# Audio DSP

Writing the effects instead of just using them.

- **Audio DSP Guitar Rig** — JUCE/C++ stompbox pedalboard for live guitar: reorder pedals, bypass, presets
- **Oxidaw** — browser DAW with a Rust DSP core (WASM)
- **SignalVerse** — an interactive lab for learning DSP from zero

All of it feeds back into [[Music]].

#music #project`,

    'Life/Now.md': `---
tags: [now]
updated: 2026-10-30
---
# Now

What I'm focused on this month:

- Platform engineering and Kubernetes security → [[Kubernetes on bare metal]]
- Shipping [[InfraEye]] features
- Audio DSP in Rust and C++ → [[Audio DSP]]
- AI-assisted security automation → [[CyberLynX]]
- This portfolio, which turned into a whole desktop → [[2026-10-30]]

#now`,

    'Journal/2026-10-30.md': `---
tags: [journal]
---
# 2026-10-30

Rebuilt my portfolio as a Linux desktop — Hyprland-style tiling, my Omarchy theme and wallpapers, a shell with users and sudo, and a root challenge ([[Privilege escalation]]).

Added a browser, Files, VS Code (it opens this site's own source) and Obsidian — the app you're reading this in.

Back to [[Now]] · [[Home]]

#journal`,
};

getNode(HOME).children.Documents = { type: 'dir', children: {} };
for (const [path, content] of Object.entries(VAULT_NOTES)) {
    const parts = `Neox Vault/${path}`.split('/');
    let node = getNode(`${HOME}/Documents`);
    for (const dir of parts.slice(0, -1)) node = node.children[dir] ??= { type: 'dir', children: {} };
    node.children[parts.at(-1)] = { type: 'file', content: `${content}\n` };
}

// ---------- vault index ----------

function vaultNotes() {
    const out = [];
    (function walk(dir) {
        for (const [n, child] of Object.entries(getNode(dir).children).sort()) {
            const abs = `${dir}/${n}`;
            if (child.type === 'dir') walk(abs);
            else if (n.endsWith('.md')) out.push(abs);
        }
    })(VAULT);
    return out;
}

const noteName = (abs) => basename(abs).replace(/\.md$/, '');
const findNote = (name) => vaultNotes().find((abs) => noteName(abs).toLowerCase() === name.trim().toLowerCase()) || null;

function linksOf(abs) {
    const text = getNode(abs)?.content || '';
    return [...new Set([...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim()))];
}

function tagsOf(abs) {
    const text = getNode(abs)?.content || '';
    const body = [...text.replace(/```[\s\S]*?```/g, '').matchAll(/(?:^|\s)#([a-zA-Z][\w/-]*)/g)].map((m) => m[1]);
    const front = text.match(/^---\n[\s\S]*?\ntags:\s*\[([^\]]*)\]/)?.[1].split(',').map((t) => t.trim()).filter(Boolean) || [];
    return [...new Set([...front, ...body])];
}

function backlinksOf(abs) {
    const name = noteName(abs).toLowerCase();
    return vaultNotes().filter((n) => n !== abs && linksOf(n).some((l) => l.toLowerCase() === name));
}

// ---------- markdown ----------

function mdInline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
        const hit = findNote(target);
        return `<a class="ob-link${hit ? '' : ' unresolved'}" data-note="${esc(hit || '')}">${alias || target}</a>`;
    });
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,)])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    s = s.replace(/(^|\s)#([a-zA-Z][\w/-]*)/g, '$1<a class="ob-tag" data-tag="$2">#$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function renderMarkdown(src) {
    let text = src;
    let props = '';
    const front = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (front) {
        text = text.slice(front[0].length);
        const rows = front[1].split('\n').map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean);
        props = `<div class="ob-props"><div class="ob-props-title">Properties</div>${rows.map(([, k, v]) => {
            const value = k === 'tags'
                ? v.replace(/[[\]]/g, '').split(',').map((t) => `<a class="ob-pill" data-tag="${esc(t.trim())}">${esc(t.trim())}</a>`).join(' ')
                : mdInline(v);
            return `<div class="ob-prop"><span>${esc(k)}</span><span>${value}</span></div>`;
        }).join('')}</div>`;
    }
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('```')) {
            const lang = line.slice(3).trim();
            const body = [];
            while (++i < lines.length && !lines[i].startsWith('```')) body.push(lines[i]);
            out.push(`<pre class="ob-code"><code>${typeof highlightCode === 'function' ? highlightCode(body.join('\n'), langOf(`x.${lang}`)) : esc(body.join('\n'))}</code></pre>`);
            i++;
        } else if (/^#{1,6} /.test(line)) {
            const level = line.match(/^#+/)[0].length;
            out.push(`<h${level}>${mdInline(line.slice(level + 1))}</h${level}>`);
            i++;
        } else if (/^(---|\*\*\*)\s*$/.test(line)) {
            out.push('<hr>');
            i++;
        } else if (line.startsWith('>')) {
            const body = [];
            while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
            const callout = body[0].match(/^\[!(\w+)\]\s*(.*)$/);
            if (callout) {
                const kind = callout[1].toLowerCase();
                out.push(`<div class="ob-callout c-${esc(kind)}"><div class="ob-callout-title">${mdInline(callout[2] || kind)}</div>${body.slice(1).map((l) => `<p>${mdInline(l)}</p>`).join('')}</div>`);
            } else {
                out.push(`<blockquote>${body.map((l) => `<p>${mdInline(l)}</p>`).join('')}</blockquote>`);
            }
        } else if (/^\|.*\|\s*$/.test(line)) {
            const rows = [];
            while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
            const cells = (r) => r.trim().slice(1, -1).split('|').map((cell) => cell.trim());
            const body = rows.filter((r, n) => !(n === 1 && /^[\s|:-]+$/.test(r)));
            out.push(`<table><thead><tr>${cells(body[0]).map((h) => `<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((d) => `<td>${mdInline(d)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        } else if (/^\s*([-*]|\d+\.) /.test(line)) {
            const ordered = /^\s*\d+\./.test(line);
            const items = [];
            while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
                const item = lines[i++].replace(/^\s*([-*]|\d+\.) /, '');
                const task = item.match(/^\[( |x)\] (.*)$/i);
                items.push(task
                    ? `<li class="ob-task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${mdInline(task[2])}</li>`
                    : `<li>${mdInline(item)}</li>`);
            }
            out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
        } else if (!line.trim()) {
            i++;
        } else {
            const para = [];
            while (i < lines.length && lines[i].trim() && !/^(#{1,6} |```|>|\||\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++]);
            out.push(`<p>${mdInline(para.join(' '))}</p>`);
        }
    }
    return props + out.join('');
}

// ---------- graph view ----------

function graphView(canvas, current, onOpen) {
    const ctx = canvas.getContext('2d');
    const notes = vaultNotes();
    const nodes = notes.map((abs, i) => ({
        abs, name: noteName(abs), x: Math.cos(i * 2.4) * (60 + i * 9), y: Math.sin(i * 2.4) * (60 + i * 9), vx: 0, vy: 0,
    }));
    const byName = Object.fromEntries(nodes.map((n) => [n.name.toLowerCase(), n]));
    const edges = [];
    for (const n of nodes) for (const l of linksOf(n.abs)) if (byName[l.toLowerCase()] && byName[l.toLowerCase()] !== n) edges.push([n, byName[l.toLowerCase()]]);
    for (const n of nodes) n.deg = edges.filter(([a, b]) => a === n || b === n).length;
    let hover = null;
    let drag = null;
    let heat = 1;
    let frame = 0;
    // The view eases towards a zoom that fits every node, whatever the window size.
    const view = { s: 1, cx: 0, cy: 0 };
    const toWorld = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - r.width / 2) / view.s + view.cx, y: (e.clientY - r.top - r.height / 2) / view.s + view.cy };
    };
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    function step() {
        for (const a of nodes) {
            for (const b of nodes) {
                if (a === b) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d2 = Math.max(100, dx * dx + dy * dy);
                a.vx += (dx / d2) * 260;
                a.vy += (dy / d2) * 260;
            }
            a.vx -= a.x * 0.02;
            a.vy -= a.y * 0.02;
        }
        for (const [a, b] of edges) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            const f = (d - 80) * 0.03;
            a.vx += (dx / d) * f;
            a.vy += (dy / d) * f;
            b.vx -= (dx / d) * f;
            b.vy -= (dy / d) * f;
        }
        for (const n of nodes) {
            if (n === drag) continue;
            n.x += n.vx * heat;
            n.y += n.vy * heat;
            n.vx *= 0.6;
            n.vy *= 0.6;
        }
        heat = Math.max(0.02, heat * 0.985);
    }

    function draw() {
        const dpr = devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
        }
        const xs = nodes.map((n) => n.x);
        const ys = nodes.map((n) => n.y);
        const bw = Math.max(...xs) - Math.min(...xs) + 160;
        const bh = Math.max(...ys) - Math.min(...ys) + 80;
        const fit = Math.min(1.6, w / bw, h / bh);
        if (!drag) {
            view.s += (fit - view.s) * 0.15;
            view.cx += ((Math.max(...xs) + Math.min(...xs)) / 2 - view.cx) * 0.15;
            view.cy += ((Math.max(...ys) + Math.min(...ys)) / 2 - view.cy) * 0.15;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (w / 2 - view.cx * view.s), dpr * (h / 2 - view.cy * view.s));
        const near = hover ? new Set([hover, ...edges.filter(([a, b]) => a === hover || b === hover).flat()]) : null;
        ctx.lineWidth = 1 / view.s;
        for (const [a, b] of edges) {
            const lit = hover && (a === hover || b === hover);
            ctx.strokeStyle = lit ? css('--accent') : css('--dim');
            ctx.globalAlpha = hover && !lit ? 0.15 : 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.font = `${12 / view.s}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        for (const n of nodes) {
            const r = 4 + Math.sqrt(n.deg) * 2.2;
            ctx.globalAlpha = near && !near.has(n) ? 0.2 : 1;
            ctx.fillStyle = n === hover || n.abs === current ? css('--accent') : css('--fg');
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = css('--fg');
            ctx.globalAlpha *= hover && !near.has(n) ? 1 : 0.85;
            ctx.fillText(n.name, n.x, n.y + r + 13 / view.s);
        }
        ctx.globalAlpha = 1;
    }

    function loop() {
        step();
        draw();
        frame = requestAnimationFrame(loop);
    }

    const at = (e) => {
        const { x, y } = toWorld(e);
        return nodes.find((n) => Math.hypot(n.x - x, n.y - y) < (10 + Math.sqrt(n.deg) * 2) / Math.min(1, view.s)) || null;
    };
    let moved = false;
    canvas.addEventListener('mousemove', (e) => {
        if (drag) {
            ({ x: drag.x, y: drag.y } = toWorld(e));
            moved = true;
            heat = Math.max(heat, 0.3);
        } else {
            hover = at(e);
            canvas.style.cursor = hover ? 'pointer' : 'default';
        }
    });
    canvas.addEventListener('mousedown', (e) => {
        drag = at(e);
        moved = false;
    });
    const release = () => {
        const clicked = drag && !moved ? drag.abs : null;
        drag = null;
        if (clicked) onOpen(clicked);
    };
    window.addEventListener('mouseup', release);
    canvas.addEventListener('mouseleave', () => { hover = null; });
    loop();
    return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('mouseup', release);
    };
}

// ---------- the app ----------

const OB = (paths) => GI(paths, 'obicon');
const OBI = {
    files: OB('<path d="M3 6h6l2 2h10v11H3z"/>'),
    search: OB('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    graph: OB('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="9" cy="18" r="2"/><path d="M8 7l8 1"/><path d="M7 8l1.5 8"/><path d="M17 10l-6.5 7"/>'),
    edit: OB('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    read: OB('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    chevron: GI('<path d="M9 6l6 6-6 6"/>', 'vschev'),
};

function obsidianApp(startNote = `${VAULT}/Home.md`) {
    let el;
    let win;
    let current = startNote;
    let mode = 'note'; // note | graph
    let source = false;
    let leftView = 'files';
    let stopGraph = null;
    const collapsed = new Set();
    const $ = (sel) => el.querySelector(sel);

    function openNote(abs) {
        if (!abs) return;
        current = abs;
        mode = 'note';
        render();
    }

    function treeHtml(dir, depth) {
        const node = getNode(dir);
        return Object.keys(node.children)
            .sort((a, b) => (node.children[b].type === 'dir') - (node.children[a].type === 'dir') || a.localeCompare(b))
            .map((n) => {
                const abs = `${dir}/${n}`;
                if (node.children[n].type === 'dir') {
                    const open = !collapsed.has(abs);
                    return `<button class="ob-row ob-folder${open ? ' open' : ''}" data-folder="${esc(abs)}" style="--d:${depth}">${OBI.chevron}${esc(n)}</button>${open ? treeHtml(abs, depth + 1) : ''}`;
                }
                return `<button class="ob-row${abs === current && mode === 'note' ? ' on' : ''}" data-note="${esc(abs)}" style="--d:${depth}">${esc(n.replace(/\.md$/, ''))}</button>`;
            }).join('');
    }

    function renderLeft() {
        el.querySelectorAll('.ob-ribbon [data-left]').forEach((b) => b.classList.toggle('on', b.dataset.left === leftView));
        $('.ob-ribbon [data-act="graph"]').classList.toggle('on', mode === 'graph');
        const left = $('.ob-left');
        if (leftView === 'files') {
            left.innerHTML = `<div class="ob-vault">Neox Vault</div><div class="ob-tree">${treeHtml(VAULT, 0)}</div>`;
        } else {
            left.innerHTML = '<input class="ob-search" placeholder="Search…" spellcheck="false"><div class="ob-results"></div>';
            const box = left.querySelector('.ob-search');
            box.addEventListener('input', () => renderSearch(box.value));
            renderSearch(box.dataset.q || '');
            box.focus();
        }
    }

    function searchFor(q) {
        leftView = 'search';
        renderLeft();
        const box = $('.ob-search');
        box.value = q;
        renderSearch(q);
    }

    function renderSearch(q) {
        const box = $('.ob-results');
        if (!q.trim()) return void (box.innerHTML = '<div class="ob-empty">Type to search the vault. Tags work too: #offsec</div>');
        const needle = q.trim().toLowerCase();
        const hits = vaultNotes().filter((abs) => (needle.startsWith('#')
            ? tagsOf(abs).includes(needle.slice(1))
            : `${noteName(abs)}\n${getNode(abs).content}`.toLowerCase().includes(needle)));
        box.innerHTML = `<div class="ob-empty">${hits.length} result${hits.length === 1 ? '' : 's'}</div>` + hits.map((abs) => {
            const content = getNode(abs).content.replace(/^---[\s\S]*?---\n/, '');
            const at = content.toLowerCase().indexOf(needle);
            const snippet = at < 0 ? '' : esc(content.slice(Math.max(0, at - 30), at + 60)).replace(new RegExp(esc(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), (m) => `<mark>${m}</mark>`);
            return `<button class="ob-hit" data-note="${esc(abs)}"><b>${esc(noteName(abs))}</b><span>${snippet}</span></button>`;
        }).join('');
    }

    function renderRight() {
        const right = $('.ob-right');
        if (mode === 'graph') return void (right.innerHTML = '<div class="ob-pane-title">Graph view</div><div class="ob-empty">Click a node to open it. Drag nodes to rearrange.</div>');
        const back = backlinksOf(current);
        const outs = linksOf(current);
        const tags = tagsOf(current);
        right.innerHTML = `<div class="ob-pane-title">Backlinks <span class="ob-count">${back.length}</span></div>
            ${back.map((abs) => `<button class="ob-row" data-note="${esc(abs)}">${esc(noteName(abs))}</button>`).join('') || '<div class="ob-empty">No backlinks found.</div>'}
            <div class="ob-pane-title">Outgoing links <span class="ob-count">${outs.length}</span></div>
            ${outs.map((l) => {
                const hit = findNote(l);
                return `<button class="ob-row${hit ? '' : ' unresolved'}" data-note="${esc(hit || '')}">${esc(l)}</button>`;
            }).join('') || '<div class="ob-empty">No outgoing links.</div>'}
            <div class="ob-pane-title">Tags</div><div class="ob-tags">${tags.map((t) => `<a class="ob-pill" data-tag="${esc(t)}">#${esc(t)}</a>`).join(' ')}</div>`;
    }

    function render() {
        stopGraph?.();
        stopGraph = null;
        renderLeft();
        renderRight();
        const main = $('.ob-view');
        const head = $('.ob-head');
        if (mode === 'graph') {
            head.innerHTML = '<span class="ob-title">Graph view</span>';
            main.innerHTML = '<canvas class="ob-graph"></canvas>';
            stopGraph = graphView(main.querySelector('canvas'), current, openNote);
            $('.ob-status').textContent = `${vaultNotes().length} notes`;
        } else {
            const content = getNode(current).content;
            const crumbs = current.slice(VAULT.length + 1).replace(/\.md$/, '').split('/');
            head.innerHTML = `<span class="ob-title">${crumbs.map(esc).join(' <span class="dim">/</span> ')}</span>
                <button class="ob-mode" data-act="mode" title="${source ? 'Reading view' : 'Source view'}">${source ? OBI.read : OBI.edit}</button>`;
            main.innerHTML = source
                ? `<textarea class="ob-source" readonly spellcheck="false"></textarea>`
                : `<article class="ob-note">${renderMarkdown(content)}</article>`;
            if (source) main.querySelector('textarea').value = content;
            main.scrollTop = 0;
            const words = content.replace(/^---[\s\S]*?---\n/, '').split(/\s+/).filter(Boolean).length;
            $('.ob-status').textContent = `${backlinksOf(current).length} backlinks   ${words} words   ${content.length} characters`;
        }
        refreshTitle(win);
        keepFocus();
    }

    // Re-rendering removes the clicked element; keep focus in the window so shortcuts keep working.
    function keepFocus() {
        if (wm.focused === win && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }

    return {
        cls: 'obsidian',
        title: () => `${mode === 'graph' ? 'Graph view' : noteName(current)} - Neox Vault - Obsidian`,
        mount(node, w) {
            el = node;
            win = w;
            el.innerHTML = `<nav class="ob-ribbon"><button data-left="files" title="Files">${OBI.files}</button><button data-left="search" title="Search (Ctrl+Shift+F)">${OBI.search}</button>
                <button data-act="graph" title="Graph view (Ctrl+G)">${OBI.graph}</button></nav>
                <aside class="ob-left"></aside>
                <section class="ob-center"><div class="ob-head"></div><div class="ob-view"></div></section>
                <aside class="ob-right"></aside>
                <footer class="ob-status"></footer>`;
            el.tabIndex = 0;
            // Side panes collapse as the tile gets narrower, like Obsidian's responsive layout.
            const fit = () => {
                el.classList.toggle('ob-narrow', el.clientWidth < 1000);
                el.classList.toggle('ob-tiny', el.clientWidth < 640);
            };
            new ResizeObserver(fit).observe(el);
            fit();
            el.addEventListener('click', (e) => {
                const t = e.target;
                const note = t.closest('[data-note]');
                if (note) {
                    e.preventDefault();
                    return note.dataset.note && openNote(note.dataset.note);
                }
                const tag = t.closest('[data-tag]');
                if (tag) return searchFor(`#${tag.dataset.tag}`);
                const folder = t.closest('[data-folder]');
                if (folder) {
                    const f = folder.dataset.folder;
                    if (collapsed.has(f)) collapsed.delete(f);
                    else collapsed.add(f);
                    renderLeft();
                    return keepFocus();
                }
                const left = t.closest('[data-left]');
                if (left) {
                    leftView = left.dataset.left;
                    renderLeft();
                    return keepFocus();
                }
                const act = t.closest('[data-act]')?.dataset.act;
                if (act === 'graph') {
                    mode = mode === 'graph' ? 'note' : 'graph';
                    render();
                }
                if (act === 'mode') {
                    source = !source;
                    render();
                }
            });
            el.addEventListener('keydown', (e) => {
                const k = e.key.toLowerCase();
                if (e.ctrlKey && k === 'g') {
                    e.preventDefault();
                    mode = mode === 'graph' ? 'note' : 'graph';
                    render();
                } else if (e.ctrlKey && k === 'e') {
                    e.preventDefault();
                    source = !source;
                    render();
                } else if (e.ctrlKey && e.shiftKey && k === 'f') {
                    e.preventDefault();
                    searchFor('');
                }
            });
            render();
        },
        focus() {
            if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
        },
        cleanup() {
            stopGraph?.();
        },
    };
}

// ---------- launcher, keybinding, commands ----------

LAUNCH.splice(5, 0, { name: 'Obsidian', hint: 'Alt+Shift+O', action: () => openApp(obsidianApp()) });
KEYBINDS.splice(6, 0, ['Alt+Shift+O', 'Obsidian']);

window.addEventListener('keydown', (e) => {
    if (shared.booting || desktopEl.hidden || !launcherEl.hidden || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (e.code !== 'KeyO') return;
    e.preventDefault();
    e.stopPropagation();
    openApp(obsidianApp());
}, true);

function cmdObsidian({ args }) {
    const name = args.join(' ');
    const note = name ? findNote(name.replace(/\.md$/, '')) : `${VAULT}/Home.md`;
    if (!note) return err(`obsidian: no note named '${name}' (try: ls "${VAULT}")`);
    openApp(obsidianApp(note), { fromCommand: true });
}

COMMANDS.obsidian = { group: 'Desktop', usage: 'obsidian [NOTE]', desc: 'open the Neox Vault in Obsidian', run: cmdObsidian };
