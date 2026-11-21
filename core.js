/*!
 * Kevloro 2.0 — расчётное ядро.
 *
 * Чистый модуль без обращений к DOM: им пользуется интерфейс (app.js)
 * и автотесты (tools/test-core.mjs). Работает и в браузере (window.Kevloro),
 * и в Node.js (module.exports).
 */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.Kevloro = Object.assign(root.Kevloro || {}, api);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** Запас на подрезку подложки, доля. */
    var UNDERLAY_RESERVE = 0.05;
    /** Запас на подрезку плинтуса, доля. */
    var SKIRTING_RESERVE = 0.05;
    /** Площадь рулона подложки по умолчанию, м². */
    var DEFAULT_UNDERLAY_AREA = 10;
    /** Ширина одного дверного проёма, по которой оценивается их количество, м. */
    var DOOR_WIDTH = 0.8;
    /** Эпсилон, чтобы 4.26 / 2.13 не превращалось в 3 упаковки из-за погрешности float. */
    var EPS = 1e-9;

    /**
     * Приводит значение к числу. Пустая строка, null, мусор и «1,5» обрабатываются.
     * @param {*} value
     * @param {number} [fallback=0]
     * @returns {number}
     */
    function toNumber(value, fallback) {
        var def = typeof fallback === 'number' ? fallback : 0;
        if (value === null || value === undefined || value === '') {
            return def;
        }
        var n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.').trim());
        return Number.isFinite(n) ? n : def;
    }

    /**
     * То же, что toNumber, но отрицательные значения поднимаются до нуля.
     * @param {*} value
     * @returns {number}
     */
    function nonNegative(value) {
        var n = toNumber(value, 0);
        return n > 0 ? n : 0;
    }

    /**
     * Округление вверх с защитой от погрешности плавающей точки.
     * @param {number} value
     * @returns {number}
     */
    function ceilSafe(value) {
        if (!Number.isFinite(value) || value <= 0) {
            return 0;
        }
        return Math.ceil(value - EPS);
    }

    /**
     * Площадь помещения, м².
     * @param {object} room
     * @returns {number}
     */
    function roomArea(room) {
        if (!room) {
            return 0;
        }
        if (room.type === 'custom') {
            return nonNegative(room.customArea);
        }
        return nonNegative(room.length) * nonNegative(room.width);
    }

    /**
     * Периметр помещения, м.
     * @param {object} room
     * @returns {number}
     */
    function roomPerimeter(room) {
        if (!room) {
            return 0;
        }
        if (room.type === 'custom') {
            return nonNegative(room.customPerimeter);
        }
        var length = nonNegative(room.length);
        var width = nonNegative(room.width);
        if (length === 0 || width === 0) {
            return 0;
        }
        return (length + width) * 2;
    }

    /**
     * Оценка количества дверных проёмов в помещении по суммарной ширине.
     * @param {object} room
     * @returns {number}
     */
    function roomDoors(room) {
        var width = nonNegative(room && room.doorWidth);
        if (width <= 0) {
            return 0;
        }
        return Math.max(1, Math.round(width / DOOR_WIDTH));
    }

    /**
     * Нормализует входное состояние: любые поля могут отсутствовать.
     * @param {object} [input]
     * @returns {object}
     */
    function normalizeState(input) {
        var state = input || {};
        var rooms = Array.isArray(state.rooms) ? state.rooms : [];

        return {
            rooms: rooms.map(function (room, index) {
                var source = room || {};
                var type = source.type === 'custom' ? 'custom' : 'rect';
                var layout = toNumber(source.layout, 5);
                if (layout < 0) {
                    layout = 0;
                }
                return {
                    id: source.id === undefined ? index + 1 : source.id,
                    name: typeof source.name === 'string' ? source.name : 'Комната ' + (index + 1),
                    type: type,
                    length: nonNegative(source.length),
                    width: nonNegative(source.width),
                    customArea: nonNegative(source.customArea),
                    customPerimeter: nonNegative(source.customPerimeter),
                    doorWidth: nonNegative(source.doorWidth),
                    layout: layout,
                    isCollapsed: Boolean(source.isCollapsed)
                };
            }),
            packArea: nonNegative(state.packArea),
            pricePerM2: nonNegative(state.pricePerM2),
            priceUnderlay: nonNegative(state.priceUnderlay),
            underlayArea: nonNegative(state.underlayArea) || DEFAULT_UNDERLAY_AREA,
            priceSkirting: nonNegative(state.priceSkirting),
            skirtingLength: nonNegative(state.skirtingLength) || 2.5,
            thresholdCount: Math.round(nonNegative(state.thresholdCount)),
            pipeCount: Math.round(nonNegative(state.pipeCount)),
            priceCorner: nonNegative(state.priceCorner),
            priceConnector: nonNegative(state.priceConnector),
            priceEndCap: nonNegative(state.priceEndCap),
            priceThreshold: nonNegative(state.priceThreshold),
            pricePipe: nonNegative(state.pricePipe),
            innerCorners: state.innerCorners === null || state.innerCorners === undefined || state.innerCorners === ''
                ? null
                : Math.round(nonNegative(state.innerCorners)),
            outerCorners: state.outerCorners === null || state.outerCorners === undefined || state.outerCorners === ''
                ? 0
                : Math.round(nonNegative(state.outerCorners)),
            hasHeating: Boolean(state.hasHeating),
            clientInfo: typeof state.clientInfo === 'string' ? state.clientInfo : ''
        };
    }

    /**
     * Полный расчёт сметы.
     *
     * @param {object} input состояние калькулятора
     * @returns {object} подробный результат со всеми промежуточными величинами и сметой
     */
    function computeEstimate(input) {
        var state = normalizeState(input);
        var warnings = [];

        var netArea = 0;
        var grossArea = 0;
        var perimeter = 0;
        var doorsWidth = 0;
        var doors = 0;

        var rooms = state.rooms.map(function (room) {
            var area = roomArea(room);
            var roomPerimeterValue = roomPerimeter(room);
            var roomDoorsCount = roomDoors(room);
            var gross = area * (1 + room.layout / 100);

            netArea += area;
            grossArea += gross;
            perimeter += roomPerimeterValue;
            doorsWidth += room.doorWidth;
            doors += roomDoorsCount;

            return {
                id: room.id,
                name: room.name,
                type: room.type,
                area: area,
                perimeter: roomPerimeterValue,
                grossArea: gross,
                layout: room.layout,
                doors: roomDoorsCount
            };
        });

        if (rooms.length === 0) {
            warnings.push('Добавьте хотя бы одно помещение — без комнат смета пустая.');
        } else if (netArea <= 0) {
            warnings.push('Укажите длину и ширину помещений (или площадь для сложной формы).');
        }

        // Покрытие: пачки и фактическая площадь закупки.
        var packs = 0;
        var boughtArea = grossArea;
        var packAreaKnown = state.packArea > 0;
        if (packAreaKnown) {
            packs = ceilSafe(grossArea / state.packArea);
            boughtArea = packs * state.packArea;
        } else if (grossArea > 0) {
            warnings.push('Не указана площадь покрытия в пачке — количество упаковок не рассчитано.');
        }

        // Подложка: рулоны с запасом 5 %.
        var underlayAreaPerRoll = state.underlayArea;
        var underlayRolls = ceilSafe((netArea * (1 + UNDERLAY_RESERVE)) / underlayAreaPerRoll);

        // Плинтус: чистый периметр за вычетом проёмов, запас 5 %.
        var cleanPerimeter = Math.max(0, perimeter - doorsWidth);
        var skirtingPieces = ceilSafe((cleanPerimeter * (1 + SKIRTING_RESERVE)) / state.skirtingLength);

        // Фурнитура.
        var innerCorners = state.innerCorners === null ? rooms.length * 4 : state.innerCorners;
        var outerCorners = state.outerCorners;
        var connectors = Math.max(0, skirtingPieces - innerCorners);
        var endCaps = doors;
        var thresholds = state.thresholdCount;
        var pipes = state.pipeCount;

        // Стоимость по позициям.
        var costCover = Math.round(boughtArea * state.pricePerM2);
        var costUnderlay = Math.round(underlayRolls * state.priceUnderlay);
        var costSkirting = Math.round(skirtingPieces * state.priceSkirting);
        var costCorners = Math.round((innerCorners + outerCorners) * state.priceCorner);
        var costConnectors = Math.round(connectors * state.priceConnector);
        var costEndCaps = Math.round(endCaps * state.priceEndCap);
        var costThresholds = Math.round(thresholds * state.priceThreshold);
        var costPipes = Math.round(pipes * state.pricePipe);

        var total = costCover + costUnderlay + costSkirting + costCorners +
            costConnectors + costEndCaps + costThresholds + costPipes;

        return {
            state: state,
            rooms: rooms,
            netArea: netArea,
            grossArea: grossArea,
            perimeter: perimeter,
            doorsWidth: doorsWidth,
            cleanPerimeter: cleanPerimeter,
            doors: doors,
            packArea: state.packArea,
            packAreaKnown: packAreaKnown,
            packs: packs,
            boughtArea: boughtArea,
            underlayAreaPerRoll: underlayAreaPerRoll,
            underlayRolls: underlayRolls,
            underlayAreaTotal: underlayRolls * underlayAreaPerRoll,
            skirtingLength: state.skirtingLength,
            skirtingPieces: skirtingPieces,
            innerCorners: innerCorners,
            outerCorners: outerCorners,
            connectors: connectors,
            endCaps: endCaps,
            thresholds: thresholds,
            pipes: pipes,
            costs: {
                cover: costCover,
                underlay: costUnderlay,
                skirting: costSkirting,
                corners: costCorners,
                connectors: costConnectors,
                endCaps: costEndCaps,
                thresholds: costThresholds,
                pipes: costPipes,
                total: total
            },
            warnings: warnings
        };
    }

    return {
        toNumber: toNumber,
        nonNegative: nonNegative,
        ceilSafe: ceilSafe,
        roomArea: roomArea,
        roomPerimeter: roomPerimeter,
        roomDoors: roomDoors,
        normalizeState: normalizeState,
        computeEstimate: computeEstimate,
        constants: {
            UNDERLAY_RESERVE: UNDERLAY_RESERVE,
            SKIRTING_RESERVE: SKIRTING_RESERVE,
            DEFAULT_UNDERLAY_AREA: DEFAULT_UNDERLAY_AREA,
            DOOR_WIDTH: DOOR_WIDTH
        }
    };
});
