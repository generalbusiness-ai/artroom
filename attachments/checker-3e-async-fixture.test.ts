/** Independent repair edges at exact 3e6241df. */
import { describe, expect, it } from 'vitest';
import { envelopeOf, isArtroomError, type Claim, type Json, type Signer } from '@generalbusiness/artroom-contract';
import { connect, type HttpRoomClient, type PreparedAct } from '@generalbusiness/artroom-client';
import { ASK, ORIGIN, bearer, bearerClient, httpClient, signerOf, workerFetch } from './declared-stage5-support.ts';
import { bindingIn, declaredRoom, ok, v2 } from './declared-support.ts';
import { addMember, clock, DECLARED } from './support.ts';
const thrownAsValue = async (p: Promise<unknown>) => p.then(value => ({ value }), e => ({ error: isArtroomError(e) ? e : { name: e?.name, message: e?.message } }));
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};

describe.skipIf(DECLARED)('checker repair asynchronous ownership', () => {
  for (const edge of ['generic-sign', 'named-sign', 'generic-hook', 'named-hook', 'bearer-hook'] as const) {
    for (const change of ['none', 'reuse'] as const) {
      it(`${edge} keeps original target/body while caller inputs undergo ${change}`, async () => {
        const r = await declaredRoom(v2(a => { a['ask'] = ASK; }));
        const bob = await addMember(r, '@bob', 'member');
        const claim = await ok<Claim>(r, bob, 'claim', null, { goal: 'g', scope: ['src/**'] });
        const other = await ok<Claim>(r, bob, 'claim', null, { goal: 'other', scope: ['docs/**'] });
        const named = edge.startsWith('named');
        const binding = (await bindingIn(r, named ? 'claim' : 'ask'))!;
        const arrived = deferred(); const gate = deferred();
        const net = workerFetch();
        let held = false;
        const hold = async () => { if (!held) { held = true; arrived.release(); await gate.promise; } };
        const base = signerOf(bob.keys);
        const signer: Signer = { key: base.key, sign: async bytes => {
          if (edge.endsWith('sign') && new TextDecoder().decode(bytes).startsWith('artroom-envelope-v1\n')) await hold();
          return base.sign(bytes);
        } };
        const api = edge === 'bearer-hook'
          ? await bearerClient(r, await bearer(r, '@agent', 'agent', { kinds: [], acts: { ask: binding } }), net.fetch) as HttpRoomClient
          : await connect({ url: ORIGIN }, r.id, { kind: 'key', signer }, { fetch: net.fetch, now: () => clock.now }) as HttpRoomClient;
        const body = { text: 'original' };
        const scope = ['lib/**'];
        const target = { act: claim.id };
        let kept!: PreparedAct;
        const onPrepared = async (p: PreparedAct) => { kept = p; if (edge.endsWith('hook')) await hold(); };
        const pending = named
          ? api.claim({ goal: 'nested', scope }, { idempotencyKey: 'async-owned', onPrepared })
          : api.act('ask', target, body, { binding, idempotencyKey: 'async-owned', onPrepared });
        await arrived.promise;
        expect(Object.isFrozen(target)).toBe(false);
        expect(Object.isFrozen(body)).toBe(false);
        expect(Object.isFrozen(scope)).toBe(false);
        if (change === 'reuse') { target.act = other.id; body.text = 'changed while pending'; scope.push('more/**'); }
        gate.release();
        const first = await pending;
        expect(first).toMatchObject({ kind: named ? 'claim' : 'ask' });
        expect(Object.isFrozen(kept.body)).toBe(true);
        if (named) expect(kept.body).toEqual({ goal: 'nested', scope: ['lib/**'] });
        else { expect(kept.target).toEqual({ act: claim.id }); expect(kept.body).toEqual({ text: 'original' }); }
        expect(await api.replay(kept)).toEqual(first);
        expect('seq' in first).toBe(true);
        const sequence = 'seq' in first ? first.seq : -1;
        const entry = (await r.admin.read({ q: 'log', req: { limit: 500 } })).acts.find(e => e.seq === sequence)!;
        if (named) expect(envelopeOf(entry)!.body).toEqual({ goal: 'nested', scope: ['lib/**'] });
        else { expect(envelopeOf(entry)!.target).toEqual({ act: claim.id }); expect(envelopeOf(entry)!.body).toEqual({ text: 'original' }); }
      });
    }
  }
  for (const mode of ['key', 'bearer'] as const) {
    it(`${mode}: original body reuse during awaited onPrepared keeps the signed/sent body`, async () => {
      const r = await declaredRoom(v2(a => { a['ask'] = ASK; }));
      const bob = await addMember(r, '@bob', 'member');
      const claim = await ok<Claim>(r, bob, 'claim', null, { goal: 'g', scope: ['src/**'] });
      const binding = (await bindingIn(r, 'ask'))!;
      const api = mode === 'key' ? await httpClient(r, bob.keys) : await bearerClient(r, await bearer(r, '@agent', 'agent', { kinds: [], acts: { ask: binding } })) as HttpRoomClient;
      const body = { text: 'original body' };
      const entered = deferred(); const gate = deferred();
      let kept!: PreparedAct;
      const pending = api.act('ask', { act: claim.id }, body, { binding, onPrepared: async p => { kept = p; entered.release(); await gate.promise; } });
      await entered.promise;
      body.text = 'reused while hook waits';
      gate.release();
      const first = await pending;
      expect(first).toMatchObject({ kind: 'ask', text: 'original body' });
      expect(kept.body).toEqual({ text: 'original body' });
      expect(await api.replay(kept)).toEqual(first);
    });
  }
});

describe.skipIf(DECLARED)('checker repair plain-data error contract', () => {
  for (const kind of ['plain', 'function', 'date', 'map', 'cycle'] as const) {
    it(`${kind} target/body is handled by the advertised plain-data contract`, async () => {
      const r = await declaredRoom(v2(a => { a['ask'] = ASK; }));
      const bob = await addMember(r, '@bob', 'member');
      const claim = await ok<Claim>(r, bob, 'claim', null, { goal: 'g', scope: ['src/**'] });
      const binding = (await bindingIn(r, 'ask'))!;
      const net = workerFetch(); const api = await httpClient(r, bob.keys, { fetch: net.fetch });
      net.seen.length = 0; // Count act sending after connect's read-session request.
      let hooked = false;
      const body: Record<string, Json> = { text: 'x' };
      if (kind === 'function') body['text'] = (() => 'x') as never;
      if (kind === 'date') body['text'] = new Date('2026-10-03T00:00:00Z') as never;
      if (kind === 'map') body['text'] = new Map([['text', 'x']]) as never;
      if (kind === 'cycle') body['self'] = body;
      const result = await thrownAsValue(api.act('ask', { act: claim.id }, body, { binding, onPrepared: () => { hooked = true; } }));
      console.info(JSON.stringify({ probe: kind, result, hooked, posts: net.seen.filter(s => s.method === 'POST').length }));
      if (kind === 'plain') expect(result).toMatchObject({ value: { kind: 'ask', text: 'x' } });
      else {
        expect(result, 'nonplain input must be the documented ArtroomError bad-request').toMatchObject({ error: { name: 'ArtroomError', code: 'bad-request' } });
        expect(hooked).toBe(false);
        expect(net.seen.filter(s => s.method === 'POST')).toHaveLength(0);
      }
    });
  }
});
