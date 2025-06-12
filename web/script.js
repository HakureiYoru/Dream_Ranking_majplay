const cycleHours = 2;
const practiceMinutes = 90;
const progressFill = document.getElementById('progress-fill');
const infoLabel = document.getElementById('info');
const countdownLabel = document.getElementById('countdown');

const SONGS = [
    'Ποσειδών (Poseidon)',
    'Blue Zenith',
    'L9',
    'Brain Power',
    'Garakuta Doll Play',
    'YURUSHITE',
    'Sparkle Dance',
    'System Split'
];

const DIFFICULTIES = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:MASTER'];

const form = document.getElementById('record-form');
const playerInput = document.getElementById('player');
const scoreInput = document.getElementById('score');
const songSelect = document.getElementById('song');
const diffSelect = document.getElementById('difficulty');
const clearBtn = document.getElementById('clear');
const deleteBtn = document.getElementById('delete');
const exportBtn = document.getElementById('export');
const tableBody = document.querySelector('#ranking-table tbody');
let selectedRow = null;

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

function loadRecords() {
    const data = localStorage.getItem('records');
    return data ? JSON.parse(data) : [];
}

function saveRecords(records) {
    localStorage.setItem('records', JSON.stringify(records));
}

function sortRecords(records) {
    records.sort((a, b) => b.score - a.score);
}

function addRecord(playerId, score, song, diff) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const records = loadRecords();
    let replaced = false;
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (r.playerId === playerId && r.song === song) {
            if (score > r.score) {
                records[i] = { playerId, score, song, diff, time: now };
            }
            replaced = true;
            break;
        }
    }
    if (!replaced) {
        records.push({ playerId, score, song, diff, time: now });
    }
    sortRecords(records);
    saveRecords(records);
    return records;
}

function clearRecords() {
    localStorage.removeItem('records');
}

function deleteRecord(index) {
    const records = loadRecords();
    if (index >= 0 && index < records.length) {
        records.splice(index, 1);
        saveRecords(records);
    }
    return records;
}

function renderTable(records) {
    tableBody.innerHTML = '';
    records.forEach((r, idx) => {
        const tr = document.createElement('tr');
        if (selectedRow === idx) {
            tr.classList.add('selected');
        }
        const vals = [idx + 1, r.playerId, r.score.toFixed(2), r.song, r.diff, r.time];
        vals.forEach(v => {
            const td = document.createElement('td');
            td.textContent = v;
            td.classList.add('text-center');
            tr.appendChild(td);
        });
        tr.addEventListener('click', () => {
            selectedRow = idx === selectedRow ? null : idx;
            renderTable(records);
        });
        tableBody.appendChild(tr);
    });
}

function exportCSV() {
    const records = loadRecords();
    let csv = '排名,玩家ID,分数,曲目,难度,时间\n';
    records.forEach((r, i) => {
        csv += `${i + 1},${r.playerId},${r.score.toFixed(2)},${r.song},${r.diff},${r.time}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scores.csv';
    link.click();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    SONGS.forEach(s => {
        const opt = document.createElement('option');
        opt.textContent = s;
        songSelect.appendChild(opt);
    });
    DIFFICULTIES.forEach(d => {
        const opt = document.createElement('option');
        opt.textContent = d;
        diffSelect.appendChild(opt);
    });

    renderTable(loadRecords());

    form.addEventListener('submit', e => {
        e.preventDefault();
        const player = playerInput.value.trim();
        if (!player) return;
        const score = parseFloat(scoreInput.value) || 0;
        const song = songSelect.value;
        const diff = diffSelect.value;
        const records = addRecord(player, score, song, diff);
        selectedRow = null;
        renderTable(records);
        form.reset();
    });

    clearBtn.addEventListener('click', () => {
        if (confirm('确定要清空所有记录吗？')) {
            clearRecords();
            selectedRow = null;
            renderTable([]);
        }
    });

    deleteBtn.addEventListener('click', () => {
        if (selectedRow === null) {
            alert('请先选择要删除的记录');
            return;
        }
        if (confirm('确定要删除所选记录吗？')) {
            const records = deleteRecord(selectedRow);
            selectedRow = null;
            renderTable(records);
        }
    });

    exportBtn.addEventListener('click', exportCSV);

    updateState();
    setInterval(updateState, 10000);
});
