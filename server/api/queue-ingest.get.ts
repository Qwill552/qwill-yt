import { defineHandler } from "nitro";
import { drainPendingItems } from "../lib/pending-store";

export default defineHandler(async () => {
  const items = await drainPendingItems();
  return Response.json(items);
});
