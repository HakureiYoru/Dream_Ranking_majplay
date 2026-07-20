const DEFAULT_GUESS_CONFIG = {
    catalogUrl: 'data/majnet_catalog.json',
    emptyHint: '曲库不足：请运行 python -u tools/sync_majnet_catalog.py --limit 200',
    modeLabel: 'MajNet',
    gridSize: 16,
    gridClass: '',
    cropZoomMin: 0.38,
    cropZoomMax: 0.58,
    /** classic | endless；也可被 URL ?mode=endless 覆盖 */
    gameMode: 'classic',
    /** 题目区展示：artist | designer | version | levels | aliases */
    promptFields: ['designer'],
    aliasMax: 8
};

function resolveGameMode() {
    const fromConfig = String((window.GUESS_CONFIG && window.GUESS_CONFIG.gameMode) || '').toLowerCase();
    let mode = fromConfig === 'endless' ? 'endless' : 'classic';
    try {
        const params = new URLSearchParams(window.location.search || '');
        const q = String(params.get('mode') || '').toLowerCase();
        if (q === 'endless' || q === 'end' || q === '1') mode = 'endless';
        if (q === 'classic' || q === 'normal') mode = 'classic';
    } catch (err) {
        /* ignore */
    }
    return mode;
}

const GUESS_CONFIG = Object.assign({}, DEFAULT_GUESS_CONFIG, window.GUESS_CONFIG || {});
GUESS_CONFIG.gameMode = resolveGameMode();
const IS_ENDLESS = GUESS_CONFIG.gameMode === 'endless';
const CATALOG_URL = GUESS_CONFIG.catalogUrl;
const TOTAL_ROUNDS = 10;
const PASS_NEED = 5;
const GRID_SIZE = Number(GUESS_CONFIG.gridSize) || 16;

const state = {
    songs: [],
    roundIndex: 0,
    passCount: 0,
    score: 0,
    bestScore: 0,
    answer: null,
    options: [],
    locked: false,
    /** 本局已出过的「正确答案」id，避免同局答案重复 */
    usedAnswerIds: [],
    /** 洗牌后的答题牌堆（对象引用），抽空再洗 */
    answerDeck: [],
    /** 近几轮出现过的封面 id，仅作干扰项软冷却 */
    recentCoverIds: [],
    finished: false,
    lastCorrect: false
};

const refs = {};

function initRefs() {
    refs.scoreboard = document.getElementById('guess-scoreboard');
    refs.roundLabel = document.getElementById('guess-round-label');
    refs.passLabel = document.getElementById('guess-pass-label');
    refs.scoreLabel = document.getElementById('guess-score-label');
    refs.bestLabel = document.getElementById('guess-best-label');
    refs.pillRound = document.getElementById('guess-pill-round');
    refs.pillPass = document.getElementById('guess-pill-pass');
    refs.pillScore = document.getElementById('guess-pill-score');
    refs.pillBest = document.getElementById('guess-pill-best');
    refs.status = document.getElementById('guess-status');
    refs.playPanel = document.getElementById('guess-play-panel');
    refs.songTitle = document.getElementById('guess-song-title');
    refs.songArtist = document.getElementById('guess-song-artist');
    refs.songLevels = document.getElementById('guess-song-levels');
    refs.songMeta = document.getElementById('guess-song-meta');
    refs.coverGrid = document.getElementById('guess-cover-grid');
    refs.revealPanel = document.getElementById('guess-reveal-panel');
    refs.revealCard = document.getElementById('guess-reveal-card');
    refs.nextBtn = document.getElementById('guess-next-btn');
    refs.resultPanel = document.getElementById('guess-result-panel');
    refs.resultTitle = document.getElementById('guess-result-title');
    refs.resultText = document.getElementById('guess-result-text');
    refs.restartBtn = document.getElementById('guess-restart-btn');
}

function bestScoreStorageKey() {
    return `guess-endless-best:${GUESS_CONFIG.modeLabel || 'default'}`;
}

