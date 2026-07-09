// ===================== POKER RACE — APP CONTROLLER (V2) =====================

const KART_COLORS = ['yellow', 'blue', 'green', 'red'];
const KART_LABEL = { yellow: 'Amarelo', blue: 'Azul', green: 'Verde', red: 'Vermelho' };

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const delay = ms => new Promise(res => setTimeout(res, ms));

let state = null;
let selectedDiscards = new Set();
let humanDrawResolver = null;
let humanBetResolver = null;
let humanZeroResolver = null;
let tokenElements = new Map(); // player -> its persistent <img> kart token element
const HOLDEM_STARTING_CHIPS = 2000; // in-race betting bankroll (funny money, not real coins)

// ---------------- Coins (persisted for the human player only) ----------------
const COINS_KEY = 'pokerrace_coins_v2';
function loadCoins() {
  const v = localStorage.getItem(COINS_KEY);
  const n = v !== null ? parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function saveCoins(n) { localStorage.setItem(COINS_KEY, String(Math.max(0, n))); }
let playerCoins = loadCoins();
function addPlayerCoins(delta) {
  playerCoins = Math.max(0, playerCoins + delta);
  saveCoins(playerCoins);
  updateCoinsDisplay();
}

// ---------------- Names (persisted so they're remembered next time you play) ----------------
const NAMES_KEY = 'pokerrace_names_v1';
function loadNames() {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}');
    return (v && typeof v === 'object') ? v : {};
  } catch (e) { return {}; }
}
function saveNames(names) { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); }
let savedNames = loadNames(); // { player: 'Edson', yellow: 'Fulano', blue: '...', ... }
function updateCoinsDisplay() {
  $$('.coins-value').forEach(el => el.textContent = playerCoins);
  const holdemBtn = document.getElementById('modeHoldemBtn');
  if (holdemBtn) {
    const locked = playerCoins < 1000;
    holdemBtn.classList.toggle('locked', locked);
    holdemBtn.title = locked ? 'Requer 1.000 moedas para jogar Texas Hold\'em' : '';
  }
}

const DRAW_PAYOUT = { 1: 100, 2: 50, 3: 25, 4: 0 };
const HOLDEM_MULTIPLIER = { 1: 3, 2: 2, 3: 1, 4: 0 };

// ---------------- Setup screen ----------------
let setupBots = 2;
let setupColor = 'yellow';
let setupMode = 'draw'; // 'draw' | 'holdem'

function initSetupScreen() {
  const botRow = $('#botCountChoices');
  botRow.innerHTML = '';
  [1, 2, 3].forEach(n => {
    const b = document.createElement('button');
    b.className = 'choice-btn' + (n === setupBots ? ' active' : '');
    b.textContent = n + (n === 1 ? ' bot' : ' bots');
    b.onclick = () => { setupBots = n; initSetupScreen(); };
    botRow.appendChild(b);
  });

  const colorRow = $('#kartColorChoices');
  colorRow.innerHTML = '';
  KART_COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'kart-choice' + (c === setupColor ? ' active' : '');
    b.style.setProperty('--kart-glow', `var(--${c})`);
    b.innerHTML = `<span class="kart-hex"><img src="kart_${c}_token.png" alt="${KART_LABEL[c]}"></span><span class="kart-label">${KART_LABEL[c]}</span>`;
    b.onclick = () => { setupColor = c; initSetupScreen(); };
    colorRow.appendChild(b);
  });

  const modeRow = $('#modeChoices');
  modeRow.innerHTML = '';
  [['draw', '5-Card Draw'], ['holdem', "Texas Hold'em"]].forEach(([val, label]) => {
    const b = document.createElement('button');
    const locked = val === 'holdem' && playerCoins < 1000;
    b.className = 'choice-btn' + (val === setupMode ? ' active' : '') + (locked ? ' locked' : '');
    b.id = val === 'holdem' ? 'modeHoldemBtn' : '';
    b.innerHTML = label + (locked ? '<br><small>🔒 requer 1.000 moedas</small>' : '');
    b.onclick = () => {
      if (locked) { alert("Texas Hold'em precisa de pelo menos 1.000 moedas de saldo. Jogue 5-Card Draw para ganhar moedas!"); return; }
      setupMode = val; initSetupScreen();
    };
    modeRow.appendChild(b);
  });

  // ---- Names: yours, plus one per currently-selected bot slot ----
  const nameInput = $('#playerNameInput');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = savedNames.player || '';
  if (nameInput) {
    nameInput.oninput = () => {
      savedNames.player = nameInput.value.trim();
      saveNames(savedNames);
    };
  }

  const botColors = KART_COLORS.filter(c => c !== setupColor).slice(0, setupBots);
  const botNamesBox = $('#botNameInputs');
  botNamesBox.innerHTML = '';
  botColors.forEach(c => {
    const wrap = document.createElement('div');
    wrap.className = 'bot-name-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = `Bot ${KART_LABEL[c]}`;
    input.value = savedNames[c] || '';
    input.oninput = () => { savedNames[c] = input.value.trim(); saveNames(savedNames); };
    wrap.innerHTML = `<img src="kart_${c}_token.png" alt="${KART_LABEL[c]}">`;
    wrap.appendChild(input);
    botNamesBox.appendChild(wrap);
  });

  updateCoinsDisplay();
}

function createPlayers(numBots, humanColor) {
  const others = KART_COLORS.filter(c => c !== humanColor);
  const players = [{
    id: 0, name: (savedNames.player && savedNames.player.trim()) || 'Você', color: humanColor, isHuman: true,
    position: 0, hand: [], holeCards: [], discardedCount: 0, revealed: false, evalResult: null,
    betCoins: HOLDEM_STARTING_CHIPS, bettingActive: false, zeroCount: 0, raceWinnings: 0, folded: false, streetBet: 0
  }];
  for (let i = 0; i < numBots; i++) {
    const color = others[i];
    const customName = savedNames[color] && savedNames[color].trim();
    players.push({
      id: i + 1, name: customName || `Bot ${KART_LABEL[color]}`, color, isHuman: false,
      position: 0, hand: [], holeCards: [], discardedCount: 0, revealed: false, evalResult: null,
      betCoins: HOLDEM_STARTING_CHIPS, bettingActive: false, zeroCount: 0, raceWinnings: 0, folded: false, streetBet: 0
    });
  }
  return players;
}

