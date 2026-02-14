// ─────────────────────────────────────────────
//  Valentine Oyster – Three.js Mini Game
//  3D oyster → unscrew → knife → cut → feed dachshund
// ─────────────────────────────────────────────

let scene, camera, renderer, raycaster, mouse;
let oysterGroup, topShell, bottomShell, topShellPivot, fleshMesh, fleshGroup, adductorMuscle;
let knifeModel, dachshundGroup;
let screws = [];
let screwsRemoved = 0;
const TOTAL_SCREWS = 5;
let knifeSelected = false;
let animating = false;
let fleshLifted = false;
let fleshCut = false;

// Drag rotation
let isDragging = false;
let dragStartX = 0;
let dragStartRotY = 0;
let rotationVelocity = 0;
let targetRotY = 0;

// Drag-and-drop feeding
let isDraggingFlesh = false;
let fleshHoverPos = null; // saved position flesh returns to if dropped wrong

// Camera zoom (pinch-to-zoom)
let cameraZoom = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
let pinchStartDist = 0;
let pinchStartZoom = 1.0;
let isPinching = false;

// Camera target (smooth transitions between phases)
let cameraTargetPos = new THREE.Vector3(0, 5, 9);
let cameraLookTarget = new THREE.Vector3(0, 0, 0);
let cameraBasePos = new THREE.Vector3(0, 5, 9);
let cameraBaseLook = new THREE.Vector3(0, 0, 0);

// Game phases: screws → knife → cut → lift → feed → reveal
let gamePhase = 'screws';

// ── Colours ──
const C = {
  shellOuter:  0x8b7d6b, // rough grey-brown oyster exterior
  shellInner:  0xe8ddd0, // pearlescent nacre interior
  shellEdge:   0x6b5e50, // dark edge
  screw:       0xd4af37, // gold
  screwHead:   0xc5981a,
  flesh:       0xd4b896, // oyster meat - pale beige/cream
  fleshWet:    0xc8a882, // slightly darker wet look
  knifeBladeT: 0xc0c0c0, // steel
  knifeBlade:  0xa8a8a8,
  knifeHandle: 0x5c3a1e, // dark wood
  dogBody:     0x8b4513, // brown dachshund
  dogDark:     0x6b3410, // darker brown
  dogNose:     0x1a1a1a,
  bg:          0x2d1520,
  accent:      0xe8587a,
  highlight:   0xff7e9d,
};

// ──────────── INIT ────────────
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.fog = new THREE.FogExp2(C.bg, 0.008);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 9);
  camera.lookAt(0, 0, 0);

  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lights
  scene.add(new THREE.AmbientLight(0xffc0cb, 0.65));

  const key = new THREE.DirectionalLight(0xfff5ee, 1.0);
  key.position.set(5, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const fill = new THREE.PointLight(0xe8587a, 0.5, 25);
  fill.position.set(-5, 4, -3);
  scene.add(fill);

  const rim = new THREE.PointLight(0xff7e9d, 0.3, 20);
  rim.position.set(2, -2, 6);
  scene.add(rim);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Build everything
  createOyster();
  createScrews();
  createFlesh();
  createKnife();
  createDachshund();
  createHeartParticles();

  // Surface for oyster to sit on
  createSurface();

  window.addEventListener('resize', onResize);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  // Pinch-to-zoom (touch events)
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  // Mouse wheel zoom (desktop)
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.getElementById('knife-btn').addEventListener('click', selectKnife);

  // Set initial camera based on aspect ratio
  adjustCameraForScreen();

  animate();
}

