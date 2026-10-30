# Web-Terminal-portfolio
A portfolio that behaves like a Linux shell — boot sequence, login, a virtual filesystem and a bash-like shell (`nsh`).

https://mnshchtri.github.io/Web-Terminal-portfolio/

Try `cat README.md`, `ls -la`, `cd projects`, `tree`, `neofetch`, `experience | grep -i engineer`, `help`.

## Layout
- `fs.js` — the virtual filesystem. **All portfolio content lives here** (about, experience, projects, links…). Edit the text; URLs are auto-linked.
- `script.js` — the shell: commands, parsing (pipes, `>`/`>>`, `&&`/`||`/`;`, `$VARS`, globs, aliases, `!!`), tab completion, history, boot/login.
- `style.css` — terminal theme.

No build step — open `index.html` or push to GitHub Pages.
