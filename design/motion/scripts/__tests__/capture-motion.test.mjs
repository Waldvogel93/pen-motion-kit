import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { captureMotion, captureSlug, collapseRepeats, scratchTemp, setupHint } from '../capture-motion.mjs';
import { decomposeMotion, detectStagger, normalizeEvents } from '../capture/analyze.mjs';
import { REPO_ROOT } from '../lib.mjs';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/motion-site');
const TMP = path.join(REPO_ROOT, '.scratch/test-tmp/capture');
const T = 120_000;

const site = (file) => pathToFileURL(path.join(SITE, file)).href;
const out = (name) => path.join(TMP, name);
const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance;

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

test('captureSlug: хост без www и путь', () => {
  expect(captureSlug('https://www.mercury.com/')).toBe('mercury.com');
  expect(captureSlug('https://ramp.com/pricing')).toBe('ramp.com-pricing');
  expect(captureSlug('https://example.com/a/b?x=1#top')).toBe('example.com-a-b');
});

test('F8: нет пакета playwright или браузера — подсказка по-русски с точной командой', () => {
  const root = 'D:\\Project';
  const noPackage = Object.assign(new Error("Cannot find package 'playwright' imported from D:\\Project\\design\\motion\\scripts\\capture-motion.mjs"),
    { code: 'ERR_MODULE_NOT_FOUND' });
  expect(setupHint(noPackage, root)).toMatch(/^Нет пакета playwright[^\n]*cd design\/motion && npm install/);
  const noBrowser = new Error("browserType.launch: Executable doesn't exist at D:\\Project\\.scratch\\ms-playwright\\chromium_headless_shell-1200\\"
    + "chrome-win\\headless_shell.exe\n╔══╗\n║ Looks like Playwright was just installed or updated. ║\n║ npx playwright install ║");
  const hint = setupHint(noBrowser, root);
  expect(hint).toMatch(/^Нет браузера/);
  expect(hint).toContain('cd design/motion && PLAYWRIGHT_BROWSERS_PATH=D:/Project/.scratch/ms-playwright npx playwright install chromium');
  expect(setupHint(Object.assign(new Error("Cannot find package 'left-pad'"), { code: 'ERR_MODULE_NOT_FOUND' }), root)).toBeNull();
  expect(setupHint(new Error('net::ERR_NAME_NOT_RESOLVED'), root)).toBeNull();
});

test('F7: временные папки браузера — в .scratch/tmp проекта, не в системном tmp; после съёмки всё как было', () => {
  const keys = ['TEMP', 'TMP', 'TMPDIR'];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const restore = scratchTemp(REPO_ROOT);
  try {
    expect(os.tmpdir()).toBe(path.join(REPO_ROOT, '.scratch/tmp'));
    expect(fs.existsSync(os.tmpdir())).toBe(true);
  } finally {
    restore();
  }
  expect(Object.fromEntries(keys.map((k) => [k, process.env[k]]))).toEqual(before);
});

