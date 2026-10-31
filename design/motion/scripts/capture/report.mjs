// Отчёт record.md о снятом движении. Чистая функция: без ввода-вывода.
// Отчёт читает агент целиком, поэтому он короткий: до 25 строк на фазу (самые заметные), одинаковые
// записи свёрнуты в строку «× N», смена цвета — одной строкой под таблицей; всё остальное — в capture.json.
import { carryForward, decomposeMotion, detectStagger, draftTokens, isColorOnly, originShift, staggerKey } from './analyze.mjs';

/**
 * @typedef {{ url: string, title: string, capturedAt: string, viewport: { width: number, height: number },
 *   records: object[], omitted: Record<string, number>, skipped: { selector: string, reason: string }[],
 *   frames: string[], video: string | null }} Capture
 */

const TRIGGERS = [
  ['load', 'Загрузка'],
  ['scroll', 'Прокрутка'],
  ['hover', 'Наведение'],
  ['focus', 'Фокус'],
];
const SUBPHASE = { 'hover-out': '(уход курсора)', blur: '(потеря фокуса)' };
const ENTRY_PHASE = { 'hover-out': 'hover', blur: 'focus' };
const BASIS = { 'css-transition': 'точно (CSS)', 'css-animation': 'точно (CSS)', waapi: 'точно (WAAPI)' };
const ROLE = {
  button: 'кнопка', link: 'ссылка', card: 'карточка', heading: 'заголовок', text: 'текст', input: 'поле', image: 'картинка', other: 'блок',
};
const SIZE_PROPS = new Set(['width', 'height', 'max-height', 'min-height', 'max-width', 'min-width', 'inline-size', 'block-size']);

const MAX_ROWS = 25; // строк таблицы на фазу
const MAX_CASCADES = 8; // строк о каскадах под таблицей
const SELECTOR_MAX = 60;
const TEXT_MAX = 30;
const VALUE_MAX = 48;
const RAW_EASING_MAX = 40;

const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
const clip = (s, n = 40) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const noNegZero = (n) => (n === 0 ? 0 : n);
const num = (n) => String(noNegZero(Math.round(n * 100) / 100));
const int = (n) => String(noNegZero(Math.round(n)));

function plural(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function dateOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso ?? '');
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || String(url); // у file:// хоста нет
  } catch {
    return String(url);
  }
}

// --- Значения: целые px, остальные числа — до 2 знаков (opacity 0.685147 → 0.69, 551.63px → 552px) ---