// ---------------- Rendering: board ----------------
function initBoard() {
  return new Promise(resolve => {
    tokenElements = new Map();
    $('#boardContainer').innerHTML = `
      <img id="boardImage" src="board_start.jpg" alt="Tabuleiro Poker Race" draggable="false">
      <div id="tokenLayer"></div>`;
    const img = document.getElementById('boardImage');
    if (img.complete && img.naturalWidth > 0) {
      resolve();
    } else {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    }
  });
}

// Swaps from the start-line splash art to the live race background — called once when the
// very first round actually begins (green light moment).
function switchToRaceBoard() {
  const img = document.getElementById('boardImage');
  if (img) img.src = 'board_bg.jpg';
}

function initCommunitySlots() {
  const label = document.getElementById('communityPanelLabel');
  if (label) label.textContent = state.mode === 'holdem' ? 'Cartas comunitárias' : 'Melhor mão da rodada';
  const row = document.getElementById('communityCardsRow');
  if (!row) return;
  row.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const div = document.createElement('div');
    div.className = 'community-slot';
    div.id = 'community-slot-' + i;
    row.appendChild(div);
  }
}

function updateCommunitySlots(cards) {
  for (let i = 0; i < 5; i++) {
    const el = document.getElementById('community-slot-' + i);
    if (!el) continue;
    const card = cards ? cards[i] : null;
    if (!card) {
      el.innerHTML = '';
      el.classList.remove('has-card');
    } else {
      el.classList.add('has-card');
      el.innerHTML = `<span class="cc-rank" style="color:${SUIT_COLOR[card.suit]}">${rankLabel(card.rank)}</span>
        <span class="cc-suit" style="color:${SUIT_COLOR[card.suit]}">${SUIT_SYMBOL[card.suit]}</span>`;
    }
  }
}

function renderTokens() {
  const layer = document.getElementById('tokenLayer');
  if (!layer) return;

  const groups = {};
  state.players.forEach(p => {
    const clamped = Math.max(0, Math.min(p.position, 100));
    // Group by the physical cell on the loop, not the raw absolute position — two karts on
    // different laps can land on the same visual cell and need to share it like any other
    // collision, not silently stack on top of each other.
    const visualKey = clamped === 0 ? 0 : cellInLap(clamped);
    (groups[visualKey] = groups[visualKey] || []).push(p);
  });

  // Cars share a lane side-by-side, perpendicular to the direction of travel. Offsets below
  // are scaled from the old board's tuned values to match the new board's much larger cells —
  // scaled per-axis (not by a single blended factor) since the new board's width/height aspect
  // ratio differs from the old one, so a %-of-width value and a %-of-height value need different
  // scale factors to represent the same physical proportion. Target: ~12% kart overlap, same as
  // the old board (verified: 2*halfH vs kart height comes out to ~11.8% overlap).
  const halfW = 2.79, halfH = 4.14;     // primary separation axis (% of board width / height)
  const jitterW = 2.37, jitterH = 3.51; // secondary axis, used only for 3-4 karts sharing a cell

  const OFFSETS_V = {
    1: [[0, 0]],
    2: [[-halfW, 0], [halfW, 0]],
    3: [[-halfW, -jitterH], [halfW, -jitterH], [0, jitterH]],
    4: [[-halfW, -jitterH], [halfW, -jitterH], [-halfW, jitterH], [halfW, jitterH]]
  };
  const OFFSETS_H = {
    1: [[0, 0]],
    2: [[0, -halfH], [0, halfH]],
    3: [[-jitterW, -halfH], [-jitterW, halfH], [jitterW, 0]],
    4: [[-jitterW, -halfH], [jitterW, -halfH], [-jitterW, halfH], [jitterW, halfH]]
  };
  // The starting grid (casa 0) keeps the 4 cars in a tight 2x2 cluster, like a real starting
  // grid. The "rear" column (closer to cell 25) sits slightly less far out than the "front"
  // column, so its cars clear the cell-25 boundary line instead of touching it.
  const START_GRID_SLOTS = [
    [-5.46, -4.25], [4.7, -4.25], [-5.46, 4.3], [4.7, 4.3]
  ];

  const seen = new Set();
  Object.keys(groups).forEach(cellNum => {
    const n = parseInt(cellNum, 10);
    const group = groups[cellNum];
    const center = cellCenterPercent(n);
    const heading = cellHeadingDeg(n);
    let offs;
    if (n !== 0) {
      const table = cellOrientationForOffsets(n) === 'h' ? OFFSETS_H : OFFSETS_V;
      offs = table[group.length] || table[4];
    }
    group.forEach((p, i) => {
      // At casa 0, each player keeps a FIXED quadrant slot (based on their fixed spot in
      // state.players) instead of being renumbered into a different N-kart pattern whenever
      // someone else moves away — otherwise the remaining cars visibly reshuffle into a
      // completely different formation instead of just leaving a gap behind.
      const [dx, dy] = n === 0 ? START_GRID_SLOTS[state.players.indexOf(p) % 4] : offs[i];
      // Reuse the same <img> element across renders instead of tearing it down and
      // recreating it every frame — that destroy/recreate cycle, happening up to 4x
      // simultaneously during movement animation, was what made karts visually skip cells.
      let img = tokenElements.get(p);
      if (!img) {
        img = document.createElement('img');
        img.src = `kart_${p.color}_token.png`;
        img.title = p.name;
        tokenElements.set(p, img);
      }
      img.className = 'kart-token' + (p.isHuman ? ' is-human' : '');
      if (p.isHuman) img.style.setProperty('--human-glow', `var(--${p.color})`);
      img.style.left = (center.x + dx) + '%';
      img.style.top = (center.y + dy) + '%';
      img.style.transform = `translate(-50%,-50%) rotate(${heading}deg)`;
      if (img.parentNode !== layer) layer.appendChild(img);
      seen.add(p);
    });
  });
  // Clean up tokens for players no longer on the board (shouldn't normally happen, but
  // keeps tokenElements from leaking stale entries across restarts).
  tokenElements.forEach((img, p) => {
    if (!seen.has(p)) { img.remove(); tokenElements.delete(p); }
  });
}

function cellOrientationForOffsets(num) {
  const deg = cellHeadingDeg(num);
  return (deg === 0 || deg === 180) ? 'h' : 'v';
}

