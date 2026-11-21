/*!
 * Kevloro — настройки рекламы.
 *
 * enabled: false  — блоки скрыты, вёрстка не меняется (текущее состояние).
 * enabled: true   — блоки раскрываются, когда доскроллены до экрана.
 *
 * provider:
 *   'vk'     — VK Реклама: заполните clientId и добавьте свой вызов в KevloroAdsRender.
 *   'teaser' — тизерная сеть: то же самое, через KevloroAdsRender.
 *   'custom' — простой HTML-блок из поля html (для проверки вёрстки).
 *
 * Пример подключения сети (добавить после ads.config.js):
 * window.KevloroAdsRender = function (slot, container, config) {
 *     var name = slot.getAttribute('data-ad');
 *     if (config.provider === 'vk') {
 *         // здесь вызов рекламного кода VK с номером площадки config.clientId
 *         // и идентификатором блока config.slots[name]
 *         container.innerHTML = '<div id="vk_ads_' + name + '"></div>';
 *     }
 * };
 */
window.KEVLORO_ADS_CONFIG = {
    enabled: false,
    provider: 'vk',
    clientId: '',
    slots: {
        'article-top': '',
        'article-mid': '',
        'calculator-bottom': '',
        'blog-bottom': ''
    },
    html: ''
};
