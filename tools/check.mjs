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

// Страницы с калькулятором на app.js (напольные покрытия)
const APP_PAGES = [
    { file: 'index.html', url: 'https://kevloro.ru/' },
    { file: 'laminat/index.html', url: 'https://kevloro.ru/laminat/' },
    { file: 'spc/index.html', url: 'https://kevloro.ru/spc/' }
];

// Страницы на универсальном движке engine.js
const ENGINE_PAGES = [
    { file: 'plitka/index.html', url: 'https://kevloro.ru/plitka/', calc: 'plitka' },
    { file: 'oboi/index.html', url: 'https://kevloro.ru/oboi/', calc: 'oboi' },
    { file: 'kraska/index.html', url: 'https://kevloro.ru/kraska/', calc: 'kraska' },
    { file: 'styazhka/index.html', url: 'https://kevloro.ru/styazhka/', calc: 'styazhka' }
];

const CONTENT_PAGES = [
    { file: 'kalkulyatory/index.html', url: 'https://kevloro.ru/kalkulyatory/' }
];


const BLOG_PAGES = [
    { file: 'blog/index.html', url: 'https://kevloro.ru/blog/', hub: true },
    { file: 'blog/skolko-kleya-na-plitku/index.html', url: 'https://kevloro.ru/blog/skolko-kleya-na-plitku/' },
    { file: 'blog/zapas-laminata-pri-ukladke/index.html', url: 'https://kevloro.ru/blog/zapas-laminata-pri-ukladke/' },
    { file: 'blog/kak-rasschitat-oboi/index.html', url: 'https://kevloro.ru/blog/kak-rasschitat-oboi/' },
    { file: 'blog/skolko-kraski-na-stenu/index.html', url: 'https://kevloro.ru/blog/skolko-kraski-na-stenu/' },
    { file: 'blog/rashod-smesi-na-styazhku/index.html', url: 'https://kevloro.ru/blog/rashod-smesi-na-styazhku/' },
    { file: 'blog/teplyy-pol-pod-laminat/index.html', url: 'https://kevloro.ru/blog/teplyy-pol-pod-laminat/' },
    { file: 'blog/laminat-ili-spc/index.html', url: 'https://kevloro.ru/blog/laminat-ili-spc/' },
    { file: 'blog/podlozhka-pod-laminat/index.html', url: 'https://kevloro.ru/blog/podlozhka-pod-laminat/' },
    { file: 'blog/plitka-ili-keramogranit/index.html', url: 'https://kevloro.ru/blog/plitka-ili-keramogranit/' },
    { file: 'blog/kak-rasschitat-plintus/index.html', url: 'https://kevloro.ru/blog/kak-rasschitat-plintus/' }
];

