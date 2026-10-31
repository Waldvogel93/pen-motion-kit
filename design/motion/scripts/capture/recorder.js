// Регистратор движения. Ставится в страницу до её скриптов (context.addInitScript) и копит события
// RawEvent (см. analyze.mjs): CSS-переходы и CSS-анимации, вызовы Element.animate и покадровые замеры
// элементов, у которых JS меняет style (у SVG — ещё атрибуты transform/opacity).
// Обычный браузерный JS без модулей. Снаружи: window.__motionCapture.
(() => {
  if (window.__motionCapture || window !== window.top) return;

  const MAX_SAMPLED = 40; // элементов (не замеров) на фазу
  const AMBIENT_MS = 300; // мутация ближе к концу фазы — элемент считается фоновой петлёй
  const QUIET_MS = 1500; // столько без изменений — замер закончен
  const MAX_SAMPLES = 900; // ~15 с при 60 к/с; дальше замер закрывается до конца фазы
  const TAIL = 30; // замеров покоя после последнего изменения, что уходят в событие
  const MAX_EVENTS = 2000; // сырых событий на триггер; сверх — только счёт
  const SIMPLE = /^[A-Za-z_][\w-]*$/;

  let phase = 'load';
  let trigger = 'load';
  let subject = null; // наведённый или сфокусированный элемент текущей подфазы
  let step = 0; // номер подфазы: растёт с каждым setPhase — у каждого кандидата наведения свой
  let events = [];
  let lastActivityAt = 0;
  const perTrigger = {};
  const dropped = {};
  const lost = {}; // CSS-события, чьей анимации уже не было, когда разбиралась пачка: триггер -> число
  const notes = [];
  const counted = new Map(); // фаза -> Set элементов, занявших место в бюджете замеров
  const countedIn = (p) => counted.get(p) || counted.set(p, new Set()).get(p);
  const sampling = new Map(); // элемент -> текущий замер
  let capped = new WeakSet(); // элементы, чей замер упёрся в MAX_SAMPLES в этой фазе
  const ambient = new WeakSet(); // фоновые петли: двигались в конце прошлой фазы, больше не замеряем
  const lastMutation = new Map(); // элемент -> время последней мутации style/transform в этой фазе
  const selectors = new WeakMap();
  let looping = false;

  function push(ev) {
    const t = ev.trigger;
    perTrigger[t] = (perTrigger[t] || 0) + 1;
    if (perTrigger[t] > MAX_EVENTS) {
      dropped[t] = (dropped[t] || 0) + 1;
      return;
    }
    events.push(ev);
    lastActivityAt = performance.now();
  }

  // --- Описание элемента ---

  function part(el) {
    if (el.id && SIMPLE.test(el.id)) return { sel: `#${el.id}`, done: true };
    const tag = el.localName; // у SVG регистр важен: linearGradient
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter((c) => SIMPLE.test(c)).slice(0, 2);
    let sel = tag + cls.map((c) => `.${c}`).join('');
    const parent = el.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      if (same.length > 1) sel += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    return { sel, done: false };
  }

  // Короткий CSS-путь: id или tag.class:nth-of-type, до 4 уровней, пока не станет однозначным.
  function selectorOf(el) {
    const cached = selectors.get(el);
    if (cached) return cached;
    const parts = [];
    let sel = '';
    let cur = el;
    for (let level = 0; cur && cur.nodeType === 1 && level < 4; level++) {
      const p = part(cur);
      parts.unshift(p.sel);
      sel = parts.join(' > ');
      if (p.done || cur === document.body || cur === document.documentElement) break;
      try {
        if (document.querySelectorAll(sel).length === 1) break;
      } catch {
        break;
      }
      cur = cur.parentElement;
    }
    selectors.set(el, sel);
    return sel;
  }

  function roleOf(el) {
    if (el.matches('button, [role=button], input[type=submit]')) return 'button';
    if (el.matches('a[href]')) return 'link';
    if (/^h[1-3]$/i.test(el.tagName)) return 'heading';
    if (el.matches('input, textarea, select')) return 'input';
    if (el.matches('img, svg, picture, video') || el instanceof SVGElement) return 'image';
    const cs = getComputedStyle(el);
    const border = ['Top', 'Right', 'Bottom', 'Left']
      .some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    if ((border || cs.boxShadow !== 'none') && el.children.length >= 2) return 'card';
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return 'text';
    return 'other';
  }

  // Текст по узлам через пробел: textContent склеил бы «Один» и «Карточка» из соседних блоков.
  function textOf(el) {
    if (el.matches('input, textarea')) return (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().slice(0, 80);
    const label = el.getAttribute('aria-label');
    if (label) return label.trim().slice(0, 80);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest('script, style, noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let text = '';
    while (text.length < 80 && walker.nextNode()) {
      const part = walker.currentNode.textContent.replace(/\s+/g, ' ').trim();
      if (part) text += (text ? ' ' : '') + part;
    }
    return text.slice(0, 80);
  }

  // Цель — сам наведённый элемент, внутри него или его предок: это реакция на наведение, а не фон.
  function nearSubject(el) {
    try {
      return !!subject && (el === subject || subject.contains(el) || el.contains(subject));
    } catch {
      return false;
    }
  }

  // inView — элемент в окне сейчас: анимация вне экрана во время наведения — не реакция на него.
  function target(el, pseudo) {
    const r = el.getBoundingClientRect();
    return {
      selector: selectorOf(el) + (pseudo || ''),
      tag: el.localName,
      role: roleOf(el),
      text: textOf(el),
      box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      inView: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
    };
  }

  // --- Анимации браузера (CSS и WAAPI) ---

  const num = (v, d) => (typeof v === 'number' && !Number.isNaN(v) ? v : d);

  function timingOf(effect) {
    const t = effect.getTiming();
    const ct = effect.getComputedTiming();
    return {
      duration: num(ct.duration, num(t.duration, 0)),
      delay: num(t.delay, 0),
      easing: t.easing || 'linear',
      iterations: num(t.iterations, 1),
      direction: t.direction || 'normal',
      fill: ct.fill || t.fill || 'none',
    };
  }

  // Анимации на scroll-timeline считают время в процентах прокрутки — в записи их не перевести.
  function onDocumentTimeline(anim, el, pseudo) {
    if (!anim.timeline || anim.timeline instanceof DocumentTimeline) return true;
    const selector = selectorOf(el) + (pseudo || '');
    if (!notes.some((n) => n.selector === selector)) {
      notes.push({ selector, reason: 'анимация по прокрутке (scroll-timeline) — только на видео' });
    }
    return false;
  }

  // getKeyframes() у CSS-анимаций в Chrome не отдаёт CSS-переменные (`--angle` в @keyframes) —
  // берём их из самого правила @keyframes (последнее с таким именем; чужие таблицы стилей закрыты).
  const keyframeRules = new Map(); // имя -> [{ offset, '--x': value }] или null

  function ruleFrames(name) {
    if (keyframeRules.has(name)) return keyframeRules.get(name);
    let found = null;
    const visit = (rules) => {
      for (const rule of rules) {
        if (typeof CSSKeyframesRule !== 'undefined' && rule instanceof CSSKeyframesRule) {
          if (rule.name === name) found = rule;
        } else if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) {
      try {
        visit(sheet.cssRules);
      } catch {
        // таблица с другого домена без CORS
      }
    }
    let frames = null;
    if (found) {
      frames = [];
      for (const kf of found.cssRules) {
        const vars = {};
        for (let i = 0; i < kf.style.length; i++) {
          const p = kf.style[i];
          if (p.startsWith('--')) vars[p] = kf.style.getPropertyValue(p).trim();
        }
        if (!Object.keys(vars).length) continue;
        for (const key of kf.keyText.split(',')) {
          const k = key.trim();
          const offset = k === 'from' ? 0 : k === 'to' ? 1 : parseFloat(k) / 100;
          if (Number.isFinite(offset)) frames.push({ offset, vars });
        }
      }
      if (!frames.length) frames = null;
    }
    keyframeRules.set(name, frames);
    return frames;
  }

  function keyframesOf(anim, kind) {
    const kfs = anim.effect.getKeyframes();
    if (kind !== 'css-animation' || !anim.animationName) return kfs;
    const frames = ruleFrames(anim.animationName);
    if (!frames) return kfs;
    return kfs.map((k) => {
      const at = typeof k.computedOffset === 'number' ? k.computedOffset : k.offset;
      const extra = {};
      for (const f of frames) if (Math.abs(f.offset - at) < 1e-6) Object.assign(extra, f.vars);
      return { ...extra, ...k };
    });
  }

  function exactEvent(stamp, kind, el, pseudo, anim, t0, extra) {
    const effect = anim.effect;
    return {
      phase: stamp.phase, trigger: stamp.trigger, step: stamp.step, nearSubject: stamp.near, kind, target: target(el, pseudo), t0,
      keyframes: keyframesOf(anim, kind), timing: timingOf(effect), ...extra,
    };
  }

  // CSS-события копятся и разбираются пачкой: el.getAnimations() в Chrome перебирает все анимации
  // документа, и 500 карточек стоили бы ~0,5 с; один document.getAnimations() на пачку — ~1 мс.
  let pending = [];
  let flushQueued = false;

  function flushCss() {
    flushQueued = false;
    const items = pending;
    pending = [];
    if (!items.length) return;
    const byTarget = new Map();
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.target;
      if (!t) continue;
      if (!byTarget.has(t)) byTarget.set(t, []);
      byTarget.get(t).push(a);
    }
    for (const it of items) {
      try {
        const found = (byTarget.get(it.el) || [])
          .filter((a) => (a.effect.pseudoElement || '') === it.pseudo && it.match(a));
        const anim = found[found.length - 1];
        if (!anim) {
          // Короткий переход закончился (или отменён) до разбора пачки: снять нечего, но и молчать не стоит.
          lost[it.trigger] = (lost[it.trigger] || 0) + 1;
          continue;
        }
        if (!onDocumentTimeline(anim, it.el, it.pseudo)) continue;
        // t0 — старт до задержки: startTime анимации, а пока он не назначен — момент события.
        const t0 = typeof anim.startTime === 'number' ? anim.startTime : it.at;
        push(exactEvent(it, it.kind, it.el, it.pseudo, anim, t0, it.extra));
      } catch {
        // одно событие не должно мешать остальным
      }
    }
  }

  function queueCss(e, kind, match, extra) {
    try {
      const el = e.target;
      if (!(el instanceof Element)) return;
      lastActivityAt = performance.now();
      pending.push({ el, pseudo: e.pseudoElement || '', kind, match, extra, phase, trigger, step, near: nearSubject(el), at: lastActivityAt });
      if (!flushQueued) {
        flushQueued = true;
        setTimeout(() => {
          try {
            flushCss();
          } catch {
            // регистратор не ломает страницу
          }
        }, 0);
      }
    } catch {
      // событие страницы не должно ломаться из-за регистратора
    }
  }

  document.addEventListener('transitionrun', (e) => queueCss(e, 'css-transition',
    (a) => typeof CSSTransition !== 'undefined' && a instanceof CSSTransition && a.transitionProperty === e.propertyName,
    { property: e.propertyName }), true);
  document.addEventListener('animationstart', (e) => queueCss(e, 'css-animation',
    (a) => typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation && a.animationName === e.animationName,
    { name: e.animationName }), true);

  const originalAnimate = Element.prototype.animate;
  if (typeof originalAnimate === 'function') {
    Element.prototype.animate = function animate(...args) {
      const anim = originalAnimate.apply(this, args);
      try {
        const pseudo = (anim.effect && anim.effect.pseudoElement) || '';
        if (onDocumentTimeline(anim, this, pseudo)) {
          push(exactEvent({ phase, trigger, step, near: nearSubject(this) }, 'waapi', this, pseudo, anim, performance.now(), anim.id ? { name: anim.id } : {}));
        }
      } catch {
        // анимацию страницы возвращаем в любом случае
      }
      return anim;
    };
  }

  // --- Замер JS-анимаций ---

  // Прокрутка страницы, px: часть сайтов прокручивает body, а не окно.
  function scrollPos() {
    const se = document.scrollingElement || document.documentElement;
    return Math.round(Math.max(window.scrollY, se ? se.scrollTop : 0, document.body ? document.body.scrollTop : 0));
  }

  // translate, scale, rotate — отдельные свойства трансформации (Tailwind v4, Motion): JS может двигать ими.
  // sy — прокрутка в момент замера: по ней видно движение, привязанное к прокрутке (параллакс, scrub).
  function read(el, t) {
    const cs = getComputedStyle(el);
    const s = {
      t: Math.round(t * 10) / 10, sy: scrollPos(), transform: cs.transform, opacity: cs.opacity, filter: cs.filter,
      clipPath: cs.clipPath, translate: cs.translate, scale: cs.scale, rotate: cs.rotate,
    };
    if (el instanceof SVGElement) s.svgTransform = el.getAttribute('transform') || '';
    return s;
  }

  const keyOf = (s) => `${s.transform}|${s.opacity}|${s.filter}|${s.clipPath}|${s.translate}|${s.scale}|${s.rotate}|${s.svgTransform || ''}`;

  // Каналы движения: семейство трансформации (transform, translate, scale, rotate), прозрачность, фильтр, маска.
  function channelOf(prop) {
    const p = String(prop).toLowerCase();
    if (/^(transform|translate|scale|rotate)$/.test(p)) return 'transform';
    if (p === 'opacity' || p === 'filter') return p;
    if (/^clip-?path$/.test(p)) return 'clip-path';
    return null;
  }

  // Какие каналы замера изменились между двумя замерами.
  function changedChannels(a, b) {
    const out = [];
    if (a.transform !== b.transform || a.translate !== b.translate || a.scale !== b.scale || a.rotate !== b.rotate
      || (a.svgTransform || '') !== (b.svgTransform || '')) out.push('transform');
    if (a.opacity !== b.opacity) out.push('opacity');
    if (a.filter !== b.filter) out.push('filter');
    if (a.clipPath !== b.clipPath) out.push('clip-path');
    return out;
  }

  const channelsOfAnim = new WeakMap(); // анимация -> каналы движения, что она ведёт

  function animChannels(a) {
    if (!channelsOfAnim.has(a)) {
      const props = typeof CSSTransition !== 'undefined' && a instanceof CSSTransition ? [a.transitionProperty]
        : (a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []).flatMap((k) => Object.keys(k));
      channelsOfAnim.set(a, new Set(props.map(channelOf).filter(Boolean)));
    }
    return channelsOfAnim.get(a);
  }

  // Элемент -> каналы, что сейчас ведёт его CSS- или WAAPI-анимация: это движение уже снято точно.
  // Анимации псевдоэлементов не в счёт: замер читает сам элемент. Один document.getAnimations() на кадр —
  // дешевле, чем el.getAnimations() на каждый элемент.
  function animatedChannels() {
    const out = new Map();
    for (const a of document.getAnimations()) {
      const el = a.playState === 'running' && a.effect && !a.effect.pseudoElement && a.effect.target;
      if (!el) continue;
      const chans = animChannels(a);
      if (!chans.size) continue;
      if (!out.has(el)) out.set(el, new Set());
      for (const c of chans) out.get(el).add(c);
    }
    return out;
  }

  // loop — элемент всё ещё двигался в конце фазы или упёрся в потолок замеров: это петля, не одноразовое движение.
  // Замер не нужен, только если КАЖДЫЙ изменившийся канал вела точная анимация: Motion ведёт прозрачность
  // через WAAPI, а сдвиг — из JS, и сдвиг без замера пропал бы. Точные каналы уходят в covered.
  function finish(s, hitCap, loop) {
    sampling.delete(s.el);
    if (hitCap) capped.add(s.el);
    if (!s.changed) return;
    const covered = [...s.chans].filter((c) => s.exact.has(c));
    if (covered.length === s.chans.size) return;
    // Ведущий покой срезаем: первым остаётся последний замер перед первым изменением.
    const firstKey = keyOf(s.samples[0]);
    const firstChange = s.samples.findIndex((x) => keyOf(x) !== firstKey);
    const samples = s.samples.slice(Math.max(0, firstChange - 1), s.lastChangeIdx + 1 + TAIL);
    countedIn(s.phase).add(s.el);
    push({
      phase: s.phase, trigger: s.trigger, step: s.step, nearSubject: s.near, kind: 'js-sampled', target: target(s.el, ''), t0: samples[0].t, samples,
      ...(covered.length ? { covered } : {}), ...(hitCap || loop ? { loop: true } : {}),
    });
  }

  function finishAll(loops) {
    for (const s of [...sampling.values()]) {
      try {
        finish(s, false, !!loops && loops.has(s.el));
      } catch {
        sampling.delete(s.el);
      }
    }
  }

  // Время замера — метка кадра rAF: от неё считают прогресс и JS-библиотеки анимаций, а performance.now()
  // в колбэке на первых кадрах загрузки отстаёт от неё на 10–15 мс и искажает кривую.
  function tick(frameTime) {
    const t = frameTime;
    let animated = null;
    for (const s of [...sampling.values()]) {
      try {
        if (!s.el.isConnected) {
          finish(s, false);
          continue;
        }
        const prev = s.samples[s.samples.length - 1];
        const v = read(s.el, Math.max(t, prev.t));
        const k = keyOf(v);
        s.samples.push(v);
        if (k !== s.key) {
          s.key = k;
          s.changed = true;
          s.changes += 1;
          s.lastChangeIdx = s.samples.length - 1;
          s.lastChangeAt = t;
          lastActivityAt = t;
          // Каналы, ещё не признанные точными, сверяются с анимациями: на первых изменениях, на каждом
          // новом канале и раз в 10 изменений.
          const chans = changedChannels(prev, v);
          const fresh = chans.some((c) => !s.chans.has(c));
          for (const c of chans) s.chans.add(c);
          const open = chans.filter((c) => !s.exact.has(c));
          if (open.length && (fresh || s.changes <= 3 || s.changes % 10 === 0)) {
            animated = animated || animatedChannels();
            const running = animated.get(s.el);
            if (running) for (const c of open) if (running.has(c)) s.exact.add(c);
          }
        }
        if (s.samples.length >= MAX_SAMPLES) finish(s, true);
        else if (t - s.lastChangeAt >= QUIET_MS) finish(s, false);
      } catch {
        sampling.delete(s.el);
      }
    }
    if (sampling.size) requestAnimationFrame(tick);
    else looping = false;
  }

  // Бюджет — элементы, а не замеры: setPhase режет замеры на каждой подфазе наведения, и повторный
  // замер того же элемента в той же фазе нового места не занимает.
  function startSampling(el) {
    if (sampling.has(el) || capped.has(el) || ambient.has(el)) return;
    const done = countedIn(phase);
    if (!done.has(el)) {
      let fresh = 0;
      for (const s of sampling.values()) if (!done.has(s.el)) fresh += 1;
      if (done.size + fresh >= MAX_SAMPLED) return;
    }
    const v = read(el, performance.now());
    // chans — каналы, что менялись; exact — те из них, что вела CSS- или WAAPI-анимация элемента.
    sampling.set(el, {
      el, phase, trigger, step, near: nearSubject(el), samples: [v], key: keyOf(v), changed: false, chans: new Set(), exact: new Set(),
      changes: 0, lastChangeIdx: 0, lastChangeAt: performance.now(),
    });
    if (!looping) {
      looping = true;
      requestAnimationFrame(tick);
    }
  }

  new MutationObserver((list) => {
    for (const m of list) {
      try {
        const el = m.target;
        // Атрибуты transform/opacity значимы только у SVG (Lottie в режиме SVG, SVG-анимации на JS).
        if (m.attributeName !== 'style' && !(el instanceof SVGElement)) continue;
        lastMutation.set(el, performance.now());
        startSampling(el);
      } catch {
        // элемент мог уйти из документа
      }
    }
  }).observe(document, { attributes: true, attributeFilter: ['style', 'transform', 'opacity'], subtree: true });

  window.__motionCapture = {
    // Смена фазы закрывает идущие замеры: движение «туда» и «обратно» не сливаются в одну запись.
    // subjectId — data-motion-capture-id наведённого (сфокусированного) элемента подфазы.
    setPhase(nextPhase, nextTrigger, subjectId) {
      finishAll();
      phase = nextPhase;
      trigger = nextTrigger;
      step += 1;
      subject = subjectId ? document.querySelector(`[data-motion-capture-id="${subjectId}"]`) : null;
      capped = new WeakSet();
    },
    // Отдаёт накопленное и закрывает идущие замеры (что успели снять — уходит событием).
    // Элемент, который JS всё ещё двигает в конце фазы, — фоновая петля (Lottie, бегущая строка):
    // он уже снят в этой фазе, и дальше его не замеряем, чтобы петля не съела бюджет наведения и фокуса.
    drain() {
      try {
        flushCss();
      } catch {
        pending = [];
      }
      const at = performance.now();
      const loops = new Set();
      for (const [el, t] of lastMutation) if (at - t < AMBIENT_MS) loops.add(el);
      finishAll(loops);
      for (const el of loops) ambient.add(el);
      lastMutation.clear();
      const out = events;
      events = [];
      return out;
    },
    status() {
      return {
        lastActivityAt, now: performance.now(), sampling: sampling.size, dropped: { ...dropped }, lost: { ...lost }, notes: [...notes],
      };
    },
    selectorOf,
  };
})();
