import { loadEnv } from "./load-env.js";

loadEnv();

const { createApp } = await import("./app.js");
const { ensureAiFriendSeed } = await import("./services/aiFriend.js");

const port = Number(process.env.API_PORT ?? 3001);

const app = createApp();

void ensureAiFriendSeed()
  .catch((err) => {
    console.error("Failed to seed AI friend:", err);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`api listening on http://localhost:${port}`);
    });
  });
