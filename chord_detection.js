// ==========================================
// 核心引擎：智能和弦检测 (降维 + 修剪 + 惩罚)
// 依赖：Tonal.js (全局变量 Tonal)
// ==========================================

// 获取单音名称
function getSingleNoteName(note) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${noteNames[note % 12]}${Math.floor(note / 12) - 2}`;
}

// 置信度打分引擎
function evaluateChord(chordName, bassMidi) {
    let score = 1.0; 
    const bassName = Tonal.Midi.midiToNoteName(bassMidi, { pitchClass: true }); 

    // 1. 转位惩罚
    if (chordName.includes('/')) {
        score -= 0.1; 
        if (!chordName.endsWith('/' + bassName)) score -= 0.4;
    } else {
        if (!chordName.startsWith(bassName)) score -= 0.3; 
    }

    // 2. 严惩“科学怪人和弦”
    if (chordName.match(/[A-Z]m?[0-9]*A/)) score -= 0.5; 

    // 3. 奇葩降号/升号/冷门后缀惩罚
    if (chordName.includes('bb') || chordName.includes('##') || chordName.includes('b6')) score -= 0.2;
    if (chordName.includes('b9') || chordName.includes('#11')) score -= 0.15;

    return Math.max(0, parseFloat(score.toFixed(2))); 
}

// 主检测接口
function detectChordSmart(midiNotes) {
    if (midiNotes.length === 0) return [];
    if (midiNotes.length === 1) return [{ name: getSingleNoteName(midiNotes[0]), score: 1.0 }];

    let results = [];
    let currentNotes = [...midiNotes]; 
    const originalBassMidi = midiNotes[0]; 

    // 阶段 1：高音修剪探测循环
    while (currentNotes.length >= 2) {
        let pitchClasses = Array.from(new Set(currentNotes.map(n => Tonal.Midi.midiToNoteName(n, {pitchClass:true}))));
        let bassClass = Tonal.Midi.midiToNoteName(originalBassMidi, {pitchClass:true});
        pitchClasses = pitchClasses.filter(p => p !== bassClass);
        pitchClasses.unshift(bassClass); 

        let tonalResults = Tonal.Chord.detect(pitchClasses);
        tonalResults.forEach(chord => {
            let s = evaluateChord(chord, originalBassMidi);
            let pruningPenalty = (midiNotes.length - currentNotes.length) * 0.05;
            s = Math.max(0, s - pruningPenalty);

            if (!results.find(r => r.name === chord)) results.push({ name: chord, score: parseFloat(s.toFixed(2)) });
        });

        currentNotes.pop();
    }

    // 阶段 2：黑字典终极拦截
    const bassName = Tonal.Midi.midiToNoteName(originalBassMidi, { pitchClass: true }); 
    const intervals = Array.from(new Set(midiNotes.map(n => (n - originalBassMidi) % 12))).sort((a,b)=>a-b);
    const signature = intervals.join(','); 

    const CUSTOM_CHORDS = {
        "0,7,11": "maj7(omit3)",
        "0,2,7,11": "maj9(omit3)",
        "0,7,10": "7(omit3)",
        "0,4,11": "maj7(omit5)",
        "0,3,10": "m7(omit5)",
        "0,8": "aug(omit3)",
        "0,6": "dim(omit3)",
        "0,7": "5"
    };

    if (CUSTOM_CHORDS[signature]) {
        let dictName = bassName + CUSTOM_CHORDS[signature];
        let existing = results.find(r => r.name === dictName);
        if (existing) existing.score = 0.95;
        else results.push({ name: dictName, score: 0.95 });
    }

    // 阶段 3：多级排序规则 (解决同分情况)
    results.sort((a, b) => {
        // 规则一：置信度高的排前面
        if (b.score !== a.score) return b.score - a.score;
        
        // 规则二：同分情况下，优先排除 5和弦 (如 C5, F#5)
        // 判断是否为五和弦：以 '5' 结尾，且长度 <= 3 
        const isPowerA = a.name.endsWith('5') && a.name.length <= 3;
        const isPowerB = b.name.endsWith('5') && b.name.length <= 3;
        if (isPowerA !== isPowerB) return isPowerA ? 1 : -1; // A是五和弦，A排后面

        // 规则三：都非五和弦时，字符串长度短的排前面 (如 Cmaj9 优先于 Cmaj9(omit3))
        return a.name.length - b.name.length;
    });

    // 如果所有的猜测分数都很低 (小于 0.4)，退回单音显示
    if (results.length === 0 || results[0].score < 0.4) {
        return [{ name: midiNotes.map(getSingleNoteName).join(" "), score: 0.0 }];
    }

    return results;
}