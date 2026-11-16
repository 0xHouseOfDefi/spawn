import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultDir = path.join(root, 'test-results');
await rm(resultDir, { recursive: true, force: true });
const run = promisify(execFile);
async function buildFixture(version) {
  const fixture = path.join(resultDir, `fixture-${version}`);
  await mkdir(fixture, { recursive: true });
  for (const name of ['src', 'tests', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
    await cp(path.join(root, name), path.join(fixture, name), { recursive: true });
  }
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const suffix = version === 'v2' ? '-v2' : '';
  await writeFile(path.join(fixture, 'flue.config.ts'), `import { defineConfig } from '@flue/runtime/config';
export default defineConfig({ target: 'cloudflare', providers: [], tracing: false,
  app: './tests/fixture-app${suffix}.ts', cloudflare: './tests/fixture-cloudflare${suffix}.ts' });\n`);
  await writeFile(path.join(fixture, 'wrangler.jsonc'), JSON.stringify({
    name: 'spawn-backroom-agent-runtime-test', compatibility_date: '2026-06-01',
    compatibility_flags: ['nodejs_compat'], workers_dev: false, preview_urls: false,
    durable_objects: { bindings: [
      { name: 'NATIVE_RECORDS', class_name: 'SyntheticNativeRecords' },
      { name: 'GATEWAY_RECORDS', class_name: 'SyntheticGatewayRecords' },
    ] },
    services: [
      { binding: 'NATIVE_WORK', service: 'spawn-backroom-agent-runtime-test', entrypoint: 'SyntheticNativeService' },
      { binding: 'RUNTIME', service: 'spawn-backroom-agent-runtime-test', entrypoint: 'BackroomRuntime' },
    ],
    migrations: [{ tag: 'test-v1', new_sqlite_classes: [
      'FlueSpawnBackroomV1Agent', 'SyntheticNativeRecords', 'SyntheticGatewayRecords',
    ] }],
  }, null, 2));
  try {
    const built = await run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: fixture, timeout: 120_000, maxBuffer: 8_000_000,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
    await writeFile(path.join(resultDir, `build-${version}.log`), built.stdout + built.stderr);
  } catch (error) {
    await writeFile(path.join(resultDir, `build-${version}.log`), String(error.stdout ?? '') + String(error.stderr ?? ''));
    throw error;
  }
  const redirect = JSON.parse(await readFile(path.join(fixture, '.wrangler/deploy/config.json'), 'utf8'));
  const configPath = path.resolve(fixture, '.wrangler/deploy', redirect.configPath);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const scriptPath = path.resolve(path.dirname(configPath), config.main);
  const modules = [{ type: 'ESModule', path: scriptPath },
    ...(await readdir(path.dirname(scriptPath), { recursive: true }))
      .filter(name => name.endsWith('.js') && name !== config.main)
      .map(name => ({ type: 'ESModule', path: path.join(path.dirname(scriptPath), name) }))];
  const bundleHash = createHash('sha256').update(await readFile(scriptPath)).digest('hex');
  return { version, config, scriptPath, modules, bundleHash };
}
const v1 = await buildFixture('v1');
const v2 = await buildFixture('v2');
assert.notEqual(v1.bundleHash, v2.bundleHash);
assert.deepEqual(v1.config.durable_objects.bindings, v2.config.durable_objects.bindings);
const persist = path.join(resultDir, 'durable-state');
let runtime;
let deployment = v1;
const results = [];
const references = new Set();
let upgradeEvidence;
let externalRequests = 0;
const start = () => new Miniflare(convertV4MiniflareOptions({
  log: new Log(LogLevel.ERROR), resourcePersistencePath: persist,
  workers: [{
    name: 'fixture', modules: deployment.modules, modulesRoot: path.dirname(deployment.scriptPath),
    compatibilityDate: deployment.config.compatibility_date, compatibilityFlags: deployment.config.compatibility_flags,
    durableObjects: Object.fromEntries(deployment.config.durable_objects.bindings.map(binding => [binding.name,
      { className: binding.class_name, useSQLite: true }])),
    serviceBindings: {
      NATIVE_WORK: { name: 'fixture', entrypoint: 'SyntheticNativeService' },
      RUNTIME: { name: 'fixture', entrypoint: 'BackroomRuntime' },
    },
    outboundService() {
      externalRequests++;
      throw new Error('SYNTHETIC_FIXTURE_EXTERNAL_NETWORK_FORBIDDEN');
    },
  }],
}));
const post = async (endpoint, body, expected = 200) => {
  const response = await runtime.dispatchFetch(`https://fixture.invalid${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const value = await response.json();
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status),
    JSON.stringify({ endpoint, expected, status: response.status, value }));
  return value;
};
const configure = async (name, scenario = name, message, deadlineInMs) => {
  const binding = await post('/configure', { name, scenario, message, deadlineInMs });
  references.add(binding.binding_ref);
  return binding;
};
const snapshot = ref => post('/snapshot', { ref });
const send = ref => post('/send', { ref });
const read = (ref, receipt) => post('/read', { ref, submissionId: receipt.submissionId });
const check = async (name, action) => {
  await action();
  results.push({ scenario: name, passed: true });
  process.stdout.write(`PASS ${name}\n`);
};
const inspectToolCheckpoints = async () => {
  const directory = path.join(persist, 'do/fixture-FlueSpawnBackroomV1Agent');
  let databases = 0;
  let rowCount = 0;
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')) {
    const db = new DatabaseSync(path.join(directory, file), { readOnly: true });
    try {
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
        const statement = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`);
        statement.setReadBigInts(true);
        for (const row of statement.all()) {
          rowCount++;
          for (const value of Object.values(row)) {
            const text = value instanceof Uint8Array ? new TextDecoder().decode(value) : String(value);
            assert.ok(!text.includes('MISROUTED_EVIDENCE_MUST_NOT_ENTER_MODEL'),
              'misrouted tool output was saved in the actual Flue durable database');
          }
        }
      }
      databases++;
    } finally {
      db.close();
    }
  }
  assert.ok(databases > 0 && rowCount > 0);
  return { databases, rows: rowCount, misrouted_output_absent: true };
};

