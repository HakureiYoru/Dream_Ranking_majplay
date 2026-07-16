const DEFAULT_API_ROOT = 'https://majdata.net/api3/api';
const API_ROOT_KEY = 'arena-api-root-v1';
const CURRENT_TOPIC_KEY = 'arena-current-topic-v1';
const RECORDS_KEY = 'arena-records-v1';

const LEVEL_LABELS = ['Easy', 'Basic', 'Advanced', 'Expert', 'Master', 'Re:Master', 'UTAGE'];

const state = {
    apiRoot: localStorage.getItem(API_ROOT_KEY) || DEFAULT_API_ROOT,
    page: 0,
    pageSize: 30,
    query: '',
    sort: '',
    results: [],
    selectedSong: null,
    currentTopic: null,
    records: [],
    tableSort: { field: '', direction: 'asc' },
    loading: false
};

const refs = {};

function initRefs() {
    refs.currentTopic = document.getElementById('current-topic');
    refs.topicStats = document.getElementById('topic-stats');
    refs.openRecordForm = document.getElementById('open-record-form');
    refs.clearTopic = document.getElementById('clear-topic');
    refs.searchForm = document.getElementById('song-search-form');
    refs.query = document.getElementById('song-query');
    refs.sort = document.getElementById('song-sort');
    refs.prevPage = document.getElementById('prev-page');
    refs.nextPage = document.getElementById('next-page');
    refs.searchStatus = document.getElementById('search-status');
    refs.searchResults = document.getElementById('search-results');
    refs.sortHeaders = Array.from(document.querySelectorAll('.sort-header'));
    refs.selectedSong = document.getElementById('selected-song');
    refs.topicForm = document.getElementById('topic-form');
    refs.topicLevel = document.getElementById('topic-level');
    refs.targetScore = document.getElementById('target-score');
    refs.topicNote = document.getElementById('topic-note');
    refs.recordForm = document.getElementById('challenge-record-form');
    refs.challenger = document.getElementById('challenger');
    refs.challengeScore = document.getElementById('challenge-score');
    refs.challengeAp = document.getElementById('challenge-ap');
    refs.challengeFc = document.getElementById('challenge-fc');
    refs.challengeNote = document.getElementById('challenge-note');
    refs.currentTopicOnly = document.getElementById('current-topic-only');
    refs.exportRecords = document.getElementById('export-arena-records');
    refs.clearRecords = document.getElementById('clear-arena-records');
    refs.recordsBody = document.getElementById('arena-records');
    refs.recordModal = document.getElementById('record-modal');
    refs.recordModalMask = document.getElementById('record-modal-mask');
    refs.recordModalClose = document.getElementById('record-modal-close');
}

function loadJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
        console.warn(`Failed to parse ${key}`, err);
        return fallback;
    }
}

function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getCurrentTopic() {
    return loadJson(CURRENT_TOPIC_KEY, null);
}

function saveCurrentTopic(topic) {
    if (topic) {
        saveJson(CURRENT_TOPIC_KEY, topic);
    } else {
        localStorage.removeItem(CURRENT_TOPIC_KEY);
    }
    state.currentTopic = topic;
}

function loadRecords() {
    return loadJson(RECORDS_KEY, []);
}

function saveRecords(records) {
    state.records = records;
    saveJson(RECORDS_KEY, records);
}

function imageUrl(songId) {
    return `${state.apiRoot}/maichart/${encodeURIComponent(songId)}/image`;
}

function songUrl(songId) {
    return `https://majdata.net/song/${encodeURIComponent(songId)}`;
}

