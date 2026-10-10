/* ==========================================================================
   Marked – app.js
   UI, state and events. Persistence lives in storage.js (TodoStore).
   Extra-credit features: dark mode, overdue highlighting, category colors,
   keyboard shortcuts.
   ========================================================================== */

(() => {
  'use strict';

  /* ---------- Constants ---------- */

  const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
  const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
  const STATUS_TITLE = { all: 'All tasks', active: 'Active tasks', completed: 'Completed tasks' };
  const CATEGORY_COLORS = ['#3A3FD8', '#0E9F85', '#D9480F', '#B5179E', '#2B8AC6', '#7A8B00', '#C2255C'];

  const ICONS = {
    edit: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m13.5 6.5 3 3"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>',
    calendar: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  /* ---------- State ---------- */

  let state = TodoStore.load();
  const ui = { status: 'all', category: 'all', priority: 'all', search: '' };
  let editingId = null;
  let rerenderTimer = null;
  let toastTimer = null;

  /* ---------- DOM references ---------- */

  const $ = id => document.getElementById(id);

  const menuBtn = $('menuBtn'), scrim = $('scrim');
  const searchInput = $('searchInput'), themeBtn = $('themeBtn');
  const userBtn = $('userBtn'), userMenu = $('userMenu'), userNameInput = $('userNameInput');
  const userNameLabel = $('userNameLabel'), avatar = $('avatar');
  const exportBtn = $('exportBtn'), importBtn = $('importBtn'), importInput = $('importInput'), resetBtn = $('resetBtn');
  const statusList = $('statusList'), categoryList = $('categoryList'), priorityList = $('priorityList');
  const categoryForm = $('categoryForm'), categoryName = $('categoryName'), categoryColor = $('categoryColor');
  const addForm = $('addForm'), newTitle = $('newTitle'), newDesc = $('newDesc'), newDue = $('newDue');
  const newPriority = $('newPriority'), newCategory = $('newCategory');
  const viewTitle = $('viewTitle'), resultInfo = $('resultInfo'), clearFilters = $('clearFilters'), sortSelect = $('sortSelect');
  const taskList = $('taskList'), emptyState = $('emptyState'), emptyTitle = $('emptyTitle'), emptyText = $('emptyText'), emptyClear = $('emptyClear');
  const leftCount = $('leftCount'), clearCompleted = $('clearCompleted'), savedStatus = $('savedStatus'), helpBtn = $('helpBtn');
  const editDialog = $('editDialog'), editForm = $('editForm'), editTitle = $('editTitle'), editDesc = $('editDesc');
  const editDue = $('editDue'), editPriority = $('editPriority'), editCategory = $('editCategory'), editCancel = $('editCancel');
  const confirmDialog = $('confirmDialog'), confirmTitle = $('confirmTitle'), confirmText = $('confirmText'), confirmOk = $('confirmOk');
  const helpDialog = $('helpDialog'), helpClose = $('helpClose');
  const toastEl = $('toast');

  /* ---------- Small helpers ---------- */

  // Build DOM nodes without innerHTML so user text can never be treated as markup.
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  }

  function iconEl(name) {
    const span = el('span', { class: 'icon-wrap' });
    span.innerHTML = ICONS[name]; // static markup defined above, no user data
    return span;
  }

  const find = id => state.tasks.find(t => t.id === id);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function toISO(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dueInfo(task) {
    if (!task.dueDate) return null;
    const today = parseISO(toISO(new Date()));
    const due = parseISO(task.dueDate);
    const diff = Math.round((due - today) / 86400000);

    let label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Tomorrow';
    else if (diff === -1) label = 'Yesterday';
    else {
      label = due.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: due.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }

    let status = 'later';
    if (task.completed) status = 'done';
    else if (diff < 0) status = 'overdue';
    else if (diff === 0) status = 'today';

    const text = status === 'overdue'
      ? (diff === -1 ? 'Overdue since yesterday' : `Overdue since ${label}`)
      : label;
    const full = due.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return { text, status, full };
  }

  /* ---------- Filtering and sorting ---------- */

  function filtersActive() {
    return ui.category !== 'all' || ui.priority !== 'all' || ui.search.trim() !== '';
  }

  function comparator(sort) {
    const newest = (a, b) => b.createdAt - a.createdAt;
    const dueCmp = (a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    };
    return (a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1; // finished tasks sink
      if (sort === 'due') return dueCmp(a, b) || newest(a, b);
      if (sort === 'priority') return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || dueCmp(a, b) || newest(a, b);
      return newest(a, b);
    };
  }

  function visibleTasks() {
    const q = ui.search.trim().toLowerCase();
    return state.tasks
      .filter(t => {
        if (ui.status === 'active' && t.completed) return false;
        if (ui.status === 'completed' && !t.completed) return false;
        if (ui.category !== 'all' && t.category !== ui.category) return false;
        if (ui.priority !== 'all' && t.priority !== ui.priority) return false;
        if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(comparator(state.settings.sort));
  }

  /* ---------- Rendering ---------- */

  function renderAll() {
    renderCategories();
    renderChrome();
    renderList();
  }

  function fillSelect(select) {
    const previous = select.value;
    select.replaceChildren(
      el('option', { value: '', text: 'No category' }),
      ...state.categories.map(c => el('option', { value: c.id, text: c.name }))
    );
    if (state.categories.some(c => c.id === previous)) select.value = previous;
  }

  function categoryItem(cat, deletable) {
    const dot = el('span', { class: cat.color ? 'dot' : 'dot ring' });
    if (cat.color) dot.style.background = cat.color;

    const li = el('li', { class: 'nav-row' },
      el('button', { type: 'button', class: 'nav-item', dataset: { category: cat.id } },
        dot,
        el('span', { class: 'nav-label', text: cat.name }),
        el('span', { class: 'count', dataset: { count: cat.id }, text: '0' })
      )
    );
    if (deletable) {
      const del = el('button', {
        type: 'button',
        class: 'nav-delete',
        'aria-label': `Delete category ${cat.name}`,
        title: 'Delete category',
        dataset: { deleteCategory: cat.id }
      });
      del.append(iconEl('x'));
      li.append(del);
    }
    return li;
  }

  function renderCategories() {
    categoryList.replaceChildren(
      categoryItem({ id: 'all', name: 'All categories' }, false),
      ...state.categories.map(c => categoryItem(c, true))
    );
    fillSelect(newCategory);
    fillSelect(editCategory);
    updateNav();
  }

  function setCounts(list, counts) {
    list.querySelectorAll('[data-count]').forEach(node => {
      node.textContent = counts[node.dataset.count] ?? 0;
    });
  }

  function markCurrent(list, key, value) {
    list.querySelectorAll(`[data-${key}]`).forEach(btn => {
      if (btn.dataset[key] === value) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  // Updates counts and highlights without rebuilding the sidebar (keeps keyboard focus).
  function updateNav() {
    const total = state.tasks.length;
    const active = state.tasks.filter(t => !t.completed).length;
    setCounts(statusList, { all: total, active, completed: total - active });

    const byCategory = { all: total };
    const byPriority = { all: total, high: 0, medium: 0, low: 0 };
    for (const t of state.tasks) {
      if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      byPriority[t.priority]++;
    }
    setCounts(categoryList, byCategory);
    setCounts(priorityList, byPriority);

    markCurrent(statusList, 'status', ui.status);
    markCurrent(categoryList, 'category', ui.category);
    markCurrent(priorityList, 'priority', ui.priority);
  }

  function renderChrome() {
    updateNav();

    const total = state.tasks.length;
    const left = state.tasks.filter(t => !t.completed).length;
    const done = total - left;
    leftCount.textContent = total === 0 ? 'No tasks yet' : left === 0 ? 'All tasks done' : `${plural(left, 'task', 'tasks')} left`;
    clearCompleted.disabled = done === 0;
    clearCompleted.textContent = done ? `Clear completed (${done})` : 'Clear completed';

    viewTitle.textContent = STATUS_TITLE[ui.status];
    const shown = visibleTasks().length;
    resultInfo.textContent = filtersActive()
      ? `Showing ${shown} of ${plural(total, 'task', 'tasks')}`
      : plural(shown, 'task', 'tasks');
    clearFilters.hidden = !filtersActive();
  }

  function renderSaved(ok = true) {
    savedStatus.classList.toggle('warn', !ok);
    if (!ok) {
      savedStatus.textContent = 'Not saved: browser storage is blocked';
    } else if (state.savedAt) {
      const time = new Date(state.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      savedStatus.textContent = `Last saved ${time}`;
    } else {
      savedStatus.textContent = 'Nothing saved yet';
    }
  }

  function taskItem(t) {
    const cat = state.categories.find(c => c.id === t.category);
    const due = dueInfo(t);
    const classes = ['task'];
    if (t.completed) classes.push('done');
    if (due && due.status === 'overdue') classes.push('overdue');

    const checkbox = el('input', {
      type: 'checkbox',
      class: 'check',
      checked: t.completed,
      'aria-labelledby': `title-${t.id}`,
      dataset: { action: 'toggle' }
    });

    const meta = el('div', { class: 'task-meta' },
      el('span', { class: `chip chip-priority p-${t.priority}` }, el('span', { class: 'dot' }), `${PRIORITY_LABEL[t.priority]} priority`)
    );
    if (cat) {
      const dot = el('span', { class: 'dot' });
      dot.style.background = cat.color;
      meta.append(el('span', { class: 'chip' }, dot, cat.name));
    }
    if (due) {
      meta.append(el('span', { class: `chip chip-due due-${due.status}`, title: due.full }, iconEl('calendar'), due.text));
    }

    const body = el('div', { class: 'task-body' },
      el('span', { class: 'task-title', id: `title-${t.id}`, text: t.title }),
      t.description ? el('p', { class: 'task-desc', text: t.description }) : null,
      meta
    );

    const editBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Edit task', 'aria-label': `Edit ${t.title}`, dataset: { action: 'edit' } }, iconEl('edit'));
    const deleteBtn = el('button', { type: 'button', class: 'icon-btn danger', title: 'Delete task', 'aria-label': `Delete ${t.title}`, dataset: { action: 'delete' } }, iconEl('trash'));

    return el('li', { class: classes.join(' '), dataset: { id: t.id } },
      checkbox,
      body,
      el('div', { class: 'task-actions' }, editBtn, deleteBtn)
    );
  }

  function renderEmpty(shown) {
    emptyState.hidden = shown > 0;
    if (shown > 0) return;

    let title, text, canClear = false;
    if (state.tasks.length === 0) {
      title = 'No tasks yet — add one!';
      text = 'Type a title above and press Enter. Add a due date or priority if it helps.';
    } else if (filtersActive()) {
      title = 'No tasks match these filters';
      text = 'Try a different search, or clear the filters to see everything.';
      canClear = true;
    } else if (ui.status === 'completed') {
      title = 'Nothing completed yet';
      text = 'Tick a task and it will show up here.';
    } else {
      title = 'Everything is done';
      text = 'Add a new task, or clear your completed ones.';
    }
    emptyTitle.textContent = title;
    emptyText.textContent = text;
    emptyClear.hidden = !canClear;
  }

  function renderList() {
    // Remember keyboard focus so re-rendering doesn't drop it.
    const active = document.activeElement;
    const focusItem = active && taskList.contains(active) ? active.closest('.task') : null;
    const focusId = focusItem ? focusItem.dataset.id : null;
    const focusAction = focusItem ? active.dataset.action : null;

    const tasks = visibleTasks();
    taskList.replaceChildren(...tasks.map(taskItem));
    taskList.hidden = tasks.length === 0;
    renderEmpty(tasks.length);

    if (focusId) {
      const target = taskList.querySelector(`[data-id="${CSS.escape(focusId)}"] [data-action="${focusAction}"]`);
      (target || viewTitle).focus();
    }
  }

  /* ---------- Persistence ---------- */

  function persist() {
    renderSaved(TodoStore.save(state));
  }

  /* ---------- Toast and confirm dialog ---------- */

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function askConfirm({ title, text, okLabel }) {
    return new Promise(resolve => {
      confirmTitle.textContent = title;
      confirmText.textContent = text;
      confirmOk.textContent = okLabel;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
      confirmDialog.showModal();
    });
  }

  /* ---------- Task actions ---------- */

  function addTask(e) {
    e.preventDefault();
    const title = newTitle.value.trim();
    if (!title) {
      newTitle.setCustomValidity('Enter a task title');
      newTitle.reportValidity();
      return;
    }

    const task = {
      id: TodoStore.uid('t'),
      title,
      description: newDesc.value.trim(),
      dueDate: newDue.value,
      priority: newPriority.value,
      category: newCategory.value,
      completed: false,
      createdAt: Date.now(),
      completedAt: null
    };
    state.tasks.push(task);
    if (ui.status === 'completed') ui.status = 'all';
    persist();
    renderChrome();
    renderList();

    const stillVisible = visibleTasks().some(t => t.id === task.id);
    toast(stillVisible ? 'Task added' : 'Task added, but your filters are hiding it');

    const keepCategory = newCategory.value;
    addForm.reset();
    newCategory.value = keepCategory;
    newTitle.focus();
  }

  function toggleTask(id) {
    const t = find(id);
    if (!t) return;
    t.completed = !t.completed;
    t.completedAt = t.completed ? Date.now() : null;
    persist();

    // Animate the marker line on the existing row first, then re-sort.
    const row = taskList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) row.classList.toggle('done', t.completed);
    renderChrome();
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(renderList, 450);
  }

  function openEdit(id) {
    const t = find(id);
    if (!t) return;
    editingId = id;
    editTitle.value = t.title;
    editTitle.setCustomValidity('');
    editDesc.value = t.description;
    editDue.value = t.dueDate;
    editPriority.value = t.priority;
    editCategory.value = t.category;
    editDialog.showModal();
    editTitle.focus();
  }

  function saveEdit(e) {
    e.preventDefault();
    const title = editTitle.value.trim();
    if (!title) {
      editTitle.setCustomValidity('Enter a task title');
      editTitle.reportValidity();
      return;
    }
    const t = find(editingId);
    if (t) {
      Object.assign(t, {
        title,
        description: editDesc.value.trim(),
        dueDate: editDue.value,
        priority: editPriority.value,
        category: editCategory.value
      });
      persist();
    }
    editDialog.close();
    renderChrome();
    renderList();
    toast('Changes saved');
  }

  async function deleteTask(id) {
    const t = find(id);
    if (!t) return;
    const ok = await askConfirm({
      title: 'Delete this task?',
      text: `“${t.title}” will be removed. This can’t be undone.`,
      okLabel: 'Delete task'
    });
    if (!ok) return;
    state.tasks = state.tasks.filter(x => x.id !== id);
    persist();
    renderChrome();
    renderList();
    toast('Task deleted');
  }

  async function clearCompletedTasks() {
    const done = state.tasks.filter(t => t.completed).length;
    if (!done) return;
    const ok = await askConfirm({
      title: 'Clear completed tasks?',
      text: `${plural(done, 'completed task', 'completed tasks')} will be removed. This can’t be undone.`,
      okLabel: 'Clear completed'
    });
    if (!ok) return;
    state.tasks = state.tasks.filter(t => !t.completed);
    persist();
    renderChrome();
    renderList();
    toast('Completed tasks cleared');
  }

  /* ---------- Categories ---------- */

  function addCategory(e) {
    e.preventDefault();
    const name = categoryName.value.trim();
    if (!name) {
      categoryName.setCustomValidity('Enter a category name');
      categoryName.reportValidity();
      return;
    }
    if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      categoryName.setCustomValidity('That category already exists');
      categoryName.reportValidity();
      return;
    }
    state.categories.push({ id: TodoStore.uid('c'), name, color: categoryColor.value });
    persist();
    renderCategories();
    categoryForm.reset();
    categoryColor.value = CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length].toLowerCase();
    toast(`Added category “${name}”`);
  }

  async function deleteCategory(id) {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    const used = state.tasks.filter(t => t.category === id).length;
    const ok = await askConfirm({
      title: `Delete “${cat.name}”?`,
      text: used ? `Its ${plural(used, 'task', 'tasks')} will stay, with no category.` : 'No tasks use this category.',
      okLabel: 'Delete category'
    });
    if (!ok) return;
    state.categories = state.categories.filter(c => c.id !== id);
    state.tasks.forEach(t => { if (t.category === id) t.category = ''; });
    if (ui.category === id) ui.category = 'all';
    persist();
    renderCategories();
    renderChrome();
    renderList();
    toast('Category deleted');
  }

  /* ---------- Filters, search, sidebar ---------- */

  function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  function afterFilterChange() {
    setSidebar(false);
    if (ui.category !== 'all') newCategory.value = ui.category;
    renderChrome();
    renderList();
  }

  function resetFilters() {
    ui.category = 'all';
    ui.priority = 'all';
    ui.search = '';
    searchInput.value = '';
    afterFilterChange();
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    TodoStore.setTheme(next);
  }

  /* ---------- User menu ---------- */

  function syncUser() {
    const name = state.settings.userName;
    userNameInput.value = name;
    userNameLabel.textContent = name || 'Guest';
    avatar.textContent = (name[0] || 'G').toUpperCase();
  }

  function setUserMenu(open) {
    userMenu.hidden = !open;
    userBtn.setAttribute('aria-expanded', String(open));
    if (open) userNameInput.focus();
  }

  function downloadExport() {
    const blob = new Blob([TodoStore.exportJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `marked-tasks-${toISO(new Date())}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setUserMenu(false);
    toast('Exported your tasks');
  }

  async function importFile() {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    setUserMenu(false);

    const imported = TodoStore.parseImport(await file.text());
    if (!imported) {
      toast('That file isn’t a valid Marked export');
      return;
    }
    const ok = await askConfirm({
      title: 'Replace your tasks?',
      text: `This swaps your current data for ${plural(imported.tasks.length, 'task', 'tasks')} from the file.`,
      okLabel: 'Replace'
    });
    if (!ok) return;
    state = imported;
    ui.category = 'all';
    ui.priority = 'all';
    persist();
    syncUser();
    sortSelect.value = state.settings.sort;
    renderAll();
    toast('Tasks imported');
  }

  async function resetAll() {
    setUserMenu(false);
    const ok = await askConfirm({
      title: 'Delete all data?',
      text: 'Every task, category and setting saved in this browser will be removed. Export first if you want a copy.',
      okLabel: 'Delete everything'
    });
    if (!ok) return;
    TodoStore.clear();
    state = TodoStore.defaults();
    ui.status = 'all';
    ui.category = 'all';
    ui.priority = 'all';
    ui.search = '';
    searchInput.value = '';
    sortSelect.value = state.settings.sort;
    syncUser();
    renderAll();
    renderSaved(true);
    toast('All data deleted');
  }

  /* ---------- Events ---------- */

  addForm.addEventListener('submit', addTask);
  editForm.addEventListener('submit', saveEdit);
  categoryForm.addEventListener('submit', addCategory);

  // Clear custom validation messages as soon as the person edits the field.
  [newTitle, editTitle, categoryName].forEach(input => {
    input.addEventListener('input', () => input.setCustomValidity(''));
  });

  taskList.addEventListener('change', e => {
    const box = e.target.closest('[data-action="toggle"]');
    if (box) toggleTask(box.closest('.task').dataset.id);
  });

  taskList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('.task').dataset.id;
    if (btn.dataset.action === 'edit') openEdit(id);
    if (btn.dataset.action === 'delete') deleteTask(id);
  });

  statusList.addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    ui.status = btn.dataset.status;
    afterFilterChange();
  });

  priorityList.addEventListener('click', e => {
    const btn = e.target.closest('[data-priority]');
    if (!btn) return;
    ui.priority = btn.dataset.priority;
    afterFilterChange();
  });

  categoryList.addEventListener('click', e => {
    const del = e.target.closest('[data-delete-category]');
    if (del) { deleteCategory(del.dataset.deleteCategory); return; }
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    ui.category = btn.dataset.category;
    afterFilterChange();
  });

  searchInput.addEventListener('input', () => {
    ui.search = searchInput.value;
    renderChrome();
    renderList();
  });

  sortSelect.addEventListener('change', () => {
    state.settings.sort = sortSelect.value;
    persist();
    renderList();
  });

  clearFilters.addEventListener('click', resetFilters);
  emptyClear.addEventListener('click', resetFilters);
  clearCompleted.addEventListener('click', clearCompletedTasks);

  themeBtn.addEventListener('click', toggleTheme);
  menuBtn.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
  scrim.addEventListener('click', () => setSidebar(false));

  userBtn.addEventListener('click', () => setUserMenu(userMenu.hidden));
  userNameInput.addEventListener('input', () => {
    state.settings.userName = userNameInput.value.trim().slice(0, 30);
    userNameLabel.textContent = state.settings.userName || 'Guest';
    avatar.textContent = (state.settings.userName[0] || 'G').toUpperCase();
    persist();
  });
  exportBtn.addEventListener('click', downloadExport);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', importFile);
  resetBtn.addEventListener('click', resetAll);
  document.addEventListener('click', e => {
    if (!userMenu.hidden && !e.target.closest('.user')) setUserMenu(false);
  });

  editCancel.addEventListener('click', () => editDialog.close());
  helpBtn.addEventListener('click', () => helpDialog.showModal());
  helpClose.addEventListener('click', () => helpDialog.close());

  // Clicking the dimmed backdrop closes a dialog.
  [editDialog, confirmDialog, helpDialog].forEach(dlg => {
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  });

  /* ---------- Keyboard shortcuts ---------- */

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape') {
      if (!userMenu.hidden) { setUserMenu(false); userBtn.focus(); return; }
      if (document.body.classList.contains('sidebar-open')) { setSidebar(false); return; }
      if (e.target === searchInput) {
        if (searchInput.value) {
          searchInput.value = '';
          ui.search = '';
          renderChrome();
          renderList();
        } else {
          searchInput.blur();
        }
      }
      return;
    }

    const tag = e.target.tagName;
    const typing = e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    if (typing || document.querySelector('dialog[open]')) return;

    switch (e.key) {
      case 'n': e.preventDefault(); newTitle.focus(); break;
      case '/': e.preventDefault(); searchInput.focus(); searchInput.select(); break;
      case 't': toggleTheme(); break;
      case '?': helpDialog.showModal(); break;
      case '1': ui.status = 'all'; afterFilterChange(); break;
      case '2': ui.status = 'active'; afterFilterChange(); break;
      case '3': ui.status = 'completed'; afterFilterChange(); break;
    }
  });

  /* ---------- Keep things in sync ---------- */

  // Another tab changed the data: pick it up.
  window.addEventListener('storage', e => {
    if (e.key !== TodoStore.STATE_KEY) return;
    state = TodoStore.load();
    if (ui.category !== 'all' && !state.categories.some(c => c.id === ui.category)) ui.category = 'all';
    sortSelect.value = state.settings.sort;
    syncUser();
    renderAll();
    renderSaved(true);
  });

  // "Today" and "Overdue" can change while the tab sits in the background.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderList();
  });

  /* ---------- Start ---------- */

  applyTheme(
    TodoStore.getTheme() ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  categoryColor.value = CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length].toLowerCase();
  sortSelect.value = state.settings.sort;
  syncUser();
  renderAll();
  renderSaved(true);
})();
