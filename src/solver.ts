/** 行・列ヒントからの整合チェック・多解検出（小〜中盤面向け） */

import type { CellState } from './picross'

/** 行ごとの候補がこれを超えると論理埋めを諦める（フリーズ防止） */
const MAX_LINE_PATTERNS_FOR_DEDUCE = 8000

export function minLengthFromBlocks(blocks: number[], i: number): number {
  if (i >= blocks.length) return 0
  let s = blocks[i]
  if (i + 1 < blocks.length) s += 1 + minLengthFromBlocks(blocks, i + 1)
  return s
}

/** 長さ len でヒント hints に一致する 0/1 行をすべて列挙（[0] のみは空行） */
export function enumerateLines(hints: number[], len: number): boolean[][] {
  if (hints.length === 1 && hints[0] === 0) {
    return [Array.from({ length: len }, () => false)]
  }
  const blocks = hints
  const out: boolean[][] = []

  function dfs(bi: number, pos: number, acc: boolean[]) {
    if (bi === blocks.length) {
      for (let p = pos; p < len; p++) acc[p] = false
      out.push(acc.slice())
      return
    }
    const need = minLengthFromBlocks(blocks, bi)
    for (let start = pos; start + need <= len; start++) {
      for (let p = pos; p < start; p++) acc[p] = false
      for (let p = start; p < start + blocks[bi]; p++) acc[p] = true
      const nextPos = start + blocks[bi] + (bi < blocks.length - 1 ? 1 : 0)
      dfs(bi + 1, nextPos, acc)
    }
  }

  dfs(0, 0, Array(len).fill(false))
  return out
}

/** 確定マス partial と矛盾しないヒント一致行が1つ以上あるか（列の途中判定用） */
export function linePartialFeasible(
  hints: number[],
  len: number,
  partial: (boolean | null)[],
): boolean {
  for (const line of enumerateLines(hints, len)) {
    let ok = true
    for (let i = 0; i < partial.length; i++) {
      if (partial[i] !== null && partial[i] !== line[i]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/**
 * ヒントを満たす解の個数を max 個まで数える（多解判定用）。
 * 行パターン数・探索が大きいときは -1（スキップ）を返す。
 */
export function countSolutionsCapped(
  rowHints: number[][],
  colHints: number[][],
  n: number,
  maxCount: number,
  maxPatternsPerRow = 400,
): number {
  const rowOpts = rowHints.map((h) => enumerateLines(h, n))
  for (const opts of rowOpts) {
    if (opts.length === 0) return 0
    if (opts.length > maxPatternsPerRow) return -1
  }

  let count = 0
  const grid: boolean[][] = Array.from({ length: n }, () =>
    Array(n).fill(false),
  )

  function dfsRow(r: number): void {
    if (count >= maxCount) return
    if (r === n) {
      count++
      return
    }
    for (const pattern of rowOpts[r]) {
      grid[r] = pattern
      let ok = true
      for (let j = 0; j < n; j++) {
        const partial: (boolean | null)[] = Array(n).fill(null)
        for (let i = 0; i <= r; i++) partial[i] = grid[i][j]
        if (!linePartialFeasible(colHints[j], n, partial)) {
          ok = false
          break
        }
      }
      if (ok) dfsRow(r + 1)
      if (count >= maxCount) return
    }
  }

  dfsRow(0)
  return count
}

/**
 * 1行分：ヒントと既知マス（黒=1、×=白、空白=未確定）から、全候補で一致するマスだけ埋める。
 * 候補0件は矛盾、候補過多は null（未対応）。
 */
export function deduceSingleLine(
  hints: number[],
  line: CellState[],
): CellState[] | null {
  const n = line.length
  const patterns = enumerateLines(hints, n)
  if (patterns.length > MAX_LINE_PATTERNS_FOR_DEDUCE) return null

  const partial = line.map((c) =>
    c === 1 ? true : c === 2 ? false : null,
  ) as (boolean | null)[]

  const filtered = patterns.filter((p) => {
    for (let i = 0; i < n; i++) {
      if (partial[i] === true && !p[i]) return false
      if (partial[i] === false && p[i]) return false
    }
    return true
  })
  if (filtered.length === 0) return null

  const result = line.slice()
  for (let i = 0; i < n; i++) {
    if (line[i] !== 0) continue
    const v = filtered[0][i]
    if (filtered.every((p) => p[i] === v)) {
      result[i] = v ? 1 : 2
    }
  }
  return result
}

/**
 * 行→列を交互に論理埋めし、変化がなくなるまで繰り返す。
 * null = 矛盾、または行候補が多すぎて省略。
 */
export function applyLogicalDeductions(
  cells: CellState[][],
  rowHints: number[][],
  colHints: number[][],
): CellState[][] | null {
  const n = cells.length
  let cur = cells.map((r) => r.slice())
  let changed = true
  let rounds = 0
  const maxRounds = n * n + 32

  while (changed && rounds++ < maxRounds) {
    changed = false

    for (let r = 0; r < n; r++) {
      const d = deduceSingleLine(rowHints[r], cur[r])
      if (d === null) return null
      for (let c = 0; c < n; c++) {
        if (cur[r][c] === 0 && d[c] !== 0) {
          cur[r][c] = d[c]
          changed = true
        }
      }
    }

    for (let c = 0; c < n; c++) {
      const colLine = cur.map((row) => row[c])
      const d = deduceSingleLine(colHints[c], colLine)
      if (d === null) return null
      for (let r = 0; r < n; r++) {
        if (cur[r][c] === 0 && d[r] !== 0) {
          cur[r][c] = d[r]
          changed = true
        }
      }
    }
  }

  return cur
}
