// ==========================================
// 光学与物理灯光引擎 (Light & Color Engine) - DEBUG 探针版
// ==========================================

const TOP_PADS = [96, 97, 98, 99, 100, 101, 102, 103]; 
const BOTTOM_PADS = [112, 113, 114, 115, 116, 117, 118, 119];

const FADE_DURATION = 500;       
const ANIMATION_TICK = 16;       
const MIDI_SEND_TICK = 33;       
const IDLE_LIGHTNESS = 0; 

let globalPadColors = Array.from({length: 16}, () => ({ h: 0, s: 0, l: 0 }));

window.padLightSources = Array.from({length: 16}, () => ({
    userHSL: { h: 250, s: 100, l: 100 }, 
    envelope: 0 
}));

let lastSentColors = Array.from({length: 16}, () => ({ r: -1, g: -1, b: -1 }));
let colorPicker = null;

let smoothedVolume = 0.0;       
const ALPHA_DECAY = 0.9;        
const BETA_ATTACK = 0.7;        

// === 探针计数器 (防止日志刷屏刷死浏览器) ===
let debugLogCounter = 0;

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

    let sysExSentThisFrame = false;

    for (let i = 0; i < 8; i++) { 
        let color = globalPadColors[i];
        let [r8, g8, b8] = hslToRgb(color.h, color.s, color.l);
        
        let r7 = Math.floor(r8 / 2);
        let g7 = Math.floor(g8 / 2);
        let b7 = Math.floor(b8 / 2);

        if (r7 !== lastSentColors[i].r || g7 !== lastSentColors[i].g || b7 !== lastSentColors[i].b) {
            window.midiOutput.send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x13, 0x01, 0x43, TOP_PADS[i], r7, g7, b7, 0xF7]);
            lastSentColors[i] = { r: r7, g: g7, b: b7 };
            sysExSentThisFrame = true;
        }
    }
    
    // 探针输出：检查 MIDI 是否真的发出去了
    if (sysExSentThisFrame && debugLogCounter % 15 === 0) {
        console.log(`[Driver] 发送了新的 MIDI 灯光指令! Pad1 色彩: H=${globalPadColors[0].h.toFixed(1)}, L=${globalPadColors[0].l.toFixed(1)}`);
    }
}

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

function applyWaveEffect() {
    for (let i = 7; i >= 1; i--) {
        let prevPad = globalPadColors[i - 1];
        let currentPad = globalPadColors[i];
        globalPadColors[i] = interpolateHSL(currentPad, prevPad, 0.6);
    }
}

function initColorPicker() {
    colorPicker = new iro.ColorPicker("#color-picker-container", {
        width: 180, color: "#aa00ff", layout: [ { component: iro.ui.Wheel } ]
    });

    setTimeout(() => {
        if (typeof initTSDOverlay === 'function') initTSDOverlay();
    }, 100);
    
    requestAnimationFrame(engineLoop);
}

function triggerPadLights() {
    window.padLightSources[0].envelope = 1.0; 
}

function forceSendCurrentColorToMidi() {
    triggerPadLights();
}

let lastFrameTime = performance.now();
let lastEngineTick = 0; 
let lastMidiSendTick = 0; 

function engineLoop(currentTime) {
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    debugLogCounter++;

    // ================== 探针 1：钢琴引擎更新 ==================
    if (typeof updateVirtualPianoEngine === 'function') {
        updateVirtualPianoEngine(currentTime);
    } else if (debugLogCounter === 1) {
        console.error("[Error] 找不到 updateVirtualPianoEngine 函数！");
    }

    // ================== 探针 2：音量读取 ==================
    let rawVolume = window.virtualAudioVolume || 0;
    
    // 如果你在弹琴，但控制台里这个数值一直是 0，说明 virtual_piano_engine 挂了
    if (rawVolume > 0 && debugLogCounter % 30 === 0) {
         console.log(`[Engine] 检测到虚拟音量输入: ${rawVolume.toFixed(3)}`);
    }
    
    if (rawVolume > smoothedVolume) {
        smoothedVolume = smoothedVolume * BETA_ATTACK + rawVolume * (1 - BETA_ATTACK);
    } else {
        smoothedVolume = smoothedVolume * ALPHA_DECAY + rawVolume * (1 - ALPHA_DECAY);
    }
    if (smoothedVolume < 0.005) smoothedVolume = 0.0;

    // ================== 探针 3：包络写入 ==================
    let sourcePad = window.padLightSources[0];
    let compressedVolume = Math.pow(smoothedVolume, 0.4);
    sourcePad.envelope = Math.max(0, Math.min(1.0, compressedVolume)); 

    const MAX_LIGHTNESS = 60;
    let currentL = IDLE_LIGHTNESS + (MAX_LIGHTNESS - IDLE_LIGHTNESS) * sourcePad.envelope;
    let currentS = sourcePad.userHSL.s * sourcePad.envelope;
    
	// 正弦波颜色抖动 
    let timeInSeconds = currentTime / 1000.0;
    let hueOffset = (sourcePad.userHSL.s > 0 && currentL > 0) ? Math.sin(timeInSeconds * 2.0 * Math.PI * 0.5) * 8.0 : 0;
    let dynamicHue = (sourcePad.userHSL.h + hueOffset + 360) % 360;

    globalPadColors[0] = { h: dynamicHue, s: currentS, l: currentL };

    let isAnyPadActive = (sourcePad.envelope > 0);
    let forceIdleFlush = false;
    
    if (!window.isRunning) {
        forceIdleFlush = true; 
    } else {
        isAnyPadActive = true; 
    }

    if (currentTime - lastEngineTick >= ANIMATION_TICK) {
        applyWaveEffect();
        lastEngineTick = currentTime;
    }

    for (let i = 0; i < 8; i++) {
        const lightDiv = document.getElementById(`vpad-light-${i}`);
        if(lightDiv) {
            let h = globalPadColors[i].h, s = globalPadColors[i].s, l = globalPadColors[i].l;
            let [r8, g8, b8] = hslToRgb(h, s, l);

            const stops = [
                `rgba(${r8},${g8},${b8}, 1) 0%`,
                `rgba(${r8},${g8},${b8}, 0.96) 10%`,
                `rgba(${r8},${g8},${b8}, 0.84) 30%`,
                `rgba(${r8},${g8},${b8}, 0.64) 68%`,
                `rgba(${r8},${g8},${b8}, 0.36) 96%`,
                `rgba(${r8},${g8},${b8}, 0) 120%`
            ].join(', ');
            lightDiv.style.background = `radial-gradient(circle farthest-corner at 50% 50%, ${stops})`;
        }
    }

    if (window.isRunning && window.midiOutput) {
        if (forceIdleFlush || (isAnyPadActive && currentTime - lastMidiSendTick >= MIDI_SEND_TICK)) {
            flushMidiDriver();
            lastMidiSendTick = currentTime;
        }
    }

    requestAnimationFrame(engineLoop);
}