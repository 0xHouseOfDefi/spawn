import fixtureApp from './fixture-app.ts';
import type { FixtureEnv } from './fixture-cloudflare.ts';
import {
  FIXTURE_RUNTIME_V2, FIXTURE_TOOL_V2,
  type FixtureV2Request,
} from './fixture-v2-contracts.ts';
import type { SyntheticNativeRecords } from './fixture-cloudflare-v2.ts';
import { fixtureBinding } from './native-fixture.ts';

interface FixtureUpgradeEnv extends Omit<FixtureEnv, 'NATIVE_RECORDS'> {
  NATIVE_RECORDS: DurableObjectNamespace<SyntheticNativeRecords>;
}

export default {
  async fetch(request: Request, bindings: FixtureUpgradeEnv) {
    const path = new URL(request.url).pathname;
    if (!['/configure-v2', '/read-v2', '/snapshot-v2'].includes(path)) return fixtureApp.fetch(request, bindings);
    try {
      if (request.method !== 'POST') return new Response('Not found', { status: 404 });
      const records = bindings.NATIVE_RECORDS.getByName('authority');
      if (path === '/configure-v2') {
        const body = await request.json() as { name: string; binding_ref?: string };
        const binding = await fixtureBinding(body.name);
        return Response.json(await records.configureV2({ ...binding,
          ...(body.binding_ref ? { binding_ref: body.binding_ref } : {}),
          runtime_version: FIXTURE_RUNTIME_V2, tool_version: FIXTURE_TOOL_V2,
        }));
      }
      if (path === '/read-v2') return Response.json(await records.executeToolV2(await request.json() as FixtureV2Request));
      const body = await request.json() as { ref: string };
      return Response.json(await records.snapshotV2(body.ref));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
    }
  },
};
