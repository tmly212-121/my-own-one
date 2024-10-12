const firebaseConfig = {
    apiKey: "AIzaSyDJ9SXro...",
    authDomain: "tmly212-pdf.firebaseapp.com",
    databaseURL: "https://fir-test-2c9a7-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "tmly212-pdf",
    storageBucket: "tmly212-pdf.appspot.com",
    messagingSenderId: "954794480899",
    appId: "1:954794480899:web:48e0df2547b85563f10536",
    measurementId: "G-XNEV3CJB0N"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let roomId;
let username;
const urlParams = new URLSearchParams(window.location.search);
roomId = urlParams.get('room');
username = decodeURIComponent(urlParams.get('username'));
if (!roomId || !username) {
    window.location.href = 'login.html';
}

const roomRef = database.ref('rooms/' + roomId);
const userRef = roomRef.child('users').push();
userRef.set(username);
userRef.onDisconnect().remove();

const drawingCanvas = document.getElementById('drawingCanvas');
const ctx = drawingCanvas.getContext('2d');
ctx.globalCompositeOperation = 'source-over';
ctx.lineWidth = 2;

const whiteSheetCanvas = document.getElementById('whiteSheetCanvas');
const whiteSheetCtx = whiteSheetCanvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const lineWidthInput = document.getElementById('lineWidthInput');
ctx.strokeStyle = colorPicker.value;

let isDrawing = false;
let startPoint = null;
let currentPath = [];
let pathsRef;
let localPaths = {};
let currentPdf = null;
let currentPage = 1;
let currentPdfScale = 2;
let pdfDataUrl = null;
let isWhiteSheetVisible = false;
let drawingMode = 'freehand';
const DRAWING_MODES = {
    'ن': 'freehand',
    'k': 'freehand',
    'x': 'rectangle',
    'ء': 'rectangle',
    'c': 'circle',
    'ؤ': 'circle',
    'v': 'triangle',
    'ر': 'triangle',
    'l': 'line',
    'م': 'line',

};
let lastSendTime = 0;
const sendInterval = 50;

let scrollDebounceTimer;
const SCROLL_DEBOUNCE_DELAY = 200;
let lastKnownScrollPosition = 0;
const SCROLL_THRESHOLD = 100;
let undoStack = [];
const MAX_UNDO_STEPS = 40; 
let currentDrawingState = {};
let lastDrawingUpdateTimestamp = 0;

drawingCanvas.addEventListener('mousedown', startDrawing);
drawingCanvas.addEventListener('mousemove', draw);
drawingCanvas.addEventListener('mouseup', stopDrawing);
drawingCanvas.addEventListener('mouseout', stopDrawing);

colorPicker.addEventListener('change', function() {
    ctx.strokeStyle = colorPicker.value;
});

function updateLineWidth() {
    ctx.lineWidth = lineWidthInput.value;
}

function updateDrawingMode() {
    drawingMode = document.getElementById('shapeSelector').value;
}
function changeDrawingMode(mode) {
    drawingMode = mode;
    document.getElementById('shapeSelector').value = mode;
}

function startDrawing(e) {
    isDrawing = true;
    startPoint = getPoint(e);
    currentPath = [startPoint];
    const pathId = Date.now().toString();
    pathsRef = roomRef.child('paths').push();
    localPaths[pathId] = { 
        points: currentPath, 
        color: ctx.strokeStyle, 
        lineWidth: ctx.lineWidth,
        mode: drawingMode 
    };
    
    // حفظ حالة الرسم قبل البدء برسم جديد
    saveDrawingState();
}
function saveDrawingState() {
    undoStack.push(JSON.parse(JSON.stringify(localPaths)));
    if (undoStack.length > MAX_UNDO_STEPS) {
        undoStack.shift();
    }
    currentDrawingState = JSON.parse(JSON.stringify(localPaths));
    updateFirebaseDrawingState();
}

function undo() {
    if (undoStack.length > 0) {
        currentDrawingState = undoStack.pop();
        localPaths = JSON.parse(JSON.stringify(currentDrawingState));
        updateFirebaseDrawingState();
        redrawCanvas();
    }
}
function updateFirebaseDrawingState() {
    roomRef.child('drawingState').set({
        paths: currentDrawingState,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}
function updateFirebase() {
    roomRef.child('paths').set(localPaths);
}
function draw(e) {
    if (!isDrawing) return;
    const newPoint = getPoint(e);
    currentPath.push(newPoint);

    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    redrawCanvas();

    ctx.beginPath();
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = lineWidthInput.value;

    switch (drawingMode) {
        case 'freehand':
            ctx.moveTo(startPoint.x, startPoint.y);
            for (let i = 1; i < currentPath.length; i++) {
                ctx.lineTo(currentPath[i].x, currentPath[i].y);
            }
            break;
        case 'rectangle':
            ctx.rect(startPoint.x, startPoint.y, newPoint.x - startPoint.x, newPoint.y - startPoint.y);
            break;
        case 'circle':
            const radius = Math.sqrt(Math.pow(newPoint.x - startPoint.x, 2) + Math.pow(newPoint.y - startPoint.y, 2));
            ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
            break;
        case 'triangle':
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(newPoint.x, newPoint.y);
            ctx.lineTo(startPoint.x - (newPoint.x - startPoint.x), newPoint.y);
            ctx.closePath();
            break;
        case 'line':
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(newPoint.x, newPoint.y);
            break;
    }
    ctx.stroke();

    const now = Date.now();
    if (now - lastSendTime > sendInterval) {
        sendDrawingData(newPoint);
        lastSendTime = now;
    }
}

function sendDrawingData(newPoint) {
    pathsRef.update({
        points: currentPath,
        color: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        mode: drawingMode
    });
}

function stopDrawing(e) {
    if (!isDrawing) return;
    const newPoint = getPoint(e);

    // إضافة النقطة الأخيرة إلى المسار
    currentPath.push(newPoint);

    // تأكد من رسم الشكل النهائي عند رفع الماوس
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    redrawCanvas();

    ctx.beginPath();
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = lineWidthInput.value;

    switch (drawingMode) {
        case 'freehand':
            ctx.moveTo(startPoint.x, startPoint.y);
            for (let i = 1; i < currentPath.length; i++) {
                ctx.lineTo(currentPath[i].x, currentPath[i].y);
            }
            break;
        case 'rectangle':
            ctx.rect(startPoint.x, startPoint.y, newPoint.x - startPoint.x, newPoint.y - startPoint.y);
            break;
        case 'circle':
            const radius = Math.sqrt(Math.pow(newPoint.x - startPoint.x, 2) + Math.pow(newPoint.y - startPoint.y, 2));
            ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
            break;
        case 'triangle':
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(newPoint.x, newPoint.y);
            ctx.lineTo(startPoint.x - (newPoint.x - startPoint.x), newPoint.y);
            ctx.closePath();
            break;
        case 'line':
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(newPoint.x, newPoint.y);
            break;
    }
    ctx.stroke();

    // إرسال بيانات الرسم بعد التأكد من اكتمال عملية الرسم
    sendDrawingData(newPoint);
    saveDrawingState();

    // إيقاف عملية الرسم
    isDrawing = false;
}

function getPoint(e) {
    const rect = drawingCanvas.getBoundingClientRect();
    return {
        x: ((e.clientX - rect.left) / rect.width) * drawingCanvas.width,
        y: ((e.clientY - rect.top) / rect.height) * drawingCanvas.height
    };
}

function clearCanvas() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    roomRef.child('paths').remove();
    localPaths = {};
    roomRef.child('clear').set(Date.now());
}

function redrawCanvas() {
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    Object.values(localPaths).forEach(path => {
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.lineWidth;

        switch (path.mode) {
            case 'freehand':
                ctx.moveTo(path.points[0].x, path.points[0].y);
                for (let i = 1; i < path.points.length; i++) {
                    ctx.lineTo(path.points[i].x, path.points[i].y);
                }
                break;
            case 'rectangle':
                ctx.rect(
                    path.points[0].x,
                    path.points[0].y,
                    path.points[path.points.length - 1].x - path.points[0].x,
                    path.points[path.points.length - 1].y - path.points[0].y
                );
                break;
            case 'circle':
                const radius = Math.sqrt(
                    Math.pow(path.points[path.points.length - 1].x - path.points[0].x, 2) +
                    Math.pow(path.points[path.points.length - 1].y - path.points[0].y, 2)
                );
                ctx.arc(path.points[0].x, path.points[0].y, radius, 0, 2 * Math.PI);
                break;
            case 'triangle':
                ctx.moveTo(path.points[0].x, path.points[0].y);
                ctx.lineTo(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);
                ctx.lineTo(path.points[0].x - (path.points[path.points.length - 1].x - path.points[0].x), path.points[path.points.length - 1].y);
                ctx.closePath();
                break;
            case 'line':
                ctx.moveTo(path.points[0].x, path.points[0].y);
                ctx.lineTo(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);
                break;
        }
        ctx.stroke();
    });
}

roomRef.child('paths').on('child_added', (snapshot) => {
    const pathData = snapshot.val();
    if (!localPaths[snapshot.key]) {
        localPaths[snapshot.key] = pathData;
        redrawCanvas();
    }
});

roomRef.child('paths').on('child_changed', (snapshot) => {
    const pathData = snapshot.val();
    localPaths[snapshot.key] = pathData;
    redrawCanvas();
});

roomRef.child('clear').on('value', (snapshot) => {
    if (snapshot.exists()) {
        ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        localPaths = {};
    }
});

const pdfInput = document.getElementById('pdfInput');
const pdfCanvas = document.getElementById('pdfCanvas');
const pdfCtx = pdfCanvas.getContext('2d');

function updatePdfScale() {
    const newScale = parseFloat(document.getElementById('pdfScale').value);
    if (!isNaN(newScale) && newScale >= 0.5 && newScale <= 5) {
        currentPdfScale = newScale;
        if (currentPdf) {
            renderPage(currentPage);
            updatePdfInfo();
            setTimeout(updateScrollPosition, 100);
        }
    }
}

function renderPage(pageNum) {
    currentPdf.getPage(pageNum).then(function(page) {
        const viewport = page.getViewport({ scale: currentPdfScale });
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        drawingCanvas.width = 1900;  // تعيين عرض ثابت
        drawingCanvas.height = 3000; // تعيين ارتفاع ثابت
        whiteSheetCanvas.width = 1900;  // تعيين عرض ثابت
        whiteSheetCanvas.height = 3000; // تعيين ارتفاع ثابت
        const renderContext = {
            canvasContext: pdfCtx,
            viewport: viewport
        };
        page.render(renderContext).promise.then(() => {
            redrawCanvas();
            updateWhiteSheet();
            window.scrollTo(0, 0);
            updateScrollPosition();
            updatePageInput()
        });
    });
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
        updatePdfInfo();
    }
}

function nextPage() {
    if (currentPdf && currentPage < currentPdf.numPages) {
        currentPage++;
        renderPage(currentPage);
        updatePdfInfo();
    }
}
document.addEventListener('keydown', function(event) {
    const key = event.key.toLowerCase();
    
    // معالجة أوضاع الرسم
    if (DRAWING_MODES.hasOwnProperty(key)) {
        event.preventDefault();
        changeDrawingMode(DRAWING_MODES[key]);
    } 
    // معالجة أزرار التنقل
    else if (event.key === 'ArrowLeft') {
        prevPage();
    } else if (event.key === 'ArrowRight') {
        nextPage();
    }
    // معالجة زر التراجع
    else if (key === 'z' || key === 'ئ') {
        event.preventDefault();
        undo();
    }
});
document.addEventListener('keydown', function(event) {
    // التحقق من الضغط على 'Z' أو 'z' بالإنجليئية، أو 'ئ' بالعربية
    if (event.key.toLowerCase() === 'z' || event.key === 'ئ') {
        event.preventDefault(); // منع السلوك الافتراضي للمتصفح
        undo();
    }
});
function updatePdfInfo() {
    const pdfInfo = {
        currentPage: currentPage,
        scale: currentPdfScale,
        dataUrl: pdfDataUrl
    };

    if (currentPdf && typeof currentPdf.numPages === 'number') {
        pdfInfo.totalPages = currentPdf.numPages;
    }

    roomRef.child('pdfInfo').set(pdfInfo);
}

pdfInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        console.error('File is not a PDF');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(event) {
        pdfDataUrl = event.target.result;
        pdfjsLib.getDocument({ data: pdfDataUrl }).promise.then(function(pdf) {
            currentPdf = pdf;
            currentPage = 1;
            renderPage(currentPage);
            updatePdfInfo();
        });
    };
    reader.readAsArrayBuffer(file);
});

