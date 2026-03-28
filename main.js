console.log('Three.js версія:', THREE.REVISION);
// region ----- Змінні та константи -----
const canvasWrapper = document.getElementById('canvas-wrapper');
const canvas = document.getElementById('three-canvas');
let Z_SCALE = 5;
const DEFAULT_SPHERICAL = {theta: -0.8, phi: 1.0, radius: 120};
const DEFAULT_TARGET = new THREE.Vector3(20, 10, 20);

const params = {
    x0: 0,
    y0: 0,
    v0: 20,
    phi: 40,
    a: 3,
    T: 6,
    N: 300
}
// endregion

// region ----- Рендер -----
const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
renderer.setClearColor(0x111111); // Темний фон
// endregion

// region ----- Сцена та камера -----
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,// FOV
    canvasWrapper.clientWidth / canvasWrapper.clientHeight, // співівідношення сторін
    0.1,// мінімальна відстан
    1000 // максимальна відстань
);


// camera.lookAt(0, 0, 0); // Направляємо камеру на центр сцени

// endregion

// region ----- Керування камерою -----
let isDragging = false; // Чи відбувається перетягування
let isPanning = false;// пересування камери

let previousMousePosition = {x: 0, y: 0}; // Попередня позиція миші
let spherical = {theta: -0.8, phi: 1.0, radius: 120}; // Сферичні координати камери
// A саме theta - кут навколо вертикальної осі (горизонтальний оберт)
// phi - вертикальний кут (нахил камери вгору або вниз)
// radius - відстань від камери до центру сцени.
let target = new THREE.Vector3(20, 10, 20); // Центр сцени, на який дивиться камера

function updateCamera() {
    // Конвертуємо сферичні координати в декартові
    // x = r * sin(phi) * cos(theta)
    // y = r * cos(phi)
    // z = r * sin(phi) * sin(theta)
    const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    const y = target.y + spherical.radius * Math.cos(spherical.phi);
    const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.position.set(x, y, z);
    camera.lookAt(target);
}

canvasWrapper.addEventListener('mousedown', (event) => {
    if (event.button === 0) isDragging = true;
    if (event.button === 2) isPanning = true;
    // Зберігаємо початкову позицію щоб потім порахувати зміщення
    previousMousePosition = {x: event.clientX, y: event.clientY};
})
canvasWrapper.addEventListener("contextmenu", (e) => {
    e.preventDefault()
});
window.addEventListener('mouseup', () => {
    isDragging = false;
    isPanning = false;
})

window.addEventListener('mousemove', (event) => {
    if (!isDragging && !isPanning) return;
    const xMovement = event.clientX - previousMousePosition.x;
    const yMovement = event.clientY - previousMousePosition.y;

    previousMousePosition = {x: event.clientX, y: event.clientY};
    if(isDragging){
        spherical.theta -= xMovement * 0.005; // Чутливість до горизонтального руху
        // Обмежуємо вертикальний кут, щоб камера не переверталася

        // 0.1 це найменший кут, який може мати камера
        // Math.PI - 0.1 це найбільший кут який може мати камера
        // Це дозволяє камері обертатися навколо сцени, але не перевертатися
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - yMovement * 0.005));
        updateCamera();
    }
    if (isPanning) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();

        camera.getWorldDirection(dir);
        // вектор який завжди вправо відносно камери, потрібно для переміщення по горизонтальній осі
        right.crossVectors(dir, up).normalize();

        const panSpeed = spherical.radius * 0.002;
        target.addScaledVector(right, -xMovement * panSpeed);
        target.addScaledVector(up, yMovement * panSpeed);
        updateCamera();
    }

})

canvasWrapper.addEventListener('wheel', (event) => {
    spherical.radius = Math.max(12, Math.min(300, spherical.radius * (1 + event.deltaY * 0.001)));
    updateCamera();
});

updateCamera();
// endregion

