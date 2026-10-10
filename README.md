# Marked – a to-do app

A clean task manager built with plain HTML, CSS and JavaScript (no frameworks, no build step). Tasks are saved in the browser with `localStorage`, so they are still there after a refresh.

Web Programming course, Task 1.

## Run it

1. Download or clone the project.
2. Open `index.html` in a browser.

That's it. If you prefer a local server (for example the VS Code "Live Server" extension), that works too.

The fonts (Bricolage Grotesque and Figtree) load from Google Fonts. Offline, the app falls back to your system fonts and works the same.

## Project structure

```
todo-app/
├── index.html        Page structure: header, sidebar, main area, footer, dialogs
├── css/
│   └── styles.css    Design tokens, light and dark themes, layout, responsive rules
├── js/
│   ├── storage.js    All localStorage access, validation, import and export
│   └── app.js        State, rendering, events, keyboard shortcuts
└── README.md
```

`storage.js` loads before `app.js` and exposes one global, `TodoStore`. `app.js` never touches `localStorage` directly, so moving to a backend later means rewriting only `storage.js`.

## Features

### Required (MVP)

- **Add task**: the title is required. Description, due date, priority and category are optional.
- **Task list** with a checkbox on every row.
- **Complete a task**: a highlighter line is drawn through the title and the row fades back.
- **Edit task** in a modal dialog.
- **Delete task** with a confirmation dialog.
- **Filters**: All, Active, Completed.
- **Search** across titles and descriptions.
- **Sort** by newest, due date or priority. Finished tasks always sink to the bottom.
- **Counts**: "3 tasks left" in the footer, plus counts next to every filter in the sidebar.
- **Clear completed** button (asks first, shows how many will go).
- **Persistence** with `localStorage`. The footer shows when the data was last saved.

### Extra credit (4 chosen)

1. **Dark mode**: toggle in the header. It follows your system setting the first time and remembers your choice after that.
2. **Overdue highlighting**: overdue tasks get a red edge and a red date chip. Tasks due today get an accent chip. Dates read "Today", "Tomorrow" or "Overdue since yesterday".
3. **Categories with colors**: add your own categories with a color, filter by them, and delete them (tasks in a deleted category are kept, with no category).
4. **Keyboard shortcuts**: press `?` in the app to see them.

### Small extras

- Priority filter in the sidebar.
- Export and import your tasks as a JSON file (user menu, top right).
- Data syncs between browser tabs.
- Works on phones: the sidebar becomes a slide-in panel.
- Keyboard accessible, with visible focus and reduced-motion support.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `n` | Focus the new task field |
| `/` | Focus the search box |
| `1` `2` `3` | Show All, Active or Completed |
| `t` | Switch light or dark theme |
| `?` | Show the shortcuts list |
| `Esc` | Clear search, close menus and dialogs |

Shortcuts are ignored while you are typing in a field.

## How the data is stored

Everything lives under one key, `marked:v1:state`, as JSON:

```js
{
  version: 1,
  tasks: [{
    id, title, description,
    dueDate,        // "YYYY-MM-DD" or ""
    priority,       // "low" | "medium" | "high"
    category,       // a category id or ""
    completed, createdAt, completedAt
  }],
  categories: [{ id, name, color }],
  settings: { userName, sort },
  savedAt
}
```

The theme is stored separately under `marked:theme` so it can be applied before the page paints (no flash of the wrong theme).

Data read from storage or an imported file is validated and cleaned before use. If the saved data is unreadable, a copy is kept under `marked:v1:corrupt-backup` instead of being deleted.

If the browser blocks `localStorage` (some private modes), the app keeps working for the visit and the footer warns that changes won't be saved.

## Manual test checklist

- [ ] Adding a task with an empty or spaces-only title is blocked.
- [ ] A new task appears at the top of the list and survives a page refresh.
- [ ] Ticking a task draws the line, updates "tasks left" and moves it to the bottom.
- [ ] Editing changes every field, and cancelling changes nothing.
- [ ] Deleting asks first, and Cancel keeps the task.
- [ ] All / Active / Completed, category and priority filters combine correctly with search.
- [ ] Each sort option orders tasks as expected (tasks with no due date go last when sorting by due date).
- [ ] A task due yesterday is highlighted as overdue until it is completed.
- [ ] Clear completed removes only completed tasks.
- [ ] The empty state "No tasks yet — add one!" shows with no tasks.
- [ ] Dark mode persists after a refresh.
- [ ] Layout works at phone width (about 375px).

## Possible next steps

- User accounts with a backend, so tasks follow you between devices.
- Drag-and-drop reordering.
- Recurring tasks and due-date reminders.
- A stats view (completed this week, streak).