// ──────────── SURFACE (crushed ice / table) ────────────
function createSurface() {
  const geo = new THREE.PlaneGeometry(20, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a1a25,
    roughness: 0.9,
    metalness: 0.0,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -1.2;
  plane.receiveShadow = true;
  scene.add(plane);
}

// ──────────── OYSTER SHELL ────────────
// Realistic oyster: teardrop silhouette, narrow hinge, wide ruffled lip,
// concentric growth ridges, rough layered exterior, smooth nacre interior.

// The hinge x-position (narrow end of the teardrop)
const HINGE_X = -oysterRadius(Math.PI);  // will be ~-0.8

function createOyster() {
  oysterGroup = new THREE.Group();
  scene.add(oysterGroup);

  bottomShell = createShellHalf(false);
  oysterGroup.add(bottomShell);

  // Top shell is wrapped in a pivot group so it rotates from the hinge
  topShellPivot = new THREE.Group();
  topShellPivot.position.set(HINGE_X, 0, 0); // pivot at hinge point
  oysterGroup.add(topShellPivot);

  topShell = createShellHalf(true);
  topShell.position.x = -HINGE_X; // offset shell so hinge point is at local origin
  topShellPivot.add(topShell);

  // Hinge nub (visible knob where shells connect)
  const hingeGeo = new THREE.SphereGeometry(0.2, 12, 8);
  const hingeMat = new THREE.MeshStandardMaterial({
    color: 0x5a4e40, roughness: 0.9, side: THREE.DoubleSide,
  });
  const hinge = new THREE.Mesh(hingeGeo, hingeMat);
  hinge.scale.set(1.4, 0.6, 1.2);
  hinge.position.set(HINGE_X, 0.0, 0);
  oysterGroup.add(hinge);

  // Second hinge knob for realism
  const hinge2 = hinge.clone();
  hinge2.scale.set(1.0, 0.4, 0.8);
  hinge2.position.set(HINGE_X - 0.15, 0.05, 0);
  oysterGroup.add(hinge2);

  oysterGroup.position.y = -0.3;
  // Rotate so the wide opening end faces the camera (+z)
  oysterGroup.rotation.y = -Math.PI / 2;
  targetRotY = -Math.PI / 2;
}

// Attempt a teardrop radius: narrow at angle=PI (hinge, -x), wide at angle=0 (lip, +x)
function oysterRadius(angle) {
  // angle is measured around the shell rim in the xz-plane
  // At angle=0 (+x direction) → wide end (lip)
  // At angle=PI (-x direction) → narrow end (hinge)
  const cosA = Math.cos(angle);
  // Base teardrop: wider toward +x, narrower toward -x
  const base = 1.7 + 0.9 * cosA;  // ranges ~0.8 to ~2.6
  // Slight left-right asymmetry (oysters are never symmetric)
  const asym = Math.sin(angle) * 0.15;
  // Wavy ruffled edge
  const ruffle = Math.sin(angle * 6) * 0.08 + Math.sin(angle * 10 + 1) * 0.04;
  return base + asym + ruffle;
}

function createShellHalf(isTop) {
  const group = new THREE.Group();

  // Build shell from a hemisphere, then warp each vertex into our teardrop
  const segsU = 56;  // around the rim
  const segsV = 28;  // from rim to apex
  const shellGeo = new THREE.SphereGeometry(1, segsU, segsV, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = shellGeo.attributes.position;

  const depth = isTop ? 0.30 : 0.45;  // top shell flatter, bottom cupped

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Spherical coords on the unit hemisphere
    const horiz = Math.sqrt(x * x + z * z); // 0 at pole, 1 at equator
    const angle = Math.atan2(z, x);          // angle around rim

    // Desired radius at this rim angle
    const R = oysterRadius(angle);

    // Scale x,z by the teardrop radius (keeping the angular direction)
    if (horiz > 0.001) {
      x = (x / horiz) * horiz * R;
      z = (z / horiz) * horiz * R;
    }

    // Height (y): flatten the dome, make it shallower
    y *= depth * R * 0.5;

    // Concentric growth ridges: bumps that follow the rim shape
    const ridgeFreq = horiz * 18; // more ridges toward the edge
    const ridgeAmp = 0.03 + horiz * 0.04;
    y += Math.sin(ridgeFreq) * ridgeAmp;

    // Radial ridges from hinge (like rays on a real oyster)
    const radialRidge = Math.sin(angle * 14) * 0.015 * horiz;
    y += radialRidge;

    // Organic randomness
    const noise = Math.sin(angle * 7 + horiz * 5) * 0.02
                + Math.cos(angle * 11 - horiz * 3) * 0.015;
    y += noise;

    // Ruffled edge: extra height wobble near the rim
    if (horiz > 0.7) {
      const edgeFactor = (horiz - 0.7) / 0.3;
      y += Math.sin(angle * 8 + 2) * 0.06 * edgeFactor;
      // Slight outward flare
      const flare = 1 + edgeFactor * 0.08;
      x *= flare;
      z *= flare;
    }

    pos.setXYZ(i, x, y, z);
  }
  shellGeo.computeVertexNormals();

  // --- Outer surface (rough, layered) ---
  const outerMat = new THREE.MeshStandardMaterial({
    color: C.shellOuter,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(shellGeo, outerMat);
  outer.castShadow = true;
  group.add(outer);

  // --- Inner surface (smooth nacre) ---
  const innerGeo = shellGeo.clone();
  const iPos = innerGeo.attributes.position;
  for (let i = 0; i < iPos.count; i++) {
    iPos.setX(i, iPos.getX(i) * 0.94);
    iPos.setY(i, iPos.getY(i) * 0.85);
    iPos.setZ(i, iPos.getZ(i) * 0.94);
  }
  innerGeo.computeVertexNormals();

  const innerMat = new THREE.MeshStandardMaterial({
    color: C.shellInner,
    roughness: 0.1,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  group.add(inner);

  // --- Rough barnacle / calcite lumps scattered on exterior ---
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 0.3 + Math.random() * 0.5;
    const R = oysterRadius(a) * d;
    const lumpSize = 0.06 + Math.random() * 0.1;
    const lumpGeo = new THREE.SphereGeometry(lumpSize, 6, 5);
    const lumpMat = new THREE.MeshStandardMaterial({
      color: [0x8a7e6e, 0x6b6050, 0x9a9080, 0x5e5545][i % 4],
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const lump = new THREE.Mesh(lumpGeo, lumpMat);
    lump.position.set(
      Math.cos(a) * R,
      (isTop ? 0.15 : -0.15) + Math.random() * 0.08,
      Math.sin(a) * R
    );
    lump.scale.set(1 + Math.random() * 0.5, 0.3 + Math.random() * 0.4, 1 + Math.random() * 0.5);
    group.add(lump);
  }

  // Position shells
  if (isTop) {
    // Lid: dome up, concave nacre side faces DOWN onto the bottom shell
    // No flip needed — hemisphere naturally has opening at y=0
    group.position.y = 0.08;
  } else {
    // Bowl: flip so concave side faces UP (holds the flesh)
    group.rotation.x = Math.PI;
    group.position.y = 0;
  }

  return group;
}

// ──────────── SCREWS (gold bolts around the seam) ────────────
function createScrews() {
  for (let i = 0; i < TOTAL_SCREWS; i++) {
    // Spread screws around the front/sides (skip the hinge end at PI)
    const angle = -Math.PI * 0.6 + (i / (TOTAL_SCREWS - 1)) * Math.PI * 1.2;
    const R = oysterRadius(angle) * 0.95; // just inside the edge
    const x = Math.cos(angle) * R;
    const z = Math.sin(angle) * R;

    const screwGroup = new THREE.Group();
    screwGroup.position.set(x, -0.18, z); // sunk deep into the shell seam
    screwGroup.rotation.y = -angle;

    // Shaft (hidden inside the shell)
    const shaftGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12);
    const screwMat = new THREE.MeshStandardMaterial({
      color: C.screw, roughness: 0.2, metalness: 0.85,
    });
    const shaft = new THREE.Mesh(shaftGeo, screwMat);
    shaft.position.y = 0.1;
    screwGroup.add(shaft);

    // Head (just barely visible above the seam)
    const headGeo = new THREE.CylinderGeometry(0.15, 0.13, 0.1, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: C.screwHead, roughness: 0.15, metalness: 0.9,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.42;
    screwGroup.add(head);

    // Phillips cross (on top of head)
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x8b7320, metalness: 0.9, roughness: 0.3 });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.025), slotMat);
    s1.position.y = 0.48;
    screwGroup.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.025), slotMat);
    s2.position.y = 0.48;
    s2.rotation.y = Math.PI / 2;
    screwGroup.add(s2);

    // Thread rings
    for (let t = 0; t < 4; t++) {
      const tGeo = new THREE.TorusGeometry(0.08, 0.012, 6, 16);
      const thread = new THREE.Mesh(tGeo, screwMat);
      thread.rotation.x = Math.PI / 2;
      thread.position.y = -0.05 + t * 0.1;
      screwGroup.add(thread);
    }

    screwGroup.userData = { isScrew: true, removed: false, index: i, angle };
    oysterGroup.add(screwGroup);
    screws.push(screwGroup);
  }
}