function makeId(prefix) {
    if (window.crypto && crypto.randomUUID) {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatScore(value) {
    const score = Number(value);
    return Number.isFinite(score) ? score.toFixed(2) : '--';
}

function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
}

function formatShortDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${m}-${d} ${h}:${min}`;
}

function getLevelEntries(levels) {
    if (!Array.isArray(levels)) return [];
    return levels
        .map((level, index) => ({
            index,
            label: LEVEL_LABELS[index] || `谱面 ${index + 1}`,
            value: level == null ? '' : String(level).trim()
        }))
        .filter(item => item.value);
}

function levelsText(levels) {
    const entries = getLevelEntries(levels);
    if (entries.length === 0) return '未标注';
    return entries.map(item => `${item.label} ${item.value}`).join(' / ');
}

function tagsText(song) {
    const tags = [...(song.publicTags || []), ...(song.tags || [])]
        .map(tag => String(tag).trim())
        .filter(Boolean);
    return [...new Set(tags)].slice(0, 4).join(' / ');
}

function normalizeSong(song) {
    return {
        id: String(song.id || ''),
        title: String(song.title || '未命名曲目'),
        artist: String(song.artist || '未知艺术家'),
        designer: String(song.designer || ''),
        description: String(song.description || ''),
        levels: Array.isArray(song.levels) ? song.levels : [],
        uploader: String(song.uploader || ''),
        timestamp: song.timestamp || '',
        hash: String(song.hash || ''),
        tags: Array.isArray(song.tags) ? song.tags : [],
        publicTags: Array.isArray(song.publicTags) ? song.publicTags : []
    };
}

function createNode(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function createCover(song, className = 'arena-cover') {
    const wrapper = createNode('div', `${className}-wrap`);
    const img = document.createElement('img');
    img.className = className;
    img.src = imageUrl(song.id);
    img.alt = `${song.title} Cover`;
    img.loading = 'lazy';
    img.onerror = () => {
        wrapper.classList.add('cover-missing');
        img.remove();
        wrapper.textContent = 'NO COVER';
    };
    wrapper.appendChild(img);
    return wrapper;
}

function createBadge(text, extraClass = '') {
    const badge = createNode('span', `arena-badge ${extraClass}`.trim(), text);
    return badge;
}

function renderEmptyRow(tbody, colSpan, text) {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = createNode('td', 'ranking-empty', text);
    td.colSpan = colSpan;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function setSearchStatus(text, tone = '') {
    refs.searchStatus.textContent = text || '';
    refs.searchStatus.className = `arena-status ${tone}`.trim();
}

function setButtonsLoading(isLoading) {
    state.loading = isLoading;
    refs.prevPage.disabled = isLoading || state.page <= 0;
    refs.nextPage.disabled = isLoading || state.results.length < state.pageSize;
    refs.searchForm.querySelector('button[type="submit"]').disabled = isLoading;
}

async function searchSongs(page = 0) {
    state.query = refs.query.value.trim();
    state.sort = refs.sort.value;
    state.page = Math.max(0, page);
    setButtonsLoading(true);
    setSearchStatus('搜索中...');
    renderEmptyRow(refs.searchResults, 7, '搜索中...');

    const params = new URLSearchParams();
    params.set('sort', state.sort);
    params.set('page', String(state.page));
    params.set('search', state.query);

    try {
        const response = await fetch(`${state.apiRoot}/maichart/list?${params.toString()}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const rawRows = Array.isArray(data) ? data : Array.isArray(data.value) ? data.value : [];
        state.results = rawRows.map(normalizeSong).filter(song => song.id);
        if (state.sort) {
            state.tableSort = { field: state.sort, direction: 'asc' };
        }
        const count = Number(data.Count ?? state.results.length);
        renderSearchResults();
        setSearchStatus(`第 ${state.page + 1} 页，当前 ${state.results.length} 条结果`);
        refs.nextPage.disabled = state.loading || count < state.pageSize || state.results.length < state.pageSize;
    } catch (err) {
        console.error(err);
        state.results = [];
        renderEmptyRow(refs.searchResults, 7, 'MajdataNet 搜索失败');
        setSearchStatus(`搜索失败：${err.message || err}`, 'error');
    } finally {
        setButtonsLoading(false);
    }
}

function getSortedResults() {
    const rows = [...state.results];
    const { field, direction } = state.tableSort;
    if (!field) return rows;

    const factor = direction === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
        if (field === 'timestamp') {
            return ((new Date(a.timestamp).getTime() || 0) - (new Date(b.timestamp).getTime() || 0)) * factor;
        }
        const av = String(a[field] || '').trim();
        const bv = String(b[field] || '').trim();
        return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
    return rows;
}

