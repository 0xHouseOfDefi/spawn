import { env } from 'cloudflare:workers';
import { init, instrument } from '@flue/runtime';
import { Backroom } from '../src/agents/backroom.ts';
import { bindingIdentity, parseBinding } from '../src/contracts.ts';
import { fixtureBinding, type FixtureScenario } from './native-fixture.ts';
import type { FixtureEnv } from './fixture-cloudflare.ts';

instrument({
  key: Symbol.for('spawn.synthetic-native-callback-count'),
  observe() {},
  async interceptor(operation, context, next) {
    const instanceId = context.eventContext?.id ?? context.instanceId;
    if (operation.type === 'model' && instanceId) {
      await (env as unknown as FixtureEnv).NATIVE_WORK.noteModelCallback(instanceId);
    }
    return next();
  },
  dispose() {},
});

export default {
  async fetch(request: Request, bindings: FixtureEnv) {
    try {
      const path = new URL(request.url).pathname;
      const records = bindings.NATIVE_RECORDS.getByName('authority');
      if (request.method !== 'POST') return new Response('Not found', { status: 404 });
      const body = await request.json() as { name: string; ref: string; scenario: FixtureScenario;
        submissionId: string; message?: string; deadlineInMs?: number };
      if (path === '/configure') {
        const binding = await fixtureBinding(body.name, {
          ...(body.message ? { message: body.message } : {}),
          ...(body.deadlineInMs === undefined ? {} : { deadline_ms: Date.now() + body.deadlineInMs }),
        });
        await records.configure(binding, body.scenario);
        return Response.json(binding);
      }
      if (path === '/send') return Response.json(await bindings.RUNTIME.send(body.ref));
      if (path === '/read') return Response.json(await bindings.RUNTIME.read(body.ref, body.submissionId));
      if (path === '/abort') {
        await bindings.RUNTIME.abort(body.ref);
        return Response.json({ aborted: true });
      }
      if (path === '/snapshot') return Response.json({ ...await records.snapshot(body.ref),
        gateway: await bindings.GATEWAY_RECORDS.getByName('gateway').snapshot(body.ref) });
      if (path === '/conflicting-dispatch') {
        const binding = parseBinding(await records.resolveWork(body.ref, 'dispatch'));
        const intent = await bindingIdentity(binding);
        return Response.json(await init(Backroom, { id: intent.conversation_id }).dispatch({
          message: 'changed immutable command', idempotencyKey: intent.delivery_key,
        }));
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
    }
  },
};