// region ----- Обчислення масиву точок -----
function calculatePoints(params) {
    // щоб z була пропорційна всім іншим координатам
    // Z_SCALE = params.v0;
    // в js функції тригон. потребують радіани
    const phi = params.phi * Math.PI / 180;
    const vx = params.v0 * Math.cos(phi);
    const vy = params.v0 * Math.sin(phi);

    const ax = params.a * Math.cos(phi);
    const ay = params.a * Math.sin(phi);

    let dt = params.T / params.N;
    const points = [];
    for (let i = 0; i < params.N; i++) {
        const t = i * dt;
        const x = params.x0 + vx * t + 0.5 * ax * t ** 2;
        const y = params.y0 + vy * t + 0.5 * ay * t ** 2;
        const z = t * Z_SCALE;
        const v = params.v0 + params.a * t;
        points.push({x, y, z, t, v});
    }

    return points
}
function calculateDataForNoAirResistance(params) {
    const { x0, y0, z0, v0, g, deltaT } = params;
    const alpha = toRadians(params.alpha);
    const beta  = toRadians(params.beta);

    const vx0 = v0 * Math.cos(alpha) * Math.cos(beta);
    const vy0 = v0 * Math.sin(alpha);
    const vz0 = v0 * Math.cos(alpha) * Math.sin(beta);

    const D = vy0 ** 2 + 2 * g * y0;
    const T = (vy0 + Math.sqrt(D)) / g;
    const H = y0 + (vy0 ** 2) / (2 * g);
    const L = T * Math.sqrt(vx0 ** 2 + vz0 ** 2);

    const points = [];
    for (let t = 0; t <= T; t += deltaT) {
        const x = x0 + vx0 * t;
        const y = y0 + vy0 * t - g * t ** 2 / 2;
        const z = z0 + vz0 * t;
        const v = Math.sqrt(vx0 ** 2 + (vy0 - g * t) ** 2 + vz0 ** 2);
        points.push({ x, y, z, v, t });
    }

    return { T, H, L, points };
}
let points = calculatePoints(params);
let firstP = points[0];
updateStatistic(firstP.x, firstP.y, firstP.t, firstP.v);
// endregion

// region ----- Сітка та осі -----
let gridHelper = null;
// група всіх осей з підписами
let axesGroup = null;

function buildScene() {
    if (gridHelper) scene.remove(gridHelper);
    if (axesGroup) scene.remove(axesGroup);
    const pointsLength = points.length
    const maxHorizontal = Math.max(
        Math.abs(points[pointsLength - 1].x),
        Math.abs(points[pointsLength - 1].y)
    );
    //Округляємо до 10 і додаємо відступ у 20 одиниць
    const sceneSize = Math.ceil(maxHorizontal / 10) * 10 + 20;

    //Побудова сітки
    gridHelper = new THREE.GridHelper(
        sceneSize * 2,
        sceneSize / 5, // клітинка 5 одиниць
        0x444444,
        0x222222
    )
    scene.add(gridHelper);

    //Осі, підписи і відмітки
    axesGroup = new THREE.Group();
    const horizontalLength = sceneSize;
    const markFreq = 10; // частота відміток
    const markSize = 0.5;

    const colors = {
        x: 0xff4444,
        y: 0x44ff44,
        z: 0x4488ff
    };

    function makeLine(from, to, color) {
        const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...from),
            new THREE.Vector3(...to)
        ]);
        return new THREE.Line(g, new THREE.LineBasicMaterial({color}));
    }
    function makeDashedLine(from, to, color) {
        const points = [];
        const start = new THREE.Vector3(...from);
        const end = new THREE.Vector3(...to);
        const segments = 20;
        for (let i = 0; i < segments; i += 2) {
            points.push(start.clone().lerp(end, i / segments));
            points.push(start.clone().lerp(end, (i + 0.8) / segments));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
    }
    function makeLabel(text, position, color) {
        // Three не рендерить просто 2d текст тому для його створення треба працювати з костилями
        // Створюємо канву
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 128;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.font = 'bold 96px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cv.width / 2, cv.height / 2);
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                // перетворює canvas в текстуру, який перетворює в спрайт - ел. завжди повернутий до камери
                map: new THREE.CanvasTexture(cv),
                transparent: true
            })
        );
        sprite.position.set(...position);
        sprite.scale.set(cv.width / 32, cv.height / 32, 1); // пропорційно до canvas
        return sprite;
    }

    // вісь x
    axesGroup.add(makeLine([0, 0, 0], [horizontalLength, 0, 0], colors.x));
    axesGroup.add(makeLabel('X', [horizontalLength + 3, 0, 0], colors.x));
    axesGroup.add(makeDashedLine([0,0,0], [-horizontalLength, 0, 0], colors.x));
    for (let i = -horizontalLength; i <= horizontalLength; i += markFreq) {
        if (i === 0) continue;
        axesGroup.add(makeLine([i, 0, -markSize], [i, 0, markSize], colors.x));
        axesGroup.add(makeLabel(`${i}`, [i, 0, -2], colors.x));
    }

    // вісь y наша вісь z
    const zMax = Math.ceil(params.T * Z_SCALE);
    axesGroup.add(makeLine([0, 0, 0], [0, zMax + 5, 0], colors.z));
    axesGroup.add(makeLabel('Z=час', [0, zMax + 8, 0], colors.z));
    for (let i = markFreq; i <= zMax; i += markFreq) {
        axesGroup.add(makeLine([-markSize, i, 0], [markSize, i, 0], colors.z));
        axesGroup.add(makeLabel(`${(i / Z_SCALE).toFixed(1)}с`, [-5, i, 0], colors.z));
    }
    // вісь z наша y
    axesGroup.add(makeLine([0, 0, 0], [0, 0, horizontalLength], colors.y));
    axesGroup.add(makeLabel('Y', [0, 0, horizontalLength + 3], colors.y));
    axesGroup.add(makeDashedLine([0,0,0], [0, 0, -horizontalLength], colors.y));
    for (let i = -horizontalLength; i <= horizontalLength; i += markFreq) {
        if(i === 0)continue;
        axesGroup.add(makeLine([-markSize, 0, i], [markSize, 0, i], colors.y));
        axesGroup.add(makeLabel(`${i}`, [-3, 0, i], colors.y));
    }

    scene.add(axesGroup);

}

