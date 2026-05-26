import { appConfigStore } from '../store.js'

// 主题 CSS 变量映射
const themeVars = {
    dark: {
        // 基础背景色
        '--bg-primary': '#0f172a',
        '--bg-card': '#1e293b',
        '--bg-panel': '#0d0d14',
        '--bg-header-start': '#1a1a2e',
        '--bg-header-end': '#16213e',
        '--bg-status-start': '#12121a',
        '--bg-status-end': '#181824',

        // 文字颜色
        '--text-primary': '#ffffff',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#64748b',

        // 状态颜色
        '--color-success': '#67C23A',
        '--color-success-alt': '#22c55e',
        '--color-error': '#F40',
        '--color-error-alt': '#ef4444',
        '--color-warning': '#E6A23C',
        '--color-primary': '#409EFF',
        '--color-primary-light': '#5ca4ff',
        '--color-primary-dark': '#3375e9',

        // 边框和分割线
        '--border-color': 'rgba(255, 255, 255, 0.08)',
        '--border-color-light': 'rgba(255, 255, 255, 0.06)',
        '--border-color-active': 'rgba(64, 158, 255, 0.25)',

        // 特殊元素背景
        '--bg-hover': 'rgba(64, 158, 255, 0.15)',
        '--bg-active': 'rgba(64, 158, 255, 0.2)',
        '--bg-sftp': 'rgba(34, 197, 94, 0.15)',
        '--bg-serial': 'rgba(230, 162, 60, 0.15)',
        '--bg-port-forward': 'rgba(64, 158, 255, 0.15)',

        // 渐变辅助色
        '--gradient-active': '#22c55e',
        '--gradient-pressed-start': '#334155',
        '--gradient-pressed-end': 'rgba(51, 65, 85, 0.9)',
        '--gradient-pressed-highlight': '#3d4f63',

        // 按钮和交互
        '--btn-primary-bg': 'linear-gradient(135deg, #409EFF 0%, #3375e9 100%)',
        '--btn-primary-hover': 'linear-gradient(135deg, #5ca4ff 0%, #4d8aee 100%)',
        '--btn-shadow': 'rgba(64, 158, 255, 0.45)',

        // 分割条
        '--splitter-bg': 'rgba(255, 255, 255, 0.08)',
        '--splitter-hover': 'rgba(64, 158, 255, 0.4)',
        '--splitter-inner': 'rgba(255, 255, 255, 0.15)',

        // Tabs 样式
        '--tabs-item-hover-bg': 'rgba(255, 255, 255, 0.05)',
        '--tabs-item-active-bg-start': '#252535',
        '--tabs-item-active-bg-end': '#1e1e2a',
        '--tabs-item-active-shadow': 'rgba(64, 158, 255, 0.15)',
        '--tabs-header-border': 'rgba(255, 255, 255, 0.06)',
        '--tabs-border-top': 'rgba(255, 255, 255, 0.05)',
        '--tabs-close-hover-bg': 'rgba(239, 68, 68, 0.9)',
    },
    light: {
        // 全局默认文字颜色
        '--color-text-base': '#1e293b',

        // 基础背景色
        '--bg-primary': '#f5f7fa',
        '--bg-card': '#ffffff',
        '--bg-panel': '#ffffff',
        '--bg-header-start': '#ffffff',
        '--bg-header-end': '#f8fafc',
        '--bg-status-start': '#f8fafc',
        '--bg-status-end': '#f1f5f9',

        // 文字颜色
        '--text-primary': '#1e293b',
        '--text-secondary': '#64748b',
        '--text-muted': '#94a3b8',

        // 状态颜色
        '--color-success': '#67C23A',
        '--color-success-alt': '#22c55e',
        '--color-error': '#F40',
        '--color-error-alt': '#ef4444',
        '--color-warning': '#E6A23C',
        '--color-primary': '#409EFF',
        '--color-primary-light': '#79bbff',
        '--color-primary-dark': '#3375e9',

        // 边框和分割线
        '--border-color': 'rgba(0, 0, 0, 0.08)',
        '--border-color-light': 'rgba(0, 0, 0, 0.04)',
        '--border-color-active': 'rgba(64, 158, 255, 0.35)',

        // 特殊元素背景
        '--bg-hover': 'rgba(64, 158, 255, 0.1)',
        '--bg-active': 'rgba(64, 158, 255, 0.15)',
        '--bg-sftp': 'rgba(34, 197, 94, 0.1)',
        '--bg-serial': 'rgba(230, 162, 60, 0.1)',
        '--bg-port-forward': 'rgba(64, 158, 255, 0.1)',

        // 渐变辅助色
        '--gradient-active': '#409EFF',
        '--gradient-pressed-start': '#e2e8f0',
        '--gradient-pressed-end': 'rgba(226, 232, 240, 0.9)',
        '--gradient-pressed-highlight': '#cbd5e1',

        // 按钮和交互
        '--btn-primary-bg': 'linear-gradient(135deg, #409EFF 0%, #3375e9 100%)',
        '--btn-primary-hover': 'linear-gradient(135deg, #79bbff 0%, #5ca4ff 100%)',
        '--btn-shadow': 'rgba(64, 158, 255, 0.3)',

        // 分割条
        '--splitter-bg': 'rgba(0, 0, 0, 0.08)',
        '--splitter-hover': 'rgba(64, 158, 255, 0.4)',
        '--splitter-inner': 'rgba(0, 0, 0, 0.15)',

        // Tabs 样式
        '--tabs-item-hover-bg': 'rgba(0, 0, 0, 0.05)',
        '--tabs-item-active-bg-start': '#f1f5f9',
        '--tabs-item-active-bg-end': '#e2e8f0',
        '--tabs-item-active-shadow': 'rgba(64, 158, 255, 0.2)',
        '--tabs-header-border': 'rgba(0, 0, 0, 0.08)',
        '--tabs-border-top': 'rgba(0, 0, 0, 0.08)',
        '--tabs-close-hover-bg': 'rgba(239, 68, 68, 0.85)',
    }
}

/**
 * 应用主题到 document
 * @param {string} themeName - 'dark' 或 'light'
 */
export function applyTheme(themeName) {
    const root = document.documentElement
    const vars = themeVars[themeName]

    if (!vars) {
        console.warn(`Unknown theme: ${themeName}`)
        return
    }

    // 设置所有 CSS 变量
    Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(key, value)
    })

    // 更新 HTML class 用于 Element Plus 主题
    if (themeName === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
    } else {
        root.classList.add('light')
        root.classList.remove('dark')
    }

    // 更新 store
    const store = appConfigStore()
    store.theme = themeName
}

/**
 * 初始化主题（根据 store 中的设置）
 */
export function initTheme() {
    const store = appConfigStore()
    applyTheme(store.theme || 'dark')
}

/**
 * 切换主题
 */
export function toggleTheme() {
    const store = appConfigStore()
    const newTheme = store.theme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)
}