function loadBestScore() {
    try {
        const raw = localStorage.getItem(bestScoreStorageKey());
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (err) {
        return 0;
    }
}

function saveBestScore(score) {
    try {
        localStorage.setItem(bestScoreStorageKey(), String(score));
    } catch (err) {
        /* ignore */
    }
}

function setupModeUi() {
    document.body.classList.toggle('is-endless', IS_ENDLESS);
    if (refs.pillPass) refs.pillPass.hidden = IS_ENDLESS;
    if (refs.pillScore) refs.pillScore.hidden = !IS_ENDLESS;
    if (refs.pillBest) refs.pillBest.hidden = !IS_ENDLESS;
    if (refs.pillRound && IS_ENDLESS) {
        refs.pillRound.innerHTML = '题数 <strong id="guess-round-label">0</strong>';
        refs.roundLabel = document.getElementById('guess-round-label');
    }
    if (refs.nextBtn) {
        refs.nextBtn.textContent = IS_ENDLESS ? '继续' : '下一轮';
    }
}

function updateScoreboard() {
    if (IS_ENDLESS) {
        if (refs.roundLabel) refs.roundLabel.textContent = String(state.roundIndex);
        if (refs.scoreLabel) refs.scoreLabel.textContent = String(state.score);
        if (refs.bestLabel) refs.bestLabel.textContent = String(state.bestScore);
        return;
    }
    if (refs.roundLabel) {
        refs.roundLabel.textContent = `${Math.min(state.roundIndex, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS}`;
    }
    if (refs.passLabel) {
        refs.passLabel.textContent = `${state.passCount} / ${PASS_NEED}`;
    }
}

function setStatus(text, tone = '') {
    refs.status.textContent = text || '';
    refs.status.className = `arena-status guess-status ${tone}`.trim();
}

function createNode(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function coverUrl(song) {
    if (!song || !song.cover) return '';
    return String(song.cover).replace(/^\.?\/?/, '');
}

function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count)) return '--';
    if (count >= 10000) return `${(count / 10000).toFixed(1)}w`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
}

function formatAliases(song, maxCount) {
    const list = Array.isArray(song && song.aliases) ? song.aliases : [];
    const cleaned = list.map(item => String(item || '').trim()).filter(Boolean);
    if (!cleaned.length) return '';
    const limit = Math.max(1, Number(maxCount) || 8);
    const shown = cleaned.slice(0, limit);
    const more = cleaned.length > limit ? ` 等${cleaned.length}个` : '';
    return shown.join(' / ') + more;
}

function formatDesignerCredit(song) {
    const designer = String((song && song.designer) || '').trim();
    const uploader = String((song && song.uploader) || '').trim();
    if (uploader && designer) {
        if (uploader === designer) return designer;
        return `${uploader}@${designer}`;
    }
    return designer || uploader || '';
}

const LEVEL_DIFF_CLASS = ['basic', 'advanced', 'expert', 'master', 'remaster'];

function fillLevelChips(container, song) {
    container.innerHTML = '';
    container.hidden = true;
    const levels = Array.isArray(song && song.levels) ? song.levels : [];
    const cleaned = levels.map(item => String(item || '').trim()).filter(Boolean);
    if (!cleaned.length) return;

    const row = createNode('div', 'guess-level-row');
    if (song && song.type) {
        row.appendChild(
            createNode('span', `guess-type-badge is-${String(song.type).toLowerCase()}`, String(song.type))
        );
    }
    cleaned.forEach((level, index) => {
        const diff = LEVEL_DIFF_CLASS[Math.min(index, LEVEL_DIFF_CLASS.length - 1)];
        row.appendChild(createNode('span', `guess-level-chip is-${diff}`, level));
    });
    container.appendChild(row);
    container.hidden = false;
}

function fillPrompt(song) {
    const fields = Array.isArray(GUESS_CONFIG.promptFields)
        ? GUESS_CONFIG.promptFields
        : ['artist'];
    refs.songTitle.textContent = (song && song.title) || '未命名曲目';

    if (refs.songArtist) {
        refs.songArtist.innerHTML = '';
        refs.songArtist.hidden = true;
        refs.songArtist.className = 'guess-song-artist';

        if (fields.includes('version') && song && song.version) {
            const badge = createNode('span', 'guess-version-badge', String(song.version));
            refs.songArtist.appendChild(badge);
            refs.songArtist.hidden = false;
            refs.songArtist.classList.add('is-version-row');
        } else if (fields.includes('designer')) {
            const credit = formatDesignerCredit(song);
            if (credit) {
                refs.songArtist.textContent = credit;
                refs.songArtist.hidden = false;
            }
        } else if (fields.includes('artist') && song && song.artist) {
            refs.songArtist.textContent = String(song.artist);
            refs.songArtist.hidden = false;
        }
    }

    if (refs.songLevels) {
        if (fields.includes('levels')) fillLevelChips(refs.songLevels, song);
        else {
            refs.songLevels.innerHTML = '';
            refs.songLevels.hidden = true;
        }
    }

    if (refs.songMeta) {
        refs.songMeta.innerHTML = '';
        refs.songMeta.hidden = true;
        refs.songMeta.className = 'guess-song-meta';

        if (fields.includes('aliases')) {
            const aliasText = formatAliases(song, GUESS_CONFIG.aliasMax);
            if (aliasText) {
                refs.songMeta.appendChild(createNode('span', 'guess-alias-label', '别名'));
                refs.songMeta.appendChild(createNode('span', 'guess-alias-text', aliasText));
                refs.songMeta.hidden = false;
                refs.songMeta.classList.add('is-aliases');
            }
        }
    }
}

