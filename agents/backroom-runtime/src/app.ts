import { Hono } from 'hono';
import './runtime.ts';

const app = new Hono();
app.all('*', c => c.notFound());
export default app;
