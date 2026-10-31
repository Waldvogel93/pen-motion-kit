// Съёмка движения с живой страницы: Playwright (Chromium) + регистратор в странице, фазы
// загрузка → прокрутка → наведение → фокус. Пишет capture.json, record.md, кадры и видео.
// Только публичные страницы: без кликов и входа.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { isColorOnly, motionLabel, normalizeEvents } from './capture/analyze.mjs';
import { renderRecord } from './capture/report.mjs';
import { REPO_ROOT, SCRIPTS_DIR, runCli } from './lib.mjs';

const RECORDER = path.join(SCRIPTS_DIR, 'capture/recorder.js');
const PHASES = ['load', 'scroll', 'hover', 'focus'];
const LABELS = { load: 'загрузка', scroll: 'прокрутка', hover: 'наведение', focus: 'фокус' };
const FRAMES_AT = [0, 150, 300, 600, 1000, 1600, 2500]; // мс от load
const QUIET_MS = 1000; // столько без новых событий — загрузка утихла
const LOAD_MAX_MS = 8000; // дольше тишину не ждём
const LIMIT_MS = 180_000; // общий потолок съёмки
const SCROLL_STEPS = 12;
const HOVER_MAX = 12;
const FOCUS_MAX = 4;
const USAGE = 'Использование: node design/motion/scripts/capture-motion.mjs <url> [--out <папка>] '
  + '[--phases load,scroll,hover,focus] [--viewport 1440x900]';

/** Имя папки записи: хост без www. + путь, недопустимые символы → «-». */
export function captureSlug(url) {
  let host = '';
  let pathname = String(url);
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, '');
    pathname = u.pathname;
  } catch {
    // не URL — берём строку как есть
  }
  const slug = `${host}${pathname}`.replace(/[^A-Za-z0-9._]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return slug || 'page';
}

const KEYFRAME_SERVICE = new Set(['offset', 'easing', 'composite', 'computedOffset']);

const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Свойства события: свойство перехода или ключи ключевых кадров.
function eventProps(ev) {
  if (ev.property) return [kebab(ev.property)];
  const props = new Set();
  for (const kf of Array.isArray(ev.keyframes) ? ev.keyframes : []) {
    for (const p of Object.keys(kf ?? {})) if (!KEYFRAME_SERVICE.has(p)) props.add(kebab(p));
  }
  return [...props];
}

// Ход события: значения первого и последнего кадра (у замера — первого и последнего замера).
// Переход «туда» и его обратный ход «обратно» — разные события, а не повторы одного.
function directionOf(ev) {
  if (ev.kind === 'js-sampled') {
    const s = Array.isArray(ev.samples) ? ev.samples : [];
    const v = (x) => [x?.transform, x?.opacity, x?.translate, x?.scale, x?.rotate, x?.svgTransform].join(',');
    return `${v(s[0])}>${v(s[s.length - 1])}`;
  }
  const kfs = Array.isArray(ev.keyframes) ? ev.keyframes : [];
  const v = (kf) => Object.keys(kf ?? {}).filter((k) => !KEYFRAME_SERVICE.has(k)).sort().map((k) => `${k}:${kf[k]}`).join(',');
  return `${v(kfs[0])}>${v(kfs[kfs.length - 1])}`;
}

/**
 * Фоновые анимации (счётчики, тикеры, карусели) повторяются сотнями и вытесняют из потолка записи
 * фазы. Одинаковое событие (подфаза, вид, элемент, что анимирует, длительность) остаётся не больше
 * `keep` раз на подфазу; лишнее идёт в счёт по триггеру.
 * - Подфаза — шаг регистратора (`step`): у каждого кандидата наведения и фокуса свой, у загрузки и
 *   прокрутки — один на фазу. Без шага — фаза.
 * - Оставшиеся получают `repeats`, если тот же ход (те же значения первого и последнего кадра) был больше
 *   `keep` раз в подфазе или, для загрузки и прокрутки, в них обеих вместе: это петля. «Туда» и «обратно»
 *   не складываются, а наведение и фокус считаются по кандидату: общая подложка двух пунктов меню и
 *   проявление при каждом входе в окно — реакции, а не петли. Счётчики, что крутятся и при наведении,
 *   ловит фон (R4) и семья петли.
 * - Смена цвета (тема навигации при прокрутке) тоже сворачивается, но в список фоновых анимаций не идёт.
 */
