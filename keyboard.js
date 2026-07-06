// ==========================================
// 虚拟钢琴键盘与 UI 渲染引擎 (Keyboard UI Engine)
// 负责：虚拟 Pad 生成、尺寸计算、DOM 生成、状态更新(红/粉点)、智能滚动
// ==========================================

const NOTE_START = 24; // 渲染起点 C0
const NOTE_END = 96;   // 渲染终点 C6
const VISIBLE_WHITE_KEYS = 21; // 屏幕可视白键数 (3个八度)
let lastRenderedScale = "-"; // 用于记录上一次显示的调性
// 在函数外部（全局）声明防抖计时器和状态记忆
let chordColorDebounceTimer = null;
let lastColoredRoman = "";

// ================= 1. 初始化 16 个虚拟 Pad =================
function initPadMatrixDOM() {
    const matrix = document.getElementById('pad-matrix');
    if (!matrix) return;
    matrix.innerHTML = '';
    
    // 生成上下两排，共16个虚拟Pad
    for(let i = 0; i < 16; i++) {
        const pad = document.createElement('div');
        pad.className = 'v-pad';
        
        const light = document.createElement('div');
        light.className = 'v-pad-light';
        light.id = `vpad-light-${i}`; 
        
        pad.appendChild(light);
        matrix.appendChild(pad);
    }
}

// 工具：计算在 21 个白键视野中，当前音符排在第几个白键的位置
function getWhiteKeyIndex(note) {
    const offsets = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; 
    return Math.floor((note - 24) / 12) * 7 + offsets[(note - 24) % 12];
}

// ================= 2. 核心计算：物理像素自适应 =================
function calculateAndInjectDimensions() {
    const wrapper = document.getElementById('keyboard-wrapper');
    if(!wrapper) return;
    
    // 钢琴键盘宽度比例计算
    const wkWidth = wrapper.clientWidth / VISIBLE_WHITE_KEYS;
    document.documentElement.style.setProperty('--wk-width', `${wkWidth}px`);
    document.documentElement.style.setProperty('--bk-width', `${wkWidth * 0.65}px`);
    document.documentElement.style.setProperty('--bk-margin', `-${wkWidth * 0.325}px`);

    // Pad 阵列间隙比例计算
    const matrix = document.getElementById('pad-matrix');
    if(matrix && matrix.clientWidth) {
        const padGap = matrix.clientWidth / 71;
        document.documentElement.style.setProperty('--pad-gap', `${padGap}px`);
    }
}

// ================= 3. 初始化 73 键钢琴 DOM =================
function initKeyboardDOM() {
    const keyboardDiv = document.getElementById('keyboard');
    if (!keyboardDiv) return;
    keyboardDiv.innerHTML = '';
    
    calculateAndInjectDimensions();

    for (let i = NOTE_START; i <= NOTE_END; i++) { 
        const keyDiv = document.createElement('div'); 
        keyDiv.id = `key-${i}`;
        // 黑白键判断
        keyDiv.className = [1, 3, 6, 8, 10].includes(i % 12) ? 'key black-key' : 'key white-key';
        
        // 状态点容器 (红点/粉点共用)
        const dot = document.createElement('div'); 
        dot.className = 'dot';
        
        keyDiv.appendChild(dot); 
        keyboardDiv.appendChild(keyDiv);
    }
    
    // 初始化时滚动到 C2 (音符 48)
    const wrapper = document.getElementById('keyboard-wrapper');
    const wkWidth = parseFloat(document.documentElement.style.getPropertyValue('--wk-width'));
    setTimeout(() => wrapper.scrollLeft = getWhiteKeyIndex(48) * wkWidth, 50);
}

// 监听屏幕尺寸变化
window.addEventListener('resize', calculateAndInjectDimensions);

