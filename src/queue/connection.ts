import { env } from "../config/env.js";

/**
 * Düz bir bağlantı seçenekleri objesi döner (ioredis instance'ı DEĞİL).
 * BullMQ kendi bündle ettiği ioredis sürümünü bu objeyle içeride kurar; böylece
 * projenin kendi `ioredis` bağımlılığıyla bullmq'un iç `ioredis`'i arasında sürüm
 * uyuşmazlığından doğan tip çakışmaları oluşmaz.
 */
export function getRedisConnectionOptions() {
  const url = new URL(env.REDIS_URL);
  const isTls = url.protocol === "rediss:"; // Upstash gibi bulut sağlayıcılar TLS üzerinden bağlanır

  return {
    host: url.hostname,
    port: Number(url.port || (isTls ? 6380 : 6379)),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
    ...(isTls ? { tls: {} } : {}),
  };
}
