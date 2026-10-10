/* ==========================================================================
   Marked – storage.js
   Everything that touches localStorage lives here. app.js never calls
   localStorage directly, so swapping in a backend later only means
   rewriting this file.

   Saved shape (key "marked:v1:state"):
   {
     version: 1,
     tasks:      [{ id, title, description, dueDate, priority, category,
                    completed, createdAt, completedAt }],
     categories: [{ id, name, color }],
     settings:   { userName, sort },
     savedAt:    <timestamp in ms>
   }
   ========================================================================== */

const TodoStore = (() => {
  'use strict';

  const STATE_KEY = 'marked:v1:state';
  const BACKUP_KEY = 'marked:v1:corrupt-backup';
  const THEME_KEY = 'marked:theme';

  const PRIORITIES = ['low', 'medium', 'high'];
  const SORTS = ['newest', 'due', 'priority'];

  // If localStorage is blocked (private mode, strict settings), keep
  // working in memory so the app still runs for the current visit.
  const memory = {};

  function read(key) {
    try { return window.localStorage.getItem(key); }
    catch { return memory[key] ?? null; }
  }

  function write(key, value) {
    memory[key] = value;
    try { window.localStorage.setItem(key, value); return true; }
    catch { return false; }
  }

  function remove(key) {
    delete memory[key];
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }

  /* ---------- Helpers ---------- */

  function uid(prefix = 't') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function defaultCategories() {
    return [
      { id: 'c_study', name: 'Study', color: '#3A3FD8' },
      { id: 'c_personal', name: 'Personal', color: '#0E9F85' },
      { id: 'c_project', name: 'Project', color: '#D9480F' }
    ];
  }

  function defaults() {
    return {
      version: 1,
      tasks: [],
      categories: defaultCategories(),
      settings: { userName: '', sort: 'newest' },
      savedAt: null
    };
  }

  /* ---------- Validation (never trust what comes out of storage or a file) ---------- */

  function cleanCategory(raw, seen) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name ?? '').trim().slice(0, 24);
    if (!name) return null;
    let id = typeof raw.id === 'string' && raw.id ? raw.id : uid('c');
    if (seen.has(id)) id = uid('c');
    seen.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#3A3FD8';
    return { id, name, color };
  }

  function cleanTask(raw, categoryIds, seen) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title ?? '').trim().slice(0, 120);
    if (!title) return null;
    let id = typeof raw.id === 'string' && raw.id ? raw.id : uid('t');
    if (seen.has(id)) id = uid('t');
    seen.add(id);
    const completed = raw.completed === true;
    return {
      id,
      title,
      description: String(raw.description ?? '').trim().slice(0, 500),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : '',
      priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'medium',
      category: categoryIds.has(raw.category) ? raw.category : '',
      completed,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      completedAt: completed && Number.isFinite(raw.completedAt) ? raw.completedAt : null
    };
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;

    const seenCats = new Set();
    const categories = Array.isArray(raw.categories)
      ? raw.categories.map(c => cleanCategory(c, seenCats)).filter(Boolean)
      : defaultCategories();
    const categoryIds = new Set(categories.map(c => c.id));

    const seenTasks = new Set();
    const tasks = raw.tasks.map(t => cleanTask(t, categoryIds, seenTasks)).filter(Boolean);

    const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    return {
      version: 1,
      tasks,
      categories,
      settings: {
        userName: String(s.userName ?? '').trim().slice(0, 30),
        sort: SORTS.includes(s.sort) ? s.sort : 'newest'
      },
      savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : null
    };
  }

  /* ---------- Public API ---------- */

  function load() {
    const text = read(STATE_KEY);
    if (!text) return defaults();
    try {
      return sanitize(JSON.parse(text)) ?? defaults();
    } catch {
      // Unreadable data: keep a copy instead of silently destroying it.
      write(BACKUP_KEY, text);
      return defaults();
    }
  }

  // Sets state.savedAt, writes everything, returns true if it reached localStorage.
  function save(state) {
    state.savedAt = Date.now();
    return write(STATE_KEY, JSON.stringify(state));
  }

  function clear() {
    remove(STATE_KEY);
    remove(BACKUP_KEY);
  }

  function exportJSON(state) {
    return JSON.stringify(state, null, 2);
  }

  // Returns a clean state object, or null if the text isn't a valid export.
  function parseImport(text) {
    try { return sanitize(JSON.parse(text)); }
    catch { return null; }
  }

  function getTheme() {
    const t = read(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  }

  function setTheme(theme) {
    write(THEME_KEY, theme);
  }

  return {
    STATE_KEY,
    uid,
    defaults,
    load,
    save,
    clear,
    exportJSON,
    parseImport,
    getTheme,
    setTheme
  };
})();
