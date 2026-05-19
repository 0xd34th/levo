import 'dotenv/config';
import Redis from 'ioredis';

async function main() {
  const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const hb = await r.get('agent:scheduler:heartbeat');
  const counters = await r.hgetall('agent:scheduler:counters');
  console.log('heartbeat:', hb);
  console.log('counters :', counters);
  await r.quit();
}
main();
