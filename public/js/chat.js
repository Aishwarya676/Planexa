(function () {
    let socket;
    let currentCoach = null;
    let chatMessages, chatForm, chatInput, chatSendBtn, coachNameDisplay, coachImg;

    const userPayload = JSON.parse(localStorage.getItem('planner.user') || '{}');
    const user = userPayload.user || userPayload;

    function getBackendUrl() {
        const { hostname, port } = window.location;
        if (port === '5500' || port === '5501' || port === '3000') {
            return `http://${hostname}:3000`;
        }
        return '';
    }

    async function initChatElements() {
        chatMessages = document.getElementById('chat-messages');
        chatForm = document.getElementById('chat-form');
        chatInput = document.getElementById('chat-input');
        chatSendBtn = document.getElementById('chat-send-btn');
        coachNameDisplay = document.getElementById('chat-coach-name');
        coachImg = document.getElementById('chat-coach-img');

        if (chatForm) {
            chatForm.addEventListener('submit', handleChatSubmit);
        }

        const chatFab = document.getElementById('chat-fab');
        const chatOverlay = document.getElementById('chat-overlay');
        const closeChat = document.getElementById('close-chat');

        if (chatFab && chatOverlay && closeChat) {
            chatFab.addEventListener('click', () => toggleChat(chatOverlay));
            closeChat.addEventListener('click', () => toggleChat(chatOverlay));
        }
    }

    function toggleChat(overlay) {
        const isOpen = overlay.classList.contains('opacity-100');
        if (isOpen) {
            overlay.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100');
            overlay.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        } else {
            overlay.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
            overlay.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');
            if (currentCoach) loadHistory();
        }
    }

    async function connectSocket() {
        if (socket) return;

        try {
            // 1. Fetch connected coach first
            const res = await fetch(getBackendUrl() + '/api/user/my-coach', { credentials: 'include' });
            const coach = await res.json();

            if (!coach) {
                console.log('[Chat] No active coach found');
                if (chatMessages) {
                    chatMessages.innerHTML = `
                        <div class="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-4">
                            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                                <i data-lucide="user-minus" class="w-6 h-6"></i>
                            </div>
                            <p class="text-xs">No active coach found. Visit the coaches page!</p>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                }
                return;
            }

            currentCoach = coach;
            if (coachNameDisplay) coachNameDisplay.textContent = coach.name;
            if (coachImg) {
                coachImg.innerHTML = coach.profile_photo
                    ? `<img src="${coach.profile_photo}" class="w-full h-full object-cover">`
                    : `<span>${coach.name.charAt(0)}</span>`;
            }
            if (chatSendBtn) chatSendBtn.disabled = false;

            // Show FAB only if coach exists
            const chatFab = document.getElementById('chat-fab');
            if (chatFab) chatFab.classList.remove('hidden');

            // 2. Connect
            console.log('[Chat] Connecting to socket...');
            socket = io(getBackendUrl(), { withCredentials: true });

            socket.on('connect', () => {
                console.log('[Chat] Socket connected! ID:', socket.id);
                socket.emit('identify', { userId: Number(user.id || user.userId), userType: 'user' });
            });

            socket.on('new_message', (msg) => {
                console.log('[Chat] Incoming:', msg);
                if (currentCoach && msg.sender_id == currentCoach.id && msg.sender_type === 'coach') {
                    appendMessage(msg, 'incoming');
                    document.getElementById('chat-notif-dot')?.classList.remove('hidden');
                }
            });

            socket.on('error', (err) => console.error('[Chat] Socket error:', err));

        } catch (e) {
            console.error('[Chat] Init error:', e);
        }
    }

    async function loadHistory() {
        if (!currentCoach || !chatMessages) return;
        try {
            const res = await fetch(getBackendUrl() + `/api/messages/${currentCoach.id}`, { credentials: 'include' });
            const messages = await res.json();
            chatMessages.innerHTML = '';
            messages.forEach(msg => {
                const myId = Number(user.id || user.userId);
                const type = (msg.sender_id == myId && msg.sender_type === 'user') ? 'outgoing' : 'incoming';
                appendMessage(msg, type);
            });
            scrollToBottom();
        } catch (e) {
            console.error('[Chat] History error:', e);
        }
    }

    function handleChatSubmit(e) {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content || !currentCoach || !socket) return;

        const msg = {
            receiverId: Number(currentCoach.id),
            content: content
        };

        appendMessage({
            content,
            sender_id: Number(user.id || user.userId),
            sender_type: 'user',
            created_at: new Date()
        }, 'outgoing');

        socket.emit('send_message', msg);
        chatInput.value = '';
    }

    function appendMessage(msg, type) {
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = `flex ${type === 'outgoing' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="max-w-[85%] group">
                <div class="px-4 py-2 rounded-2xl shadow-sm text-sm ${type === 'outgoing'
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-tr-none'
                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
            }">
                    ${msg.content}
                </div>
                <p class="text-[8px] text-slate-400 mt-1 ${type === 'outgoing' ? 'text-right' : 'text-left'}">${time}</p>
            </div>
        `;
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    document.addEventListener('DOMContentLoaded', () => {
        initChatElements();
        connectSocket();
    });
})();
