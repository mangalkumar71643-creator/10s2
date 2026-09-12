import { gameCategories, games } from '../data/mockData';
import { Game, GameCategory, GameCategoryId } from '../data/models';
import { delay } from './delay';
import { fetchGameConfig, GameRoundResult, playGameForReal } from '../api/backend';

export { fetchGameConfig };

/** Stakes real wallet balance on a game round via the backend's
 * server-side RNG and returns the outcome. See gameEngineService.ts on
 * the backend for how the RNG works and its certification caveat. */
export function playGame(gameId: string, stake: number): Promise<GameRoundResult> {
  return playGameForReal(gameId, stake);
}

export async function fetchCategories(): Promise<GameCategory[]> {
  return delay([...gameCategories]);
}

export async function fetchGames(): Promise<Game[]> {
  return delay([...games]);
}

export async function fetchFeaturedGames(): Promise<Game[]> {
  return delay(games.filter((g) => g.featured));
}

export async function fetchGamesByCategory(categoryId: GameCategoryId): Promise<Game[]> {
  return delay(games.filter((g) => g.categoryId === categoryId));
}

export async function fetchGameById(id: string): Promise<Game | undefined> {
  return delay(games.find((g) => g.id === id));
}
