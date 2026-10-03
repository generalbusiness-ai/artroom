/** Independent adjacent saved-intent controls at immutable b7b9d8df. */
import { describe, it, expect } from 'vitest';
import { isArtroomError, type Claim } from '@generalbusiness/artroom-contract';
import type { HttpRoomClient, PreparedAct } from '@generalbusiness/artroom-client';
import { bindingIn, declaredRoom, ok, v2 } from './declared-support.ts';
import { ASK, bearer, bearerClient, httpClient } from './declared-stage5-support.ts';
import { addMember, DECLARED } from './support.ts';
const attempt = async (p: Promise<unknown>) => p.catch(e => { if (isArtroomError(e)) return e; throw e; });
describe.skipIf(DECLARED)('checker saved-intent breadth', () => {
  for (const mode of ['none', 'reuse', 'snapshot'] as const) {
    it(`a prepared unsigned bearer act retains its own body after ${mode}`, async () => {
      const r = await declaredRoom(v2(a => { a['ask'] = ASK; }));
      const claim = await ok<Claim>(r, r.admin, 'claim', null, { goal: 'g', scope: ['src/**'] });
      const binding = (await bindingIn(r, 'ask'))!;
      const b = await bearer(r, '@agent', 'agent', { kinds: [], acts: { ask: binding } });
      const api = await bearerClient(r, b) as HttpRoomClient;
      const body = { text: 'first question' };
      let kept!: PreparedAct;
      const first = await api.act('ask', { act: claim.id }, body, { binding, idempotencyKey: 'bearer-kept', onPrepared: p => { kept = mode === 'snapshot' ? structuredClone(p) : p; } });
      expect(first).toMatchObject({ kind: 'ask', text: 'first question' });
      expect(kept.signed).toBeUndefined();
      if (mode !== 'none') body.text = 'second question';
      const result = await attempt(api.replay(kept));
      console.info(JSON.stringify({ probe: `bearer-${mode}`, savedBody: kept.body, original: first, replayResult: result }));
      expect({ savedBody: kept.body, result }, 'the saved bearer intent must not follow the caller original body object').toEqual({ savedBody: { text: 'first question' }, result: first });
    });
    it(`a prepared named key act retains nested scope after ${mode}`, async () => {
      const r = await declaredRoom();
      const bob = await addMember(r, '@bob', 'member');
      const api = await httpClient(r, bob.keys);
      const scope = ['src/**'];
      let kept!: PreparedAct;
      const first = await api.claim({ goal: 'g', scope }, { idempotencyKey: 'named-kept', onPrepared: p => { kept = mode === 'snapshot' ? structuredClone(p) : p; } });
      expect(first).toMatchObject({ kind: 'claim', scope: ['src/**'] });
      if (mode !== 'none') scope.push('docs/**');
      const result = await attempt(api.replay(kept));
      console.info(JSON.stringify({ probe: `named-${mode}`, savedBody: kept.body, original: first, replayResult: result }));
      expect({ savedBody: kept.body, result }, 'the saved signed named intent must own its nested scope').toEqual({ savedBody: { goal: 'g', scope: ['src/**'] }, result: first });
    });
  }
});
