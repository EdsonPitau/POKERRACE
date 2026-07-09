// ===================== POKER RACE — GAME ENGINE =====================

// ---------- Deck ----------
const SUITS = ['S', 'H', 'D', 'C']; // Espadas, Copas, Ouros, Paus
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(r) { return RANK_LABEL[r] || String(r); }
function formatCards(cards) { return cards.map(c => `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`).join(' '); }

function freshDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) {
      deck.push({ rank: r, suit: s, id: s + r });
    }
  }
  return deck;
}

function shuffle(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---------- Hand evaluation ----------
const HAND_NAME = {
  9: 'Royal Flush', 8: 'Straight Flush', 7: 'Quadra', 6: 'Full House',
  5: 'Flush', 4: 'Straight', 3: 'Trinca', 2: 'Dois Pares', 1: 'Par', 0: 'Carta Alta'
};
const HAND_MOVE = { 9: 10, 8: 9, 7: 8, 6: 7, 5: 6, 4: 5, 3: 4, 2: 3, 1: 2, 0: 1 };

function evaluateHand(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = null;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; straightHigh = uniq[0]; }
    else if (uniq.join(',') === '14,5,4,3,2') { isStraight = true; straightHigh = 5; }
  }

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: parseInt(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  let category, tiebreak;

  if (isStraight && isFlush) {
    const royal = straightHigh === 14 && ranks.includes(13);
    category = royal ? 9 : 8;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    tiebreak = [groups[0].rank, groups[1].rank];
  } else if (isFlush) {
    category = 5;
    tiebreak = ranks;
  } else if (isStraight) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    tiebreak = [groups[0].rank, ...kickers];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    const pairs = groups.filter(g => g.count === 2).map(g => g.rank).sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1).rank;
    category = 2;
    tiebreak = [...pairs, kicker];
  } else if (groups[0].count === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    category = 1;
    tiebreak = [groups[0].rank, ...kickers];
  } else {
    category = 0;
    tiebreak = ranks;
  }

  return { category, name: HAND_NAME[category], moveDistance: HAND_MOVE[category], tiebreak };
}

function compareHands(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] || 0, bv = b.tiebreak[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// best 5-card hand out of N cards (N=6 on the turn, N=7 on the river) — Texas Hold'em
function combinationsOf(cards, k) {
  const result = [];
  const n = cards.length;
  function recurse(start, combo) {
    if (combo.length === k) { result.push(combo.slice()); return; }
    for (let i = start; i < n; i++) {
      combo.push(cards[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }
  recurse(0, []);
  return result;
}

function evaluateBestN(cardsN) {
  let best = null;
  for (const combo of combinationsOf(cardsN, 5)) {
    const ev = evaluateHand(combo);
    if (!best || compareHands(ev, best) > 0) best = ev;
  }
  return best;
}

function evaluateBest7(cards7) { return evaluateBestN(cards7); }

// Note: the board coordinate map (which cell sits where on the artwork) now lives in board.js
// as the 25-cell loop calibration — this file only cares about game logic (deck, hand
// evaluation, bot AI), not board geometry.

// ---------- Bot AI ----------
function botChooseDiscards(cards, ctx) {
  const ev = evaluateHand(cards);
  const counts = {};
  cards.forEach(c => counts[c.rank] = (counts[c.rank] || 0) + 1);

  const desperate = ctx && ctx.farBehind;
  let keepIdx = new Set();

  if (ev.category >= 4) return [];

  if (ev.category === 3) {
    cards.forEach((c, i) => { if (counts[c.rank] === 3) keepIdx.add(i); });
  } else if (ev.category === 2) {
    if (desperate && Math.random() < 0.5) {
      const pairRanks = Object.entries(counts).filter(([r, c]) => c === 2).map(([r]) => parseInt(r)).sort((a, b) => b - a);
      const lowPair = pairRanks[1];
      cards.forEach((c, i) => { if (counts[c.rank] === 2 && c.rank !== lowPair) keepIdx.add(i); });
    } else {
      cards.forEach((c, i) => { if (counts[c.rank] === 2) keepIdx.add(i); });
    }
  } else if (ev.category === 1) {
    cards.forEach((c, i) => { if (counts[c.rank] === 2) keepIdx.add(i); });
  } else {
    const bySuit = {};
    cards.forEach((c, i) => { (bySuit[c.suit] = bySuit[c.suit] || []).push(i); });
    const flushDraw = Object.values(bySuit).find(arr => arr.length === 4);
    if (flushDraw) {
      flushDraw.forEach(i => keepIdx.add(i));
    } else {
      const sortedIdx = cards.map((c, i) => i).sort((a, b) => cards[b].rank - cards[a].rank);
      const keepCount = desperate ? 1 : 2;
      for (let k = 0; k < keepCount; k++) keepIdx.add(sortedIdx[k]);
    }
  }

  const discard = [];
  cards.forEach((c, i) => { if (!keepIdx.has(i)) discard.push(i); });
  return discard;
}
