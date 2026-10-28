import { api } from "@cal/backend/api";
import type { ConvexClient } from "convex/browser";
import type { Remote } from "./engine";

// The engine's Remote over a ConvexClient, which must already have auth set.
export const convexRemote = (client: ConvexClient): Remote => ({
  upload: (device, ops) => client.mutation(api.sync.upload, { device, ops }),
  watch: (after, onPage, onError) => client.onUpdate(api.sync.pull, { after }, onPage, onError),
});
