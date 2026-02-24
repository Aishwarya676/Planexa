// Notifications Management
(function () {
  let notifications = [];

  const notificationsList = document.getElementById('notifications-list');
  const markAllReadBtn = document.getElementById('mark-all-read-btn');
  const notifBadge = document.getElementById('notif-badge');

  // Load notifications from server
  async function loadNotifications() {
    try {
      const response = await fetch('/api/notifications', {
        credentials: 'include' // Use session cookie
      });

      if (response.ok) {
        notifications = await response.json();
        renderNotifications();
        updateBadge();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  // Render notifications
  function renderNotifications() {
    if (!notificationsList) return;

    if (notifications.length === 0) {
      notificationsList.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <i data-lucide="bell-off" class="w-12 h-12 mx-auto mb-2 text-gray-300"></i>
          <p>No notifications yet</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    notificationsList.innerHTML = notifications.map(notif => `
      <div class="bg-white rounded-lg p-4 border ${notif.is_read ? 'border-gray-200' : 'border-blue-200 bg-blue-50'} hover:shadow-md transition">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <i data-lucide="bell" class="w-4 h-4 ${notif.is_read ? 'text-gray-400' : 'text-blue-500'}"></i>
              <h3 class="font-semibold ${notif.is_read ? 'text-gray-700' : 'text-gray-900'}">${notif.title}</h3>
              ${!notif.is_read ? '<span class="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">New</span>' : ''}
            </div>
            <p class="text-sm ${notif.is_read ? 'text-gray-500' : 'text-gray-700'} mb-2">${notif.body}</p>
            
            ${notif.flyer_url ? `
              <div class="mb-3 rounded-lg overflow-hidden border border-gray-100">
                <img src="${notif.flyer_url}" class="w-full h-auto max-h-48 object-cover">
              </div>
            ` : ''}

            ${notif.payment_details ? `
              <div class="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <i data-lucide="credit-card" class="w-3 h-3"></i> Payment Details
                </p>
                <p class="text-xs font-bold text-blue-700 whitespace-pre-wrap">${notif.payment_details}</p>
              </div>
            ` : ''}

            ${notif.announcement_id ? `
              <button onclick="joinEvent(${notif.announcement_id}, this)" class="mt-2 w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                <i data-lucide="calendar-plus" class="w-4 h-4"></i> Join Event
              </button>
            ` : ''}

            <p class="text-xs text-gray-400">${formatDate(notif.created_at)}</p>
          </div>
          <div class="flex gap-2">
            ${!notif.is_read ? `
              <button onclick="markAsRead(${notif.id})" class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Mark as read">
                <i data-lucide="check" class="w-4 h-4"></i>
              </button>
            ` : ''}
            <button onclick="deleteNotification(${notif.id})" class="p-2 text-red-600 hover:bg-red-100 rounded-lg transition" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // Update notification badge
  function updateBadge() {
    if (!notifBadge) return;

    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      notifBadge.style.display = 'flex';
    } else {
      notifBadge.style.display = 'none';
    }
  }

  // Mark notification as read
  window.markAsRead = async function (id) {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        credentials: 'include'
      });

      if (response.ok) {
        const notif = notifications.find(n => n.id === id);
        if (notif) notif.is_read = 1;
        renderNotifications();
        updateBadge();
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // Delete notification
  window.deleteNotification = async function (id) {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        notifications = notifications.filter(n => n.id !== id);
        renderNotifications();
        updateBadge();
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Join Event
  window.joinEvent = async function (announcementId, btn) {
    try {
      const originalContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Joining...';
      if (window.lucide) window.lucide.createIcons();

      const response = await fetch(`/api/announcement/${announcementId}/interest`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Joined!';
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btn.classList.add('bg-green-600');
      } else {
        const err = await response.json();
        if (err.error === 'Already marked as interested') {
          btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Already Joined';
          btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
          btn.classList.add('bg-gray-500');
        } else {
          alert(err.error || 'Failed to join event');
          btn.innerHTML = originalContent;
          btn.disabled = false;
        }
      }
      if (window.lucide) window.lucide.createIcons();
    } catch (error) {
      console.error('Error joining event:', error);
      alert('Failed to join event. Please try again.');
      btn.disabled = false;
    }
  };

  // Mark all as read
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const notif of unread) {
        await markAsRead(notif.id);
      }
    });
  }

  // Format date
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }

  // Load notifications on page load and periodically
  loadNotifications();
  setInterval(loadNotifications, 30000); // Refresh every 30 seconds

  // Reload when switching to notifications tab
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="notifications"]')) {
      loadNotifications();
    }
  });
})();
