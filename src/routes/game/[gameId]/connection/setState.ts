import type { TGame } from '../../../../../types';

const setState = (game: TGame) => {
  return {
    cards: game.playableCards,
    trunfo: game.currentRound.trunfo,
    players: game.currentRound.players,
    numOfCards: game.currentRound.cardsForEachPlayer,
    whoMade: game.currentRound.whoMade,
    playedCards: game.currentRound.currentTurn?.playedCards || [],
    currentTurn: game.currentRound.currentTurn,
    turns: game.currentRound.turns,
    betAvailable: game.availableBets,
    score: game.scoreboardShowing ? game.scoreboard : null,
  };
};

export default setState;
