const state = {
  mode: 'draw', // draw | scale | pan | select
  isSpacePan: false,
  panning: false,
  selectedSegmentId: null,
  image: { el: new Image(), loaded: false, width: 0, height: 0 },
  viewport: { zoom: 1, minZoom: 0.2, maxZoom: 12, offsetX: 0, offsetY: 0 },
  scale: { metersPerPixel: null, points: [] },
  currentContour: [],
  materials: [
    { id: 'm1', number: '1', name: 'Асфальт', color: '#6b7280', price: 1650 },
    { id: 'm2', number: '2', name: 'Бетон', color: '#94a3b8', price: 2200 },
    { id: 'm3', number: '3', name: 'Газон', color: '#22c55e', price: 950 },
    { id: 'm4', number: '4', name: 'Брусчатка', color: '#f59e0b', price: 2900 },
  ],
  activeMaterialId: 'm1',
  segments: [],
  nextId: 1,
  panStart: null,
};

const el = {
  imageInput: document.getElementById('imageInput'),
  openEditorBtn: document.getElementById('openEditorBtn'),
  closeEditorBtn: document.getElementById('closeEditorBtn'),
  editorOverlay: document.getElementById('editorOverlay'),
  editorTools: document.getElementById('editorTools'),
  toggleToolsBtn: document.getElementById('toggleToolsBtn'),

  canvas: document.getElementById('canvas'),
  materialSelect: document.getElementById('materialSelect'),
  materialsTable: document.getElementById('materialsTable'),
  estimateBody: document.getElementById('estimateBody'),
  estimateTotal: document.getElementById('estimateTotal'),
  scaleInfo: document.getElementById('scaleInfo'),
  zoomInfo: document.getElementById('zoomInfo'),
  cursorInfo: document.getElementById('cursorInfo'),

  realDistanceInput: document.getElementById('realDistanceInput'),
  toolDraw: document.getElementById('toolDraw'),
  toolScale: document.getElementById('toolScale'),
  toolPan: document.getElementById('toolPan'),
  toolSelect: document.getElementById('toolSelect'),
  undoPoint: document.getElementById('undoPoint'),
  clearContour: document.getElementById('clearContour'),
  closeContour: document.getElementById('closeContour'),
  deleteSelected: document.getElementById('deleteSelected'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoom100: document.getElementById('zoom100'),
  fitView: document.getElementById('fitView'),
  resetView: document.getElementById('resetView'),

  addMaterial: document.getElementById('addMaterial'),
  mNumber: document.getElementById('mNumber'),
  mName: document.getElementById('mName'),
  mColor: document.getElementById('mColor'),
  mPrice: document.getElementById('mPrice'),
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
function perim(points) {
  let p = 0;
  for (let i = 0; i < points.length; i += 1) p += dist(points[i], points[(i + 1) % points.length]);
  return p;
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
  s.baseArea = areaShoelace(s.points) * (k ** 2);
  s.basePerimeter = perim(s.points) * k;
  s.basePrice = m ? m.price : 0;
  if (!s.overrides.areaManual) s.area = s.baseArea;
  if (!s.overrides.perimeterManual) s.perimeter = s.basePerimeter;
  if (!s.overrides.priceManual) s.price = s.basePrice;
  s.total = s.area * s.price;
}
function recalcAll() { state.segments.forEach(recalcSegment); }

function drawPolygon(points, color, close = true, fill = false, w = 2) {
  if (!points.length) return;
  const p0 = imageToCanvas(points[0]);
  ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
  points.slice(1).forEach((p) => { const s = imageToCanvas(p); ctx.lineTo(s.x, s.y); });
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
function drawPoint(p, color, r = 4) {
  const s = imageToCanvas(p);
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
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
    drawPolygon(s.points, s.id === state.selectedSegmentId ? '#22c55e' : (m?.color || '#64748b'), true, false, s.id === state.selectedSegmentId ? 3 : 2);
  });

  if (state.mode === 'scale') {
    drawPolygon(state.scale.points, '#ef4444', false, false, 2);
    state.scale.points.forEach((p) => drawPoint(p, '#ef4444', 5));
  }

  if (state.currentContour.length) {
    drawPolygon(state.currentContour, '#3b82f6', false, false, 2);
    state.currentContour.forEach((p) => drawPoint(p, '#3b82f6', 4));
  }

  el.zoomInfo.textContent = `Zoom: ${Math.round(state.viewport.zoom * 100)}%`;
}

function renderMaterials() {
  el.materialSelect.innerHTML = '';
  el.materialsTable.innerHTML = '';

  state.materials.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.number} — ${m.name}`;
    opt.selected = m.id === state.activeMaterialId;
    el.materialSelect.appendChild(opt);

    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.number}</td><td>${m.name}</td><td><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${m.color}"></span></td><td>${fmtN(m.price)}</td>`;
    el.materialsTable.appendChild(tr);
  });
}

