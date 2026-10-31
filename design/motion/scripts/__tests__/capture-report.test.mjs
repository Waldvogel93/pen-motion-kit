import { describe, expect, test } from 'vitest';
import { renderRecord } from '../capture/report.mjs';
import { validateTokens } from '../lint-style.mjs';

const target = (selector, over = {}) => ({
  selector, tag: 'div', role: 'card', text: 'Карточка', box: { x: 0, y: 0, w: 200, h: 100 }, ...over,
});

function rec(over) {
  return {
    id: 'r', phase: 'load', trigger: 'load', kind: 'css-animation', basis: 'exact', target: target('.card'),
    properties: ['opacity', 'transform'], from: { opacity: '0', transform: 'translateY(24px)' },
    to: { opacity: '1', transform: 'none' }, durationMs: 600, delayMs: 0, startMs: 0,
    easing: [0.23, 1, 0.32, 1], easingName: 'ease-out strong', iterations: 1, spring: null, ...over,
  };
}

function fixture() {
  const cascade = [0, 1, 2, 3].map((i) =>
    rec({ id: `load-${i + 1}`, target: target(`.card-${i}`), startMs: i * 80, delayMs: i * 80 }));
  return {
    url: 'https://www.example.com/page',
    title: 'Пример',
    capturedAt: '2026-10-31T12:00:00.000Z',
    viewport: { width: 1440, height: 900 },
    records: [
      ...cascade,
      rec({
        id: 'hover-1', phase: 'hover', trigger: 'hover', kind: 'js-sampled', basis: 'sampled',
        target: target('button.cta', { role: 'button', text: 'Купить' }),
        properties: ['transform'], from: { transform: 'matrix(1, 0, 0, 1, 0, 0)' },
        to: { transform: 'matrix(1.05, 0, 0, 1.05, 0, 0)' }, durationMs: 400, easing: 'spring', easingName: 'пружина',
        spring: { stiffness: 300, damping: 20, mass: 1, overshootPct: 11, settleMs: 400 },
      }),
      rec({
        id: 'scroll-1', phase: 'scroll', trigger: 'scroll', target: target('.hero'),
        properties: ['opacity'], from: { opacity: '0' }, to: { opacity: '1' },
        durationMs: 500, iterations: Infinity, kind: 'css-transition',
      }),
    ],
    omitted: { load: 12 },
    skipped: [{ selector: 'canvas#bg', reason: 'canvas не снимается' }],
    frames: ['frames/load-0.png', 'frames/load-1.png'],
    video: null,
  };
}

