console.log('Three.js версія:', THREE.REVISION);

// region ----- Константи та змінні-----
const canvasWrapper = document.getElementById('canvas-wrapper');
const canvas = document.getElementById('three-canvas');
const DEFAULT_SPHERICAL = {theta: -0.8, phi: 1.0, radius: 120};
const DEFAULT_TARGET = new THREE.Vector3(20, 10, 0);
const DEFAULT_PARAMS = {
    x0: 0, y0: 0, z0: 0,
    v0: 30,
    alpha: 45,
    beta: 0,
    g: 9.81,
    k: 0.05,
    deltaT: 0.02,
};
const toRadians = (angle) => angle * Math.PI / 180;

const COLORS = {
    noAir: 0x00cfff,   // червона — без опору
    air: 0xff4444,   // блакитна — з опором
};

const ALERT_TIMEOUTS = {};
// endregion
// region ----- Утиліти -----
function disposeObj(obj) {
    if (!obj) return;
    obj.geometry?.dispose();
    if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
    }
    scene.remove(obj);
}

function disposeGroup(group) {
    if (!group) return;
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    });
    scene.remove(group);
}
//endregion
// region ----- Параметри -----
const params = {... DEFAULT_PARAMS};
// endregion

// region ----- Рендер / Сцена / Камера -----
const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
renderer.setClearColor(0x111111);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75, canvasWrapper.clientWidth / canvasWrapper.clientHeight, 0.1, 2000
);
// endregion

// region ----- Керування камерою -----
let isDragging = false, isPanning = false;
let previousMousePosition = {x: 0, y: 0};
let spherical = {...DEFAULT_SPHERICAL};
let target = DEFAULT_TARGET.clone();

function updateCamera() {
    const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    const y = target.y + spherical.radius * Math.cos(spherical.phi);
    const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.set(x, y, z);
    camera.lookAt(target);
}

canvasWrapper.addEventListener('mousedown', (e) => {
    if (e.button === 0) isDragging = true;
    if (e.button === 2) isPanning = true;
    previousMousePosition = {x: e.clientX, y: e.clientY};
});
canvasWrapper.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mouseup', () => {
    isDragging = false;
    isPanning = false;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging && !isPanning) return;
    const dx = e.clientX - previousMousePosition.x;
    const dy = e.clientY - previousMousePosition.y;
    previousMousePosition = {x: e.clientX, y: e.clientY};

    if (isDragging) {
        spherical.theta -= dx * 0.005;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy * 0.005));
    }
    if (isPanning) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        right.crossVectors(dir, up).normalize();
        const speed = spherical.radius * 0.002;
        target.addScaledVector(right, -dx * speed);
        target.addScaledVector(up, dy * speed);
    }
    updateCamera();
});

canvasWrapper.addEventListener('wheel', (e) => {
    spherical.radius = Math.max(5, Math.min(500, spherical.radius * (1 + e.deltaY * 0.001)));
    updateCamera();
});

updateCamera();
// endregion

// region ----- Обчислення -----
function calculateDataForNoAirResistance(params) {
    clearAsyncAlert("alert-noair")
    const {x0, y0, z0, v0, g, deltaT} = params;
    const alpha = toRadians(params.alpha);
    const beta = toRadians(params.beta);

    const vx0 = v0 * Math.cos(alpha) * Math.cos(beta);
    const vy0 = v0 * Math.sin(alpha);
    const vz0 = v0 * Math.cos(alpha) * Math.sin(beta);

    const D = vy0 ** 2 + 2 * g * y0;

    // Захист: якщо дискримінант від'ємний, корінь неможливий (тіло не перетне y=0)
    if (D < 0) {
        showAsyncAlert('alert-noair', "Помилка моделювання без опору: за таких початкових умов тіло ніколи не досягне поверхні (y=0).", 6000);
        return { T: 0, H: y0, L: 0, points: [{ x: x0, y: y0, z: z0, v: v0, t: 0 }] };
    }

    const T = (vy0 + Math.sqrt(D)) / g;
    const H = y0 + (vy0 ** 2) / (2 * g);
    const L = T * Math.sqrt(vx0 ** 2 + vz0 ** 2);

    const points = [];
    for (let t = 0; t <= T; t += deltaT) {
        const x = x0 + vx0 * t;
        const y = y0 + vy0 * t - g * t ** 2 / 2;
        const z = z0 + vz0 * t;
        const v = Math.sqrt(vx0 ** 2 + (vy0 - g * t) ** 2 + vz0 ** 2);
        points.push({x, y, z, v, t});
    }

    // Примусово додаємо фінальну точку удару об землю для точності графіки
    const finalX = x0 + vx0 * T;
    const finalY = y0 + vy0 * T - g * T ** 2 / 2;
    const finalZ = z0 + vz0 * T;
    const finalV = Math.sqrt(vx0 ** 2 + (vy0 - g * T) ** 2 + vz0 ** 2);
    points.push({ x: finalX, y: finalY, z: finalZ, v: finalV, t: T });

    return {T, H, L, points};
}