// ──────────── OYSTER FLESH ────────────
function createFlesh() {
  fleshGroup = new THREE.Group();

  // Main flesh blob — matches the teardrop shell interior
  const fleshGeo = new THREE.SphereGeometry(1, 36, 20);
  const pos = fleshGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const horiz = Math.sqrt(x * x + z * z);
    const angle = Math.atan2(z, x);

    // Match teardrop shape (scaled down to sit inside shell)
    const R = oysterRadius(angle) * 0.68;
    if (horiz > 0.001) {
      x = (x / horiz) * horiz * R;
      z = (z / horiz) * horiz * R;
    }

    // Flatten into a thick slab
    y *= 0.2;
    // Dome on top, flat bottom (oyster meat sits in the cup)
    if (y > 0) y *= 1.4;
    else y *= 0.5;

    // Organic membrane wobble
    const wobble = Math.sin(angle * 4) * 0.04 + Math.cos(angle * 7 + 1) * 0.03;
    y += wobble * horiz;

    pos.setXYZ(i, x, y, z);
  }
  fleshGeo.computeVertexNormals();

  const fleshMat = new THREE.MeshStandardMaterial({
    color: C.flesh,
    roughness: 0.5,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  fleshMesh = new THREE.Mesh(fleshGeo, fleshMat);
  fleshMesh.castShadow = true;
  fleshGroup.add(fleshMesh);

  // Wet sheen layer on top
  const sheenGeo = fleshGeo.clone();
  const sp = sheenGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    if (sp.getY(i) > 0) sp.setY(i, sp.getY(i) + 0.01);
  }
  sheenGeo.computeVertexNormals();
  const sheenMat = new THREE.MeshStandardMaterial({
    color: C.fleshWet, roughness: 0.08, metalness: 0.35,
    transparent: true, opacity: 0.4,
  });
  fleshGroup.add(new THREE.Mesh(sheenGeo, sheenMat));

  // Mantle frill — dark ruffled edge around the meat
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const fR = oysterRadius(a) * 0.62;
    const frillGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 6, 5);
    const frill = new THREE.Mesh(frillGeo, new THREE.MeshStandardMaterial({
      color: [0xb89a70, 0xa08860, 0xc4a67a, 0x9a8560][i % 4],
      roughness: 0.6, side: THREE.DoubleSide,
    }));
    frill.scale.set(1.3, 0.3, 1.3);
    frill.position.set(Math.cos(a) * fR, -0.02, Math.sin(a) * fR);
    fleshGroup.add(frill);
  }

  // Adductor muscle (the round bit you cut to detach)
  const muscleGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.1, 16);
  adductorMuscle = new THREE.Mesh(muscleGeo, new THREE.MeshStandardMaterial({
    color: 0xbfa07a, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide,
    emissive: new THREE.Color(0x000000), emissiveIntensity: 0,
  }));
  adductorMuscle.position.set(0.6, 0.1, -0.15);
  fleshGroup.add(adductorMuscle);

  fleshGroup.position.y = -0.15;
  fleshGroup.visible = false;  // Hidden until oyster opens
  fleshGroup.userData = { isFlesh: true };
  oysterGroup.add(fleshGroup);
}

// ──────────── OYSTER KNIFE (3D model) ────────────
function createKnife() {
  knifeModel = new THREE.Group();

  // Handle — rounded wooden grip
  const handleGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.1, 12);
  // Round the ends
  const handleMat = new THREE.MeshStandardMaterial({
    color: C.knifeHandle,
    roughness: 0.7,
    metalness: 0.05,
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.7;
  knifeModel.add(handle);

  // Handle end cap (rounded)
  const capGeo = new THREE.SphereGeometry(0.14, 12, 8);
  const cap = new THREE.Mesh(capGeo, handleMat);
  cap.position.x = -1.25;
  knifeModel.add(cap);

  // Bolster (metal piece between handle and blade)
  const bolsterGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.15, 12);
  const metalMat = new THREE.MeshStandardMaterial({
    color: C.knifeBlade,
    roughness: 0.2,
    metalness: 0.9,
  });
  const bolster = new THREE.Mesh(bolsterGeo, metalMat);
  bolster.rotation.z = Math.PI / 2;
  bolster.position.x = -0.1;
  knifeModel.add(bolster);

  // Blade — short, sturdy, slightly tapered
  // Oyster knives have a thick, stubby blade
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.06);
  bladeShape.lineTo(1.0, -0.03);  // tapers to narrower tip
  bladeShape.lineTo(1.1, 0);       // rounded tip
  bladeShape.lineTo(1.0, 0.03);
  bladeShape.lineTo(0, 0.06);
  bladeShape.lineTo(0, -0.06);

  const bladeExtrude = { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.005, bevelSegments: 3 };
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, bladeExtrude);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: C.knifeBladeT,
    roughness: 0.15,
    metalness: 0.95,
  });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0, -0.01);
  blade.castShadow = true;
  knifeModel.add(blade);

  // Position knife off-screen initially
  knifeModel.position.set(6, 2, 0);
  knifeModel.rotation.z = -0.2;
  knifeModel.visible = false;
  knifeModel.scale.set(1.2, 1.2, 1.2);
  scene.add(knifeModel);
}