// ---------------- Rendering: players strip ----------------
function renderPlayers() {
  const strip = $('#playersStrip');
  strip.innerHTML = '';
  const sorted = state.players.slice().sort((a, b) => b.position - a.position);
  sorted.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-chip' + (p.isHuman ? ' human' : '');
    const avatarHtml = `<img class="chip-kart" src="kart_${p.color}_token.png">`;
    let statusHtml = '';
    if (p.folded) {
      statusHtml = `<div class="chip-hand muted">desistiu (fold)</div>`;
    } else if (p.revealed && p.evalResult) {
      const revealedCards = state.mode === 'holdem' ? p.holeCards : p.hand;
      const miniCardsHtml = (revealedCards || []).map(c => `
        <span class="mini-card" style="color:${SUIT_COLOR[c.suit]}">${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}</span>
      `).join('');
      statusHtml = `<div class="chip-hand">${p.evalResult.name}</div><div class="chip-cards">${miniCardsHtml}</div>`;
    } else if (state.mode === 'draw' && p.discardedCount === null) {
      statusHtml = `<div class="chip-hand muted">pensando…</div>`;
    } else {
      statusHtml = `<div class="chip-hand muted">pronto</div>`;
    }
    const clamped = Math.min(p.position, 100);
    const posLabel = clamped <= 0 ? 'Casa 0' : `Casa ${cellInLap(clamped)} · V${lapOf(clamped)}/4`;
    let bankHtml = '';
    if (state.mode === 'holdem') {
      const delta = p.betCoins - HOLDEM_STARTING_CHIPS;
      const sign = delta > 0 ? '+' : '';
      const deltaCls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
      bankHtml = `<div class="chip-bank">🪙 ${p.betCoins} <span class="chip-delta ${deltaCls}">${delta !== 0 ? `(${sign}${delta})` : ''}</span></div>`;
    }
    card.innerHTML = `
      ${avatarHtml}
      <div class="chip-info">
        <div class="chip-name">${p.name}</div>
        <div class="chip-pos">${posLabel}</div>
        ${bankHtml}
        ${statusHtml}
      </div>`;
    strip.appendChild(card);
  });
}

// ---------------- Hint: probability-based discard suggestion (5-card draw) ----------------
function sampleDistinct(pool, k) {
  const usedIdx = new Set();
  const out = [];
  while (out.length < k) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!usedIdx.has(idx)) { usedIdx.add(idx); out.push(pool[idx]); }
  }
  return out;
}

// Folds a full tiebreak array (e.g. [pairRank, kicker1, kicker2, kicker3] for a Par) into one
// comparable number, higher-significance positions dominating — so two hands of the same
// category but different kickers (e.g. pair of 8s + a 9 vs pair of 8s + a 2) actually compare
// as different, instead of only the category-defining rank (tiebreak[0]) being tracked.
function tiebreakScore(tiebreak) {
  let score = 0;
  for (let i = 0; i < tiebreak.length; i++) score += (tiebreak[i] || 0) / Math.pow(15, i);
  return score;
}

function analyzeDiscardOptions(hand, opponentCount) {
  const handIds = new Set(hand.map(c => c.id));
  const pool = freshDeck().filter(c => !handIds.has(c.id)); // 47 unseen cards
  const TRIALS = 800;
  const current = evaluateHand(hand);
  const currentDistance = current.moveDistance;
  const options = [];
  for (let mask = 0; mask < 32; mask++) {
    const discardIdx = [], keepIdx = [];
    for (let i = 0; i < 5; i++) { if (mask & (1 << i)) discardIdx.push(i); else keepIdx.push(i); }
    const keepCards = keepIdx.map(i => hand[i]);
    let winTotal = 0, bigCount = 0, worseCount = 0, kickerTotal = 0;
    for (let t = 0; t < TRIALS; t++) {
      const ourHand = discardIdx.length === 0 ? hand : keepCards.concat(sampleDistinct(pool, discardIdx.length));
      const ourEval = evaluateHand(ourHand);

      // Opponents' cards are unknown, so model them as random hands drawn from the same
      // unseen pool (a simplification — real bots also try to improve their hand, so this
      // is a slight underestimate of how tough they are, but it's the best we can do without
      // seeing their cards). Only count the move if we actually beat (or tie) everyone —
      // that's what the "only the best hand advances" rule really requires.
      const usedIds = new Set(ourHand.map(c => c.id));
      const remaining = pool.filter(c => !usedIds.has(c.id));
      const oppCards = sampleDistinct(remaining, 5 * opponentCount);
      let weWin = true;
      for (let o = 0; o < opponentCount; o++) {
        const oppEval = evaluateHand(oppCards.slice(o * 5, o * 5 + 5));
        if (compareHands(oppEval, ourEval) > 0) { weWin = false; break; }
      }

      winTotal += weWin ? ourEval.moveDistance : 0;
      kickerTotal += tiebreakScore(ourEval.tiebreak); // the full tiebreak (category rank +
                                                       // kickers), not just the first entry —
                                                       // that's what actually decides ties
                                                       // against opponents in every case, not
                                                       // just the "everyone has Carta Alta" one.
      if (ourEval.moveDistance >= 5) bigCount++;
      if (ourEval.moveDistance < currentDistance) worseCount++;
    }
    options.push({
      discardIdx,
      expected: winTotal / TRIALS, // now already weighted by chance of actually winning the round
      pBig: bigCount / TRIALS,
      pWorse: worseCount / TRIALS,
      avgTopKicker: kickerTotal / TRIALS
    });
  }
  return options;
}

// How far ahead/behind the human is relative to the rest of the field, to decide whether the
// hint should play it safe, play pure EV, or gamble for upside. Thresholds are simulation-free
// judgment calls (not derived from hand math) — easy to retune if they feel off in practice.
function raceUrgency(human, allPlayers) {
  const others = allPlayers.filter(p => p !== human);
  const rank = 1 + others.filter(p => p.position > human.position).length;
  const leaderPos = Math.max(human.position, ...others.map(p => p.position));
  const bestOpponentPos = others.length ? Math.max(...others.map(p => p.position)) : 0;
  const isLast = rank === allPlayers.length;
  const isLeading = rank === 1;
  const gapToLeader = leaderPos - human.position;
  const leadMargin = human.position - bestOpponentPos;

  if (isLeading && human.position >= 70 && leadMargin >= 8) return 'conservative';
  if (isLast && gapToLeader >= 10) return 'aggressive';
  return 'normal';
}

