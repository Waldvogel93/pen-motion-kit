// Анализ снятых событий движения: нормализация, подбор кривых и пружин, каскады, черновик токенов.
// Чистые функции: без браузера и сети. Длительности и шаги — мс, расстояния и размытие — px,
// кривые округлены до 2 знаков, остальное — целые.

/**
 * @typedef {{ selector: string, tag: string,
 *   role: 'button'|'link'|'card'|'heading'|'text'|'input'|'image'|'other', text: string,
 *   box: { x: number, y: number, w: number, h: number }, inView?: boolean }} TargetInfo
 *
 * t0 — момент создания анимации ДО задержки, мс по часам страницы.
 * Для js-sampled t0 — время первого замера, t замеров — абсолютные мс страницы, sy — прокрутка страницы, px.
 * @typedef {{ phase: string, trigger: 'load'|'scroll'|'hover'|'focus', step?: number, nearSubject?: boolean,
 *   kind: 'css-transition'|'css-animation'|'waapi'|'js-sampled', target: TargetInfo, t0: number,
 *   property?: string, name?: string, keyframes?: object[],
 *   timing?: { duration: number, delay: number, easing: string, iterations: number, direction: string, fill: string },
 *   samples?: { t: number, sy?: number, transform?: string, opacity?: string, filter?: string, clipPath?: string,
 *     translate?: string, scale?: string, rotate?: string, svgTransform?: string }[],
 *   covered?: ('transform'|'opacity'|'filter'|'clip-path')[], loop?: true, repeats?: number }} RawEvent
 *
 * step — номер подфазы регистратора (у каждого кандидата наведения и фокуса свой).
 * nearSubject — цель события и есть наведённый (сфокусированный) элемент, внутри него или содержит его.
 * repeats — сколько раз то же событие было в фазе (collapseRepeats); loop — JS ещё двигал элемент в конце фазы
 * или замер упёрся в потолок. covered — каналы замера, что уже сняты точно (CSS или WAAPI на том же элементе).
 * target.inView — цель была в окне в момент события (false — вне экрана).
 *
 * phase — триггер или подфаза: hover-out (триггер hover), blur (триггер focus).
 * path — все ключевые кадры (только свойства записи), если их три и больше: «1 → 0.5 → 1».
 * loop — фоновая петля (счётчик, тикер, бегущая строка): не реакция и не токен; repeats — число повторов.
 * direction — направление CSS/WAAPI, если не normal (alternate — туда-обратно).
 * scrollLinked — движение привязано к прокрутке (параллакс, scrub): scrollPx — за сколько px прокрутки,
 * длительности и кривой нет (durationMs 0), в токены не входит.
 * @typedef {{ id: string, phase: string, trigger: string, kind: string, basis: 'exact'|'sampled',
 *   target: TargetInfo, properties: string[], from: Record<string, string>, to: Record<string, string>,
 *   path?: Record<string, string>[], loop?: true, repeats?: number, direction?: string,
 *   scrollLinked?: true, scrollPx?: number,
 *   durationMs: number, delayMs: number, startMs: number, easing: number[]|string, easingName: string,
 *   iterations: number, spring: ReturnType<typeof fitSpring> }} AnimationRecord
 *
 * @typedef {{ duration: { fast: number, base: number, slow: number },
 *   ease: { enter: number[], exit: number[], move: number[] },
 *   spring: { snappy: { stiffness: number, damping: number, mass: number }, soft: { stiffness: number, damping: number, mass: number } },
 *   stagger: number, distance: number, blur: number }} MotionTokens
 */

const round2 = (n) => Math.round(n * 100) / 100;
const noNegZero = (n) => (n === 0 ? 0 : n);

// Сначала кривые плана в его порядке, затем частые на сайтах: Material (они же ease-* в Tailwind),
// функции Пеннера в двух ходовых записях (easings.net и старая CSS-таблица) и шторка Vaul.
export const NAMED_CURVES = [
  ['ease-out strong', [0.23, 1, 0.32, 1]],
  ['ease-in-out strong', [0.77, 0, 0.175, 1]],
  ['M3 standard', [0.2, 0, 0, 1]],
  ['M3 emphasized decelerate', [0.05, 0.7, 0.1, 1]],
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
  ['linear', [0, 0, 1, 1]],
  ['Material standard', [0.4, 0, 0.2, 1]],
  ['Material decelerate', [0, 0, 0.2, 1]],
  ['Material accelerate', [0.4, 0, 1, 1]],
  ['easeOutQuad', [0.25, 0.46, 0.45, 0.94]],
  ['easeOutQuad', [0.5, 1, 0.89, 1]],
  ['easeOutCubic', [0.33, 1, 0.68, 1]],
  ['easeOutCubic', [0.215, 0.61, 0.355, 1]],
  ['easeOutQuart', [0.25, 1, 0.5, 1]],
  ['easeOutQuart', [0.165, 0.84, 0.44, 1]],
  ['easeOutQuint', [0.22, 1, 0.36, 1]],
  ['easeOutExpo', [0.16, 1, 0.3, 1]],
  ['easeOutExpo', [0.19, 1, 0.22, 1]],
  ['easeInOutCubic', [0.65, 0, 0.35, 1]],
  ['easeInOutCubic', [0.645, 0.045, 0.355, 1]],
  ['easeInOutQuart', [0.76, 0, 0.24, 1]],
  ['easeOutSine', [0.61, 1, 0.88, 1]],
  ['easeOutSine', [0.39, 0.575, 0.565, 1]],
  ['easeInOutSine', [0.37, 0, 0.63, 1]],
  ['easeInOutSine', [0.45, 0.05, 0.55, 0.95]],
  ['easeInOutQuad', [0.45, 0, 0.55, 1]],
  ['easeInOutQuad', [0.455, 0.03, 0.515, 0.955]],
  ['easeOutBack', [0.34, 1.56, 0.64, 1]],
  ['Vaul drawer', [0.32, 0.72, 0, 1]],
];
const CUSTOM = 'своя';

