/*!
 * Kevloro — рекламные места.
 *
 * Пока сеть не подключена, блоки скрыты и не занимают место в вёрстке.
 * Чтобы включить, заполните ads.config.js и подключите код сети
 * через window.KevloroAdsRender (см. ниже) или провайдера «custom».
 */
(function () {
    'use strict';

    var CONFIG = window.KEVLORO_ADS_CONFIG || { enabled: false };
    var slots = document.querySelectorAll('.ad-slot');

    if (!slots.length) {
        return;
    }

    function activate(slot) {
        if (slot.getAttribute('data-active') === '1') {
            return;
        }
        slot.setAttribute('data-active', '1');
        slot.hidden = false;

        var inner = slot.querySelector('.ad-slot-inner');
        var placeholder = slot.querySelector('.ad-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        if (!inner) {
            return;
        }

        if (typeof window.KevloroAdsRender === 'function') {
            try {
                window.KevloroAdsRender(slot, inner, CONFIG);
            } catch (error) {
                inner.innerHTML = '<span class="ad-placeholder">Реклама временно недоступна</span>';
            }
        } else if (CONFIG.provider === 'custom' && typeof CONFIG.html === 'string') {
            inner.insertAdjacentHTML('beforeend', CONFIG.html);
        }
    }

    window.KevloroAds = {
        config: CONFIG,
        mount: function () {
            slots.forEach(activate);
        }
    };

    if (!CONFIG.enabled) {
        return;
    }

    if (!('IntersectionObserver' in window)) {
        slots.forEach(activate);
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                observer.unobserve(entry.target);
                activate(entry.target);
            }
        });
    }, { rootMargin: '400px 0px' });

    slots.forEach(function (slot) {
        observer.observe(slot);
    });
})();
