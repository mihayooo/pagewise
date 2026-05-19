/**
 * ESLint Flat Config — 智阅 PageWise
 *
 * 使用 ES Modules (export default) 的 flat config 格式
 * 规则: no-unused-vars / no-undef / eqeqeq / no-implicit-globals
 *
 * 设计决策 D023:
 *   - ESLint v9+ flat config，无 .eslintrc 遗留格式
 *   - 规则先以 warn 为基线，逐步收紧为 error
 *   - chrome 全局变量声明在 browser 配置中
 *   - 忽略第三方/构建产物目录
 */

export default [
  // ========== 全局忽略 ==========
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'docs/reference/**',
      'dist/**',
      '_metadata/**',
      'lib/pdf.min.mjs',
      'lib/pdf.worker.min.mjs',
      'lib/pdf.min.js',
      'lib/pdf.worker.min.js',
      'lib/pdf.worker.js',
      'lib/pdf.worker.mjs',
    ],
  },

  // ========== 全局规则 ==========
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Chrome 扩展 API
        chrome: 'readonly',
        // 浏览器全局变量 (Chrome 扩展运行环境)
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        matchMedia: 'readonly',
        getComputedStyle: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        self: 'readonly',
        globalThis: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        DOMParser: 'readonly',
        XMLSerializer: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        FocusEvent: 'readonly',
        InputEvent: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        Path2D: 'readonly',
        ImageData: 'readonly',
        OffscreenCanvas: 'readonly',
        createImageBitmap: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        ReadableStream: 'readonly',
        CompressionStream: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly',
        // DOM 全局变量
        Node: 'readonly',
        NodeFilter: 'readonly',
        XPathResult: 'readonly',
        // IndexedDB
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        localStorage: 'readonly',
        // Chrome 扩展 content script 非模块全局类 (IIFE 注入)
        SelectionToolbar: 'readonly',
        SelectionDetector: 'readonly',
        SelectionHandler: 'readonly',
        ExploreMode: 'readonly',
      },
    },

    rules: {
      // === 核心规则 (R109 要求) ===
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-undef': 'warn',
      'eqeqeq': ['error', 'always'],
      'no-implicit-globals': 'error',
    },
  },

  // ========== 测试文件规则放宽 ==========
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        // Node.js 测试环境全局变量
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        // Chrome 扩展 API (测试中 mock)
        chrome: 'readonly',
        // 浏览器 API (测试中可能 mock)
        localStorage: 'readonly',
      },
    },
    rules: {
      // 测试文件中允许未使用变量（解构 mock 等）
      'no-unused-vars': 'off',
    },
  },

  // ========== Node.js 脚本 ==========
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
  },
];
