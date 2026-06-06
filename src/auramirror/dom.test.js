import { describe, it, expect, beforeEach } from 'vitest'
import { $, $$, ensureMeta, escapeHtml } from './dom.js'

describe('dom utilities', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  describe('$', () => {
    it('should return the first matching element', () => {
      document.body.innerHTML = '<div class="foo">First</div><div class="foo">Second</div>'
      const el = $('.foo')
      expect(el).toBeInstanceOf(HTMLDivElement)
      expect(el.textContent).toBe('First')
    })

    it('should return null when no match', () => {
      document.body.innerHTML = '<div></div>'
      expect($('.nonexistent')).toBeNull()
    })

    it('should search within a given scope', () => {
      document.body.innerHTML = `
        <div id="outer"><span class="target">Outer</span></div>
        <span class="target">Body</span>
      `
      const scope = document.getElementById('outer')
      const el = $('.target', scope)
      expect(el.textContent).toBe('Outer')
    })

    it('should default scope to document', () => {
      document.body.innerHTML = '<span id="global">Global</span>'
      const el = $('#global')
      expect(el).not.toBeNull()
      expect(el.textContent).toBe('Global')
    })
  })

  describe('$$', () => {
    it('should return all matching elements as an array', () => {
      document.body.innerHTML =
        '<span class="bar">A</span><span class="bar">B</span><span class="bar">C</span>'
      const els = $$('.bar')
      expect(Array.isArray(els)).toBe(true)
      expect(els).toHaveLength(3)
    })

    it('should return an empty array when no match', () => {
      document.body.innerHTML = '<div></div>'
      const els = $$('.missing')
      expect(Array.isArray(els)).toBe(true)
      expect(els).toHaveLength(0)
    })

    it('should search within a given scope', () => {
      document.body.innerHTML = `
        <ul id="list"><li>A</li><li>B</li></ul>
        <li>C</li>
      `
      const scope = document.getElementById('list')
      const els = $$('li', scope)
      expect(els).toHaveLength(2)
    })
  })

  describe('ensureMeta', () => {
    it('should create a meta tag if one does not exist', () => {
      const meta = ensureMeta('test', 'hello')
      expect(meta).toBeInstanceOf(HTMLMetaElement)
      expect(meta.getAttribute('name')).toBe('test')
      expect(meta.getAttribute('content')).toBe('hello')
      expect(document.head.contains(meta)).toBe(true)
    })

    it('should update an existing meta tag', () => {
      ensureMeta('existing', 'old-value')
      const meta = ensureMeta('existing', 'new-value')
      expect(meta.getAttribute('content')).toBe('new-value')
      // Should not duplicate
      expect(document.head.querySelectorAll('meta[name="existing"]')).toHaveLength(1)
    })

    it('should return null for empty name', () => {
      const result = ensureMeta('', 'content')
      expect(result).toBeNull()
    })

    it('should handle boolean false name', () => {
      const result = ensureMeta(false, 'content')
      expect(result).toBeNull()
    })
  })

  describe('escapeHtml', () => {
    it('should escape < and >', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    })

    it('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
    })

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s')
    })

    it('should escape ampersands', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B')
    })

    it('should return empty string for undefined', () => {
      expect(escapeHtml()).toBe('')
    })

    it('should return "null" string for null (String(null))', () => {
      expect(escapeHtml(null)).toBe('null')
    })

    it('should convert non-string values to string', () => {
      expect(escapeHtml(42)).toBe('42')
      expect(escapeHtml(true)).toBe('true')
    })

    it('should handle safe strings unchanged', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123')
    })

    it('should escape a complex HTML string', () => {
      const input = '<div class="greeting">Hello & welcome</div>'
      const expected =
        '&lt;div class=&quot;greeting&quot;&gt;Hello &amp; welcome&lt;/div&gt;'
      expect(escapeHtml(input)).toBe(expected)
    })
  })
})
