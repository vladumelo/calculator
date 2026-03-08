// ===== State =====
const state = {
  mode: 'draw', // draw | scale | pan
  isSpacePan: false,
  panning: false,
  selectedSegmentId: null,
  image: { el: new Image(), loaded: false, width: 0, height: 0 },
  viewport: { zoom: 1, minZoom: 0.2, maxZoom: 12, offsetX: 0, offsetY: 0 },
  scale: { metersPerPixel: null, points: [] },
  currentContour: [], // image coordinates
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
  canvas: document.getElementById('canvas'),
  canvasPanel: document.getElementById('canvasPanel'),
  imageInput: document.getElementById('imageInput'),
  materialSelect: document.getElementById('materialSelect'),
  materialsTable: document.getElementById('materialsTable'),
  estimateBody: document.getElementById('estimateBody'),
  estimateTotal: document.getElementById('estimateTotal'),
  scaleInfo: document.getElementById('scaleInfo'),
  realDistanceInput: document.getElementById('realDistanceInput'),
  toolDraw: document.getElementById('toolDraw'),
  toolScale: document.getElementById('toolScale'),
  toolPan: document.getElementById('toolPan'),
  undoPoint: document.getElementById('undoPoint'),
  clearContour: document.getElementById('clearContour'),
  closeContour: document.getElementById('closeContour'),
  deleteSelected: document.getElementById('deleteSelected'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoom100: document.getElementById('zoom100'),
  fitView: document.getElementById('fitView'),
  resetView: document.getElementById('resetView'),
  fullscreen: document.getElementById('fullscreen'),
  editorRoot: document.getElementById('editorRoot'),
  addMaterial: document.getElementById('addMaterial'),
  mNumber: document.getElementById('mNumber'),
  mName: document.getElementById('mName'),
  mColor: document.getElementById('mColor'),
  mPrice: document.getElementById('mPrice'),
};
const ctx = el.canvas.getContext('2d');

// ===== Utils =====
const fmtN = (v, d = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(v);
const fmtM = (v) => `${fmtN(v, 2)} ₽`;
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
const getMaterial = (id) => state.materials.find((m) => m.id === id);

// ===== Viewport / coordinates =====
function syncCanvasSize() {
  const rect = el.canvasPanel.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  el.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  el.canvas.style.width = `${Math.round(rect.width)}px`;
  el.canvas.style.height = `${Math.round(rect.height)}px`;
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
  const oldZ = state.viewport.zoom;
  let newZ = oldZ * factor;
  newZ = Math.max(state.viewport.minZoom, Math.min(state.viewport.maxZoom, newZ));
  if (Math.abs(newZ - oldZ) < 1e-8) return;

  const anchor = anchorCanvas || { x: el.canvas.clientWidth / 2, y: el.canvas.clientHeight / 2 };
  const imgBefore = canvasToImage(anchor);
  state.viewport.zoom = newZ;
  state.viewport.offsetX = anchor.x - imgBefore.x * newZ;
  state.viewport.offsetY = anchor.y - imgBefore.y * newZ;
  render();
}
function resetView() {
  fitToScreen();
}

// ===== Geometry / estimate =====
function recalcSegment(segment) {
  const m = getMaterial(segment.materialId);
  const baseAreaPx = areaShoelace(segment.points);
  const basePerPx = perim(segment.points);
  const k = state.scale.metersPerPixel || 0;
  segment.baseArea = baseAreaPx * (k ** 2);
  segment.basePerimeter = basePerPx * k;
  segment.basePrice = m ? m.price : 0;

  if (!segment.overrides.areaManual) segment.area = segment.baseArea;
  if (!segment.overrides.perimeterManual) segment.perimeter = segment.basePerimeter;
  if (!segment.overrides.priceManual) segment.price = segment.basePrice;
  segment.total = segment.area * segment.price;
}
function recalcAllSegments() {
  state.segments.forEach(recalcSegment);
}

// ===== Rendering =====
function drawPolygon(points, color, close = true, fill = false, width = 2) {
  if (!points.length) return;
  const s0 = imageToCanvas(points[0]);
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  points.slice(1).forEach((p) => {
    const s = imageToCanvas(p); ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function drawPoint(p, color, r = 4) {
  const s = imageToCanvas(p);
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function render() {
  const rect = el.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (state.image.loaded) {
    const x = state.viewport.offsetX;
    const y = state.viewport.offsetY;
    const w = state.image.width * state.viewport.zoom;
    const h = state.image.height * state.viewport.zoom;
    ctx.drawImage(state.image.el, x, y, w, h);
  }

  state.segments.forEach((s) => {
    const m = getMaterial(s.materialId);
    const selected = s.id === state.selectedSegmentId;
    drawPolygon(s.points, `${m?.color || '#64748b'}55`, true, true, 2);
    drawPolygon(s.points, selected ? '#16a34a' : (m?.color || '#64748b'), true, false, selected ? 3 : 2);
  });

  if (state.mode === 'scale') {
    if (state.scale.points.length) drawPolygon(state.scale.points, '#dc2626', false, false, 2);
    state.scale.points.forEach((p) => drawPoint(p, '#dc2626', 5));
  }

  if (state.currentContour.length) {
    drawPolygon(state.currentContour, '#2563eb', false, false, 2);
    state.currentContour.forEach((p) => drawPoint(p, '#2563eb', 4));
  }
}
function renderMaterials() {
  el.materialSelect.innerHTML = '';
  el.materialsTable.innerHTML = '';
  state.materials.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = `${m.number} — ${m.name}`; opt.selected = m.id === state.activeMaterialId;
    el.materialSelect.appendChild(opt);

    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.number}</td><td>${m.name}</td><td><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${m.color}"></span></td><td>${fmtN(m.price)}</td>`;
    el.materialsTable.appendChild(tr);
  });
}
function materialSelectHTML(selectedId) {
  return `<select data-field="materialId">${state.materials
    .map((m) => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${m.name}</option>`)
    .join('')}</select>`;
}
function renderEstimate() {
  el.estimateBody.innerHTML = '';
  let sum = 0;

  state.segments.forEach((s) => {
    const m = getMaterial(s.materialId);
    sum += s.total;
    const tr = document.createElement('tr');
    if (s.id === state.selectedSegmentId) tr.classList.add('selected-row');
    tr.dataset.id = String(s.id);

    tr.innerHTML = `
      <td><input data-field="label" value="${s.label}" /></td>
      <td>${materialSelectHTML(s.materialId)}</td>
      <td>${m?.number || '-'}</td>
      <td><input data-field="area" type="number" step="0.01" value="${s.area.toFixed(2)}" class="${s.overrides.areaManual ? 'manual' : ''}" /></td>
      <td><input data-field="perimeter" type="number" step="0.01" value="${s.perimeter.toFixed(2)}" class="${s.overrides.perimeterManual ? 'manual' : ''}" /></td>
      <td><input data-field="price" type="number" step="1" value="${s.price.toFixed(2)}" class="${s.overrides.priceManual ? 'manual' : ''}" /></td>
      <td>${fmtM(s.total)}</td>
      <td class="inline-actions">
        <button type="button" data-action="duplicate">Дублировать</button>
        <button type="button" data-action="reset">Сброс</button>
        <button type="button" data-action="remove">Удалить</button>
      </td>
    `;

    el.estimateBody.appendChild(tr);
  });

  el.estimateTotal.textContent = fmtM(sum);
}
function updateScaleInfo() {
  if (!state.scale.metersPerPixel) {
    el.scaleInfo.textContent = 'Масштаб не задан';
    return;
  }
  const mpp = state.scale.metersPerPixel;
  el.scaleInfo.textContent = `1 px = ${fmtN(mpp, 5)} м | 1 px² = ${fmtN(mpp ** 2, 7)} м²`;
}
function setMode(mode) {
  state.mode = mode;
  el.toolDraw.classList.toggle('active-tool', mode === 'draw');
  el.toolScale.classList.toggle('active-tool', mode === 'scale');
  el.toolPan.classList.toggle('active-tool', mode === 'pan' || state.isSpacePan);
  el.canvas.classList.toggle('pan', mode === 'pan' || state.isSpacePan);
}

// ===== Actions =====
function addPointFromClick(clientX, clientY) {
  if (!state.image.loaded) return;
  const imgPoint = canvasToImage(clientToCanvas(clientX, clientY));

  if (state.mode === 'scale') {
    if (state.scale.points.length === 2) { state.scale.points = []; state.scale.metersPerPixel = null; }
    state.scale.points.push(imgPoint);
    if (state.scale.points.length === 2) {
      const px = dist(state.scale.points[0], state.scale.points[1]);
      const meters = Number(el.realDistanceInput.value);
      if (meters <= 0 || !px) return;
      state.scale.metersPerPixel = meters / px;
      recalcAllSegments();
      updateScaleInfo();
      renderEstimate();
      setMode('draw');
    }
    render();
    return;
  }

  if (state.mode === 'draw') {
    state.currentContour.push(imgPoint);
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

  const m = getMaterial(state.activeMaterialId);
  const segment = {
    id: state.nextId,
    label: `Участок ${state.nextId}`,
    materialId: m.id,
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
  recalcSegment(segment);
  state.segments.push(segment);
  state.selectedSegmentId = segment.id;
  state.nextId += 1;
  state.currentContour = [];
  renderEstimate();
  render();
}
function deleteSelected() {
  if (state.selectedSegmentId == null) return;
  state.segments = state.segments.filter((s) => s.id !== state.selectedSegmentId);
  state.selectedSegmentId = null;
  renderEstimate();
  render();
}
function pickSegmentAt(clientX, clientY) {
  const p = canvasToImage(clientToCanvas(clientX, clientY));
  for (let i = state.segments.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(p, state.segments[i].points)) return state.segments[i].id;
  }
  return null;
}

// ===== Events =====
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
    fitToScreen();
    updateScaleInfo();
    renderEstimate();
  };
  state.image.el.src = url;
});

el.materialSelect.addEventListener('change', (e) => { state.activeMaterialId = e.target.value; });
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
  recalcAllSegments();
  renderEstimate();
});

el.canvas.addEventListener('mousedown', (e) => {
  const panNow = state.mode === 'pan' || state.isSpacePan || e.button === 1;
  if (panNow) {
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, ox: state.viewport.offsetX, oy: state.viewport.offsetY };
    el.canvas.classList.add('panning');
    return;
  }

  const hit = pickSegmentAt(e.clientX, e.clientY);
  if (hit) {
    state.selectedSegmentId = hit;
    renderEstimate();
    render();
    return;
  }
  addPointFromClick(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
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
  const anchor = clientToCanvas(e.clientX, e.clientY);
  zoomBy(e.deltaY < 0 ? 1.1 : 0.9, anchor);
}, { passive: false });

el.toolDraw.addEventListener('click', () => setMode('draw'));
el.toolScale.addEventListener('click', () => setMode('scale'));
el.toolPan.addEventListener('click', () => setMode('pan'));
el.undoPoint.addEventListener('click', () => { state.currentContour.pop(); render(); });
el.clearContour.addEventListener('click', () => { state.currentContour = []; render(); });
el.closeContour.addEventListener('click', closeContour);
el.deleteSelected.addEventListener('click', deleteSelected);
el.zoomIn.addEventListener('click', () => zoomBy(1.2));
el.zoomOut.addEventListener('click', () => zoomBy(0.8));
el.zoom100.addEventListener('click', () => { state.viewport.zoom = 1; render(); });
el.fitView.addEventListener('click', fitToScreen);
el.resetView.addEventListener('click', resetView);
el.fullscreen.addEventListener('click', async () => {
  if (!document.fullscreenElement) await el.editorRoot.requestFullscreen();
  else await document.exitFullscreen();
  setTimeout(syncCanvasSize, 20);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { state.isSpacePan = true; setMode(state.mode); e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { state.currentContour.pop(); render(); }
  if (e.key === 'Enter') closeContour();
  if (e.key === 'Escape') { state.currentContour = []; render(); }
  if (e.key === '+' || e.key === '=') zoomBy(1.15);
  if (e.key === '-') zoomBy(0.87);
  if (e.key.toLowerCase() === 'f') el.fullscreen.click();
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
  if (!action) { renderEstimate(); render(); return; }

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
  if (field === 'materialId') {
    s.materialId = e.target.value;
    s.overrides.priceManual = false;
  }
  if (field === 'area') { s.area = Math.max(0, Number(e.target.value) || 0); s.overrides.areaManual = true; }
  if (field === 'perimeter') { s.perimeter = Math.max(0, Number(e.target.value) || 0); s.overrides.perimeterManual = true; }
  if (field === 'price') { s.price = Math.max(0, Number(e.target.value) || 0); s.overrides.priceManual = true; }

  recalcSegment(s);
  renderEstimate();
  render();
});

window.addEventListener('resize', syncCanvasSize);
document.addEventListener('fullscreenchange', () => setTimeout(syncCanvasSize, 30));

// init
setMode('draw');
renderMaterials();
renderEstimate();
updateScaleInfo();
syncCanvasSize();
