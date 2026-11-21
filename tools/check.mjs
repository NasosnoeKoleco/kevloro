/**
 * Проверка целостности статического сайта Kevloro перед публикацией.
 * Запуск: node tools/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];
const notes = [];

function fail(message) {
    problems.push(message);
}

function ok(message) {
    notes.push(message);
}

function read(relative) {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function exists(relative) {
    return fs.existsSync(path.join(ROOT, relative));
}

function decodeEntities(text) {
    return text
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripTags(text) {
    return decodeEntities(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const CALC_PAGES = [
    { file: 'index.html', url: 'https://kevloro.ru/' },
    { file: 'laminat/index.html', url: 'https://kevloro.ru/laminat/' },
    { file: 'spc/index.html', url: 'https://kevloro.ru/spc/' }
];
const ALL_PAGES = [...CALC_PAGES.map((page) => page.file), 'privacy.html', '404.html'];

// --- 1. Разметка страниц -------------------------------------------------
const pageInfo = new Map();

for (const file of ALL_PAGES) {
    const html = read(file);
    const info = { file, html };

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
        fail(`${file}: дублирующиеся id — ${[...new Set(duplicates)].join(', ')}`);
    }
    info.ids = new Set(ids);

    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    if (h1.length !== 1) {
        fail(`${file}: ожидался ровно один <h1>, найдено ${h1.length}`);
    }

    if (!/<main[^>]*id="main"/.test(html)) {
        fail(`${file}: нет <main id="main">`);
    }
    if (!/<html lang="ru">/.test(html)) {
        fail(`${file}: нет атрибута lang="ru" на <html>`);
    }
    if (/onclick=|oninput=|onchange=/.test(html)) {
        fail(`${file}: остались inline-обработчики событий`);
    }

    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/);
    const isErrorPage = file === '404.html';
    if (!canonical && !isErrorPage) {
        fail(`${file}: нет canonical`);
    } else if (canonical) {
        info.canonical = canonical[1];
    }

    const title = html.match(/<title>([\s\S]*?)<\/title>/);
    if (!title) {
        fail(`${file}: нет <title>`);
    } else {
        info.title = title[1].trim();
        if (info.title.length > 75) {
            fail(`${file}: title длиннее 75 символов (${info.title.length})`);
        }
    }

    const description = html.match(/<meta name="description" content="([^"]*)">/);
    if (!description && !isErrorPage) {
        fail(`${file}: нет meta description`);
    } else if (description) {
        info.description = description[1];
        if (info.description.length < 110 || info.description.length > 175) {
            fail(`${file}: description вне диапазона 110–175 символов (${info.description.length})`);
        }
    }

    if (!isErrorPage) {
        const ogUrl = html.match(/<meta property="og:url" content="([^"]*)">/);
        if (!ogUrl) {
            fail(`${file}: нет og:url`);
        } else if (info.canonical && ogUrl[1] !== info.canonical) {
            fail(`${file}: og:url (${ogUrl[1]}) не совпадает с canonical (${info.canonical})`);
        }

        if (!/<meta property="og:image" content="https:\/\/kevloro\.ru\//.test(html)) {
            fail(`${file}: нет абсолютного og:image`);
        }
        if (!/<meta property="og:image:alt"/.test(html)) {
            fail(`${file}: нет og:image:alt`);
        }
    }

    // Внутренние ссылки и ассеты должны существовать в репозитории.
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
        const target = match[1];
        if (target === '/' || target.endsWith('/')) {
            const dir = target.replace(/^\//, '').replace(/\/$/, '');
            const indexPath = dir === '' ? 'index.html' : `${dir}/index.html`;
            if (!exists(indexPath)) {
                fail(`${file}: ссылка ${target} не находит ${indexPath}`);
            }
        } else if (!exists(target.replace(/^\//, ''))) {
            fail(`${file}: файл ${target} отсутствует в репозитории`);
        }
    }

    // JSON-LD должен быть валидным JSON.
    info.jsonLd = [];
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
            info.jsonLd.push(JSON.parse(match[1]));
        } catch (error) {
            fail(`${file}: битый JSON-LD — ${error.message}`);
        }
    }

    pageInfo.set(file, info);
}

// --- 2. id, которые ищет app.js, обязаны быть на каждой странице ---------
const appJs = read('app.js');
const referencedIds = new Set([
    ...[...appJs.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]),
    ...[...appJs.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1])
]);

for (const { file } of CALC_PAGES) {
    const info = pageInfo.get(file);
    const missing = [...referencedIds].filter((id) => !info.ids.has(id));
    if (missing.length > 0) {
        fail(`${file}: app.js ищет отсутствующие id — ${missing.join(', ')}`);
    }
}
ok(`app.js использует ${referencedIds.size} id, все найдены на страницах калькулятора`);

// --- 3. Никакой рекламы и старых артефактов -----------------------------
const AD_PATTERNS = [/partner/i, /erid/i, /promo/i, /advestiga/i, /яндекс\s*плюс/i, /промокод/i];
for (const file of [...ALL_PAGES.filter((name) => name !== 'privacy.html'), 'styles.css', 'app.js', 'core.js', 'sw.js']) {
    const content = read(file);
    for (const pattern of AD_PATTERNS) {
        if (pattern.test(content)) {
            fail(`${file}: найден рекламный артефакт по шаблону ${pattern}`);
        }
    }
}

// --- 4. FAQ: разметка должна совпадать с видимыми вопросами -------------
for (const { file } of CALC_PAGES) {
    const info = pageInfo.get(file);
    const faqSection = info.html.match(/<section class="card faq-card"[\s\S]*?<\/section>/);
    if (!faqSection) {
        fail(`${file}: нет блока FAQ`);
        continue;
    }
    const visible = [...faqSection[0].matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((match) => stripTags(match[1]));
    const faq = info.jsonLd
        .flatMap((block) => (block['@graph'] ? block['@graph'] : [block]))
        .find((node) => node && node['@type'] === 'FAQPage');

    if (!faq) {
        fail(`${file}: нет JSON-LD FAQPage`);
        continue;
    }
    const schema = faq.mainEntity.map((question) => question.name);
    const missingInSchema = visible.filter((question) => !schema.includes(question));
    const extraInSchema = schema.filter((question) => !visible.includes(question));
    if (missingInSchema.length > 0) {
        fail(`${file}: вопросы есть на странице, но не в FAQPage — ${missingInSchema.join(' | ')}`);
    }
    if (extraInSchema.length > 0) {
        fail(`${file}: вопросы есть в FAQPage, но не на странице — ${extraInSchema.join(' | ')}`);
    }
    ok(`${file}: FAQ ${visible.length} вопросов совпадает с разметкой`);
}

// --- 5. Sitemap и robots -------------------------------------------------
const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
for (const { file, url } of CALC_PAGES) {
    if (!locs.includes(url)) {
        fail(`sitemap.xml: нет ${url}`);
    }
    const info = pageInfo.get(file);
    if (info.canonical !== url) {
        fail(`${file}: canonical ${info.canonical} не равен ожидаемому ${url}`);
    }
}
if (!locs.includes('https://kevloro.ru/privacy.html')) {
    fail('sitemap.xml: нет страницы политики конфиденциальности');
}
if (new Set(locs).size !== locs.length) {
    fail('sitemap.xml: повторяющиеся адреса');
}
if (!/Sitemap: https:\/\/kevloro\.ru\/sitemap\.xml/.test(read('robots.txt'))) {
    fail('robots.txt: нет ссылки на sitemap');
}

// --- 6. Манифест и иконки ------------------------------------------------
let manifest;
try {
    manifest = JSON.parse(read('manifest.json'));
} catch (error) {
    fail(`manifest.json: невалидный JSON — ${error.message}`);
}

if (manifest) {
    if (!manifest.icons || manifest.icons.length < 4) {
        fail('manifest.json: мало иконок');
    }
    const pngCache = new Map();
    for (const icon of manifest.icons) {
        const relative = icon.src.replace(/^\//, '');
        if (!exists(relative)) {
            fail(`manifest.json: иконка ${icon.src} отсутствует`);
            continue;
        }
        if (!relative.endsWith('.png')) {
            continue;
        }
        if (!pngCache.has(relative)) {
            const buffer = fs.readFileSync(path.join(ROOT, relative));
            pngCache.set(relative, { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
        }
        const size = pngCache.get(relative);
        const declared = String(icon.sizes);
        if (!/^\d+x\d+$/.test(declared)) {
            fail(`manifest.json: некорректный sizes "${declared}" у ${icon.src}`);
            continue;
        }
        const [width, height] = declared.split('x').map(Number);
        if (size.width !== width || size.height !== height) {
            fail(`manifest.json: ${icon.src} заявлен как ${declared}, а фактически ${size.width}x${size.height}`);
        }
    }
    if (!manifest.icons.some((icon) => icon.purpose === 'maskable')) {
        fail('manifest.json: нет maskable-иконки');
    }
    if (manifest.start_url !== '/?source=pwa') {
        fail(`manifest.json: неожиданный start_url ${manifest.start_url}`);
    }
    ok(`manifest.json: ${manifest.icons.length} иконок, размеры совпадают с файлами`);
}

// --- 7. Service worker: всё из precache должно существовать --------------
const sw = read('sw.js');
const precacheBlock = sw.match(/var PRECACHE = \[([\s\S]*?)\];/);
if (!precacheBlock) {
    fail('sw.js: не найден список PRECACHE');
} else {
    const urls = [...precacheBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    for (const url of urls) {
        const relative = url === '/' ? 'index.html' : url.replace(/^\//, '');
        if (url.endsWith('/')) {
            if (!exists(`${relative}index.html`) && !exists(relative)) {
                fail(`sw.js: в precache отсутствует ${url}`);
            }
        } else if (!exists(relative)) {
            fail(`sw.js: в precache отсутствует ${url}`);
        }
    }
    ok(`sw.js: precache из ${urls.length} адресов, все на месте`);
}

// --- 8. Остатки старых файлов -------------------------------------------
for (const legacy of ['icon-192.svg', 'icon-512.svg']) {
    if (exists(legacy)) {
        fail(`${legacy}: старый дубль остался в репозитории`);
    }
}
if (!exists('_config.yml') || !exists('.nojekyll')) {
    fail('пропали служебные файлы публикации (_config.yml / .nojekyll)');
}

// --- Итог ---------------------------------------------------------------
console.log('Проверка сайта Kevloro\n');
notes.forEach((note) => console.log(`  · ${note}`));
if (problems.length > 0) {
    console.error(`\nНайдено проблем: ${problems.length}`);
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
}
console.log(`\nВсё чисто: ${ALL_PAGES.length} страниц, ошибок нет.`);
