/**
 * Автотесты калькуляторов отделки (calculators.js).
 * Запуск: node tools/test-calculators.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const Calcs = require('../calculators.js');

let passed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok  ${name}`);
    } catch (error) {
        failures.push({ name, error });
        console.log(`FAIL  ${name}\n      ${error.message}`);
    }
}

function index(rows) {
    const map = {};
    rows.forEach((group) => {
        group.rows.forEach((item) => {
            map[item.label] = item;
        });
    });
    return map;
}

function findRow(result, labelPart) {
    for (const group of result.groups) {
        for (const item of group.rows) {
            if (item.label.toLowerCase().includes(labelPart.toLowerCase())) {
                return item;
            }
        }
    }
    throw new Error(`строка «${labelPart}» не найдена`);
}

console.log('Kevloro calculators.js — автотесты\n');

/* ------------------------------------------------------------------ плитка */

test('плитка: площадь с запасом и упаковки', () => {
    const result = Calcs.plitka.compute({ area: 20, reserve: 10, packArea: 1.44, format: '600x600', joint: 2, trowel: 8 });
    assert.equal(Number(findRow(result, 'Площадь с запасом').value.toFixed(2)), 22);
    assert.equal(findRow(result, 'Упаковок').value, 16);
    assert.equal(Number(findRow(result, 'купленной плитки').value.toFixed(2)), 23.04);
});

test('плитка: точное деление не даёт лишнюю упаковку', () => {
    const result = Calcs.plitka.compute({ area: 14.4, reserve: 0, packArea: 1.44, format: '600x600', joint: 2, trowel: 8 });
    assert.equal(findRow(result, 'Упаковок').value, 10);
});

test('плитка: клей по гребёнке шпателя', () => {
    const result = Calcs.plitka.compute({ area: 20, reserve: 10, packArea: 1.44, format: '600x600', joint: 2, trowel: 8, glueBag: 25 });
    assert.equal(Number(findRow(result, 'Клей').value.toFixed(1)), 80);
    assert.equal(findRow(result, 'Мешков клея').value, 4);

    const wide = Calcs.plitka.compute({ area: 20, reserve: 10, packArea: 1.44, format: '600x600', joint: 2, trowel: 12, glueBag: 25 });
    assert.ok(findRow(wide, 'Клей').value > findRow(result, 'Клей').value);
});

test('плитка: мелкий формат требует больше затирки', () => {
    const big = Calcs.plitka.compute({ area: 10, reserve: 0, packArea: 1.44, format: '600x600', joint: 2, trowel: 8 });
    const small = Calcs.plitka.compute({ area: 10, reserve: 0, packArea: 1.44, format: '150x150', joint: 2, trowel: 8 });
    assert.ok(findRow(small, 'Затирка').value > findRow(big, 'Затирка').value);
    assert.ok(findRow(big, 'Затирка').value > 0);
});

test('плитка: широкий шов увеличивает затирку', () => {
    const thin = Calcs.plitka.compute({ area: 10, reserve: 0, packArea: 1.44, format: '300x300', joint: 1, trowel: 8 });
    const wide = Calcs.plitka.compute({ area: 10, reserve: 0, packArea: 1.44, format: '300x300', joint: 4, trowel: 8 });
    assert.ok(findRow(wide, 'Затирка').value > findRow(thin, 'Затирка').value * 3.5);
});

test('плитка: стоимость складывается из позиций', () => {
    const result = Calcs.plitka.compute({
        area: 20, reserve: 10, packArea: 1.44, format: '600x600', joint: 2, trowel: 8,
        glueBag: 25, groutBag: 2, pricePack: 1200, priceGlue: 450, priceGrout: 350
    });
    const sum = result.groups.flatMap((group) => group.rows).reduce((total, item) => total + (item.sum || 0), 0);
    assert.equal(result.total, sum);
    assert.equal(result.total, 16 * 1200 + 4 * 450 + 2 * 350);
});

