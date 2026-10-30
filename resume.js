'use strict';

// The résumé: a plain, printable CV for people in a hurry. It opens from the "Hire me" button on the
// bar, the launcher, `resume` in a terminal, or straight away from a link ending in #resume.
// Content follows neox's CV (mnshchtri/CV-Resume). The phone number is deliberately left out.

const RESUME = {
    name: 'Manish Karki',
    alias: 'Neox',
    title: 'DevSecOps Engineer | Offensive Security',
    location: 'Kathmandu, Nepal · open to remote',
    email: 'mnshchtri@gmail.com',
    links: [
        ['GitHub', 'https://github.com/mnshchtri'],
        ['LinkedIn', 'https://www.linkedin.com/in/manish-karki-959107171/'],
        ['Website', 'https://manishkarki7.com.np'],
        ['Medium', 'https://medium.com/@neox.exploit'],
    ],
    summary: 'DevSecOps Engineer and offensive security practitioner who secures and operates bare-metal, fintech-grade infrastructure: self-hosted Kubernetes, CI/CD pipelines, load-balanced zero-downtime deployments and Zero Trust architecture. Background in penetration testing, vulnerability assessment and red team simulation, with Python, Bash and Go automation for recon and reporting. Builds open-source tooling, including InfraEye, an agentless observability platform.',
    experience: [
        {
            role: 'DevSecOps Engineer', org: 'Citytech', when: 'May 2026 – Present', where: 'Kathmandu',
            points: [
                'Operate and secure bare-metal infrastructure for a fintech/banking production system: provisioning, hardening and lifecycle management without managed cloud services.',
                'Deploy and manage microservices on self-hosted Kubernetes on bare metal; build Jenkins CI/CD pipelines for build, test and release.',
                'Solved recurring deployment downtime on the bank’s live services: designed a rolling-deployment strategy fronted by HAProxy and Nginx with health-check-gated cutover, giving near-zero-downtime releases.',
                'Administer PostgreSQL infrastructure behind the microservices, keeping data available through deployment cycles.',
                'Brought Zero Trust principles into the environment: least-privilege access, network segmentation and service-level authentication.',
            ],
        },
        {
            role: 'Offensive Security Intern', org: 'InRED Labs', when: 'Jul 2025 – Oct 2025', where: 'Kamal Pokhari, Kathmandu',
            points: [
                'Vulnerability assessments and penetration tests on internal web applications and network infrastructure, through recon, enumeration, exploitation and post-exploitation (Nmap, Burp Suite, Metasploit).',
                'Documented findings with CVE references and mitigation recommendations; automated recon and reporting in Python and Bash.',
                'Worked with the blue team on realistic attack simulations, mapped to MITRE ATT&CK, and on privilege-escalation testing.',
            ],
        },
        {
            role: 'SOP Reviewer / IT Support', org: 'Uni Express', when: 'Feb 2023 – Dec 2024', where: 'Putalisadak, Kathmandu',
            points: ['Managed secure IT infrastructure and endpoint protection; reviewed 100+ academic Statements of Purpose.'],
        },
        {
            role: 'IT Technician / SOP Reviewer', org: 'Yes International Education', when: 'Nov 2018 – Feb 2021', where: 'Putalisadak, Kathmandu',
            points: ['Maintained systems and network infrastructure, implemented security protocols, and ran backups and recovery.'],
        },
    ],
    projects: [
        ['InfraEye', 'Agentless infrastructure observability platform (creator & maintainer). Real-time telemetry across bare metal and Kubernetes, a self-healing engine with SSH remediation, AI log analysis over LLM/MCP, OIDC SSO and a native desktop app. Go, React/TypeScript, PostgreSQL, Redis.', 'https://github.com/mnshchtri/infra-eye'],
        ['TrimurtiSec', 'Python penetration-testing framework with recon, persistence, exploitation and control modes, and markdown reports with CVE mapping.', 'https://github.com/mnshchtri/TrimurtiSec'],
        ['secaudit', 'Read-only security audit for Arch Linux / Omarchy that scores the machine and suggests safe fixes. Now part of OmaPhoenix.', 'https://github.com/mnshchtri/secaudit'],
        ['Wazuh SIEM integration', 'Deployed agents, centralised log collection, alert rules and correlation testing across network hosts.', null],
        ['XSS Security Lab', 'Safe web app to explore reflected, stored and DOM XSS, then fix it with CSP and secure coding.', 'https://github.com/mnshchtri/XssSecurityLab'],
    ],
    skills: [
        ['DevSecOps', 'Bare-metal Kubernetes, Docker, Jenkins, GitHub Actions, HAProxy, Nginx, IaC, automation'],
        ['Security', 'Wazuh (SIEM), Nessus, Burp Suite, Nmap, Metasploit, Wireshark, httpx, Feroxbuster'],
        ['Concepts', 'Zero Trust, OWASP Top 10, MITRE ATT&CK, CVE analysis, IAM'],
        ['Cloud & data', 'AWS (security, architecting, operations), PostgreSQL, Redis'],
        ['Languages', 'Go, Python, Bash, TypeScript/React, SQL, Java, C++ (JUCE audio)'],
        ['Networking', 'TCP/IP, DNS, VPNs, OSPF, firewall rules, packet analysis'],
    ],
    education: [
        ['BSc (Hons) Computer Networking & IT Security', 'Islington College — London Metropolitan University', 'Completed'],
        ['B.E. Electronics & Communication Engineering', 'Sagarmatha Engineering College — Tribhuvan University / IOE', 'Discontinued'],
    ],
    certifications: [
        'AWS Academy: Cloud Security Foundations, Cloud Architecting, Cloud Operations, Cloud Foundations',
        'TCM Security: Practical Ethical Hacking',
        'TryHackMe: SDLC Security, Docker Security, Pre-Security, Advent of Cyber · 30+ TryHackMe / Hack The Box labs',
    ],
};

