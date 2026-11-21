/**
 * Автотесты расчётного ядра Kevloro.
 * Запуск: node tools/test-core.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const Core = require('../core.js');

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

function rect(overrides = {}) {
    return {
        id: 1,
        name: 'Гостиная',
        type: 'rect',
        length: 5,
        width: 3,
        doorWidth: 0.8,
        layout: 5,
        ...overrides
    };
}

/** Одна комната 15 м², пачка 2,13 м², запас 5 %. */
function baseState(overrides = {}) {
    return {
        rooms: [rect()],
        packArea: 2.13,
        pricePerM2: 1000,
        underlayArea: 10,
        priceUnderlay: 0,
        skirtingLength: 2.5,
        priceSkirting: 0,
        thresholdCount: 1,
        pipeCount: 0,
        ...overrides
    };
}

console.log('Kevloro core.js — автотесты\n');

test('площадь и периметр прямоугольной комнаты', () => {
    assert.equal(Core.roomArea(rect()), 15);
    assert.equal(Core.roomPerimeter(rect()), 16);
});

test('площадь и периметр комнаты сложной формы', () => {
    const room = { type: 'custom', customArea: 22.4, customPerimeter: 19.6 };
    assert.equal(Core.roomArea(room), 22.4);
    assert.equal(Core.roomPerimeter(room), 19.6);
});

test('площадь с запасом 5 % и упаковки вверх', () => {
    const model = Core.computeEstimate(baseState());
    assert.equal(Number(model.netArea.toFixed(2)), 15);
    assert.equal(Number(model.grossArea.toFixed(2)), 15.75);
    assert.equal(model.packs, 8);
    assert.equal(Number(model.boughtArea.toFixed(2)), 17.04);
});

test('точное деление площади на пачку не даёт лишнюю упаковку', () => {
    // 4,26 / 2,13 = ровно 2 — погрешность float не должна превращать в 3.
    const model = Core.computeEstimate({
        rooms: [{ type: 'custom', customArea: 4.26, customPerimeter: 8, layout: 0 }],
        packArea: 2.13
    });
    assert.equal(model.packs, 2);
});

test('запас 10 % и 15 % по комнате', () => {
    const ten = Core.computeEstimate(baseState({ rooms: [rect({ layout: 10 })] }));
    const fifteen = Core.computeEstimate(baseState({ rooms: [rect({ layout: 15 })] }));
    assert.equal(Number(ten.grossArea.toFixed(2)), 16.5);
    assert.equal(Number(fifteen.grossArea.toFixed(2)), 17.25);
});

test('подложка считается с запасом 5 % по рулонам', () => {
    const model = Core.computeEstimate(baseState());
    // 15 × 1,05 = 15,75 → 2 рулона по 10 м².
    assert.equal(model.underlayRolls, 2);
    assert.equal(model.underlayAreaTotal, 20);
});

test('подложка: 55 м² и рулон 10 м²', () => {
    const model = Core.computeEstimate({
        rooms: [{ type: 'custom', customArea: 55, customPerimeter: 30 }],
        packArea: 2.13
    });
    // 55 × 1,05 = 57,75 → 6 рулонов.
    assert.equal(model.underlayRolls, 6);
});

test('подложка: нестандартная площадь рулона', () => {
    const model = Core.computeEstimate(baseState({ underlayArea: 15 }));
    // 15,75 / 15 → 2 рулона.
    assert.equal(model.underlayRolls, 2);
});

test('плинтус: чистый периметр за вычетом проёмов и +5 %', () => {
    const model = Core.computeEstimate(baseState());
    assert.equal(Number(model.cleanPerimeter.toFixed(1)), 15.2);
    // 15,2 × 1,05 = 15,96 → 7 планок по 2,5 м.
    assert.equal(model.skirtingPieces, 7);
});

test('плинтус: другая длина планки меняет количество', () => {
    const model = Core.computeEstimate(baseState({ skirtingLength: 2.0 }));
    assert.equal(model.skirtingPieces, 8);
});

test('углы: автоматически 4 на помещение', () => {
    const model = Core.computeEstimate(baseState({ rooms: [rect(), rect({ id: 2 })] }));
    assert.equal(model.innerCorners, 8);
});

test('углы: ручное значение переопределяет авто', () => {
    const model = Core.computeEstimate(baseState({ innerCorners: 6, outerCorners: 2 }));
    assert.equal(model.innerCorners, 6);
    assert.equal(model.outerCorners, 2);
});

test('соединители не уходят в минус', () => {
    const model = Core.computeEstimate(baseState({ rooms: [rect(), rect({ id: 2 }), rect({ id: 3 })], innerCorners: 40 }));
    assert.equal(model.connectors, 0);
});

