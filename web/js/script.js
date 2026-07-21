const cycleMinutes = 60;
const practiceMinutes = 90;
const cycleHours = 1; // 添加缺失的变量

const CHALLENGE_SONGS = [
    { title: 'Sempre Vivacissimo', artist: 'Polymath9', cover: 'cover1.png' },
    { title: 'AYO WTF', artist: 'Normal1zer as "Art Of Kickz"', cover: 'cover2.png' },
];

const SONGS = CHALLENGE_SONGS.map(s => s.title);
const SONG_SET = new Set(SONGS);

const DIFFICULTIES = ['Expert', 'Master'];

// DOM元素获取（页面加载后再获取）
let form, playerInput, scoreInput, songSelect, diffSelect;
let clearBtn, exportBtn;
let floatingBtn, modal, modalMask, modalClose;
let apCheckbox, fcCheckbox;

function initializeElements() {
    form = document.getElementById('record-form');
    playerInput = document.getElementById('player');
    scoreInput = document.getElementById('score');
    songSelect = document.getElementById('song');
    diffSelect = document.getElementById('difficulty');
    clearBtn = document.getElementById('clear');
    exportBtn = document.getElementById('export');
    
    floatingBtn = document.getElementById('floating-form-btn');
    modal = document.getElementById('fantasy-modal');
    modalMask = document.getElementById('fantasy-modal-mask');
    modalClose = document.getElementById('fantasy-modal-close');
    
    apCheckbox = document.getElementById('ap-checkbox');
    fcCheckbox = document.getElementById('fc-checkbox');
    
    // 绑定事件
    if (floatingBtn) floatingBtn.addEventListener('click', openModal);
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalMask) modalMask.addEventListener('click', closeModal);
}

function getCurrentHourCycle(now = new Date()) {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + cycleMinutes * 60 * 1000);
    if (now < start) {
        start.setHours(start.getHours() - 1);
        end.setHours(end.getHours() - 1);
    }
    return { start, end };
}

function getHourTimeRemaining(now = new Date()) {
    const { end } = getCurrentHourCycle(now);
    return end - now;
}

function updateFantasyCountdown() {
    const fantasyCountdown = document.getElementById('fantasy-countdown');
    if (!fantasyCountdown) return;
    
    const now = new Date();
    const remaining = getHourTimeRemaining(now);
    let seconds = Math.max(Math.floor(remaining / 1000), 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    fantasyCountdown.textContent = timeStr;
    fantasyCountdown.style.removeProperty('background');
    fantasyCountdown.style.removeProperty('-webkit-background-clip');
    fantasyCountdown.style.removeProperty('-webkit-text-fill-color');
}

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

function getCurrentCycleKey(date = new Date()) {
    // 例如 2024-06-13-09
    const { start } = getCurrentCycleRange(date);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const h = String(start.getHours()).padStart(2, '0');
    return `${y}-${m}-${d}-${h}`;
}

function loadRecords() {
    const data = localStorage.getItem('records');
    const records = data ? JSON.parse(data) : [];
    return records.filter(r => SONG_SET.has(r.song));
}

function sanitizeRecords() {
    const data = localStorage.getItem('records');
    if (!data) return;
    const records = JSON.parse(data);
    const filtered = records.filter(r => SONG_SET.has(r.song));
    if (filtered.length !== records.length) {
        saveRecords(filtered);
        backupAllRecords();
    }
}

function saveRecords(records) {
    localStorage.setItem('records', JSON.stringify(records));
}

function sortRecords(records) {
    records.sort((a, b) => b.score - a.score);
}

function backupAllRecords() {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('records-') && k !== 'records-backup') {
            all[k] = localStorage.getItem(k);
        }
    }
    localStorage.setItem('records-backup', JSON.stringify(all));
}

function addRecord(playerId, score, song, diff, ap, fc) {
    if (!SONG_SET.has(song)) {
        alert('无效的曲目');
        return loadRecords();
    }
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const records = loadRecords();
    let replaced = false;
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        // 修改判断逻辑：同一玩家的同一首歌的同一难度才会覆盖
        if (r.playerId === playerId && r.song === song && r.diff === diff) {
            if (score > r.score) {
                records[i] = { playerId, score, song, diff, ap, fc, time: now };
            }
            replaced = true;
            break;
        }
    }
    if (!replaced) {
        records.push({ playerId, score, song, diff, ap, fc, time: now });
    }
    sortRecords(records);
    saveRecords(records);
    backupAllRecords();
    // 更新显示
    renderCycleInfo();
    renderRankingTables();
    renderTop1s();
    renderTotalTop1();
    return records;
}

