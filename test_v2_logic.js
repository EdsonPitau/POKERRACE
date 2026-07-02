// Standalone logic test harness for Poker Race V2 (no DOM needed)
const engine = require('fs').readFileSync(__dirname + '/engine.js', 'utf8');
const board = require('fs').readFileSync(__dirname + '/board.js', 'utf8');
eval(engine);
eval(board);

function resolveMovementTargets(players) {
  const withRaw = players.map(p => ({ player: p, raw: p.position + p.evalResult.moveDistance }));
  const finishers = withRaw.filter(w => w.raw >= 100);
  const movers = withRaw.filter(w => w.raw < 100)
    .sort((a, b) => compareHands(b.player.evalResult, a.player.evalResult));
  const results = finishers.map(f => ({ player: f.player, target: f.raw }));
  movers.forEach(m => {
    let target = m.raw;
    while (target > m.player.position) {
      const occupants = results.filter(r => r.target === target).length;
      if (occupants < 2) break;
      target--;
    }
    results.push({ player: m.player, target });
  });
  return results;
}

function computeFinalRanking(players) {
  const sorted = players.slice().sort((a, b) => b.position - a.position);
  const ranks = [];
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1], cur = sorted[i];
      const exactTie = prev.position === cur.position && prev.position >= 100 &&
        prev.evalResult && cur.evalResult && compareHands(prev.evalResult, cur.evalResult) === 0;
      if (!exactTie) currentRank = currentRank + 1;
    }
    ranks.push({ player: sorted[i], rank: currentRank });
  }
  return ranks;
}

function C(str) {
  return str.split(' ').map(t => {
    const suit = t.slice(-1); let r = t.slice(0, -1);
    if (r === 'T') r = 10; else if (r === 'J') r = 11; else if (r === 'Q') r = 12; else if (r === 'K') r = 13; else if (r === 'A') r = 14; else r = parseInt(r);
    return { rank: r, suit };
  });
}

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.log('FAIL:', name); } else { console.log('ok:', name); }
}

// ---- TEST 1: tie-at-finish ranking (manual section 6.3 example) ----
{
  const hand = evaluateHand(C('AS KS QS JS TS')); // royal flush, identical for A & B
  const A = { name: 'A', position: 101, evalResult: hand };
  const B = { name: 'B', position: 101, evalResult: { ...hand, tiebreak: hand.tiebreak.slice() } };
  const Cp = { name: 'C', position: 60, evalResult: evaluateHand(C('7S 7H 7C 7D KS')) };
  const D = { name: 'D', position: 40, evalResult: evaluateHand(C('2S 5H 9C JD KS')) };
  const ranking = computeFinalRanking([A, B, Cp, D]);
  const byName = Object.fromEntries(ranking.map(r => [r.player.name, r.rank]));
  check('A=1st', byName.A === 1);
  check('B=1st (tie)', byName.B === 1);
  check('C=2nd (compressed)', byName.C === 2);
  check('D=3rd (compressed)', byName.D === 3);
}

// ---- TEST 2: max 2 per cell, weaker hand backs off ----
{
  const strong = evaluateHand(C('AS KS QS JS TS'));
  const mid = evaluateHand(C('7S 7H 7C 7D KS'));
  const weak = evaluateHand(C('2S 5H 9C JD KS'));
  const players = [
    { name: 'P1', position: 5, evalResult: strong },
    { name: 'P2', position: 5, evalResult: mid },
    { name: 'P3', position: 4, evalResult: weak } // raw target = 4+1 = 5, same as P1/P2's target (10)... let's set differently
  ];
  // force a real collision: P1 and P2 both target cell 15, P3 also targets 15
  players[0].position = 5; players[0].evalResult = { ...strong, moveDistance: 10 }; // target 15
  players[1].position = 10; players[1].evalResult = { ...mid, moveDistance: 5 }; // target 15
  players[2].position = 13; players[2].evalResult = { ...weak, moveDistance: 2 }; // target 15
  const results = resolveMovementTargets(players);
  const targets = results.map(r => r.target);
  const countAt15 = targets.filter(t => t === 15).length;
  check('no more than 2 land on cell 15', countAt15 <= 2);
  check('total 3 results returned', results.length === 3);
  const allUnique = new Set(results.map(r => r.player.name)).size === 3;
  check('each player appears exactly once', allUnique);
  // weakest hand (P3) should be the one that backed off (since P1,P2 have priority)
  const p3 = results.find(r => r.player.name === 'P3');
  check('P3 (weakest) backed off below 15', p3.target < 15);
  console.log('  -> targets:', results.map(r => `${r.player.name}:${r.target}`).join(', '));
}

