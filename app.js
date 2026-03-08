const unitOptions = [
  { value: 'm2', label: 'м²' },
  { value: 'm3', label: 'м³' },
  { value: 'pcs', label: 'шт' },
];

const demoProject = {
  name: 'Благоустройство ЖК «Черри»',
  coverages: [
    {
      code: '1',
      name: 'Асфальтобетон',
      quantity: 1637,
      unit: 'm2',
      unitPrice: 1650,
      layers: [
        { name: 'Уплотнение грунта', quantity: 1637, unit: 'm2', unitPrice: 85 },
        { name: 'Укладка пленки', quantity: 1637, unit: 'm2', unitPrice: 65 },
        { name: 'Отсыпка щебнем 200 мм', quantity: 327.4, unit: 'm3', unitPrice: 2100 },
        { name: 'Асфальтобетонирование', quantity: 1637, unit: 'm2', unitPrice: 960 },
      ],
    },
    {
      code: '2',
      name: 'Монолитный бетон (покрытие)',
      quantity: 2659,
      unit: 'm2',
      unitPrice: 2200,
      layers: [
        { name: 'Уплотнение грунта', quantity: 2659, unit: 'm2', unitPrice: 90 },
        { name: 'Щебеночная подготовка 200 мм', quantity: 531.8, unit: 'm3', unitPrice: 2200 },
        { name: 'Бетонирование В25', quantity: 398.8, unit: 'm3', unitPrice: 7800 },
      ],
    },
    {
      code: '3.1',
      name: 'Брусчатка на стилобате',
      quantity: 694.91,
      unit: 'm2',
      unitPrice: 2900,
      layers: [
        { name: 'Разделительный слой', quantity: 694.91, unit: 'm2', unitPrice: 120 },
        { name: 'Подстилающий слой (стяжка)', quantity: 34.75, unit: 'm3', unitPrice: 6900 },
        { name: 'Укладка брусчатки', quantity: 694.91, unit: 'm2', unitPrice: 1750 },
      ],
    },
    {
      code: '7',
      name: 'Грунт (газон)',
      quantity: 1481.59,
      unit: 'm2',
      unitPrice: 950,
      layers: [
        { name: 'Планировка основания', quantity: 1481.59, unit: 'm2', unitPrice: 60 },
        { name: 'Плодородный грунт 100 мм', quantity: 148.16, unit: 'm3', unitPrice: 1650 },
        { name: 'Посев газона', quantity: 1481.59, unit: 'm2', unitPrice: 180 },
      ],
    },
  ],
};

const state = {
  project: structuredClone(demoProject),
  activeCoverageIndex: null,
  planner: {
    image: null,
    scaleMetersPerPixel: null,
    scalePoints: [],
    mode: 'draw',
    currentPolygon: [],
    polygons: [],
    polygonSeq: 1,
    coverageTypes: [
      { id: 't1', name: 'Асфальтобетон', color: '#6b7280', unitPrice: 1650 },
      { id: 't2', name: 'Брусчатка', color: '#f59e0b', unitPrice: 2900 },
      { id: 't3', name: 'Газон', color: '#22c55e', unitPrice: 950 },
    ],
    activeTypeId: 't1',
  },
};

const tableBody = document.getElementById('coverageTableBody');
const grandTotalCell = document.getElementById('grandTotal');
const detailDialog = document.getElementById('detailDialog');
const detailTitle = document.getElementById('detailTitle');
const layerTableBody = document.getElementById('layerTableBody');
const layerTotalCell = document.getElementById('layerTotal');

