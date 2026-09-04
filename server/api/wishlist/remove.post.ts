import { defineHandler } from "nitro";
import { z } from "zod";
import { removeFromWishlist } from "../../lib/anime-tracking-store";
import { publishWishlist } from "../../lib/wishlist-events";

const bodySchema = z.object({ id: z.string().min(1) });

/** Убрали тайтл из вишлиста руками — он перестаёт и отслеживаться. */
export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await removeFromWishlist(parsed.data.id);
  await publishWishlist();

  return Response.json({ ok: true });
});