// Small, principled nudge toward the higher kicker: it only matters when your final category
// ties an opponent's (whoever has the best hand advances — everyone else stays put), so it's
// weighted lightly enough to never override a real difference in expected casas advanced.
const KICKER_WEIGHT = 0.4;

function pickBestOption(options, urgency) {
  const scored = options.map(o => {
    let score = o.expected + KICKER_WEIGHT * (o.avgTopKicker - 8) / 6;
    if (urgency === 'aggressive') score += o.pBig * 3;       // reward upside potential
    if (urgency === 'conservative') score -= o.pWorse * 4;   // punish downside risk
    return { ...o, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

function showHint() {
  const btn = $('#btnHint');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Calculando...';
  setTimeout(() => {
    computeAndApplyHint();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }, 20); // let the browser paint the "Calculando..." state before the heavy simulation blocks the thread
}

function computeAndApplyHint() {
  const human = state.players[0];
  const urgency = raceUrgency(human, state.players);
  const opponentCount = state.players.length - 1;
  const options = analyzeDiscardOptions(human.hand, opponentCount);
  const standPat = options.find(o => o.discardIdx.length === 0);
  const best = pickBestOption(options, urgency);
  selectedDiscards = new Set(best.discardIdx);
  renderHand();
  updateSwapButton();

  const profileNote = {
    aggressive: ' Você está bem atrás — vale arriscar por uma mão maior.',
    conservative: ' Você está na liderança perto da chegada — jogando seguro.',
    normal: ''
  }[urgency];

  if (best.discardIdx.length === 0) {
    log(`Dica: manter a mão é a melhor opção (chance real de vencer a rodada considerando os adversários: ${(standPat.expected).toFixed(1)} casa(s) esperadas).${profileNote}`);
  } else {
    const extra = urgency === 'aggressive'
      ? ` — ${(best.pBig * 100).toFixed(0)}% de chance de sair com Straight ou melhor`
      : urgency === 'conservative'
        ? ` — só ${(best.pWorse * 100).toFixed(0)}% de risco de piorar`
        : '';
    log(`Dica: troque ${best.discardIdx.length} carta(s) (ganho médio esperado: ${best.expected.toFixed(1)} casa(s), contra ${standPat.expected.toFixed(1)} mantendo tudo${extra}).${profileNote}`);
  }
}

// ---------------- Rendering: hand (5-card draw) ----------------
function renderHand() {
  const human = state.players[0];
  const container = $('#handCards');
  container.innerHTML = '';
  human.hand.forEach((card, i) => {
    const el = document.createElement('div');
    const isSelected = selectedDiscards.has(i);
    el.className = 'card' + (isSelected ? ' selected' : '') + (human.revealed ? ' revealed' : '');
    el.innerHTML = `<span class="card-rank" style="color:${SUIT_COLOR[card.suit]}">${rankLabel(card.rank)}</span>
                     <span class="card-suit" style="color:${SUIT_COLOR[card.suit]}">${SUIT_SYMBOL[card.suit]}</span>`;
    if (state.phase === 'draw-human') {
      el.onclick = () => {
        if (selectedDiscards.has(i)) selectedDiscards.delete(i); else selectedDiscards.add(i);
        renderHand();
        updateSwapButton();
      };
    }
    container.appendChild(el);
  });
}

// ---------------- Rendering: hole cards (hold'em) ----------------
function renderHoleCards() {
  const human = state.players[0];
  const container = $('#handCards');
  container.innerHTML = '';
  human.holeCards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card' + (human.revealed ? ' revealed' : '');
    el.innerHTML = `<span class="card-rank" style="color:${SUIT_COLOR[card.suit]}">${rankLabel(card.rank)}</span>
                     <span class="card-suit" style="color:${SUIT_COLOR[card.suit]}">${SUIT_SYMBOL[card.suit]}</span>`;
    container.appendChild(el);
  });
}

function updateSwapButton() {
  const btn = $('#btnSwap');
  const n = selectedDiscards.size;
  btn.textContent = n === 0 ? 'MANTER MÃO (STAND PAT)' : `TROCAR ${n} CARTA${n > 1 ? 'S' : ''}`;
}

// ---------------- Log ----------------
function log(msg) {
  const panel = $('#logPanel');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = msg;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function updatePhase(text) {
  // Header phase text was removed (redundant with the log panel below) — kept as a no-op so
  // the many existing call sites throughout the round logic don't need to change.
}

// ---------------- Human draw phase (5-card draw only) ----------------
function humanDrawPhase() {
  return new Promise(resolve => {
    selectedDiscards = new Set();
    state.phase = 'draw-human';
    renderHand();
    updateSwapButton();
    $('#handActions').classList.remove('hidden');
    humanDrawResolver = resolve;
  });
}

function commitHumanDraw() {
  const human = state.players[0];
  const discardIdx = Array.from(selectedDiscards).sort((a, b) => b - a);
  discardIdx.forEach(i => human.hand.splice(i, 1));
  const newCards = state.deck.splice(0, discardIdx.length);
  human.hand = human.hand.concat(newCards);
  human.discardedCount = discardIdx.length;
  log(discardIdx.length === 0 ? 'Você manteve sua mão.' : `Você trocou ${discardIdx.length} carta(s).`);
  $('#handActions').classList.add('hidden');
  selectedDiscards = new Set();
  state.phase = 'draw-bots';
  renderHand();
  if (humanDrawResolver) { humanDrawResolver(); humanDrawResolver = null; }
}

// ---------------- Betting UI (Hold'em) ----------------
function humanBetPrompt(question, options) {
  return new Promise(resolve => {
    $('#bettingQuestion').textContent = question;
    const box = $('#bettingOptions');
    box.innerHTML = '';
    options.forEach(opt => {
      const b = document.createElement('button');
      b.className = 'btn-secondary bet-option-btn';
      b.textContent = opt.label;
      b.onclick = () => { $('#bettingPanel').classList.add('hidden'); resolve(opt.value); };
      box.appendChild(b);
    });
    $('#bettingPanel').classList.remove('hidden');
    humanBetResolver = resolve;
  });
}

function humanZeroCoinsPrompt() {
  return new Promise(resolve => {
    $('#zeroCoinsModal').classList.remove('hidden');
    const human = state.players[0];
    const canWatchAd = human.zeroCount < 3;
    $('#zeroAdBtn').style.display = canWatchAd ? '' : 'none';
    $('#zeroAdLimitMsg').style.display = canWatchAd ? 'none' : '';
    humanZeroResolver = resolve;
  });
}

function wireZeroCoinsModal() {
  $('#zeroContinueBtn').onclick = () => { $('#zeroCoinsModal').classList.add('hidden'); if (humanZeroResolver) humanZeroResolver('continue'); };
  $('#zeroQuitBtn').onclick = () => { $('#zeroCoinsModal').classList.add('hidden'); if (humanZeroResolver) humanZeroResolver('quit'); };
  $('#zeroAdBtn').onclick = async () => {
    $('#zeroAdBtn').disabled = true;
    $('#zeroAdBtn').textContent = 'Reproduzindo anúncio…';
    await delay(1200);
    $('#zeroCoinsModal').classList.add('hidden');
    $('#zeroAdBtn').disabled = false;
    $('#zeroAdBtn').textContent = '📺 Assistir anúncio (+10 moedas)';
    if (humanZeroResolver) humanZeroResolver('ad');
  };
}

// Bot heuristic: decide whether to bet, given hole cards and (optional) evaluated hand-so-far.
function botWantsToBet(bot, evalSoFar) {
  if (evalSoFar) return evalSoFar.category >= 1 ? Math.random() < 0.85 : Math.random() < 0.25;
  const [a, b] = bot.holeCards;
  const pair = a.rank === b.rank;
  const highCards = a.rank >= 11 && b.rank >= 11;
  const suitedConnected = a.suit === b.suit && Math.abs(a.rank - b.rank) <= 2;
  if (pair || highCards || suitedConnected) return Math.random() < 0.9;
  return Math.random() < 0.35;
}

// Rough 0-9 strength estimate for a starting hand (pré-flop, no community cards yet), on
// roughly the same scale as hand categories, just to give bots/pre-flop logic something to
// compare against the same thresholds used post-flop.
function preflopStrength(holeCards) {
  const [a, b] = holeCards;
  const pair = a.rank === b.rank;
  const highCards = a.rank >= 11 && b.rank >= 11;
  const suitedConnected = a.suit === b.suit && Math.abs(a.rank - b.rank) <= 2;
  if (pair && a.rank >= 10) return 3;
  if (pair) return 2;
  if (highCards || suitedConnected) return 1;
  return 0;
}

// Bot decision for one action in the betting queue. Mirrors what a human sees: fold/check/
// call if facing no bet or a bet, bet/raise for value with strong hands.
function botDecideAction(bot, toCall, revealedCount) {
  const evalSoFar = revealedCount > 0
    ? evaluateBestN(bot.holeCards.concat(state.community.slice(0, revealedCount)))
    : null;
  const strength = evalSoFar ? evalSoFar.category : preflopStrength(bot.holeCards);

  if (toCall > 0 && bot.betCoins < toCall) return { type: 'fold' };

  if (toCall === 0) {
    const wantsToBet = botWantsToBet(bot, evalSoFar) && bot.betCoins >= 10;
    if (wantsToBet) {
      const amount = Math.min(strength >= 3 ? 25 : strength >= 1 ? 15 : 10, bot.betCoins);
      return { type: 'bet', amount };
    }
    return { type: 'check' };
  }

  // facing a bet: fold weak hands to a big bet, otherwise call, occasionally raise strong hands
  const facingBigBet = toCall >= 15;
  if (strength === 0 && facingBigBet && Math.random() < 0.7) return { type: 'fold' };
  if (strength >= 4 && bot.betCoins >= toCall + 10 && Math.random() < 0.5) {
    const raiseTo = Math.min(state.currentBetLevel + 10, bot.streetBet + bot.betCoins);
    return { type: 'raise', amount: raiseTo };
  }
  return { type: 'call' };
}

// Builds the human's available actions for #bettingPanel given the current street and how
// much (if anything) they need to put in to stay in the hand, then waits for their choice.
async function getHumanAction(human, streetLabel, toCall) {
  if (toCall > 0 && human.betCoins < toCall) {
    const ok = await ensureCoinsAndBet(human, toCall, true);
    if (state.humanQuit) return { type: 'fold' };
    if (!ok) return { type: 'fold' };
  }
  const options = [];
  if (toCall <= 0) {
    options.push({ label: 'Passar (Check)', value: { type: 'check' } });
    [5, 10, 15, 20, 25].forEach(amt => {
      if (amt <= human.betCoins) options.push({ label: `Apostar ${amt}`, value: { type: 'bet', amount: amt } });
    });
  } else {
    options.push({ label: 'Desistir (Fold)', value: { type: 'fold' } });
    options.push({ label: `Pagar ${toCall} (Call)`, value: { type: 'call' } });
    [10, 15, 20, 25].forEach(totalAmt => {
      const extra = totalAmt - human.streetBet;
      if (totalAmt > state.currentBetLevel && extra <= human.betCoins) {
        options.push({ label: `Aumentar para ${totalAmt} (Raise)`, value: { type: 'raise', amount: totalAmt } });
      }
    });
  }
  return await humanBetPrompt(`${streetLabel} — sua vez de agir`, options);
}

// Applies a resolved action (from human or bot) to the shared pot/coin state and logs it.
function applyBettingAction(p, action) {
  if (action.type === 'fold') {
    p.folded = true;
    log(`${p.name} desistiu (fold).`);
    return;
  }
  if (action.type === 'check') {
    log(`${p.name} passou (check).`);
    return;
  }
  if (action.type === 'call') {
    const amt = Math.max(0, Math.min(state.currentBetLevel - p.streetBet, p.betCoins));
    p.betCoins -= amt; p.streetBet += amt; state.pot += amt;
    log(`${p.name} pagou ${amt} moeda(s) (call).`);
    return;
  }
  if (action.type === 'bet' || action.type === 'raise') {
    const targetLevel = action.amount;
    const amt = Math.max(0, targetLevel - p.streetBet);
    p.betCoins -= amt; p.streetBet += amt; state.pot += amt;
    state.currentBetLevel = targetLevel;
    log(`${p.name} ${action.type === 'bet' ? 'apostou' : 'aumentou para'} ${targetLevel} moeda(s).`);
  }
}

// Runs one full betting round (pré-flop, flop, turn or river) using a real action queue: each
// active player acts once per pass, but a bet/raise re-opens the action, forcing everyone else
// still in the hand to act again — the standard way poker betting rounds actually resolve.
// Stops early if only one player remains active (everyone else folded).
async function runBettingRound(streetLabel, revealedCount) {
  state.players.forEach(p => { p.streetBet = 0; });
  state.currentBetLevel = 0;

  const order = state.players.map((_, i) => i);
  let queue = order.filter(i => !state.players[i].folded);

  while (queue.length > 0) {
    if (state.players.filter(p => !p.folded).length <= 1) return;
    const idx = queue.shift();
    const p = state.players[idx];
    if (p.folded) continue;

    const toCall = state.currentBetLevel - p.streetBet;
    const action = p.isHuman
      ? await getHumanAction(p, streetLabel, toCall)
      : botDecideAction(p, toCall, revealedCount);

    applyBettingAction(p, action);
    renderPlayers();

    if (action.type === 'fold') {
      if (state.players.filter(pl => !pl.folded).length <= 1) return;
      continue;
    }
    if (action.type === 'bet' || action.type === 'raise') {
      // action reopens: everyone else still active must respond to the new bet level
      queue = order.filter(i => i !== idx && !state.players[i].folded);
    }
    await delay(250);
  }
}

// Ensures a player (human or bot) always has enough coins to bet `amount`, running the
// zero-coins flow if needed. Returns true if the player ends up able to (and does) bet.
async function ensureCoinsAndBet(p, amount, isHuman) {
  if (amount <= 0) return true;
  if (p.betCoins >= amount) return true;
  // not enough coins
  p.zeroCount++;
  if (!isHuman) return false; // bots simply skip betting when short
  const choice = await humanZeroCoinsPrompt();
  if (choice === 'ad' && p.zeroCount <= 3) {
    p.betCoins += 10;
    log('Você assistiu a um anúncio e ganhou 10 moedas (só para esta corrida).');
    return p.betCoins >= amount;
  }
  if (choice === 'quit') {
    state.humanQuit = true;
  }
  return false;
}

// ---------------- Animation: move token to an explicit target ----------------
async function animateMoveTo(player, target) {
  const from = player.position;
  const steps = Math.max(0, Math.min(target, 100) - Math.min(from, 100));
  const dir = target >= from ? 1 : -1;
  for (let s = 1; s <= steps; s++) {
    player.position = from + dir * s;
    renderTokens();
    renderPlayers();
    await delay(90);
  }
  player.position = target;
  renderTokens();
  renderPlayers();
}

// ---------------- V2 core rule: movement resolution, shared by both modes ----------------
// Resolves the "no more than 2 karts per cell" collision rule: cars are processed in order
// of hand strength (best first), each taking its desired cell if there's room, otherwise
// backing off one cell at a time until it finds a free spot. `stationaryPlayers` (optional)
// are players who are NOT moving this round but still occupy their current cell, so movers
// correctly cascade around them too. `distanceOverrides` (optional Map) lets a player move a
// distance other than their hand's full moveDistance (used for the 5-Card Draw runner-up rule).
function resolveMovementTargets(players, stationaryPlayers, distanceOverrides) {
  const distanceFor = p => (distanceOverrides && distanceOverrides.has(p)) ? distanceOverrides.get(p) : p.evalResult.moveDistance;
  const withRaw = players.map(p => ({ player: p, raw: p.position + distanceFor(p) }));
  const finishers = withRaw.filter(w => w.raw >= 100);
  const movers = withRaw.filter(w => w.raw < 100)
    .sort((a, b) => compareHands(b.player.evalResult, a.player.evalResult));

  const results = finishers.map(f => ({ player: f.player, target: f.raw }));
  (stationaryPlayers || []).forEach(sp => {
    results.push({ player: sp, target: sp.position, stationary: true });
  });
  movers.forEach(m => {
    let target = m.raw;
    while (target > m.player.position) {
      // Compare by the physical cell on the loop (cellInLap), not the raw position — a cell on
      // lap 1 and the "same" cell on lap 2 are the same physical spot on the board and must
      // share the 2-per-cell cap together.
      const occupants = results.filter(r => r.target < 100 && cellInLap(r.target) === cellInLap(target)).length;
      if (occupants < 2) break;
      target--;
    }
    results.push({ player: m.player, target });
  });
  return results.filter(r => !r.stationary);
}

async function moveEveryone() {
  const targets = resolveMovementTargets(state.players);
  targets.forEach(t => {
    if (t.target !== t.player.position + t.player.evalResult.moveDistance && t.target < 100) {
      log(`${t.player.name} encontrou a pista ocupada e parou na casa ${t.target}.`);
    }
  });
  revealRaceBoardIfNeeded();
  await Promise.all(targets.map(t => animateMoveTo(t.player, t.target)));
}

// Texas Hold'em movement: players who folded forfeit the pot AND don't advance this round —
// they stay exactly where they are, but still occupy their cell (so movers correctly cascade
// around them, same as any other collision).
async function moveHoldemRound() {
  const active = state.players.filter(p => !p.folded);
  const folded = state.players.filter(p => p.folded);
  const targets = resolveMovementTargets(active, folded);
  targets.forEach(t => {
    if (t.target !== t.player.position + t.player.evalResult.moveDistance && t.target < 100) {
      log(`${t.player.name} encontrou a pista ocupada e parou na casa ${t.target}.`);
    }
  });
  folded.forEach(p => log(`${p.name} desistiu da mão e não avança nesta rodada.`));
  revealRaceBoardIfNeeded();
  await Promise.all(targets.map(t => animateMoveTo(t.player, t.target)));
}

// ---------------- 5-Card Draw rule: only the best hand(s) of the round advance ----------------
function determineHandWinners(players) {
  let best = null;
  players.forEach(p => {
    if (!best || compareHands(p.evalResult, best) > 0) best = p.evalResult;
  });
  return players.filter(p => compareHands(p.evalResult, best) === 0);
}

async function moveWinnersOnly(winners, allPlayers) {
  const stationary = allPlayers.filter(p => !winners.includes(p));
  const targets = resolveMovementTargets(winners, stationary);
  targets.forEach(t => {
    if (t.target !== t.player.position + t.player.evalResult.moveDistance && t.target < 100) {
      log(`${t.player.name} encontrou a pista ocupada e parou na casa ${t.target}.`);
    }
  });
  revealRaceBoardIfNeeded();
  await Promise.all(targets.map(t => animateMoveTo(t.player, t.target)));
}

// ---------------- Ranking & payout ----------------
function computeFinalRanking(players) {
  const sorted = players.slice().sort((a, b) => b.position - a.position);
  const ranks = [];
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1], cur = sorted[i];
      const exactTie = prev.position === cur.position && prev.position >= 100 &&
        prev.evalResult && cur.evalResult && compareHands(prev.evalResult, cur.evalResult) === 0;
      if (!exactTie) currentRank = currentRank + 1; // compress: next distinct rank is prevRank+1, not index+1
    }
    ranks.push({ player: sorted[i], rank: currentRank });
  }
  return ranks;
}

