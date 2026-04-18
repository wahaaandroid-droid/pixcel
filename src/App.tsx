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
  applyRandomSingleHint,
  columnHints,
  createEmptyGrid,
  imageToSolutionGrid,
  isCompleteByHints,
  lineHints,
  maxHintCount,
  nextStateForLongPress,
  nextStateFull,
  nextStateXMode,
} from './picross'
import {
  PRESET_GRID_SIZES,
  getAllPresetSides,
  presetToGrid,
  presetsForSide,
} from './presets'
import { applyLogicalDeductions, countSolutionsCapped } from './solver'

/** 盤の一辺のマス数（画像・プリセットで共通） */
const GRID_OPTIONS = PRESET_GRID_SIZES
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
  const [sourceMode, setSourceMode] = useState<'image' | 'preset'>('preset')
  const [presetSide, setPresetSide] = useState(10)
  const [selectedPresetId, setSelectedPresetId] = useState(
    () => presetsForSide(10)[0]?.id ?? '',
  )

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
      setSourceMode('image')
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
    if (sourceMode !== 'preset') return
    let def = presetsForSide(presetSide).find((p) => p.id === selectedPresetId)
    if (!def) {
      def = presetsForSide(presetSide)[0]
      if (!def) return
      setSelectedPresetId(def.id)
      return
    }
    try {
      const sol = presetToGrid(def)
      setSolution(sol)
      setCells(createEmptyGrid(sol.length))
      setLoadError(null)
    } catch {
      setLoadError('プリセットの読み込みに失敗しました')
    }
  }, [sourceMode, presetSide, selectedPresetId])

  useEffect(() => {
    if (sourceMode !== 'image' || !hasImage) return
    const img = imgRef.current
    if (!img) return
    applyPuzzleFromImage(img, gridSize, threshold)
  }, [sourceMode, gridSize, threshold, hasImage, applyPuzzleFromImage])

  useEffect(() => {
    if (sourceMode === 'image' && !hasImage) {
      setSolution(null)
      setCells(null)
    }
  }, [sourceMode, hasImage])

  const solved = useMemo(() => {
    if (!rowHints || !colHints || !cells) return false
    return isCompleteByHints(rowHints, colHints, cells)
  }, [rowHints, colHints, cells])

  const [clueUniqueness, setClueUniqueness] = useState<
    'idle' | 'checking' | 'unique' | 'multi' | 'skipped'
  >('idle')

  const [deductionNotice, setDeductionNotice] = useState<string | null>(null)
  const [hintNotice, setHintNotice] = useState<string | null>(null)

  useEffect(() => {
    setDeductionNotice(null)
    setHintNotice(null)
  }, [solution])

  useEffect(() => {
    if (!rowHints || !colHints || !solution) {
      setClueUniqueness('idle')
      return
    }
    const n = solution.length
    if (n > 18) {
      setClueUniqueness('skipped')
      return
    }
    setClueUniqueness('checking')
    const t = window.setTimeout(() => {
      const cnt = countSolutionsCapped(rowHints, colHints, n, 2, 400)
      if (cnt < 0 || cnt === 0) setClueUniqueness('skipped')
      else if (cnt > 1) setClueUniqueness('multi')
      else setClueUniqueness('unique')
    }, 0)
    return () => window.clearTimeout(t)
  }, [rowHints, colHints, solution])

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
    setDeductionNotice(null)
    setHintNotice(null)
  }, [solution])

  /** 画像正解に合わせてランダムに1マスだけ黒または×を入れる */
  const applyOneCellHint = useCallback(() => {
    if (!solution || !cells || !rowHints || !colHints) return
    setDeductionNotice(null)
    if (isCompleteByHints(rowHints, colHints, cells)) {
      setHintNotice('数字のヒントどおりに完成しています。')
      return
    }
    const next = applyRandomSingleHint(solution, cells)
    if (!next) {
      setHintNotice('すでに正解の模様と一致しています。')
      return
    }
    setCells(next)
    setHintNotice(
      sourceMode === 'image'
        ? '画像の答えに合わせ、ランダムな1マスを黒塗りまたは×で入れました。'
        : 'おまかせ問題の答えに合わせ、ランダムな1マスを黒塗りまたは×で入れました。',
    )
  }, [solution, cells, rowHints, colHints, sourceMode])

  /** 行・列の論理だけで確定するマスに黒／×を一括入力 */
  const applyDeductions = useCallback(() => {
    if (!cells || !rowHints || !colHints) return
    setHintNotice(null)
    const beforeZeros = cells.flat().filter((x) => x === 0).length
    const next = applyLogicalDeductions(cells, rowHints, colHints)
    if (next === null) {
      setDeductionNotice(
        '論理だけでは進められない・矛盾・または行の候補が多すぎて省略されました。',
      )
      return
    }
    const afterZeros = next.flat().filter((x) => x === 0).length
    const filled = beforeZeros - afterZeros
    setCells(next)
    setDeductionNotice(
      filled === 0
        ? 'いま新たに確定できるマスはありません。'
        : `論理で確定した ${filled} マスに黒塗りまたは×を入れました。`,
    )
  }, [cells, rowHints, colHints])

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
        <h1 className="title">ピクロスアート</h1>
        {solved && <div className="solved-badge">完成！</div>}
      </header>

      <div className="layout">
        <aside className="panel">
          <label className="field">
            <span className="label">出題モード</span>
            <select
              value={sourceMode}
              onChange={(e) => {
                const v = e.target.value as 'image' | 'preset'
                setSourceMode(v)
                setDeductionNotice(null)
                setHintNotice(null)
                if (v === 'preset') {
                  setHasImage(false)
                  imgRef.current = null
                  if (imgUrlRef.current) {
                    URL.revokeObjectURL(imgUrlRef.current)
                    imgUrlRef.current = null
                  }
                }
              }}
            >
              <option value="preset">おまかせの問題</option>
              <option value="image">画像から作る</option>
            </select>
          </label>

          {sourceMode === 'preset' && (
            <>
              <label className="field">
                <span className="label">盤のサイズ</span>
                <select
                  value={presetSide}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setPresetSide(n)
                    const list = presetsForSide(n)
                    setSelectedPresetId(list[0]?.id ?? '')
                    setDeductionNotice(null)
                    setHintNotice(null)
                  }}
                >
                  {getAllPresetSides().map((n) => (
                    <option key={n} value={n}>
                      {n}×{n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">問題</span>
                <select
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value)
                    setDeductionNotice(null)
                    setHintNotice(null)
                  }}
                >
                  {presetsForSide(presetSide).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {sourceMode === 'image' && (
            <>
              <label className="field">
                <span className="label">画像</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <label className="field">
                <span className="label">グリッド</span>
                <select
                  value={gridSize}
                  onChange={(e) =>
                    setGridSize(
                      Number(e.target.value) as (typeof GRID_OPTIONS)[number],
                    )
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
            </>
          )}

          {loadError && <p className="error">{loadError}</p>}

          <p className="hint">
            タップで空白 → 黒 → ×。長押し後にドラッグで同じ状態をまとめて塗れます。
            完成は<strong>行・列の数字どおりに黒マスが並んだとき</strong>です（画像の模様と一致しない場合でもヒントどおりなら完成）。
          </p>

          {clueUniqueness === 'multi' && (
            <p className="warn-box">
              この問題は、同じヒントを満たす別の解が存在する可能性があります。論理だけでは元画像どおりに埋められないことがあります。
            </p>
          )}
          {clueUniqueness === 'skipped' && solution && (
            <p className="info-box">
              盤が大きいため、ヒントが1通りに決まるかの自動チェックを省略しています。
            </p>
          )}
          {clueUniqueness === 'unique' && solution && (
            <p className="ok-box">このヒントでは、解は理論上1通りです。</p>
          )}

          <button
            type="button"
            className="deduce-btn"
            onClick={applyDeductions}
            disabled={!cells || !rowHints}
          >
            確定マスを自動入力（論理ヒント）
          </button>

          <button
            type="button"
            className="hint-1-btn"
            onClick={applyOneCellHint}
            disabled={!solution || !cells}
          >
            ヒントを1マス入れる
          </button>
          <p className="hint-1-note">
            論理が難しいとき用です。
            {sourceMode === 'image'
              ? '画像から作った'
              : 'このおまかせ問題の'}
            正解に合わせ、黒か×を1マスだけ自動で入れます（何度でも可）。
          </p>

          <button
            type="button"
            className="reveal-btn"
            onClick={revealSolution}
            disabled={!solution}
          >
            答えを一括表示（テスト用）
          </button>

          {hintNotice && <p className="deduce-notice">{hintNotice}</p>}
          {deductionNotice && (
            <p className="deduce-notice">{deductionNotice}</p>
          )}
        </aside>

        <div className="board-area" ref={boardWrapRef}>
          {!solution && (
            <div className="placeholder">
              {sourceMode === 'image'
                ? '画像を選ぶとここに盤面が表示されます'
                : '問題を読み込み中です…'}
            </div>
          )}
          {solution && cells && rowHints && colHints && (
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
        .deduce-btn {
          width: 100%;
          margin-top: 4px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #2563eb;
          background: #eff6ff;
          color: #1e3a8a;
          font-weight: 700;
          cursor: pointer;
        }
        .deduce-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .hint-1-btn {
          width: 100%;
          margin-top: 8px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #7c3aed;
          background: #f5f3ff;
          color: #4c1d95;
          font-weight: 700;
          cursor: pointer;
        }
        .hint-1-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .hint-1-note {
          margin: 4px 0 0;
          font-size: 0.78rem;
          color: #64748b;
          line-height: 1.4;
        }
        .reveal-btn {
          width: 100%;
          margin-top: 8px;
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
        .deduce-notice {
          margin: 0;
          font-size: 0.82rem;
          color: #475569;
          line-height: 1.45;
        }
        .warn-box {
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fef3c7;
          border: 1px solid #d97706;
          color: #78350f;
          font-size: 0.82rem;
        }
        .info-box {
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #e0f2fe;
          border: 1px solid #0284c7;
          color: #0c4a6e;
          font-size: 0.82rem;
        }
        .ok-box {
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #dcfce7;
          border: 1px solid #16a34a;
          color: #14532d;
          font-size: 0.82rem;
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
