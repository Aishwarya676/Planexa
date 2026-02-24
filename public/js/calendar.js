document.addEventListener('DOMContentLoaded', function () {
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

    // Rollover Modal elements
    const rolloverModal = document.getElementById('rollover-modal');
    const rolloverEventTitleEl = document.getElementById('rollover-event-title');
    const rolloverEventDateEl = document.getElementById('rollover-event-date');
    const rolloverMoveBtn = document.getElementById('rollover-move-btn');
    const rolloverSkipBtn = document.getElementById('rollover-skip-btn');

    let currentDate = new Date();
    let events = [];
    let pendingEventData = null;
    let selectedDate = localDateStr(new Date());

    // Rollover state
    let rolloverQueue = [];
    let rolloverShown = false;

    let STORAGE_KEY = 'calendarEvents';
    try {
        const userData = JSON.parse(localStorage.getItem('planner.user'));
        if (userData && userData.user && userData.user.id) {
            STORAGE_KEY = `calendarEvents_${userData.user.id}`;
        }
    } catch (e) { }

    // ─── ROLLOVER PERSISTENCE ──────────────────────────────────────────────────
    const ROLLOVER_TRACKER_KEY = 'rollover_processed_tasks';

    function getProcessedIds() {
        try {
            const data = JSON.parse(localStorage.getItem(ROLLOVER_TRACKER_KEY) || '{}');
            const today = getTodayStr();
            // Only return IDs if they were processed TODAY
            return data.date === today ? (data.ids || []) : [];
        } catch (e) { return []; }
    }

    function markProcessed(id) {
        const today = getTodayStr();
        const ids = getProcessedIds();
        const sId = String(id);
        if (!ids.includes(sId)) {
            ids.push(sId);
            localStorage.setItem(ROLLOVER_TRACKER_KEY, JSON.stringify({ date: today, ids: ids }));
        }
    }

    // ─── DATE HELPERS ─────────────────────────────────────────────────────────

    // THE CRITICAL FIX: handle both Date objects and string types safely
    function parseMySQLDate(raw) {
        if (!raw) return '';

        console.log('[DateDebug] Raw from server:', raw, 'Type:', typeof raw);

        // If it's a Date object
        if (raw instanceof Date) {
            // ISO string is YYYY-MM-DDTHH:mm:ss.sssZ
            // We only want the YYYY-MM-DD part and we want to ensure it represents the intended date.
            // For a DATE column, mysql returns midnight UTC. 
            // 2026-02-24 00:00 UTC -> 2026-02-24 in every timezone except those behind UTC.
            // To be 100% safe, we can use the ISO string's date part IF it's exactly midnight.
            const iso = raw.toISOString();
            return iso.split('T')[0];
        }

        const s = String(raw);
        if (s.includes('T')) return s.split('T')[0];
        return s.substring(0, 10);
    }

    // Return current date or specific date as "YYYY-MM-DD" in LOCAL timezone
    function localDateStr(date) {
        const d = date instanceof Date ? date : new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getTodayStr() { return localDateStr(new Date()); }

    // Next day = Today + 1
    function getTomorrowStr() {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        return localDateStr(t);
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    // ─── DATA ─────────────────────────────────────────────────────────────────
    async function loadEvents() {
        console.log('[Calendar] Loading events...');
        try {
            const serverEvents = await window.api.get('/api/calendar/events');
            events = serverEvents.map(e => {
                const d = parseMySQLDate(e.event_date);
                console.log(`[DateDebug] Event ID ${e.id}: "${e.title}" -> ${d}`);
                return {
                    id: e.id,
                    title: e.title,
                    date: d,
                    time: e.event_time,
                    description: e.description,
                    type: e.event_type,
                    createdAt: e.created_at
                };
            });

            console.log(`[Calendar] Loaded ${events.length} events`);

            // Migration from storage
            const localEvents = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            if (localEvents.length > 0) {
                for (const ev of localEvents) {
                    try {
                        await window.api.post('/api/calendar/events', {
                            title: ev.title, date: ev.date, time: ev.time,
                            description: ev.description, type: ev.type || 'personal'
                        });
                    } catch (err) { }
                }
                localStorage.removeItem(STORAGE_KEY);
                return loadEvents();
            }

            renderCalendar();
            maybeStartRollover();

        } catch (e) {
            console.error('Failed to load events:', e);
            renderCalendar();
        }
    }

    // ─── ROLLOVER LOGIC ───────────────────────────────────────────────────────
    function buildRolloverQueue() {
        const today = getTodayStr();
        const processed = getProcessedIds();
        console.log(`[Rollover] Checking for tasks before ${today}. Already processed:`, processed);
        const missed = events.filter(ev => {
            return ev.type !== 'birthday' &&
                ev.date < today &&
                !processed.includes(String(ev.id));
        });
        console.log(`[Rollover] Found ${missed.length} new missed tasks`);
        return missed.map(ev => ({ ...ev }));
    }

    function maybeStartRollover() {
        if (rolloverShown) return;

        const queue = buildRolloverQueue();
        if (queue.length === 0) return;

        const calSection = document.getElementById('tab-calendar');
        const isVisible = calSection && !calSection.classList.contains('hidden')
            && calSection.offsetParent !== null;

        if (isVisible) {
            console.log('[Rollover] Calendar is visible, starting prompts');
            rolloverShown = true;
            rolloverQueue = queue;
            showNextRolloverPrompt();
        } else {
            console.log('[Rollover] Calendar hidden, waiting for tab click...');
            const tabBtns = document.querySelectorAll('[data-tab="calendar"], [data-tab="events"], a[href="#calendar"]');
            const handler = () => {
                tabBtns.forEach(b => b.removeEventListener('click', handler));
                if (rolloverShown) return;
                rolloverShown = true;
                rolloverQueue = buildRolloverQueue();
                if (rolloverQueue.length > 0) {
                    console.log('[Rollover] Tab opened, starting prompts');
                    setTimeout(showNextRolloverPrompt, 300);
                }
            };
            tabBtns.forEach(b => b.addEventListener('click', handler));
        }
    }

    function showNextRolloverPrompt() {
        if (!rolloverModal) return;

        if (rolloverQueue.length === 0) {
            console.log('[Rollover] Queue empty, finalizing');
            rolloverModal.classList.add('hidden');
            renderCalendar();
            if (selectedDate) window.showTasksForSelectedDay(selectedDate);
            return;
        }

        const ev = rolloverQueue[0];
        console.log(`[Rollover] Prompting for "${ev.title}" (Original: ${ev.date})`);

        if (rolloverEventTitleEl) rolloverEventTitleEl.textContent = ev.title;

        if (rolloverEventDateEl) {
            const parts = ev.date.split('-');
            if (parts.length === 3) {
                const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                rolloverEventDateEl.textContent = `Originally on ${dateObj.toLocaleDateString('en-IN', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}`;
            } else {
                rolloverEventDateEl.textContent = `Original date: ${ev.date}`;
            }
        }

        rolloverModal.classList.remove('hidden');
    }

    async function rescheduleEvent(ev) {
        // Move to the current day (Today). If today itself has passed, moving to 
        // the next day relative to the original event but at least Today.
        const today = getTodayStr();
        const parts = ev.date.split('-').map(Number);
        const originalPlusOne = new Date(parts[0], parts[1] - 1, parts[2]);
        originalPlusOne.setDate(originalPlusOne.getDate() + 1);
        const nextRel = localDateStr(originalPlusOne);

        // If today is the 24th and task was 23rd, nextRel=24th. Target=24.
        const target = nextRel > today ? nextRel : today;

        console.log(`[Rollover] Moving "${ev.title}" from ${ev.date} to ${target}`);
        try {
            await window.api.put(`/api/calendar/events/${ev.id}/reschedule`, { date: target });

            const local = events.find(e => String(e.id) === String(ev.id));
            if (local) local.date = target;
            return true;
        } catch (err) {
            console.error('[Rollover] reschedule failed:', err);
            return false;
        }
    }

    function advanceRolloverQueue() {
        if (rolloverQueue.length > 0) {
            markProcessed(rolloverQueue[0].id);
        }
        rolloverQueue.shift();
        showNextRolloverPrompt();
    }

    if (rolloverMoveBtn) {
        rolloverMoveBtn.addEventListener('click', async () => {
            if (rolloverQueue.length === 0) return;
            rolloverMoveBtn.disabled = true;
            rolloverSkipBtn.disabled = true;
            const originalText = rolloverMoveBtn.textContent;
            rolloverMoveBtn.textContent = 'Moving…';

            const ev = rolloverQueue[0];
            const ok = await rescheduleEvent(ev);
            if (!ok) alert(`Couldn't move "${ev.title}". Check console for details.`);

            rolloverMoveBtn.disabled = false;
            rolloverSkipBtn.disabled = false;
            rolloverMoveBtn.textContent = originalText;
            advanceRolloverQueue();
        });
    }

    if (rolloverSkipBtn) {
        rolloverSkipBtn.addEventListener('click', () => advanceRolloverQueue());
    }

    // ─── CALENDAR RENDER ──────────────────────────────────────────────────────
    function renderCalendar() {
        if (!calendarDays) return;
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const lastDayPrev = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate();
        const firstDayIndex = firstDay.getDay();

        const ds = (count, hasBirthday) => {
            if (hasBirthday) return { box: 'bg-blue-50 border-blue-200', num: 'text-blue-700', chip: 'bg-blue-100 text-blue-700', more: 'text-blue-600' };
            if (count >= 5) return { box: 'bg-rose-50 border-rose-200', num: 'text-rose-700', chip: 'bg-rose-100 text-rose-700', more: 'text-rose-600' };
            if (count >= 3) return { box: 'bg-amber-50 border-amber-200', num: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', more: 'text-amber-600' };
            if (count >= 1) return { box: 'bg-emerald-50 border-emerald-200', num: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700', more: 'text-emerald-600' };
            return { box: 'bg-white border-slate-200', num: 'text-slate-600', chip: 'bg-indigo-100 text-indigo-700', more: 'text-slate-500' };
        };

        let html = '';
        for (let i = firstDayIndex; i > 0; i--) {
            html += `<div class="day other-month"><div class="day-number">${lastDayPrev - i + 1}</div></div>`;
        }
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const dateStr = localDateStr(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
            const isToday = dateStr === getTodayStr();
            const dayEvs = getEventsForDateStr(dateStr);
            const hasBday = dayEvs.some(e => e.type === 'birthday');
            const s = ds(dayEvs.length, hasBday);

            html += `<div class="day ${isToday ? 'today' : ''} ${s.box}" data-date="${dateStr}" onclick="window.showTasksForSelectedDay('${dateStr}')">
                <div class="day-number ${s.num}">${i}</div>
                ${dayEvs.length > 0 ? `<div class="events-list">
                    ${dayEvs.slice(0, 3).map(ev => `<div class="event ${ev.type || 'personal'} ${s.chip}" title="${ev.title}">${ev.title}</div>`).join('')}
                    ${dayEvs.length > 3 ? `<div class="events-more ${s.more}">+${dayEvs.length - 3} more</div>` : ''}
                </div>` : ''}
            </div>`;
        }
        const extra = 42 - (firstDayIndex + lastDay.getDate());
        for (let i = 1; i <= extra; i++) {
            html += `<div class="day other-month"><div class="day-number">${i}</div></div>`;
        }
        calendarDays.innerHTML = html;
    }

    function getEventsForDateStr(dateStr) {
        const parts = dateStr.split('-').map(Number);
        const day = parts[2];
        const month = parts[1] - 1;

        const regular = events.filter(ev => ev.type !== 'birthday' && ev.date === dateStr);
        const bdays = events.filter(ev => {
            if (ev.type !== 'birthday') return false;
            const bparts = ev.date.split('-').map(Number);
            return bparts[2] === day && (bparts[1] - 1) === month;
        });
        return [...regular, ...bdays];
    }

    // ─── SELECTED-DAY PANEL ───────────────────────────────────────────────────
    window.showTasksForSelectedDay = (dateStr) => {
        const container = document.getElementById('selected-day-tasks');
        if (!container) return;

        selectedDate = dateStr;
        document.querySelectorAll('.day').forEach(d => d.classList.remove('border-indigo-500', 'bg-indigo-50'));
        const activeEl = document.querySelector(`[data-date="${dateStr}"]`);
        if (activeEl) activeEl.classList.add('border-indigo-500', 'bg-indigo-50');

        const dayEvs = getEventsForDateStr(dateStr);
        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4';
        header.innerHTML = `<h4 class="font-semibold text-slate-800 flex items-center gap-2">
            <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">${dayEvs.length}</span>
            Events for ${dateStr}
        </h4>`;

        const actions = document.createElement('div');
        actions.className = 'flex gap-2';
        actions.innerHTML = `
            <button class="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100" onclick="window.openEventModal('${dateStr}')">+ Event</button>
            <button class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100" onclick="window.openBirthdayModal('${dateStr}')">+ Birthday</button>`;
        header.appendChild(actions);
        container.appendChild(header);

        if (!dayEvs.length) {
            const empty = document.createElement('div');
            empty.className = 'text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300';
            empty.innerHTML = `<p class="text-slate-500 font-medium">No events for ${dateStr}</p><p class="text-xs text-slate-400 mt-1">Use the buttons above to add one!</p>`;
            container.appendChild(empty);
            return;
        }

        const list = document.createElement('div');
        list.className = 'space-y-3';
        dayEvs.forEach(ev => {
            const el = document.createElement('div');
            el.className = 'group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all';
            el.innerHTML = `<div>
                <div class="font-semibold text-slate-800">${ev.title}</div>
                ${ev.description ? `<div class="text-sm text-slate-500 mt-1">${ev.description}</div>` : ''}
            </div>
            <button class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                onclick="window.deleteEvent('${ev.id}', '${dateStr}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>`;
            list.appendChild(el);
        });
        container.appendChild(list);
    };

    // ─── SAVE / DELETE ────────────────────────────────────────────────────────
    async function executeSaveEvent(data) {
        try {
            const saved = await window.api.post('/api/calendar/events', {
                title: data.title, date: data.date,
                time: data.time, description: data.description,
                type: data.type || 'personal'
            });
            events.push({
                id: saved.id || saved.insertId,
                title: data.title, date: data.date,
                time: data.time, description: data.description,
                type: data.type || 'personal'
            });
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

        const dateStr = localDateStr(new Date(y, m - 1, d));
        try {
            const saved = await window.api.post('/api/calendar/events', {
                title: `${name}'s Birthday`, date: dateStr, type: 'birthday',
                description: `Turns ${new Date().getFullYear() - y} this year!`
            });
            events.push({
                id: saved.id || saved.insertId,
                title: `${name}'s Birthday`,
                date: dateStr, type: 'birthday'
            });
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
        if (!confirm('Delete this event?')) return;
        try {
            await window.api.delete(`/api/calendar/events/${eventId}`);
            events = events.filter(e => String(e.id) !== String(eventId));
            renderCalendar();
            window.showTasksForSelectedDay(dateStr);
        } catch (err) { alert('Failed to delete event'); }
    };

    // ─── NAV ──────────────────────────────────────────────────────────────────
    function updateMonthYear() {
        if (monthYear) monthYear.textContent = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
    prevMonthBtn && prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); updateMonthYear(); });
    nextMonthBtn && nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); updateMonthYear(); });
    todayBtn && todayBtn.addEventListener('click', () => { currentDate = new Date(); renderCalendar(); updateMonthYear(); });

    window.openBirthdayModal = (dateStr = '') => {
        const target = dateStr || selectedDate || getTodayStr();
        if (birthdayModal) birthdayModal.classList.remove('hidden');
        bdayName.value = '';
        if (target) {
            const [y, m, d] = target.split('-');
            bdayYear.value = y; bdayMonth.value = parseInt(m).toString(); bdayDay.value = parseInt(d).toString();
        }
    };
    function closeBirthdayModal() { if (birthdayModal) birthdayModal.classList.add('hidden'); }

    window.openEventModal = (date = '') => {
        const target = date || selectedDate || getTodayStr();
        if (eventDate) eventDate.value = target;
        if (eventTitle) eventTitle.value = '';
        if (eventModal) eventModal.classList.remove('hidden');
    };
    function closeEventModal() { if (eventModal) eventModal.classList.add('hidden'); }
    function closeLimitModal() { if (limitWarningModal) limitWarningModal.classList.add('hidden'); pendingEventData = null; }

    function initListeners() {
        addBirthdayBtn && addBirthdayBtn.addEventListener('click', () => window.openBirthdayModal());
        closeBirthdayModalBtn && closeBirthdayModalBtn.addEventListener('click', closeBirthdayModal);
        cancelBirthdayBtn && cancelBirthdayBtn.addEventListener('click', closeBirthdayModal);
        birthdayForm && birthdayForm.addEventListener('submit', saveBirthday);
        addEventBtn && addEventBtn.addEventListener('click', () => window.openEventModal());
        closeModalBtn && closeModalBtn.addEventListener('click', closeEventModal);
        cancelEventBtn && cancelEventBtn.addEventListener('click', closeEventModal);
        eventForm && eventForm.addEventListener('submit', saveEvent);
        limitProceedBtn && limitProceedBtn.addEventListener('click', () => { if (pendingEventData) executeSaveEvent(pendingEventData); });
        limitCancelBtn && limitCancelBtn.addEventListener('click', closeLimitModal);
    }

    async function initCalendar() {
        initListeners();
        await loadEvents();
        updateMonthYear();
        window.showTasksForSelectedDay(selectedDate);
    }
    initCalendar();
});