export function collapseRepeats(events, keep = 2) {
  const scopeOf = (ev) => (ev.step !== undefined ? `s${ev.step}` : ev.phase);
  const motionOf = (ev) => [ev.kind, ev.target?.selector, motionLabel(ev), Math.round(ev.timing?.duration ?? -1)].join('|');
  const keyOf = (ev) => `${scopeOf(ev)}|${motionOf(ev)}`;
  const runOf = (ev) => `${keyOf(ev)}|${directionOf(ev)}`;
  // Загрузка и прокрутка — вместе: тот же ход и там, и там больше `keep` раз — счётчик (цифры дробной
  // части ramp срабатывают по 1–2 раза за фазу). Проявление при входе в окно за нашу прокрутку входит
  // не больше двух раз, а наведение и фокус сюда не идут: там счёт — по кандидату.
  const pageRunOf = (ev) => `${motionOf(ev)}|${directionOf(ev)}`;
  const onPage = (ev) => ev.trigger === 'load' || ev.trigger === 'scroll';
  const runs = new Map();
  const pageRuns = new Map();
  for (const ev of events) {
    runs.set(runOf(ev), (runs.get(runOf(ev)) ?? 0) + 1);
    if (onPage(ev)) pageRuns.set(pageRunOf(ev), (pageRuns.get(pageRunOf(ev)) ?? 0) + 1);
  }
  const repeatsOf = (ev) => Math.max(runs.get(runOf(ev)), onPage(ev) ? pageRuns.get(pageRunOf(ev)) : 0);
  const seen = new Map();
  const dropped = {};
  const bySelector = new Map();
  const kept = [];
  for (const ev of events) {
    const key = keyOf(ev);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= keep) {
      const repeats = repeatsOf(ev);
      kept.push(repeats > keep ? { ...ev, repeats } : ev);
      continue;
    }
    dropped[ev.trigger] = (dropped[ev.trigger] ?? 0) + 1;
    if (isColorOnly({ properties: eventProps(ev) })) continue;
    const sel = ev.target?.selector ?? '?';
    bySelector.set(sel, (bySelector.get(sel) ?? 0) + 1);
  }
  const repeaters = [...bySelector].map(([selector, count]) => ({ selector, count })).sort((a, b) => b.count - a.count);
  return { events: kept, dropped, repeaters };
}

const TMP_KEYS = ['TEMP', 'TMP', 'TMPDIR'];

/**
 * Временные папки браузера (профиль, playwright-artifacts) — в `<root>/.scratch/tmp`, а не в системном
 * tmp на C: (при зависшем закрытии они остаются). Возвращает функцию, что ставит переменные как было.
 */
export function scratchTemp(root) {
  const dir = path.join(root, '.scratch/tmp');
  fs.mkdirSync(dir, { recursive: true });
  const before = Object.fromEntries(TMP_KEYS.map((k) => [k, process.env[k]]));
  for (const k of TMP_KEYS) process.env[k] = dir;
  return () => {
    for (const k of TMP_KEYS) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  };
}

/** Подсказка по-русски, если не хватает пакета playwright или браузера; иначе null. */
export function setupHint(error, root) {
  const msg = String(error?.message ?? error);
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && /['"]playwright['"]/.test(msg)) {
    return 'Нет пакета playwright в design/motion. Поставить (из корня проекта): cd design/motion && npm install';
  }
  if (/Executable doesn't exist/.test(msg)) {
    const browsers = `${String(root).replace(/\\/g, '/')}/.scratch/ms-playwright`;
    return 'Нет браузера Chromium для Playwright. Поставить в проект (из корня проекта, Git Bash): '
      + `cd design/motion && PLAYWRIGHT_BROWSERS_PATH=${browsers} npx playwright install chromium`;
  }
  return null;
}