describe('renderRecord', () => {
  const md = renderRecord(fixture());

  test('заголовки по порядку', () => {
    const heads = ['# Движение: Пример', '## Сигнатурные приёмы', '## По фазам', '## Черновик токенов',
      '## Пропущено', '## Кадры и видео', '## Ограничения', '## Лицензия'];
    let at = -1;
    for (const h of heads) {
      const i = md.indexOf(h);
      expect(i, h).toBeGreaterThan(at);
      at = i;
    }
    expect(md).toContain('https://www.example.com/page · снято 31.10.2026 · окно 1440×900');
  });

  test('таблицы с колонками и все фазы', () => {
    expect(md).toContain('| Элемент | Что движется | Откуда → куда | Длительность | Кривая / пружина | Задержка | Основа |');
    for (const p of ['Загрузка', 'Прокрутка', 'Наведение', 'Фокус']) expect(md).toContain(`### ${p}`);
    expect(md).toContain('Нет записей.');
    expect(md).toContain('точно (CSS)');
    expect(md).toContain('замер');
  });

  test('каскад, omitted, пружина, бесконечная анимация', () => {
    expect(md).toContain('каскад 80 мс × 4');
    expect(md).toContain('ещё 12 не показано');
    expect(md).toContain('stiffness 300, damping 20, перелёт 11%');
    expect(md).toContain('бесконечно');
  });

  test('черновик токенов валиден', () => {
    const m = /## Черновик токенов\s+```json\n([\s\S]*?)\n```/.exec(md);
    expect(m).not.toBeNull();
    expect(validateTokens(JSON.parse(m[1]))).toEqual([]);
  });

  test('лицензия с доменом, пропущено, видео', () => {
    expect(md).toContain('Движение снято с example.com как образец.');
    expect(md).toContain('своя реализация (образец: example.com)');
    expect(md).toContain('canvas#bg');
    expect(md).toContain('Видео нет');
    expect(md).toContain('frames/load-0.png');
  });

  test('сигнатурные приёмы: не более 5, самые заметные первыми', () => {
    const sec = md.split('## Сигнатурные приёмы')[1].split('## По фазам')[0];
    const lines = sec.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.length).toBeGreaterThan(0);
  });

  test('экранирование | и переносов, подфаза, пустые приёмы', () => {
    const c = fixture();
    // Не цвет: смена цвета сворачивается в одну строку под таблицей (M1), а здесь проверяется ячейка.
    c.records = [rec({
      phase: 'hover-out', trigger: 'hover', target: target('.a', { text: 'a|b\nc ' + 'x'.repeat(60) }),
      properties: ['visibility'], from: { visibility: 'visible' }, to: { visibility: 'hidden' },
    })];
    c.omitted = {};
    const out = renderRecord(c);
    expect(out).toContain('a\\|b c');
    expect(out).toContain('…');
    expect(out).toContain('(уход курсора)');
    expect(out).toContain('Нет заметных приёмов');
    expect(out).not.toContain('ещё');
  });

  test('приёмы без повторов: каскад сливается, порядок по заметности', () => {
    const sec = md.split('## Сигнатурные приёмы')[1].split('## По фазам')[0];
    const lines = sec.split('\n').filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('× 4');
    expect(lines[0]).toContain('каскад 80 мс');
    expect(lines[1]).toContain('Прокрутка');
    expect(lines[2]).toContain('Наведение');
  });

  test('адрес без хоста (file://): в лицензии сам адрес, а не пустота', () => {
    const c = fixture();
    c.url = 'file:///D:/site/index.html';
    const out = renderRecord(c);
    expect(out).toContain('Движение снято с file:///D:/site/index.html как образец.');
    expect(out).not.toContain('снято с  как');
  });

  test('неполная запись не роняет отчёт', () => {
    const c = fixture();
    c.records.push({ ...rec({}), from: undefined, to: undefined, properties: undefined, target: undefined });
    expect(() => renderRecord(c)).not.toThrow();
  });

  test('нет easingName: без undefined', () => {
    const c = fixture();
    c.records = [rec({ easingName: undefined }), rec({ easing: 'steps(4)', easingName: undefined, phase: 'hover', trigger: 'hover' })];
    const out = renderRecord(c);
    expect(out).not.toContain('undefined');
    expect(out).toContain('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(out).toContain('steps(4)');
  });

  test('кривые токенов в одну строку, JSON валиден', () => {
    const m = /```json\n([\s\S]*?)\n```/.exec(md);
    expect(m[1]).toMatch(/"enter": \[[-\d.]+, [-\d.]+, [-\d.]+, [-\d.]+\]/);
    expect(() => JSON.parse(m[1])).not.toThrow();
  });
});

// --- Task 5: что съёмка искажала на настоящих сайтах ---

