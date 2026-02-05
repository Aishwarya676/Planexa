document.addEventListener('DOMContentLoaded', function () {
    // Initialize Lucide icons
    lucide.createIcons();

    // Calendar elements
    const calendarDays = document.getElementById('calendar-days-content');
    const monthYear = document.getElementById('cal-label');
    const prevMonthBtn = document.getElementById('cal-prev');
    const nextMonthBtn = document.getElementById('cal-next');
    const todayBtn = document.getElementById('today-btn');
    const addEventBtn = document.getElementById('add-event-btn');
    const eventModal = document.getElementById('event-modal');
    const closeModalBtn = document.getElementById('close-event-modal');
    const cancelEventBtn = document.getElementById('cancel-event');
    const eventForm = document.getElementById('event-form');
    const eventTitle = document.getElementById('event-title');
    const eventDate = document.getElementById('event-date');
    const eventTime = document.getElementById('event-time');
    const eventDescription = document.getElementById('event-description');

    // Birthday elements
    const addBirthdayBtn = document.getElementById('add-birthday-btn');
    const birthdayModal = document.getElementById('birthday-modal');
    const closeBirthdayModalBtn = document.getElementById('close-birthday-modal');
    const cancelBirthdayBtn = document.getElementById('cancel-birthday');
    const birthdayForm = document.getElementById('birthday-form');
    const bdayName = document.getElementById('bday-name');
    const bdayDay = document.getElementById('bday-day');
    const bdayMonth = document.getElementById('bday-month');
    const bdayYear = document.getElementById('bday-year');


    let currentDate = new Date();

    // --- USER SCOPED STORAGE ---
    let STORAGE_KEY = 'calendarEvents'; // Default fallback
    try {
        const userData = JSON.parse(localStorage.getItem('planner.user'));
        if (userData && userData.user && userData.user.id) {
            STORAGE_KEY = `calendarEvents_${userData.user.id}`;
        }
    } catch (e) {
        console.error("Could not parse user data for calendar scope", e);
    }

    let events = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // Initialize calendar
    function initCalendar() {
        renderCalendar();
        updateMonthYear();
        checkAndNotifyBirthdays();
    }

    // Render calendar days
    function renderCalendar() {
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const lastDayOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();

        let days = '';

        const densityStyles = (count, hasBirthday) => {
            if (hasBirthday) {
                return { container: 'bg-blue-50 border-blue-200', number: 'text-blue-700', chip: 'bg-blue-100 text-blue-700', more: 'text-blue-600' };
            }
            if (count >= 5) {
                return { container: 'bg-rose-50 border-rose-200', number: 'text-rose-700', chip: 'bg-rose-100 text-rose-700', more: 'text-rose-600' };
            }
            if (count >= 3) {
                return { container: 'bg-amber-50 border-amber-200', number: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', more: 'text-amber-600' };
            }
            if (count >= 1) {
                return { container: 'bg-emerald-50 border-emerald-200', number: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', more: 'text-emerald-600' };
            }
            return { container: 'bg-white border-slate-200', number: 'text-slate-600', chip: 'bg-indigo-100 text-indigo-700', more: 'text-slate-500' };
        };

        // Previous month days
        const firstDayIndex = firstDay.getDay();
        for (let i = firstDayIndex; i > 0; i--) {
            days += `
                <div class="day other-month">
                    <div class="day-number">${lastDayOfPrevMonth - i + 1}</div>
                </div>
            `;
        }

        // Current month days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const isToday = isSameDay(date, new Date());
            const dayEvents = getEventsForDate(date);
            const hasBirthday = dayEvents.some(e => e.type === 'birthday');
            const styles = densityStyles(dayEvents.length, hasBirthday);
            const todayClass = isToday ? 'today' : '';

            days += `
                <div class="day ${todayClass} ${styles.container}" data-date="${formatDate(date)}">
                    <div class="day-number ${styles.number}">${i}</div>
                    ${dayEvents.length > 0 ? `
                        <div class="events-list">
                            ${dayEvents.slice(0, 3).map(event => `
                                <div class="event ${event.type || 'personal'} ${styles.chip}" title="${event.title}">
                                    ${event.title}
                                </div>
                            `).join('')}
                            ${dayEvents.length > 3 ? `
                                <div class="events-more ${styles.more}">+${dayEvents.length - 3} more</div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Next month days
        const daysToAdd = 42 - (firstDayIndex + lastDay.getDate());
        for (let i = 1; i <= daysToAdd; i++) {
            days += `
                <div class="day other-month">
                    <div class="day-number">${i}</div>
                </div>
            `;
        }

        calendarDays.innerHTML = days;

        // Add event listeners to day cells
        document.querySelectorAll('[data-date]').forEach(day => {
            day.addEventListener('click', () => {
                // openEventModal(day.dataset.date); // STOP auto-opening
                showTasksForSelectedDay(day.dataset.date);
            });
        });
        // Helper to refresh the selected day's view
        // (Moved outside to be accessible)
    }



    // Show tasks for the selected day (with delete option)
    function showTasksForSelectedDay(dateStr) {
        const container = document.getElementById('selected-day-tasks');
        if (!container) return;

        // Fix: Parse dateStr to Date object for getEventsForDate
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const eventsForDay = getEventsForDate(dateObj);
        container.innerHTML = ''; // Clear previous

        if (!eventsForDay.length) {
            container.innerHTML = `
                <div class="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <p class="text-slate-500">No events scheduled for ${dateStr}</p>
                </div>`;
            return;
        }

        const listContainer = document.createElement('div');
        listContainer.className = 'space-y-3';

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4';

        const title = document.createElement('h4');
        title.className = 'font-semibold text-slate-800 flex items-center gap-2';
        title.innerHTML = `<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"> ${eventsForDay.length} </span> Events for ${dateStr}`;

        const actions = document.createElement('div');
        actions.className = 'flex gap-2';

        const addEvtBtn = document.createElement('button');
        addEvtBtn.className = 'text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 transition-colors';
        addEvtBtn.textContent = '+ Event';
        addEvtBtn.onclick = () => openEventModal(dateStr);

        const addBdayBtn = document.createElement('button');
        addBdayBtn.className = 'text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors';
        addBdayBtn.textContent = '+ Birthday';
        addBdayBtn.onclick = () => openBirthdayModal(dateStr);

        actions.appendChild(addEvtBtn);
        actions.appendChild(addBdayBtn);

        header.appendChild(title);
        header.appendChild(actions);
        container.appendChild(header);

        eventsForDay.forEach(ev => {
            const el = document.createElement('div');
            el.className = 'group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all';

            // Left side: Content
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = `
                <div class="font-semibold text-slate-800">${ev.title}</div>
                ${ev.description ? `<div class="text-sm text-slate-500 mt-1">${ev.description}</div>` : ''}
            `;

            // Right side: Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100';
            deleteBtn.title = 'Delete Event';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;

            deleteBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent bubbling if needed
                deleteEvent(ev.id, dateStr);
            };

            el.appendChild(contentDiv);
            el.appendChild(deleteBtn);
            listContainer.appendChild(el);
        });

        container.appendChild(listContainer);
    }

    // Delete event function
    function deleteEvent(eventId, dateStr) {
        // Filter out event
        events = events.filter(e => e.id !== eventId);
        // Save
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        // Global Re-render of calendar (dots)
        renderCalendar();
        // Re-render list
        showTasksForSelectedDay(dateStr);
    }

    // Update month and year display
    function updateMonthYear() {
        const options = { year: 'numeric', month: 'long' };
        monthYear.textContent = currentDate.toLocaleDateString('en-US', options);
    }

    // Navigate to previous month
    function prevMonth() {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
        updateMonthYear();
    }

    // Navigate to next month
    function nextMonth() {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
        updateMonthYear();
    }

    // Go to today (Now unused button, but function kept for logic if needed)
    function goToToday() {
        currentDate = new Date();
        renderCalendar();
        updateMonthYear();
    }

    // --- Birthday Logic ---

    function openBirthdayModal(dateStr = '') {
        if (birthdayModal) birthdayModal.classList.remove('hidden');
        bdayName.value = '';

        if (dateStr) {
            // Parse "YYYY-MM-DD"
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                bdayYear.value = parts[0];
                bdayMonth.value = parseInt(parts[1]).toString(); // remove leading zero
                bdayDay.value = parseInt(parts[2]).toString();
            }
        } else {
            bdayDay.value = '';
            bdayMonth.value = '1';
            bdayYear.value = new Date().getFullYear();
        }
    }

    function closeBirthdayModal() {
        if (birthdayModal) birthdayModal.classList.add('hidden');
    }

    function saveBirthday(e) {
        e.preventDefault();
        const name = bdayName.value.trim();
        const d = parseInt(bdayDay.value);
        const m = parseInt(bdayMonth.value);
        const y = parseInt(bdayYear.value);

        if (!name || isNaN(d) || isNaN(m) || isNaN(y)) return;

        // Construct a base date
        // Note: Months are 0-indexed in JS Date, but input is 1-12
        const bdayDate = new Date(y, m - 1, d);
        const formattedDate = formatDate(bdayDate); // "YYYY-MM-DD"

        const newEvent = {
            id: Date.now(),
            title: `${name}'s Birthday`,
            date: formattedDate, // Original birth date
            type: 'birthday',
            description: `Turns ${new Date().getFullYear() - y} this year!`, // Dynamic calculation roughly
            originalYear: y,
            createdAt: new Date().toISOString()
        };

        events.push(newEvent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        renderCalendar();
        closeBirthdayModal();

        // Check if it's today to notify immediately
        const today = new Date();
        if (d === today.getDate() && (m - 1) === today.getMonth()) {
            new Notification("🎂 Birthday Alert!", {
                body: `It's ${name}'s birthday today!`,
                icon: "https://cdn-icons-png.flaticon.com/512/2488/2488980.png"
            });
        }
    }

    function checkAndNotifyBirthdays() {
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            processBirthdayNotifications();
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    processBirthdayNotifications();
                }
            });
        }
    }

    function processBirthdayNotifications() {
        const today = new Date();
        const todayMonth = today.getMonth(); // 0-11
        const todayDate = today.getDate(); // 1-31

        // Find birthdays matching today
        const todaysBirthdays = events.filter(ev => {
            if (ev.type !== 'birthday') return false;
            const d = new Date(ev.date);
            return d.getDate() === todayDate && d.getMonth() === todayMonth;
        });

        todaysBirthdays.forEach(bday => {
            // Check if already notified today to prevent spam reload
            const notifKey = `notified_${bday.id}_${today.getFullYear()}`;
            if (!localStorage.getItem(notifKey)) {
                new Notification("🎂 Birthday Alert!", {
                    body: `It's ${bday.title} today!`,
                });
                localStorage.setItem(notifKey, 'true');
            }
        });
    }

    // Open event modal
    function openEventModal(date = '') {
        const modalTitle = document.getElementById('event-modal-title');
        modalTitle.textContent = date ? 'Add Event' : 'Add Event';

        if (date) {
            eventDate.value = date;
        } else {
            const today = new Date();
            eventDate.value = formatDate(today);
            eventTime.value = formatTime(today);
        }

        eventTitle.value = '';
        eventTime.value = '12:00';
        eventDescription.value = '';

        eventModal.classList.remove('hidden');
    }

    // Close event modal
    function closeEventModal() {
        eventModal.classList.add('hidden');
    }

    // Save event
    // --- Task Limit Warning Logic ---
    const limitWarningModal = document.getElementById('limit-warning-modal');
    const limitProceedBtn = document.getElementById('limit-proceed-btn');
    const limitCancelBtn = document.getElementById('limit-cancel-btn');
    let pendingEventData = null;

    function closeLimitModal() {
        if (limitWarningModal) limitWarningModal.classList.add('hidden');
        pendingEventData = null;
    }

    // Actual save logic
    function executeSaveEvent(eventData) {
        events.push(eventData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
        renderCalendar();
        closeEventModal();
        closeLimitModal();
    }

    // Save event (Form Submit Handler)
    function saveEvent(e) {
        e.preventDefault();

        const title = eventTitle.value.trim();
        if (!title) return;

        const dateVal = eventDate.value;
        // Count events for this specific date
        // Note: events is an array of objects { date: "YYYY-MM-DD", ... }
        const eventsOnDay = events.filter(ev => ev.date === dateVal).length;

        const newEvent = {
            id: Date.now(),
            title: title,
            date: dateVal,
            time: eventTime.value,
            description: eventDescription.value.trim(),
            createdAt: new Date().toISOString()
        };

        if (eventsOnDay >= 6) {
            // Trigger Warning Modal
            pendingEventData = newEvent;
            if (limitWarningModal) limitWarningModal.classList.remove('hidden');
        } else {
            // Save immediately
            executeSaveEvent(newEvent);
        }
    }

    // --- Helpers ---

    function getEventsForDate(date) {
        const dateStr = formatDate(date);

        // Normal events
        const normalEvents = events.filter(event => event.type !== 'birthday' && event.date === dateStr);

        // Birthday events (Recurrence: Match Day and Month)
        const d = date.getDate();
        const m = date.getMonth(); // 0-11

        const birthdayEvents = events.filter(event => {
            if (event.type !== 'birthday') return false;
            const bDate = new Date(event.date); // This is UTC based if ISO, but formatDate uses local
            // Let's parse securely
            const parts = event.date.split('-');
            const bYear = parseInt(parts[0]);
            const bMonth = parseInt(parts[1]) - 1;
            const bDay = parseInt(parts[2]);

            return bDay === d && bMonth === m;
        });

        return [...normalEvents, ...birthdayEvents];
    }

    function isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getFullYear() === date2.getFullYear();
    }

    function formatDate(date) {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    function formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // --- Listeners ---

    if (prevMonthBtn) prevMonthBtn.addEventListener('click', prevMonth);
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', nextMonth);
    if (todayBtn) todayBtn.addEventListener('click', goToToday);

    // Birthday Listeners
    if (addBirthdayBtn) addBirthdayBtn.addEventListener('click', openBirthdayModal);
    if (closeBirthdayModalBtn) closeBirthdayModalBtn.addEventListener('click', closeBirthdayModal);
    if (cancelBirthdayBtn) cancelBirthdayBtn.addEventListener('click', closeBirthdayModal);
    if (birthdayForm) birthdayForm.addEventListener('submit', saveBirthday);

    if (addEventBtn) addEventBtn.addEventListener('click', () => openEventModal());
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    if (cancelEventBtn) cancelEventBtn.addEventListener('click', closeEventModal);
    if (eventForm) eventForm.addEventListener('submit', saveEvent);

    // Limit Modal Listeners
    if (limitProceedBtn) {
        limitProceedBtn.addEventListener('click', () => {
            if (pendingEventData) {
                executeSaveEvent(pendingEventData);
            }
        });
    }

    if (limitCancelBtn) {
        limitCancelBtn.addEventListener('click', closeLimitModal);
    }

    if (limitWarningModal) {
        limitWarningModal.addEventListener('click', (e) => {
            if (e.target === limitWarningModal) {
                closeLimitModal();
            }
        });
    }

    initCalendar();

    window.renderCalendar = renderCalendar;
});
