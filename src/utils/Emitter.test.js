import { describe, it, expect, vi } from 'vitest'
import Emitter from './Emitter.js'

describe('Emitter', () => {
  it('should register and call an event handler', () => {
    const cb = vi.fn()
    Emitter.on('test-event', cb, null)
    Emitter.emit('test-event')
    expect(cb).toHaveBeenCalledOnce()
    Emitter.off('test-event', cb, null)
  })

  it('should pass arguments to the handler', () => {
    const cb = vi.fn()
    Emitter.on('args-event', cb, null)
    Emitter.emit('args-event', 1, 'hello', { key: 'val' })
    expect(cb).toHaveBeenCalledWith(1, 'hello', { key: 'val' })
    Emitter.off('args-event', cb, null)
  })

  it('should support multiple handlers for the same event', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    Emitter.on('multi-event', cb1, null)
    Emitter.on('multi-event', cb2, null)
    Emitter.emit('multi-event')
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
    Emitter.off('multi-event', cb1, null)
    Emitter.off('multi-event', cb2, null)
  })

  it('should not register duplicate handlers (same callback + same context)', () => {
    const cb = vi.fn()
    Emitter.on('dup-event', cb, null)
    Emitter.on('dup-event', cb, null)
    Emitter.emit('dup-event')
    expect(cb).toHaveBeenCalledTimes(1)
    Emitter.off('dup-event', cb, null)
  })

  it('should call a once handler only one time', () => {
    const cb = vi.fn()
    Emitter.once('once-event', cb, null)
    Emitter.emit('once-event')
    Emitter.emit('once-event')
    Emitter.emit('once-event')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('should call handler with correct context (this binding)', () => {
    const ctx = { value: 42 }
    function handler() {
      expect(this.value).toBe(42)
    }
    Emitter.on('ctx-event', handler, ctx)
    Emitter.emit('ctx-event')
    Emitter.off('ctx-event', handler, ctx)
  })

  it('should remove a handler via off()', () => {
    const cb = vi.fn()
    Emitter.on('off-event', cb, null)
    Emitter.emit('off-event')
    Emitter.off('off-event', cb, null)
    Emitter.emit('off-event')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('should not throw when emitting an event with no handlers', () => {
    expect(() => Emitter.emit('nonexistent')).not.toThrow()
  })

  it('should not throw when off() with unregistered handler', () => {
    const cb = vi.fn()
    expect(() => Emitter.off('nonexistent', cb, null)).not.toThrow()
  })

  it('should distinguish handlers by context even with same callback', () => {
    const cb = vi.fn()
    const ctx1 = {}
    const ctx2 = {}
    Emitter.on('ctx-distinct', cb, ctx1)
    Emitter.on('ctx-distinct', cb, ctx2)
    Emitter.emit('ctx-distinct')
    expect(cb).toHaveBeenCalledTimes(2)
    Emitter.off('ctx-distinct', cb, ctx1)
    Emitter.off('ctx-distinct', cb, ctx2)
  })
})
