// ==========================================
// 光学与物理灯光引擎 (Light & Color Engine v5.2)
// 修复：恢复 iro.js 调色盘，修正颜色传入断点
// ==========================================

const TOP_PADS = [96, 97, 98, 99, 100, 101, 102, 103]; 
const BOTTOM_PADS = [112, 113, 114, 115, 116, 117, 118, 119];

const FADE_DURATION = 500;       
const ANIMATION_TICK = 33;       // 约 30Hz 动效帧率
const IDLE_LIGHTNESS = 0; 

// globalPadColors: 用于 UI 和 MIDI 发送的绝对显示颜色
let globalPadColors = Array.from({length: 16}, () => ({ h: 0, s: 0, l: 0 }));

// padLightSources: 独立光源池 (当前只用 padLightSources[0] 作为发起源)
// 【核心变量暴露】：必须把 padLightSources 挂载到 window，让 color_mapping.js 能写入颜色！
window.padLightSources = Array.from({length: 16}, () => ({
    userHSL: { h: 0, s: 0, l: 0 },
    envelope: 0 
}));

let lastEngineTick = 0; 
let colorPicker = null;

// === Driver 层：脏数据缓存 ===
let lastSentColors = Array.from({length: 16}, () => ({ r: -1, g: -1, b: -1 }));

function hslToRgb(h, s, l) {
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
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function flushMidiDriver() {
    if (!window.isRunning || !window.midiOutput) return;

    for (let i = 0; i < 8; i++) { 
        let color = globalPadColors[i];
        let [r8, g8, b8] = hslToRgb(color.h, color.s, color.l);
        
        let r7 = Math.floor(r8 / 2);
        let g7 = Math.floor(g8 / 2);
        let b7 = Math.floor(b8 / 2);

        // 脏数据拦截
        if (r7 !== lastSentColors[i].r || g7 !== lastSentColors[i].g || b7 !== lastSentColors[i].b) {
            window.midiOutput.send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x13, 0x01, 0x43, TOP_PADS[i], r7, g7, b7, 0xF7]);
            lastSentColors[i] = { r: r7, g: g7, b: b7 };
        }
    }
}

// 笛卡尔坐标系 HSL 插值
function interpolateHSL(source, target, progress) {
    progress = Math.max(0, Math.min(1, progress));
    let h1 = source.h, s1 = source.s;
    let h2 = target.h, s2 = target.s;
    
    if (s1 < 1) h1 = h2;
    if (s2 < 1) h2 = h1;

    const h1Rad = h1 * (Math.PI / 180);
    const h2Rad = h2 * (Math.PI / 180);
    
    const x1 = s1 * Math.cos(h1Rad);
    const y1 = s1 * Math.sin(h1Rad);
    const x2 = s2 * Math.cos(h2Rad);
    const y2 = s2 * Math.sin(h2Rad);
    
    const currentX = x1 + (x2 - x1) * progress;
    const currentY = y1 + (y2 - y1) * progress;
    
    let currentS = Math.sqrt(currentX * currentX + currentY * currentY);
    let currentH = Math.atan2(currentY, currentX) * (180 / Math.PI);
    if (currentH < 0) currentH += 360;
    
    let currentL = source.l + (target.l - source.l) * progress;
    
    return { h: currentH, s: currentS, l: currentL };
}

function applyBrightnessCurve(linearL, baseL) {
    if (baseL <= 0 || linearL <= 0) return 0;
    let x = 1.0 - (linearL / baseL);
    let multiplier = 1.0 - (x * x);
    return baseL * Math.max(0, Math.min(1, multiplier));
}

// === 动效模块 (Wave Animator) ===
function applyWaveEffect() {
    for (let i = 7; i >= 1; i--) {
        let prevPad = globalPadColors[i - 1];
        let currentPad = globalPadColors[i];
        // 0.4 保留自身惯性，0.6 接收前方的光波
        globalPadColors[i] = interpolateHSL(currentPad, prevPad, 0.6);
    }
}

// === 光源模块触发 ===
function triggerPadLights() {
    window.padLightSources[0].envelope = 1.0; 
}

function forceSendCurrentColorToMidi() {
    triggerPadLights();
}

