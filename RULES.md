# Bridou — Rules of the Game

The complete, authoritative rules as implemented by `packages/engine`. This is the reference for
anyone (human or agent) who needs to reason about the game without reading the code, and the source
material for the in-app rules screen.

Where a rule is enforced by a specific piece of code, the file is named so the doc can be verified.
Portuguese terms are kept because they are the vocabulary of the game, in code and in the UI.

---

## 1. Overview

Bridou is a **trick-taking, bid-your-tricks** card game for **2 to 7 players**, played over
**exactly 13 rounds**. Before each round you announce how many tricks you think you will take; you
score well only if you take *exactly* that many. Missing your call — by one trick or by five — is
worth the same penalty. The whole game is that tension: not "win as much as possible", but
"be right about yourself".

A game always ends after round 13. There is no target score.

## 2. Glossary

| Term | Meaning |
| --- | --- |
| **rodada** / round | One deal: bets, then all tricks, then scoring. 13 per game. |
| **feita** / trick | One card from each player; the best card takes it. Also called a "made". |
| **aposta** / bet | How many *feitas* you announce you will take this round. |
| **trunfo** / trump | The single card turned up after the deal. Its **suit** beats every other suit for the whole round. |
| **bailador** | A player who missed their bet this round. The round-end overlay reads *BAILOU!* |
| **bailada** | One instance of missing a bet. Counted per player in the all-time ranking. |
| **rodada cega** / blind round | Round 13: you see everyone's cards except your own. |

## 3. Setup

- **Players:** 2–7 (`MIN_PLAYERS` / `MAX_PLAYERS`, `packages/shared/src/game.ts`). Empty seats can
  be filled with bots by the table leader before starting.
- **Deck:** a standard 52-card French deck — ranks `2 3 4 5 6 7 8 9 10 J Q K A`, suits `♦ ♠ ♥ ♣`.
  No jokers. The deck is reshuffled from scratch every round (`packages/engine/src/deck.ts`).
- **Card strength:** `2` lowest … `10 < J < Q < K < A` highest. Ace is always high; there is no
  low-ace. Suits have no intrinsic ranking — only the trunfo suit is special, and only for the round
  it was turned up in.
- **Seating order** is fixed for the game; who acts *first* rotates one seat per round (see §4).

Seven players × seven cards is 49 cards plus the trunfo, so the deck is never exhausted.

## 4. Round structure

### 4.1 How many cards

Rounds deal **1 → 7 → 1** cards per player:

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
| --- | - | - | - | - | - | - | - | - | - | -- | -- | -- | -- |
| Cards each | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 6 | 5 | 4 | 3 | 2 | 1 |

(`cardsForRound`, `packages/engine/src/round.ts`.) Round 7 is the peak — seven cards each, the
longest and highest-scoring round. Round 13 is one card each **and blind** (§7).

### 4.2 The deal

1. Shuffle the full deck.
2. Deal one card at a time, in seat order, until everyone has the round's card count.
3. Turn the **next card face up — that is the trunfo.** It belongs to nobody and is never played;
   it sits on the table all round as a reminder of the trump suit.

### 4.3 Who goes first

The player who bets first — and who leads the first trick — advances **one seat per round**
(`rotatePlayers`, `packages/engine/src/game.ts`). Over 13 rounds with 2–7 players the advantage of
betting last is spread around, though not perfectly evenly for every table size.

### 4.4 Order of play within a round

1. **Betting.** Every player, in seat order starting from the round's first seat, announces a bet.
   Bets are public the moment they are made, so later bettors know more than earlier ones.
2. **Tricks.** As many tricks as there are cards in hand.
3. **Scoring.** Points are awarded, bailadores are announced, the next round is dealt.

## 5. Betting

