// ==========================================
// 麦克风拾音与动态音量分析引擎 (Audio Engine v3.0)
// 包含：底噪采样校准、自动增益、非对称指数平滑 (Attack-Release 包络)
// ==========================================

let audioContext = null;
let analyser = null;
let microphone = null;

// === 核心状态与阈值 ===
let isCalibrating = false;      
let calibrationSamples = [];    
let noiseFloor = 0;             
let maxVolume = 10;             
let volumeDecayTimer = 0;       

// === 非对称平滑引擎参数 ===
let smoothedVolume = 0.0;       // 平滑处理后的最终音量
const ALPHA_DECAY = 0.9;        // 下降时较慢 (0.7 继承旧值，0.3 用新值)
const BETA_ATTACK = 0.7;        // 上升时极快 (0.3 继承旧值，0.7 用新值)

window.currentAudioVolume = 0.0; 

async function startAudioEngine() {
    if (audioContext) return; 
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 256; 
        // 降低底层 API 自带的平滑，把控制权交给我们的非对称数学模型
        analyser.smoothingTimeConstant = 0.3; 
        
        microphone.connect(analyser);
        
        // 启动底噪校准程序
        isCalibrating = true;
        calibrationSamples = [];
        smoothedVolume = 0.0; // 重置平滑状态
        window.currentAudioVolume = 0.0; 

        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerText = "正在校准环境底噪，请保持安静 1 秒...";
            statusEl.style.color = "#ffeb3b";
        }

        setTimeout(() => {
            isCalibrating = false;
            
            if (calibrationSamples.length > 0) {
                let sum = calibrationSamples.reduce((a, b) => a + b, 0);
                noiseFloor = sum / calibrationSamples.length;
            } else {
                noiseFloor = 5; 
            }

            maxVolume = noiseFloor + 10;

            if (statusEl) {
                statusEl.innerText = "校准完毕！正在监听拾音...";
                statusEl.style.color = "#00e676";
            }
        }, 1000);

        requestAnimationFrame(audioLoop);
        
    } catch (err) {
        console.error("麦克风权限被拒绝:", err);
    }
}

function stopAudioEngine() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        window.currentAudioVolume = 0.0;
        smoothedVolume = 0.0;
        isCalibrating = false;
        maxVolume = 10;
    }
}

function audioLoop() {
    if (!audioContext) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    let rms = Math.sqrt(sum / dataArray.length);

    // ===================================
    // 阶段 A：底噪校准期
    // ===================================
    if (isCalibrating) {
        calibrationSamples.push(rms);
        window.currentAudioVolume = 0.0; 
        requestAnimationFrame(audioLoop);
        return;
    }

    // ===================================
    // 阶段 B：正常运行期
    // ===================================

    // 更新动态最高音量
    if (rms > maxVolume) {
        maxVolume = rms;
        volumeDecayTimer = 0; 
    }

    volumeDecayTimer++;
    if (volumeDecayTimer > 300) { 
        maxVolume = Math.max(noiseFloor + 5, maxVolume * 0.98); 
    }

    // 计算归一化原始音量 (Raw Normalized)
    let rawNormalized = 0.0;
    if (rms > noiseFloor) {
        rawNormalized = (rms - noiseFloor) / (maxVolume - noiseFloor);
    }

    rawNormalized = Math.max(0, Math.min(1, rawNormalized)); 

    if (rawNormalized < 0.05) {
        rawNormalized = 0.0;
    }

    // ===================================
    // 阶段 C：非对称指数平滑算法 (A-R Envelope)
    // ===================================
    if (rawNormalized > smoothedVolume) {
        // Attack (启动期)：数值正在上升，使用较小的 Beta 值，让新数据占据主导 (70% 权重)
        // 效果：迅速亮起，不拖泥带水
        smoothedVolume = smoothedVolume * BETA_ATTACK + rawNormalized * (1 - BETA_ATTACK);
    } else {
        // Release (衰减期)：数值正在下降，使用较大的 Alpha 值，保留较多旧数据 (70% 权重)
        // 效果：下降变得缓慢、粘滞，消除低频闪烁
        smoothedVolume = smoothedVolume * ALPHA_DECAY + rawNormalized * (1 - ALPHA_DECAY);
    }

    // 为了确保归零干净利落，消除最后极其微弱的浮点数残余
    if (smoothedVolume < 0.005) {
        smoothedVolume = 0.0;
    }

    // 最终输出 (保留平方曲线，让明暗对比更富有律动感)
    window.currentAudioVolume = smoothedVolume * smoothedVolume;

    requestAnimationFrame(audioLoop);
}