// ──────────── DACHSHUND (low-poly 3D model) ────────────
function createDachshund() {
  dachshundGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: C.dogBody, roughness: 0.7, metalness: 0.0,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: C.dogDark, roughness: 0.7, metalness: 0.0,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: C.dogNose, roughness: 0.5, metalness: 0.1,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.3, metalness: 0.2,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.3,
  });
  const tongueMat = new THREE.MeshStandardMaterial({
    color: 0xe85880, roughness: 0.4,
  });

  // BODY — long capsule (the dachshund trademark!)
  const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.8, 12, 16);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.2;
  body.castShadow = true;
  dachshundGroup.add(body);

  // Belly (slightly lighter underside)
  const bellyGeo = new THREE.CapsuleGeometry(0.42, 1.5, 8, 12);
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xa0652e, roughness: 0.7,
  });
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.rotation.z = Math.PI / 2;
  belly.position.set(0, 0.05, 0);
  dachshundGroup.add(belly);

  // HEAD
  const headGeo = new THREE.SphereGeometry(0.45, 16, 12);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(1.3, 0.45, 0);
  head.scale.set(1, 0.9, 0.9);
  head.castShadow = true;
  dachshundGroup.add(head);
  dachshundGroup.userData.head = head;

  // SNOUT — elongated
  const snoutGeo = new THREE.CapsuleGeometry(0.18, 0.4, 8, 10);
  const snout = new THREE.Mesh(snoutGeo, darkMat);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(1.75, 0.35, 0);
  dachshundGroup.add(snout);

  // NOSE
  const noseGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(2.0, 0.38, 0);
  dachshundGroup.add(nose);

  // EYES
  [-1, 1].forEach(side => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeWhiteMat);
    eyeWhite.position.set(1.55, 0.58, side * 0.28);
    dachshundGroup.add(eyeWhite);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eye.position.set(1.58, 0.58, side * 0.28);
    dachshundGroup.add(eye);
  });

  // EARS — floppy!
  [-1, 1].forEach(side => {
    const earGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const ear = new THREE.Mesh(earGeo, darkMat);
    ear.scale.set(0.6, 1.2, 1);
    ear.position.set(1.1, 0.25, side * 0.4);
    ear.rotation.x = side * 0.3;
    ear.castShadow = true;
    dachshundGroup.add(ear);
  });

  // LEGS — short stubby legs!
  const legPositions = [
    { x: 0.7, z: 0.3 },   // front right
    { x: 0.7, z: -0.3 },  // front left
    { x: -0.7, z: 0.3 },  // back right
    { x: -0.7, z: -0.3 }, // back left
  ];
  legPositions.forEach(lp => {
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.3, 6, 8);
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(lp.x, -0.3, lp.z);
    leg.castShadow = true;
    dachshundGroup.add(leg);

    // Paw
    const pawGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const paw = new THREE.Mesh(pawGeo, darkMat);
    paw.scale.set(1, 0.6, 1.2);
    paw.position.set(lp.x, -0.55, lp.z);
    dachshundGroup.add(paw);
  });

  // TAIL — thin, slightly curved up
  const tailGeo = new THREE.CapsuleGeometry(0.05, 0.5, 6, 8);
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(-1.3, 0.4, 0);
  tail.rotation.z = -0.8;
  dachshundGroup.add(tail);
  dachshundGroup.userData.tail = tail;

  // TONGUE (hidden initially, shown when eating)
  const tongueGeo = new THREE.CapsuleGeometry(0.05, 0.15, 6, 8);
  const tongue = new THREE.Mesh(tongueGeo, tongueMat);
  tongue.position.set(1.95, 0.25, 0.05);
  tongue.rotation.z = 0.5;
  tongue.visible = false;
  dachshundGroup.add(tongue);
  dachshundGroup.userData.tongue = tongue;

  // Scale and position the whole dog
  dachshundGroup.scale.set(0.9, 0.9, 0.9);
  dachshundGroup.position.set(5.5, -0.65, 1);
  dachshundGroup.rotation.y = -Math.PI / 3;
  dachshundGroup.visible = false;
  dachshundGroup.userData.isDachshund = true;

  scene.add(dachshundGroup);
}

// ──────────── HEART PARTICLES ────────────
let hearts = [];
function createHeartParticles() {
  const heartShape = new THREE.Shape();
  const s = 0.06;
  heartShape.moveTo(0, s * 2);
  heartShape.bezierCurveTo(0, s * 3, -s * 3, s * 3, -s * 3, s);
  heartShape.bezierCurveTo(-s * 3, -s, 0, -s * 2, 0, -s * 3);
  heartShape.bezierCurveTo(0, -s * 2, s * 3, -s, s * 3, s);
  heartShape.bezierCurveTo(s * 3, s * 3, 0, s * 3, 0, s * 2);

  const extrudeSettings = { depth: 0.02, bevelEnabled: false };
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);

  for (let i = 0; i < 15; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? C.accent : C.highlight,
      emissive: C.accent,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.5,
    });
    const heart = new THREE.Mesh(heartGeo, mat);
    heart.position.set(
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 10 - 4
    );
    heart.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    const sc = 0.4 + Math.random() * 1.2;
    heart.scale.set(sc, sc, sc);
    heart.userData.floatSpeed = 0.3 + Math.random() * 0.6;
    heart.userData.floatOffset = Math.random() * Math.PI * 2;
    scene.add(heart);
    hearts.push(heart);
  }
}

// ──────────── INTERACTIONS ────────────
function onPointerDown(e) {
  if (animating || isPinching) return;
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);

  if (gamePhase === 'screws') {
    // Check if we hit a screw first
    const meshes = [];
    screws.forEach(s => {
      if (!s.userData.removed) s.traverse(c => { if (c.isMesh) meshes.push(c); });
    });
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      handleScrewClick();
      return;
    }
    // No screw hit — start drag rotation
    isDragging = true;
    dragStartX = e.clientX;
    dragStartRotY = targetRotY;
    rotationVelocity = 0;
    return;
  }

  if ((gamePhase === 'knife' || gamePhase === 'cut') && knifeSelected) {
    // Snap knife to touch/click position (essential for mobile where no hover exists)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersect);
    if (intersect && knifeModel.visible) {
      knifeModel.position.x = intersect.x + 0.8;
      knifeModel.position.y = intersect.y;
      knifeModel.position.z = 2;
    }
  }

  if (gamePhase === 'knife' && knifeSelected) {
    handleShellClick();
  } else if (gamePhase === 'cut' && knifeSelected) {
    handleCutClick();
  } else if (gamePhase === 'lift') {
    handleLiftClick();
  } else if (gamePhase === 'feed') {
    handleFeedPointerDown(e);
  }
}

function onPointerUp(e) {
  isDragging = false;

  // Drop flesh during feed phase
  if (isDraggingFlesh && gamePhase === 'feed') {
    isDraggingFlesh = false;
    document.body.style.cursor = 'default';

    // Check if dropped on the dachshund
    updateMouse(e);
    raycaster.setFromCamera(mouse, camera);
    const meshes = [];
    dachshundGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      // Dropped on the dog — feed it!
      feedDachshund();
    } else {
      // Missed — animate flesh back to hover position
      returnFleshToHover();
    }
  }
}

