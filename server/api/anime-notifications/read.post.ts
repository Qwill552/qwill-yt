import { defineHandler } from "nitro";
import { z } from "zod";
import { markNotificationsRead } from "../../lib/anime-tracking-store";

const bodySchema = z.object({ ids: z.array(z.number().int()).max(200) });

export default defineHandler(async (event) => {
  const payload = await event.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return new Response("Bad Request", { status: 400 });

  await markNotificationsRead(parsed.data.ids);
  return Response.json({ ok: true });
});