buildScene();
// endregion

// region ----- Візуалізація траєкторії -----
function buildTrajectory() {
    // Міняємо місцями y та z, щоб зробити часово-просторову візуалізацію
    const vectors = points.map(p => new THREE.Vector3(p.x, p.z, p.y));
    //Геометрія це набір вершин, які можна використовувати для створення ліній, площин або інших форм
    const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    const material = new THREE.LineBasicMaterial({color: 0xff0000});
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    return line
}

let trajectoryLine = buildTrajectory();
// endregion

// region ----- Створення кульку -----
function createBall() {
    const geometry = new THREE.SphereGeometry(
        1.25, // радіус
        32,   // кількість сегментів по горизонталі
        32    // кількість сегментів по вертикалі
    );
    const material = new THREE.MeshBasicMaterial({color: 0x00cfff});
    const ball = new THREE.Mesh(geometry, material);

    const start = points[0];
    ball.position.set(start.x, start.z, start.y);

    scene.add(ball);
    return ball;
}

let ball = createBall();
// endregion

// region ----- Створення хвоста кульки -----
function createTrail() {
    // задаємо строгий за розміром масив для буфера
    const positions = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
        positions[i * 3] = points[i].x;
        positions[i * 3 + 1] = points[i].z;
        positions[i * 3 + 2] = points[i].y;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0); // нічого не малюєм на старті

    const material = new THREE.LineBasicMaterial({color: 0x00cfff});
    const trail = new THREE.Line(geometry, material);
    scene.add(trail);

    return trail;
}

let trail = createTrail();
// endregion

// region ----- Анімація -----
let playing = false;
let animTime = 0;
let lastTime = null;

