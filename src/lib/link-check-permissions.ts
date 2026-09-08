import { callChrome } from './chrome-bridge'
import { isExtensionEnv } from './env'

const WEB_ORIGINS = ['http://*/*', 'https://*/*']

export function supportsLinkCheck(): boolean {
  return isExtensionEnv() && typeof chrome.permissions?.request === 'function'
}

/** 必须由点击事件直接调用；首次 await 前调用 Chrome，以保留用户手势。 */
export function requestLinkCheckAccess(): Promise<boolean> {
  if (!supportsLinkCheck()) return Promise.resolve(false)
  return callChrome<boolean>((callback) => chrome.permissions.request({ origins: WEB_ORIGINS }, callback))
}
