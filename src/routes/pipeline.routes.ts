import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueuePipelineJob, pipelineQueue } from "../queue/pipeline.queue.js";
import { saveSearchProject } from "../services/projects.service.js";
import { buildLeadsWorkbook } from "../services/excel.service.js";
import type { PipelineJobResult } from "../types/index.js";

const startPipelineSchema = z.object({
  projectDescription: z.string().min(10, "Proje açıklaması en az 10 karakter olmalı"),
  maxResultsPerLocation: z.number().int().positive().max(50).optional(),
  targetSectorHint: z.string().min(1).optional(),
  targetLocationHint: z.string().min(1).optional(),
  scaleFilter: z.enum(["all", "large", "small"]).optional(),
  outputType: z.enum(["draft", "excel_info", "excel_full"]).optional(),
});

export async function pipelineRoutes(app: FastifyInstance) {
  app.post("/pipeline", async (request, reply) => {
    const parsed = startPipelineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      await saveSearchProject(parsed.data);
    } catch (err) {
      // Geçmiş kaydı başarısız olsa da pipeline'ı engelleme, sadece logla.
      app.log.error(err);
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

  /** Tamamlanmış bir pipeline job'ının sonucunu .xlsx olarak indirir (bkz. src/services/excel.service.ts). */
  app.get<{ Params: { jobId: string } }>("/pipeline/:jobId/download-excel", async (request, reply) => {
    const job = await pipelineQueue.getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: "Job bulunamadı" });
    }

    const state = await job.getState();
    if (state !== "completed" || !job.returnvalue) {
      return reply.status(409).send({ error: "Job henüz tamamlanmadı" });
    }

    const result = job.returnvalue as PipelineJobResult;
    const workbook = buildLeadsWorkbook(result);
    const buffer = await workbook.xlsx.writeBuffer();

    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="lead-listesi-${job.id}.xlsx"`)
      .send(Buffer.from(buffer));
  });
}