const firstLine = (e) => String(e?.message ?? e).split('\n')[0].replace(/^\w+\.\w+:\s*/, '').trim();

// Infinity в JSON стал бы null — пишем строкой.
const jsonValue = (_, v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v);

// Без «HeadlessChrome» в user agent: часть сайтов отдаёт безголовому браузеру заглушку.
const userAgent = (browser) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${
  browser.version().split('.')[0]}.0.0.0 Safari/537.36`;

// Обещание с потолком времени: по истечении — отказ; само обещание дальше не ждём.
function within(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('время вышло')), Math.max(0, ms));
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function stop(ctx) {
  if (ctx.stopped) return;
  ctx.stopped = true;
  ctx.skipped.push({ selector: '*', reason: `потолок ${Math.round(ctx.limitMs / 1000)} с` });
}

function overBudget(ctx) {
  if (Date.now() < ctx.deadline) return false;
  stop(ctx);
  return true;
}

// subject — data-motion-capture-id наведённого элемента: его анимации — реакция, а не фон.
const setPhase = (page, phase, trigger, subject = null) =>
  page.evaluate(([p, t, s]) => window.__motionCapture.setPhase(p, t, s), [phase, trigger, subject]);
const status = (page) => page.evaluate(() => window.__motionCapture.status());

async function drainInto(ctx) {
  try {
    const batch = await ctx.page.evaluate(() => window.__motionCapture.drain());
    if (ctx.closed) return;
    batch.sort((a, b) => a.t0 + (a.timing?.delay ?? 0) - (b.t0 + (b.timing?.delay ?? 0)));
    ctx.events.push(...batch);
  } catch (e) {
    // После потолка страница закрывается под шагами фаз — их ошибки уже не новость.
    if (!ctx.stopped && !ctx.closed) ctx.skipped.push({ selector: '*', reason: `события не забраны: ${firstLine(e)}` });
  }
}

const MEDIA_MIN = 120; // px: меньше — иконка, а не сцена
const MEDIA_MAX = 5;

/**
 * Видео и canvas (WebGL, Lottie в режиме canvas, Rive) регистратор не видит: hero ramp.com — это видео.
 * Чтобы пустая фаза не читалась как «тут ничего не движется», заметные видимые видео (играет или
 * autoplay) и canvas попадают в «Пропущено» с размером.
 */
async function collectMedia(ctx) {
  try {
    const found = await ctx.page.evaluate((min) => {
      const out = [];
      for (const el of document.querySelectorAll('video, canvas')) {
        const r = el.getBoundingClientRect();
        if (r.width < min || r.height < min) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        if (el.localName === 'video' && el.paused && !el.autoplay) continue;
        out.push({ selector: window.__motionCapture.selectorOf(el), kind: el.localName, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return out;
    }, MEDIA_MIN);
    for (const m of found) if (!ctx.media.has(m.selector)) ctx.media.set(m.selector, m);
  } catch {
    // заметка не обязательна
  }
}

const mediaNote = (m) => ({
  selector: m.selector,
  reason: m.kind === 'video'
    ? `видео ${m.w}×${m.h} — его движение не снимается, только на кадрах и видео съёмки`
    : `canvas ${m.w}×${m.h} (WebGL, Lottie, Rive) — движение внутри не снимается, только на кадрах и видео съёмки`,
});

async function frame(ctx, phase, ms) {
  const name = `${phase}-${String(Math.round(ms)).padStart(4, '0')}.png`;
  try {
    await ctx.page.screenshot({ path: path.join(ctx.outDir, 'media/frames', name), caret: 'initial', timeout: 10_000 });
    ctx.frames.push(`media/frames/${name}`);
  } catch {
    // кадр не обязателен
  }
}

// Загрузка: кадры по расписанию и ожидание тишины идут параллельно; фаза — до конца обоих.
async function loadPhase(ctx) {
  const { page } = ctx;
  const started = Date.now();
  const pageStart = (await status(page)).now;
  const shots = (async () => {
    if (!ctx.phases.includes('load')) return;
    for (const at of FRAMES_AT) {
      if (overBudget(ctx)) return;
      const wait = started + at - Date.now();
      if (wait > 0) await sleep(wait);
      await frame(ctx, 'load', Date.now() - started);
    }
  })();
  const quiet = (async () => {
    while (Date.now() - started < LOAD_MAX_MS && !overBudget(ctx)) {
      const s = await status(page);
      if (s.now - Math.max(s.lastActivityAt, pageStart) >= QUIET_MS) return;
      await sleep(100);
    }
  })();
  await Promise.all([shots, quiet]);
  await collectMedia(ctx);
}

const scrollState = (page) => page.evaluate(() => {
  const se = document.scrollingElement || document.documentElement;
  const body = document.body || se;
  const y = Math.max(window.scrollY, se.scrollTop, body.scrollTop);
  const height = Math.max(se.scrollHeight, body.scrollHeight);
  return { y, atBottom: y + window.innerHeight >= height - 2 };
});

// Прокрутка колесом: на него реагируют и библиотеки плавной прокрутки (Lenis и т. п.).
async function scrollPhase(ctx) {
  const { page, viewport } = ctx;
  await setPhase(page, 'scroll', 'scroll');
  const started = Date.now();
  const dy = Math.round(viewport.height * 0.8);
  await page.mouse.move(1, Math.round(viewport.height / 2));
  for (let i = 0; i < SCROLL_STEPS && !overBudget(ctx); i++) {
    const before = await scrollState(page);
    if (before.atBottom) break;
    await page.mouse.wheel(0, dy);
    await sleep(700);
    let after = await scrollState(page);
    if (after.y <= before.y + 1) {
      await page.evaluate((d) => window.scrollBy(0, d), dy);
      await sleep(700);
      after = await scrollState(page);
      if (after.y <= before.y + 1) break;
    }
    await frame(ctx, 'scroll', Date.now() - started);
    await collectMedia(ctx); // видео ниже по странице играют, только когда видны
  }
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.body) document.body.scrollTop = 0;
  });
  await sleep(700);
}

// Кандидаты помечаются data-атрибутом: так локатор устойчив, а MutationObserver его не видит.
const markCandidates = (page, kind, max) => page.evaluate(([kind, max]) => {
  const ATTR = 'data-motion-capture-id';
  const INTERACTIVE = 'button, a[href], [role=button]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  let list;
  if (kind === 'hover') {
    list = [...document.querySelectorAll(INTERACTIVE)];
    // Блоки с cursor: pointer — только верхний элемент такой области и не внутри кнопки или ссылки.
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length && i < 4000; i++) {
      const el = all[i];
      if (getComputedStyle(el).cursor !== 'pointer' || el.closest(INTERACTIVE)) continue;
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
      list.push(el);
    }
    list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  } else {
    list = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio])'
      + ':not([type=submit]):not([type=button]):not([type=image]):not([type=file]):not([type=range]), textarea')];
  }
  const area = innerWidth * innerHeight;
  const seen = new Set();
  const out = [];
  for (const el of list) {
    if (out.length >= max) break;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > area * 0.5) continue; // обёртка на весь экран — не элемент интерфейса
    const key = `${el.tagName}|${el.getAttribute('class') || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `${kind}-${out.length + 1}`;
    el.setAttribute(ATTR, id);
    out.push({ id, selector: window.__motionCapture.selectorOf(el) });
  }
  return out;
}, [kind, max]);

