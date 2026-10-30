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
| Alt+Shift+Space | Background switcher (or the image icon in the bar) |
| Alt+Ctrl+Space | Next background |
| Alt+W | Close window (or `exit`) |
| Alt+F | Toggle fullscreen |
| Alt+Arrows | Move focus |
| Alt+1..9 | Switch workspace |
| Alt+Shift+1..9 | Move window to workspace |

`curl`, `weather`, `gh` and `git` make real requests (wttr.in and the public GitHub API, 60 requests/hour per visitor IP).

No build step — open `index.html` or push to deploy.

## The root challenge
Visitors start as `visitor` with no sudo rights. The intended path: enumerate users, find neox's password leaked in the world-readable `~neox/.bash_history`, `su neox`, then `sudo -i` and read `/root/flag.txt`. The password is `NEOX_PASSWORD` in `script.js` and must match the history file. `reboot` resets everything.
