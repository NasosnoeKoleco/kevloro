/*!
 * Kevloro — рекламные места.
 *
 * Механика:
 *   1. Пока слот не доскроллен, он скрыт и ничего не грузит.
 *   2. При подходе к экрану ads.js создаёт <ins class="mrg-tag"> и один раз
 *      подключает загрузчик сети, затем добавляет задание в MRGtag.
 *   3. Если через 5 секунд блок не заполнился (модерация, блокировщик, сбой
 *      сети), слот снова скрывается — пустого места на странице не остаётся.
 */
(function () {
    'use strict';

    var CONFIG = window.KEVLORO_ADS_CONFIG || { enabled: false };
    var slots = document.querySelectorAll('.ad-slot');

    if (!slots.length || !CONFIG.enabled) {
        return;
    }

    var FILL_TIMEOUT = 5000;

    function slotConfig(name) {
        var map = CONFIG.slots || {};
        var value = map[name];
        if (!value) {
            return null;
        }
        return typeof value === 'string' ? { id: value } : value;
    }

    function ensureLoader() {
        if (!CONFIG.loader || document.querySelector('script[data-ad-loader]')) {
            return;
        }
        var script = document.createElement('script');
        script.async = true;
        script.src = CONFIG.loader;
        script.setAttribute('data-ad-loader', '1');
        document.head.appendChild(script);
    }

    function renderNetwork(container, config) {
        var size = String(config.format || '300x250').split('x');
        var width = parseInt(size[0], 10) || 300;
        var height = parseInt(size[1], 10) || 250;

        var tag = document.createElement('ins');
        tag.className = 'mrg-tag';
        tag.style.display = 'inline-block';
        tag.style.width = width + 'px';
        tag.style.height = height + 'px';
        tag.setAttribute('data-ad-client', 'ad-' + config.id);
        tag.setAttribute('data-ad-slot', String(config.id));
        container.appendChild(tag);

        ensureLoader();
        (window.MRGtag = window.MRGtag || []).push({});

        return tag;
    }

    // Если сеть заполнила блок позже, показываем его снова; если не заполнила —
    // прячем, чтобы на странице не осталось пустого прямоугольника.
    function watchFill(slot, tag) {
        var revealed = false;

        function reveal() {
            if (revealed) {
                return;
            }
            revealed = true;
            slot.hidden = false;
            slot.setAttribute('data-ad-filled', '1');
        }

        if (tag.children.length > 0) {
            reveal();
            return;
        }

        var observer = new MutationObserver(function () {
            if (tag.children.length > 0) {
                observer.disconnect();
                reveal();
            }
        });
        observer.observe(tag, { childList: true, subtree: true });

        window.setTimeout(function () {
            observer.disconnect();
            if (tag.children.length === 0) {
                slot.hidden = true;
                slot.removeAttribute('data-active');
            }
        }, FILL_TIMEOUT);
    }

    function activate(slot) {
        if (slot.getAttribute('data-active') === '1') {
            return;
        }

        var inner = slot.querySelector('.ad-slot-inner');
        if (!inner) {
            return;
        }

        var name = slot.getAttribute('data-ad');
        var config = slotConfig(name);
        var hasCustomRenderer = typeof window.KevloroAdsRender === 'function';
        var hasCode = Boolean(config && typeof config.code === 'string' && config.code.trim());

        if (!hasCustomRenderer && !hasCode && !(config && config.id)) {
            return;
        }

        slot.setAttribute('data-active', '1');
        var placeholder = slot.querySelector('.ad-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        try {
            if (hasCustomRenderer) {
                window.KevloroAdsRender(slot, inner, CONFIG, config);
                slot.hidden = false;
                return;
            }

            if (hasCode) {
                inner.insertAdjacentHTML('beforeend', config.code);
                slot.hidden = false;
                return;
            }

            var tag = renderNetwork(inner, config);
            slot.hidden = false;
            watchFill(slot, tag);
        } catch (error) {
            slot.hidden = true;
        }
    }

    window.KevloroAds = {
        config: CONFIG,
        mount: function () {
            slots.forEach(activate);
        }
    };

    if (!('IntersectionObserver' in window)) {
        slots.forEach(activate);
        return;
    }

    // Слот скрыт через [hidden], поэтому наблюдаем невидимый маркер перед ним:
    // у скрытого элемента нет площади и он никогда не «пересекается».
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                observer.unobserve(entry.target);
                activate(entry.target.__adSlot);
            }
        });
    }, { rootMargin: '400px 0px' });

    slots.forEach(function (slot) {
        var sentinel = document.createElement('span');
        sentinel.className = 'ad-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.__adSlot = slot;
        slot.parentNode.insertBefore(sentinel, slot);
        observer.observe(sentinel);
    });
})();
