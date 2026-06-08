import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Ticker', () => {
  let Ticker
  let Emitter

  beforeEach(async () => {
    vi.resetModules()
    // Both must be imported after resetModules so they share
    // the same Emitter singleton inside the module graph.
    Emitter = (await import('./Emitter.js')).default
    Ticker = (await import('./Ticker.js')).default
  })

  it('should export a singleton instance', () => {
    expect(Ticker).toBeDefined()
    expect(Ticker.callbacks).toBeDefined()
    expect(Array.isArray(Ticker.callbacks)).toBe(true)
  })

  it('should queue a callback via nextTick and execute it on tick', () => {
    const cb = vi.fn()
    Ticker.nextTick(cb, null)
    Ticker.tick(0, 16)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('should call nextTick callback with correct context', () => {
    const ctx = { val: 99 }
    function handler() {
      expect(this.val).toBe(99)
    }
    Ticker.nextTick(handler, ctx)
    Ticker.tick(0, 16)
  })

  it('should emit "tick" event on each tick', () => {
    const spy = vi.fn()
    Emitter.on('tick', spy, null)

    Ticker.tick(1000, 16)

    expect(spy).toHaveBeenCalledWith(1000 * 1000) // time * 1000
    Emitter.off('tick', spy, null)
  })

  it('should remove callbacks after execution (one-shot nextTick)', () => {
    const cb = vi.fn()
    Ticker.nextTick(cb, null)
    Ticker.tick(0, 16)
    Ticker.tick(0, 16)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple nextTick callbacks', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    Ticker.nextTick(cb1, null)
    Ticker.nextTick(cb2, null)
    Ticker.tick(0, 16)
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('should track delta value', () => {
    Ticker.tick(100, 16.67)
    expect(Ticker.delta).toBe(16.67)

    Ticker.tick(200, 8.33)
    expect(Ticker.delta).toBe(8.33)
  })

  it('should queue a callback from within a tick callback', () => {
    const inner = vi.fn()
    const outer = vi.fn(() => {
      Ticker.nextTick(inner, null)
    })

    Ticker.nextTick(outer, null)
    Ticker.tick(0, 16) // executes outer, queues inner
    expect(outer).toHaveBeenCalledOnce()
    expect(inner).not.toHaveBeenCalled()

    Ticker.tick(0, 16) // executes inner
    expect(inner).toHaveBeenCalledOnce()
  })

  it('init should register with gsap.ticker.add', async () => {
    const gsapModule = await import('gsap/gsap-core')
    const addSpy = vi.spyOn(gsapModule.default.ticker, 'add')

    Ticker.init()

    expect(addSpy).toHaveBeenCalledWith(expect.any(Function))
    addSpy.mockRestore()
  })
})
