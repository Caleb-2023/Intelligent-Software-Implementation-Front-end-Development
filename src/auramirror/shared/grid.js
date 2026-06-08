/**
 * Shared animated background grid (center-out radial ripple).
 *
 * New file (merge-safe). Draws an orthogonal line grid into an SVG <path> and
 * animates an expanding ring that pushes points radially outward from the centre
 * to the edges — matching the look used across the site.
 *
 * Usage:
 *   const grid = createRippleGrid(hostEl, pathEl)
 *   // hostEl: the box to fill (position context); pathEl: a <path> inside an <svg>
 *   grid.destroy()
 */
export function createRippleGrid(host, path, options = {}) {
  if (!host || !path) {
    return { destroy() {}, refresh() {} }
  }

  const svg = path.ownerSVGElement
  const state = {
    width: 0,
    height: 0,
    cx: 0,
    cy: 0,
    maxRadius: 1,
    cols: [],
    vLines: 12,
    hLines: 8,
    progress: 0,
    ringWidth: 120,
    amplitude: 16,
    speed: 6,
    pauseFrames: typeof options.pauseFrames === 'number' ? options.pauseFrames : 26,
    pause: 0,
    raf: 0,
    running: false,
  }

  function measure() {
    const rect = host.getBoundingClientRect()
    state.width = rect.width
    state.height = rect.height

    if (!state.width || !state.height) return

    if (svg) {
      svg.style.width = `${state.width}px`
      svg.style.height = `${state.height}px`
    }

    state.cx = state.width / 2
    state.cy = state.height / 2
    state.maxRadius = Math.hypot(state.width, state.height) / 2

    const wide = window.innerWidth > 767
    state.vLines = wide ? 12 : 8
    state.hLines = Math.max(4, Math.round(state.height / (state.width / state.vLines)))
    state.ringWidth = Math.max(80, Math.min(state.width, state.height) * 0.28)
    state.amplitude = wide ? 18 : 10
    state.speed = Math.max(4, state.maxRadius / 90)

    buildPoints()
  }

  function buildPoints() {
    const { width, height, vLines, hLines, cx, cy } = state
    const gapX = width / vLines
    const gapY = height / hLines

    state.cols = []

    for (let i = 0; i <= vLines; i += 1) {
      const column = []

      for (let j = 0; j <= hLines; j += 1) {
        const x = i * gapX
        const y = j * gapY
        const dx = x - cx
        const dy = y - cy
        const dist = Math.hypot(dx, dy) || 0.0001

        column.push({ x, y, dist, ux: dx / dist, uy: dy / dist })
      }

      state.cols.push(column)
    }
  }

  function displace(point) {
    const delta = Math.abs(point.dist - state.progress)
    if (delta >= state.ringWidth) {
      return point
    }

    const falloff = Math.sin((1 - delta / state.ringWidth) * (Math.PI / 2))
    const offset = falloff * state.amplitude

    return {
      x: point.x + point.ux * offset,
      y: point.y + point.uy * offset,
    }
  }

  function draw() {
    if (!state.cols.length) return

    let d = ''

    // Vertical lines (top → bottom per column).
    state.cols.forEach((column) => {
      column.forEach((point, index) => {
        const moved = displace(point)
        d += `${index === 0 ? 'M' : 'L'} ${moved.x.toFixed(2)} ${moved.y.toFixed(2)} `
      })
    })

    // Horizontal lines (left → right per row).
    for (let j = 0; j <= state.hLines; j += 1) {
      state.cols.forEach((column, i) => {
        const moved = displace(column[j])
        d += `${i === 0 ? 'M' : 'L'} ${moved.x.toFixed(2)} ${moved.y.toFixed(2)} `
      })
    }

    path.setAttribute('d', d)
  }

  function frame() {
    state.raf = 0

    if (state.pause > 0) {
      state.pause -= 1
    } else {
      state.progress += state.speed
      if (state.progress > state.maxRadius + state.ringWidth) {
        state.progress = 0
        state.pause = state.pauseFrames
      }
    }

    draw()

    if (state.running) {
      state.raf = window.requestAnimationFrame(frame)
    }
  }

  function start() {
    if (state.running) return
    if (!state.cols.length) measure()
    state.running = true
    if (!state.raf) state.raf = window.requestAnimationFrame(frame)
  }

  function stop() {
    state.running = false
    if (state.raf) {
      window.cancelAnimationFrame(state.raf)
      state.raf = 0
    }
  }

  function refresh() {
    measure()
    draw()
  }

  measure()
  draw()

  // Pause when offscreen.
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) start()
        else stop()
      })
    },
    { threshold: 0 }
  )
  intersectionObserver.observe(host)

  // Re-measure when the host resizes (content growth, viewport changes).
  let resizeRaf = 0
  const scheduleRefresh = () => {
    if (resizeRaf) return
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0
      refresh()
    })
  }

  let resizeObserver = null
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleRefresh)
    resizeObserver.observe(host)
  }
  window.addEventListener('resize', scheduleRefresh)

  return {
    destroy() {
      stop()
      intersectionObserver.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleRefresh)
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf)
    },
    refresh,
  }
}
