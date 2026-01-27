import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);

import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
app.use(ElementPlus, {
    locale: zhCn
})

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

import client from "./request.js"
app.config.globalProperties.$axios = client

app.mount("#app");
