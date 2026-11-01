'use strict';

// The résumé: a plain, printable CV for people in a hurry. It opens from the "Hire me" button on the
// bar, the launcher, `resume` in a terminal, or straight away from a link ending in #resume.
// The text matches the LaTeX CV in cv/Manish-Karki-CV.tex, whose compiled PDF is what "Download PDF"
// hands out; change both together. The phone number is deliberately left out.

const RESUME = {
    name: 'Manish Karki',
    alias: 'Neox',
    title: 'DevSecOps Engineer',
    location: 'Kathmandu, Nepal · open to remote',
    email: 'mnshchtri@gmail.com',
    links: [
        ['GitHub', 'https://github.com/mnshchtri'],
        ['LinkedIn', 'https://www.linkedin.com/in/manish-karki-959107171/'],
        ['Website', 'https://manishkarki7.com.np'],
        ['Medium', 'https://medium.com/@neox.exploit'],
    ],
    summary: 'DevSecOps Engineer who runs and secures bare-metal, fintech-grade production infrastructure: self-hosted Kubernetes, Jenkins CI/CD, HAProxy and Nginx load balancing, PostgreSQL and Zero Trust controls. Came up through offensive security (penetration testing, vulnerability assessment, red-team simulation), so systems get built the way an attacker would test them. Automates with Go, Python and Bash; creator of InfraEye, an open-source observability platform.',
    experience: [
        {
            role: 'DevSecOps Engineer', org: 'Citytech', when: 'May 2026 – Present', where: 'Kathmandu',
            points: [
                'Operate and harden bare-metal infrastructure for a banking/fintech production system, owning provisioning, hardening and lifecycle management without managed cloud services.',
                'Deploy and run microservices on self-hosted Kubernetes; build and maintain Jenkins CI/CD pipelines for build, test and release.',
                'Eliminated recurring deployment downtime on the bank’s live services by designing a rolling-deployment strategy behind HAProxy and Nginx with health-check-gated cutover, achieving near-zero-downtime releases.',
                'Administer PostgreSQL behind the microservices, keeping data available through every deployment cycle.',
                'Introduced Zero Trust controls: least-privilege access, network segmentation and service-level authentication.',
            ],
        },
        {
            role: 'Offensive Security Intern', org: 'InRED Labs', when: 'Jul 2025 – Oct 2025', where: 'Kamal Pokhari, Kathmandu',
            points: [
                'Performed vulnerability assessments and penetration tests on internal web applications and network infrastructure, from recon and enumeration through exploitation and post-exploitation (Nmap, Burp Suite, Metasploit).',
                'Reported findings with CVE references and remediation guidance; automated recon and reporting in Python and Bash.',
                'Ran realistic attack simulations with the blue team, mapped to MITRE ATT&CK, including privilege-escalation testing.',
            ],
        },
        {
            role: 'IT Support and SOP Reviewer', org: 'Uni Express', when: 'Feb 2023 – Dec 2024', where: 'Putalisadak, Kathmandu',
            points: ['Managed IT infrastructure and endpoint protection; reviewed 100+ academic Statements of Purpose.'],
        },
        {
            role: 'IT Technician and SOP Reviewer', org: 'Yes International Education', when: 'Nov 2018 – Feb 2021', where: 'Putalisadak, Kathmandu',
            points: ['Maintained systems and network infrastructure, implemented security protocols, and ran backups and recovery.'],
        },
    ],
    projects: [
        ['InfraEye', 'Agentless infrastructure observability platform (creator & maintainer). Real-time telemetry across bare metal and Kubernetes, a self-healing engine that turns alert rules into automated SSH remediation, AI log analysis over LLM/MCP, OIDC SSO and a native macOS/Linux desktop app shipped via Homebrew. Go, React/TypeScript, PostgreSQL, Redis, Wails.', 'https://github.com/mnshchtri/infra-eye'],
        ['DeployForge', 'Self-hosted deployment platform on Kubernetes: builds each commit with BuildKit, rolls out beside the live version and switches traffic only once healthy; preview deployments, one-click rollback, encrypted secrets, custom domains. (Private.)', null],
        ['TrimurtiSec', 'Python penetration-testing framework with recon, persistence, exploitation and control modes, and markdown reports with CVE mapping.', 'https://github.com/mnshchtri/TrimurtiSec'],
        ['secaudit', 'Read-only security audit for Arch Linux / Omarchy that scores the machine and suggests safe fixes. Now part of OmaPhoenix.', 'https://github.com/mnshchtri/secaudit'],
        ['Wazuh SIEM integration', 'Deployed agents, centralised log collection, alert rules and correlation testing across network hosts.', null],
        ['XSS Security Lab', 'Safe web app to explore reflected, stored and DOM XSS, then fix it with CSP and secure coding.', 'https://github.com/mnshchtri/XssSecurityLab'],
    ],
    skills: [
        ['DevOps & platform', 'Kubernetes (bare metal), Docker, BuildKit, Helm, Jenkins, GitHub Actions, CI/CD, HAProxy, Nginx, Infrastructure as Code, Linux administration'],
        ['Security', 'Penetration testing, vulnerability assessment, Zero Trust, IAM, OWASP Top 10, MITRE ATT&CK, CVE analysis, Wazuh (SIEM), Nessus, Burp Suite, Nmap, Metasploit, Wireshark'],
        ['Cloud & data', 'AWS (security, architecting, operations), PostgreSQL, Redis, SQLite'],
        ['Languages', 'Go, Python, Bash, TypeScript, React, SQL, Java, C++'],
        ['Networking', 'TCP/IP, DNS, VPN, OSPF, firewalls (nftables), packet analysis'],
    ],
    education: [
        ['BSc (Hons) Computer Networking & IT Security', 'Islington College — London Metropolitan University', 'Completed'],
        ['B.E. Electronics & Communication Engineering', 'Sagarmatha Engineering College — Tribhuvan University / IOE', 'Discontinued'],
    ],
    certifications: [
        'AWS Academy: Cloud Security Foundations, Cloud Architecting, Cloud Operations, Cloud Foundations',
        'TCM Security: Practical Ethical Hacking',
        'TryHackMe: SDLC Security, Docker Security, Pre-Security · 30+ TryHackMe / Hack The Box labs; regular CTFs',
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

// "Download PDF" hands out the LaTeX-built, ATS-friendly PDF rather than a print of this page.
const RESUME_PDF = 'cv/Manish-Karki-CV.pdf';

function downloadResume() {
    const a = document.createElement('a');
    a.href = RESUME_PDF;
    a.download = 'Manish-Karki-CV.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
                if (act === 'pdf') downloadResume();
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
    if (args.includes('--pdf')) return void downloadResume();
    openResume({ fromCommand: true });
}

Object.assign(COMMANDS, {
    resume: { group: 'Desktop', usage: 'resume [--pdf|--print]', desc: 'open my résumé (or download the PDF, or print it)', run: cmdResume },
    cv: { group: 'Hidden', usage: 'cv', desc: 'open my résumé', run: cmdResume },
    hire: { group: 'Hidden', usage: 'hire', desc: 'open my résumé', run: cmdResume },
});

// A link ending in #resume (or #cv) skips the boot and opens the résumé, for job applications.
const RESUME_LINK = /^#(resume|cv)$/i.test(location.hash);
desktopReadyHooks.push(() => {
    if (RESUME_LINK) openResume({ maximise: true });
});