test('collapseRepeats: фоновый повтор на фазу — не больше двух, остальное в счёт', () => {
  const ev = (phase, selector, t0, over = {}) => ({
    phase, trigger: phase === 'hover-out' ? 'hover' : phase, kind: 'waapi', target: { selector }, t0,
    keyframes: [], timing: { duration: 900, delay: 0, easing: 'linear', iterations: 1 }, name: undefined, ...over,
  });
  const digit = [{ offset: 0, easing: 'linear', '--_number-flow-d': '-3' }, { offset: 1, easing: 'linear', '--_number-flow-d': '0' }];
  const ticker = Array.from({ length: 50 }, (_, i) => ev('hover', 'span.number', i * 100, { keyframes: digit }));
  // Motion/framer-motion: один animate() на свойство — разные свойства одного элемента не повторы.
  const entrance = ['opacity', 'filter', 'clipPath'].map((p, i) =>
    ev('load', '#hero', i, { keyframes: [{ offset: 0, computedOffset: 0, composite: 'auto', [p]: 'a' }, { offset: 1, [p]: 'b' }] }));
  const events = [
    ...ticker,
    ...entrance,
    ev('hover-out', 'span.number', 9000, { keyframes: digit }), // другая фаза — свой счёт
    ev('hover', '#cta', 1, { kind: 'css-transition', property: 'transform', timing: { duration: 200 } }),
    ev('hover', '#cta', 2, { kind: 'css-transition', property: 'color', timing: { duration: 200 } }),
    ...Array.from({ length: 5 }, (_, i) => ev('load', '#js', i, { kind: 'js-sampled', timing: undefined })),
  ];
  // Смена темы навигации при прокрутке повторяется, но это не «фоновая анимация».
  events.push(...Array.from({ length: 6 }, (_, i) => ev('scroll', 'a.nav', 100 + i, { kind: 'css-transition', property: 'color', timing: { duration: 300 } })));
  const { events: kept, dropped, repeaters } = collapseRepeats(events);
  expect(kept.filter((e) => e.target.selector === 'span.number' && e.phase === 'hover')).toHaveLength(2);
  // repeats — в пределах своей подфазы (здесь шага нет — фазы): 50 при наведении.
  expect(kept.filter((e) => e.target.selector === 'span.number' && e.phase === 'hover').every((e) => e.repeats === 50)).toBe(true);
  expect(kept.find((e) => e.target.selector === '#cta').repeats).toBeUndefined();
  expect(kept.filter((e) => e.target.selector === 'a.nav')).toHaveLength(2);
  expect(kept.filter((e) => e.target.selector === 'span.number' && e.phase === 'hover-out')).toHaveLength(1);
  expect(kept.filter((e) => e.target.selector === '#cta')).toHaveLength(2);
  expect(kept.filter((e) => e.target.selector === '#hero')).toHaveLength(3);
  expect(kept.filter((e) => e.kind === 'js-sampled')).toHaveLength(2);
  expect(dropped).toEqual({ hover: 48, load: 3, scroll: 4 });
  expect(repeaters).toEqual([{ selector: 'span.number', count: 48 }, { selector: '#js', count: 3 }]);
});

// Переход CSS: туда — from → to, обратно — to → from.
const transitionEv = (step, phase, trigger, selector, from, to, over = {}) => ({
  step, phase, trigger, kind: 'css-transition', property: 'opacity', t0: step * 1000,
  target: { selector, tag: 'div', role: 'other', text: '', box: { x: 0, y: 0, w: 1440, h: 900 }, inView: true },
  keyframes: [{ opacity: from }, { opacity: to }], timing: { duration: 300, delay: 0, easing: 'ease', iterations: 1 }, ...over,
});

test('collapseRepeats: общая подложка двух кнопок наведения — не петля, строки остаются', () => {
  // Три кнопки открывают одну подложку: туда при наведении, обратно при уходе курсора — по шагу на подфазу.
  const events = [];
  for (const [i, step] of [5, 8, 11].entries()) {
    events.push(transitionEv(step, 'hover', 'hover', '#backdrop', '0', '1', { t0: step * 1000 + i }));
    events.push(transitionEv(step + 1, 'hover-out', 'hover', '#backdrop', '1', '0'));
  }
  const { events: kept, dropped } = collapseRepeats(events);
  expect(kept).toHaveLength(6);
  expect(kept.some((e) => e.repeats)).toBe(false);
  expect(dropped).toEqual({});
  const { records, background } = normalizeEvents(kept);
  expect(background).toEqual([]);
  expect(records.filter((r) => r.phase === 'hover')).toHaveLength(3);
  expect(records.filter((r) => r.phase === 'hover-out')).toHaveLength(3);
  expect(records.some((r) => r.loop)).toBe(false);
});

test('collapseRepeats: проявление туда — обратно — туда (whileInView) — не петля', () => {
  const events = [
    transitionEv(0, 'load', 'load', '#card', '0', '1'),
    transitionEv(1, 'scroll', 'scroll', '#card', '1', '0'),
    transitionEv(1, 'scroll', 'scroll', '#card', '0', '1', { t0: 5000 }),
  ];
  const { events: kept } = collapseRepeats(events);
  expect(kept).toHaveLength(3);
  expect(kept.some((e) => e.repeats)).toBe(false);
  expect(normalizeEvents(kept).records.some((r) => r.loop)).toBe(false);
});

