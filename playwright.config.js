/**
 * Playwright 配置 — R211 真实 Chrome E2E 测试
 *
 * 此配置仅用于 E2E Chrome 测试，常规单元测试仍使用 node:test
 */
export default {
  testDir: './tests/e2e-chrome',
  testMatch: 'test-*.js',
  timeout: 30000,
  retries: 0,
  workers: 1, // Chrome 扩展测试需要串行执行
  reporter: ['list'],
  projects: [
    {
      name: 'chrome-e2e',
      use: {
        headless: true,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
};