const sameCurve = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.0051);
const curveKey = (c) => c.map((x) => round2(x)).join(',');

// Свойства, у которых меняется только цвет: это не стиль движения (тема навигации при прокрутке и т. п.).
const COLOR_PROP = /^(color|fill|stroke|stop-color|flood-color|lighting-color|accent-color|caret-color|outline-color|text-decoration-color|text-emphasis-color|column-rule-color|background-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color)$/;

/** Запись меняет только цвет. */
export function isColorOnly(r) {
  const props = r?.properties ?? [];
  return props.length > 0 && props.every((p) => COLOR_PROP.test(p));
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Перцентиль по ближайшему рангу.
function percentile(list, p) {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}

const nums = (str) => (str.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number);

// Длина в px: «24px», «-50%» (от basis), «calc(-50% - 28px)», «1.5rem». Без basis проценты — 0.
function lengthPx(str, basis = 0) {
  let sum = 0;
  const body = String(str).replace(/calc\(/gi, '(');
  for (const m of body.matchAll(/([+-])?\s*(\d*\.?\d+(?:e[+-]?\d+)?)(px|%|r?em)?/gi)) {
    let v = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    const unit = (m[3] ?? 'px').toLowerCase();
    if (unit === '%') v = (v / 100) * basis;
    else if (unit !== 'px') v *= 16;
    sum += v;
  }
  return sum;
}

// Угол в градусах: deg, rad, turn, grad.
function angleDeg(str) {
  const m = /(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*(deg|rad|turn|grad)?/i.exec(String(str));
  if (!m) return 0;
  const v = Number(m[1]);
  const unit = (m[2] ?? 'deg').toLowerCase();
  if (unit === 'rad') return (v * 180) / Math.PI;
  if (unit === 'turn') return v * 360;
  if (unit === 'grad') return v * 0.9;
  return v;
}

// Аргументы функции через запятую или пробел верхнего уровня (calc(...) — один аргумент).
function args(str) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(str)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if ((ch === ',' || /\s/.test(ch)) && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Раскладывает CSS/SVG transform на сдвиг, масштаб и поворот (градусы); проценты сдвига — от box. */
export function decomposeTransform(css, box) {
  const out = { tx: 0, ty: 0, scale: 1, rotate: 0 };
  if (typeof css !== 'string') return out;
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;
  const re = /([a-zA-Z0-9]+)\(((?:[^()]|\([^()]*\))*)\)/g;
  let m;
  while ((m = re.exec(css))) {
    const fn = m[1].toLowerCase();
    const a = nums(m[2]);
    const parts = args(m[2]);
    if (fn === 'matrix' && a.length >= 6) {
      out.tx += a[4];
      out.ty += a[5];
      out.scale *= Math.hypot(a[0], a[1]);
      out.rotate += (Math.atan2(a[1], a[0]) * 180) / Math.PI;
    } else if (fn === 'matrix3d' && a.length >= 16) {
      out.tx += a[12];
      out.ty += a[13];
      out.scale *= Math.hypot(a[0], a[1]);
      out.rotate += (Math.atan2(a[1], a[0]) * 180) / Math.PI;
    } else if (fn === 'translate' || fn === 'translate3d') {
      out.tx += parts[0] ? lengthPx(parts[0], w) : 0;
      out.ty += parts[1] ? lengthPx(parts[1], h) : 0;
    } else if (fn === 'translatex') out.tx += lengthPx(parts[0] ?? '0', w);
    else if (fn === 'translatey') out.ty += lengthPx(parts[0] ?? '0', h);
    else if (fn === 'scale' || fn === 'scale3d' || fn === 'scalex') out.scale *= a[0] ?? 1;
    else if (fn === 'rotate' || fn === 'rotatez') out.rotate += angleDeg(parts[0] ?? '0');
  }
  return { tx: noNegZero(out.tx), ty: noNegZero(out.ty), scale: out.scale, rotate: noNegZero(out.rotate) };
}

/**
 * Сдвиг, масштаб и поворот стороны записи (from, to, ключевой кадр, замер): transform (или SVG transform)
 * плюс отдельные свойства translate, scale и rotate — Tailwind v4 и современный CSS двигают ими.
 */
export function decomposeMotion(side, box) {
  const base = decomposeTransform(side?.transform ?? side?.svgTransform ?? 'none', box);
  let { tx, ty, scale, rotate } = base;
  const tr = String(side?.translate ?? 'none').trim();
  if (tr && tr !== 'none') {
    const [x = '0', y = '0'] = args(tr);
    tx += lengthPx(x, box?.w ?? 0);
    ty += lengthPx(y, box?.h ?? 0);
  }
  const sc = String(side?.scale ?? 'none').trim();
  if (sc && sc !== 'none') {
    const [first] = args(sc);
    const v = parseFloat(first);
    if (Number.isFinite(v)) scale *= first.endsWith('%') ? v / 100 : v;
  }
  const rt = String(side?.rotate ?? 'none').trim();
  if (rt && rt !== 'none') {
    const parts = args(rt);
    rotate += angleDeg(parts[parts.length - 1]);
  }
  return { tx: noNegZero(tx), ty: noNegZero(ty), scale, rotate: noNegZero(rotate) };
}

// y кубической кривой Безье при заданном x (бисекция по параметру).
function bezierY([x1, y1, x2, y2], x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const s = (lo + hi) / 2;
    const u = 1 - s;
    const bx = 3 * x1 * s * u * u + 3 * x2 * s * s * u + s ** 3;
    if (bx < x) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  const u = 1 - s;
  return 3 * y1 * s * u * u + 3 * y2 * s * s * u + s ** 3;
}

function rms(curve, pts) {
  let sum = 0;
  for (const p of pts) sum += (bezierY(curve, p.t) - p.v) ** 2;
  return Math.sqrt(sum / pts.length);
}

const TIE = 0.006;

/** Подбирает кривую по нормированному прогрессу (t, v в 0..1): сначала именованные, затем сетка. */
export function fitEasing(samples) {
  // Не больше ~40 точек: скорость подбора важнее лишней точности.
  const stride = Math.max(1, Math.floor(samples.length / 40));
  const pts = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);

  // Почти равные (в пределах TIE) — за той, что раньше в списке: кривые плана выигрывают у двойников
  // (ease-out strong и easeOutQuint расходятся на 0.005, и шум замера не должен менять имя).
  const scored = NAMED_CURVES.map(([name, curve]) => ({ name, easing: curve, error: rms(curve, pts) }));
  const minError = Math.min(...scored.map((s) => s.error));
  const best = scored.find((s) => s.error <= minError + TIE);
  if (best.error <= 0.03) return { easing: [...best.easing], name: best.name, error: round4(best.error) };

  // Сетка шагом 0.05: сначала грубо (0.2), затем шагом 0.05 вокруг лучшей точки.
  const clampX = (x) => Math.min(1, Math.max(0, x));
  const clampY = (y) => Math.min(1.5, Math.max(-0.5, y));
  let grid = { easing: best.easing, error: best.error };
  const scan = (xs1, ys1, xs2, ys2) => {
    for (const x1 of xs1) for (const y1 of ys1) for (const x2 of xs2) for (const y2 of ys2) {
      const c = [x1, y1, x2, y2];
      const error = rms(c, pts);
      if (error < grid.error) grid = { easing: c, error };
    }
  };
  const range = (a, b, step) => {
    const out = [];
    for (let v = a; v <= b + 1e-9; v += step) out.push(round2(v));
    return out;
  };
  scan(range(0, 1, 0.2), range(-0.5, 1.5, 0.2), range(0, 1, 0.2), range(-0.5, 1.5, 0.2));
  const [cx1, cy1, cx2, cy2] = grid.easing;
  const around = (c, lo, hi) => range(Math.max(lo, c - 0.2), Math.min(hi, c + 0.2), 0.05);
  scan(around(cx1, 0, 1).map(clampX), around(cy1, -0.5, 1.5).map(clampY),
    around(cx2, 0, 1).map(clampX), around(cy2, -0.5, 1.5).map(clampY));
  return { easing: grid.easing.map(round2), name: CUSTOM, error: round4(grid.error) };
}

const round4 = (n) => Math.round(n * 10000) / 10000;

/** Подбирает пружину (масса 1) по ответу на шаг: t в мс, v — прогресс к 1. null, если перелёта нет. */
export function fitSpring(samples) {
  if (!samples || samples.length < 3) return null;
  let peak = samples[0];
  for (const s of samples) if (s.v > peak.v) peak = s;
  const os = peak.v - 1;
  if (peak.v <= 1.01 || os >= 1) return null; // перелёт ≥ 100% — не пружина (ζ ≤ 0)
  const t0 = samples[0].t;
  const tp = (peak.t - t0) / 1000;
  if (tp <= 0) return null;
  const ln = Math.log(os);
  const zeta = -ln / Math.sqrt(Math.PI ** 2 + ln ** 2);
  // ωn по времени первого пика: π / (tp·√(1−ζ²)).
  const wn = Math.PI / (tp * Math.sqrt(1 - zeta * zeta));
  let last = -1;
  samples.forEach((s, i) => {
    if (Math.abs(s.v - 1) > 0.02) last = i;
  });
  const settleMs = last + 1 < samples.length ? samples[last + 1].t - t0 : samples[samples.length - 1].t - t0;
  return {
    stiffness: Math.round(wn * wn),
    damping: Math.round(2 * zeta * wn),
    mass: 1,
    overshootPct: Math.round(os * 100),
    settleMs: Math.round(settleMs),
  };
}

/**
 * Точки CSS linear(): «0, 0.25 40%, 1» → [{ t: 0..1, v }]. Позиции без процентов достраиваются
 * равномерно между соседями, как в CSS. null, если это не linear(…) с двумя точками и больше.
 */
export function parseLinear(str) {
  const m = /^linear\((.*)\)$/s.exec(String(str ?? '').trim());
  if (!m) return null;
  const pts = [];
  for (const stop of m[1].split(',')) {
    const parts = stop.trim().split(/\s+/).filter(Boolean);
    const v = Number(parts[0]);
    if (!Number.isFinite(v)) return null;
    const pcts = parts.slice(1).map((p) => Number(p.replace('%', '')) / 100);
    if (pcts.some((p) => !Number.isFinite(p))) return null;
    if (!pcts.length) pts.push({ t: null, v });
    for (const t of pcts) pts.push({ t, v });
  }
  if (pts.length < 2) return null;
  if (pts[0].t === null) pts[0].t = 0;
  if (pts[pts.length - 1].t === null) pts[pts.length - 1].t = 1;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t !== null) {
      pts[i].t = Math.max(pts[i].t, pts[i - 1].t); // позиции не убывают
      continue;
    }
    let j = i;
    while (pts[j].t === null) j++;
    const from = pts[i - 1].t;
    const step = (Math.max(pts[j].t, from) - from) / (j - i + 1);
    for (let k = i; k < j; k++) pts[k].t = from + step * (k - i + 1);
  }
  return pts;
}

// linear() из Motion и подобных: перелёт — пружина с настоящей длительностью, иначе ближайшая кривая.
function easingFromLinear(pts, durationMs) {
  const peak = Math.max(...pts.map((p) => p.v));
  if (peak > 1.01) {
    const spring = fitSpring(pts.map((p) => ({ t: p.t * durationMs, v: p.v })));
    if (spring) return { easing: 'spring', easingName: 'пружина', spring };
  }
  // linear() — ломаная: подбираем по ней самой, ровно по времени, а не только по узлам.
  const at = (t) => {
    let i = 1;
    while (i < pts.length - 1 && pts[i].t < t) i++;
    const a = pts[i - 1];
    const b = pts[i];
    return b.t > a.t ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : b.v;
  };
  const fit = fitEasing(Array.from({ length: 41 }, (_, i) => ({ t: i / 40, v: at(i / 40) })));
  return { easing: fit.easing, easingName: fit.name, spring: null };
}

const linearCache = new Map();

// Разбор строки easing из CSS/WAAPI: 4 числа и имя, пружина из linear(…) или строка как есть (steps).
function parseEasing(str, durationMs = 0) {
  const s = String(str ?? 'ease').trim();
  const keywords = { ease: 'ease', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out', linear: 'linear' };
  let curve = null;
  if (keywords[s]) curve = NAMED_CURVES.find(([n]) => n === keywords[s])[1];
  else {
    const m = /^cubic-bezier\(([^)]*)\)$/.exec(s);
    if (m) {
      const a = m[1].split(',').map((x) => Number(x.trim()));
      if (a.length === 4 && a.every(Number.isFinite)) curve = a;
    }
  }
  if (!curve) {
    // Счётчики повторяют одну и ту же строку linear() сотни раз — подбор сеткой дорог, кэшируем.
    const key = `${Math.round(durationMs)}|${s}`;
    if (linearCache.has(key)) return linearCache.get(key);
    const pts = parseLinear(s);
    const out = pts ? easingFromLinear(pts, durationMs) : { easing: s, easingName: s, spring: null };
    if (linearCache.size > 200) linearCache.clear();
    linearCache.set(key, out);
    return out;
  }
  const named = NAMED_CURVES.find(([, c]) => sameCurve(c, curve));
  return { easing: curve.map(round2), easingName: named ? named[0] : CUSTOM, spring: null };
}

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const KEYFRAME_SERVICE = new Set(['offset', 'easing', 'composite', 'computedOffset']);

/**
 * Что анимирует событие: свойство перехода, иначе имя и свойства ключевых кадров. Motion/framer-motion
 * зовут animate() отдельно на opacity, filter и clip-path без имени — это разные анимации, а не повторы.
 */
export function motionLabel(ev) {
  if (ev.property) return ev.property;
  const props = new Set();
  for (const kf of Array.isArray(ev.keyframes) ? ev.keyframes : []) {
    for (const p of Object.keys(kf ?? {})) if (!KEYFRAME_SERVICE.has(p)) props.add(p);
  }
  return `${ev.name ?? ''}/${[...props].sort().join('+')}`;
}

/** Кадры пути с перенесёнными вперёд значениями: свойство без значения в кадре берёт его из предыдущего. */
export function carryForward(frames) {
  let prev = {};
  return frames.map((f) => (prev = { ...prev, ...f }));
}

function exactRecord(raw) {
  const t = raw.timing ?? { duration: 0, delay: 0, easing: 'ease', iterations: 1 };
  const kfs = raw.keyframes ?? [];
  if (!Array.isArray(kfs)) throw new TypeError('keyframes не массив');
  // 0 мс — мгновенная смена (visibility и т. п.), а не движение: считается со скачками.
  if (Math.round(t.duration) <= 0) return JUMP;
  let properties;
  if (raw.kind === 'css-transition') properties = raw.property ? [kebab(raw.property)] : [];
  else {
    const set = new Set();
    for (const k of kfs) for (const key of Object.keys(k)) if (!KEYFRAME_SERVICE.has(key)) set.add(kebab(key));
    properties = [...set];
  }
  const pick = (kf) => {
    const out = {};
    if (kf) for (const p of properties) {
      const v = kf[p] ?? kf[camel(p)];
      if (v !== undefined && v !== null) out[p] = String(v);
    }
    return out;
  };
  // CSS animation-timing-function лежит в easing ключевого кадра, а timing.easing остаётся linear.
  const kfEasing = raw.kind === 'css-animation' && kfs[0]?.easing && kfs[0].easing !== 'linear' ? kfs[0].easing : null;
  // Три кадра и больше (пульсация 1 → 0.5 → 1): from/to совпадают, движение — в середине пути.
  // Свойства нет в кадре — переносим значение предыдущего: иначе пропуск читался бы как 0 или 1
  // (фантомный сдвиг, ложная пульсация).
  const path = kfs.length >= 3 ? carryForward(kfs.map(pick)) : undefined;
  return {
    basis: 'exact',
    properties,
    from: pick(kfs[0]),
    to: pick(kfs[kfs.length - 1]),
    ...(path ? { path } : {}),
    durationMs: Math.round(t.duration),
    delayMs: Math.round(t.delay ?? 0),
    startMs: Math.round(raw.t0 + (t.delay ?? 0)),
    ...parseEasing(kfEasing ?? t.easing, t.duration),
    iterations: t.iterations ?? 1,
    ...(t.direction && t.direction !== 'normal' ? { direction: t.direction } : {}),
  };
}

// Каналы замеров и порог, с которого изменение считается видимым. prop 'transform' — семейство
// трансформации: transform и отдельные translate, scale, rotate.
const CHANNELS = {
  tx: { prop: 'transform', min: 1 },
  ty: { prop: 'transform', min: 1 },
  scale: { prop: 'transform', min: 0.01 },
  rotate: { prop: 'transform', min: 1 },
  opacity: { prop: 'opacity', min: 0.02 },
  blur: { prop: 'filter', min: 0.5 },
  clip: { prop: 'clip-path', min: 1 },
};

// Замер короче этого или меньше чем из 4 разных значений — скачок (класс, перерисовка), а не анимация.
const JUMP_MS = 50;
const JUMP_VALUES = 4;
const JUMP = Symbol('jump');
// Замер вернулся к началу (туда и обратно в одном замере): записи нет, но и молча не теряется — счёт.
const RETURNED = Symbol('returned');

// Привязка к прокрутке: страница может применить прокрутку кадром-двумя позже (своим rAF), а шаги
// прокрутки съёмки разделены паузой — кадры без прокрутки.
const SCROLL_LAG = 2; // кадров
const SCROLL_GAP = 5; // кадров без прокрутки между шагами

/**
 * Движение, привязанное к прокрутке (параллакс, scrub): элемент меняется только в кадрах, где менялась
 * прокрутка, и не за один шаг (одиночный сдвиг в кадре прокрутки не отличить от скачка). Ход — до самой
 * глубокой прокрутки: возврат наверх в конце фазы не в счёт. null — не привязано.
 */
function scrollLink(samples, series, chans) {
  if (!samples.every((s) => Number.isFinite(s.sy))) return null;
  const scrolled = samples.map((s, i) => i > 0 && s.sy !== samples[i - 1].sy);
  const stepAt = [];
  let step = 0;
  let still = Infinity;
  for (const sc of scrolled) {
    if (sc) {
      if (still >= SCROLL_GAP) step += 1;
      still = 0;
    } else still += 1;
    stepAt.push(step);
  }
  const moves = [];
  const steps = new Set();
  const lastScroll = (i) => {
    for (let j = i; j >= Math.max(1, i - SCROLL_LAG); j--) if (scrolled[j]) return j;
    return -1;
  };
  for (let i = 1; i < samples.length; i++) {
    if (!chans.some((ch) => series[i][ch] !== series[i - 1][ch])) continue;
    if (lastScroll(i) < 0) return null;
    moves.push(i);
    steps.add(stepAt[i]);
  }
  if (steps.size < 2) return null;
  const deepest = samples.reduce((best, s, i) => (s.sy > samples[best].sy ? i : best), 0);
  const down = moves.filter((i) => i <= deepest + SCROLL_LAG);
  const list = down.length ? down : moves;
  const first = list[0];
  const last = list[list.length - 1];
  // Начало прокрутки — до самого раннего кадра прокрутки, на который ответил первый сдвиг.
  let start = lastScroll(first);
  while (start - 1 >= Math.max(1, first - SCROLL_LAG) && scrolled[start - 1]) start -= 1;
  const ys = samples.slice(start - 1, last + 1).map((s) => s.sy);
  return { from: first - 1, to: last, scrollPx: Math.round(Math.max(...ys) - Math.min(...ys)) };
}

function channelValues(sample, trKey) {
  const tr = decomposeMotion({ transform: sample[trKey] ?? 'none', translate: sample.translate, scale: sample.scale, rotate: sample.rotate });
  const blur = Math.max(0, ...[...(sample.filter ?? '').matchAll(/blur\(\s*(-?[\d.]+)px/g)].map((m) => Number(m[1])));
  return {
    tx: tr.tx,
    ty: tr.ty,
    scale: tr.scale,
    rotate: tr.rotate,
    opacity: sample.opacity === undefined ? 1 : Number(sample.opacity),
    blur,
    clip: sample.clipPath && sample.clipPath !== 'none' ? nums(sample.clipPath).reduce((a, b) => a + b, 0) : 0,
  };
}

function sampledRecord(raw) {
  const samples = raw.samples ?? [];
  if (samples.length < 3) return null;
  // Для SVG computed transform может быть постоянным `none`, а меняется svgTransform: берём тот, что меняется.
  const varies = (k) => new Set(samples.map((x) => x[k] ?? '')).size > 1;
  const trKey = varies('transform') || !varies('svgTransform') ? 'transform' : 'svgTransform';
  const series = samples.map((x) => channelValues(x, trKey));
  // Каналы, что уже сняты точно (WAAPI-прозрачность Motion при JS-сдвиге), в замере не повторяются.
  const covered = new Set(raw.covered ?? []);
  const changed = [];
  let dom = null;
  for (const ch of Object.keys(CHANNELS)) {
    if (covered.has(CHANNELS[ch].prop)) continue;
    const vals = series.map((s) => s[ch]);
    const range = Math.max(...vals) - Math.min(...vals);
    if (range < CHANNELS[ch].min) continue;
    changed.push(ch);
    if (!dom || range / CHANNELS[ch].min > dom.ratio) dom = { ch, ratio: range / CHANNELS[ch].min };
  }
  if (!dom) return null;

  // Семейство трансформации пишется теми свойствами, что действительно менялись.
  const transformKeys = [['transform', trKey], ['translate', 'translate'], ['scale', 'scale'], ['rotate', 'rotate']]
    .filter(([, key]) => varies(key)).map(([p]) => p);
  const props = [...new Set(changed.flatMap((c) => (CHANNELS[c].prop === 'transform'
    ? (transformKeys.length ? transformKeys : ['transform']) : [CHANNELS[c].prop])))];
  const get = (s, p) => (p === 'transform' ? s[trKey] : s[p === 'clip-path' ? 'clipPath' : p]);
  const sides = (a, b) => {
    const from = {};
    const to = {};
    for (const p of props) {
      from[p] = String(get(samples[a], p) ?? '');
      to[p] = String(get(samples[b], p) ?? '');
    }
    return { from, to };
  };

  const link = raw.trigger === 'scroll' ? scrollLink(samples, series, changed) : null;
  if (link) {
    return {
      basis: 'sampled', scrollLinked: true, scrollPx: link.scrollPx, properties: props, ...sides(link.from, link.to),
      durationMs: 0, delayMs: 0, startMs: Math.round(samples[link.from].t), easing: 'scroll', easingName: 'привязано к прокрутке',
      spring: null, iterations: 1,
    };
  }

  const vals = series.map((s) => s[dom.ch]);
  const v0 = vals[0];
  const total = vals[vals.length - 1] - v0;
  if (Math.abs(total) < CHANNELS[dom.ch].min * 0.5) return RETURNED;
  if (new Set(vals.map((v) => Math.round(v * 1e4))).size < JUMP_VALUES) return JUMP;
  const first = samples[0].t;
  const progress = vals.map((v, i) => ({ t: samples[i].t - first, v: (v - v0) / total }));

  // Конец движения — первый замер после последнего заметного отклонения от финала. Порог — 3 медианных
  // шага шума в хвосте (джиттер замеров), но не меньше 0.0002% размаха: хвост ease-out почти плоский.
  const tail = progress.slice(-Math.max(4, Math.floor(progress.length / 4)));
  const tailSteps = tail.slice(1).map((p, i) => Math.abs(p.v - tail[i].v));
  const thr = Math.max(0.000002, 3 * median(tailSteps));
  let endIdx = 0;
  progress.forEach((p, i) => {
    if (Math.abs(p.v - 1) > thr) endIdx = Math.min(progress.length - 1, i + 1);
  });
  const durationMs = Math.round(progress[endIdx].t);
  if (durationMs <= 0) return null;
  if (durationMs < JUMP_MS) return JUMP;

  const base = { basis: 'sampled', delayMs: 0, startMs: Math.round(raw.t0), iterations: 1 };
  const common = { ...base, properties: props, ...sides(0, samples.length - 1), durationMs };

  const spring = fitSpring(progress);
  if (spring) return { ...common, durationMs: Math.max(durationMs, spring.settleMs), easing: 'spring', easingName: 'пружина', spring };
  const norm = progress
    .filter((p) => p.t <= durationMs)
    .map((p) => ({ t: p.t / durationMs, v: Math.min(1, Math.max(0, p.v)) }));
  const fit = fitEasing(norm);
  return { ...common, easing: fit.easing, easingName: fit.name, spring: null };
}

// Одинаковое движение: элемент, свойства, длительность.
const motionKey = (r) => `${r.target.selector}|${[...r.properties].sort().join('+')}|${r.durationMs}`;
const BACKGROUND_IN = new Set(['hover', 'focus']);

/**
 * Сводит сырые события в записи: дедуп, одна запись на бесконечную анимацию, потолок на триггер.
 * - Скачки (замер в 1–2 кадра, CSS или WAAPI длительностью 0 мс) не становятся записями — их счёт по
 *   триггерам в `jumps`; замеры, что вернулись к началу (туда и обратно), — счёт в `returned`.
 * - Фон: запись наведения или фокуса, чьё движение (элемент, свойства, длительность) уже было при
 *   загрузке или прокрутке и чья цель не наведённый элемент, — петля, не реакция; она в `background`.
 * - Потолок фазы заполняется сначала реакциями, затем петлями, затем сменой цвета.
 */
export function normalizeEvents(raw, opts = {}) {
  const maxPerPhase = opts.maxPerPhase ?? 300;
  const built = [];
  const jumps = {};
  const returned = {};
  const seenAt = new Map(); // ключ события -> t0 уже взятых
  const infinite = new Set();

  for (const ev of raw) {
    try {
      const label = motionLabel(ev);
      if (ev.timing?.iterations === Infinity) {
        const key = `${ev.target.selector}|${label}`;
        if (infinite.has(key)) continue;
        infinite.add(key);
      } else {
        const key = `${ev.phase}|${ev.kind}|${ev.target.selector}|${label}`;
        const times = seenAt.get(key) ?? [];
        if (times.some((t) => Math.abs(t - ev.t0) <= 1)) continue;
        times.push(ev.t0);
        seenAt.set(key, times);
      }

      const body = ev.kind === 'js-sampled' ? sampledRecord(ev) : exactRecord(ev);
      if (body === JUMP) {
        jumps[ev.trigger] = (jumps[ev.trigger] ?? 0) + 1;
        continue;
      }
      if (body === RETURNED) {
        returned[ev.trigger] = (returned[ev.trigger] ?? 0) + 1;
        continue;
      }
      if (!body) continue;
      // Петля: событие повторялось в фазе (repeats от collapseRepeats) или JS ещё двигал элемент в конце фазы.
      // Привязка к прокрутке — не петля, даже если замер упёрся в потолок: она шла, пока шла прокрутка.
      const loop = !body.scrollLinked && (ev.loop === true || (ev.repeats ?? 0) > 2);
      built.push({
        near: ev.nearSubject === true,
        // Семью тянет только уверенная петля: по времени (loop) или от 4 повторов; 3 повтора бывают и у
        // проявления (раз при загрузке, туда-обратно при прокрутке).
        strong: !body.scrollLinked && (ev.loop === true || (ev.repeats ?? 0) >= 4),
        rec: {
          phase: ev.phase, trigger: ev.trigger, kind: ev.kind, target: ev.target, ...body,
          ...(loop ? { loop: true } : {}), ...(ev.repeats ? { repeats: ev.repeats } : {}),
        },
      });
    } catch {
      continue; // битое событие пропускаем, остальные разбираем
    }
  }

  // Семья петли: соседний такой же элемент (селектор без :nth-of-type последнего уровня) с тем же
  // движением — та же петля, даже если сам он сработал раз (одна цифра счётчика из десяти, один пункт
  // бегущей строки). :nth-of-type выше — другие блоки: section:nth-of-type(3) и (9) — разные секции.
  const shapeKey = (r) => {
    const parts = r.target.selector.split(' > ');
    parts[parts.length - 1] = parts[parts.length - 1].replace(/:nth-of-type\(\d+\)/, '');
    return `${parts.join(' > ')}|${[...r.properties].sort().join('+')}|${r.durationMs}`;
  };
  const loopShapes = new Set(built.filter((b) => b.strong).map((b) => shapeKey(b.rec)));
  for (const b of built) {
    if (!b.rec.loop && !b.near && !b.rec.scrollLinked && loopShapes.has(shapeKey(b.rec))) b.rec.loop = true;
  }

  const ambient = new Set(built.filter((b) => !BACKGROUND_IN.has(b.rec.trigger)).map((b) => motionKey(b.rec)));
  // Не реакция на наведение: то же движение уже было, это петля или цель вне экрана (Lottie ниже по странице).
  const isBackground = (b) => !b.near
    && (ambient.has(motionKey(b.rec)) || b.rec.loop === true || b.rec.target.inView === false);
  const background = [];
  const byTrigger = new Map();
  for (const b of built) {
    const r = b.rec;
    if (BACKGROUND_IN.has(r.trigger) && isBackground(b)) {
      background.push({ selector: r.target.selector, trigger: r.trigger });
      continue;
    }
    if (!byTrigger.has(r.trigger)) byTrigger.set(r.trigger, []);
    byTrigger.get(r.trigger).push(r);
  }

  const keep = new Set();
  const omitted = {};
  for (const [trigger, list] of byTrigger) {
    // Потолок заполняют сначала реакции, затем фоновые петли, затем смена цвета.
    const motion = list.filter((r) => !isColorOnly(r));
    const ordered = [...motion.filter((r) => !r.loop), ...motion.filter((r) => r.loop), ...list.filter(isColorOnly)];
    ordered.slice(0, maxPerPhase).forEach((r) => keep.add(r));
    if (ordered.length > maxPerPhase) omitted[trigger] = ordered.length - maxPerPhase;
  }

  const counters = {};
  const records = [];
  for (const b of built) {
    if (!keep.has(b.rec)) continue;
    const n = (counters[b.rec.trigger] = (counters[b.rec.trigger] ?? 0) + 1);
    records.push({ id: `${b.rec.trigger}-${n}`, ...b.rec });
  }
  return { records, omitted, jumps, background, returned };
}

// Шаг каскада длиннее — не каскад, а отдельные события: шаги прокрутки съёмки (~820 мс), автосмена вкладок.
const MAX_STAGGER_MS = 500;
// Старты ближе одного кадра — одновременные (цифры счётчика стартуют с разницей 1–5 мс из одного цикла JS).
const SAME_FRAME_MS = 16;

// Старты одновременны, если совпадают или различаются меньше кадра при равных задержках: это дрожь момента
// создания (t0) из одного цикла JS. Разные задержки короче кадра — настоящий каскад (по букве через 12 мс).
const simultaneous = (a, b) => b.start - a.start <= 1 || (b.start - a.start < SAME_FRAME_MS && a.delay === b.delay);

// Серии подряд идущих стартов ({ start, delay }) с почти постоянным шагом; одновременные старты —
// параллельные ряды внутри серии.
function cascadeRuns(starts) {
  const runs = [];
  const stepsOf = (r) => r.slice(1).map((v, i) => (simultaneous(r[i], v) ? null : v.start - r[i].start)).filter((x) => x !== null);
  // Каскад — не меньше трёх разных стартов (двух шагов).
  const flush = (run) => {
    const steps = stepsOf(run);
    if (steps.length < 2) return;
    const stepMs = Math.round(median(steps));
    if (stepMs <= MAX_STAGGER_MS) runs.push({ count: run.length, stepMs });
  };
  let run = [starts[0]];
  for (let i = 1; i < starts.length; i++) {
    const cur = starts[i];
    const prev = run[run.length - 1];
    const d = cur.start - prev.start;
    const steps = stepsOf(run);
    if (simultaneous(prev, cur) || !steps.length || Math.abs(d - median(steps)) <= 15) {
      run.push(cur);
      continue;
    }
    // Разрыв: серия из ≥3 кадров закрывается, иначе её хвост становится началом новой серии.
    const frames = steps.length + 1;
    flush(run);
    run = frames >= 3 ? [cur] : [prev, cur];
  }
  flush(run);
  return runs;
}

/** Ключ группировки каскада: фаза | свойства | длительность | кривая. */
export function staggerKey(r) {
  return `${r.phase}|${[...r.properties].sort().join('+')}|${r.durationMs}|${Array.isArray(r.easing) ? curveKey(r.easing) : r.easing}`;
}

/** Каскады: серии ≥3 записей одной фазы с одинаковыми свойствами, длительностью и кривой и почти постоянным шагом. */
export function detectStagger(records) {
  const groups = new Map();
  for (const r of records) {
    const key = staggerKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ start: r.startMs, delay: r.delayMs ?? 0 });
  }
  const out = [];
  for (const [groupKey, starts] of groups) {
    if (starts.length < 3) continue;
    starts.sort((x, y) => x.start - y.start);
    for (const run of cascadeRuns(starts)) out.push({ groupKey, ...run });
  }
  return out;
}

