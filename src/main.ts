import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'

// ─── Canvas constants ────────────────────────────────────────────────────────
const W = 576
const H = 288
const FONT_SIZE = 14
const COL_COUNT  = 40
const COL_WIDTH  = W / COL_COUNT
const ROW_COUNT  = Math.ceil(H / FONT_SIZE)

// ─── Glasses text-rain constants ───────────────────────────────────────────────
const G_COLS = 32   // characters per row on the G2 lens
const G_ROWS = 8    // rows visible on the lens

// ─── 4-bit greyscale-green palette ───────────────────────────────────────────────
function greenShade(level: number): string {
  const v = Math.round((level / 15) * 255)
  return `rgb(${Math.round(v * 0.05)},${v},${Math.round(v * 0.12)})`
}

// ─── Character sets ───────────────────────────────────────────────────────────
const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'
const LATIN    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&'
const CHARS    = KATAKANA + LATIN
function rndChar(): string { return CHARS[Math.floor(Math.random() * CHARS.length)] }

// ─── Weather state ────────────────────────────────────────────────────────────
const LAT = 38.8916
const LNG = -121.293
let currentTempF = '--'
let sunriseStr   = '--:-- --'
let sunsetStr    = '--:-- --'

async function fetchWeather(): Promise<void> {
  try {
    const d = await (await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current_weather=true&temperature_unit=fahrenheit`
    )).json()
    if (d?.current_weather?.temperature !== undefined)
      currentTempF = Math.round(d.current_weather.temperature).toString()
  } catch { /* keep last value */ }
}

async function fetchSunTimes(): Promise<void> {
  try {
    const d = await (await fetch(
      `https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LNG}&formatted=0`
    )).json()
    if (d?.results) {
      sunriseStr = toLocal12h(d.results.sunrise)
      sunsetStr  = toLocal12h(d.results.sunset)
    }
  } catch { /* keep last value */ }
}

function toLocal12h(utcString: string): string {
  return new Date(utcString).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Los_Angeles',
  })
}

function getCurrentTime12h(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Los_Angeles',
  })
}

// ─── Drop — one falling streak ─────────────────────────────────────────────────────
interface Drop {
  head: number; speed: number; trailLen: number
  pauseTimer: number; nextPause: number
}

function makeDrop(head: number): Drop {
  return { head, speed: 1.6 + Math.random() * 3.4, trailLen: 6 + Math.floor(Math.random() * 8),
           pauseTimer: 0, nextPause: 5 + Math.random() * 14 }
}

// ─── Column — two drops, shared char buffer ───────────────────────────────────────────
interface Column {
  x: number; chars: string[]; brightness: number[]; drops: [Drop, Drop]
}

function makeColumn(x: number, idx: number): Column {
  const chars      = Array.from({ length: ROW_COUNT }, rndChar)
  const brightness = new Array<number>(ROW_COUNT).fill(0)
  const offset     = (idx % 2) * (ROW_COUNT / 2)
  const d0 = makeDrop(Math.random() * ROW_COUNT - offset)
  const d1 = makeDrop(d0.head - ROW_COUNT * 0.55 - Math.random() * 4)
  return { x, chars, brightness, drops: [d0, d1] }
}

const columns = Array.from({ length: COL_COUNT }, (_, i) =>
  makeColumn(i * COL_WIDTH + COL_WIDTH / 2, i)
)
const charTimers = columns.map(() => Math.random() * 0.1)
const charRates  = columns.map(() => 0.05 + Math.random() * 0.1)

// ─── Ghost info system ──────────────────────────────────────────────────────────
type GhostPhase = 'rain' | 'morphIn' | 'hold' | 'morphOut' | 'gap'
interface GhostState {
  phase: GhostPhase; infoIndex: number; phaseTimer: number
  morphProgress: number[]; frozenChars: string[][]
}

const MORPH_IN_DUR  = 1.5
const HOLD_DUR      = 15.0
const MORPH_OUT_DUR = 1.5
const GAP_DUR       = 3.0
const CYCLE_SEC     = 150.0

const GHOST_START = 10
const GHOST_END   = 30
const GHOST_COUNT = GHOST_END - GHOST_START

const ghost: GhostState = {
  phase: 'rain', infoIndex: 0, phaseTimer: 0,
  morphProgress: [], frozenChars: [],
}
let textMap: (string | null)[][] = []
let cycleTimer = CYCLE_SEC

function buildTextMap(lines: string[]): (string | null)[][] {
  const map = Array.from({ length: GHOST_COUNT }, () =>
    new Array<string | null>(ROW_COUNT).fill(null)
  )
  const lineStartRow = Math.floor(ROW_COUNT / 2) - Math.floor(lines.length / 2)
  for (let li = 0; li < lines.length; li++) {
    const row = lineStartRow + li
    if (row < 0 || row >= ROW_COUNT) continue
    const startCol = Math.round((GHOST_COUNT - lines[li].length) / 2)
    for (let ci = 0; ci < lines[li].length; ci++) {
      const col = startCol + ci
      if (col >= 0 && col < GHOST_COUNT) map[col][row] = lines[li][ci]
    }
  }
  return map
}

function getInfoLines(idx: number): string[] {
  switch (idx) {
    case 0: return [getCurrentTime12h()]
    case 1: return [`${currentTempF}\u00b0F`]
    case 2: return [`\u2191 ${sunriseStr}`, `\u2193 ${sunsetStr}`]
    default: return []
  }
}

function ghostStyle(infoIndex: number): { bri: number; size: number; weight: string } {
  if (infoIndex === 1) return { bri: 8, size: FONT_SIZE + 1, weight: '400' }
  return { bri: 15, size: FONT_SIZE + 8, weight: 'bold' }
}

function captureGhostChars(): void {
  for (let i = 0; i < GHOST_COUNT; i++)
    ghost.frozenChars[i] = columns[GHOST_START + i].chars.slice()
}

function beginMorphIn(idx: number): void {
  ghost.infoIndex    = idx
  ghost.phase        = 'morphIn'
  ghost.phaseTimer   = 0
  ghost.morphProgress = new Array(GHOST_COUNT).fill(0)
  textMap = buildTextMap(getInfoLines(idx))
  captureGhostChars()
}

// ─── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement
const ctx    = canvas.getContext('2d')!
ctx.textAlign    = 'center'
ctx.textBaseline = 'middle'

let paused   = false
let lastTime: number | null = null

// ─── Glasses text-rain state ───────────────────────────────────────────────────────
const gColumns = Array.from({ length: G_COLS }, () => ({
  cells: Array(G_ROWS).fill(' ') as string[],
  speed: 1 + Math.floor(Math.random() * 3),
  tick:  Math.floor(Math.random() * 3),
  on:    Math.random() > 0.35,
}))

function stepGlassesColumns(): void {
  gColumns.forEach(col => {
    if (!col.on) {
      if (Math.random() < 0.02) { col.on = true; col.speed = 1 + Math.floor(Math.random() * 3) }
      return
    }
    if (++col.tick < col.speed) return
    col.tick = 0
    for (let r = G_ROWS - 1; r > 0; r--) col.cells[r] = col.cells[r - 1]
    col.cells[0] = Math.random() < 0.88 ? rndChar() : ' '
    if (Math.random() < 0.025) {
      col.on = false
      col.cells.fill(' ')
      col.speed = 1 + Math.floor(Math.random() * 3)
    }
  })
}

function buildGlassesText(): string {
  stepGlassesColumns()
  const rows: string[] = []
  for (let r = 0; r < G_ROWS; r++) {
    rows.push(gColumns.map(c => c.cells[r]).join(''))
  }
  // Stamp time into the centre row so it’s always readable through the rain
  const t   = getCurrentTime12h()
  const mid = Math.floor(G_ROWS / 2)
  const s   = Math.floor((G_COLS - t.length) / 2)
  rows[mid] = rows[mid].slice(0, s) + t + rows[mid].slice(s + t.length)
  return rows.join('\n')
}

// ─── Glasses bridge ─────────────────────────────────────────────────────────────
let gBridge: any = null  // eslint-disable-line @typescript-eslint/no-explicit-any
let glassesReady = false

async function initGlassesDisplay(): Promise<void> {
  try {
    const result = await gBridge.createStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [{
        xPosition: 0, yPosition: 0, width: 576, height: 288,
        containerID: 1, containerName: 'main',
        content: buildGlassesText(),
        borderWidth: 0, borderColor: 0, paddingLength: 8,
        isEventCapture: 1,
      }],
    })

    if (result === 0) {
      glassesReady = true
      console.log('[matrixrain1.1] Glasses display ready')

      // Push a new matrix-rain frame to the lens every 150 ms (~6-7 fps)
      setInterval(async () => {
        if (!glassesReady) return
        try {
          await gBridge.textContainerUpgrade({
            containerID: 1,
            containerName: 'main',
            content: buildGlassesText(),
            contentOffset: 0,
            contentLength: 500,
          })
        } catch { /* skip failed frame */ }
      }, 150)
    } else {
      console.warn('[matrixrain1.1] createStartUpPageContainer returned:', result)
    }
  } catch (e) {
    console.warn('[matrixrain1.1] Glasses init failed:', e)
  }
}

// ─── Update: canvas columns ─────────────────────────────────────────────────────
function updateDrop(drop: Drop, dt: number): void {
  if (drop.pauseTimer > 0) {
    drop.pauseTimer -= dt
    if (drop.pauseTimer < 0) { drop.pauseTimer = 0; drop.nextPause = 5 + Math.random() * 14 }
    return
  }
  drop.head += drop.speed * dt
  if (drop.head >= 0 && drop.head <= ROW_COUNT) {
    drop.nextPause -= dt
    if (drop.nextPause <= 0) drop.pauseTimer = 0.3 + Math.random() * 1.0
  }
  if (drop.head - drop.trailLen > ROW_COUNT) {
    drop.head = -(0.5 + Math.random() * 2.0)
    drop.speed    = 1.6 + Math.random() * 3.4
    drop.trailLen = 6 + Math.floor(Math.random() * 8)
    drop.nextPause = 5 + Math.random() * 14
  }
}

function dropBri(drop: Drop, row: number): number {
  const dist = drop.head - row
  if (dist < 0 || dist > drop.trailLen) return 0
  if (dist < 0.5) return 14 + (Math.random() < 0.5 ? 1 : 0)
  const t = dist / drop.trailLen
  return Math.max(1, Math.round((1 - t) * (1 - t) * 10 + 1))
}

function updateColumns(dt: number): void {
  for (let i = 0; i < COL_COUNT; i++) {
    const col = columns[i]

    charTimers[i] -= dt
    if (charTimers[i] <= 0) {
      const r       = Math.floor(Math.random() * ROW_COUNT)
      const li      = i - GHOST_START
      const isHeld  = (ghost.phase === 'hold' || ghost.phase === 'gap')
                      && li >= 0 && li < GHOST_COUNT && textMap[li]?.[r] !== null
      if (!isHeld) col.chars[r] = rndChar()
      charTimers[i] = charRates[i]
    }

    updateDrop(col.drops[0], dt)
    updateDrop(col.drops[1], dt)

    for (let r = 0; r < ROW_COUNT; r++) {
      const ambient = Math.random() < 0.002 ? 1 : 0
      col.brightness[r] = Math.max(dropBri(col.drops[0], r), dropBri(col.drops[1], r), ambient)
    }
  }
}

// ─── Update: ghost ──────────────────────────────────────────────────────────────
function updateGhost(dt: number): void {
  if (ghost.phase === 'rain') {
    cycleTimer -= dt
    if (cycleTimer <= 0) beginMorphIn(0)
    return
  }

  ghost.phaseTimer += dt

  if (ghost.phase === 'morphIn') {
    const t = Math.min(ghost.phaseTimer / MORPH_IN_DUR, 1)
    for (let i = 0; i < GHOST_COUNT; i++) {
      const off = (i / GHOST_COUNT) * 0.35
      ghost.morphProgress[i] = Math.max(0, Math.min(1, (t - off) / 0.65))
    }
    if (ghost.phaseTimer >= MORPH_IN_DUR) {
      ghost.phase = 'hold'; ghost.phaseTimer = 0; ghost.morphProgress.fill(1)
    }
  } else if (ghost.phase === 'hold') {
    if (ghost.phaseTimer >= HOLD_DUR) { ghost.phase = 'morphOut'; ghost.phaseTimer = 0 }
  } else if (ghost.phase === 'morphOut') {
    const t = Math.min(ghost.phaseTimer / MORPH_OUT_DUR, 1)
    for (let i = 0; i < GHOST_COUNT; i++) {
      const off = (i / GHOST_COUNT) * 0.35
      ghost.morphProgress[i] = Math.max(0, Math.min(1, 1 - (t - off) / 0.65))
    }
    if (ghost.phaseTimer >= MORPH_OUT_DUR) {
      ghost.infoIndex++
      if (ghost.infoIndex >= 3) { ghost.phase = 'rain'; cycleTimer = CYCLE_SEC }
      else { ghost.phase = 'gap'; ghost.phaseTimer = 0 }
    }
  } else if (ghost.phase === 'gap') {
    if (ghost.phaseTimer >= GAP_DUR) beginMorphIn(ghost.infoIndex)
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function drawFrame(): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const ghostActive = ghost.phase !== 'rain'
  const style       = ghostActive ? ghostStyle(ghost.infoIndex) : null

  for (let i = 0; i < COL_COUNT; i++) {
    const col      = columns[i]
    const li       = i - GHOST_START
    const isGhost  = ghostActive && li >= 0 && li < GHOST_COUNT
    const morphP   = isGhost ? (ghost.morphProgress[li] ?? 0) : 0

    for (let r = 0; r < ROW_COUNT; r++) {
      const x = col.x
      const y = r * FONT_SIZE + FONT_SIZE / 2

      if (isGhost && style) {
        const textChar = textMap[li]?.[r] ?? null

        if (textChar !== null) {
          if (morphP >= 1) {
            ctx.font      = `${style.weight} ${style.size}px monospace`
            ctx.fillStyle = greenShade(style.bri)
            ctx.fillText(textChar, x, y)
            ctx.font      = `${FONT_SIZE}px monospace`
          } else if (morphP > 0) {
            const locked = Math.random() < morphP * morphP
            if (locked) {
              const bri  = Math.round(style.bri * 0.5 + morphP * style.bri * 0.5)
              const size = FONT_SIZE + Math.round(morphP * (style.size - FONT_SIZE))
              ctx.font      = `${style.weight} ${size}px monospace`
              ctx.fillStyle = greenShade(bri)
              ctx.fillText(textChar, x, y)
              ctx.font      = `${FONT_SIZE}px monospace`
            } else {
              const b = col.brightness[r]
              if (b > 0) { ctx.fillStyle = greenShade(b); ctx.fillText(col.chars[r], x, y) }
            }
          } else {
            const b = col.brightness[r]
            if (b > 0) { ctx.fillStyle = greenShade(b); ctx.fillText(col.chars[r], x, y) }
          }
        } else {
          const b = Math.round(col.brightness[r] * (1 - morphP * 0.65))
          if (b > 0) { ctx.fillStyle = greenShade(b); ctx.fillText(col.chars[r], x, y) }
        }
      } else {
        const b = col.brightness[r]
        if (b > 0) { ctx.fillStyle = greenShade(b); ctx.fillText(col.chars[r], x, y) }
      }
    }
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function tick(now: number): void {
  if (paused) { lastTime = null; requestAnimationFrame(tick); return }
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  updateColumns(dt)
  updateGhost(dt)
  drawFrame()
  requestAnimationFrame(tick)
}

// ─── Init ───────────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  ctx.font = `${FONT_SIZE}px monospace`

  await Promise.all([fetchWeather(), fetchSunTimes()])
  setInterval(() => { fetchWeather(); fetchSunTimes() }, 10 * 60 * 1000)

  try {
    gBridge = await waitForEvenAppBridge()

    gBridge.onEvenHubEvent((event: { sysEvent?: { eventType?: number } }) => {
      const isImu = event.sysEvent?.eventType === OsEventTypeList.IMU_DATA_REPORT
      if (event.sysEvent && !isImu) {
        paused = !paused
        if (!paused) lastTime = null
      }
    })

    await initGlassesDisplay()
  } catch {
    /* dev mode — no bridge, canvas only */
  }

  requestAnimationFrame(tick)
}

init()
