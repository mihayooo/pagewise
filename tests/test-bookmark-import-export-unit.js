import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  exportToHTML,
  exportToJSON,
  exportToCSV,
  importFromHTML,
  importFromJSON,
  validateImportData,
} from '../lib/bookmark-import-export.js'

describe('BookmarkImportExport', () => {
  const sampleBookmarks = [
    { id: '1', title: 'React Docs', url: 'https://react.dev', folderPath: ['Dev', 'Frontend'], dateAdded: 1700000000000, dateAddedISO: '2023-11-14T22:13:20.000Z' },
    { id: '2', title: 'Vue Guide', url: 'https://vuejs.org/guide', folderPath: ['Dev', 'Frontend'], dateAdded: 1700100000000, dateAddedISO: '2023-11-16T01:33:20.000Z' },
    { id: '3', title: 'Python', url: 'https://python.org', folderPath: ['Dev', 'Backend'], dateAdded: 1700200000000, dateAddedISO: '2023-11-17T04:53:20.000Z' },
    { id: '4', title: 'No Folder', url: 'https://example.com', folderPath: [], dateAdded: 0, dateAddedISO: '' },
  ]

  describe('exportToHTML', () => {
    it('should export bookmarks to valid HTML structure', () => {
      const html = exportToHTML(sampleBookmarks)
      assert.ok(html.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>'))
      assert.ok(html.includes('React Docs'))
      assert.ok(html.includes('https://react.dev'))
      assert.ok(html.includes('Vue Guide'))
      assert.ok(html.includes('Python'))
      assert.ok(html.includes('<DL>'))
    })

    it('should handle null/undefined input', () => {
      const html1 = exportToHTML(null)
      assert.ok(html1.includes('<!DOCTYPE'))
      const html2 = exportToHTML(undefined)
      assert.ok(html2.includes('<!DOCTYPE'))
    })

    it('should handle empty array', () => {
      const html = exportToHTML([])
      assert.ok(html.includes('<!DOCTYPE'))
    })

    it('should handle bookmarks with no folderPath', () => {
      const html = exportToHTML([{ id: '1', title: 'Test', url: 'https://test.com', folderPath: null }])
      assert.ok(html.includes('Test'))
    })

    it('should escape HTML entities in title and url', () => {
      const html = exportToHTML([{ id: '1', title: 'A&B "test"', url: 'https://x.com?a=1&b=2' }])
      assert.ok(html.includes('A&amp;B'))
      assert.ok(html.includes('&quot;test&quot;'))
      assert.ok(html.includes('a=1&amp;b=2'))
    })

    it('should include nested folder hierarchy', () => {
      const html = exportToHTML(sampleBookmarks)
      assert.ok(html.includes('<H3>Dev</H3>'))
      assert.ok(html.includes('<H3>Frontend</H3>'))
      assert.ok(html.includes('<H3>Backend</H3>'))
    })

    it('should handle bookmarks with missing title', () => {
      const html = exportToHTML([{ id: '1', url: 'https://x.com', folderPath: [] }])
      assert.ok(html.includes('HREF'))
    })
  })

  describe('exportToJSON', () => {
    it('should export to valid JSON', () => {
      const json = exportToJSON(sampleBookmarks)
      const parsed = JSON.parse(json)
      assert.equal(parsed.length, 4)
      assert.equal(parsed[0].title, 'React Docs')
      assert.equal(parsed[0].url, 'https://react.dev')
    })

    it('should handle null input', () => {
      assert.equal(exportToJSON(null), '[]')
    })

    it('should handle non-array input', () => {
      assert.equal(exportToJSON('not-an-array'), '[]')
    })

    it('should handle bookmarks with missing fields', () => {
      const json = exportToJSON([{ id: '1' }])
      const parsed = JSON.parse(json)
      assert.equal(parsed[0].title, '')
      assert.equal(parsed[0].url, '')
      assert.deepEqual(parsed[0].folderPath, [])
    })
  })

  describe('exportToCSV', () => {
    it('should export to CSV with BOM and header', () => {
      const csv = exportToCSV(sampleBookmarks)
      assert.ok(csv.startsWith('﻿'))
      assert.ok(csv.includes('title,url,folderPath,dateAddedISO,id'))
      assert.ok(csv.includes('React Docs'))
      assert.ok(csv.includes('https://react.dev'))
    })

    it('should handle null input', () => {
      assert.equal(exportToCSV(null), '')
    })

    it('should escape commas in values', () => {
      const csv = exportToCSV([{ id: '1', title: 'Hello, World', url: 'https://x.com', folderPath: [] }])
      assert.ok(csv.includes('"Hello, World"'))
    })

    it('should escape double quotes in values', () => {
      const csv = exportToCSV([{ id: '1', title: 'Say "hi"', url: 'https://x.com', folderPath: [] }])
      assert.ok(csv.includes('"Say ""hi"""'))
    })

    it('should handle bookmarks with null folderPath', () => {
      const csv = exportToCSV([{ id: '1', title: 'Test', url: 'https://x.com', folderPath: null }])
      assert.ok(csv.includes('Test'))
    })
  })

  describe('importFromHTML', () => {
    it('should parse Chrome bookmark HTML', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Dev</H3>
    <DL><p>
        <DT><A HREF="https://react.dev" ADD_DATE="1700000">React</A>
        <DT><H3>Backend</H3>
        <DL><p>
            <DT><A HREF="https://python.org" ADD_DATE="1700100">Python</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1700200">Example</A>
</DL><p>`
      const bookmarks = importFromHTML(html)
      assert.ok(bookmarks.length >= 3)
      const react = bookmarks.find(b => b.url === 'https://react.dev')
      assert.ok(react)
      assert.equal(react.title, 'React')
      assert.deepEqual(react.folderPath, ['Dev'])
      const python = bookmarks.find(b => b.url === 'https://python.org')
      assert.ok(python)
      assert.deepEqual(python.folderPath, ['Dev', 'Backend'])
    })

    it('should return empty for null/empty input', () => {
      assert.deepEqual(importFromHTML(null), [])
      assert.deepEqual(importFromHTML(''), [])
      assert.deepEqual(importFromHTML('   '), [])
    })

    it('should handle HTML entities in URLs and titles', () => {
      const html = `<DL><p><DT><A HREF="https://x.com?a=1&amp;b=2" ADD_DATE="0">A&amp;B</A></DL><p>`
      const bookmarks = importFromHTML(html)
      assert.ok(bookmarks.length >= 1)
      assert.ok(bookmarks[0].url.includes('&'))
      assert.ok(bookmarks[0].title.includes('&'))
    })

    it('should handle bookmarks without ADD_DATE', () => {
      const html = `<DL><p><DT><A HREF="https://x.com">No Date</A></DL><p>`
      const bookmarks = importFromHTML(html)
      assert.equal(bookmarks.length, 1)
      assert.equal(bookmarks[0].dateAdded, 0)
    })

    it('should generate unique IDs', () => {
      const html = `<DL><p>
        <DT><A HREF="https://a.com" ADD_DATE="0">A</A>
        <DT><A HREF="https://b.com" ADD_DATE="0">B</A>
      </DL><p>`
      const bookmarks = importFromHTML(html)
      assert.equal(bookmarks.length, 2)
      assert.notEqual(bookmarks[0].id, bookmarks[1].id)
    })

    it('should produce ISO date string from dateAdded', () => {
      const html = `<DL><p><DT><A HREF="https://x.com" ADD_DATE="1700000000">Test</A></DL><p>`
      const bookmarks = importFromHTML(html)
      assert.ok(bookmarks[0].dateAddedISO)
    })
  })

  describe('importFromJSON', () => {
    it('should parse JSON array string', () => {
      const data = [{ id: '1', title: 'A', url: 'https://a.com', folderPath: ['X'] }]
      const bookmarks = importFromJSON(JSON.stringify(data))
      assert.equal(bookmarks.length, 1)
      assert.equal(bookmarks[0].title, 'A')
      assert.deepEqual(bookmarks[0].folderPath, ['X'])
    })

    it('should wrap single object in array', () => {
      const data = { id: '1', title: 'A', url: 'https://a.com' }
      const bookmarks = importFromJSON(JSON.stringify(data))
      assert.equal(bookmarks.length, 1)
    })

    it('should throw for non-string input', () => {
      assert.throws(() => importFromJSON(123))
      assert.throws(() => importFromJSON(null))
    })

    it('should generate IDs for items without one', () => {
      const bookmarks = importFromJSON('[{"title":"X","url":"https://x.com"}]')
      assert.ok(bookmarks[0].id.length > 0)
    })

    it('should handle missing folderPath', () => {
      const bookmarks = importFromJSON('[{"title":"X","url":"https://x.com"}]')
      assert.deepEqual(bookmarks[0].folderPath, [])
    })
  })

  describe('validateImportData', () => {
    it('should validate correct data', () => {
      const result = validateImportData([{ title: 'A', url: 'https://a.com' }])
      assert.equal(result.valid, true)
      assert.equal(result.errors.length, 0)
    })

    it('should reject null data', () => {
      const result = validateImportData(null)
      assert.equal(result.valid, false)
      assert.ok(result.errors[0].includes('为空'))
    })

    it('should reject empty array', () => {
      const result = validateImportData([])
      assert.equal(result.valid, false)
      assert.ok(result.errors[0].includes('为空'))
    })

    it('should reject non-object items', () => {
      const result = validateImportData(['string'])
      assert.equal(result.valid, false)
    })

    it('should reject missing title', () => {
      const result = validateImportData([{ url: 'https://a.com' }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('title')))
    })

    it('should reject missing url', () => {
      const result = validateImportData([{ title: 'A' }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('url')))
    })

    it('should reject invalid url format', () => {
      const result = validateImportData([{ title: 'A', url: 'not-a-url' }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('url 格式')))
    })

    it('should accept javascript: url', () => {
      const result = validateImportData([{ title: 'A', url: 'javascript:void(0)' }])
      assert.equal(result.valid, true)
    })

    it('should accept data: url', () => {
      const result = validateImportData([{ title: 'A', url: 'data:text/html,<h1>Hi</h1>' }])
      assert.equal(result.valid, true)
    })

    it('should accept http/https/chrome urls', () => {
      for (const url of ['https://a.com', 'http://b.com', 'chrome://flags', 'chrome-extension://abc', 'moz-extension://xyz']) {
        const result = validateImportData([{ title: 'A', url }])
        assert.equal(result.valid, true, `Expected valid for ${url}`)
      }
    })

    it('should reject non-array folderPath', () => {
      const result = validateImportData([{ title: 'A', url: 'https://a.com', folderPath: 'bad' }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('folderPath')))
    })

    it('should reject non-number dateAdded', () => {
      const result = validateImportData([{ title: 'A', url: 'https://a.com', dateAdded: 'bad' }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('dateAdded')))
    })

    it('should validate single object (not array)', () => {
      const result = validateImportData({ title: 'A', url: 'https://a.com' })
      assert.equal(result.valid, true)
    })

    it('should report multiple errors', () => {
      const result = validateImportData([{}, { title: 123, url: 456 }])
      assert.equal(result.valid, false)
      assert.ok(result.errors.length >= 4)
    })
  })
})