// Самая частая кривая; при равной частоте — та, что двигает более крупные элементы (меню, а не иконку).
function mostFrequent(records) {
  const counts = new Map();
  for (const r of records) {
    if (!Array.isArray(r.easing)) continue;
    const k = curveKey(r.easing);
    const prev = counts.get(k) ?? { curve: r.easing.map(round2), n: 0, area: 0 };
    counts.set(k, { ...prev, n: prev.n + 1, area: prev.area + (r.target?.box?.w ?? 0) * (r.target?.box?.h ?? 0) });
  }
  let best = null;
  for (const v of counts.values()) if (!best || v.n > best.n || (v.n === best.n && v.area > best.area)) best = v;
  return best?.curve ?? null;
}

// S-образная кривая: медленный старт и медленный конец (ease-in-out, easeInOutQuart, Material standard).
const isSCurve = ([x1, y1, x2, y2]) => x1 >= 0.25 && y1 <= 0.15 && x2 <= 0.75 && y2 >= 0.85;

// Запись двигает элемент в пространстве (не только прозрачность или размытие).
const SPATIAL_PROP = /^(transform|translate|scale|rotate|clip-path)$/;
const isSpatial = (r) => r.properties.some((p) => SPATIAL_PROP.test(p));

// Стороны записи для расстояний: все ключевые кадры, если они есть, иначе from и to.
const sidesOf = (r) => (r.path?.length ? r.path : [r.from ?? {}, r.to ?? {}]);

