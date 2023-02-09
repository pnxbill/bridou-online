import { TCard } from "~/components/hand";
import type Game from "../game-server/src/game";

export type TGame = Game & { playableCards: TCard[], availableBets: number[] }