// Half Past Nine runtime. Replaces the template's React runtime: smooth scroll, reveals, character text,
// scroll-linked transforms, spaces tabs, testimonial slider, menu accordion, phone menu, gallery ticker, form.
(() => {
  const PAGE = document.currentScript.dataset.page;
  const BASE = document.currentScript.src.replace(/assets\/site\.js.*$/, '');   // site root, whatever the page depth
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = el => el.getClientRects().length > 0;

  // ---------- Framer's duration/bounce spring, sampled to a CSS linear() easing (same maths as motion's findSpring)
  function solveSpring(duration, bounce) {
    const EL = 0.001, z = clamp(1 - bounce, 0.05, 1), d = clamp(duration, 0.01, 10);
    let f, df;
    if (z < 1) {
      const ang = w => w * Math.sqrt(1 - z * z);
      f = w => EL - (w * z) / ang(w) * Math.exp(-w * z * d);
      df = w => { const a = w * z * d, s = z * z * w * w * d, c = Math.exp(-a), l = ang(w * w); const sign = (-f(w) + EL > 0) ? -1 : 1; return sign * ((-s) * c) / l; };
    } else {
      f = w => -EL + Math.exp(-w * d) * ((w) * d + 1);
      df = w => Math.exp(-w * d) * (-w * d * d);
    }
    let w = 5 / d; for (let i = 0; i < 12; i++) w -= f(w) / df(w);
    return { k: w * w, c: z * 2 * w };
  }
  function springCurve(k, c) {
    const z = c / (2 * Math.sqrt(k)), w0 = Math.sqrt(k);
    if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return t => 1 - Math.exp(-z * w0 * t) * ((z * w0 / wd) * Math.sin(wd * t) + Math.cos(wd * t)); }
    if (z === 1) return t => 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    const e = w0 * Math.sqrt(z * z - 1);
    return t => 1 - Math.exp(-z * w0 * t) * ((z * w0) * Math.sinh(Math.min(e * t, 300)) + e * Math.cosh(Math.min(e * t, 300))) / e;
  }
  const cache = {};
  function spring(duration, bounce) {
    const key = duration + '/' + bounce; if (cache[key]) return cache[key];
    const { k, c } = solveSpring(duration, bounce), y = springCurve(k, c), n = Math.max(30, Math.round(duration * 60));
    const pts = []; for (let i = 0; i <= n; i++) pts.push(+y(duration * i / n).toFixed(4)); pts[n] = 1;
    return (cache[key] = { easing: 'linear(' + pts.join(',') + ')', duration: duration * 1000 });
  }
  const tween = (duration, ease) => ({ easing: 'cubic-bezier(' + ease.join(',') + ')', duration: duration * 1000 });
  const T = {
    pop: spring(1.2, 0.1), fade15: spring(1.5, 0.1), heroText: tween(1.5, [.02, .5, .5, 1]),
    chars: spring(0.75, 0.1), ui: spring(0.4, 0.2), slide: spring(0.8, 0.1), acc: spring(0.6, 0), tab: spring(0.3, 0),
    tabBg: tween(1.2, [.05, .65, .22, .96]), menu: spring(0.2, 0), hover: spring(0.6, 0),
  };
  const play = (el, kf, t, delay = 0) => el.animate(kf, { duration: reduced ? 1 : t.duration, easing: t.easing, delay: reduced ? 0 : delay * 1000, fill: 'both' });

  // ---------- smooth scroll: the template's Lenis component runs on Lenis defaults (its intensity prop is never passed on)
  let lenis = null;
  if (window.Lenis && !reduced) lenis = new Lenis({ autoRaf: true, anchors: true, allowNestedScroll: true });

  // ---------- on-load appear (hero drawings): Framer's own animator runs from the SSR; play the same values if it skipped this breakpoint
  setTimeout(() => {
    let data = {}, bps = [];
    try { data = JSON.parse($('#__framer__appearAnimationsContent').text); bps = JSON.parse($('#__framer__breakpoints').text); } catch (e) {}
    const hashes = bps.filter(b => b.mediaQuery && matchMedia(b.mediaQuery).matches).map(b => b.hash);
    $$('[data-framer-appear-id]').forEach(el => {
      if (!shown(el) || +getComputedStyle(el).opacity > 0.98) return;
      const d = data[el.dataset.framerAppearId] || {}; const v = d[hashes.find(h => d[h])] || d.default; if (!v) return;
      const a = v.animate, tt = a.transition || {}, pre = (el.style.transform.match(/^translateX\(-50%\)/) || [''])[0];
      const tf = `${pre} translateX(${a.x || 0}px) translateY(${a.y || 0}px) scale(${a.scale ?? 1}) rotate(${a.rotate || 0}deg)`.trim();
      play(el, [{ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }, { opacity: a.opacity ?? 1, transform: tf }],
        spring(tt.duration || 1.5, tt.bounce ?? 0.1)).finished.then(() => { el.style.opacity = a.opacity ?? 1; el.style.transform = tf; });
    });
  }, 1600);

  // ---------- in-view reveals (once, threshold 0). Effect values ride on the individual `translate`/`scale` properties
  // so scroll-linked `transform` writes on the same element compose with them, as Framer's effect stack does.
  const REVEAL = {
    'framer-1692m5x': { strip: 'translateX(-40px)', translate: '-40px 0', t: 'pop' },
    'framer-1b6uy4i': { t: 'heroText' }, 'framer-18356hr': { t: 'fade15' }, 'framer-1q7243g': { t: 'fade15' },
    'framer-193qkog': { t: 'fade15' }, 'framer-1sbi4w8': { t: 'fade15' },
    'framer-ay800f': { strip: 'translateX(140px)', keep: 'translateX(100px)', translate: '40px 0', t: 'pop' },
  };
  [['1p0g5rd', 0], ['11orxuj', .1], ['i7t51w', .2], ['migpn2', .1], ['1r6m9gt', .2], ['womoa3', .3], ['1l1kows', .2], ['yw1ui4', .3], ['gcyazn', .4],
   ['1w805r7', 0], ['1or6i01', 0], ['ccqk18', 0], ['skgzme', 0], ['1qw834b', .1], ['1kfkrxf', .2]]
    .forEach(([id, d]) => REVEAL['framer-' + id + '-container'] = { strip: 'scale(0.7)', scale: .7, t: 'pop', d });
  const revealIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    revealIO.unobserve(e.target); const el = e.target, r = el._reveal;
    const from = { opacity: 0 }, to = { opacity: 1 };
    if (r.translate) { from.translate = r.translate; to.translate = '0px 0px'; }
    if (r.scale) { from.scale = r.scale; to.scale = 1; }
    play(el, [from, to], T[r.t], r.d || 0).finished.then(() => { el.style.opacity = 1; el.style.translate = ''; el.style.scale = ''; el.getAnimations().forEach(a => a.cancel()); });
  }), { threshold: 0 });
  Object.entries(REVEAL).forEach(([cls, r]) => $$('.' + cls).forEach(el => {
    el._reveal = r;
    if (r.strip) el.style.transform = (el.style.transform.replace(r.strip, r.keep || '').trim()) || 'none';
    el.style.opacity = 0; if (r.translate) el.style.translate = r.translate; if (r.scale) el.style.scale = r.scale;
    revealIO.observe(el);
  }));

  // ---------- character "appear" text (Framer splits per character: opacity .001 + scale .8 -> 1, spring .75/.1)
  function split(container) {
    const chars = [];
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(document.createTextNode(part)); return; }
            const w = document.createElement('span'); w.style.whiteSpace = 'nowrap';
            [...part].forEach(ch => { const c = document.createElement('span'); c.textContent = ch; c.className = 'hp9-ch'; w.append(c); chars.push(c); });
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(container); container.classList.add('hp9-split'); return chars;
  }
  const CHARS = { 'framer-spv8uh': { trigger: 'view', stagger: .008 }, 'framer-sewmft': { trigger: 'view', stagger: .008 },
                  'framer-10u1d2l': { trigger: 'mount', stagger: .003, start: .4 } };
  const runChars = (chars, cfg) => chars.forEach((c, i) => play(c, [{ opacity: .001, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], T.chars, (cfg.start || 0) + i * cfg.stagger));
  const charIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { charIO.unobserve(e.target); runChars(e.target._chars, e.target._cfg); } }), { threshold: 0 });
  Object.entries(CHARS).forEach(([cls, cfg]) => $$('.' + cls).forEach(el => {
    el._chars = split(el); el._cfg = cfg;
    if (cfg.trigger === 'mount') runChars(el._chars, cfg); else charIO.observe(el);
  }));

  // ---------- scroll-linked transforms (Framer "scroll target"): value = lerp over scrollY in [T - k*vh, T - k*vh + H]
  const CTA = 'section[data-framer-name="CTA"]', TEAM = 'section[data-framer-name="Team"]';
  const SCROLL = [
    ['framer-f86pv2', CTA, 1, { x: 100 }], ['framer-ay800f', CTA, 1, { x: 100 }], ['framer-wnn2nr', CTA, 1, { x: 100 }],
    ['framer-s2z26x-container', '.framer-wbfyb1', 1, { x: 120, y: -20, r: 10, s: .8 }, -10],
    ['framer-1nwwajm-container', '.framer-wbfyb1', 1, { x: -30, y: 100, r: -3, s: .8 }, 3],
    ['framer-quer58-container', '.framer-wbfyb1', 1, { x: -280, r: -9, s: .8 }, 9],
    ['framer-b8hv2d', TEAM, 1, { x: 200 }, 90], ['framer-1kihir4-container', TEAM, 1, { x: -200 }],
    ['framer-1de1v6y-container', TEAM, 1, { r: -20, s: .8 }, -3], ['framer-cix6bq-container', TEAM, 1, { r: 20, s: .8 }],
    ['framer-1yui4g7', '.framer-1yui4g7', 1, { o: 0 }], ['framer-1e2u0jw', '.framer-1yui4g7', .5, { o: 0, s: .9 }],
  ];
  const offsetTop = el => { let n = 0; while (el && el !== document.documentElement && el instanceof HTMLElement) { n += el.offsetTop; el = el.offsetParent; } return n; };
  const scrollItems = [];
  SCROLL.forEach(([cls, ref, k, from, baseRot = 0]) => $$('.' + cls).forEach(el => {
    const pre = /^translateX\(-50%\)/.test(el.style.transform) ? 'translateX(-50%) ' : '';
    scrollItems.push({ el, ref, k, from, baseRot, pre, last: '' });
  }));
  let ranges = [];
  function measure() {
    const vh = innerHeight;
    ranges = scrollItems.map(it => {
      if (!shown(it.el)) return null;
      const refEl = $$(it.ref).find(shown) || it.el.closest(it.ref); if (!refEl) return null;
      const c = offsetTop(refEl) - 1 - it.k * vh, h = refEl.clientHeight;
      return [Math.max(c, 0), Math.max(c + h, 0)];
    });
  }
  function onScrollFx() {
    const y = lenis ? lenis.scroll : scrollY;
    scrollItems.forEach((it, i) => {
      const r = ranges[i]; if (!r) return;
      const p = r[1] > r[0] ? clamp((y - r[0]) / (r[1] - r[0])) : (y >= r[1] ? 1 : 0), q = 1 - p, f = it.from;
      const x = (f.x || 0) * q, yy = (f.y || 0) * q, rot = (f.r || 0) * q + it.baseRot, s = 1 + ((f.s ?? 1) - 1) * q;
      const tf = `${it.pre}translateX(${x.toFixed(2)}px) translateY(${yy.toFixed(2)}px) scale(${s.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
      if (tf !== it.last) { it.el.style.transform = tf; it.last = tf; }
      if ('o' in f) it.el.style.opacity = (f.o + (1 - f.o) * p).toFixed(3);
    });
  }
  measure(); onScrollFx();
  addEventListener('resize', () => { measure(); onScrollFx(); });
  addEventListener('load', () => { measure(); onScrollFx(); });
  addEventListener('scroll', onScrollFx, { passive: true });
  if (lenis) lenis.on('scroll', onScrollFx);

  // ---------- spaces tabs (home): click a column on desktop; phone variants rotate every 4 s
  const TAB_V = { desk: ['framer-v-1e9omus', 'framer-v-qogz9h', 'framer-v-1x27uff'], phone: ['framer-v-1d45ljg', 'framer-v-bevcpy', 'framer-v-fhrqg1'] };
  const TAB_BG = [
    { box: 'framer-idv73d', img: 'framer-1c8d492', orn: ['framer-quh7mv'], src: BASE + 'assets/img/tab-window.webp', alt: 'Woman reading at the window bar', ornSrc: [BASE + 'assets/img/tab-bulb.webp'] },
    { box: 'framer-8b97nm', img: 'framer-n9ymbs', orn: ['framer-2ni1ac', 'framer-u2dkyi'], src: BASE + 'assets/img/tab-counter.webp', alt: 'Barista making a pour-over at the counter', ornSrc: [BASE + 'assets/img/tab-blossom-a.webp', BASE + 'assets/img/tab-blossom-b.webp'] },
    { box: 'framer-1pqielj', img: 'framer-22issm', orn: ['framer-eu0l4f'], src: BASE + 'assets/img/tab-table.webp', alt: 'Friends talking at the long table', ornSrc: [BASE + 'assets/img/tab-blossom-a.webp'] },
  ];
  $$('.framer-1e9omus').forEach(root => {
    const phone = root.classList.contains(TAB_V.phone[0]), V = phone ? TAB_V.phone : TAB_V.desk;
    const bg1 = root.querySelector('.framer-idv73d'); if (!bg1) return;
    const contents = ['.framer-hxee3', '.framer-j46cs5', '.framer-nd5qp8'].map(s => root.querySelector(s));
    // build BG 2/3 from BG 1's markup (the SSR only renders the active tab's photo)
    const boxes = TAB_BG.map((b, i) => {
      if (i === 0) return bg1;
      const box = bg1.cloneNode(true); box.className = b.box; box.dataset.framerName = 'BG ' + (i + 1);
      const ornT = box.querySelector('.framer-quh7mv'), imgW = box.querySelector('.framer-1c8d492');
      imgW.className = b.img; imgW.dataset.framerName = 'BG ' + (i + 1);
      const im = imgW.querySelector('img'); im.src = b.src; im.alt = b.alt;
      b.orn.forEach((oc, j) => { const o = j === 0 ? ornT : ornT.cloneNode(true); o.className = oc; o.dataset.framerName = 'Ornament ' + (i + 1); o.querySelector('img').src = b.ornSrc[j]; if (j) imgW.before(o); });
      box.hidden = true; bg1.after(box); return box;
    });
    const showBg = i => boxes.forEach((b, j) => {
      b.hidden = j !== i; if (j !== i) return;
      const ph = b.querySelector('.' + TAB_BG[j].img), orn = TAB_BG[j].orn.map(c => b.querySelector('.' + c));
      play(ph, [{ opacity: .5 }, { opacity: 1 }], T.tabBg);
      orn.forEach(o => play(o, [{ opacity: 0, transform: 'scale(0)' }, { opacity: 1, transform: 'scale(1)' }], T.pop, .1));
    });
    let cur = 0, timer = 0;
    const set = (i, auto) => {
      if (i === cur && !auto) return;
      root.classList.remove(V[cur]); root.classList.add(V[i]); cur = i;
      contents.forEach((c, j) => { c.style.transition = `opacity ${T.tab.duration}ms ${T.tab.easing}`; c.style.opacity = j === i ? 1 : .6; });
      showBg(i);
      if (phone) { clearTimeout(timer); timer = setTimeout(() => set((cur + 1) % 3, true), 4000); }
    };
    contents.forEach((c, j) => { c.style.cursor = 'pointer'; c.addEventListener('click', () => set(j)); });
    // first photo + ornament play their reveal when the block scrolls into view
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); showBg(0); if (phone) timer = setTimeout(() => set(1, true), 4000); } }, { threshold: 0 });
    $$('.framer-1c8d492, .framer-quh7mv', bg1).forEach(el => { el.style.opacity = el.classList.contains('framer-quh7mv') ? 0 : .5; });
    io.observe(root);
  });

  // ---------- testimonial slider: 4 stacked tickets, autoplay 4 s, spring .8 / .1
  const CARDS = ['framer-1decrcf-container', 'framer-t1oyk2-container', 'framer-8rzfpl-container', 'framer-1inh46w-container'];
  const STATES = [  // [opacity, rotate] per card, per active slide (from the component's variants)
    [[1, -4], [.6, 0], [0, -4], [0, -4]],
    [[0, -20], [1, -4], [.6, 0], [0, -4]],
    [[0, -4], [0, -20], [1, -4], [.6, 0]],
    [[.6, 0], [0, -4], [0, -20], [1, -4]],
  ];
  const BULLETS = ['framer-nb932q', 'framer-10j1gqh', 'framer-1ljez8i', 'framer-5zr9u3'];
  const SLIDE_V = [  // root variant classes per breakpoint set: they carry the stacking (active ticket z-index 2, in flow)
    ['framer-v-xcz8ot', 'framer-v-1b5ie9l', 'framer-v-15sj4ju', 'framer-v-ffaoyk'],
    ['framer-v-oyi0y', 'framer-v-7vm76x', 'framer-v-13ajswi', 'framer-v-17934av'],
    ['framer-v-1rqmnfu', 'framer-v-1hqt7on', 'framer-v-ermszt', 'framer-v-12wj5x2'],
  ];
  $$('.framer-xcz8ot').forEach(root => {
    const cards = CARDS.map(c => root.querySelector('.' + c)), bul = BULLETS.map(c => root.querySelector('.' + c));
    if (cards.some(c => !c)) return;
    const VS = SLIDE_V.find(set => root.classList.contains(set[0])) || SLIDE_V[0];
    let cur = 0, timer = 0;
    const go = i => {
      root.classList.remove(VS[cur]);
      cur = (i + 4) % 4;
      root.classList.add(VS[cur]);
      cards.forEach((c, j) => {
        const [o, r] = STATES[cur][j];
        c.getAnimations().forEach(a => a.commitStyles && a.commitStyles());
        c.getAnimations().forEach(a => a.cancel());
        play(c, [{ opacity: getComputedStyle(c).opacity, transform: getComputedStyle(c).transform }, { opacity: o, transform: `rotate(${r}deg)` }], T.slide);
        c.style.pointerEvents = o === 1 ? 'auto' : 'none';
      });
      bul.forEach((b, j) => { if (!b) return; b.style.transition = `opacity ${T.slide.duration}ms ${T.slide.easing}`; b.style.opacity = j === cur ? 1 : .4; });
      clearTimeout(timer); timer = setTimeout(() => go(cur + 1), 4000);
    };
    bul.forEach((b, j) => b && (b.style.cursor = 'pointer', b.addEventListener('click', () => go(j))));
    const arrows = $$('.framer-kziukb-container, .framer-13n35dv-container', root);
    if (arrows[0]) arrows[0].addEventListener('click', () => go(cur - 1));
    if (arrows[1]) arrows[1].addEventListener('click', () => go(cur + 1));
    arrows.forEach(a => { a.style.cursor = 'pointer'; a.setAttribute('role', 'button'); a.tabIndex = 0;
      a.setAttribute('aria-label', a === arrows[0] ? 'Previous review' : 'Next review');
      a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } }); });
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); timer = setTimeout(() => go(1), 4000); } }, { threshold: 0 });
    if (shown(root)) io.observe(root); else timer = 0;
  });

  // ---------- menu accordion (4 groups, all open): header tap toggles; height spring .6 / 0; chevron flips 180
  const ACC = [  // [root class, closed, open, closed (small), open (small), header, icon]
    ['framer-bew9ig', 'framer-v-bew9ig', 'framer-v-px3u17', 'framer-v-1lksyjn', 'framer-v-1qvqbst', 'framer-v0nt3f', 'framer-vtggwz'],
    ['framer-t8yanj', 'framer-v-t8yanj', 'framer-v-1staeg9', 'framer-v-1l7u5cy', 'framer-v-e8n0xn', 'framer-1wf6etg', 'framer-g40msz'],
    ['framer-pzghj6', 'framer-v-pzghj6', 'framer-v-8l2jc9', 'framer-v-ehmttb', 'framer-v-69t1d2', 'framer-knmxxw', 'framer-xj56g9'],
    ['framer-dxfe8k', 'framer-v-dxfe8k', 'framer-v-1k3w931', 'framer-v-ghm8k', 'framer-v-75obbv', 'framer-vf07i2', 'framer-i36fpp'],
  ];
  ACC.forEach(([root, c, o, cs, os, head, icon]) => $$('.' + root).forEach(el => {
    const h = el.querySelector('.' + head), ic = el.querySelector('.' + icon); if (!h) return;
    h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', 'true');
    h.addEventListener('click', () => {
      const small = el.classList.contains(cs) || el.classList.contains(os), open = el.classList.contains(small ? os : o);
      const from = el.getBoundingClientRect().height;
      el.classList.remove(small ? os : o, small ? cs : c); el.classList.add(open ? (small ? cs : c) : (small ? os : o));
      const to = el.getBoundingClientRect().height;
      h.style.setProperty('--border-color', open ? 'rgba(36, 32, 26, 0.2)' : 'rgba(36, 32, 26, 0)');
      h.setAttribute('aria-expanded', String(!open));
      if (ic) { ic.style.transition = `transform ${T.acc.duration}ms ${T.acc.easing}`; ic.style.transform = `rotate(${open ? 0 : 180}deg)`; }
      el.getAnimations().forEach(a => a.cancel());
      play(el, [{ height: from + 'px' }, { height: to + 'px' }], T.acc).finished.then(a => { el.style.height = ''; a.cancel && a.cancel(); measure(); onScrollFx(); });
      if (lenis) setTimeout(() => lenis.resize(), T.acc.duration + 20);
    });
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.click(); } });
  }));

  // ---------- phone menu: header grows in the page flow (73 -> ~399), turns white (or stays pine on blue pages), bars cross
  const deskLinks = $('header[data-framer-name^="Desktop"] [data-framer-name="nav links"]');
  $$('header[data-framer-name^="Mobile"]').forEach(hd => {
    const invert = /Invert/.test(hd.dataset.framerName), nav = hd.querySelector('.framer-193upmw'), ham = hd.querySelector('.framer-fdd3hi');
    if (!nav || !ham) return;
    if (deskLinks && !hd.querySelector('[data-framer-name="nav links"]')) { const l = deskLinks.cloneNode(true); l.classList.add('hp9-mlinks'); nav.append(l); }
    ham.setAttribute('role', 'button'); ham.setAttribute('aria-label', 'Open menu'); ham.setAttribute('aria-expanded', 'false');
    const CL = invert ? ['framer-v-h6ugw7', 'framer-v-8xb5ga'] : ['framer-v-1jd0wom', 'framer-v-wm9fpd'];
    const toggle = force => {
      const open = force ?? !hd.classList.contains(CL[1]);
      const from = hd.getBoundingClientRect().height;
      hd.classList.toggle(CL[0], !open); hd.classList.toggle(CL[1], open); hd.classList.toggle('hp9-open', open);
      const to = hd.getBoundingClientRect().height;
      play(hd, [{ height: from + 'px' }, { height: to + 'px' }], T.menu).finished.then(a => a.cancel());
      ham.setAttribute('aria-expanded', String(open)); ham.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (lenis) setTimeout(() => lenis.resize(), 260);
      setTimeout(() => { measure(); onScrollFx(); }, 260);
    };
    ham.addEventListener('click', () => toggle());
    ham.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    $$('a', nav).forEach(a => a.addEventListener('click', () => toggle(false)));
  });

  // ---------- gallery ticker: 40 px/s leftward, gap 32 (20 on phones), no hover slow-down
  function ticker(ul) {
    const items = [...ul.children]; if (!items.length || ul._done) return; ul._done = true;
    const gap = parseFloat(getComputedStyle(ul).columnGap || getComputedStyle(ul).gap) || 0;
    const setW = items.reduce((n, li) => n + li.getBoundingClientRect().width + gap, 0);
    const need = Math.ceil((innerWidth * 2) / setW) + 1;
    for (let k = 1; k < need; k++) items.forEach(li => { const c = li.cloneNode(true); c.setAttribute('aria-hidden', 'true'); ul.append(c); });
    ul.style.opacity = 1; ul.style.transform = 'none'; ul.style.willChange = 'transform';
    if (reduced) return;
    ul.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-setW}px)` }], { duration: setW / 40 * 1000, iterations: Infinity, easing: 'linear' });
  }
  const runTickers = () => $$('[data-framer-name="Images"] > ul').forEach(ul => shown(ul) && ticker(ul));
  if (document.readyState === 'complete') runTickers(); else addEventListener('load', runTickers);
  matchMedia('(max-width: 809.98px)').addEventListener('change', runTickers);

  // ---------- contact form: Loading spinner, then the template's "Thank you" state (no backend wired)
  $$('form[data-framer-form]').forEach(f => {
    f.removeAttribute('method');
    $$('input[name="framer-noscript"]', f).forEach(i => i.remove());
    f.addEventListener('submit', e => {
      e.preventDefault();
      const btn = f.querySelector('button[type="submit"]'); if (!btn) return;
      const p = btn.querySelector('p'), spin = btn.querySelector('[data-framer-name="Spinner"]');
      btn.disabled = true; btn.classList.add('hp9-loading'); if (p) p.dataset.text = p.textContent;
      setTimeout(() => { btn.classList.remove('hp9-loading'); btn.classList.add('hp9-success'); if (p) p.textContent = 'Thank you'; f.reset(); }, 1200);
    });
  });

  document.documentElement.classList.add('hp9-ready');
})();