function animationLoop(timestamp) {
    requestAnimationFrame(animationLoop);
    if (playing) {
        if (!lastTime) {
            lastTime = timestamp;
        } else {
            const dtReal = (timestamp - lastTime) / 1000;
            animTime += dtReal;
            lastTime = timestamp;
        }
        const frac = Math.min(animTime / params.T, 1);// для захисту
        const index = Math.floor(frac * (points.length - 1));
        const {x, y, z, t, v} = points[index];

        ball.position.set(x, z, y);
        trail.geometry.setDrawRange(0, index + 1);

        updateStatistic(x, y, t, v);

        if (animTime >= params.T) {
            playing = false;
            animTime = 0;
            lastTime = null;
        }
    }
    renderer.render(scene, camera);
}
animationLoop();
// endregion

// region ----- Кнопки -----
document.getElementById('btn-play').addEventListener("click", () => {
    if (animTime >= params.T) {
        animTime = 0;
        lastTime = null;
        ball.position.set(points[0].x, points[0].z, points[0].y);
        trail.geometry.setDrawRange(0, 0);
    }
    playing = true;
})
document.getElementById('btn-pause').addEventListener('click', () => {
    playing = false;
    lastTime = null;
});
document.getElementById('btn-reset').addEventListener('click', () => {
    playing = false;
    animTime = 0;
    lastTime = null;

    ball.position.set(points[0].x, points[0].z, points[0].y);

    trail.geometry.setDrawRange(0, 0);
    const firstP = points[0];
    updateStatistic(firstP.x,firstP.y,firstP.t,firstP.v);
})

document.getElementById("btn-reset-cam").addEventListener('click', ()=>{
    spherical.theta = DEFAULT_SPHERICAL.theta;
    spherical.phi = DEFAULT_SPHERICAL.phi;
    spherical.radius = DEFAULT_SPHERICAL.radius;
    target.copy(DEFAULT_TARGET);
    updateCamera();
})
// endregion

// region ----- Слайдери -----
function rebuildAll() {
    playing = false;
    animTime = 0;
    lastTime = null;
    params.x0 = parseFloat(document.getElementById('sl-x0').value);
    params.y0 = parseFloat(document.getElementById('sl-y0').value);
    params.v0 = parseFloat(document.getElementById('sl-v0').value);
    params.phi = parseFloat(document.getElementById('sl-phi').value);
    params.a = parseFloat(document.getElementById('sl-a').value);
    params.T = parseFloat(document.getElementById('sl-t').value);


    trajectoryLine.geometry.dispose();
    trajectoryLine.material.dispose();
    scene.remove(trajectoryLine);

    trail.geometry.dispose();
    trail.material.dispose();
    scene.remove(trail);

    scene.remove(ball);
    ball.geometry.dispose();
    ball.material.dispose();

    //скидання points

    points = calculatePoints(params);

    buildScene();
    trajectoryLine = buildTrajectory();
    ball = createBall();
    trail = createTrail();

    const firstP = points[0];
    updateStatistic(firstP.x, firstP.y, firstP.t, firstP.v);

    // fitCamera();
}

function fitCamera() {
    const lastP = points[points.length - 1];

    // центр траєкторії
    target.set(lastP.x / 2, lastP.z / 2, lastP.y / 2);

    // відстань — щоб вся траєкторія влізла
    const maxDist = Math.max(lastP.x, lastP.z, lastP.y);
    spherical.radius = maxDist * 2;

    updateCamera();
}

['x0', 'y0', 'v0', 'phi', 'a', 't',].forEach(name => {
    const slider = document.getElementById(`sl-${name}`);
    const label = document.getElementById(`val-${name}`);

    slider.addEventListener('input', () => {
        label.textContent = slider.value;
        rebuildAll();
    });
});
// endregion

// region ----- Статистика -----
function updateStatistic(x, y, t, v) {
    document.getElementById("stat-x").textContent = x.toFixed(2);
    document.getElementById("stat-y").textContent = y.toFixed(2);
    document.getElementById("stat-t").textContent = t.toFixed(2);
    document.getElementById("stat-v").textContent = v.toFixed(2);

}

// endregion

window.addEventListener('resize', () => {
    renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
    camera.aspect = canvasWrapper.clientWidth / canvasWrapper.clientHeight;
    camera.updateProjectionMatrix();// Матриця проєкцій визначає як 3D сцена проєктується на 2D екран
    // оновлюємо, щоб вона забезпечувала правильне відображення сцени на екрані
});