/** 均匀 [0,1)，优先用 crypto，避免 Math.random 在短会话里显得「扎堆」 */
function cryptoUnit() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0] / 4294967296;
    }
    return Math.random();
}

function randomBetween(min, max) {
    return min + cryptoUnit() * (max - min);
}

function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(cryptoUnit() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function refillAnswerDeck() {
    state.answerDeck = shuffle(usableSongs());
}

function takeAnswer() {
    const used = new Set(state.usedAnswerIds);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!state.answerDeck.length) refillAnswerDeck();
        while (state.answerDeck.length) {
            const song = state.answerDeck.pop();
            if (!used.has(song.id)) {
                state.usedAnswerIds.push(song.id);
                return song;
            }
        }
        // 本局答案已抽尽：清空后整库再洗一副
        state.usedAnswerIds = [];
        used.clear();
        refillAnswerDeck();
    }
    return state.answerDeck.pop() || null;
}

function rememberRecent(songs) {
    songs.forEach(song => {
        if (!song || !song.id) return;
        state.recentCoverIds.push(song.id);
    });
    // 只保留最近约 3 轮的格子，避免干扰池被掏空
    const keep = GRID_SIZE * 3;
    if (state.recentCoverIds.length > keep) {
        state.recentCoverIds = state.recentCoverIds.slice(-keep);
    }
}

function pickDistractors(answer, count) {
    const answerCover = coverKey(answer);
    const recent = new Set(state.recentCoverIds);
    const pool = shuffle(
        usableSongs().filter(song => song.id !== answer.id && coverKey(song) !== answerCover)
    );

    const preferred = [];
    const cooled = [];
    for (const song of pool) {
        if (recent.has(song.id)) cooled.push(song);
        else preferred.push(song);
    }

    const picked = [];
    const seenCover = new Set([answerCover]);
    for (const list of [preferred, cooled]) {
        for (const song of list) {
            if (picked.length >= count) break;
            const key = coverKey(song);
            if (seenCover.has(key)) continue;
            seenCover.add(key);
            picked.push(song);
        }
    }
    return picked;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('cover load failed'));
        img.src = src;
    });
}

function paintClue(canvas, cropEl, img) {
    const cssSize = Math.max(120, Math.floor(cropEl.clientWidth || 160));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.floor(cssSize * dpr);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const sourceSize = Math.min(img.naturalWidth, img.naturalHeight);
    const zoom = randomBetween(
        Number(GUESS_CONFIG.cropZoomMin) || 0.38,
        Number(GUESS_CONFIG.cropZoomMax) || 0.58
    );
    const cropSide = Math.max(36, sourceSize * zoom);
    const maxX = Math.max(0, img.naturalWidth - cropSide);
    const maxY = Math.max(0, img.naturalHeight - cropSide);
    const sx = randomBetween(0, maxX);
    const sy = randomBetween(0, maxY);
    const pad = Math.floor(size * 0.08);
    ctx.drawImage(img, sx, sy, cropSide, cropSide, -pad, -pad, size + pad * 2, size + pad * 2);

    const vignette = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        size * 0.42,
        size * 0.5,
        size * 0.5,
        size * 0.82
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.72, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    const blurPx = randomBetween(1.0, 1.8);
    canvas.style.filter = `blur(${blurPx.toFixed(1)}px) saturate(1.02) brightness(0.97)`;
}

function coverKey(song) {
    return coverUrl(song) || String(song && song.id || '');
}

function usableSongs() {
    return state.songs.filter(song => song.id && coverUrl(song));
}

