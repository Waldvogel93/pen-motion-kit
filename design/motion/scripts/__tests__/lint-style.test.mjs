import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { lintStyle } from '../lint-style.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.resolve(HERE, '../..');
const fx = (name) => path.join(HERE, 'fixtures/styles', name);

const TMP = path.resolve(MOTION, '../../.scratch/test-tmp/lint');
let counter = 0;

// Копия good во временной папке <id>; edits: файл -> функция правки текста, null удаляет файл.
function make(id, edits = {}) {
  const dir = path.join(TMP, `${process.pid}-${counter++}`, id);
  fs.cpSync(fx('good'), dir, { recursive: true });
  const cssFile = path.join(dir, 'style.css');
  fs.writeFileSync(cssFile, fs.readFileSync(cssFile, 'utf8').replaceAll('"good"', `"${id}"`));
  for (const [file, fn] of Object.entries(edits)) {
    const f = path.join(dir, file);
    if (fn === null) fs.rmSync(f);
    else fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8')));
  }
  return dir;
}

const passport = (fn) => ({ 'passport.md': fn });

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('lintStyle: фикстуры', () => {
  it('хороший стиль и заготовка проходят чисто', () => {
    expect(lintStyle(fx('good'))).toEqual([]);
    expect(lintStyle(path.join(MOTION, 'styles/_template'))).toEqual([]);
  });

  it('каждая плохая фикстура даёт ровно свой дефект', () => {
    expect(lintStyle(fx('bad-heading'))).toEqual(['passport.md: нет раздела "## Reduced motion"']);
    expect(lintStyle(fx('bad-roles'))).toEqual(['passport.md: в таблице «Роли» нет роли "otp"']);
    expect(lintStyle(fx('bad-tokens'))).toEqual(['tokens.json: нет поля duration.fast (число, мс)']);
    expect(lintStyle(fx('bad-css'))).toEqual([
      'style.css: селектор ".btn:hover" не начинается с [data-motion-style="bad-css"]',
    ]);
    expect(lintStyle(fx('bad-license'))).toEqual([
      'passport.md: у роли "screen-enter" не указана лицензия',
      'passport.md: у роли "button" не указана лицензия',
    ]);
  });
});

describe('lintStyle: файлы', () => {
  it('несуществующая папка даёт одно понятное сообщение', () => {
    const dir = fx('nope');
    expect(lintStyle(dir)).toEqual([`нет папки стиля ${dir}`]);
  });

  it('обязательные файлы; style.css необязателен', () => {
    expect(lintStyle(make('a', { 'passport.md': null }))).toEqual(['нет файла passport.md']);
    expect(lintStyle(make('a', { 'tokens.json': null }))).toEqual(['нет файла tokens.json']);
    expect(lintStyle(make('a', { 'style.tsx': null }))).toEqual(['нет файла style.tsx']);
    expect(lintStyle(make('a', { 'style.css': null }))).toEqual([]);
  });
});

describe('lintStyle: tokens.json', () => {
  it('лишнее поле', () => {
    const dir = make('a', { 'tokens.json': (t) => t.replace('"blur": 0', '"blur": 0, "glow": 1') });
    expect(lintStyle(dir)).toEqual(['tokens.json: лишнее поле glow']);
  });

  it('поле неверного типа', () => {
    const dir = make('a', {
      'tokens.json': (t) => t.replace('"stagger": 40', '"stagger": "40"').replace(/"enter": \[[^\]]*\]/, '"enter": [0.23, 1]'),
    });
    expect(lintStyle(dir)).toEqual([
      'tokens.json: нет поля ease.enter (массив из 4 чисел)',
      'tokens.json: нет поля stagger (число, мс)',
    ]);
  });

  it('битый JSON даёт одно сообщение без падения', () => {
    const res = lintStyle(make('a', { 'tokens.json': () => '{ nope' }));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatch(/^tokens\.json: не разбирается как JSON/);
  });
});

