import type { FastifyInstance } from "fastify";
import { listRecentSearchProjects } from "../services/projects.service.js";

/** "Geçmiş Projelerim" dropdown'ı için son aramaları listeler. */
export async function projectsRoutes(app: FastifyInstance) {
  app.get("/projects", async (_request, reply) => {
    try {
      const projects = await listRecentSearchProjects();
      return reply.send({ projects });
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Bilinmeyen hata" });
    }
  });
}
