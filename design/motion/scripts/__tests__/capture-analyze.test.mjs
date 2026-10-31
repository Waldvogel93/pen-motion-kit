import { describe, expect, test } from 'vitest';
import {
  NAMED_CURVES, decomposeMotion, decomposeTransform, detectStagger, draftTokens, fitEasing, fitSpring, isColorOnly, motionLabel,
  normalizeEvents,
} from '../capture/analyze.mjs';
import { validateTokens } from '../lint-style.mjs';

// Точка кубической кривой Безье easing: решаем x(s) = t бисекцией, возвращаем y(s).
function bezierAt([x1, y1, x2, y2], t) {
  const b = (a, c, s) => 3 * a * s * (1 - s) ** 2 + 3 * c * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (b(x1, x2, mid) < t) lo = mid; else hi = mid;
  }
  return b(y1, y2, (lo + hi) / 2);
}

function sampleBezier(curve, n) {
  return Array.from({ length: n + 1 }, (_, i) => ({ t: i / n, v: bezierAt(curve, i / n) }));
}

// Аналитический ответ недодемпфированной пружины на шаг, масса 1; n точек за 1000 мс, t в мс.
function sampleSpring({ stiffness, damping }, n) {
  const wn = Math.sqrt(stiffness);
  const z = damping / (2 * wn);
  const wd = wn * Math.sqrt(1 - z * z);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * 1000;
    const s = t / 1000;
    const v = 1 - Math.exp(-z * wn * s) * (Math.cos(wd * s) + ((z * wn) / wd) * Math.sin(wd * s));
    return { t, v };
  });
}

const target = (selector = '#a') => ({ selector, tag: 'div', role: 'card', text: '', box: { x: 0, y: 0, w: 10, h: 10 } });

function rec(over) {
  return {
    id: 'r', phase: 'load', trigger: 'load', kind: 'css-animation', basis: 'exact', target: target(),
    properties: ['opacity'], from: {}, to: {}, durationMs: 300, delayMs: 0, startMs: 0,
    easing: [0.23, 1, 0.32, 1], easingName: 'ease-out strong', iterations: 1, spring: null, ...over,
  };
}

function rawTransition({ phase, i }) {
  return {
    phase, trigger: phase, kind: 'css-transition', target: target(`#t${i}`), t0: i * 3, property: 'opacity',
    keyframes: [{ opacity: '0' }, { opacity: '1' }],
    timing: { duration: 300, delay: 0, easing: 'ease', iterations: 1, direction: 'normal', fill: 'both' },
  };
}

function rawAnimation({ name, iterations, selector }) {
  return {
    phase: 'load', trigger: 'load', kind: 'css-animation', target: target(selector), t0: 0, name,
    keyframes: [{ offset: 0, transform: 'rotate(0deg)' }, { offset: 1, transform: 'rotate(360deg)' }],
    timing: { duration: 1000, delay: 0, easing: 'linear', iterations, direction: 'normal', fill: 'none' },
  };
}

function rawSampled({ fromY, toY, ms, curve }) {
  const n = 40;
  const samples = Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * (ms + 100); // хвост покоя после конца
    const p = bezierAt(curve, Math.min(1, t / ms));
    const y = Math.round((fromY + (toY - fromY) * p) * 1e6) / 1e6;
    return { t: 1000 + t, transform: `matrix(1, 0, 0, 1, 0, ${y})`, opacity: '1' };
  });
  return { phase: 'load', trigger: 'load', kind: 'js-sampled', target: target('#js'), t0: 1000, samples };
}

function sampleRecords() {
  const out = [];
  for (let i = 0; i < 4; i++) out.push(rec({ id: `l${i}`, startMs: i * 80, durationMs: 600 }));
  out.push(rec({ id: 'h1', phase: 'hover', trigger: 'hover', durationMs: 150, easing: [0.2, 0, 0, 1], easingName: 'M3 standard', from: { transform: 'matrix(1, 0, 0, 1, 0, 8)' } }));
  out.push(rec({ id: 'h2', phase: 'hover-out', trigger: 'hover', durationMs: 200 }));
  out.push(rec({ id: 's1', phase: 'scroll', trigger: 'scroll', durationMs: 500, easing: [0.4, 0, 0.2, 1], easingName: 'своя' }));
  return out;
}