function calculateDataForAirResistance(params) {
    clearAsyncAlert('alert-air');
    const {x0, y0, z0, v0, g, k, deltaT} = params;
    const alpha = toRadians(params.alpha);
    const beta = toRadians(params.beta);

    let vx = v0 * Math.cos(alpha) * Math.cos(beta);
    let vy = v0 * Math.sin(alpha);
    let vz = v0 * Math.cos(alpha) * Math.sin(beta);

    let x = x0, y = y0, z = z0, t = 0;
    let H = y0;
    let crossedZero = false;
    const points = [];

    while (!crossedZero || y >= 0) {
        if (y >= 0) crossedZero = true;
        //Захист від безкінечного циклу якщо y ніколи не перетинає
        if (y < y0 && !crossedZero) {
            showAsyncAlert('alert-air', "Помилка моделювання з опором повітря:за таких початкових умов тіло летить вниз і ніколи не досягне поверхні (y=0).", 6000);
            break;
        }
        points.push({x, y, z, v: Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2), t});

        const v = Math.sqrt(vx ** 2 + vy ** 2 + vz ** 2);
        const ax = -k * v * vx;
        const ay = -g - k * v * vy;
        const az = -k * v * vz;

        vx += ax * deltaT;
        vy += ay * deltaT;
        vz += az * deltaT;

        x += vx * deltaT;
        y += vy * deltaT;
        z += vz * deltaT;
        t += deltaT;

        if (y > H) H = y;
    }

    const T = t;
    const L = Math.sqrt((x - x0) ** 2 + (z - z0) ** 2);
    return {T, H, L, points};
}

let dataNoAir = calculateDataForNoAirResistance(params);
let dataAir = calculateDataForAirResistance(params);
// endregion


// region ----- Сітка та осі -----
let gridHelper = null;
let axesGroup  = null;
let lastSceneSize = null;

function buildScene() {
    const allPoints = [...dataNoAir.points, ...dataAir.points];
    const maxVal = allPoints.reduce(
        (m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)), 0
    );
    const sceneSize = Math.ceil(maxVal / 10) * 10 + 20;

    if (sceneSize === lastSceneSize) return;
    lastSceneSize = sceneSize;

    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry.dispose();
        gridHelper.material.dispose();
    }
    disposeGroup(axesGroup);

    gridHelper = new THREE.GridHelper(sceneSize * 2, sceneSize / 5, 0x444444, 0x222222);
    scene.add(gridHelper);

    axesGroup = new THREE.Group();
    const len = sceneSize;
    const markFreq = 10, markSize = 0.5;
    const colX = 0xff4444, colY = 0x44ff44, colZ = 0x4488ff;

    function makeLine(from, to, color) {
        const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...from), new THREE.Vector3(...to)
        ]);
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    }

    function makeDashed(from, to, color) {
        const pts = [];
        const s = new THREE.Vector3(...from), e = new THREE.Vector3(...to);
        for (let i = 0; i < 20; i += 2) {
            pts.push(s.clone().lerp(e, i / 20));
            pts.push(s.clone().lerp(e, (i + 0.8) / 20));
        }
        return new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color })
        );
    }

    function makeLabel(text, pos, color) {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 128;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.font = 'bold 96px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 64);
        const texture = new THREE.CanvasTexture(cv);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: texture, transparent: true })
        );
        sprite.position.set(...pos);
        sprite.scale.set(8, 4, 1);
        return sprite;
    }

    // X
    axesGroup.add(makeLine([0,0,0], [len,0,0], colX));
    axesGroup.add(makeDashed([0,0,0], [-len,0,0], colX));
    axesGroup.add(makeLabel('X', [len+4,0,0], colX));
    for (let i = -len; i <= len; i += markFreq) {
        if (i === 0) continue;
        axesGroup.add(makeLine([i,0,-markSize], [i,0,markSize], colX));
        axesGroup.add(makeLabel(`${i}`, [i,0,-3], colX));
    }
    // Y
    axesGroup.add(makeLine([0,0,0], [0,len,0], colY));
    axesGroup.add(makeLabel('Y', [0,len+4,0], colY));
    for (let i = markFreq; i <= len; i += markFreq) {
        axesGroup.add(makeLine([-markSize,i,0], [markSize,i,0], colY));
        axesGroup.add(makeLabel(`${i}`, [-4,i,0], colY));
    }
    // Z
    axesGroup.add(makeLine([0,0,0], [0,0,len], colZ));
    axesGroup.add(makeDashed([0,0,0], [0,0,-len], colZ));
    axesGroup.add(makeLabel('Z', [0,0,len+4], colZ));
    for (let i = -len; i <= len; i += markFreq) {
        if (i === 0) continue;
        axesGroup.add(makeLine([-markSize,0,i], [markSize,0,i], colZ));
        axesGroup.add(makeLabel(`${i}`, [-3,0,i], colZ));
    }

    scene.add(axesGroup);
}
// endregion

