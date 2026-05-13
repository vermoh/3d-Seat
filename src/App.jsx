import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const COLORS = {
  bg: '#ffffff',
  bgAlt: '#f5f5f5',
  bgCode: '#1a1a1a',
  text: '#1a1a1a',
  textMuted: '#6a6a6a',
  rule: '#e0e0e0',
  selected: '#b54a2c', // акцентный цвет выбранного места
  sold: '#d8d8d8',
};

// Превращает массив categories из venue.json в map по id для быстрого доступа.
// В разных залах могут быть разные категории (VIP/Партер vs Премьер/Основной vs Стол/Стоячая),
// поэтому это всегда читается из venue, а не из глобальной константы.
function categoryMap(venue) {
  if (!venue?.categories) return {};
  return Object.fromEntries(venue.categories.map((c) => [c.id, c]));
}

// =============================================================================
// SELECTION STATE
// =============================================================================

function useSeatSelection(venue) {
  const [selected, setSelected] = useState(new Set());
  const [hoveredId, setHoveredId] = useState(null);

  const toggleSeat = useCallback((seatId, status) => {
    if (status !== 'available') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Очищаем выбор при смене зала
  useEffect(() => {
    setSelected(new Set());
  }, [venue?.id]);

  const cats = useMemo(() => categoryMap(venue), [venue]);

  const selectedSeats = useMemo(() => {
    if (!venue?.sections) return [];
    const result = [];
    for (const section of venue.sections) {
      for (const seat of section.seats) {
        if (selected.has(seat.id)) {
          result.push({ ...seat, sectionId: section.id, sectionLabel: section.label });
        }
      }
    }
    return result;
  }, [selected, venue]);

  const total = useMemo(
    () => selectedSeats.reduce((sum, s) => sum + (cats[s.category]?.price ?? 0), 0),
    [selectedSeats, cats]
  );

  return { selected, selectedSeats, total, toggleSeat, clearSelection, hoveredId, setHoveredId };
}

// =============================================================================
// 2D
// =============================================================================

function SeatMap2D({ venue, selection }) {
  const { selected, toggleSeat, hoveredId, setHoveredId } = selection;
  const cats = useMemo(() => categoryMap(venue), [venue]);

  const VIEW_W = 800;
  const VIEW_H = 520;
  const SEAT_SIZE = 11;

  const sectionElements = venue.sections.map((section) => {
    const sectionCenterX = VIEW_W / 2 + section.origin.x * 18;
    const sectionCenterY = 120 + section.origin.z * 18 + section.origin.y * 6;

    const seats = section.seats.map((seat) => {
      const x = sectionCenterX + seat.x * 22;
      const y = sectionCenterY + seat.z * 16;
      const isSelected = selected.has(seat.id);
      const isHovered = hoveredId === seat.id;
      const cat = cats[seat.category];

      let fill = cat?.color ?? '#999';
      let opacity = 1;
      if (seat.status === 'sold') {
        fill = COLORS.sold;
        opacity = 1;
      }
      if (isSelected) {
        fill = COLORS.selected;
        opacity = 1;
      }

      return (
        <rect
          key={seat.id}
          x={x - SEAT_SIZE / 2}
          y={y - SEAT_SIZE / 2}
          width={SEAT_SIZE}
          height={SEAT_SIZE}
          rx={1}
          fill={fill}
          opacity={opacity}
          stroke={isHovered ? COLORS.text : 'none'}
          strokeWidth={isHovered ? 1.5 : 0}
          style={{
            cursor: seat.status === 'available' ? 'pointer' : 'not-allowed',
            transition: 'fill 0.12s',
          }}
          onClick={() => toggleSeat(seat.id, seat.status)}
          onMouseEnter={() => setHoveredId(seat.id)}
          onMouseLeave={() => setHoveredId(null)}
        />
      );
    });

    return (
      <g key={section.id}>
        <text
          x={sectionCenterX}
          y={sectionCenterY - 22}
          textAnchor="middle"
          fontSize="10"
          fontFamily="'JetBrains Mono', monospace"
          fill={COLORS.textMuted}
          letterSpacing="0.08em"
        >
          {section.label.toUpperCase()}
        </text>
        {seats}
      </g>
    );
  });

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Сцена */}
      <rect x={VIEW_W / 2 - 140} y={40} width={280} height={26} fill={COLORS.text} />
      <text
        x={VIEW_W / 2}
        y={57}
        textAnchor="middle"
        fontSize="11"
        fontFamily="'JetBrains Mono', monospace"
        fill={COLORS.bg}
        letterSpacing="0.2em"
      >
        STAGE
      </text>

      {sectionElements}
    </svg>
  );
}

