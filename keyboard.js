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
    // 1. 刷新琴键红粉点状态
    for (let i = NOTE_START; i <= NOTE_END; i++) {
        const keyDiv = document.getElementById(`key-${i}`);
        if (!keyDiv) continue;
        if (window.activeNotes.has(i)) {
            keyDiv.classList.add('active-red'); keyDiv.classList.remove('active-pink');
        } else if (window.pedalHeldNotes.has(i)) {
            keyDiv.classList.remove('active-red'); keyDiv.classList.add('active-pink');
        } else {
            keyDiv.classList.remove('active-red'); keyDiv.classList.remove('active-pink');
        }
    }

    const notesArr = Array.from(window.allActiveNotes).sort((a,b) => a - b);
    if (notesArr.length > 0) handleAutoScroll(notesArr);
	

    // ===================================
    // 获取算法数据
    // ===================================
    const textDiv = document.getElementById('pressed-notes');
    const debugTbody = document.getElementById('debug-tbody');
    const chordDisplay = document.getElementById('light-chord-display');
    const keyDisplay = document.getElementById('light-key-display');

    // 调性引擎每时每刻都在运转（具有衰减记忆）
    let scaleData = { bestText: "-", weights: new Array(12).fill(0), scales: [] };
    if (typeof getScaleDebugData === 'function') scaleData = getScaleDebugData();

    // 更新 60/40 调性文本，并检测是否发生转调
    if (scaleData.bestText !== lastRenderedScale && scaleData.bestText !== "-") {
        lastRenderedScale = scaleData.bestText;
        keyDisplay.innerText = scaleData.bestText;
        
        // 【新增】：触发文字闪烁动画
        keyDisplay.classList.remove('flash-highlight-text');
        void keyDisplay.offsetWidth; // 强制重绘
        keyDisplay.classList.add('flash-highlight-text');
    } else {
        keyDisplay.innerText = scaleData.bestText;
    }
	
	

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
                // 第一名显示亮黄色高亮
                let rowStyle = idx === 0 ? "background-color: rgba(255, 235, 59, 0.15); color: #ffeb3b; font-weight: bold;" : "";
                scHtml += `<tr style="${rowStyle}">
                    <td>${idx+1}</td>
                    <td>${s.majorName}大调 / ${s.minorName}小调</td>
                    <td style="color: #ffeb3b;">${s.score.toFixed(3)}</td>
                </tr>`;
            });
        } else {
            scHtml = `<tr><td colspan="3" style="color:#666;">等待弹奏...</td></tr>`;
        }
        document.getElementById('scale-debug-tbody').innerHTML = scHtml;
    }

    // ===================================
    // 和弦渲染与 200ms 防抖颜色下发
    // ===================================
    if (notesArr.length === 0) {
        textDiv.innerHTML = `<div style="height: 100%; display: flex; justify-content: center; align-items: center; color: #666; font-size: 16px;">等待弹奏...</div>`;
        debugTbody.innerHTML = `<tr><td colspan="5" style="color:#666;">等待弹奏...</td></tr>`;
        
        // 关键逻辑 5：无和弦时，清除尚未发出的改色计时器
        // 且【不】重置 lastColoredRoman，这样系统就会停留在上一个和弦的颜色！
        if (chordColorDebounceTimer) {
            clearTimeout(chordColorDebounceTimer);
        }
        chordDisplay.innerText = "-";
        return;
    }

    if (typeof processChordsForLight === 'function') {
        const chordList = processChordsForLight(notesArr);
        if (chordList.length > 0) {
            const primary = chordList[0].original; 
            const baseChordForRoman = chordList[0].classified;
            
            if (typeof checkAndApplyModulation === 'function') {
                checkAndApplyModulation(baseChordForRoman);
            }

            textDiv.innerHTML = `<div style="height: 100%; display: flex; align-items: center; justify-content: center;"><span style="font-size: 32px; font-weight: bold; color: #fff;">${primary}</span></div>`;
            
            // 获取罗马级数
            const roman = getRomanNumeral(baseChordForRoman);
            chordDisplay.innerText = roman;

            // 【关键逻辑 1】：200ms 防抖触发颜色
            // 只有算出来的级数和上一次变色的级数不同，才启动计时器
            if (roman !== lastColoredRoman) {
                if (chordColorDebounceTimer) clearTimeout(chordColorDebounceTimer);
                
                chordColorDebounceTimer = setTimeout(() => {
                    // 200ms 稳定后，确认下发颜色
                    lastColoredRoman = roman;
                    if (typeof applyChordColorByNumeral === 'function') {
                        applyChordColorByNumeral(roman);
                    }
                }, 50);
            }

            // ... [底下的 Debug 表格渲染代码不变] ...
        } else {
            let singleNotes = notesArr.map(n => getSingleNoteName(n)).join(" ");
            textDiv.innerHTML = `<div style="height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px;">${singleNotes}</div>`;
            debugTbody.innerHTML = `<tr><td colspan="5" style="color:#ff5252;">无法识别的音簇</td></tr>`;
            chordDisplay.innerText = "-";
        }
    }
}