roomRef.child('pdfInfo').on('value', (snapshot) => {
    if (snapshot.exists()) {
        const pdfInfo = snapshot.val();
        if (pdfInfo.dataUrl && (!currentPdf || pdfInfo.dataUrl !== pdfDataUrl)) {
            pdfDataUrl = pdfInfo.dataUrl;
            pdfjsLib.getDocument({ data: pdfDataUrl }).promise.then(function(pdf) {
                currentPdf = pdf;
                currentPage = pdfInfo.currentPage;
                currentPdfScale = pdfInfo.scale;
                document.getElementById('pdfScale').value = currentPdfScale;
                renderPage(currentPage);
                updatePageInput();
            });
        } else if (currentPdf && (pdfInfo.currentPage !== currentPage || pdfInfo.scale !== currentPdfScale)) {
            currentPage = pdfInfo.currentPage;
            currentPdfScale = pdfInfo.scale;
            document.getElementById('pdfScale').value = currentPdfScale;
            renderPage(currentPage);
            updatePageInput();
        }
    }
});

function toggleWhiteSheet() {
    isWhiteSheetVisible = !isWhiteSheetVisible;
    updateWhiteSheet();
    roomRef.child('whiteSheet').set(isWhiteSheetVisible);
}

function updateWhiteSheet() {
    // تعيين أبعاد الورقة البيضاء لتطابق حجم منطقة الرسم
    whiteSheetCanvas.width = 1900;
    whiteSheetCanvas.height = 3000;

    if (isWhiteSheetVisible) {
        whiteSheetCtx.fillStyle = 'white';
        whiteSheetCtx.fillRect(0, 0, whiteSheetCanvas.width, whiteSheetCanvas.height);
    } else {
        whiteSheetCtx.clearRect(0, 0, whiteSheetCanvas.width, whiteSheetCanvas.height);
    }
}

