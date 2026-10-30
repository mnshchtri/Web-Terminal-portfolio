# Web-Terminal-portfolio
A portfolio that behaves like my Linux desktop (Omarchy on Hyprland) — a boot sequence, then a tiling desktop with workspaces, an Omarchy-style bar, a launcher, notifications and a screensaver; inside each terminal: users and permissions, a virtual filesystem, a bash-like shell (`nsh`), full-screen TUI apps and a root challenge.

https://mnshchtri.github.io/Web-Terminal-portfolio/

Try `cat README.md`, `ls -la`, `htop`, `vim notes.txt`, `systemctl status infra-eye`, `weather`, `gh repo list`, `git clone https://github.com/mnshchtri/infra-eye`, `theme list` — or run `hint` and try to get root.

## Layout
- `fs.js` — the virtual filesystem. **All portfolio content lives here** (about, experience, projects, links…), plus the files behind the root challenge. Edit the text; URLs are auto-linked.
- `script.js` — the shell: users (`su`/`sudo`), permissions, file commands, parsing (pipes, `>`/`>>`, `&&`/`||`/`;`, `$VARS`, globs, aliases, `!!`, scripts), tab completion, history, boot/login.
- `apps.js` — full-screen programs: `less`/`man`, `htop`/`top`, `vim`, `nano`, `cmatrix`, `sl`.
- `sys.js` — system and network tools (`systemctl`, `journalctl`, `ping`, `curl`, `nmap`, `pacman`…), live GitHub (`gh`, `git clone`/`log`) and themes.
- `desktop.js` — the desktop: dwindle tiling window manager, workspaces 1–9, top bar, launcher, notifications, screensaver, `hyprctl`/`ghostty`/`notify-send`.
- `style.css` — layout and the colour themes (`win-palette` is my current Omarchy theme).
- `gui.js` — graphical apps: Chromium, Files, Text Editor, Image Viewer (imv), Neox Music, and the background switcher.
- `vscode.js` — VS Code: explorer, tabs, syntax highlighting, search, source control with live commits, quick open (Ctrl+P) and an integrated `nsh` terminal (Ctrl+\`). Opens this site's own source in `~/code/Web-Terminal-portfolio`.
- `games.js` — Neox Arcade, four original retro games on a pixel canvas (Packet Snake, Firewall, Riff Runner, and Night Shift — build by day, defend the datacenter by night) with chiptune sound and saved high scores, plus `bruteforce`, a code-breaking game for the terminal.
- `obsidian.js` — Obsidian with the public **Neox Vault** (`~/Documents/Neox Vault`): wikilinks, backlinks, tags, search and the graph view. The notes are written in this file.
- `assets/` — `wallpapers/` (the 31 backgrounds from my Omarchy themes, plus thumbnails) and `wallpaper.jpg` (terminal background).

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
| Alt+F (or Super/⌘+F) | Fullscreen, like Omarchy's Super+F. Esc or Alt+F again to leave |
| Alt+Shift+F | Full width: fills the screen but keeps the bar |
| Alt+Arrows | Move focus |
| Alt+1..9 | Switch workspace |
| Alt+Shift+1..9 | Move window to workspace |

`curl`, `weather`, `gh` and `git` make real requests (wttr.in and the public GitHub API, 60 requests/hour per visitor IP).

No build step — open `index.html` or push to deploy.

## The root challenge
Visitors start as `visitor` with no sudo rights, and there's a flag in `/root/flag.txt`. Getting it takes real Linux privilege-escalation thinking. Reading this source won't hand you the password: only its SHA-256 is stored. Stuck? Run `hint` in the shell, once per nudge. `reboot` resets everything.

To change the password, set `NEOX_PASSWORD_SHA256` in `script.js` (`printf %s 'new-pass' | sha256sum`) and update the base64-encoded leak in `fs.js` to match.
