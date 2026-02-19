
// DOM Elements
const chatMessages = document.getElementById("chat-messages");
const analyticsChartEl = document.getElementById("activityChart");
const userGrid = document.getElementById('user-grid');
const requestGrid = document.getElementById('request-grid');
const analyticsFilter = document.getElementById('analytics-filter');

let chatSocket = null;
let activeChatUser = null;
let myCoachId = null;
let analyticsChart = null;
let coachAnalyticsData = [];

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Dashboard Initializing...");

  // 1. Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // 2. Initial UI setup
  initTabs();

  // 3. Fetch Auth State & Profile
  await initAuth();

  // 4. Load Data
  if (myCoachId) {
    await Promise.all([
      fetchStudents(),
      fetchRequests()
      // fetchCoachAnalytics() // Defer to index.html for specific analytics logic
    ]);
    initChat();
  } else {
    console.warn("⚠️ No Coach ID found, skipping data fetch.");
  }
});

/**
 * AUTHENTICATION & PROFILE
 */
async function initAuth() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();

    if (!data.isAuthenticated || data.userType !== 'coach') {
      window.location.href = '/coach-login.html';
      return;
    }

    myCoachId = data.coachId;
    const coach = data.user;

    // Update Header UI
    const coachNameEl = document.getElementById('coach-name');
    const coachTypeEl = document.getElementById('coach-type');
    const profileImgEl = document.getElementById('profile-img');

    if (coachNameEl) coachNameEl.textContent = coach.name || coach.username;
    if (coachTypeEl) coachTypeEl.textContent = coach.status === 'approved' ? 'Verified Coach' : 'Coach';

    if (profileImgEl) {
      profileImgEl.src = coach.profile_photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(coach.name || 'C')}&background=6366f1&color=fff`;
    }

  } catch (err) {
    console.error("❌ Auth Init Error:", err);
  }
}

/**
 * TAB MANAGEMENT
 */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.dashboard-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      // Update Tab UI
      tabs.forEach(t => t.classList.remove('active', 'border-indigo-500', 'text-indigo-600', 'bg-slate-700/50'));
      tabs.forEach(t => t.classList.add('border-transparent', 'text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-800/50'));

      tab.classList.add('active', 'border-indigo-500', 'text-indigo-600', 'bg-slate-700/50');
      tab.classList.remove('border-transparent', 'text-slate-400');

      // Update Section UI
      sections.forEach(s => s.classList.add('hidden'));
      const targetSection = document.getElementById(`${target}-section`);
      if (targetSection) targetSection.classList.remove('hidden');

      // Special cases
      if (target === 'analytics') {
        // updateAnalyticsView(); // Handled by inline script in index.html for real-time data
      }
    });
  });
}

/**
 * ANALYTICS LOGIC
 */
async function fetchCoachAnalytics() {
  try {
    console.log("📊 Fetching Analytics...");
    const res = await fetch('/api/coach/analytics/clients');
    if (!res.ok) throw new Error("Failed to fetch client analytics");

    const data = await res.json();
    console.log("📊 Analytics Data Received:", data);
    coachAnalyticsData = data;

    // Update Filter if it exists
    if (analyticsFilter) {
      // ... (existing code)
    }

    updateAnalyticsView();
  } catch (err) {
    console.error("❌ Analytics Fetch Error:", err);
  }
}

function updateAnalyticsView() {
  console.log("🔄 Updating Analytics View");
  if (!coachAnalyticsData || coachAnalyticsData.length === 0) {
    console.warn("⚠️ No analytics data available");
    if (analyticsChartEl) analyticsChartEl.parentElement.innerHTML = '<p class="text-center py-10 opacity-50">No data available</p>';
    return;
  }

  const filterVal = analyticsFilter?.value || 'all';
  console.log("🔍 Filter Value:", filterVal);

  const overallView = document.getElementById('overall-analytics-view');
  const studentView = document.getElementById('student-analytics-view');

  // ... (existing code)

  if (filterVal === 'all') {
    // ... (existing code)
  } else {
    // Show Student View
    if (overallView) overallView.classList.add('hidden');
    if (studentView) studentView.classList.remove('hidden');

    const client = coachAnalyticsData.find(c => String(c.userId) === String(filterVal));
    console.log("👤 Selected Client:", client);

    if (client) {
      tasksCompleted = client.todos.completed || 0;
      totalTasks = client.todos.total || 0;

      if (client.todos.weekly) {
        console.log("📅 Weekly Data:", client.todos.weekly);
        client.todos.weekly.forEach(w => {
          const dayIndex = (new Date(w.date).getDay() + 6) % 7;
          chartData[dayIndex] += w.count;
        });
      }

      console.log("📈 Chart Data for Student:", chartData);
      // Initialize Student Activity Chart
      initStudentChart(chartLabels, chartData);
    }
  }

  // ... (rest of function)
}

function initStudentChart(labels, data) {
  console.log("🎨 Initializing Student Chart", { labels, data });
  const ctx = document.getElementById('studentActivityChart')?.getContext('2d');
  if (!ctx) {
    console.error("❌ Student Chart Canvas NOT found");
    return;
  }

  // ... (rest of function)

  if (window.studentChartInstance) {
    window.studentChartInstance.destroy();
  }

  window.studentChartInstance = new Chart(ctx, {
    type: 'bar', // Bar chart for variety/clarity on single user
    data: {
      labels: labels,
      datasets: [{
        label: 'Tasks Completed',
        data: data,
        backgroundColor: '#8b5cf6',
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#94a3b8',
          bodyColor: '#f8fafc',
          padding: 12,
          displayColors: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 }, stepSize: 1 }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      }
    }
  });
}

/**
 * CLIENTS & REQUESTS
 */
async function fetchStudents() {
  try {
    console.log("👥 Fetching Students...");
    const res = await fetch('/api/coach/students');
    if (!res.ok) throw new Error("Failed to fetch students");
    const data = await res.json();

    if (!userGrid) return;

    if (data.length === 0) {
      userGrid.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400">
                    <i data-lucide="users" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                    <p class="text-lg">No active students yet</p>
                    <p class="text-sm">Approve some requests to get started!</p>
                </div>
            `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    userGrid.innerHTML = data.map(student => `
            <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition-all group">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-indigo-400 border-2 border-slate-600">
                            ${(student.username || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-100">${student.username}</h3>
                            <p class="text-xs text-slate-400">${student.email}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 rounded-md bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-wider">Active</span>
                </div>
                
                <div class="space-y-3 mb-6">
                    <div>
                        <div class="flex justify-between text-xs mb-1">
                            <span class="text-slate-400">Task Completion</span>
                            <span class="text-slate-200">${student.tasksDone}/${student.totalTasks}</span>
                        </div>
                        <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full bg-indigo-500" style="width: ${student.totalTasks > 0 ? (student.tasksDone / student.totalTasks * 100) : 0}%"></div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="openDirectChat(${student.id}, '${student.username}')" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="message-square" class="w-4 h-4"></i>
                        Message
                    </button>
                    <button onclick="viewUserProfile(${student.id})" class="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors">
                        <i data-lucide="external-link" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("❌ Student Fetch Error:", err);
  }
}

async function fetchRequests() {
  try {
    console.log("📥 Fetching Requests...");
    const res = await fetch('/api/coach/requests');
    const data = await res.json();

    if (!requestGrid) return;
    const countBadge = document.getElementById('pending-count-badge');
    if (countBadge) {
      countBadge.textContent = data.length;
      countBadge.classList.toggle('hidden', data.length === 0);
    }

    if (data.length === 0) {
      requestGrid.innerHTML = `
                <div class="py-12 text-center text-slate-400">
                    <p>No pending requests</p>
                </div>
            `;
      return;
    }

    requestGrid.innerHTML = data.map(req => `
            <div class="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl border border-slate-700">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                        ${(req.username || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-200">${req.username}</h4>
                        <p class="text-xs text-slate-400">${req.email}</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="updateRequestStatus(${req.id}, 'active')" class="p-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors">
                        <i data-lucide="check" class="w-5 h-5"></i>
                    </button>
                    <button onclick="updateRequestStatus(${req.id}, 'rejected')" class="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        `).join('');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("❌ Request Fetch Error:", err);
  }
}

async function updateRequestStatus(userId, status) {
  try {
    const res = await fetch(`/api/coach/requests/${userId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      fetchRequests();
      fetchStudents();
    }
  } catch (err) {
    console.error("❌ Update Status Error:", err);
  }
}

/**
 * CHAT LOGIC
 */
function initChat() {
  console.log("💬 Initializing Chat...");

  // Connect Socket.IO
  if (typeof io !== 'undefined') {
    chatSocket = io();

    chatSocket.on('connect', () => {
      console.log("✅ Socket Connected");
      if (myCoachId) chatSocket.emit('join', { userId: myCoachId, type: 'coach' });
    });

    chatSocket.on('new_message', (msg) => {
      if (activeChatUser &&
        ((msg.sender_id === activeChatUser.id && msg.sender_type === 'user') ||
          (msg.receiver_id === activeChatUser.id && msg.sender_type === 'coach'))) {
        appendMessage(msg);
      }
    });
  }

  // Chat Form Handler
  const fullChatForm = document.getElementById('full-chat-form');
  if (fullChatForm) {
    // Remove existing listeners if any
    const newForm = fullChatForm.cloneNode(true);
    fullChatForm.parentNode.replaceChild(newForm, fullChatForm);

    newForm.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log("📤 Chat Form Submit");
      const input = document.getElementById('full-chat-input');
      const content = input?.value.trim();
      if (!content || !activeChatUser || !chatSocket) return;

      const msg = {
        senderId: myCoachId,
        receiverId: activeChatUser.id,
        senderType: 'coach',
        content: content
      };

      chatSocket.emit('send_message', msg);
      input.value = '';

      appendMessage({
        ...msg,
        sender_id: myCoachId,
        sender_type: 'coach',
        created_at: new Date().toISOString()
      });
    });
  }
}

function openDirectChat(id, name) {
  activeChatUser = { id, name };

  // Update Chat UI
  const chatTitle = document.getElementById('chat-with-name');
  if (chatTitle) chatTitle.textContent = name;

  // Switch Tab to Messages
  const msgTab = document.querySelector('[data-tab="messages"]');
  if (msgTab) msgTab.click();

  loadMessages(id);
}

async function loadMessages(userId) {
  try {
    const res = await fetch(`/api/coach/messages/${userId}`);
    const messages = await res.json();

    if (chatMessages) {
      chatMessages.innerHTML = '';
      messages.forEach(msg => appendMessage(msg));
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  } catch (err) {
    console.error("❌ Load Messages Error:", err);
  }
}

function appendMessage(msg) {
  if (!chatMessages) return;

  const isMe = msg.sender_type === 'coach';
  const div = document.createElement('div');
  div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-4`;
  div.innerHTML = `
        <div class="max-w-[70%] p-3 rounded-2xl shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-100 rounded-tl-none border border-slate-600'
    }">
            <p class="text-sm leading-relaxed">${msg.content}</p>
            <span class="text-[10px] mt-1 block opacity-50 text-right">
                ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Global scope helpers
window.updateRequestStatus = updateRequestStatus;
window.openDirectChat = openDirectChat;
window.viewUserProfile = (id) => {
  // Basic user profile modal placeholder
  alert("Viewing profile for user #" + id + ". Full profile view can be implemented here.");
};
