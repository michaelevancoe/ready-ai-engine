import { DemoContext } from './demo-server.ts';

try {
  const demo = await DemoContext.open(process.env.READY_LOCAL_DEMO);
  await demo.listen();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'demo failed';
  console.error(message);
  process.exit(1);
}
