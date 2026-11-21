/*!
 * Kevloro 2.2 — реестр калькуляторов отделки.
 *
 * Каждый калькулятор описывает поля ввода и функцию compute(state),
 * которая возвращает готовые группы строк для интерфейса, экспорта и печати.
 * Чистый модуль без DOM: используется движком (engine.js) и тестами.
 */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.KevloroCalcs = Object.assign(root.KevloroCalcs || {}, api);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var EPS = 1e-9;
    var GROUT_DENSITY = 1.6;
    var GROUT_REALITY_FACTOR = 2.0;
    var SCREED_DENSITY = 1800;
    var PRIMER_RATE = 0.25;
    var PRIMER_CAN = 10;

    function num(value, fallback) {
        var def = typeof fallback === 'number' ? fallback : 0;
        if (value === null || value === undefined || value === '') {
            return def;
        }
        var n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.').trim());
        return Number.isFinite(n) ? n : def;
    }

    function positive(value) {
        var n = num(value, 0);
        return n > 0 ? n : 0;
    }

    function ceilSafe(value) {
        if (!Number.isFinite(value) || value <= 0) {
            return 0;
        }
        return Math.ceil(value - EPS);
    }

    function row(label, value, unit, decimals, sum, highlight) {
        return {
            label: label,
            value: value,
            unit: unit,
            decimals: typeof decimals === 'number' ? decimals : 0,
            sum: typeof sum === 'number' && sum > 0 ? sum : null,
            highlight: Boolean(highlight)
        };
    }

    function money(values) {
        return values.reduce(function (total, value) {
            return total + (Number(value) || 0);
        }, 0);
    }

    /* =====================================================================
       Плитка и керамогранит
       ===================================================================== */

    var TILE_FORMATS = [
        { value: '600x600', label: '60 × 60 см', sides: [600, 600], thickness: 9 },
        { value: '600x300', label: '60 × 30 см', sides: [600, 300], thickness: 9 },
        { value: '300x300', label: '30 × 30 см', sides: [300, 300], thickness: 8 },
        { value: '300x200', label: '30 × 20 см', sides: [300, 200], thickness: 7.5 },
        { value: '150x150', label: '15 × 15 см', sides: [150, 150], thickness: 6.5 },
        { value: '1200x600', label: '120 × 60 см', sides: [1200, 600], thickness: 10 }
    ];

    var plitka = {
        id: 'plitka',
        storage: 'plitka',
        summaryTitle: 'Смета на плитку и керамогранит',
        fileBase: 'Смета_плитка',
        groups: [
            {
                title: 'Поверхность',
                fields: [
                    { id: 'area', label: 'Площадь укладки', unit: 'м²', type: 'number', min: 0, step: 0.1, value: 20, width: 'half' },
                    {
                        id: 'reserve', label: 'Запас на подрезку', type: 'select', value: 10, width: 'half', options: [
                            { value: 5, label: 'Прямая укладка — 5 %' },
                            { value: 10, label: 'По диагонали — 10 %' },
                            { value: 15, label: 'Сложный расклад — 15 %' }
                        ]
                    }
                ]
            },
            {
                title: 'Плитка',
                fields: [
                    { id: 'format', label: 'Формат плитки', type: 'select', value: '600x600', width: 'half', options: TILE_FORMATS },
                    { id: 'joint', label: 'Ширина шва', unit: 'мм', type: 'number', min: 0, step: 0.5, value: 2, width: 'half', hint: '1–2 мм для керамогранита, 2–4 мм для плитки' },
                    { id: 'packArea', label: 'Площадь в упаковке', unit: 'м²', type: 'number', min: 0, step: 0.01, value: 1.44, width: 'half' },
                    { id: 'pricePack', label: 'Цена упаковки', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 1200' }
                ]
            },
            {
                title: 'Клей и затирка',
                fields: [
                    {
                        id: 'trowel', label: 'Гребёнка шпателя', type: 'select', value: 8, width: 'half', options: [
                            { value: 6, label: '6 мм — плитка до 20 см' },
                            { value: 8, label: '8 мм — плитка 20–40 см' },
                            { value: 10, label: '10 мм — плитка 40–60 см' },
                            { value: 12, label: '12 мм — крупный формат' }
                        ]
                    },
                    { id: 'glueBag', label: 'Мешок клея', unit: 'кг', type: 'number', min: 1, step: 5, value: 25, width: 'half' },
                    { id: 'priceGlue', label: 'Цена мешка клея', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 450' },
                    { id: 'groutBag', label: 'Упаковка затирки', unit: 'кг', type: 'number', min: 0.1, step: 0.5, value: 2, width: 'half' },
                    { id: 'priceGrout', label: 'Цена упаковки затирки', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 350' }
                ]
            }
        ],
        compute: function (state) {
            var area = positive(state.area);
            var reserve = num(state.reserve, 10);
            var format = TILE_FORMATS.filter(function (item) {
                return item.value === String(state.format);
            })[0] || TILE_FORMATS[0];
            var joint = positive(state.joint);
            var packArea = positive(state.packArea);
            var trowel = num(state.trowel, 8);
            var glueBag = positive(state.glueBag);
            var groutBag = positive(state.groutBag);
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь укладки — без неё расчёт невозможен.');
            }
            if (packArea <= 0) {
                warnings.push('Укажите площадь плитки в упаковке.');
            }

            var areaGross = area * (1 + reserve / 100);
            var packs = packArea > 0 ? ceilSafe(areaGross / packArea) : 0;
            var boughtArea = packs * packArea;

            var gluePerM2 = trowel * 0.5;
            var glueKg = area * gluePerM2;
            var glueBags = glueBag > 0 ? ceilSafe(glueKg / glueBag) : 0;

            var sides = format.sides;
            var groutPerM2 = ((sides[0] + sides[1]) / (sides[0] * sides[1])) * joint * format.thickness * GROUT_DENSITY * GROUT_REALITY_FACTOR;
            var groutKg = area * groutPerM2;
            var groutPacks = groutBag > 0 ? ceilSafe(groutKg / groutBag) : 0;

            var costTile = packs * positive(state.pricePack);
            var costGlue = glueBags * positive(state.priceGlue);
            var costGrout = groutPacks * positive(state.priceGrout);
            var total = money([costTile, costGlue, costGrout]);

            return {
                groups: [
                    {
                        title: 'Плитка',
                        rows: [
                            row('Площадь с запасом ' + reserve + ' %', areaGross, 'м²', 2),
                            row('Упаковок к покупке', packs, 'упак.', 0, null, true),
                            row('Площадь купленной плитки', boughtArea, 'м²', 2)
                        ]
                    },
                    {
                        title: 'Клей и затирка',
                        rows: [
                            row('Клей (расход ' + num(gluePerM2, 1) + ' кг/м²)', glueKg, 'кг', 1),
                            row('Мешков клея по ' + glueBag + ' кг', glueBags, 'шт', 0),
                            row('Затирка (шов ' + joint + ' мм)', groutKg, 'кг', 2),
                            row('Упаковок затирки по ' + groutBag + ' кг', groutPacks, 'шт', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row('Плитка', costTile, '₽', 0, costTile),
                            row('Клей', costGlue, '₽', 0, costGlue),
                            row('Затирка', costGrout, '₽', 0, costGrout)
                        ]
                    }
                ],
                total: total,
                warnings: warnings
            };
        }
    };

    /* =====================================================================
       Обои
       ===================================================================== */

    var oboi = {
        id: 'oboi',
        storage: 'oboi',
        summaryTitle: 'Смета на обои',
        fileBase: 'Смета_обои',
        groups: [
            {
                title: 'Комната',
                fields: [
                    { id: 'length', label: 'Длина комнаты', unit: 'м', type: 'number', min: 0, step: 0.1, value: 5, width: 'half' },
                    { id: 'width', label: 'Ширина комнаты', unit: 'м', type: 'number', min: 0, step: 0.1, value: 4, width: 'half' },
                    { id: 'height', label: 'Высота потолка', unit: 'м', type: 'number', min: 0, step: 0.05, value: 2.7, width: 'half' },
                    { id: 'windows', label: 'Окон', unit: 'шт', type: 'number', min: 0, step: 1, value: 1, width: 'half', hint: 'Одно окно ≈ 2,1 м²' },
                    { id: 'doors', label: 'Дверей', unit: 'шт', type: 'number', min: 0, step: 1, value: 1, width: 'half', hint: 'Одна дверь ≈ 1,9 м²' },
                    {
                        id: 'pattern', label: 'Раппорт (шаг рисунка)', type: 'select', value: 0, width: 'half', options: [
                            { value: 0, label: 'Без подгонки' },
                            { value: 0.32, label: '32 см' },
                            { value: 0.53, label: '53 см' },
                            { value: 0.64, label: '64 см' }
                        ]
                    }
                ]
            },
            {
                title: 'Рулон',
                fields: [
                    {
                        id: 'rollWidth', label: 'Ширина рулона', type: 'select', value: 0.53, width: 'half', options: [
                            { value: 0.53, label: '0,53 м (стандарт)' },
                            { value: 1.06, label: '1,06 м (широкие)' }
                        ]
                    },
                    {
                        id: 'rollLength', label: 'Длина рулона', type: 'select', value: 10.05, width: 'half', options: [
                            { value: 10.05, label: '10,05 м' },
                            { value: 15, label: '15 м' },
                            { value: 25, label: '25 м' }
                        ]
                    },
                    { id: 'priceRoll', label: 'Цена рулона', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 3500' },
                    { id: 'priceGlue', label: 'Цена пачки клея', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 400' }
                ]
            }
        ],
        compute: function (state) {
            var length = positive(state.length);
            var width = positive(state.width);
            var height = positive(state.height);
            var windows = Math.round(positive(state.windows));
            var doors = Math.round(positive(state.doors));
            var pattern = positive(state.pattern);
            var rollWidth = positive(state.rollWidth) || 0.53;
            var rollLength = positive(state.rollLength) || 10.05;
            var warnings = [];

            var perimeter = 2 * (length + width);
            var openings = windows * 2.1 + doors * 1.9;
            var wallArea = Math.max(0, perimeter * height - openings);

            if (perimeter <= 0 || height <= 0) {
                warnings.push('Укажите длину, ширину и высоту комнаты.');
            }

            var stripLength = height + 0.1;
            if (pattern > 0) {
                stripLength = Math.ceil(stripLength / pattern - EPS) * pattern;
            }
            var stripsPerRoll = Math.floor(rollLength / stripLength + EPS);
            if (stripsPerRoll < 1) {
                warnings.push('Полотно выше рулона: при таком потолке и раппорте из одного рулона не выходит ни одной полосы.');
            }

            var strips = ceilSafe(perimeter / rollWidth);
            var rolls = stripsPerRoll > 0 ? ceilSafe(strips / stripsPerRoll) : 0;
            var boughtArea = rolls * rollWidth * rollLength;
            var gluePacks = Math.ceil(rolls / 5);

            var costRolls = rolls * positive(state.priceRoll);
            var costGlue = gluePacks * positive(state.priceGlue);
            var total = money([costRolls, costGlue]);

            return {
                groups: [
                    {
                        title: 'Стены',
                        rows: [
                            row('Периметр комнаты', perimeter, 'м', 2),
                            row('Площадь стен без проёмов', wallArea, 'м²', 2),
                            row('Длина полотна с подгонкой', stripLength, 'м', 2)
                        ]
                    },
                    {
                        title: 'Обои',
                        rows: [
                            row('Полотен нужно', strips, 'шт', 0),
                            row('Полотен в одном рулоне', stripsPerRoll, 'шт', 0),
                            row('Рулонов к покупке', rolls, 'рул.', 0, null, true),
                            row('Площадь купленных обоев', boughtArea, 'м²', 2),
                            row('Клей (1 пачка на 5 рулонов)', gluePacks, 'пач.', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row('Обои', costRolls, '₽', 0, costRolls),
                            row('Клей', costGlue, '₽', 0, costGlue)
                        ]
                    }
                ],
                total: total,
                warnings: warnings
            };
        }
    };

    /* =====================================================================
       Краска
       ===================================================================== */

    var kraska = {
        id: 'kraska',
        storage: 'kraska',
        summaryTitle: 'Смета на краску',
        fileBase: 'Смета_краска',
        groups: [
            {
                title: 'Поверхность',
                fields: [
                    { id: 'area', label: 'Площадь окраски', unit: 'м²', type: 'number', min: 0, step: 1, value: 40, width: 'half', hint: 'Стены: периметр × высота, минус окна и двери' },
                    {
                        id: 'coats', label: 'Слоёв', type: 'select', value: 2, width: 'half', options: [
                            { value: 1, label: '1 слой' },
                            { value: 2, label: '2 слоя' },
                            { value: 3, label: '3 слоя' }
                        ]
                    }
                ]
            },
            {
                title: 'Краска',
                fields: [
                    {
                        id: 'paintType', label: 'Тип краски', type: 'select', value: 'water', width: 'half', options: [
                            { value: 'water', label: 'Водоэмульсионная — 0,12 л/м²' },
                            { value: 'acryl', label: 'Акриловая — 0,10 л/м²' },
                            { value: 'latex', label: 'Латексная — 0,10 л/м²' },
                            { value: 'email', label: 'Эмаль — 0,12 л/м²' },
                            { value: 'oil', label: 'Масляная — 0,15 л/м²' }
                        ]
                    },
                    {
                        id: 'canSize', label: 'Объём банки', type: 'select', value: 5, width: 'half', options: [
                            { value: 1, label: '1 л' },
                            { value: 2.5, label: '2,5 л' },
                            { value: 5, label: '5 л' },
                            { value: 9, label: '9 л' },
                            { value: 10, label: '10 л' }
                        ]
                    },
                    { id: 'priceCan', label: 'Цена банки', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 2200' },
                    { id: 'pricePrimer', label: 'Цена канистры грунта 10 л', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 900' }
                ]
            }
        ],
        compute: function (state) {
            var RATES = { water: 0.12, acryl: 0.10, latex: 0.10, email: 0.12, oil: 0.15 };
            var area = positive(state.area);
            var coats = Math.max(1, Math.round(num(state.coats, 2)));
            var rate = RATES[String(state.paintType)] || RATES.water;
            var canSize = positive(state.canSize) || 5;
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь окрашиваемой поверхности.');
            }

            var litersPerCoat = area * rate;
            var liters = litersPerCoat * coats;
            var cans = ceilSafe(liters / canSize);
            var bought = cans * canSize;

            var primerLiters = area * 0.1;
            var primerCans = ceilSafe(primerLiters / 10);

            var costPaint = cans * positive(state.priceCan);
            var costPrimer = primerCans * positive(state.pricePrimer);
            var total = money([costPaint, costPrimer]);

            return {
                groups: [
                    {
                        title: 'Краска',
                        rows: [
                            row('Расход на один слой', litersPerCoat, 'л', 2),
                            row('Всего краски на ' + coats + ' сл.', liters, 'л', 2),
                            row('Банок по ' + canSize + ' л', cans, 'шт', 0, null, true),
                            row('Куплено краски', bought, 'л', 2)
                        ]
                    },
                    {
                        title: 'Грунтовка',
                        rows: [
                            row('Грунт (0,1 л/м²)', primerLiters, 'л', 2),
                            row('Канистр по 10 л', primerCans, 'шт', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row('Краска', costPaint, '₽', 0, costPaint),
                            row('Грунтовка', costPrimer, '₽', 0, costPrimer)
                        ]
                    }
                ],
                total: total,
                warnings: warnings
            };
        }
    };

    /* =====================================================================
       Стяжка и наливной пол
       ===================================================================== */

    var styazhka = {
        id: 'styazhka',
        storage: 'styazhka',
        summaryTitle: 'Смета на стяжку',
        fileBase: 'Смета_стяжка',
        groups: [
            {
                title: 'Помещение',
                fields: [
                    { id: 'area', label: 'Площадь пола', unit: 'м²', type: 'number', min: 0, step: 0.5, value: 20, width: 'half' },
                    { id: 'thickness', label: 'Толщина слоя', unit: 'мм', type: 'number', min: 0, step: 5, value: 50, width: 'half', hint: '5 см = 50 мм' }
                ]
            },
            {
                title: 'Смесь',
                fields: [
                    {
                        id: 'mix', label: 'Тип смеси', type: 'select', value: 'peskobeton', width: 'half', options: [
                            { value: 'peskobeton', label: 'Пескобетон М300 — 2,0 кг/м² на 1 мм' },
                            { value: 'cps', label: 'ЦПС — 1,8 кг/м² на 1 мм' },
                            { value: 'nalivnoy', label: 'Наливной пол — 1,6 кг/м² на 1 мм' }
                        ]
                    },
                    {
                        id: 'reserve', label: 'Запас на неровности', type: 'select', value: 10, width: 'half', options: [
                            { value: 5, label: 'Ровное основание — 5 %' },
                            { value: 10, label: 'Обычное — 10 %' },
                            { value: 15, label: 'Сильные перепады — 15 %' }
                        ]
                    },
                    { id: 'bagWeight', label: 'Вес мешка', unit: 'кг', type: 'number', min: 1, step: 5, value: 25, width: 'half' },
                    { id: 'priceBag', label: 'Цена мешка', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 320' },
                    { id: 'pricePrimer', label: 'Цена канистры грунта 10 л', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 700' }
                ]
            }
        ],
        compute: function (state) {
            var MIXES = {
                peskobeton: { rate: 2.0, water: 0.17, label: 'Пескобетон М300' },
                cps: { rate: 1.8, water: 0.18, label: 'ЦПС' },
                nalivnoy: { rate: 1.6, water: 0.22, label: 'Наливной пол' }
            };
            var area = positive(state.area);
            var thickness = positive(state.thickness);
            var mix = MIXES[String(state.mix)] || MIXES.peskobeton;
            var reserve = num(state.reserve, 10);
            var bagWeight = positive(state.bagWeight) || 25;
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь пола.');
            }
            if (thickness <= 0) {
                warnings.push('Укажите толщину слоя в миллиметрах.');
            }

            var kgPerM2 = thickness * mix.rate;
            var kg = area * kgPerM2 * (1 + reserve / 100);
            var bags = ceilSafe(kg / bagWeight);
            var water = kg * mix.water;
            var volume = kg / SCREED_DENSITY;

            var primerLiters = area * PRIMER_RATE;
            var primerCans = ceilSafe(primerLiters / PRIMER_CAN);

            var costMix = bags * positive(state.priceBag);
            var costPrimer = primerCans * positive(state.pricePrimer);
            var total = money([costMix, costPrimer]);

            return {
                groups: [
                    {
                        title: 'Раствор',
                        rows: [
                            row('Расход сухой смеси', kgPerM2, 'кг/м²', 1),
                            row('Вес смеси с запасом ' + reserve + ' %', kg, 'кг', 0),
                            row('Мешков по ' + bagWeight + ' кг', bags, 'шт', 0, null, true),
                            row('Объём готового раствора', volume, 'м³', 3),
                            row('Вода для затворения', water, 'л', 1)
                        ]
                    },
                    {
                        title: 'Грунтовка',
                        rows: [
                            row('Грунт (0,25 л/м²)', primerLiters, 'л', 1),
                            row('Канистр по 10 л', primerCans, 'шт', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row(mix.label, costMix, '₽', 0, costMix),
                            row('Грунтовка', costPrimer, '₽', 0, costPrimer)
                        ]
                    }
                ],
                total: total,
                warnings: warnings
            };
        }
    };


    /* =====================================================================
       Гипсокартон
       ===================================================================== */

    var gipsokarton = {
        id: 'gipsokarton',
        storage: 'gipsokarton',
        summaryTitle: 'Смета на гипсокартон',
        fileBase: 'Смета_гипсокартон',
        groups: [
            {
                title: 'Поверхность',
                fields: [
                    { id: 'area', label: 'Площадь обшивки', unit: 'м²', type: 'number', min: 0, step: 0.5, value: 20, width: 'half', hint: 'Стены: длина × высота, потолок: длина × ширина' },
                    { id: 'perimeter', label: 'Периметр помещения', unit: 'м', type: 'number', min: 0, step: 0.5, value: 18, width: 'half', hint: 'Нужен для направляющего профиля' },
                    {
                        id: 'reserve', label: 'Запас на подрезку', type: 'select', value: 10, width: 'half', options: [
                            { value: 5, label: 'Простая стена — 5 %' },
                            { value: 10, label: 'Обычный случай — 10 %' },
                            { value: 15, label: 'Потолок и углы — 15 %' }
                        ]
                    },
                    {
                        id: 'sheet', label: 'Лист', type: 'select', value: 3, width: 'half', options: [
                            { value: 3, label: '1200 × 2500 — 3,0 м²' },
                            { value: 3.6, label: '1200 × 3000 — 3,6 м²' },
                            { value: 2.16, label: '1200 × 1800 — 2,16 м²' }
                        ]
                    }
                ]
            },
            {
                title: 'Профиль и крепёж',
                fields: [
                    {
                        id: 'studStep', label: 'Шаг стоек', type: 'select', value: 0.6, width: 'half', options: [
                            { value: 0.6, label: '60 см — под 1200 мм лист' },
                            { value: 0.4, label: '40 см — под нагрузку' }
                        ]
                    },
                    { id: 'priceSheet', label: 'Цена листа', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 900' },
                    { id: 'priceProfile', label: 'Цена профиля 3 м', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 350' },
                    { id: 'priceSuspension', label: 'Цена подвеса', unit: '₽', type: 'number', min: 0, step: 5, value: 0, width: 'half', placeholder: 'например, 30' }
                ]
            }
        ],
        compute: function (state) {
            var area = positive(state.area);
            var perimeter = positive(state.perimeter);
            var reserve = num(state.reserve, 10);
            var sheet = positive(state.sheet) || 3;
            var step = positive(state.studStep) || 0.6;
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь обшивки.');
            }

            var areaGross = area * (1 + reserve / 100);
            var sheets = ceilSafe(areaGross / sheet);

            // Стойки: на 1 м² при шаге 60 см уходит ~1,7 м профиля, при 40 см — 2,5 м.
            var cdPerM2 = step <= 0.4 ? 2.5 : 1.7;
            var cdLength = area * cdPerM2 + perimeter * 0.5;
            var cdPieces = ceilSafe(cdLength / 3);
            var udLength = perimeter * 1.1;
            var udPieces = ceilSafe(udLength / 3);

            var suspensions = ceilSafe(area * (step <= 0.4 ? 2.2 : 1.5));
            var screws = Math.round(area * 30);
            var tapeMeters = perimeter * 1.2;
            var tapeRolls = ceilSafe(tapeMeters / 25);

            var costSheets = sheets * positive(state.priceSheet);
            var costProfiles = (cdPieces + udPieces) * positive(state.priceProfile);
            var costSuspensions = suspensions * positive(state.priceSuspension);
            var total = money([costSheets, costProfiles, costSuspensions]);

            return {
                groups: [
                    {
                        title: 'Листы',
                        rows: [
                            row('Площадь с запасом ' + reserve + ' %', areaGross, 'м²', 2),
                            row('Листов к покупке', sheets, 'шт', 0, null, true),
                            row('Площадь купленных листов', sheets * sheet, 'м²', 2)
                        ]
                    },
                    {
                        title: 'Каркас и крепёж',
                        rows: [
                            row('Стоечный профиль CD (3 м)', cdPieces, 'шт', 0),
                            row('Направляющий профиль UD (3 м)', udPieces, 'шт', 0),
                            row('Подвесы', suspensions, 'шт', 0),
                            row('Саморезы', screws, 'шт', 0),
                            row('Лента для швов (рулон 25 м)', tapeRolls, 'рул.', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row('Листы', costSheets, '₽', 0, costSheets),
                            row('Профиль', costProfiles, '₽', 0, costProfiles),
                            row('Подвесы', costSuspensions, '₽', 0, costSuspensions)
                        ]
                    }
                ],
                total: total,
                warnings: warnings,
            };
        }
    };

    /* =====================================================================
       Штукатурка
       ===================================================================== */

    var shtukaturka = {
        id: 'shtukaturka',
        storage: 'shtukaturka',
        summaryTitle: 'Смета на штукатурку',
        fileBase: 'Смета_штукатурка',
        groups: [
            {
                title: 'Стены',
                fields: [
                    { id: 'area', label: 'Площадь стен', unit: 'м²', type: 'number', min: 0, step: 1, value: 30, width: 'half', hint: 'Периметр × высота минус окна и двери' },
                    { id: 'thickness', label: 'Средняя толщина слоя', unit: 'мм', type: 'number', min: 0, step: 1, value: 10, width: 'half', hint: 'Среднее по маякам, а не максимум' }
                ]
            },
            {
                title: 'Смесь и цены',
                fields: [
                    {
                        id: 'mix', label: 'Тип штукатурки', type: 'select', value: 'gips', width: 'half', options: [
                            { value: 'gips', label: 'Гипсовая — 9 кг/м² на 10 мм' },
                            { value: 'cement', label: 'Цементная — 16 кг/м² на 10 мм' },
                            { value: 'decor', label: 'Декоративная — 3 кг/м² на 10 мм' }
                        ]
                    },
                    { id: 'bagWeight', label: 'Вес мешка', unit: 'кг', type: 'number', min: 1, step: 5, value: 30, width: 'half' },
                    { id: 'priceBag', label: 'Цена мешка', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 450' },
                    { id: 'pricePrimer', label: 'Цена канистры грунта 10 л', unit: '₽', type: 'number', min: 0, step: 10, value: 0, width: 'half', placeholder: 'например, 700' }
                ]
            }
        ],
        compute: function (state) {
            var MIXES = {
                gips: { rate: 9, water: 0.6, label: 'Гипсовая штукатурка' },
                cement: { rate: 16, water: 0.22, label: 'Цементная штукатурка' },
                decor: { rate: 3, water: 0.25, label: 'Декоративная штукатурка' }
            };
            var area = positive(state.area);
            var thickness = positive(state.thickness);
            var mix = MIXES[String(state.mix)] || MIXES.gips;
            var bagWeight = positive(state.bagWeight) || 30;
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь стен.');
            }
            if (thickness <= 0) {
                warnings.push('Укажите среднюю толщину слоя.');
            }

            var kgPerM2 = (thickness / 10) * mix.rate;
            var kg = area * kgPerM2;
            var bags = ceilSafe(kg / bagWeight);
            var water = kg * mix.water;

            var primerLiters = area * 0.2;
            var primerCans = ceilSafe(primerLiters / 10);

            var costMix = bags * positive(state.priceBag);
            var costPrimer = primerCans * positive(state.pricePrimer);
            var total = money([costMix, costPrimer]);

            return {
                groups: [
                    {
                        title: 'Смесь',
                        rows: [
                            row('Расход на 1 м²', kgPerM2, 'кг/м²', 2),
                            row('Всего смеси', kg, 'кг', 1),
                            row('Мешков по ' + bagWeight + ' кг', bags, 'шт', 0, null, true),
                            row('Вода для затворения', water, 'л', 1)
                        ]
                    },
                    {
                        title: 'Грунтовка',
                        rows: [
                            row('Грунт (0,2 л/м²)', primerLiters, 'л', 1),
                            row('Канистр по 10 л', primerCans, 'шт', 0)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row(mix.label, costMix, '₽', 0, costMix),
                            row('Грунтовка', costPrimer, '₽', 0, costPrimer)
                        ]
                    }
                ],
                total: total,
                warnings: warnings,
            };
        }
    };

    /* =====================================================================
       Тёплый пол
       ===================================================================== */

    var teplyPol = {
        id: 'teplyy-pol',
        storage: 'teplyy-pol',
        summaryTitle: 'Смета на тёплый пол',
        fileBase: 'Смета_теплый_пол',
        groups: [
            {
                title: 'Помещение',
                fields: [
                    { id: 'area', label: 'Площадь обогрева', unit: 'м²', type: 'number', min: 0, step: 0.5, value: 10, width: 'half', hint: 'Свободная площадь без мебели' },
                    {
                        id: 'system', label: 'Система', type: 'select', value: 'mat', width: 'half', options: [
                            { value: 'mat', label: 'Мат 150 Вт/м²' },
                            { value: 'cable10', label: 'Кабель, шаг 10 см — 180 Вт/м²' },
                            { value: 'cable125', label: 'Кабель, шаг 12,5 см — 144 Вт/м²' },
                            { value: 'cable15', label: 'Кабель, шаг 15 см — 120 Вт/м²' },
                            { value: 'film', label: 'Плёночный пол 150 Вт/м²' }
                        ]
                    },
                    { id: 'priceM2', label: 'Цена за 1 м² системы', unit: '₽', type: 'number', min: 0, step: 100, value: 0, width: 'half', placeholder: 'например, 2500' },
                    { id: 'priceThermostat', label: 'Цена терморегулятора', unit: '₽', type: 'number', min: 0, step: 100, value: 0, width: 'half', placeholder: 'например, 3500' }
                ]
            }
        ],
        compute: function (state) {
            var SYSTEMS = {
                mat: { power: 150, cablePerM2: 0, label: 'Мат 150 Вт/м²' },
                cable10: { power: 180, cablePerM2: 10, label: 'Кабель, шаг 10 см' },
                cable125: { power: 144, cablePerM2: 8, label: 'Кабель, шаг 12,5 см' },
                cable15: { power: 120, cablePerM2: 6.67, label: 'Кабель, шаг 15 см' },
                film: { power: 150, cablePerM2: 0, label: 'Плёночный пол' }
            };
            var area = positive(state.area);
            var system = SYSTEMS[String(state.system)] || SYSTEMS.mat;
            var warnings = [];

            if (area <= 0) {
                warnings.push('Укажите площадь обогрева.');
            }

            var power = area * system.power;
            var current = power / 220;
            var cable = area * system.cablePerM2;
            var recommends = power > 3500 ? 'отдельная линия 2,5 мм², автомат 16 А' : 'линия 1,5 мм², автомат 10 А';

            if (power > 0 && power < 150) {
                warnings.push('Мощность меньше 150 Вт — обогрев будет ощущаться слабо, проверьте площадь.');
            }
            if (power > 5000) {
                warnings.push('Мощность выше 5 кВт — нужна отдельная линия и согласование с электриком.');
            }

            var costSystem = area * positive(state.priceM2);
            var costThermostat = positive(state.priceThermostat);
            var total = money([costSystem, costThermostat]);

            return {
                groups: [
                    {
                        title: 'Мощность',
                        rows: [
                            row('Удельная мощность', system.power, 'Вт/м²', 0),
                            row('Общая мощность', power, 'Вт', 0, null, true),
                            row('Ток при 220 В', current, 'А', 1)
                        ]
                    },
                    {
                        title: 'Материалы',
                        rows: [
                            row('Площадь системы', area, 'м²', 1),
                            row('Длина кабеля', cable, 'м', 1),
                            row('Терморегулятор', 1, 'шт', 0, costThermostat)
                        ]
                    },
                    {
                        title: 'Стоимость',
                        rows: [
                            row(system.label, costSystem, '₽', 0, costSystem),
                            row('Терморегулятор', costThermostat, '₽', 0, costThermostat)
                        ]
                    }
                ],
                total: total,
                warnings: warnings,
                notes: ['Рекомендуемая линия: ' + recommends]
            };
        }
    };

    return {
        plitka: plitka,
        oboi: oboi,
        kraska: kraska,
        styazhka: styazhka,
        gipsokarton: gipsokarton,
        shtukaturka: shtukaturka,
        teplyyPol: teplyPol,
        helpers: {
            num: num,
            positive: positive,
            ceilSafe: ceilSafe,
            money: money
        }
    };
});