/**
 * Сдвиг замера — компенсация точки масштаба, а не перемещение: масштаб идёт от 0 или к 0 (Lottie в SVG
 * масштабирует группу от начала координат, и матрица сдвигается вместе с масштабом).
 */
export function originShift(r, scales) {
  if (r.basis !== 'sampled' || !scales.length) return false;
  const lo = Math.min(...scales);
  return lo < 0.05 && Math.max(...scales) - lo > 0.01;
}

/**
 * Черновик токенов движения по снятым записям. Петли и привязка к прокрутке не считаются; смена цвета —
 * только если другого нет.
 */
export function draftTokens(records) {
  const finite = records.filter((r) => r.iterations !== Infinity && !r.loop && !r.scrollLinked);
  const motion = finite.filter((r) => !isColorOnly(r));
  const rs = motion.length ? motion : finite;

  const dur = (list, fallback, pick) => (list.length ? Math.round(pick(list.map((r) => r.durationMs))) : fallback);
  const fast = dur(rs.filter((r) => r.trigger === 'hover' || r.trigger === 'focus'), 150, (d) => percentile(d, 0.25));
  const base = dur(rs.filter((r) => r.phase === 'load'), 300, median);
  const slow = dur(rs, 600, (d) => percentile(d, 0.9));

  // Кривые: точные (CSS, WAAPI) важнее замеров — у замеров Lottie кривая шумная. Первая ступень, где
  // нашлась кривая, и решает.
  const exact = rs.filter((r) => r.basis !== 'sampled');
  const sampled = rs.filter((r) => r.basis === 'sampled');
  const firstOf = (...tiers) => {
    for (const list of tiers) {
      const c = mostFrequent(list);
      if (c) return c;
    }
    return null;
  };
  const entering = (list) => list.filter((r) => r.trigger === 'load' || r.trigger === 'scroll');
  const reacting = (list) => list.filter((r) => r.phase === 'hover' || r.phase === 'focus');
  const spatial = (list) => list.filter(isSpatial);
  const flat = (list) => list.filter((r) => !isSpatial(r));
  // enter: пространственные записи загрузки и прокрутки, затем проявления; если точных там нет (ramp:
  // там видео, canvas и Lottie) — точные записи появления при наведении и фокусе; замеры — последними.
  const enter = firstOf(
    spatial(entering(exact)), flat(entering(exact)),
    spatial(reacting(exact)), flat(reacting(exact)),
    spatial(entering(sampled)), entering(sampled),
  ) ?? [0.23, 1, 0.32, 1];
  const exit = firstOf(
    exact.filter((r) => r.phase === 'hover-out'), sampled.filter((r) => r.phase === 'hover-out'),
    exact.filter((r) => r.phase === 'blur'), sampled.filter((r) => r.phase === 'blur'),
  ) ?? enter;
  // move: S-образная кривая (медленно — быстро — медленно), как у перемещения между местами.
  const sShaped = (list) => list.filter((r) => Array.isArray(r.easing) && isSCurve(r.easing));
  const move = firstOf(sShaped(exact), sShaped(sampled)) ?? [0.77, 0, 0.175, 1];

  const springs = rs.map((r) => r.spring).filter(Boolean).sort((a, b) => a.stiffness - b.stiffness);
  const asSpring = (s) => ({ stiffness: s.stiffness, damping: s.damping, mass: 1 });
  let snappy = { stiffness: 700, damping: 48, mass: 1 };
  let soft = { stiffness: 300, damping: 31, mass: 1 };
  if (springs.length && springs[0].stiffness === springs[springs.length - 1].stiffness) {
    const s = springs[0];
    if (Math.abs(s.stiffness - 700) <= Math.abs(s.stiffness - 300)) snappy = asSpring(s);
    else soft = asSpring(s);
  } else if (springs.length > 1) {
    soft = asSpring(springs[0]);
    snappy = asSpring(springs[springs.length - 1]);
  }

  const steps = detectStagger(rs).map((g) => g.stepMs);
  const stagger = steps.length ? Math.round(median(steps)) : 40;

  // Сдвиг — разница между кадрами, а не само положение: у SVG-групп Lottie translate — место в макете.
  const shiftOf = (r) => {
    const sides = sidesOf(r);
    if (!sides.some((s) => s.transform || s.translate)) return 0;
    const m = sides.map((s) => decomposeMotion(s, r.target?.box));
    if (originShift(r, m.map((x) => x.scale))) return 0;
    return Math.max(...m.map((x) => Math.max(Math.abs(x.tx - m[0].tx), Math.abs(x.ty - m[0].ty))));
  };
  const blurOf = (r) => Math.max(0, ...sidesOf(r).flatMap((side) => [...String(side.filter ?? '').matchAll(/blur\(\s*(-?[\d.]+)px/g)]
    .map((m) => Number(m[1]))));
  // Как и кривые: точные записи важнее замеров (у Lottie «сдвиг» — компенсация точки трансформации).
  const shiftsIn = (list) => list.map(shiftOf).filter((v) => v > 0);
  const shifts = shiftsIn(exact).length ? shiftsIn(exact) : shiftsIn(sampled);
  const blursIn = (list) => list.map(blurOf).filter((v) => v > 0);
  const blurs = blursIn(exact).length ? blursIn(exact) : blursIn(sampled);

  return {
    duration: { fast, base, slow },
    ease: { enter, exit, move },
    spring: { snappy, soft },
    stagger,
    distance: shifts.length ? Math.round(median(shifts)) : 8,
    blur: Math.round(Math.max(0, ...blurs)),
  };
}
