// ==========================================
// 和弦颜色映射引擎 (Color Mapping Engine v4.0)
// 包含：完美的数学坐标映射、准确的 RGB 色块同步
// ==========================================

// 你的设定值
let tsdColors = {
    T: { h: 250, s: 100 }, // 蓝紫
    S: { h: 20,  s: 100 }, // 橙红
    D: { h: 170, s: 100 }  // 青绿
};

let svgOverlay = null;
let currentChordDot = null; 

function initTSDOverlay() {
    const pickerContainer = document.querySelector('.IroWheel');
    if (!pickerContainer) return;

    const width = pickerContainer.clientWidth;
    const height = pickerContainer.clientHeight;

    svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgOverlay.setAttribute("width", width);
    svgOverlay.setAttribute("height", height);
    svgOverlay.style.position = "absolute";
    svgOverlay.style.top = "0";
    svgOverlay.style.left = "0";
    svgOverlay.style.pointerEvents = "none"; 
    svgOverlay.style.zIndex = "10";
    svgOverlay.style.overflow = "visible";
    
    pickerContainer.appendChild(svgOverlay);
    drawTSDTriangle(width);

    window.addEventListener('resize', () => {
        if(pickerContainer.clientWidth > 0) {
            svgOverlay.setAttribute("width", pickerContainer.clientWidth);
            svgOverlay.setAttribute("height", pickerContainer.clientHeight);
            drawTSDTriangle(pickerContainer.clientWidth);
            updateChordDotPosition(pickerContainer.clientWidth);
        }
    });
}

// === 核心修复 1：绝对极坐标映射 ===
// iro.js 默认：h=0(红)在12点，顺时针增加。
// 我们要达到的视觉效果：h=0(红)在3点，逆时针增加（类似数学象限）。
// 公式推导：
// iro_angle = 12点(0度)。如果要让 h=0 在 3点(90度)，且逆时针(-hue)。
// SVG_Angle = (90 - Hue + 360) % 360
// 为了在 Math.sin/cos 中使用，需转为弧度，并减去 90 度(因为 SVG 0度在3点钟)
function getPosFromHue(hue, size, saturation = 100) {
    const radius = size / 2;
    // 数学变换：让颜色分布完美对齐你的视觉要求
    const visualAngle = (90 - hue + 360) % 360; 
    const angleRad = (visualAngle - 90) * (Math.PI / 180);
    
    const maxR = radius - 15; 
    const r = maxR * (saturation / 100);
    
    return {
        x: radius + r * Math.cos(angleRad),
        y: radius + r * Math.sin(angleRad)
    };
}

function drawTSDTriangle(size) {
    if (!svgOverlay) return;
    svgOverlay.innerHTML = ''; 

    const pT = getPosFromHue(tsdColors.T.h, size, tsdColors.T.s);
    const pS = getPosFromHue(tsdColors.S.h, size, tsdColors.S.s);
    const pD = getPosFromHue(tsdColors.D.h, size, tsdColors.D.s);

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", `${pT.x},${pT.y} ${pS.x},${pS.y} ${pD.x},${pD.y}`);
    polygon.setAttribute("fill", "none");
    polygon.setAttribute("stroke", "rgba(255, 255, 255, 0.4)");
    polygon.setAttribute("stroke-width", "1");
    svgOverlay.appendChild(polygon);

    const pointsData = [
        { id: "T", hue: tsdColors.T.h, s: tsdColors.T.s, p: pT },
        { id: "S", hue: tsdColors.S.h, s: tsdColors.S.s, p: pS },
        { id: "D", hue: tsdColors.D.h, s: tsdColors.D.s, p: pD }
    ];

    pointsData.forEach(pt => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", pt.p.x);
        circle.setAttribute("cy", pt.p.y);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", "rgba(255, 255, 255, 0.6)");
        svgOverlay.appendChild(circle);

        // 外侧文字，由于去掉了 CSS 旋转，现在不需要反向旋转文字了，直接定位！
        const textPos = getPosFromHue(pt.hue, size, 125); // 饱和度 125 推到外侧
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", textPos.x);
        text.setAttribute("y", textPos.y);
        text.setAttribute("fill", "#ffffff");
        text.setAttribute("font-size", "16px");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("font-family", "sans-serif");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.textContent = pt.id;
        svgOverlay.appendChild(text);
    });

    currentChordDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    currentChordDot.setAttribute("r", "8");
    currentChordDot.setAttribute("fill", "none");
    currentChordDot.setAttribute("stroke", "#ffffff");
    currentChordDot.setAttribute("stroke-width", "3");
    currentChordDot.style.display = "none";
    svgOverlay.appendChild(currentChordDot);
}

let currentTargetHSL = { h: 0, s: 0, l: 100 };

// 内部复用一个 HSL 转 RGB 的工具，用于修复右侧色块的显示颜色
function getTrueRGB(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) { r = g = b = l; } 
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function applyChordColorByNumeral(romanNumeral) {
    if (!romanNumeral || romanNumeral === "-") return;
    
    const cleanNumeral = romanNumeral.replace(/b|#|m|maj|sus|dim|aug|[0-9]/g, "").toUpperCase();

    let targetH = 0; let targetS = 100; let targetL = 100; 

    switch (cleanNumeral) {
        case "I": case "VI": targetH = tsdColors.T.h; targetS = tsdColors.T.s; break;
        case "II": case "IV": targetH = tsdColors.S.h; targetS = tsdColors.S.s; break;
        case "III": case "V": targetH = tsdColors.D.h; targetS = tsdColors.D.s; break;
        default: targetH = 0; targetS = 0; break; 
    }

    currentTargetHSL = { h: targetH, s: targetS, l: targetL };

    // 【核心修复】：把系统算出的目标颜色，注入给 Pad 1 的光源缓冲池！
    if (window.padLightSources && window.padLightSources[0]) {
        window.padLightSources[0].userHSL = { h: targetH, s: targetS, l: targetL };
    }

    const swatch = document.getElementById('color-swatch');
    if (swatch) {
        const trueColor = getTrueRGB(targetH, targetS, 60);
        swatch.style.backgroundColor = trueColor;
        swatch.style.boxShadow = `0 0 15px ${trueColor}`;
    }

    updateChordDotPosition();
}

function updateChordDotPosition(forceSize) {
    if (!currentChordDot || !svgOverlay) return;
    const size = forceSize || svgOverlay.clientWidth;
    if (size <= 0) return;
    const pos = getPosFromHue(currentTargetHSL.h, size, currentTargetHSL.s);
    currentChordDot.setAttribute("cx", pos.x);
    currentChordDot.setAttribute("cy", pos.y);
    currentChordDot.style.display = "block";
}