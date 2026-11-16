import { timingSafeEqual } from 'node:crypto';
import { batch } from '../../lib/db.mjs';

const day = 86400000;
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default async function dashboard(request) {
  if (request.method !== 'GET') return reply({ error: 'Método não permitido' }, 405);
  const key = process.env.DASHBOARD_KEY;
  const provided = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from('Bearer ' + key);
  if (!key || key.length < 24 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return reply({ error: 'Acesso restrito' }, 401);
  }
  const params = new URL(request.url).searchParams;
  const days = Number(params.get('days') ?? 7);
  const layer = params.get('layer') ?? '';
  const type = params.get('type') ?? '';
  if (![1, 7, 30, 90].includes(days) || !['', '0', '1'].includes(layer) || type.length > 100) {
    return reply({ error: 'Filtros inválidos' }, 400);
  }
  const args = [Date.now() - days * day];
  let where = 'published >= ?';
  if (layer !== '') { where += ' AND layer = ?'; args.push(Number(layer)); }
  const baseArgs = [...args];
  const baseWhere = where;
  if (type) { where += ' AND type = ?'; args.push(type); }
  try {
    const [cards, series, types, map, runs, options] = await batch([
      ['SELECT layer, count(*) AS total FROM events WHERE ' + where + ' GROUP BY layer', args],
      [`SELECT date(published/1000-10800,'unixepoch') AS day, layer, count(*) AS total
        FROM events WHERE ${where} GROUP BY day,layer ORDER BY day`, args],
      ['SELECT type, count(*) AS total FROM events WHERE ' + where + ' GROUP BY type ORDER BY total DESC LIMIT 12', args],
      [`SELECT layer,published,type,subtype,neighborhood,level,speed,geometry FROM events
        WHERE ${where} AND geometry IS NOT NULL ORDER BY published DESC LIMIT 500`, args],
      ['SELECT max(finished) AS last FROM runs'],
      ['SELECT DISTINCT type FROM events WHERE ' + baseWhere + ' ORDER BY type LIMIT 100', baseArgs]
    ]);
    return reply({ cards, series, types, map, last: runs[0]?.last, options });
  } catch {
    return reply({ error: 'Histórico indisponível. Confira a configuração e a primeira coleta.' }, 503);
  }
}
