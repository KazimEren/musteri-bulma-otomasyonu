import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execFile } from "child_process";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { pipelineRoutes } from "./routes/pipeline.routes.js";
import { pipelineQueue } from "./queue/pipeline.queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: {
    transport: { target: "pino-pretty" },
  },
});

await app.register(cors);
await app.register(fastifyStatic, {
  root: join(__dirname, "..", "public"),
});
await app.register(pipelineRoutes);

app.get("/health", async () => ({ status: "ok" }));

// Arayuz sekmesi kapatildiginda (sendBeacon /shutdown) lokal sunucuyu ve
// worker'i kendiliginden durdurur. Sayfa yenilenirse/tekrar acilirsa gelen
// herhangi bir istek bekleyen kapanmayi iptal eder; aktif bir pipeline job'i
// varsa is bitene kadar tekrar tekrar ertelenir.
let shutdownTimer: NodeJS.Timeout | null = null;

app.addHook("onRequest", async (request) => {
  if (request.url !== "/shutdown" && shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
});

async function hasActivePipelineJob() {
  const counts = await pipelineQueue.getJobCounts("active", "waiting");
  return (counts.active ?? 0) + (counts.waiting ?? 0) > 0;
}

function killByPattern(regexPattern: string) {
  return (
    "$t = Get-CimInstance Win32_Process -Filter 'Name=''node.exe''' | " +
    `Where-Object { $_.CommandLine -match '${regexPattern}' }; ` +
    "$ids = @(); foreach ($p in $t) { $ids += $p.ProcessId; $ids += $p.ParentProcessId }; " +
    "$ids | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
  );
}

function killLocalProcesses() {
  // Bu fonksiyon sunucunun kendi process'i icinden cagriliyor. Worker'i
  // oldururken kullanilan yardimci powershell surecini, sunucunun kendi
  // agacini (npm/tsx) oldururken ayni Windows job'ina dahil oldugu icin
  // yari yolda kaybetmemek adina worker once, sunucunun kendi agaci ise
  // ayri ve en son bir cagriyla oldurulur.
  execFile(
    "powershell",
    ["-NoProfile", "-WindowStyle", "Hidden", "-Command", killByPattern("pipeline\\.worker\\.ts")],
    () => {
      execFile("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", killByPattern("server\\.ts")]);
    },
  );
}

function scheduleShutdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  shutdownTimer = setTimeout(async () => {
    if (await hasActivePipelineJob()) {
      scheduleShutdown();
      return;
    }
    killLocalProcesses();
  }, 3000);
}

app.post("/shutdown", async (_request, reply) => {
  reply.send({ status: "scheduled" });
  scheduleShutdown();
});

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`Sunucu ayakta: ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