const section = (md, from, to) => md.split(from)[1].split(to)[0];
const signatureLines = (md) => section(md, '## Сигнатурные приёмы', '## По фазам').split('\n').filter((l) => l.startsWith('- '));
const phase = (md, label) => {
  const rest = md.split(`### ${label}`)[1];
  return rest.split(/\n### |\n## /)[0];
};
const rows = (text) => text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Элемент'));

function capture(records) {
  return { ...fixture(), records, omitted: {}, skipped: [], frames: [] };
}

describe('Task 5: отчёт на настоящих сайтах', () => {
  test('M1: смена цвета — одна строка под таблицей, движение в таблице', () => {
    const colors = Array.from({ length: 112 }, (_, i) => rec({
      id: `c${i}`, phase: 'scroll', trigger: 'scroll', kind: 'css-transition', target: target(`a.nav-${i}`),
      properties: [['color', 'background-color', 'outline-color'][i % 3]], from: { color: 'red' }, to: { color: 'blue' },
      durationMs: i < 80 ? 300 : 500, easing: [0, 0, 0.2, 1], easingName: 'Material decelerate', startMs: i * 10,
    }));
    const move = rec({ id: 'm', phase: 'scroll', trigger: 'scroll', target: target('.hero'), startMs: 50 });
    const md = renderRecord(capture([...colors, move]));
    const scroll = phase(md, 'Прокрутка');
    expect(rows(scroll)).toHaveLength(1);
    expect(scroll).not.toContain('a.nav-');
    expect(scroll).toMatch(/Смена цвета[^\n]*112 элементов, 300 мс, Material decelerate cubic-bezier\(0, 0, 0\.2, 1\)/);
    expect(md).not.toMatch(/каскад[^\n]*color/);
  });

  test('M2, M3: сдвиг через translate, целые px', () => {
    const r = rec({
      properties: ['translate'], from: { translate: '0px 551.63px' }, to: { translate: '0px -0.625px' },
      target: target('.mock', { role: 'other', text: '', box: { x: 0, y: 0, w: 560, h: 420 } }),
    });
    const md = renderRecord(capture([r]));
    const [line] = signatureLines(md);
    expect(line).toContain('сдвиг на 552 px');
    expect(md).not.toContain('551.63');
    expect(md).toContain('translate: 0px 552px → 0px -1px');
    const sc = renderRecord(capture([rec({ properties: ['scale', 'rotate'], from: { scale: '0.97', rotate: '0deg' }, to: { scale: '1', rotate: '45deg' } })]));
    expect(signatureLines(sc)[0]).toMatch(/масштаб 0\.97 → 1.*поворот на 45°/);
    expect(renderRecord(capture([rec({ from: { opacity: '0.685147' }, to: { opacity: '1' }, properties: ['opacity'] })]))).toContain('opacity: 0.69 → 1');
  });

  test('M4: у своей кривой в приёмах и каскадах — числа', () => {
    const recs = [0, 1, 2].map((i) => rec({ id: `o${i}`, target: target(`.o-${i}`), startMs: i * 60, easing: [0, 0, 0.6, 1], easingName: 'своя' }));
    const md = renderRecord(capture(recs));
    expect(signatureLines(md)[0]).toContain('своя cubic-bezier(0, 0, 0.6, 1)');
    expect(md).toMatch(/- каскад 60 мс × 3: [^\n]*своя cubic-bezier\(0, 0, 0\.6, 1\)/);
  });

  test('M5: в приёме сказано, что это за элемент', () => {
    const block = rec({ target: target('div.w-full > div.relative', { role: 'other', text: '', box: { x: 0, y: 0, w: 560, h: 420 } }) });
    const btn = rec({ id: 'b', phase: 'hover', trigger: 'hover', target: target('#buy', { role: 'button', text: 'Купить' }), durationMs: 200 });
    const lines = signatureLines(renderRecord(capture([block, btn])));
    expect(lines[0]).toMatch(/^- блок 560×420: /);
    expect(lines[1]).toMatch(/^- кнопка «Купить»: /);
  });

  test('R1: сырой linear() длиннее 40 знаков не печатается', () => {
    const long = `linear(${Array.from({ length: 90 }, (_, i) => `${(i / 89).toFixed(4)} ${((i / 89) * 100).toFixed(4)}%`).join(', ')})`;
    const md = renderRecord(capture([rec({ easing: long, easingName: long })]));
    const found = [...md.matchAll(/linear\([^)\n|…]*/g)];
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) expect(m[0].length).toBeLessThanOrEqual(40);
  });

  test('R2: путь по ключевым кадрам, не «1 → 1»', () => {
    const pulse = rec({
      properties: ['opacity'], from: { opacity: '1' }, to: { opacity: '1' }, iterations: Infinity, durationMs: 2000,
      path: [{ opacity: '1' }, { opacity: '0.5' }, { opacity: '1' }],
    });
    const many = rec({
      id: 'k', target: target('.k'), properties: ['opacity'], from: { opacity: '0' }, to: { opacity: '1' },
      path: ['0', '0.2', '0.4', '0.6', '0.8', '1'].map((opacity) => ({ opacity })),
    });
    const md = renderRecord(capture([pulse, many]));
    expect(md).toContain('opacity: 1 → 0.5 → 1');
    expect(md).not.toContain('opacity: 1 → 1');
    expect(md).toContain('opacity: 0 → 0.2 → 0.4 → … → 1');
    expect(signatureLines(md).some((l) => l.includes('пульсация'))).toBe(true);
  });

  test('R5: CSS-переменные названы, пустой ячейки нет', () => {
    const tracer = rec({
      target: target('div.tracer::before', { role: 'other' }), properties: ['--angle'],
      from: { '--angle': '0deg' }, to: { '--angle': '360deg' }, iterations: Infinity, durationMs: 3400,
    });
    const unknown = rec({ id: 'u', target: target('div.u::after'), properties: [], from: {}, to: {} });
    const load = phase(renderRecord(capture([tracer, unknown])), 'Загрузка');
    expect(load).toContain('CSS-переменная --angle');
    for (const row of rows(load)) {
      const cells = row.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      expect(cells.every((c) => c.length > 0), row).toBe(true);
    }
  });

  test('R6: короткий селектор без случайных id', () => {
    const radix = '#radix-_R_d56olubt6lb_-content-IghMFFuxRSapjiFTCbCZGg > div.pointer-events-none.col-start-1:nth-of-type(2)';
    const tw = 'span.number > span.number__inner > span.section.section--justify-right:nth-of-type(1) > span.digit.animate-presence:nth-of-type(7)';
    const md = renderRecord(capture([rec({ target: target(radix) }), rec({ id: 't', target: target(tw), startMs: 500, durationMs: 400 })]));
    expect(md).not.toContain('radix-_R_');
    for (const m of md.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) expect(m[1].length, m[1]).toBeLessThanOrEqual(62);
    expect(md).toContain('div.pointer-events-none');
    expect(md).toContain('span.digit');
  });

  test('B3: не больше 25 строк на фазу, одинаковые свёрнуты, остальное — в capture.json', () => {
    const same = Array.from({ length: 6 }, (_, i) => rec({
      id: `s${i}`, phase: 'hover', trigger: 'hover', target: target(`.same-${i}`), startMs: i * 1000,
    }));
    const distinct = Array.from({ length: 60 }, (_, i) => rec({
      id: `d${i}`, phase: 'hover', trigger: 'hover', target: target(`.d-${i}`, { box: { x: 0, y: 0, w: 10 + i, h: 10 } }),
      durationMs: 100 + i * 7, startMs: 100 + i,
    }));
    const md = renderRecord(capture([...same, ...distinct]));
    const hover = phase(md, 'Наведение');
    const shown = rows(hover);
    expect(shown.length).toBeLessThanOrEqual(25);
    expect(shown.some((r) => r.includes('× 6'))).toBe(true);
    expect(hover).toMatch(/ещё \d+ строк[^\n]*в capture\.json/);
    // самые заметные первыми: самая крупная из разных — в таблице
    expect(hover).toContain('.d-59');
  });

  test('фоновые петли — одной строкой под таблицей, не в приёмах', () => {
    const digits = Array.from({ length: 12 }, (_, i) => rec({
      id: `n${i}`, target: target(`span.digit:nth-of-type(${i})`, { box: { x: 0, y: 0, w: 600, h: 400 } }), loop: true, repeats: 80,
      kind: 'waapi', properties: ['--_number-flow-d'], from: { '--_number-flow-d': '-3' }, to: { '--_number-flow-d': '0' },
      durationMs: 900, easing: [0.2, 0.2, 0.05, 1.1], easingName: 'своя', startMs: i,
    }));
    const marquee = rec({
      id: 'mq', target: target('div > ul', { box: { x: 0, y: 0, w: 1135, h: 19 } }), kind: 'js-sampled', basis: 'sampled', loop: true,
      properties: ['transform'], from: { transform: 'matrix(1, 0, 0, 1, -22, 0)' }, to: { transform: 'matrix(1, 0, 0, 1, -148, 0)' },
      durationMs: 6341, easing: [0, 0, 1, 1], easingName: 'linear', startMs: 2900,
    });
    const real = rec({ id: 'r', target: target('.hero'), startMs: 100 });
    const md = renderRecord(capture([...digits, marquee, real]));
    const load = phase(md, 'Загрузка');
    expect(rows(load)).toHaveLength(1);
    expect(load).toMatch(/Фоновые петли[^\n]*CSS-переменная --_number-flow-d: 12 элементов, 900 мс/);
    expect(load).toMatch(/Фоновые петли[^\n]*transform: 1 элемент, 6341 мс, linear/);
    expect(load).not.toMatch(/каскад/);
    expect(signatureLines(md).join('\n')).not.toMatch(/ul|digit/);
  });

  test('«× N» — разные элементы; один элемент дважды — «2 раза»', () => {
    const twice = [0, 900].map((t) => rec({ id: `t${t}`, target: target('.toggle'), startMs: t }));
    const md = renderRecord(capture(twice));
    const [row] = rows(phase(md, 'Загрузка'));
    expect(row).toContain('2 раза');
    expect(row).not.toContain('× 2');
  });

  test('приёмы: пара «наведение / уход курсора» одного движения — одна строка, место уходит следующему приёму', () => {
    const big = { box: { x: 0, y: 0, w: 1440, h: 900 } };
    const hov = (id, phase, sel, over) => rec({ id, phase, trigger: 'hover', target: target(sel, { role: 'other', text: '', ...big }), ...over });
    const recs = [
      hov('b1', 'hover', '.backdrop', { properties: ['opacity'], from: { opacity: '0' }, to: { opacity: '1' }, durationMs: 300 }),
      hov('b2', 'hover-out', '.backdrop', { properties: ['opacity'], from: { opacity: '1' }, to: { opacity: '0' }, durationMs: 300 }),
      // уход курсора заметнее входа (дольше) — в приёмах всё равно вход
      hov('c1', 'hover', '.menu', { properties: ['clip-path'], from: { 'clip-path': 'inset(0 0 100% 0)' }, to: { 'clip-path': 'inset(0)' }, durationMs: 250 }),
      hov('c2', 'hover-out', '.menu', { properties: ['clip-path'], from: { 'clip-path': 'inset(0)' }, to: { 'clip-path': 'inset(0 0 100% 0)' }, durationMs: 300 }),
      ...['.icon-a', '.icon-b', '.icon-c'].map((sel, i) => rec({
        id: `i${i}`, phase: 'hover', trigger: 'hover', target: target(sel, { box: { x: 0, y: 0, w: 16, h: 16 } }),
        properties: ['rotate'], from: { rotate: 'none' }, to: { rotate: `${45 * (i + 1)}deg` }, durationMs: 200 + i * 50,
      })),
    ];
    const lines = signatureLines(renderRecord(capture(recs)));
    expect(lines).toHaveLength(5);
    expect(lines.filter((l) => l.includes('.backdrop'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('.menu'))).toHaveLength(1);
    expect(lines.some((l) => l.includes('уход курсора'))).toBe(false);
    for (const sel of ['.icon-a', '.icon-b', '.icon-c']) expect(lines.some((l) => l.includes(sel))).toBe(true);
  });

  test('R28.3: пропуск в среднем кадре не даёт фантомного сдвига и ложной пульсации', () => {
    const r = rec({
      properties: ['opacity', 'transform'], from: { opacity: '0.5', transform: 'translateY(10px)' }, to: { opacity: '0.8', transform: 'translateY(10px)' },
      path: [{ opacity: '0.5', transform: 'translateY(10px)' }, { opacity: '0.8' }, { transform: 'translateY(10px)' }],
    });
    const [line] = signatureLines(renderRecord(capture([r])));
    expect(line).not.toMatch(/сдвиг|пульсация/);
    expect(line).toContain('проявление');
  });

  test('R28.4: один элемент в одной фазе — одна строка приёмов, место уходит следующему', () => {
    const els = Array.from({ length: 11 }, (_, i) => `section > div.reveal:nth-of-type(${i + 1})`);
    const tgt = (sel) => target(sel, { role: 'other', text: 'Banking', box: { x: 0, y: 0, w: 1200, h: 400 } });
    const fade = els.map((sel, i) => rec({ id: `o${i}`, phase: 'scroll', trigger: 'scroll', target: tgt(sel), startMs: i * 900,
      properties: ['opacity'], from: { opacity: '0' }, to: { opacity: '1' }, durationMs: 670, easing: [0.59, 0.41, 0.68, 0.49], easingName: 'своя' }));
    const lift = els.map((sel, i) => rec({ id: `t${i}`, phase: 'scroll', trigger: 'scroll', target: tgt(sel), startMs: i * 900 + 150, delayMs: 150,
      properties: ['translate'], from: { translate: '0px 50px' }, to: { translate: '0px' }, durationMs: 670, easing: [0.28, 1.1, 0.74, 1], easingName: 'своя' }));
    const others = ['.a', '.b', '.c', '.d'].map((sel, i) => rec({ id: `x${i}`, target: target(sel, { box: { x: 0, y: 0, w: 100, h: 100 } }),
      durationMs: 200 + i * 40, startMs: i }));
    const lines = signatureLines(renderRecord(capture([...fade, ...lift, ...others])));
    expect(lines).toHaveLength(5);
    const reveal = lines.filter((l) => l.includes('div.reveal'));
    expect(reveal).toHaveLength(1);
    expect(reveal[0]).toMatch(/сдвиг на 50 px и проявление/);
    expect(reveal[0]).toContain('cubic-bezier(0.28, 1.1, 0.74, 1)');
    expect(reveal[0]).toContain('cubic-bezier(0.59, 0.41, 0.68, 0.49)');
    expect(reveal[0]).toContain('× 11 элементов');
    for (const sel of ['.a', '.b', '.c', '.d']) expect(lines.some((l) => l.includes(`\`${sel}\``))).toBe(true);
  });

  test('R28.4: тот же приём элемента с другой длительностью (прерванный переход) — не вторая часть строки', () => {
    const pic = (id, durationMs, from) => rec({ id, phase: 'scroll', trigger: 'scroll', target: target('picture.hero', { role: 'image', text: '' }),
      properties: ['opacity'], from: { opacity: from }, to: { opacity: '0' }, durationMs });
    const [line] = signatureLines(renderRecord(capture([pic('p1', 200, '1'), pic('p2', 168, '0.84')])));
    expect(line).not.toMatch(/затухание и затухание/);
    expect(line).toContain('200 мс');
  });

  test('B3: отчёт о тяжёлом сайте меньше 40 КБ', () => {
    const long = 'div.flex.flex-col.items-center.justify-between > div.relative.overflow-hidden.rounded-xl:nth-of-type(3) > span.inline-block';
    const recs = [];
    for (const [trigger, phases] of [['load', ['load']], ['scroll', ['scroll']], ['hover', ['hover', 'hover-out']], ['focus', ['focus', 'blur']]]) {
      for (let i = 0; i < 300; i++) {
        recs.push(rec({
          id: `${trigger}-${i}`, phase: phases[i % phases.length], trigger, kind: i % 2 ? 'js-sampled' : 'waapi',
          basis: i % 2 ? 'sampled' : 'exact', target: target(`${long}:nth-of-type(${i})`, { text: 'Очень длинный текст карточки '.repeat(4) }),
          properties: i % 5 ? ['transform', 'opacity'] : ['color'], durationMs: 100 + (i % 37) * 11, startMs: i * 13,
          from: { transform: `matrix(0.987654, 0.0123, -0.0123, 0.987654, ${i}.123456, 7.654321)`, opacity: '0.123456', color: 'rgb(1, 2, 3)' },
          to: { transform: 'matrix(1, 0, 0, 1, 0, 0)', opacity: '1', color: 'rgb(4, 5, 6)' },
          easing: [0.1 + (i % 7) / 10, 0, 0.2, 1], easingName: 'своя',
        }));
      }
    }
    const md = renderRecord({ ...capture(recs), omitted: { load: 40, hover: 300 } });
    expect(Buffer.byteLength(md, 'utf8')).toBeLessThan(40_000);
  });
});

describe('финальное ревью', () => {
  test('F4: привязка к прокрутке — «N px за M px прокрутки», без длительности и кривой, не в токенах', () => {
    const parallax = rec({
      id: 'p', phase: 'scroll', trigger: 'scroll', kind: 'js-sampled', basis: 'sampled', scrollLinked: true, scrollPx: 2880,
      target: target('#parallax', { role: 'other', text: '', box: { x: 0, y: 0, w: 1200, h: 600 } }),
      properties: ['transform'], from: { transform: 'matrix(1, 0, 0, 1, 0, 0)' }, to: { transform: 'matrix(1, 0, 0, 1, 0, 864)' },
      durationMs: 0, easing: 'scroll', easingName: 'привязано к прокрутке',
    });
    const scrub = rec({
      id: 's', phase: 'scroll', trigger: 'scroll', kind: 'js-sampled', basis: 'sampled', scrollLinked: true, scrollPx: 1440,
      target: target('#scrub', { role: 'other', text: '', box: { x: 0, y: 0, w: 200, h: 200 } }),
      properties: ['transform'], from: { transform: 'none' }, to: { transform: 'rotate(90deg) scale(1.5)' },
      durationMs: 0, easing: 'scroll', easingName: 'привязано к прокрутке',
    });
    const real = rec({ id: 'r', durationMs: 400 });
    const md = renderRecord(capture([parallax, scrub, real]));
    const scroll = rows(phase(md, 'Прокрутка'));
    expect(scroll).toHaveLength(2);
    expect(scroll.find((l) => l.includes('#parallax'))).toContain('привязано к прокрутке: 864 px за 2880 px прокрутки');
    expect(scroll.find((l) => l.includes('#scrub'))).toMatch(/привязано к прокрутке: масштаб 1 → 1\.5, поворот на 90° за 1440 px прокрутки/);
    expect(signatureLines(md).filter((l) => l.includes('#scrub') || l.includes('#parallax'))).toHaveLength(2);
    for (const row of scroll) expect(row).not.toMatch(/ 0 мс|scroll|своя/);
    const line = signatureLines(md).find((l) => l.includes('#parallax'));
    expect(line).toContain(': сдвиг на 864 px (Прокрутка), привязано к прокрутке, за 2880 px прокрутки —');
    expect(line).not.toMatch(/мс/);
    const tokens = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
    expect(tokens.duration.slow).toBe(400);
    expect(tokens.distance).toBe(24);
    expect(md).toMatch(/## Ограничения\n\n[^\n]*привязан[^\n]*к прокрутке[^\n]*клик/);
  });

  test('F5: масштаб Lottie от 0 — не сдвиг', () => {
    const lottie = rec({
      phase: 'scroll', trigger: 'scroll', kind: 'js-sampled', basis: 'sampled',
      target: target('g.png', { role: 'image', text: '', tag: 'g', box: { x: 0, y: 0, w: 369, h: 88 } }),
      properties: ['transform'], from: { transform: 'matrix(0, 0, 0, 0, 889.47, 708.25)' },
      to: { transform: 'matrix(0.6, 0, 0, 0.6, 651.39, 673.92)' }, durationMs: 344,
    });
    const [line] = signatureLines(renderRecord(capture([lottie])));
    expect(line).toContain('масштаб 0 → 0.6');
    expect(line).not.toContain('сдвиг');
    // Точная CSS-запись: сдвиг настоящий, даже если масштаб от 0.
    const css = rec({ ...lottie, kind: 'css-animation', basis: 'exact', from: { transform: 'translateY(40px) scale(0)' }, to: { transform: 'none' } });
    expect(signatureLines(renderRecord(capture([css])))[0]).toContain('сдвиг на 40 px');
  });

  test('F10: без заголовка страницы — домен', () => {
    const md = renderRecord({ ...fixture(), title: '' });
    expect(md.split('\n')[0]).toBe('# Движение: example.com');
  });

  test('F11: alternate — «туда-обратно»', () => {
    const pulse = rec({
      properties: ['opacity'], from: { opacity: '1' }, to: { opacity: '0.5' }, durationMs: 2000, iterations: Infinity, direction: 'alternate',
    });
    const md = renderRecord(capture([pulse]));
    expect(rows(phase(md, 'Загрузка'))[0]).toContain('2000 мс, бесконечно, туда-обратно');
    expect(signatureLines(md)[0]).toContain('2000 мс, бесконечно, туда-обратно');
  });
});
