

// ==========================================
// 调性与灯光和弦识别引擎 (Scale & Chord Engine v4.0)
// 引入: 物理低音音程分析 (Figured Bass Anchor)
// ==========================================

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_SCALE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_SCALE_NAMES = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#'];

function getSingleNoteName(note) {
    return `${PITCH_NAMES[note % 12]}${Math.floor(note / 12) - 2}`;
}

// ================= 1. 新增：低音锚点备选引擎 =================

function getBassAnchorChord(midiNotes) {
    if (!midiNotes || midiNotes.length === 0) return null;
    
    // 获取最低音
    let bassNote = midiNotes[0];
    
    // 判定范围 C0 - E3
    // 假设中央 C(C3) 是 60，那么 C0 是 24，E3 是 64。
    // 如果按之前权重计算的 C2=36，那么 C0=12，E3=52。这里我们采用宽泛限制 64 (E4以内都算作有效左手区)
    // 你可以根据实际弹奏习惯调整这个阈值
    if (bassNote > 64) return null; 
    
    let bassPc = bassNote % 12;
    
    // 找次低音（必须是音名不同的音）
    let secondNote = midiNotes.find(n => n % 12 !== bassPc);
    
    // 规则 (1)：只弹了1个音，或者弹了同名八度，直接返回 5和弦
    if (!secondNote) {
        return { rootPc: bassPc, name: MAJOR_SCALE_NAMES[bassPc] + "5" };
    }
    
    let secondPc = secondNote % 12;
    let interval = (secondPc - bassPc + 12) % 12;
    
    let rootPc = bassPc;
    let suffix = "";

    // 规则 (2)：根据音程推导和弦
    switch (interval) {
        case 1:
        case 2:
            return null; // 弹错了，小二/大二度不构成基础和弦底座
        case 3:
            suffix = "m"; // 小三度 -> 小三和弦
            break;
        case 4:
            suffix = "";  // 大三度 -> 大三和弦
            break;
        case 5:
            rootPc = secondPc; 
            suffix = "5"; // 纯四度 -> 五和弦转位 (如 C+F -> F5)
            break;
        case 6:
            rootPc = (bassPc - 4 + 12) % 12; 
            suffix = "7"; // 增四度 -> 属七和弦 (如 C+F# -> Ab7)
            break;
        case 7:
            suffix = "5"; // 纯五度 -> 五和弦
            break;
        case 8:
            rootPc = (bassPc - 4 + 12) % 12; 
            suffix = "";  // 小六度 -> 大三第一转位 (如 C+Ab -> Ab)
            break;
        case 9:
            rootPc = (bassPc - 3 + 12) % 12; 
            suffix = "m"; // 大六度 -> 小三第一转位 (如 C+A -> Am)
            break;
        case 10:
            // 小七度：属七或小七？检查高音区有没有大三或小三度
            let higherNotes = midiNotes.filter(n => n > 64);
            let hasM3 = higherNotes.some(n => n % 12 === (bassPc + 4) % 12);
            let hasm3 = higherNotes.some(n => n % 12 === (bassPc + 3) % 12);
            if (hasm3 && !hasM3) suffix = "m7";
            else suffix = "7"; // 默认或有大三度，都视为属七
            break;
        case 11:
            suffix = "maj7"; // 大七度 -> 大七和弦
            break;
    }

    return { 
        rootPc: rootPc, 
        name: MAJOR_SCALE_NAMES[rootPc] + suffix 
    };
}

// ================= 2. 和弦置信度与过滤 =================

function evaluateConfidence(chordName, bassMidi) {
    let conf = 1.0; 
    const bassName = Tonal.Midi.midiToNoteName(bassMidi, { pitchClass: true }); 
    
    if (chordName.includes('/')) {
        conf -= 0.1; 
        if (!chordName.endsWith('/' + bassName)) conf -= 0.3;
    } else {
        if (!chordName.startsWith(bassName)) conf -= 0.2; 
    }
    
    if (chordName.match(/[A-Z]m?[0-9]*A/)) conf -= 0.4; 
    
    return Math.max(0.1, conf); 
}

