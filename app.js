const appState = {
  mode: 'draw',
  image: {
    loaded: false,
    width: 0,
    height: 0,
  },
  scale: {
    metersPerPixel: null,
    points: [],
  },
  currentContour: [], // image coordinates
  materials: [
    { id: 'm1', number: '1', name: 'Асфальт', color: '#6b7280', price: 1650 },
    { id: 'm2', number: '2', name: 'Бетон', color: '#94a3b8', price: 2200 },
    { id: 'm3', number: '3', name: 'Газон', color: '#22c55e', price: 950 },
    { id: 'm4', number: '4', name: 'Брусчатка', color: '#f59e0b', price: 2900 },
  ],
  activeMaterialId: 'm1',
  segments: [],
  nextSegmentId: 1,
};

const els = {
  imageInput: document.getElementById('imageInput'),
  planImage: document.getElementById('planImage'),
  overlay: document.getElementById('overlay'),
  stage: document.getElementById('stage'),
  realDistanceInput: document.getElementById('realDistanceInput'),
  modeScaleBtn: document.getElementById('modeScaleBtn'),
  modeDrawBtn: document.getElementById('modeDrawBtn'),
  scaleStatus: document.getElementById('scaleStatus'),
  undoPointBtn: document.getElementById('undoPointBtn'),
  clearContourBtn: document.getElementById('clearContourBtn'),
  closeContourBtn: document.getElementById('closeContourBtn'),
  materialSelect: document.getElementById('materialSelect'),
  materialsBody: document.getElementById('materialsBody'),
  newMaterialNumber: document.getElementById('newMaterialNumber'),
  newMaterialName: document.getElementById('newMaterialName'),
  newMaterialColor: document.getElementById('newMaterialColor'),
  newMaterialPrice: document.getElementById('newMaterialPrice'),
  addMaterialBtn: document.getElementById('addMaterialBtn'),
  segmentsBody: document.getElementById('segmentsBody'),
  estimateTotal: document.getElementById('estimateTotal'),
};

const ctx = els.overlay.getContext('2d');

function formatNumber(v, d = 2) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(v);
}

function formatMoney(v) {
  return `${formatNumber(v, 2)} ₽`;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function areaShoelace(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) * 0.5;
}

function perimeter(points) {
  let p = 0;
  for (let i = 0; i < points.length; i += 1) {
    p += distance(points[i], points[(i + 1) % points.length]);
  }
  return p;
}

function getActiveMaterial() {
  return appState.materials.find((m) => m.id === appState.activeMaterialId);
}

function getImageToCssScale() {
  const rect = els.overlay.getBoundingClientRect();
  if (!appState.image.loaded || rect.width === 0 || rect.height === 0) {
    return { sx: 1, sy: 1 };
  }
  return {
    sx: rect.width / appState.image.width,
    sy: rect.height / appState.image.height,
  };
}

function clientToImagePoint(clientX, clientY) {
  const rect = els.overlay.getBoundingClientRect();
  const xCss = clientX - rect.left;
  const yCss = clientY - rect.top;

  const x = (xCss * appState.image.width) / rect.width;
  const y = (yCss * appState.image.height) / rect.height;
  return {
    x: Math.max(0, Math.min(appState.image.width, x)),
    y: Math.max(0, Math.min(appState.image.height, y)),
  };
}

function imageToCssPoint(p) {
  const { sx, sy } = getImageToCssScale();
  return { x: p.x * sx, y: p.y * sy };
}

