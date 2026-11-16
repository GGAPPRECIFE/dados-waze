import { createHash } from 'node:crypto';
import { batch } from '../lib/db.mjs';

const host = 'https://esigportal2.recife.pe.gov.br';
const service = host + '/arcgis/rest/services/Geoevent/BASES_FEEDS_WAZE_24HORAS/FeatureServer';
const fields = [
  'OBJECTID,UUID,GLOBALID,PUBMILLIS,TYPE,SUBTYPE,NMBAIRRO',
  'OBJECTID,UUID,PUBMILLIS,TYPE,LEVEL,SPEEDKMH'
];
const probe = process.env.PROBE_ONLY === 'true';
let token;

async function post(url, params) {
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
    body: new URLSearchParams({ f: 'json', ...params })
  });
  if (!response.ok) throw new Error('ArcGIS HTTP ' + response.status);
  return response.json();
}

async function authenticate() {
  const url = new URL(process.env.ARCGIS_TOKEN_URL || host + '/portal/sharing/rest/generateToken');
  const { ARCGIS_USERNAME: username, ARCGIS_PASSWORD: password } = process.env;
  if (url.origin !== host || !username || !password) throw new Error('Configuração ArcGIS inválida');
  const result = await post(url, { username, password, client: 'requestip', expiration: 60 });
  if (!result.token) throw new Error('Autenticação ArcGIS recusada (' + Number(result.error?.code) + ')');
  token = result.token;
}

async function query(url, params = {}) {
  let result = await post(url, { ...params, token });
  if ([498, 499].includes(result.error?.code)) {
    await authenticate();
    result = await post(url, { ...params, token });
  }
  if (result.error) throw new Error('ArcGIS REST ' + Number(result.error.code));
  return result;
}

function statement(layer, { attributes: a, geometry: g }, stamp) {
  if (!Number.isSafeInteger(a.PUBMILLIS) || a.PUBMILLIS <= 0) {
    throw new Error('PUBMILLIS inválido na camada ' + layer);
  }
  // Escopo por camada e publicação preserva novas observações de um UUID reutilizado.
  const identity = a.UUID?.trim() || a.GLOBALID?.trim() || String(a.OBJECTID);
  const id = createHash('sha256').update(JSON.stringify([layer, identity, a.PUBMILLIS])).digest('hex');
  const point = Number.isFinite(g?.x) && Number.isFinite(g?.y);
  const geometry = layer === 0 && point ? { type: 'Point', coordinates: [g.x, g.y] } :
    layer === 1 && g?.paths?.length ? { type: 'MultiLineString', coordinates: g.paths } : null;
  return [`INSERT INTO events (id,layer,published,type,subtype,neighborhood,level,speed,geometry,first_seen,last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    last_seen=MAX(events.last_seen,excluded.last_seen)`, [
    id, layer, a.PUBMILLIS, a.TYPE || 'Sem tipo', layer === 0 ? a.SUBTYPE : null,
    layer === 0 ? a.NMBAIRRO : null, layer === 1 ? a.LEVEL : null,
    layer === 1 ? a.SPEEDKMH : null, geometry ? JSON.stringify(geometry) : null, stamp, stamp
  ]];
}

async function collect(layer, stamp) {
  const endpoint = service + '/' + layer;
  const meta = await query(endpoint);
  const expected = layer === 0 ? 'esriGeometryPoint' : 'esriGeometryPolyline';
  const available = new Set(meta.fields?.map(field => field.name));
  if (meta.geometryType !== expected || !fields[layer].split(',').every(field => available.has(field))) {
    throw new Error('Esquema inesperado na camada ' + layer);
  }
  const url = endpoint + '/query';
  const { objectIds } = await query(url, { where: '1=1', returnIdsOnly: true });
  if (!Array.isArray(objectIds) || !objectIds.every(Number.isSafeInteger)) {
    throw new Error('ArcGIS não retornou a lista de IDs');
  }
  if (probe) {
    if (objectIds.length) {
      const sample = await query(url, {
        objectIds: String(objectIds[0]), outFields: fields[layer], outSR: 4326, returnGeometry: true
      });
      if (!sample.features?.length) throw new Error('Consulta de amostra vazia');
      statement(layer, sample.features[0], stamp);
    }
    console.log('Camada', layer, '| acesso verificado | IDs:', objectIds.length);
    return;
  }
  let missing = 0;
  for (let start = 0; start < objectIds.length; start += 100) {
    const ids = objectIds.slice(start, start + 100);
    const { features, exceededTransferLimit } = await query(url, {
      objectIds: ids.join(','), outFields: fields[layer], outSR: 4326, returnGeometry: true
    });
    if (!Array.isArray(features) || exceededTransferLimit) throw new Error('Lote ArcGIS incompleto');
    missing += ids.length - features.length;
    if (features.length) await batch(features.map(feature => statement(layer, feature, stamp)));
  }
  console.log('Camada', layer, '| consultados:', objectIds.length, '| expirados durante coleta:', missing);
}

async function main() {
  const stamp = Date.now();
  await authenticate();
  if (!probe) await batch([
    [`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, layer INTEGER NOT NULL,
      published INTEGER NOT NULL, type TEXT NOT NULL, subtype TEXT, neighborhood TEXT, level INTEGER,
      speed INTEGER, geometry TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL)`],
    ['CREATE INDEX IF NOT EXISTS events_period ON events(published)'],
    ['CREATE TABLE IF NOT EXISTS runs (finished INTEGER PRIMARY KEY)']
  ]);
  for (const layer of [0, 1]) await collect(layer, stamp);
  if (!probe) await batch([['INSERT INTO runs VALUES (?)', [Date.now()]]]);
}

main().catch(error => {
  console.error('Coleta interrompida:', error instanceof SyntaxError || error instanceof TypeError ?
    'falha de conexão, configuração ou formato de resposta' : error.message);
  process.exitCode = 1;
});
