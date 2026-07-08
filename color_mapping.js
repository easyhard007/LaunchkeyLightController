// ==========================================
// 和弦颜色映射引擎 (Color Mapping Engine v6.0)
// 七大顺阶色彩体系 (Diatonic Seven-Color System)
// ==========================================

// 7 大级数色彩库
let diatonicColors = {
    I:   { h: 260, s: 100 }, // 蓝紫
    IV:  { h: 20,  s: 100 }, // 橙红
    V:   { h: 170, s: 100 }, // 青绿
    ii:  { h: 43,  s: 40 }, // 金黄
    iii: { h: 228, s: 70 }, // 深海蓝
    vi:  { h: 290, s: 60 }, // 粉紫
    vii: { h: 130, s: 30 }  // 绿色 (减和弦)
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

    const pT = getPosFromHue(diatonicColors.I.h, size, diatonicColors.I.s);
    const pS = getPosFromHue(diatonicColors.IV.h, size, diatonicColors.IV.s);
    const pD = getPosFromHue(diatonicColors.V.h, size, diatonicColors.V.s);

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", `${pT.x},${pT.y} ${pS.x},${pS.y} ${pD.x},${pD.y}`);
    polygon.setAttribute("fill", "none");
    polygon.setAttribute("stroke", "#ffffff");
    polygon.setAttribute("stroke-width", "1.5");
    svgOverlay.appendChild(polygon);

    const pointsData = [
        { id: "T", hue: diatonicColors.I.h, s: diatonicColors.I.s, p: pT },
        { id: "S", hue: diatonicColors.IV.h, s: diatonicColors.IV.s, p: pS },
        { id: "D", hue: diatonicColors.V.h, s: diatonicColors.V.s, p: pD }
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

let currentTargetHSL = { h: 0, s: 0, l: 100 }; // 默认白色白光占位

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
    if (!romanNumeral || romanNumeral === "-") return "-"; // 返回未知状态给 keyboard.js
    
    // 【全新逻辑】：只提取基础级数（包含大小写，这非常重要！因为我们要区分大调的 I 和小调的 ii）
    // 用正则提取最前面的罗马数字组：匹配连续的 I, V, X, i, v, x，忽略前缀 b/# 和后缀 maj7/m7/dim
    const romanMatch = romanNumeral.match(/^[b#]*([IVXivx]+)/i);
    
    let targetH = 0; 
    let targetS = 100; 
    let targetL = 100; 
    let functionGroup = "-"; // 用于返回给 UI 第二行大字显示

    if (romanMatch) {
        // 提取出来的纯罗马数字（忽略了可能存在的 b 或 #）
        // 比如 bVIImaj7 会提取出 VII。我们将其转换为标准对照格式
        let rootRoman = romanMatch[1].toUpperCase(); 

        switch (rootRoman) {
            case "I": 
                targetH = diatonicColors.I.h; targetS = diatonicColors.I.s; 
                functionGroup = "I";
                break;
            case "II": 
                targetH = diatonicColors.ii.h; targetS = diatonicColors.ii.s; 
                functionGroup = "ii"; // 小写
                break;
            case "III": 
                targetH = diatonicColors.iii.h; targetS = diatonicColors.iii.s; 
                functionGroup = "iii"; // 小写
                break;
            case "IV": 
                targetH = diatonicColors.IV.h; targetS = diatonicColors.IV.s; 
                functionGroup = "IV";
                break;
            case "V": 
                targetH = diatonicColors.V.h; targetS = diatonicColors.V.s; 
                functionGroup = "V";
                break;
            case "VI": 
                targetH = diatonicColors.vi.h; targetS = diatonicColors.vi.s; 
                functionGroup = "vi"; // 小写
                break;
            case "VII": 
                targetH = diatonicColors.vii.h; targetS = diatonicColors.vii.s; 
                functionGroup = "vii°"; // 你的绝妙设计：附加减度符号
                break;
            default: 
                targetH = 0; targetS = 0; 
                functionGroup = "-";
                break; 
        }
    } else {
        // 兜底：如果正则连罗马数字都没找到
        targetH = 0; targetS = 0; 
        functionGroup = "-";
    }

    currentTargetHSL = { h: targetH, s: targetS, l: targetL };

    // 1. 注入光能引擎
    if (window.padLightSources && window.padLightSources[0]) {
        window.padLightSources[0].userHSL = { h: targetH, s: targetS, l: targetL };
    }

    // 2. 移动色环准星
    updateChordDotPosition();

    // 3. 返回处理好的功能级数名（如 "IV" 或 "vii°"），交给 keyboard.js 渲染到屏幕！
    return functionGroup;
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