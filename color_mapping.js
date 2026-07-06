// ==========================================
// 和弦颜色映射引擎 (Color Mapping Engine v5.1)
// 修复：正确写入 padLightSources，更新 260 蓝紫
// ==========================================

let tsdColors = {
    T: { h: 260, s: 100 }, // 你的绝美蓝紫
    S: { h: 20,  s: 100 }, 
    D: { h: 170, s: 100 }  
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
    updateChordDotPosition(width);

    window.addEventListener('resize', () => {
        if(pickerContainer.clientWidth > 0) {
            svgOverlay.setAttribute("width", pickerContainer.clientWidth);
            svgOverlay.setAttribute("height", pickerContainer.clientHeight);
            drawTSDTriangle(pickerContainer.clientWidth);
            updateChordDotPosition(pickerContainer.clientWidth);
        }
    });
}

function getPosFromHue(hue, size, saturation = 100) {
    const radius = size / 2;
    const visualAngle = (90 - hue + 360) % 360; 
    const angleRad = (visualAngle - 90) * (Math.PI / 180);
    const maxR = radius - 15; 
    const r = maxR * (saturation / 100);
    return { x: radius + r * Math.cos(angleRad), y: radius + r * Math.sin(angleRad) };
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
    polygon.setAttribute("stroke", "#ffffff");
    polygon.setAttribute("stroke-width", "1.5");
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
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "#ffffff");
        svgOverlay.appendChild(circle);

        const textPos = getPosFromHue(pt.hue, size, 145); 
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", textPos.x);
        text.setAttribute("y", textPos.y);
        text.setAttribute("fill", "#ffffff");
        text.setAttribute("font-size", "20px");
        text.setAttribute("font-weight", "900");
        text.setAttribute("font-family", "sans-serif");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.textContent = pt.id;
        svgOverlay.appendChild(text);
    });

    currentChordDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    currentChordDot.setAttribute("r", "9");
    currentChordDot.setAttribute("fill", "none");
    currentChordDot.setAttribute("stroke", "#ffffff");
    currentChordDot.setAttribute("stroke-width", "3");
    currentChordDot.style.transition = "cx 0.35s cubic-bezier(0.1, 0.9, 0.2, 1), cy 0.35s cubic-bezier(0.1, 0.9, 0.2, 1)";
    currentChordDot.style.filter = "drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.8))";
    svgOverlay.appendChild(currentChordDot);
}

let currentTargetHSL = { h: tsdColors.T.h, s: tsdColors.T.s, l: 100 };

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

    // 【核心修复：正确写入独立光源池 padLightSources[0]】
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