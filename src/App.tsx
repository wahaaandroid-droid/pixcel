import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CellState,
  columnHints,
  createEmptyGrid,
  imageToSolutionGrid,
  isSolved,
  lineHints,
  maxHintCount,
  nextStateForLongPress,
  nextStateFull,
  nextStateXMode,
} from './picross'

const GRID_OPTIONS = [10, 15, 20] as const
const LONG_PRESS_MS = 400

const CELL_BORDER_THIN = 1
const CELL_BORDER_THICK = 3

/** 5マスごとの区切り（左辺・上辺のみ太くし、隣接セルで線が二重にならないようにする） */
function cellMajorBorderWidths(ri: number, ci: number) {
  return {
    borderLeftWidth:
      ci > 0 && ci % 5 === 0 ? CELL_BORDER_THICK : CELL_BORDER_THIN,
    borderTopWidth:
      ri > 0 && ri % 5 === 0 ? CELL_BORDER_THICK : CELL_BORDER_THIN,
    borderRightWidth: CELL_BORDER_THIN,
    borderBottomWidth: CELL_BORDER_THIN,
  }
}

function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export default function App() {
  const [gridSize, setGridSize] = useState<(typeof GRID_OPTIONS)[number]>(15)
  const [threshold, setThreshold] = useState(128)
  const [xMode, setXMode] = useState(false)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const imgUrlRef = useRef<string | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [solution, setSolution] = useState<boolean[][] | null>(null)
  const [cells, setCells] = useState<CellState[][] | null>(null)

  const rowHints = useMemo(() => {
    if (!solution) return null
    return solution.map(lineHints)
  }, [solution])

  const colHints = useMemo(() => {
    if (!solution) return null
    const n = solution.length
    return Array.from({ length: n }, (_, j) => columnHints(solution, j))
  }, [solution])

  const maxRowHints = rowHints ? maxHintCount(rowHints) : 1
  const maxColHints = colHints ? maxHintCount(colHints) : 1

  const applyPuzzleFromImage = useCallback(
    (img: HTMLImageElement, size: number, thr: number) => {
      const sol = imageToSolutionGrid(img, size, thr)
      setSolution(sol)
      setCells(createEmptyGrid(size))
    },
    [],
  )

  const onFile = useCallback(
    (file: File | null) => {
      setLoadError(null)
      if (!file) return
      if (imgUrlRef.current) {
        URL.revokeObjectURL(imgUrlRef.current)
        imgUrlRef.current = null
      }
      const url = URL.createObjectURL(file)
      imgUrlRef.current = url
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        setHasImage(true)
        applyPuzzleFromImage(img, gridSize, threshold)
      }
      img.onerror = () => {
        setLoadError('画像の読み込みに失敗しました')
        setHasImage(false)
        imgRef.current = null
      }
      img.src = url
    },
    [applyPuzzleFromImage, gridSize, threshold],
  )

  useEffect(() => {
    return () => {
      if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const img = imgRef.current
    if (!img || !hasImage) return
    applyPuzzleFromImage(img, gridSize, threshold)
  }, [gridSize, threshold, hasImage, applyPuzzleFromImage])

  const solved = useMemo(() => {
    if (!solution || !cells) return false
    return isSolved(solution, cells)
  }, [solution, cells])

  const boardWrapRef = useRef<HTMLDivElement>(null)
  const [cellPx, setCellPx] = useState(22)

  useLayoutEffect(() => {
    const el = boardWrapRef.current
    if (!el) return

    const measure = () => {
      const n = solution?.length ?? gridSize
      const rect = el.getBoundingClientRect()
      const portrait =
        window.matchMedia('(max-width: 768px) and (orientation: portrait)')
          .matches
      const vw = window.innerWidth
      const vh = window.innerHeight
      const vmin = Math.min(vw, vh)

      const hintColCh = Math.max(2, maxRowHints) * 0.62 + 0.35
      const hintRowCh = Math.max(2, maxColHints) * 0.55 + 0.35

      const wFit = rect.width / (n + hintColCh)
      const hFit = rect.height / (n + hintRowCh)

      let cs = Math.min(wFit, hFit)
      if (portrait) {
        const cap = (vmin * 0.9) / (n + Math.max(hintColCh, hintRowCh))
        cs = Math.min(cs, cap)
      }
      setCellPx(Math.max(10, Math.floor(cs)))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [solution, gridSize, maxRowHints, maxColHints])

  const cellsRef = useLatest(cells)
  const xModeRef = useLatest(xMode)

  const longTimerRef = useRef<number | null>(null)
  const isPaintingRef = useRef(false)
  const startCellRef = useRef<[number, number] | null>(null)
  const pendingTapRef = useRef(false)
  const paintValueRef = useRef<CellState>(0)
  const boardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (isPaintingRef.current && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const paintAt = useCallback((r: number, c: number, v: CellState) => {
    setCells((prev) => {
      if (!prev || prev[r]?.[c] === undefined) return prev
      if (prev[r][c] === v) return prev
      const next = prev.map((row) => row.slice())
      next[r][c] = v
      return next
    })
  }, [])

  const toggleAt = useCallback(
    (r: number, c: number) => {
      setCells((prev) => {
        if (!prev) return prev
        const cur = prev[r][c]
        const nv = xModeRef.current ? nextStateXMode(cur) : nextStateFull(cur)
        if (nv === cur) return prev
        const next = prev.map((row) => row.slice())
        next[r][c] = nv
        return next
      })
    },
    [xModeRef],
  )

  /** テスト用：正解どおりに盤面を一括で埋める（白マスは空白） */
  const revealSolution = useCallback(() => {
    if (!solution) return
    setCells(
      solution.map((row) =>
        row.map((black) => (black ? 1 : 0) as CellState),
      ),
    )
  }, [solution])

  const hitCell = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const target = document.elementFromPoint(clientX, clientY)
      const el = target?.closest<HTMLElement>('[data-cr]')
      if (!el) return null
      const r = Number(el.dataset.r)
      const c = Number(el.dataset.c)
      if (Number.isNaN(r) || Number.isNaN(c)) return null
      return [r, c]
    },
    [],
  )

  const clearLongTimer = () => {
    if (longTimerRef.current != null) {
      window.clearTimeout(longTimerRef.current)
      longTimerRef.current = null
    }
  }

  const onCellPointerDown = useCallback(
    (e: React.PointerEvent, r: number, c: number) => {
      if (e.button !== 0) return
      e.preventDefault()
      boardRef.current?.setPointerCapture(e.pointerId)

      clearLongTimer()
      isPaintingRef.current = false
      startCellRef.current = [r, c]
      pendingTapRef.current = true

      const cur = cellsRef.current?.[r]?.[c] ?? 0
      paintValueRef.current = nextStateForLongPress(cur, xModeRef.current)

      longTimerRef.current = window.setTimeout(() => {
        pendingTapRef.current = false
        isPaintingRef.current = true
        paintAt(r, c, paintValueRef.current)
      }, LONG_PRESS_MS)
    },
    [cellsRef, paintAt, xModeRef],
  )

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      clearLongTimer()
      try {
        boardRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }

      if (pendingTapRef.current && !isPaintingRef.current && startCellRef.current) {
        const [r, c] = startCellRef.current
        toggleAt(r, c)
      }

      pendingTapRef.current = false
      isPaintingRef.current = false
      startCellRef.current = null
    },
    [toggleAt],
  )

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPaintingRef.current) return
      if (e.cancelable) e.preventDefault()
      const hit = hitCell(e.clientX, e.clientY)
      if (!hit) return
      const [r, c] = hit
      paintAt(r, c, paintValueRef.current)
    },
    [hitCell, paintAt],
  )

  const n = solution?.length ?? gridSize

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="title">ピクロス（画像から作成）</h1>
        {solved && <div className="solved-badge">完成！</div>}
      </header>

      <div className="layout">
        <aside className="panel">
          <label className="field">
            <span className="label">画像</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {loadError && <p className="error">{loadError}</p>}

          <label className="field">
            <span className="label">グリッド</span>
            <select
              value={gridSize}
              onChange={(e) =>
                setGridSize(Number(e.target.value) as (typeof GRID_OPTIONS)[number])
              }
            >
              {GRID_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}×{g}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">
              しきい値（輝度）: <strong>{threshold}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={!hasImage}
            />
          </label>

          <p className="hint">
            タップで空白 → 黒 → ×。長押し後にドラッグで同じ状態をまとめて塗れます。
          </p>

          <button
            type="button"
            className="reveal-btn"
            onClick={revealSolution}
            disabled={!solution}
          >
            答えを一括表示（テスト用）
          </button>
        </aside>

        <div className="board-area" ref={boardWrapRef}>
          {!hasImage && (
            <div className="placeholder">画像を選ぶとここに盤面が表示されます</div>
          )}
          {hasImage && solution && cells && rowHints && colHints && (
            <div
              className="board"
              ref={boardRef}
              onPointerMove={onBoardPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              style={{
                gridTemplateColumns: `auto repeat(${n}, ${cellPx}px)`,
                gridTemplateRows: `auto repeat(${n}, ${cellPx}px)`,
              }}
            >
              <div className="corner" style={{ gridColumn: 1, gridRow: 1 }} />
              {colHints.map((hints, ci) => (
                <div
                  key={`c-${ci}`}
                  className="col-hints"
                  style={{ gridColumn: ci + 2, gridRow: 1 }}
                >
                  {hints.map((h, hi) => (
                    <span key={hi}>{h}</span>
                  ))}
                </div>
              ))}
              {rowHints.map((hints, ri) => (
                <div
                  key={`rh-${ri}`}
                  className="row-hints"
                  style={{ gridColumn: 1, gridRow: ri + 2 }}
                >
                  {hints.map((h, hi) => (
                    <span key={hi}>{h}</span>
                  ))}
                </div>
              ))}
              {cells.map((_, ri) =>
                cells[ri].map((_, ci) => {
                  const st = cells[ri][ci]
                  return (
                    <button
                      key={`${ri}-${ci}`}
                      type="button"
                      className={`cell s${st}`}
                      style={{
                        width: cellPx,
                        height: cellPx,
                        gridColumn: ci + 2,
                        gridRow: ri + 2,
                        borderStyle: 'solid',
                        borderColor: '#64748b',
                        ...cellMajorBorderWidths(ri, ci),
                      }}
                      data-cr
                      data-r={ri}
                      data-c={ci}
                      onPointerDown={(e) => onCellPointerDown(e, ri, ci)}
                    />
                  )
                }),
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="bottom">
        <button
          type="button"
          className={`mode-btn ${xMode ? 'on' : ''}`}
          onClick={() => setXMode((v) => !v)}
        >
          ×印モード {xMode ? 'ON' : 'OFF'}
        </button>
        <span className="mode-note">
          ONのときはタップが空白⇔×中心（黒は一度で空白に戻ります）
        </span>
      </footer>

      <style>{`
        .app {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          color: #0f172a;
        }
        .topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #fff;
          border-bottom: 1px solid #cbd5e1;
          flex-wrap: wrap;
        }
        .title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
        }
        .solved-badge {
          margin-left: auto;
          padding: 6px 12px;
          border-radius: 999px;
          background: #22c55e;
          color: #fff;
          font-weight: 700;
          font-size: 0.9rem;
        }
        .layout {
          flex: 1;
          display: flex;
          gap: 16px;
          padding: 16px;
          align-items: flex-start;
          justify-content: center;
          min-height: 0;
        }
        @media (min-width: 900px) {
          .layout {
            flex-direction: row;
          }
          .panel {
            width: 280px;
            flex-shrink: 0;
          }
          .board-area {
            flex: 1;
            min-width: 0;
          }
        }
        @media (max-width: 899px) {
          .layout {
            flex-direction: column;
            align-items: stretch;
          }
          .board-area {
            width: 100%;
            min-height: 40vh;
            display: flex;
            justify-content: center;
          }
        }
        .panel {
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.9rem;
        }
        .label {
          color: #334155;
        }
        .error {
          margin: 0;
          color: #b91c1c;
          font-size: 0.85rem;
        }
        .hint {
          margin: 0;
          font-size: 0.8rem;
          color: #64748b;
        }
        .reveal-btn {
          width: 100%;
          margin-top: 4px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #a16207;
          background: #fef9c3;
          color: #713f12;
          font-weight: 700;
          cursor: pointer;
        }
        .reveal-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .placeholder {
          align-self: center;
          color: #64748b;
          padding: 24px;
          text-align: center;
        }
        .board {
          display: grid;
          align-content: start;
          justify-content: start;
          touch-action: none;
          user-select: none;
        }
        .corner {
          min-width: 8px;
        }
        .col-hints {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
          gap: 2px;
          padding: 4px 2px;
          font-size: clamp(10px, 2.8vmin, 13px);
          font-weight: 600;
          color: #1e293b;
          border-bottom: 1px solid #94a3b8;
        }
        .row-hints {
          display: flex;
          flex-direction: row;
          justify-content: flex-end;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          font-size: clamp(10px, 2.8vmin, 13px);
          font-weight: 600;
          color: #1e293b;
          border-right: 1px solid #94a3b8;
        }
        .cell {
          box-sizing: border-box;
          padding: 0;
          margin: 0;
          background: #fff;
          cursor: pointer;
          position: relative;
        }
        .cell.s1 {
          background: #0f172a;
        }
        .cell.s2::before,
        .cell.s2::after {
          content: '';
          position: absolute;
          inset: 0;
          margin: auto;
          width: 86%;
          height: 2px;
          background: #b91c1c;
          border-radius: 1px;
        }
        .cell.s2::before {
          transform: rotate(45deg);
        }
        .cell.s2::after {
          transform: rotate(-45deg);
        }
        .bottom {
          position: sticky;
          bottom: 0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: #fff;
          border-top: 1px solid #cbd5e1;
        }
        .mode-btn {
          border: 1px solid #64748b;
          background: #f8fafc;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .mode-btn.on {
          background: #1d4ed8;
          color: #fff;
          border-color: #1e40af;
        }
        .mode-note {
          font-size: 0.8rem;
          color: #64748b;
        }
      `}</style>
    </div>
  )
}
