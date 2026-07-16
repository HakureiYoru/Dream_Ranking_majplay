const DEFAULT_API_ROOT = 'https://majdata.net/api3/api';
const API_ROOT_KEY = 'arena-api-root-v1';
const CURRENT_TOPIC_KEY = 'arena-current-topic-v1';

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
    tableSort: { field: '', direction: 'asc' },
    loading: false,
    searchLoaded: false,
    topicDetailsRequestKey: ''
};

const refs = {};

function initRefs() {
    refs.currentTopic = document.getElementById('current-topic');
    refs.clearTopic = document.getElementById('clear-topic');
    refs.openSearch = document.getElementById('open-search');
    refs.searchModal = document.getElementById('search-modal');
    refs.searchModalMask = document.getElementById('search-modal-mask');
    refs.searchModalClose = document.getElementById('search-modal-close');
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

function imageUrl(songId) {
    return `${state.apiRoot}/maichart/${encodeURIComponent(songId)}/image`;
}

function summaryUrl(songId) {
    return `${state.apiRoot}/maichart/${encodeURIComponent(songId)}/summary`;
}

function interactSumUrl(songId) {
    return `${state.apiRoot}/maichart/${encodeURIComponent(songId)}/interactsum`;
}

function interactUrl(songId) {
    return `${state.apiRoot}/maichart/${encodeURIComponent(songId)}/interact`;
}

function accountIconUrl(username) {
    return `${state.apiRoot}/account/Icon?username=${encodeURIComponent(username || '')}`;
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

function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count)) return '--';
    if (count >= 10000) return `${(count / 10000).toFixed(1)}w`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
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

function normalizeStats(source) {
    if (!source || typeof source !== 'object') return null;
    const likes = Array.isArray(source.likes) ? source.likes.length : source.likes;
    const comments = Array.isArray(source.comments) ? source.comments.length : source.comments;
    const stats = {
        plays: Number(source.plays),
        likes: Number(likes),
        comments: Number(comments)
    };
    const hasAny = Object.values(stats).some(Number.isFinite);
    return hasAny ? stats : null;
}

function normalizeComments(comments) {
    if (!Array.isArray(comments)) return [];
    return comments
        .map(comment => ({
            sender: String(comment.sender || comment.username || comment.user || '').trim(),
            content: String(comment.content || comment.text || comment.message || '').replace(/\s+/g, ' ').trim(),
            timestamp: comment.timestamp || comment.time || ''
        }))
        .filter(comment => comment.content)
        .slice(0, 3);
}

function normalizeSong(song) {
    const stats = normalizeStats(song.interactsum || song.interact || song.stats || song);
    return {
        id: String(song.id || ''),
        title: String(song.title || '未命名曲目'),
        artist: String(song.artist || '未知艺术家'),
        designer: String(song.designer || ''),
        description: String(song.description || ''),
        levels: Array.isArray(song.levels) ? song.levels : [],
        uploader: String(song.uploader || ''),
        uploaderID: String(song.uploaderID || ''),
        timestamp: song.timestamp || '',
        hash: String(song.hash || ''),
        tags: Array.isArray(song.tags) ? song.tags : [],
        publicTags: Array.isArray(song.publicTags) ? song.publicTags : [],
        stats,
        comments: normalizeComments(song.comments)
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
    return createNode('span', `arena-badge ${extraClass}`.trim(), text);
}

function createDesignerAvatar(topic) {
    const name = topic.uploader || '';
    const fallback = topic.designer && topic.designer !== name ? topic.designer : '';
    const wrapper = createNode('div', 'topic-designer-avatar');
    if (!name && !fallback) {
        wrapper.textContent = '?';
        return wrapper;
    }

    const img = document.createElement('img');
    let usingFallback = false;
    img.alt = `${name || fallback} avatar`;
    img.src = accountIconUrl(name || fallback);
    img.onerror = () => {
        if (fallback && !usingFallback) {
            usingFallback = true;
            img.src = accountIconUrl(fallback);
            return;
        }
        img.remove();
        wrapper.classList.add('avatar-missing');
        wrapper.textContent = (name || fallback || '?').trim().slice(0, 1).toUpperCase();
    };
    wrapper.appendChild(img);
    return wrapper;
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
        state.searchLoaded = true;
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
        uploaderID: song.uploaderID,
        levels: song.levels,
        tags: song.tags,
        publicTags: song.publicTags,
        timestamp: song.timestamp,
        levelIndex: level.index,
        levelName: level.label,
        levelValue: level.value,
        targetScore: score,
        stats: song.stats,
        comments: song.comments || [],
        note: refs.topicNote.value.trim(),
        createdAt: new Date().toISOString()
    };

    saveCurrentTopic(topic);
    renderCurrentTopic();
    refreshCurrentTopicDetails();
    closeSearchModal();
}

