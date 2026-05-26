import { loadEnv } from "./load-env.js";

loadEnv();

const { createApp } = await import("./app.js");
const { ensureAiFriendSeed } = await import("./services/aiFriend.js");
const { ensureStubTestUsersSeed } = await import("./services/stubTestUsers.js");
const { ensureBlogEntriesFromGitHub } = await import("./services/blogSync.js");

const port = Number(process.env.API_PORT ?? 3001);

const app = createApp();

void Promise.all([ensureAiFriendSeed(), ensureStubTestUsersSeed(), ensureBlogEntriesFromGitHub()])
  .catch((err) => {
    console.error("Failed startup seed/sync:", err);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`api listening on http://localhost:${port}`);
    });
  });