test('collapseRepeats: настоящая петля в одной подфазе остаётся петлёй; цифры с разным ходом — тоже', () => {
  const ticker = Array.from({ length: 10 }, (_, i) => transitionEv(0, 'load', 'load', '#ticker', '0.4', '1', { t0: i * 400 }));
  const digits = Array.from({ length: 8 }, (_, i) => transitionEv(0, 'load', 'load', 'span.digit', String(-1 - (i % 2) * 2), '0', {
    kind: 'waapi', property: undefined, keyframes: [{ '--d': String(-1 - (i % 2) * 2) }, { '--d': '0' }], t0: i * 900,
  }));
  // Цифра дробной части: тот же ход раз при загрузке и дважды при прокрутке — счётчик, а не реакция.
  const fraction = [0, 1, 1].map((step, i) => transitionEv(step, step ? 'scroll' : 'load', step ? 'scroll' : 'load', 'span.frac', '-1', '0', {
    kind: 'waapi', property: undefined, keyframes: [{ '--d': '-1' }, { '--d': '0' }], t0: 20000 + i * 900,
  }));
  const { events: kept } = collapseRepeats([...ticker, ...digits, ...fraction]);
  expect(kept.filter((e) => e.target.selector === '#ticker').every((e) => e.repeats === 10)).toBe(true);
  expect(kept.filter((e) => e.target.selector === 'span.digit').every((e) => e.repeats === 4)).toBe(true);
  expect(kept.filter((e) => e.target.selector === 'span.frac').every((e) => e.repeats === 3)).toBe(true);
});

describe('index.html', () => {
  let cap;
  beforeAll(async () => {
    cap = await captureMotion({ url: site('index.html'), outDir: out('index') });
  }, T);

  test('captures fixture', () => {
    const recs = cap.records;
    const cards = recs.filter((r) => r.kind === 'css-animation' && r.target.selector.includes('card'));
    expect(cards).toHaveLength(4);
    for (const r of cards) {
      expect(r).toMatchObject({ phase: 'load', durationMs: 600, easingName: 'ease-out strong' });
      expect(r.properties).toEqual(expect.arrayContaining(['opacity', 'transform']));
    }
    expect(detectStagger(recs)).toContainEqual(expect.objectContaining({ stepMs: 80, count: 4 }));

    const cta = recs.find((r) => r.target.selector === '#cta' && r.phase === 'hover' && r.properties.includes('transform'));
    expect(cta).toMatchObject({ kind: 'css-transition', durationMs: 200 });

    expect(recs.find((r) => r.target.selector === '#waapi')).toMatchObject({ kind: 'waapi', durationMs: 400 });

    const js = recs.find((r) => r.target.selector === '#js');
    expect(js?.basis).toBe('sampled');
    expect(near(js.durationMs, 500, 60)).toBe(true);

    expect(recs.some((r) => r.phase === 'scroll' && r.target.selector === '#reveal')).toBe(true);
    expect(recs.some((r) => r.phase === 'focus' && r.target.selector === '#email')).toBe(true);

    const svg = recs.find((r) => r.target.selector === '#lottie-like');
    expect(svg?.basis).toBe('sampled');
    expect(near(svg.durationMs, 400, 60)).toBe(true);

    for (const file of ['capture.json', 'record.md', 'media/video.webm']) {
      expect(fs.existsSync(path.join(out('index'), file)), file).toBe(true);
    }
    expect(cap.frames.length).toBeGreaterThanOrEqual(7);
    for (const f of cap.frames) expect(fs.existsSync(path.join(out('index'), f)), f).toBe(true);
    expect(cap.video).toBe('media/video.webm');
  });

  test('CSS transition started by JS style is recorded once, exactly', () => {
    const slide = cap.records.filter((r) => r.target.selector === '#slide');
    expect(slide).toHaveLength(1);
    expect(slide[0]).toMatchObject({ kind: 'css-transition', basis: 'exact', durationMs: 300 });
  });

  test('F1: WAAPI-прозрачность и JS-сдвиг одного элемента (как у Motion) — обе записи', () => {
    const split = cap.records.filter((r) => r.target.selector === '#split');
    expect(split.find((r) => r.kind === 'waapi')).toMatchObject({ properties: ['opacity'], durationMs: 600 });
    const js = split.find((r) => r.kind === 'js-sampled');
    expect(js).toMatchObject({ basis: 'sampled', properties: ['transform'] });
    expect(near(js.durationMs, 500, 60)).toBe(true);
    expect(js.from.transform).toContain('40');
  });

  test('F12: CSS-переход, что закончился до разбора пачки, посчитан в «Пропущено»', () => {
    expect(cap.skipped.some((s) => s.selector === '*' && /^короткие переходы, которые закончились до замера: [1-9]/.test(s.reason))).toBe(true);
  });

  test('infinite animation recorded once', () => {
    const spin = cap.records.filter((r) => r.target.selector === '#spinner');
    expect(spin).toHaveLength(1);
    expect(spin[0].iterations).toBe(Infinity);
    const saved = JSON.parse(fs.readFileSync(path.join(out('index'), 'capture.json'), 'utf8'));
    expect(saved.records.find((r) => r.target.selector === '#spinner').iterations).toBe('Infinity');
  });
});

