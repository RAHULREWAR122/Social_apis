import { createApp } from "./app";
import { env } from "./config/env";
import { startWorkers } from "./workers";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

startWorkers();