async function refreshCurrentTopicDetails() {
    const topic = state.currentTopic;
    if (!topic || !topic.songId) return;

    const requestKey = `${topic.topicSessionId}:${topic.songId}:${Date.now()}`;
    state.topicDetailsRequestKey = requestKey;

    try {
        const [summaryResult, statsResult, interactResult] = await Promise.allSettled([
            fetch(summaryUrl(topic.songId), { headers: { Accept: 'application/json' } }),
            fetch(interactSumUrl(topic.songId), { headers: { Accept: 'application/json' } }),
            fetch(interactUrl(topic.songId), { headers: { Accept: 'application/json' } })
        ]);

        if (state.topicDetailsRequestKey !== requestKey || !state.currentTopic) return;
        const updated = { ...state.currentTopic };

        if (summaryResult.status === 'fulfilled' && summaryResult.value.ok) {
            const summary = await summaryResult.value.json();
            updated.title = String(summary.title || updated.title || '');
            updated.artist = String(summary.artist || updated.artist || '');
            updated.designer = String(summary.designer || updated.designer || '');
            updated.uploader = String(summary.uploader || updated.uploader || '');
            updated.uploaderID = String(summary.uploaderID || updated.uploaderID || '');
            updated.levels = Array.isArray(summary.levels) ? summary.levels : updated.levels;
            updated.tags = Array.isArray(summary.tags) ? summary.tags : updated.tags;
            updated.publicTags = Array.isArray(summary.publicTags) ? summary.publicTags : updated.publicTags;
            updated.timestamp = summary.timestamp || updated.timestamp;
            updated.hash = String(summary.hash || updated.hash || '');
        }

        if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
            const stats = normalizeStats(await statsResult.value.json());
            if (stats) updated.stats = stats;
        }

        if (interactResult.status === 'fulfilled' && interactResult.value.ok) {
            const interact = await interactResult.value.json();
            const stats = normalizeStats(interact);
            if (stats) updated.stats = stats;
            updated.comments = normalizeComments(interact.comments);
        }

        saveCurrentTopic(updated);
        renderCurrentTopic();
    } catch (err) {
        console.warn('Failed to refresh topic details', err);
    }
}