const NUMBER = /(?<![#\w.])-?(?:\d+\.\d+|\.\d+|\d+)(?:e[+-]?\d+)?(?:px)?/gi;

function tidy(value) {
  return String(value).replace(NUMBER, (m) => {
    const isPx = /px$/i.test(m);
    const n = Number(isPx ? m.slice(0, -2) : m);
    if (!Number.isFinite(n)) return m;
    if (isPx) return `${int(n)}px`;
    return /[.e]/i.test(m) ? num(n) : m;
  });
}

// Путь значений: подряд одинаковые схлопываются, больше 4 — первые три, «…» и последнее.
function seq(values) {
  const vs = values.filter((v, i) => i === 0 || v !== values[i - 1]);
  const list = vs.length > 4 ? [...vs.slice(0, 3), '…', vs[vs.length - 1]] : vs;
  return list.join(' → ');
}

// --- Элемент: роль и текст или размер, короткий селектор ---

const GENERATED_ID = /^(radix-|headlessui-|react-aria|mui-|:r|«r)/i;

// id, сгенерированный библиотекой: префикс radix- и т. п. или кусок вида d56olubt6lb / IghMFFuxRSapjiFTCbCZGg.
function generatedId(id) {
  if (GENERATED_ID.test(id)) return true;
  return id.split(/[-_:]+/).some((seg) => {
    const digits = (seg.match(/\d/g) ?? []).length;
    const letters = (seg.match(/[a-z]/gi) ?? []).length;
    const upper = (seg.match(/[A-Z]/g) ?? []).length;
    return (seg.length >= 6 && digits >= 2 && letters >= 2) || (seg.length >= 10 && upper >= 3 && upper < seg.length);
  });
}

const idOf = (part) => /^#([^\s.:#[>]+)/.exec(part)?.[1] ?? null;

// tag.class1.class2:nth-of-type(n) → tag.class1:nth-of-type(n)
function simplify(part) {
  const m = /^([\w-]*)((?:\.[\w-]+)*)((?::nth-of-type\(\d+\))?)$/.exec(part);
  if (!m) return part;
  const first = m[2].split('.').filter(Boolean)[0];
  return `${m[1]}${first ? `.${first}` : ''}${m[3]}`;
}

/** Селектор для чтения: последние 2 уровня, без сгенерированных id, не длиннее ~60 знаков. */
export function shortSelector(selector) {
  const s = String(selector ?? '');
  const pseudo = /::[\w-]+$/.exec(s)?.[0] ?? '';
  const parts = s.slice(0, s.length - pseudo.length).split(' > ').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return s;
  const tail = parts.slice(-2);
  let kept = tail.filter((p) => !(idOf(p) && generatedId(idOf(p))));
  if (!kept.length) {
    const id = idOf(tail[tail.length - 1]);
    kept = [`#${id.split(/[-_:]+/)[0] || 'id'}…`];
  }
  const cut = parts.length > kept.length;
  const room = SELECTOR_MAX - pseudo.length - (cut ? 4 : 0);
  let body = kept.join(' > ');
  if (body.length > room) body = kept.map(simplify).join(' > ');
  if (body.length > room) body = simplify(kept[kept.length - 1]);
  if (body.length > room) body = clip(body, room);
  return `${cut ? '… > ' : ''}${body}${pseudo}`;
}

// «кнопка «Купить»» или «блок 560×420» — чтобы элемент нашёлся на кадрах.
function describe(t) {
  const role = ROLE[t.role] ?? t.role;
  const text = clip(t.text, TEXT_MAX);
  if (text) return `${role} «${text}»`;
  return t.box?.w || t.box?.h ? `${role} ${int(t.box.w)}×${int(t.box.h)}` : role;
}

const elementText = (t) => `${describe(t)} \`${shortSelector(t.selector)}\``;

// --- Что и как движется ---

const propName = (p) => (p.startsWith('--') ? `CSS-переменная ${p}` : p);
const propsText = (r) => (r.properties.length ? r.properties.map(propName).join(', ') : 'неизвестно (нет в ключевых кадрах)');

function valuesOf(r, p) {
  if (r.path?.length >= 3) {
    const vs = r.path.map((k) => k?.[p]).filter((v) => v !== undefined);
    if (vs.length >= 3) return vs;
  }
  return [r.from?.[p] ?? '—', r.to?.[p] ?? '—'];
}

function fromTo(r) {
  const text = r.properties
    .map((p) => `${propName(p)}: ${seq(valuesOf(r, p).map((v) => clip(tidy(v), VALUE_MAX)))}`)
    .join('; ');
  return text || '—';
}

const rawCurve = (r) => (Array.isArray(r.easing)
  ? `cubic-bezier(${r.easing.map(num).join(', ')})`
  : clip(String(r.easing), RAW_EASING_MAX));

// Коротко — для приёмов, каскадов и цвета: имя, у своей кривой — ещё и числа.
function curveName(r) {
  if (r.scrollLinked) return '—';
  if (r.easing === 'spring') return 'пружина';
  if (!Array.isArray(r.easing)) return rawCurve(r);
  if (!r.easingName) return rawCurve(r);
  return r.easingName === 'своя' ? `своя ${rawCurve(r)}` : r.easingName;
}

function curveText(r) {
  if (r.scrollLinked) return '—';
  if (r.easing === 'spring' && r.spring) {
    const s = r.spring;
    return `пружина stiffness ${s.stiffness}, damping ${s.damping}, перелёт ${s.overshootPct}%`;
  }
  if (Array.isArray(r.easing)) return `${r.easingName ? `${r.easingName} ` : ''}${rawCurve(r)}`;
  return rawCurve(r);
}

const DIRECTION = { alternate: 'туда-обратно', 'alternate-reverse': 'туда-обратно', reverse: 'обратный ход' };

// Привязка к прокрутке: что изменилось за сколько px прокрутки («864 px за 2880 px прокрутки»).
const scrollText = (r) => `привязано к прокрутке: ${whatText(r).replace(/^сдвиг на /, '')} за ${int(r.scrollPx ?? 0)} px прокрутки`;

function durationText(r) {
  if (r.scrollLinked) return scrollText(r);
  const parts = [`${r.durationMs} мс`];
  if (r.iterations === Infinity) parts.push('бесконечно');
  else if (r.iterations > 1) parts.push(`×${r.iterations}`);
  if (DIRECTION[r.direction]) parts.push(DIRECTION[r.direction]);
  return parts.join(', ');
}

const basisText = (r) => (r.basis === 'sampled' ? 'замер' : BASIS[r.kind] ?? 'точно (CSS)');

const blurOf = (side) => Math.max(0, ...[...String(side?.filter ?? '').matchAll(/blur\(\s*(-?[\d.]+)px/g)].map((m) => Number(m[1])));
const opacityOf = (side) => (side?.opacity === undefined ? 1 : Number(side.opacity));

// Что изменилось: сдвиг, масштаб, поворот, размытие, прозрачность, маска, размер. По всем ключевым
// кадрам, если их больше двух: у пульсации 1 → 0.5 → 1 начало и конец совпадают.
function effects(r) {
  // Пропуск свойства в среднем кадре — значение предыдущего кадра, а не 0 или 1.
  const sides = r.path?.length >= 2 ? carryForward(r.path) : [r.from, r.to];
  const m = sides.map((s) => decomposeMotion(s, r.target.box));
  const first = m[0];
  const scales = m.map((x) => x.scale);
  const blurs = sides.map(blurOf);
  const ops = sides.map(opacityOf);
  const opRange = Math.max(...ops) - Math.min(...ops);
  return {
    // Масштаб от 0 в замере (Lottie в SVG): сдвиг матрицы — компенсация точки масштаба, не перемещение.
    shift: originShift(r, scales) ? 0 : Math.max(...m.map((x) => Math.abs(x.tx - first.tx) + Math.abs(x.ty - first.ty))),
    scales,
    scaleRange: Math.max(...scales) - Math.min(...scales),
    rotate: Math.max(...m.map((x) => Math.abs(x.rotate - first.rotate))),
    blur: Math.max(...blurs) - Math.min(...blurs),
    opacity: opRange > 0.001,
    opacityBack: opRange > 0.001 && Math.abs(ops[ops.length - 1] - ops[0]) < 0.001,
    opacityIn: ops[ops.length - 1] >= ops[0],
    clip: r.properties.includes('clip-path') && new Set(sides.map((s) => s?.['clip-path'] ?? '')).size > 1,
    size: r.properties.filter((p) => SIZE_PROPS.has(p)),
  };
}

function score(r) {
  const e = effects(r);
  const area = (r.target.box?.w ?? 0) * (r.target.box?.h ?? 0);
  const move = e.shift + e.scaleRange * 100 + e.rotate + e.blur + (e.opacity ? 50 : 0) + (e.clip ? 50 : 0)
    + (e.size.length ? 25 : 0);
  // У привязки к прокрутке длительности нет — весит как секундное движение.
  return area * move * (r.scrollLinked ? 1000 : Math.min(r.durationMs, 1200)) / 1000;
}

function whatText(r) {
  const e = effects(r);
  const parts = [];
  if (e.shift >= 0.5) parts.push(`сдвиг на ${int(e.shift)} px`);
  if (e.scaleRange > 0.001) parts.push(`масштаб ${seq(e.scales.map(num))}`);
  if (e.rotate >= 0.5) parts.push(`поворот на ${int(e.rotate)}°`);
  if (e.blur >= 0.5) parts.push(`размытие ${int(e.blur)} px`);
  if (e.opacity) parts.push(e.opacityBack ? 'пульсация прозрачности' : e.opacityIn ? 'проявление' : 'затухание');
  if (e.clip) parts.push('маска clip-path');
  if (e.size.length) parts.push(`размер (${e.size.join(', ')})`);
  return parts.length ? parts.join(', ') : propsText(r);
}

const phaseText = (r) => {
  const trig = Object.fromEntries(TRIGGERS);
  return `${trig[r.trigger] ?? r.trigger}${SUBPHASE[r.phase] ? ` ${SUBPHASE[r.phase]}` : ''}`;
};

// Движение, что идёт в таблицу и приёмы: не смена цвета и не фоновая петля.
const isMotion = (r) => !isColorOnly(r) && !r.loop;
// Каскады — только у движения по времени: у привязки к прокрутке нет ни длительности, ни старта.
const timed = (list) => list.filter((r) => !r.scrollLinked);
// Привязки к прокрутке с одинаковыми свойствами, но разным ходом (параллакс и scrub) — разные приёмы.
const groupKey = (r) => (r.scrollLinked ? `${staggerKey(r)}|${scrollText(r)}` : staggerKey(r));

function signature(records) {
  // Одинаковые по ключу каскада записи сливаются в одну строку: берём самую заметную, считаем элементы.
  const motion = records.filter(isMotion);
  const groups = new Map();
  for (const r of motion) {
    const key = groupKey(r);
    const g = groups.get(key) ?? { r, s: 0, sels: new Set() };
    const sc = score(r);
    if (sc > g.s) { g.s = sc; g.r = r; }
    g.sels.add(r.target.selector);
    g.n = g.sels.size;
    groups.set(key, g);
  }
  const cascades = new Map(detectStagger(timed(motion)).map((c) => [c.groupKey, c]));
  const ranked = [...groups].map(([key, g]) => ({ ...g, key })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  // Уход курсора или потеря фокуса — обратный ход того же приёма: если есть вход (тот же элемент, те же
  // свойства), в приёмах только вход, а место уходит следующему приёму.
  const propsKey = (r) => [...r.properties].sort().join('+');
  const entryOf = (g) => {
    const phase = ENTRY_PHASE[g.r.phase];
    return phase ? ranked.find((e) => e.r.phase === phase && propsKey(e.r) === propsKey(g.r)
      && [...g.sels].some((s) => e.sels.has(s))) ?? null : null;
  };
  // Один элемент в одной фазе — одна строка: проявление mercury — это две CSS-анимации (прозрачность и
  // сдвиг) на тех же 11 элементах, меню ramp — clip-path и прозрачность одного блока.
  const lines = [];
  const used = new Set();
  for (const g0 of ranked) {
    const g = entryOf(g0) ?? g0;
    if (used.has(g)) continue;
    used.add(g);
    const line = lines.find((l) => l.phase === g.r.phase && [...g.sels].some((s) => l.sels.has(s)));
    if (line) {
      // Те же свойства с другой длительностью (прерванный переход) — вариант уже показанного приёма.
      if (line.parts.length < MAX_PARTS && !line.parts.some((p) => propsKey(p.r) === propsKey(g.r))) {
        line.parts.push(g);
        for (const s of g.sels) line.sels.add(s);
      }
    } else if (lines.length < 5) {
      lines.push({ phase: g.r.phase, sels: new Set(g.sels), parts: [g] });
    }
  }
  if (!lines.length) return 'Нет заметных приёмов';
  return lines.map((line) => signatureLine(line, cascades)).join('\n');
}

const MAX_PARTS = 3; // приёмов одного элемента в строке
// Порядок частей строки: сначала движение в пространстве, затем размытие, затем прозрачность.
const partRank = (r) => (r.properties.some((p) => /^(transform|translate|scale|rotate|clip-path)$/.test(p)) ? 0
  : r.properties.includes('filter') ? 1 : 2);

function signatureLine({ parts, sels }, cascades) {
  const lead = parts[0];
  const r = lead.r;
  const n = sels.size;
  const casc = cascades.get(lead.key);
  const tail = n > 1 ? ` × ${n} ${plural(n, ['элемент', 'элемента', 'элементов'])}${casc ? `, каскад ${casc.stepMs} мс` : ''}` : '';
  const ordered = [...parts].sort((a, b) => partRank(a.r) - partRank(b.r));
  const minDelay = Math.min(...ordered.map((p) => p.r.delayMs ?? 0));
  // Что изменилось, в строке уже сказано: у привязки к прокрутке — только за сколько px прокрутки.
  const timingOf = (p) => (p.r.scrollLinked ? `привязано к прокрутке, за ${int(p.r.scrollPx ?? 0)} px прокрутки`
    : `${durationText(p.r)}, ${curveName(p.r)}`
    + `${(p.r.delayMs ?? 0) > minDelay ? `, позже на ${(p.r.delayMs ?? 0) - minDelay} мс` : ''}`);
  const timings = ordered.map(timingOf);
  const whats = ordered.map((p) => whatText(p.r));
  const timing = new Set(timings).size === 1 ? timings[0] : ordered.map((_, i) => `${whats[i]} — ${timings[i]}`).join('; ');
  return `- ${describe(r.target)}: ${whats.join(' и ')} (${phaseText(r)}), ${timing} — \`${shortSelector(r.target.selector)}\`${tail}`;
}

// Строки таблицы: одинаковое движение разных элементов (каскад, ряд карточек) — одна строка «× N».
function tableRows(rs) {
  const groups = new Map();
  for (const r of rs) {
    const key = `${staggerKey(r)}|${r.iterations}|${r.direction ?? ''}|${r.scrollPx ?? ''}|${fromTo(r)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ r, s: score(r) });
  }
  return [...groups.values()]
    .map((members) => {
      const rep = members.reduce((a, b) => (b.s > a.s || (b.s === a.s && b.r.startMs < a.r.startMs) ? b : a));
      return { rep: rep.r, s: rep.s, members: members.map((m) => m.r) };
    })
    .sort((a, b) => b.s - a.s || a.rep.startMs - b.rep.startMs);
}

function rowText({ rep, members }) {
  // «× N» — разные элементы; один и тот же элемент несколько раз — «N раза».
  const n = new Set(members.map((m) => m.target.selector)).size;
  const casc = members.length >= 3 && !rep.scrollLinked ? detectStagger(members)[0] : null;
  const times = members.length;
  let many = '';
  if (n > 1) many = ` × ${n}${casc ? `, каскад ${casc.stepMs} мс` : ''}`;
  else if (times > 1) many = ` ${times} ${plural(times, ['раз', 'раза', 'раз'])}`;
  const delays = members.map((m) => m.delayMs);
  const lo = Math.min(...delays);
  const hi = Math.max(...delays);
  const delay = rep.scrollLinked ? '—' : lo === hi ? `${lo} мс` : `${lo}–${hi} мс`;
  const mark = SUBPHASE[rep.phase] ? ` ${SUBPHASE[rep.phase]}` : '';
  return `| ${[`${elementText(rep.target)}${many}`, `${propsText(rep)}${mark}`, fromTo(rep), durationText(rep),
    curveText(rep), delay, basisText(rep)].map(cell).join(' | ')} |`;
}

// Смена цвета фазы одной строкой: сколько элементов, самые частые длительность и кривая.
function colorLine(colors) {
  const elements = new Set(colors.map((r) => r.target.selector)).size;
  const props = [...new Set(colors.flatMap((r) => r.properties))];
  const combos = new Map();
  for (const r of colors) {
    const key = `${r.durationMs} мс, ${curveText(r)}`;
    combos.set(key, (combos.get(key) ?? 0) + 1);
  }
  const [top, ...rest] = [...combos].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const what = `${props.slice(0, 4).join(', ')}${props.length > 4 ? ', …' : ''}`;
  const others = rest.length ? `; реже — ${rest.slice(0, 2).join('; ')}` : '';
  return cell(`- Смена цвета (${what}): ${elements} ${plural(elements, ['элемент', 'элемента', 'элементов'])}, ${top}${others}`);
}

// Фоновые петли фазы (счётчики, тикеры, бегущие строки) одной строкой: что, сколько элементов, как.
function loopLine(loops) {
  const groups = new Map();
  for (const r of loops) {
    const key = `${[...r.properties].sort().join('+')}|${r.durationMs}|${curveName(r)}`;
    if (!groups.has(key)) groups.set(key, { r, s: score(r), sels: new Set(), repeats: 0 });
    const g = groups.get(key);
    g.sels.add(r.target.selector);
    g.repeats = Math.max(g.repeats, r.repeats ?? 0);
    if (score(r) > g.s) { g.r = r; g.s = score(r); }
  }
  const list = [...groups.values()].sort((a, b) => b.sels.size - a.sels.size || b.s - a.s);
  const items = list.slice(0, 3).map((g) => {
    const n = g.sels.size;
    const what = whatText(g.r);
    return `${propsText(g.r)}: ${n} ${plural(n, ['элемент', 'элемента', 'элементов'])}, ${g.r.durationMs} мс, ${curveName(g.r)}`
      + `${what !== propsText(g.r) ? `, ${what}` : ''}${g.r.basis === 'sampled' ? ', идёт без конца (замер)' : ''}`
      + `${g.repeats ? `, повторов до ${g.repeats}` : ''}`;
  });
  const more = list.length > 3 ? `; ещё ${list.length - 3} ${plural(list.length - 3, ['вид', 'вида', 'видов'])}` : '';
  return cell(`- Фоновые петли (повторяются сами, не реакция; в токены не входят): ${items.join('; ')}${more}`);
}

function phaseSection(trigger, label, all, omitted) {
  const rs = all.filter((r) => r.trigger === trigger);
  const out = [`### ${label}`, ''];
  if (!rs.length) out.push('Нет записей.');
  else {
    const motion = rs.filter(isMotion);
    const colors = rs.filter(isColorOnly);
    const loops = rs.filter((r) => r.loop && !isColorOnly(r));
    const rows = tableRows(motion);
    if (rows.length) {
      out.push('| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |');
      out.push('|---|---|---|---|---|---|---|');
      for (const row of rows.slice(0, MAX_ROWS)) out.push(rowText(row));
    }
    const notes = [];
    if (loops.length) notes.push(loopLine(loops));
    if (colors.length) notes.push(colorLine(colors));
    for (const c of detectStagger(timed(motion)).slice(0, MAX_CASCADES)) {
      const sample = motion.find((r) => staggerKey(r) === c.groupKey);
      const what = sample ? `${propsText(sample)}, ${sample.durationMs} мс, ${curveName(sample)}` : c.groupKey;
      notes.push(`- каскад ${c.stepMs} мс × ${c.count}: ${cell(what)}`);
    }
    if (rows.length > MAX_ROWS) {
      const hidden = rows.slice(MAX_ROWS);
      const n = hidden.length;
      const recs = hidden.reduce((sum, row) => sum + row.members.length, 0);
      notes.push(`- ещё ${n} ${plural(n, ['строка', 'строки', 'строк'])} (${recs} ${plural(recs, ['запись', 'записи', 'записей'])}) — в capture.json`);
    }
    if (notes.length) out.push(...(rows.length ? [''] : []), ...notes);
  }
  if ((omitted?.[trigger] ?? 0) > 0) {
    out.push('', `ещё ${omitted[trigger]} не показано (не сохранено: потолок записей на фазу и фоновые повторы)`);
  }
  return out.join('\n');
}

const LIMITS = 'Не снимаются: canvas и WebGL (в том числе Lottie в режиме canvas), видео, морфинг SVG-путей '
  + '(атрибут `d`) и анимации, где JS меняет CSS-переменную на предке, а движется потомок. Такие эффекты видны '
  + 'только на кадрах и видео — повторять по ним «на глаз» с пометкой «основа: видео». Движение, привязанное '
  + 'к прокрутке (параллакс, scrub), записано без длительности и кривой — «привязано к прокрутке: N px за M px '
  + 'прокрутки»; анимации на scroll-timeline — только на видео. Движение по клику (вкладки, аккордеоны, '
  + 'модальные окна) не снимается: съёмка не кликает.';

// Кривые (массивы чисел) — в одну строку, остальное с отступами; JSON остаётся валидным.
const tokensJson = (t) => JSON.stringify(t, null, 2)
  .replace(/\[\n\s+([^[\]{}"]*?)\n\s+\]/g, (_, body) => `[${body.split(/,\n\s+/).join(', ')}]`);

/** Рендерит снятое движение в Markdown. */
export function renderRecord(capture) {
  const { url, title, capturedAt, viewport, omitted, skipped, frames, video } = capture;
  // Одна неполная запись не должна ронять весь отчёт.
  const records = capture.records.map((r) => ({
    ...r,
    properties: r.properties ?? [],
    from: r.from ?? {},
    to: r.to ?? {},
    target: { selector: '?', role: 'other', text: '', box: { x: 0, y: 0, w: 0, h: 0 }, ...r.target },
  }));
  const domain = domainOf(url);
  const lines = [
    `# Движение: ${String(title ?? '').trim() || domain}`,
    '',
    `${url} · снято ${dateOf(capturedAt)} · окно ${viewport.width}×${viewport.height}`,
    '',
    '## Сигнатурные приёмы',
    '',
    signature(records),
    '',
    '## По фазам',
    '',
    TRIGGERS.map(([t, label]) => phaseSection(t, label, records, omitted)).join('\n\n'),
    '',
    '## Черновик токенов',
    '',
    '```json',
    tokensJson(draftTokens(records)),
    '```',
    '',
    '## Пропущено',
    '',
    skipped.length ? skipped.map((s) => `- \`${s.selector === '*' ? '*' : shortSelector(s.selector)}\` — ${s.reason}`).join('\n') : 'Нет',
    '',
    '## Кадры и видео',
    '',
    frames.length ? frames.map((f) => `- ${f}`).join('\n') : 'Кадров нет',
    '',
    video ? `Видео: ${video}` : 'Видео нет',
    '',
    '## Ограничения',
    '',
    LIMITS,
    '',
    '## Лицензия',
    '',
    `Движение снято с ${domain} как образец. Код, тексты и картинки сайта не копируются; в паспорт стиля — «своя реализация (образец: ${domain})».`,
    '',
  ];
  return lines.join('\n');
}
