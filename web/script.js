const cycleHours = 2;
const practiceMinutes = 90;
const progressFill = document.getElementById('progress-fill');
const infoLabel = document.getElementById('info');
const countdownLabel = document.getElementById('countdown');

function getCurrentCycleRange(now = new Date()) {
    const startHour = Math.floor(now.getHours() / cycleHours) * cycleHours;
    const start = new Date(now);
    start.setHours(startHour, 0, 0, 0);
    if (start > now) {
        start.setHours(start.getHours() - cycleHours);
    }
    const end = new Date(start.getTime() + cycleHours * 3600 * 1000);
    return { start, end };
}

function getCurrentPhase(now = new Date()) {
    const { start } = getCurrentCycleRange(now);
    const challengeStart = new Date(start.getTime() + practiceMinutes * 60 * 1000);
    if (now >= challengeStart) {
        return { phase: 'challenge', warning: false };
    }
    const warning = challengeStart - now <= 5 * 60 * 1000;
    return { phase: 'practice', warning };
}

function getTimeRemaining(now = new Date()) {
    const { start, end } = getCurrentCycleRange(now);
    const challengeStart = new Date(start.getTime() + practiceMinutes * 60 * 1000);
    if (now < challengeStart) {
        return challengeStart - now;
    }
    return end - now;
}

function updateState() {
    const now = new Date();
    const { start, end } = getCurrentCycleRange(now);
    const total = end - start;
    const progress = (now - start) / total;
    progressFill.style.width = Math.min(Math.max(progress, 0), 1) * 100 + '%';

    const { phase, warning } = getCurrentPhase(now);
    const remaining = getTimeRemaining(now);

    progressFill.classList.remove('pulse');
    if (phase === 'challenge') {
        progressFill.style.backgroundColor = '#0d6efd';
        infoLabel.textContent = '🎯 正在打榜中！快来挑战排行榜！';
    } else {
        progressFill.style.backgroundColor = warning ? '#ffc107' : '#6c757d';
        infoLabel.textContent = warning ? '⚠️ 打榜即将开始' : '自由练习时间';
        if (warning) {
            progressFill.classList.add('pulse');
        }
    }

    const seconds = Math.max(Math.floor(remaining / 1000), 0);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (phase === 'challenge') {
        countdownLabel.textContent = `本轮打榜剩余时间：${timeStr}`;
    } else {
        countdownLabel.textContent = `距离本轮打榜开始还有 ${timeStr}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateState();
    setInterval(updateState, 10000);
});