// ================= 4. 智能跟踪滚动 =================
function handleAutoScroll(notesArray) {
    if (notesArray.length === 0) return;
    const wrapper = document.getElementById('keyboard-wrapper');
    const wkWidth = parseFloat(document.documentElement.style.getPropertyValue('--wk-width'));
    if (!wkWidth) return;
    
    const minVisibleWk = wrapper.scrollLeft / wkWidth;
    const maxVisibleWk = minVisibleWk + VISIBLE_WHITE_KEYS - 1; 
    
    const lowestWk = getWhiteKeyIndex(notesArray[0]);
    const highestWk = getWhiteKeyIndex(notesArray[notesArray.length - 1]);

    // 规则 1：优先保证低音在视野内
    if (lowestWk < minVisibleWk) {
        wrapper.scrollTo({ left: lowestWk * wkWidth, behavior: 'smooth' });
    } 
    // 规则 2：如果高音越界，往右拉
    else if (highestWk > maxVisibleWk) {
        let targetScroll = (highestWk - VISIBLE_WHITE_KEYS + 1) * wkWidth;
        if ((targetScroll / wkWidth) > lowestWk) targetScroll = lowestWk * wkWidth; 
        wrapper.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
}


function refreshKeyboardUI() {
    // 1. 刷新 73 个琴键的视觉状态
    for (let i = NOTE_START; i <= NOTE_END; i++) {
        const keyDiv = document.getElementById(`key-${i}`);
        if (!keyDiv) continue;

        if (window.activeNotes.has(i)) {
            keyDiv.classList.add('active-red');
            keyDiv.classList.remove('active-pink');
        } else if (window.pedalHeldNotes.has(i)) {
            keyDiv.classList.remove('active-red');
            keyDiv.classList.add('active-pink');
        } else {
            keyDiv.classList.remove('active-red');
            keyDiv.classList.remove('active-pink');
        }
    }

    const notesArr = Array.from(window.allActiveNotes).sort((a,b) => a - b);
    if (notesArr.length > 0) handleAutoScroll(notesArr);

    const textDiv = document.getElementById('pressed-notes');
    const debugTbody = document.getElementById('debug-tbody');
    const chordDisplay = document.getElementById('light-chord-display');
    const keyDisplay = document.getElementById('light-key-display');

    // 2. 调性引擎渲染 (实时)
    let scaleData = { bestText: "-", weights: new Array(12).fill(0), scales: [] };
    if (typeof getScaleDebugData === 'function') scaleData = getScaleDebugData();
    keyDisplay.innerText = scaleData.bestText;

    // 渲染调性 Debug 面板
    if (document.getElementById('pitch-weights-row')) {
        const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let wHtml = "";
        for(let i=0; i<12; i++){
            wHtml += `<div style="display:flex; flex-direction:column; align-items:center; width: 8%;">
                <span style="color:#aaa;">${PITCH_NAMES[i]}</span>
                <span style="color:#00d2ff; font-weight:bold;">${scaleData.weights[i].toFixed(2)}</span>
            </div>`;
        }
        document.getElementById('pitch-weights-row').innerHTML = wHtml;

        let scHtml = "";
        if (scaleData.scales.length > 0) {
            scaleData.scales.forEach((s, idx) => {
                let rowStyle = idx === 0 ? "background-color: rgba(255, 235, 59, 0.15); color: #ffeb3b; font-weight: bold;" : "";
                scHtml += `<tr style="${rowStyle}"><td>${idx+1}</td><td>${s.majorName}大调 / ${s.minorName}小调</td><td style="color: #ffeb3b;">${s.score.toFixed(3)}</td></tr>`;
            });
        } else {
            scHtml = `<tr><td colspan="3" style="color:#666;">等待弹奏...</td></tr>`;
        }
        document.getElementById('scale-debug-tbody').innerHTML = scHtml;
    }

    // 3. 和弦 UI 渲染 (空状态处理)
    if (notesArr.length === 0) {
        textDiv.innerHTML = `
            <div style="height: 60%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px;">
                <span style="color:#666; font-size:16px;">等待弹奏...</span>
            </div>
            <div style="height: 40%;"></div>
        `;
        debugTbody.innerHTML = `<tr><td colspan="5" style="color:#666;">等待弹奏...</td></tr>`;
        chordDisplay.innerText = "-";
        
        if (typeof checkAndApplyModulation === 'function') checkAndApplyModulation("");
        return;
    }

    // 4. 和弦识别与渲染 (实体状态)
    if (typeof processChordsForLight === 'function') {
        const chordList = processChordsForLight(notesArr);
        
        if (chordList.length > 0) {
            const primary = chordList[0].original; 
            const primaryRootMatch = primary.match(/^[A-G][#b]?/);
            const primaryRoot = primaryRootMatch ? primaryRootMatch[0] : "";
            
            const baseChordForRoman = chordList[0].classified;
            
            // 【核心规则新增】：提取备选和弦，但如果根音和首选一致，则抛弃！
            let secondaryHtml = "";
            if (chordList.length > 1) {
                const secondary = chordList[1].original;
                const secondaryRootMatch = secondary.match(/^[A-G][#b]?/);
                const secondaryRoot = secondaryRootMatch ? secondaryRootMatch[0] : "";
                
                // 只有当备选和弦存在，且根音和首选不同时，才显示！
                if (secondaryRoot !== primaryRoot) {
                    secondaryHtml = `
                        <span style="font-size: 12px; color: rgba(255,255,255,0.3); margin-right: 8px; font-weight: normal;">OR</span>
                        <span style="font-size: 18px; color: #ccc; font-weight: bold;">${secondary}</span>
                    `;
                }
            }
            
            // 无论有没有备选和弦，60/40 的结构写死，绝对不跳动上下居中
            textDiv.innerHTML = `
                <div style="height: 60%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px;">
                    <span style="font-size: 32px; font-weight: bold; color: #fff;">${primary}</span>
                </div>
                <div style="height: 40%; display: flex; align-items: baseline; justify-content: center; padding-top: 2px;">
                    ${secondaryHtml}
                </div>
            `;
            
            if (typeof checkAndApplyModulation === 'function') {
                checkAndApplyModulation(baseChordForRoman);
            }

            const roman = getRomanNumeral(baseChordForRoman);
            chordDisplay.innerText = roman;

            // 渲染底部 Debug 表格 (实时)
            let trHtml = "";
            chordList.forEach((item, index) => {
                let rowClass = index === 0 ? "top-score" : "";
                trHtml += `<tr class="${rowClass}">
                    <td>${item.original}</td>
                    <td>${item.confidence}</td>
                    <td>${item.length}</td>
                    <td style="color: #d500f9;">${item.score.toFixed(3)}</td>
                    <td style="color: #00e676;">${item.classified}</td>
                </tr>`;
            });
            debugTbody.innerHTML = trHtml;

            // ===================================
            // 5. 【灯光颜色下发】：严格的 30ms 防抖
            // ===================================
            if (roman !== lastColoredRoman) {
                if (chordColorDebounceTimer) clearTimeout(chordColorDebounceTimer);
                
                chordColorDebounceTimer = setTimeout(() => {
                    lastColoredRoman = roman;
                    if (typeof applyChordColorByNumeral === 'function') {
                        applyChordColorByNumeral(roman);
                    }
                }, 30);
            }

        } else {
            // 【核心修改】：失败回退时（比如单音），什么都不显示，保持 60/40 的空壳结构
            textDiv.innerHTML = `
                <div style="height: 60%; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px;">
                    <span style="color:#666; font-size:16px;">等待和弦...</span>
                </div>
                <div style="height: 40%;"></div>
            `;
            debugTbody.innerHTML = `<tr><td colspan="5" style="color:#ff5252;">单音或无法识别</td></tr>`;
            chordDisplay.innerText = "-";
            
            if (typeof checkAndApplyModulation === 'function') checkAndApplyModulation("");
        }
    }
}