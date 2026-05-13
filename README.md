# Seat Selector — 3D/2D выбор мест

Прототип системы выбора мест с поддержкой 2D-схемы и 3D-вида. Загрузка моделей зала через GLB (с локального диска или по URL).

## Локальный запуск

```bash
npm install
npm run dev
```

Открывает http://localhost:5173

## Деплой на Vercel

### Вариант 1: через GitHub

1. Создайте репозиторий на GitHub, загрузите туда содержимое этой папки.
2. Зайдите на [vercel.com](https://vercel.com), нажмите **Add New → Project**.
3. Выберите свой репозиторий. Vercel автоматически определит Vite-проект.
4. Нажмите **Deploy**. Через ~30 секунд получите рабочий URL.

### Вариант 2: через Vercel CLI

```bash
npm install -g vercel
vercel
```

CLI задаст несколько вопросов (имя проекта, scope), потом сам соберёт и задеплоит. Получите production URL вида `seat-selector-xyz.vercel.app`.

### Вариант 3: drag-and-drop

```bash
npm run build
```

Папку `dist/` перетащите на [vercel.com/new](https://vercel.com/new) → выберите "Deploy without Git". Самый быстрый способ для одноразовой демо-ссылки.

## Структура

```
.
├── index.html          # точка входа
├── package.json        # зависимости
├── vite.config.js      # конфиг Vite + React plugin
└── src/
    ├── main.jsx        # bootstrap React
    └── App.jsx         # вся логика виджета
```

## Использование

После открытия:

1. По умолчанию активен **2D-режим** — SVG-схема зала.
2. Переключатель **3D** в тулбаре — открывает интерактивную 3D-сцену с программной геометрией зала.
3. Управление 3D: drag — вращение, wheel — zoom, click по месту — выбор.
4. Панель **VENUE MODEL**:
   - **+ upload .glb** — загрузить модель с диска (только формат `.glb`, не `.gltf` с внешними ассетами).
   - **paste GLB URL** — вставить ссылку на удалённый GLB. Удалённый сервер должен отдавать CORS-заголовки.
   - При успешной загрузке программное окружение скрывается, остаётся загруженная модель + кресла поверх.
5. Кресла выбираются кликом, выбор виден в нижней панели и в модалке корзины.

## Тестовые модели

Можно использовать любую `.glb` с [Khronos Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models). Примеры URL:

- `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb`
- `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Sponza/glTF-Binary/Sponza.glb` (большая, ~17 MB)

Для реального зала нужна кастомная модель — см. техдок (раздел 05 «Загрузка моделей зала»).

## Что внутри

- React 18 + Three.js 0.160
- 2D-рендер: SVG
- 3D-рендер: WebGL + InstancedMesh для производительности
- Поддержка GLB через `GLTFLoader` + `DRACOLoader` (Draco-сжатие)
- Без бэкенда: модель зала и данные о местах генерируются программно

## Что не реализовано (см. техдок)

- Realtime-блокировка мест (WebSocket / polling)
- Реальный inventory API
- 360°-вид с конкретного места
- Venue editor
- A11y-навигация по клавиатуре
