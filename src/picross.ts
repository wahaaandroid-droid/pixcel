export type CellState = 0 | 1 | 2

export function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114
}

/** true = 塗り（黒）セル */
export function imageToSolutionGrid(
  img: CanvasImageSource,
  size: number,
  threshold: number,
): boolean[][] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unsupported')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const grid: boolean[][] = []
  for (let y = 0; y < size; y++) {
    const row: boolean[] = []
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const L = luminance(data[i], data[i + 1], data[i + 2])
      row.push(L < threshold)
    }
    grid.push(row)
  }
  return grid
}

export function lineHints(line: boolean[]): number[] {
  const hints: number[] = []
  let run = 0
  for (const cell of line) {
    if (cell) run++
    else if (run > 0) {
      hints.push(run)
      run = 0
    }
  }
  if (run > 0) hints.push(run)
  return hints.length ? hints : [0]
}

export function columnHints(grid: boolean[][], col: number): number[] {
  const line = grid.map((row) => row[col])
  return lineHints(line)
}

export function maxHintCount(hints: number[][]): number {
  return hints.reduce((m, h) => Math.max(m, h.length), 0)
}

export function createEmptyGrid(n: number): CellState[][] {
  return Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0 as CellState),
  )
}

export function nextStateFull(s: CellState): CellState {
  return s === 0 ? 1 : s === 1 ? 2 : 0
}

/** ×モード用：空白⇔×。黒は一度タップで空白に戻す */
export function nextStateXMode(s: CellState): CellState {
  if (s === 1) return 0
  return s === 0 ? 2 : 0
}

export function nextStateForLongPress(
  s: CellState,
  xMode: boolean,
): CellState {
  return xMode ? nextStateXMode(s) : nextStateFull(s)
}

export function isSolved(
  solution: boolean[][],
  cells: CellState[][],
): boolean {
  const n = solution.length
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const sol = solution[r][c]
      const u = cells[r][c]
      if (sol && u !== 1) return false
      if (!sol && u === 1) return false
    }
  }
  return true
}

/** プレイヤーの黒マスだけを見た二値グリッド（空白・×は白扱い） */
export function cellsToFilledGrid(cells: CellState[][]): boolean[][] {
  return cells.map((row) => row.map((c) => c === 1))
}

function hintsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * 完成判定：画像の「答え」とは独立し、行・列ヒントと一致する塗りなら完成。
 * （自動生成で多解のときも、ヒントどおり埋めれば完成になる）
 */
export function isCompleteByHints(
  rowHints: number[][],
  colHints: number[][],
  cells: CellState[][],
): boolean {
  const g = cellsToFilledGrid(cells)
  const n = g.length
  for (let r = 0; r < n; r++) {
    if (!hintsEqual(lineHints(g[r]), rowHints[r])) return false
  }
  for (let c = 0; c < n; c++) {
    const col = g.map((row) => row[c])
    if (!hintsEqual(lineHints(col), colHints[c])) return false
  }
  return true
}
