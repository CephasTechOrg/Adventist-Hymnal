
/*
  Optimized hymna.js
  - Lazy-load lyrics
  - Render immediately after hymns.json loads
  - Use event delegation for hymn actions
  - Debounce search
  - Use pointerdown for faster mobile nav responses
  - Targeted DOM updates for favorites/notes/moods
  - Fix event scoping bugs
*/

// ---------- Sample fallback ----------
const sampleHymns = [ /* same sample objects as before (kept intentionally short here) */
    {
        id: 1,
        title: "Amazing Grace",
        lyrics: `Amazing grace! How sweet the sound
That saved a wretch like me! ...`,
        audio: "audio/hymn1.mp3",
        mood: "worshipful"
    },
    {
        id: 2,
        title: "How Great Thou Art",
        lyrics: `O Lord my God, when I in awesome wonder ...`,
        audio: "audio/hymn2.mp3",
        mood: "worshipful"
    },
    {
        id: 3,
        title: "Great Is Thy Faithfulness",
        lyrics: `Great is Thy faithfulness, O God my Father; ...`,
        audio: "audio/hymn3.mp3",
        mood: "calm"
    },
    {
        id: 4,
        title: "It Is Well With My Soul",
        lyrics: `When peace, like a river, attendeth my way, ...`,
        audio: "audio/hymn4.mp3",
        mood: "calm"
    },
    {
        id: 5,
        title: "Blessed Assurance",
        lyrics: `Blessed assurance, Jesus is mine! ...`,
        audio: "audio/hymn5.mp3",
        mood: "happy"
    }
];

// ---------- App State ----------
let hymns = [];                      // loaded from data/hymns.json (or fallback)
const lyricsCache = new Map();       // lazy-loaded lyrics cache keyed by hymn.id
let currentHymn = null;
const audio = new Audio();
let isPlaying = false;
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let notes = JSON.parse(localStorage.getItem('notes')) || {};
let moods = JSON.parse(localStorage.getItem('moods')) || {};
let currentMoodFilter = 'all';

// ---------- Elements (grab once) ----------
const hymnsContainer = document.getElementById('hymns-container');
const favoritesContainer = document.getElementById('favorites-container');
const notesContainer = document.getElementById('notes-container');
const moodContainer = document.getElementById('mood-container');
const hymnDetail = document.getElementById('hymn-detail');
const detailTitle = document.getElementById('detail-title');
const lyricsContainer = document.getElementById('lyrics-container');
const playBtn = document.getElementById('play-btn');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const favoriteBtn = document.getElementById('favorite-btn');
const notesBtn = document.getElementById('notes-btn');
const notesModal = document.getElementById('notes-modal');
const notesTextarea = document.getElementById('notes-textarea');
const notesSave = document.getElementById('notes-save');
const notesCancel = document.getElementById('notes-cancel');
const notesClose = document.getElementById('notes-close');
const detailClose = document.getElementById('detail-close');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const themeToggle = document.getElementById('theme-toggle');
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const miniPlayer = document.getElementById('mini-player');
const miniPlayerTitle = document.getElementById('mini-player-title');
const miniPlayBtn = document.getElementById('mini-play-btn');
const miniPlayerClose = document.getElementById('mini-player-close');
const moodOptions = document.querySelectorAll('.mood-option');

// optional loader in HTML (if you have one)
const loader = document.querySelector('.loader');

// ---------- Utilities ----------
const debounce = (fn, delay = 250) => {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
};

const throttle = (fn, limit = 100) => {
    let waiting = false;
    return (...args) => {
        if (!waiting) {
            fn(...args);
            waiting = true;
            setTimeout(() => (waiting = false), limit);
        }
    };
};

const showToast = (() => {
    let lastTimeout = null;
    return (message, ms = 1500) => {
        if (!toast || !toastMessage) return;
        toastMessage.textContent = message;
        toast.classList.add('show');
        if (lastTimeout) clearTimeout(lastTimeout);
        lastTimeout = setTimeout(() => toast.classList.remove('show'), ms);
    };
})();

