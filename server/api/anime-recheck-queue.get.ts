import { defineHandler } from "nitro";
import { getRecheckCandidates } from "../lib/anime-tracking-store";

const LIMIT = 3;

/**
 * Дёргает qwill-yt.user.js, пока открыта любая страница animego.me: отдаёт
 * подписанные тайтлы, которые сервер не смог прочитать анонимно
 * (`check_failed_count > 0`) — их дочитывает залогиненный браузер.
 */
export default defineHandler(async (event) => {
  const token = process.env.INGEST_TOKEN;
  const auth = event.req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const candidates = await getRecheckCandidates(LIMIT);
  return Response.json({
    slugs: candidates.map((row) => row.slug),
  });
});