try {
  runtime = start();
  await runtime.ready;
  await check('root model, keyed duplicate admission and repeated interceptor pulls', async () => {
    const binding = await configure('root', 'text');
    const first = await send(binding.binding_ref);
    const second = await send(binding.binding_ref);
    assert.equal(first.submissionId, second.submissionId);
    assert.equal((await read(binding.binding_ref, first)).text, 'native conformance complete');
    const state = await snapshot(binding.binding_ref);
    assert.equal(state.effects.length, 1);
    assert.ok(state.model_callbacks > state.effects.length, JSON.stringify(state));
    assert.equal(state.effects[0].result.operation_ordinal, 0);
    const wire = JSON.parse(state.effects[0].request.wire_text);
    assert.ok(wire.tools.every(tool => !['bash', 'read', 'write', 'edit', 'grep', 'glob'].includes(tool.function.name)));
    await post('/conflicting-dispatch', { ref: binding.binding_ref }, 409);
    await post('/read', { ref: binding.binding_ref, submissionId: 'sub_foreign' }, 409);
  });
  await check('lost admission acknowledgment across separate durable objects', async () => {
    const binding = await configure('lost_ack');
    await post('/send', { ref: binding.binding_ref }, 409);
    const intent = (await snapshot(binding.binding_ref)).intent;
    assert.ok(intent);
    await runtime.dispose();
    runtime = start();
    await runtime.ready;
    const receipt = await send(binding.binding_ref);
    await read(binding.binding_ref, receipt);
    const state = await snapshot(binding.binding_ref);
    assert.deepEqual(state.intent, intent);
    assert.equal(state.effects.length, 1);
    assert.equal(state.receipt.submissionId, receipt.submissionId);
  });
  for (const scenario of ['read', 'harness', 'two_summaries', 'delegate']) {
    await check(`${scenario} through native provider and versioned tools`, async () => {
      const binding = await configure(scenario);
      const receipt = await send(binding.binding_ref);
      assert.equal((await read(binding.binding_ref, receipt)).text, 'native conformance complete');
      const state = await snapshot(binding.binding_ref);
      assert.ok(state.effects.length >= 2);
      assert.ok(state.effects.every(effect => effect.result.state === 'recorded'));
      if (scenario === 'read') assert.equal(state.tools[0].version, 'spawn.native-read-result.v1');
      if (scenario !== 'read') assert.ok(state.effects.some(effect => effect.request.call_site.includes('tool:')));
      if (scenario === 'two_summaries') {
        const summaries = state.effects.filter(effect => effect.request.call_site.includes('/summary:0/'));
        assert.equal(summaries.length, 2);
        assert.equal(new Set(summaries.map(effect => effect.request.call_site)).size, 2);
      }
    });
  }
  for (const scenario of ['tool_wrong_operation', 'tool_wrong_evidence']) {
    await check(`${scenario} cannot checkpoint foreign output or expose it to a model`, async () => {
      const binding = await configure(scenario);
      const receipt = await send(binding.binding_ref);
      await post('/read', { ref: binding.binding_ref, submissionId: receipt.submissionId }, [200, 409]);
      const state = await snapshot(binding.binding_ref);
      assert.equal(state.tools.length, 1);
      assert.equal(state.tools[0].evidence_ref, 'fixture_doc');
      assert.ok(state.effects.every(effect => !effect.request.wire_text.includes('MISROUTED_EVIDENCE_MUST_NOT_ENTER_MODEL')),
        'a validly shaped but misrouted native tool result entered the model context');
    });
  }
  await check('changed v2 native adapter retains interrupted v1 work and fences new capability', async () => {
    const binding = await configure('tool_lost_ack');
    const receipt = await send(binding.binding_ref);
    let original;
    for (let i = 0; i < 100; i++) {
      original = (await snapshot(binding.binding_ref)).tools[0];
      if (original) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(original?.version, 'spawn.native-read-result.v1');
    const before = await snapshot(binding.binding_ref);
    const absent = await runtime.dispatchFetch('https://fixture.invalid/configure-v2', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'not_yet_available' }),
    });
    assert.equal(absent.status, 404);
    await runtime.dispose();
    const checkpoints = await inspectToolCheckpoints();
    deployment = v2;
    runtime = start();
    await runtime.ready;
    assert.equal((await send(binding.binding_ref)).submissionId, receipt.submissionId);
    assert.equal((await read(binding.binding_ref, receipt)).text, 'native conformance complete');
    const state = await snapshot(binding.binding_ref);
    assert.deepEqual(state.tools, [original]);
    assert.equal(state.effects.length, 2);
    assert.deepEqual(state.effects.find(effect => effect.request.request_key === before.effects[0].request.request_key),
      before.effects[0]);
    assert.deepEqual(state.binding, before.binding);
    const originalTools = JSON.parse(before.effects[0].request.wire_text).tools;
    assert.ok(state.effects.every(effect => JSON.stringify(JSON.parse(effect.request.wire_text).tools) === JSON.stringify(originalTools)));
    assert.ok(originalTools.every(tool => tool.function.name !== 'native_read_v2'));
    const admitted = await post('/configure-v2', { name: 'upgrade_control' });
    assert.notEqual(admitted.binding.binding_ref, binding.binding_ref);
    const request = {
      binding_ref: admitted.binding.binding_ref, binding_hash: admitted.binding_hash,
      operation_id: 'v2_original_read', tool_version: 'spawn.synthetic-native-tools.v2', evidence_ref: 'fixture_v2_doc',
    };
    const output = await post('/read-v2', request);
    assert.equal(output.version, 'spawn.synthetic-native-read-result.v2');
    assert.equal(output.evidence_revision, 2);
    assert.equal(output.sections[0].text, 'This structured output exists only in the upgraded fixture adapter.');
    assert.deepEqual(await post('/read-v2', request), output);
    assert.equal((await post('/snapshot-v2', { ref: admitted.binding.binding_ref })).tools.length, 1);
    const denied = await post('/read-v2', { ...request,
      binding_ref: binding.binding_ref, binding_hash: before.intent.binding_hash,
    }, 409);
    assert.equal(denied.error, 'FIXTURE_V2_WORK_NOT_ADMITTED');
    const owner = await post('/configure-v2', { name: 'cannot_upgrade_existing', binding_ref: binding.binding_ref }, 409);
    assert.equal(owner.error, 'FIXTURE_RUNTIME_OWNER_ALREADY_PINNED');
    assert.equal((await post('/snapshot-v2', { ref: binding.binding_ref })).tools.length, 0);
    await post('/send', { ref: admitted.binding.binding_ref }, 409);
    upgradeEvidence = {
      before_bundle_sha256: v1.bundleHash, after_bundle_sha256: v2.bundleHash,
      original_binding: before.binding, original_intent: before.intent, original_receipt: receipt,
      original_model: before.effects[0], original_tool: original, resumed_receipt: state.receipt,
      v2_admission: admitted, v2_original_output: output, v1_v2_capability_refusal: denied,
      runtime_owner_refusal: owner, checkpoints,
    };
  });
  await check('unknown original holds and no fresh provider retry', async () => {
    const binding = await configure('unknown');
    const receipt = await send(binding.binding_ref);
    await post('/read', { ref: binding.binding_ref, submissionId: receipt.submissionId }, 409);
    await runtime.dispose();
    runtime = start();
    await runtime.ready;
    assert.equal((await send(binding.binding_ref)).submissionId, receipt.submissionId);
    const state = await snapshot(binding.binding_ref);
    assert.equal(state.effects.length, 1);
    assert.equal(state.effects[0].result.state, 'unknown');
    assert.equal(state.effects[0].result.accounting, 'held');
  });
  await check('abort fences delivery while late original evidence survives', async () => {
    const binding = await configure('late', 'delay');
    const receipt = await send(binding.binding_ref);
    for (let i = 0; i < 100; i++) {
      if ((await snapshot(binding.binding_ref)).effects.length) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await post('/abort', { ref: binding.binding_ref });
    await post('/read', { ref: binding.binding_ref, submissionId: receipt.submissionId }, 409);
    await new Promise(resolve => setTimeout(resolve, 1800));
    const state = await snapshot(binding.binding_ref);
    assert.equal(state.effects.length, 1);
    assert.equal(state.effects[0].result.state, 'recorded');
    assert.equal(state.stopped, true);
    await post('/send', { ref: binding.binding_ref }, 409);
  });
  await check('native deadline fences delivery while late original evidence survives', async () => {
    const binding = await configure('deadline', 'delay', undefined, 750);
    const receipt = await send(binding.binding_ref);
    const failure = await post('/read', { ref: binding.binding_ref, submissionId: receipt.submissionId }, 409);
    assert.match(failure.error, /Agent run failed/);
    assert.ok(Date.now() >= binding.deadline_ms);
    await new Promise(resolve => setTimeout(resolve, 1800));
    const state = await snapshot(binding.binding_ref);
    assert.equal(state.effects.length, 1);
    assert.equal(state.effects[0].result.state, 'recorded');
    assert.equal(state.effects[0].result.accounting, 'settled');
    await runtime.dispose();
    runtime = start();
    await runtime.ready;
    await post('/read', { ref: binding.binding_ref, submissionId: receipt.submissionId }, 409);
    assert.equal((await snapshot(binding.binding_ref)).effects.length, 1);
  });
  for (const scenario of ['compaction', 'overflow']) {
    await check(`${scenario} uses the sole native provider`, async () => {
      const binding = await configure(scenario, scenario, 'Sealed input. '.repeat(1200));
      const receipt = await send(binding.binding_ref);
      await read(binding.binding_ref, receipt);
      const state = await snapshot(binding.binding_ref);
      assert.ok(state.effects.some(effect => JSON.parse(effect.request.wire_text).model === 'synthetic-native-compaction'));
      assert.ok(state.effects.every(effect => effect.request.protocol === 'spawn.openrouter-flue-chat.v1'));
      if (scenario === 'overflow') assert.equal(state.effects.filter(effect => effect.result.http_status === 400).length, 1);
    });
  }
  const evidence = [];
  await check('independent gateway captures agree with every original wire and response hash', async () => {
    const digest = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
    for (const ref of references) {
      const state = await snapshot(ref);
      assert.equal(state.effects.length, state.gateway.length, ref);
      for (const effect of state.effects) {
        const capture = state.gateway.find(item => item.input.request.request_key === effect.request.request_key);
        assert.ok(capture, ref);
        assert.deepEqual(capture.input.request, effect.request);
        assert.equal(digest(capture.input.request.wire_text), effect.request.wire_sha256);
        assert.equal(digest(capture.response.response_text), capture.response.response_sha256);
        if (effect.result.state === 'recorded') {
          assert.equal(effect.result.response_text, capture.response.response_text);
          assert.equal(effect.result.response_sha256, capture.response.response_sha256);
          assert.equal(effect.result.http_status, capture.response.http_status);
        }
      }
      evidence.push(state);
    }
    assert.equal(externalRequests, 0);
  });
  const rawEvidence = JSON.stringify(evidence, null, 2);
  await writeFile(path.join(resultDir, 'original-evidence.json'), rawEvidence);
  const rawUpgrade = JSON.stringify(upgradeEvidence, null, 2);
  await writeFile(path.join(resultDir, 'upgrade-evidence.json'), rawUpgrade);
  const deployments = await Promise.all([v1, v2].map(async deployment => ({
    version: deployment.version, bundle_sha256: deployment.bundleHash,
    modules: await Promise.all(deployment.modules.map(async module => ({
      path: path.relative(path.dirname(deployment.scriptPath), module.path),
      sha256: createHash('sha256').update(await readFile(module.path)).digest('hex'),
    }))),
  })));
  const sourceFiles = (await readdir(path.join(root, 'src'), { recursive: true }))
    .filter(name => name.endsWith('.ts')).map(name => `src/${name}`);
  sourceFiles.push('package.json', 'package-lock.json', 'flue.config.ts', 'vite.config.ts', 'wrangler.jsonc',
    'tsconfig.json', 'tests/fixture-app.ts', 'tests/fixture-cloudflare.ts', 'tests/native-fixture.ts',
    'tests/fixture-app-v2.ts', 'tests/fixture-cloudflare-v2.ts', 'tests/fixture-v2-contracts.ts', 'tests/contracts.test.ts', 'tests/workerd.mjs');
  const sourceManifest = await Promise.all(sourceFiles.sort().map(async file => ({
    path: file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'),
  })));
  await writeFile(path.join(resultDir, 'qualification.json'), JSON.stringify({
    executed_at: new Date().toISOString(), provenance: 'synthetic_workerd',
    flue_version: '2.3.0', flue_tag_commit: 'deee93b40d275ecc9a50c50af2158f20089d54bc',
    bundle_sha256: v1.bundleHash, upgrade_bundle_sha256: v2.bundleHash, node_version: process.version,
    miniflare_version: JSON.parse(await readFile(path.join(root, 'node_modules/miniflare/package.json'))).version,
    workerd_version: createRequire(path.join(root, 'node_modules/miniflare/package.json'))('workerd/package.json').version,
    package_lock_sha256: createHash('sha256').update(await readFile(path.join(root, 'package-lock.json'))).digest('hex'),
    compatibility_date: v1.config.compatibility_date, deployments, sources: sourceManifest,
    original_evidence_sha256: createHash('sha256').update(rawEvidence).digest('hex'),
    upgrade_evidence_sha256: createHash('sha256').update(rawUpgrade).digest('hex'),
    passed: results, external_requests: externalRequests, production_qualified: false,
  }, null, 2));
} finally {
  await runtime?.dispose();
}