// ---------------- Bot AI context ----------------
function botContext(bot) {
  const positions = state.players.map(p => p.position);
  const maxPos = Math.max(...positions);
  const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
  return {
    leading: bot.position >= maxPos,
    farBehind: (avg - bot.position) > 8
  };
}

// ---------------- Round flow: 5-Card Draw ----------------
async function playRoundDraw() {
  $('#roundNum').textContent = state.round;
  updatePhase('Embaralhando e distribuindo cartas…');
  state.deck = shuffle(freshDeck());
  state.players.forEach(p => {
    p.hand = p.position >= 100 ? p.hand : state.deck.splice(0, 5);
    p.discardedCount = null;
    p.revealed = false;
    p.evalResult = null;
  });
  renderPlayers();
  renderHand();
  updateCommunitySlots(null);
  await delay(500);

  updatePhase('Sua vez — escolha as cartas para trocar');
  await humanDrawPhase();

  for (let i = 1; i < state.players.length; i++) {
    const bot = state.players[i];
    updatePhase(`${bot.name} está decidindo…`);
    renderPlayers();
    await delay(400 + Math.random() * 400);
    const ctx = botContext(bot);
    const discard = botChooseDiscards(bot.hand, ctx);
    discard.sort((a, b) => b - a).forEach(idx => bot.hand.splice(idx, 1));
    const newCards = state.deck.splice(0, discard.length);
    bot.hand = bot.hand.concat(newCards);
    bot.discardedCount = discard.length;
    log(`${bot.name} trocou ${discard.length} carta${discard.length === 1 ? '' : 's'}.`);
    renderPlayers();
    await delay(250);
  }

  updatePhase('Showdown! Revelando as mãos…');
  await delay(400);
  state.players.forEach(p => {
    p.evalResult = evaluateHand(p.hand);
    p.revealed = true;
  });
  const winners = determineHandWinners(state.players);
  renderHand();
  renderPlayers();
  updateCommunitySlots(winners[0].hand); // show the best hand of the round on the board's card slots
  await delay(300);

  const winnerNames = winners.map(w => w.name).join(' e ');
  state.players.forEach(p => {
    const isWinner = winners.includes(p);
    log(isWinner
      ? `${p.name}: ${p.evalResult.name} (${formatCards(p.hand)}) — avança ${p.evalResult.moveDistance} casa(s)!`
      : `${p.name}: ${p.evalResult.name} (${formatCards(p.hand)}) — não é a melhor mão, fica parado.`);
  });
  updatePhase(winners.length > 1 ? `Empate! ${winnerNames} avançam!` : `${winnerNames} tem a melhor mão e avança!`);
  await delay(700);

  await moveWinnersOnly(winners, state.players);
  renderPlayers();

  await finishRoundOrContinue(playRoundDraw);
}

