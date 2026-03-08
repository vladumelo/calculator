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
  project: { ...demoProject },
  activeCoverageIndex: null,
};

const tableBody = document.getElementById('coverageTableBody');
const grandTotalCell = document.getElementById('grandTotal');
const detailDialog = document.getElementById('detailDialog');
const detailTitle = document.getElementById('detailTitle');
const layerTableBody = document.getElementById('layerTableBody');
const layerTotalCell = document.getElementById('layerTotal');

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value) + ' ₽';
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
    detailsButton.textContent = 'Открыть';
    detailsButton.addEventListener('click', () => openDetails(index));
    detailsCell.appendChild(detailsButton);

    row.append(
      codeCell,
      nameCell,
      quantityCell,
      unitCell,
      priceCell,
      totalCell,
      detailsCell,
    );
    tableBody.appendChild(row);
  });

  const grandTotal = state.project.coverages.reduce(
    (sum, coverage) => sum + getLineTotal(coverage),
    0,
  );
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

  coverage.layers.forEach((layer, layerIndex) => {
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

    row.dataset.layerIndex = String(layerIndex);
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
    payload &&
    Array.isArray(payload.coverages) &&
    payload.coverages.every(
      (coverage) =>
        typeof coverage.code === 'string' &&
        typeof coverage.name === 'string' &&
        typeof coverage.quantity === 'number' &&
        typeof coverage.unitPrice === 'number' &&
        Array.isArray(coverage.layers),
    )
  );
}

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
