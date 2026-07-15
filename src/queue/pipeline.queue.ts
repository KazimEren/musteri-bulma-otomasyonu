import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "./connection.js";
import type { PipelineJobInput, PipelineJobResult } from "../types/index.js";

export const PIPELINE_QUEUE_NAME = "customer-discovery-pipeline";

export const pipelineQueue = new Queue<PipelineJobInput, PipelineJobResult>(PIPELINE_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 60 * 60 * 24 }, // 1 gün
    removeOnFail: { age: 60 * 60 * 24 * 7 }, // 1 hafta
  },
});

export async function enqueuePipelineJob(input: PipelineJobInput) {
  const job = await pipelineQueue.add("run-pipeline", input);
  return job.id!;
}
