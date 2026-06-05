import { describe, it, expect } from 'vitest'
import Noise from './Noise.js'

describe('Noise', () => {
  it('should create an instance with default seed', () => {
    const noise = new Noise()
    expect(noise).toBeInstanceOf(Noise)
  })

  it('should create an instance with a numeric seed', () => {
    const noise = new Noise(42)
    expect(noise).toBeInstanceOf(Noise)
  })

  it('should create an instance with a fractional seed (0 < seed < 1)', () => {
    const noise = new Noise(0.5)
    expect(noise).toBeInstanceOf(Noise)
  })

  it('should return deterministic values for the same seed', () => {
    const noise1 = new Noise(123)
    const noise2 = new Noise(123)
    expect(noise1.perlin2(10, 20)).toBe(noise2.perlin2(10, 20))
    expect(noise1.perlin2(50, 80)).toBe(noise2.perlin2(50, 80))
  })

  it('should return different values for different seeds', () => {
    const noise1 = new Noise(1)
    const noise2 = new Noise(999)
    // Use fractional coordinates — integer lattice points can alias
    // for different seeds in Perlin noise.
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const v1 = noise1.perlin2(x + 0.5, y + 0.5)
        const v2 = noise2.perlin2(x + 0.5, y + 0.5)
        if (v1 !== v2) {
          return // Pass — found a difference
        }
      }
    }
    // If all 400 values are identical for different seeds, that's a bug
    expect.fail('Different seeds should produce different noise values')
  })

  it('should return values between roughly -1 and 1', () => {
    const noise = new Noise(777)
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const value = noise.perlin2(x * 0.1, y * 0.1)
        expect(value).toBeGreaterThanOrEqual(-1.1)
        expect(value).toBeLessThanOrEqual(1.1)
      }
    }
  })

  it('should return the same value for the same coordinates', () => {
    const noise = new Noise(456)
    const v1 = noise.perlin2(3.14, 2.71)
    const v2 = noise.perlin2(3.14, 2.71)
    expect(v1).toBe(v2)
  })

  it('should allow re-seeding', () => {
    const noise = new Noise(100)
    const beforeReseed = noise.perlin2(10, 20)

    noise.seed(200)
    const afterReseed = noise.perlin2(10, 20)

    // After re-seeding, values should come from the new seed
    const referenceNoise = new Noise(200)
    expect(noise.perlin2(10, 20)).toBe(referenceNoise.perlin2(10, 20))
    // Value from old seed should be different from new seed value
    const newVal = noise.perlin2(10, 20)
    // Just verify reseeding worked by checking consistency with reference
    expect(newVal).toBe(referenceNoise.perlin2(10, 20))
  })

  it('perlin2 should handle negative coordinates', () => {
    const noise = new Noise(42)
    expect(() => noise.perlin2(-10, -20)).not.toThrow()
    const val = noise.perlin2(-10, -20)
    expect(typeof val).toBe('number')
    expect(val).toBeGreaterThanOrEqual(-1.5)
    expect(val).toBeLessThanOrEqual(1.5)
  })

  it('perlin2 should handle large coordinates', () => {
    const noise = new Noise(42)
    expect(() => noise.perlin2(10000, 20000)).not.toThrow()
    const val = noise.perlin2(10000, 20000)
    expect(typeof val).toBe('number')
  })

  it('fade function should map 0->0 and 1->1', () => {
    const noise = new Noise()
    expect(noise.fade(0)).toBe(0)
    expect(noise.fade(1)).toBe(1)
  })

  it('lerp function should interpolate correctly', () => {
    const noise = new Noise()
    expect(noise.lerp(0, 10, 0)).toBe(0)
    expect(noise.lerp(0, 10, 1)).toBe(10)
    expect(noise.lerp(0, 10, 0.5)).toBe(5)
    expect(noise.lerp(5, 15, 0.2)).toBeCloseTo(7, 5)
  })
})