// =============================================================================
// 3D
// =============================================================================

function SeatMap3D({ venue, selection, onModelStatusChange, calibration }) {
  const mountRef = useRef(null);
  const sceneStateRef = useRef(null);
  const loadedSceneRef = useRef(null); // ссылка на загруженную GLB-сцену для апдейта трансформации
  const { selected, toggleSeat } = selection;

  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
    if (sceneStateRef.current) {
      sceneStateRef.current.updateColors();
    }
  }, [selected]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ebe4d6');
    scene.fog = new THREE.Fog('#ebe4d6', 30, 70);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 12, 18);
    camera.lookAt(0, 0, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Освещение
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(5, 15, 5);
    scene.add(dir);
    // Тёплый прожектор со сцены — придаёт сцене подсветку и создаёт атмосферу зала
    const stageLight = new THREE.PointLight('#f4d4a8', 1.2, 30);
    stageLight.position.set(0, 5, -2);
    scene.add(stageLight);

    // === ОКРУЖЕНИЕ ЗАЛА ===
    // Программная геометрия: пол, стены, потолок с акустическими панелями, сцена,
    // балконные платформы и ограждения.
    // В production здесь подгружается GLB-модель через GLTFLoader (см. техдок, раздел 05).

    const disposables = { geometries: [], materials: [] };

    function track(geo, mat) {
      disposables.geometries.push(geo);
      if (mat) disposables.materials.push(mat);
    }

    // Палитра окружения — тёплые тона, как в концертных залах
    const wallColor = '#ebe4d6';
    const floorColor = '#d4cbb8';
    const ceilingColor = '#2d2620';
    const stageColor = '#1a1a1a';
    const stageBackColor = '#3d3530';
    const railColor = '#2d2620';

    // --- Пол зала ---
    const floorGeo = new THREE.PlaneGeometry(34, 28);
    const floorMat = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.05, 4);
    scene.add(floor);
    track(floorGeo, floorMat);

    // --- Задняя стена ---
    const backWallGeo = new THREE.BoxGeometry(34, 8, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 4, 18);
    scene.add(backWall);
    track(backWallGeo, wallMat);

    // --- Задник сцены ---
    const stageBackGeo = new THREE.BoxGeometry(18, 6, 0.4);
    const stageBackMat = new THREE.MeshStandardMaterial({ color: stageBackColor, roughness: 0.7 });
    const stageBack = new THREE.Mesh(stageBackGeo, stageBackMat);
    stageBack.position.set(0, 3, -4);
    scene.add(stageBack);
    track(stageBackGeo, stageBackMat);

    // --- Боковые стены ---
    const sideWallGeo = new THREE.BoxGeometry(0.4, 8, 22);
    const sideWallMatL = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
    const sideWallMatR = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
    const sideWallL = new THREE.Mesh(sideWallGeo, sideWallMatL);
    sideWallL.position.set(-17, 4, 7);
    scene.add(sideWallL);
    const sideWallR = new THREE.Mesh(sideWallGeo, sideWallMatR);
    sideWallR.position.set(17, 4, 7);
    scene.add(sideWallR);
    track(sideWallGeo, sideWallMatL);
    disposables.materials.push(sideWallMatR);

    // --- Потолок ---
    const ceilingGeo = new THREE.PlaneGeometry(34, 28);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: ceilingColor, roughness: 0.95 });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 8, 4);
    scene.add(ceiling);
    track(ceilingGeo, ceilingMat);

    // --- Сцена ---
    const stageGeo = new THREE.BoxGeometry(venue.stage.width, 0.5, venue.stage.depth);
    const stageMat = new THREE.MeshStandardMaterial({ color: stageColor, roughness: 0.8 });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.set(venue.stage.x, 0.25, venue.stage.z);
    scene.add(stage);
    track(stageGeo, stageMat);

    // --- Балконные платформы и ограждения ---
    const balconyMat = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 });
    disposables.materials.push(balconyMat);
    const railMat = new THREE.MeshStandardMaterial({ color: railColor, roughness: 0.6 });
    disposables.materials.push(railMat);

    for (const section of venue.sections) {
      if (section.id.startsWith('balcony')) {
        const balGeo = new THREE.BoxGeometry(7, 0.3, 6);
        const bal = new THREE.Mesh(balGeo, balconyMat);
        bal.position.set(section.origin.x, section.origin.y - 0.15, section.origin.z + 2);
        bal.rotation.y = -section.rotation;
        scene.add(bal);
        disposables.geometries.push(balGeo);

        const railGeo = new THREE.BoxGeometry(7, 0.7, 0.15);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(section.origin.x, section.origin.y + 0.2, section.origin.z - 0.5);
        rail.rotation.y = -section.rotation;
        scene.add(rail);
        disposables.geometries.push(railGeo);
      }
    }

    // --- Все программные mesh окружения (для скрытия при загрузке GLB) ---
    const proceduralMeshes = [
      floor, backWall, stageBack, sideWallL, sideWallR, ceiling, stage,
      ...scene.children.filter((c) => c.userData?.balcony),
    ];
    // Помечаем балконные элементы — они создаются в цикле выше
    // (этот шаг просто для семантики, реальное скрытие ниже)

    // === ЗАГРУЗКА GLB-МОДЕЛИ (если задана) ===
    let loadedGltfScene = null;

    if (venue.modelSource) {
      onModelStatusChange?.('loading');

      const gltfLoader = new GLTFLoader();
      // Draco — для сжатых моделей. В production хостить локально.
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      gltfLoader.setDRACOLoader(dracoLoader);

      const onSuccess = (gltf) => {
        const model = gltf.scene;
        // Применяем калибровочные параметры (можно крутить динамически после загрузки)
        const cal = calibration || { scale: 1, x: 0, y: 0, z: 0, rotY: 0 };
        model.scale.setScalar(cal.scale);
        model.position.set(cal.x, cal.y, cal.z);
        model.rotation.y = cal.rotY;
        scene.add(model);
        loadedGltfScene = model;
        loadedSceneRef.current = model;
        // Скрываем программное окружение зала, оставляя кресла
        proceduralMeshes.forEach((m) => { if (m) m.visible = false; });
        onModelStatusChange?.('loaded');
      };

      const onError = (error) => {
        console.error('GLTF load error:', error);
        const msg = error?.message || error?.toString() || 'unknown error';
        onModelStatusChange?.('error', `[parse] ${msg}`);
      };

      try {
        if (venue.modelSource.type === 'file') {
          gltfLoader.parse(venue.modelSource.data, '', onSuccess, onError);
        } else {
          gltfLoader.load(venue.modelSource.data, onSuccess, undefined, onError);
        }
      } catch (e) {
        console.error('GLTF parse threw:', e);
        onModelStatusChange?.('error', `[throw] ${e?.message || e}`);
      }
    }

    // === InstancedMesh для мест ===
    const allSeats = [];
    for (const section of venue.sections) {
      for (const seat of section.seats) {
        allSeats.push({
          ...seat,
          worldX: section.origin.x + seat.x * Math.cos(section.rotation) - seat.z * Math.sin(section.rotation),
          worldY: section.origin.y,
          worldZ: section.origin.z + seat.x * Math.sin(section.rotation) + seat.z * Math.cos(section.rotation),
        });
      }
    }

    const seatGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const seatMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, allSeats.length);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    allSeats.forEach((seat, i) => {
      dummy.position.set(seat.worldX, seat.worldY + 0.2, seat.worldZ);
      dummy.updateMatrix();
      seatMesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(seatMesh);

    function updateColors() {
      const cats = categoryMap(venue);
      allSeats.forEach((seat, i) => {
        const isSelected = selectedRef.current.has(seat.id);
        const cat = cats[seat.category];
        if (seat.status === 'sold') {
          color.set(COLORS.sold);
        } else if (isSelected) {
          color.set(COLORS.selected);
        } else {
          color.set(cat?.color ?? '#999999');
        }
        seatMesh.setColorAt(i, color);
      });
      seatMesh.instanceColor.needsUpdate = true;
    }
    updateColors();

    // Raycast
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(seatMesh);
      if (intersects.length > 0) {
        const i = intersects[0].instanceId;
        const seat = allSeats[i];
        toggleSeat(seat.id, seat.status);
      }
    }

    // Custom orbit controls
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let azimuth = 0;
    let elevation = 0.6;
    let radius = 22;
    let dragStartX = 0;
    let dragStartY = 0;

    function onMouseDown(e) {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      azimuth -= dx * 0.005;
      elevation = Math.max(0.1, Math.min(1.2, elevation - dy * 0.005));
      prevX = e.clientX;
      prevY = e.clientY;
    }
    function onMouseUp(e) {
      isDragging = false;
      if (Math.abs(e.clientX - dragStartX) < 4 && Math.abs(e.clientY - dragStartY) < 4) {
        handleClick(e);
      }
    }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(8, Math.min(40, radius + e.deltaY * 0.02));
    }

    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', onMouseDown);
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let frame;
    function animate() {
      camera.position.x = Math.sin(azimuth) * Math.cos(elevation) * radius;
      camera.position.y = Math.sin(elevation) * radius;
      camera.position.z = Math.cos(azimuth) * Math.cos(elevation) * radius;
      camera.lookAt(0, 0, 2);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();

    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    sceneStateRef.current = { updateColors };

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onMouseDown);
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      seatGeo.dispose();
      seatMat.dispose();
      disposables.geometries.forEach((g) => g.dispose());
      disposables.materials.forEach((m) => m.dispose());

      // Dispose загруженной GLB-модели
      if (loadedGltfScene) {
        loadedGltfScene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
      }
    };
  }, [venue, toggleSeat, onModelStatusChange]);

  // Live-апдейт калибровки модели без пересборки всей сцены
  useEffect(() => {
    const model = loadedSceneRef.current;
    if (!model || !calibration) return;
    model.scale.setScalar(calibration.scale);
    model.position.set(calibration.x, calibration.y, calibration.z);
    model.rotation.y = calibration.rotY;
  }, [calibration]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />;
}