function updateSortHeaders() {
    refs.sortHeaders.forEach(button => {
        const active = button.dataset.sortField === state.tableSort.field;
        button.classList.toggle('active', active);
        button.dataset.direction = active ? state.tableSort.direction : '';
        button.setAttribute(
            'aria-sort',
            active ? (state.tableSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        );
    });
}

function setTableSort(field) {
    if (state.tableSort.field === field) {
        state.tableSort.direction = state.tableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.tableSort = { field, direction: 'asc' };
    }
    renderSearchResults();
}

function renderSearchResults() {
    refs.searchResults.innerHTML = '';
    if (state.results.length === 0) {
        renderEmptyRow(refs.searchResults, 7, '没有搜索结果');
        updateSortHeaders();
        return;
    }

    getSortedResults().forEach(song => {
        const tr = document.createElement('tr');
        if (state.selectedSong && state.selectedSong.id === song.id) {
            tr.classList.add('selected');
        }

        const coverTd = document.createElement('td');
        coverTd.appendChild(createCover(song, 'search-cover'));

        const songTd = document.createElement('td');
        const title = createNode('div', 'arena-song-title', song.title);
        const designer = createNode('div', 'arena-song-meta', song.designer ? `谱师：${song.designer}` : '谱师：--');
        const tags = tagsText(song);
        songTd.append(title, designer);
        if (tags) songTd.appendChild(createNode('div', 'arena-song-tags', tags));

        const artistTd = document.createElement('td');
        artistTd.appendChild(createNode('div', 'arena-song-artist', song.artist || '--'));

        const levelTd = document.createElement('td');
        const levelList = createNode('div', 'level-list');
        const entries = getLevelEntries(song.levels);
        if (entries.length === 0) {
            levelList.appendChild(createBadge('未标注', 'muted-badge'));
        } else {
            entries.forEach(entry => {
                levelList.appendChild(createBadge(`${entry.label} ${entry.value}`, 'level-badge'));
            });
        }
        levelTd.appendChild(levelList);

        const uploaderTd = createNode('td', '', song.uploader || '--');
        const timeTd = createNode('td', '', formatShortDate(song.timestamp));

        const actionTd = document.createElement('td');
        const actionGroup = createNode('div', 'table-actions');
        const selectBtn = createNode('button', 'fantasy-btn-submit compact-btn', '选中');
        selectBtn.type = 'button';
        selectBtn.addEventListener('click', () => selectSong(song));
        const openLink = createNode('a', 'fantasy-btn-warning compact-btn link-btn', '打开');
        openLink.href = songUrl(song.id);
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        actionGroup.append(selectBtn, openLink);
        actionTd.appendChild(actionGroup);

        tr.append(coverTd, songTd, artistTd, levelTd, uploaderTd, timeTd, actionTd);
        tr.addEventListener('dblclick', () => selectSong(song));
        refs.searchResults.appendChild(tr);
    });
    updateSortHeaders();
}

function selectSong(song) {
    state.selectedSong = song;
    renderSelectedSong();
    renderSearchResults();
    refs.targetScore.focus();
}

function renderSelectedSong() {
    refs.selectedSong.innerHTML = '';
    refs.topicLevel.innerHTML = '';

    if (!state.selectedSong) {
        refs.selectedSong.appendChild(createNode('div', 'arena-empty', '尚未选中曲目'));
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '请选择曲目';
        refs.topicLevel.appendChild(opt);
        refs.topicLevel.disabled = true;
        refs.topicForm.querySelector('button[type="submit"]').disabled = true;
        return;
    }

    refs.topicLevel.disabled = false;
    refs.topicForm.querySelector('button[type="submit"]').disabled = false;

    const song = state.selectedSong;
    const preview = createNode('div', 'selected-song-preview');
    preview.appendChild(createCover(song, 'selected-cover'));

    const info = createNode('div', 'selected-song-info');
    info.appendChild(createNode('div', 'arena-song-title', song.title));
    info.appendChild(createNode('div', 'arena-song-artist', song.artist));
    info.appendChild(createNode('div', 'arena-song-meta', `谱师：${song.designer || '--'}`));
    info.appendChild(createNode('div', 'arena-song-meta', `等级：${levelsText(song.levels)}`));
    preview.appendChild(info);
    refs.selectedSong.appendChild(preview);

    const entries = getLevelEntries(song.levels);
    if (entries.length === 0) {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ index: null, label: '未标注', value: '' });
        opt.textContent = '未标注';
        refs.topicLevel.appendChild(opt);
    } else {
        entries.forEach(entry => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(entry);
            opt.textContent = `${entry.label} ${entry.value}`;
            refs.topicLevel.appendChild(opt);
        });
        const master = entries.find(entry => entry.label === 'Master') || entries[entries.length - 1];
        refs.topicLevel.value = JSON.stringify(master);
    }
}