function buildRound() {
    const pool = usableSongs();
    if (pool.length < GRID_SIZE) return null;

    const answer = takeAnswer();
    if (!answer) return null;

    const distractors = pickDistractors(answer, GRID_SIZE - 1);
    if (distractors.length < GRID_SIZE - 1) return null;

    // 格位再洗一次，避免正确答案总落在牌堆顺序相关位置
    return { answer, options: shuffle([answer, ...distractors]) };
}

function showResult(passed) {
    state.finished = true;
    refs.playPanel.hidden = true;
    refs.revealPanel.hidden = true;
    refs.resultPanel.hidden = false;
    updateScoreboard();

    if (IS_ENDLESS) {
        const answerTitle = (state.answer && state.answer.title) || '未知曲目';
        refs.resultTitle.textContent = '死亡';
        refs.resultText.textContent =
            `本局得分 ${state.score}` +
            (state.bestScore > 0 ? ` · 最佳 ${state.bestScore}` : '') +
            `。答错曲目：${answerTitle}`;
        setStatus('无尽模式结算', 'error');
        return;
    }

    if (passed) {
        refs.resultTitle.textContent = '通过';
        refs.resultText.textContent = `10 轮内答对 ${state.passCount} 轮，过关。`;
        setStatus('本局通过', 'success');
    } else {
        refs.resultTitle.textContent = '未通过';
        refs.resultText.textContent = `通过 ${state.passCount} / ${PASS_NEED}，再开一局试试。`;
        setStatus('本局结束', 'error');
    }
}

function renderReveal(correct) {
    refs.revealCard.innerHTML = '';
    const wrap = createNode('div', 'guess-reveal-cover-wrap');
    const img = document.createElement('img');
    img.className = 'guess-reveal-cover';
    img.src = coverUrl(state.answer);
    img.alt = `${state.answer.title || '曲目'} Cover`;
    img.onerror = () => {
        wrap.textContent = 'NO COVER';
        img.remove();
    };
    wrap.appendChild(img);

    const info = createNode('div', 'guess-reveal-info');
    const badge = createNode(
        'div',
        `guess-reveal-badge ${correct ? 'is-pass' : 'is-fail'}`,
        correct ? '答对了' : '答错了'
    );
    info.appendChild(badge);
    info.appendChild(createNode('div', 'guess-reveal-title', state.answer.title || '未命名曲目'));
    const designerCredit = formatDesignerCredit(state.answer);
    info.appendChild(
        createNode(
            'div',
            'guess-reveal-artist',
            designerCredit || state.answer.artist || '--'
        )
    );
    const aliasText = formatAliases(state.answer, GUESS_CONFIG.aliasMax);
    const versionNode = state.answer.version
        ? createNode('div', 'guess-reveal-version-wrap')
        : null;
    if (versionNode) {
        versionNode.appendChild(createNode('span', 'guess-version-badge', String(state.answer.version)));
        info.appendChild(versionNode);
    }
    info.appendChild(
        createNode(
            'div',
            'guess-reveal-meta',
            [
                aliasText ? `别名 ${aliasText}` : '',
                state.answer.plays != null ? `游玩 ${formatCount(state.answer.plays)}` : '',
                state.answer.type ? String(state.answer.type) : ''
            ]
                .filter(Boolean)
                .join(' · ') || ''
        )
    );

    refs.revealCard.append(wrap, info);
}

function afterJudge(correct) {
    state.roundIndex += 1;
    state.lastCorrect = correct;

    if (IS_ENDLESS) {
        if (correct) {
            state.score += 1;
            if (state.score > state.bestScore) {
                state.bestScore = state.score;
                saveBestScore(state.bestScore);
            }
        }
        updateScoreboard();
        window.setTimeout(() => {
            if (correct) {
                // 答对：短暂反馈后直接下一题
                startRound();
                setStatus(`连对 ${state.score} · 继续挑战`, 'success');
            } else {
                // 答错：跳过揭晓，直接死亡结算
                showResult(false);
            }
        }, 900);
        return;
    }

    if (correct) state.passCount += 1;
    updateScoreboard();

    window.setTimeout(() => {
        refs.playPanel.hidden = true;
        refs.revealPanel.hidden = false;
        renderReveal(correct);
        setStatus(correct ? '答案揭晓' : '正确答案如下');
    }, 900);
}

