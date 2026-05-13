# Seat Selector — 3D/2D выбор мест

Прототип системы выбора мест с поддержкой 2D-схемы и 3D-вида. Поддерживает несколько залов, загрузку моделей зала через GLB и калибровку модели под сетку кресел.

## Локальный запуск

```bash
npm install
npm run dev
```

Открывает http://localhost:5173

## Деплой на Vercel

### Вариант 1: через GitHub

1. Создайте репозиторий, загрузите туда содержимое этой папки.
2. На [vercel.com](https://vercel.com) — **Add New → Project** → выбрать репозиторий.
3. Vercel автоматически определит Vite-проект. Нажать **Deploy**.

### Вариант 2: через Vercel CLI

```bash
npm install -g vercel
vercel
```

### Вариант 3: drag-and-drop

```bash
npm run build
```

Папку `dist/` перетащить на [vercel.com/new](https://vercel.com/new) → "Deploy without Git".

## Структура

```
.
├── index.html
├── package.json
├── vite.config.js
├── scripts/
│   └── generate-venue.js    # генератор JSON-файлов залов
├── public/
│   └── venues/              # JSON-файлы залов (загружаются в runtime)
│       ├── index.json       # список доступных залов
│       ├── hall-concert.json
│       ├── hall-theatre.json
│       └── hall-club.json
└── src/
    ├── main.jsx
    └── App.jsx
```

## Залы

Сейчас в проекте три тестовых зала:

| ID            | Название              | Мест | Структура                          |
|---------------|----------------------|------|------------------------------------|
| hall-concert  | Концертный зал       | 368  | партер 12×24 + два балкона 5×10    |
| hall-theatre  | Театр                | 320  | партер 10×20 + амфитеатр 6×20      |
| hall-club     | Клуб                 | 120  | столы 4×12 + стоячая зона 6×12     |

Между залами можно переключаться через селектор в тулбаре.

## Как добавить свой зал

Есть два пути.

### Путь A. Через генератор (рекомендуется для типовых залов)

1. Откройте `scripts/generate-venue.js`.
2. Добавьте новый ключ в объект `PRESETS`:

```js
'my-hall': {
  id: 'my-hall',
  name: 'Мой зал · 240 мест',
  description: 'Описание зала',
  categories: [
    { id: 'vip', label: 'VIP', price: 200, color: '#1a1a1a' },
    { id: 'reg', label: 'Стандарт', price: 80, color: '#6a6a6a' },
  ],
  stage: { x: 0, y: 0, z: -2, width: 10, depth: 1.5 },
  sections: [
    {
      type: 'rectangular',
      id: 'parter', label: 'Партер',
      origin: { x: 0, y: 0, z: 2 }, rotation: 0,
      rows: 12, seatsPerRow: 20,
      vipFront: 3, vipCenterFrom: 7, vipCenterTo: 13,
      defaultCategory: 'reg',
      soldRatio: 0.15,
    },
  ],
},
```

3. Перегенерируйте файлы:

```bash
npm run generate
```

Создастся `public/venues/my-hall.json`, а в `index.json` появится новая запись.

### Путь B. Написать JSON вручную

Если нужна нестандартная геометрия (изогнутые ряды, нестандартная нумерация), создайте `public/venues/my-hall.json` напрямую. Минимальная структура:

```json
{
  "id": "my-hall",
  "name": "Мой зал",
  "categories": [
    { "id": "vip", "label": "VIP", "price": 200, "color": "#1a1a1a" }
  ],
  "stage": { "x": 0, "y": 0, "z": -2, "width": 10, "depth": 1.5 },
  "sections": [
    {
      "id": "parter",
      "label": "Партер",
      "origin": { "x": 0, "y": 0, "z": 2 },
      "rotation": 0,
      "seats": [
        { "id": "P-1-1", "row": 1, "number": 1, "category": "vip", "x": -3, "z": 0, "status": "available" }
      ]
    }
  ]
}
```

Затем добавьте запись в `public/venues/index.json` вручную:

```json
{
  "venues": [
    { "id": "my-hall", "name": "Мой зал", "file": "my-hall.json", "seatCount": 240 }
  ]
}
```

## Использование

1. Селектор **VENUE** в тулбаре — переключение между залами.
2. Переключатель **2D / 3D** — режим отображения.
3. Управление 3D: drag — вращение, wheel — zoom, click — выбор места.
4. Панель **VENUE MODEL**:
   - **+ upload .glb** — загрузить модель с диска.
   - **paste GLB URL** — вставить ссылку на удалённый GLB.
   - При успешной загрузке программное окружение скрывается.
5. Панель **CALIBRATION** (после успешной загрузки):
   - Ползунки **scale, x, y, z, rotY** двигают и масштабируют модель относительно кресел.
   - **reset** — вернуть значения по умолчанию.
   - **copy JSON** — скопировать параметры калибровки в буфер.

## Система координат

Кресла в venue.json расставлены в фиксированной системе координат:

- Центр сцены — `(0, 0, -2)`, ширина 12 м, направлена в `+z`
- Партер начинается с `z = 2`, ряды идут с шагом 0.85 м
- Балконы — `y = 2.5`, по бокам в `x = ±10`
- Размер кресла — 0.4 м

Если 3D-модель зала заказана у художника под этот пайплайн — модель встанет точно без калибровки. Если модель сделана независимо — используйте калибровочную панель, чтобы подогнать её под сетку кресел. Сохранённые параметры можно записать в `modelCalibration` внутри `venue.json`, чтобы при следующей загрузке зал открывался уже откалиброванным.

## Тестовые GLB-модели

Любая `.glb` подойдёт. Примеры из Khronos:

- `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb`
- `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Sponza/glTF-Binary/Sponza.glb`

## Что внутри

- React 18 + Three.js 0.160
- 2D-рендер: SVG
- 3D-рендер: WebGL + InstancedMesh
- Поддержка GLB через GLTFLoader + DRACOLoader
- Залы как статические JSON-файлы из `public/venues/`
- Загрузка через `fetch()` в runtime

## Что не реализовано (см. техдок)

- Realtime-блокировка мест (WebSocket / polling)
- Реальный inventory API
- 360°-вид с конкретного места
- Venue editor
- A11y-навигация по клавиатуре
