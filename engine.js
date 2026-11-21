/*!
 * Kevloro 2.2 — универсальный движок калькуляторов.
 *
 * Берёт описание из calculators.js, рисует форму и результаты,
 * сохраняет черновик, собирает ссылку, CSV/Excel и печать.
 */
(function () {
    'use strict';

    var UI = window.KevloroUI;
    var CALCS = window.KevloroCalcs;
    if (!UI || !CALCS) {
        return;
    }

    var root = UI.$('calcRoot');
    if (!root) {
        return;
    }

    var calcId = root.getAttribute('data-calc');
    var calc = CALCS[calcId];
    if (!calc) {
        return;
    }

    var DRAFT_KEY = 'kevloro:calc:' + calc.storage + ':draft';
    var state = {};
    var result = null;
    var saveTimer = null;

    function fieldId(field) {
        return 'f-' + calc.id + '-' + field.id;
    }

    function defaults() {
        var values = {};
        calc.groups.forEach(function (group) {
            group.fields.forEach(function (field) {
                values[field.id] = field.value;
            });
        });
        return values;
    }

    function readForm() {
        var values = {};
        calc.groups.forEach(function (group) {
            group.fields.forEach(function (field) {
                var element = UI.$(fieldId(field));
                if (!element) {
                    values[field.id] = field.value;
                    return;
                }
                values[field.id] = field.type === 'number' ? element.value : element.value;
            });
        });
        return values;
    }

    function writeForm(values) {
        calc.groups.forEach(function (group) {
            group.fields.forEach(function (field) {
                var element = UI.$(fieldId(field));
                if (!element) {
                    return;
                }
                var value = values[field.id];
                if (value === undefined || value === null) {
                    return;
                }
                element.value = value;
            });
        });
    }

    function renderFields() {
        var html = '';
        calc.groups.forEach(function (group) {
            var fields = group.fields.map(function (field) {
                var id = fieldId(field);
                var hint = field.hint ? '<div class="field-hint">' + UI.esc(field.hint) + '</div>' : '';
                var label = '<label for="' + id + '">' + UI.esc(field.label) +
                    (field.unit ? ', ' + UI.esc(field.unit) : '') + '</label>';
                var control;

                if (field.type === 'select') {
                    var options = field.options.map(function (option) {
                        var selected = String(option.value) === String(field.value) ? ' selected' : '';
                        var optionLabel = option.label || (option.sides ? option.sides.join(' × ') : option.value);
                        return '<option value="' + UI.esc(option.value) + '"' + selected + '>' + UI.esc(optionLabel) + '</option>';
                    }).join('');
                    control = '<select id="' + id + '" data-field="' + field.id + '">' + options + '</select>';
                } else {
                    control = '<input id="' + id + '" type="number" inputmode="decimal" data-field="' + field.id + '"' +
                        ' min="' + (field.min === undefined ? 0 : field.min) + '"' +
                        ' step="' + (field.step === undefined ? 1 : field.step) + '"' +
                        ' value="' + UI.esc(field.value) + '"' +
                        (field.placeholder ? ' placeholder="' + UI.esc(field.placeholder) + '"' : '') + '>';
                }

                var wrapClass = field.width === 'half' ? 'col' : 'col col-full';
                return '<div class="' + wrapClass + '">' + label + control + hint + '</div>';
            }).join('');

            html += '<div class="calc-group">' +
                '<h3 class="calc-group-title">' + UI.esc(group.title) + '</h3>' +
                '<div class="row">' + fields + '</div>' +
                '</div>';
        });

        root.innerHTML = html;
    }

    function renderWarnings(warnings) {
        var box = UI.$('calcWarnings');
        if (!box) {
            return;
        }
        if (!warnings || warnings.length === 0) {
            box.textContent = '';
            box.classList.remove('is-visible');
            return;
        }
        box.innerHTML = '<strong>Проверьте данные:</strong><ul>' + warnings.map(function (text) {
            return '<li>' + UI.esc(text) + '</li>';
        }).join('') + '</ul>';
        box.classList.add('is-visible');
    }

    function formatRow(item) {
        var value = UI.formatNumber(item.value, item.decimals);
        return value + (item.unit ? ' ' + item.unit : '');
    }

    function renderResults() {
        var container = UI.$('calcGroups');
        if (!container) {
            return;
        }
        container.innerHTML = result.groups.map(function (group) {
            var rows = group.rows.map(function (item) {
                return '<div class="result-item">' +
                    '<span class="result-label">' + UI.esc(item.label) + '</span>' +
                    '<span class="result-val' + (item.highlight ? ' highlight' : '') + '">' + UI.esc(formatRow(item)) + '</span>' +
                    '</div>';
            }).join('');
            return '<div class="result-group">' +
                '<div class="result-group-title">' + UI.esc(group.title) + '</div>' +
                rows +
                '</div>';
        }).join('');

        var box = UI.$('calcTotalBox');
        if (box) {
            if (result.total > 0) {
                box.hidden = false;
                var total = UI.$('calcTotal');
                if (total) {
                    total.textContent = UI.formatMoney(result.total);
                }
                var details = UI.$('calcTotalDetails');
                if (details) {
                    var parts = [];
                    result.groups.forEach(function (group) {
                        group.rows.forEach(function (item) {
                            if (item.sum) {
                                parts.push(item.label.toLowerCase() + ' ' + UI.formatMoney(item.sum));
                            }
                        });
                    });
                    details.textContent = parts.join(' · ');
                }
            } else {
                box.hidden = true;
            }
        }

        if (Array.isArray(result.notes) && result.notes.length > 0) {
            container.insertAdjacentHTML('beforeend', result.notes.map(function (note) {
                return '<p class="results-note">' + UI.esc(note) + '</p>';
            }).join(''));
        }

        renderWarnings(result.warnings);
    }

    function compute() {
        state = readForm();
        result = calc.compute(state);
        renderResults();
        queueSave();
    }

    function queueSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(function () {
            UI.storage.set(DRAFT_KEY, JSON.stringify(state));
        }, 400);
    }

    function collectRows() {
        var rows = [];
        result.groups.forEach(function (group) {
            group.rows.forEach(function (item) {
                rows.push({
                    group: group.title,
                    label: item.label,
                    value: formatRow(item),
                    sum: item.sum
                });
            });
        });
        return rows;
    }

    function buildSummary() {
        var lines = [calc.summaryTitle];
        collectRows().forEach(function (item) {
            lines.push('• ' + item.label + ': ' + item.value + (item.sum ? ' — ' + UI.formatMoney(item.sum) : ''));
        });
        if (result.total > 0) {
            lines.push('Итого: ' + UI.formatMoney(result.total));
        }
        lines.push('Рассчитано на ' + window.location.href.split('#')[0]);
        return lines.join('\n');
    }

    function exportExcel() {
        var rows = collectRows().map(function (item) {
            return '<tr>' +
                '<td class="row-item">' + UI.esc(item.group) + '</td>' +
                '<td class="row-item">' + UI.esc(item.label) + '</td>' +
                '<td class="row-item num">' + UI.esc(item.value) + '</td>' +
                '<td class="row-item num">' + (item.sum ? UI.esc(UI.formatNumber(item.sum, 0)) : '—') + '</td>' +
                '</tr>';
        }).join('');

        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
            '<head><meta charset="utf-8"><style>td,th{font-family:Calibri,Arial,sans-serif;font-size:11pt;}' +
            '.th-header{background:#2563eb;color:#fff;font-weight:bold;border:1px solid #1d4ed8;padding:6px 10px;text-align:left;}' +
            '.row-item{border:0.5pt solid #cbd5e1;padding:5px 8px;}.num{text-align:right;}' +
            '.total-row{background:#ecfdf5;font-weight:bold;border:1.5pt solid #059669;}</style></head><body>' +
            '<h2>' + UI.esc(calc.summaryTitle) + '</h2>' +
            '<p><b>Дата расчёта:</b> ' + UI.esc(new Date().toLocaleDateString('ru-RU')) + '</p>' +
            '<table border="1" style="border-collapse:collapse;"><thead><tr>' +
            '<th class="th-header">Раздел</th><th class="th-header">Показатель</th>' +
            '<th class="th-header num">Количество</th><th class="th-header num">Сумма, ₽</th>' +
            '</tr></thead><tbody>' + rows +
            '<tr class="total-row"><td colspan="3" style="text-align:right;">ИТОГО:</td>' +
            '<td class="num">' + (result.total > 0 ? UI.esc(UI.formatNumber(result.total, 0)) + ' ₽' : '—') + '</td></tr>' +
            '</tbody></table><p>Расчёт выполнен сервисом Kevloro (kevloro.ru).</p></body></html>';

        UI.downloadBlob(html, UI.safeFileName(calc.fileBase) + '.xls', 'application/vnd.ms-excel;charset=utf-8');
        UI.track('export_excel');
        UI.toast('Файл Excel сохранён.');
    }

    function exportCsv() {
        var lines = [['Раздел', 'Показатель', 'Количество', 'Сумма, ₽'].join(';')];
        collectRows().forEach(function (item) {
            lines.push([item.group, item.label, item.value, item.sum ? Math.round(item.sum) : ''].map(function (cell) {
                return '"' + String(cell).replace(/"/g, '""') + '"';
            }).join(';'));
        });
        lines.push(['ИТОГО', '', '', Math.round(result.total || 0)].join(';'));
        UI.downloadBlob('\uFEFF' + lines.join('\r\n'), UI.safeFileName(calc.fileBase) + '.csv', 'text/csv;charset=utf-8');
        UI.track('export_csv');
        UI.toast('Файл CSV сохранён.');
    }

    function buildShareLink() {
        var encoded = window.btoa(encodeURIComponent(JSON.stringify(readForm())));
        return window.location.origin + window.location.pathname + '#data=' + encoded;
    }

    function applyHash() {
        var hash = window.location.hash || '';
        if (hash.indexOf('#data=') !== 0) {
            return false;
        }
        try {
            var parsed = JSON.parse(decodeURIComponent(window.atob(hash.slice(6))));
            if (!parsed || typeof parsed !== 'object') {
                return false;
            }
            writeForm(parsed);
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            UI.toast('Расчёт загружен из ссылки.');
            return true;
        } catch (error) {
            UI.toast('Ссылка повреждена — не удалось загрузить расчёт.');
            return false;
        }
    }

    function resetForm() {
        UI.storage.remove(DRAFT_KEY);
        writeForm(defaults());
        compute();
        UI.toast('Значения сброшены к типовым.');
    }

    /* --------------------------------------------------------- обработчики */

    UI.on(root, 'input', function (event) {
        if (event.target && event.target.getAttribute('data-field')) {
            compute();
        }
    });

    UI.on(root, 'change', function (event) {
        if (event.target && event.target.getAttribute('data-field')) {
            compute();
        }
    });

    UI.on(UI.$('calcBtn'), 'click', function () {
        compute();
        UI.track('calc_' + calc.id);
        var results = UI.$('calcResults');
        if (results) {
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    UI.on(UI.$('calcReset'), 'click', resetForm);

    UI.on(UI.$('copyBtn'), 'click', function () {
        UI.copyText(buildSummary(), 'Расчёт скопирован в буфер обмена.');
        UI.track('copy_text');
    });

    UI.on(UI.$('shareLinkBtn'), 'click', function () {
        var url = buildShareLink();
        if (url.length > 8000) {
            UI.toast('Слишком много данных для ссылки — используйте CSV или Excel.');
            return;
        }
        UI.copyText(url, 'Ссылка на расчёт скопирована.');
        UI.track('copy_link');
    });

    UI.on(UI.$('excelBtn'), 'click', exportExcel);
    UI.on(UI.$('csvBtn'), 'click', exportCsv);

    UI.on(UI.$('printBtn'), 'click', function () {
        var header = UI.$('printHeaderInfo');
        if (header) {
            var now = new Date();
            header.textContent = 'Расчёт сформирован ' + now.toLocaleDateString('ru-RU') +
                ' в ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        UI.track('print');
        window.print();
    });

    /* ---------------------------------------------------------------- старт */

    renderFields();

    var restored = false;
    if (!applyHash()) {
        var raw = UI.storage.get(DRAFT_KEY);
        if (raw) {
            try {
                var saved = JSON.parse(raw);
                if (saved && typeof saved === 'object') {
                    writeForm(saved);
                    restored = true;
                }
            } catch (error) {
                UI.storage.remove(DRAFT_KEY);
            }
        }
    } else {
        restored = true;
    }

    if (!restored) {
        writeForm(defaults());
    }

    compute();
})();