function clearRecords() {
    console.log('开始清空记录');
    backupAllRecords();
    localStorage.removeItem('records');
    console.log('记录已清空');
}

function deleteRecord(targetRecord) {
    const records = loadRecords();
    console.log('删除前的记录数量:', records.length);
    console.log('要删除的记录:', targetRecord);
    
    // 通过记录的所有属性匹配来找到要删除的记录
    const indexToDelete = records.findIndex(r => 
        r.playerId === targetRecord.playerId && 
        r.song === targetRecord.song && 
        r.diff === targetRecord.diff &&
        r.score === targetRecord.score &&
        r.time === targetRecord.time
    );
    
    if (indexToDelete !== -1) {
        const deleted = records.splice(indexToDelete, 1);
        console.log('已删除的记录:', deleted);
        saveRecords(records);
        backupAllRecords();
        console.log('删除后的记录数量:', records.length);
    } else {
        console.log('未找到要删除的记录');
    }
    return records;
}

function formatTimeOnly(value) {
    if (!value) return '';
    const match = String(value).match(/(\d{2}:\d{2}:\d{2})/);
    return match ? match[1] : String(value);
}

function renderTable(records, tableBody) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (records.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'ranking-empty';
        td.textContent = '暂无记录';
        tr.appendChild(td);
        tableBody.appendChild(tr);
        return;
    }
    records.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.title = `提交时间：${r.time}`;
        const vals = [idx + 1, r.playerId, r.score.toFixed(2), r.diff];
        const colClasses = ['rank-col', 'player-col', 'score-col', 'diff-col'];
        vals.forEach((v, colIdx) => {
            const td = document.createElement('td');
            td.classList.add('text-center', colClasses[colIdx]);
            
            // 分数栏特殊处理：添加垃圾桶图标
            if (colIdx === 2) {
                const scoreContainer = document.createElement('div');
                scoreContainer.className = 'score-container';
                
                const scoreSpan = document.createElement('span');
                scoreSpan.textContent = v;
                scoreSpan.className = 'score-text';
                if (r.ap) scoreSpan.classList.add('score-ap');
                else if (r.fc) scoreSpan.classList.add('score-fc');
                
                const deleteIcon = document.createElement('span');
                deleteIcon.innerHTML = '🗑️';
                deleteIcon.className = 'delete-icon';
                deleteIcon.onclick = (e) => {
                    e.stopPropagation();
                    console.log('删除按钮被点击，记录:', r);
                    if (confirm('确定要删除这条记录吗？')) {
                        console.log('用户确认删除');
                        const updatedRecords = deleteRecord(r);
                        console.log('删除后的记录:', updatedRecords);
                        renderRankingTables();
                        renderTop1s();
                        renderTotalTop1();
                    }
                };
                
                scoreContainer.appendChild(scoreSpan);
                scoreContainer.appendChild(deleteIcon);
                td.appendChild(scoreContainer);
            } else {
                td.textContent = v;
                if (colIdx === 1) {
                    td.title = r.playerId;
                }
                // 为难度列添加特殊样式
                if (colIdx === 3) { // 难度列
                    if (v === 'Master') {
                        td.classList.add('diff-master');
                    } else if (v === 'Expert') {
                        td.classList.add('diff-expert');
                    }
                }
            }
            
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

function renderRankingTables() {
    SONGS.forEach((song, idx) => {
        const tableBody = document.querySelector(`#ranking-table-${idx} tbody`);
        renderTable(getFilteredRecords(song), tableBody);
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

function setupDifficulty() {
    if (!diffSelect) return;
    diffSelect.value = 'Master';
}

function setupDefaultScore() {
    if (!scoreInput) return;
    scoreInput.value = '100.5';
}

function getTop1s() {
    const records = loadRecords();
    const tops = SONGS.map(song => {
        const songRecords = records.filter(r => r.song === song);
        if (songRecords.length === 0) return null;
        
        // 按调整后的分数排序（Expert * 0.98）
        const adjustedRecords = songRecords.map(r => ({
            ...r,
            adjustedScore: r.diff === 'Expert' ? r.score * 0.98 : r.score
        }));
        
        // 按调整后的分数排序，选择最高的
        adjustedRecords.sort((a, b) => b.adjustedScore - a.adjustedScore);
        
        // 返回原始记录（不含adjustedScore字段）
        const topRecord = adjustedRecords[0];
        return {
            playerId: topRecord.playerId,
            score: topRecord.score,
            song: topRecord.song,
            diff: topRecord.diff,
            ap: topRecord.ap,
            fc: topRecord.fc,
            time: topRecord.time
        };
    });
    return tops;
}

function renderTop1s() {
    const tops = getTop1s();
    
    tops.forEach((r, idx) => {
        const song = CHALLENGE_SONGS[idx];
        const el = document.getElementById(`top1-${idx}`);
        if (!el) return;
        
        const coverHtml = `<div class='top1-cover'>
            <img src="assets/${song.cover}" alt="${song.title} Cover" class="cover-image" />
        </div>`;
        
        if (!r) {
            el.innerHTML = `${coverHtml}
                <div class="top1-content">
                    <div class='top1-title'>${song.title}</div>
                    <div class='top1-artist'>${song.artist}</div>
                    <div class='top1-empty'>暂无记录</div>
                </div>`;
        } else {
            el.innerHTML = `${coverHtml}
                <div class="top1-content">
                    <div class='top1-title'>${song.title}</div>
                    <div class='top1-artist'>${song.artist}</div>
                    <div class='top1-score'>${r.score.toFixed(2)}</div>
                    <div class='top1-player'>${r.playerId}</div>
                    <div class='top1-diff'>${r.diff}</div>
                    <div class='top1-time'>${formatTimeOnly(r.time)}</div>
                </div>`;
            
            // 为难度元素添加样式类
            const diffElement = el.querySelector('.top1-diff');
            if (diffElement && r.diff === 'Master') {
                diffElement.classList.add('diff-master');
            } else if (diffElement && r.diff === 'Expert') {
                diffElement.classList.add('diff-expert');
            }
        }
    });
}

function setupSongSelect() {
    if (!songSelect) return;
    songSelect.innerHTML = '';
    SONGS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        songSelect.appendChild(opt);
    });
}

function getFilteredRecords(song = null) {
    const records = loadRecords();
    
    return records.filter(r => {
        const songMatch = !song || r.song === song;
        return songMatch;
    });
}

function openModal() {
    if (!modal || !modalMask) return;
    modal.style.display = '';
    modalMask.style.display = '';
    
    setupSongSelect();
    setupDifficulty();
    setupDefaultScore();

    // 解绑所有事件，防止重复绑定
    if (form) form.onsubmit = null;
    if (clearBtn) clearBtn.onclick = null;
    if (exportBtn) exportBtn.onclick = null;

    if (form) {
        form.onsubmit = e => {
            e.preventDefault();
            const player = playerInput.value.trim();
            if (!player) {
                alert('请输入玩家ID');
                return;
            }
            const score = parseFloat(scoreInput.value);
            if (isNaN(score) || score < 0 || score > 101) {
                alert('请输入有效的分数（0-101）');
                return;
            }
            const song = songSelect.value;
            const diff = diffSelect.value;
            const ap = apCheckbox.checked;
            const fc = fcCheckbox.checked;
            const records = addRecord(player, score, song, diff, ap, fc);
            renderRankingTables();
            renderTop1s();
            renderTotalTop1();
            form.reset();
            setupDifficulty();
            setupDefaultScore();
            closeModal();
        };
    }
    
    if (clearBtn) {
        clearBtn.onclick = () => {
            console.log('模态框清空按钮被点击');
            if (confirm('确定要清空所有记录吗？')) {
                console.log('用户确认清空（模态框）');
                clearRecords();
                const emptyRecords = loadRecords(); // 重新加载确保为空
                console.log('清空后的记录（模态框）:', emptyRecords);
                renderRankingTables();
                renderTop1s();
                renderTotalTop1();
            }
        };
    }
    
    if (exportBtn) {
        exportBtn.onclick = () => {
            exportCSV();
        };
    }
}

function closeModal() {
    modal.style.display = 'none';
    modalMask.style.display = 'none';
}

function renderCycleInfo() {
    const timerDiv = document.querySelector('.fantasy-timer');
    if (!timerDiv) return;
    let info = document.getElementById('cycle-info');
    if (!info) {
        info = document.createElement('div');
        info.id = 'cycle-info';
        info.style.color = '#88D9FF';
        info.style.fontWeight = 'bold';
        info.style.fontSize = '1.1rem';
        info.style.marginTop = '0.3rem';
        timerDiv.appendChild(info);
    }
    const now = new Date();
    const { start, end } = getCurrentCycleRange(now);
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const h1 = String(start.getHours()).padStart(2, '0');
    const h2 = String(end.getHours()).padStart(2, '0');
    info.textContent = `当前周期：${m}月${d}日${h1}时 ~ ${h2}时`;
}

function getTotalRanking(records) {
    // {playerId: {songBest: {song: {adjustedScore, raw}}, apCount, fcCount, details:[]}}
    const map = {};
    records.filter(r => SONG_SET.has(r.song)).forEach(r => {
        if (!map[r.playerId]) {
            map[r.playerId] = { songBest: {}, apCount: 0, fcCount: 0, details: [] };
        }
        // Expert难度分数按98%计算
        const adjustedScore = r.diff === 'Expert' ? r.score * 0.98 : r.score;
        // 统计AP/FC
        if (r.ap) map[r.playerId].apCount++;
        if (r.fc) map[r.playerId].fcCount++;
        map[r.playerId].details.push(r);
        
        // 只保留每首歌最高权重分（Master和Expert只能取一个）
        const song = r.song;
        if (!map[r.playerId].songBest[song] || adjustedScore > map[r.playerId].songBest[song].adjustedScore) {
            map[r.playerId].songBest[song] = { adjustedScore, raw: r };
        }
    });
    
    // 只取每人当前挑战曲的最高分相加
    const arr = Object.entries(map).map(([playerId, v]) => {
        const bestArr = SONGS
            .map(song => v.songBest[song])
            .filter(Boolean)
            .sort((a, b) => b.adjustedScore - a.adjustedScore);
        const score = bestArr.reduce((sum, item) => sum + item.adjustedScore, 0);
        return { 
            playerId, 
            score, 
            apCount: v.apCount, 
            fcCount: v.fcCount, 
            details: v.details,
            // 添加用于调试的最高分歌曲信息
            bestSongs: bestArr.map(item => ({
                song: item.raw.song,
                diff: item.raw.diff,
                rawScore: item.raw.score,
                adjustedScore: item.adjustedScore
            }))
        };
    });
    arr.sort((a, b) => b.score - a.score);
    return arr;
}

function renderTotalTop1() {
    let container = document.getElementById('total-top1-bar');
    if (!container) {
        container = document.createElement('div');
        container.id = 'total-top1-bar';
        container.className = 'total-top1-bar';
        const timerDiv = document.querySelector('.fantasy-timer');
        if (timerDiv) timerDiv.parentNode.insertBefore(container, timerDiv.nextSibling);
    }
    const records = loadRecords();
    const totalRank = getTotalRanking(records);
    if (totalRank.length === 0) {
        container.innerHTML = `
            <div class="total-top1-empty">本周期暂无总分记录</div>
            <div class="score-calculation-note-total">总分计算：<span class="diff-expert-note-total">Expert</span> 难度分数 × 0.98</div>
        `;
        return;
    }
    const top = totalRank[0];
    // AP/FC徽章
    let badge = '';
    if (top.apCount === SONGS.length) badge = `<span class="total-ap-badge">APx${SONGS.length}</span>`;
    else if (top.fcCount === SONGS.length) badge = `<span class="total-fc-badge">FCx${SONGS.length}</span>`;
    container.innerHTML = `
      <div class="total-top1-title">本周期总分TOP1</div>
      <div class="total-top1-info">
        <span class="total-top1-player">${top.playerId}</span>
        <span class="total-top1-score">${top.score.toFixed(2)}</span>
        ${badge}
      </div>
      <div class="score-calculation-note-total">总分计算：<span class="diff-expert-note-total">Expert</span> 难度分数 × 0.98</div>
    `;
}

function getCurrentCyclePeriod() {
    // 返回当前周期时间段字符串
    const now = new Date();
    const { start, end } = getCurrentCycleRange(now);
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const h1 = String(start.getHours()).padStart(2, '0');
    const h2 = String(end.getHours()).padStart(2, '0');
    return `${m}月${d}日${h1}时 ~ ${h2}时`;
}

function loadFinalHistory() {
    const data = localStorage.getItem('final-history');
    return data ? JSON.parse(data) : [];
}

function saveFinalHistory(arr) {
    localStorage.setItem('final-history', JSON.stringify(arr));
}

function settleCurrentCycle() {
    const records = loadRecords();
    const totalRank = getTotalRanking(records);
    if (totalRank.length === 0) {
        alert('当前没有可结算的分数');
        return;
    }
    const top = totalRank[0];
    const period = getCurrentCyclePeriod();
    const history = loadFinalHistory();
    history.unshift({ period, playerId: top.playerId, score: top.score, apCount: top.apCount, fcCount: top.fcCount, time: Date.now() });
    saveFinalHistory(history);
    renderFinalHistory();
    alert('结算成功！本周期TOP1已归档到历史结算表');
}

function deleteHistoryRecord(index) {
    console.log('删除历史记录，索引:', index);
    const history = loadFinalHistory();
    if (index >= 0 && index < history.length) {
        const deleted = history.splice(index, 1);
        console.log('已删除的历史记录:', deleted);
        saveFinalHistory(history);
        console.log('删除后的历史记录数量:', history.length);
        renderFinalHistory();
    }
}

const FOCUS_MODE_KEY = 'ui-focus-mode-v1';

function applyFocusMode(enabled) {
    document.body.classList.toggle('focus-mode', enabled);
    const btn = document.getElementById('ui-focus-toggle');
    if (!btn) return;
    const label = enabled ? '显示界面组件' : '隐藏界面组件';
    btn.setAttribute('aria-pressed', String(enabled));
    btn.setAttribute('aria-label', label);
    btn.title = label;
}

function initFocusModeToggle() {
    const btn = document.getElementById('ui-focus-toggle');
    if (!btn) return;
    let enabled = localStorage.getItem(FOCUS_MODE_KEY) === '1';
    applyFocusMode(enabled);
    btn.addEventListener('click', () => {
        enabled = !enabled;
        localStorage.setItem(FOCUS_MODE_KEY, enabled ? '1' : '0');
        applyFocusMode(enabled);
    });
}

function renderFinalHistory() {
    let container = document.getElementById('final-history-bar');
    if (!container) {
        container = document.createElement('div');
        container.id = 'final-history-bar';
        container.className = 'final-history-bar';
        // 插入到main-content而不是document.body
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.appendChild(container);
        } else {
            document.body.appendChild(container);
        }
    }
    const history = loadFinalHistory();
    if (history.length === 0) {
        container.innerHTML = '<div class="final-history-empty">暂无历史结算记录</div>';
        return;
    }
    
    const tableRows = history.map((item, index) => {
        return `<tr>
            <td>${item.period}</td>
            <td>
                <div class="history-delete-container">
                    ${item.playerId}
                    <span class="history-delete-icon" onclick="deleteHistoryRecord(${index})" title="删除此记录">🗑️</span>
                </div>
            </td>
            <td class="final-history-score">${item.score.toFixed(2)}</td>
        </tr>`;
    }).join('');
    
    container.innerHTML = `
        <div class="final-history-title">历史结算表</div>
        <table class="final-history-table">
            <thead>
                <tr>
                    <th>结算周期</th>
                    <th>玩家ID</th>
                    <th>总分</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    `;
}

window.addEventListener('DOMContentLoaded', () => {
    sanitizeRecords();
    initializeElements();
    initFocusModeToggle();
    renderRankingTables();
    renderTop1s();
    renderTotalTop1();
    updateFantasyCountdown();
    setInterval(() => {
        updateFantasyCountdown();
    }, 1000);
    renderCycleInfo();
    
    // 插入结算按钮
    let timerDiv = document.querySelector('.fantasy-timer');
    if (timerDiv && !document.getElementById('settle-btn')) {
        const btn = document.createElement('button');
        btn.id = 'settle-btn';
        btn.className = 'fantasy-btn-submit settle-btn';
        btn.innerText = '结算';
        btn.onclick = settleCurrentCycle;
        timerDiv.appendChild(btn);
    }
    
    // 渲染历史结算表
    renderFinalHistory();
});