function getSelectedLevel() {
    try {
        return JSON.parse(refs.topicLevel.value);
    } catch (err) {
        return { index: null, label: '未标注', value: '' };
    }
}

function setTopicFromSelected(event) {
    event.preventDefault();
    if (!state.selectedSong) {
        alert('请先从搜索结果中选中曲目');
        return;
    }

    const score = Number.parseFloat(refs.targetScore.value);
    if (!Number.isFinite(score) || score < 0 || score > 101) {
        alert('请输入 0 到 101 之间的课题分');
        return;
    }

    const level = getSelectedLevel();
    const song = state.selectedSong;
    const topic = {
        topicSessionId: makeId('topic'),
        songId: song.id,
        title: song.title,
        artist: song.artist,
        designer: song.designer,
        uploader: song.uploader,
        levels: song.levels,
        tags: song.tags,
        publicTags: song.publicTags,
        timestamp: song.timestamp,
        levelIndex: level.index,
        levelName: level.label,
        levelValue: level.value,
        targetScore: score,
        note: refs.topicNote.value.trim(),
        createdAt: new Date().toISOString()
    };

    saveCurrentTopic(topic);
    refs.challengeScore.value = formatScore(score);
    renderCurrentTopic();
    renderRecords();
}

function renderCurrentTopic() {
    refs.currentTopic.innerHTML = '';
    const topic = state.currentTopic;

    if (!topic) {
        refs.currentTopic.appendChild(createNode('div', 'arena-empty', '未设置课题'));
        refs.topicStats.innerHTML = '';
        refs.openRecordForm.disabled = true;
        refs.clearTopic.disabled = true;
        refs.recordForm.querySelector('button[type="submit"]').disabled = true;
        return;
    }

    refs.openRecordForm.disabled = false;
    refs.clearTopic.disabled = false;
    refs.recordForm.querySelector('button[type="submit"]').disabled = false;

    const body = createNode('div', 'current-topic-body');
    body.appendChild(createCover({ id: topic.songId, title: topic.title }, 'topic-cover'));

    const info = createNode('div', 'current-topic-info');
    info.appendChild(createNode('div', 'current-topic-label', '目标分数'));
    info.appendChild(createNode('div', 'current-topic-score', formatScore(topic.targetScore)));
    info.appendChild(createNode('div', 'current-topic-title', topic.title));
    info.appendChild(createNode('div', 'arena-song-artist', topic.artist || '--'));

    const meta = createNode('div', 'topic-meta-row');
    meta.appendChild(createBadge(`${topic.levelName || '谱面'} ${topic.levelValue || ''}`.trim(), 'level-badge'));
    meta.appendChild(createBadge(`谱师 ${topic.designer || '--'}`, 'muted-badge'));
    meta.appendChild(createBadge(`设置 ${formatDateTime(topic.createdAt)}`, 'muted-badge'));
    info.appendChild(meta);

    if (topic.note) {
        info.appendChild(createNode('div', 'topic-note', topic.note));
    }

    body.appendChild(info);
    refs.currentTopic.appendChild(body);
    renderTopicStats();
}

function getVisibleRecords() {
    if (!refs.currentTopicOnly.checked) {
        return [...state.records];
    }
    if (!state.currentTopic) {
        return [];
    }
    return state.records.filter(record => record.topicSessionId === state.currentTopic.topicSessionId);
}

