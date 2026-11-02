# Web-Terminal-portfolio
A portfolio that behaves like my Linux desktop (Omarchy on Hyprland) — a boot sequence, then a tiling desktop with workspaces, an Omarchy-style bar, a launcher, notifications, a screensaver and a lock screen (Alt+Ctrl+L or the bar's lock icon); inside each terminal: users and permissions, a virtual filesystem, a bash-like shell (`nsh`), full-screen TUI apps and a root challenge.

https://mnshchtri.github.io/Web-Terminal-portfolio/

**Recruiters:** https://mnshchtri.github.io/Web-Terminal-portfolio/#resume skips the boot and opens my one-page CV (Download PDF is one click: an ATS-friendly one-pager built from LaTeX, source in `cv/`). On the desktop, it's the **Hire me** button in the top bar.

Try `cat README.md`, `ls -la`, `htop`, `vim notes.txt`, `systemctl status infra-eye`, `weather`, `gh repo list`, `git clone https://github.com/mnshchtri/infra-eye`, `theme list` — or run `ctf` and start hunting flags.

## Layout
- `fs.js` — the virtual filesystem. **All portfolio content lives here** (about, experience, projects, links…), plus the files behind the root challenge. Edit the text; URLs are auto-linked.
- `script.js` — the shell: users (`su`/`sudo`), permissions, file commands, parsing (pipes, `>`/`>>`, `&&`/`||`/`;`, `$VARS`, globs, aliases, `!!`, scripts), tab completion, history, boot/login.
- `apps.js` — full-screen programs: `less`/`man`, `htop`/`top`, `vim`, `nano`, `cmatrix`, `sl`.
- `sys.js` — system and network tools (`systemctl`, `journalctl`, `ping`, `curl`, `nmap`, `ss`, `pacman`…), live GitHub (`gh`, `git clone`/`log`) and themes.
- `desktop.js` — the desktop: dwindle tiling window manager, workspaces 1–9, top bar, launcher, notifications, screensaver, lock screen, `hyprctl`/`ghostty`/`notify-send`.
- `style.css` — layout and the colour themes. `yozakura` (night sakura: kanji workspaces, torii launcher, drifting petals, an ensō screensaver, a lock screen with a hanging-scroll motto) is the default; `win-palette` is my current Omarchy theme.
- `gui.js` — graphical apps: Chromium, Files, Text Editor, Image Viewer (imv), Neox Music, and the background switcher.
- `vscode.js` — VS Code: explorer, tabs, syntax highlighting, search, source control with live commits, quick open (Ctrl+P) and an integrated `nsh` terminal (Ctrl+\`). Opens this site's own source in `~/code/Web-Terminal-portfolio`.
- `resume.js` — the résumé window, its print/PDF layout, the Hire me button and the `#resume` link. Its `RESUME` data follows my CV (without my phone number); the plain-HTML summary at the top of `index.html` is for search engines, screen readers and no-JavaScript visitors, so keep both in step.
- `psql.js` — `psql` against a small read-only PostgreSQL 17 (a hot standby, so writes fail like on a real replica). The `portfolio` database holds `RESUME` as tables (`projects`, `experience`, `skills`…): SELECT with WHERE, GROUP BY, ORDER BY and LIMIT, `\dt`, `\d`, `\l`, `\du`, `\x`, `\c`, plus `psql -c`, `-l` and piped SQL. `sudo -u postgres psql` gets the superuser.
- `infraeye.js` — a demo of InfraEye with simulated data, in the real app's dark theme: live dashboard, servers, Kubernetes, alert rules (with a **Simulate incident** that shows self-healing end to end) and scripted Netra answers. Alt+I or `infraeye`.
- `ctf.js` — NeoxCTF: the scoreboard (`ctf` in a terminal, or http://ctf.neox in Chromium), the challenge files and services (a staging web server on `curl localhost`, which Chromium also browses, with Ctrl+U for view-source, a port-knock daemon guarding 31337, a Kubernetes RBAC misconfiguration, an intruder's cron implant), the tools they need (`find`, `file`, `strings`, `tr`, `rev`, `nc`, `knock`, `crontab`) and the hidden quests.
- `claude.js` — `claude`: an assistant with Claude Code's look and feel (welcome box, spinner, streamed replies, `Bash(...)` tool calls, slash commands). It's scripted: intents matched by pattern with a little conversational memory, plus real commands run on the box. It guides through the CTF with hints, and redacts flags and the root password from anything it shows.
- `games.js` — Neox Arcade, seven original retro games on a pixel canvas: Packet Snake, Firewall (shooter), Riff Runner (runner), Night Shift (build by day, defend by night), Patch Panel (cable puzzle), Drone Drop (lander) and Fretwork (rhythm, with a backing band synthesised live) with chiptune sound and saved high scores, plus `bruteforce`, a code-breaking game for the terminal.
- `obsidian.js` — Obsidian with the public **Neox Vault** (`~/Documents/Neox Vault`): wikilinks, backlinks, tags, search and the graph view. The notes are written in this file.
- `analytics.js` — visitor analytics via [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/): cookie-free page views, referrers, countries, devices and page-load speed. Off until `CLOUDFLARE_ANALYTICS_TOKEN` is set, and off on localhost, with Do Not Track / Global Privacy Control, or after `analytics off`. Visitors can run `privacy` to see what's counted.
- `assets/og.jpg` — the link-preview image (1200×630) used by LinkedIn, X, WhatsApp and Slack.
- `assets/` — `wallpapers/` (the 31 backgrounds from my Omarchy themes, six `yozakura*.webp` scenes drawn for this site (night sakura, ensō, koi pond, lantern alley, pagoda, senbon torii), plus thumbnails) and `wallpaper.jpg` (terminal background).

## Keybindings
Alt stands in for Super, which the OS or browser keeps for itself.

| Keys | Action |
| --- | --- |
| Alt+Enter | New terminal |
| Alt+Space | Launcher (or click the logo) |
| Alt+B / Alt+E / Alt+M | Chromium / Files / Neox Music |
| Alt+Shift+N / Alt+Shift+O | VS Code / Obsidian |
| Alt+G | Neox Arcade (games) |
| Alt+Shift+Space | Background switcher (or the image icon in the bar) |
| Alt+Ctrl+Space | Next background |
| Alt+W | Close window (or `exit`) |
| Alt+F (or Super/⌘+F) | Fullscreen, like Omarchy's Super+F. Esc or Alt+F again to leave. On macOS use Option+F: ⌘F is a browser shortcut, so Chrome/Brave need one extra click before they hide the tabs |
| Alt+Shift+F | Full width: fills the screen but keeps the bar |
| Alt+Arrows | Move focus |
| Alt+1..9 | Switch workspace |
| Alt+Shift+1..9 | Move window to workspace |

A failed command plays the same "fahhh" my own zsh does (`assets/sounds`); the volume icon in the bar mutes it.

`curl`, `weather`, `gh` and `git` make real requests (wttr.in and the public GitHub API, 60 requests/hour per visitor IP).

No build step — open `index.html` or push to deploy.

## NeoxCTF
The box is a small capture-the-flag. Seven challenges, each a real attack path in miniature (recon, web, network, cloud, Kafka streaming, forensics and privilege escalation), plus four hidden quests that never appear on the scoreboard until someone finds them. Visitors start as `visitor` with no sudo rights. `ctf` shows the scoreboard, `ctf info N` the brief, `ctf hint N` one nudge at a time, and `ctf submit flag{…}` scores. Progress is saved in the browser and survives `reboot`.

Reading this source isn't a shortcut. Flags are checked against SHA-256 hashes, the ones the challenges print are XOR-veiled (`unveil` in `fs.js`), and only the root password's hash is stored.

To change the password, set `NEOX_PASSWORD_SHA256` in `script.js` (`printf %s 'new-pass' | sha256sum`) and update the base64-encoded leak in `fs.js` to match.
