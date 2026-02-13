(function () {
  let chatSocket;
  let activeChatUser = null;
  let coachInfo = JSON.parse(localStorage.getItem('planner.user') || '{}');
  if (coachInfo.user) coachInfo = coachInfo.user;

  const chatList = document.getElementById('full-chat-user-list');
  const chatHeader = document.getElementById('full-chat-header');
  const chatMessagesContainer = document.getElementById('full-chat-messages');
  const chatInputContainer = document.getElementById('full-chat-input-container');
  const chatForm = document.getElementById('full-chat-form');
  const chatInput = document.getElementById('full-chat-input');
  const emptyState = document.getElementById('full-chat-empty-state');

  function getBackendUrl() {
    const { hostname, port } = window.location;
    if (port === '5500' || port === '5501' || port === '3000') {
      return `http://${hostname}:3000`;
    }
    return '../..';
  }

  async function initCoachChat() {
    if (chatSocket) {
      loadChatUsers();
      return;
    }

    console.log('[CoachChat] Initializing Socket.io...');
    chatSocket = io(getBackendUrl(), { withCredentials: true });

    chatSocket.on('connect', () => {
      console.log('[CoachChat] Connected! ID:', chatSocket.id);
      const idToIdentify = Number(coachInfo.id || coachInfo.userId);
      if (idToIdentify) {
        chatSocket.emit('identify', { id: idToIdentify, userType: 'coach' });
      }
      loadChatUsers();
    });

    chatSocket.on('new_message', (msg) => {
      console.log('[CoachChat] New message:', msg);
      if (activeChatUser && Number(msg.sender_id) === Number(activeChatUser.id) && msg.sender_type === 'user') {
        appendCoachMessage(msg, 'incoming');
      } else {
        loadChatUsers();
        // Optional: Notify coach of inactive chat message
      }
    });

    chatSocket.on('error', (err) => console.error('[CoachChat] Socket error:', err));
  }

  async function loadChatUsers() {
    if (!chatList) return;
    try {
      const res = await fetch(getBackendUrl() + '/api/coach/students', { credentials: 'include' });
      const students = await res.json();

      chatList.innerHTML = '';

      if (!students || students.length === 0) {
        chatList.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 text-center opacity-50 space-y-2">
                        <i data-lucide="ghost" class="w-8 h-8 text-slate-300"></i>
                        <p class="text-[10px] font-black uppercase text-slate-400">No students yet</p>
                    </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      students.forEach(student => {
        const isActive = activeChatUser && activeChatUser.id === student.id;
        const div = document.createElement('div');
        div.className = `p-4 flex items-center gap-4 cursor-pointer transition-all rounded-2xl group ${isActive
          ? 'bg-white shadow-xl shadow-indigo-100/50 border border-slate-100 translate-x-1'
          : 'hover:bg-white/60 hover:translate-x-1'}`;

        div.innerHTML = `
                    <div class="w-12 h-12 rounded-2xl ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center font-black text-lg shadow-sm transition-colors group-hover:scale-105">
                        ${(student.username || student.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start mb-0.5">
                            <h4 class="font-black text-slate-800 truncate text-sm tracking-tight">${student.username || student.name}</h4>
                        </div>
                        <p class="text-[10px] font-bold text-slate-400 truncate tracking-tight uppercase">Student</p>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 transition-transform group-hover:translate-x-1"></i>
                `;
        div.onclick = () => selectChatUser(student);
        chatList.appendChild(div);
      });
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error('[CoachChat] User list error:', e);
    }
  }

  async function selectChatUser(user) {
    activeChatUser = user;

    // UI Updates
    if (emptyState) emptyState.classList.add('hidden');
    if (chatHeader) chatHeader.classList.remove('hidden');
    if (chatInputContainer) chatInputContainer.classList.remove('hidden');

    const nameEl = document.getElementById('full-chat-user-name');
    if (nameEl) nameEl.textContent = user.username || user.name;

    const avatarEl = document.getElementById('full-chat-user-avatar');
    if (avatarEl) avatarEl.textContent = (user.username || user.name || 'U').charAt(0).toUpperCase();

    const statusDot = document.getElementById('full-chat-status-dot');
    if (statusDot) statusDot.className = 'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white bg-green-500 shadow-sm';

    loadChatUsers(); // Refresh for active state visual

    try {
      const res = await fetch(getBackendUrl() + `/api/messages/${user.id}`, { credentials: 'include' });
      const messages = await res.json();

      if (chatMessagesContainer) {
        chatMessagesContainer.innerHTML = '';
        if (messages.length === 0) {
          chatMessagesContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-40">
                            <i data-lucide="message-square-dashed" class="w-8 h-8 text-slate-300"></i>
                            <p class="text-xs font-bold text-slate-800 uppercase tracking-widest">No conversation history</p>
                        </div>`;
        } else {
          messages.forEach(msg => {
            const myId = Number(coachInfo.id || coachInfo.userId);
            const type = (Number(msg.sender_id) === myId && msg.sender_type === 'coach') ? 'outgoing' : 'incoming';
            appendCoachMessage(msg, type);
          });
        }
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        if (window.lucide) window.lucide.createIcons();
      }
    } catch (e) {
      console.error('[CoachChat] History error:', e);
    }
  }

  function appendCoachMessage(msg, type) {
    if (!chatMessagesContainer) return;

    // Cleanup empty state
    const empty = chatMessagesContainer.querySelector('.opacity-40');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = `flex ${type === 'outgoing' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
            <div class="max-w-[70%] flex flex-col ${type === 'outgoing' ? 'items-end' : 'items-start'}">
                <div class="px-6 py-4 rounded-[1.8rem] text-sm shadow-sm font-semibold tracking-tight ${type === 'outgoing'
        ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-tr-none shadow-xl shadow-indigo-100'
        : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
      }">
                    ${msg.content}
                </div>
                <div class="flex items-center gap-1.5 mt-2 px-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <span>${time}</span>
                    ${type === 'outgoing' ? '<i data-lucide="check-check" class="w-2.5 h-2.5 text-indigo-400"></i>' : ''}
                </div>
            </div>
        `;
    chatMessagesContainer.appendChild(div);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  function handleChatSubmit(e) {
    e.preventDefault();
    const content = chatInput.value.trim();
    if (!content || !activeChatUser || !chatSocket) return;

    const msg = {
      receiverId: Number(activeChatUser.id),
      content: content
    };

    appendCoachMessage({
      content,
      sender_id: Number(coachInfo.id || coachInfo.userId),
      sender_type: 'coach',
      created_at: new Date()
    }, 'outgoing');

    chatSocket.emit('send_message', msg);
    chatInput.value = '';
  }

  // Tab Listeners
  document.addEventListener('DOMContentLoaded', () => {
    const messageTabBtn = document.querySelector('[data-tab="messages"]');
    if (messageTabBtn) {
      messageTabBtn.addEventListener('click', initCoachChat);
    }

    // Initial check if hash is already messages
    if (window.location.hash === '#messages') {
      initCoachChat();
    }

    if (chatForm) {
      chatForm.addEventListener('submit', handleChatSubmit);
    }
  });

  // Handle hashchange for tab switching visibility from other parts of the app
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#messages') {
      initCoachChat();
    }
  });

})();
