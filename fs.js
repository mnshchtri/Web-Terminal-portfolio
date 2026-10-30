// Virtual filesystem for the portfolio shell.
// To update the portfolio, edit the file contents below — URLs are auto-linked by `cat`.

const HOME = '/home/neox';

const dir = (children = {}) => ({ type: 'dir', children });
const file = (content) => ({ type: 'file', content: content.replace(/^\n/, '') });
const link = (target) => ({ type: 'link', target });
// Private nodes are only readable by their owner (and root).
const secret = (node, mode) => Object.assign(node, { private: true, mode });

const FS = dir({
    bin: dir(),   // filled with the command list at startup
    boot: dir({
        'vmlinuz-linux': file('\x7fELF kernel image\n'),
        'initramfs-linux.img': file('\x1f\x8b compressed cpio archive\n'),
    }),
    etc: dir({
        hostname: file('neox\n'),
        'os-release': file(`
NAME="NeoxOS"
PRETTY_NAME="NeoxOS (Arch-based, rolling)"
ID=neoxos
ID_LIKE=arch
BUILD_ID=rolling
HOME_URL="https://mnshchtri.github.io/Web-Terminal-portfolio/"
`),
        motd: file(`
Welcome to NeoxOS — the personal system of Manish Karki (Neox).

  * Start here:   cat README.md
  * Commands:     help
  * Overview:     neofetch
  * Challenge:    there's a flag in /root. Can you get root?  (stuck? hint)
`),
        passwd: file(`
root:x:0:0:root:/root:/bin/bash
neox:x:1000:1000:Manish Karki:/home/neox:/bin/bash
visitor:x:1001:1001:Guest:/home/neox:/bin/bash
postgres:x:970:970:PostgreSQL user:/var/lib/postgres:/usr/bin/nologin
wazuh:x:965:965:Wazuh agent:/var/ossec:/usr/bin/nologin
nobody:x:65534:65534:Kernel Overflow User:/:/usr/bin/nologin
`),
        group: file(`
root:x:0:root
wheel:x:998:neox
docker:x:969:neox
users:x:100:visitor
neox:x:1000:
visitor:x:1001:
`),
        hosts: file(`
127.0.0.1   localhost
::1         localhost
127.0.1.1   neox
`),
        shadow: secret(file(`
root:!*:20380::::::
neox:$6$rounds=656000$Lynx$wQ8vR1kN3mZ.7yT2pX9cJ5hL0aG4sD6fB8eK1nU3iO7qW2rE5tY9uP0zA3xC6vB:20380:0:99999:7:::
visitor::20380:0:99999:7:::
`), '-rw-------'),
        sudoers: secret(file(`
## Allow root and members of group wheel to execute any command
root ALL=(ALL:ALL) ALL
%wheel ALL=(ALL:ALL) ALL

Defaults lecture="once"
`), '-r--r-----'),
        shells: file('/bin/bash\n/bin/nsh\n'),
    }),
    home: dir({
        neox: dir({
            'README.md': file(`
# Hi, I'm Manish Karki — aka Neox

DevSecOps Engineer | Offensive Security | Linux nerd | Music producer
Kathmandu, Nepal

This is my home directory. Look around like you would on any Linux box:

  ls -la                     list everything (including dotfiles)
  cat about.txt              who I am
  ls experience/             where I've worked
  ls projects/               things I've built
  cat skills.txt             what I work with
  tree                       the whole picture at once
  open github                links live in ~/links

Shortcuts: whois, experience, projects, skills, contact, music, blogs
In a hurry? resume opens my one-page CV (or click Hire me in the bar).

It's a real-feeling Linux box, so poke at it:
  htop · vim · nano · less · man · systemctl status infra-eye · journalctl
  weather · curl wttr.in/London · gh repo list · ping github.com
  git clone https://github.com/mnshchtri/infra-eye   (real README, live)
  theme list · cmatrix · sl · fortune | cowsay | lolcat

It's a desktop too (Alt stands in for Super):
  Alt+Enter terminal · Alt+B Chromium · Alt+E Files · Alt+M Neox Music
  Alt+Shift+N VS Code (this site's own source) · Alt+Shift+O Obsidian (my notes)
  Alt+G Neox Arcade: 7 original games (try fretwork or night-shift) · bruteforce
  Alt+Space launcher · Alt+F fullscreen · Alt+Shift+Space backgrounds · Alt+Ctrl+Space next one
  wallpaper list · chromium wiki.archlinux.org · nautilus ~/projects

There's also a flag in /root. You start as a guest with no sudo. Get root.
  (stuck? run: hint)

Tip: Tab completes, ↑/↓ walks history, Ctrl+L clears, Ctrl+C interrupts.
Broke something? reboot puts everything back.
`),
            'about.txt': file(`
Greetings! I'm Manish Karki, also known as Neox.

I'm a DevSecOps Engineer who came up through offensive security. Day to day
I operate and secure bare-metal, fintech-grade infrastructure — self-hosted
Kubernetes, Jenkins CI/CD, HAProxy/Nginx, PostgreSQL and Zero Trust controls.
Before that I was breaking things on purpose as an offensive security intern.

I'm a self-taught technologist and a Linux enthusiast at heart (this site is
an Arch-flavoured shell for a reason). I like to make, break and reimagine
systems — and I build my own tooling along the way: an observability
platform, a deployment platform, pentest frameworks and security audits.

Outside work I play guitar and produce music, and lately I've been writing
audio DSP code — where music and code meet is my favourite place to be.

Currently exploring: platform engineering, Kubernetes security, audio DSP in
Rust/C++, and AI-assisted security automation.
`),
            'skills.txt': file(`
DevSecOps      Bare-metal Kubernetes, Docker/buildx, Jenkins, GitHub Actions,
               ArgoCD, Gateway API (NGINX Gateway Fabric), HAProxy, Nginx,
               Helm, Terraform/IaC fundamentals
Security       Penetration testing, vulnerability assessment, red teaming,
               Wazuh SIEM, Nessus, Burp Suite, Nmap, Metasploit, Nuclei,
               Wireshark, httpx, ffuf, Feroxbuster
Concepts       Zero Trust Architecture, OWASP Top 10, MITRE ATT&CK,
               CVE analysis, IAM, secure SDLC
Cloud          AWS (security, architecting, operations), Azure, GCP concepts
Languages      Go, Python, Bash, TypeScript, Rust, C++ (JUCE), SQL, Java
Web            React, Svelte, Node/Express, Hono, tRPC, Tailwind
Data           PostgreSQL, Redis, SQLite
Networking     TCP/IP, DNS, VPNs, OSPF, firewalls, packet analysis
OS             Linux (daily driver: Arch/Omarchy + Hyprland), macOS, Windows
Music          DAWs, audio engineering, MIDI, audio DSP
`),
            'education.txt': file(`
BSc (Hons) Computer Networking & IT Security          Completed
  Islington College — London Metropolitan University, Kathmandu

B.E. Electronics & Communication Engineering           Discontinued
  Sagarmatha Engineering College — Tribhuvan University / IOE

Intermediate (+2 Science)                              2016
  SANN International College — HSEB
`),
            'certifications.txt': file(`
AWS Academy Cloud Security Foundations
AWS Academy Cloud Architecting
AWS Academy Cloud Operations
AWS Academy Cloud Foundations
TCM Security — Practical Ethical Hacking
TryHackMe — SDLC Security, Docker Security, Pre-Security, Advent of Cyber
Offensive Hacking Unfolded — Avinash Yadav

Labs: 30+ TryHackMe / Hack The Box labs, regular CTFs (web, privesc, scripting)
`),
            'contact.txt': file(`
Email     mnshchtri@gmail.com
GitHub    https://github.com/mnshchtri
LinkedIn  https://www.linkedin.com/in/manish-karki-959107171/
X         https://x.com/N30xMnsh
Website   https://manishkarki7.com.np
Location  Kathmandu, Nepal (open to remote)
`),
            experience: dir({
                '01-citytech.md': file(`
# DevSecOps Engineer — Citytech
May 2026 – Present

- Operate and secure bare-metal infrastructure for a fintech/banking production
  system: provisioning, hardening and lifecycle management, no managed cloud.
- Deploy and manage microservices on self-hosted Kubernetes clusters running
  directly on bare metal; build Jenkins CI/CD pipelines for build/test/release.
- Fixed recurring deployment downtime on the bank's live services: bare-metal
  Kubernetes had no managed load-balancer failover, so rollouts caused outages.
  Designed a rolling-deployment strategy fronted by HAProxy and Nginx with
  health-check-gated cutover — near-zero-downtime releases.
- Administer PostgreSQL infrastructure behind the microservice backends.
- Brought Zero Trust principles into the environment: least privilege,
  network segmentation and service-level authentication.
- Work with dev teams and banking stakeholders to smooth deployment workflows.
`),
                '02-inred-labs.md': file(`
# Offensive Security Intern — InRED Labs
July 2025 – October 2025 · Kamal Pokhari, Kathmandu

- Vulnerability assessments and penetration tests on internal web apps and
  network infrastructure: recon, enumeration, exploitation, post-exploitation.
- Documented findings with CVE references and mitigation guidance.
- Wrote Python and Bash tooling to automate reconnaissance and reporting.
- Worked with the blue team on realistic attack simulations to improve detection.
- Researched emerging threats mapped to MITRE ATT&CK; contributed to red team
  exercises, privilege-escalation testing and security awareness.
`),
                '03-uni-express.md': file(`
# SOP Reviewer / IT Support — Uni Express
Feb 2023 – Dec 2024 · Putalisadak, Kathmandu

- Managed secure IT infrastructure and basic endpoint protection; IT support.
- Reviewed 100+ academic Statements of Purpose; improved documentation and
  compliance processes.
`),
                '04-yes-international.md': file(`
# IT Technician / SOP Reviewer — Yes International Education
Nov 2018 – Feb 2021 · Putalisadak, Kathmandu

- Maintained and troubleshot systems and network infrastructure; implemented
  security protocols and reviewed IT SOPs.
- Managed backups and data recovery; supported staff and students.
`),
                '05-siddhi-ganesh.md': file(`
# Data Entry Assistant — Siddhi Ganesh Nirman Sewa
Mar 2017 – Aug 2018 · Kapan, Kathmandu

- Maintained large volumes of data, verified integrity, generated reports and
  helped digitise paper records.
`),
            }),
            projects: dir({
                'infra-eye.md': file(`
# InfraEye — agentless infrastructure observability   [creator & maintainer]
https://github.com/mnshchtri/infra-eye
https://infraeye.manishkarki7.com.np

- Real-time CPU/memory/disk/network telemetry across bare metal and Kubernetes
- Self-healing engine: alert rules trigger automated SSH-based remediation
- Kubernetes explorer with one-click diagnostics for Pods, Deployments, Events
- AI-driven log analysis and cluster troubleshooting via LLM/MCP
- Enterprise SSO (OIDC: Keycloak, Auth0, Okta, Azure AD), browser SSH terminal
- Native desktop app for macOS/Linux (Wails + SQLite), shipped via Homebrew:
  https://github.com/mnshchtri/homebrew-infra-eye
`),
                'deployforge.md': file(`
# DeployForge — self-hosted deployment platform   [private]

A Vercel/Render/Coolify-style platform on your own Kubernetes cluster.
Push or press Deploy: builds the exact commit with BuildKit, streams logs,
rolls out beside the live version and only switches traffic once healthy.
Platform subdomains + verified custom domains, encrypted per-environment
secrets, preview deployments per branch, one-click rollback/promotion,
runtime logs, metrics, alerts. Hardened with failure injection, load tests
and a route-by-route authorization sweep.
`),
                'cyberlynx.md': file(`
# CyberLynX — security orchestration & automation platform   [private]

Orchestrates and centralises security scanning and vulnerability analysis
behind one interface, with a Helm chart for cluster installs.
Integrates Nmap, Naabu, Nuclei, Nikto, Trivy, Subfinder, httpx, ffuf,
Katana, CVEMap and Wappalyzer.
Docs: https://github.com/mnshchtri/cyberlynx-docs
`),
                'trimurtisec.md': file(`
# TrimurtiSec — penetration testing framework (Python)
https://github.com/mnshchtri/TrimurtiSec

Modes inspired by the Hindu trinity:
  Brahma  — reconnaissance (adaptive port scans, OS/service detection, subdomains)
  Vishnu  — persistence
  Shiva   — exploitation
  God     — control
Generates structured markdown reports with CVE mapping.
`),
                'secaudit.md': file(`
# secaudit — security audit for Arch Linux / Omarchy
https://github.com/mnshchtri/secaudit

Read-only audit that checks the machine, scores it, explains each finding and
offers a safe fix command. Bash engine (text/report/JSON output), a Textual TUI
and a gum front-end. Checks packages & CVEs, firewall, SSH, services, users,
permissions and more. Now part of OmaPhoenix as \`omaphoenix audit\`.
`),
                'passwd-manager.md': file(`
# Passwords widget for Omarchy
https://github.com/mnshchtri/passwd-manager

A native Omarchy bar widget on top of GPG-encrypted \`pass\`: generate,
search and copy passwords without plaintext ever touching disk.
`),
                'audio-dsp.md': file(`
# Audio DSP Guitar Rig (C++ / JUCE)
https://github.com/mnshchtri/audio-dsp

Standalone desktop app that runs live guitar input through a vintage
stompbox-style pedalboard: drag to reorder pedals, bypass footswitches,
full per-pedal controls and one-click tone presets. Low-latency, real input.
`),
                'oxidaw.md': file(`
# Oxidaw — browser-based DAW   [private, early]

Rust DSP core compiled to WASM in the browser and native for offline
render/export. Svelte 5 + TypeScript frontend, Docker/Helm deployment.
`),
                'signalverse.md': file(`
# SignalVerse — learn DSP interactively   [private, in progress]

An interactive lab for learning digital signal processing from zero: every
plot comes from real DSP code in the browser and you can hear every signal.
Tested core for sampling/aliasing, quantization, FFT, windows, convolution,
FIR and biquad filters.
`),
                'wazuh-siem.md': file(`
# Security Logging & SIEM Integration (Wazuh)

Deployed Wazuh agents, configured centralized log collection, enabled alert
rules and tested correlation across network hosts with real event data.
`),
                'xss-security-lab.md': file(`
# XSS Security Lab
https://github.com/mnshchtri/XssSecurityLab

A safe web app to explore reflected, stored and DOM-based XSS, then fix them
with secure coding, CSP headers and SOP isolation.
`),
                'websecsuite.md': file(`
# WebSecSuite
https://github.com/mnshchtri/WebSecSuite

Web security testing and analysis suite — TypeScript, React and Express.
`),
                'network-monitor.md': file(`
# Network Monitor
https://github.com/mnshchtri/Network-Monitor

Python + Scapy packet analyser: live capture, basic anomaly detection and
IP/port stats. Used to study ICMP-based reconnaissance.
`),
                'bug-bounty-scanner.md': file(`
# Bug Bounty Scanner
https://github.com/mnshchtri/bug-bounty-scanner

Automated scanner for common web vulnerabilities with custom payloads,
multi-threaded scanning and reporting.
`),
                'devanagari-reader.md': file(`
# Devanagari Character Reader

Helps visually impaired people read printed Nepali documents: camera
capture → CNN text recognition → text-to-speech output.
`),
                'terminal-portfolio.md': file(`
# Terminal Portfolio
https://github.com/mnshchtri/Web-Terminal-portfolio

This website. A fake Linux shell in vanilla JS: virtual filesystem, pipes,
redirection, tab completion, history. You're in it right now.
`),
            }),
            music: dir({
                'README.txt': file(`
Guitar player and producer — making beats when inspiration strikes.

YouTube    https://www.youtube.com/@lynthrax
BeatStars  https://www.beatstars.com/kazibaubeat   (buy my beats)
`),
            }),
            links: dir({
                github: link('https://github.com/mnshchtri'),
                linkedin: link('https://www.linkedin.com/in/manish-karki-959107171/'),
                x: link('https://x.com/N30xMnsh'),
                medium: link('https://medium.com/@neox.exploit'),
                youtube: link('https://www.youtube.com/@lynthrax'),
                beatstars: link('https://www.beatstars.com/kazibaubeat'),
                website: link('https://manishkarki7.com.np'),
                infraeye: link('https://infraeye.manishkarki7.com.np'),
            }),
            '.bashrc': file(`
# ~/.bashrc
export EDITOR=nvim
export PATH="$HOME/.local/bin:$PATH"
alias ll='ls -la'
alias la='ls -a'
alias ..='cd ..'
PS1='\\u@\\h:\\w\\$ '
`),
            // The world-readable history file is the way in. The password is base64-encoded here,
            // so visitors have to spot the encoding and decode it with `base64 -d`.
            '.bash_history': file(`
ls -la
cd ~/projects
kubectl get pods -A
kubectl rollout status deploy/infra-eye -n observability
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/mnshchtri/infra-eye:1.8 --push .
helm upgrade --install cyberlynx ./chart -n security
nmap -sV -p- 10.0.0.12
journalctl -u wazuh-agent -f
export WAZUH_PASS=$(echo 'QnI0aG00LVYxc2hudS1TaDF2NA==' | base64 -d)
echo "$WAZUH_PASS" | sudo -S systemctl restart wazuh-agent
unset WAZUH_PASS
history -c
vim ~/.bashrc
neofetch
`),
            '.ssh': secret(dir({
                id_ed25519: file(`
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5pY2UgdHJ5LCBidXQgdGhpcyBrZXkgb3BlbnMgbm90
aGluZy4gR29vZCBpbnN0aW5jdHMgdGhvdWdoIOKAlCBrZWVwIGdvaW5nLg==
-----END OPENSSH PRIVATE KEY-----
`),
                'id_ed25519.pub': file('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE5lb3hQb3J0Zm9saW9LZXk neox@neox\n'),
                known_hosts: file('github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n'),
            }), 'drwx------'),
            '.secret': file(`
You found it. Curiosity is the whole job.
  — neox

flag{n3v3r_st0p_3xpl0r1ng}
`),
        }),
    }),
    root: secret(dir({
        'flag.txt': file(`
  ___  ___   ___ _____ ___ ___  _
 | _ \\/ _ \\ / _ \\_   _| __|   \\| |
 |   / (_) | (_) || | | _|| |) |_|
 |_|_\\___/ \\___/ |_| |___|___/(_)

flag{pr1v3sc_v14_sh3ll_h1st0ry}

You enumerated the box, found a credential leaked in shell history, pivoted
to a user with sudo rights and escalated to root. That's a real attack path,
and finding (then fixing) exactly this kind of thing is my day job.

Enjoyed it? Let's talk: mnshchtri@gmail.com
`),
        '.bash_history': file(`
pacman -Syu
systemctl restart infra-eye
journalctl -u wazuh-agent -n 50
kubectl get pods -A
# note to self: never, ever run  rm -rf --no-preserve-root /
`),
    }), 'drwx------'),
    tmp: dir(),
    var: dir({
        log: dir({
            'auth.log': file(`
sshd[1337]: Accepted publickey for neox from 127.0.0.1
sudo: visitor : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/neox ; COMMAND=/bin/bash
`),
        }),
    }),
    usr: dir({ share: dir({ dict: dir() }) }),
});
