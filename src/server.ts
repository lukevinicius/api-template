import { env } from "@/config/env";

import { app } from "./app";

app.listen(env.PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