describe('ambient.html: 60 элементов в вечной JS-петле и кнопка с JS-наведением', () => {
  let cap;
  beforeAll(async () => {
    cap = await captureMotion({ url: site('ambient.html'), outDir: out('ambient'), phases: ['load', 'hover'] });
  }, T);

  test('sampling budget: ≤ 40 js-sampled load records', () => {
    const sampled = cap.records.filter((r) => r.trigger === 'load' && r.kind === 'js-sampled');
    expect(sampled.length).toBeGreaterThan(0);
    expect(sampled.length).toBeLessThanOrEqual(40);
  });

  test('background loop does not starve the hovered element', () => {
    const btn = cap.records.find((r) => r.phase === 'hover' && r.target.selector === '#jsbtn');
    expect(btn).toMatchObject({ kind: 'js-sampled', basis: 'sampled' });
    expect(cap.records.some((r) => r.phase === 'hover-out' && r.target.selector === '#jsbtn')).toBe(true);
  });

  test('JS-петля, что идёт до конца фазы, помечена петлёй и свёрнута в отчёте', () => {
    const dots = cap.records.filter((r) => r.trigger === 'load' && r.kind === 'js-sampled');
    expect(dots.every((r) => r.loop === true)).toBe(true);
    expect(btnLoop(cap)).toBeUndefined();
    const md = fs.readFileSync(path.join(out('ambient'), 'record.md'), 'utf8');
    expect(md).toContain('Фоновые петли');
    expect(md.split('### Загрузка')[1].split('### ')[0]).not.toContain('| блок');
  });
});

const btnLoop = (cap) => cap.records.find((r) => r.phase === 'hover' && r.target.selector === '#jsbtn')?.loop;

describe('modern.html: что съёмка искажала на настоящих сайтах', () => {
  let cap;
  let md;
  beforeAll(async () => {
    cap = await captureMotion({ url: site('modern.html'), outDir: out('modern'), phases: ['load', 'hover'] });
    md = fs.readFileSync(path.join(out('modern'), 'record.md'), 'utf8');
  }, T);

  test('R5: CSS-переменная в ключевых кадрах ::before', () => {
    const tracer = cap.records.find((r) => r.target.selector.endsWith('::before'));
    expect(tracer).toMatchObject({ kind: 'css-animation', iterations: Infinity, durationMs: 3400 });
    expect(tracer.properties).toContain('--angle');
    expect(tracer.from['--angle']).toBe('0deg');
    expect(tracer.to['--angle']).toBe('360deg');
    expect(md).toContain('CSS-переменная --angle');
  });

  test('M2: замер JS-анимации отдельного свойства translate', () => {
    const r = cap.records.find((x) => x.target.selector === '#jstr');
    expect(r).toMatchObject({ kind: 'js-sampled', properties: ['translate'] });
    expect(near(r.durationMs, 500, 60)).toBe(true);
  });

  test('R1: пружина Motion в linear() — пружина, а не строка', () => {
    const r = cap.records.find((x) => x.target.selector === '#spring');
    expect(r).toMatchObject({ kind: 'waapi', easing: 'spring', easingName: 'пружина', durationMs: 800 });
    expect(md).not.toMatch(/linear\([^)\n]{40}/);
  });

  test('R4: фоновая петля не попадает в наведение, реакция наведённого элемента остаётся', () => {
    const hover = cap.records.filter((r) => r.trigger === 'hover');
    expect(hover.some((r) => r.target.selector === '#ticker')).toBe(false);
    expect(hover.find((r) => r.phase === 'hover' && r.target.selector === '#lift')).toMatchObject({ properties: ['translate'], durationMs: 200 });
    expect(hover.some((r) => r.phase === 'hover-out' && r.target.selector === '#lift')).toBe(true);
    expect(cap.skipped.find((s) => s.selector === '#ticker')?.reason).toMatch(/фоновая анимация/);
  });

  test('R3: скачок без анимации — не запись, но отмечен', () => {
    expect(cap.records.some((r) => r.target.selector === '#jump')).toBe(false);
    expect(cap.skipped.some((s) => /скачки/.test(s.reason))).toBe(true);
  });

  test('цель вне экрана помечена: inView', () => {
    expect(cap.records.find((r) => r.target.selector === '#below')?.target.inView).toBe(false);
    expect(cap.records.find((r) => r.target.selector === '#spring')?.target.inView).toBe(true);
  });
});

