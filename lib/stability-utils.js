/**
 * StabilityUtils — 防御性工具函数模块 (R183 稳定性提升)
 *
 * 提供统一的类型安全、安全访问、数值工具和异步工具函数，
 * 用于修复边界情况和提升错误处理能力。
 *
 * 设计约束:
 * - 纯 ES Module，零外部依赖
 * - 纯函数，零副作用，不修改输入数据
 * - 不依赖 DOM / Chrome API，可在任意上下文使用
 * - 所有 safe* 函数对无效输入返回安全默认值，绝不抛异常
 */

// ==================== 类型安全 ====================

/**
 * 确保返回数组 — null/undefined/非数组返回空数组
 * @param {*} val
 * @returns {Array}
 */
export function safeArray(val) {
  return Array.isArray(val) ? val : []
}

/**
 * 确保返回字符串 — null/undefined/非字符串返回空字符串
 * 对 number/boolean 做类型转换（它们有合理的字符串表示）
 * 对对象/数组/函数返回空字符串（避免 [object Object]）
 * @param {*} val
 * @returns {string}
 */
export function safeString(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' && Number.isFinite(val)) return String(val)
  if (typeof val === 'boolean') return String(val)
  return ''
}

/**
 * 确保返回有效数字 — null/undefined/NaN/Infinity/非数字类型返回 fallback
 * @param {*} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeNumber(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  return fallback
}

/**
 * 确保返回数组 — 单值包装为数组，数组透传，null/undefined 返回空数组
 * @param {*} val
 * @returns {Array}
 */
export function ensureArray(val) {
  if (val === null || val === undefined) return []
  if (Array.isArray(val)) return val
  return [val]
}

// ==================== 安全访问 ====================

/**
 * 安全深度属性访问 — 支持点号路径（a.b.c）
 * @param {object} obj - 目标对象
 * @param {string} path - 属性路径（点号分隔）
 * @param {*} [fallback=undefined] - 路径不存在时的返回值
 * @returns {*}
 */
export function safeGet(obj, path, fallback = undefined) {
  if (obj === null || obj === undefined) return fallback
  if (typeof path !== 'string' || path === '') {
    return path === '' ? obj : fallback
  }

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return fallback
    }
    current = current[part]
  }

  return current === undefined ? fallback : current
}

/**
 * 安全函数调用 — fn 非函数或调用失败时返回 fallback
 * @param {*} fn - 要调用的函数
 * @param {*} [fallback=undefined] - 失败时的返回值
 * @param  {...any} args - 传递给 fn 的参数
 * @returns {*}
 */
export function safeCall(fn, fallback = undefined, ...args) {
  if (typeof fn !== 'function') return fallback
  try {
    return fn(...args)
  } catch {
    return fallback
  }
}

// ==================== 数值工具 ====================

/**
 * 数值范围限制 — 将 val 限制在 [min, max] 范围内
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return min
  // 自动交换 min > max
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.max(lo, Math.min(hi, val))
}

/**
 * 安全整数解析 — 失败时返回 fallback
 * @param {*} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeParseInt(val, fallback = 0) {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return fallback
    return Math.trunc(val)
  }
  if (typeof val !== 'string' || val.trim() === '') return fallback
  const result = parseInt(val, 10)
  return Number.isFinite(result) ? result : fallback
}

/**
 * 安全浮点解析 — 失败时返回 fallback
 * @param {*} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeParseFloat(val, fallback = 0) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback
  }
  if (typeof val !== 'string' || val.trim() === '') return fallback
  const result = parseFloat(val)
  return Number.isFinite(result) ? result : fallback
}

/**
 * 安全除法 — 防除零和无效输入
 * @param {number} a - 分子
 * @param {number} b - 分母
 * @param {number} [fallback=0] - 除零或无效时的返回值
 * @returns {number}
 */
export function safeDivide(a, b, fallback = 0) {
  if (typeof a !== 'number' || !Number.isFinite(a)) return fallback
  if (typeof b !== 'number' || !Number.isFinite(b)) return fallback
  if (b === 0) return fallback
  return a / b
}

// ==================== 异步工具 ====================

/**
 * Promise 超时包装 — 超时后抛出 TimeoutError
 * @param {Promise} promise - 要包装的 Promise
 * @param {number} ms - 超时毫秒数
 * @param {string} [msg='操作超时'] - 超时错误消息
 * @returns {Promise}
 */
export function withTimeout(promise, ms, msg = '操作超时') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${msg} (${ms}ms)`))
    }, ms)

    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

/**
 * 异步重试 — 指数退避
 * @param {Function} fn - 异步函数
 * @param {number} [retries=3] - 最大重试次数
 * @param {number} [delay=100] - 初始延迟毫秒数
 * @returns {Promise}
 */
export async function retryAsync(fn, retries = 3, delay = 100) {
  let lastError
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < retries) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}

/**
 * 异步错误边界 — fn 失败时返回 fallback
 * @param {Function} fn - 异步函数
 * @param {*} [fallback=undefined] - 失败时的返回值
 * @returns {Promise}
 */
export async function safeAsync(fn, fallback = undefined) {
  if (typeof fn !== 'function') return fallback
  try {
    return await fn()
  } catch {
    return fallback
  }
}

// ==================== 通用工具 ====================

/**
 * 防抖 — 延迟执行，多次调用只执行最后一次
 * @param {Function} fn - 要防抖的函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/**
 * 节流 — 限制执行频率，首次立即执行
 * @param {Function} fn - 要节流的函数
 * @param {number} ms - 节流窗口毫秒数
 * @returns {Function}
 */
export function throttle(fn, ms) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= ms) {
      lastTime = now
      return fn(...args)
    }
  }
}

/**
 * 安全 ID 生成 — 基于时间戳 + 随机数
 * @param {string} [prefix='id'] - ID 前缀
 * @returns {string}
 */
export function generateId(prefix = 'id') {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${ts}-${rand}`
}

/**
 * 深拷贝 — 优先使用 structuredClone，fallback 到 JSON 序列化
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  // structuredClone 可用时优先使用
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj)
    } catch {
      // structuredClone 不支持某些类型（如 Function），fallback
    }
  }

  // JSON 序列化 fallback（丢失 Function/undefined/Symbol/循环引用）
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    return obj
  }
}