// ---------------- Round flow: Texas Hold'em (with betting) ----------------
async function playRoundHoldem() {
  $('#roundNum').textContent = state.round;
  state.pot = 0;
  updatePhase("Distribuindo cartas (Texas Hold'em)…");
  state.deck = shuffle(freshDeck());
  state.players.forEach(p => {
    p.holeCards = state.deck.splice(0, 2);
    p.discardedCount = 0;
    p.revealed = false;
    p.evalResult = null;
    p.folded = false;
    p.streetBet = 0;
  });
  state.community = state.deck.splice(0, 5);
  renderPlayers();
  renderHoleCards();
  updateCommunitySlots(null);
  await delay(500);

  if (state.humanQuit) { await concludeHoldemRace(); return; }

  const streets = [
    { name: 'Pré-Flop', revealTo: 0 },
    { name: 'Flop', revealTo: 3 },
    { name: 'Turn', revealTo: 4 },
    { name: 'River', revealTo: 5 }
  ];

  let handDecidedByFold = false;
  let previouslyRevealed = 0;
  for (const street of streets) {
    // reveal this street's new community card(s), one at a time, before betting starts
    for (let i = previouslyRevealed; i < street.revealTo; i++) {
      updateCommunitySlots(state.community.slice(0, i + 1));
      await delay(350);
    }
    previouslyRevealed = street.revealTo;
    if (street.revealTo > 0) await delay(200);

    updatePhase(`${street.name} — apostas`);
    await runBettingRound(street.name, street.revealTo);
    if (state.humanQuit) { await concludeHoldemRace(); return; }

    if (state.players.filter(p => !p.folded).length <= 1) {
      handDecidedByFold = true;
      break;
    }
  }

  // If the hand ended early because everyone else folded, still reveal the remaining board
  // (no more betting) so the lone survivor's final hand — and therefore moveDistance — can be
  // computed, matching "todos avançam conforme sua mão".
  if (handDecidedByFold) {
    updateCommunitySlots(state.community);
  }

  updatePhase('Showdown! Revelando as mãos…');
  await delay(400);
  const activePlayers = state.players.filter(p => !p.folded);
  activePlayers.forEach(p => {
    p.evalResult = evaluateBest7(p.holeCards.concat(state.community));
    p.revealed = true;
  });
  renderHoleCards();
  renderPlayers();
  await delay(300);

  // ---- Pot payout: best hand among active (non-folded) players wins ----
  if (activePlayers.length > 0 && state.pot > 0) {
    let best = activePlayers[0].evalResult;
    activePlayers.forEach(p => { if (compareHands(p.evalResult, best) > 0) best = p.evalResult; });
    const potWinners = activePlayers.filter(p => compareHands(p.evalResult, best) === 0);
    const share = Math.floor(state.pot / potWinners.length);
    potWinners.forEach(p => {
      p.betCoins += share;
      if (p.isHuman) p.raceWinnings += share;
    });
    log(`${potWinners.map(p => p.name).join(' e ')} venceu(ram) o pote de ${state.pot} moedas!`);
  }

  activePlayers.forEach(p => log(`${p.name}: ${p.evalResult.name} (${formatCards(p.holeCards)}) — avança ${p.evalResult.moveDistance} casa(s)!`));
  updatePhase(handDecidedByFold ? 'Os demais desistiram — só quem ficou avança!' : 'Quem não desistiu avança conforme sua mão!');
  await delay(700);

  await moveHoldemRound();
  renderPlayers();

  await finishRoundOrContinue(playRoundHoldem);
}