function getCurrentTopicRecords() {
    if (!state.currentTopic) return [];
    return state.records.filter(record => record.topicSessionId === state.currentTopic.topicSessionId);
}

function renderTopicStats() {
    const topic = state.currentTopic;
    if (!topic) {
        refs.topicStats.innerHTML = '';
        return;
    }

    const records = getCurrentTopicRecords();
    const passed = records.filter(record => record.score >= topic.targetScore).length;
    const best = records.reduce((max, record) => Math.max(max, Number(record.score) || 0), 0);
    const leader = records
        .slice()
        .sort((a, b) => Number(b.score) - Number(a.score))[0];

    refs.topicStats.innerHTML = '';
    const items = [
        ['挑战次数', records.length],
        ['达成', passed],
        ['最高分', records.length ? formatScore(best) : '--'],
        ['当前最高', leader ? leader.playerId : '--']
    ];
    items.forEach(([label, value]) => {
        const item = createNode('div', 'topic-stat');
        item.appendChild(createNode('span', 'topic-stat-label', label));
        item.appendChild(createNode('strong', '', String(value)));
        refs.topicStats.appendChild(item);
    });
}

function addChallengeRecord(event) {
    event.preventDefault();
    const topic = state.currentTopic;
    if (!topic) {
        alert('请先设置当前课题');
        return;
    }

    const playerId = refs.challenger.value.trim();
    if (!playerId) {
        alert('请输入挑战者ID');
        return;
    }

    const score = Number.parseFloat(refs.challengeScore.value);
    if (!Number.isFinite(score) || score < 0 || score > 101) {
        alert('请输入 0 到 101 之间的成绩');
        return;
    }

    const record = {
        id: makeId('record'),
        topicSessionId: topic.topicSessionId,
        songId: topic.songId,
        title: topic.title,
        artist: topic.artist,
        levelName: topic.levelName,
        levelValue: topic.levelValue,
        targetScore: topic.targetScore,
        playerId,
        score,
        ap: refs.challengeAp.checked,
        fc: refs.challengeFc.checked,
        note: refs.challengeNote.value.trim(),
        time: new Date().toISOString()
    };

    saveRecords([record, ...state.records]);
    refs.recordForm.reset();
    refs.challengeScore.value = formatScore(topic.targetScore);
    closeRecordModal();
    renderCurrentTopic();
    renderRecords();
}

function deleteRecord(recordId) {
    if (!confirm('确定删除这条挑战记录吗？')) return;
    saveRecords(state.records.filter(record => record.id !== recordId));
    renderCurrentTopic();
    renderRecords();
}

function renderRecords() {
    const visible = getVisibleRecords();
    refs.recordsBody.innerHTML = '';
    if (visible.length === 0) {
        renderEmptyRow(refs.recordsBody, 6, '暂无挑战记录');
        renderTopicStats();
        return;
    }

    visible.forEach(record => {
        const tr = document.createElement('tr');
        const delta = Number(record.score) - Number(record.targetScore);
        const passed = delta >= 0;

        const timeTd = createNode('td', '', formatShortDate(record.time));
        timeTd.title = formatDateTime(record.time);

        const playerTd = createNode('td', '', record.playerId);
        playerTd.title = record.playerId;

        const scoreTd = document.createElement('td');
        const scoreWrap = createNode('div', 'record-score-wrap');
        const score = createNode('span', 'record-score', formatScore(record.score));
        if (record.ap) score.classList.add('score-ap');
        else if (record.fc) score.classList.add('score-fc');
        scoreWrap.appendChild(score);
        scoreTd.appendChild(scoreWrap);

        const resultTd = document.createElement('td');
        resultTd.appendChild(createBadge(passed ? '达成' : '未达成', passed ? 'pass-badge' : 'fail-badge'));
        resultTd.appendChild(createNode('div', 'record-delta', `${delta >= 0 ? '+' : ''}${formatScore(delta)}`));

        const songTd = document.createElement('td');
        songTd.appendChild(createNode('div', 'record-song-title', record.title));
        songTd.appendChild(createNode('div', 'record-song-meta', `${record.levelName || '谱面'} ${record.levelValue || ''} / 课题 ${formatScore(record.targetScore)}`.trim()));
        if (record.note) songTd.appendChild(createNode('div', 'record-song-note', record.note));

        const actionTd = document.createElement('td');
        const deleteBtn = createNode('button', 'fantasy-btn-danger compact-btn', '删除');
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', () => deleteRecord(record.id));
        actionTd.appendChild(deleteBtn);

        tr.append(timeTd, playerTd, scoreTd, resultTd, songTd, actionTd);
        refs.recordsBody.appendChild(tr);
    });
    renderTopicStats();
}