function classifyChord(chordName) {
    let base = chordName.split('/')[0];
    base = base.replace(/[b#][59]/g, '').replace(/b13/g, '').replace(/#11/g, '').replace(/add[0-9]+/g, '');
    const rootMatch = base.match(/^[A-G][#b]?/);
    if (!rootMatch) return chordName; 
    const root = rootMatch[0];
    const suffix = base.substring(root.length); 

    if (suffix.includes('maj') || suffix.includes('M7') || suffix.includes('M9')) return root + 'maj7';
    else if ((suffix.includes('m') || suffix.includes('min')) && suffix.match(/[79]|11|13/)) return root + 'm7';
    else if (suffix.match(/[79]|11|13/)) return root + '7';
    else if (suffix === 'm' || suffix === 'min' || suffix === 'm(maj7)') return root + 'm';
    else return root; 
}

// ================= 3. 核心：双引擎和弦处理 =================

function processChordsForLight(midiNotes) {
    if (midiNotes.length === 0) return [];
    
    // 【新动作 1】：获取物理低音锚点备选和弦
    const bassAnchor = getBassAnchorChord(midiNotes);

    // 如果只弹了 1 个音，直接走备选引擎，绕过 Tonal
    if (midiNotes.length < 2) {
        if (bassAnchor) {
            return [{
                original: bassAnchor.name, confidence: "1.00", length: bassAnchor.name.length,
                score: 5.0, classified: classifyChord(bassAnchor.name)
            }];
        }
        return [];
    }

    let rawResults = new Map();
    let currentNotes = [...midiNotes]; 
    const originalBassMidi = midiNotes[0]; 

    while (currentNotes.length >= 2) {
        let pitchClasses = Array.from(new Set(currentNotes.map(n => Tonal.Midi.midiToNoteName(n, {pitchClass:true}))));
        let bassClass = Tonal.Midi.midiToNoteName(originalBassMidi, {pitchClass:true});
        pitchClasses = pitchClasses.filter(p => p !== bassClass);
        pitchClasses.unshift(bassClass); 

        let tonalResults = Tonal.Chord.detect(pitchClasses);
        tonalResults.forEach(chord => {
            if (!rawResults.has(chord)) {
                let conf = evaluateConfidence(chord, originalBassMidi);
                let pruningPenalty = (midiNotes.length - currentNotes.length) * 0.05;
                conf = Math.max(0.1, conf - pruningPenalty);
                rawResults.set(chord, conf);
            }
        });
        currentNotes.pop();
    }

    let processedList = [];
    rawResults.forEach((conf, chord) => {
        let penalty = 0;
        if (chord.match(/[#b][59]|#11|b13/)) penalty += 0.8;
        if (chord.includes('bb') || chord.includes('##')) penalty += 0.2;

        let score = (conf * 5.0) - penalty; 
        
        // 【新动作 2】：低音锚点奖赏！
        // 如果 Tonal 计算出的和弦，它的根音和我们物理计算出的根音一样，直接奖励 +1.0 分！
        if (bassAnchor) {
            let tChord = Tonal.Chord.get(chord);
            if (tChord && tChord.tonic) {
                // Tonal 的 tonic(比如D#) 和我们的 rootPc(3) 进行音级转换对比
                let tRootPc = Tonal.Note.chroma(tChord.tonic);
                if (tRootPc === bassAnchor.rootPc) {
                    score += 1.0; 
                }
            }
        }

        processedList.push({ 
            original: chord, confidence: conf.toFixed(2), length: chord.length, 
            score: score, classified: classifyChord(chord) 
        });
    });

    processedList.sort((a, b) => b.score - a.score);

    // 【新动作 3】：备胎上位机制
    // 如果 Tonal 全军覆没（比如全被扣成了低分），或者根本没算出结果
    // 只要我们的低音引擎算出来了，强行把它塞进第一名！
    if (bassAnchor && (processedList.length === 0 || processedList[0].score < 2.0)) {
        processedList.unshift({
            original: bassAnchor.name, confidence: "1.00", length: bassAnchor.name.length,
            score: 5.0, classified: classifyChord(bassAnchor.name)
        });
    }

    return processedList;
}

// ... 下方的 调性识别(detectScaleSmart) 和 级数转换(getRomanNumeral) 保持完全不变 ...

// ================= 2. 动态调性识别 =================

// 使用你优化的二进制大调掩码模板
const SCALE_TEMPLATE = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
const SCALE_VECTORS = [];

for (let i = 0; i < 12; i++) {
    let vec = new Array(12).fill(0);
    for (let j = 0; j < 12; j++) {
        vec[(i + j) % 12] = SCALE_TEMPLATE[j];
    }
    SCALE_VECTORS.push({
        // 绑定正确的等音名（消除 D# 大调等）
        rootName: MAJOR_SCALE_NAMES[i], 
        majorName: MAJOR_SCALE_NAMES[i],
        minorName: MINOR_SCALE_NAMES[i],
        vector: vec
    });
}

// 内存中维护的 12 音名动态权重池
let currentPitchWeights = new Array(12).fill(0.0);
let globalScaleRoot = "-"; 

function registerNoteForScale(note) {
    for (let i = 0; i < 12; i++) currentPitchWeights[i] *= 0.5;

    let weight = 2.0 - ((note - 12) / 96.0) * 1.9;
    weight = Math.max(0.1, Math.min(2.0, weight));

    currentPitchWeights[note % 12] += weight;
}

function getScaleDebugData() {
    let totalWeight = currentPitchWeights.reduce((a,b) => a + b, 0);
    
    if (totalWeight < 0.05) {
        globalScaleRoot = "-";
        return { weights: currentPitchWeights, scales: [], bestText: "-" };
    }

    let scaleScores = [];
    for (let i = 0; i < 12; i++) {
        let score = 0;
        for (let j = 0; j < 12; j++) {
            score += currentPitchWeights[j] * SCALE_VECTORS[i].vector[j];
        }
        scaleScores.push({
            majorName: SCALE_VECTORS[i].majorName,
            minorName: SCALE_VECTORS[i].minorName,
            rootName: SCALE_VECTORS[i].rootName,
            score: score
        });
    }

    scaleScores.sort((a, b) => b.score - a.score);
    // 这里提取出的 rootName 就会是 Eb, Bb 这种正确的等音名
    globalScaleRoot = scaleScores[0].rootName; 

    return {
        weights: currentPitchWeights,
        scales: scaleScores,
        bestText: `${scaleScores[0].majorName}大调 / ${scaleScores[0].minorName}小调`
    };
}

// ================= 3. 级数转换与等音纠错 =================

// 辅助函数：将和弦的根音翻转为等音名 (如 Gb 变成 F#)
function getEnharmonicChord(chordName) {
    const rootMatch = chordName.match(/^[A-G][#b]?/);
    if (!rootMatch) return chordName;

    const root = rootMatch[0];
    const suffix = chordName.substring(root.length);

    // 常用等音名映射字典
    const enharmonicMap = {
        'C#': 'Db', 'Db': 'C#',
        'D#': 'Eb', 'Eb': 'D#',
        'F#': 'Gb', 'Gb': 'F#',
        'G#': 'Ab', 'Ab': 'G#',
        'A#': 'Bb', 'Bb': 'A#',
        'E#': 'F',  'F': 'E#', 
        'B#': 'C',  'C': 'B#'
    };

    if (enharmonicMap[root]) {
        return enharmonicMap[root] + suffix;
    }
    return chordName;
}

// 核心级数翻译函数
function getRomanNumeral(chordName) {
    if (globalScaleRoot === "-") return chordName; // 还没算出调性时，原样输出和弦名

    try {
        // 第一轮常规翻译
        const romanArr = Tonal.Progression.toRomanNumerals(globalScaleRoot, [chordName]);
        let roman = (romanArr && romanArr.length > 0) ? romanArr[0] : "";

        // 【核心补丁】：如果发现翻译出来含有重降(bb)或重升(##)，说明拼写方向反了
        if (roman.includes('bb') || roman.includes('##')) {
            // 将和弦翻转为等音名，比如 Gbm 翻转为 F#m
            const flippedChord = getEnharmonicChord(chordName);
            
            // 用翻转后的和弦再翻译一次
            const romanArr2 = Tonal.Progression.toRomanNumerals(globalScaleRoot, [flippedChord]);
            let roman2 = (romanArr2 && romanArr2.length > 0) ? romanArr2[0] : "";
            
            // 如果第二次翻译的结果变正常了，就采用第二次的结果
            if (roman2 && !roman2.includes('bb') && !roman2.includes('##')) {
                return roman2;
            }
        }

        if (roman !== "") return roman;
    } catch(e) {}
    
    return chordName; // 翻译彻底失败时回退为原名
}