Your bet is an integer from **0 up to the number of cards in your hand**. Betting 0 ("I take
nothing") is a normal, often strong, call.

### The last bettor's restriction — "someone must fail"

The **last player to bet may not make the total of all bets equal the number of tricks available.**

Example, 5-card round, four players. The first three bet 2, 1, and 0 — that's 3. The last player is
forbidden from betting **2**, because 3 + 2 = 5 would make it possible for everyone to be right.
They may bet 0, 1, 3, 4 or 5.

This guarantees the table is always either **over-bet** (more tricks promised than exist — someone
must fall short) or **under-bet** (fewer promised than exist — someone must take one too many).
At least one bailador per round is structurally possible, and usually inevitable.

**Exception:** in a **1-card round** the restriction does not apply — the last player may bet
freely. This covers round 1 and round 13. (`getAvailableBets` / `checkIfValidBet`,
`packages/engine/src/round.ts`.)

The engine only ever offers legal bets, so a client can render the available bets directly rather
than computing the restriction itself.

## 6. Playing tricks

### 6.1 Leading

- The **first trick** of a round is led by the round's first seat (the same player who bet first).
- **Every later trick** is led by the winner of the previous trick.
- The leader may play **any card** in hand. The suit of that card is the **led suit** for the trick.

### 6.2 Following

> **You must follow the led suit if you can.** If you have no card of the led suit, you may play
> anything — including a trunfo, but you are never *obliged* to trump.

(`checkIfCorrectSuit`, `packages/engine/src/turn.ts`. The UI enforces this by disabling illegal
cards in your hand, so an honest client can never break it and the server rejects it anyway.)

### 6.3 Who wins the trick

1. If **any trunfo-suit card** was played, the **highest trunfo** wins.
2. Otherwise, the **highest card of the led suit** wins.
3. Cards of any other suit can never win a trick — an Ace played off-suit is worthless.

The winner takes the *feita* and leads the next trick.

Play stops when hands are empty; the number of tricks in a round always equals the number of cards
dealt, so every trick is accounted for.

## 7. Round 13 — the blind round

The last round deals **one card each, held face-down to its owner**:

- **You never see your own card.** On the wire it is sent as a placeholder (`HIDDEN_CARD`), so the
  client physically cannot leak it.
- **You see everyone else's card.** Each player's single card is revealed to all the others.
- Traditionally the card is held to the forehead — everyone sees it but you.
- You bet **0 or 1** with no last-bettor restriction (it is a 1-card round, §5).
- On your turn you have exactly one card, so "playing" it is a single tap; the server resolves the
  placeholder to your real card.

Reading the table backwards — inferring your own card's strength from what others bet and hold — is
the entire round.

## 8. Scoring

At the end of each round, per player:

| Outcome | Points |
| --- | --- |
| Took **exactly** the number of tricks bet | **10 + tricks taken** |
| Took any other number | **−1** (you are a *bailador*) |

(`distributePoints`, `packages/engine/src/round.ts`.)

Consequences worth internalising:

- A correct **bet of 0 is worth 10** — the cheapest score in the game and always available.
- A correct **bet of 7** (round 7 only) is worth **17** — the single biggest score possible.
- The penalty for missing is **−1 flat**. Missing by one trick and missing by five cost the same,
  so once your bet is provably dead, there is no further downside to what you do with the round —
  but also no way to recover it.
- Since misses are cheap and hits are rich, the game rewards *ambitious but accurate* bidding over
  timid ones.

**Game total** = the sum of your 13 round scores. Highest total wins. A perfect game
(every round exact) scores 10×13 + (1+2+3+4+5+6+7+6+5+4+3+2+1) = **130 + 49 = 179**.

### Ties

Equal totals are broken in order:

1. **Fewest bailadas** — the player who missed their bet fewer times over the 13 rounds.
2. **Fewest bets of 0** — bravery wins ties. Betting 0 is the safe way to bank 10 points, so the
   player who reached the same score while calling for tricks more often is placed ahead. Every bet
   of 0 counts, whether or not it was made.
3. Still level after both: **first place is shared.**

The **mid-game scoreboard** pops up automatically after **round 7**, at the halfway mark — the
natural moment to see where everyone stands. The final scoreboard appears after round 13.

## 9. Table lifecycle (how a game actually runs)

Not rules of play, but rules of the table — a player will ask about these.

- **Creating a table.** A player creates a *mesa* and receives a **5-character code** (uppercase,
  with no easily confused characters — no `0`/`O`, no `1`/`I`/`L`). Others join with that code or an
  invite link. Only the **leader** — the first seat — can add bots and start the game.
- **Starting.** The table needs at least 2 seats. Once started, no one can join; the roster is fixed
  for all 13 rounds.
- **Leaving mid-game.** If a player disconnects, the game **pauses for a 30-second grace period**
  (after a ~3s debounce, so a brief network blip does nothing). If they return, they retake their
  seat and play resumes exactly where it stopped. If they do not, a **bot takes over the seat** and
  the game continues. A returning player can reclaim their seat from the bot at any time.
  (`apps/server/src/application/abandonment.ts`.)
- **The bot plays fair.** It sees only what a human in that seat would see — the public table plus
  its own hand, and on the blind round *not* its own card — and acts through the same moves. It
  cannot peek. (Monte Carlo simulation over the unseen cards.)
- **Pacing.** A completed trick stays on the table ~1.5s before the next one starts, and there is a
  few-seconds pause between rounds for the result to land.

## 10. Ranking (all-time leaderboard)

- A game counts toward the ranking (**ranked**) **only if no seat was a bot when it started.**
  A bot taking over a seat mid-game because someone left does **not** disqualify the game — the
  table was legitimate when it kicked off. (`GameHistoryRecorder`,
  `apps/server/src/application/game-history.ts`.)
- Tracked per player: **games played, wins, win rate, total points, bailadas.**
- The leaderboard is ordered by **wins → win rate → total points → name**.
- A win is finishing first on the final scoreboard, ties resolved as in §8. A shared first place is
  a win for everyone who shares it.
- Bot seats never appear in the ranking.

## 11. Reference tables

**Cards per round:** 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1 (13 rounds, 49 tricks per game).

**Round scores by bet, when made exactly:**

| Bet | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | - | - | - | - | - | - | - | - |
| Points | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |

Missed bet: **−1**, always.

**Trick resolution, in one line:** highest trunfo, else highest of the led suit.

---

## Appendix A — Tips (material for an in-app tips screen)

These are strategy, not rules; nothing here is enforced by the engine.

- **Bet 0 more often than feels natural.** It scores 10 — the same as a correct bet of 0 in any
  other round — and it is far easier to guarantee than a bet of 3.
- **Count the trunfos.** With 7 players and 7 cards each, most of the trump suit is out. With 3
  players and 2 cards each, most of it is not. The same King is a very different card in each case.
- **A high card of a non-trump suit is a liability late in a round** — it wins tricks you may not
  want, and it cannot be discarded while you can still follow suit.
- **Watch the total bet.** If the table has under-bet, spare tricks are floating around and someone
  will be forced to take one — make sure it isn't you. If the table has over-bet, tricks are scarce
  and the ambitious bettors will collide.
- **Betting last is a real advantage** — you know every other bet — but it is also the only seat
  with a forbidden number. Both effects rotate with the seats.
- **Once your bet is dead, it's dead.** The penalty is −1 whether you miss by one or by four. Spend
  the rest of the round making life difficult for the players who are still on track.
- **Round 13, don't stare at your own card — read the others'.** If every visible card is high and
  the table is betting 0, your card is probably the one that takes the trick.
- **Round 7 is where games are won.** It is worth up to 17 points, more than double a typical round.

## Appendix B — Edge cases and open questions

Worth being explicit about, since the in-app copy will eventually have to answer them.

- **Where the tiebreak lives.** `compareScoreboard` and `scoreboardRanks` in
  `packages/shared/src/game.ts` are the single source of truth; `Game.scoreboard` sorts with the
  first, `GameHistoryRecorder.finalize` assigns ranks with the second, and the scoreboard overlay
  uses both so a shared first place shows two 🥇 and no 🥈. Every `ScoreboardEntry` carries
  `bailadas` and `zeroBets`, so a client can show *why* a tie broke the way it did.
- **Games finished before this rule shipped** have no `bailadas` / `zeroBets` in their stored
  `finalScoreboard` (only names and photos are read back from it, so nothing breaks), and their
  recorded ranks were assigned by points alone.
- **The trunfo card itself never enters play.** It is turned up and left on the table; no one holds
  it. It only names the trump suit.
- **The forbidden bet can be out of range and vanish.** If the earlier bets already exceed the
  number of tricks, the "forbidden" number is negative and the last bettor simply has no
  restriction. This is correct, not a bug.
- **Rounds 1 and 13 both deal one card**, but only round 13 is blind.
