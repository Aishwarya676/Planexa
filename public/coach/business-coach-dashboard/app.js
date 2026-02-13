// Debug: Log when script loads
console.log('Chat script loaded');

// DOM Elements
const chatBtn = document.getElementById("chat-btn");
const chatModal = document.getElementById("chat-modal");
const closeChat = document.getElementById("close-chat");
const chatForm = document.getElementById("chat-form");
const chatMessages = document.getElementById("chat-messages");
const chatText = document.getElementById("chat-text");
let chatItems = []; // Will be initialized after DOM is loaded
const overlay = document.getElementById('chat-overlay');
const chatArea = document.querySelector('.chat-area');
const chatSidebar = document.querySelector('.chat-sidebar');

// Debug: Log if elements are found
console.log('Chat button:', chatBtn);
console.log('Chat modal:', chatModal);

// Sample chat data
// Chat data state
const chatData = [];
let activeChat = null;


// Load chat messages
function loadChat(chatId, fromButtonClick = false) {
  // Try to find existing chat data
  let chat = chatData.find(c => c.id === chatId);

  // If no chat data exists, create a new one
  if (!chat) {
    // Find the client card that was clicked
    const clientCard = document.querySelector(`.client-card:nth-child(${chatId})`);
    if (clientCard) {
      const name = clientCard.querySelector('.client-name-row h3')?.textContent || 'Client';
      const avatar = clientCard.querySelector('.client-avatar')?.src || 'https://randomuser.me/api/portraits/lego/1.jpg';
      const status = clientCard.querySelector('.online-status') ? 'online' : 'offline';

      // Create new chat data
      chat = {
        id: chatId,
        name: name,
        avatar: avatar,
        status: status,
        messages: []
      };

      // Add to chatData array
      chatData.push(chat);

      // Add to chat list in sidebar
      addChatToSidebar(chat);
    }
  }

  if (!chat) return;

  // Update active state in sidebar
  document.querySelectorAll('.chat-item').forEach(item => {
    const itemId = parseInt(item.dataset.chatId);
    if (itemId === chatId) {
      item.classList.add('active');

      // Update last message preview
      const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
      const preview = item.querySelector('.chat-item-message');
      if (preview) {
        preview.textContent = lastMessage ?
          (lastMessage.text.length > 30 ? lastMessage.text.substring(0, 30) + '...' : lastMessage.text) :
          'No messages yet';
      }
    } else {
      item.classList.remove('active');
    }
  });

  // Update active chat
  activeChat = chatId;

  // Update chat header in chat area
  const chatRecipient = document.querySelector('.chat-recipient');
  if (chatRecipient) {
    chatRecipient.innerHTML = `
      <img src="${chat.avatar}" alt="${chat.name}" class="chat-avatar">
      <div class="recipient-info">
        <h4>${chat.name}</h4>
        <span class="status ${chat.status}">${chat.status === 'online' ? 'Online' : 'Offline'}</span>
      </div>
    `;
  }

  // Render messages into the thread
  if (chatMessages) {
    chatMessages.innerHTML = '';
    const today = new Date().toLocaleDateString();
    const dateDiv = document.createElement('div');
    dateDiv.className = 'message-date';
    dateDiv.textContent = 'Today';
    chatMessages.appendChild(dateDiv);

    chat.messages.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${msg.sender}`;
      messageDiv.innerHTML = `
        <div class="message-content">${msg.text}</div>
        <div class="message-time">${msg.time}</div>
      `;
      chatMessages.appendChild(messageDiv);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;

    const unreadBadge = document.querySelector(`.chat-item[data-chat-id="${chatId}"] .unread-count`);
    if (unreadBadge) {
      unreadBadge.style.display = 'none';
    }
  }

  // Show chat area (for mobile)
  if (window.innerWidth <= 768) {
    document.querySelector('.chat-sidebar').classList.add('hidden');
    document.querySelector('.chat-area').classList.add('active');
  }

  // Scroll to bottom of messages
  setTimeout(() => {
    const messagesContainer = document.querySelector('.chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, 100);
}

// Add a chat to the sidebar
function addChatToSidebar(chat) {
  const chatList = document.querySelector('.chat-list');
  if (!chatList) return;

  const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;

  const chatItem = document.createElement('li');
  chatItem.className = 'chat-item';
  chatItem.dataset.chatId = chat.id;
  chatItem.innerHTML = `
    <div class="chat-avatar-container">
      <img src="${chat.avatar}" alt="${chat.name}" class="chat-avatar">
      <span class="online-status ${chat.status === 'online' ? '' : 'away'}"></span>
    </div>
    <div class="chat-item-info">
      <div class="chat-item-header">
        <h5 class="chat-item-name">${chat.name}</h5>
        <span class="chat-item-time">${lastMessage ? lastMessage.time : ''}</span>
      </div>
      <div class="chat-item-preview">
        <p class="chat-item-message">${lastMessage ?
      (lastMessage.text.length > 30 ? lastMessage.text.substring(0, 30) + '...' : lastMessage.text) :
      'No messages yet'}</p>
        ${chat.unreadCount ? `<span class="unread-count">${chat.unreadCount}</span>` : ''}
      </div>
    </div>
  `;

  // Add click event to load chat
  chatItem.addEventListener('click', (e) => {
    if (!e.target.classList.contains('icon-btn')) {
      loadChat(chat.id);
    }
  });

  chatList.prepend(chatItem);
}




// Send message
function sendMessage() {
  const message = chatText.value.trim();
  if (!message) return;

  const chat = chatData.find(c => c.id === activeChat);
  if (!chat) return;

  // Add message to UI
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message client';
  messageDiv.innerHTML = `
    <div class="message-content">${message}</div>
    <div class="message-time">${time}</div>
  `;
  chatMessages.appendChild(messageDiv);

  // Add to data model
  chat.messages.push({
    sender: 'client',
    text: message,
    time: time
  });

  // Clear input
  chatText.value = '';

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Make toggleChatModal globally available
window.toggleChatModal = function (e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  const isActive = chatModal.classList.contains('active');

  if (isActive) {
    // Close the chat
    chatModal.classList.remove('active');
    document.body.classList.remove('chat-open');
    document.body.style.overflow = 'auto'; // Re-enable body scroll
  } else {
    // Open the chat
    chatModal.classList.add('active');
    document.body.classList.add('chat-open');

    // Show sidebar by default when opening
    if (window.innerWidth <= 768) {
      chatSidebar.style.display = 'flex';
      chatArea.classList.remove('active');
    } else {
      chatSidebar.style.display = 'flex';
      chatArea.classList.add('active');
    }

    // Load the first chat by default if none is active
    const activeChatItem = document.querySelector('.chat-item.active');
    if (!activeChatItem && chatItems.length > 0) {
      chatItems[0].classList.add('active');
      loadChat(parseInt(chatItems[0].dataset.chatId));
    } else if (activeChatItem) {
      loadChat(parseInt(activeChatItem.dataset.chatId));
    }
  }

  // Prevent the event from bubbling up
  return false;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM fully loaded');

  // Initialize chat items after DOM is loaded
  chatItems = document.querySelectorAll('.chat-item');

  // Chat button click
  if (chatBtn) {
    chatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleChatModal(e);
    });
  } else {
    console.error('Chat button not found');
  }

  // Close chat button
  if (closeChat) {
    closeChat.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleChatModal(e);
    });
  }

  // Message buttons on client cards
  document.querySelectorAll('.client-actions .btn-primary').forEach((btn, index) => {
    // Assign chat IDs based on position (1-6 for the 6 client cards)
    const chatId = index + 1; // This assumes the order of clients matches chatData
    btn.setAttribute('data-chat-id', chatId);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ensure the chat panel is open
      chatModal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Load the specific chat
      loadChat(chatId);

      // Focus input
      if (chatText) {
        setTimeout(() => chatText.focus(), 150);
      }
    });
  });

  // Chat form submission
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  // Handle chat item clicks
  chatItems.forEach(item => {
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      const chatId = parseInt(this.getAttribute('data-chat-id'));
      loadChat(chatId);
    });
  });

  // Handle back to list button (for mobile)
  const backToList = document.querySelector('.back-to-list');
  if (backToList) {
    backToList.addEventListener('click', function (e) {
      e.stopPropagation();
      document.querySelector('.chat-area').classList.remove('active');
      document.querySelector('.chat-sidebar').style.display = 'flex';
    });
  }

  // Handle window resize
  function handleResize() {
    if (window.innerWidth <= 768) {
      // Mobile view
      chatModal.classList.add('mobile-view');
    } else {
      // Desktop view
      chatModal.classList.remove('mobile-view');
    }
  }


  window.addEventListener('resize', handleResize);

  // Initial check
  handleResize();

  // Auto-focus chat input when chat area is opened
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class' &&
        chatModal.classList.contains('active') &&
        chatText) {
        setTimeout(() => {
          chatText.focus();
        }, 300);
      }
    });
  });

  observer.observe(chatModal, { attributes: true });
});

// Add event listener for Sarah's message button
document.addEventListener('DOMContentLoaded', () => {
  const sarahMessageBtn = document.querySelector('.client-card:first-child .btn-primary');
  if (sarahMessageBtn) {
    sarahMessageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Show the chat modal using the toggle function
      if (!chatModal.classList.contains('active')) {
        toggleChatModal(e);
      }
      // Load Sarah's chat (ID: 1)
      loadChat(1);
    });
  }
});