test('плитка: пустая площадь даёт предупреждение, а не NaN', () => {
    const result = Calcs.plitka.compute({ area: 0, packArea: 1.44 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(Number.isFinite(result.groups[0].rows[0].value));
});

/* -------------------------------------------------------------------- обои */

test('обои: периметр, площадь стен и рулоны', () => {
    const result = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 1, doors: 1, rollWidth: 0.53, rollLength: 10.05, pattern: 0 });
    assert.equal(findRow(result, 'Периметр').value, 18);
    assert.equal(Number(findRow(result, 'Площадь стен').value.toFixed(1)), 44.6);
    assert.equal(findRow(result, 'Полотен нужно').value, 34);
    assert.equal(findRow(result, 'Полотен в одном рулоне').value, 3);
    assert.equal(findRow(result, 'Рулонов').value, 12);
});

test('обои: раппорт увеличивает длину полотна и не уменьшает рулоны', () => {
    const plain = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 1, doors: 1, rollWidth: 0.53, rollLength: 10.05, pattern: 0 });
    const patterned = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 1, doors: 1, rollWidth: 0.53, rollLength: 10.05, pattern: 0.64 });
    assert.ok(findRow(patterned, 'Длина полотна').value > findRow(plain, 'Длина полотна').value);
    assert.ok(findRow(patterned, 'Рулонов').value >= findRow(plain, 'Рулонов').value);
});

test('обои: широкий рулон сокращает число полотен', () => {
    const narrow = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 0, doors: 0, rollWidth: 0.53, rollLength: 10.05 });
    const wide = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 0, doors: 0, rollWidth: 1.06, rollLength: 10.05 });
    assert.ok(findRow(wide, 'Полотен нужно').value < findRow(narrow, 'Полотен нужно').value);
});

test('обои: полотно выше рулона — предупреждение вместо деления на ноль', () => {
    const result = Calcs.oboi.compute({ length: 5, width: 4, height: 12, windows: 0, doors: 0, rollWidth: 0.53, rollLength: 10.05 });
    assert.equal(findRow(result, 'Полотен в одном рулоне').value, 0);
    assert.ok(result.warnings.some((text) => text.includes('рулона')));
});

test('обои: клей — одна пачка на пять рулонов', () => {
    const result = Calcs.oboi.compute({ length: 5, width: 4, height: 2.7, windows: 1, doors: 1, rollWidth: 0.53, rollLength: 10.05, priceRoll: 3000, priceGlue: 400 });
    const rolls = findRow(result, 'Рулонов').value;
    assert.equal(findRow(result, 'Клей').value, Math.ceil(rolls / 5));
    assert.equal(result.total, rolls * 3000 + Math.ceil(rolls / 5) * 400);
});

