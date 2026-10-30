# Web-Terminal-portfolio
A portfolio that behaves like a Linux box — boot sequence, login, users and permissions, a virtual filesystem, a bash-like shell (`nsh`), full-screen TUI apps and a root challenge.

https://mnshchtri.github.io/Web-Terminal-portfolio/

Try `cat README.md`, `ls -la`, `htop`, `vim notes.txt`, `systemctl status infra-eye`, `weather`, `gh repo list`, `git clone https://github.com/mnshchtri/infra-eye`, `theme list` — or run `hint` and try to get root.

## Layout
- `fs.js` — the virtual filesystem. **All portfolio content lives here** (about, experience, projects, links…), plus the files behind the root challenge. Edit the text; URLs are auto-linked.
- `script.js` — the shell: users (`su`/`sudo`), permissions, file commands, parsing (pipes, `>`/`>>`, `&&`/`||`/`;`, `$VARS`, globs, aliases, `!!`, scripts), tab completion, history, boot/login.
- `apps.js` — full-screen programs: `less`/`man`, `htop`/`top`, `vim`, `nano`, `cmatrix`, `sl`.
- `sys.js` — system and network tools (`systemctl`, `journalctl`, `ping`, `curl`, `nmap`, `pacman`…), live GitHub (`gh`, `git clone`/`log`), the top bar and themes.
- `style.css` — layout and the colour themes.

`curl`, `weather`, `gh` and `git` make real requests (wttr.in and the public GitHub API, 60 requests/hour per visitor IP).

No build step — open `index.html` or push to deploy.

## The root challenge
Visitors start as `visitor` with no sudo rights. The intended path: enumerate users, find neox's password leaked in the world-readable `~neox/.bash_history`, `su neox`, then `sudo -i` and read `/root/flag.txt`. The password is `NEOX_PASSWORD` in `script.js` and must match the history file. `reboot` resets everything.
