function getBackendUrl() {
  const { hostname, port } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '3000' || port === '5500' || port === '5501') {
    return `http://${hostname}:3000`;
  }
  return '';
}
window.getBackendUrl = getBackendUrl;

const api = {
  get: async (url) => {
    const res = await fetch(getBackendUrl() + url, { credentials: 'include' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  post: async (url, body) => {
    const res = await fetch(getBackendUrl() + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  put: async (url, body) => {
    const res = await fetch(getBackendUrl() + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  delete: async (url) => {
    const res = await fetch(getBackendUrl() + url, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};
window.api = api;

document.addEventListener('DOMContentLoaded', () => {

  // -------------------- Time Synchronization --------------------
  let clockDrift = 0; // serverTime - browserTime (in ms)
  async function syncTime() {
    try {
      const start = Date.now();
      const { utcTime } = await api.get('/api/system/time');
      const end = Date.now();
      const serverTime = new Date(utcTime).getTime();
      const avgBrowserTime = (start + end) / 2;
      clockDrift = serverTime - avgBrowserTime;
      console.log(`[TimeSync] Server UTC: ${utcTime}`);
      console.log(`[TimeSync] Browser UTC: ${new Date().toISOString()}`);
      console.log(`[TimeSync] Clock Drift: ${clockDrift}ms (${(clockDrift / 60000).toFixed(2)} mins)`);
    } catch (e) {
      console.error('Time sync failed:', e);
    }
  }
  syncTime();

  // -------------------- To-Do --------------------
  const todoInput = document.getElementById('todo-input');
  const todoImportance = document.getElementById('todo-importance');
  const todoUrgency = document.getElementById('todo-urgency');
  const todoAdd = document.getElementById('todo-add');
  const todoLists = {
    do: document.getElementById('todo-list-do'),
    schedule: document.getElementById('todo-list-schedule'),
    delegate: document.getElementById('todo-list-delegate'),
    delete: document.getElementById('todo-list-delete'),
  };
  let todos = [];

  const quadrantOf = (imp, urg) => {
    if (urg === 'urgent' && imp === 'important') return 'do';
    if (urg !== 'urgent' && imp === 'important') return 'schedule';
    if (urg === 'urgent' && imp !== 'important') return 'delegate';
    return 'delete';
  };

  const renderTodos = () => {
    Object.values(todoLists).forEach(ul => ul && (ul.innerHTML = ''));

    // Filter out completed todos logic is handled by UI hiding or server deletion? 
    // For now we just render what we have. API returns sorted by created_at DESC.

    todos.forEach(t => {
      const li = document.createElement('li');
      li.className = `card flex items-center justify-between p-3 ${t.done ? 'opacity-50' : ''}`;
      li.innerHTML = `
        <div class="flex items-center gap-2 w-full">
          <input type="checkbox" ${t.done ? 'checked' : ''} class="h-4 w-4" data-action="toggle" data-id="${t.id}">
          <span class="${t.done ? 'line-through text-slate-400' : ''}">${t.text}</span>
        </div>
        <button class="icon-btn ml-2 text-red-500 hover:text-red-700" title="Delete" data-action="remove" data-id="${t.id}">
          <i data-lucide="trash" class="w-4 h-4"></i>
        </button>
      `;
      // Map DB priority/urgent to quadrant logic
      // DB: priority='important'/'not_important', urgent='urgent'/'not_urgent'
      const q = quadrantOf(t.priority, t.urgent);
      (todoLists[q] || todoLists.do).appendChild(li);
    });

    if (window.lucide) window.lucide.createIcons();
    updateStats();
  };

  const loadTodos = async () => {
    try {
      todos = await api.get('/api/todos');
      renderTodos();
    } catch (e) {
      console.error('Failed to load todos:', e);
    }
  };

  todoAdd?.addEventListener('click', async () => {
    const text = (todoInput?.value || '').trim();
    if (!text) return;
    const priority = todoImportance?.value || 'important';
    const urgent = todoUrgency?.value || 'urgent';

    try {
      const newTodo = await api.post('/api/todos', { text, priority, urgent });
      todos.unshift(newTodo);
      todoInput.value = '';
      renderTodos();
    } catch (e) {
      console.error('Failed to add todo:', e);
    }
  });

  Object.values(todoLists).forEach(ul => ul?.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;

    if (action === 'toggle') {
      const t = todos.find(x => x.id === id);
      if (t) {
        const newDone = !t.done;
        try {
          await api.put(`/api/todos/${id}`, { done: newDone });
          t.done = newDone;
          renderTodos();
        } catch (e) {
          console.error('Failed to update todo:', e);
        }
      }
    } else if (action === 'remove') {
      try {
        await api.delete(`/api/todos/${id}`);
        todos = todos.filter(t => t.id !== id);
        renderTodos();
      } catch (e) {
        console.error('Failed to delete todo:', e);
      }
    }
  }));

  // -------------------- Shopping --------------------
  const shopInput = document.getElementById('shop-input');
  const shopAdd = document.getElementById('shop-add');
  const shopList = document.getElementById('shop-list');
  let shopping = [];

  const renderShopping = () => {
    if (!shopList) return;
    shopList.innerHTML = '';
    shopping.forEach(item => {
      const li = document.createElement('li');
      li.className = 'notepad-item py-1 px-2 hover:bg-black/5 transition-colors rounded-lg group';
      li.innerHTML = `
        <div class="flex items-center gap-3 flex-1">
          <input type="checkbox" ${item.bought ? 'checked' : ''} class="w-5 h-5 cursor-pointer rounded-full border-2 border-indigo-400 text-indigo-600 focus:ring-indigo-500" data-action="toggle" data-id="${item.id}">
          <span class="text-xl font-medium transition-all ${item.bought ? 'line-through text-gray-400 italic' : 'text-gray-800'}">${item.text}</span>
        </div>
        <button class="icon-btn text-red-500 hover:text-white hover:bg-red-500 transition-all border border-red-200 bg-red-50 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 shadow-sm" title="Delete" data-action="remove" data-id="${item.id}">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>`;
      shopList.appendChild(li);
    });
    if (window.lucide) window.lucide.createIcons();
  };

  const loadShopping = async () => {
    try {
      shopping = await api.get('/api/shopping');
      renderShopping();
    } catch (e) { console.error(e); }
  };

  shopAdd?.addEventListener('click', async () => {
    const text = (shopInput?.value || '').trim();
    if (!text) return;
    try {
      const newItem = await api.post('/api/shopping', { text });
      shopping.unshift(newItem);
      shopInput.value = '';
      renderShopping();
    } catch (e) { console.error(e); }
  });

  shopList?.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;

    if (action === 'toggle') {
      const item = shopping.find(x => x.id === id);
      if (item) {
        const newBought = !item.bought;
        try {
          await api.put(`/api/shopping/${id}`, { bought: newBought });
          item.bought = newBought;
          renderShopping();
        } catch (e) { console.error(e); }
      }
    } else if (action === 'remove') {
      try {
        await api.delete(`/api/shopping/${id}`);
        shopping = shopping.filter(it => it.id !== id);
        renderShopping();
      } catch (e) { console.error(e); }
    }
  });

  // -------------------- Reminders --------------------
  const remTitle = document.getElementById('rem-title');
  const remDatetime = document.getElementById('rem-datetime');
  const remAdd = document.getElementById('rem-add');
  const remList = document.getElementById('rem-list');
  let reminders = [];

  const renderReminders = () => {
    if (!remList) return;
    remList.innerHTML = '';
    reminders.forEach(r => {
      const li = document.createElement('li');
      li.className = 'card p-3 flex items-center justify-between';
      const adjustedTime = r.when_time ? new Date(new Date(r.when_time.replace(' ', 'T') + 'Z').getTime() - clockDrift) : null;
      const dateLabel = adjustedTime ? adjustedTime.toLocaleString() : '';
      li.innerHTML = `
        <div class="flex items-center gap-2">
          <input type="checkbox" ${r.done ? 'checked' : ''} class="h-4 w-4" data-action="toggle" data-id="${r.id}">
          <div>
            <div class="${r.done ? 'line-through text-slate-400' : ''}">${r.title}</div>
            <div class="text-xs text-slate-500">${dateLabel}</div>
          </div>
        </div>
        <button class="icon-btn text-red-500" title="Delete" data-action="remove" data-id="${r.id}"><i data-lucide="trash"></i></button>`;
      remList.appendChild(li);
    });
    if (window.lucide) window.lucide.createIcons();
  };

  const loadReminders = async () => {
    try {
      reminders = await api.get('/api/reminders');
      renderReminders();
    } catch (e) { console.error(e); }
  };

  remAdd?.addEventListener('click', async () => {
    const title = (remTitle?.value || '').trim();
    if (!title) return;
    let when = remDatetime?.value || null;

    // Standardize to UTC for reliable notification delivery
    if (when) {
      try {
        const localDate = new Date(when);
        if (!isNaN(localDate.getTime())) {
          // Adjust for server clock drift
          const adjustedDate = new Date(localDate.getTime() + clockDrift);

          // Format as YYYY-MM-DD HH:mm:ss in UTC for MySQL Compatibility
          when = adjustedDate.getUTCFullYear() + '-' +
            ('0' + (adjustedDate.getUTCMonth() + 1)).slice(-2) + '-' +
            ('0' + adjustedDate.getUTCDate()).slice(-2) + ' ' +
            ('0' + adjustedDate.getUTCHours()).slice(-2) + ':' +
            ('0' + adjustedDate.getUTCMinutes()).slice(-2) + ':' +
            ('0' + adjustedDate.getUTCSeconds()).slice(-2);
          console.log(`[Reminders] Local: ${remDatetime.value} | Drift: ${clockDrift}ms | Adjusted UTC: ${when}`);
        }
      } catch (e) {
        console.error('Time conversion error:', e);
      }
    }

    try {
      const newRem = await api.post('/api/reminders', { title, when });
      reminders.unshift(newRem);
      remTitle.value = '';
      remDatetime.value = '';
      renderReminders();
    } catch (e) { console.error('Failed to add reminder:', e); }
  });

  remList?.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;

    if (action === 'toggle') {
      const r = reminders.find(x => x.id === id);
      if (r) {
        const newDone = !r.done;
        try {
          await api.put(`/api/reminders/${id}`, { done: newDone });
          r.done = newDone;
          renderReminders();
        } catch (e) { console.error(e); }
      }
    } else if (action === 'remove') {
      try {
        await api.delete(`/api/reminders/${id}`);
        reminders = reminders.filter(x => x.id !== id);
        renderReminders();
      } catch (e) { console.error(e); }
    }
  });

  // -------------------- Goals --------------------
  const goalTitle = document.getElementById('goal-title');
  const goalCategory = document.getElementById('goal-category');
  const goalTotal = document.getElementById('goal-total');
  const goalSpent = document.getElementById('goal-spent');
  const goalAdd = document.getElementById('goal-add');
  const goalList = document.getElementById('goal-list');
  let goals = [];

  const categoryColor = (cat) => {
    switch ((cat || 'Personal').toLowerCase()) {
      case 'academic': return { border: 'border-l-4 border-sky-800', dot: 'bg-sky-900', badge: 'bg-sky-900 text-white', text: 'text-white', bar: 'bg-sky-800' };
      case 'financial': return { border: 'border-l-4 border-emerald-800', dot: 'bg-emerald-900', badge: 'bg-emerald-900 text-white', text: 'text-white', bar: 'bg-emerald-800' };
      case 'mental health': return { border: 'border-l-4 border-violet-800', dot: 'bg-violet-900', badge: 'bg-violet-900 text-white', text: 'text-white', bar: 'bg-violet-800' };
      case 'hobbies': return { border: 'border-l-4 border-pink-800', dot: 'bg-pink-900', badge: 'bg-pink-900 text-white', text: 'text-white', bar: 'bg-pink-800' };
      case 'health': return { border: 'border-l-4 border-green-800', dot: 'bg-green-900', badge: 'bg-green-900 text-white', text: 'text-white', bar: 'bg-green-800' };
      case 'career': return { border: 'border-l-4 border-amber-800', dot: 'bg-amber-900', badge: 'bg-amber-900 text-white', text: 'text-white', bar: 'bg-amber-800' };
      case 'relationship': return { border: 'border-l-4 border-rose-800', dot: 'bg-rose-900', badge: 'bg-rose-900 text-white', text: 'text-white', bar: 'bg-rose-800' };
      case 'work': return { border: 'border-l-4 border-slate-800', dot: 'bg-slate-900', badge: 'bg-slate-900 text-white', text: 'text-white', bar: 'bg-slate-800' };
      case 'personal': return { border: 'border-l-4 border-indigo-800', dot: 'bg-indigo-900', badge: 'bg-indigo-900 text-white', text: 'text-white', bar: 'bg-indigo-800' };
      default: return { border: 'border-l-4 border-gray-800', dot: 'bg-gray-900', badge: 'bg-gray-900 text-white', text: 'text-white', bar: 'bg-gray-800' };
    }
  };

  const pct = (spent, total) => {
    const totalNum = Number(total) || 0;
    const spentNum = Number(spent) || 0;
    if (totalNum <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((spentNum / totalNum) * 100)));
  };

  const renderGoals = () => {
    if (!goalList) return;
    goalList.innerHTML = '';

    goals.forEach(g => {
      const colors = categoryColor(g.category);
      const li = document.createElement('li');
      li.className = `card p-3 border border-slate-200 shadow-sm ${colors.border}`;
      const progress = pct(g.spent, g.total);
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-block w-2.5 h-2.5 rounded-full ${colors.dot}"></span>
            <div>
              <div class="font-medium ${g.done ? 'line-through text-slate-400' : ''}">${g.text}</div>
              <span class="text-[11px] px-2 py-0.5 rounded-full ${colors.badge}">${g.category || 'Personal'}</span>
            </div>
          </div>
            <div class="flex items-center gap-2">
            <span class="text-xs ${colors.text}">${progress}%</span>
            <button class="icon-btn text-blue-500 hover:bg-blue-50 p-1 rounded" title="Edit Progress" data-action="edit" data-id="${g.id}">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button class="icon-btn text-red-500 hover:bg-red-50 p-1 rounded" title="Delete" data-action="remove" data-id="${g.id}">
              <i data-lucide="trash" class="w-4 h-4"></i>
            </button>
          </div>        </div>
        <div class="mt-3 h-2 w-full bg-slate-200 rounded">
          <div class="h-2 rounded ${colors.bar}" style="width:${progress}%"></div>
        </div>
        <div class="mt-2 text-xs text-slate-600">${g.spent || 0}h / ${g.total || 0}h</div>
      `;
      goalList.appendChild(li);
    });

    if (window.lucide) window.lucide.createIcons();
    updateStats();
  };

  const loadGoals = async () => {
    try {
      goals = await api.get('/api/goals');
      renderGoals();
    } catch (e) { console.error(e); }
  };

  goalAdd?.addEventListener('click', async () => {
    const text = (goalTitle?.value || '').trim();
    if (!text) return;
    const category = goalCategory?.value || 'Personal';
    const total = goalTotal?.value || 0;
    const spent = goalSpent?.value || 0;

    try {
      const newGoal = await api.post('/api/goals', { text, category, total, spent });
      goals.unshift(newGoal);
      goalTitle.value = '';
      goalTotal.value = '';
      goalSpent.value = '';
      renderGoals();
    } catch (e) { console.error(e); }
  });

  goalList?.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;

    if (action === 'remove') {
      try {
        await api.delete(`/api/goals/${id}`);
        goals = goals.filter(g => g.id !== id);
        renderGoals();
      } catch (e) { console.error(e); }
    } else if (action === 'edit') {
      const g = goals.find(x => x.id === id);
      if (!g) return;

      // Open Modal
      const modal = document.getElementById('edit-goal-modal');
      const inputId = document.getElementById('edit-goal-id');
      const inputSpent = document.getElementById('edit-goal-spent');
      const hint = document.getElementById('edit-goal-limit-hint');
      const subtitle = document.getElementById('edit-goal-subtitle');

      if (modal && inputId && inputSpent) {
        inputId.value = g.id;
        inputSpent.value = g.spent;
        if (hint) hint.innerText = `Total Goal: ${g.total} hrs`;
        if (subtitle) subtitle.innerText = g.text;
        modal.classList.remove('hidden');
        inputSpent.focus();
      }
    }
  });

  // Edit Goal Modal Handlers
  const goalModal = document.getElementById('edit-goal-modal');
  const closeGoalModalBtn = document.getElementById('close-goal-modal');
  const cancelGoalModalBtn = document.getElementById('cancel-goal-edit');
  const editGoalForm = document.getElementById('edit-goal-form');

  function closeGoalModal() {
    if (goalModal) goalModal.classList.add('hidden');
  }

  if (closeGoalModalBtn) closeGoalModalBtn.addEventListener('click', closeGoalModal);
  if (cancelGoalModalBtn) cancelGoalModalBtn.addEventListener('click', closeGoalModal);

  if (editGoalForm) {
    editGoalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = Number(document.getElementById('edit-goal-id').value);
      const spent = parseFloat(document.getElementById('edit-goal-spent').value);

      if (isNaN(id) || isNaN(spent) || spent < 0) {
        alert("Invalid input");
        return;
      }

      const g = goals.find(x => x.id === id);
      if (g) {
        // Validation: Check if spent exceeds total
        if (spent > g.total) {
          alert(`You cannot put more than the total time of ${g.total} hours.`);
          return;
        }

        const oldSpent = g.spent;
        g.spent = spent;
        renderGoals();
        closeGoalModal();

        try {
          await api.put(`/api/goals/${id}`, { spent });
        } catch (err) {
          console.error(err);
          alert("Failed to save progress");
          g.spent = oldSpent;
          renderGoals();
        }
      }
    });
  }

  // -------------------- User Stats --------------------
  // -------------------- User Stats & Analytics --------------------
  let taskChartInstance = null;

  async function loadUserAnalytics() {
    try {
      const data = await api.get('/api/user/analytics');
      updateAnalyticsUI(data);
    } catch (e) {
      console.error("Failed to load analytics:", e);
    }
  }

  function updateAnalyticsUI(data) {
    // 1. Update Cards
    const els = {
      tasksCompleted: document.getElementById('tasks-completed'),
      goalsInProgress: document.getElementById('goals-in-progress'),
      productivityScore: document.getElementById('productivity-score'),
      loginStreak: document.getElementById('login-streak'),
      barTasks: document.getElementById('bar-tasks-completed'),
      barGoals: document.getElementById('bar-goals-progress'),
      barProd: document.getElementById('bar-productivity')
    };

    if (els.tasksCompleted) els.tasksCompleted.innerText = data.tasksCompleted;
    if (els.goalsInProgress) els.goalsInProgress.innerText = data.goalsInProgress;
    if (els.productivityScore) els.productivityScore.innerText = `${data.productivityScore}%`;
    if (els.loginStreak) els.loginStreak.innerText = `${data.streak} days`;

    // Bars
    if (els.barTasks) els.barTasks.style.width = '100%';
    if (els.barGoals) els.barGoals.style.width = `${(data.goalsInProgress / (data.goals.length || 1)) * 100}%`;
    if (els.barProd) els.barProd.style.width = `${data.productivityScore}%`;

    // 2. Render Chart
    renderAnalyticsChart(data.chartData);

    // 3. Render Goal Progress List
    renderGoalProgressWidgets(data.goals);
  }

  function renderAnalyticsChart(chartRows) {
    const ctx = document.getElementById('task-completion-chart');
    if (!ctx) return;

    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const values = [0, 0, 0, 0, 0, 0, 0];

    if (chartRows && Array.isArray(chartRows)) {
      chartRows.forEach(row => {
        // row.dayNum is 1-7 (Sun-Sat)
        // Map: Mon(2)->0, Tue(3)->1, ... Sat(7)->5, Sun(1)->6
        let index = -1;
        if (row.dayNum === 1) index = 6; // Sun
        else if (row.dayNum >= 2 && row.dayNum <= 7) index = row.dayNum - 2;

        if (index >= 0) {
          values[index] = row.count;
        }
      });
    }

    if (taskChartInstance) {
      taskChartInstance.destroy();
    }

    if (window.Chart) {
      taskChartInstance = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: "Tasks Completed",
            data: values,
            borderWidth: 0,
            borderRadius: 4,
            backgroundColor: "rgba(99, 102, 241, 0.8)",
            hoverBackgroundColor: "rgba(99, 102, 241, 1)"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `Productivity on ${items[0].label}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
              grid: { borderDash: [2, 4] }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  function renderGoalProgressWidgets(goals) {
    const container = document.getElementById('goal-progress-container');
    if (!container) return;

    if (!goals || goals.length === 0) {
      container.innerHTML = '<div class="text-center text-sm text-gray-500 py-4">No active goals found</div>';
      return;
    }

    container.innerHTML = '';
    goals.slice(0, 3).forEach(g => { // Show top 3
      const pctVal = g.total > 0 ? (g.spent / g.total) * 100 : 0;
      const pctDisp = Math.round(pctVal);

      let colorClass = 'bg-blue-500';
      if (g.category === 'Health') colorClass = 'bg-green-500';
      if (g.category === 'Career') colorClass = 'bg-purple-500';
      if (g.category === 'Financial') colorClass = 'bg-emerald-500';

      const div = document.createElement('div');
      div.innerHTML = `
          <div class="flex justify-between text-sm mb-1.5 font-medium text-gray-700">
            <span>${g.text || 'Goal'}</span>
            <span>${pctDisp}%</span>
          </div>
          <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full ${colorClass} rounded-full transition-all" style="width: ${pctDisp}%"></div>
          </div>
      `;
      container.appendChild(div);
    });
  }

  // Initial loads
  loadTodos();
  loadShopping();
  loadReminders();
  loadGoals();

  // Load analytics when Profile tab is clicked or initially
  loadUserAnalytics();

  // Initialize Chat
  // No-op: initChat() is now handled by chat.js


  // Refresh when tab switches
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'profile') {
        loadUserAnalytics();
      }
    });
  });

  // -------------------- Coach Review Logic --------------------
  async function initCoachReview() {
    const nameEl = document.getElementById('review-coach-name');
    const typeEl = document.getElementById('review-coach-type');
    const photoEl = document.getElementById('review-coach-photo');
    const form = document.getElementById('coach-review-form');

    if (!nameEl) return;

    try {
      // Reuse currentCoach if available or fetch
      let coach = currentCoach;
      if (!coach) {
        coach = await api.get('/api/user/my-coach');
      }

      if (coach) {
        nameEl.innerText = coach.name;
        typeEl.innerText = coach.coach_type || 'Expert Coach';
        if (coach.profile_photo) {
          photoEl.innerHTML = `<img src="${coach.profile_photo}" class="w-full h-full object-cover">`;
        } else {
          photoEl.innerText = coach.name.charAt(0).toUpperCase();
        }
      } else {
        // No coach
        document.getElementById('coach-review-card').innerHTML =
          '<div class="text-center p-8 text-slate-500">You need to have an active coach to leave a review.</div>';
        return;
      }

      // Star Rating Logic
      const stars = document.querySelectorAll('.star-btn');
      const ratingInput = document.getElementById('review-rating-input');

      stars.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); // Prevent submit if button inside form
          const rating = parseInt(btn.dataset.star);
          ratingInput.value = rating;
          updateStars(rating);
        });
      });

      function updateStars(rating) {
        stars.forEach(btn => {
          const starVal = parseInt(btn.dataset.star);
          const icon = btn.querySelector('i');
          if (starVal <= rating) {
            btn.classList.remove('text-gray-300');
            btn.classList.add('text-yellow-400', 'fill-yellow-400');
            if (icon) icon.setAttribute('fill', 'currentColor');
            if (icon) icon.classList.add('fill-yellow-400', 'text-yellow-400');
          } else {
            btn.classList.add('text-gray-300');
            btn.classList.remove('text-yellow-400', 'fill-yellow-400');
            if (icon) icon.removeAttribute('fill');
            if (icon) icon.classList.remove('fill-yellow-400', 'text-yellow-400');
          }
        });
      }

      // Form Submit
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const rating = ratingInput.value;
          const comment = document.getElementById('review-comment').value;

          if (!rating) {
            alert("Please select a star rating");
            return;
          }

          try {
            await api.post('/api/reviews', { coachId: coach.id, rating, comment });
            alert("Review submitted successfully! It will appear on the homepage.");
            // Use replaceState to avoid history pollution
            history.replaceState(null, null, '#profile');
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch (err) {
            alert("Failed to submit review: " + (err.error || err.message));
          }
        };
      }

    } catch (e) {
      console.error("Review init error:", e);
    }
  }

  // Call initCoachReview when tab switches
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#review') {
      initCoachReview();
    }
  });


});
