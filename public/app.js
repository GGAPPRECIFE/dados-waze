const get = id => document.getElementById(id);
const number = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Recife'
});
let key = '';
let pending;
let map;
let shapes;

function bars(id, items) {
  const target = get(id);
  target.className = 'chart';
  target.replaceChildren();
  const max = Math.max(1, ...items.map(item => item.total));
  if (!items.length) target.textContent = 'Sem registros no período.';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('span');
    label.textContent = item.label;
    const bar = document.createElement('progress');
    bar.max = max;
    bar.value = item.total;
    bar.setAttribute('aria-label', item.label);
    const count = document.createElement('span');
    count.textContent = number.format(item.total);
    row.append(label, bar, count);
    target.append(row);
  }
}

function render(data) {
  get('login').hidden = true;
  get('panel').hidden = false;
  get('last').textContent = data.last ? 'Última coleta concluída · ' + date.format(data.last) : 'Aguardando coleta';
  get('alerts').textContent = number.format(data.cards.find(row => row.layer === 0)?.total ?? 0);
  get('traffic').textContent = number.format(data.cards.find(row => row.layer === 1)?.total ?? 0);
  const selected = get('type').value;
  get('type').replaceChildren(new Option('Todos', ''), ...data.options.map(row => new Option(row.type, row.type)));
  if (data.options.some(row => row.type === selected)) get('type').value = selected;
  bars('series', data.series.map(row => ({
    label: row.day.split('-').slice(1).reverse().join('/') + (row.layer === 0 ? ' · Alertas' : ' · Trânsito'),
    total: row.total
  })));
  bars('types', data.types.map(row => ({ label: row.type, total: row.total })));
  get('map-caption').textContent = number.format(data.map.length) + ' registros no mapa · até 500, por ordem de publicação mais recente.';
  if (!window.L) {
    get('map').textContent = 'Mapa indisponível.';
    return;
  }
  if (!map) {
    map = L.map('map', { preferCanvas: true }).setView([-8.056, -34.91], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    shapes = L.geoJSON([], {
      style: { color: '#945014', weight: 3 },
      pointToLayer: (_, location) => L.circleMarker(location, { radius: 5, color: '#116b5a', fillOpacity: .8 }),
      onEachFeature: ({ properties }, shape) => {
        const label = document.createElement('div');
        label.textContent = [properties.type, properties.subtype, properties.neighborhood,
          date.format(properties.published)].filter(Boolean).join(' · ');
        shape.bindPopup(label);
      }
    }).addTo(map);
  }
  map.invalidateSize();
  shapes.clearLayers();
  for (const { geometry, ...properties } of data.map) {
    shapes.addData({ type: 'Feature', geometry: JSON.parse(geometry), properties });
  }
}

async function load() {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  get('status').textContent = 'Carregando histórico…';
  const filters = new URLSearchParams(['days', 'layer', 'type'].map(id => [id, get(id).value]));
  try {
    const response = await fetch('/api/dashboard?' + filters, {
      headers: { Authorization: 'Bearer ' + key }, signal: controller.signal
    });
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) throw new Error(data.error);
    render(data);
    get('status').textContent = '';
  } catch (error) {
    if (!controller.signal.aborted) get('status').textContent = error.message || 'Falha ao carregar.';
  }
}

get('login').addEventListener('submit', event => {
  event.preventDefault();
  key = get('key').value;
  get('key').value = '';
  load();
});
for (const id of ['days', 'layer', 'type']) {
  get(id).addEventListener('change', () => {
    if (id !== 'type') get('type').value = '';
    load();
  });
}
get('logout').addEventListener('click', () => window.location.reload());
