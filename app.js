const state = {
  mode: 'polygon', // polygon (freehand) | points | pan | scale
  modeBeforeScale: 'polygon',
  panning: false,
  freehandDrawing: false,
  selectedSegmentId: null,
  hoverImagePoint: null,
  image: { el: new Image(), loaded: false, width: 0, height: 0 },
  viewport: { zoom: 1, minZoom: 0.2, maxZoom: 14, offsetX: 0, offsetY: 0 },
  scale: { metersPerPixel: null, points: [], awaitingDistance: false },
  currentContour: [],
  materials: [
    { id: 'm1', name: 'Асфальт', color: '#6b7280', price: 1650 },
    { id: 'm2', name: 'Бетон', color: '#94a3b8', price: 2200 },
    { id: 'm3', name: 'Газон', color: '#22c55e', price: 950 },
    { id: 'm4', name: 'Брусчатка', color: '#f59e0b', price: 2900 },
  ],
  activeMaterialId: 'm1',
  segments: [],
  nextId: 1,
  panStart: null,
};

const el = {
  canvas: document.getElementById('canvas'),
  imageInput: document.getElementById('imageInput'),
  setScaleBtn: document.getElementById('setScaleBtn'),
  materialSelect: document.getElementById('materialSelect'),
  exportBtn: document.getElementById('exportBtn'),
  metaBar: document.getElementById('metaBar'),
  estimateBody: document.getElementById('estimateBody'),
  estimateTotal: document.getElementById('estimateTotal'),
  toolPolygon: document.getElementById('toolPolygon'),
  toolPoints: document.getElementById('toolPoints'),
  toolPan: document.getElementById('toolPan'),
  toolDelete: document.getElementById('toolDelete'),
  toolUndo: document.getElementById('toolUndo'),
  toolClear: document.getElementById('toolClear'),
  toolScale: document.getElementById('toolScale'),
  scaleDistanceBox: document.getElementById('scaleDistanceBox'),
  scaleDistanceInput: document.getElementById('scaleDistanceInput'),
  applyScaleBtn: document.getElementById('applyScaleBtn'),
  cancelScaleBtn: document.getElementById('cancelScaleBtn'),
};

