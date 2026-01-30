import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

const i18n = createI18n({
    locale: 'zhCn',
    fallbackLocale: 'en',
    messages: {
        en: en,
        zhCn: zh
    }
})
app.use(i18n)

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
app.use(ElementPlus)

// 注册icon
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// 全局事件系统
import mitt from 'mitt'
const $bus = mitt()
app.config.globalProperties.$bus = $bus

import {notify} from "@/commons.js";
app.config.globalProperties.notify = notify
app.config.globalProperties.notify.error = (msg) => {
    notify({type: "error", message: msg})
}
app.config.globalProperties.notify.primary = (msg) => {
    notify({type: "primary", message: msg})
}
app.config.globalProperties.notify.success = (msg) => {
    notify({type: "success", message: msg})
}
app.config.globalProperties.notify.warning = (msg) => {
    notify({type: "warning", message: msg})
}
app.config.globalProperties.notify.info = (msg) => {
    notify({type: "info", message: msg})
}

import client from "./request.js"
import {appConfigStore} from "@/store.js";
app.config.globalProperties.$axios = client

app.mount("#app");