function syncOverlaySize() {
  const rect = els.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.overlay.width = Math.max(1, Math.round(rect.width * dpr));
  els.overlay.height = Math.max(1, Math.round(rect.height * dpr));
  els.overlay.style.width = `${Math.round(rect.width)}px`;
  els.overlay.style.height = `${Math.round(rect.height)}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function drawPoint(pCss, color = '#2563eb', radius = 4) {
  ctx.beginPath();
  ctx.arc(pCss.x, pCss.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPolyline(pointsImage, color, close = false) {
  if (!pointsImage.length) return;
  const first = imageToCssPoint(pointsImage[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  pointsImage.slice(1).forEach((p) => {
    const c = imageToCssPoint(p);
    ctx.lineTo(c.x, c.y);
  });
  if (close) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawPolygonFill(pointsImage, color) {
  if (pointsImage.length < 3) return;
  const first = imageToCssPoint(pointsImage[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  pointsImage.slice(1).forEach((p) => {
    const c = imageToCssPoint(p);
    ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
  ctx.fillStyle = `${color}55`;
  ctx.fill();
}

function redraw() {
  const rect = els.overlay.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  appState.segments.forEach((segment) => {
    const material = appState.materials.find((m) => m.id === segment.materialId);
    const color = material?.color || '#64748b';
    drawPolygonFill(segment.points, color);
    drawPolyline(segment.points, color, true);
  });

  if (appState.mode === 'scale') {
    drawPolyline(appState.scale.points, '#dc2626', false);
    appState.scale.points.forEach((p) => drawPoint(imageToCssPoint(p), '#dc2626', 5));
  }

  if (appState.currentContour.length) {
    drawPolyline(appState.currentContour, '#2563eb', false);
    appState.currentContour.forEach((p) => drawPoint(imageToCssPoint(p), '#2563eb', 4));
  }
}

function setMode(mode) {
  appState.mode = mode;
  els.modeScaleBtn.classList.toggle('mode-active', mode === 'scale');
  els.modeDrawBtn.classList.toggle('mode-active', mode === 'draw');
}

function updateScaleStatus() {
  if (!appState.scale.metersPerPixel) {
    els.scaleStatus.textContent = 'Масштаб: не задан';
    return;
  }
  const sq = appState.scale.metersPerPixel ** 2;
  els.scaleStatus.textContent = `Масштаб: 1 px = ${formatNumber(appState.scale.metersPerPixel, 5)} м | 1 px² = ${formatNumber(sq, 7)} м²`;
}

function renderMaterials() {
  els.materialSelect.innerHTML = '';
  els.materialsBody.innerHTML = '';

  appState.materials.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.number} — ${m.name}`;
    opt.selected = m.id === appState.activeMaterialId;
    els.materialSelect.appendChild(opt);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.number}</td>
      <td>${m.name}</td>
      <td><span class="color-dot" style="background:${m.color}"></span></td>
      <td>${formatNumber(m.price, 2)}</td>
    `;
    els.materialsBody.appendChild(tr);
  });
}

function recalcSegment(segment) {
  const material = appState.materials.find((m) => m.id === segment.materialId);
  const pxArea = areaShoelace(segment.points);
  const pxPerimeter = perimeter(segment.points);
  segment.area = pxArea * (appState.scale.metersPerPixel ** 2);
  segment.perimeter = pxPerimeter * appState.scale.metersPerPixel;
  segment.price = material ? material.price : 0;
  segment.total = segment.area * segment.price;
}

function renderEstimate() {
  els.segmentsBody.innerHTML = '';
  let total = 0;

  appState.segments.forEach((s) => {
    const material = appState.materials.find((m) => m.id === s.materialId);
    total += s.total;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.id}</td>
      <td>${material?.number ?? '-'}</td>
      <td>${material?.name ?? 'Удалённое покрытие'}</td>
      <td>${formatNumber(s.area, 2)}</td>
      <td>${formatNumber(s.perimeter, 2)}</td>
      <td>${formatNumber(s.price, 2)}</td>
      <td>${formatMoney(s.total)}</td>
      <td><button type="button" data-remove="${s.id}">Удалить</button></td>
    `;
    els.segmentsBody.appendChild(tr);
  });

  els.estimateTotal.textContent = formatMoney(total);
}

