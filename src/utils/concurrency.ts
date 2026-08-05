/** Aynı anda en fazla `concurrency` kadar `fn` çalıştırarak items üzerinde map yapar. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * `items`'ı en fazla `concurrency` kadar eşzamanlı işler, ancak `fn` sonuçlarından (null olmayan)
 * `maxResults` adete ulaşıldığında yeni öğe dağıtmayı durdurur — böylece "hedef sayıya ulaşana kadar
 * adayları teker teker dene" akışında, gerekenden fazla işletme için gereksiz API/LLM çağrısı yapılmaz.
 * O an işlemde olan (in-flight) çağrılar tamamlanmaya bırakılır; concurrency kadar hafif bir aşım olabilir.
 */
export async function mapWithEarlyExit<T, R>(
  items: T[],
  concurrency: number,
  maxResults: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      if (maxResults <= 0 || results.length >= maxResults) return;
      const current = nextIndex++;
      if (current >= items.length) return;
      const result = await fn(items[current]);
      if (result !== null && results.length < maxResults) results.push(result);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
