import { listen, openDemo } from './demo-server.ts';

try {
  const demo = await openDemo(process.env.READY_LOCAL_DEMO, { fromEnvironment: true });
  await listen(demo);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'demo failed';
  console.error(message);
  process.exit(1);
}