const canvas = document.getElementById('planCanvas');
const ctx = canvas.getContext('2d');
const scaleInfo = document.getElementById('scaleInfo');
const knownDistanceInput = document.getElementById('knownDistanceInput');
const polygonTableBody = document.getElementById('polygonTableBody');
const typeTableBody = document.getElementById('typeTableBody');
const activeTypeSelect = document.getElementById('activeTypeSelect');

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`;
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

function getLineTotal(item) {
  return Number(item.quantity || 0) * Number(item.unitPrice || 0);
}

function buildUnitSelect(selectedUnit, onChange) {
  const select = document.createElement('select');
  unitOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = option.value === selectedUnit;
    select.appendChild(opt);
  });
  select.addEventListener('change', onChange);
  return select;
}

function buildNumberInput(value, onChange, min = 0, step = '0.01') {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value ?? 0);
  input.min = String(min);
  input.step = step;
  input.addEventListener('input', onChange);
  return input;
}

function getDistance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function polygonAreaInPixels(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function polygonPerimeterInPixels(points) {
  let perimeter = 0;
  for (let i = 0; i < points.length; i += 1) {
    perimeter += getDistance(points[i], points[(i + 1) % points.length]);
  }
  return perimeter;
}

function getTypeById(typeId) {
  return state.planner.coverageTypes.find((type) => type.id === typeId);
}

function renderCoverageTable() {
  tableBody.innerHTML = '';

  state.project.coverages.forEach((coverage, index) => {
    const row = document.createElement('tr');

    const codeCell = document.createElement('td');
    codeCell.textContent = coverage.code;

    const nameCell = document.createElement('td');
    nameCell.textContent = coverage.name;

    const quantityCell = document.createElement('td');
    quantityCell.appendChild(
      buildNumberInput(coverage.quantity, (event) => {
        coverage.quantity = Number(event.target.value);
        renderCoverageTable();
      }),
    );

    const unitCell = document.createElement('td');
    unitCell.appendChild(
      buildUnitSelect(coverage.unit, (event) => {
        coverage.unit = event.target.value;
      }),
    );

    const priceCell = document.createElement('td');
    priceCell.appendChild(
      buildNumberInput(coverage.unitPrice, (event) => {
        coverage.unitPrice = Number(event.target.value);
        renderCoverageTable();
      }),
    );

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(getLineTotal(coverage));

    const detailsCell = document.createElement('td');
    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'layer-details-btn';
    detailsButton.textContent = coverage.layers?.length ? 'Открыть' : '—';
    detailsButton.disabled = !coverage.layers?.length;
    if (coverage.layers?.length) {
      detailsButton.addEventListener('click', () => openDetails(index));
    }
    detailsCell.appendChild(detailsButton);

    row.append(codeCell, nameCell, quantityCell, unitCell, priceCell, totalCell, detailsCell);
    tableBody.appendChild(row);
  });

  const grandTotal = state.project.coverages.reduce((sum, coverage) => sum + getLineTotal(coverage), 0);
  grandTotalCell.textContent = formatMoney(grandTotal);
}

function openDetails(coverageIndex) {
  state.activeCoverageIndex = coverageIndex;
  const coverage = state.project.coverages[coverageIndex];
  detailTitle.textContent = `Детальный расчет: ${coverage.code} — ${coverage.name}`;
  renderLayerTable();
  detailDialog.showModal();
}

function renderLayerTable() {
  if (state.activeCoverageIndex === null) {
    return;
  }

  const coverage = state.project.coverages[state.activeCoverageIndex];
  layerTableBody.innerHTML = '';

  coverage.layers.forEach((layer) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = layer.name;

    const quantityCell = document.createElement('td');
    quantityCell.appendChild(
      buildNumberInput(layer.quantity, (event) => {
        layer.quantity = Number(event.target.value);
        renderLayerTable();
      }),
    );

    const unitCell = document.createElement('td');
    unitCell.appendChild(
      buildUnitSelect(layer.unit, (event) => {
        layer.unit = event.target.value;
      }),
    );

    const priceCell = document.createElement('td');
    priceCell.appendChild(
      buildNumberInput(layer.unitPrice, (event) => {
        layer.unitPrice = Number(event.target.value);
        renderLayerTable();
      }),
    );

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(getLineTotal(layer));

    row.append(nameCell, quantityCell, unitCell, priceCell, totalCell);
    layerTableBody.appendChild(row);
  });

  const layerTotal = coverage.layers.reduce((sum, layer) => sum + getLineTotal(layer), 0);
  layerTotalCell.textContent = formatMoney(layerTotal);

  coverage.unitPrice = coverage.quantity > 0 ? layerTotal / coverage.quantity : 0;
  renderCoverageTable();
}

function validateProjectPayload(payload) {
  return (
    payload
    && Array.isArray(payload.coverages)
    && payload.coverages.every(
      (coverage) =>
        typeof coverage.code === 'string'
        && typeof coverage.name === 'string'
        && typeof coverage.quantity === 'number'
        && typeof coverage.unitPrice === 'number'
        && Array.isArray(coverage.layers),
    )
  );
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.planner.image) {
    ctx.drawImage(state.planner.image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Загрузите изображение плана', 20, 30);
  }

  state.planner.polygons.forEach((polygon) => {
    const type = getTypeById(polygon.typeId);
    const color = type?.color || '#22c55e';
    if (polygon.points.length < 3) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
    polygon.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = `${color}66`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  });

  if (state.planner.currentPolygon.length) {
    ctx.beginPath();
    ctx.moveTo(state.planner.currentPolygon[0].x, state.planner.currentPolygon[0].y);
    state.planner.currentPolygon.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();

    state.planner.currentPolygon.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1d4ed8';
      ctx.fill();
    });
  }

  if (state.planner.mode === 'scale') {
    state.planner.scalePoints.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626';
      ctx.fill();
    });

    if (state.planner.scalePoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(state.planner.scalePoints[0].x, state.planner.scalePoints[0].y);
      ctx.lineTo(state.planner.scalePoints[1].x, state.planner.scalePoints[1].y);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function recalculatePolygonGeometry(polygon) {
  if (!state.planner.scaleMetersPerPixel) {
    polygon.area = 0;
    polygon.perimeter = 0;
    return;
  }

  const areaPx = polygonAreaInPixels(polygon.points);
  const perimeterPx = polygonPerimeterInPixels(polygon.points);
  polygon.area = areaPx * state.planner.scaleMetersPerPixel ** 2;
  polygon.perimeter = perimeterPx * state.planner.scaleMetersPerPixel;
}

function renderTypes() {
  typeTableBody.innerHTML = '';
  activeTypeSelect.innerHTML = '';

  state.planner.coverageTypes.forEach((type) => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.name;
    option.selected = type.id === state.planner.activeTypeId;
    activeTypeSelect.appendChild(option);

    const row = document.createElement('tr');

    const colorCell = document.createElement('td');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = type.color;
    colorInput.addEventListener('input', (event) => {
      type.color = event.target.value;
      redrawCanvas();
    });
    colorCell.appendChild(colorInput);

    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = type.name;
    nameInput.addEventListener('input', (event) => {
      type.name = event.target.value;
      renderTypes();
      renderPolygonTable();
    });
    nameCell.appendChild(nameInput);

    const priceCell = document.createElement('td');
    priceCell.appendChild(
      buildNumberInput(type.unitPrice, (event) => {
        type.unitPrice = Number(event.target.value);
      }, 0, '1'),
    );

    row.append(colorCell, nameCell, priceCell);
    typeTableBody.appendChild(row);
  });
}

function renderPolygonTable() {
  polygonTableBody.innerHTML = '';

  state.planner.polygons.forEach((polygon) => {
    const row = document.createElement('tr');
    const type = getTypeById(polygon.typeId);

    const idCell = document.createElement('td');
    idCell.textContent = String(polygon.id);

    const typeCell = document.createElement('td');
    const typeSelect = document.createElement('select');
    state.planner.coverageTypes.forEach((coverageType) => {
      const option = document.createElement('option');
      option.value = coverageType.id;
      option.textContent = coverageType.name;
      option.selected = coverageType.id === polygon.typeId;
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener('change', (event) => {
      polygon.typeId = event.target.value;
      renderPolygonTable();
      redrawCanvas();
    });
    typeCell.appendChild(typeSelect);

    const areaCell = document.createElement('td');
    areaCell.textContent = formatNumber(polygon.area, 2);

    const perimeterCell = document.createElement('td');
    perimeterCell.textContent = formatNumber(polygon.perimeter, 2);

    const actionCell = document.createElement('td');
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Добавить';
    addButton.addEventListener('click', () => {
      addPolygonToEstimate(polygon, type);
    });
    actionCell.appendChild(addButton);

    row.append(idCell, typeCell, areaCell, perimeterCell, actionCell);
    polygonTableBody.appendChild(row);
  });
}

function addPolygonToEstimate(polygon, type) {
  if (!polygon.area || !type) {
    alert('Нельзя добавить участок без масштаба или без типа покрытия.');
    return;
  }

  const existing = state.project.coverages.find(
    (coverage) => coverage.name === type.name && coverage.unit === 'm2' && coverage.source === 'image-planner',
  );

  if (existing) {
    existing.quantity += polygon.area;
    existing.meta.perimeter += polygon.perimeter;
  } else {
    state.project.coverages.push({
      code: `IMG-${state.project.coverages.length + 1}`,
      name: type.name,
      quantity: polygon.area,
      unit: 'm2',
      unitPrice: type.unitPrice,
      layers: [],
      source: 'image-planner',
      meta: { perimeter: polygon.perimeter },
    });
  }

  renderCoverageTable();
  alert(`Участок ${polygon.id} добавлен в смету: ${type.name}.`);
}

function setScaleFromPoints() {
  if (state.planner.scalePoints.length !== 2) {
    return;
  }

  const pixelDistance = getDistance(state.planner.scalePoints[0], state.planner.scalePoints[1]);
  const meters = Number(knownDistanceInput.value);
  if (!pixelDistance || !meters || meters <= 0) {
    alert('Введите корректную реальную дистанцию в метрах.');
    return;
  }

  state.planner.scaleMetersPerPixel = meters / pixelDistance;
  state.planner.polygons.forEach(recalculatePolygonGeometry);
  renderPolygonTable();
  scaleInfo.textContent = `1 px = ${formatNumber(state.planner.scaleMetersPerPixel, 4)} м`;
}

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const point = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  if (state.planner.mode === 'scale') {
    if (state.planner.scalePoints.length >= 2) {
      state.planner.scalePoints = [];
    }
    state.planner.scalePoints.push(point);

    if (state.planner.scalePoints.length === 2) {
      setScaleFromPoints();
      state.planner.mode = 'draw';
    }

    redrawCanvas();
    return;
  }

  state.planner.currentPolygon.push(point);
  redrawCanvas();
});

document.getElementById('startScaleBtn').addEventListener('click', () => {
  state.planner.mode = 'scale';
  state.planner.scalePoints = [];
  redrawCanvas();
});

document.getElementById('undoPointBtn').addEventListener('click', () => {
  state.planner.currentPolygon.pop();
  redrawCanvas();
});

document.getElementById('clearCurrentBtn').addEventListener('click', () => {
  state.planner.currentPolygon = [];
  redrawCanvas();
});

document.getElementById('finishPolygonBtn').addEventListener('click', () => {
  if (state.planner.currentPolygon.length < 3) {
    alert('Нужно минимум 3 точки, чтобы замкнуть контур.');
    return;
  }

  const polygon = {
    id: state.planner.polygonSeq,
    typeId: state.planner.activeTypeId,
    points: [...state.planner.currentPolygon],
    area: 0,
    perimeter: 0,
  };
  recalculatePolygonGeometry(polygon);
  state.planner.polygons.push(polygon);
  state.planner.polygonSeq += 1;
  state.planner.currentPolygon = [];
  renderPolygonTable();
  redrawCanvas();
});

activeTypeSelect.addEventListener('change', (event) => {
  state.planner.activeTypeId = event.target.value;
});

document.getElementById('addTypeBtn').addEventListener('click', () => {
  const typeName = document.getElementById('typeNameInput').value.trim();
  const typeColor = document.getElementById('typeColorInput').value;
  const typePrice = Number(document.getElementById('typePriceInput').value);

  if (!typeName) {
    alert('Введите название типа покрытия.');
    return;
  }

  const typeId = `t${Date.now()}`;
  state.planner.coverageTypes.push({
    id: typeId,
    name: typeName,
    color: typeColor,
    unitPrice: Number.isFinite(typePrice) ? typePrice : 0,
  });
  state.planner.activeTypeId = typeId;
  renderTypes();
  redrawCanvas();
});

document.getElementById('planImageFile').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    const maxWidth = 1100;
    const scale = Math.min(1, maxWidth / image.width);
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    state.planner.image = image;

    state.planner.polygons = [];
    state.planner.currentPolygon = [];
    state.planner.scaleMetersPerPixel = null;
    state.planner.scalePoints = [];
    scaleInfo.textContent = 'Масштаб не задан';

    redrawCanvas();
    renderPolygonTable();
  };
  image.src = URL.createObjectURL(file);
});

document.getElementById('projectFile').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    if (!validateProjectPayload(parsed)) {
      alert('Неверный формат JSON. Ожидается объект с массивом coverages.');
      return;
    }

    state.project = parsed;
    state.activeCoverageIndex = null;
    if (detailDialog.open) {
      detailDialog.close();
    }
    renderCoverageTable();
  } catch {
    alert('Не удалось прочитать JSON файл проекта.');
  }
});

document.getElementById('loadDemoBtn').addEventListener('click', () => {
  state.project = structuredClone(demoProject);
  state.activeCoverageIndex = null;
  if (detailDialog.open) {
    detailDialog.close();
  }
  renderCoverageTable();
});

renderCoverageTable();
renderTypes();
renderPolygonTable();
redrawCanvas();