const formatTime = (seconds = 0) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// ---------- Rendering Helpers ----------
function createHymnCardDOM(hymn) {
    // Returns an element for a hymn card (minimal markup)
    const card = document.createElement('div');
    card.className = 'hymn-card';
    card.dataset.id = hymn.id;

    const favActive = favorites.includes(hymn.id) ? ' active' : '';
    const preview = (hymn.lyrics || lyricsCache.get(hymn.id) || '').substring(0, 100);

    card.innerHTML = `
        <div class="hymn-number">${hymn.id}</div>
        <div class="hymn-image"><i class="fas fa-music"></i></div>
        <div class="hymn-content">
            <h3 class="hymn-title">${escapeHtml(hymn.title)}</h3>
            <p class="hymn-preview">${escapeHtml(preview)}${preview ? '...' : 'Lyrics not available'}</p>
            <div class="hymn-actions">
                <button class="favorite${favActive}" data-action="favorite" data-id="${hymn.id}">
                    <i class="${favorites.includes(hymn.id) ? 'fas' : 'far'} fa-heart"></i>
                    <span>Favorite</span>
                </button>
                <button class="play" data-action="play" data-id="${hymn.id}">
                    <i class="fas fa-play"></i>
                    <span>Play</span>
                </button>
            </div>
        </div>
    `;

    return card;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// render a list of hymns into a container (efficiently)
function renderHymnsList(hymnsArray, container) {
    if (!container) return;
    container.innerHTML = '';
    if (!hymnsArray || hymnsArray.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-music"></i>
                <h3>No hymns found</h3>
                <p>Try adjusting your search or filter</p>
            </div>
        `;
        return;
    }

    const frag = document.createDocumentFragment();
    for (const hymn of hymnsArray) {
        frag.appendChild(createHymnCardDOM(hymn));
    }
    container.appendChild(frag);
}

// Update a single hymn card (exists in the DOM) - for toggling favorite state etc.
function updateHymnCard(hymnId) {
    const card = (hymnsContainer && hymnsContainer.querySelector(`.hymn-card[data-id="${hymnId}"]`))
               || (favoritesContainer && favoritesContainer.querySelector(`.hymn-card[data-id="${hymnId}"]`))
               || (notesContainer && notesContainer.querySelector(`.hymn-card[data-id="${hymnId}"]`))
               || (moodContainer && moodContainer.querySelector(`.hymn-card[data-id="${hymnId}"]`));
    if (!card) return;
    const hymn = hymns.find(h => h.id === Number(hymnId));
    if (!hymn) return;
    const newCard = createHymnCardDOM(hymn);
    card.replaceWith(newCard);
}

// ---------- Data Loading ----------
async function loadHymns() {
    try {
        if (loader) loader.classList.add('visible');
        const res = await fetch('data/hymns.json');
        if (!res.ok) throw new Error('Failed to fetch hymns.json');
        const json = await res.json();
        hymns = Array.isArray(json) ? json : [];
    } catch (err) {
        console.warn('Could not load hymns.json — using fallback sampleHymns', err);
        hymns = sampleHymns.slice(); // fallback
        showToast('Using sample hymns (offline)');
    } finally {
        if (loader) loader.classList.remove('visible');
        // Render immediately — do NOT wait for lyrics fetches
        renderHymnsList(hymns, hymnsContainer);
        // update other lists
        updateFavoritesDisplay();
        updateNotesDisplay();
        updateMoodDisplay();
    }
}

// Lazy-load lyrics for a hymn (fetch once and cache)
async function fetchLyricsIfNeeded(hymn) {
    if (!hymn) return '';
    if (hymn.lyrics) {
        lyricsCache.set(hymn.id, hymn.lyrics);
        return hymn.lyrics;
    }
    if (lyricsCache.has(hymn.id)) return lyricsCache.get(hymn.id);

    // If hymn has a lyricsFile property, fetch it; otherwise, use lyrics in the object or placeholder
    const lyricsFile = hymn.lyricsFile || hymn.lyricsUrl || null;
    if (lyricsFile) {
        try {
            const r = await fetch(lyricsFile);
            if (r.ok) {
                const text = await r.text();
                lyricsCache.set(hymn.id, text);
                return text;
            }
        } catch (err) {
            console.warn('Error fetching lyrics for', hymn.id, err);
        }
    }

    // fallback: use inline lyrics if present; otherwise 'Lyrics not available'
    const fallback = hymn.lyrics || 'Lyrics not available';
    lyricsCache.set(hymn.id, fallback);
    return fallback;
}

// ---------- Interaction Handlers ----------

// Open hymn detail (lazy-load lyrics)
async function openHymnDetail(hymnId) {
    const id = Number(hymnId);
    const hymn = hymns.find(h => h.id === id);
    if (!hymn) return;

    currentHymn = hymn;

    detailTitle.textContent = hymn.title;
    // show 'loading...' quickly, then replace once lyrics loaded
    lyricsContainer.textContent = 'Loading lyrics…';

    // update favorite button
    const isFav = favorites.includes(id);
    favoriteBtn.innerHTML = `<i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                             <span>${isFav ? 'Remove from' : 'Add to'} Favorites</span>`;

    // mark mood buttons
    moodOptions.forEach(option => {
        option.classList.remove('active');
        if (moods[id] && option.dataset.mood === moods[id]) option.classList.add('active');
    });

    // lazy load lyrics
    const lyrics = await fetchLyricsIfNeeded(hymn);
    lyricsContainer.textContent = lyrics;

    // Setup audio source (do not rebind event listeners multiple times)
    if (audio.src !== hymn.audio) {
        audio.pause();
        audio.src = hymn.audio || '';
    }

    // ensure duration displayed when metadata loaded
    if (audio.duration) {
        durationEl.textContent = formatTime(audio.duration);
    } else {
        // wait for metadata once (do not attach duplicate listeners)
        const onMeta = function() {
            durationEl.textContent = formatTime(audio.duration);
            audio.removeEventListener('loadedmetadata', onMeta);
        };
        audio.addEventListener('loadedmetadata', onMeta);
    }

    // show detail
    hymnDetail.classList.add('active');
}

// Close detail
function closeHymnDetail() {
    hymnDetail.classList.remove('active');
    pauseAudio();
    currentHymn = null;
}

// toggle play/pause
function togglePlayback() {
    if (!currentHymn) return;
    if (isPlaying) pauseAudio();
    else playAudio();
}

function playAudio() {
    if (!currentHymn) return;
    audio.play()
        .then(() => {
            isPlaying = true;
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            miniPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
            miniPlayerTitle.textContent = `Now Playing: ${currentHymn.title}`;
            miniPlayer.classList.remove('hidden');
            showToast('Audio started playing', 1000);
        })
        .catch(err => {
            console.error('Audio play error', err);
            showToast('Cannot play audio (user gesture required?)');
        });
}

function pauseAudio() {
    audio.pause();
    isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
    miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
    showToast('Audio paused', 800);
}

// update progress (throttled to reduce layout thrashing)
const updateProgress = throttle(() => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = `${pct}%`;
    currentTimeEl.textContent = formatTime(audio.currentTime);
}, 150);

// set progress from click / touch
function setProgress(e) {
    if (!audio.duration) return;
    // support pointer events and touch — use boundingClientRect for accurate coords
    const rect = progressContainer.getBoundingClientRect();
    const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const clickX = clientX - rect.left;
    const width = rect.width || 1;
    audio.currentTime = Math.max(0, Math.min(1, clickX / width)) * audio.duration;
    // update UI immediately
    updateProgress();
}

// toggle favorite (efficient: updates localStorage and a single card)
function toggleFavorite(hymnId) {
    const id = Number(hymnId);
    const idx = favorites.indexOf(id);
    if (idx === -1) {
        favorites.push(id);
        showToast('Added to Favorites');
    } else {
        favorites.splice(idx, 1);
        showToast('Removed from Favorites');
    }
    localStorage.setItem('favorites', JSON.stringify(favorites));
    // update displays that might show this hymn
    updateFavoritesDisplay();
    // update open detail favorite btn if same hymn
    if (currentHymn && currentHymn.id === id) {
        const isFav = favorites.includes(id);
        favoriteBtn.innerHTML = `<i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                                 <span>${isFav ? 'Remove from' : 'Add to'} Favorites</span>`;
    }
    // update card in lists if present (targeted)
    updateHymnCard(id);
}

// update favorites container
function updateFavoritesDisplay() {
    const favHymns = hymns.filter(h => favorites.includes(h.id));
    renderHymnsList(favHymns, favoritesContainer);
}

// notes
function openNotesModal() {
    if (!currentHymn) return;
    notesTextarea.value = notes[currentHymn.id] || '';
    notesModal.classList.add('active');
}
function closeNotesModal() { notesModal.classList.remove('active'); }
function saveNote() {
    if (!currentHymn) return;
    const text = (notesTextarea.value || '').trim();
    if (text) {
        notes[currentHymn.id] = text;
        showToast('Note saved');
    } else {
        delete notes[currentHymn.id];
        showToast('Note cleared');
    }
    localStorage.setItem('notes', JSON.stringify(notes));
    closeNotesModal();
    updateNotesDisplay();
    updateHymnCard(currentHymn.id);
}
function updateNotesDisplay() {
    const withNotes = hymns.filter(h => notes[h.id]);
    renderHymnsList(withNotes, notesContainer);
}

// mood
function setMood(mood, evt) {
    if (!currentHymn) return;
    moods[currentHymn.id] = mood;
    localStorage.setItem('moods', JSON.stringify(moods));
    // update active state for mood options
    moodOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.mood === mood));
    showToast(`Mood set to ${mood}`);
    updateHymnCard(currentHymn.id);
}

function updateMoodDisplay() {
    let list = hymns;
    if (currentMoodFilter && currentMoodFilter !== 'all') {
        list = hymns.filter(h => moods[h.id] === currentMoodFilter);
    }
    renderHymnsList(list, moodContainer);
}

// export/import/reset
function exportData() {
    const data = { favorites, notes, moods };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hymn-haven-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Data exported');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                favorites = Array.isArray(data.favorites) ? data.favorites : favorites;
                notes = data.notes || notes;
                moods = data.moods || moods;
                localStorage.setItem('favorites', JSON.stringify(favorites));
                localStorage.setItem('notes', JSON.stringify(notes));
                localStorage.setItem('moods', JSON.stringify(moods));
                updateFavoritesDisplay();
                updateNotesDisplay();
                updateMoodDisplay();
                renderHymnsList(hymns, hymnsContainer);
                showToast('Data imported');
            } catch (err) {
                console.error('Import error', err);
                showToast('Import failed');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function resetData() {
    if (!confirm('Reset all saved data? This cannot be undone.')) return;
    favorites = [];
    notes = {};
    moods = {};
    localStorage.setItem('favorites', JSON.stringify(favorites));
    localStorage.setItem('notes', JSON.stringify(notes));
    localStorage.setItem('moods', JSON.stringify(moods));
    updateFavoritesDisplay();
    updateNotesDisplay();
    updateMoodDisplay();
    renderHymnsList(hymns, hymnsContainer);
    showToast('All data reset');
}

// ---------- Event Delegation for Hymn List ----------
function onHymnContainerClick(e) {
    // find the hymn-card ancestor
    const actionBtn = e.target.closest('button[data-action]');
    if (actionBtn) {
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        if (action === 'favorite') {
            e.stopPropagation();
            toggleFavorite(id);
            return;
        }
        if (action === 'play') {
            e.stopPropagation();
            // open detail and play
            openHymnDetail(id).then(() => {
                // small delay to ensure audio src set
                setTimeout(() => togglePlayback(), 120);
            });
            return;
        }
    }

    const card = e.target.closest('.hymn-card');
    if (card) {
        const id = card.dataset.id;
        openHymnDetail(id);
    }
}

// ---------- Navigation (fast on mobile) ----------
function switchPage(pageId, evt) {
    pages.forEach(p => p.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');
    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');

    // update dynamic content for certain pages
    if (pageId === 'favorites-page') updateFavoritesDisplay();
    if (pageId === 'notes-page') updateNotesDisplay();
    if (pageId === 'mood-page') updateMoodDisplay();
}

// ---------- Search / Filter ----------
function filterHymnsImmediate(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderHymnsList(hymns, hymnsContainer);
        return;
    }
    const filtered = hymns.filter(hymn => {
        const idStr = String(hymn.id);
        if (idStr === q || idStr.padStart(3, '0') === q) return true;
        if (hymn.title && hymn.title.toLowerCase().includes(q)) return true;
        const lyricsText = (hymn.lyrics || lyricsCache.get(hymn.id) || '');
        if (lyricsText && lyricsText.toLowerCase().includes(q)) return true;
        return false;
    });
    renderHymnsList(filtered, hymnsContainer);
}
const debouncedFilter = debounce((e) => filterHymnsImmediate(e.target.value), 250);

// ---------- Wiring Events (only once) ----------
function setupEventListeners() {
    // Hymn list delegation (works for all child lists too if you attach to each container)
    if (hymnsContainer) {
        hymnsContainer.addEventListener('click', onHymnContainerClick);
        // also support touch taps for faster mobile response
        hymnsContainer.addEventListener('click', onHymnContainerClick);
    }
    if (favoritesContainer) favoritesContainer.addEventListener('click', onHymnContainerClick);
    if (notesContainer) notesContainer.addEventListener('click', onHymnContainerClick);
    if (moodContainer) moodContainer.addEventListener('click', onHymnContainerClick);

    // Audio controls (single set of listeners)
    playBtn.addEventListener('click', togglePlayback);
    miniPlayBtn.addEventListener('click', togglePlayback);
    miniPlayerClose.addEventListener('click', () => {
        miniPlayer.classList.add('hidden');
        pauseAudio();
    });

    // audio progress events
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', () => {
        isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
    });

    // progress seeking (support pointer/touch)
    progressContainer.addEventListener('pointerdown', setProgress);
    progressContainer.addEventListener('click', setProgress);

    // hymn detail
    detailClose.addEventListener('click', closeHymnDetail);
    favoriteBtn.addEventListener('click', () => {
        if (currentHymn) toggleFavorite(currentHymn.id);
    });
    notesBtn.addEventListener('click', openNotesModal);

    // notes modal
    notesSave.addEventListener('click', saveNote);
    notesCancel.addEventListener('click', closeNotesModal);
    notesClose.addEventListener('click', closeNotesModal);
    notesModal.addEventListener('click', (e) => {
        if (e.target === notesModal) closeNotesModal();
    });

    // search
    if (searchBtn) searchBtn.addEventListener('click', () => filterHymnsImmediate(searchInput.value));
    if (searchInput) searchInput.addEventListener('input', debouncedFilter);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterHymnsImmediate(e.target.value); });

    // theme toggle
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark);
        themeToggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
    });

    // navigation: use pointerdown for immediate mobile feedback
    navItems.forEach(item => {
        item.addEventListener('pointerdown', (e) => {
            const pageId = item.getAttribute('data-page');
            switchPage(pageId, e);
        });
        // also keep click to support older browsers
        item.addEventListener('click', (e) => {
            const pageId = item.getAttribute('data-page');
            switchPage(pageId, e);
        });
    });

    // mood options
    moodOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const mood = option.dataset.mood;
            if (hymnDetail.classList.contains('active') && currentHymn) {
                setMood(mood, e);
            } else {
                currentMoodFilter = mood;
                // update active UI
                moodOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                updateMoodDisplay();
            }
        });
    });

    // settings buttons (export/import/reset)
    const exportBtn = document.getElementById('export-data');
    const importBtn = document.getElementById('import-data');
    const resetBtn = document.getElementById('reset-data');
    if (exportBtn) exportBtn.addEventListener('click', exportData);
    if (importBtn) importBtn.addEventListener('click', importData);
    if (resetBtn) resetBtn.addEventListener('click', resetData);
}

// ---------- Theme on load ----------
function applyStoredTheme() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// ---------- Init ----------
function initApp() {
    setupEventListeners();
    applyStoredTheme();
    loadHymns();
    // Keep favorites/notes/moods displays ready
    updateFavoritesDisplay();
    updateNotesDisplay();
    updateMoodDisplay();
}

// call init once DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