test('обои: пустая комната не даёт NaN', () => {
    const result = Calcs.oboi.compute({ length: 0, width: 0, height: 0 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(Number.isFinite(result.groups[0].rows[0].value));
});

/* ------------------------------------------------------------------ краска */

test('краска: литры по площади, слоям и типу', () => {
    const result = Calcs.kraska.compute({ area: 40, coats: 2, paintType: 'water', canSize: 5 });
    assert.equal(Number(findRow(result, 'один слой').value.toFixed(2)), 4.8);
    assert.equal(Number(findRow(result, 'Всего краски').value.toFixed(2)), 9.6);
    assert.equal(findRow(result, 'Банок').value, 2);
});

test('краска: масляная расходуется больше', () => {
    const water = Calcs.kraska.compute({ area: 40, coats: 2, paintType: 'water' });
    const oil = Calcs.kraska.compute({ area: 40, coats: 2, paintType: 'oil' });
    assert.ok(findRow(oil, 'Всего краски').value > findRow(water, 'Всего краски').value);
});

test('краска: грунт считается отдельно', () => {
    const result = Calcs.kraska.compute({ area: 40, coats: 2, paintType: 'water', pricePrimer: 900 });
    assert.equal(findRow(result, 'Грунт').value, 4);
    assert.equal(findRow(result, 'Канистр').value, 1);
    assert.equal(result.total, 900);
});

test('краска: стоимость и итог', () => {
    const result = Calcs.kraska.compute({ area: 40, coats: 2, paintType: 'water', canSize: 5, priceCan: 2200, pricePrimer: 900 });
    assert.equal(result.total, 2 * 2200 + 1 * 900);
});

test('краска: ноль площади — предупреждение и нули', () => {
    const result = Calcs.kraska.compute({ area: 0 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.length > 0);
});

/* ----------------------------------------------------------------- стяжка */

test('стяжка: пескобетон 5 см на 20 м²', () => {
    const result = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'peskobeton', reserve: 10, bagWeight: 25 });
    assert.equal(Number(findRow(result, 'Расход сухой').value.toFixed(1)), 100);
    assert.equal(findRow(result, 'Вес смеси').value, 2200);
    assert.equal(findRow(result, 'Мешков').value, 88);
    assert.equal(Number(findRow(result, 'Вода').value.toFixed(1)), 374);
    assert.equal(Number(findRow(result, 'Объём').value.toFixed(3)), 1.222);
});

test('стяжка: наливной пол считается по другой норме', () => {
    const screed = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'peskobeton', bagWeight: 25 });
    const selfLevel = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'nalivnoy', bagWeight: 25 });
    assert.ok(findRow(screed, 'Вес смеси').value > findRow(selfLevel, 'Вес смеси').value);
});

test('стяжка: больший мешок уменьшает количество', () => {
    const small = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'peskobeton', bagWeight: 25 });
    const big = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'peskobeton', bagWeight: 40 });
    assert.ok(findRow(big, 'Мешков').value < findRow(small, 'Мешков').value);
});

test('стяжка: грунтовка и стоимость', () => {
    const result = Calcs.styazhka.compute({ area: 20, thickness: 50, mix: 'peskobeton', bagWeight: 25, priceBag: 320, pricePrimer: 700 });
    assert.equal(findRow(result, 'Грунт').value, 5);
    assert.equal(findRow(result, 'Канистр').value, 1);
    assert.equal(result.total, 88 * 320 + 700);
});

test('стяжка: нулевая толщина — предупреждение', () => {
    const result = Calcs.styazhka.compute({ area: 20, thickness: 0 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.some((text) => text.includes('толщину')));
});

/* ------------------------------------------------------------ общее */

test('все калькуляторы описаны полями и группами', () => {
    ['plitka', 'oboi', 'kraska', 'styazhka'].forEach((id) => {
        const calc = Calcs[id];
        assert.ok(calc, `нет калькулятора ${id}`);
        assert.ok(Array.isArray(calc.groups) && calc.groups.length > 0, `${id}: нет групп полей`);
        assert.ok(calc.summaryTitle && calc.fileBase, `${id}: нет метаданных`);
        calc.groups.forEach((group) => {
            group.fields.forEach((field) => {
                assert.ok(field.id && field.label, `${id}: поле без id или label`);
                if (field.type === 'select') {
                    assert.ok(Array.isArray(field.options) && field.options.length > 0, `${id}.${field.id}: нет options`);
                }
            });
        });
    });
});

test('мусор в полях не ломает расчёт', () => {
    ['plitka', 'oboi', 'kraska', 'styazhka'].forEach((id) => {
        const result = Calcs[id].compute({ area: 'abc', length: null, width: {}, thickness: 'x', pricePack: 'y' });
        assert.ok(Number.isFinite(result.total), `${id}: total не число`);
        result.groups.forEach((group) => {
            group.rows.forEach((item) => {
                assert.ok(Number.isFinite(item.value), `${id}: ${item.label} не число`);
            });
        });
    });
});

console.log('');
if (failures.length > 0) {
    console.error(`Провалено тестов: ${failures.length}, успешно: ${passed}`);
    process.exit(1);
}
console.log(`Все тесты пройдены: ${passed}`);
