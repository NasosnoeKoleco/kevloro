/*!
 * Kevloro 2.2 — общие помощники интерфейса.
 * Тема, офлайн-статус, установка PWA, уведомления, экспорт, аналитика.
 */
(function () {
    'use strict';

    var YM_ID = 112471439;
    var THEME_KEY = 'kevloro:theme';

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

    function toNumber(value, fallback) {
        var def = typeof fallback === 'number' ? fallback : 0;
        if (value === null || value === undefined || value === '') {
            return def;
        }
        var n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.').trim());
        return Number.isFinite(n) ? n : def;
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
        var element = $('toast');
        if (!element) {
            return;
        }
        element.textContent = message;
        element.classList.add('is-visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () {
            element.classList.remove('is-visible');
        }, 3400);
    }

    function track(goal, params) {
        try {
            if (typeof window.ym === 'function') {
                window.ym(YM_ID, 'reachGoal', goal, params || {});
            }
        } catch (error) { /* аналитика не должна ломать расчёт */ }
    }

    function copyText(text, successMessage) {
        if (!text) {
            toast('Сначала выполните расчёт.');
            return;
        }
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
            window.navigator.clipboard.writeText(text).then(function () {
                toast(successMessage || 'Скопировано в буфер обмена.');
            }).catch(function () {
                window.prompt('Скопируйте вручную:', text);
            });
            return;
        }
        window.prompt('Скопируйте вручную:', text);
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

    /* ------------------------------------------------------------- тема */

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

    /* ------------------------------------------------------ статус сети */

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

    /* ------------------------------------------------------------- PWA */

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

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        if (pwaBanner && !storage.get('kevloro:pwa-banner-closed')) {
            pwaBanner.hidden = false;
        }
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

    /* --------------------------------------------------- cookie-баннер */

    (function consent() {
        if (storage.get('kevloro:consent')) {
            return;
        }
        var banner = document.createElement('div');
        banner.className = 'consent';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Использование cookie');
        banner.innerHTML = '<p>Сайт использует cookie для статистики посещений. ' +
            'Расчёты остаются в браузере. <a href="/privacy.html">Подробнее</a>.</p>' +
            '<div class="consent-actions"><button type="button" class="btn-action" data-consent="ok">Понятно</button></div>';
        document.body.appendChild(banner);

        banner.addEventListener('click', function (event) {
            var button = event.target.closest ? event.target.closest('[data-consent]') : null;
            if (!button) {
                return;
            }
            storage.set('kevloro:consent', '1');
            banner.remove();
            track('consent_ok');
        });
    })();

    window.KevloroUI = {
        $: $,
        on: on,
        esc: esc,
        toNumber: toNumber,
        formatNumber: formatNumber,
        formatMoney: formatMoney,
        storage: storage,
        toast: toast,
        track: track,
        copyText: copyText,
        safeFileName: safeFileName,
        downloadBlob: downloadBlob,
        currentTheme: currentTheme,
        applyTheme: applyTheme
    };
})();
