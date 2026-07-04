// ==========================================
// 核心引擎：智能和弦检测 (降维 + 修剪 + 惩罚)
// 依赖：Tonal.js (全局变量 Tonal)
// ==========================================

function getSingleNoteName(note) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${noteNames[note % 12]}${Math.floor(note / 12) - 2}`;
}

function evaluateChord(chordName, bassMidi) {
    let score = 1.0; 
    const bassName = Tonal.Midi.midiToNoteName(bassMidi, { pitchClass: true }); 
    if (chordName.includes('/')) {
        score -= 0.1; 
        if (!chordName.endsWith('/' + bassName)) score -= 0.4;
    } else {
        if (!chordName.startsWith(bassName)) score -= 0.3; 
    }
    if (chordName.match(/[A-Z]m?[0-9]*A/)) score -= 0.5; 
    if (chordName.includes('bb') || chordName.includes('##') || chordName.includes('b6')) score -= 0.2;
    if (chordName.includes('b9') || chordName.includes('#11')) score -= 0.15;
    return Math.max(0, parseFloat(score.toFixed(2))); 
}

function detectChordSmart(midiNotes) {
    if (midiNotes.length === 0) return [];
    if (midiNotes.length === 1) return [{ name: getSingleNoteName(midiNotes[0]), score: 1.0 }];

    let results = [];
    let currentNotes = [...midiNotes]; 
    const originalBassMidi = midiNotes[0]; 

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

    const bassName = Tonal.Midi.midiToNoteName(originalBassMidi, { pitchClass: true }); 
    const intervals = Array.from(new Set(midiNotes.map(n => (n - originalBassMidi) % 12))).sort((a,b)=>a-b);
    const signature = intervals.join(','); 

    const CUSTOM_CHORDS = {
        "0,7,11": "maj7(omit3)", "0,2,7,11": "maj9(omit3)", "0,7,10": "7(omit3)",
        "0,4,11": "maj7(omit5)", "0,3,10": "m7(omit5)", "0,8": "aug(omit3)",
        "0,6": "dim(omit3)", "0,7": "5"
    };

    if (CUSTOM_CHORDS[signature]) {
        let dictName = bassName + CUSTOM_CHORDS[signature];
        let existing = results.find(r => r.name === dictName);
        if (existing) existing.score = 0.95;
        else results.push({ name: dictName, score: 0.95 });
    }

    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const isPowerA = a.name.endsWith('5') && a.name.length <= 3;
        const isPowerB = b.name.endsWith('5') && b.name.length <= 3;
        if (isPowerA !== isPowerB) return isPowerA ? 1 : -1; 
        return a.name.length - b.name.length;
    });

    if (results.length === 0 || results[0].score < 0.4) {
        return [{ name: midiNotes.map(getSingleNoteName).join(" "), score: 0.0 }];
    }
    return results;
}