const locate = (page, id) => page.locator(`[data-motion-capture-id="${id}"]`);

const SETTLE_MS = 400; // после прыжка к элементу: дать сработать тому, что запускает прокрутка

/**
 * Ставит кандидата в окно сразу, без плавной прокрутки страницы (scroll-behavior: smooth на
 * mercury.com): иначе фокус и наведение начинаются, пока страница ещё едет, реакция стартует вне
 * экрана, а проявления от прокрутки попадают в наведение. Пока едем — подфаза «idle», её события
 * не сохраняются.
 */
async function bringIntoView(page, id) {
  await setPhase(page, 'idle', 'idle');
  const moved = await page.evaluate((cid) => {
    const el = document.querySelector(`[data-motion-capture-id="${cid}"]`);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) return false;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return true;
  }, id);
  if (moved) await sleep(SETTLE_MS);
}

function hoverReason(e) {
  const msg = String(e?.message ?? e);
  if (msg.includes('intercepts pointer events')) return 'перекрыт другим элементом';
  if (msg.includes('not visible')) return 'не виден';
  if (/resolved to 0|waiting for locator/.test(msg) && !msg.includes('resolved to <')) return 'элемент пропал со страницы';
  if (msg.includes('Timeout')) return 'не удалось навести за 2 с';
  return `не удалось навести: ${firstLine(e)}`;
}

