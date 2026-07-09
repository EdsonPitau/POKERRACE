// Standalone test for the new Hold'em betting engine — extracts the real functions from
// app.js (no DOM needed since we test with all-bot players, bypassing getHumanAction).
const fs = require('fs');
const engineCode = fs.readFileSync(__dirname + '/engine.js', 'utf8');
const boardCode = fs.readFileSync(__dirname + '/board.js', 'utf8');
eval(engineCode);
eval(boardCode);

// ---- minimal fakes for the DOM/UI dependencies runBettingRound touches ----
let logLines = [];
function log(msg) { logLines.push(msg); }
function renderPlayers() {}
function delay(ms) { return Promise.resolve(); }

let state = { pot: 0, community: [], currentBetLevel: 0, humanQuit: false, players: [] };

// pull the real betting-engine functions out of app.js as source text and eval them here
const appSrc = fs.readFileSync(__dirname + '/app.js', 'utf8');
function extract(name) {
  let start = appSrc.indexOf(`async function ${name}(`);
  if (start === -1) start = appSrc.indexOf(`function ${name}(`);
  if (start === -1) throw new Error('not found: ' + name);
  let depth = 0, i = appSrc.indexOf('{', start), started = false;
  for (; i < appSrc.length; i++) {
    if (appSrc[i] === '{') { depth++; started = true; }
    if (appSrc[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return appSrc.slice(start, i);
}
eval(extract('botWantsToBet'));
eval(extract('preflopStrength'));
eval(extract('botDecideAction'));
eval(extract('applyBettingAction'));
eval(extract('runBettingRound'));
eval(extract('resolveMovementTargets'));

function C(str) {
  return str.split(' ').map(t => {
    const suit = t.slice(-1); let r = t.slice(0, -1);
    if (r === 'T') r = 10; else if (r === 'J') r = 11; else if (r === 'Q') r = 12; else if (r === 'K') r = 13; else if (r === 'A') r = 14; else r = parseInt(r);
    return { rank: r, suit, id: suit + r };
  });
}

function mkPlayer(name, holeCards) {
  return { name, isHuman: false, holeCards, betCoins: 200, streetBet: 0, folded: false, position: 0 };
}

let failures = 0;
function check(name, cond) { if (!cond) { failures++; console.log('FAIL:', name); } else { console.log('ok:', name); } }

async function main() {
  // ---- TEST 1: everyone checks pre-flop -> round ends, pot stays 0, nobody folded ----
  {
    state.players = [
      mkPlayer('A', C('AS AH')), mkPlayer('B', C('2S 7H')),
      mkPlayer('C', C('9D 9C')), mkPlayer('D', C('KH QH'))
    ];
    state.pot = 0;
    // force everyone to check by making botWantsToBet always false via 0 rank hands (patch Math.random to always be high so no bet)
    const origRandom = Math.random;
    Math.random = () => 0.99; // never bet, never raise, never fold-under-threshold
    await runBettingRound('Pré-Flop', 0);
    Math.random = origRandom;
    check('all-check round: pot stays 0', state.pot === 0);
    check('all-check round: nobody folded', state.players.every(p => !p.folded));
  }

  // ---- TEST 2: a bet re-opens action for everyone else (basic queue correctness) ----
  {
    state.players = [
      mkPlayer('A', C('AS AH')), mkPlayer('B', C('2S 7H')),
      mkPlayer('C', C('9D 9C')), mkPlayer('D', C('KH QH'))
    ];
    state.pot = 0;
    // Force player A's first action to be a bet of 10, then everyone calls (deterministic via a scripted queue)
    let callCount = 0;
    const origDecide = botDecideAction;
    botDecideAction = function (bot, toCall) {
      callCount++;
      if (bot.name === 'A' && toCall === 0) return { type: 'bet', amount: 10 };
      if (toCall > 0) return { type: 'call' };
      return { type: 'check' };
    };
    await runBettingRound('Flop', 3);
    botDecideAction = origDecide;
    check('bet+call round: pot collected correctly (4 players x 10 = 40)', state.pot === 40);
    check('bet+call round: nobody folded', state.players.every(p => !p.folded));
    check('bet+call round: everyone matched the bet level', state.players.every(p => p.streetBet === 10));
  }

  // ---- TEST 3: fold reduces active players and stops the round early when 1 remains ----
  {
    state.players = [
      mkPlayer('A', C('AS AH')), mkPlayer('B', C('2S 7H')),
      mkPlayer('C', C('9D 9C')), mkPlayer('D', C('KH QH'))
    ];
    state.pot = 0;
    const origDecide = botDecideAction;
    botDecideAction = function (bot, toCall) {
      if (bot.name === 'A' && toCall === 0) return { type: 'bet', amount: 20 };
      if (toCall > 0) return { type: 'fold' }; // everyone else folds to the bet
      return { type: 'check' };
    };
    await runBettingRound('Turn', 4);
    botDecideAction = origDecide;
    const active = state.players.filter(p => !p.folded);
    check('everyone-folds-to-bet: exactly 1 active player remains', active.length === 1 && active[0].name === 'A');
    check('everyone-folds-to-bet: pot only has the lone bettor\'s own money (20)', state.pot === 20);
  }

  // ---- TEST 4: fold-aware movement — folded players stay put, active players still move,
  // and collisions against folded (stationary) players are respected ----
  {
    const hand = evaluateHand(C('AS KS QS JS TS'));
    const winner = { name: 'W', position: 10, evalResult: { ...hand, moveDistance: 5 }, folded: false };
    const folder1 = { name: 'F1', position: 15, evalResult: null, folded: true };
    const folder2 = { name: 'F2', position: 15, evalResult: null, folded: true };
    const active = [winner];
    const folded = [folder1, folder2];
    const targets = resolveMovementTargets(active, folded);
    const winnerTarget = targets.find(t => t.player.name === 'W').target;
    check('folded players block the winner\'s raw target cell (15) already has 2 there', winnerTarget < 15);
    check('folded players are not in the returned movement list (they do not move)', !targets.some(t => t.player.name === 'F1' || t.player.name === 'F2'));
  }

  console.log('\n=== TOTAL FAILURES:', failures, '===');
  process.exit(failures > 0 ? 1 : 0);
}

main();