describe('analyze', () => {
  test('decomposeTransform', () => {
    expect(decomposeTransform('none')).toEqual({ tx: 0, ty: 0, scale: 1, rotate: 0 });
    expect(decomposeTransform('matrix(1, 0, 0, 1, 0, 24)')).toEqual({ tx: 0, ty: 24, scale: 1, rotate: 0 });
    expect(decomposeTransform('matrix(0.97, 0, 0, 0.97, 0, 0)').scale).toBeCloseTo(0.97, 3);
  });

  test('decomposeTransform: простые функции и matrix3d', () => {
    expect(decomposeTransform('translate(0, 30)')).toEqual({ tx: 0, ty: 30, scale: 1, rotate: 0 });
    expect(decomposeTransform('translateY(12px) scale(0.5)')).toEqual({ tx: 0, ty: 12, scale: 0.5, rotate: 0 });
    expect(decomposeTransform('rotate(90deg)').rotate).toBeCloseTo(90, 3);
    expect(decomposeTransform('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 5,7,0,1)')).toEqual({ tx: 5, ty: 7, scale: 1, rotate: 0 });
  });

  test('fitEasing узнаёт именованную кривую', () => {
    const r = fitEasing(sampleBezier([0.23, 1, 0.32, 1], 30));
    expect(r.name).toBe('ease-out strong');
    expect(r.error).toBeLessThan(0.03);
  });

  test('fitEasing на линейных точках', () => {
    expect(fitEasing(sampleBezier([0, 0, 1, 1], 30)).name).toBe('linear');
  });

  test('fitEasing: своя кривая подбирается сеткой быстро', () => {
    const t0 = Date.now();
    const r = fitEasing(sampleBezier([0.6, 0.2, 0.1, 0.9], 30));
    expect(r.name).toBe('своя');
    expect(r.error).toBeLessThan(0.05);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  test('fitSpring', () => {
    expect(fitSpring(sampleBezier([0.23, 1, 0.32, 1], 30))).toBeNull();
    const s = fitSpring(sampleSpring({ stiffness: 300, damping: 20 }, 60));
    expect(s.overshootPct).toBeGreaterThan(5);
    expect(Math.abs(s.stiffness - 300) / 300).toBeLessThan(0.25);
    expect(Math.abs(s.damping - 20) / 20).toBeLessThan(0.25);
  });

  test('detectStagger', () => {
    const recs = [0, 80, 160, 240].map((d, i) => rec({ id: `a${i}`, phase: 'load', startMs: d, durationMs: 600 }));
    expect(detectStagger(recs)).toEqual([expect.objectContaining({ stepMs: 80, count: 4 })]);
  });

  test('detectStagger: неровные шаги — не каскад', () => {
    const recs = [0, 80, 300, 310].map((d, i) => rec({ id: `a${i}`, startMs: d }));
    expect(detectStagger(recs)).toEqual([]);
  });

  test('normalizeEvents: потолок на фазу', () => {
    const raw = Array.from({ length: 350 }, (_, i) => rawTransition({ phase: 'load', i }));
    const { records, omitted } = normalizeEvents(raw);
    expect(records).toHaveLength(300);
    expect(omitted.load).toBe(50);
  });

  test('normalizeEvents: бесконечная анимация — одна запись', () => {
    const raw = [1, 2, 3].map(() => rawAnimation({ name: 'spin', iterations: Infinity, selector: '#spinner' }));
    expect(normalizeEvents(raw).records).toHaveLength(1);
  });

  test('normalizeEvents: точные CSS-записи', () => {
    const [r] = normalizeEvents([rawTransition({ phase: 'load', i: 0 })]).records;
    expect(r.basis).toBe('exact');
    expect(r.easing).toEqual([0.25, 0.1, 0.25, 1]);
    expect(r.easingName).toBe('ease');
    expect(r.properties).toEqual(['opacity']);
    expect(r.from).toEqual({ opacity: '0' });
    expect(r.to).toEqual({ opacity: '1' });
  });

  test('normalizeEvents: startMs = t0 + delay, steps остаются строкой', () => {
    const raw = rawTransition({ phase: 'load', i: 0 });
    raw.t0 = 100;
    raw.timing = { ...raw.timing, delay: 50, easing: 'steps(4, end)' };
    const [r] = normalizeEvents([raw]).records;
    expect(r.startMs).toBe(150);
    expect(r.easing).toBe('steps(4, end)');
    expect(r.easingName).toBe('steps(4, end)');
  });

  test('normalizeEvents: js-sampled → длительность и кривая по замерам', () => {
    const r = normalizeEvents([rawSampled({ fromY: 40, toY: 0, ms: 500, curve: [0.23, 1, 0.32, 1] })]).records[0];
    expect(r.basis).toBe('sampled');
    expect(Math.abs(r.durationMs - 500)).toBeLessThanOrEqual(40);
    expect(r.easingName).toBe('ease-out strong');
    expect(r.from.transform).toContain('40');
  });

  test('detectStagger: посторонняя запись не ломает каскад', () => {
    const recs = [0, 80, 160, 240, 2000].map((d, i) => rec({ id: `a${i}`, startMs: d }));
    expect(detectStagger(recs)).toEqual([expect.objectContaining({ stepMs: 80, count: 4 })]);
  });

  test('detectStagger: параллельные ряды с равными стартами', () => {
    const recs = [0, 0, 80, 80, 160, 160].map((d, i) => rec({ id: `a${i}`, startMs: d }));
    expect(detectStagger(recs)).toEqual([expect.objectContaining({ stepMs: 80, count: 6 })]);
  });

  test('detectStagger: две серии в одной группе', () => {
    const recs = [0, 50, 100, 5000, 5120, 5240].map((d, i) => rec({ id: `a${i}`, startMs: d }));
    expect(detectStagger(recs).map((g) => [g.stepMs, g.count])).toEqual([[50, 3], [120, 3]]);
  });

  test('normalizeEvents: cubic-bezier распознаётся без округления до имени', () => {
    const raw = rawTransition({ phase: 'load', i: 0 });
    raw.timing = { ...raw.timing, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' };
    const [r] = normalizeEvents([raw]).records;
    expect(r.easingName).toBe('ease-in-out strong');
    expect(r.easing).toEqual([0.77, 0, 0.18, 1]);
  });

  test('normalizeEvents: переход с дефисным свойством получает from/to', () => {
    const raw = rawTransition({ phase: 'hover', i: 0 });
    raw.trigger = 'hover';
    raw.property = 'background-color';
    raw.keyframes = [{ backgroundColor: 'red' }, { backgroundColor: 'blue' }];
    const [r] = normalizeEvents([raw]).records;
    expect(r.properties).toEqual(['background-color']);
    expect(r.from).toEqual({ 'background-color': 'red' });
    expect(r.to).toEqual({ 'background-color': 'blue' });
  });

  test('fitSpring: перелёт от 100% — не пружина', () => {
    const s = [0, 1, 2, 3, 2, 1, 1].map((v, i) => ({ t: i * 50, v }));
    expect(fitSpring(s)).toBeNull();
  });

  test('normalizeEvents: джиттер после конца замера не растягивает длительность', () => {
    const ev = rawSampled({ fromY: 40, toY: 0, ms: 500, curve: [0.23, 1, 0.32, 1] });
    ev.samples.forEach((smp, i) => {
      if (smp.t - 1000 >= 500) smp.transform = `matrix(1, 0, 0, 1, 0, ${i % 2 ? 0.001 : -0.001})`;
    });
    const r = normalizeEvents([ev]).records[0];
    expect(Math.abs(r.durationMs - 500)).toBeLessThanOrEqual(60);
    expect(r.easingName).toBe('ease-out strong');
  });

  test('draftTokens: одинаковые снятые пружины сохраняются', () => {
    const sp = { stiffness: 400, damping: 30, mass: 1, overshootPct: 10, settleMs: 300 };
    const t = draftTokens([rec({ id: 'p1', spring: sp }), rec({ id: 'p2', spring: sp })]);
    expect(t.spring.soft).toEqual({ stiffness: 400, damping: 30, mass: 1 });
  });

  test('normalizeEvents: easing css-animation берётся из ключевого кадра', () => {
    const raw = rawAnimation({ name: 'in', iterations: 1, selector: '#k' });
    raw.keyframes[0].easing = 'cubic-bezier(0.23, 1, 0.32, 1)';
    expect(normalizeEvents([raw]).records[0].easingName).toBe('ease-out strong');
  });

  test('normalizeEvents: битое событие пропускается', () => {
    const bad = { ...rawAnimation({ name: 'x', iterations: 1, selector: '#bad' }), keyframes: 'oops' };
    const { records } = normalizeEvents([bad, rawTransition({ phase: 'load', i: 1 })]);
    expect(records).toHaveLength(1);
  });

  test('normalizeEvents: меняющийся svgTransform при постоянном transform', () => {
    const ev = rawSampled({ fromY: 40, toY: 0, ms: 500, curve: [0.23, 1, 0.32, 1] });
    ev.samples.forEach((smp) => {
      smp.svgTransform = smp.transform.replace('matrix(1, 0, 0, 1, 0, ', 'translate(0, ').replace(')', ')');
      smp.transform = 'none';
    });
    const r = normalizeEvents([ev]).records[0];
    expect(r.properties).toEqual(['transform']);
    expect(Math.abs(r.durationMs - 500)).toBeLessThanOrEqual(40);
    expect(r.from.transform).toContain('translate(0, 40');
  });

  test('draftTokens проходит validateTokens', () => {
    expect(validateTokens(draftTokens(sampleRecords()))).toEqual([]);
    expect(validateTokens(draftTokens([]))).toEqual([]);
  });

  test('draftTokens: значения', () => {
    const t = draftTokens(sampleRecords());
    expect(t.duration.fast).toBe(150);
    expect(t.duration.base).toBe(600);
    expect(t.ease.exit).toEqual([0.23, 1, 0.32, 1]);
    expect(t.stagger).toBe(80);
    expect(t.distance).toBe(8);
    expect(t.spring.snappy).toEqual({ stiffness: 700, damping: 48, mass: 1 });
  });

  test('validateTokens: не объект', () => {
    expect(validateTokens(null)).toEqual(['tokens.json: ожидается объект']);
  });
});

// --- Task 5: что съёмка искажала на настоящих сайтах ---

const transition = (over) => ({
  phase: 'load', trigger: 'load', kind: 'css-transition', target: target('#x'), t0: 0, property: 'opacity',
  keyframes: [{ opacity: '0' }, { opacity: '1' }],
  timing: { duration: 300, delay: 0, easing: 'ease', iterations: 1, direction: 'normal', fill: 'both' },
  ...over,
});

const colorTransition = (i, phase = 'scroll') => transition({
  phase, trigger: phase, target: target(`#c${i}`), t0: i * 5, property: 'background-color',
  keyframes: [{ backgroundColor: 'white' }, { backgroundColor: 'black' }],
});

// Строка CSS linear(), как её отдаёт Motion для WAAPI: точки «значение позиция%».
const linearOf = (pts) => `linear(${pts.map((p) => `${Math.round(p.v * 10000) / 10000} ${p.pct}%`).join(', ')})`;

function waapi(easing, duration = 1000, over = {}) {
  return {
    phase: 'load', trigger: 'load', kind: 'waapi', target: target('#w'), t0: 0,
    keyframes: [{ offset: 0, transform: 'translateY(24px)' }, { offset: 1, transform: 'none' }],
    timing: { duration, delay: 0, easing, iterations: 1, direction: 'normal', fill: 'none' },
    ...over,
  };
}

// Замер JS: значение translateY по кадрам (t — мс от начала), с хвостом покоя.
function sampledFrames(values, step = 16.7) {
  const tail = Array.from({ length: 10 }, () => values[values.length - 1]);
  const samples = [...values, ...tail].map((y, i) => ({
    t: 1000 + i * step, transform: `matrix(1, 0, 0, 1, 0, ${y})`, opacity: '1',
  }));
  return { phase: 'hover', trigger: 'hover', kind: 'js-sampled', target: target('#j'), t0: 1000, samples };
}

describe('M4: известные кривые по имени', () => {
  const named = (easing) => normalizeEvents([transition({ timing: { duration: 300, delay: 0, easing, iterations: 1 } })]).records[0];

  test('сначала кривые плана в его порядке, затем остальные', () => {
    expect(NAMED_CURVES.slice(0, 9).map(([n]) => n)).toEqual(['ease-out strong', 'ease-in-out strong', 'M3 standard',
      'M3 emphasized decelerate', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']);
    expect(NAMED_CURVES.length).toBeGreaterThan(9);
  });

  test('точные CSS-кривые с настоящих сайтов', () => {
    expect(named('cubic-bezier(0.4, 0, 0.2, 1)').easingName).toBe('Material standard');
    expect(named('cubic-bezier(0, 0, 0.2, 1)').easingName).toBe('Material decelerate');
    expect(named('cubic-bezier(0.4, 0, 1, 1)').easingName).toBe('Material accelerate');
    expect(named('cubic-bezier(0.25, 0.46, 0.45, 0.94)').easingName).toBe('easeOutQuad');
    expect(named('cubic-bezier(0.76, 0, 0.24, 1)').easingName).toBe('easeInOutQuart');
    expect(named('cubic-bezier(0.33, 1, 0.68, 1)').easingName).toBe('easeOutCubic');
    expect(named('cubic-bezier(0.32, 0.72, 0, 1)').easingName).toBe('Vaul drawer');
    expect(named('cubic-bezier(0.45, 0.05, 0.55, 0.95)').easingName).toBe('easeInOutSine');
    // кривые плана по-прежнему узнаются первыми
    expect(named('cubic-bezier(0.23, 1, 0.32, 1)').easingName).toBe('ease-out strong');
    expect(named('cubic-bezier(0.77, 0, 0.175, 1)').easingName).toBe('ease-in-out strong');
    const own = named('cubic-bezier(0, 0, 0.6, 1)');
    expect(own.easingName).toBe('своя');
    expect(own.easing).toEqual([0, 0, 0.6, 1]);
  });

  test('fitEasing: ровный easeOutCubic — по имени, а не «своя»', () => {
    expect(fitEasing(sampleBezier([0.33, 1, 0.68, 1], 30)).name).toBe('easeOutCubic');
  });
});

describe('R1: пружина Motion в строке linear()', () => {
  test('перелёт → пружина с настоящей длительностью', () => {
    const pts = sampleSpring({ stiffness: 300, damping: 20 }, 60).map((p) => ({ v: p.v, pct: Math.round(p.t * 1000) / 10000 }));
    const [r] = normalizeEvents([waapi(linearOf(pts), 1000)]).records;
    expect(r.easing).toBe('spring');
    expect(r.easingName).toBe('пружина');
    expect(r.durationMs).toBe(1000);
    expect(Math.abs(r.spring.stiffness - 300) / 300).toBeLessThan(0.25);
    expect(Math.abs(r.spring.damping - 20) / 20).toBeLessThan(0.25);
  });

  test('без перелёта → ближайшая кривая по имени', () => {
    const pts = sampleBezier([0.33, 1, 0.68, 1], 40).map((p) => ({ v: p.v, pct: Math.round(p.t * 10000) / 100 }));
    const [r] = normalizeEvents([waapi(linearOf(pts), 600)]).records;
    expect(r.easingName).toBe('easeOutCubic');
    expect(Array.isArray(r.easing)).toBe(true);
    expect(r.spring).toBeNull();
  });

  test('своя кривая → числа, позиции без процентов достраиваются', () => {
    const pts = sampleBezier([0.6, 0.2, 0.1, 0.9], 30).map((p) => ({ v: p.v, pct: Math.round(p.t * 10000) / 100 }));
    const [r] = normalizeEvents([waapi(linearOf(pts), 500)]).records;
    expect(r.easingName).toBe('своя');
    expect(r.easing).toHaveLength(4);
    const [lin] = normalizeEvents([waapi('linear(0, 0.5, 1)', 500)]).records;
    expect(lin.easingName).toBe('linear');
  });
});

describe('R2: многошаговые ключевые кадры', () => {
  test('путь значений сохраняется, крайнее значение входит в расстояние', () => {
    const ev = {
      phase: 'load', trigger: 'load', kind: 'css-animation', target: target('#sk'), t0: 0, name: 'pulse',
      keyframes: [{ offset: 0, opacity: '1', transform: 'translateY(0px)' }, { offset: 0.5, opacity: '0.5', transform: 'translateY(-20px)' },
        { offset: 1, opacity: '1', transform: 'translateY(0px)' }],
      timing: { duration: 2000, delay: 0, easing: 'linear', iterations: Infinity, direction: 'normal', fill: 'none' },
    };
    const [r] = normalizeEvents([ev]).records;
    expect(r.path.map((k) => k.opacity)).toEqual(['1', '0.5', '1']);
    expect(draftTokens([{ ...r, iterations: 1 }]).distance).toBe(20);
    const two = normalizeEvents([transition({})]).records[0];
    expect(two.path).toBeUndefined();
  });
});

describe('R3: скачки в 1–2 кадра — не анимация', () => {
  test('меньше 4 значений или короче 50 мс — не запись, а счёт', () => {
    const jump = sampledFrames([0, 10]);
    const twoFrames = { ...sampledFrames([0, 5, 10]), target: target('#two') };
    const quick = { ...sampledFrames([0, 2, 5, 8, 10], 10), target: target('#quick') }; // 4+ значений, но 40 мс
    const real = { ...sampledFrames([0, 1, 3, 5, 7, 8, 9, 9.5, 10]), target: target('#real') };
    const { records, jumps } = normalizeEvents([jump, twoFrames, quick, real]);
    expect(records.map((r) => r.target.selector)).toEqual(['#real']);
    expect(jumps).toEqual({ hover: 3 });
  });
});

describe('R4: фоновые петли не попадают в наведение и фокус', () => {
  test('то же (элемент, свойства, длительность) уже было при загрузке или прокрутке', () => {
    const digit = (phase, trigger, t0, over = {}) => waapi('linear', 900, {
      phase, trigger, t0, target: target('span.digit'),
      keyframes: [{ offset: 0, '--d': '-3' }, { offset: 1, '--d': '0' }], ...over,
    });
    const events = [
      digit('load', 'load', 0),
      digit('hover', 'hover', 5000),
      digit('blur', 'focus', 9000),
      digit('hover', 'hover', 6000, { nearSubject: true }), // сам наведённый элемент — не фон
      digit('hover', 'hover', 7000, { timing: { duration: 400, delay: 0, easing: 'linear', iterations: 1 } }),
    ];
    const { records, background } = normalizeEvents(events);
    expect(records.map((r) => [r.phase, r.t0 ?? r.startMs])).toEqual([['load', 0], ['hover', 6000], ['hover', 7000]]);
    expect(background).toEqual([{ selector: 'span.digit', trigger: 'hover' }, { selector: 'span.digit', trigger: 'focus' }]);
  });
});

describe('M1: смена цвета не вытесняет движение', () => {
  test('isColorOnly', () => {
    expect(isColorOnly({ properties: ['color', 'background-color', 'outline-color', 'border-top-color', 'fill', 'stroke'] })).toBe(true);
    expect(isColorOnly({ properties: ['text-decoration-color', 'caret-color'] })).toBe(true);
    expect(isColorOnly({ properties: ['color', 'opacity'] })).toBe(false);
    expect(isColorOnly({ properties: [] })).toBe(false);
  });

  test('потолок фазы: сначала движение, затем цвет', () => {
    const raw = [
      ...Array.from({ length: 350 }, (_, i) => colorTransition(i)),
      ...Array.from({ length: 10 }, (_, i) => transition({ phase: 'scroll', trigger: 'scroll', target: target(`#m${i}`), t0: 3000 + i })),
    ];
    const { records, omitted } = normalizeEvents(raw);
    expect(records).toHaveLength(300);
    expect(records.filter((r) => r.properties[0] === 'opacity')).toHaveLength(10);
    expect(omitted.scroll).toBe(60);
    expect(new Set(records.map((r) => r.id)).size).toBe(300);
  });

  test('токены: смена цвета не задаёт длительность, если есть движение', () => {
    const color = Array.from({ length: 6 }, (_, i) => rec({ id: `c${i}`, phase: 'hover', trigger: 'hover', properties: ['color'], durationMs: 100 }));
    const move = rec({ id: 'm', phase: 'hover', trigger: 'hover', properties: ['transform'], durationMs: 250 });
    expect(draftTokens([...color, move]).duration.fast).toBe(250);
    expect(draftTokens(color).duration.fast).toBe(100);
    expect(validateTokens(draftTokens([...color, move]))).toEqual([]);
  });
});

describe('M2: отдельные свойства translate, scale, rotate', () => {
  test('decomposeMotion складывает transform и отдельные свойства', () => {
    expect(decomposeMotion({ translate: '0px 24px' })).toEqual({ tx: 0, ty: 24, scale: 1, rotate: 0 });
    expect(decomposeMotion({ scale: '0.97' }).scale).toBeCloseTo(0.97, 3);
    expect(decomposeMotion({ scale: '97%' }).scale).toBeCloseTo(0.97, 3);
    expect(decomposeMotion({ rotate: '45deg' }).rotate).toBeCloseTo(45, 3);
    expect(decomposeMotion({ rotate: 'z 0.25turn' }).rotate).toBeCloseTo(90, 3);
    expect(decomposeMotion({ translate: 'calc(-50% - 28px)' }, { w: 200, h: 50 }).tx).toBeCloseTo(-128, 3);
    expect(decomposeMotion({ transform: 'translateY(10px)', translate: '0px 5px' }).ty).toBeCloseTo(15, 3);
    expect(decomposeMotion({ translate: 'none', scale: 'none', rotate: 'none' })).toEqual({ tx: 0, ty: 0, scale: 1, rotate: 0 });
  });

  test('токены: сдвиг через translate входит в distance', () => {
    const r = rec({ properties: ['translate'], from: { translate: '0px 24px' }, to: { translate: 'none' } });
    expect(draftTokens([r]).distance).toBe(24);
  });

  test('замер: JS двигает style.translate', () => {
    const ev = rawSampled({ fromY: 40, toY: 0, ms: 500, curve: [0.23, 1, 0.32, 1] });
    ev.samples.forEach((smp) => {
      const y = /, ([-\d.e]+)\)$/.exec(smp.transform)[1];
      smp.translate = `0px ${y}px`;
      smp.transform = 'none';
    });
    const r = normalizeEvents([ev]).records[0];
    expect(r.properties).toEqual(['translate']);
    expect(Math.abs(r.durationMs - 500)).toBeLessThanOrEqual(40);
    expect(r.from.translate).toBe('0px 40px');
  });
});

describe('R26: кривые токенов — точные и пространственные важнее', () => {
  const many = (n, over) => Array.from({ length: n }, (_, i) => rec({ id: `${over.id ?? 'x'}${i}`, target: target(`.${over.id ?? 'x'}-${i}`), startMs: i * 80, ...over }));
  const sampled = (n, over) => many(n, { kind: 'js-sampled', basis: 'sampled', ...over });
  const S = [0.76, 0, 0.24, 1];

  test('mercury: enter — кривая сдвига проявления, а не почти линейная прозрачность; move — S-кривая', () => {
    const records = [
      ...many(11, { id: 'op', phase: 'scroll', trigger: 'scroll', properties: ['opacity'], easing: [0.59, 0.41, 0.68, 0.49], easingName: 'своя' }),
      ...many(11, { id: 'tr', phase: 'scroll', trigger: 'scroll', properties: ['translate'], easing: [0.28, 1.1, 0.74, 1], easingName: 'своя' }),
      ...many(1, { id: 'sl', phase: 'scroll', trigger: 'scroll', properties: ['transform'], easing: S, easingName: 'easeInOutQuart' }),
      ...sampled(14, { id: 'lo', phase: 'scroll', trigger: 'scroll', properties: ['transform'], easing: [0.7, 0.05, 0.2, 1], easingName: 'своя' }),
    ];
    const t = draftTokens(records);
    expect(t.ease.enter).toEqual([0.28, 1.1, 0.74, 1]);
    expect(t.ease.move).toEqual(S);
    expect(validateTokens(t)).toEqual([]);
  });

  test('ramp: при загрузке и прокрутке только замеры Lottie — enter из точных записей наведения', () => {
    const records = [
      ...sampled(4, { id: 'lo', phase: 'scroll', trigger: 'scroll', properties: ['transform'], easing: [0.7, 0.05, 0.2, 1], easingName: 'своя' }),
      ...many(2, { id: 'cl', phase: 'hover', trigger: 'hover', properties: ['clip-path'], easing: [0.45, 0.05, 0.55, 0.95], easingName: 'easeInOutSine' }),
      ...many(1, { id: 'rx', phase: 'hover', trigger: 'hover', properties: ['transform'], easing: [0.4, 0, 0.2, 1], easingName: 'Material standard' }),
      ...many(2, { id: 'ot', phase: 'hover-out', trigger: 'hover', properties: ['clip-path'], easing: [0.45, 0.05, 0.55, 0.95], easingName: 'easeInOutSine' }),
    ];
    const t = draftTokens(records);
    expect(t.ease.enter).toEqual([0.45, 0.05, 0.55, 0.95]);
    expect(t.ease.move).toEqual([0.45, 0.05, 0.55, 0.95]);
    expect(validateTokens(t)).toEqual([]);
  });

  test('равная частота — кривая более крупного элемента (меню, а не иконка 16×16)', () => {
    const icon = rec({ id: 'ic', phase: 'hover', trigger: 'hover', properties: ['rotate'], easing: [0.6, 0, 0.2, 0.5], easingName: 'своя',
      target: { ...target('svg.chevron'), box: { x: 0, y: 0, w: 16, h: 16 } } });
    const menu = rec({ id: 'mn', phase: 'hover', trigger: 'hover', properties: ['clip-path'], easing: [0.45, 0.05, 0.55, 0.95], easingName: 'easeInOutSine',
      target: { ...target('div.menu'), box: { x: 0, y: 0, w: 1200, h: 658 } } });
    expect(draftTokens([icon, menu]).ease.enter).toEqual([0.45, 0.05, 0.55, 0.95]);
  });

  test('запасные ступени: прозрачность, затем замеры, затем значения по умолчанию', () => {
    const fade = many(2, { id: 'f', properties: ['opacity'], easing: [0, 0, 0.2, 1], easingName: 'Material decelerate' });
    expect(draftTokens(fade).ease.enter).toEqual([0, 0, 0.2, 1]);
    const onlySampled = sampled(2, { id: 's', properties: ['transform'], easing: [0.3, 0.8, 0.4, 1], easingName: 'своя' });
    expect(draftTokens(onlySampled).ease.enter).toEqual([0.3, 0.8, 0.4, 1]);
    const t = draftTokens([]);
    expect(t.ease.enter).toEqual([0.23, 1, 0.32, 1]);
    expect(t.ease.move).toEqual([0.77, 0, 0.175, 1]);
  });

  test('move: только S-кривые, иначе значение по умолчанию; точные важнее замеров', () => {
    const noS = many(3, { id: 'o', properties: ['transform'], easing: [0.23, 1, 0.32, 1] });
    expect(draftTokens(noS).ease.move).toEqual([0.77, 0, 0.175, 1]);
    const mixed = [
      ...sampled(5, { id: 'sm', properties: ['transform'], easing: [0.3, 0, 0.7, 1], easingName: 'своя' }),
      ...many(1, { id: 'ex', properties: ['transform'], easing: [0.4, 0, 0.2, 1], easingName: 'Material standard' }),
    ];
    expect(draftTokens(mixed).ease.move).toEqual([0.4, 0, 0.2, 1]);
  });

  test('exit: точная запись ухода курсора важнее замеров', () => {
    const records = [
      ...sampled(3, { id: 'so', phase: 'hover-out', trigger: 'hover', properties: ['transform'], easing: [0.8, 0.1, 0.3, 0.85], easingName: 'своя' }),
      ...many(1, { id: 'eo', phase: 'hover-out', trigger: 'hover', properties: ['opacity'], easing: [0.45, 0.05, 0.55, 0.95], easingName: 'easeInOutSine' }),
    ];
    expect(draftTokens(records).ease.exit).toEqual([0.45, 0.05, 0.55, 0.95]);
  });
});

describe('R28: мелкие искажения', () => {
  test('1: distance и blur — сначала точные записи (ramp: 8 px против Lottie 31–238 px)', () => {
    const exact = [0, 1].map((i) => rec({ id: `e${i}`, target: target(`.e${i}`), properties: ['transform', 'filter'],
      from: { transform: 'translateY(8px)', filter: 'blur(4px)' }, to: { transform: 'none', filter: 'blur(0px)' } }));
    const lottie = [31, 120, 238].map((d, i) => rec({ id: `l${i}`, target: target(`g.l${i}`), kind: 'js-sampled', basis: 'sampled',
      properties: ['transform', 'filter'], from: { transform: `matrix(1, 0, 0, 1, 0, ${d})`, filter: 'blur(10px)' }, to: { transform: 'matrix(1, 0, 0, 1, 0, 0)', filter: 'none' } }));
    const t = draftTokens([...exact, ...lottie]);
    expect(t.distance).toBe(8);
    expect(t.blur).toBe(4);
    expect(draftTokens(lottie).distance).toBe(120); // только замеры — берём их
  });

  test('2: каскад из задержек короче кадра — настоящий (по букве через 12 мс); дрожь t0 при равных задержках — нет', () => {
    const letters = [0, 12, 24, 36, 48].map((d, i) => rec({ id: `c${i}`, target: target(`.c${i}`), delayMs: d, startMs: 100 + d }));
    expect(detectStagger(letters)).toEqual([expect.objectContaining({ stepMs: 12, count: 5 })]);
    const jitter = [0, 3, 5, 9, 12].map((d, i) => rec({ id: `j${i}`, target: target(`.j${i}`), delayMs: 0, startMs: 100 + d }));
    expect(detectStagger(jitter)).toEqual([]);
  });

  test('потолок фазы: сначала реакции, затем петли, затем цвет', () => {
    const loops = Array.from({ length: 300 }, (_, i) => transition({ target: target(`span.d${i}`), t0: i, repeats: 5 }));
    const real = Array.from({ length: 5 }, (_, i) => transition({ target: target(`#r${i}`), t0: 1000 + i, property: 'transform',
      keyframes: [{ transform: 'translateY(8px)' }, { transform: 'none' }] }));
    const { records, omitted } = normalizeEvents([...loops, ...real]);
    expect(records.filter((r) => !r.loop)).toHaveLength(5);
    expect(omitted.load).toBe(5);
  });

  test('3: свойства нет в среднем кадре — берётся значение предыдущего, а не 0 и не 1', () => {
    const ev = {
      phase: 'load', trigger: 'load', kind: 'css-animation', target: target('#mid'), t0: 0, name: 'x',
      keyframes: [
        { offset: 0, opacity: '0.5', transform: 'translateY(10px)' },
        { offset: 0.5, opacity: '0.8' },
        { offset: 1, transform: 'translateY(10px)' },
      ],
      timing: { duration: 600, delay: 0, easing: 'linear', iterations: 1, direction: 'normal', fill: 'none' },
    };
    const [r] = normalizeEvents([ev]).records;
    expect(r.path.map((k) => k.transform)).toEqual(['translateY(10px)', 'translateY(10px)', 'translateY(10px)']);
    expect(r.path.map((k) => k.opacity)).toEqual(['0.5', '0.8', '0.8']);
    expect(draftTokens([r]).distance).toBe(8); // сдвига нет — значение по умолчанию, а не фантомные 10
  });
});

describe('каскад: шаг прокрутки — не каскад', () => {
  test('шаги больше 500 мс не считаются каскадом', () => {
    const recs = [0, 820, 1640, 2460].map((d, i) => rec({ id: `s${i}`, phase: 'scroll', startMs: d }));
    expect(detectStagger(recs)).toEqual([]);
  });

  test('старты в пределах одного кадра — одновременно, а не каскад (цифры счётчика)', () => {
    const recs = [0, 1, 2, 4, 5, 7, 11].map((d, i) => rec({ id: `n${i}`, startMs: d }));
    expect(detectStagger(recs)).toEqual([]);
  });
});

describe('фоновые петли (ramp.com: счётчики, бегущая строка, Lottie вне экрана)', () => {
  const ev = (over) => waapi('ease-out', 900, { target: target('span.digit'), keyframes: [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }], ...over });

  test('повторяющееся и бегущее до конца фазы — петля', () => {
    const repeated = ev({ repeats: 50 });
    const running = { ...rawSampled({ fromY: 40, toY: 0, ms: 500, curve: [0.23, 1, 0.32, 1] }), loop: true };
    const once = ev({ target: target('#once') });
    const { records } = normalizeEvents([repeated, running, once]);
    expect(records.find((r) => r.target.selector === 'span.digit')).toMatchObject({ loop: true, repeats: 50 });
    expect(records.find((r) => r.target.selector === '#js')).toMatchObject({ loop: true });
    expect(records.find((r) => r.target.selector === '#once').loop).toBeUndefined();
  });

  test('в наведении и фокусе: петля или цель вне экрана — фон, если это не наведённый элемент', () => {
    const hover = (over) => ev({ phase: 'hover', trigger: 'hover', ...over });
    const off = { ...target('g.lottie'), inView: false };
    const events = [
      hover({ repeats: 9, t0: 1 }),
      hover({ target: off, t0: 2 }),
      hover({ target: { ...off, selector: 'g.own' }, nearSubject: true, t0: 3 }),
      hover({ target: { ...target('#menu'), inView: true }, t0: 4 }),
    ];
    const { records, background } = normalizeEvents(events);
    expect(records.map((r) => r.target.selector)).toEqual(['g.own', '#menu']);
    expect(background.map((b) => b.selector)).toEqual(['span.digit', 'g.lottie']);
  });

  test('такой же элемент с тем же движением, что у петли, — часть петли (цифра счётчика сработала один раз)', () => {
    const digit = (n, over = {}) => ev({ target: target(`span.number > span.digit:nth-of-type(${n})`), t0: n, ...over });
    const { records } = normalizeEvents([
      digit(1, { repeats: 40 }),
      digit(2),
      ev({ target: target('#card'), t0: 9 }), // то же движение, но другой элемент — не петля
    ]);
    expect(records.map((r) => [r.target.selector, r.loop ?? false])).toEqual([
      ['span.number > span.digit:nth-of-type(1)', true],
      ['span.number > span.digit:nth-of-type(2)', true],
      ['#card', false],
    ]);
  });

  test('distance — сдвиг между кадрами, а не положение (SVG-группы Lottie стоят в 100–400 px)', () => {
    const svg = rec({ properties: ['transform'], from: { transform: 'translate(100px, 200px)' }, to: { transform: 'translate(100px, 210px)' } });
    expect(draftTokens([svg]).distance).toBe(10);
  });

  test('петли не задают токены', () => {
    const loops = Array.from({ length: 10 }, (_, i) => rec({
      id: `p${i}`, durationMs: 900, easing: [0.2, 0.2, 0.05, 1.1], easingName: 'своя', loop: true, startMs: i * 2,
    }));
    const real = [rec({ id: 'r1', durationMs: 400, startMs: 0 }), rec({ id: 'r2', durationMs: 400, startMs: 80, target: target('#b') })];
    const t = draftTokens([...loops, ...real]);
    expect(t.duration.base).toBe(400);
    expect(t.ease.enter).toEqual([0.23, 1, 0.32, 1]);
    expect(validateTokens(t)).toEqual([]);
  });
});

// --- Финальное ревью ---

const kf2 = (p, a, b) => [{ offset: 0, [p]: a }, { offset: 1, [p]: b }];

describe('F2: разные анимации одного элемента без имени — разные записи', () => {
  test('motionLabel: свойство перехода, иначе имя и свойства кадров', () => {
    expect(motionLabel({ property: 'opacity' })).toBe('opacity');
    expect(motionLabel({ keyframes: [{ offset: 0, computedOffset: 0, easing: 'linear', opacity: 0, clipPath: 'a' }, { opacity: 1 }] }))
      .toBe('/clipPath+opacity');
    expect(motionLabel({ name: 'fade', keyframes: kf2('opacity', 0, 1) })).toBe('fade/opacity');
  });

  test('opacity и filter через 0.05 мс — две записи; две бесконечные — тоже две', () => {
    const inf = (p, a, b) => waapi('linear', 1000, {
      target: target('#inf'), keyframes: kf2(p, a, b),
      timing: { duration: 1000, delay: 0, easing: 'linear', iterations: Infinity, direction: 'normal', fill: 'none' },
    });
    const { records } = normalizeEvents([
      waapi('ease-out', 600, { t0: 100, keyframes: kf2('opacity', '0', '1') }),
      waapi('ease-out', 600, { t0: 100.05, keyframes: kf2('filter', 'blur(8px)', 'blur(0px)') }),
      inf('opacity', '0.5', '1'),
      inf('transform', 'rotate(0deg)', 'rotate(360deg)'),
    ]);
    expect(records.filter((r) => r.target.selector === '#w').map((r) => r.properties[0]).sort()).toEqual(['filter', 'opacity']);
    expect(records.filter((r) => r.target.selector === '#inf')).toHaveLength(2);
  });
});

describe('F3: одна ложная петля не стирает семью настоящих проявлений', () => {
  const reveal = (sel, t0, over = {}) => waapi('ease-out', 670, {
    target: target(sel), t0, keyframes: kf2('opacity', 0, 1), ...over,
  });

  test('секции mercury: :nth-of-type выше последнего уровня — разные элементы', () => {
    const sel = (k) => `section:nth-of-type(${k}) > div.animate-container`;
    const { records } = normalizeEvents([reveal(sel(3), 0, { repeats: 3 }), ...[4, 5, 6, 7, 8, 9].map((k) => reveal(sel(k), k * 900))]);
    expect(records.filter((r) => r.loop).map((r) => r.target.selector)).toEqual([sel(3)]);
    expect(draftTokens(records).duration.base).toBe(670);
  });

  test('семью тянут только петли по времени (loop) или repeats ≥ 4', () => {
    const digit = (n, over = {}) => reveal(`span.number > span.digit:nth-of-type(${n})`, n, over);
    const loopOf = (events) => normalizeEvents(events).records.map((r) => r.loop ?? false);
    expect(loopOf([digit(1, { repeats: 3 }), digit(2)])).toEqual([true, false]);
    expect(loopOf([digit(1, { repeats: 4 }), digit(2)])).toEqual([true, true]);
    expect(loopOf([digit(1, { loop: true }), digit(2)])).toEqual([true, true]);
  });
});

// Замер прокрутки: на кадре i прокрутка sy[i] и сдвиг ty[i] (px).
function scrollSampled(sy, ty, over = {}) {
  const samples = sy.map((y, i) => ({ t: 1000 + i * 16.7, sy: y, transform: `matrix(1, 0, 0, 1, 0, ${ty[i]})`, opacity: '1' }));
  return { phase: 'scroll', trigger: 'scroll', kind: 'js-sampled', target: target('#p'), t0: 1000, samples, ...over };
}

// Шаги прокрутки на 720 px через 40 кадров, в конце возврат наверх; lag — кадров до отклика элемента.
function parallaxFrames(rate, lag = 0) {
  const stepAt = (i) => (i >= 190 ? 0 : Math.min(4, Math.floor(Math.max(0, i) / 40)));
  const sy = [];
  const ty = [];
  for (let i = 0; i < 200; i++) {
    sy.push(stepAt(i) * 720);
    ty.push(Math.round(stepAt(i - lag) * 720 * rate * 100) / 100);
  }
  return { sy, ty };
}

describe('F4: движение, привязанное к прокрутке', () => {
  test('параллакс: меняется только в кадрах прокрутки — «за M px прокрутки», без длительности и кривой', () => {
    const { sy, ty } = parallaxFrames(0.3);
    const { records } = normalizeEvents([scrollSampled(sy, ty)]);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r).toMatchObject({ scrollLinked: true, scrollPx: 2880, durationMs: 0, basis: 'sampled', properties: ['transform'] });
    expect(r.loop).toBeUndefined();
    expect(decomposeMotion(r.to).ty - decomposeMotion(r.from).ty).toBe(864);
  });

  test('отклик кадром позже — тоже прокрутка; петля по потолку замеров — не петля', () => {
    const { sy, ty } = parallaxFrames(-0.5, 1);
    const r = normalizeEvents([scrollSampled(sy, ty, { loop: true })]).records[0];
    expect(r).toMatchObject({ scrollLinked: true, scrollPx: 2880 });
    expect(r.loop).toBeUndefined();
  });

  test('движение по времени во время прокрутки — обычная запись; один шаг прокрутки — не привязка', () => {
    // Проявление 500 мс после шага прокрутки: сдвиг меняется в кадрах без прокрутки.
    const sy = Array.from({ length: 60 }, (_, i) => (i < 5 ? 0 : 720));
    const ty = sy.map((_, i) => (i < 5 ? 40 : Math.max(0, Math.round(40 - (i - 5) * 1.5))));
    const timed = normalizeEvents([scrollSampled(sy, ty, { target: target('#timed') })]).records[0];
    expect(timed.scrollLinked).toBeUndefined();
    expect(timed.durationMs).toBeGreaterThan(300);
    // Сдвиг ровно в кадре единственного шага: не видно, что это привязка, — как раньше (скачок).
    const once = scrollSampled(sy, sy.map((y) => y / 10), { target: target('#once') });
    const { records, jumps } = normalizeEvents([once]);
    expect(records).toEqual([]);
    expect(jumps).toEqual({ scroll: 1 });
  });

  test('движение туда и обратно в одном замере не теряется молча — счёт в returned', () => {
    const ty = [0, 0, 10, 20, 30, 40, 30, 20, 10, 0, 0, 0, 0, 0];
    const back = scrollSampled(ty.map(() => 0), ty, { target: target('#back') });
    const { records, returned } = normalizeEvents([back, { ...back, phase: 'hover', trigger: 'hover', t0: 5000 }]);
    expect(records).toEqual([]);
    expect(returned).toEqual({ scroll: 1, hover: 1 });
  });

  test('токены: привязка к прокрутке в них не входит', () => {
    const { sy, ty } = parallaxFrames(0.3);
    const { records } = normalizeEvents([scrollSampled(sy, ty)]);
    const t = draftTokens([...records, rec({ id: 'r', durationMs: 400 })]);
    expect(t.duration).toMatchObject({ base: 400, slow: 400 });
    expect(t.distance).toBe(8);
    expect(validateTokens(t)).toEqual([]);
  });
});

describe('F5: компенсация точки масштаба в замере — не сдвиг', () => {
  test('масштаб от 0: сдвиг матрицы не идёт в distance', () => {
    const lottie = rec({
      basis: 'sampled', kind: 'js-sampled', properties: ['transform'],
      from: { transform: 'matrix(0, 0, 0, 0, 889.47, 708.25)' }, to: { transform: 'matrix(0.6, 0, 0, 0.6, 651.39, 673.92)' },
    });
    expect(draftTokens([lottie]).distance).toBe(8);
    const moved = rec({
      basis: 'sampled', kind: 'js-sampled', properties: ['transform'],
      from: { transform: 'matrix(1, 0, 0, 1, 0, 30)' }, to: { transform: 'matrix(1, 0, 0, 1, 0, 0)' },
    });
    expect(draftTokens([lottie, moved]).distance).toBe(30);
  });
});

describe('F6: запись длительностью 0 мс — скачок, а не движение', () => {
  test('0 мс считается со скачками', () => {
    const zero = { ...rawAnimation({ name: 'enter', iterations: 1, selector: '#z' }), timing: {
      duration: 0, delay: -600, easing: 'ease-in-out', iterations: 1, direction: 'normal', fill: 'both' } };
    const { records, jumps } = normalizeEvents([zero, rawAnimation({ name: 'spin', iterations: 1, selector: '#s' })]);
    expect(records.map((r) => r.target.selector)).toEqual(['#s']);
    expect(jumps).toEqual({ load: 1 });
  });
});

describe('F11: направление анимации', () => {
  test('alternate сохраняется, normal — нет', () => {
    const alt = { ...rawAnimation({ name: 'pulse', iterations: Infinity, selector: '#p' }), timing: {
      duration: 1000, delay: 0, easing: 'linear', iterations: Infinity, direction: 'alternate', fill: 'none' } };
    const { records } = normalizeEvents([alt, rawAnimation({ name: 'spin', iterations: 1, selector: '#s' })]);
    expect(records.find((r) => r.target.selector === '#p').direction).toBe('alternate');
    expect(records.find((r) => r.target.selector === '#s')).not.toHaveProperty('direction');
  });
});
