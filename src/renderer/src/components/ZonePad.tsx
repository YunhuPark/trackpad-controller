import { useState, useCallback, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import { getGridDimensions, ZoneConfig, ZoneAction, ZoneLayout, MediaAction, getZoneBounds, getZoneAtPoint, createDefaultLayout, SCALE_INTERVALS, NOTE_NAMES } from '@core/zoneEngine'
import { useZoneAction } from '../hooks/useZoneAction'
import { useNoteRepeat } from '../hooks/useNoteRepeat'
import { useLoopQuantize } from '../hooks/useLoopQuantize'
import { useTouchpadInput } from '../hooks/useTouchpadInput'
import { useLoopRecorder } from '../hooks/useLoopRecorder'


export default function ZonePad() {
  const { grid, layer, zones, zoneLayouts, activeZoneIds, updateZone, onTouch, onTouchEnd,
          setActiveZones, setZoneLayout, bpm, noteRepeat, quantize, locale, absPadMode,
          touchpadMode, padCalib, setPadCalib,
          scaleLock, setScaleLock, applyScaleLock,
          loopState, loopLength, setLoopLength,
          loopActiveSlot, loopSlots, setLoopActiveSlot, loopOverdub, setLoopOverdub,
          _undoStack, _redoStack, undo, redo } = useStore()
  const { rows, cols } = getGridDimensions(grid)

  // ── Loop Recorder ──────────────────────────────────────────────
  const { startRecording, stopRecording, startPlayback, stopAll: stopLoop, recordEvent } = useLoopRecorder(
    useCallback((zoneId: string, on: boolean, pressure: number) => {
      const zone = useStore.getState().zones[layer]?.find((z) => z.id === zoneId)
      if (zone) trigger(zone, on, pressure)
    }, [layer]) // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── 드럼/피아노 레이아웃 토글 ─────────────────────────────────
  const applyDrumLayout = useCallback(() => {
    const layout2d = grid === '4x4' ? DRUM_LAYOUT_4X4
                   : grid === '2x2' ? [[49, 51], [36, 38]]
                   : DRUM_LAYOUT_3X3
    const store = useStore.getState()
    store.zones[layer]?.forEach((zone) => {
      const note = layout2d[zone.row]?.[zone.col] ?? 36
      store.updateZone(layer, {
        ...zone,
        label: drumName(note),
        action: { type: 'midi', midiInstrument: 'drum', midiNote: note, midiChannel: 10, midiVelocityMin: 1, midiVelocityMax: 127 },
      })
    })
  }, [grid, layer])

  const applyPianoLayout = useCallback(() => {
    const store = useStore.getState()
    const { rows: r, cols: c } = getGridDimensions(grid)
    const baseNote = 48  // C3
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    store.zones[layer]?.forEach((zone) => {
      const index = (r - 1 - zone.row) * c + zone.col
      const note = baseNote + index
      const name = `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`
      store.updateZone(layer, {
        ...zone,
        label: name,
        action: { type: 'midi', midiInstrument: 'piano', midiNote: note, midiChannel: 1, midiVelocityMin: 1, midiVelocityMax: 127 },
      })
    })
  }, [grid, layer])
  const currentZones = zones[layer] ?? []
  const isDrumLayout = currentZones.some((z) => z.action.midiInstrument === 'drum')
  const layout: ZoneLayout = zoneLayouts[layer] ?? createDefaultLayout(grid)
  const colWidths = layout.colWidths.length === cols ? layout.colWidths : Array(cols).fill(1 / cols)
  const rowHeights = layout.rowHeights.length === rows ? layout.rowHeights : Array(rows).fill(1 / rows)

  const [editingZone, setEditingZone] = useState<ZoneConfig | null>(null)
  const [layoutEditMode, setLayoutEditMode] = useState(false)

  // ── 캘리브레이션 상태 ─────────────────────────────────────────
  // 0=비활성, 1=왼쪽상단 대기, 2=오른쪽하단 대기, 3=완료
  const [calibStep, setCalibStep] = useState<0 | 1 | 2 | 3>(0)

  // 실시간 터치 위치 인디케이터 (0~1 좌표)
  const [touchDot, setTouchDot] = useState<{ x: number; y: number } | null>(null)
  const touchDotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 마지막 IPC 좌표 (디버그용)
  const [lastCoord, setLastCoord] = useState<{ x: number; y: number; mode: string } | null>(null)

  const { trigger } = useZoneAction()
  const { startRepeat, stopRepeat, stopAll } = useNoteRepeat(bpm, noteRepeat)
  const { scheduleQuantized } = useLoopQuantize(bpm, quantize)

  // useTouchpadInput에 전달할 trigger — recordEvent 포함 (ABS 모드에서도 루프 녹음됨)
  const triggerWithRecord = useCallback(async (zone: ZoneConfig, on: boolean, pressure?: number) => {
    recordEvent(zone.id, on, pressure ?? 1.0)
    return trigger(zone, on, pressure)
  }, [trigger, recordEvent])

  // 드래그 상태 (레이아웃 에디터용)
  const gridInnerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ type: 'col' | 'row'; index: number } | null>(null)

  // 컬럼/행 divider 위치 계산
  const colDividers = colWidths.slice(0, -1).reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? 0) + w], [])
  const rowDividers = rowHeights.slice(0, -1).reduce<number[]>((acc, h) => [...acc, (acc.at(-1) ?? 0) + h], [])

  // 실제 터치패드 IPC 이벤트 연결 (pressure 포함)
  useTouchpadInput(triggerWithRecord)

  // ── 캘리브레이션 이벤트 수신 ─────────────────────────────────
  useEffect(() => {
    const onStep = (e: Event) => {
      const step = (e as CustomEvent).detail?.step
      if (step === 1) setCalibStep(2)
    }
    const onDone = () => {
      setCalibStep(3)
      setTimeout(() => setCalibStep(0), 1500)
    }
    window.addEventListener('calib-step', onStep)
    window.addEventListener('calib-done', onDone)
    return () => {
      window.removeEventListener('calib-step', onStep)
      window.removeEventListener('calib-done', onDone)
    }
  }, [])

  // ── 실시간 터치 인디케이터 + 디버그 좌표 (IPC 이벤트 직접 청취) ──
  useEffect(() => {
    const cleanup = window.electronAPI?.onTouchEvent?.((e) => {
      setLastCoord({ x: e.x, y: e.y, mode: e.mode })
      if (e.type === 'up') {
        if (touchDotTimer.current) clearTimeout(touchDotTimer.current)
        touchDotTimer.current = setTimeout(() => setTouchDot(null), 300)
      } else {
        setTouchDot({ x: e.x, y: e.y })
        if (touchDotTimer.current) clearTimeout(touchDotTimer.current)
      }
    })
    return () => {
      cleanup?.()
      if (touchDotTimer.current) clearTimeout(touchDotTimer.current)
    }
  }, [])

  // 캘리브레이션 시작
  const startCalib = useCallback(() => {
    (window as any).__padCalibState = { step: 0 }
    setCalibStep(1)
  }, [])

  // 캘리브레이션 취소 (Escape)
  const cancelCalib = useCallback(() => {
    (window as any).__padCalibState = undefined
    setCalibStep(0)
  }, [])

  useEffect(() => {
    if (calibStep === 0) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelCalib() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibStep, cancelCalib])

  // R키: 세션 초기화 — 모든 active zone 해제 + 노트 리피트 중지
  useEffect(() => {
    const deactivateAll = () => { stopAll(); setActiveZones(new Set()) }
    window.addEventListener('session-reset', deactivateAll)
    window.addEventListener('pad-deactivate', deactivateAll)
    return () => {
      window.removeEventListener('session-reset', deactivateAll)
      window.removeEventListener('pad-deactivate', deactivateAll)
    }
  }, [stopAll, setActiveZones])

  // 존 DOWN (공통 — 존 버튼 + 컨테이너 포인터 이벤트 모두 사용)
  const handleZoneDown = useCallback(async (zone: ZoneConfig, e?: React.MouseEvent | React.PointerEvent) => {
    e?.preventDefault()
    const bounds = getZoneBounds(zone.row, zone.col, layout)
    onTouch(bounds.x + bounds.w * 0.5, bounds.y + bounds.h * 0.5)
    scheduleQuantized(async () => {
      await triggerWithRecord(zone, true)
      startRepeat(zone, (z, on) => trigger(z, on))
    })
  }, [layout, onTouch, trigger, triggerWithRecord, scheduleQuantized, startRepeat])

  // 존 UP
  const handleZoneUp = useCallback(async (zone: ZoneConfig) => {
    onTouchEnd(zone.id)
    stopRepeat(zone.id)
    await triggerWithRecord(zone, false)
  }, [onTouchEnd, trigger, triggerWithRecord, stopRepeat])

  // ── 컨테이너 직접 포인터 이벤트 (ABS 모드 + 일반 모드 공통) ─────
  // zone 버튼이 pointerEvents:none 이어도 부모 컨테이너는 이벤트를 받음
  const containerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (layoutEditMode || e.button === 2) return
    if (calibStep > 0) return  // 캘리브레이션 중에는 무시
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height
    const zone = getZoneAtPoint(relX, relY, currentZones, { colWidths, rowHeights })
    if (zone) handleZoneDown(zone, e as unknown as React.MouseEvent)
  }, [layoutEditMode, calibStep, currentZones, colWidths, rowHeights, handleZoneDown])

  const containerPointerUp = useCallback((_e: React.PointerEvent<HTMLDivElement>) => {
    if (layoutEditMode) return
    // 현재 활성화된 존 찾아서 해제
    const store = useStore.getState()
    store.activeZoneIds.forEach((zid) => {
      const zone = currentZones.find((z) => z.id === zid)
      if (zone) handleZoneUp(zone)
    })
  }, [layoutEditMode, currentZones, handleZoneUp])

  const containerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.buttons || layoutEditMode || calibStep > 0) return
    if (absPadMode) return // ABS 모드에서는 IPC 이벤트가 담당
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height
    const newZone = getZoneAtPoint(relX, relY, currentZones, { colWidths, rowHeights })
    if (!newZone) return
    const store = useStore.getState()
    const isAlreadyActive = store.activeZoneIds.has(newZone.id)
    if (!isAlreadyActive) {
      // 이전 존 해제 후 새 존 활성화
      store.activeZoneIds.forEach((zid) => {
        const old = currentZones.find((z) => z.id === zid)
        if (old) handleZoneUp(old)
      })
      handleZoneDown(newZone)
    }
  }, [layoutEditMode, calibStep, absPadMode, currentZones, colWidths, rowHeights, handleZoneDown, handleZoneUp])

  // 드래그 divider 핸들러
  const handleDividerMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !gridInnerRef.current) return
    const rect = gridInnerRef.current.getBoundingClientRect()
    const { type, index } = dragRef.current

    if (type === 'col') {
      const relX = (e.clientX - rect.left) / rect.width
      const newWidths = [...colWidths]
      const leftSum = colWidths.slice(0, index).reduce((a, b) => a + b, 0)
      const rightEnd = colWidths.slice(0, index + 2).reduce((a, b) => a + b, 0)
      const clamped = Math.max(leftSum + 0.05, Math.min(rightEnd - 0.05, relX))
      newWidths[index] = clamped - leftSum
      newWidths[index + 1] = rightEnd - clamped
      setZoneLayout(layer, { colWidths: newWidths, rowHeights })
    } else {
      const relY = (e.clientY - rect.top) / rect.height
      const newHeights = [...rowHeights]
      const topSum = rowHeights.slice(0, index).reduce((a, b) => a + b, 0)
      const bottomEnd = rowHeights.slice(0, index + 2).reduce((a, b) => a + b, 0)
      const clamped = Math.max(topSum + 0.05, Math.min(bottomEnd - 0.05, relY))
      newHeights[index] = clamped - topSum
      newHeights[index + 1] = bottomEnd - clamped
      setZoneLayout(layer, { colWidths, rowHeights: newHeights })
    }
  }, [colWidths, rowHeights, layer, setZoneLayout])

  const stopDrag = useCallback(() => { dragRef.current = null }, [])

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header Row 1: Pad label + right-side controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <span className="label-tag">Pad</span>
          {absPadMode && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'rgb(var(--color-accent) / 0.2)', color: 'rgb(var(--color-accent))' }}>
              1:1 ABS
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-xs text-text-secondary font-mono whitespace-nowrap">
            L{layer} · {grid}
            {!absPadMode && <span className="ml-1 text-zone-border">| {locale === 'ko' ? '우클릭 편집' : 'R-click edit'}</span>}
          </span>
          {/* 실시간 IPC 좌표 디버그 표시 */}
          {lastCoord && (
            <span className="text-[9px] font-mono text-text-secondary opacity-60 whitespace-nowrap">
              {lastCoord.mode === 'precision' ? '⬡' : '○'} {lastCoord.x.toFixed(2)},{lastCoord.y.toFixed(2)}
            </span>
          )}
          {/* 캘리브레이션 버튼: legacy 모드에서만 표시 */}
          {touchpadMode !== 'precision' && (
            <>
              <button
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all whitespace-nowrap ${
                  calibStep > 0
                    ? 'border-yellow-400 text-yellow-400 animate-pulse'
                    : padCalib
                      ? 'border-green-500 text-green-400'
                      : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
                }`}
                onClick={calibStep === 0 ? startCalib : undefined}
                title={locale === 'ko' ? '터치패드 캘리브레이션 (좌표 정확도 향상)' : 'Calibrate touchpad (improve accuracy)'}
              >
                {calibStep === 0
                  ? (padCalib ? `⊕ ${locale === 'ko' ? '재캘리브' : 'Re-cal'}` : `⊕ ${locale === 'ko' ? '캘리브' : 'Calib'}`)
                  : calibStep === 1
                    ? (locale === 'ko' ? '↖ 상단좌' : '↖ Top-L')
                    : calibStep === 2
                      ? (locale === 'ko' ? '↘ 하단우' : '↘ Bot-R')
                      : (locale === 'ko' ? '✓ 완료' : '✓ Done')}
              </button>
              {calibStep > 0 && (
                <button
                  className="text-[10px] text-red-400 hover:text-red-300 px-1"
                  onClick={cancelCalib}
                >✕</button>
              )}
              {padCalib && calibStep === 0 && (
                <button
                  className="text-[10px] text-red-400 hover:text-red-300"
                  onClick={() => setPadCalib(null)}
                >✕</button>
              )}
            </>
          )}

          {/* 피아노 / 드럼 탭 */}
          <div className="flex rounded overflow-hidden border border-zone-border text-[10px] font-mono shrink-0">
            <button
              className={`px-2 py-0.5 transition-all ${!isDrumLayout ? 'bg-accent text-white' : 'text-text-secondary hover:text-accent'}`}
              title={locale === 'ko' ? '피아노 레이아웃' : 'Piano layout'}
              onClick={applyPianoLayout}
            >{locale === 'ko' ? '🎹' : '🎹'}</button>
            <button
              className={`px-2 py-0.5 border-l border-zone-border transition-all ${isDrumLayout ? 'bg-accent text-white' : 'text-text-secondary hover:text-accent'}`}
              title={locale === 'ko' ? '드럼 레이아웃 (GM 퍼커션)' : 'Drum layout (GM percussion)'}
              onClick={applyDrumLayout}
            >🥁</button>
          </div>

          {/* Scale Lock */}
          <ScaleLockButton
            scaleLock={scaleLock}
            setScaleLock={setScaleLock}
            applyScaleLock={applyScaleLock}
            locale={locale}
          />

          {/* Undo / Redo */}
          <button
            className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all disabled:opacity-30"
            title={locale === 'ko' ? `실행 취소 (${_undoStack.length})` : `Undo (${_undoStack.length})`}
            onClick={undo}
            disabled={_undoStack.length === 0}
          >↩</button>
          <button
            className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all disabled:opacity-30"
            title={locale === 'ko' ? `다시 실행 (${_redoStack.length})` : `Redo (${_redoStack.length})`}
            onClick={redo}
            disabled={_redoStack.length === 0}
          >↪</button>

          {/* 레이아웃 편집 토글 */}
          <button
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all shrink-0 ${
              layoutEditMode
                ? 'border-accent text-accent'
                : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
            }`}
            style={layoutEditMode ? { backgroundColor: 'rgb(var(--color-accent) / 0.15)' } : {}}
            onClick={() => setLayoutEditMode((v) => !v)}
            title={locale === 'ko' ? '레이아웃 편집 (드래그로 크기 조절)' : 'Edit layout (drag to resize)'}
          >
            ⊟ {locale === 'ko' ? '레이아웃' : 'Layout'}
          </button>
          {layoutEditMode && (
            <button
              className="text-[10px] text-text-secondary hover:text-accent underline"
              onClick={() => setZoneLayout(layer, createDefaultLayout(grid))}
            >
              {locale === 'ko' ? '초기화' : 'Reset'}
            </button>
          )}
        </div>
      </div>

      {/* Header Row 2: Loop Recorder (full width) */}
      <LoopRecorderBar
        loopState={loopState}
        loopLength={loopLength}
        setLoopLength={setLoopLength}
        onRecord={() => { if (loopState === 'idle') startRecording(); else if (loopState === 'recording') { stopRecording(); startPlayback() } else stopLoop() }}
        onPlay={() => { if (loopState === 'idle') startPlayback(); else stopLoop() }}
        loopActiveSlot={loopActiveSlot}
        loopSlots={loopSlots}
        setLoopActiveSlot={setLoopActiveSlot}
        loopOverdub={loopOverdub}
        setLoopOverdub={setLoopOverdub}
        onExport={() => {
          const { loopEvents: evs, bpm: storeBpm } = useStore.getState()
          const allZones = currentZones
          const midiBytes = buildMidiFile(evs, allZones, storeBpm)
          window.electronAPI?.exportMidi?.(midiBytes)
        }}
        locale={locale}
      />

      {/* Grid: 절대 포지셔닝 기반 */}
      <div className="flex-1 glass-panel select-none relative overflow-hidden p-2">
        {/* 내부 참조 컨테이너 (드래그 기준점) */}
        <div
          ref={gridInnerRef}
          className="absolute inset-2"
          style={{ touchAction: 'none' }}
          onPointerDown={!layoutEditMode ? containerPointerDown : undefined}
          onPointerUp={!layoutEditMode ? containerPointerUp : undefined}
          onPointerMove={layoutEditMode ? handleDividerMouseMove as unknown as React.PointerEventHandler : containerPointerMove}
          onMouseUp={layoutEditMode ? stopDrag : undefined}
          onMouseLeave={layoutEditMode ? stopDrag : undefined}
        >
          {/* Zone 버튼들 */}
          {currentZones.map((zone) => {
            const b = getZoneBounds(zone.row, zone.col, { colWidths, rowHeights })
            const isActive = activeZoneIds.has(zone.id)
            return (
              <div
                key={zone.id}
                className="absolute"
                style={{
                  left: `${b.x * 100}%`,
                  top: `${b.y * 100}%`,
                  width: `${b.w * 100}%`,
                  height: `${b.h * 100}%`,
                  padding: '3px',
                }}
              >
                <button
                  className={`zone-cell w-full h-full relative overflow-hidden ${isActive ? 'active' : ''}`}
                  style={{
                    ...(isActive ? { borderColor: zone.color, color: zone.color } : {}),
                    ...(absPadMode ? { cursor: 'none', pointerEvents: 'none' } : {}),
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.preventDefault()}
                  onDoubleClick={absPadMode ? undefined : () => { if (!layoutEditMode) setEditingZone(zone) }}
                  onContextMenu={(e) => { e.preventDefault(); if (!absPadMode) setEditingZone(zone) }}
                >
                  {isActive && (
                    <div className="absolute inset-0 rounded-xl opacity-15 pointer-events-none"
                      style={{ backgroundColor: zone.color }} />
                  )}
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full opacity-60"
                    style={{ backgroundColor: zone.color }} />
                  <div className="absolute top-1.5 left-2">
                    <ActionBadge type={zone.action.type} />
                  </div>
                  <div className="flex flex-col items-center gap-1 z-10 pointer-events-none mt-2 px-1">
                    <span className="text-lg font-bold font-mono leading-none truncate w-full text-center">{zone.label}</span>
                    <ZoneSubLabel zone={zone} />
                  </div>
                </button>
              </div>
            )
          })}

          {/* 실시간 터치 위치 인디케이터 */}
          {touchDot && (
            <div
              className="absolute z-40 pointer-events-none"
              style={{
                left: `calc(${touchDot.x * 100}% - 8px)`,
                top: `calc(${touchDot.y * 100}% - 8px)`,
                width: 16, height: 16,
                borderRadius: '50%',
                border: '2px solid white',
                backgroundColor: 'rgba(255,255,255,0.3)',
                boxShadow: '0 0 8px rgba(255,255,255,0.6)',
                transition: 'left 30ms linear, top 30ms linear',
              }}
            />
          )}

          {/* 레이아웃 편집 모드: 드래그 구분선 */}
          {layoutEditMode && (
            <>
              {/* 수직 구분선 (컬럼 경계) */}
              {colDividers.map((pos, i) => (
                <div
                  key={`cdiv-${i}`}
                  className="absolute inset-y-0 z-30 flex items-stretch cursor-col-resize"
                  style={{ left: `calc(${pos * 100}% - 5px)`, width: '10px' }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { type: 'col', index: i } }}
                >
                  <div className="w-px mx-auto h-full opacity-70 pointer-events-none"
                    style={{ backgroundColor: 'rgb(var(--color-accent))' }} />
                </div>
              ))}
              {/* 수평 구분선 (행 경계) */}
              {rowDividers.map((pos, i) => (
                <div
                  key={`rdiv-${i}`}
                  className="absolute inset-x-0 z-30 flex flex-col justify-center cursor-row-resize"
                  style={{ top: `calc(${pos * 100}% - 5px)`, height: '10px' }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); dragRef.current = { type: 'row', index: i } }}
                >
                  <div className="h-px w-full opacity-70 pointer-events-none"
                    style={{ backgroundColor: 'rgb(var(--color-accent))' }} />
                </div>
              ))}
              {/* 안내 오버레이 */}
              <div className="absolute inset-0 z-20 pointer-events-none flex items-end justify-center pb-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'rgb(var(--color-accent))' }}>
                  {locale === 'ko' ? '선을 드래그하여 존 크기 조절' : 'Drag lines to resize zones'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Zone Edit Modal */}
      {editingZone && (
        <ZoneEditModal
          zone={editingZone}
          layer={layer}
          onSave={(z) => {
            updateZone(layer, z)
            setEditingZone(null)
          }}
          onCopyToLayer={(z, targetLayer) => {
            updateZone(targetLayer, z)
          }}
          onClose={() => setEditingZone(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────

function ActionBadge({ type }: { type: ZoneAction['type'] }) {
  const colors: Record<ZoneAction['type'], string> = {
    midi: 'text-accent',
    keyboard: 'text-yellow-400',
    osc: 'text-blue-400',
    plugin: 'text-pink-400',
    script: 'text-orange-400',
    cc: 'text-green-400',
    media: 'text-cyan-400',
    chord: 'text-purple-400',
    webhook: 'text-teal-400',
    none: 'text-zone-border',
  }
  const labels: Record<ZoneAction['type'], string> = {
    midi: 'M', keyboard: 'K', osc: 'O', plugin: 'P', script: 'S', cc: 'CC', media: '♪',
    chord: '♫', webhook: 'WH', none: '—',
  }
  return (
    <span className={`text-[9px] font-mono font-bold ${colors[type]}`}>
      {labels[type]}
    </span>
  )
}

function ZoneSubLabel({ zone }: { zone: ZoneConfig }) {
  const { action } = zone
  switch (action.type) {
    case 'midi':
      return <span className="text-[10px] text-text-secondary font-mono">
        {action.midiInstrument === 'drum' ? drumName(action.midiNote ?? 36) : noteToName(action.midiNote ?? 36)}
      </span>
    case 'keyboard':
      return <span className="text-[10px] text-text-secondary font-mono truncate max-w-full px-1">{action.keys?.join('+') ?? ''}</span>
    case 'osc':
      return <span className="text-[10px] text-blue-400 font-mono truncate max-w-full px-1">{action.oscAddress ?? '/osc'}</span>
    case 'plugin':
      return <span className="text-[10px] text-pink-400 font-mono truncate max-w-full px-1">{action.pluginActionId ?? 'plugin'}</span>
    case 'script':
      return <span className="text-[10px] text-orange-400 font-mono truncate max-w-full px-1">{'>'}_</span>
    case 'cc':
      return <span className="text-[10px] text-green-400 font-mono truncate max-w-full px-1">CC{action.midiCC ?? 1}</span>
    case 'media':
      return <span className="text-[10px] text-cyan-400 font-mono truncate max-w-full px-1">{action.mediaAction ?? 'play'}</span>
    case 'none':
    default:
      return <span className="text-[10px] text-zone-border font-mono">—</span>
  }
}

function noteToName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(note / 12) - 1
  return `${names[note % 12]}${octave}`
}

const GM_DRUMS: Record<number, string> = {
  35: 'Kick 2', 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 40: 'Snare 2',
  41: 'Lo Tom', 42: 'HH Cl', 43: 'Hi Tom', 44: 'HH Ped', 45: 'Mid Tom',
  46: 'HH Op', 47: 'Lo-Mid Tom', 48: 'Hi-Mid Tom', 49: 'Crash', 50: 'Hi Tom 2',
  51: 'Ride', 52: 'China', 53: 'Ride Bell', 54: 'Tamb', 55: 'Splash',
  56: 'Cowbell', 57: 'Crash 2', 59: 'Ride 2', 60: 'Bongo H', 61: 'Bongo L',
  62: 'Conga Mute', 63: 'Conga H', 64: 'Conga L', 69: 'Cabasa', 70: 'Maracas',
}
function drumName(note: number): string {
  return GM_DRUMS[note] ?? `D${note}`
}

// 3x3 기본 드럼 레이아웃 (GM 노트)
const DRUM_LAYOUT_3X3 = [
  [49, 51, 46],  // Crash, Ride, HH Open
  [50, 48, 45],  // Hi Tom, Hi-Mid Tom, Mid Tom
  [36, 38, 42],  // Kick, Snare, HH Closed
]
const DRUM_LAYOUT_4X4 = [
  [49, 51, 46, 55],   // Crash, Ride, HH Open, Splash
  [50, 48, 45, 41],   // Hi Tom, Hi-Mid Tom, Mid Tom, Lo Tom
  [40, 38, 37, 39],   // Snare 2, Snare, Rim, Clap
  [36, 35, 42, 44],   // Kick, Kick 2, HH Closed, HH Pedal
]

// ── Scale Lock Button ──────────────────────────────────────────────
interface ScaleLockProps {
  scaleLock: { scale: string; root: number } | null
  setScaleLock: (v: { scale: string; root: number } | null) => void
  applyScaleLock: () => void
  locale: string
}
function ScaleLockButton({ scaleLock, setScaleLock, applyScaleLock, locale }: ScaleLockProps) {
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(scaleLock?.scale ?? 'Major')
  const [root, setRoot] = useState(scaleLock?.root ?? 60)
  const scaleNames = Object.keys(SCALE_INTERVALS)
  const rootName = NOTE_NAMES[root % 12] ?? 'C'

  const apply = () => {
    setScaleLock({ scale, root })
    applyScaleLock()
    setOpen(false)
  }
  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScaleLock(null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all flex items-center gap-1 ${
          scaleLock
            ? 'border-accent text-accent'
            : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'
        }`}
        onClick={() => setOpen((v) => !v)}
        title={locale === 'ko' ? '스케일 락 — 모든 존 노트를 선택 스케일에 맞게 배치' : 'Scale Lock — auto-assign notes from chosen scale'}
      >
        ♩ {scaleLock ? `${NOTE_NAMES[scaleLock.root % 12]} ${scaleLock.scale}` : (locale === 'ko' ? '스케일' : 'Scale')}
        {scaleLock && <span className="text-red-400 hover:text-red-300 cursor-pointer leading-none" onClick={clear}>✕</span>}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 glass-panel p-3 flex flex-col gap-2 shadow-accent-glow"
          style={{ minWidth: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '루트 노트' : 'Root Note'}</span>
            <div className="flex flex-wrap gap-1">
              {NOTE_NAMES.map((name, i) => (
                <button
                  key={i}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all ${root % 12 === i ? 'border-accent text-accent' : 'border-zone-border text-text-secondary hover:border-accent'}`}
                  onClick={() => setRoot(60 + i)}
                >{name}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '스케일' : 'Scale'}</span>
            <select
              className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            >
              {scaleNames.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            className="py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ backgroundColor: 'rgb(var(--color-accent))' }}
            onClick={apply}
          >
            {locale === 'ko' ? `적용 — ${rootName} ${scale}` : `Apply — ${rootName} ${scale}`}
          </button>
          <span className="text-[9px] text-text-secondary leading-relaxed">
            {locale === 'ko' ? '각 존에 스케일 음계를 순서대로 배치합니다' : 'Assigns scale degrees to zones in order'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── MIDI File Builder ──────────────────────────────────────────────
function buildMidiFile(
  events: Array<{ zoneId: string; on: boolean; t: number; pressure: number }>,
  zones: ZoneConfig[],
  bpm: number
): number[] {
  const TPB = 480
  const vlq = (n: number): number[] => {
    const out: number[] = [n & 0x7F]
    n >>= 7
    while (n > 0) { out.unshift((n & 0x7F) | 0x80); n >>= 7 }
    return out
  }
  const msToTicks = (ms: number) => Math.round(ms * (bpm / 60000) * TPB)
  const sorted = [...events].sort((a, b) => a.t - b.t)
  const track: number[] = []
  let lastTick = 0
  for (const ev of sorted) {
    const zone = zones.find((z) => z.id === ev.zoneId)
    if (!zone || zone.action.type !== 'midi') continue
    const ch = ((zone.action.midiChannel ?? 1) - 1) & 0x0F
    const note = zone.action.midiNote ?? 60
    const velMin = zone.action.midiVelocityMin ?? 1
    const velMax = zone.action.midiVelocityMax ?? 127
    const vel = Math.max(1, Math.min(127, Math.round(velMin + ev.pressure * (velMax - velMin))))
    const tick = msToTicks(ev.t)
    const delta = Math.max(0, tick - lastTick)
    lastTick = tick
    track.push(...vlq(delta), ev.on ? (0x90 | ch) : (0x80 | ch), note, ev.on ? vel : 0)
  }
  track.push(0x00, 0xFF, 0x2F, 0x00)
  const tl = track.length
  return [
    0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, (TPB >> 8) & 0xFF, TPB & 0xFF,
    0x4D, 0x54, 0x72, 0x6B,
    (tl >> 24) & 0xFF, (tl >> 16) & 0xFF, (tl >> 8) & 0xFF, tl & 0xFF,
    ...track,
  ]
}

// ── Loop Recorder Bar ──────────────────────────────────────────────
interface LoopBarProps {
  loopState: 'idle' | 'recording' | 'playing'
  loopLength: number
  setLoopLength: (v: number) => void
  onRecord: () => void
  onPlay: () => void
  onExport: () => void
  locale: string
  loopActiveSlot: 'A' | 'B' | 'C' | 'D'
  loopSlots: Record<'A' | 'B' | 'C' | 'D', Array<unknown>>
  setLoopActiveSlot: (slot: 'A' | 'B' | 'C' | 'D') => void
  loopOverdub: boolean
  setLoopOverdub: (v: boolean) => void
}
function LoopRecorderBar({ loopState, loopLength, setLoopLength, onRecord, onPlay, onExport, locale,
  loopActiveSlot, loopSlots, setLoopActiveSlot, loopOverdub, setLoopOverdub }: LoopBarProps) {
  const stateColor = loopState === 'recording' ? 'text-red-400' : loopState === 'playing' ? 'text-green-400' : 'text-text-secondary'
  const stateLabel = loopState === 'recording'
    ? (locale === 'ko' ? '⏺ 녹음 중' : '⏺ REC')
    : loopState === 'playing'
      ? (locale === 'ko' ? '▶ 재생 중' : '▶ PLAY')
      : (locale === 'ko' ? '루프' : 'Loop')

  // 플레이헤드 위치 (0~1)
  const { bpm } = useStore()
  const playheadRef = useRef<number>(0)
  const [playheadPct, setPlayheadPct] = useState(0)
  const rafRef = useRef<number | null>(null)
  const playStartRef = useRef<number>(0)

  useEffect(() => {
    if (loopState === 'playing') {
      playStartRef.current = Date.now()
      const loopMs = Math.round((60000 / bpm) * 4 * loopLength)
      const tick = () => {
        const pct = ((Date.now() - playStartRef.current) % loopMs) / loopMs
        playheadRef.current = pct
        setPlayheadPct(pct)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setPlayheadPct(0)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [loopState, bpm, loopLength])

  return (
    <div className="glass-panel px-3 py-2 flex flex-col gap-1">
    <div className="flex items-center gap-1 flex-wrap">
      {/* Slot selector A/B/C/D */}
      {(['A', 'B', 'C', 'D'] as const).map((slot) => (
        <button
          key={slot}
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all ${
            loopActiveSlot === slot
              ? 'border-accent text-accent'
              : loopSlots[slot].length > 0
                ? 'border-zone-border text-text-primary'
                : 'border-zone-border text-text-secondary opacity-50'
          }`}
          title={`Slot ${slot}${loopSlots[slot].length > 0 ? ' ●' : ''}`}
          onClick={() => setLoopActiveSlot(slot)}
          disabled={loopState === 'recording'}
        >
          {slot}
        </button>
      ))}
      {/* Overdub toggle */}
      <button
        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
          loopOverdub ? 'border-yellow-400 text-yellow-400' : 'border-zone-border text-text-secondary hover:border-yellow-400 hover:text-yellow-400'
        }`}
        title={locale === 'ko' ? '오버더빙 (기존에 덧녹음)' : 'Overdub (layer on top)'}
        onClick={() => setLoopOverdub(!loopOverdub)}
      >
        OD
      </button>
      {/* Record / Stop button */}
      <button
        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
          loopState === 'recording'
            ? 'border-red-400 text-red-400 animate-pulse'
            : loopState === 'playing'
              ? 'border-red-400 text-red-400'
              : 'border-zone-border text-text-secondary hover:border-red-400 hover:text-red-400'
        }`}
        title={loopState === 'idle'
          ? (locale === 'ko' ? '루프 녹음 시작' : 'Start loop recording')
          : loopState === 'recording'
            ? (locale === 'ko' ? '녹음 종료 후 재생' : 'Stop recording & play')
            : (locale === 'ko' ? '루프 중지' : 'Stop loop')}
        onClick={onRecord}
      >
        {loopState === 'recording' ? '■' : loopState === 'playing' ? '■' : '⏺'}
      </button>
      {/* Play / Stop button */}
      <button
        className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
          loopState === 'playing'
            ? 'border-green-400 text-green-400'
            : 'border-zone-border text-text-secondary hover:border-green-400 hover:text-green-400'
        }`}
        title={loopState === 'playing' ? (locale === 'ko' ? '재생 중지' : 'Stop playback') : (locale === 'ko' ? '루프 재생' : 'Play loop')}
        onClick={onPlay}
        disabled={loopState === 'recording'}
      >
        {loopState === 'playing' ? '■' : '▶'}
      </button>
      {/* Loop length */}
      <select
        className="bg-transparent border border-zone-border rounded text-[10px] font-mono text-text-secondary px-1 py-0.5 outline-none focus:border-accent"
        value={loopLength}
        onChange={(e) => setLoopLength(Number(e.target.value))}
        title={locale === 'ko' ? '루프 길이 (마디)' : 'Loop length (bars)'}
      >
        {[1,2,4,8].map((v) => <option key={v} value={v}>{v}{locale === 'ko' ? '마디' : 'bar'}</option>)}
      </select>
      {/* Export button */}
      <button
        className="px-2 py-0.5 rounded text-[10px] font-mono border border-zone-border text-text-secondary hover:border-accent hover:text-accent transition-all disabled:opacity-30"
        title={locale === 'ko' ? 'MIDI 파일로 내보내기' : 'Export as MIDI file'}
        onClick={onExport}
        disabled={loopState === 'recording'}
      >
        ↓mid
      </button>
      {/* State indicator */}
      <span className={`text-[10px] font-mono ${stateColor} ${loopState !== 'idle' ? 'animate-pulse' : 'opacity-50'}`}>
        {stateLabel}
      </span>
    </div>
    {/* 플레이헤드 바 */}
    <div className="relative h-0.5 rounded-full overflow-hidden bg-zone-border/30">
      {loopState === 'playing' && (
        <div
          className="absolute left-0 top-0 h-full bg-green-400 transition-none"
          style={{ width: `${playheadPct * 100}%` }}
        />
      )}
      {loopState === 'recording' && (
        <div
          className="absolute left-0 top-0 h-full bg-red-400 animate-pulse"
          style={{ width: '100%' }}
        />
      )}
    </div>
    </div>
  )
}

// ── MIDI Learn Button ──────────────────────────────────────────────
function MidiLearnButton({ draft, setAction, locale }: {
  draft: ZoneConfig
  setAction: (p: Partial<ZoneAction>) => void
  locale: string
}) {
  const [learning, setLearning] = useState(false)

  const startLearn = async () => {
    setLearning(true)
    const api = window.electronAPI as any
    await api?.startMidiLearn?.()
    const cleanup = api?.onMidiLearnEvent?.((e: { type: 'note' | 'cc'; channel: number; number: number }) => {
      if (draft.action.type === 'midi' && e.type === 'note') {
        setAction({ midiNote: e.number, midiChannel: e.channel })
      } else if (draft.action.type === 'cc' && e.type === 'cc') {
        setAction({ midiCC: e.number, midiCCChannel: e.channel })
      }
      setLearning(false)
      cleanup?.()
    })
    setTimeout(() => { setLearning(false); cleanup?.(); api?.stopMidiLearn?.() }, 10000)
  }

  return (
    <div className="flex items-center gap-2 border-t border-zone-border/30 pt-2">
      <button
        className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${learning ? 'border-red-400 text-red-400 animate-pulse' : 'border-zone-border text-text-secondary hover:border-accent hover:text-accent'}`}
        onClick={learning ? undefined : startLearn}
      >
        {learning ? (locale === 'ko' ? '⏺ 대기 중... MIDI 입력하세요' : '⏺ Waiting for MIDI...') : (locale === 'ko' ? '🎛 MIDI Learn' : '🎛 MIDI Learn')}
      </button>
      {learning && <button className="text-[10px] text-text-secondary underline" onClick={() => { setLearning(false); (window.electronAPI as any)?.stopMidiLearn?.() }}>취소</button>}
    </div>
  )
}

// ── Zone Edit Modal ────────────────────────────────────────────────
interface ModalProps {
  zone: ZoneConfig
  layer: number
  onSave: (z: ZoneConfig) => void
  onClose: () => void
  onCopyToLayer?: (z: ZoneConfig, targetLayer: number) => void
}

function ZoneEditModal({ zone, layer, onSave, onClose, onCopyToLayer }: ModalProps) {
  const { locale } = useStore()
  const [draft, setDraft] = useState<ZoneConfig>({ ...zone, action: { ...zone.action } })
  const [plugins, setPlugins] = useState<Array<{ file: string; name: string; actions: Array<{ id: string; label: string }> }>>([])

  useEffect(() => {
    window.electronAPI?.listPlugins?.().then(setPlugins).catch(() => {})
  }, [])

  const allActionTypes: ZoneAction['type'][] = ['midi', 'chord', 'keyboard', 'cc', 'media', 'osc', 'script', 'plugin', 'webhook', 'none']
  const COLORS = ['#7c6af7', '#5ee7b4', '#f7a066', '#f76c6c', '#6cf7f7', '#f7d96c', '#c46cf7', '#6ca8f7']

  const setAction = (patch: Partial<ZoneAction>) =>
    setDraft((d) => ({ ...d, action: { ...d.action, ...patch } }))

  const actionLabel: Record<ZoneAction['type'], string> = {
    midi: 'MIDI',
    chord: locale === 'ko' ? '코드' : 'Chord',
    keyboard: locale === 'ko' ? '키보드' : 'Key',
    cc: 'CC',
    media: locale === 'ko' ? '미디어' : 'Media',
    osc: 'OSC',
    script: 'Script',
    plugin: locale === 'ko' ? '플러그인' : 'Plugin',
    webhook: 'Webhook',
    none: locale === 'ko' ? '없음' : 'None',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-panel p-6 w-[360px] max-h-[85vh] overflow-y-auto flex flex-col gap-4 shadow-accent-glow">
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-semibold">{locale === 'ko' ? '존 편집' : 'Edit Zone'}</h2>
          <button className="text-text-secondary hover:text-text-primary text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        {/* Label */}
        <div className="flex flex-col gap-1">
          <span className="label-tag">{locale === 'ko' ? '이름' : 'Label'}</span>
          <input
            className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-1">
          <span className="label-tag">{locale === 'ko' ? '색상' : 'Color'}</span>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: draft.color === c ? '#fff' : 'transparent' }}
                onClick={() => setDraft({ ...draft, color: c })}
              />
            ))}
          </div>
        </div>

        {/* Action type */}
        <div className="flex flex-col gap-1">
          <span className="label-tag">{locale === 'ko' ? '액션 타입' : 'Action Type'}</span>
          <div className="flex flex-wrap gap-1.5">
            {allActionTypes.map((ty) => (
              <button
                key={ty}
                className={`control-btn flex-1 min-w-[60px] text-center text-xs ${draft.action.type === ty ? 'selected' : ''}`}
                onClick={() => setAction({ type: ty })}
              >
                {actionLabel[ty]}
              </button>
            ))}
          </div>
        </div>

        {/* ── MIDI settings ── */}
        {draft.action.type === 'midi' && (
          <div className="flex flex-col gap-2">
            {/* Instrument 선택 */}
            <div className="flex flex-col gap-1">
              <span className="label-tag">{locale === 'ko' ? '악기' : 'Instrument'}</span>
              <div className="flex gap-1.5">
                {(['piano', 'drum'] as const).map((inst) => (
                  <button key={inst}
                    className={`control-btn flex-1 text-center text-xs ${(draft.action.midiInstrument ?? 'piano') === inst ? 'selected' : ''}`}
                    onClick={() => setAction({
                      midiInstrument: inst,
                      midiChannel: inst === 'drum' ? 10 : (draft.action.midiChannel === 10 ? 1 : draft.action.midiChannel),
                    })}
                  >
                    {inst === 'piano' ? '🎹 Piano' : '🥁 Drum'}
                  </button>
                ))}
              </div>
            </div>

            {/* 드럼 노트 픽커 */}
            {(draft.action.midiInstrument ?? 'piano') === 'drum' ? (
              <div className="flex flex-col gap-1">
                <span className="label-tag">{locale === 'ko' ? '드럼 사운드' : 'Drum Sound'}</span>
                <select
                  className="bg-bg-primary border border-zone-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  value={draft.action.midiNote ?? 36}
                  onChange={(e) => setAction({ midiNote: Number(e.target.value) })}
                >
                  {Object.entries(GM_DRUMS).sort(([a], [b]) => Number(a) - Number(b)).map(([n, name]) => (
                    <option key={n} value={n}>{name} ({n})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="label-tag">Note</span>
                  <input type="number" min={0} max={127}
                    className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent w-full"
                    value={draft.action.midiNote ?? 60}
                    onChange={(e) => setAction({ midiNote: Number(e.target.value) })}
                  />
                  <span className="text-[10px] text-text-secondary text-center font-mono">
                    {noteToName(draft.action.midiNote ?? 60)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 w-14">
                  <span className="label-tag">Ch</span>
                  <input type="number" min={1} max={16}
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent w-full"
                    value={draft.action.midiChannel ?? 1}
                    onChange={(e) => setAction({ midiChannel: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {/* 드럼 모드 채널 표시 (고정 ch10) */}
            {(draft.action.midiInstrument ?? 'piano') === 'drum' && (
              <span className="text-[10px] text-text-secondary">Ch 10 (GM Percussion) · {locale === 'ko' ? '자동 설정됨' : 'auto-set'}</span>
            )}
            {/* 벨로시티 범위 */}
            <div className="flex flex-col gap-1">
              <span className="label-tag">{locale === 'ko' ? '벨로시티 범위' : 'Velocity Range'}</span>
              <div className="flex gap-2 items-center">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-[10px] text-text-secondary">Min</span>
                  <input type="number" min={1} max={127}
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent w-full"
                    value={draft.action.midiVelocityMin ?? 1}
                    onChange={(e) => setAction({ midiVelocityMin: Number(e.target.value) })}
                  />
                </div>
                <span className="text-text-secondary text-xs mt-4">–</span>
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-[10px] text-text-secondary">Max</span>
                  <input type="number" min={1} max={127}
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent w-full"
                    value={draft.action.midiVelocityMax ?? 127}
                    onChange={(e) => setAction({ midiVelocityMax: Number(e.target.value) })}
                  />
                </div>
              </div>
              <span className="text-[10px] text-text-secondary">
                {locale === 'ko' ? '압력에 따라 Min~Max 범위 안에서 벨로시티 산출' : 'Pressure maps velocity within Min–Max range'}
              </span>
            </div>
          </div>
        )}

        {/* ── Keyboard settings ── */}
        {draft.action.type === 'keyboard' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="label-tag">{locale === 'ko' ? '키 조합 (쉼표로 구분)' : 'Keys (comma-separated)'}</span>
              <input
                className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                placeholder="control, z"
                value={draft.action.keys?.join(', ') ?? ''}
                onChange={(e) => setAction({ keys: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
              />
              <span className="text-[10px] text-text-secondary">
                {locale === 'ko' ? '예: control, z / shift, f5' : 'e.g. control, z / shift, f5'}
              </span>
            </div>
            {/* 딜레이 시퀀스 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="label-tag">{locale === 'ko' ? '딜레이 시퀀스 (선택)' : 'Delay sequence (optional)'}</span>
                <button
                  className="text-[10px] text-accent underline"
                  onClick={() => setAction({
                    keySequence: [...(draft.action.keySequence ?? []), { keys: [], delayMs: 100 }]
                  })}
                >+ {locale === 'ko' ? '추가' : 'Add'}</button>
              </div>
              {(draft.action.keySequence ?? []).map((step, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <input
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent flex-1 font-mono"
                    placeholder="ctrl, c"
                    value={step.keys.join(', ')}
                    onChange={(e) => {
                      const seq = [...(draft.action.keySequence ?? [])]
                      seq[idx] = { ...seq[idx], keys: e.target.value.split(',').map(k => k.trim()).filter(Boolean) }
                      setAction({ keySequence: seq })
                    }}
                  />
                  <input
                    type="number" min={0} max={5000} step={50}
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent w-20"
                    value={step.delayMs}
                    onChange={(e) => {
                      const seq = [...(draft.action.keySequence ?? [])]
                      seq[idx] = { ...seq[idx], delayMs: Number(e.target.value) }
                      setAction({ keySequence: seq })
                    }}
                  />
                  <span className="text-[10px] text-text-secondary">ms</span>
                  <button
                    className="text-zone-border hover:text-red-400 text-xs"
                    onClick={() => {
                      const seq = (draft.action.keySequence ?? []).filter((_, i) => i !== idx)
                      setAction({ keySequence: seq.length ? seq : undefined })
                    }}
                  >✕</button>
                </div>
              ))}
              {(draft.action.keySequence ?? []).length > 0 && (
                <span className="text-[10px] text-text-secondary">
                  {locale === 'ko' ? '각 단계: 키 조합 → 딜레이(ms) 후 다음 실행' : 'Each step: key combo → delay(ms) → next'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Media Control settings ── */}
        {draft.action.type === 'media' && (
          <div className="flex flex-col gap-1">
            <span className="label-tag">{locale === 'ko' ? '미디어 액션' : 'Media Action'}</span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['play', 'pause', 'stop', 'next', 'prev', 'mute', 'volumeUp', 'volumeDown'] as MediaAction[]).map((a) => {
                const icons: Record<MediaAction, string> = {
                  play: '▶', pause: '⏸', stop: '⏹', next: '⏭', prev: '⏮',
                  mute: '🔇', volumeUp: '🔊', volumeDown: '🔉',
                }
                return (
                  <button
                    key={a}
                    className={`control-btn flex flex-col items-center gap-0.5 py-2 text-xs ${draft.action.mediaAction === a ? 'selected' : ''}`}
                    onClick={() => setAction({ mediaAction: a })}
                  >
                    <span className="text-base leading-none">{icons[a]}</span>
                    <span className="text-[9px] font-mono">{a}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── OSC settings ── */}
        {draft.action.type === 'osc' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="label-tag">{locale === 'ko' ? 'OSC 주소' : 'OSC Address'}</span>
              <input
                className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
                placeholder="/my/address"
                value={draft.action.oscAddress ?? ''}
                onChange={(e) => setAction({ oscAddress: e.target.value })}
              />
            </div>
            <p className="text-[10px] text-text-secondary leading-relaxed">
              {locale === 'ko'
                ? '터치 시 이 주소로 OSC 메시지를 전송합니다.\n자동: /trackpad/zone/{id} on pressure'
                : 'Sends an OSC message to this address on touch.\nAuto: /trackpad/zone/{id} on pressure'}
            </p>
          </div>
        )}

        {/* ── CC settings ── */}
        {draft.action.type === 'cc' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <span className="label-tag">CC#</span>
                <input type="number" min={0} max={127}
                  className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent w-full"
                  value={draft.action.midiCC ?? 1}
                  onChange={(e) => setAction({ midiCC: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1 w-14">
                <span className="label-tag">Ch</span>
                <input type="number" min={1} max={16}
                  className="bg-bg-primary border border-zone-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent w-full"
                  value={draft.action.midiCCChannel ?? 1}
                  onChange={(e) => setAction({ midiCCChannel: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1 w-16">
                <span className="label-tag">{locale === 'ko' ? '축' : 'Axis'}</span>
                <select
                  className="bg-bg-primary border border-zone-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  value={draft.action.ccAxis ?? 'x'}
                  onChange={(e) => setAction({ ccAxis: e.target.value as 'x' | 'y' })}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-text-secondary">
              {locale === 'ko'
                ? '터치 후 드래그하면 X/Y 위치를 CC 값(0-127)으로 전송'
                : 'Drag after touch — X/Y position sends CC value (0-127)'}
            </p>
          </div>
        )}

        {/* ── Script settings ── */}
        {draft.action.type === 'script' && (
          <div className="flex flex-col gap-1">
            <span className="label-tag">{locale === 'ko' ? '스크립트' : 'Script'}</span>
            <textarea
              className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent resize-none"
              rows={3}
              placeholder={locale === 'ko' ? 'PowerShell / bash 명령어' : 'PowerShell / bash command'}
              value={draft.action.script ?? ''}
              onChange={(e) => setAction({ script: e.target.value })}
            />
            <span className="text-[10px] text-text-secondary">
              {locale === 'ko'
                ? 'Windows: PowerShell, macOS: bash. 터치 시 1회 실행'
                : 'Windows: PowerShell, macOS: bash. Runs once on touch'}
            </span>
          </div>
        )}

        {/* ── Plugin settings ── */}
        {draft.action.type === 'plugin' && (
          <div className="flex flex-col gap-2">
            {plugins.length === 0 ? (
              <p className="text-xs text-text-secondary">
                {locale === 'ko' ? '로드된 플러그인 없음. 설정에서 플러그인 폴더를 열어 추가하세요.' : 'No plugins loaded. Open the plugins folder in settings to add one.'}
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <span className="label-tag">{locale === 'ko' ? '플러그인' : 'Plugin'}</span>
                  <select
                    className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    value={draft.action.pluginFile ?? ''}
                    onChange={(e) => setAction({ pluginFile: e.target.value, pluginActionId: '' })}
                  >
                    <option value="">{locale === 'ko' ? '선택...' : 'Select...'}</option>
                    {plugins.map((p) => (
                      <option key={p.file} value={p.file}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {draft.action.pluginFile && (
                  <div className="flex flex-col gap-1">
                    <span className="label-tag">{locale === 'ko' ? '액션' : 'Action'}</span>
                    <select
                      className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                      value={draft.action.pluginActionId ?? ''}
                      onChange={(e) => setAction({ pluginActionId: e.target.value })}
                    >
                      <option value="">{locale === 'ko' ? '선택...' : 'Select...'}</option>
                      {plugins.find((p) => p.file === draft.action.pluginFile)?.actions.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Chord settings ── */}
        {draft.action.type === 'chord' && (
          <div className="flex flex-col gap-2">
            {/* 코드 프리셋 버튼 */}
            <div className="flex flex-wrap gap-1">
              {[['Major',[0,4,7]],['Minor',[0,3,7]],['Maj7',[0,4,7,11]],['Min7',[0,3,7,10]],
                ['Dom7',[0,4,7,10]],['Sus4',[0,5,7]],['Dim',[0,3,6]],['Aug',[0,4,8]]
              ].map(([name, intervals]) => (
                <button key={String(name)} className="text-[10px] px-1.5 py-0.5 rounded border border-zone-border text-text-secondary hover:border-accent hover:text-accent"
                  onClick={() => {
                    const root = draft.action.chordNotes?.[0] ?? 60
                    setAction({ chordNotes: (intervals as number[]).map((i) => root + i) })
                  }}>{name}</button>
              ))}
            </div>
            {/* 피아노 키 UI */}
            <ChordPianoBuilder
              notes={draft.action.chordNotes ?? [60, 64, 67]}
              onChange={(notes) => setAction({ chordNotes: notes })}
            />
            {/* 채널 */}
            <div className="flex items-center gap-2">
              <span className="label-tag shrink-0">Ch</span>
              <input type="number" min={1} max={16}
                className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent w-16"
                value={draft.action.chordChannel ?? 1}
                onChange={(e) => setAction({ chordChannel: Number(e.target.value) })}
              />
              <span className="text-[10px] text-text-secondary font-mono">
                {(draft.action.chordNotes ?? []).map((n) => noteToName(n)).join(' ')}
              </span>
            </div>
          </div>
        )}

        {/* ── Webhook settings ── */}
        {draft.action.type === 'webhook' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="label-tag">URL</span>
              <input
                className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
                placeholder="https://example.com/hook"
                value={draft.action.webhookUrl ?? ''}
                onChange={(e) => setAction({ webhookUrl: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1 w-20">
                <span className="label-tag">Method</span>
                <select
                  className="bg-bg-primary border border-zone-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  value={draft.action.webhookMethod ?? 'POST'}
                  onChange={(e) => setAction({ webhookMethod: e.target.value as 'GET' | 'POST' })}
                >
                  <option>GET</option>
                  <option>POST</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <span className="label-tag">Body (JSON)</span>
                <input
                  className="bg-bg-primary border border-zone-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent font-mono"
                  placeholder='{"on": {{on}}, "zone": "{{zone}}"}'
                  value={draft.action.webhookBody ?? ''}
                  onChange={(e) => setAction({ webhookBody: e.target.value })}
                />
              </div>
            </div>
            <span className="text-[10px] text-text-secondary">{'{{on}} {{zone}} {{pressure}} 치환 가능'}</span>
          </div>
        )}

        {/* ── X/Y Expression (midi 타입에 추가 섹션) ── */}
        {draft.action.type === 'midi' && (
          <div className="flex flex-col gap-1 border-t border-zone-border/30 pt-2">
            <span className="label-tag">✨ X/Y Expression</span>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y'] as const).map((axis) => {
                const key = axis === 'x' ? 'expressionX' : 'expressionY'
                const val = (draft.action as unknown as Record<string, string>)[key] ?? 'none'
                return (
                  <div key={axis} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-text-secondary font-mono">{axis.toUpperCase()}축</span>
                    <select
                      className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                      value={val}
                      onChange={(e) => setAction({ [key]: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="pitchbend">Pitch Bend</option>
                      <option value="mod">Modulation (CC1)</option>
                      <option value="aftertouch">Aftertouch</option>
                    </select>
                  </div>
                )
              })}
            </div>
            <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '존 안에서 손가락 위치로 피치/모듈레이션 제어' : 'Control pitch/mod by finger position within zone'}</span>
          </div>
        )}

        {/* ── Arpeggiator (midi / chord 타입) ── */}
        {(draft.action.type === 'midi' || draft.action.type === 'chord') && (
          <div className="flex flex-col gap-1 border-t border-zone-border/30 pt-2">
            <div className="flex items-center justify-between">
              <span className="label-tag">🎶 Arpeggiator</span>
              <button
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${draft.action.arpEnabled ? 'border-accent text-accent' : 'border-zone-border text-text-secondary'}`}
                onClick={() => setAction({ arpEnabled: !draft.action.arpEnabled })}
              >{draft.action.arpEnabled ? 'ON' : 'OFF'}</button>
            </div>
            {draft.action.arpEnabled && (
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '패턴' : 'Pattern'}</span>
                  <select
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    value={draft.action.arpPattern ?? 'up'}
                    onChange={(e) => setAction({ arpPattern: e.target.value as 'up' | 'down' | 'random' | 'updown' })}
                  >
                    <option value="up">Up ↑</option>
                    <option value="down">Down ↓</option>
                    <option value="updown">Up-Down ↕</option>
                    <option value="random">Random ✦</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <span className="text-[10px] text-text-secondary">{locale === 'ko' ? '속도' : 'Rate'}</span>
                  <select
                    className="bg-bg-primary border border-zone-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    value={draft.action.arpRate ?? '1/8'}
                    onChange={(e) => setAction({ arpRate: e.target.value as '1/4' | '1/8' | '1/16' | '1/32' })}
                  >
                    <option value="1/4">1/4</option>
                    <option value="1/8">1/8</option>
                    <option value="1/16">1/16</option>
                    <option value="1/32">1/32</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MIDI Learn ── */}
        {(draft.action.type === 'midi' || draft.action.type === 'cc') && (
          <MidiLearnButton draft={draft} setAction={setAction} locale={locale} />
        )}

        <div className="flex gap-2">
          {/* 존 초기화 (액션 = none으로 리셋) */}
          <button
            className="flex-none px-3 py-2 rounded-xl text-xs font-mono text-text-secondary border border-zone-border hover:border-red-400 hover:text-red-400 transition-colors"
            title={locale === 'ko' ? '존을 기본 상태로 초기화 (액션 없음)' : 'Reset zone to default (no action)'}
            onClick={() => onSave({ ...draft, action: { type: 'none' } })}
          >
            {locale === 'ko' ? '초기화' : 'Reset'}
          </button>
          {/* 레이어 복사 */}
          {onCopyToLayer && ([1,2,3,4] as const).filter((l) => l !== layer).map((l) => (
            <button key={l}
              className="flex-none px-3 py-2 rounded-xl text-xs font-mono text-text-secondary border border-zone-border hover:border-accent hover:text-accent transition-colors"
              title={locale === 'ko' ? `레이어 ${l}로 복사` : `Copy to Layer ${l}`}
              onClick={() => { onCopyToLayer(draft, l); onClose() }}
            >
              →L{l}
            </button>
          ))}
          <button
            className="flex-1 py-2 rounded-xl text-white font-semibold text-sm transition-colors"
            style={{ backgroundColor: 'rgb(var(--color-accent))', }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--color-accent-hover))')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--color-accent))')}
            onClick={() => onSave(draft)}
          >
            {locale === 'ko' ? '저장' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Chord Piano Builder ─────────────────────────────────────────────
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]   // semitone offsets in octave
const BLACK_KEYS = [1, 3, -1, 6, 8, 10, -1] // -1 = no black key after this white key
const NOTE_NAMES_SHORT = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function ChordPianoBuilder({ notes, onChange }: { notes: number[]; onChange: (n: number[]) => void }) {
  const START_OCTAVE = 3   // C3 = MIDI 48
  const NUM_OCTAVES = 2

  const toggle = (midi: number) => {
    if (notes.includes(midi)) {
      onChange(notes.filter((n) => n !== midi))
    } else {
      onChange([...notes, midi].sort((a, b) => a - b))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="label-tag text-[10px]">Piano</span>
      <div className="flex gap-0 relative select-none" style={{ height: 52 }}>
        {Array.from({ length: NUM_OCTAVES }, (_, oct) => {
          const baseNote = (START_OCTAVE + oct) * 12
          return WHITE_KEYS.map((semi, wi) => {
            const midi = baseNote + semi
            const isActive = notes.includes(midi)
            const hasBlack = BLACK_KEYS[wi] !== -1
            const blackMidi = hasBlack ? baseNote + BLACK_KEYS[wi] : -1
            const isBlackActive = blackMidi !== -1 && notes.includes(blackMidi)
            return (
              <div key={midi} className="relative flex-1" style={{ minWidth: 16 }}>
                {/* White key */}
                <button
                  className={`absolute inset-0 rounded-b border ${
                    isActive
                      ? 'bg-accent border-accent'
                      : 'bg-white border-zone-border hover:bg-accent/20'
                  } transition-colors`}
                  style={{ top: 0, bottom: 0 }}
                  title={`${NOTE_NAMES_SHORT[semi]}${START_OCTAVE + oct} (${midi})`}
                  onClick={() => toggle(midi)}
                />
                {/* Black key */}
                {hasBlack && blackMidi !== -1 && (
                  <button
                    className={`absolute rounded-b z-10 border ${
                      isBlackActive
                        ? 'bg-accent border-accent'
                        : 'bg-gray-800 border-gray-900 hover:bg-accent/60'
                    } transition-colors`}
                    style={{ left: '60%', right: '-40%', top: 0, height: '58%' }}
                    title={`${NOTE_NAMES_SHORT[BLACK_KEYS[wi]]}${START_OCTAVE + oct} (${blackMidi})`}
                    onClick={() => toggle(blackMidi)}
                  />
                )}
              </div>
            )
          })
        })}
      </div>
      <div className="text-[9px] font-mono text-text-secondary">
        {notes.length === 0 ? (
          <span className="opacity-50">no notes selected</span>
        ) : (
          notes.map((n) => `${NOTE_NAMES_SHORT[n % 12]}${Math.floor(n / 12) - 1}`).join(' ')
        )}
      </div>
    </div>
  )
}