test('соединители = планки минус внутренние углы', () => {
    const model = Core.computeEstimate(baseState());
    assert.equal(model.connectors, model.skirtingPieces - model.innerCorners);
});

test('заглушки по числу проёмов, без проёмов — 0', () => {
    assert.equal(Core.computeEstimate(baseState()).endCaps, 1);
    assert.equal(Core.computeEstimate(baseState({ rooms: [rect({ doorWidth: 0 })] })).endCaps, 0);
    assert.equal(Core.computeEstimate(baseState({ rooms: [rect({ doorWidth: 2.4 })] })).endCaps, 3);
});

test('стоимость: покрытие считается по фактически покупаемым пачкам', () => {
    const model = Core.computeEstimate(baseState({ pricePerM2: 1000 }));
    assert.equal(model.costs.cover, 17040);
    assert.equal(model.costs.total, 17040);
});

test('стоимость: сумма всех позиций', () => {
    const model = Core.computeEstimate(baseState({
        pricePerM2: 1000,
        priceUnderlay: 850,
        priceSkirting: 220,
        priceCorner: 90,
        priceConnector: 60,
        priceEndCap: 70,
        priceThreshold: 450,
        pricePipe: 300,
        thresholdCount: 2,
        pipeCount: 1
    }));
    const expected =
        model.costs.cover + model.costs.underlay + model.costs.skirting + model.costs.corners +
        model.costs.connectors + model.costs.endCaps + model.costs.thresholds + model.costs.pipes;
    assert.equal(model.costs.total, expected);
    assert.ok(model.costs.total > model.costs.cover, 'фурнитура должна попадать в итог');
    assert.equal(model.costs.thresholds, 900);
    assert.equal(model.costs.pipes, 300);
});

test('без цены пачки упаковки не считаются, но площадь остаётся', () => {
    const model = Core.computeEstimate(baseState({ packArea: 0 }));
    assert.equal(model.packAreaKnown, false);
    assert.equal(model.packs, 0);
    assert.equal(Number(model.boughtArea.toFixed(2)), 15.75);
    assert.ok(model.warnings.some((text) => text.includes('пачке')));
});

test('пустая смета предупреждает, но не падает', () => {
    const model = Core.computeEstimate({ rooms: [] });
    assert.equal(model.netArea, 0);
    assert.equal(model.packs, 0);
    assert.ok(model.warnings.length >= 1);
});

test('отрицательные значения обнуляются', () => {
    const model = Core.computeEstimate({
        rooms: [rect({ length: -5, width: 3, doorWidth: -1 })],
        packArea: -2
    });
    assert.equal(model.netArea, 0);
    assert.equal(model.doorsWidth, 0);
    assert.equal(model.packAreaKnown, false);
});

test('строковые значения и запятая как разделитель', () => {
    const model = Core.computeEstimate({
        rooms: [{ type: 'rect', length: '5,5', width: '2', doorWidth: '0,8', layout: '10' }],
        packArea: '2,5'
    });
    assert.equal(Number(model.netArea.toFixed(2)), 11);
    assert.equal(model.packs, Math.ceil((11 * 1.1) / 2.5));
});

test('мусор в полях не даёт NaN', () => {
    const model = Core.computeEstimate({
        rooms: [{ type: 'rect', length: 'abc', width: null, doorWidth: {} }],
        packArea: undefined,
        pricePerM2: 'x'
    });
    const numeric = [model.netArea, model.grossArea, model.packs, model.costs.total, model.perimeter];
    numeric.forEach((value) => assert.ok(Number.isFinite(value), `значение не число: ${value}`));
});

test('несколько помещений суммируются', () => {
    const model = Core.computeEstimate(baseState({
        rooms: [rect(), rect({ id: 2, length: 4, width: 2.5 }), rect({ id: 3, type: 'custom', customArea: 10.5, customPerimeter: 13 })]
    }));
    assert.equal(Number(model.netArea.toFixed(2)), 35.5);
    assert.equal(model.rooms.length, 3);
    assert.equal(model.innerCorners, 12);
});

test('нормализация сохраняет данные комнат и режим укладки', () => {
    const state = Core.normalizeState(baseState({ rooms: [rect({ name: 'Кухня', layout: '10' })] }));
    assert.equal(state.rooms[0].name, 'Кухня');
    assert.equal(state.rooms[0].layout, 10);
    assert.equal(state.skirtingLength, 2.5);
    assert.equal(state.underlayArea, 10);
});

console.log('');
if (failures.length > 0) {
    console.error(`Провалено тестов: ${failures.length}, успешно: ${passed}`);
    process.exit(1);
}
console.log(`Все тесты пройдены: ${passed}`);
