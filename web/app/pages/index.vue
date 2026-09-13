<script setup>
import { Chess } from 'chess.js'

const { ready, info, thinking, last, think } = useFly()
const game = new Chess()
const fen = ref(game.fen())
const human = ref('w')
const selected = ref(null)
const lastMove = ref(null)
const flyMove = ref(null)
const status = ref('')
const history = ref([])
const showKC = ref(true)

/* Stable piece ids so moves animate. Rebuilt from the game after every move; ids follow
 * the piece by tracking from->to of the move just made. */
let nextId = 1
const pieces = ref([])
function syncPieces(move) {
  const onBoard = []
  for (const row of game.board()) for (const p of row) if (p) onBoard.push({ type: p.type, color: p.color, square: p.square })
  if (!pieces.value.length) { pieces.value = onBoard.map((p) => ({ ...p, id: nextId++ })); return }
  const prev = new Map(pieces.value.map((p) => [p.square, p]))
  if (move) {
    const moved = prev.get(move.from)
    if (moved) { prev.delete(move.from); prev.delete(move.to); prev.set(move.to, { ...moved, square: move.to, type: move.promotion ?? moved.type }) }
    if (move.flags?.includes('e')) prev.delete(move.to[0] + move.from[1])          // en passant victim
    if (move.flags?.includes('k') || move.flags?.includes('q')) {                   // castle rook
      const r = move.from[1]
      const [rf, rt] = move.flags.includes('k') ? ['h' + r, 'f' + r] : ['a' + r, 'd' + r]
      const rook = prev.get(rf); if (rook) { prev.delete(rf); prev.set(rt, { ...rook, square: rt }) }
    }
  }
  pieces.value = onBoard.map((p) => ({ ...p, id: prev.get(p.square)?.id ?? nextId++ }))
}
syncPieces()

const legalTo = computed(() => selected.value
  ? game.moves({ square: selected.value, verbose: true }).map((m) => m.to) : [])
const flyColor = computed(() => (human.value === 'w' ? 'b' : 'w'))
const turn = computed(() => { fen.value; return game.turn() })

function updateStatus() {
  if (game.isCheckmate()) status.value = game.turn() === human.value ? 'Checkmate — the fly wins.' : 'Checkmate — you win.'
  else if (game.isDraw()) status.value = game.isStalemate() ? 'Stalemate.' : 'Draw.'
  else if (game.isCheck()) status.value = (game.turn() === human.value ? 'You are' : 'The fly is') + ' in check.'
  else status.value = game.turn() === human.value ? 'Your move.' : 'The fly is thinking…'
}
updateStatus()

async function onSquare(name) {
  if (game.turn() !== human.value || flyMove.value || game.isGameOver()) return
  if (selected.value && legalTo.value.includes(name)) {
    const mv = game.move({ from: selected.value, to: name, promotion: 'q' })
    applyMove(mv); selected.value = null
    await flyTurn()
    return
  }
  const p = game.get(name)
  selected.value = p && p.color === human.value ? name : null
}

function applyMove(mv) {
  syncPieces(mv); fen.value = game.fen(); lastMove.value = { from: mv.from, to: mv.to }
  history.value.push({ n: history.value.length + 1, san: mv.san, by: mv.color === human.value ? 'you' : 'fly' })
  updateStatus()
}

async function flyTurn() {
  if (game.isGameOver() || game.turn() !== flyColor.value) return
  updateStatus()
  const r = await think(game.fen(), flyColor.value)
  if (!r.chosen) return
  const mv = game.move(r.chosen.san)
  const id = pieces.value.find((p) => p.square === mv.from)?.id
  flyMove.value = { id, from: mv.from, to: mv.to, t0: performance.now() }
  await new Promise((res) => setTimeout(res, 1650))
  flyMove.value = null
  applyMove(mv)
}

function newGame(asColor) {
  game.reset(); human.value = asColor; selected.value = null; lastMove.value = null
  history.value = []; pieces.value = []; syncPieces(); fen.value = game.fen(); updateStatus()
  if (asColor === 'b') flyTurn()
}

const cands = computed(() => last.value?.cands ?? [])
const kcGrid = computed(() => {
  const kc = last.value?.kc ?? []
  if (!kc.length) return []
  // 5,177 KCs binned into 400 cells for a 20x20 heat grid
  const cells = new Array(400).fill(0), per = kc.length / 400
  for (let i = 0; i < kc.length; i++) if (kc[i] > 0) cells[Math.floor(i / per)]++
  const mx = Math.max(1, ...cells)
  return cells.map((c) => c / mx)
})
const kcActive = computed(() => last.value?.cands?.[0]?.kcActive ?? 0)
</script>

