import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { pipelineRoutes } from "./routes/pipeline.routes.js";

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

await app.register(cors);
await app.register(pipelineRoutes);

app.get("/health", async () => ({ status: "ok" }));

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`Sunucu ayakta: ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