// === 【核心修复】：恢复调色盘渲染 ===
function initColorPicker() {
    colorPicker = new iro.ColorPicker("#color-picker-container", {
        width: 180, 
        color: "#aa00ff", // 初始占位颜色
        layout: [ { component: iro.ui.Wheel } ]
    });

    // 绘制 TSD 外层 SVG
    setTimeout(() => {
        if (typeof initTSDOverlay === 'function') initTSDOverlay();
    }, 100);
    
    // 初始化颜色数组
    const hsl = colorPicker.color.hsl;
    window.padLightSources[0].userHSL = { h: hsl.h, s: hsl.s, l: 100 };
    
    requestAnimationFrame(engineLoop);
}

// === 渲染主循环 ===
let lastFrameTime = performance.now();

function engineLoop(currentTime) {
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    // 1. 光源包络衰减 (Pad 0)
    let sourcePad = window.padLightSources[0];
 // --------- 【旧模式：MIDI 包络衰减】 (先注释掉保留备用) ---------
    /*
    if (sourcePad.envelope > 0) {
        let decrement = deltaTime / FADE_DURATION;
        sourcePad.envelope -= decrement;
        if (sourcePad.envelope <= 0) sourcePad.envelope = 0;
    }
    */
    
    // +++++++++ 【新模式：麦克风实时驱动】 +++++++++
    // 直接用麦克风的实时音量强制接管光能包络！
    if (typeof window.currentAudioVolume !== 'undefined') {
        sourcePad.envelope = window.currentAudioVolume;
    }
    // ++++++++++++++++++++++++++++++++++++++++++++

	//将最大亮度 L 限制为 60，避免死白
    const MAX_LIGHTNESS = 60;
	const MIN_ENVELOPE_FLOOR = 0.2; // 30% 的下限，永远不会跌破这个值
   
    // 我们拿到麦克风传来的物理包络 (0.0 ~ 1.0)
    let rawEnvelope = sourcePad.envelope;
    
    // 如果开启了控制模式 (isRunning)，强制进行兜底保护
    if (window.isRunning) {
        rawEnvelope = Math.max(MIN_ENVELOPE_FLOOR, rawEnvelope);
    }

    // 通过抛物线函数进行视觉修正
    let visualEnvelope = applyBrightnessCurve(rawEnvelope * 100, 100) / 100;
    
    // 计算最终的亮度 (L) 和饱和度 (S)
    let currentL = MAX_LIGHTNESS * visualEnvelope;
    let currentS = sourcePad.userHSL.s * visualEnvelope;
    
    globalPadColors[0] = { h: sourcePad.userHSL.h, s: currentS, l: currentL };

    // 因为有了 30% 的氛围底光，意味着只要接管了设备，灯光系统就必须永远运转
    // 我们永远保持 active 状态，强制执行推流和渲染，彻底废除 forceZeroFlush 关灯机制！
    if (window.isRunning) {
        isAnyPadActive = true; 
    } else {
        forceZeroFlush = true; // 只有在用户点击“停止”按钮时，才真正触发黑屏全关
    }

    // 2. 动效模块 (按 30Hz 推波)
    if (currentTime - lastEngineTick >= ANIMATION_TICK) {
        applyWaveEffect();
        lastEngineTick = currentTime;
    }

    // 3. 渲染网页 UI
    for (let i = 0; i < 8; i++) {
        const lightDiv = document.getElementById(`vpad-light-${i}`);
        if(lightDiv) {
            let h = globalPadColors[i].h, s = globalPadColors[i].s, l = globalPadColors[i].l;
            const stops = [
                `hsla(${h},${s}%,${l}%, 1) 0%`,
                `hsla(${h},${s}%,${l}%, 0.96) 10%`,
                `hsla(${h},${s}%,${l}%, 0.84) 30%`,
                `hsla(${h},${s}%,${l}%, 0.64) 68%`,
                `hsla(${h},${s}%,${l}%, 0.36) 96%`,
                `hsla(${h},${s}%,${l}%, 0) 120%`
            ].join(', ');
            lightDiv.style.background = `radial-gradient(circle farthest-corner at 50% 50%, ${stops})`;
        }
    }

    // 4. 发射器 
    flushMidiDriver();

    requestAnimationFrame(engineLoop);
}