function materialSelectHTML(selectedId) {
  return `<select data-field="materialId">${state.materials.map((m) => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${m.name}</option>`).join('')}</select>`;
}

function renderEstimate() {
  el.estimateBody.innerHTML = '';
  let sum = 0;

  state.segments.forEach((s) => {
    const m = getMaterial(s.materialId);
    sum += s.total;
    const tr = document.createElement('tr');
    tr.dataset.id = String(s.id);
    if (s.id === state.selectedSegmentId) tr.classList.add('selected-row');

    tr.innerHTML = `
      <td><input data-field="label" value="${s.label}" /></td>
      <td>${materialSelectHTML(s.materialId)}</td>
      <td>${m?.number || '-'}</td>
      <td><input data-field="area" type="number" step="0.01" value="${s.area.toFixed(2)}" class="${s.overrides.areaManual ? 'manual' : ''}" /></td>
      <td><input data-field="perimeter" type="number" step="0.01" value="${s.perimeter.toFixed(2)}" class="${s.overrides.perimeterManual ? 'manual' : ''}" /></td>
      <td><input data-field="price" type="number" step="1" value="${s.price.toFixed(2)}" class="${s.overrides.priceManual ? 'manual' : ''}" /></td>
      <td>${fmtM(s.total)}</td>
      <td class="inline-actions">
        <button data-action="duplicate" type="button">Дублировать</button>
        <button data-action="reset" type="button">Сброс</button>
        <button data-action="remove" type="button">Удалить</button>
      </td>`;

    el.estimateBody.appendChild(tr);
  });

  el.estimateTotal.textContent = fmtM(sum);
}

function updateScaleInfo() {
  if (!state.scale.metersPerPixel) {
    el.scaleInfo.textContent = 'Масштаб не задан';
    return;
  }
  el.scaleInfo.textContent = `1 px = ${fmtN(state.scale.metersPerPixel, 5)} м | 1 px² = ${fmtN(state.scale.metersPerPixel ** 2, 7)} м²`;
}

function setMode(mode) {
  state.mode = mode;
  el.toolDraw.classList.toggle('active-tool', mode === 'draw');
  el.toolScale.classList.toggle('active-tool', mode === 'scale');
  el.toolPan.classList.toggle('active-tool', mode === 'pan' || state.isSpacePan);
  el.toolSelect.classList.toggle('active-tool', mode === 'select');
  el.canvas.classList.toggle('pan', mode === 'pan' || state.isSpacePan);
}

function pickSegment(clientX, clientY) {
  const p = canvasToImage(clientToCanvas(clientX, clientY));
  for (let i = state.segments.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(p, state.segments[i].points)) return state.segments[i].id;
  }
  return null;
}

function addPoint(clientX, clientY) {
  if (!state.image.loaded) return;
  const p = canvasToImage(clientToCanvas(clientX, clientY));

  if (state.mode === 'scale') {
    if (state.scale.points.length === 2) {
      state.scale.points = [];
      state.scale.metersPerPixel = null;
    }
    state.scale.points.push(p);
    if (state.scale.points.length === 2) {
      const px = dist(state.scale.points[0], state.scale.points[1]);
      const m = Number(el.realDistanceInput.value);
      if (px && m > 0) {
        state.scale.metersPerPixel = m / px;
        recalcAll();
        updateScaleInfo();
        renderEstimate();
        setMode('draw');
      }
    }
    render();
    return;
  }

  if (state.mode === 'draw') {
    state.currentContour.push(p);
    render();
  }
}

function closeContour() {
  if (state.currentContour.length < 3) {
    alert('Нельзя замкнуть контур меньше чем с 3 точками.');
    return;
  }
  if (!state.scale.metersPerPixel) {
    alert('Нельзя считать без масштаба.');
    return;
  }

  const s = {
    id: state.nextId,
    label: `Участок ${state.nextId}`,
    materialId: state.activeMaterialId,
    points: state.currentContour.map((p) => ({ ...p })),
    overrides: { areaManual: false, perimeterManual: false, priceManual: false },
    baseArea: 0,
    basePerimeter: 0,
    basePrice: 0,
    area: 0,
    perimeter: 0,
    price: 0,
    total: 0,
  };
  recalcSegment(s);
  state.segments.push(s);
  state.selectedSegmentId = s.id;
  state.nextId += 1;
  state.currentContour = [];
  renderEstimate();
  render();
}

function openEditor() {
  el.editorOverlay.classList.remove('hidden');
  el.editorOverlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    syncCanvasSize();
    if (state.image.loaded) fitToScreen();
  }, 0);
}
function closeEditor() {
  el.editorOverlay.classList.add('hidden');
  el.editorOverlay.setAttribute('aria-hidden', 'true');
}

el.openEditorBtn.addEventListener('click', openEditor);
el.closeEditorBtn.addEventListener('click', closeEditor);
el.toggleToolsBtn.addEventListener('click', () => {
  el.editorTools.classList.toggle('collapsed');
  el.toggleToolsBtn.textContent = el.editorTools.classList.contains('collapsed') ? 'Показать панель' : 'Свернуть панель';
  setTimeout(syncCanvasSize, 10);
});

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
    state.scale = { metersPerPixel: null, points: [] };
    updateScaleInfo();
    renderEstimate();
    openEditor();
  };
  state.image.el.src = url;
});

el.addMaterial.addEventListener('click', () => {
  const name = el.mName.value.trim();
  if (!name) { alert('Нельзя добавить материал без названия.'); return; }
  const id = `m${Date.now()}`;
  state.materials.push({
    id,
    number: el.mNumber.value.trim() || String(state.materials.length + 1),
    name,
    color: el.mColor.value,
    price: Math.max(0, Number(el.mPrice.value) || 0),
  });
  state.activeMaterialId = id;
  renderMaterials();
  recalcAll();
  renderEstimate();
});

el.materialSelect.addEventListener('change', (e) => { state.activeMaterialId = e.target.value; });

el.toolDraw.addEventListener('click', () => setMode('draw'));
el.toolScale.addEventListener('click', () => setMode('scale'));
el.toolPan.addEventListener('click', () => setMode('pan'));
el.toolSelect.addEventListener('click', () => setMode('select'));
el.undoPoint.addEventListener('click', () => { state.currentContour.pop(); render(); });
el.clearContour.addEventListener('click', () => { state.currentContour = []; render(); });
el.closeContour.addEventListener('click', closeContour);
el.deleteSelected.addEventListener('click', () => {
  if (state.selectedSegmentId == null) return;
  state.segments = state.segments.filter((s) => s.id !== state.selectedSegmentId);
  state.selectedSegmentId = null;
  renderEstimate();
  render();
});
el.zoomIn.addEventListener('click', () => zoomBy(1.2));
el.zoomOut.addEventListener('click', () => zoomBy(0.83));
el.zoom100.addEventListener('click', () => { state.viewport.zoom = 1; render(); });
el.fitView.addEventListener('click', fitToScreen);
el.resetView.addEventListener('click', fitToScreen);

el.canvas.addEventListener('mousedown', (e) => {
  const panNow = state.mode === 'pan' || state.isSpacePan || e.button === 1;
  if (panNow) {
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.viewport.offsetX, oy: state.viewport.offsetY };
    el.canvas.classList.add('panning');
    return;
  }

  const hit = pickSegment(e.clientX, e.clientY);
  if (state.mode === 'select' && hit) {
    state.selectedSegmentId = hit;
    renderEstimate();
    render();
    return;
  }

  if (hit && state.mode !== 'draw') {
    state.selectedSegmentId = hit;
    renderEstimate();
    render();
    return;
  }

  addPoint(e.clientX, e.clientY);
});

window.addEventListener('mousemove', (e) => {
  const c = clientToCanvas(e.clientX, e.clientY);
  const i = canvasToImage(c);
  el.cursorInfo.textContent = `X: ${fmtN(i.x, 1)} Y: ${fmtN(i.y, 1)}`;

  if (!state.panning || !state.panStart) return;
  state.viewport.offsetX = state.panStart.ox + (e.clientX - state.panStart.x);
  state.viewport.offsetY = state.panStart.oy + (e.clientY - state.panStart.y);
  render();
});
window.addEventListener('mouseup', () => {
  state.panning = false;
  state.panStart = null;
  el.canvas.classList.remove('panning');
});

el.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.1 : 0.9, clientToCanvas(e.clientX, e.clientY));
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { state.isSpacePan = true; setMode(state.mode); e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { state.currentContour.pop(); render(); }
  if (e.key === 'Enter') closeContour();
  if (e.key === 'Escape') { if (!el.editorOverlay.classList.contains('hidden')) closeEditor(); }
  if (e.key === '+' || e.key === '=') zoomBy(1.12);
  if (e.key === '-') zoomBy(0.89);
  if (e.key.toLowerCase() === 'f') {
    if (el.editorOverlay.classList.contains('hidden')) openEditor();
    else closeEditor();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { state.isSpacePan = false; setMode(state.mode); }
});

el.estimateBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const id = Number(row.dataset.id);
  state.selectedSegmentId = id;

  const action = e.target.dataset.action;
  const s = state.segments.find((x) => x.id === id);
  if (!s) return;

  if (action === 'remove') state.segments = state.segments.filter((x) => x.id !== id);
  if (action === 'duplicate') {
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = state.nextId;
    copy.label = `${s.label} (копия)`;
    state.nextId += 1;
    state.segments.push(copy);
  }
  if (action === 'reset') {
    s.overrides = { areaManual: false, perimeterManual: false, priceManual: false };
    recalcSegment(s);
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
  if (field === 'materialId') { s.materialId = e.target.value; s.overrides.priceManual = false; }
  if (field === 'area') { s.area = Math.max(0, Number(e.target.value) || 0); s.overrides.areaManual = true; }
  if (field === 'perimeter') { s.perimeter = Math.max(0, Number(e.target.value) || 0); s.overrides.perimeterManual = true; }
  if (field === 'price') { s.price = Math.max(0, Number(e.target.value) || 0); s.overrides.priceManual = true; }

  recalcSegment(s);
  renderEstimate();
  render();
});

window.addEventListener('resize', syncCanvasSize);

setMode('draw');
renderMaterials();
renderEstimate();
updateScaleInfo();
syncCanvasSize();