function closeCurrentContour() {
  if (appState.currentContour.length < 3) {
    alert('Нельзя замкнуть контур: нужно минимум 3 точки.');
    return;
  }
  if (!appState.scale.metersPerPixel) {
    alert('Сначала задайте масштаб по двум точкам.');
    return;
  }

  const material = getActiveMaterial();
  if (!material) {
    alert('Выберите покрытие для контура.');
    return;
  }

  const segment = {
    id: appState.nextSegmentId,
    materialId: material.id,
    points: appState.currentContour.map((p) => ({ ...p })),
    area: 0,
    perimeter: 0,
    price: 0,
    total: 0,
  };
  recalcSegment(segment);

  appState.nextSegmentId += 1;
  appState.segments.push(segment);
  appState.currentContour = [];
  renderEstimate();
  redraw();
}

function addMaterial() {
  const number = els.newMaterialNumber.value.trim();
  const name = els.newMaterialName.value.trim();
  const color = els.newMaterialColor.value;
  const price = Number(els.newMaterialPrice.value);

  if (!name) {
    alert('Нельзя добавить покрытие без названия.');
    return;
  }

  const id = `m${Date.now()}`;
  appState.materials.push({
    id,
    number: number || String(appState.materials.length + 1),
    name,
    color,
    price: Number.isFinite(price) ? Math.max(0, price) : 0,
  });
  appState.activeMaterialId = id;
  renderMaterials();
  renderEstimate();
  redraw();

  els.newMaterialName.value = '';
}

function handleCanvasClick(event) {
  if (!appState.image.loaded) {
    return;
  }

  const p = clientToImagePoint(event.clientX, event.clientY);

  if (appState.mode === 'scale') {
    if (appState.scale.points.length === 2) {
      appState.scale.points = [];
      appState.scale.metersPerPixel = null;
    }
    appState.scale.points.push(p);

    if (appState.scale.points.length === 2) {
      const px = distance(appState.scale.points[0], appState.scale.points[1]);
      const m = Number(els.realDistanceInput.value);
      if (!m || m <= 0 || !px) {
        alert('Введите корректное расстояние в метрах.');
        return;
      }
      appState.scale.metersPerPixel = m / px;
      appState.segments.forEach(recalcSegment);
      renderEstimate();
      updateScaleStatus();
      setMode('draw');
    }

    redraw();
    return;
  }

  appState.currentContour.push(p);
  redraw();
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    els.planImage.src = url;
    appState.image.loaded = true;
    appState.image.width = img.naturalWidth;
    appState.image.height = img.naturalHeight;

    appState.scale = { metersPerPixel: null, points: [] };
    appState.currentContour = [];
    appState.segments = [];
    appState.nextSegmentId = 1;

    requestAnimationFrame(() => {
      syncOverlaySize();
      updateScaleStatus();
      renderEstimate();
      redraw();
    });
  };
  img.src = url;
}

els.imageInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) loadImage(file);
});
els.modeScaleBtn.addEventListener('click', () => setMode('scale'));
els.modeDrawBtn.addEventListener('click', () => setMode('draw'));
els.undoPointBtn.addEventListener('click', () => {
  appState.currentContour.pop();
  redraw();
});
els.clearContourBtn.addEventListener('click', () => {
  appState.currentContour = [];
  redraw();
});
els.closeContourBtn.addEventListener('click', closeCurrentContour);
els.addMaterialBtn.addEventListener('click', addMaterial);
els.materialSelect.addEventListener('change', (e) => {
  appState.activeMaterialId = e.target.value;
});
els.overlay.addEventListener('click', handleCanvasClick);
els.segmentsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  const id = Number(btn.dataset.remove);
  appState.segments = appState.segments.filter((s) => s.id !== id);
  renderEstimate();
  redraw();
});

window.addEventListener('resize', syncOverlaySize);

setMode('draw');
renderMaterials();
renderEstimate();
updateScaleStatus();
syncOverlaySize();