async function hoverPhase(ctx) {
  const { page } = ctx;
  await setPhase(page, 'hover', 'hover');
  const candidates = await markCandidates(page, 'hover', HOVER_MAX);
  for (const c of candidates) {
    if (overBudget(ctx)) break;
    await bringIntoView(page, c.id);
    await setPhase(page, 'hover', 'hover', c.id);
    const loc = locate(page, c.id);
    try {
      await loc.hover({ timeout: 2000 });
    } catch (e) {
      // Элемент сам всё время движется — наводим без проверки «стоит на месте», но не сквозь перекрытие.
      if (!String(e?.message).includes('not stable')) {
        ctx.skipped.push({ selector: c.selector, reason: hoverReason(e) });
        await page.mouse.move(0, 0).catch(() => {});
        continue;
      }
      try {
        await loc.hover({ timeout: 2000, force: true });
      } catch (e2) {
        ctx.skipped.push({ selector: c.selector, reason: hoverReason(e2) });
        await page.mouse.move(0, 0).catch(() => {});
        continue;
      }
    }
    await sleep(800);
    await setPhase(page, 'hover-out', 'hover', c.id);
    await page.mouse.move(0, 0);
    await sleep(600);
  }
}

async function focusPhase(ctx) {
  const { page } = ctx;
  await setPhase(page, 'focus', 'focus');
  const candidates = await markCandidates(page, 'focus', FOCUS_MAX);
  for (const c of candidates) {
    if (overBudget(ctx)) break;
    await bringIntoView(page, c.id);
    await setPhase(page, 'focus', 'focus', c.id);
    const loc = locate(page, c.id);
    try {
      await loc.focus({ timeout: 2000 });
    } catch (e) {
      ctx.skipped.push({ selector: c.selector, reason: `не удалось поставить фокус: ${firstLine(e)}` });
      continue;
    }
    await sleep(600);
    await setPhase(page, 'blur', 'focus', c.id);
    await loc.blur({ timeout: 2000 }).catch(() => {});
    await sleep(400);
  }
}

const STEPS = { load: loadPhase, scroll: scrollPhase, hover: hoverPhase, focus: focusPhase };

async function runPhases(ctx) {
  for (const name of PHASES) {
    // Загрузка идёт всегда (страница должна утихнуть), но её события и кадры — только если она выбрана.
    if (name !== 'load' && !ctx.phases.includes(name)) continue;
    if (overBudget(ctx)) break;
    try {
      await STEPS[name](ctx);
    } catch (e) {
      if (!ctx.stopped) ctx.skipped.push({ selector: '*', reason: `фаза «${LABELS[name]}» прервана: ${firstLine(e)}` });
    }
    await drainInto(ctx);
    if (ctx.stopped) break;
  }
}

const CLOSE_MS = 15_000; // закрытие и сохранение видео — не дольше

/**
 * Снимает движение страницы. Папка результата создаётся только после успешного открытия.
 * `limitMs` — общий потолок (для тестов; в CLI не выводится).
 * @returns {Promise<import('./capture/report.mjs').Capture>}
 */