function goNextAfterReveal() {
    if (IS_ENDLESS) {
        startRound();
        return;
    }
    if (state.passCount >= PASS_NEED) {
        showResult(true);
        return;
    }
    if (state.roundIndex >= TOTAL_ROUNDS) {
        showResult(state.passCount >= PASS_NEED);
        return;
    }
    startRound();
}

function onPick(songId, tile) {
    if (state.locked || state.finished) return;
    state.locked = true;

    const correct = songId === state.answer.id;
    const tiles = Array.from(refs.coverGrid.querySelectorAll('.guess-tile'));
    tiles.forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.songId === state.answer.id) {
            btn.classList.add(correct && btn === tile ? 'is-correct' : 'is-missed-correct');
        }
        if (btn === tile && !correct) btn.classList.add('is-wrong');
    });

    setStatus(correct ? '选对了！' : '选错了', correct ? 'success' : 'error');
    afterJudge(correct);
}

function renderGrid(options) {
    refs.coverGrid.innerHTML = '';
    options.forEach(song => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'guess-tile';
        tile.dataset.songId = song.id;
        tile.setAttribute('aria-label', '曲绘选项');

        const crop = createNode('div', 'guess-tile-crop');
        const canvas = document.createElement('canvas');
        canvas.className = 'guess-tile-canvas';
        crop.appendChild(canvas);
        tile.appendChild(crop);
        tile.addEventListener('click', () => onPick(song.id, tile));
        refs.coverGrid.appendChild(tile);

        loadImage(coverUrl(song))
            .then(img => {
                if (!state.options.includes(song)) return;
                paintClue(canvas, crop, img);
            })
            .catch(() => {
                canvas.style.filter = 'none';
                const ctx = canvas.getContext('2d');
                canvas.width = 160;
                canvas.height = 160;
                ctx.fillStyle = '#2a2b2d';
                ctx.fillRect(0, 0, 160, 160);
            });
    });
}

function startRound() {
    const round = buildRound();
    if (!round) {
        setStatus(`曲库不足 ${GRID_SIZE} 首，请先同步更多封面`, 'error');
        refs.playPanel.hidden = true;
        return;
    }

    state.answer = round.answer;
    state.options = round.options;
    state.locked = false;
    rememberRecent(round.options);

    refs.resultPanel.hidden = true;
    refs.revealPanel.hidden = true;
    refs.playPanel.hidden = false;
    refs.scoreboard.hidden = false;
    fillPrompt(round.answer);
    updateScoreboard();
    renderGrid(round.options);
    if (IS_ENDLESS) {
        setStatus(state.score > 0 ? `连对 ${state.score} · 选出曲绘` : '无尽模式：点错即死，答对计分');
    } else {
        setStatus(`第 ${state.roundIndex + 1} 轮：根据歌名选出对应曲绘`);
    }
}

function restartGame() {
    state.roundIndex = 0;
    state.passCount = 0;
    state.score = 0;
    state.answer = null;
    state.options = [];
    state.locked = false;
    state.finished = false;
    state.lastCorrect = false;
    state.usedAnswerIds = [];
    state.recentCoverIds = [];
    state.bestScore = loadBestScore();
    // 每开一局 / 刷新后整库重新洗牌，打破曲库按热度排序带来的体感偏差
    refillAnswerDeck();
    refs.resultPanel.hidden = true;
    refs.revealPanel.hidden = true;
    updateScoreboard();
    startRound();
}

async function loadCatalog() {
    setStatus('加载曲库中...');
    const response = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const songs = Array.isArray(data.songs) ? data.songs : [];
    // 入库即洗牌，后续任何按序遍历都不偏向热门前列
    state.songs = shuffle(songs.filter(song => song && song.id && coverUrl(song)));
    if (state.songs.length < GRID_SIZE) {
        setStatus(GUESS_CONFIG.emptyHint, 'error');
        refs.playPanel.hidden = true;
        refs.scoreboard.hidden = true;
        return;
    }
    restartGame();
}

function bindEvents() {
    refs.nextBtn.addEventListener('click', goNextAfterReveal);
    refs.restartBtn.addEventListener('click', restartGame);
}

async function init() {
    initRefs();
    state.bestScore = loadBestScore();
    setupModeUi();
    if (GUESS_CONFIG.gridClass) {
        refs.coverGrid.classList.add(GUESS_CONFIG.gridClass);
    }
    bindEvents();
    try {
        await loadCatalog();
    } catch (err) {
        console.error(err);
        setStatus(`曲库加载失败：${err.message || err}`, 'error');
    }
}

init();
