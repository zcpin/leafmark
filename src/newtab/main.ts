import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { t, uiLocale } from '@/lib/i18n'

import App from './App.vue'
import '@/styles/main.css'

document.title = t('newTab')
document.documentElement.lang = uiLocale() === 'zh_CN' ? 'zh-CN' : 'en'

createApp(App).use(createPinia()).mount('#app')