const ctx = el.canvas.getContext('2d');
const fmtN = (v, d = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(v);
const fmtM = (v) => `${fmtN(v, 2)} ₽`;
const getMaterial = (id) => state.materials.find((m) => m.id === id);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function areaShoelace(points) {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}
function pointInPolygon(point, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x; const yi = poly[i].y;
    const xj = poly[j].x; const yj = poly[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function syncCanvasSize() {
  const rect = el.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  el.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
function clientToCanvas(clientX, clientY) {
  const rect = el.canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}
function canvasToImage(p) {
  const { zoom, offsetX, offsetY } = state.viewport;
  return { x: (p.x - offsetX) / zoom, y: (p.y - offsetY) / zoom };
}
function imageToCanvas(p) {
  const { zoom, offsetX, offsetY } = state.viewport;
  return { x: p.x * zoom + offsetX, y: p.y * zoom + offsetY };
}

function fitToScreen() {
  if (!state.image.loaded) return;
  const rect = el.canvas.getBoundingClientRect();
  const z = Math.min(rect.width / state.image.width, rect.height / state.image.height);
  state.viewport.zoom = Math.max(state.viewport.minZoom, Math.min(state.viewport.maxZoom, z));
  state.viewport.offsetX = (rect.width - state.image.width * state.viewport.zoom) / 2;
  state.viewport.offsetY = (rect.height - state.image.height * state.viewport.zoom) / 2;
  render();
}
function zoomBy(factor, anchorCanvas = null) {
  const old = state.viewport.zoom;
  const next = Math.max(state.viewport.minZoom, Math.min(state.viewport.maxZoom, old * factor));
  if (Math.abs(next - old) < 1e-8) return;
  const anchor = anchorCanvas || { x: el.canvas.clientWidth / 2, y: el.canvas.clientHeight / 2 };
  const img = canvasToImage(anchor);
  state.viewport.zoom = next;
  state.viewport.offsetX = anchor.x - img.x * next;
  state.viewport.offsetY = anchor.y - img.y * next;
  render();
}

function recalcSegment(s) {
  const m = getMaterial(s.materialId);
  const k = state.scale.metersPerPixel || 0;
  const baseArea = areaShoelace(s.points) * (k ** 2);
  s.baseArea = baseArea;
  if (!s.areaManual) s.area = baseArea;
  if (!s.priceManual) s.price = m ? m.price : 0;
  s.total = s.area * s.price;
}
function recalcAll() { state.segments.forEach(recalcSegment); }

function drawPolygon(points, color, close = true, fill = false, w = 2) {
  if (!points.length) return;
  const p0 = imageToCanvas(points[0]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  points.slice(1).forEach((p) => {
    const s = imageToCanvas(p);
    ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}
function drawPoint(p, color, r = 3.2) {
  const s = imageToCanvas(p);
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function updateMeta(cursor = null) {
  const zoom = `Zoom: ${Math.round(state.viewport.zoom * 100)}%`;
  const scale = state.scale.metersPerPixel ? `Масштаб: 1px=${fmtN(state.scale.metersPerPixel, 5)}м` : 'Масштаб: —';
  const contourArea = state.currentContour.length >= 3 && state.scale.metersPerPixel
    ? areaShoelace(state.currentContour) * (state.scale.metersPerPixel ** 2)
    : null;
  const cur = cursor ? `Курсор: ${fmtN(cursor.x, 1)} / ${fmtN(cursor.y, 1)}` : 'Курсор: —';
  const a = contourArea ? `Текущий участок: ${fmtN(contourArea, 2)} м²` : 'Текущий участок: —';
  el.metaBar.textContent = `${scale} | ${zoom} | ${a} | ${cur}`;
}

function render() {
  const rect = el.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (state.image.loaded) {
    ctx.drawImage(
      state.image.el,
      state.viewport.offsetX,
      state.viewport.offsetY,
      state.image.width * state.viewport.zoom,
      state.image.height * state.viewport.zoom,
    );
  }

  state.segments.forEach((s) => {
    const m = getMaterial(s.materialId);
    drawPolygon(s.points, `${m?.color || '#64748b'}55`, true, true, 2);
    drawPolygon(s.points, s.id === state.selectedSegmentId ? '#2563eb' : (m?.color || '#64748b'), true, false, s.id === state.selectedSegmentId ? 3 : 2);
  });

  if (state.mode === 'scale' || state.scale.awaitingDistance) {
    drawPolygon(state.scale.points, '#ef4444', false, false, 2);
    state.scale.points.forEach((p) => drawPoint(p, '#ef4444', 5));
  }

  if (state.currentContour.length) {
    drawPolygon(state.currentContour, '#2563eb', false, false, 2);
    state.currentContour.slice(0, -1).forEach((p) => drawPoint(p, '#60a5fa', 3));
    drawPoint(state.currentContour[state.currentContour.length - 1], '#1d4ed8', 5); // последняя точка

    if (state.hoverImagePoint && (state.mode === 'points' || state.mode === 'polygon')) {
      const a = imageToCanvas(state.currentContour[state.currentContour.length - 1]);
      const b = imageToCanvas(state.hoverImagePoint);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  el.canvas.classList.toggle('pan', state.mode === 'pan');
  el.toolUndo.disabled = state.currentContour.length === 0;
  el.toolClear.disabled = state.currentContour.length === 0;
}

function renderMaterialsSelect() {
  el.materialSelect.innerHTML = '';
  state.materials.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    opt.selected = m.id === state.activeMaterialId;
    el.materialSelect.appendChild(opt);
  });
}

function estimateMaterialSelectHTML(selectedId) {
  return `<select data-field="materialId">${state.materials.map((m) => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${m.name}</option>`).join('')}</select>`;
}

function renderEstimate() {
  el.estimateBody.innerHTML = '';
  let sum = 0;

  state.segments.forEach((s) => {
    const tr = document.createElement('tr');
    tr.dataset.id = String(s.id);
    if (s.id === state.selectedSegmentId) tr.classList.add('row-selected');
    sum += s.total;

    tr.innerHTML = `
      <td><input data-field="label" value="${s.label}" /></td>
      <td>${estimateMaterialSelectHTML(s.materialId)}</td>
      <td>${fmtN(s.area, 2)}</td>
      <td><input data-field="price" type="number" step="1" value="${s.price.toFixed(2)}" /></td>
      <td>${fmtM(s.total)}</td>
      <td><button data-action="remove" type="button">✕</button></td>
    `;

    el.estimateBody.appendChild(tr);
  });

  el.estimateTotal.textContent = fmtM(sum);
}

function setMode(mode) {
  state.mode = mode;
  el.toolPolygon.classList.toggle('active', mode === 'polygon');
  el.toolPoints.classList.toggle('active', mode === 'points');
  el.toolPan.classList.toggle('active', mode === 'pan');
  el.toolScale.classList.toggle('active', mode === 'scale' || state.scale.awaitingDistance);
}

function createSegmentFromContour(points) {
  if (!state.scale.metersPerPixel) {
    alert('Сначала задайте масштаб.');
    return;
  }
  if (points.length < 3) {
    alert('Нужно минимум 3 точки.');
    return;
  }

  const s = {
    id: state.nextId,
    label: `Участок ${state.nextId}`,
    materialId: state.activeMaterialId,
    points: points.map((p) => ({ ...p })),
    baseArea: 0,
    area: 0,
    areaManual: false,
    price: 0,
    priceManual: false,
    total: 0,
  };
  recalcSegment(s);

  state.nextId += 1;
  state.segments.push(s);
  state.selectedSegmentId = s.id;
  state.currentContour = [];
  renderEstimate();
  render();
}

function pickSegment(clientX, clientY) {
  const p = canvasToImage(clientToCanvas(clientX, clientY));
  for (let i = state.segments.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(p, state.segments[i].points)) return state.segments[i].id;
  }
  return null;
}

function addPointOrScale(clientX, clientY) {
  if (!state.image.loaded) return;
  const p = canvasToImage(clientToCanvas(clientX, clientY));

  if (state.mode === 'scale') {
    if (state.scale.points.length >= 2) state.scale.points = [];
    state.scale.points.push(p);
    if (state.scale.points.length === 2) {
      state.scale.awaitingDistance = true;
      el.scaleDistanceBox.classList.remove('hidden');
      el.scaleDistanceInput.focus();
    }
    render();
    return;
  }

  if (state.mode === 'points') {
    state.currentContour.push(p);
    render();
  }
}

function startFreehand(clientX, clientY) {
  if (!state.image.loaded) return;
  state.freehandDrawing = true;
  const p = canvasToImage(clientToCanvas(clientX, clientY));
  state.currentContour = [p];
  render();
}
function moveFreehand(clientX, clientY) {
  if (!state.freehandDrawing) return;
  const p = canvasToImage(clientToCanvas(clientX, clientY));
  const last = state.currentContour[state.currentContour.length - 1];
  if (!last || dist(last, p) >= 3.5) {
    state.currentContour.push(p);
    render();
  }
}
function endFreehand() {
  if (!state.freehandDrawing) return;
  state.freehandDrawing = false;
  if (state.currentContour.length >= 3) createSegmentFromContour(state.currentContour);
  else state.currentContour = [];
}

function undoPoint() {
  if (!state.currentContour.length) return;
  state.currentContour.pop();
  render();
}

function clearCurrentPolygon() {
  state.currentContour = [];
  state.hoverImagePoint = null;
  render();
}

function startScaleTool() {
  state.modeBeforeScale = state.mode;
  state.scale.points = [];
  state.scale.awaitingDistance = false;
  el.scaleDistanceBox.classList.add('hidden');
  setMode('scale');
  render();
}

function applyScaleDistance() {
  if (state.scale.points.length !== 2) return;
  const px = dist(state.scale.points[0], state.scale.points[1]);
  const meters = Number(el.scaleDistanceInput.value);
  if (!px || meters <= 0) {
    alert('Введите корректное расстояние в метрах.');
    return;
  }
  state.scale.metersPerPixel = meters / px;
  state.scale.awaitingDistance = false;
  state.scale.points = [];
  el.scaleDistanceBox.classList.add('hidden');
  recalcAll();
  renderEstimate();
  setMode(state.modeBeforeScale === 'scale' ? 'points' : state.modeBeforeScale);
  render();
}

el.imageInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  state.image.el.onload = () => {
    state.image.loaded = true;
    state.image.width = state.image.el.naturalWidth;
    state.image.height = state.image.el.naturalHeight;
    state.currentContour = [];
    state.segments = [];
    state.selectedSegmentId = null;
    state.nextId = 1;
    state.scale = { metersPerPixel: null, points: [], awaitingDistance: false };
    el.scaleDistanceBox.classList.add('hidden');
    fitToScreen();
    renderEstimate();
    updateMeta();
  };
  state.image.el.src = url;
});

el.setScaleBtn.addEventListener('click', startScaleTool);
el.toolScale.addEventListener('click', startScaleTool);
el.applyScaleBtn.addEventListener('click', applyScaleDistance);
el.cancelScaleBtn.addEventListener('click', () => {
  state.scale.awaitingDistance = false;
  state.scale.points = [];
  el.scaleDistanceBox.classList.add('hidden');
  setMode(state.modeBeforeScale === 'scale' ? 'points' : state.modeBeforeScale);
  render();
});

el.materialSelect.addEventListener('change', (e) => { state.activeMaterialId = e.target.value; });
el.exportBtn.addEventListener('click', () => {
  const rows = [['Участок', 'Покрытие', 'Площадь м2', 'Цена', 'Стоимость']];
  state.segments.forEach((s) => {
    const m = getMaterial(s.materialId);
    rows.push([s.label, m?.name || '', s.area.toFixed(2), s.price.toFixed(2), s.total.toFixed(2)]);
  });
  const csv = rows.map((r) => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'estimate.csv';
  a.click();
});

el.toolPolygon.addEventListener('click', () => setMode('polygon'));
el.toolPoints.addEventListener('click', () => setMode('points'));
el.toolPan.addEventListener('click', () => setMode('pan'));
el.toolDelete.addEventListener('click', () => {
  if (state.selectedSegmentId == null) return;
  state.segments = state.segments.filter((s) => s.id !== state.selectedSegmentId);
  state.selectedSegmentId = null;
  renderEstimate();
  render();
});
el.toolUndo.addEventListener('click', undoPoint);
el.toolClear.addEventListener('click', clearCurrentPolygon);

el.canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.viewport.offsetX, oy: state.viewport.offsetY };
    el.canvas.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;

  if (state.mode === 'pan') {
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.viewport.offsetX, oy: state.viewport.offsetY };
    el.canvas.classList.add('panning');
    return;
  }

  if (state.mode === 'points' || state.mode === 'scale') {
    addPointOrScale(e.clientX, e.clientY);
    return;
  }

  if (state.mode === 'polygon') {
    const hit = pickSegment(e.clientX, e.clientY);
    if (hit) {
      state.selectedSegmentId = hit;
      renderEstimate();
      render();
      return;
    }
    startFreehand(e.clientX, e.clientY);
  }
});

el.canvas.addEventListener('dblclick', () => {
  if (state.mode === 'points' && state.currentContour.length >= 3) {
    createSegmentFromContour(state.currentContour);
  }
});

window.addEventListener('mousemove', (e) => {
  const img = canvasToImage(clientToCanvas(e.clientX, e.clientY));
  state.hoverImagePoint = img;
  updateMeta(img);

  if (state.panning && state.panStart) {
    state.viewport.offsetX = state.panStart.ox + (e.clientX - state.panStart.x);
    state.viewport.offsetY = state.panStart.oy + (e.clientY - state.panStart.y);
    render();
    return;
  }

  if (state.freehandDrawing) moveFreehand(e.clientX, e.clientY);
  else if (state.currentContour.length && (state.mode === 'points' || state.mode === 'polygon')) render();
});

window.addEventListener('mouseup', () => {
  if (state.freehandDrawing) endFreehand();
  state.panning = false;
  state.panStart = null;
  el.canvas.classList.remove('panning');
});

el.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
el.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.1 : 0.9, clientToCanvas(e.clientX, e.clientY));
  updateMeta();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') undoPoint();
  if (e.key === 'Enter' && state.mode === 'points' && state.currentContour.length >= 3) createSegmentFromContour(state.currentContour);
  if (e.key === 'Escape') clearCurrentPolygon();
});

el.estimateBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const id = Number(row.dataset.id);
  state.selectedSegmentId = id;

  if (e.target.dataset.action === 'remove') {
    state.segments = state.segments.filter((s) => s.id !== id);
    state.selectedSegmentId = null;
  }

  renderEstimate();
  render();
});

el.estimateBody.addEventListener('input', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const s = state.segments.find((x) => x.id === Number(row.dataset.id));
  if (!s) return;

  const field = e.target.dataset.field;
  if (field === 'label') s.label = e.target.value;
  if (field === 'materialId') {
    s.materialId = e.target.value;
    s.priceManual = false;
  }
  if (field === 'price') {
    s.price = Math.max(0, Number(e.target.value) || 0);
    s.priceManual = true;
  }

  recalcSegment(s);
  renderEstimate();
  render();
});

window.addEventListener('resize', syncCanvasSize);

setMode('polygon');
renderMaterialsSelect();
renderEstimate();
syncCanvasSize();
updateMeta();
