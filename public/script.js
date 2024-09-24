const socket = io();
const loginPage = document.getElementById('login-page');
const whiteboardPage = document.getElementById('whiteboard-page');
const loginBtn = document.getElementById('login-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomIdInput = document.getElementById('room-id');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const pdfRender = document.getElementById('pdf-render');
const pdfCtx = pdfRender.getContext('2d');

let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#000000';
let currentSize = 5;
let currentRoom = null;

let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumPending = null;
let scale = 1.5;

loginBtn.addEventListener('click', () => {
    loginPage.style.display = 'none';
    whiteboardPage.style.display = 'flex';
    initializeWhiteboard();
});

createRoomBtn.addEventListener('click', () => {
    currentRoom = Math.random().toString(36).substring(7);
    alert(`Room created! Room ID: ${currentRoom}`);
    socket.emit('join room', currentRoom);
    loginPage.style.display = 'none';
    whiteboardPage.style.display = 'flex';
    initializeWhiteboard();
});

joinRoomBtn.addEventListener('click', () => {
    currentRoom = roomIdInput.value;
    if (currentRoom) {
        socket.emit('join room', currentRoom);
        loginPage.style.display = 'none';
        whiteboardPage.style.display = 'flex';
        initializeWhiteboard();
    } else {
        alert('Please enter a room ID');
    }
});

function initializeWhiteboard() {
    setCanvasToA4Size();
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    document.getElementById('pen-btn').addEventListener('click', () => currentTool = 'pen');
    document.getElementById('eraser-btn').addEventListener('click', () => currentTool = 'eraser');
    document.getElementById('color-picker').addEventListener('change', (e) => currentColor = e.target.value);
    document.getElementById('size-slider').addEventListener('input', (e) => currentSize = e.target.value);
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);
    document.getElementById('save-btn').addEventListener('click', saveCanvas);

    const pdfUpload = document.getElementById('pdf-upload');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const addWhitePageBtn = document.getElementById('add-white-page');

    pdfUpload.addEventListener('change', handlePdfUpload);
    prevPageBtn.addEventListener('click', showPrevPage);
    nextPageBtn.addEventListener('click', showNextPage);
    addWhitePageBtn.addEventListener('click', addWhitePage);
}

function setCanvasToA4Size() {
    const a4Width = 3000;
    const a4Height = 3000;

    canvas.width = pdfRender.width = a4Width * scale;
    canvas.height = pdfRender.height = a4Height * scale;

    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
}

function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        console.error('Not a PDF file');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        loadPdf(typedarray);
    };
    fileReader.readAsArrayBuffer(file);
}

function loadPdf(typedarray) {
    pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        pdfDoc = pdf;
        document.getElementById('page-count').textContent = pdf.numPages;
        renderPage(pageNum);
    });
}

function renderPage(num) {
    pageIsRendering = true;
    pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });

        pdfRender.height = viewport.height;
        pdfRender.width = viewport.width;

        const renderCtx = {
            canvasContext: pdfCtx,
            viewport: viewport
        };

        page.render(renderCtx);

        pageIsRendering = false;
        if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
        }
    });

    document.getElementById('page-num').textContent = num;
    socket.emit('pageChange', { roomId: currentRoom, pageNum: num });
}

function showPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    renderPage(pageNum);
}

function showNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    renderPage(pageNum);
}

function addWhitePage() {
    console.log('Add white page functionality not implemented yet');
}

function startDrawing(e) {
    isDrawing = true;
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    socket.emit('draw', { 
        x, 
        y, 
        tool: currentTool, 
        color: currentColor, 
        size: currentSize, 
        roomId: currentRoom,
        isNewStroke: false
    });
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        ctx.beginPath();
        socket.emit('draw', { 
            isNewStroke: true, 
            roomId: currentRoom 
        });
    }
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear', currentRoom);
}

function saveCanvas() {
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = 'whiteboard.png';
    link.click();
}

socket.on('draw', (data) => {
    if (data.isNewStroke) {
        ctx.beginPath();
        return;
    }
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
    ctx.lineTo(data.x, data.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
});

socket.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('pageChange', (data) => {
    if (data.pageNum !== pageNum) {
        pageNum = data.pageNum;
        renderPage(pageNum);
    }
});
