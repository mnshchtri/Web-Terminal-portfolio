'use strict';

// First visit: the one-minute trailer plays over the whole browser window before the boot.
// Browsers only allow sound and real fullscreen after a click or key press, so it starts muted and
// the visitor's first click (or key) turns the sound on and takes it fullscreen. Skip intro or Esc
// goes straight to the boot. It plays once per browser; #intro on the URL plays it again.

const INTRO_SRC = 'assets/video/neoxos-trailer.mp4';
const INTRO_POSTER = 'assets/video/neoxos-trailer.jpg';

function wantsIntro() {
    if (/^#intro$/i.test(location.hash)) return true;
    if (localStorage.getItem('nsh_intro_seen')) return false;
    // Résumé links came for the CV; reduced motion and data saver mean "don't push a film at me".
    if (/^#(resume|cv)$/i.test(location.hash)) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (navigator.connection?.saveData) return false;
    return true;
}

function playIntro() {
    return new Promise((resolve) => {
        const el = document.createElement('div');
        el.id = 'intro';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'NeoxOS trailer');
        el.innerHTML = `
            <video src="${INTRO_SRC}" poster="${INTRO_POSTER}" muted autoplay playsinline preload="auto"></video>
            <button class="intro-sound">Click for sound</button>
            <button class="intro-skip">Skip intro</button>
            <div class="intro-bar" aria-hidden="true"></div>`;
        document.body.appendChild(el);
        const video = el.querySelector('video');
        const sound = el.querySelector('.intro-sound');
        const bar = el.querySelector('.intro-bar');
        const verb = matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
        sound.textContent = `${verb} for sound`;
        let engaged = false;
        let done = false;

        video.play().catch(() => { sound.textContent = `${verb} to play`; });
        // Count it as seen once it actually plays, so a reload mid-way doesn't start it over.
        video.addEventListener('playing', () => localStorage.setItem('nsh_intro_seen', '1'), { once: true });
        video.addEventListener('timeupdate', () => {
            if (video.duration) bar.style.setProperty('--p', `${(video.currentTime / video.duration) * 100}%`);
        });
        video.addEventListener('ended', finish);
        // A file that won't load must never trap the visitor in front of a black screen.
        video.addEventListener('error', finish);

        // The first gesture is the browser's permission for both sound and fullscreen.
        function engage() {
            if (engaged) return;
            engaged = true;
            video.muted = false;
            video.play().catch(() => {});
            sound.remove();
            el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
        }

        function onKey(e) {
            e.stopImmediatePropagation();
            if (e.key === 'Tab') return;
            e.preventDefault();
            if (e.key === 'Escape') return finish();
            if (e.key === 'Enter' && document.activeElement?.classList.contains('intro-skip')) return finish();
            if (!engaged) return engage();
            if (e.key === ' ') video.paused ? video.play() : video.pause();
            if (e.key === 'm') video.muted = !video.muted;
        }

        function onPointer(e) {
            if (e.target.closest('.intro-skip')) return;
            if (!engaged) engage();
            else if (e.target === video) video.paused ? video.play() : video.pause();
        }

        function finish() {
            if (done) return;
            done = true;
            localStorage.setItem('nsh_intro_seen', '1');
            window.removeEventListener('keydown', onKey, true);
            if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
            video.pause();
            el.classList.add('leaving');
            setTimeout(() => {
                video.removeAttribute('src');
                video.load();
                el.remove();
                if (/^#intro$/i.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
                resolve();
            }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
        }

        el.querySelector('.intro-skip').addEventListener('click', finish);
        el.addEventListener('pointerdown', onPointer);
        // Capture phase, ahead of the shell: nothing typed here reaches the terminal underneath.
        window.addEventListener('keydown', onKey, true);
        el.querySelector('.intro-skip').focus({ preventScroll: true });
    });
}
