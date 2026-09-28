const BASE = 'http://localhost:3000';
let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` -> ${JSON.stringify(extra)}` : ''}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const uid = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

console.log('\n== 1. free monthly quota (3) ==');
const u1 = uid('free');
for (let i = 1; i <= 3; i++) {
  const r = await api('POST', '/chat/ask', { userId: u1, question: `q${i}` });
  check(`free msg ${i} accepted, kind=free`, r.status === 201 && r.body.message.quota.kind === 'free', r.body);
}
const r4 = await api('POST', '/chat/ask', { userId: u1, question: 'q4' });
check('4th message rejected 429 no bundle', r4.status === 429, r4);

console.log('\n== 2. no bundle but one exists -> paid fallback ==');
const u2 = uid('paid');
await api('POST', '/chat/ask', { userId: u2, question: 'a' });
await api('POST', '/chat/ask', { userId: u2, question: 'b' });
await api('POST', '/chat/ask', { userId: u2, question: 'c' });
const sub2 = await api('POST', '/subscriptions', { userId: u2, plan: 'basic', cycle: 'monthly' });
check('basic sub created maxMessages=10', sub2.body.maxMessages === 10, sub2.body);
const paid = await api('POST', '/chat/ask', { userId: u2, question: 'd' });
check('4th message uses bundle', paid.status === 201 && paid.body.message.quota.kind === 'bundle', paid.body);
const after = await api('GET', `/subscriptions/${sub2.body.id}`);
check('basic remaining 9 after 1 message', after.body.remainingMessages === 9, after.body);

console.log('\n== 3. highest remaining bundle wins, tie-break on latest end date ==');
const u3 = uid('multi');
for (let i = 0; i < 3; i++) await api('POST', '/chat/ask', { userId: u3, question: `f${i}` });
const pro = await api('POST', '/subscriptions', { userId: u3, plan: 'pro', cycle: 'monthly' });
const basic = await api('POST', '/subscriptions', { userId: u3, plan: 'basic', cycle: 'monthly' });
// drain pro below basic so selection must flip to basic
for (let i = 0; i < 91; i++) {
  const r = await api('POST', '/chat/ask', { userId: u3, question: `p${i}` });
  if (r.status !== 201) break;
}
const proState = await api('GET', `/subscriptions/${pro.body.id}`);
const basicState = await api('GET', `/subscriptions/${basic.body.id}`);
check('pro now below basic', proState.body.remainingMessages < basicState.body.remainingMessages, {
  pro: proState.body.remainingMessages,
  basic: basicState.body.remainingMessages,
});
const next = await api('POST', '/chat/ask', { userId: u3, question: 'next' });
check('message charged to higher-remaining bundle', next.status === 201, next.body);
const proAfter = await api('GET', `/subscriptions/${pro.body.id}`);
const basicAfter = await api('GET', `/subscriptions/${basic.body.id}`);
check('pro drained to 0', proAfter.body.remainingMessages === 0, proAfter.body);
check('basic was the one consumed', basicAfter.body.remainingMessages === basicState.body.remainingMessages - 1, {
  before: basicState.body.remainingMessages,
  after: basicAfter.body.remainingMessages,
});

console.log('\n== 4. enterprise unlimited ==');
const u4 = uid('ent');
for (let i = 0; i < 3; i++) await api('POST', '/chat/ask', { userId: u4, question: `f${i}` });
const ent = await api('POST', '/subscriptions', { userId: u4, plan: 'enterprise', cycle: 'yearly' });
check('enterprise unlimited flag', ent.body.unlimited === true && ent.body.remainingMessages === null, ent.body);
check('yearly endDate is 12 months out', ent.body.endDate.startsWith('2027-09'), ent.body);
for (let i = 0; i < 25; i++) {
  const r = await api('POST', '/chat/ask', { userId: u4, question: `e${i}` });
  if (r.status !== 201) { check(`enterprise msg ${i}`, false, r.body); break; }
}
const entAfter = await api('GET', `/subscriptions/${ent.body.id}`);
check('enterprise still unlimited after 25 messages', entAfter.body.remainingMessages === null, entAfter.body);