function onPointerMove(e) {
  if (isPinching) return;
  updateMouse(e);

  // Handle drag rotation (during screw phase)
  if (isDragging && gamePhase === 'screws') {
    const dx = e.clientX - dragStartX;
    const newRot = dragStartRotY + dx * 0.008;
    rotationVelocity = (newRot - targetRotY) * 0.5;
    targetRotY = newRot;
    document.body.style.cursor = 'grabbing';
    return;
  }

  if (animating) return;
  raycaster.setFromCamera(mouse, camera);

  if (gamePhase === 'screws') {
    const meshes = [];
    screws.forEach(s => {
      if (!s.userData.removed) s.traverse(c => { if (c.isMesh) meshes.push(c); });
    });
    document.body.style.cursor = raycaster.intersectObjects(meshes).length > 0 ? 'pointer' : 'grab';
  } else if ((gamePhase === 'knife' || gamePhase === 'cut') && knifeSelected) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersect = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersect);
    if (intersect && knifeModel.visible) {
      knifeModel.position.x = intersect.x + 0.8;
      knifeModel.position.y = intersect.y;
      knifeModel.position.z = 2;
    }

    // During cut phase, highlight knife when over the actual meat (not frills/decorations)
    if (gamePhase === 'cut') {
      const meatMeshes = [fleshMesh, adductorMuscle].filter(Boolean);
      const overFlesh = raycaster.intersectObjects(meatMeshes).length > 0;

      // Glow the blade when it's in the cut zone
      knifeModel.traverse(c => {
        if (c.material && c.material.metalness > 0.5) {
          // Metal parts (blade, bolster)
          if (overFlesh) {
            c.material.emissive = c.material.emissive || new THREE.Color();
            c.material.emissive.setHex(0xff4466);
            c.material.emissiveIntensity = 0.4;
          } else {
            c.material.emissiveIntensity = 0;
          }
        }
      });

      // Tilt the knife slightly to show readiness
      knifeModel.rotation.z = overFlesh ? -0.35 : -0.2;
    }

    document.body.style.cursor = 'none';
  } else if (gamePhase === 'lift') {
    const meshes = [];
    fleshGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
    document.body.style.cursor = raycaster.intersectObjects(meshes).length > 0 ? 'grab' : 'default';
  } else if (gamePhase === 'feed') {
    if (isDraggingFlesh) {
      // Move flesh to follow cursor in 3D
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersect);
      if (intersect) {
        fleshGroup.position.x = intersect.x;
        fleshGroup.position.y = intersect.y;
        fleshGroup.position.z = intersect.z * 0.3; // dampen z movement
      }
      // Check if hovering over the dog for visual feedback
      const dogMeshes = [];
      dachshundGroup.traverse(c => { if (c.isMesh) dogMeshes.push(c); });
      const hits = raycaster.intersectObjects(dogMeshes);
      document.body.style.cursor = hits.length > 0 ? 'copy' : 'grabbing';
    } else {
      // Check if hovering over flesh (grabbable)
      const fleshMeshes = [];
      fleshGroup.traverse(c => { if (c.isMesh) fleshMeshes.push(c); });
      document.body.style.cursor = raycaster.intersectObjects(fleshMeshes).length > 0 ? 'grab' : 'default';
    }
  }
}

function updateMouse(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

// ── Phase: Screws ──
function handleScrewClick() {
  const meshes = [];
  screws.forEach(s => {
    if (!s.userData.removed) s.traverse(c => { if (c.isMesh) meshes.push(c); });
  });
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    let sg = hits[0].object;
    while (sg.parent && !sg.userData.isScrew) sg = sg.parent;
    if (sg.userData.isScrew && !sg.userData.removed) {
      unscrewScrew(sg);
    }
  }
}

function unscrewScrew(sg) {
  animating = true;
  sg.userData.removed = true;
  screwsRemoved++;

  const duration = 800;
  const startY = sg.position.y;
  const startRot = sg.rotation.y;
  const startTime = performance.now();

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    sg.position.y = startY + ease * 2.5;
    sg.rotation.y = startRot + ease * Math.PI * 6;
    if (t > 0.6) sg.scale.setScalar(1 - (t - 0.6) / 0.4);
    sg.rotation.z = ease * 0.3;

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      sg.visible = false;
      animating = false;
      if (screwsRemoved >= TOTAL_SCREWS) onAllScrewsRemoved();
    }
  }
  requestAnimationFrame(anim);
}

function onAllScrewsRemoved() {
  gamePhase = 'knife';
  setCameraForPhase('knife');
  hideHint('hint');
  document.getElementById('sidebar').classList.remove('hidden');
  showHint('hint-knife');
}

// ── Phase: Knife (open shell) ──
function selectKnife() {
  if (gamePhase !== 'knife' && gamePhase !== 'cut') return;
  knifeSelected = true;
  document.getElementById('knife-btn').classList.add('selected');
  knifeModel.visible = true;
}

function handleShellClick() {
  const meshes = [];
  oysterGroup.traverse(c => {
    if (c.isMesh && !c.parent?.userData?.isScrew && !c.parent?.userData?.isFlesh) meshes.push(c);
  });
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    openOyster();
  }
}

function openOyster() {
  animating = true;
  gamePhase = 'opening';
  hideHint('hint-knife');

  const duration = 1400;
  const startTime = performance.now();

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    // Top shell hinges open like a clam lid lifting upward
    topShellPivot.rotation.z = ease * Math.PI * 0.45;

    // Camera adjusts (direct control during opening)
    const aspect = window.innerWidth / window.innerHeight;
    const extraPull = aspect < 1 ? (1 - aspect) * 4 : 0;
    camera.position.y = 5 - ease * 1.5;
    camera.position.z = (9 + extraPull) - ease * 2;
    camera.lookAt(0, ease * -0.2, 0);

    // Show flesh partway through
    if (t > 0.4 && !fleshGroup.visible) {
      fleshGroup.visible = true;
    }

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      animating = false;
      gamePhase = 'cut';
      setCameraForPhase('cut');
      showHint('hint-cut');
    }
  }
  requestAnimationFrame(anim);
}

// ── Phase: Cut flesh ──
function handleCutClick() {
  const meatMeshes = [fleshMesh, adductorMuscle].filter(Boolean);
  const hits = raycaster.intersectObjects(meatMeshes);
  if (hits.length > 0) {
    cutFlesh();
  }
}

function cutFlesh() {
  animating = true;
  fleshCut = true;
  hideHint('hint-cut');

  // Knife stab animation
  const duration = 600;
  const startTime = performance.now();
  const knifeStartX = knifeModel.position.x;

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);

    // Knife jabs forward
    if (t < 0.5) {
      const jab = t / 0.5;
      knifeModel.position.z = 2 - jab * 2.5;
      knifeModel.rotation.z = -0.2 - jab * 0.1;
    } else {
      const retract = (t - 0.5) / 0.5;
      knifeModel.position.z = -0.5 + retract * 2.5;
      knifeModel.rotation.z = -0.3 + retract * 0.1;
    }

    // Flesh jiggles when hit
    if (t > 0.3 && t < 0.7) {
      const jiggle = Math.sin((t - 0.3) * 50) * 0.03 * (1 - (t - 0.3) / 0.4);
      fleshGroup.position.x = jiggle;
    } else {
      fleshGroup.position.x = 0;
    }

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      knifeModel.position.z = 2;
      animating = false;
      gamePhase = 'lift';
      setCameraForPhase('lift');

      // Hide knife and sidebar
      knifeModel.visible = false;
      knifeSelected = false;
      document.getElementById('sidebar').classList.add('hidden');
      document.getElementById('knife-btn').classList.remove('selected');
      document.body.style.cursor = 'default';

      showHint('hint-lift');
    }
  }
  requestAnimationFrame(anim);
}

