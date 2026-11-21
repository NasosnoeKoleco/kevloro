/*!
 * Kevloro — рекламные места.
 *
 * Блок раскрывается только когда для него есть код интеграции из кабинета
 * (ads.config.js → slots.<имя>.code) или подключён свой рендерер
 * window.KevloroAdsRender. Иначе слот остаётся скрытым и не занимает место.
 */
(function () {
    'use strict';

    var CONFIG = window.KEVLORO_ADS_CONFIG || { enabled: false };
    var slots = document.querySelectorAll('.ad-slot');

    if (!slots.length || !CONFIG.enabled) {
        return;
    }

    function slotConfig(name) {
        var map = CONFIG.slots || {};
        var value = map[name];
        if (!value) {
            return null;
        }
        if (typeof value === 'string') {
            return { id: value, code: '' };
        }
        return value;
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
        var conf = slotConfig(name);
        var hasCustomRenderer = typeof window.KevloroAdsRender === 'function';
        var hasCode = Boolean(conf && typeof conf.code === 'string' && conf.code.trim());
        var legacyHtml = CONFIG.provider === 'custom' && typeof CONFIG.html === 'string' && CONFIG.html.trim();

        if (!hasCustomRenderer && !hasCode && !legacyHtml) {
            // Кода ещё нет — блок не показываем, чтобы не оставлять пустое место.
            return;
        }

        slot.setAttribute('data-active', '1');

        var placeholder = slot.querySelector('.ad-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        try {
            if (hasCustomRenderer) {
                window.KevloroAdsRender(slot, inner, CONFIG, conf);
            } else if (hasCode) {
                inner.insertAdjacentHTML('beforeend', conf.code);
            } else {
                inner.insertAdjacentHTML('beforeend', CONFIG.html);
            }
            slot.hidden = false;
        } catch (error) {
            inner.innerHTML = '<span class="ad-placeholder">Реклама временно недоступна</span>';
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

    // Слот скрыт через [hidden], поэтому наблюдаем не его, а невидимый маркер
    // перед ним: у скрытого элемента нет площади и он никогда не «пересекается».
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
