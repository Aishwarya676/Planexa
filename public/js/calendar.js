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

    // Limit Modal elements
    const limitWarningModal = document.getElementById('limit-warning-modal');
    const limitProceedBtn = document.getElementById('limit-proceed-btn');
    const limitCancelBtn = document.getElementById('limit-cancel-btn');

    let currentDate = new Date();
    let events = [];
    let pendingEventData = null;
    let selectedDate = formatDate(new Date());

    let STORAGE_KEY = 'calendarEvents';
    try {
        const userData = JSON.parse(localStorage.getItem('planner.user'));
        if (userData && userData.user && userData.user.id) {
            STORAGE_KEY = `calendarEvents_${userData.user.id}`;
        }
    } catch (e) { }

    // --- Data Management ---

    async function loadEvents() {
        try {
            const serverEvents = await window.api.get('/api/calendar/events');
            events = serverEvents.map(e => ({
                id: e.id,
                title: e.title,
                date: new Date(e.event_date).toISOString().split('T')[0],
                time: e.event_time,
                description: e.description,
                type: e.event_type,
                createdAt: e.created_at
            }));

            // Migration from localStorage
            const localEvents = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            if (localEvents.length > 0) {
                console.log(`Migrating ${localEvents.length} local events...`);
                for (const ev of localEvents) {
                    try {
                        await window.api.post('/api/calendar/events', {
                            title: ev.title,
                            date: ev.date,
                            time: ev.time,
                            description: ev.description,
                            type: ev.type || 'personal'
                        });
                    } catch (err) { console.error('Migration error:', err); }
                }
                localStorage.removeItem(STORAGE_KEY);
                return loadEvents(); // Reload from server
            }
            renderCalendar();
        } catch (e) {
            console.error('Failed to load events:', e);
            renderCalendar();
        }
    }

    // --- Rendering ---

    function renderCalendar() {
        if (!calendarDays) return;
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const lastDayOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();

        let days = '';
        const densityStyles = (count, hasBirthday) => {
            if (hasBirthday) return { container: 'bg-blue-50 border-blue-200', number: 'text-blue-700', chip: 'bg-blue-100 text-blue-700', more: 'text-blue-600' };
            if (count >= 5) return { container: 'bg-rose-50 border-rose-200', number: 'text-rose-700', chip: 'bg-rose-100 text-rose-700', more: 'text-rose-600' };
            if (count >= 3) return { container: 'bg-amber-50 border-amber-200', number: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', more: 'text-amber-600' };
            if (count >= 1) return { container: 'bg-emerald-50 border-emerald-200', number: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', more: 'text-emerald-600' };
            return { container: 'bg-white border-slate-200', number: 'text-slate-600', chip: 'bg-indigo-100 text-indigo-700', more: 'text-slate-500' };
        };

        const firstDayIndex = firstDay.getDay();
        for (let i = firstDayIndex; i > 0; i--) {
            days += `<div class="day other-month"><div class="day-number">${lastDayOfPrevMonth - i + 1}</div></div>`;
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
            const dateStr = formatDate(date);
            const isToday = isSameDay(date, new Date());
            const dayEvents = getEventsForDate(date);
            const hasBirthday = dayEvents.some(e => e.type === 'birthday');
            const styles = densityStyles(dayEvents.length, hasBirthday);
            const todayClass = isToday ? 'today' : '';

            days += `
                <div class="day ${todayClass} ${styles.container}" data-date="${dateStr}" onclick="window.showTasksForSelectedDay('${dateStr}')">
                    <div class="day-number ${styles.number}">${i}</div>
                    ${dayEvents.length > 0 ? `
                        <div class="events-list">
                            ${dayEvents.slice(0, 3).map(event => `
                                <div class="event ${event.type || 'personal'} ${styles.chip}" title="${event.title}">
                                    ${event.title}
                                </div>
                            `).join('')}
                            ${dayEvents.length > 3 ? `<div class="events-more ${styles.more}">+${dayEvents.length - 3} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>`;
        }

        const daysToAdd = 42 - (firstDayIndex + lastDay.getDate());
        for (let i = 1; i <= daysToAdd; i++) {
            days += `<div class="day other-month"><div class="day-number">${i}</div></div>`;
        }

        calendarDays.innerHTML = days;
    }

    window.showTasksForSelectedDay = (dateStr) => {
        const container = document.getElementById('selected-day-tasks');
        if (!container) return;

        // Visual feedback (Reverted to subtle highlight or none if it caused issues)
        selectedDate = dateStr;
        document.querySelectorAll('.day').forEach(d => d.classList.remove('border-indigo-500', 'bg-indigo-50'));
        const activeEl = document.querySelector(`[data-date="${dateStr}"]`);
        if (activeEl) activeEl.classList.add('border-indigo-500', 'bg-indigo-50');

        const [y, m, d] = dateStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const eventsForDay = getEventsForDate(dateObj);
        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4';
        header.innerHTML = `<h4 class="font-semibold text-slate-800 flex items-center gap-2"><span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">${eventsForDay.length}</span> Events for ${dateStr}</h4>`;

        const actions = document.createElement('div');
        actions.className = 'flex gap-2';
        actions.innerHTML = `
            <button class="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100" onclick="window.openEventModal('${dateStr}')">+ Event</button>
            <button class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100" onclick="window.openBirthdayModal('${dateStr}')">+ Birthday</button>
        `;
        header.appendChild(actions);
        container.appendChild(header);

        if (!eventsForDay.length) {
            container.innerHTML += `<div class="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300"><p class="text-slate-500 font-medium">No events for ${dateStr}</p><p class="text-xs text-slate-400 mt-1">Tap the buttons above to add one!</p></div>`;
            return;
        }

        const list = document.createElement('div');
        list.className = 'space-y-3';
        eventsForDay.forEach(ev => {
            const el = document.createElement('div');
            el.className = 'group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all';
            el.innerHTML = `
                <div>
                    <div class="font-semibold text-slate-800">${ev.title}</div>
                    ${ev.description ? `<div class="text-sm text-slate-500 mt-1">${ev.description}</div>` : ''}
                </div>
                <button class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100" onclick="window.deleteEvent('${ev.id}', '${dateStr}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            `;
            list.appendChild(el);
        });
        container.appendChild(list);
    };

    // --- Actions ---

    async function executeSaveEvent(eventData) {
        try {
            const saved = await window.api.post('/api/calendar/events', {
                title: eventData.title,
                date: eventData.date,
                time: eventData.time,
                description: eventData.description,
                type: eventData.type || 'personal'
            });
            events.push({ ...saved, date: eventData.date });
            renderCalendar();
            closeEventModal();
            closeLimitModal();
        } catch (err) { alert('Failed to save event'); }
    }

    async function saveBirthday(e) {
        e.preventDefault();
        const name = bdayName.value.trim();
        const d = parseInt(bdayDay.value);
        const m = parseInt(bdayMonth.value);
        const y = parseInt(bdayYear.value);
        if (!name || isNaN(d) || isNaN(m) || isNaN(y)) return;

        const formattedDate = formatDate(new Date(y, m - 1, d));
        try {
            const saved = await window.api.post('/api/calendar/events', {
                title: `${name}'s Birthday`,
                date: formattedDate,
                type: 'birthday',
                description: `Turns ${new Date().getFullYear() - y} this year!`
            });
            events.push({ ...saved, date: formattedDate });
            renderCalendar();
            closeBirthdayModal();
        } catch (err) { alert('Failed to save birthday'); }
    }

    function saveEvent(e) {
        e.preventDefault();
        const title = eventTitle.value.trim();
        if (!title) return;
        const dateVal = eventDate.value;
        const eventsOnDay = events.filter(ev => ev.date === dateVal).length;
        const newEvent = { title, date: dateVal, time: eventTime.value, description: eventDescription.value.trim() };
        if (eventsOnDay >= 6) {
            pendingEventData = newEvent;
            if (limitWarningModal) limitWarningModal.classList.remove('hidden');
        } else {
            executeSaveEvent(newEvent);
        }
    }

    window.deleteEvent = async (eventId, dateStr) => {
        if (!confirm('Are you sure you want to delete this event?')) return;
        try {
            await window.api.delete(`/api/calendar/events/${eventId}`);
            events = events.filter(e => e.id !== parseInt(eventId) && e.id !== eventId);
            renderCalendar();
            window.showTasksForSelectedDay(dateStr);
        } catch (e) { alert('Failed to delete event'); }
    };

    // --- Helpers & Modals ---

    function updateMonthYear() { if (monthYear) monthYear.textContent = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }); }
    function prevMonth() { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); updateMonthYear(); }
    function nextMonth() { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); updateMonthYear(); }
    function goToToday() { currentDate = new Date(); renderCalendar(); updateMonthYear(); }

    window.openBirthdayModal = (dateStr = '') => {
        const targetDate = dateStr || selectedDate || formatDate(new Date());
        if (birthdayModal) birthdayModal.classList.remove('hidden');
        bdayName.value = '';
        if (targetDate) {
            const [y, m, d] = targetDate.split('-');
            bdayYear.value = y; bdayMonth.value = parseInt(m).toString(); bdayDay.value = parseInt(d).toString();
        }
    };
    function closeBirthdayModal() { if (birthdayModal) birthdayModal.classList.add('hidden'); }

    window.openEventModal = (date = '') => {
        const targetDate = date || selectedDate || formatDate(new Date());
        eventDate.value = targetDate;
        eventTitle.value = ''; eventTime.value = '12:00'; eventDescription.value = '';
        if (eventModal) eventModal.classList.remove('hidden');
    };
    function closeEventModal() { if (eventModal) eventModal.classList.add('hidden'); }
    function closeLimitModal() { if (limitWarningModal) limitWarningModal.classList.add('hidden'); pendingEventData = null; }

    function getEventsForDate(date) {
        const dateStr = formatDate(date);
        const normalEvents = events.filter(event => event.type !== 'birthday' && event.date === dateStr);
        const d = date.getDate();
        const m = date.getMonth();
        const birthdayEvents = events.filter(event => {
            if (event.type !== 'birthday') return false;
            const parts = event.date.split('-');
            return parseInt(parts[2]) === d && (parseInt(parts[1]) - 1) === m;
        });
        return [...normalEvents, ...birthdayEvents];
    }

    function isSameDay(date1, date2) { return date1.getDate() === date2.getDate() && date1.getMonth() === date2.getMonth() && date1.getFullYear() === date2.getFullYear(); }
    function formatDate(date) {
        const d = new Date(date);
        let mo = '' + (d.getMonth() + 1);
        let da = '' + d.getDate();
        if (mo.length < 2) mo = '0' + mo;
        if (da.length < 2) da = '0' + da;
        return [d.getFullYear(), mo, da].join('-');
    }

    function checkAndNotifyBirthdays() {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const today = new Date();
        const tM = today.getMonth(); const tD = today.getDate();
        events.filter(ev => ev.type === 'birthday').forEach(bday => {
            const d = new Date(bday.date);
            if (d.getDate() === tD && d.getMonth() === tM) {
                const key = `notified_${bday.id}_${today.getFullYear()}`;
                if (!localStorage.getItem(key)) {
                    new Notification("🎂 Birthday Alert!", { body: `It's ${bday.title} today!` });
                    localStorage.setItem(key, 'true');
                }
            }
        });
    }

    // --- Final Exports ---
    window.renderCalendar = renderCalendar;

    // --- Listeners ---
    if (prevMonthBtn) prevMonthBtn.addEventListener('click', prevMonth);
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', nextMonth);
    if (todayBtn) todayBtn.addEventListener('click', goToToday);
    if (addBirthdayBtn) addBirthdayBtn.addEventListener('click', () => window.openBirthdayModal());
    if (closeBirthdayModalBtn) closeBirthdayModalBtn.addEventListener('click', closeBirthdayModal);
    if (cancelBirthdayBtn) cancelBirthdayBtn.addEventListener('click', closeBirthdayModal);
    if (birthdayForm) birthdayForm.addEventListener('submit', saveBirthday);
    if (addEventBtn) addEventBtn.addEventListener('click', () => window.openEventModal());
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    if (cancelEventBtn) cancelEventBtn.addEventListener('click', closeEventModal);
    if (eventForm) eventForm.addEventListener('submit', saveEvent);
    if (limitProceedBtn) limitProceedBtn.addEventListener('click', () => { if (pendingEventData) executeSaveEvent(pendingEventData); });
    if (limitCancelBtn) limitCancelBtn.addEventListener('click', closeLimitModal);

    async function initCalendar() {
        await loadEvents();
        updateMonthYear();
        checkAndNotifyBirthdays();
        // Initialize task list for today
        window.showTasksForSelectedDay(selectedDate);
    }
    initCalendar();
});
