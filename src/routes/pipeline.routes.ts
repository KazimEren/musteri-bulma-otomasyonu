import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueuePipelineJob, pipelineQueue } from "../queue/pipeline.queue.js";

const startPipelineSchema = z.object({
  projectDescription: z.string().min(10, "Proje açıklaması en az 10 karakter olmalı"),
  maxResultsPerLocation: z.number().int().positive().max(50).optional(),
});

export async function pipelineRoutes(app: FastifyInstance) {
  app.post("/pipeline", async (request, reply) => {
    const parsed = startPipelineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const jobId = await enqueuePipelineJob(parsed.data);
    return reply.status(202).send({ jobId });
  });

  app.get<{ Params: { jobId: string } }>("/pipeline/:jobId", async (request, reply) => {
    const job = await pipelineQueue.getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: "Job bulunamadı" });
    }

    const state = await job.getState();
    return reply.send({
      jobId: job.id,
      state,
      progress: job.progress,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    });
  });
}