// =============================================================================
// APP
// =============================================================================

// =============================================================================
// CALIBRATION SLIDER COMPONENT
// =============================================================================

function CalibrationSlider({ label, value, onChange, min, max, step, format }) {
  return (
    <div style={styles.calSlider}>
      <label style={styles.calSliderLabel}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={styles.calSliderInput}
      />
      <span style={styles.calSliderValue}>{format(value)}</span>
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================

export default function App() {
  // ===== ЗАГРУЗКА ИНДЕКСА И ЗАЛОВ =====
  const [venueIndex, setVenueIndex] = useState(null);   // массив { id, name, file, ... }
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [venueData, setVenueData] = useState(null);     // полный JSON активного зала
  const [venueLoading, setVenueLoading] = useState(true);
  const [venueError, setVenueError] = useState(null);

  // 1. На старте грузим index.json
  useEffect(() => {
    fetch('/venues/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`index.json: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const venues = data.venues || [];
        setVenueIndex(venues);
        if (venues.length > 0) setSelectedVenueId(venues[0].id);
      })
      .catch((e) => {
        console.error('Failed to load venue index:', e);
        setVenueError(e.message);
        setVenueLoading(false);
      });
  }, []);

  // 2. Когда меняется selectedVenueId — грузим конкретный venue.json
  useEffect(() => {
    if (!selectedVenueId || !venueIndex) return;
    const entry = venueIndex.find((v) => v.id === selectedVenueId);
    if (!entry) return;

    setVenueLoading(true);
    setVenueError(null);
    fetch(`/venues/${entry.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${entry.file}: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setVenueData(data);
        setVenueLoading(false);
      })
      .catch((e) => {
        console.error('Failed to load venue:', e);
        setVenueError(e.message);
        setVenueLoading(false);
      });
  }, [selectedVenueId, venueIndex]);

  // ===== МОДЕЛЬ И КАЛИБРОВКА =====
  const [modelSource, setModelSource] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);

  const DEFAULT_CALIBRATION = { scale: 1, x: 0, y: 0, z: 0, rotY: 0 };
  const [calibration, setCalibration] = useState(DEFAULT_CALIBRATION);

  // Применяем калибровку из venue.json при загрузке зала (если есть)
  useEffect(() => {
    if (venueData?.modelCalibration) {
      setCalibration({ ...DEFAULT_CALIBRATION, ...venueData.modelCalibration });
    }
  }, [venueData?.id]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setModelSource({
        type: 'file',
        data: reader.result,
        name: file.name,
      });
      setCalibration(DEFAULT_CALIBRATION);
    };
    reader.onerror = () => console.error('File read error', reader.error);
    reader.readAsArrayBuffer(file);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    setModelSource({ type: 'url', data: url, name: url.split('/').pop() || url });
    setCalibration(DEFAULT_CALIBRATION);
  }, [urlInput]);

  const handleClearModel = useCallback(() => {
    setModelSource(null);
    setUrlInput('');
    setCalibration(DEFAULT_CALIBRATION);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleCopyCalibration = useCallback(() => {
    const json = JSON.stringify(calibration, null, 2);
    navigator.clipboard?.writeText(json);
  }, [calibration]);

  const handleResetCalibration = useCallback(() => {
    setCalibration(DEFAULT_CALIBRATION);
  }, []);

  // ===== VENUE с подставленным modelSource =====
  const venue = useMemo(
    () => (venueData ? { ...venueData, modelSource } : null),
    [venueData, modelSource]
  );
  const selection = useSeatSelection(venue);
  const [mode, setMode] = useState('2d');
  const [showCart, setShowCart] = useState(false);
  const [modelStatus, setModelStatus] = useState('none');
  const [modelError, setModelError] = useState('');
  const handleModelStatus = useCallback((status, errorMsg) => {
    setModelStatus(status);
    setModelError(errorMsg || '');
  }, []);

  const totalAvailable = useMemo(() => {
    if (!venue?.sections) return 0;
    return venue.sections.reduce(
      (sum, s) => sum + s.seats.filter((seat) => seat.status === 'available').length,
      0
    );
  }, [venue]);

  // ===== EARLY RETURN: loading / error =====
  if (venueLoading || !venue) {
    return (
      <div style={styles.app}>
        <style>{globalCss}</style>
        <div style={styles.loadingScreen}>
          <div style={styles.loadingLabel}>
            {venueError ? `ERROR · ${venueError}` : 'LOADING VENUE…'}
          </div>
          {venueError && (
            <div style={styles.loadingHint}>
              Убедитесь, что файлы залов сгенерированы: <code>npm run generate</code>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Карта категорий зала (доступна везде ниже в App)
  const cats = categoryMap(venue);

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>

      {/* HEADER */}
      <header style={styles.header}>
        <div>
          <div style={styles.docId}>DOC · SEAT-SELECTOR · v1.0 · DEMO</div>
          <h1 style={styles.title}>Выбор места</h1>
          <div style={styles.subtitle}>{venue.name}</div>
        </div>
        <div style={styles.stats}>
          <div style={styles.statBlock}>
            <div style={styles.statLabel}>СВОБОДНО</div>
            <div style={styles.statValue}>{totalAvailable}</div>
          </div>
          <div style={styles.statBlock}>
            <div style={styles.statLabel}>ВЫБРАНО</div>
            <div style={styles.statValue}>{selection.selectedSeats.length}</div>
          </div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <div style={styles.modeSwitcher}>
            <button
              onClick={() => setMode('2d')}
              style={{ ...styles.modeBtn, ...(mode === '2d' ? styles.modeBtnActive : {}) }}
            >
              2D
            </button>
            <button
              onClick={() => setMode('3d')}
              style={{ ...styles.modeBtn, ...(mode === '3d' ? styles.modeBtnActive : {}) }}
            >
              3D
            </button>
          </div>

          {/* Селектор зала */}
          {venueIndex && venueIndex.length > 1 && (
            <div style={styles.venueSelectWrap}>
              <label style={styles.venueSelectLabel}>VENUE</label>
              <select
                value={selectedVenueId || ''}
                onChange={(e) => {
                  setSelectedVenueId(e.target.value);
                  setShowCart(false);
                }}
                style={styles.venueSelect}
              >
                {venueIndex.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.seatCount} мест
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={styles.legend}>
          {venue.categories.map((cat) => (
            <div key={cat.id} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: cat.color }} />
              <span style={styles.legendLabel}>{cat.label}</span>
              <span style={styles.legendPrice}>${cat.price}</span>
            </div>
          ))}
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: COLORS.sold }} />
            <span style={styles.legendLabel}>продано</span>
          </div>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: COLORS.selected }} />
            <span style={styles.legendLabel}>выбрано</span>
          </div>
        </div>
      </div>

      {/* MODEL LOADER */}
      <div style={styles.modelBar}>
        <label style={styles.modelBarLabel}>VENUE MODEL</label>

        <button onClick={() => fileInputRef.current?.click()} style={styles.modelBarBtn}>
          + upload .glb
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div style={styles.modelBarDivider}>or</div>

        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSubmit(); }}
          placeholder="paste GLB URL"
          style={styles.modelBarInput}
        />

        {urlInput.trim() && modelSource?.type !== 'url' && (
          <button onClick={handleUrlSubmit} style={styles.modelBarBtn}>
            load
          </button>
        )}

        {modelSource && (
          <div style={styles.modelBarFile}>
            <span style={styles.modelBarFileDot} />
            {modelSource.name}
          </div>
        )}

        {modelSource && (
          <button onClick={handleClearModel} style={styles.modelBarClear}>
            clear
          </button>
        )}

        {modelSource && mode === '2d' && (
          <button onClick={() => setMode('3d')} style={styles.modelBarSwitch}>
            → switch to 3D
          </button>
        )}
      </div>

      {/* CALIBRATION — появляется когда модель успешно загружена */}
      {modelSource && modelStatus === 'loaded' && (
        <div style={styles.calibrationBar}>
          <label style={styles.modelBarLabel}>CALIBRATION</label>

          <CalibrationSlider
            label="scale"
            value={calibration.scale}
            onChange={(v) => setCalibration({ ...calibration, scale: v })}
            min={0.01} max={20} step={0.01}
            format={(v) => v.toFixed(2)}
          />
          <CalibrationSlider
            label="x"
            value={calibration.x}
            onChange={(v) => setCalibration({ ...calibration, x: v })}
            min={-30} max={30} step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <CalibrationSlider
            label="y"
            value={calibration.y}
            onChange={(v) => setCalibration({ ...calibration, y: v })}
            min={-10} max={10} step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <CalibrationSlider
            label="z"
            value={calibration.z}
            onChange={(v) => setCalibration({ ...calibration, z: v })}
            min={-30} max={30} step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <CalibrationSlider
            label="rotY"
            value={calibration.rotY}
            onChange={(v) => setCalibration({ ...calibration, rotY: v })}
            min={-Math.PI} max={Math.PI} step={0.01}
            format={(v) => v.toFixed(2)}
          />

          <button onClick={handleResetCalibration} style={styles.modelBarClear}>
            reset
          </button>
          <button onClick={handleCopyCalibration} style={styles.modelBarBtn}>
            copy JSON
          </button>
        </div>
      )}

      {/* CANVAS */}
      <div style={styles.canvas}>
        {mode === '2d' ? (
          <SeatMap2D venue={venue} selection={selection} />
        ) : (
          <SeatMap3D
            venue={venue}
            selection={selection}
            onModelStatusChange={handleModelStatus}
            calibration={calibration}
          />
        )}

        {mode === '3d' && modelStatus === 'loading' && (
          <div style={styles.modelStatus}>
            <span style={styles.modelStatusDot} />
            loading venue model…
          </div>
        )}

        {mode === '3d' && modelStatus === 'error' && (
          <div style={{ ...styles.modelStatus, ...styles.modelStatusError }}>
            <div style={{ marginBottom: modelError ? 6 : 0 }}>
              model load failed · using fallback geometry
            </div>
            {modelError && <div style={styles.modelStatusErrorDetail}>{modelError}</div>}
          </div>
        )}

        {mode === '3d' && modelStatus === 'loaded' && (
          <div style={styles.modelStatus}>
            <span style={{ ...styles.modelStatusDot, background: '#7a9b76' }} />
            venue model loaded
          </div>
        )}

        {mode === '3d' && (
          <div style={styles.hint3d}>
            drag · rotate &nbsp;·&nbsp; wheel · zoom &nbsp;·&nbsp; click · select
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={styles.footerLeft}>
          {selection.selectedSeats.length > 0 ? (
            <>
              <div style={styles.cartCount}>
                {selection.selectedSeats.length} {plural(selection.selectedSeats.length, ['место', 'места', 'мест'])}
              </div>
              <button onClick={() => setShowCart(true)} style={styles.linkBtn}>
                посмотреть выбор →
              </button>
            </>
          ) : (
            <div style={styles.cartEmpty}>Выберите место на схеме</div>
          )}
        </div>
        <div style={styles.footerRight}>
          <div style={styles.totalBlock}>
            <div style={styles.totalLabel}>ИТОГО</div>
            <div style={styles.totalValue}>${selection.total}</div>
          </div>
          <button
            style={{
              ...styles.checkoutBtn,
              ...(selection.selectedSeats.length === 0 ? styles.checkoutBtnDisabled : {}),
            }}
            disabled={selection.selectedSeats.length === 0}
          >
            Оформить
          </button>
        </div>
      </footer>

      {/* MODAL */}
      {showCart && (
        <div style={styles.modalBackdrop} onClick={() => setShowCart(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.docId}>SELECTION</div>
                <h2 style={styles.modalTitle}>Ваш выбор</h2>
              </div>
              <button onClick={() => setShowCart(false)} style={styles.modalClose}>×</button>
            </div>
            <div style={styles.modalBody}>
              {selection.selectedSeats.map((seat) => {
                const cat = cats[seat.category];
                return (
                  <div key={seat.id} style={styles.cartRow}>
                    <div>
                      <div style={styles.cartSeatLabel}>
                        {seat.sectionLabel} · ряд {seat.row}, место {seat.number}
                      </div>
                      <div style={styles.cartCategoryLabel}>
                        <span style={{ ...styles.legendDot, background: cat?.color }} />
                        {cat?.label}
                      </div>
                    </div>
                    <div style={styles.cartPrice}>${cat?.price ?? 0}</div>
                  </div>
                );
              })}
            </div>
            <div style={styles.modalFooter}>
              <button onClick={selection.clearSelection} style={styles.clearBtn}>
                Очистить
              </button>
              <div style={styles.modalTotal}>
                <span style={styles.modalTotalLabel}>ИТОГО</span>
                <span style={styles.modalTotalValue}>${selection.total}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

// =============================================================================
// STYLES
// =============================================================================

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: ${COLORS.bg}; color: ${COLORS.text}; }
  button { font-family: inherit; cursor: pointer; border: none; background: none; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;

const styles = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontSize: 15,
    lineHeight: 1.55,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: '24px 28px 20px',
    borderBottom: `1px solid ${COLORS.rule}`,
  },
  docId: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 12,
    letterSpacing: '0.05em',
  },
  title: {
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  stats: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 32,
  },
  statBlock: {
    textAlign: 'right',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 28px',
    flexWrap: 'wrap',
    gap: 16,
    borderBottom: `1px solid ${COLORS.rule}`,
    background: COLORS.bgAlt,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  venueSelectWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  venueSelectLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: COLORS.textMuted,
  },
  venueSelect: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: '6px 10px',
    background: COLORS.bg,
    color: COLORS.text,
    border: `1px solid ${COLORS.rule}`,
    cursor: 'pointer',
    outline: 'none',
  },
  loadingScreen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    background: COLORS.bg,
    padding: 24,
  },
  loadingLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    letterSpacing: '0.1em',
    color: COLORS.textMuted,
  },
  loadingHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 400,
  },
  modeSwitcher: {
    display: 'inline-flex',
    border: `1px solid ${COLORS.rule}`,
    background: COLORS.bg,
  },
  modeBtn: {
    padding: '8px 18px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: COLORS.textMuted,
    transition: 'all 0.12s',
    letterSpacing: '0.05em',
  },
  modeBtnActive: {
    background: COLORS.text,
    color: COLORS.bg,
  },
  legend: {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    fontSize: 12,
    alignItems: 'center',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    display: 'inline-block',
    borderRadius: 1,
  },
  legendLabel: { color: COLORS.textMuted, fontSize: 12 },
  legendPrice: {
    color: COLORS.text,
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  },
  canvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: COLORS.bg,
    minHeight: 300,
  },
  hint3d: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    background: COLORS.text,
    color: COLORS.bg,
    padding: '8px 14px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.05em',
  },
  modelStatus: {
    position: 'absolute',
    top: 16,
    left: 16,
    background: COLORS.bg,
    color: COLORS.text,
    padding: '6px 12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.04em',
    border: `1px solid ${COLORS.rule}`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  modelStatusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: COLORS.textMuted,
    display: 'inline-block',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  modelStatusError: {
    color: '#b54a2c',
    borderColor: '#b54a2c',
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: 'calc(100% - 32px)',
  },
  modelStatusErrorDetail: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: '#b54a2c',
    opacity: 0.85,
    wordBreak: 'break-word',
    maxWidth: 480,
    lineHeight: 1.4,
  },
  modelBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 28px',
    background: COLORS.bg,
    borderBottom: `1px solid ${COLORS.rule}`,
    flexWrap: 'wrap',
  },
  modelBarLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: COLORS.textMuted,
    whiteSpace: 'nowrap',
  },
  modelBarBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.05em',
    color: COLORS.text,
    background: COLORS.bg,
    border: `1px solid ${COLORS.text}`,
    padding: '6px 12px',
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
  },
  modelBarDivider: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: COLORS.textMuted,
    padding: '0 4px',
  },
  modelBarInput: {
    flex: 1,
    minWidth: 180,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: '6px 10px',
    border: `1px solid ${COLORS.rule}`,
    background: COLORS.bg,
    color: COLORS.text,
    outline: 'none',
    transition: 'border-color 0.12s',
  },
  modelBarFile: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.text,
    background: COLORS.bgAlt,
    padding: '4px 8px',
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modelBarFileDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#7a9b76',
    flexShrink: 0,
  },
  modelBarClear: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.textMuted,
    padding: '4px 8px',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  modelBarSwitch: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.bg,
    background: COLORS.text,
    padding: '5px 10px',
    letterSpacing: '0.05em',
  },
  calibrationBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '10px 28px',
    background: COLORS.bgAlt,
    borderBottom: `1px solid ${COLORS.rule}`,
    flexWrap: 'wrap',
  },
  calSlider: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  calSliderLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: COLORS.textMuted,
    minWidth: 28,
    letterSpacing: '0.05em',
  },
  calSliderInput: {
    width: 100,
    height: 4,
    cursor: 'pointer',
    accentColor: COLORS.text,
  },
  calSliderValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.text,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 44,
    textAlign: 'right',
  },
  
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 28px',
    background: COLORS.text,
    color: COLORS.bg,
    gap: 16,
  },
  footerLeft: { display: 'flex', flexDirection: 'column', gap: 4 },
  footerRight: { display: 'flex', alignItems: 'center', gap: 24 },
  cartCount: {
    fontSize: 16,
    fontWeight: 500,
  },
  cartEmpty: {
    color: '#a8a8a8',
    fontSize: 13,
  },
  linkBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.05em',
    color: '#a8a8a8',
    textAlign: 'left',
    padding: 0,
  },
  totalBlock: {
    textAlign: 'right',
  },
  totalLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: '#a8a8a8',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  checkoutBtn: {
    background: COLORS.bg,
    color: COLORS.text,
    padding: '12px 22px',
    fontSize: 14,
    fontWeight: 600,
    transition: 'transform 0.15s',
    border: `1px solid ${COLORS.bg}`,
  },
  checkoutBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(26,26,26,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 16,
  },
  modal: {
    background: COLORS.bg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: `1px solid ${COLORS.rule}`,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px 16px',
    borderBottom: `1px solid ${COLORS.rule}`,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: '-0.005em',
  },
  modalClose: {
    fontSize: 24,
    lineHeight: 1,
    color: COLORS.textMuted,
    padding: '0 4px',
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
  },
  cartRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    borderBottom: `1px solid ${COLORS.rule}`,
  },
  cartSeatLabel: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 4,
  },
  cartCategoryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  cartPrice: {
    fontSize: 16,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    fontVariantNumeric: 'tabular-nums',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: COLORS.bgAlt,
  },
  clearBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.05em',
    color: COLORS.textMuted,
    padding: 0,
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  modalTotal: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  modalTotalLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.08em',
    color: COLORS.textMuted,
  },
  modalTotalValue: {
    fontSize: 20,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: COLORS.text,
  },
};