const ALL_PAGES = [
    ...APP_PAGES.map((page) => page.file),
    ...ENGINE_PAGES.map((page) => page.file),
    ...CONTENT_PAGES.map((page) => page.file),
    ...BLOG_PAGES.map((page) => page.file),
    'privacy.html',
    '404.html'
];

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

    const isErrorPage = file === '404.html';
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/);
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
        if (info.title.length > 78) {
            fail(`${file}: title длиннее 78 символов (${info.title.length})`);
        }
    }

    const description = html.match(/<meta name="description" content="([^"]*)">/);
    if (!description && !isErrorPage) {
        fail(`${file}: нет meta description`);
    } else if (description) {
        info.description = description[1];
        if (info.description.length < 110 || info.description.length > 180) {
            fail(`${file}: description вне диапазона 110–180 символов (${info.description.length})`);
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

// Уникальность title и description
const titles = new Map();
const descriptions = new Map();
for (const [file, info] of pageInfo) {
    if (info.title) {
        if (titles.has(info.title)) {
            fail(`${file}: title повторяет ${titles.get(info.title)}`);
        }
        titles.set(info.title, file);
    }
    if (info.description) {
        if (descriptions.has(info.description)) {
            fail(`${file}: description повторяет ${descriptions.get(info.description)}`);
        }
        descriptions.set(info.description, file);
    }
}

// --- 2. id, которые ищет JS, обязаны быть на страницах -------------------
function checkIds(scriptFile, pages, pattern, label) {
    const source = read(scriptFile);
    const ids = new Set([
        ...[...source.matchAll(pattern)].map((match) => match[1])
    ]);
    for (const { file } of pages) {
        const info = pageInfo.get(file);
        const missing = [...ids].filter((id) => !info.ids.has(id));
        if (missing.length > 0) {
            fail(`${file}: ${scriptFile} ищет отсутствующие id — ${missing.join(', ')}`);
        }
    }
    ok(`${label}: ${ids.size} id, все найдены`);
}

checkIds('app.js', APP_PAGES, /\$\('([A-Za-z0-9_-]+)'\)/g, 'app.js');
checkIds('engine.js', ENGINE_PAGES, /UI\.\$\('([A-Za-z0-9_-]+)'\)/g, 'engine.js');

// --- 3. Связка страниц движка с реестром калькуляторов ------------------
const calcSource = read('calculators.js');
for (const { file, calc } of ENGINE_PAGES) {
    const html = pageInfo.get(file).html;
    const declared = (html.match(/id="calcRoot" data-calc="([^"]+)"/) || [])[1];
    if (declared !== calc) {
        fail(`${file}: ожидался data-calc="${calc}", найдено "${declared || 'ничего'}"`);
    }
    if (!html.includes('/engine.js')) {
        fail(`${file}: не подключён /engine.js`);
    }
    if (!html.includes('/calculators.js')) {
        fail(`${file}: не подключён /calculators.js`);
    }
    if (!calcSource.includes(calc + ': ' + calc) && !calcSource.includes(calc + ': {')) {
        fail(`calculators.js: нет калькулятора ${calc}`);
    }
}
ok(`движок: ${ENGINE_PAGES.length} страниц связаны с реестром`);

// --- 4. Никакой рекламы и старых артефактов -----------------------------
const AD_PATTERNS = [/partner/i, /erid/i, /promo/i, /advestiga/i, /яндекс\s*плюс/i, /промокод/i];
for (const file of [...ALL_PAGES.filter((name) => name !== 'privacy.html'), 'styles.css', 'app.js', 'core.js', 'sw.js', 'ui.js', 'engine.js', 'calculators.js']) {
    const content = read(file);
    for (const pattern of AD_PATTERNS) {
        if (pattern.test(content)) {
            fail(`${file}: найден рекламный артефакт по шаблону ${pattern}`);
        }
    }
}

// --- 5. FAQ: разметка должна совпадать с видимыми вопросами -------------
for (const file of ALL_PAGES) {
    const info = pageInfo.get(file);
    const faq = info.jsonLd
        .flatMap((block) => (block['@graph'] ? block['@graph'] : [block]))
        .find((node) => node && node['@type'] === 'FAQPage');

    if (!faq) {
        continue;
    }

    const faqSection = info.html.match(/<section[^>]*class="[^"]*faq-card[^"]*"[\s\S]*?<\/section>/);
    if (!faqSection) {
        fail(`${file}: есть FAQPage, но нет блока .faq-card`);
        continue;
    }
    const visible = [...faqSection[0].matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((match) => stripTags(match[1]));
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

// --- 6. Sitemap и robots -------------------------------------------------
const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = [
    ...APP_PAGES.map((page) => page.url),
    ...ENGINE_PAGES.map((page) => page.url),
    ...CONTENT_PAGES.map((page) => page.url),
    ...BLOG_PAGES.map((page) => page.url),
    'https://kevloro.ru/privacy.html'
];
for (const url of expectedUrls) {
    if (!locs.includes(url)) {
        fail(`sitemap.xml: нет ${url}`);
    }
}
for (const loc of locs) {
    if (!expectedUrls.includes(loc)) {
        fail(`sitemap.xml: лишний или неизвестный адрес ${loc}`);
    }
}
for (const [file, info] of pageInfo) {
    const expected = expectedUrls.find((url) => url === info.canonical);
    if (info.canonical && !expected && file !== '404.html') {
        fail(`${file}: canonical не совпадает ни с одним адресом sitemap`);
    }
}
if (new Set(locs).size !== locs.length) {
    fail('sitemap.xml: повторяющиеся адреса');
}
if (!/Sitemap: https:\/\/kevloro\.ru\/sitemap\.xml/.test(read('robots.txt'))) {
    fail('robots.txt: нет ссылки на sitemap');
}

// --- 7. Манифест и иконки ------------------------------------------------
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
    for (const shortcut of manifest.shortcuts || []) {
        if (!exists(shortcut.url.replace(/^\//, '').replace(/\/$/, '') + '/index.html')) {
            fail(`manifest.json: ярлык ${shortcut.url} ведёт на несуществующую страницу`);
        }
    }
    ok(`manifest.json: ${manifest.icons.length} иконок, ${(manifest.shortcuts || []).length} ярлыков`);
}

// --- 8. Service worker: всё из precache должно существовать --------------
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
    for (const { url } of [...APP_PAGES, ...ENGINE_PAGES, ...CONTENT_PAGES]) {
        const asPath = url.replace('https://kevloro.ru', '') || '/';
        if (!urls.includes(asPath)) {
            fail(`sw.js: ${asPath} не попал в precache`);
        }
    }
    ok(`sw.js: precache из ${urls.length} адресов, все на месте`);
}

// --- 9. Остатки старых файлов -------------------------------------------
for (const legacy of ['icon-192.svg', 'icon-512.svg']) {
    if (exists(legacy)) {
        fail(`${legacy}: старый дубль остался в репозитории`);
    }
}
if (!exists('_config.yml') || !exists('.nojekyll')) {
    fail('пропали служебные файлы публикации (_config.yml / .nojekyll)');
}

// --- 10. Блог: разметка статей и перелинковка ---------------------------
const articlePages = BLOG_PAGES.filter((page) => !page.hub);
for (const { file: blogFile } of articlePages) {
    const info = pageInfo.get(blogFile);
    const graph = info.jsonLd.flatMap((block) => (block['@graph'] ? block['@graph'] : [block]));

    const article = graph.find((node) => node && node['@type'] === 'Article');
    if (!article) {
        fail(`${blogFile}: нет JSON-LD Article`);
    } else {
        ['headline', 'description', 'datePublished', 'dateModified', 'image', 'author', 'publisher'].forEach((key) => {
            if (!article[key]) {
                fail(`${blogFile}: в Article нет поля ${key}`);
            }
        });
    }

    const crumbs = graph.find((node) => node && node['@type'] === 'BreadcrumbList');
    if (!crumbs || crumbs.itemListElement.length < 3) {
        fail(`${blogFile}: хлебные крошки должны быть из 3 уровней`);
    }

    const linksToTools = [...info.html.matchAll(/href="\/(plitka|laminat|spc|oboi|kraska|styazhka|kalkulyatory)\//g)].length;
    if (linksToTools < 2) {
        fail(`${blogFile}: статья должна ссылаться минимум на два калькулятора (найдено ${linksToTools})`);
    }

    if (!info.html.includes('/ads.js')) {
        fail(`${blogFile}: не подключён /ads.js`);
    }
}

// Хаб блога перечисляет все статьи
{
    const hub = pageInfo.get('blog/index.html');
    const graph = hub.jsonLd.flatMap((block) => (block['@graph'] ? block['@graph'] : [block]));
    const list = graph.find((node) => node && node['@type'] === 'ItemList');
    if (!list) {
        fail('blog/index.html: нет ItemList со статьями');
    } else {
        const urls = list.itemListElement.map((item) => item.url);
        for (const page of articlePages) {
            if (!urls.includes(page.url)) {
                fail(`blog/index.html: в ItemList нет ${page.url}`);
            }
        }
        ok(`блог: ${urls.length} статей в ItemList`);
    }
}

// Рекламные места: скрыты, подписаны, с уникальными id
for (const file of ALL_PAGES) {
    const info = pageInfo.get(file);
    const slots = [...info.html.matchAll(/<aside class="ad-slot"[^>]*>/g)].map((match) => match[0]);
    if (slots.length === 0) {
        continue;
    }
    if (!info.html.includes('/ads.js')) {
        fail(`${file}: есть рекламный слот, но не подключён /ads.js`);
    }
    for (const slot of slots) {
        if (!/\shidden(\s|>)/.test(slot)) {
            fail(`${file}: рекламный слот должен быть скрыт до включения сети`);
        }
        if (!/aria-label="Рекламный блок"/.test(slot)) {
            fail(`${file}: у рекламного слота нет подписи для доступности`);
        }
    }
    if (!/class="ad-label">Реклама</.test(info.html)) {
        fail(`${file}: нет видимой пометки «Реклама»`);
    }
}

// RSS: канал, элементы и соответствие sitemap
{
    const feed = read('feed.xml');
    const items = [...feed.matchAll(/<item>[\s\S]*?<\/item>/g)].map((match) => match[0]);
    if (items.length !== articlePages.length) {
        fail(`feed.xml: элементов ${items.length}, статей ${articlePages.length}`);
    }
    for (const item of items) {
        const link = (item.match(/<link>([^<]+)<\/link>/) || [])[1];
        if (!link) {
            fail('feed.xml: элемент без ссылки');
            continue;
        }
        if (!locs.includes(link)) {
            fail(`feed.xml: ссылка ${link} отсутствует в sitemap`);
        }
        const relative = link.replace('https://kevloro.ru/', '').replace(/\/$/, '');
        if (!exists(`${relative}/index.html`)) {
            fail(`feed.xml: страница ${link} не найдена в репозитории`);
        }
    }
    if (!/<title>[^<]+<\/title>/.test(feed) || !/<description>/.test(feed)) {
        fail('feed.xml: нет заголовка или описания канала');
    }
    ok(`RSS: ${items.length} статей, ссылки сходятся с sitemap`);
}

// Каждый калькулятор ссылается на блог
for (const file of [...APP_PAGES.map((page) => page.file), ...ENGINE_PAGES.map((page) => page.file), ...CONTENT_PAGES.map((page) => page.file)]) {
    if (!pageInfo.get(file).html.includes('href="/blog/"')) {
        fail(`${file}: нет ссылки на /blog/ — блог должен быть связан с калькуляторами`);
    }
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
