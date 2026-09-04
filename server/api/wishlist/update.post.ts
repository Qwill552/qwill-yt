import { defineHandler } from "nitro";
import { z } from "zod";
import { updateWishlistItem } from "../../lib/anime-tracking-store";
import { publishWishlist } from "../../lib/wishlist-events";

const bodySchema = z.object({
  id: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]).optional(),
  subscribed: z.boolean().optional(),
});

/**
 * Приоритет (с которым карточка родится при выходе) и колокольчик правятся
 * прямо в панели вишлиста.
 */
export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await updateWishlistItem(parsed.data.id, {
    priority: parsed.data.priority,
    subscribed: parsed.data.subscribed,
  });
  await publishWishlist();

  return Response.json({ ok: true });
});