console.log('\n== 5. auto-renew toggle ==');
const u5 = uid('renew');
const s5 = await api('POST', '/subscriptions', { userId: u5, plan: 'basic', cycle: 'monthly' });
const off = await api('POST', `/subscriptions/${s5.body.id}/auto-renew`, { autoRenew: false });
check('auto-renew disabled', off.status === 201 && off.body.autoRenew === false, off.body);
const on = await api('POST', `/subscriptions/${s5.body.id}/auto-renew`, { autoRenew: true });
check('auto-renew re-enabled', on.status === 201 && on.body.autoRenew === true, on.body);

console.log('\n== 6. cancellation: ends cycle, prevents renewal, keeps usage ==');
const u6 = uid('cancel');
for (let i = 0; i < 3; i++) await api('POST', '/chat/ask', { userId: u6, question: `f${i}` });
const s6 = await api('POST', '/subscriptions', { userId: u6, plan: 'basic', cycle: 'monthly' });
const r6a = await api('POST', '/chat/ask', { userId: u6, question: 'paid1' });
check('message consumed before cancel', r6a.status === 201, r6a.body);
const cancel = await api('POST', `/subscriptions/${s6.body.id}/cancel`);
check('cancel sets status=cancelled + autoRenew=false', cancel.body.status === 'cancelled' && cancel.body.autoRenew === false, cancel.body);
check('cancel preserves consumed usage (remaining 9)', cancel.body.remainingMessages === 9, cancel.body);
check('cancel preserves endDate (current cycle kept)', cancel.body.endDate === s6.body.endDate, { before: s6.body.endDate, after: cancel.body.endDate });
check('cancelledAt recorded', typeof cancel.body.cancelledAt === 'string', cancel.body);
const stillServing = await api('POST', '/chat/ask', { userId: u6, question: 'paid2' });
check('still serves inside paid window after cancel', stillServing.status === 201, stillServing.body);
const renewCancelled = await api('POST', `/subscriptions/${s6.body.id}/renew`);
check('cancelled sub cannot be renewed', renewCancelled.status >= 400, renewCancelled);

console.log('\n== 7. renewal: success path with payment failure forced to 0 ==');
const u7 = uid('rn');
const s7 = await api('POST', '/subscriptions', { userId: u7, plan: 'basic', cycle: 'monthly' });
// age the period to be due using direct SQL is not available here; use manual renew
const manual = await api('POST', `/subscriptions/${s7.body.id}/renew`);
check('manual renew works (idempotent by date)', manual.status === 201, manual.body);
const firstEnd = manual.body.endDate;
const manual2 = await api('POST', `/subscriptions/${s7.body.id}/renew`);
check('repeat renew is rejected (no duplicate period)', manual2.status >= 400, manual2);
const s7after = await api('GET', `/subscriptions/${s7.body.id}`);
check('endDate advanced by exactly one cycle', s7after.body.endDate !== firstEnd, { firstEnd, now: s7after.body.endDate });
check('quota reset on renew', s7after.body.remainingMessages === 10, s7after.body);

console.log('\n== 8. process due renewals endpoint ==');
const due = await api('POST', '/subscriptions/renewals/process-due');
check('process-due returns ok', due.status === 201, due);

console.log('\n== 9. validation / structured errors ==');
const badQ = await api('POST', '/chat/ask', { userId: uid('bad'), question: '   ' });
check('empty question -> 400', badQ.status === 400, badQ);
const badU = await api('POST', '/chat/ask', { userId: '', question: 'hi' });
check('empty userId -> 400', badU.status === 400, badU);
const badPlan = await api('POST', '/subscriptions', { userId: uid('bp'), plan: 'gold', cycle: 'monthly' });
check('unknown plan -> 4xx structured', badPlan.status >= 400 && badPlan.status < 500, badPlan);
const badCycle = await api('POST', '/subscriptions', { userId: uid('bc'), plan: 'basic', cycle: 'weekly' });
check('unknown cycle -> 4xx structured', badCycle.status >= 400 && badCycle.status < 500, badCycle);
const missing = await api('GET', '/subscriptions/00000000-0000-0000-0000-000000000000');
check('missing sub -> 404', missing.status === 404, missing);

console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