<template>
  <div class="wrap">
    <BoardScene :pieces="pieces" :selected="selected" :legal-to="legalTo" :last-move="lastMove"
                :fly-move="flyMove" :thinking="thinking" :candidates="thinking || turn === flyColor ? cands : []"
                @square="onSquare" />

    <header class="hud top-left">
      <p class="eyebrow">Fly Chess</p>
      <h1>A fly's learning circuit, taught chess</h1>
      <p class="sub" v-if="info">
        {{ info.n.toLocaleString() }} neurons · {{ info.kc.toLocaleString() }} Kenyon cells ·
        trained on <b>{{ info.games }}</b> games
      </p>
      <p class="sub loading" v-else>loading the mushroom body…</p>
      <p class="status" :class="{ me: turn === human, fly: turn !== human }">{{ status }}</p>
      <div class="btns">
        <button @click="newGame('w')">New game as White</button>
        <button @click="newGame('b')">New game as Black</button>
      </div>
    </header>

    <section class="hud right" v-if="ready">
      <h2>What the fly is thinking</h2>
      <p class="sub" v-if="last">{{ cands.length }} legal moves evaluated · {{ last.ms.toFixed(0) }} ms ·
        <b>{{ (kcActive * 100).toFixed(1) }}%</b> of Kenyon cells active</p>
      <p class="sub" v-else>Every legal move is played on an inner board and run through the
        network. One position, one value. No search.</p>
      <ol class="cands" v-if="cands.length">
        <li v-for="(c, i) in cands.slice(0, 10)" :key="c.san" :class="{ top: i === 0 }">
          <span class="rank">{{ i + 1 }}</span>
          <span class="san">{{ c.san }}<i v-if="c.capture">×</i></span>
          <span class="bar"><i :style="{ width: Math.max(2, 50 + c.value * 40) + '%' }" /></span>
          <span class="val">{{ c.terminal !== null ? (c.terminal > 0 ? 'mate' : 'draw') : c.value.toFixed(3) }}</span>
        </li>
      </ol>
      <div class="kc" v-if="showKC && kcGrid.length">
        <h2>Kenyon cell population <button class="mini" @click="showKC = false">–</button></h2>
        <div class="grid">
          <i v-for="(v, i) in kcGrid" :key="i" :style="{ opacity: 0.08 + v * 0.92 }" />
        </div>
        <p class="sub">the sparse code for the chosen position — 5,177 cells in 400 bins</p>
      </div>
    </section>

    <section class="hud bottom-left" v-if="history.length">
      <h2>Moves</h2>
      <ol class="hist">
        <li v-for="h in history.slice(-14)" :key="h.n" :class="h.by">{{ h.n }}. {{ h.san }}</li>
      </ol>
    </section>

    <footer class="hud bottom-right" v-if="info">
      <p>{{ info.provenance.circuit }}</p>
      <p>{{ info.provenance.connectome }}</p>
      <p class="warn">Only the KC→MBON synapses learn — the fly's own plastic site. The board
        encoder is ours and is declared as engineering. No search tree: one position, one value.</p>
      <p class="warn">{{ info.provenance.license }}</p>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body, #__nuxt { margin: 0; height: 100%; background: #151a1e; }
.wrap { position: relative; height: 100vh; overflow: hidden; color: #e6e1d6;
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
.hud { position: absolute; background: rgba(21, 26, 30, .84); border: 1px solid #2a3238;
  border-radius: 4px; padding: 14px 16px; backdrop-filter: blur(8px); }
.top-left { top: 16px; left: 16px; max-width: 380px; }
.right { top: 16px; right: 16px; width: 330px; max-height: calc(100vh - 32px); overflow-y: auto; }
.bottom-left { bottom: 16px; left: 16px; max-width: 380px; }
.bottom-right { bottom: 16px; right: 16px; max-width: 330px; }
.eyebrow { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: #8a949b; margin: 0 0 8px; }
h1 { font-family: Newsreader, Georgia, serif; font-weight: 500; font-size: 1.45rem; line-height: 1.15; margin: 0 0 8px; }
h2 { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: #8a949b; font-weight: 500; margin: 0 0 10px;
  display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 11.5px; color: #98a3aa; margin: 0; line-height: 1.6; }
.sub b { color: #e6e1d6; }
.loading { color: #d29a4a; }
.status { font-family: Newsreader, Georgia, serif; font-size: 1.25rem; margin: 12px 0 10px; }
.status.me { color: #9fd0b0; } .status.fly { color: #d29a4a; }
.btns { display: flex; gap: 6px; }
.btns button, .mini { font: inherit; font-size: 10px; letter-spacing: .05em; text-transform: uppercase;
  padding: 7px 8px; border-radius: 3px; cursor: pointer; background: #1e262b; color: #98a3aa;
  border: 1px solid #2a3238; transition: .15s; flex: 1; }
.btns button:hover, .mini:hover { color: #e6e1d6; border-color: #6f9d7a; }
.btns button:focus-visible, .mini:focus-visible { outline: 2px solid #6f9d7a; outline-offset: 2px; }
.mini { flex: 0; padding: 2px 8px; }
.cands { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cands li { display: grid; grid-template-columns: 18px 58px 1fr 52px; gap: 8px; align-items: center; font-size: 11px; color: #98a3aa; }
.cands li.top { color: #e6e1d6; }
.cands li.top .san { color: #d29a4a; }
.rank { color: #5f6b72; font-size: 10px; }
.san i { font-style: normal; color: #c2504f; margin-left: 2px; }
.bar { height: 6px; background: #1e262b; border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, #6f9d7a, #d29a4a); border-radius: 2px; transition: width .2s; }
.val { text-align: right; font-variant-numeric: tabular-nums; font-size: 10.5px; }
.kc { margin-top: 14px; }
.grid { display: grid; grid-template-columns: repeat(20, 1fr); gap: 1.5px; margin: 6px 0; }
.grid i { display: block; aspect-ratio: 1; background: #d29a4a; border-radius: 1px; }
.hist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 11px; }
.hist li.you { color: #9fd0b0; } .hist li.fly { color: #d29a4a; }
.bottom-right p { font-size: 9.5px; color: #8a949b; margin: 0 0 5px; line-height: 1.6; }
.warn { color: #98a3aa; }
@media (max-width: 900px) { .right, .bottom-right, .bottom-left { display: none; } .top-left { max-width: calc(100vw - 32px); } }
</style>
