/*!
 * Kevloro — настройки рекламы.
 *
 * Как включить блок:
 *   1. В кабинете VK у блока нажмите «Код интеграции» и скопируйте сниппет.
 *   2. Вставьте его в поле code нужного блока ниже.
 *   3. Сохраните файл — блок появится сам, остальные останутся скрытыми.
 *
 * Пока code пустой, слот не показывается и не занимает место в вёрстке.
 */
window.KEVLORO_ADS_CONFIG = {
    enabled: true,
    provider: 'vk',
    clientId: '',

    slots: {
        'article-top': {
            id: '2116290',
            format: '300x250',
            code: ''
        },
        'article-mid': {
            id: '2116298',
            format: '336x280',
            code: ''
        },
        'calculator-bottom': {
            id: '2116300',
            format: '300x250',
            code: ''
        },
        'blog-bottom': {
            id: '2116302',
            format: '300x250',
            code: ''
        }
    }
};
