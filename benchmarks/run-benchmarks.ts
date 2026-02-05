import autocannon from 'autocannon';
import Redis from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service';

interface BenchmarkResult {
  scenario: string;
  totalRequests: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
}

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const prisma = new PrismaService();

const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

async function waitForServer(url: string, retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server not responding');
}

async function runBenchmark(
  scenario: string,
  url: string,
): Promise<BenchmarkResult> {
  const result = await autocannon({
    url,
    connections: 2,
    duration: 5,
  });

  return {
    scenario,
    totalRequests: result.requests.total,
    avgLatencyMs: result.latency.average,
    p99LatencyMs: result.latency.p99,
    throughputRps: result.requests.average,
  };
}

async function main() {
  console.log('\n📊 Cache Performance Benchmarks\n');

  await prisma.$connect();

  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});

  const role = await prisma.role.create({
    data: {
      name: 'benchmark-role',
      description: 'benchmark',
    },
  });

  const user = await prisma.user.create({
    data: {
      email: 'bench@test.com',
      name: 'Benchmark User',
      bio: 'benchmark',
      roleId: role.id,
    },
  });

  const userUrl = `${BASE_URL}/users/${user.id}`;
  const listUrl = `${BASE_URL}/users?page=1&limit=10`;

  await waitForServer(userUrl);

  const results: BenchmarkResult[] = [];

  // SCENARIO 1 — Cold single
  await redis.flushall();
  results.push(await runBenchmark('Cold Cache - Single User', userUrl));

  // SCENARIO 2 — Warm single
  await fetch(userUrl);
  results.push(await runBenchmark('Warm Cache - Single User', userUrl));

  // SCENARIO 3 — Cold list
  await redis.flushall();
  results.push(await runBenchmark('Cold Cache - User List', listUrl));

  // SCENARIO 4 — Warm list
  await fetch(listUrl);
  results.push(await runBenchmark('Warm Cache - User List', listUrl));

  console.log('\n================ Benchmark Summary ================\n');

  for (const r of results) {
    console.log(r.scenario);
    console.log(`  Requests   : ${r.totalRequests}`);
    console.log(`  Avg Latency: ${r.avgLatencyMs.toFixed(2)} ms`);
    console.log(`  P99 Latency: ${r.p99LatencyMs.toFixed(2)} ms`);
    console.log(`  Throughput : ${r.throughputRps.toFixed(2)} req/sec\n`);
  }

  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await redis.quit();
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
