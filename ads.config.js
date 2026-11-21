/*!
 * Kevloro — настройки рекламы (VK / Mail.ru, mrg-tag).
 *
 * Блок включается сам, когда у него есть id площадки и включён enabled.
 * Код интеграции вставлять вручную не нужно: ads.js собирает <ins> из id,
 * размеров и адреса загрузчика.
 *
 * enabled: false — выключить всю рекламу на сайте одной строкой.
 */
window.KEVLORO_ADS_CONFIG = {
    enabled: true,
    provider: 'mrg',
    loader: 'https://ad.mail.ru/static/ads-async.js',

    slots: {
        'article-top': { id: '2116290', format: '300x250' },
        'article-mid': { id: '2116298', format: '336x280' },
        'calculator-bottom': { id: '2116300', format: '300x250' },
        'blog-bottom': { id: '2116302', format: '300x250' }
    }
};
