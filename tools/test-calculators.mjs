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

/* -------------------------------------------------------- гипсокартон */

test('гипсокартон: листы, профиль и крепёж', () => {
    const result = Calcs.gipsokarton.compute({ area: 20, perimeter: 18, reserve: 10, sheet: 3, studStep: 0.6 });
    assert.equal(findRow(result, 'Площадь с запасом').value, 22);
    assert.equal(findRow(result, 'Листов').value, 8);
    assert.equal(findRow(result, 'Стоечный профиль CD').value, 15);
    assert.equal(findRow(result, 'Направляющий профиль UD').value, 7);
    assert.equal(findRow(result, 'Подвесы').value, 30);
    assert.equal(findRow(result, 'Саморезы').value, 600);
});

test('гипсокартон: частый шаг стоек увеличивает каркас', () => {
    const rare = Calcs.gipsokarton.compute({ area: 20, perimeter: 18, reserve: 0, sheet: 3, studStep: 0.6 });
    const dense = Calcs.gipsokarton.compute({ area: 20, perimeter: 18, reserve: 0, sheet: 3, studStep: 0.4 });
    assert.ok(findRow(dense, 'Стоечный профиль CD').value > findRow(rare, 'Стоечный профиль CD').value);
    assert.ok(findRow(dense, 'Подвесы').value > findRow(rare, 'Подвесы').value);
});

test('гипсокартон: стоимость и итог', () => {
    const result = Calcs.gipsokarton.compute({
        area: 20, perimeter: 18, reserve: 10, sheet: 3, studStep: 0.6,
        priceSheet: 900, priceProfile: 350, priceSuspension: 30
    });
    const sum = result.groups.flatMap((group) => group.rows).reduce((total, item) => total + (item.sum || 0), 0);
    assert.equal(result.total, sum);
    assert.equal(result.total, 8 * 900 + 22 * 350 + 30 * 30);
});

test('гипсокартон: нулевая площадь — предупреждение', () => {
    const result = Calcs.gipsokarton.compute({ area: 0 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.length > 0);
});

/* --------------------------------------------------------- штукатурка */

test('штукатурка: гипсовая 10 мм на 30 м²', () => {
    const result = Calcs.shtukaturka.compute({ area: 30, thickness: 10, mix: 'gips', bagWeight: 30 });
    assert.equal(findRow(result, 'Расход на 1 м²').value, 9);
    assert.equal(findRow(result, 'Всего смеси').value, 270);
    assert.equal(findRow(result, 'Мешков').value, 9);
    assert.equal(findRow(result, 'Вода').value, 162);
});

test('штукатурка: цементная расходуется почти вдвое больше', () => {
    const gips = Calcs.shtukaturka.compute({ area: 30, thickness: 10, mix: 'gips', bagWeight: 30 });
    const cement = Calcs.shtukaturka.compute({ area: 30, thickness: 10, mix: 'cement', bagWeight: 30 });
    assert.ok(findRow(cement, 'Всего смеси').value > findRow(gips, 'Всего смеси').value * 1.7);
});

test('штукатурка: толщина 20 мм удваивает расход', () => {
    const thin = Calcs.shtukaturka.compute({ area: 30, thickness: 10, mix: 'gips', bagWeight: 30 });
    const thick = Calcs.shtukaturka.compute({ area: 30, thickness: 20, mix: 'gips', bagWeight: 30 });
    assert.equal(findRow(thick, 'Всего смеси').value, findRow(thin, 'Всего смеси').value * 2);
});

test('штукатурка: грунт и стоимость', () => {
    const result = Calcs.shtukaturka.compute({ area: 30, thickness: 10, mix: 'gips', bagWeight: 30, priceBag: 450, pricePrimer: 700 });
    assert.equal(findRow(result, 'Грунт').value, 6);
    assert.equal(findRow(result, 'Канистр').value, 1);
    assert.equal(result.total, 9 * 450 + 700);
});

/* --------------------------------------------------------- тёплый пол */

test('тёплый пол: мат 150 Вт/м²', () => {
    const result = Calcs.teplyyPol.compute({ area: 10, system: 'mat' });
    assert.equal(findRow(result, 'Общая мощность').value, 1500);
    assert.equal(findRow(result, 'Удельная мощность').value, 150);
    assert.equal(findRow(result, 'Длина кабеля').value, 0);
    assert.ok(result.notes[0].includes('1,5 мм²'));
});

test('тёплый пол: кабель с шагом 10 см даёт 10 м на метр', () => {
    const result = Calcs.teplyyPol.compute({ area: 10, system: 'cable10' });
    assert.equal(findRow(result, 'Общая мощность').value, 1800);
    assert.equal(findRow(result, 'Длина кабеля').value, 100);
});

test('тёплый пол: шаг 15 см экономит кабель', () => {
    const step10 = Calcs.teplyyPol.compute({ area: 10, system: 'cable10' });
    const step15 = Calcs.teplyyPol.compute({ area: 10, system: 'cable15' });
    assert.ok(findRow(step15, 'Длина кабеля').value < findRow(step10, 'Длина кабеля').value);
    assert.ok(findRow(step15, 'Общая мощность').value < findRow(step10, 'Общая мощность').value);
});

test('тёплый пол: большая площадь требует отдельной линии', () => {
    const result = Calcs.teplyyPol.compute({ area: 30, system: 'mat' });
    assert.equal(findRow(result, 'Общая мощность').value, 4500);
    assert.ok(result.notes[0].includes('2,5 мм²'));
});

test('тёплый пол: стоимость системы и терморегулятора', () => {
    const result = Calcs.teplyyPol.compute({ area: 10, system: 'mat', priceM2: 2500, priceThermostat: 3500 });
    assert.equal(result.total, 10 * 2500 + 3500);
});

test('тёплый пол: нулевая площадь — предупреждение', () => {
    const result = Calcs.teplyyPol.compute({ area: 0 });
    assert.equal(result.total, 0);
    assert.ok(result.warnings.length > 0);
});

console.log('');
if (failures.length > 0) {
    console.error(`Провалено тестов: ${failures.length}, успешно: ${passed}`);
    process.exit(1);
}
console.log(`Все тесты пройдены: ${passed}`);