describe('lintStyle: паспорт', () => {
  it('неизвестная роль', () => {
    const dir = make('a', passport((t) => t.replace('| `otp` |', '| `ghost` |')));
    expect(lintStyle(dir)).toEqual([
      'passport.md: в таблице «Роли» неизвестная роль "ghost"',
      'passport.md: в таблице «Роли» нет роли "otp"',
    ]);
  });

  it('строка варианта роли допустима и не заменяет базовую', () => {
    const row = '| `otp/beam` | Луч по полям | `duration.base` | Своя реализация | MIT |\n';
    expect(lintStyle(make('a', passport((t) => t.replace('| `otp` |', row + '| `otp` |'))))).toEqual([]);
    const dir = make('a', passport((t) => t.replace('| `otp` | Без анимации | | | |', row.trim())));
    expect(lintStyle(dir)).toEqual(['passport.md: в таблице «Роли» нет роли "otp"']);
  });

  it('вариант без лицензии, с неизвестной ролью или кривым именем', () => {
    const add = (r) => passport((t) => t.replace('| `otp` |', r + '\n| `otp` |'));
    expect(lintStyle(make('a', add('| `otp/beam` | Луч | `duration.base` | | |')))).toEqual([
      'passport.md: у роли "otp/beam" не указана лицензия',
    ]);
    expect(lintStyle(make('a', add('| `ghost/beam` | Без анимации | | | |')))).toEqual([
      'passport.md: в таблице «Роли» неизвестная роль "ghost/beam"',
    ]);
    expect(lintStyle(make('a', add('| `otp/Beam` | Без анимации | | | |')))).toEqual([
      'passport.md: в таблице «Роли» неизвестная роль "otp/Beam"',
    ]);
  });

  it('повторяющаяся роль', () => {
    const dir = make('a', passport((t) => t.replace('| `otp` |', '| `toggle` |')));
    expect(lintStyle(dir)).toEqual([
      'passport.md: в таблице «Роли» роль "toggle" повторяется',
      'passport.md: в таблице «Роли» нет роли "otp"',
    ]);
  });

  it('нет заголовка', () => {
    const dir = make('a', passport((t) => t.replace('# Хороший — растворение', '')));
    expect(lintStyle(dir)).toEqual(['passport.md: нет заголовка "# <Название>"']);
  });

  it('пустой раздел', () => {
    const dir = make('a', passport((t) => t.replace(/Нет\r?\n/, '')));
    expect(lintStyle(dir)).toEqual(['passport.md: раздел "## Изменения вида в покое" пустой']);
  });

  it('в референсах нет ссылки', () => {
    const dir = make('a', passport((t) => t.replace(/\[[^\]]+\]\([^)]+\)/, 'без ссылки')));
    expect(lintStyle(dir)).toEqual(['passport.md: в разделе "## Референсы" нет ни одной ссылки']);
  });

  it('строки внутри блока кода не считаются заголовками', () => {
    const dir = make('a', passport((t) =>
      t.replace(
        'Только пакет `motion`: `npm install motion`.',
        '```bash\n# установить\nnpm install motion\n## Reduced motion\n```\n\n~~~sh\n## fake\n~~~',
      ),
    ));
    expect(lintStyle(dir)).toEqual([]);
  });

  it('блок кода не прячет настоящий раздел и не создаёт ложный', () => {
    const dir = make('a', passport((t) =>
      t
        .replace('Только пакет `motion`: `npm install motion`.', '```bash\n## Reduced motion\n```')
        .replace(/## Reduced motion\r?\nПоявление.*/, ''),
    ));
    expect(lintStyle(dir)).toEqual(['passport.md: нет раздела "## Reduced motion"']);
  });

  it('«|» в ячейках (экранированный и в коде) не сдвигает столбцы', () => {
    const ok = make('a', passport((t) =>
      t.replace('Каскад: прозрачность 0→1, сдвиг вверх', 'Каскад: 0→1 \\| вверх, `a | b`'),
    ));
    expect(lintStyle(ok)).toEqual([]);
    const noLicense = make('a', passport((t) =>
      t.replace(
        '| Сжатие до 0.97 при нажатии | `duration.fast` | Своя реализация на Motion | MIT |',
        '| Сжатие \\| до 0.97 | `x | y` | Своя реализация на Motion | |',
      ),
    ));
    expect(lintStyle(noLicense)).toEqual(['passport.md: у роли "button" не указана лицензия']);
  });
});

describe('lintStyle: style.css', () => {
  const css = (text) => make('a', { 'style.css': () => text });
  const P = '[data-motion-style="a"]';

  it('в списке через запятую плох только один селектор', () => {
    expect(lintStyle(css(`${P} .x, .y:hover { color: red }`))).toEqual([
      `style.css: селектор ".y:hover" не начинается с ${P}`,
    ]);
  });

  it('смотрит внутрь @media и @supports, пропускает @keyframes, @font-face и комментарии', () => {
    const text = `
      /* .commented { } */
      @import url("x.css");
      @font-face { font-family: X; src: url(x.woff) }
      @keyframes k { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }
      @media (hover: hover) { .m { color: red } ${P} .ok { color: red } }
      @supports (display: grid) { .s { color: red } }
    `;
    expect(lintStyle(css(text))).toEqual([
      `style.css: селектор ".m" не начинается с ${P}`,
      `style.css: селектор ".s" не начинается с ${P}`,
    ]);
  });
});
