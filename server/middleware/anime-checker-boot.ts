/**
 * Starts the background anime-episode checker exactly once at server boot.
 * Registered as global h3 middleware purely so this module is guaranteed to
 * be imported eagerly (see server/middleware/grok-pwa.ts for why Nitro only
 * scans this directory) — `ensureAnimeCheckerStarted` is otherwise a no-op
 * middleware, it never touches the request.
 */
import { ensureAnimeCheckerStarted } from "../lib/anime-checker";

ensureAnimeCheckerStarted();

export default function animeCheckerBootMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  return next();
}