function clearCurrentTopic() {
    if (!state.currentTopic) return;
    if (!confirm('确定清除当前课题吗？挑战记录会保留。')) return;
    saveCurrentTopic(null);
    renderCurrentTopic();
    renderRecords();
}

function clearArenaRecords() {
    if (state.records.length === 0) return;
    if (!confirm('确定清空所有擂台赛挑战记录吗？')) return;
    saveRecords([]);
    renderCurrentTopic();
    renderRecords();
}

function csvCell(value) {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportArenaRecords() {
    const rows = getVisibleRecords();
    if (rows.length === 0) {
        alert('当前没有可导出的记录');
        return;
    }

    const header = ['时间', '挑战者', '成绩', '课题分', '结果', '差值', '曲目', '艺术家', '谱面', 'AP', 'FC', '备注'];
    const body = rows.map(record => {
        const delta = Number(record.score) - Number(record.targetScore);
        return [
            formatDateTime(record.time),
            record.playerId,
            formatScore(record.score),
            formatScore(record.targetScore),
            delta >= 0 ? '达成' : '未达成',
            `${delta >= 0 ? '+' : ''}${formatScore(delta)}`,
            record.title,
            record.artist,
            `${record.levelName || ''} ${record.levelValue || ''}`.trim(),
            record.ap ? '1' : '0',
            record.fc ? '1' : '0',
            record.note || ''
        ];
    });

    const csv = [header, ...body].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const scope = refs.currentTopicOnly.checked ? 'current' : 'all';
    link.href = url;
    link.download = `arena-records-${scope}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function openRecordModal() {
    if (!state.currentTopic) {
        alert('请先设置当前课题');
        return;
    }
    refs.challengeScore.value = formatScore(state.currentTopic.targetScore);
    refs.recordModal.style.display = '';
    refs.recordModalMask.style.display = '';
    window.setTimeout(() => refs.challenger.focus(), 0);
}

function closeRecordModal() {
    refs.recordModal.style.display = 'none';
    refs.recordModalMask.style.display = 'none';
}

function bindEvents() {
    refs.searchForm.addEventListener('submit', event => {
        event.preventDefault();
        searchSongs(0);
    });
    refs.prevPage.addEventListener('click', () => searchSongs(state.page - 1));
    refs.nextPage.addEventListener('click', () => searchSongs(state.page + 1));
    refs.sortHeaders.forEach(button => {
        button.addEventListener('click', () => setTableSort(button.dataset.sortField));
    });
    refs.topicForm.addEventListener('submit', setTopicFromSelected);
    refs.recordForm.addEventListener('submit', addChallengeRecord);
    refs.currentTopicOnly.addEventListener('change', renderRecords);
    refs.openRecordForm.addEventListener('click', openRecordModal);
    refs.recordModalMask.addEventListener('click', closeRecordModal);
    refs.recordModalClose.addEventListener('click', closeRecordModal);
    refs.clearTopic.addEventListener('click', clearCurrentTopic);
    refs.clearRecords.addEventListener('click', clearArenaRecords);
    refs.exportRecords.addEventListener('click', exportArenaRecords);
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && refs.recordModal.style.display !== 'none') {
            closeRecordModal();
        }
    });
}

function initialize() {
    initRefs();
    state.currentTopic = getCurrentTopic();
    state.records = loadRecords();
    bindEvents();
    renderCurrentTopic();
    renderSelectedSong();
    renderRecords();
    searchSongs(0);
}

window.addEventListener('DOMContentLoaded', initialize);
