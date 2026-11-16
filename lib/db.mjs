export async function batch(statements) {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!databaseUrl || !token) throw new Error('Configuração Turso ausente');
  const url = new URL(databaseUrl.replace(/^libsql:/, 'https:'));
  if (url.protocol !== 'https:' || url.username || url.password || !token) {
    throw new Error('Configuração Turso inválida');
  }
  const execute = ([sql, args = []]) => ({
    type: 'execute',
    stmt: { sql, args: args.map(value => value == null ? { type: 'null' } :
      typeof value === 'number' ? { type: 'integer', value: String(value) } :
        { type: 'text', value }) }
  });
  const requests = statements.map(execute);
  const response = await fetch(new URL('/v2/pipeline', url), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] })
  });
  if (!response.ok) throw new Error('Turso HTTP ' + response.status);
  const { results } = await response.json();
  if (results.length !== requests.length + 1 || results.some(item => item.type !== 'ok')) {
    const code = results.find(item => item.type === 'error')?.error?.code;
    throw new Error('Falha ao executar consulta Turso' + (/^[A-Z0-9_]+$/.test(code ?? '') ? ' (' + code + ')' : ''));
  }
  return results.slice(0, -1).map(({ response }) => {
    const { cols, rows } = response.result;
    return rows.map(row => Object.fromEntries(row.map((cell, index) => [
      cols[index].name, cell.type === 'integer' || cell.type === 'float' ? Number(cell.value) : cell.value ?? null
    ])));
  });
}
