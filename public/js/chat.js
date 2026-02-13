(function () {
    let socket;
    let currentCoach = null;
    let chatMessages, chatForm, chatInput, chatSendBtn, coachNameDisplay, coachImg, coachAvatarHeader, coachNameHeader;

    const userPayload = JSON.parse(localStorage.getItem('planner.user') || '{}');
    const userObject = userPayload.user || userPayload;

    function getBackendUrl() {
        const { hostname, port } = window.location;
        if (hostname === 'localhost' || hostname === '127.0.0.1' || port === '3000' || port === '5500' || port === '5501') {
            return `http://${hostname}:3000`;
        }
        return '';
    }

    async function initChatElements() {
        chatMessages = document.getElementById('chat-messages');
        chatForm = document.getElementById('chat-form');
        chatInput = document.getElementById('chat-input');
        chatSendBtn = document.getElementById('chat-send-btn');

        // Sidebar elements
        coachNameDisplay = document.getElementById('chat-coach-name');
        coachImg = document.getElementById('chat-coach-img');

        // Header elements
        coachAvatarHeader = document.getElementById('messages-coach-avatar');
        coachNameHeader = document.getElementById('messages-coach-name');

        if (chatForm) {
            chatForm.addEventListener('submit', handleChatSubmit);
        }

        // Handle hash-based tab activation
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#messages') {
                document.getElementById('chat-notif-dot')?.classList.add('hidden');
                loadHistory();
            }
        });

        // Initial check
        if (window.location.hash === '#messages') {
            loadHistory();
        }
    }

    async function connectSocket() {
        if (socket) return;

        try {
            // 1. Fetch connected coach first
            const res = await fetch(getBackendUrl() + '/api/user/my-coach', { credentials: 'include' });
            const coach = await res.json();

            if (!coach || coach.error) {
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
            updateCoachUI(coach);

            if (chatSendBtn) chatSendBtn.disabled = false;

            // 2. Connect
            console.log('[Chat] Connecting to socket...');
            socket = io(getBackendUrl(), { withCredentials: true });

            socket.on('connect', () => {
                console.log('[Chat] Socket connected! ID:', socket.id);
                socket.emit('identify', { userId: Number(userObject.id || userObject.userId), userType: 'user' });
            });

            socket.on('new_message', (msg) => {
                console.log('[Chat] Incoming:', msg);
                if (currentCoach && msg.sender_id == currentCoach.id && msg.sender_type === 'coach') {
                    appendMessage(msg, 'incoming');
                    // Only show dot if NOT on the messages tab
                    if (window.location.hash !== '#messages') {
                        document.getElementById('chat-notif-dot')?.classList.remove('hidden');
                    }
                }
            });

            socket.on('error', (err) => console.error('[Chat] Socket error:', err));

        } catch (e) {
            console.error('[Chat] Init error:', e);
        }
    }

    function updateCoachUI(coach) {
        if (coachNameDisplay) coachNameDisplay.textContent = coach.name || coach.username || 'Your Coach';
        if (coachNameHeader) coachNameHeader.textContent = coach.name || coach.username || 'Your Coach';

        const avatarHtml = coach.profile_photo
            ? `<img src="${coach.profile_photo}" class="w-full h-full object-cover">`
            : `<span>${(coach.name || coach.username || 'C').charAt(0)}</span>`;

        if (coachImg) coachImg.innerHTML = avatarHtml;
        if (coachAvatarHeader) coachAvatarHeader.innerHTML = avatarHtml;
    }

    async function loadHistory() {
        if (!currentCoach || !chatMessages) return;
        try {
            const res = await fetch(getBackendUrl() + `/api/messages/${currentCoach.id}`, { credentials: 'include' });
            const messages = await res.json();

            // Clear welcome state if history found
            if (messages.length > 0) {
                chatMessages.innerHTML = '';
            }

            messages.forEach(msg => {
                const myId = Number(userObject.id || userObject.userId);
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
            sender_id: Number(userObject.id || userObject.userId),
            sender_type: 'user',
            created_at: new Date()
        }, 'outgoing');

        socket.emit('send_message', msg);
        chatInput.value = '';
    }

    function appendMessage(msg, type) {
        if (!chatMessages) return;

        // Remove welcome text if present
        const welcome = document.getElementById('chat-welcome');
        if (welcome) welcome.remove();

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

