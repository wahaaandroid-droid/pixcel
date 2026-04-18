/**
 * 画像なしで遊べるおまかせ問題。
 * '#' または '1' = 黒、'.' または '0' = 白（正方形 n×n）
 */

/** プリセットを用意する盤サイズ（画像モードのグリッド候補と揃える） */
export const PRESET_GRID_SIZES = [
  5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45, 50,
] as const

export type PresetDefinition = {
  id: string
  name: string
  rows: string[]
}

function makeRing(n: number): PresetDefinition {
  const rows: string[] = []
  for (let r = 0; r < n; r++) {
    let line = ''
    for (let c = 0; c < n; c++) {
      line +=
        r === 0 || r === n - 1 || c === 0 || c === n - 1 ? '#' : '.'
    }
    rows.push(line)
  }
  return { id: `ring-${n}`, name: '枠', rows }
}

function makeFrameCross(n: number): PresetDefinition {
  const mid = Math.floor(n / 2)
  const rows: string[] = []
  for (let r = 0; r < n; r++) {
    let line = ''
    for (let c = 0; c < n; c++) {
      const edge = r === 0 || r === n - 1 || c === 0 || c === n - 1
      const cross = r === mid || c === mid
      line += edge || cross ? '#' : '.'
    }
    rows.push(line)
  }
  return { id: `frame-cross-${n}`, name: '枠＋十字', rows }
}

/** 外から何重かの長方形枠 */
function makeNestedFrames(n: number, maxLayers: number): PresetDefinition {
  const g = Array.from({ length: n }, () => Array<string>(n).fill('.'))
  for (let layer = 0; layer < maxLayers; layer++) {
    const o = layer * 2
    if (o > n - 1 - o) break
    for (let r = o; r <= n - 1 - o; r++) {
      for (let c = o; c <= n - 1 - o; c++) {
        if (r === o || r === n - 1 - o || c === o || c === n - 1 - o) {
          g[r][c] = '#'
        }
      }
    }
  }
  return {
    id: `nested-${n}`,
    name: '重ね枠',
    rows: g.map((row) => row.join('')),
  }
}

const MANUAL_PRESETS: PresetDefinition[] = [
  {
    id: 'plus-5',
    name: 'プラス',
    rows: ['..#..', '..#..', '#####', '..#..', '..#..'],
  },
  {
    id: 'diamond-5',
    name: 'ダイヤ',
    rows: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  },
  {
    id: 'smiley-8',
    name: 'スマイル',
    rows: [
      '..####..',
      '.#....#.',
      '#.#..#.#',
      '#......#',
      '#.#..#.#',
      '#..##..#',
      '.#....#.',
      '..####..',
    ],
  },
  {
    id: 'diamond-8',
    name: 'ダイヤ',
    rows: [
      '...##...',
      '..####..',
      '.######.',
      '########',
      '.######.',
      '..####..',
      '...##...',
      '........',
    ],
  },
  {
    id: 'stairs-8',
    name: '階段',
    rows: [
      '#.......',
      '##......',
      '###.....',
      '####....',
      '#####...',
      '######..',
      '#######.',
      '########',
    ],
  },
  {
    id: 'heart-10',
    name: 'ハート',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '##########',
      '.########.',
      '..######..',
      '...####...',
      '....##....',
      '..........',
    ],
  },
  {
    id: 'house-10',
    name: '家',
    rows: [
      '....#.....',
      '...###....',
      '..#####...',
      '.#######..',
      '.#..#..#..',
      '.#..#..#..',
      '.#..#..#..',
      '.#######..',
      '.#.....#..',
      '##########',
    ],
  },
  {
    id: 'mushroom-10',
    name: 'きのこ',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '..######..',
      '....##....',
      '....##....',
      '...####...',
      '...#..#...',
      '...#..#...',
    ],
  },
  {
    id: 'cat-10',
    name: 'ねこ',
    rows: [
      '.##....##.',
      '#..#..#..#',
      '#........#',
      '#.#....#.#',
      '##......##',
      '.#.#..#.#.',
      '..#....#..',
      '...#..#...',
      '....##....',
      '..........',
    ],
  },
  {
    id: 'star-10',
    name: '星',
    rows: [
      '....#.....',
      '....#.....',
      '.#..#..#..',
      '..#####...',
      '...###....',
      '.########.',
      '...###....',
      '..#####...',
      '.#..#..#..',
      '....#.....',
    ],
  },
  {
    id: 'apple-10',
    name: 'りんご',
    rows: [
      '....##....',
      '...####...',
      '..######..',
      '.########.',
      '.########.',
      '.##.##.##.',
      '.########.',
      '..######..',
      '...####...',
      '....##....',
    ],
  },
  {
    id: 'note-12',
    name: '音符',
    rows: [
      '......###...',
      '.....#####..',
      '....#######.',
      '...#########',
      '..##########',
      '.#####...###',
      '..###.....#.',
      '...#........',
      '...#........',
      '...#........',
      '...#........',
      '............',
    ],
  },
  {
    id: 'tree-12',
    name: 'ツリー',
    rows: [
      '......#.....',
      '.....###....',
      '....#####...',
      '...#######..',
      '.....###....',
      '.....###....',
      '.....###....',
      '......#.....',
      '......#.....',
      '.....###....',
      '.....###....',
      '............',
    ],
  },
  {
    id: 'flower-12',
    name: '花',
    rows: [
      '.....#......',
      '...#####....',
      '....###.....',
      '..#######...',
      '...#####....',
      '....###.....',
      '.....#......',
      '.....#......',
      '....###.....',
      '....###.....',
      '....###.....',
      '............',
    ],
  },
]

function ensureEverySizeHasPresets(): PresetDefinition[] {
  for (const p of MANUAL_PRESETS) {
    const n = p.rows.length
    if (!p.rows.every((row) => row.length === n)) {
      throw new Error(`preset ${p.id} must be square`)
    }
  }

  const out: PresetDefinition[] = [...MANUAL_PRESETS]

  for (const n of PRESET_GRID_SIZES) {
    if (n >= 25) {
      out.push(makeRing(n), makeFrameCross(n))
      continue
    }

    let forN = out.filter((p) => p.rows.length === n)
    if (forN.length === 0) {
      const layers = Math.max(1, Math.min(5, Math.floor(n / 3)))
      out.push(makeNestedFrames(n, layers))
    }

    forN = out.filter((p) => p.rows.length === n)
    if (!forN.some((p) => p.id === `ring-${n}`)) {
      out.push(makeRing(n))
    }
  }

  for (const n of PRESET_GRID_SIZES) {
    if (!out.some((p) => p.rows.length === n)) {
      out.push(makeRing(n))
    }
  }

  return out
}

export const PRESETS: PresetDefinition[] = ensureEverySizeHasPresets()

export function presetsForSide(n: number): PresetDefinition[] {
  return PRESETS.filter(
    (p) => p.rows.length === n && p.rows.every((row) => row.length === n),
  )
}

export function getAllPresetSides(): number[] {
  const s = new Set(PRESETS.map((p) => p.rows.length))
  return [...s].sort((a, b) => a - b)
}

export function presetToGrid(preset: PresetDefinition): boolean[][] {
  const w = preset.rows[0]?.length
  if (!w) throw new Error('empty preset')
  return preset.rows.map((line, ri) => {
    if (line.length !== w) {
      throw new Error(`preset ${preset.id} row ${ri} width mismatch`)
    }
    return [...line].map((ch) => ch === '#' || ch === '1' || ch === 'O')
  })
}
