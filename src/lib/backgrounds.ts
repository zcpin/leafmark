import type { MessageKey } from './i18n'

interface ColorTheme {
  id: string
  label: MessageKey
  light: readonly [string, string, string]
  dark: readonly [string, string, string]
}

/** 背景与设置预览共用色值；传统色来源及对比度见 docs/08-传统色主题.md。 */
export const COLOR_THEMES: readonly ColorTheme[] = [
  { id: 'gradient-emerald', label: 'colorEmerald', light: ['#d1fae5', '#a7f3d0', '#ecfeff'], dark: ['#064e3b', '#022c22', '#0f172a'] },
  { id: 'gradient-sky', label: 'colorSky', light: ['#bae6fd', '#e0f2fe', '#f0f9ff'], dark: ['#0c4a6e', '#075985', '#0f172a'] },
  { id: 'gradient-sunset', label: 'colorSunset', light: ['#fed7aa', '#fecaca', '#fbcfe8'], dark: ['#7c2d12', '#9d174d', '#1e1b4b'] },
  { id: 'gradient-slate', label: 'colorSlate', light: ['#f1f5f9', '#e2e8f0', '#cbd5e1'], dark: ['#1e293b', '#0f172a', '#020617'] },
  // 月白、远天蓝、鱼肚白 / 钢青、燕颔蓝、青灰
  { id: 'gradient-celadon', label: 'colorCeladon', light: ['#eef7f2', '#d0dfe6', '#f7f4ed'], dark: ['#142334', '#131824', '#2b333e'] },
  // 月白、艾绿、鱼肚白 / 苍绿、燕颔蓝、青灰
  { id: 'gradient-mugwort', label: 'colorMugwort', light: ['#eef7f2', '#cad3c3', '#f7f4ed'], dark: ['#223e36', '#131824', '#2b333e'] },
  // 淡米粉、藕荷、丁香淡紫 / 葡萄酱紫、李紫、燕颔蓝
  { id: 'gradient-lotus', label: 'colorLotus', light: ['#fbeee2', '#edc3ae', '#e9d7df'], dark: ['#5a1216', '#2b1216', '#131824'] },
  // 鱼肚白、酪黄、淡米粉 / 长石灰、李紫、燕颔蓝
  { id: 'gradient-amber', label: 'colorAmber', light: ['#f7f4ed', '#f6dead', '#fbeee2'], dark: ['#363433', '#2b1216', '#131824'] },
  // 鱼肚白、丁香淡紫、远天蓝 / 晶石紫、燕颔蓝、钢青
  { id: 'gradient-lilac', label: 'colorLilac', light: ['#f7f4ed', '#e9d7df', '#d0dfe6'], dark: ['#1f2040', '#131824', '#142334'] },
  // 鱼肚白、月白、雪白 / 长石灰、青灰、燕颔蓝
  { id: 'gradient-moon', label: 'colorMoon', light: ['#f7f4ed', '#eef7f2', '#fffef9'], dark: ['#363433', '#2b333e', '#131824'] },
]

export function themeGradient(id: string, mode: 'light' | 'dark'): string {
  const theme = COLOR_THEMES.find((item) => item.id === id) ?? COLOR_THEMES[0]!
  const colors = theme[mode]
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`
}