async function concludeHoldemRace() {
  const finishers = state.players.filter(p => p.position >= 100);
  const champion = finishers.length > 0
    ? finishers.slice().sort((a, b) => b.position - a.position)[0]
    : state.players.slice().sort((a, b) => b.position - a.position)[0];
  await delay(300);
  endGame(champion);
}

// ---------------- Shared: check for finish, else continue ----------------
async function finishRoundOrContinue(nextRoundFn) {
  if (state.humanQuit) { await concludeHoldemRace(); return; }
  const finishers = state.players.filter(p => p.position >= 100);
  if (finishers.length > 0) {
    await delay(500);
    endGame(finishers[0]);
    return;
  }
  state.round++;
  await delay(800);
  nextRoundFn();
}

function endGame(champion) {
  const ranking = computeFinalRanking(state.players);
  const human = state.players[0];
  const humanRank = ranking.find(r => r.player === human);

  if (state.mode === 'draw') {
    const coinsEarned = DRAW_PAYOUT[humanRank.rank] || 0;
    if (coinsEarned > 0) addPlayerCoins(coinsEarned);
    state.lastPayout = coinsEarned;
  } else {
    const mult = HOLDEM_MULTIPLIER[humanRank.rank] || 0;
    const bonus = human.raceWinnings * mult;
    if (bonus > 0) addPlayerCoins(bonus);
    state.lastPayout = bonus;
    state.lastMultiplier = mult;
  }

  showScreen('screen-end');
  $('#endTitle').textContent = champion.isHuman ? '🏆 VOCÊ VENCEU!' : `🏆 ${champion.name} VENCEU!`;
  $('#endAvatar').innerHTML = `<img src="kart_${champion.color}_token.png" class="end-kart">`;
  $('#endMessage').textContent = champion.isHuman
    ? 'Você cruzou a linha de chegada primeiro. Grande Campeão do Poker Race!'
    : `${champion.name} cruzou a linha de chegada primeiro.`;

  const rankBox = $('#endRanking');
  rankBox.innerHTML = ranking.map(r => `
    <div class="rank-row${r.player.isHuman ? ' human' : ''}">
      <span class="rank-num">${r.rank}º</span>
      <img class="rank-kart" src="kart_${r.player.color}_token.png">
      <span class="rank-name">${r.player.name}</span>
      <span class="rank-pos">casa ${Math.min(r.player.position, 100)}</span>
    </div>`).join('');

  const payoutEl = $('#endPayout');
  if (state.mode === 'draw') {
    payoutEl.textContent = state.lastPayout > 0
      ? `Você ganhou ${state.lastPayout} moedas (${humanRank.rank}º lugar)!`
      : 'Nenhuma moeda desta vez — tente de novo!';
  } else {
    payoutEl.textContent = human.raceWinnings > 0
      ? `Moedas ganhas nas apostas: ${human.raceWinnings} × ${state.lastMultiplier} (${humanRank.rank}º lugar) = ${state.lastPayout} moedas!`
      : 'Você não ganhou nenhum pote nesta corrida.';
  }
  updateCoinsDisplay();
}