// ── Phase: Lift flesh ──
function handleLiftClick() {
  const meshes = [];
  fleshGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    liftFlesh();
  }
}

function liftFlesh() {
  animating = true;
  fleshLifted = true;
  hideHint('hint-lift');

  // Reparent flesh from oysterGroup to scene (world coords) so dragging works freely
  const worldPos = new THREE.Vector3();
  fleshGroup.getWorldPosition(worldPos);
  oysterGroup.remove(fleshGroup);
  scene.add(fleshGroup);
  fleshGroup.position.copy(worldPos);

  const duration = 1000;
  const startTime = performance.now();
  const startPos = fleshGroup.position.clone();
  const endPos = new THREE.Vector3(worldPos.x, worldPos.y + 2.5, worldPos.z);

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    // Flesh rises up
    fleshGroup.position.lerpVectors(startPos, endPos, ease);
    // Slight wobble
    fleshGroup.rotation.z = Math.sin(t * Math.PI * 4) * 0.05 * (1 - t);

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      animating = false;
      // Bring in the dachshund!
      bringDachshund();
    }
  }
  requestAnimationFrame(anim);
}

// ── Phase: Dachshund enters ──
function bringDachshund() {
  dachshundGroup.visible = true;
  gamePhase = 'feed';
  setCameraForPhase('feed');
  animating = true;

  const duration = 1200;
  const startTime = performance.now();
  const startX = 5.5;
  const endX = 2.8;

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    // Trot in from the right
    dachshundGroup.position.x = startX - ease * (startX - endX);

    // Bobbing walk animation
    dachshundGroup.position.y = -0.65 + Math.abs(Math.sin(t * Math.PI * 6)) * 0.08;

    // Tail wag
    const tail = dachshundGroup.userData.tail;
    tail.rotation.x = Math.sin(now * 0.015) * 0.5;

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      animating = false;
      showHint('hint-feed');

      // Move flesh to a grabbable position
      animateFleshToReady();
    }
  }
  requestAnimationFrame(anim);
}

function animateFleshToReady() {
  // Move flesh to a neutral hovering position between oyster and dog
  const duration = 600;
  const startTime = performance.now();
  const startPos = fleshGroup.position.clone();
  // Hover above the oyster, reachable for dragging
  const endPos = new THREE.Vector3(0, 2.5, 2);

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    fleshGroup.position.lerpVectors(startPos, endPos, ease);
    // Shrink slightly
    const sc = 1 - ease * 0.2;
    fleshGroup.scale.set(sc, sc, sc);

    // Gentle wobble to attract attention
    fleshGroup.rotation.z = Math.sin(t * Math.PI * 3) * 0.04;

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      fleshHoverPos = fleshGroup.position.clone();
    }
  }
  requestAnimationFrame(anim);
}

// ── Phase: Feed (drag & drop) ──
function handleFeedPointerDown(e) {
  if (animating) return;
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);

  // Check if clicking on the flesh to start dragging
  const meshes = [];
  fleshGroup.traverse(c => { if (c.isMesh) meshes.push(c); });
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    isDraggingFlesh = true;
    fleshHoverPos = fleshGroup.position.clone();
    document.body.style.cursor = 'grabbing';
  }
}

function returnFleshToHover() {
  if (!fleshHoverPos) return;
  animating = true;
  const duration = 400;
  const startTime = performance.now();
  const startPos = fleshGroup.position.clone();

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    fleshGroup.position.lerpVectors(startPos, fleshHoverPos, ease);
    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      animating = false;
    }
  }
  requestAnimationFrame(anim);
}

function feedDachshund() {
  animating = true;
  gamePhase = 'eating';
  setCameraForPhase('eating');
  hideHint('hint-feed');

  // Show tongue
  dachshundGroup.userData.tongue.visible = true;

  const duration = 1500;
  const startTime = performance.now();
  const fleshStart = fleshGroup.position.clone();
  const mouthPos = new THREE.Vector3(
    dachshundGroup.position.x + 1.5,
    dachshundGroup.position.y + 0.6,
    dachshundGroup.position.z
  );

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    // Flesh moves to mouth
    fleshGroup.position.lerpVectors(fleshStart, mouthPos, ease);
    // Shrinks as eaten
    const sc = (1 - ease) * 0.7;
    fleshGroup.scale.set(sc, sc, sc);

    // Dog head bobs (eating)
    const head = dachshundGroup.userData.head;
    head.position.y = 0.45 + Math.sin(t * Math.PI * 8) * 0.05;

    // Tail wags faster!
    const tail = dachshundGroup.userData.tail;
    tail.rotation.x = Math.sin(now * 0.03) * 0.7;

    // Tongue licks
    const tongue = dachshundGroup.userData.tongue;
    tongue.rotation.z = 0.5 + Math.sin(now * 0.02) * 0.3;

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      fleshGroup.visible = false;
      animating = false;

      // Happy reaction — dog bounces
      happyDog(now);
    }
  }
  requestAnimationFrame(anim);
}

function happyDog(startNow) {
  const duration = 1200;
  const startTime = startNow || performance.now();

  function anim(now) {
    const t = Math.min((now - startTime) / duration, 1);

    // Bouncy happy jumps
    dachshundGroup.position.y = -0.65 + Math.abs(Math.sin(t * Math.PI * 4)) * 0.2 * (1 - t);

    // Tail wagging like crazy
    const tail = dachshundGroup.userData.tail;
    tail.rotation.x = Math.sin(now * 0.04) * 0.8;

    if (t < 1) {
      requestAnimationFrame(anim);
    } else {
      dachshundGroup.userData.tongue.visible = false;
      setTimeout(doFartSquat, 400);
    }
  }
  requestAnimationFrame(anim);
}

// ──────────── REVEAL (FART BUBBLE) ────────────
let fartBubbles = [];
let bigBubble = null;
let fartCloud = null;