// region ----- Об'єкти сцени -----
let lineNoAir, lineAir, ballNoAir, ballAir, trailNoAir, trailAir;

function buildLine(points, color) {
    const vecs = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(vecs),
        new THREE.LineBasicMaterial({ color })
    );
    scene.add(line);
    return line;
}

function buildBall(p, color) {
    const ball = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16), // 16 замість 32 — вдвічі менше трикутників
        new THREE.MeshBasicMaterial({ color })
    );
    ball.position.set(p.x, p.y, p.z);
    scene.add(ball);
    return ball;
}

function buildTrail(points, color) {
    const pos = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
        pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = p.z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(trail);
    return trail;
}

function rebuildObjects() {
    disposeObj(lineNoAir); disposeObj(lineAir);
    disposeObj(ballNoAir); disposeObj(ballAir);
    disposeObj(trailNoAir); disposeObj(trailAir);

    lineNoAir  = buildLine(dataNoAir.points, COLORS.noAir);
    lineAir    = buildLine(dataAir.points,   COLORS.air);
    ballNoAir  = buildBall(dataNoAir.points[0], COLORS.noAir);
    ballAir    = buildBall(dataAir.points[0],   COLORS.air);
    trailNoAir = buildTrail(dataNoAir.points, COLORS.noAir);
    trailAir   = buildTrail(dataAir.points,   COLORS.air);
}
// endregion

// region ----- Статистика -----
function updateStats() {
    const na = dataNoAir, a = dataAir;
    // Фінальні показники
    document.getElementById('stat-na-T').textContent = na.T.toFixed(2);
    document.getElementById('stat-na-H').textContent = na.H.toFixed(2);
    document.getElementById('stat-na-L').textContent = na.L.toFixed(2);
    document.getElementById('stat-a-T').textContent = a.T.toFixed(2);
    document.getElementById('stat-a-H').textContent = a.H.toFixed(2);
    document.getElementById('stat-a-L').textContent = a.L.toFixed(2);
}

function updateLiveStats(pNa, pA) {
    if (pNa) {
        document.getElementById('stat-na-x').textContent = pNa.x.toFixed(2);
        document.getElementById('stat-na-y').textContent = pNa.y.toFixed(2);
        document.getElementById('stat-na-z').textContent = pNa.z.toFixed(2);
        document.getElementById('stat-na-v').textContent = pNa.v.toFixed(2);
        document.getElementById('stat-na-t').textContent = pNa.t.toFixed(2);
    }
    if (pA) {
        document.getElementById('stat-a-x').textContent = pA.x.toFixed(2);
        document.getElementById('stat-a-y').textContent = pA.y.toFixed(2);
        document.getElementById('stat-a-z').textContent = pA.z.toFixed(2);
        document.getElementById('stat-a-v').textContent = pA.v.toFixed(2);
        document.getElementById('stat-a-t').textContent = pA.t.toFixed(2);
    }
}

// endregion

// region ----- Анімація -----
let playing = false, animTime = 0, lastTime = null;

function animationLoop(timestamp) {
    requestAnimationFrame(animationLoop);

    if (playing) {
        if (!lastTime) {
            lastTime = timestamp;
        } else {
            animTime += (timestamp - lastTime) / 1000;
            lastTime = timestamp;
        }

        const maxT = Math.max(dataNoAir.T, dataAir.T);

        // без опору
        const fracNa = Math.min(animTime / dataNoAir.T, 1);
        const idxNa = Math.floor(fracNa * (dataNoAir.points.length - 1));
        const pNa = dataNoAir.points[idxNa];
        ballNoAir.position.set(pNa.x, pNa.y, pNa.z);
        trailNoAir.geometry.setDrawRange(0, idxNa + 1);

        // з опором
        const fracA = Math.min(animTime / dataAir.T, 1);
        const idxA = Math.floor(fracA * (dataAir.points.length - 1));
        const pA = dataAir.points[idxA];
        ballAir.position.set(pA.x, pA.y, pA.z);
        trailAir.geometry.setDrawRange(0, idxA + 1);

        updateLiveStats(pNa, pA);

        if (animTime >= maxT) {
            playing = false;
            animTime = 0;
            lastTime = null;
        }
    }

    renderer.render(scene, camera);
}

