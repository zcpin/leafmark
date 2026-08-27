// UI 文案 i18n（G2）
// 说明：应用内 UI 字符串用类型安全的 TS 字典作为单一来源；
// _locales/*.json 仅承担商店 listing 的 manifest 字符串（extName/extDescription）。
// 扩展环境优先用 chrome.i18n.getUILanguage()，开发预览回退 navigator.language。
const messages = {
  en: {
    appName: 'Leafmark',
    tagline: 'Your bookmarks, worth seeing again',
    bookmarksBar: 'Bookmarks bar',
    otherBookmarks: 'Other bookmarks',
    emptyFolder: 'This folder is empty',
    emptyFolderHint: 'Add bookmarks via the star in the address bar',
    loading: 'Loading…',
    loadError: 'Failed to load bookmarks',
    retry: 'Retry',
    setAsHome: 'Set as homepage',
    homeSet: 'Homepage updated',
    open: 'Open',
    openInNewTab: 'Open in new tab',
    openInCurrentTab: 'Open in current tab',
    copyUrl: 'Copy URL',
    copied: 'URL copied',
    copyFailed: 'Copy failed',
    download: 'Download',
    qrCode: 'QR Code',
    openAll: 'Open all',
    edit: 'Edit',
    delete: 'Delete',
    deleteBookmarkTitle: 'Delete bookmark',
    deleteBookmarkMessage: 'Delete this bookmark? This cannot be undone.',
    deleteFolderTitle: 'Delete folder',
    deleteFolderMessage: 'Delete this folder and ALL bookmarks inside? This cannot be undone.',
    cancel: 'Cancel',
    confirmDelete: 'Delete',
    save: 'Save',
    editBookmarkTitle: 'Edit bookmark',
    editFolderTitle: 'Rename folder',
    nameLabel: 'Name',
    urlLabel: 'URL',
    urlRequired: 'URL is required',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeAuto: 'Follow system',
    settingsOpenInNewTab: 'Open bookmarks in new tab',
  },
  zh_CN: {
    appName: '叶签',
    tagline: '你的书签，值得被重新看见',
    bookmarksBar: '书签栏',
    otherBookmarks: '其他书签',
    emptyFolder: '这个文件夹是空的',
    emptyFolderHint: '点击地址栏的星标即可收藏网页',
    loading: '加载中…',
    loadError: '书签加载失败',
    retry: '重试',
    setAsHome: '设为主页',
    homeSet: '主页已更新',
    open: '打开',
    openInNewTab: '在新标签页打开',
    openInCurrentTab: '在当前页打开',
    copyUrl: '复制链接',
    copied: '链接已复制',
    copyFailed: '复制失败',
    download: '下载',
    qrCode: '二维码',
    openAll: '全部打开',
    edit: '编辑',
    delete: '删除',
    deleteBookmarkTitle: '删除书签',
    deleteBookmarkMessage: '确定删除这个书签吗？删除后无法恢复。',
    deleteFolderTitle: '删除文件夹',
    deleteFolderMessage: '确定删除这个文件夹及其内部全部书签吗？删除后无法恢复。',
    cancel: '取消',
    confirmDelete: '删除',
    save: '保存',
    editBookmarkTitle: '编辑书签',
    editFolderTitle: '重命名文件夹',
    nameLabel: '名称',
    urlLabel: '网址',
    urlRequired: '请填写网址',
    themeLight: '浅色',
    themeDark: '深色',
    themeAuto: '跟随系统',
    settingsOpenInNewTab: '在新标签页打开书签',
  },
} as const

export type MessageKey = keyof (typeof messages)['en']
type Locale = keyof typeof messages

function uiLocale(): Locale {
  const raw =
    typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : navigator.language
  return raw.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en'
}

export function t(key: MessageKey): string {
  const locale = uiLocale()
  return messages[locale][key] ?? messages.en[key] ?? key
}