function doFartSquat() {
  // Dog squats down comically before farting
  const startTime = performance.now();
  const squatDuration = 500;
  const startY = dachshundGroup.position.y;
  const tail = dachshundGroup.userData.tail;

  function animSquat(now) {
    const t = Math.min((now - startTime) / squatDuration, 1);

    // Squat down — rear dips, front stays
    dachshundGroup.rotation.x = Math.sin(t * Math.PI) * 0.15; // tilt butt down
    dachshundGroup.position.y = startY - Math.sin(t * Math.PI) * 0.12;

    // Tail lifts up to "prepare"
    tail.rotation.z = -0.8 + t * 0.6;
    tail.rotation.x = Math.sin(now * 0.05) * 0.3;

    if (t < 1) {
      requestAnimationFrame(animSquat);
    } else {
      dachshundGroup.rotation.x = 0;
      dachshundGroup.position.y = startY;
      tail.rotation.z = -0.8;
      showReveal();
    }
  }
  requestAnimationFrame(animSquat);
}

function showReveal() {
  gamePhase = 'reveal';
  setCameraForPhase('reveal');

  // Get the dog's rear/butt position in world space
  const buttWorld = new THREE.Vector3(-1.5, 0.1, 0);
  dachshundGroup.localToWorld(buttWorld);

  // Dog does a little jump when it farts
  const startY = dachshundGroup.position.y;
  dachshundGroup.position.y = startY + 0.15;
  setTimeout(() => { dachshundGroup.position.y = startY; }, 150);

  // 1) Spawn the green puff cloud first
  spawnFartCloud(buttWorld.clone());

  // 2) Burst of small bubbles from the butt
  for (let i = 0; i < 15; i++) {
    setTimeout(() => spawnSmallBubble(buttWorld.clone()), i * 80);
  }

  // 3) After bubbles, grow the big message bubble
  setTimeout(() => growBigBubble(buttWorld.clone()), 1000);
}

function spawnFartCloud(origin) {
  // A green-tinted puff cloud that expands and fades
  const geo = new THREE.SphereGeometry(0.3, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb8e8a0,
    transparent: true,
    opacity: 0.5,
    roughness: 0.9,
    metalness: 0.0,
    emissive: 0x88cc66,
    emissiveIntensity: 0.3,
  });
  fartCloud = new THREE.Mesh(geo, mat);
  fartCloud.position.copy(origin);
  fartCloud.scale.set(0.3, 0.3, 0.3);
  scene.add(fartCloud);

  // Animate cloud expanding and fading
  const startTime = performance.now();
  const duration = 1500;

  function animCloud(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 2);
    const s = 0.3 + ease * 2.0;
    fartCloud.scale.set(s, s * 0.7, s); // squashed sphere = cloud shape
    fartCloud.material.opacity = 0.5 * (1 - t);
    fartCloud.position.y = origin.y + ease * 0.5;

    if (t < 1) {
      requestAnimationFrame(animCloud);
    } else {
      scene.remove(fartCloud);
      fartCloud = null;
    }
  }
  requestAnimationFrame(animCloud);
}

function spawnSmallBubble(origin) {
  const size = 0.12 + Math.random() * 0.18;
  const geo = new THREE.SphereGeometry(size, 12, 12);
  // Mix of green-tinted and pink bubbles
  const isStinky = Math.random() < 0.4;
  const mat = new THREE.MeshStandardMaterial({
    color: isStinky ? 0xcceeaa : 0xffddee,
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0.3,
    emissive: isStinky ? 0x99cc77 : 0xffaacc,
    emissiveIntensity: 0.2,
  });
  const bubble = new THREE.Mesh(geo, mat);
  bubble.position.copy(origin);
  bubble.position.x += (Math.random() - 0.5) * 0.4;
  bubble.position.z += (Math.random() - 0.5) * 0.4;
  bubble.userData.velocity = new THREE.Vector3(
    -0.005 + (Math.random() - 0.5) * 0.015, // drift slightly away from dog
    0.018 + Math.random() * 0.015,
    (Math.random() - 0.5) * 0.015
  );
  bubble.userData.life = 1.0;
  scene.add(bubble);
  fartBubbles.push(bubble);
}

function growBigBubble(origin) {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffe0ee,
    transparent: true,
    opacity: 0.0,
    roughness: 0.05,
    metalness: 0.2,
    emissive: 0xffbbdd,
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  });
  bigBubble = new THREE.Mesh(geo, mat);
  bigBubble.position.copy(origin);
  bigBubble.position.y += 0.3;
  bigBubble.scale.set(0.01, 0.01, 0.01);
  scene.add(bigBubble);

  // Animate the bubble growing
  const startTime = performance.now();
  const duration = 1200;
  const targetScale = 1.8;

  function animGrow(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease out cubic
    const s = 0.01 + ease * targetScale;
    bigBubble.scale.set(s, s, s);
    bigBubble.material.opacity = ease * 0.35;
    // Float upward gently as it grows
    bigBubble.position.y = origin.y + 0.3 + ease * 1.5;

    if (t < 1) {
      requestAnimationFrame(animGrow);
    } else {
      // Show the text overlay positioned over the bubble
      showBubbleText();
      spawnFloatingHearts();
    }
  }
  requestAnimationFrame(animGrow);
}

function showBubbleText() {
  const reveal = document.getElementById('reveal');
  reveal.classList.remove('hidden');
  void reveal.offsetWidth;
  reveal.classList.add('show');
}

function spawnFloatingHearts() {
  const container = document.querySelector('.hearts-bg');
  const emojis = ['💕', '💖', '💗', '💘', '❤️', '🌹', '✨', '🦪', '🐕'];

  function addHeart() {
    if (gamePhase !== 'reveal') return;
    const h = document.createElement('div');
    h.className = 'floating-heart';
    h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    h.style.left = Math.random() * 100 + 'vw';
    h.style.fontSize = (16 + Math.random() * 24) + 'px';
    h.style.animationDuration = (3 + Math.random() * 4) + 's';
    container.appendChild(h);
    h.addEventListener('animationend', () => h.remove());
  }

  for (let i = 0; i < 15; i++) setTimeout(addHeart, i * 100);
  setInterval(addHeart, 400);
}

// ──────────── HINT HELPERS ────────────
function showHint(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideHint(id) {
  document.getElementById(id).classList.add('hidden');
}

// ──────────── PINCH-TO-ZOOM & WHEEL ZOOM ────────────
function getTouchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    isPinching = true;
    pinchStartDist = getTouchDist(e);
    pinchStartZoom = cameraZoom;
  }
}

