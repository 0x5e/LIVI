import { Box } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { onSpectrum, reportSpectrum } from '@store/store'
import { useEffect, useRef, useState } from 'react'

const POINTS = 24
const LABEL_FONT_MAX = 16
const LABEL_FONT_MIN = 9
const MIN_FREQ = 20
const MAX_FREQ = 20000
const SPECTRUM_WIDTH_RATIO = 1.0
const TARGET_FPS = 60

const labelMetrics = (specW: number) => {
  const font = Math.min(LABEL_FONT_MAX, Math.floor(specW / 12))
  const show = font >= LABEL_FONT_MIN
  return { font, show, marginBottom: show ? font + 4 : 0 }
}

export const FFTSpectrum = () => {
  const theme = useTheme()
  const barColor =
    getComputedStyle(document.body).getPropertyValue('--ui-highlight').trim() ||
    theme.palette.primary.main

  const labelColor = alpha(theme.palette.text.secondary, 0.9)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const binsRef = useRef<Float32Array>(new Float32Array(POINTS))

  // Core computes the bands and only sends them while a window draws them
  useEffect(() => {
    const unsubscribe = onSpectrum((bands) => {
      const bins = new Float32Array(POINTS)
      bins.set(bands.slice(0, POINTS))
      binsRef.current = bins
    })
    reportSpectrum(true)
    return () => {
      reportSpectrum(false)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement

    const update = () => {
      const { width, height } = canvas.getBoundingClientRect()
      setDimensions({ width, height })
    }

    const obs = new ResizeObserver(update)
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const bg = bgCanvasRef.current
    if (!bg || dimensions.width === 0) return
    const ctx = bg.getContext('2d')!
    const { width: cw, height: ch } = dimensions
    const specW = cw * SPECTRUM_WIDTH_RATIO
    const { font: labelFont, show: showLabels, marginBottom } = labelMetrics(specW)
    const usableH = ch - marginBottom
    const xOff = (cw - specW) / 2
    bg.width = cw
    bg.height = ch

    ctx.clearRect(0, 0, cw, ch)

    const freqs = [MIN_FREQ, 100, 1000, 10000, MAX_FREQ]
    const logMin = Math.log10(MIN_FREQ)
    const logMax = Math.log10(MAX_FREQ)
    const logDen = logMax - logMin

    const positions = freqs.map((freq) => ({
      freq,
      x: xOff + ((Math.log10(freq) - logMin) / logDen) * specW
    }))

    if (showLabels) {
      ctx.font = `${labelFont}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillStyle = labelColor
      const gap = labelFont * 0.5
      const items = positions.map(({ freq, x }, i) => {
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        const w = ctx.measureText(label).width
        const align: CanvasTextAlign =
          i === 0 ? 'left' : i === positions.length - 1 ? 'right' : 'center'
        const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2
        return { label, x, align, left, right: left + w }
      })
      let lastLeft = Infinity
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]
        if (it.right <= lastLeft - gap) {
          ctx.textAlign = it.align
          ctx.fillText(it.label, it.x, usableH + 2)
          lastLeft = it.left
        }
      }
    }
  }, [dimensions, labelColor])

  useEffect(() => {
    let rafId = 0
    let last = 0

    const draw = () => {
      rafId = requestAnimationFrame(draw)
      const now = performance.now()
      if (now - last < 1000 / TARGET_FPS) return
      last = now

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const { width: cw, height: ch } = dimensions
      if (cw === 0 || ch === 0) return

      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }

      ctx.clearRect(0, 0, cw, ch)
      const specW = cw * SPECTRUM_WIDTH_RATIO
      const usableH = ch - labelMetrics(specW).marginBottom
      const xOff = (cw - specW) / 2
      const barW = specW / POINTS
      const bins = binsRef.current

      for (let i = 0; i < POINTS; i++) {
        const h = bins[i] * usableH
        const x = xOff + i * barW
        ctx.fillStyle = barColor
        ctx.fillRect(x, usableH - h, barW * 0.8, h)
      }
    }

    draw()

    return () => {
      globalThis.cancelAnimationFrame?.(rafId)
    }
  }, [dimensions, barColor])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Box
        ref={bgCanvasRef}
        component="canvas"
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />
      <Box
        ref={canvasRef}
        component="canvas"
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: 'transparent',
          zIndex: 2
        }}
      />
    </Box>
  )
}
