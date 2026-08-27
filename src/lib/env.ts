/** 是否运行在扩展环境（pnpm dev 纯 Web 预览时为 false，走回退数据源） */
export function isExtensionEnv(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}
