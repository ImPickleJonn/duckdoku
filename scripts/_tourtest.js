const express = require('express');
const { register } = require('../tourney');
const app = express(); app.use(express.json());
const validateInitData = (d) => (d === 'TGUSER') ? { id: 123, first_name: 'Tg', username: 'tg' } : null;
register(app, { dbPool: null, validateInitData, users: new Map(), noteUser: () => {} });
const srv = app.listen(8810, async () => {
  const f = (p, o) => fetch('http://127.0.0.1:8810' + p, o).then(r => r.json());
  const cc = await f('/api/tourney/countries');
  console.log('countries:', cc.countries.length, '| top3:', cc.countries.slice(0, 3).map(c => c.country + ':' + c.goals).join(', '));
  const co = await f('/api/tourney/country', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cc: 'US', guestId: 'anon-test123' }) });
  console.log('country US:', co.players.length, '| me:', JSON.stringify(co.me), '| flagged:', co.players.filter(p => p.me).length, '| top3:', co.players.slice(0, 3).map(p => p.rank + '.' + p.name + '(' + p.goals + ')').join(', '));
  const sub = await f('/api/tourney/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: 1, score: 25, timeMs: 90000, country: 'BR', name: 'Pickle', guestId: 'anon-test123' }) });
  console.log('GUEST submit ok:', sub.ok, '| myRank:', sub.myRank, '| scores:', (sub.board || []).map(b => b.score).join(','));
  const cn = await f('/api/tourney/claim-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guestId: 'anon-test123', name: 'Pickle' }) });
  console.log('GUEST claim-name:', JSON.stringify(cn));
  srv.close();
});