describe('F4: scrolllinked.html — параллакс и scrub на JS', () => {
  let cap;
  let md;
  beforeAll(async () => {
    cap = await captureMotion({ url: site('scrolllinked.html'), outDir: out('scrolllinked'), phases: ['load', 'scroll'] });
    md = fs.readFileSync(path.join(out('scrolllinked'), 'record.md'), 'utf8');
  }, T);

  test('параллакс: привязан к прокрутке, 0.3 px на px прокрутки, без длительности и кривой', () => {
    const p = cap.records.filter((r) => r.target.selector === '#parallax');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ scrollLinked: true, durationMs: 0, properties: ['transform'] });
    const shift = decomposeMotion(p[0].to).ty - decomposeMotion(p[0].from).ty;
    expect(near(shift / p[0].scrollPx, 0.3, 0.02)).toBe(true);
    expect(md).toMatch(/`#parallax` \| transform \|[^\n]*\| привязано к прокрутке: \d+ px за \d+ px прокрутки \| — \| — \| замер \|/);
  });

  test('scrub: поворот и масштаб привязаны к прокрутке, а не скачки', () => {
    expect(cap.records.find((r) => r.target.selector === '#scrub')).toMatchObject({ scrollLinked: true });
    expect(md).toMatch(/`#scrub`[^\n]*привязано к прокрутке: масштаб [\d.]+ → 1\.5, поворот на \d+° за \d+ px прокрутки/);
  });

  test('проявление по времени во время прокрутки — обычная запись; токены — без привязки', () => {
    const r = cap.records.find((x) => x.target.selector === '#jsreveal');
    expect(r.scrollLinked).toBeUndefined();
    expect(near(r.durationMs, 500, 80)).toBe(true);
    const tokens = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
    expect(tokens.duration.slow).toBeLessThan(700);
  });

  test('туда и обратно в одном замере — в «Пропущено», а не молча', () => {
    expect(cap.records.some((r) => r.target.selector === '#bounce')).toBe(false);
    expect(cap.skipped.some((s) => /вернулось к началу[^\n]*прокрутка 1/.test(s.reason))).toBe(true);
  });
});

test('smooth scroll: реакция на фокус не теряется, пока страница едет к полю', async () => {
  // Наведение на кнопку внизу оставляет страницу прокрученной; фокус поля вверху прокручивает её плавно.
  const cap = await captureMotion({ url: site('smooth.html'), outDir: out('smooth'), phases: ['hover', 'focus'] });
  const hint = cap.records.filter((r) => r.trigger === 'focus' && r.target.selector === '#hint');
  expect(hint.filter((r) => r.phase === 'focus').map((r) => r.properties[0]).sort()).toEqual(['opacity', 'translate']);
  expect(hint.filter((r) => r.phase === 'blur')).toHaveLength(2);
  expect(hint.every((r) => r.target.inView === true)).toBe(true);
}, T);