function resumeHtml() {
    const r = RESUME;
    const link = (url, text = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
    return `<article class="cv">
        <header class="cv-head">
            <h1>${esc(r.name)} <span class="cv-alias">(${esc(r.alias)})</span></h1>
            <p class="cv-title">${esc(r.title)}</p>
            <p class="cv-contact">${esc(r.location)} · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a><br>${r.links.map(([, url]) => link(url)).join(' · ')}</p>
        </header>
        <section><h2>Summary</h2><p>${esc(r.summary)}</p></section>
        <section><h2>Experience</h2>${r.experience.map((j) => `<div class="cv-job">
            <div class="cv-row"><strong>${esc(j.role)} — ${esc(j.org)}</strong><span>${esc(j.when)} · ${esc(j.where)}</span></div>
            <ul>${j.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</section>
        <section><h2>Projects</h2>${r.projects.map(([name, text, url]) => `<p class="cv-proj"><strong>${esc(name)}</strong>${url ? ` <span class="cv-url">${link(url)}</span>` : ''}<br>${esc(text)}</p>`).join('')}</section>
        <section><h2>Skills</h2><dl class="cv-skills">${r.skills.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>
        <section class="cv-two"><div><h2>Education</h2>${r.education.map(([deg, school, status]) => `<p><strong>${esc(deg)}</strong><br>${esc(school)} · ${esc(status)}</p>`).join('')}</div>
            <div><h2>Certifications</h2><ul>${r.certifications.map((cert) => `<li>${esc(cert)}</li>`).join('')}</ul></div></section>
    </article>`;
}

// Printing copies the CV to a top-level element so the print stylesheet can hide the desktop.
function printResume() {
    let root = document.getElementById('print-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'print-root';
        document.body.appendChild(root);
    }
    root.innerHTML = resumeHtml();
    const title = document.title;
    // The PDF's default file name comes from the page title.
    document.title = 'Manish Karki - CV';
    window.addEventListener('afterprint', () => {
        document.title = title;
        root.innerHTML = '';
    }, { once: true });
    window.print();
}

function resumeApp() {
    let root;
    return {
        cls: 'resume',
        title: () => 'Manish Karki — Résumé',
        mount(el) {
            root = el;
            el.tabIndex = 0;
            el.innerHTML = `<div class="cv-bar">
                <button class="btn cv-primary" data-act="pdf">Download PDF</button>
                <button class="btn" data-act="mail">Email me</button>
                <button class="btn" data-act="copy">Copy email</button>
                <span class="cv-bar-gap"></span>
                <button class="btn" data-open="https://www.linkedin.com/in/manish-karki-959107171/">LinkedIn</button>
                <button class="btn" data-open="https://github.com/mnshchtri">GitHub</button>
            </div><div class="cv-scroll">${resumeHtml()}</div>`;
            el.addEventListener('click', async (e) => {
                const open = e.target.closest('[data-open]');
                if (open) return void window.open(open.dataset.open, '_blank', 'noopener');
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'pdf') printResume();
                if (act === 'mail') location.href = `mailto:${RESUME.email}?subject=${encodeURIComponent('Hello from your portfolio')}`;
                if (act === 'copy') {
                    try {
                        await navigator.clipboard.writeText(RESUME.email);
                        notify('Email copied', RESUME.email, 3000);
                    } catch {
                        notify('Email', RESUME.email, 6000);
                    }
                }
            });
            el.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
                    e.preventDefault();
                    printResume();
                }
            });
        },
        focus() {
            root.focus({ preventScroll: true });
        },
    };
}

function openResume({ fromCommand, maximise } = {}) {
    const existing = wm.windows.find((w) => w.app?.cls === 'resume');
    if (existing) {
        const show = () => {
            if (existing.ws !== wm.active) switchWorkspace(existing.ws);
            focusWindow(existing);
        };
        // From a terminal command, wait until the command has finished before moving focus.
        if (fromCommand && focusedBusy()) wm.deferred.push(show);
        else show();
        return existing;
    }
    const win = openApp(resumeApp(), { fromCommand });
    if (win && maximise) toggleFullscreen('max');
    return win;
}

// ---------- bar button, launcher, commands, deep link ----------

barEl.querySelector('.bar-right').insertAdjacentHTML('afterbegin', '<button class="bar-hire" title="Résumé & contact">Hire me</button>');
barEl.querySelector('.bar-hire').addEventListener('click', () => openResume());

LAUNCH.splice(1, 0, { name: 'Résumé / CV', hint: 'Hire me', action: () => openResume() });

function cmdResume({ args }) {
    if (args.includes('--print') || args.includes('-p')) return void printResume();
    openResume({ fromCommand: true });
}

Object.assign(COMMANDS, {
    resume: { group: 'Desktop', usage: 'resume [--print]', desc: 'open my résumé (or print / save it as PDF)', run: cmdResume },
    cv: { group: 'Hidden', usage: 'cv', desc: 'open my résumé', run: cmdResume },
    hire: { group: 'Hidden', usage: 'hire', desc: 'open my résumé', run: cmdResume },
});

// A link ending in #resume (or #cv) skips the boot and opens the résumé, for job applications.
const RESUME_LINK = /^#(resume|cv)$/i.test(location.hash);
desktopReadyHooks.push(() => {
    if (RESUME_LINK) openResume({ maximise: true });
});