roomRef.child('whiteSheet').on('value', (snapshot) => {
    if (snapshot.exists()) {
        isWhiteSheetVisible = snapshot.val();
        updateWhiteSheet();
    }
});

function updateActiveUsers(users) {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    Object.values(users).forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        userList.appendChild(li);
    });
}

roomRef.child('users').on('value', (snapshot) => {
    const users = snapshot.val() || {};
    updateActiveUsers(users);
});

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.9.359/pdf.worker.min.js';

drawingCanvas.addEventListener('touchstart', handleTouchStart, false);
drawingCanvas.addEventListener('touchmove', handleTouchMove, false);
drawingCanvas.addEventListener('touchend', handleTouchEnd, false);

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch);
}

function handleTouchEnd(e) {
    e.preventDefault();
    stopDrawing(e.changedTouches[0]);
}


function updateScrollPosition() {
    const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

    if (Math.abs(currentScrollPosition - lastKnownScrollPosition) > SCROLL_THRESHOLD) {
        lastKnownScrollPosition = currentScrollPosition;
        roomRef.child('scrollPosition').set(currentScrollPosition);
    }
}

window.addEventListener('scroll', function() {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(updateScrollPosition, SCROLL_DEBOUNCE_DELAY);
});

roomRef.child('scrollPosition').on('value', (snapshot) => {
    if (snapshot.exists()) {
        const newScrollPosition = snapshot.val();
        if (Math.abs(newScrollPosition - (window.pageYOffset || document.documentElement.scrollTop)) > SCROLL_THRESHOLD) {
            window.scrollTo({
                top: newScrollPosition,
                behavior: 'auto'
            });
        }
    }
});
roomRef.child('drawingState').on('value', (snapshot) => {
    if (snapshot.exists()) {
        const newDrawingState = snapshot.val();
        if (newDrawingState.timestamp !== lastDrawingUpdateTimestamp) {
            localPaths = newDrawingState.paths;
            redrawCanvas();
            lastDrawingUpdateTimestamp = newDrawingState.timestamp;
        }
    }
});
function addUndoButton() {
    const undoButton = document.createElement('button');
    undoButton.textContent = 'Undo';
    undoButton.onclick = undo;
    document.body.appendChild(undoButton);
}
function goToPage() {
    const pageInput = document.getElementById('pageInput');
    const pageNumber = parseInt(pageInput.value);
    if (pageNumber && pageNumber > 0 && pageNumber <= currentPdf.numPages) {
        currentPage = pageNumber;
        renderPage(currentPage);
        updatePdfInfo();
    } else {
        alert('الرجاء إدخال رقم صفحة صحيح');
    }
}

function updatePageInput() {
    const pageInput = document.getElementById('pageInput');
    pageInput.value = currentPage;
    pageInput.max = currentPdf.numPages;
}
document.getElementById('pageInput').addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        goToPage();
    }
});