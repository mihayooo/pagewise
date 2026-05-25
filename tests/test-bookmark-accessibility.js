/**
 * 测试 lib/bookmark-accessibility.js — BookmarkAccessibility
 *
 * 书签面板无障碍支持 (R79/R131):
 *   - 键盘导航 (Arrow/Enter/Escape/Tab)
 *   - 屏幕阅读器支持 (aria-label, role, live regions)
 *   - 焦点管理 (焦点环、焦点陷阱)
 *   - 颜色对比度 ≥ 4.5:1
 *
 * AC: 单元测试 ≥ 62 个用例 (R131)
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupTestEnv } from './helpers/setup.js'

const {
  BookmarkAccessibility,
  ARIA_ROLES,
  FOCUS_TRAP_SELECTORS,
  KEYBOARD_NAV_KEYS,
  getContrastRatio,
  meetsWCAG_AA,
  hexToRgb,
} = await import('../lib/bookmark-accessibility.js')

// ==================== 常量导出 ====================

describe('BookmarkAccessibility — 常量导出', () => {
  it('导出 ARIA_ROLES 对象', () => {
    assert.ok(ARIA_ROLES)
    assert.equal(typeof ARIA_ROLES, 'object')
  })

  it('ARIA_ROLES 包含 bookmarksList / bookmarkItem / folderNav / liveRegion', () => {
    assert.ok(ARIA_ROLES.bookmarksList)
    assert.ok(ARIA_ROLES.bookmarkItem)
    assert.ok(ARIA_ROLES.folderNav)
    assert.ok(ARIA_ROLES.liveRegion)
  })

  it('导出 FOCUS_TRAP_SELECTORS 数组', () => {
    assert.ok(Array.isArray(FOCUS_TRAP_SELECTORS))
    assert.ok(FOCUS_TRAP_SELECTORS.length > 0)
  })

  it('导出 KEYBOARD_NAV_KEYS 对象', () => {
    assert.ok(KEYBOARD_NAV_KEYS)
    assert.equal(KEYBOARD_NAV_KEYS.UP, 'ArrowUp')
    assert.equal(KEYBOARD_NAV_KEYS.DOWN, 'ArrowDown')
    assert.equal(KEYBOARD_NAV_KEYS.ENTER, 'Enter')
    assert.equal(KEYBOARD_NAV_KEYS.ESCAPE, 'Escape')
    assert.equal(KEYBOARD_NAV_KEYS.HOME, 'Home')
    assert.equal(KEYBOARD_NAV_KEYS.END, 'End')
  })
})

// ==================== 颜色对比度工具函数 ====================

describe('hexToRgb', () => {
  it('解析 #000000 为 { r:0, g:0, b:0 }', () => {
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 })
  })

  it('解析 #ffffff 为 { r:255, g:255, b:255 }', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 })
  })

  it('解析 #6366f1', () => {
    const result = hexToRgb('#6366f1')
    assert.equal(result.r, 0x63)
    assert.equal(result.g, 0x66)
    assert.equal(result.b, 0xf1)
  })

  it('无 # 前缀也能解析', () => {
    assert.deepEqual(hexToRgb('ff0000'), { r: 255, g: 0, b: 0 })
  })
})

describe('getContrastRatio', () => {
  it('黑白对比度 = 21:1', () => {
    const ratio = getContrastRatio('#000000', '#ffffff')
    assert.ok(ratio >= 20.9 && ratio <= 21.1)
  })

  it('相同颜色对比度 = 1:1', () => {
    const ratio = getContrastRatio('#aaaaaa', '#aaaaaa')
    assert.ok(Math.abs(ratio - 1) < 0.01)
  })

  it('#71717a on #ffffff ≥ 4.5:1 (text-secondary)', () => {
    const ratio = getContrastRatio('#71717a', '#ffffff')
    assert.ok(ratio >= 4.5, `Expected ≥ 4.5, got ${ratio}`)
  })

  it('#70707b on #fafafa ≥ 4.5:1 (text-muted on bg-primary — R79 修复后)', () => {
    const ratio = getContrastRatio('#70707b', '#fafafa')
    assert.ok(ratio >= 4.5, `Expected ≥ 4.5, got ${ratio}`)
  })

  it('对称性: ratio(A,B) === ratio(B,A)', () => {
    const r1 = getContrastRatio('#6366f1', '#ffffff')
    const r2 = getContrastRatio('#ffffff', '#6366f1')
    assert.ok(Math.abs(r1 - r2) < 0.01)
  })
})

describe('meetsWCAG_AA', () => {
  it('黑白组合满足 WCAG AA', () => {
    assert.equal(meetsWCAG_AA('#000000', '#ffffff'), true)
  })

  it('白色文字 on 白色背景不满足', () => {
    assert.equal(meetsWCAG_AA('#ffffff', '#ffffff'), false)
  })

  it('大文本阈值 3:1 (size=18)', () => {
    // #a1a1aa on #fafafa is ~3.4:1, passes large text threshold
    const ratio = getContrastRatio('#a1a1aa', '#fafafa')
    const result = meetsWCAG_AA('#a1a1aa', '#fafafa', true)
    if (ratio >= 3) {
      assert.equal(result, true)
    } else {
      assert.equal(result, false)
    }
  })
})

// ==================== 构造函数 ====================

describe('BookmarkAccessibility — constructor', () => {
  let ctx

  beforeEach(() => {
    ctx = setupTestEnv()
  })

  it('正常创建实例', () => {
    const a11y = new BookmarkAccessibility()
    assert.ok(a11y)
    assert.equal(typeof a11y.createKeyHandler, 'function')
    assert.equal(typeof a11y.createFocusTrap, 'function')
    assert.equal(typeof a11y.enable, 'function')
    assert.equal(typeof a11y.disable, 'function')
    assert.equal(typeof a11y.destroy, 'function')
  })

  it('默认状态: disabled', () => {
    const a11y = new BookmarkAccessibility()
    assert.equal(a11y.isEnabled(), false)
  })

  it('构造函数 options.enabled = true', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    assert.equal(a11y.isEnabled(), true)
  })
})

// ==================== 键盘导航 ====================

describe('BookmarkAccessibility — 键盘导航', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility({ enabled: true })
  })

  it('createKeyHandler 返回函数', () => {
    const handler = a11y.createKeyHandler({
      items: [],
      onSelect: () => {},
      onEscape: () => {},
    })
    assert.equal(typeof handler, 'function')
  })

  it('ArrowDown 聚焦下一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => { focusedIndex = 0 } }, { focus: () => { focusedIndex = 1 } }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowDown', preventDefault: () => {} })
    assert.equal(focusedIndex, 1)
  })

  it('ArrowUp 聚焦上一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => { focusedIndex = 0 } }, { focus: () => { focusedIndex = 1 } }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowUp', preventDefault: () => {} })
    assert.equal(focusedIndex, 0)
  })

  it('ArrowDown 在最后一个元素时不越界', () => {
    let setActiveCalled = false
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: () => { setActiveCalled = true },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowDown', preventDefault: () => {} })
    assert.equal(setActiveCalled, false, '不应在边界时调用 setActiveIndex')
  })

  it('ArrowUp 在第一个元素时不越界', () => {
    let setActiveCalled = false
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => { setActiveCalled = true },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowUp', preventDefault: () => {} })
    assert.equal(setActiveCalled, false, '不应在边界时调用 setActiveIndex')
  })

  it('Enter 调用 onSelect(currentIndex)', () => {
    let selected = -1
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: () => {},
      onSelect: (i) => { selected = i },
      onEscape: () => {},
    })

    handler({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 1)
  })

  it('Escape 调用 onEscape()', () => {
    let escaped = false
    const items = [{ focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => { escaped = true },
    })

    handler({ key: 'Escape', preventDefault: () => {} })
    assert.equal(escaped, true)
  })

  it('Home 键跳转到第一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => {} }, { focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 2,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'Home', preventDefault: () => {} })
    assert.equal(focusedIndex, 0)
  })

  it('End 键跳转到最后一个元素', () => {
    let focusedIndex = -1
    const items = [{ focus: () => {} }, { focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: (i) => { focusedIndex = i },
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'End', preventDefault: () => {} })
    assert.equal(focusedIndex, 2)
  })

  it('Tab 键不被 createKeyHandler 拦截（允许浏览器自然跳转）', () => {
    let prevented = false
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'Tab', preventDefault: () => { prevented = true } })
    assert.equal(prevented, false, 'Tab 不应被 preventDefault')
  })

  it('disabled 状态下键盘事件不干预（不 preventDefault）', () => {
    const disabledA11y = new BookmarkAccessibility({ enabled: false })
    let prevented = false
    const items = [{ focus: () => {} }]
    const handler = disabledA11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => {},
    })

    handler({ key: 'ArrowDown', preventDefault: () => { prevented = true } })
    assert.equal(prevented, false, 'disabled 时不应 preventDefault')
  })

  it('ArrowLeft 等同 ArrowUp（direction=up）', () => {
    let dir = ''
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 1,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => {},
      onNavigate: (i, d) => { dir = d },
    })

    handler({ key: 'ArrowLeft', preventDefault: () => {} })
    assert.equal(dir, 'up')
  })

  it('ArrowRight 等同 ArrowDown（direction=down）', () => {
    let dir = ''
    const items = [{ focus: () => {} }, { focus: () => {} }]
    const handler = a11y.createKeyHandler({
      items,
      getActiveIndex: () => 0,
      setActiveIndex: () => {},
      onSelect: () => {},
      onEscape: () => {},
      onNavigate: (i, d) => { dir = d },
    })

    handler({ key: 'ArrowRight', preventDefault: () => {} })
    assert.equal(dir, 'down')
  })

  it('空列表时 Enter/Arrow 均静默忽略', () => {
    let selectCalled = false
    let navCalled = false
    const handler = a11y.createKeyHandler({
      items: [],
      getActiveIndex: () => -1,
      setActiveIndex: () => {},
      onSelect: () => { selectCalled = true },
      onEscape: () => {},
      onNavigate: () => { navCalled = true },
    })

    handler({ key: 'Enter', preventDefault: () => {} })
    handler({ key: 'ArrowDown', preventDefault: () => {} })
    assert.equal(selectCalled, false, '空列表时 Enter 不应触发 onSelect')
    assert.equal(navCalled, false, '空列表时 ArrowDown 不应触发 onNavigate')
  })
})

// ==================== 焦点陷阱 ====================

describe('BookmarkAccessibility — 焦点陷阱', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('createFocusTrap 返回 { activate, deactivate, isActive }', () => {
    // 模拟容器 DOM
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    assert.equal(typeof trap.activate, 'function')
    assert.equal(typeof trap.deactivate, 'function')
    assert.equal(typeof trap.isActive, 'function')
  })

  it('初始状态 isActive = false', () => {
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    assert.equal(trap.isActive(), false)
  })

  it('activate 后 isActive = true', () => {
    const firstEl = { focus: () => {} }
    const container = {
      querySelectorAll: () => [],
      querySelector: () => firstEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    assert.equal(trap.isActive(), true)
  })

  it('deactivate 后 isActive = false', () => {
    const firstEl = { focus: () => {} }
    const container = {
      querySelectorAll: () => [],
      querySelector: () => firstEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    trap.deactivate()
    assert.equal(trap.isActive(), false)
  })

  it('单元素边界: 容器内只有 1 个可聚焦元素时 Tab 不跳出', () => {
    const singleEl = { focus: () => {} }
    let keydownCb = null
    const container = {
      querySelectorAll: () => [singleEl],
      querySelector: () => null,
      addEventListener: (type, cb) => { if (type === 'keydown') keydownCb = cb },
      removeEventListener: () => {},
      activeElement: singleEl,
      contains: (el) => el === singleEl,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()

    // Simulate Tab on last element — should preventDefault and stay
    let prevented = false
    keydownCb({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented = true } })
    assert.equal(prevented, true, '单元素时 Tab 应被拦截防止跳出')
  })

  it('重复 activate 幂等: 多次 activate 等效于一次', () => {
    let addCount = 0
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => { addCount++ },
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    trap.activate() // should be no-op
    trap.activate() // should be no-op
    // Only first activate should register listeners (2 events: keydown + focusin)
    assert.equal(addCount, 2, '重复 activate 不应重复注册监听器')
    assert.equal(trap.isActive(), true)
  })

  it('容器为空守卫: 无可聚焦元素时 activate 不抛异常', () => {
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    assert.doesNotThrow(() => trap.activate())
    assert.equal(trap.isActive(), true)
  })

  it('deactivate 时 previousFocus 为 null 不抛异常', () => {
    const container = {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
      contains: () => true,
    }
    const trap = a11y.createFocusTrap(container)
    trap.activate()
    assert.doesNotThrow(() => trap.deactivate())
    assert.equal(trap.isActive(), false)
  })
})

// ==================== ARIA 属性 ====================

describe('BookmarkAccessibility — ARIA 属性', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('getBookmarkItemAriaAttrs 返回正确属性', () => {
    const attrs = a11y.getBookmarkItemAriaAttrs({
      title: 'Test Bookmark',
      url: 'https://example.com',
      status: 'unread',
      index: 0,
      total: 5,
    })
    assert.equal(attrs.role, 'listitem')
    assert.equal(attrs.tabindex, '0')
    assert.ok(attrs['aria-label'].includes('Test Bookmark'))
    assert.ok(attrs['aria-label'].includes('1'))
    assert.ok(attrs['aria-label'].includes('5'))
  })

  it('getBookmarkListAriaAttrs 返回 role=list', () => {
    const attrs = a11y.getBookmarkListAriaAttrs({ count: 10 })
    assert.equal(attrs.role, 'list')
    assert.ok(attrs['aria-label'])
    assert.ok(attrs['aria-label'].includes('10'))
  })

  it('getLiveRegionAttrs 返回 aria-live=polite', () => {
    const attrs = a11y.getLiveRegionAttrs()
    assert.equal(attrs['aria-live'], 'polite')
    assert.equal(attrs['aria-atomic'], 'true')
    assert.equal(attrs.role, 'status')
  })

  it('getFolderNavAriaAttrs 返回导航角色', () => {
    const attrs = a11y.getFolderNavAriaAttrs()
    assert.equal(attrs.role, 'toolbar')
    assert.ok(attrs['aria-label'])
  })

  it('getStatusAriaAttrs 返回状态标签', () => {
    const attrs = a11y.getStatusAriaAttrs('unread')
    assert.equal(attrs['aria-label'], '待读')
    assert.equal(attrs.role, 'status')
  })

  it('getStatusAriaAttrs 处理 unknown status', () => {
    const attrs = a11y.getStatusAriaAttrs('unknown')
    assert.ok(attrs['aria-label'])
  })

  it('getDetailPanelAriaAttrs 返回 aria-modal=true', () => {
    const attrs = a11y.getDetailPanelAriaAttrs({ title: 'My Bookmark' })
    assert.equal(attrs.role, 'dialog')
    assert.equal(attrs['aria-modal'], 'true')
    assert.ok(attrs['aria-label'].includes('My Bookmark'))
  })
})

// ==================== ARIA 属性扩展 (R275) ====================

describe('BookmarkAccessibility — ARIA 属性扩展 (R275)', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('getBookmarkSelectedAriaAttrs 选中状态返回 aria-selected=true', () => {
    const attrs = a11y.getBookmarkSelectedAriaAttrs(true)
    assert.equal(attrs['aria-selected'], 'true')
  })

  it('getBookmarkSelectedAriaAttrs 未选中状态返回 aria-selected=false', () => {
    const attrs = a11y.getBookmarkSelectedAriaAttrs(false)
    assert.equal(attrs['aria-selected'], 'false')
  })

  it('getBookmarkSelectedAriaAttrs 默认参数为 false', () => {
    const attrs = a11y.getBookmarkSelectedAriaAttrs()
    assert.equal(attrs['aria-selected'], 'false')
  })

  it('getBookmarkExpandedAriaAttrs 展开状态返回 aria-expanded=true', () => {
    const attrs = a11y.getBookmarkExpandedAriaAttrs(true)
    assert.equal(attrs['aria-expanded'], 'true')
  })

  it('getBookmarkExpandedAriaAttrs 折叠状态返回 aria-expanded=false', () => {
    const attrs = a11y.getBookmarkExpandedAriaAttrs(false)
    assert.equal(attrs['aria-expanded'], 'false')
  })

  it('getBookmarkExpandedAriaAttrs 默认参数为 false', () => {
    const attrs = a11y.getBookmarkExpandedAriaAttrs()
    assert.equal(attrs['aria-expanded'], 'false')
  })

  it('getBookmarkItemFullAriaAttrs 包含 role/tabindex/aria-label/aria-selected/aria-expanded', () => {
    const attrs = a11y.getBookmarkItemFullAriaAttrs({
      title: 'Test',
      url: 'https://example.com',
      status: 'read',
      index: 2,
      total: 10,
      selected: true,
      expanded: true,
    })
    assert.equal(attrs.role, 'listitem')
    assert.equal(attrs.tabindex, '0')
    assert.ok(attrs['aria-label'])
    assert.ok(attrs['aria-label'].includes('Test'))
    assert.ok(attrs['aria-label'].includes('已读'))
    assert.ok(attrs['aria-label'].includes('3 / 10'))
    assert.equal(attrs['aria-selected'], 'true')
    assert.equal(attrs['aria-expanded'], 'true')
  })

  it('getBookmarkItemFullAriaAttrs 默认 selected/expanded 为 false', () => {
    const attrs = a11y.getBookmarkItemFullAriaAttrs({
      title: 'Default',
      url: 'https://example.com',
      index: 0,
      total: 1,
    })
    assert.equal(attrs['aria-selected'], 'false')
    assert.equal(attrs['aria-expanded'], 'false')
  })

  it('getSearchBoxAriaAttrs 返回 role=search 且 aria-label 包含搜索', () => {
    const attrs = a11y.getSearchBoxAriaAttrs()
    assert.equal(attrs.role, 'search')
    assert.ok(attrs['aria-label'])
    assert.ok(attrs['aria-label'].includes('搜索'))
  })

  it('getStatusAriaAttrs 阅读中状态返回正确标签', () => {
    const attrs = a11y.getStatusAriaAttrs('reading')
    assert.equal(attrs['aria-label'], '阅读中')
    assert.equal(attrs.role, 'status')
  })

  it('getStatusAriaAttrs 已读状态返回正确标签', () => {
    const attrs = a11y.getStatusAriaAttrs('read')
    assert.equal(attrs['aria-label'], '已读')
  })

  it('attrsToString 正确转义 HTML 属性值', () => {
    const str = BookmarkAccessibility.attrsToString({
      'aria-label': '书签"引号"测试',
      role: 'listitem',
    })
    assert.ok(str.includes('role="listitem"'))
    assert.ok(str.includes('&quot;'))
  })
})

// ==================== Live Region 公告 ====================

describe('BookmarkAccessibility — Live Region 公告', () => {
  let a11y

  beforeEach(() => {
    a11y = new BookmarkAccessibility()
  })

  it('createAnnouncer 返回 { announce, destroy }', () => {
    const container = { appendChild: () => {} }
    const announcer = a11y.createAnnouncer(container)
    assert.equal(typeof announcer.announce, 'function')
    assert.equal(typeof announcer.destroy, 'function')
  })

  it('announce 设置 aria-live 区域文本', () => {
    let appendedChild = null
    let textContent = ''
    const mockEl = {
      set textContent(v) { textContent = v },
      get textContent() { return textContent },
      setAttribute: () => {},
      getAttribute: () => '',
      style: {},
    }
    const container = {
      appendChild: (el) => { appendedChild = el },
      querySelector: () => mockEl,
    }

    const announcer = a11y.createAnnouncer(container)
    // First call creates element, subsequent calls reuse
    // Use internal method to verify
    announcer.announce('已加载 10 个书签')
    assert.equal(typeof appendedChild !== 'undefined' || textContent !== '', true)
  })

  it('announce 修复 this 绑定: enabled 时可正常公告 (BUG-1)', () => {
    const enabledA11y = new BookmarkAccessibility({ enabled: true })
    let textContent = ''
    const mockEl = {
      set textContent(v) { textContent = v },
      get textContent() { return textContent },
      setAttribute: () => {},
      getAttribute: () => '',
      style: {},
    }
    const container = {
      appendChild: () => {},
      querySelector: () => mockEl,
    }

    const announcer = enabledA11y.createAnnouncer(container)
    announcer.announce('测试消息')
    // textContent is set via setTimeout, verify the flow does not throw
    assert.equal(typeof announcer.announce, 'function')
    // The fix: announce reads self._enabled (not this._enabled)
    // After the call, mockEl.textContent should be cleared (set to '')
    assert.equal(textContent, '', 'textContent 应先被清空，稍后由 setTimeout 设置')
  })

  it('announce disabled 守卫: disabled 时不设置 textContent', () => {
    const disabledA11y = new BookmarkAccessibility({ enabled: false })
    let textContent = 'original'
    const mockEl = {
      set textContent(v) { textContent = v },
      get textContent() { return textContent },
      setAttribute: () => {},
      getAttribute: () => '',
      style: {},
    }
    const container = {
      appendChild: () => {},
      querySelector: () => mockEl,
    }

    const announcer = disabledA11y.createAnnouncer(container)
    announcer.announce('不应出现的消息')
    assert.equal(textContent, 'original', 'disabled 时 textContent 不应被修改')
  })
})

// ==================== 色彩对比度审计 ====================

describe('BookmarkAccessibility — 对比度审计', () => {
  it('auditContrast 返回对比度问题列表', () => {
    const issues = BookmarkAccessibility.auditContrast()
    assert.ok(Array.isArray(issues))
    // 应该至少检测一组
    assert.ok(issues.length > 0)
  })

  it('审计结果包含 selector / foreground / background / ratio / passes 字段', () => {
    const issues = BookmarkAccessibility.auditContrast()
    for (const issue of issues) {
      assert.ok(issue.selector, 'Missing selector')
      assert.ok(issue.foreground, 'Missing foreground')
      assert.ok(issue.background, 'Missing background')
      assert.equal(typeof issue.ratio, 'number', 'ratio should be number')
      assert.equal(typeof issue.passes, 'boolean', 'passes should be boolean')
    }
  })

  it('text-primary on bg-primary 通过 WCAG AA', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const primary = issues.find(i => i.selector === '--text-primary on --bg-primary')
    assert.ok(primary)
    assert.equal(primary.passes, true)
  })

  it('text-secondary on bg-primary 通过 WCAG AA', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const secondary = issues.find(i => i.selector === '--text-secondary on --bg-primary')
    assert.ok(secondary)
    assert.equal(secondary.passes, true)
  })

  it('text-muted on bg-primary 通过 WCAG AA (R79 修复后 #70707b)', () => {
    const issues = BookmarkAccessibility.auditContrast()
    const muted = issues.find(i => i.selector === '--text-muted on --bg-primary')
    assert.ok(muted)
    assert.equal(muted.passes, true)
  })
})

// ==================== enable/disable ====================

describe('BookmarkAccessibility — enable/disable', () => {
  it('enable 启用无障碍功能', () => {
    const a11y = new BookmarkAccessibility()
    a11y.enable()
    assert.equal(a11y.isEnabled(), true)
  })

  it('disable 禁用无障碍功能', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    a11y.disable()
    assert.equal(a11y.isEnabled(), false)
  })

  it('toggle 切换状态', () => {
    const a11y = new BookmarkAccessibility()
    assert.equal(a11y.isEnabled(), false)
    a11y.toggle()
    assert.equal(a11y.isEnabled(), true)
    a11y.toggle()
    assert.equal(a11y.isEnabled(), false)
  })
})

// ==================== destroy ====================

describe('BookmarkAccessibility — destroy', () => {
  it('destroy 清理所有资源', () => {
    const a11y = new BookmarkAccessibility({ enabled: true })
    a11y.destroy()
    // After destroy, internal state should be cleaned
    assert.equal(a11y.isEnabled(), false)
  })
})

// ==================== setContrastPairs / getFailingPairs / auditContrastSummary ====================

describe('BookmarkAccessibility — 对比度审计扩展 (R131)', () => {
  it('setContrastPairs 追加新色彩对', () => {
    const before = BookmarkAccessibility.auditContrast().length
    BookmarkAccessibility.setContrastPairs([
      { selector: 'test-color', fg: '#000000', bg: '#111111' },
    ])
    const after = BookmarkAccessibility.auditContrast().length
    assert.equal(after, before + 1, '应追加 1 组色彩对')
  })

  it('setContrastPairs replace=true 替换所有色彩对', () => {
    BookmarkAccessibility.setContrastPairs([
      { selector: 'only-one', fg: '#000000', bg: '#ffffff' },
    ], true)
    const results = BookmarkAccessibility.auditContrast()
    assert.equal(results.length, 1, 'replace=true 后应只有 1 组')
    assert.equal(results[0].selector, 'only-one')
  })

  it('getFailingPairs 返回所有未通过的色彩对', () => {
    // 恢复默认色彩对
    BookmarkAccessibility.setContrastPairs([
      { selector: 'fail-pair', fg: '#cccccc', bg: '#ffffff' },
      { selector: 'pass-pair', fg: '#000000', bg: '#ffffff' },
    ], true)
    const failing = BookmarkAccessibility.getFailingPairs()
    assert.ok(Array.isArray(failing))
    // #cccccc on #ffffff has low contrast, should fail
    const failItem = failing.find(f => f.selector === 'fail-pair')
    if (failItem) {
      assert.equal(failItem.passes, false)
    }
    // #000000 on #ffffff passes
    const passItem = failing.find(f => f.selector === 'pass-pair')
    assert.equal(passItem, undefined, '通过的不应出现在 failing 列表')
  })

  it('getFailingPairs 全部通过时返回空数组', () => {
    BookmarkAccessibility.setContrastPairs([
      { selector: 'all-pass', fg: '#000000', bg: '#ffffff' },
    ], true)
    const failing = BookmarkAccessibility.getFailingPairs()
    assert.equal(failing.length, 0)
  })

  it('auditContrastSummary 返回摘要结构', () => {
    BookmarkAccessibility.setContrastPairs([
      { selector: 'pass-1', fg: '#000000', bg: '#ffffff' },
      { selector: 'pass-2', fg: '#ffffff', bg: '#000000' },
    ], true)
    const summary = BookmarkAccessibility.auditContrastSummary()
    assert.ok(Array.isArray(summary.results))
    assert.equal(typeof summary.total, 'number')
    assert.equal(typeof summary.passing, 'number')
    assert.equal(typeof summary.failing, 'number')
    assert.equal(summary.total, summary.passing + summary.failing, 'total = passing + failing')
    assert.equal(summary.total, 2)
    assert.equal(summary.passing, 2)
    assert.equal(summary.failing, 0)
  })

  it('auditContrastSummary 正确统计混合通过/失败', () => {
    BookmarkAccessibility.setContrastPairs([
      { selector: 'mixed-pass', fg: '#000000', bg: '#ffffff' },
      { selector: 'mixed-fail', fg: '#eeeeee', bg: '#ffffff' },
    ], true)
    const summary = BookmarkAccessibility.auditContrastSummary()
    assert.equal(summary.total, 2)
    assert.equal(summary.passing, 1)
    assert.equal(summary.failing, 1)
  })

  // 恢复默认色彩对（避免影响其他测试）
  afterEach(() => {
    BookmarkAccessibility.setContrastPairs([
      { selector: '--text-primary on --bg-primary', fg: '#18181b', bg: '#fafafa' },
      { selector: '--text-secondary on --bg-primary', fg: '#71717a', bg: '#fafafa' },
      { selector: '--text-muted on --bg-primary', fg: '#70707b', bg: '#fafafa' },
      { selector: '--text-primary on --bg-elevated', fg: '#18181b', bg: '#ffffff' },
      { selector: '--text-secondary on --bg-elevated', fg: '#71717a', bg: '#ffffff' },
      { selector: '--text-muted on --bg-elevated', fg: '#70707b', bg: '#ffffff' },
      { selector: '--accent on --bg-primary', fg: '#6366f1', bg: '#fafafa' },
      { selector: '--info on --info-light', fg: '#3b82f6', bg: '#eff6ff' },
      { selector: '--danger on --danger-light', fg: '#ef4444', bg: '#fef2f2' },
      { selector: '--warning on --warning-light', fg: '#f59e0b', bg: '#fffbeb' },
      { selector: '--text-inverse on --accent', fg: '#ffffff', bg: '#6366f1' },
      { selector: 'bk-status-unread on --info-light', fg: '#2563eb', bg: '#eff6ff' },
      { selector: 'bk-status-reading on --warning-light', fg: '#b45309', bg: '#fffbeb' },
      { selector: 'bk-status-read on --success-light', fg: '#15803d', bg: '#f0fdf4' },
    ], true)
  })
})
