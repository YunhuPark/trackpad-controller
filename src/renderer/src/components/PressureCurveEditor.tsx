/**
 * PressureCurveEditor — 압력 커브 편집기
 * 4개의 컨트롤 포인트를 드래그해서 입력→출력 곡선을 편집
 */
import { useRef, useCallback, useEffect } from 'react'
import type { PressureCurve, CurvePoint } from '@core/pressureCurve'

interface Props {
  curve: PressureCurve
  onChange: (curve: PressureCurve) => void
}

const CANVAS_SIZE = 200
const POINT_RADIUS = 7
const PADDING = 16

const toCanvas = (v: number) => PADDING + v * (CANVAS_SIZE - PADDING * 2)
const fromCanvas = (px: number) => Math.max(0, Math.min(1, (px - PADDING) / (CANVAS_SIZE - PADDING * 2)))

export default function PressureCurveEditor({ curve, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<number | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Background
    ctx.fillStyle = 'rgb(15, 15, 19)'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Grid lines
    ctx.strokeStyle = 'rgba(58, 58, 85, 0.5)'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const v = PADDING + (i / 4) * (CANVAS_SIZE - PADDING * 2)
      ctx.beginPath()
      ctx.moveTo(v, PADDING)
      ctx.lineTo(v, CANVAS_SIZE - PADDING)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PADDING, v)
      ctx.lineTo(CANVAS_SIZE - PADDING, v)
      ctx.stroke()
    }

    // Diagonal reference line
    ctx.strokeStyle = 'rgba(58, 58, 85, 0.8)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(toCanvas(0), CANVAS_SIZE - toCanvas(0))
    ctx.lineTo(toCanvas(1), CANVAS_SIZE - toCanvas(1))
    ctx.stroke()
    ctx.setLineDash([])

    // Curve line
    ctx.strokeStyle = 'rgb(124, 106, 247)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(toCanvas(curve[0].x), CANVAS_SIZE - toCanvas(curve[0].y))
    for (let i = 1; i < curve.length; i++) {
      ctx.lineTo(toCanvas(curve[i].x), CANVAS_SIZE - toCanvas(curve[i].y))
    }
    ctx.stroke()

    // Control points
    curve.forEach((pt, i) => {
      const cx = toCanvas(pt.x)
      const cy = CANVAS_SIZE - toCanvas(pt.y)
      ctx.beginPath()
      ctx.arc(cx, cy, POINT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = dragging.current === i ? 'rgb(94, 231, 180)' : 'rgb(124, 106, 247)'
      ctx.fill()
      ctx.strokeStyle = 'rgb(240, 240, 248)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
  }, [curve])

  useEffect(() => { draw() }, [draw])

  const getHitPoint = (x: number, y: number): number | null => {
    for (let i = 0; i < curve.length; i++) {
      const cx = toCanvas(curve[i].x)
      const cy = CANVAS_SIZE - toCanvas(curve[i].y)
      if (Math.hypot(x - cx, y - cy) <= POINT_RADIUS + 2) return i
    }
    return null
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = getHitPoint(x, y)
    if (hit !== null) dragging.current = hit
  }

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging.current === null) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    const idx = dragging.current
    const newX = fromCanvas(rawX)
    const newY = 1 - fromCanvas(rawY)  // flip Y

    const updated = [...curve] as PressureCurve
    const pt: CurvePoint = { x: newX, y: Math.max(0, Math.min(1, newY)) }

    // Clamp x: first and last points fixed at 0 and 1
    if (idx === 0) {
      pt.x = 0
    } else if (idx === 3) {
      pt.x = 1
    } else {
      // Keep between neighbors
      pt.x = Math.max(curve[idx - 1].x + 0.02, Math.min(curve[idx + 1].x - 0.02, newX))
    }

    updated[idx] = pt
    onChange(updated)
  }, [curve, onChange])

  const onMouseUp = () => { dragging.current = null }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded-lg cursor-crosshair border border-zone-border"
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, display: 'block' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      <div className="flex justify-between text-[10px] font-mono text-text-secondary px-1">
        <span>soft</span>
        <span>압력 커브</span>
        <span>hard</span>
      </div>
    </div>
  )
}
