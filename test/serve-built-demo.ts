import { openBuiltDemo } from './built-demo.ts';

const port = Number(process.env.BUILT_DEMO_PORT ?? '4173');
const demo = await openBuiltDemo(port);
console.log(demo.url);