// ---------------- Screens ----------------
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

function backToMenu() {
  if (state && state.round > 1) {
    const ok = confirm('Voltar ao menu principal? A corrida atual será perdida.');
    if (!ok) return;
  }
  state = null;
  showScreen('screen-start');
  initSetupScreen();
}

async function startGame() {
  state = {
    players: createPlayers(setupBots, setupColor), deck: [], round: 1, phase: '',
    mode: setupMode, community: [], pot: 0, humanQuit: false, raceStarted: false
  };
  showScreen('screen-game');
  $('#logPanel').innerHTML = '';
  await initBoard();
  initCommunitySlots();
  renderPlayers();
  renderTokens();
  log(state.mode === 'holdem' ? "A corrida começou! Modo Texas Hold'em. Boa sorte!" : 'A corrida começou! Boa sorte!');
  $('#handActions').classList.add('hidden');
  if (state.mode === 'holdem') {
    playRoundHoldem();
  } else {
    playRoundDraw();
  }
}

// The very first time any kart actually moves (the result of the first card exchange), swap
// from the start-line splash art to the live race background and reveal the dynamic info panel.
// Guarded so it only fires once per race, exactly at that moment — not before.
function revealRaceBoardIfNeeded() {
  if (state.raceStarted) return;
  state.raceStarted = true;
  switchToRaceBoard();
  renderPlayers();
}

// ---------------- Init ----------------
function initApp() {
  initSetupScreen();
  $('#btnStart').onclick = startGame;
  $('#btnSwap').onclick = commitHumanDraw;
  $('#btnHint').onclick = showHint;
  $('#btnRules').onclick = () => $('#rulesModal').classList.remove('hidden');
  $('#btnRulesGame').onclick = () => $('#rulesModal').classList.remove('hidden');
  $('#btnCloseRules').onclick = () => $('#rulesModal').classList.add('hidden');
  $('#btnShowHistory').onclick = () => {
    $('#historyLogCopy').innerHTML = $('#logPanel').innerHTML;
    $('#historyModal').classList.remove('hidden');
    $('#historyLogCopy').scrollTop = $('#historyLogCopy').scrollHeight;
  };
  $('#btnCloseHistory').onclick = () => $('#historyModal').classList.add('hidden');
  $('#btnRestart').onclick = () => { showScreen('screen-start'); initSetupScreen(); };
  $('#btnMenu').onclick = backToMenu;
  wireZeroCoinsModal();
  updateCoinsDisplay();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  window.addEventListener('resize', () => {
    if (state) renderTokens();
  });
}

document.addEventListener('DOMContentLoaded', initApp);