// endregion

// region ----- Кнопки -----
function resetAnimation() {
    playing = false;
    animTime = 0;
    lastTime = null;
    ballNoAir.position.set(dataNoAir.points[0].x, dataNoAir.points[0].y, dataNoAir.points[0].z);
    ballAir.position.set(dataAir.points[0].x, dataAir.points[0].y, dataAir.points[0].z);
    trailNoAir.geometry.setDrawRange(0, 0);
    trailAir.geometry.setDrawRange(0, 0);
    updateLiveStats(dataNoAir.points[0], dataAir.points[0]);
}

document.getElementById('btn-play').addEventListener('click', () => {
    if (!playing && animTime === 0) resetAnimation();
    playing = true;
});
document.getElementById('btn-pause').addEventListener('click', () => {
    playing = false;
    lastTime = null;
});
document.getElementById('btn-reset').addEventListener('click', resetAnimation);
document.getElementById('btn-reset-cam').addEventListener('click', () => {
    spherical = {...DEFAULT_SPHERICAL};
    target.copy(DEFAULT_TARGET);
    updateCamera();
});

document.getElementById('btn-reset-params').addEventListener('click', () => {
    Object.keys(DEFAULT_PARAMS).forEach(key => {
        const slider = document.getElementById(`sl-${key}`);
        const label = document.getElementById(`val-${key}`);

        if (slider && label) {
            slider.value = DEFAULT_PARAMS[key];
            label.textContent = DEFAULT_PARAMS[key];
        }
    });

    rebuildAll();
});
// endregion


// region ----- Слайдери -----
let rebuildTimer = null;

function rebuildAll() {
    playing = false; animTime = 0; lastTime = null;

    params.x0    = parseFloat(document.getElementById('sl-x0').value);
    params.y0    = parseFloat(document.getElementById('sl-y0').value);
    params.z0    = parseFloat(document.getElementById('sl-z0').value);
    params.v0    = parseFloat(document.getElementById('sl-v0').value);
    params.alpha = parseFloat(document.getElementById('sl-alpha').value);
    params.beta  = parseFloat(document.getElementById('sl-beta').value);
    params.g     = parseFloat(document.getElementById('sl-g').value);
    params.k     = parseFloat(document.getElementById('sl-k').value);
    params.deltaT= parseFloat(document.getElementById('sl-deltaT').value);

    dataNoAir = calculateDataForNoAirResistance(params);
    dataAir   = calculateDataForAirResistance(params);

    buildScene();      // перебудовує осі лише якщо sceneSize змінився
    rebuildObjects();
    updateStats();
    updateLiveStats(dataNoAir.points[0], dataAir.points[0]);
}

function rebuildAllDebounced() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuildAll, 60); // чекаємо 60мс після останньої зміни
}

['x0','y0','z0','v0','alpha','beta','g','k','deltaT'].forEach(name => {
    const slider = document.getElementById(`sl-${name}`);
    const label  = document.getElementById(`val-${name}`);
    if (!slider) return;
    slider.addEventListener('input', () => {
        label.textContent = slider.value;
        rebuildAllDebounced(); // дебаунс замість миттєвого rebuild
    });
});
// endregion

// region ----- Попередження -----


function showAsyncAlert(id, message, duration = 6000) {
    const alertBox = document.getElementById(id);
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.classList.remove('hidden');

    if (ALERT_TIMEOUTS[id]) clearTimeout(ALERT_TIMEOUTS[id]);

    ALERT_TIMEOUTS[id] = setTimeout(() => {
        alertBox.classList.add('hidden');
    }, duration);
}

function clearAsyncAlert(id) {
    const alertBox = document.getElementById(id);
    if (alertBox) alertBox.classList.add('hidden');
    if (ALERT_TIMEOUTS[id]) clearTimeout(ALERT_TIMEOUTS[id]);
}
// endregion
// region ----- Ініціалізація -----
buildScene();
rebuildObjects();
updateStats();
updateLiveStats(dataNoAir.points[0], dataAir.points[0]);
animationLoop();
// endregion

window.addEventListener('resize', () => {
    renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
    camera.aspect = canvasWrapper.clientWidth / canvasWrapper.clientHeight;
    camera.updateProjectionMatrix();
});