test('toggle.html: общая подложка двух кнопок и проявление туда-обратно — реакции, а не петли', async () => {
  const cap = await captureMotion({ url: site('toggle.html'), outDir: out('toggle'), phases: ['load', 'scroll', 'hover'] });
  const backdrop = cap.records.filter((r) => r.target.selector === '#backdrop');
  expect(backdrop.filter((r) => r.phase === 'hover')).toHaveLength(2);
  expect(backdrop.filter((r) => r.phase === 'hover-out')).toHaveLength(2);
  const card = cap.records.filter((r) => r.target.selector === '#card' && r.properties.includes('opacity'));
  expect(card.length).toBeGreaterThanOrEqual(3); // загрузка: туда; прокрутка: обратно и снова туда
  expect([...backdrop, ...card].some((r) => r.loop)).toBe(false);
  const md = fs.readFileSync(path.join(out('toggle'), 'record.md'), 'utf8');
  expect(md).not.toContain('Фоновые петли');
  expect(cap.skipped.some((s) => s.selector === '#backdrop' || s.selector === '#card')).toBe(false);
}, T);

test('видео и canvas: в «Пропущено» сказано, что их движение только на кадрах', async () => {
  const cap = await captureMotion({ url: site('media.html'), outDir: out('media'), phases: ['load'] });
  expect(cap.skipped.find((s) => s.selector === '#clip')?.reason).toMatch(/^видео 320×180/);
  expect(cap.skipped.find((s) => s.selector === '#anim')?.reason).toMatch(/^canvas 300×200/);
  expect(cap.skipped.some((s) => s.selector === '#tiny')).toBe(false);
}, T);

test('пересъёмка в ту же папку: старых кадров не остаётся', async () => {
  const dir = out('again');
  fs.mkdirSync(path.join(dir, 'media/frames'), { recursive: true });
  const stale = path.join(dir, 'media/frames/load-9999.png');
  fs.writeFileSync(stale, 'старый кадр');
  const cap = await captureMotion({ url: site('index.html'), outDir: dir, phases: ['load'] });
  expect(fs.existsSync(stale)).toBe(false);
  expect(fs.readdirSync(path.join(dir, 'media/frames')).map((f) => `media/frames/${f}`).sort()).toEqual([...cap.frames].sort());
}, T);

test('limitMs: ceiling stops the capture and keeps what was captured', async () => {
  const dir = out('limit');
  const cap = await captureMotion({ url: site('index.html'), outDir: dir, limitMs: 3000 });
  expect(cap.skipped).toContainEqual({ selector: '*', reason: 'потолок 3 с' });
  expect(fs.existsSync(path.join(dir, 'capture.json'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'record.md'))).toBe(true);
}, T);

test('frozen main thread: the ceiling is hard', async () => {
  const dir = out('frozen');
  const started = Date.now();
  const cap = await captureMotion({ url: site('frozen.html'), outDir: dir, limitMs: 4000 });
  expect(Date.now() - started).toBeLessThan(30_000);
  expect(cap.skipped).toContainEqual({ selector: '*', reason: 'потолок 4 с' });
  expect(fs.existsSync(path.join(dir, 'capture.json'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'record.md'))).toBe(true);
}, T);

test('overlay blocks hover', async () => {
  const cap = await captureMotion({ url: site('overlay.html'), outDir: out('overlay') });
  expect(cap.skipped.some((s) => s.selector === '#under')).toBe(true);
  expect(fs.existsSync(path.join(out('overlay'), 'record.md'))).toBe(true);
}, T);

test('caps on heavy page', async () => {
  const cap = await captureMotion({ url: site('heavy.html'), outDir: out('heavy'), phases: ['load'] });
  expect(cap.records.filter((r) => r.trigger === 'load').length).toBeLessThanOrEqual(300);
  const md = fs.readFileSync(path.join(out('heavy'), 'record.md'), 'utf8');
  expect(md).toMatch(/ещё 200 не показано/);
}, T);

test('never-quiet page finishes', async () => {
  const started = Date.now();
  await captureMotion({ url: site('noisy.html'), outDir: out('noisy'), phases: ['load'] });
  expect(Date.now() - started).toBeLessThan(15_000);
}, T);

test('unreachable url', async () => {
  const dir = out('nope');
  await expect(captureMotion({ url: site('nope.html'), outDir: dir })).rejects.toThrow('Не удалось открыть');
  expect(fs.existsSync(dir)).toBe(false);
}, T);