function onTouchMove(e) {
  if (e.touches.length === 2 && isPinching) {
    e.preventDefault();
    const dist = getTouchDist(e);
    const scale = dist / pinchStartDist;
    cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * scale));
  }
}

function onTouchEnd(e) {
  if (e.touches.length < 2) {
    isPinching = false;
  }
}

function onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  cameraZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cameraZoom + delta));
}

// ──────────── CAMERA MANAGEMENT ────────────
function adjustCameraForScreen() {
  // On narrow/portrait screens, pull camera back so oyster fits
  const aspect = window.innerWidth / window.innerHeight;
  const extraPull = aspect < 1 ? (1 - aspect) * 4 : 0; // extra Z on portrait
  cameraBasePos.set(0, 5, 9 + extraPull);
  cameraBaseLook.set(0, 0, 0);
  cameraTargetPos.copy(cameraBasePos);
  cameraLookTarget.copy(cameraBaseLook);
}

function setCameraForPhase(phase) {
  const aspect = window.innerWidth / window.innerHeight;
  const extraPull = aspect < 1 ? (1 - aspect) * 4 : 0;

  switch (phase) {
    case 'screws':
    case 'knife':
      cameraTargetPos.set(0, 5, 9 + extraPull);
      cameraLookTarget.set(0, 0, 0);
      break;
    case 'cut':
    case 'lift':
      cameraTargetPos.set(0, 3.5, 7 + extraPull);
      cameraLookTarget.set(0, -0.2, 0);
      break;
    case 'feed':
      // Pull back and shift right to show both flesh and dog
      cameraTargetPos.set(1.5, 3.5, 8 + extraPull);
      cameraLookTarget.set(1.5, 0.5, 0);
      break;
    case 'eating':
      cameraTargetPos.set(2, 2.5, 6 + extraPull);
      cameraLookTarget.set(2, 0.2, 0);
      break;
    case 'reveal':
      // Frame the dog and the bubble above it
      cameraTargetPos.set(1.5, 2.5, 7 + extraPull);
      cameraLookTarget.set(1.5, 1.2, 0);
      break;
  }
}

// ──────────── ANIMATE LOOP ────────────
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  // Oyster rotation (drag + inertia)
  if (oysterGroup && (gamePhase === 'screws' || gamePhase === 'knife')) {
    // Apply inertia when not dragging
    if (!isDragging) {
      rotationVelocity *= 0.92; // friction
      targetRotY += rotationVelocity;
    }
    // Smooth lerp to target rotation
    oysterGroup.rotation.y += (targetRotY - oysterGroup.rotation.y) * 0.15;
    // Gentle bob
    oysterGroup.position.y = -0.3 + Math.sin(time * 0.5) * 0.04;
  }

  // Floating 3D hearts
  hearts.forEach(h => {
    h.position.y += Math.sin(time * h.userData.floatSpeed + h.userData.floatOffset) * 0.002;
    h.rotation.y += 0.004;
    h.rotation.x += 0.002;
  });

  // Screw glow pulse
  screws.forEach(s => {
    if (!s.userData.removed) {
      s.traverse(c => {
        if (c.material && c.material.emissive) {
          c.material.emissive.setHex(C.accent);
          c.material.emissiveIntensity = 0.08 + Math.sin(time * 3 + s.userData.index) * 0.08;
        }
      });
    }
  });

  // Adductor muscle pulse during cut phase (shows where to cut)
  if (adductorMuscle && gamePhase === 'cut') {
    adductorMuscle.material.emissive.setHex(0xff6688);
    adductorMuscle.material.emissiveIntensity = 0.15 + Math.sin(time * 4) * 0.15;
    // Subtle scale pulse
    const pulse = 1 + Math.sin(time * 4) * 0.06;
    adductorMuscle.scale.set(pulse, 1, pulse);
  }

  // Dachshund idle tail wag
  if (dachshundGroup && dachshundGroup.visible && gamePhase === 'feed') {
    const tail = dachshundGroup.userData.tail;
    tail.rotation.x = Math.sin(time * 5) * 0.4;

    // Flesh gentle bob while waiting to be grabbed
    if (!isDraggingFlesh && !animating && fleshGroup.visible && fleshHoverPos) {
      fleshGroup.position.y = fleshHoverPos.y + Math.sin(time * 2) * 0.1;
      fleshGroup.rotation.z = Math.sin(time * 1.5) * 0.05;
    }
  }

  // Fart bubbles animation
  for (let i = fartBubbles.length - 1; i >= 0; i--) {
    const b = fartBubbles[i];
    b.position.add(b.userData.velocity);
    b.userData.life -= 0.008;
    b.material.opacity = Math.max(0, b.userData.life * 0.55);
    b.scale.multiplyScalar(1.005); // expand as they rise
    // Wobble side to side
    b.position.x += Math.sin(time * 3 + i) * 0.002;
    if (b.userData.life <= 0) {
      scene.remove(b);
      fartBubbles.splice(i, 1);
    }
  }

  // Big bubble gentle wobble
  if (bigBubble) {
    bigBubble.rotation.y = time * 0.3;
    bigBubble.position.x += Math.sin(time * 1.5) * 0.001;
    bigBubble.position.y += Math.sin(time * 0.8) * 0.0005;
  }

  // Smooth camera transitions (skip during opening animation which handles its own camera)
  if (gamePhase !== 'opening') {
    const lerpSpeed = 0.04;
    // Apply zoom: move camera along the camera→lookTarget axis
    const zoomedPos = cameraTargetPos.clone().sub(cameraLookTarget)
      .multiplyScalar(1 / cameraZoom).add(cameraLookTarget);
    camera.position.lerp(zoomedPos, lerpSpeed);
    // Smooth look target
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook);
    currentLook.multiplyScalar(10).add(camera.position); // approximate current look target
    currentLook.lerp(cameraLookTarget, lerpSpeed);
    camera.lookAt(cameraLookTarget);
  }

  renderer.render(scene, camera);
}

// ──────────── RESIZE ────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Re-adjust camera targets for new screen dimensions
  if (gamePhase) setCameraForPhase(gamePhase);
}

// ──────────── START ────────────
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('overlay').style.transition = 'opacity 0.6s';
  document.getElementById('overlay').style.opacity = '0';
  setTimeout(() => {
    document.getElementById('overlay').style.display = 'none';
    showHint('hint');
  }, 600);
  init();
});