export async function captureMotion({
  url,
  outDir,
  phases = PHASES,
  viewport = { width: 1440, height: 900 },
  root = REPO_ROOT,
  limitMs = LIMIT_MS,
} = {}) {
  if (!url) throw new Error(USAGE);
  const dir = path.resolve(outDir ?? path.join(root, 'design/motion/captures', captureSlug(url)));
  const capturedAt = new Date().toISOString();
  const ctx = {
    outDir: dir, viewport, phases, limitMs, deadline: Date.now() + limitMs, stopped: false, closed: false,
    page: null, events: [], frames: [], skipped: [], extra: null, media: new Map(),
  };

  // Браузеры лежат в проекте; вне Claude переменная окружения не задана.
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.scratch/ms-playwright');
  // До импорта: часть путей Playwright берёт из os.tmpdir() при загрузке модуля, остальные — при запуске.
  const restoreTemp = scratchTemp(root);
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (e) {
    restoreTemp();
    const hint = setupHint(e, root);
    throw hint ? new Error(hint) : e;
  }
  // recordVideo создаёт папку сразу — пишем во временную и переносим только после успешного открытия.
  const videoTmp = path.join(root, '.scratch/capture-video', randomUUID());

  let browser = null;
  let context = null;
  let opened = false;
  let video = null;
  let title = '';
  try {
    try {
      browser = await chromium.launch();
    } catch (e) {
      const hint = setupHint(e, root);
      throw hint ? new Error(hint) : e;
    }
    context = await browser.newContext({
      viewport,
      reducedMotion: 'no-preference',
      userAgent: userAgent(browser),
      recordVideo: { dir: videoTmp, size: viewport },
    });
    await context.addInitScript({ path: RECORDER });
    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    ctx.page = page;

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    } catch (e) {
      throw new Error(`Не удалось открыть ${url}: ${firstLine(e)}`);
    }
    if (response && response.status() >= 400) throw new Error(`Не удалось открыть ${url}: HTTP ${response.status()}`);
    opened = true;
    // Кадры прошлой съёмки в той же папке сбили бы читателя: в capture.json их нет, а на диске лежат рядом.
    fs.rmSync(path.join(dir, 'media/frames'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.mkdirSync(path.join(dir, 'media/frames'), { recursive: true });

    // Потолок жёсткий: page.evaluate без таймаута, и страница с зависшим главным потоком держала бы
    // съёмку вечно. По истечении фазы бросаем, забираем что успели и закрываем браузер.
    const finished = await within(runPhases(ctx), ctx.deadline - Date.now()).then(() => true, () => false);
    let responsive = true;
    if (!finished) {
      stop(ctx);
      responsive = await within(drainInto(ctx), 3000).then(() => true, () => false);
    }
    if (responsive) {
      ctx.extra = await within(status(page), 3000).catch(() => null);
      title = await within(page.title(), 3000).catch(() => '');
    }
  } finally {
    ctx.closed = true;
    // Уборка не должна подменять результат: ни ошибку открытия, ни снятое (EBUSY на Windows и т. п.).
    let pageVideo = null;
    try {
      pageVideo = ctx.page?.video() ?? null;
    } catch {
      pageVideo = null;
    }
    if (context) await within(context.close(), CLOSE_MS).catch(() => {});
    if (opened && pageVideo) {
      try {
        await within(pageVideo.saveAs(path.join(dir, 'media/video.webm')), CLOSE_MS);
        video = 'media/video.webm';
      } catch {
        // без видео запись всё равно полезна
      }
    }
    if (browser) await within(browser.close(), CLOSE_MS).catch(() => {});
    try {
      fs.rmSync(videoTmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // временная папка в .scratch — останется, не страшно
    }
    restoreTemp();
  }

  const collapsed = collapseRepeats(ctx.events.filter((e) => phases.includes(e.trigger)));
  const { records, omitted, jumps, background, returned } = normalizeEvents(collapsed.events);
  // Фон в наведении и фокусе (то же движение уже было при загрузке или прокрутке) — тоже повтор.
  const repeats = new Map(collapsed.repeaters.map((r) => [r.selector, r.count]));
  const backgroundDropped = {};
  for (const b of background) {
    repeats.set(b.selector, (repeats.get(b.selector) ?? 0) + 1);
    backgroundDropped[b.trigger] = (backgroundDropped[b.trigger] ?? 0) + 1;
  }
  for (const extra of [ctx.extra?.dropped ?? {}, collapsed.dropped, backgroundDropped]) {
    for (const [t, n] of Object.entries(extra)) if (phases.includes(t)) omitted[t] = (omitted[t] ?? 0) + n;
  }
  const repeaters = [...repeats].map(([selector, count]) => ({ selector, count })).sort((a, b) => b.count - a.count);
  const byPhase = (counts) => PHASES.filter((t) => counts[t]).map((t) => `${LABELS[t]} ${counts[t]}`).join(', ');
  const lost = PHASES.filter((t) => phases.includes(t)).reduce((n, t) => n + (ctx.extra?.lost?.[t] ?? 0), 0);
  const skipped = [
    ...[...ctx.media.values()].slice(0, MEDIA_MAX).map(mediaNote),
    ...ctx.skipped,
    ...(ctx.extra?.notes ?? []),
    ...(byPhase(jumps) ? [{
      selector: '*', reason: 'скачки без анимации (замер: меньше 4 значений или короче 50 мс; CSS и WAAPI длительностью 0 мс) '
        + `не показаны: ${byPhase(jumps)}`,
    }] : []),
    ...(byPhase(returned) ? [{
      selector: '*', reason: `движение по замеру, что вернулось к началу (туда и обратно в одном замере), не показано: ${byPhase(returned)}`,
    }] : []),
    ...(lost ? [{ selector: '*', reason: `короткие переходы, которые закончились до замера: ${lost}` }] : []),
    ...repeaters.slice(0, 5).map((r) => ({
      selector: r.selector, reason: `фоновая анимация: ещё ${r.count} одинаковых повторов не показано`,
    })),
  ];
  const capture = { url, title, capturedAt, viewport, records, omitted, skipped, frames: ctx.frames, video };
  fs.writeFileSync(path.join(dir, 'capture.json'), `${JSON.stringify(capture, jsonValue, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'record.md'), renderRecord(capture));
  return capture;
}

function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { out: { type: 'string' }, phases: { type: 'string' }, viewport: { type: 'string' } },
    });
  } catch {
    throw new Error(USAGE);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(USAGE);
  let url = positionals[0];
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `https://${url}`;
  const opts = { url };
  if (values.out) opts.outDir = path.resolve(values.out);
  if (values.phases) {
    const list = values.phases.split(',').map((p) => p.trim()).filter(Boolean);
    const bad = list.filter((p) => !PHASES.includes(p));
    if (bad.length || !list.length) throw new Error(`Неизвестные фазы: ${bad.join(', ') || '—'}. ${USAGE}`);
    opts.phases = list;
  }
  if (values.viewport) {
    const m = /^(\d+)x(\d+)$/.exec(values.viewport);
    if (!m) throw new Error(`Окно задаётся как 1440x900. ${USAGE}`);
    opts.viewport = { width: Number(m[1]), height: Number(m[2]) };
  }
  return opts;
}

async function main(argv) {
  const opts = parseCli(argv);
  const outDir = opts.outDir ?? path.join(REPO_ROOT, 'design/motion/captures', captureSlug(opts.url));
  const cap = await captureMotion({ ...opts, outDir });
  const count = (t) => cap.records.filter((r) => r.trigger === t).length;
  console.log(`Снято записей: ${cap.records.length} (загрузка ${count('load')}, прокрутка ${count('scroll')}, `
    + `наведение ${count('hover')}, фокус ${count('focus')}) → ${path.join(outDir, 'record.md')}`);
}

runCli(import.meta.url, main);
