import autocannon from 'autocannon';
import { execSync } from 'child_process';

interface BenchmarkResult {
  scenario: string;
  requests: number;
  duration: number;
  latencyAvg: number;
  latencyP99: number;
  throughput: number;
}

async function runBenchmark(
  name: string,
  url: string,
): Promise<BenchmarkResult> {
  console.log(`\n🏃 Running: ${name}`);
  console.log('='.repeat(60));

  const result = await autocannon({
    url,
    connections: 10,
    duration: 10,
    pipelining: 1,
  });

  console.log(`✅ Completed: ${name}`);
  console.log(`   Requests: ${result.requests.total}`);
  console.log(`   Latency (avg): ${result.latency.mean.toFixed(2)}ms`);
  console.log(`   Latency (p99): ${result.latency.p99.toFixed(2)}ms`);
  console.log(`   Throughput: ${result.throughput.mean.toFixed(2)} req/sec`);

  return {
    scenario: name,
    requests: result.requests.total,
    duration: result.duration,
    latencyAvg: result.latency.mean,
    latencyP99: result.latency.p99,
    throughput: result.throughput.mean,
  };
}

async function main() {
  console.log('📊 Cache Performance Benchmarks\n');

  const baseUrl = 'http://localhost:3000';
  const results: BenchmarkResult[] = [];

  // Ensure server is running
  console.log('⏳ Waiting for server to be ready...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Benchmark 1: Cold cache (first request)
  console.log('\n' + '='.repeat(60));
  console.log('SCENARIO 1: Cold Cache (DB Query)');
  console.log('='.repeat(60));

  // Clear cache
  execSync('docker exec redis_cache redis-cli FLUSHALL');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  results.push(await runBenchmark('Cold Cache - Single User', `${baseUrl}/users/1`));

  // Benchmark 2: Warm cache (subsequent requests)
  console.log('\n' + '='.repeat(60));
  console.log('SCENARIO 2: Warm Cache (Redis Hit)');
  console.log('='.repeat(60));

  // Prime the cache
  await fetch(`${baseUrl}/users/1`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  results.push(await runBenchmark('Warm Cache - Single User', `${baseUrl}/users/1`));

  // Benchmark 3: List endpoint (cold)
  console.log('\n' + '='.repeat(60));
  console.log('SCENARIO 3: List Endpoint (Cold Cache)');
  console.log('='.repeat(60));

  execSync('docker exec redis_cache redis-cli FLUSHALL');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  results.push(await runBenchmark('Cold Cache - User List', `${baseUrl}/users?page=1&limit=10`));

  // Benchmark 4: List endpoint (warm)
  console.log('\n' + '='.repeat(60));
  console.log('SCENARIO 4: List Endpoint (Warm Cache)');
  console.log('='.repeat(60));

  await fetch(`${baseUrl}/users?page=1&limit=10`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  results.push(await runBenchmark('Warm Cache - User List', `${baseUrl}/users?page=1&limit=10`));

  // Print comparison
  console.log('\n\n📊 RESULTS COMPARISON');
  console.log('='.repeat(100));
  console.log('Scenario                     | Requests | Avg Latency | P99 Latency | Throughput   | Improvement');
  console.log('-'.repeat(100));

  const coldSingle = results[0];
  const warmSingle = results[1];
  const coldList = results[2];
  const warmList = results[3];

  const printRow = (result: BenchmarkResult, baseline?: BenchmarkResult) => {
    const improvement = baseline
      ? `${((baseline.latencyAvg / result.latencyAvg) * 100 - 100).toFixed(1)}%`
      : '-';

    const name = result.scenario.padEnd(28);
    const reqs = result.requests.toString().padStart(8);
    const avg = `${result.latencyAvg.toFixed(2)}ms`.padStart(11);
    const p99 = `${result.latencyP99.toFixed(2)}ms`.padStart(11);
    const throughput = `${result.throughput.toFixed(2)} req/s`.padStart(12);

    console.log(`${name} | ${reqs} | ${avg} | ${p99} | ${throughput} | ${improvement}`);
  };

  printRow(coldSingle);
  printRow(warmSingle, coldSingle);
  printRow(coldList);
  printRow(warmList, coldList);

  console.log('\n✅ Benchmarks complete!\n');
}

main().catch(console.error);