// إخفاء شاشة الترحيب وإظهار التطبيق
document.getElementById('startButton').addEventListener('click', () => {
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
});

// التعامل مع تغيير طريقة التحديد (AI أو يدوي)
document.getElementById('detectionMethod').addEventListener('change', (e) => {
  const method = e.target.value;
  const manualSection = document.getElementById('manualDrawingSection');
  if (method === 'manual') {
    manualSection.style.display = 'block';
    showImageOnCanvas(); // إظهار الصورة تلقائيًا عند اختيار "يدوي"
  } else {
    manualSection.style.display = 'none';
  }
});

// إظهار خانة الكثافة المخصصة
document.getElementById('oilType').addEventListener('change', (e) => {
  const customContainer = document.getElementById('customDensityContainer');
  customContainer.style.display = e.target.value === 'custom' ? 'block' : 'none';
});

// إظهار خانة عدد النقاط المخصص
document.getElementById('depthOption').addEventListener('change', (e) => {
  const customDepth = document.getElementById('customDepthValue');
  customDepth.style.display = e.target.value === 'custom' ? 'block' : 'none';
});

// قراءة ملف الإكسل
document.getElementById('excelUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  document.getElementById('excelFileName').textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1 }).flat().filter(x => typeof x === 'number');
    document.getElementById('depths').value = values.join(', ');
  };
  reader.readAsArrayBuffer(file);
});

// ⚠️ عرض أول صورة على الكانفس
function showImageOnCanvas() {
  const files = document.getElementById('imageUpload').files;
  if (files.length > 0) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = function (event) {
      img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(files[0]);
  }
}

// عند رفع صورة جديدة، إظهارها فورًا إن كان التحديد "يدوي"
document.getElementById('imageUpload').addEventListener('change', () => {
  const method = document.getElementById('detectionMethod').value;
  if (method === 'manual') {
    showImageOnCanvas();
  }
});

// إعدادات الكانفس والرسم باللون الأحمر
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let drawingPoints = [];

canvas.addEventListener('pointerdown', (e) => {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
  drawingPoints = [{ x: e.offsetX, y: e.offsetY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (isDrawing) {
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawingPoints.push({ x: e.offsetX, y: e.offsetY });
  }
});

canvas.addEventListener('pointerup', () => {
  isDrawing = false;
});

// زر إنهاء التحديد: يغلق الشكل، يملؤه بالأحمر الشفاف، ويحسب المساحة
document.getElementById('finishDrawing').addEventListener('click', () => {
  if (drawingPoints.length < 3) {
    alert('الرجاء رسم شكل مغلق يحتوي على 3 نقاط على الأقل.');
    return;
  }

  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
  ctx.fill();

  // حساب المساحة باستخدام صيغة shoelace
  const pixelArea = Math.abs(
    drawingPoints.reduce((sum, point, i) => {
      const next = drawingPoints[(i + 1) % drawingPoints.length];
      return sum + (point.x * next.y - next.x * point.y);
    }, 0) / 2
  );

  // تحويل من بكسل إلى متر مربع
  const height = parseFloat(document.getElementById('droneHeight').value);
  const fov = parseFloat(document.getElementById('cameraFov').value);
  if (isNaN(height) || isNaN(fov)) {
    alert('الرجاء إدخال بيانات صحيحة للدرون والكاميرا قبل الحساب.');
    return;
  }

  const fovRad = fov * Math.PI / 180;
  const realHalfWidth = Math.tan(fovRad / 2) * height;
  const metersPerPixel = (realHalfWidth * 2) / canvas.width;
  const areaMeters = pixelArea * metersPerPixel * metersPerPixel;

  // تخزين القيمة لاستخدامها في الحساب
  canvas.dataset.manualArea = areaMeters.toFixed(4);

  alert(`✅ تم تحديد المنطقة. المساحة التقريبية: ${areaMeters.toFixed(2)} م²`);
});

// الحساب النهائي باستخدام المساحة اليدوية
function calculateOilMass() {
  const area = parseFloat(canvas.dataset.manualArea);
  if (isNaN(area)) {
    alert('يرجى أولاً تحديد المنطقة يدويًا باللون الأحمر.');
    return;
  }

  const depthsInput = document.getElementById('depths').value;
  const depthValues = depthsInput.split(',').map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (depthValues.length === 0) {
    alert('الرجاء إدخال قيم عمق صحيحة.');
    return;
  }

  const averageDepth = depthValues.reduce((a, b) => a + b, 0) / depthValues.length;

  let density = parseFloat(document.getElementById('oilType').value);
  if (isNaN(density)) {
    density = parseFloat(document.getElementById('customDensity').value);
  }

  const volume = area * averageDepth;
  const mass = volume * density;

  document.getElementById('output').innerHTML = `
    🟦 المساحة المحددة: ${area.toFixed(2)} م²<br>
    📏 متوسط العمق: ${averageDepth.toFixed(2)} م<br>
    🧪 الحجم: ${volume.toFixed(2)} م³<br>
    ⚖️ الكتلة: ${mass.toFixed(2)} كغ
  `;
}

// OpenCV جاهز
function openCvReady() {
  console.log("OpenCV جاهز!");
}