function renderCurrentTopic() {
    refs.currentTopic.innerHTML = '';
    const topic = state.currentTopic;

    if (!topic) {
        refs.currentTopic.appendChild(createNode('div', 'arena-empty topic-empty-state', '未设置课题'));
        refs.clearTopic.disabled = true;
        return;
    }

    refs.clearTopic.disabled = false;

    const stage = createNode('div', 'current-topic-stage');
    stage.style.setProperty('--topic-cover-bg', `url("${imageUrl(topic.songId).replace(/"/g, '%22')}")`);
    stage.appendChild(createCover({ id: topic.songId, title: topic.title }, 'topic-cover'));

    const info = createNode('div', 'current-topic-info');
    info.appendChild(createNode('div', 'current-topic-label', '目标分数'));
    info.appendChild(createNode('div', 'current-topic-score', formatScore(topic.targetScore)));
    info.appendChild(createNode('div', 'current-topic-title', topic.title));
    info.appendChild(createNode('div', 'arena-song-artist', topic.artist || '--'));

    const designerRow = createNode('div', 'topic-designer-row');
    designerRow.appendChild(createDesignerAvatar(topic));
    const designerInfo = createNode('div', 'topic-designer-info');
    designerInfo.appendChild(createNode('div', 'topic-designer-label', '谱师'));
    designerInfo.appendChild(createNode('div', 'topic-designer-name', topic.designer || '--'));
    designerRow.appendChild(designerInfo);
    info.appendChild(designerRow);

    const meta = createNode('div', 'topic-meta-row');
    meta.appendChild(createBadge(`${topic.levelName || '谱面'} ${topic.levelValue || ''}`.trim(), 'level-badge'));
    meta.appendChild(createBadge(`设置 ${formatDateTime(topic.createdAt)}`, 'muted-badge'));
    info.appendChild(meta);

    if (topic.note) {
        info.appendChild(createNode('div', 'topic-note', topic.note));
    }

    stage.appendChild(info);
    stage.appendChild(renderTopicStats(topic.stats));
    refs.currentTopic.appendChild(stage);
}

function renderTopicStats(stats) {
    const panel = createNode('aside', 'topic-stats-panel');
    panel.setAttribute('aria-label', '歌曲游玩数据');
    const topic = state.currentTopic || {};

    [
        ['游玩次数', stats ? stats.plays : null],
        ['点赞数', stats ? stats.likes : null],
        ['评论数', stats ? stats.comments : null]
    ].forEach(([label, value], index) => {
        const isCommentCard = index === 2;
        const card = createNode('div', isCommentCard ? 'topic-stat-card topic-comments-card' : 'topic-stat-card');
        card.appendChild(createNode('div', 'topic-stat-label', label));
        card.appendChild(createNode('div', 'topic-stat-value', formatCount(value)));
        if (isCommentCard) {
            card.appendChild(renderCommentPreview(topic.comments || []));
        }
        panel.appendChild(card);
    });

    return panel;
}

function renderCommentPreview(comments) {
    const list = createNode('div', 'topic-comment-list');
    if (!Array.isArray(comments) || comments.length === 0) {
        list.appendChild(createNode('div', 'topic-comment-empty', '暂无评论'));
        return list;
    }

    comments.slice(0, 3).forEach(comment => {
        const item = createNode('div', 'topic-comment-item');
        const sender = comment.sender ? `${comment.sender}: ` : '';
        item.textContent = `${sender}${comment.content}`;
        item.title = item.textContent;
        list.appendChild(item);
    });
    return list;
}

function clearCurrentTopic() {
    if (!state.currentTopic) return;
    if (!confirm('确定清除当前课题吗？')) return;
    state.topicDetailsRequestKey = '';
    saveCurrentTopic(null);
    renderCurrentTopic();
}

function openSearchModal() {
    refs.searchModal.style.display = '';
    refs.searchModalMask.style.display = '';
    if (!state.searchLoaded) {
        searchSongs(0);
    }
    window.setTimeout(() => refs.query.focus(), 0);
}

function closeSearchModal() {
    refs.searchModal.style.display = 'none';
    refs.searchModalMask.style.display = 'none';
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
    refs.clearTopic.addEventListener('click', clearCurrentTopic);
    refs.openSearch.addEventListener('click', openSearchModal);
    refs.searchModalMask.addEventListener('click', closeSearchModal);
    refs.searchModalClose.addEventListener('click', closeSearchModal);
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && refs.searchModal.style.display !== 'none') {
            closeSearchModal();
        }
    });
}

function initialize() {
    initRefs();
    state.currentTopic = getCurrentTopic();
    bindEvents();
    renderCurrentTopic();
    refreshCurrentTopicDetails();
    renderSelectedSong();
    renderEmptyRow(refs.searchResults, 7, '点击右下角按钮后可搜索并设置课题');
    setButtonsLoading(false);
}

window.addEventListener('DOMContentLoaded', initialize);