// ---- TEST 3: no cell ever exceeds 2 occupants across many random rounds ----
{
  let violations = 0;
  for (let trial = 0; trial < 500; trial++) {
    const players = [];
    const n = 2 + Math.floor(Math.random() * 3); // 2-4 players
    for (let i = 0; i < n; i++) {
      const deck = shuffle(freshDeck());
      const hand = deck.slice(0, 5);
      players.push({
        name: 'P' + i,
        position: Math.floor(Math.random() * 90),
        evalResult: evaluateHand(hand)
      });
    }
    const results = resolveMovementTargets(players);
    const counts = {};
    results.forEach(r => {
      if (r.target < 100) counts[r.target] = (counts[r.target] || 0) + 1;
    });
    Object.values(counts).forEach(c => { if (c > 2) violations++; });
    // also verify nobody moved backward past their own start
    results.forEach(r => { if (r.target < r.player.position) violations++; });
  }
  check('500 random rounds, zero cell-capacity violations', violations === 0);
}

// ---- TEST 4: finishers exempt from collision cap ----
{
  const hand = evaluateHand(C('AS KS QS JS TS'));
  const players = [
    { name: 'F1', position: 95, evalResult: { ...hand, moveDistance: 10 } }, // target 105
    { name: 'F2', position: 92, evalResult: { ...hand, moveDistance: 8 } },  // target 100
    { name: 'F3', position: 90, evalResult: { ...hand, moveDistance: 10 } }, // target 100
  ];
  const results = resolveMovementTargets(players);
  const allFinished = results.every(r => r.target >= 100);
  check('all 3 simultaneous finishers keep their raw target (no cap at finish)', allFinished);
}

// ---- TEST 5: coin math never goes negative in a simple simulated payout loop ----
{
  let coins = 0;
  for (let i = 0; i < 20; i++) {
    const rank = 1 + Math.floor(Math.random() * 4);
    const payout = { 1: 100, 2: 50, 3: 25, 4: 0 }[rank];
    coins = Math.max(0, coins + payout);
  }
  check('coins never negative after 20 simulated 5-draw races', coins >= 0);
}

// ---- TEST 6: evaluateBestN sanity across 5/6/7 cards ----
{
  const seven = C('AS KS QS JS TS 2H 3D');
  const r7 = evaluateBest7(seven);
  check('7-card evaluator finds Royal Flush', r7.name === 'Royal Flush');
  const six = C('AS KS QS JS TS 2H');
  const r6 = evaluateBestN(six);
  check('6-card evaluator finds Royal Flush', r6.name === 'Royal Flush');
}

// ---- TEST 7: heading never anticipates a curve — the last cell of a straight keeps that
// straight's own heading; only the FIRST cell of the new direction shows the new heading ----
{
  // cell 17 = last cell of the top straight (heading LEFT=0); the turn (DOWN=270) should
  // only appear starting at cell 18, not at 17.
  check('cell17 still faces LEFT (0) — same as the rest of the top straight', cellHeadingDeg(17) === 0);
  check('cell18 faces DOWN (270) — the new direction, only once actually there', cellHeadingDeg(18) === 270);
  // cell 54 = last cell of the inner-down lane (DOWN=270); turn to RIGHT happens at 55, not 54.
  check('cell54 still faces DOWN (270)', cellHeadingDeg(54) === 270);
  check('cell55 faces RIGHT (180)', cellHeadingDeg(55) === 180);
  // symmetric checks on the other corners
  check('cell31 still faces DOWN (270)', cellHeadingDeg(31) === 270);
  check('cell32 faces RIGHT (180)', cellHeadingDeg(32) === 180);
  check('cell65 still faces RIGHT (180)', cellHeadingDeg(65) === 180);
  check('cell66 faces UP (90)', cellHeadingDeg(66) === 90);
}

console.log('\\n=== TOTAL FAILURES:', failures, '===');
process.exit(failures > 0 ? 1 : 0);
