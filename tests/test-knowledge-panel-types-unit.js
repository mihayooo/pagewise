import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// knowledge-panel-types.js only exports JSDoc @typedef — it has no runtime exports.
// Verify the module loads cleanly and doesn't throw.

describe('knowledge-panel-types', () => {
  it('should import without error', async () => {
    // The module is purely type annotations — importing should not throw
    const mod = await import('../lib/knowledge-panel-types.js')
    assert.ok(mod !== undefined)
  })

  it('should be an empty/default module (no runtime exports)', async () => {
    const mod = await import('../lib/knowledge-panel-types.js')
    // Type-only modules have no named exports at runtime
    const keys = Object.keys(mod)
    assert.equal(keys.length, 0)
  })
})
