/*!
 * Kevloro 2.0 — интерфейс калькулятора.
 *
 * Один файл на все страницы: страница определяется атрибутом
 * <body data-page-mode="index|laminat|spc">. Расчётная логика — в core.js.
 */
(function () {
    'use strict';

    var Core = window.Kevloro;
    if (!Core) {
        return;
    }

    var PAGE = document.body.getAttribute('data-page-mode') || 'index';
    var PAGE_CONFIG = {
        index: {
            storage: 'index',
            summaryTitle: 'Смета напольных покрытий Kevloro',
            fileBase: 'Смета_Kevloro',
            exportTitle: 'Смета напольных покрытий Kevloro',
            legacyDraft: ['kevloro_draft'],
            legacyProjects: ['kevloro_projects']
        },
        laminat: {
            storage: 'laminat',
            summaryTitle: 'Смета ламината Kevloro',
            fileBase: 'Смета_ламинат',
            exportTitle: 'Смета ламината Kevloro',
            legacyDraft: ['kevloro_draft_laminat', 'kevloro_draft'],
            legacyProjects: []
        },
        spc: {
            storage: 'spc',
            summaryTitle: 'Смета SPC-кварцвинила Kevloro',
            fileBase: 'Смета_SPC',
            exportTitle: 'Смета SPC-кварцвинила Kevloro',
            legacyDraft: ['kevloro_draft_spc', 'kevloro_draft'],
            legacyProjects: []
        }
    }[PAGE] || null;

    if (!PAGE_CONFIG) {
        PAGE_CONFIG = {
            storage: 'index',
            summaryTitle: 'Смета Kevloro',
            fileBase: 'Смета_Kevloro',
            exportTitle: 'Смета Kevloro',
            legacyDraft: [],
            legacyProjects: []
        };
    }

    var DRAFT_KEY = 'kevloro:v2:draft:' + PAGE_CONFIG.storage;
    var PROJECTS_KEY = 'kevloro:v2:projects:' + PAGE_CONFIG.storage;
    var THEME_KEY = 'kevloro:theme';
    var YM_ID = 112471439;

    /* ======================================================================
       Утилиты
       ====================================================================== */

    function $(id) {
        return document.getElementById(id);
    }

    function on(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    function esc(value) {
        return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function formatNumber(value, digits) {
        var number = Number(value);
        if (!Number.isFinite(number)) {
            number = 0;
        }
        return number.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: typeof digits === 'number' ? digits : 2
        });
    }

    function formatMoney(value) {
        return formatNumber(Math.round(Number(value) || 0), 0) + ' ₽';
    }

    var storage = (function () {
        var available = true;
        try {
            var probe = 'kevloro:probe';
            window.localStorage.setItem(probe, '1');
            window.localStorage.removeItem(probe);
        } catch (error) {
            available = false;
        }

        return {
            available: available,
            get: function (key) {
                if (!available) {
                    return null;
                }
                try {
                    return window.localStorage.getItem(key);
                } catch (error) {
                    return null;
                }
            },
            set: function (key, value) {
                if (!available) {
                    return false;
                }
                try {
                    window.localStorage.setItem(key, value);
                    return true;
                } catch (error) {
                    return false;
                }
            },
            remove: function (key) {
                if (!available) {
                    return;
                }
                try {
                    window.localStorage.removeItem(key);
                } catch (error) { /* игнорируем */ }
            }
        };
    })();

    var toastTimer = null;
    function toast(message) {
        var el = $('toast');
        if (!el) {
            return;
        }
        el.textContent = message;
        el.classList.add('is-visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            el.classList.remove('is-visible');
        }, 3200);
    }

    function track(goal, params) {
        try {
            if (typeof window.ym === 'function') {
                window.ym(YM_ID, 'reachGoal', goal, params || {});
            }
        } catch (error) { /* аналитика не должна ломать расчёт */ }
    }

    /* ======================================================================
       Тема
       ====================================================================== */

    var themeToggle = $('themeToggle');

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        var isDark = theme === 'dark';
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        if (themeToggle) {
            themeToggle.textContent = isDark ? '☀️' : '🌙';
            themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            themeToggle.setAttribute('aria-label', isDark ? 'Включить светлую тему' : 'Включить тёмную тему');
        }
    }

    applyTheme(currentTheme());

    on(themeToggle, 'click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        storage.set(THEME_KEY, next);
    });

    /* ======================================================================
       Индикатор сети
       ====================================================================== */

    function updateNetStatus() {
        var box = $('netStatus');
        var text = $('netStatusText');
        if (!box || !text) {
            return;
        }
        var offline = !window.navigator.onLine;
        // В сети статус не показываем: он ничего не сообщает пользователю.
        box.hidden = !offline;
        box.classList.toggle('is-offline', offline);
        text.textContent = offline ? 'Нет сети — расчёт работает' : 'Нет сети';
    }

    on(window, 'online', updateNetStatus);
    on(window, 'offline', updateNetStatus);
    updateNetStatus();

    /* ======================================================================
       Состояние
       ====================================================================== */

    var rooms = [];
    var nextRoomId = 1;
    var lastModel = null;
    var calculationSummary = '';
    var saveTimer = null;

    function defaultRoom(index) {
        return {
            id: nextRoomId++,
            name: 'Комната ' + (index + 1),
            type: 'rect',
            length: 5,
            width: 3,
            customArea: 15,
            customPerimeter: 16,
            doorWidth: 0.8,
            layout: 5,
            isCollapsed: false
        };
    }

    function numberValue(id) {
        var el = $(id);
        return el ? el.value : '';
    }

    function collectState() {
        return {
            clientInfo: ($('clientInfoInput') || {}).value || '',
            rooms: rooms,
            packArea: numberValue('packArea'),
            pricePerM2: numberValue('pricePerM2'),
            priceUnderlay: numberValue('priceUnderlay'),
            underlayArea: numberValue('underlayArea'),
            priceSkirting: numberValue('priceSkirting'),
            skirtingLength: numberValue('skirtingLengthParam'),
            thresholdCount: numberValue('thresholdCount'),
            pipeCount: numberValue('pipeCount'),
            priceCorner: numberValue('priceCorner'),
            priceConnector: numberValue('priceConnector'),
            priceEndCap: numberValue('priceEndCap'),
            priceThreshold: numberValue('priceThreshold'),
            pricePipe: numberValue('pricePipe'),
            innerCorners: numberValue('innerCornersInput'),
            outerCorners: numberValue('outerCornersInput'),
            hasHeating: Boolean($('hasUnderfloorHeating') && $('hasUnderfloorHeating').checked),
            materialPreset: numberValue('materialPreset')
        };
    }

    function setValue(id, value) {
        var el = $(id);
        if (el && value !== undefined && value !== null) {
            el.value = value;
        }
    }

    function applyState(state) {
        if (!state || typeof state !== 'object') {
            return;
        }
        if (typeof state.clientInfo === 'string') {
            setValue('clientInfoInput', state.clientInfo);
        }
        if (Array.isArray(state.rooms) && state.rooms.length > 0) {
            rooms = state.rooms.map(function (room, index) {
                var source = room || {};
                var id = Number(source.id);
                if (!Number.isFinite(id) || id <= 0) {
                    id = nextRoomId++;
                }
                nextRoomId = Math.max(nextRoomId, id + 1);
                return {
                    id: id,
                    name: typeof source.name === 'string' ? source.name : 'Комната ' + (index + 1),
                    type: source.type === 'custom' ? 'custom' : 'rect',
                    length: source.length === undefined ? 5 : source.length,
                    width: source.width === undefined ? 3 : source.width,
                    customArea: source.customArea === undefined ? 15 : source.customArea,
                    customPerimeter: source.customPerimeter === undefined ? 16 : source.customPerimeter,
                    doorWidth: source.doorWidth === undefined ? 0.8 : source.doorWidth,
                    layout: source.layout === undefined ? 5 : source.layout,
                    isCollapsed: Boolean(source.isCollapsed)
                };
            });
        }

        [
            ['packArea', state.packArea],
            ['pricePerM2', state.pricePerM2],
            ['priceUnderlay', state.priceUnderlay],
            ['underlayArea', state.underlayArea],
            ['priceSkirting', state.priceSkirting],
            ['skirtingLengthParam', state.skirtingLength],
            ['thresholdCount', state.thresholdCount],
            ['pipeCount', state.pipeCount],
            ['priceCorner', state.priceCorner],
            ['priceConnector', state.priceConnector],
            ['priceEndCap', state.priceEndCap],
            ['priceThreshold', state.priceThreshold],
            ['pricePipe', state.pricePipe],
            ['innerCornersInput', state.innerCorners],
            ['outerCornersInput', state.outerCorners]
        ].forEach(function (pair) {
            var el = $(pair[0]);
            if (el && pair[1] !== undefined && pair[1] !== null && pair[1] !== '') {
                el.value = pair[1];
            } else if (el && pair[1] === '') {
                el.value = '';
            }
        });

        if (state.materialPreset) {
            var preset = $('materialPreset');
            if (preset) {
                var exists = Array.prototype.some.call(preset.options, function (option) {
                    return option.value === String(state.materialPreset);
                });
                if (exists) {
                    preset.value = String(state.materialPreset);
                }
            }
        }

        var heating = $('hasUnderfloorHeating');
        if (heating) {
            heating.checked = Boolean(state.hasHeating);
        }

        syncHeatingNotice();
        syncPresetNotice();
        renderRooms();
        calculate();
    }

    /* ======================================================================
       Помещения
       ====================================================================== */

    function areaOf(room) {
        return Core.roomArea(room);
    }

    function layoutOptions(selected) {
        return [
            { value: 5, label: 'Прямая вдоль света (5%)' },
            { value: 10, label: 'Диагональ (10%)' },
            { value: 15, label: 'Ёлочка / паркет (15%)' }
        ].map(function (item) {
            return '<option value="' + item.value + '"' + (Number(selected) === item.value ? ' selected' : '') + '>' + item.label + '</option>';
        }).join('');
    }

    function buildRoomElement(room, index) {
        var wrapper = document.createElement('div');
        wrapper.className = 'room-card' + (room.isCollapsed ? ' is-collapsed' : '');
        wrapper.setAttribute('data-room-id', String(room.id));

        var badge = formatNumber(areaOf(room), 1) + ' м²';
        var prefix = 'room-' + room.id + '-' + index;

        var geometry = room.type === 'custom'
            ? '<div class="row form-group">' +
                '<div class="col"><label for="' + prefix + '-area">Площадь (м²)</label>' +
                '<input id="' + prefix + '-area" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(room.customArea) + '" data-field="customArea"></div>' +
                '<div class="col"><label for="' + prefix + '-perimeter">Периметр (м)</label>' +
                '<input id="' + prefix + '-perimeter" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(room.customPerimeter) + '" data-field="customPerimeter"></div>' +
              '</div>'
            : '<div class="row form-group">' +
                '<div class="col"><label for="' + prefix + '-length">Длина (м)</label>' +
                '<input id="' + prefix + '-length" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(room.length) + '" data-field="length"></div>' +
                '<div class="col"><label for="' + prefix + '-width">Ширина (м)</label>' +
                '<input id="' + prefix + '-width" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(room.width) + '" data-field="width"></div>' +
              '</div>';

        wrapper.innerHTML =
            '<div class="room-header">' +
                '<div class="room-title-area">' +
                    '<input class="room-name-input" type="text" value="' + esc(room.name) + '" data-field="name" aria-label="Название помещения">' +
                    '<span class="room-collapsed-badge">' + esc(badge) + '</span>' +
                '</div>' +
                '<div class="room-header-actions">' +
                    '<button type="button" class="btn-room-action btn-toggle-room" data-action="toggle" aria-expanded="' + (room.isCollapsed ? 'false' : 'true') + '" aria-label="Свернуть или развернуть помещение">' + '<svg class="ico chev" aria-hidden="true"><use href="#i-chevron"></use></svg></button>' +
                    '<button type="button" class="btn-room-action btn-duplicate-room" data-action="duplicate" aria-label="Скопировать помещение">Копировать</button>' +
                    '<button type="button" class="btn-room-action btn-remove-room" data-action="remove" aria-label="Удалить помещение">Удалить</button>' +
                '</div>' +
            '</div>' +
            '<div class="room-body">' +
                '<div class="room-type-toggle" role="radiogroup" aria-label="Как задать размеры помещения">' +
                    '<label><input type="radio" name="geom-' + room.id + '" value="rect" data-field="type"' + (room.type === 'rect' ? ' checked' : '') + '> По размерам (Д × Ш)</label>' +
                    '<label><input type="radio" name="geom-' + room.id + '" value="custom" data-field="type"' + (room.type === 'custom' ? ' checked' : '') + '> Сложная форма (м² и периметр)</label>' +
                '</div>' +
                geometry +
                '<div class="row form-group">' +
                    '<div class="col"><label for="' + prefix + '-door">Ширина проёмов (м)</label>' +
                    '<input id="' + prefix + '-door" type="number" inputmode="decimal" step="0.1" min="0" value="' + esc(room.doorWidth) + '" data-field="doorWidth">' +
                    '<div class="field-hint">Сумма всех дверей и выходов</div></div>' +
                    '<div class="col"><label for="' + prefix + '-layout">Укладка</label>' +
                    '<select id="' + prefix + '-layout" data-field="layout">' + layoutOptions(room.layout) + '</select></div>' +
                '</div>' +
            '</div>';

        return wrapper;
    }

    function renderRooms() {
        var container = $('roomsContainer');
        if (!container) {
            return;
        }
        container.textContent = '';
        rooms.forEach(function (room, index) {
            container.appendChild(buildRoomElement(room, index));
        });
        queueSave();
    }

    function findRoom(id) {
        for (var i = 0; i < rooms.length; i++) {
            if (String(rooms[i].id) === String(id)) {
                return rooms[i];
            }
        }
        return null;
    }

    function updateRoom(id, field, value) {
        var room = findRoom(id);
        if (!room) {
            return;
        }
        if (field === 'type') {
            room.type = value === 'custom' ? 'custom' : 'rect';
            renderRooms();
            calculate();
            return;
        }
        if (field === 'name') {
            room.name = String(value);
        } else if (field === 'layout') {
            room.layout = Core.toNumber(value, 5);
        } else {
            room[field] = Core.nonNegative(value);
        }
        var card = document.querySelector('[data-room-id="' + room.id + '"]');
        var badge = card ? card.querySelector('.room-collapsed-badge') : null;
        if (badge) {
            badge.textContent = formatNumber(areaOf(room), 1) + ' м²';
        }
        queueSave();
        calculate();
    }

    function addRoom() {
        rooms.push(defaultRoom(rooms.length));
        renderRooms();
        calculate();
        var cards = document.querySelectorAll('.room-card');
        var last = cards[cards.length - 1];
        if (last) {
            var input = last.querySelector('.room-name-input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    function duplicateRoom(id) {
        var source = findRoom(id);
        if (!source) {
            return;
        }
        rooms.push({
            id: nextRoomId++,
            name: source.name + ' (копия)',
            type: source.type,
            length: source.length,
            width: source.width,
            customArea: source.customArea,
            customPerimeter: source.customPerimeter,
            doorWidth: source.doorWidth,
            layout: source.layout,
            isCollapsed: false
        });
        renderRooms();
        calculate();
    }

    function removeRoom(id) {
        if (rooms.length <= 1) {
            toast('В смете должно остаться хотя бы одно помещение.');
            return;
        }
        rooms = rooms.filter(function (room) {
            return String(room.id) !== String(id);
        });
        renderRooms();
        calculate();
    }

    function toggleRoom(id) {
        var room = findRoom(id);
        if (!room) {
            return;
        }
        room.isCollapsed = !room.isCollapsed;
        var card = document.querySelector('[data-room-id="' + room.id + '"]');
        if (!card) {
            return;
        }
        card.classList.toggle('is-collapsed', room.isCollapsed);
        var button = card.querySelector('.btn-toggle-room');
        if (button) {
            button.setAttribute('aria-expanded', room.isCollapsed ? 'false' : 'true');
        }
        queueSave();
    }

    on($('addRoomBtn'), 'click', addRoom);

    on($('roomsContainer'), 'input', function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) {
            return;
        }
        var card = target.closest('.room-card');
        var field = target.getAttribute('data-field');
        if (!card || !field || field === 'type') {
            return;
        }
        updateRoom(card.getAttribute('data-room-id'), field, target.value);
    });

    on($('roomsContainer'), 'change', function (event) {
        var target = event.target;
        if (!target || !target.getAttribute) {
            return;
        }
        var card = target.closest('.room-card');
        if (!card) {
            return;
        }
        var field = target.getAttribute('data-field');
        if (!field) {
            return;
        }
        if (field === 'type' || field === 'layout') {
            updateRoom(card.getAttribute('data-room-id'), field, target.value);
        }
    });

    on($('roomsContainer'), 'click', function (event) {
        var button = event.target.closest ? event.target.closest('[data-action]') : null;
        if (!button) {
            return;
        }
        var card = button.closest('.room-card');
        if (!card) {
            return;
        }
        var id = card.getAttribute('data-room-id');
        var action = button.getAttribute('data-action');
        if (action === 'toggle') {
            toggleRoom(id);
        } else if (action === 'duplicate') {
            duplicateRoom(id);
        } else if (action === 'remove') {
            removeRoom(id);
        }
    });

    /* ======================================================================
       Расчёт и вывод
       ====================================================================== */

    function renderWarnings(warnings) {
        var box = $('validationMsg');
        if (!box) {
            return;
        }
        if (!warnings || warnings.length === 0) {
            box.textContent = '';
            box.classList.remove('is-visible');
            return;
        }
        box.innerHTML = '<strong>Проверьте исходные данные:</strong><ul>' + warnings.map(function (text) {
            return '<li>' + esc(text) + '</li>';
        }).join('') + '</ul>';
        box.classList.add('is-visible');
    }

    function setText(id, value) {
        var el = $(id);
        if (el) {
            el.textContent = value;
        }
    }

    function buildSummary(model) {
        var lines = [PAGE_CONFIG.summaryTitle + ' (помещений: ' + model.rooms.length + ')'];
        if (model.state.clientInfo) {
            lines.push('• Объект: ' + model.state.clientInfo);
        }
        if (model.state.hasHeating) {
            lines.push('• Тёплый пол: да (перфорированная подложка, не выше +27…+28 °C)');
        }
        if (model.packAreaKnown) {
            lines.push('• Покрытие: ' + model.packs + ' упак. (' + formatNumber(model.boughtArea, 2) + ' м²)');
        }
        lines.push('• Площадь без запаса: ' + formatNumber(model.netArea, 2) + ' м², с запасом: ' + formatNumber(model.grossArea, 2) + ' м²');
        lines.push('• Подложка: ' + model.underlayRolls + ' рул. по ' + formatNumber(model.underlayAreaPerRoll, 2) + ' м² (+5%)');
        lines.push('• Плинтус: ' + model.skirtingPieces + ' планок по ' + formatNumber(model.skirtingLength, 2) + ' м (периметр ' + formatNumber(model.cleanPerimeter, 1) + ' м)');
        lines.push('• Фурнитура: углы ' + model.innerCorners + '/' + model.outerCorners + ', соединители ' + model.connectors + ', заглушки ' + model.endCaps + ' пар, порожки ' + model.thresholds);
        if (model.pipes > 0) {
            lines.push('• Обводы труб: ' + model.pipes);
        }
        if (model.costs.total > 0) {
            lines.push('• Ориентировочная сумма: ' + formatMoney(model.costs.total));
        }
        lines.push('Рассчитано на ' + window.location.href.split('#')[0]);
        return lines.join('\n');
    }

    function calculate() {
        var model = Core.computeEstimate(collectState());
        lastModel = model;

        setText('resTotalNetArea', formatNumber(model.netArea, 2) + ' м²');
        setText('resTotalGrossArea', formatNumber(model.grossArea, 2) + ' м²');
        setText('resPacks', model.packAreaKnown ? model.packs + ' упак.' : '— укажите площадь пачки');
        setText('resBoughtArea', formatNumber(model.boughtArea, 2) + ' м²');
        setText('resUnderlay', model.underlayRolls + ' рул. (' + formatNumber(model.underlayAreaTotal, 1) + ' м²)');
        setText('resPerimeter', formatNumber(model.cleanPerimeter, 1) + ' м');
        setText('resSkirting', model.skirtingPieces + ' шт (по ' + formatNumber(model.skirtingLength, 2) + ' м)');
        setText('resInnerCorners', model.innerCorners + ' шт');
        setText('resOuterCorners', model.outerCorners + ' шт');
        setText('resConnectors', model.connectors + ' шт');
        setText('resEndCaps', model.endCaps + ' пар');
        setText('resThresholds', model.thresholds + ' шт');

        var pipesRow = $('resPipesRow');
        if (pipesRow) {
            pipesRow.hidden = model.pipes <= 0;
        }
        setText('resPipes', model.pipes + ' шт');

        var priceRow = $('priceRow');
        var costs = model.costs;
        if (costs.total > 0) {
            setText('totalPrice', formatMoney(costs.total));
            var parts = [];
            if (costs.cover > 0) { parts.push('покрытие ' + formatMoney(costs.cover)); }
            if (costs.underlay > 0) { parts.push('подложка ' + formatMoney(costs.underlay)); }
            if (costs.skirting > 0) { parts.push('плинтус ' + formatMoney(costs.skirting)); }
            if (costs.corners > 0) { parts.push('углы ' + formatMoney(costs.corners)); }
            if (costs.connectors > 0) { parts.push('соединители ' + formatMoney(costs.connectors)); }
            if (costs.endCaps > 0) { parts.push('заглушки ' + formatMoney(costs.endCaps)); }
            if (costs.thresholds > 0) { parts.push('порожки ' + formatMoney(costs.thresholds)); }
            if (costs.pipes > 0) { parts.push('обводы ' + formatMoney(costs.pipes)); }
            setText('priceDetails', parts.join(' · '));
            if (priceRow) {
                priceRow.hidden = false;
            }
        } else if (priceRow) {
            priceRow.hidden = true;
        }

        renderWarnings(model.warnings);
        calculationSummary = buildSummary(model);
        queueSave();
    }

    on($('calculateBtn'), 'click', function () {
        calculate();
        track('calc');
        var results = $('resultBlock');
        if (results) {
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    /* ======================================================================
       Черновик и проект
       ====================================================================== */

    function queueSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveDraft, 400);
    }

    function saveDraft() {
        storage.set(DRAFT_KEY, JSON.stringify(collectState()));
    }

    function loadDraft() {
        var raw = storage.get(DRAFT_KEY);
        if (!raw) {
            for (var i = 0; i < PAGE_CONFIG.legacyDraft.length; i++) {
                var legacy = storage.get(PAGE_CONFIG.legacyDraft[i]);
                if (legacy) {
                    raw = legacy;
                    break;
                }
            }
        }
        if (raw) {
            try {
                applyState(JSON.parse(raw));
                return true;
            } catch (error) {
                storage.remove(DRAFT_KEY);
            }
        }
        return false;
    }

    function importFromHash() {
        var hash = window.location.hash || '';
        if (hash.indexOf('#data=') !== 0) {
            return false;
        }
        try {
            var encoded = hash.slice('#data='.length);
            var json = decodeURIComponent(window.atob(encoded));
            var state = JSON.parse(json);
            if (!state || typeof state !== 'object') {
                return false;
            }
            applyState(state);
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            toast('Смета загружена из ссылки.');
            return true;
        } catch (error) {
            toast('Ссылка повреждена — не удалось загрузить смету.');
            return false;
        }
    }

    var projects = [];

    function readProjects() {
        var raw = storage.get(PROJECTS_KEY);
        if (!raw && PAGE_CONFIG.legacyProjects.length > 0) {
            for (var i = 0; i < PAGE_CONFIG.legacyProjects.length; i++) {
                var legacy = storage.get(PAGE_CONFIG.legacyProjects[i]);
                if (legacy) {
                    raw = legacy;
                    storage.set(PROJECTS_KEY, legacy);
                    break;
                }
            }
        }
        if (!raw) {
            return [];
        }
        try {
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function writeProjects() {
        storage.set(PROJECTS_KEY, JSON.stringify(projects));
    }

    function renderProjects() {
        var container = $('projectsList');
        if (!container) {
            return;
        }
        container.textContent = '';
        if (projects.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'projects-empty';
            empty.textContent = 'Пока нет сохранённых смет';
            container.appendChild(empty);
            return;
        }
        projects.forEach(function (project) {
            var item = document.createElement('div');
            item.className = 'project-item';

            var info = document.createElement('div');
            info.className = 'project-item-info';
            var name = document.createElement('div');
            name.className = 'project-item-name';
            name.textContent = project.name;
            var meta = document.createElement('div');
            meta.className = 'project-item-meta';
            var date = new Date(project.savedAt);
            var roomsCount = project.state && Array.isArray(project.state.rooms) ? project.state.rooms.length : 0;
            meta.textContent = (Number.isFinite(date.getTime()) ? date.toLocaleDateString('ru-RU') : '—') + ' · помещений: ' + roomsCount;
            info.appendChild(name);
            info.appendChild(meta);

            var actions = document.createElement('div');
            actions.className = 'project-item-actions';
            var open = document.createElement('button');
            open.type = 'button';
            open.textContent = 'Открыть';
            open.addEventListener('click', function () {
                openProject(project.id);
            });
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'danger';
            remove.textContent = 'Удалить';
            remove.addEventListener('click', function () {
                deleteProject(project.id);
            });
            actions.appendChild(open);
            actions.appendChild(remove);

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    function saveProject() {
        var nameInput = $('projectNameInput');
        var clientInfo = ($('clientInfoInput') || {}).value || '';
        var fallback = clientInfo.trim() || ('Объект от ' + new Date().toLocaleDateString('ru-RU'));
        var name = (nameInput && nameInput.value.trim()) || fallback;

        projects.unshift({
            id: Date.now(),
            name: name,
            savedAt: new Date().toISOString(),
            state: collectState()
        });
        if (projects.length > 30) {
            projects.length = 30;
        }
        writeProjects();
        renderProjects();
        if (nameInput) {
            nameInput.value = '';
        }
        track('save_project');
        toast('Смета сохранена в этом браузере.');
    }

    function openProject(id) {
        var project = projects.filter(function (item) {
            return String(item.id) === String(id);
        })[0];
        if (!project) {
            return;
        }
        applyState(project.state);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('Смета «' + project.name + '» открыта.');
        track('open_project');
    }

    function deleteProject(id) {
        if (!window.confirm('Удалить сохранённую смету?')) {
            return;
        }
        projects = projects.filter(function (item) {
            return String(item.id) !== String(id);
        });
        writeProjects();
        renderProjects();
    }

    on($('saveProjectBtn'), 'click', saveProject);

    /* ======================================================================
       Копирование, экспорт, печать
       ====================================================================== */

    function copyText(text) {
        if (!text) {
            toast('Сначала рассчитайте смету.');
            return;
        }
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
            window.navigator.clipboard.writeText(text).then(function () {
                toast('Смета скопирована в буфер обмена.');
            }).catch(function () {
                window.prompt('Скопируйте текст вручную:', text);
            });
            return;
        }
        window.prompt('Скопируйте текст вручную:', text);
    }

    on($('copyBtn'), 'click', function () {
        copyText(calculationSummary);
        track('copy_text');
    });

    function buildShareLink() {
        var state = collectState();
        var encoded = window.btoa(encodeURIComponent(JSON.stringify(state)));
        return window.location.origin + window.location.pathname + '#data=' + encoded;
    }

    on($('shareLinkBtn'), 'click', function () {
        var url = buildShareLink();
        if (url.length > 8000) {
            toast('Слишком много помещений для ссылки — уменьшите смету или используйте экспорт.');
            return;
        }
        copyText(url);
        track('copy_link');
    });

    function buildExportRows(model) {
        var rows = [
            { name: 'Чистая площадь помещений', qty: formatNumber(model.netArea, 2), unit: 'м²', sum: null },
            { name: 'Площадь покрытия с запасом', qty: formatNumber(model.grossArea, 2), unit: 'м²', sum: null },
            { name: 'Покрытие в упаковках', qty: model.packs, unit: 'упак.', sum: model.costs.cover },
            { name: 'Площадь закупаемых пачек', qty: formatNumber(model.boughtArea, 2), unit: 'м²', sum: null },
            { name: 'Подложка (рулоны по ' + formatNumber(model.underlayAreaPerRoll, 2) + ' м², +5%)', qty: model.underlayRolls, unit: 'рул.', sum: model.costs.underlay },
            { name: 'Плинтус (планки по ' + formatNumber(model.skirtingLength, 2) + ' м, +5%)', qty: model.skirtingPieces, unit: 'шт', sum: model.costs.skirting },
            { name: 'Внутренние углы', qty: model.innerCorners, unit: 'шт', sum: null },
            { name: 'Внешние углы', qty: model.outerCorners, unit: 'шт', sum: null },
            { name: 'Соединители планок', qty: model.connectors, unit: 'шт', sum: model.costs.connectors },
            { name: 'Торцевые заглушки', qty: model.endCaps, unit: 'пар', sum: model.costs.endCaps },
            { name: 'Порожки', qty: model.thresholds, unit: 'шт', sum: model.costs.thresholds },
            { name: 'Обводы труб', qty: model.pipes, unit: 'шт', sum: model.costs.pipes }
        ];
        if (model.costs.corners > 0) {
            rows.push({ name: 'Углы (стоимость)', qty: model.innerCorners + model.outerCorners, unit: 'шт', sum: model.costs.corners });
        }
        return rows;
    }

    function safeFileName(name) {
        return String(name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
    }

    function downloadBlob(content, fileName, mime) {
        var blob = new Blob([content], { type: mime });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportExcel() {
        if (!lastModel) {
            calculate();
        }
        var model = lastModel;
        var rows = buildExportRows(model).map(function (row) {
            return '<tr>' +
                '<td class="row-item">' + esc(row.name) + '</td>' +
                '<td class="row-item num">' + esc(row.qty) + '</td>' +
                '<td class="row-item">' + esc(row.unit) + '</td>' +
                '<td class="row-item num">' + (row.sum === null ? '—' : esc(formatNumber(row.sum, 0))) + '</td>' +
            '</tr>';
        }).join('');

        var roomsRows = model.rooms.map(function (room) {
            return '<tr>' +
                '<td class="row-item">' + esc(room.name) + '</td>' +
                '<td class="row-item num">' + esc(formatNumber(room.area, 2)) + '</td>' +
                '<td class="row-item num">' + esc(room.layout + '%') + '</td>' +
                '<td class="row-item num">' + esc(formatNumber(room.grossArea, 2)) + '</td>' +
            '</tr>';
        }).join('');

        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
            '<head><meta charset="utf-8">' +
            '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
            '<x:Name>Смета Kevloro</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
            '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
            '<style>td,th{font-family:Calibri,Arial,sans-serif;font-size:11pt;}' +
            '.th-header{background:#2563eb;color:#fff;font-weight:bold;border:1px solid #1d4ed8;text-align:left;padding:6px 10px;}' +
            '.row-item{border:0.5pt solid #cbd5e1;padding:5px 8px;}.num{text-align:right;}' +
            '.total-row{background:#ecfdf5;font-weight:bold;border:1.5pt solid #059669;}</style></head><body>' +
            '<h2>' + esc(PAGE_CONFIG.exportTitle) + '</h2>' +
            (model.state.clientInfo ? '<p><b>Объект / Заказчик:</b> ' + esc(model.state.clientInfo) + '</p>' : '') +
            '<p><b>Дата расчёта:</b> ' + esc(new Date().toLocaleDateString('ru-RU')) + ' ' + esc(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })) + '</p>' +
            (model.state.hasHeating ? '<p style="color:#b45309;"><b>Внимание:</b> предусмотрен тёплый пол — нужна термостойкая перфорированная подложка.</p>' : '') +
            '<br><table border="1" style="border-collapse:collapse;"><colgroup><col style="width:340px;"><col style="width:110px;"><col style="width:80px;"><col style="width:150px;"></colgroup>' +
            '<thead><tr><th class="th-header">Наименование позиции</th><th class="th-header num">Количество</th><th class="th-header">Ед. изм.</th><th class="th-header num">Сумма (₽)</th></tr></thead><tbody>' +
            rows +
            '<tr class="total-row"><td class="row-item" colspan="3" style="text-align:right;">ИТОГО ОРИЕНТИРОВОЧНО:</td>' +
            '<td class="row-item num">' + (model.costs.total > 0 ? esc(formatNumber(model.costs.total, 0)) + ' ₽' : '—') + '</td></tr>' +
            '</tbody></table>' +
            '<h3>По помещениям</h3><table border="1" style="border-collapse:collapse;">' +
            '<thead><tr><th class="th-header">Помещение</th><th class="th-header num">Площадь, м²</th><th class="th-header num">Запас</th><th class="th-header num">С запасом, м²</th></tr></thead>' +
            '<tbody>' + roomsRows + '</tbody></table>' +
            '<p>Расчёт выполнен сервисом Kevloro (kevloro.ru). Сумма ориентировочная: уточняйте цены у продавца.</p>' +
            '</body></html>';

        var fileName = safeFileName(model.state.clientInfo ? PAGE_CONFIG.fileBase + '_' + model.state.clientInfo : PAGE_CONFIG.fileBase) + '.xls';
        downloadBlob(html, fileName, 'application/vnd.ms-excel;charset=utf-8');
        track('export_excel');
        toast('Файл Excel сохранён.');
    }

    function exportCsv() {
        if (!lastModel) {
            calculate();
        }
        var model = lastModel;
        var lines = [];
        lines.push(['Позиция', 'Количество', 'Ед. изм.', 'Сумма, ₽'].join(';'));
        buildExportRows(model).forEach(function (row) {
            lines.push([row.name, row.qty, row.unit, row.sum === null ? '' : String(Math.round(row.sum))].map(function (cell) {
                return '"' + String(cell).replace(/"/g, '""') + '"';
            }).join(';'));
        });
        lines.push(['ИТОГО', '', '', String(Math.round(model.costs.total))].join(';'));
        var csv = '\uFEFF' + lines.join('\r\n');
        var fileName = safeFileName(model.state.clientInfo ? PAGE_CONFIG.fileBase + '_' + model.state.clientInfo : PAGE_CONFIG.fileBase) + '.csv';
        downloadBlob(csv, fileName, 'text/csv;charset=utf-8');
        track('export_csv');
        toast('Файл CSV сохранён.');
    }

    on($('excelBtn'), 'click', exportExcel);
    on($('csvBtn'), 'click', exportCsv);

    function printEstimate() {
        var now = new Date();
        var header = $('printHeaderInfo');
        var clientInfo = ($('clientInfoInput') || {}).value || '';
        if (header) {
            header.textContent = 'Смета сформирована ' + now.toLocaleDateString('ru-RU') + ' в ' +
                now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) +
                (clientInfo.trim() ? ' · Объект: ' + clientInfo.trim() : '');
        }
        var badge = $('printHeatingBadge');
        var heating = $('hasUnderfloorHeating');
        if (badge) {
            badge.classList.toggle('is-active', Boolean(heating && heating.checked));
        }
        track('print');
        window.print();
    }

    on($('printBtn'), 'click', printEstimate);

    function shareTo(platform) {
        var url = encodeURIComponent(window.location.href.split('#')[0]);
        var text = encodeURIComponent(calculationSummary || 'Калькулятор напольных покрытий Kevloro');
        var links = {
            tg: 'https://t.me/share/url?url=' + url + '&text=' + text,
            wa: 'https://api.whatsapp.com/send?text=' + text + '%20' + url,
            vk: 'https://vk.com/share.php?url=' + url + '&title=' + text,
            ok: 'https://connect.ok.ru/offer?url=' + url + '&title=' + text
        };
        if (platform === 'native') {
            if (window.navigator.share) {
                window.navigator.share({ title: 'Смета Kevloro', text: calculationSummary, url: window.location.href.split('#')[0] })
                    .catch(function () { /* отмена — не ошибка */ });
            } else {
                copyText(calculationSummary);
            }
            return;
        }
        if (links[platform]) {
            track('share_' + platform);
            window.open(links[platform], '_blank', 'noopener');
        }
    }

    [['shareTg', 'tg'], ['shareWa', 'wa'], ['shareVk', 'vk'], ['shareOk', 'ok'], ['shareNative', 'native']].forEach(function (pair) {
        on($(pair[0]), 'click', function () {
            shareTo(pair[1]);
        });
    });

    /* ======================================================================
       Пресеты материала и тёплый пол
       ====================================================================== */

    function syncPresetNotice() {
        var notice = $('spcNotice');
        var preset = $('materialPreset');
        if (!notice || !preset) {
            return;
        }
        var isSpc = preset.value === '2.6' || preset.value === '2.60';
        notice.classList.toggle('is-visible', Boolean(isSpc && notice.textContent.trim()));
    }

    on($('materialPreset'), 'change', function () {
        var preset = $('materialPreset');
        if (!preset) {
            return;
        }
        if (preset.value !== 'custom') {
            setValue('packArea', preset.value);
        }
        syncPresetNotice();
        calculate();
    });

    function syncHeatingNotice() {
        var notice = $('heatingNotice');
        var heating = $('hasUnderfloorHeating');
        var active = Boolean(heating && heating.checked);
        if (notice) {
            notice.classList.toggle('is-visible', active);
        }
        var badge = $('printHeatingBadge');
        if (badge) {
            badge.classList.toggle('is-active', active);
        }
    }

    on($('hasUnderfloorHeating'), 'change', function () {
        syncHeatingNotice();
        calculate();
    });

    /* ======================================================================
       Автосохранение при вводе в статических полях
       ====================================================================== */

    ['clientInfoInput', 'packArea', 'pricePerM2', 'priceUnderlay', 'underlayArea', 'priceSkirting',
        'skirtingLengthParam', 'thresholdCount', 'pipeCount', 'priceCorner', 'priceConnector',
        'priceEndCap', 'priceThreshold', 'pricePipe', 'innerCornersInput', 'outerCornersInput'
    ].forEach(function (id) {
        on($(id), 'input', calculate);
    });

    /* ======================================================================
       Service worker и установка PWA
       ====================================================================== */

    if ('serviceWorker' in window.navigator) {
        window.addEventListener('load', function () {
            window.navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (registration) {
                registration.update().catch(function () { /* нет сети — не страшно */ });
                window.setInterval(function () {
                    registration.update().catch(function () { /* игнорируем */ });
                }, 30 * 60 * 1000);
            }).catch(function () { /* офлайн-режим недоступен, расчёт работает */ });

            var reloading = false;
            var pendingReload = false;

            function safeReload() {
                if (reloading) {
                    return;
                }
                var tag = document.activeElement ? document.activeElement.tagName : '';
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                    pendingReload = true;
                    return;
                }
                reloading = true;
                window.location.reload();
            }

            window.navigator.serviceWorker.addEventListener('controllerchange', safeReload);
            document.addEventListener('visibilitychange', function () {
                if (document.hidden && pendingReload) {
                    safeReload();
                }
            });
            window.addEventListener('blur', function () {
                if (pendingReload) {
                    safeReload();
                }
            });
        });
    }

    var deferredPrompt = null;
    var pwaBanner = $('pwaBanner');

    function showPwaBanner() {
        if (pwaBanner && !storage.get('kevloro:pwa-banner-closed')) {
            pwaBanner.hidden = false;
        }
    }

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        showPwaBanner();
    });

    on($('pwaInstallBtn'), 'click', function () {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () {
                deferredPrompt = null;
                if (pwaBanner) {
                    pwaBanner.hidden = true;
                }
                track('pwa_install');
            });
            return;
        }
        toast('Установка: в Chrome — меню «Установить приложение», в Safari — «Поделиться» → «На экран Домой».');
    });

    on($('pwaCloseBtn'), 'click', function () {
        if (pwaBanner) {
            pwaBanner.hidden = true;
        }
        storage.set('kevloro:pwa-banner-closed', '1');
    });

    /* ======================================================================
       Старт
       ====================================================================== */

    projects = readProjects();
    renderProjects();

    var restored = importFromHash() || loadDraft();

    if (!restored) {
        rooms = [{
            id: nextRoomId++,
            name: 'Гостиная',
            type: 'rect',
            length: 5,
            width: 3,
            customArea: 15,
            customPerimeter: 16,
            doorWidth: 0.8,
            layout: 5,
            isCollapsed: false
        }];
        var initialPreset = $('materialPreset');
        if (initialPreset && initialPreset.value && initialPreset.value !== 'custom') {
            setValue('packArea', initialPreset.value);
        }
        renderRooms();
        syncHeatingNotice();
        syncPresetNotice();
        calculate();
    }

    if (!storage.available) {
        toast('Браузер запретил локальное хранилище: черновик и сметы не сохранятся, но расчёт работает.');
    }
})();
