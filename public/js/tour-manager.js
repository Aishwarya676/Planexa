/**
 * tour-manager.js - Final polished and stable onboarding tour for Planexa
 * Targeted fixes: Even higher centering (50%), scroll lock, modal cleanup, snappy transitions,
 * visual-only simulations (dummy items added to UI without backend calls), and manual restart.
 */

class TourManager {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: "Welcome to Planexa!",
                content: "Your unified ecosystem for productivity. Let's take a quick look at how things work.",
                target: null, // Center screen
                icon: "sparkles",
                action: () => this.goToTab('todo')
            },
            {
                title: "Smart Task Prioritization",
                content: "Watch how easy it is to add a task! We'll set priorities using the Eisenhower Matrix logic to organize your life.",
                target: "#tab-todo .card",
                icon: "check-circle",
                action: async () => {
                    await this.goToTab('todo');
                    this.runSimulation('todo');
                }
            },
            {
                title: "Efficient Shopping",
                content: "Organizing your essentials is effortless. Add items to your digital notepad in seconds.",
                target: "#tab-shopping .card:first-of-type", // Refined for stability
                icon: "shopping-bag",
                action: async () => {
                    await this.goToTab('shopping');
                    this.runSimulation('shopping');
                }
            },
            {
                title: "Never Miss a Beat",
                content: "Set smart reminders for time-sensitive tasks. We'll make sure you stay on top of your schedule with timely alerts.",
                target: "#tab-reminders .card",
                icon: "bell",
                action: async () => {
                    await this.goToTab('reminders');
                    this.runSimulation('reminders');
                }
            },
            {
                title: "Goal Management",
                content: "Define your long-term vision and track progress across health, career, and personal categories.",
                target: "#tab-goals .card",
                icon: "target",
                action: async () => {
                    await this.goToTab('goals');
                    this.runSimulation('goals');
                }
            },
            {
                title: "Events & Calendar",
                content: "Stay ahead with our integrated calendar. Manage your social and professional schedule in one beautiful view.",
                target: ".calendar-container",
                icon: "calendar",
                action: async () => {
                    await this.goToTab('calendar');
                    this.runSimulation('events');
                }
            },
            {
                title: "Meet Our Expert Coaches",
                content: "Unlock your full potential with world-class mentors. Our elite coaches provide personalized guidance to skyrocket your growth.",
                target: "#profile-btn",
                icon: "users",
                action: null
            },
            {
                title: "You're all set!",
                content: "You've seen the core features. Explore the customization options in your profile to make Planexa truly yours!",
                target: null,
                icon: "party-popper",
                action: null
            }
        ];

        this.overlay = null;
        this.tooltip = null;
        this.skipBtn = null;
        this.isSimulating = false;
        this.transitionId = 0; // ID for transition tracking (Request ID pattern)
        this.highlightTimeout = null; // TRACKER for highlight delay
        this.holePadding = 12;
    }

    async init() {
        try {
            const data = await window.AuthHelper.checkAuth();
            if (data && data.isAuthenticated && data.userType === 'user' && !data.onboarding_completed) {
                this.start();
            }
        } catch (e) {
            console.error("Tour initialization error:", e);
        }
    }

    start() {
        // LOCK SCROLL
        document.body.style.overflow = 'hidden';
        if (!this.overlay) this.createElements();

        // Ensure UI is visible
        if (this.overlay) this.overlay.style.display = 'block';
        if (this.tooltip) this.tooltip.style.display = 'block';
        if (this.skipBtn) this.skipBtn.style.display = 'flex';

        setTimeout(() => this.showStep(0), 100);
    }

    restartTour() {
        // Close profile dropdown if open
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) {
            dropdown.classList.remove('show'); // Logic match for real app
            const chevron = document.getElementById('profile-chevron');
            if (chevron) chevron.style.transform = '';
        }

        // Clear any dummy items from previous runs
        document.querySelectorAll('.tour-dummy-item').forEach(el => el.remove());

        this.currentStep = 0;
        this.start();
    }

    createElements() {
        // Create SVG Overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'tour-overlay';
        this.overlay.innerHTML = `
            <svg width="100%" height="100%" style="position:fixed; top:0; left:0; z-index:9998; pointer-events:none;">
                <defs>
                    <mask id="tour-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect id="tour-hole" x="0" y="0" width="0" height="0" rx="16" fill="black" />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.75)" mask="url(#tour-mask)" style="pointer-events:auto;" />
            </svg>
        `;
        document.body.appendChild(this.overlay);

        // Create Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'tour-tooltip';
        this.tooltip.className = 'fixed z-[9999] bg-white text-slate-900 rounded-[2.5rem] shadow-[0_30px_70px_rgba(0,0,0,0.5)] w-[22rem] transition-all duration-500 transform scale-90 opacity-0 border border-slate-100 overflow-hidden';
        this.tooltip.style.pointerEvents = 'auto';
        document.body.appendChild(this.tooltip);

        // Create Skip Button (Perfect Brand Match)
        this.skipBtn = document.createElement('button');
        this.skipBtn.id = 'tour-skip-fixed';
        this.skipBtn.className = 'fixed top-5 right-8 z-[9999] bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 hover:from-indigo-600 hover:to-purple-600 text-white px-8 py-3 rounded-full shadow-[0_8px_30px_rgba(99,102,241,0.5)] font-bold text-sm transition-all opacity-0 pointer-events-none transform -translate-y-4 flex items-center gap-2 border border-white/20';
        this.skipBtn.innerHTML = `<span>Skip Tour</span><i data-lucide="x-circle" class="w-4 h-4"></i>`;
        this.skipBtn.onclick = (e) => {
            e.stopPropagation();
            this.finish();
        };
        document.body.appendChild(this.skipBtn);
        if (window.lucide) window.lucide.createIcons();

        // Add CSS
        const style = document.createElement('style');
        style.textContent = `
            #tour-tooltip { font-family: 'Plus Jakarta Sans', sans-serif; }
            .tour-header {
                background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
                padding: 1.75rem;
                color: white;
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            .tour-content { padding: 1.75rem; }
            .tour-btn {
                padding: 12px 24px;
                border-radius: 16px;
                font-weight: 700;
                font-size: 14px;
                transition: all 0.3s cubic;
            }
            .tour-btn-next {
                background: #6366f1;
                color: white;
                box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
            }
            .tour-btn-next:hover { 
                background: #4f46e5; 
                transform: translateY(-2px);
            }
            .tour-btn-back {
                color: #64748b;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .tour-btn-back:hover { 
                color: #1e293b;
                background: #f1f5f9;
            }
            #tour-hole { transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
            .tour-icon-box {
                width: 48px; height: 48px;
                background: rgba(255,255,255,0.2);
                backdrop-filter: blur(4px);
                border-radius: 14px;
                display: flex; align-items: center; justify-content: center;
                border: 1px solid rgba(255,255,255,0.3);
            }
            .simulation-cursor {
                position: fixed;
                width: 24px; height: 24px;
                background: rgba(99, 102, 241, 0.8);
                border: 2px solid white;
                border-radius: 50%;
                z-index: 10000;
                pointer-events: none;
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 25px rgba(99, 102, 241, 0.6);
                display: none;
            }
            .tour-pulse-element {
                animation: tour-pulse 1s infinite alternate ease-in-out;
                z-index: 9999 !important;
                outline: 3px solid #6366f1 !important;
                outline-offset: 2px;
            }
            @keyframes tour-pulse {
                0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
                100% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
            }
        `;
        document.head.appendChild(style);

        this.cursor = document.createElement('div');
        this.cursor.className = 'simulation-cursor';
        document.body.appendChild(this.cursor);

        // Adjust on resize
        window.addEventListener('resize', () => {
            if (this.tooltip && this.currentStep < this.steps.length) {
                this.positionAndHighlight(this.steps[this.currentStep].target);
            }
        });
    }

    async goToTab(tabId) {
        const tabLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (tabLink) {
            tabLink.click();
            await this.wait(500);
        }
    }

    closeAllModals() {
        const modalSelectors = ['#event-modal', '#edit-goal-modal', '#limit-warning-modal'];
        modalSelectors.forEach(sel => {
            const modal = document.querySelector(sel);
            if (modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
                const closeBtn = modal.querySelector('button[id*="close"]');
                if (closeBtn) closeBtn.click();
            }
        });
    }

    async showStep(index) {
        // INCREMENT TRANSITION ID (Invalidates previous attempts)
        this.transitionId++;
        const executionId = this.transitionId;

        // BREAK SIMULATION IMMEDIATELY
        this.isSimulating = false;
        this.hideCursor();

        // CANCEL ANY PENDING HIGHLIGHTS
        if (this.highlightTimeout) clearTimeout(this.highlightTimeout);

        // IMMEDIATE VISUAL RESET (Hide highlight during transition)
        const hole = document.getElementById('tour-hole');
        if (hole) {
            hole.setAttribute('width', '0');
            hole.setAttribute('height', '0');
        }

        // CLEANUP MODALS & DUMMY ITEMS
        this.closeAllModals();
        document.querySelectorAll('.tour-dummy-item').forEach(el => el.remove());

        this.currentStep = index;
        const step = this.steps[index];

        if (step.action) await step.action();

        // CANCELLATION CHECK: If another step started during await, ABORT
        if (this.transitionId !== executionId) return;

        const isLast = index === this.steps.length - 1;
        const isFirst = index === 0;

        this.tooltip.innerHTML = `
            <div class="tour-header">
                <div class="tour-icon-box">
                    <i data-lucide="${step.icon || 'info'}" class="w-6 h-6"></i>
                </div>
                <h3 class="text-xl font-extrabold tracking-tight">${step.title}</h3>
            </div>
            <div class="tour-content">
                <p class="text-slate-600 mb-8 leading-relaxed text-[15px] font-medium">${step.content}</p>
                <div class="flex items-center justify-between">
                    ${!isFirst ? `<button onclick="window.tourManager.prevStep()" class="tour-btn tour-btn-back"><i data-lucide="chevron-left" class="w-4 h-4"></i> Back</button>` : '<div></div>'}
                    <button id="tour-next-btn" onclick="window.tourManager.nextStep()" class="tour-btn tour-btn-next px-10">${isLast ? 'Get Started' : 'Next'}</button>
                </div>
            </div>
        `;

        // CANCELLATION CHECK
        if (this.transitionId !== executionId) return;

        if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });

        if (this.skipBtn) {
            this.skipBtn.style.opacity = isLast ? '0' : '1';
            this.skipBtn.style.transform = isLast ? 'translateY(-16px)' : 'translateY(0)';
            this.skipBtn.style.pointerEvents = isLast ? 'none' : 'auto';
        }

        // POSITION HIGHLIGHT (With increased wait and tracker)
        this.highlightTimeout = setTimeout(() => {
            if (this.transitionId !== executionId) return; // Final check
            this.positionAndHighlight(step.target);
        }, 300);
    }

    positionAndHighlight(targetSelector) {
        const hole = document.getElementById('tour-hole');
        if (!hole) return;

        const tooltipHeight = 280;
        const tooltipWidth = 352;

        if (!targetSelector) {
            hole.setAttribute('width', '0');
            hole.setAttribute('height', '0');

            // Perfect centering - 50% height
            this.tooltip.style.left = '50%';
            this.tooltip.style.top = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%) scale(100%)';
            this.tooltip.style.opacity = '1';
        } else {
            const target = (typeof targetSelector === 'string') ? document.querySelector(targetSelector) : targetSelector;
            if (target) {
                const rect = target.getBoundingClientRect();

                // Reliability fix: If target isn't fully rendered or in a hidden tab, don't jump to corner
                if (rect.width < 5 || rect.height < 5) {
                    hole.setAttribute('width', '0');
                    hole.setAttribute('height', '0');
                    this.tooltip.style.left = '50%';
                    this.tooltip.style.top = '50%';
                    this.tooltip.style.transform = 'translate(-50%, -50%) scale(100%)';
                    return;
                }

                const padding = this.holePadding;
                hole.setAttribute('x', rect.left - padding);
                hole.setAttribute('y', rect.top - padding);
                hole.setAttribute('width', rect.width + padding * 2);
                hole.setAttribute('height', rect.height + padding * 2);

                let top;
                let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

                const NAVBAR_HEIGHT = 85;
                const margin = 24;

                const eventModal = document.getElementById('event-modal');
                const isModalOpen = eventModal && !eventModal.classList.contains('hidden');

                if (isModalOpen) {
                    left = window.innerWidth / 2 + 250;
                    top = window.innerHeight / 2 - tooltipHeight / 2;
                    if (left + tooltipWidth > window.innerWidth - 20) left = window.innerWidth / 2 - 250 - tooltipWidth;
                } else {
                    const spaceBelow = window.innerHeight - rect.bottom;
                    const spaceAbove = rect.top - NAVBAR_HEIGHT;

                    if (spaceBelow > tooltipHeight + margin || spaceBelow > spaceAbove) {
                        top = rect.bottom + margin;
                    } else {
                        top = rect.top - tooltipHeight - margin;
                    }

                    if (top < NAVBAR_HEIGHT + margin) {
                        top = (window.innerHeight - rect.bottom > tooltipHeight + 40) ? rect.bottom + margin : NAVBAR_HEIGHT + margin;
                    }
                }

                // Final safety bounds
                if (top + tooltipHeight > window.innerHeight - 20) top = window.innerHeight - tooltipHeight - 20;
                if (top < 20) top = 20;
                if (left < 20) left = 20;
                if (left + tooltipWidth > window.innerWidth - 20) left = window.innerWidth - tooltipWidth - 20;

                this.tooltip.style.top = `${top}px`;
                this.tooltip.style.left = `${left}px`;
                this.tooltip.style.transform = 'scale(100%)';
                this.tooltip.style.opacity = '1';
            } else {
                // Fallback centering (50%)
                this.tooltip.style.left = '50%';
                this.tooltip.style.top = '50%';
                this.tooltip.style.transform = 'translate(-50%, -50%) scale(100%)';
            }
        }
    }

    async nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            await this.showStep(this.currentStep + 1);
        } else {
            await this.finish();
        }
    }

    async prevStep() {
        if (this.currentStep > 0) {
            await this.showStep(this.currentStep - 1);
        }
    }

    async runSimulation(type) {
        if (this.isSimulating) return;
        this.isSimulating = true;
        const executionId = this.transitionId; // CAPTURE CURRENT ID

        // Wait for UI to settle (e.g. tab transitions)
        await this.wait(200);
        if (!this.isSimulating || this.transitionId !== executionId) return; // CHECK ID

        try {
            if (type === 'todo') await this.simulateTodo(executionId);
            else if (type === 'shopping') await this.simulateShopping(executionId);
            else if (type === 'reminders') await this.simulateReminders(executionId);
            else if (type === 'goals') await this.simulateGoals(executionId);
            else if (type === 'events') await this.simulateEvents(executionId);
        } catch (e) {
            console.error("Simulation failed:", e);
        }

        if (this.isSimulating && this.transitionId === executionId) {
            this.isSimulating = false;
            this.hideCursor();
            const step = this.steps[this.currentStep];
            if (step) this.positionAndHighlight(step.target);
        }
    }

    async waitForElement(selector) {
        for (let i = 0; i < 12; i++) {
            const el = document.querySelector(selector);
            if (el && el.getBoundingClientRect().width > 0) return el;
            await this.wait(200);
        }
        return null;
    }

    addDummyVisualItem(containerId, html) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const item = temp.firstElementChild;
        item.classList.add('tour-dummy-item', 'animate-bounce');
        container.insertBefore(item, container.firstChild);
        setTimeout(() => item.classList.remove('animate-bounce'), 1000);
        if (window.lucide) window.lucide.createIcons();
    }

    async simulateTodo(executionId) {
        const input = await this.waitForElement('#todo-input');
        if (!input || !this.isSimulating || this.transitionId !== executionId) return;

        await this.moveCursorAndHighlight(input, executionId);
        if (!this.isSimulating || this.transitionId !== executionId) return;

        input.focus();
        await this.typeText(input, "Hit the gym", executionId);
        if (this.transitionId !== executionId) return;

        await this.wait(800);
        if (this.transitionId !== executionId) return;

        const imp = document.querySelector('#todo-importance');
        if (imp && this.isSimulating) {
            await this.moveCursorAndHighlight(imp, executionId);
            if (this.transitionId !== executionId) return;

            imp.value = 'important';
            imp.dispatchEvent(new Event('change', { bubbles: true }));
            imp.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;
            imp.classList.remove('tour-pulse-element');
        }

        const urg = document.querySelector('#todo-urgency');
        if (urg && this.isSimulating) {
            await this.moveCursorAndHighlight(urg, executionId);
            if (this.transitionId !== executionId) return;

            urg.value = 'urgent';
            urg.dispatchEvent(new Event('change', { bubbles: true }));
            urg.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;
            urg.classList.remove('tour-pulse-element');
        }

        const addBtn = document.querySelector('#todo-add');
        if (addBtn && this.isSimulating) {
            await this.moveCursorAndHighlight(addBtn, executionId);
            if (this.transitionId !== executionId) return;

            addBtn.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;

            // VISUAL DUMMY ADD
            this.addDummyVisualItem('todo-list-do', `
                <li class="card flex items-center justify-between p-3">
                  <div class="flex items-center gap-2 w-full">
                    <input type="checkbox" class="h-4 w-4">
                    <span>Hit the gym (Demo)</span>
                  </div>
                  <button class="icon-btn ml-2 text-red-500"><i data-lucide="trash" class="w-4 h-4"></i></button>
                </li>
            `);

            await this.wait(500);
            if (this.transitionId !== executionId) return;
            addBtn.classList.remove('tour-pulse-element');
        }
    }

    async simulateShopping(executionId) {
        const input = await this.waitForElement('#shop-input');
        if (!input || !this.isSimulating || this.transitionId !== executionId) return;

        await this.moveCursorAndHighlight(input, executionId);
        if (this.transitionId !== executionId) return;

        input.focus();
        await this.typeText(input, "Organic Bananas", executionId);
        if (this.transitionId !== executionId) return;

        await this.wait(1000);
        if (this.transitionId !== executionId) return;

        const addBtn = document.querySelector('#shop-add');
        if (addBtn && this.isSimulating) {
            await this.moveCursorAndHighlight(addBtn, executionId);
            if (this.transitionId !== executionId) return;

            addBtn.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;

            // VISUAL DUMMY ADD
            this.addDummyVisualItem('shop-list', `
                <li class="notepad-item py-1 px-2 hover:bg-black/5 transition-colors rounded-lg group">
                  <div class="flex items-center gap-3 flex-1">
                    <input type="checkbox" class="w-5 h-5 cursor-pointer rounded-full border-2 border-indigo-400">
                    <span class="text-xl font-medium text-gray-800">Organic Bananas (Demo)</span>
                  </div>
                  <button class="icon-btn text-red-500 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </li>
            `);

            await this.wait(500);
            if (this.transitionId !== executionId) return;
            addBtn.classList.remove('tour-pulse-element');
        }
    }

    async simulateReminders(executionId) {
        const input = await this.waitForElement('#rem-title');
        if (!input || !this.isSimulating || this.transitionId !== executionId) return;

        await this.moveCursorAndHighlight(input, executionId);
        if (this.transitionId !== executionId) return;

        input.focus();
        await this.typeText(input, "Team synchronization", executionId);
        if (this.transitionId !== executionId) return;

        await this.wait(1000);
        if (this.transitionId !== executionId) return;

        const dateInput = document.querySelector('#rem-datetime');
        if (dateInput && this.isSimulating) {
            await this.moveCursorAndHighlight(dateInput, executionId);
            if (this.transitionId !== executionId) return;

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            dateInput.value = tomorrow.toISOString().slice(0, 16);
            await this.wait(1200);
            if (this.transitionId !== executionId) return;
        }

        const addBtn = document.querySelector('#rem-add');
        if (addBtn && this.isSimulating) {
            await this.moveCursorAndHighlight(addBtn, executionId);
            if (this.transitionId !== executionId) return;

            addBtn.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;

            // VISUAL DUMMY ADD
            this.addDummyVisualItem('rem-list', `
                <li class="card flex items-center justify-between p-3">
                  <div class="flex items-center gap-2">
                    <input type="checkbox" class="h-4 w-4">
                    <div>
                      <div>Team synchronization (Demo)</div>
                      <div class="text-xs text-slate-500">Scheduled</div>
                    </div>
                  </div>
                  <button class="icon-btn text-red-500"><i data-lucide="trash" class="w-4 h-4"></i></button>
                </li>
            `);

            await this.wait(500);
            if (this.transitionId !== executionId) return;
            addBtn.classList.remove('tour-pulse-element');
        }
    }

    async simulateGoals(executionId) {
        const input = await this.waitForElement('#goal-title');
        if (!input || !this.isSimulating || this.transitionId !== executionId) return;

        await this.moveCursorAndHighlight(input, executionId);
        if (this.transitionId !== executionId) return;

        input.focus();
        await this.typeText(input, "Run 5k marathon", executionId);
        if (this.transitionId !== executionId) return;

        await this.wait(1000);
        if (this.transitionId !== executionId) return;

        const cat = document.querySelector('#goal-category');
        if (cat && this.isSimulating) {
            await this.moveCursorAndHighlight(cat, executionId);
            if (this.transitionId !== executionId) return;

            cat.value = 'Health';
            cat.dispatchEvent(new Event('change', { bubbles: true }));
            cat.classList.add('tour-pulse-element');
            await this.wait(1200);
            if (this.transitionId !== executionId) return;
            cat.classList.remove('tour-pulse-element');
        }

        const total = document.querySelector('#goal-total');
        if (total && this.isSimulating) {
            await this.moveCursorAndHighlight(total, executionId);
            if (this.transitionId !== executionId) return;

            total.value = '20';
            await this.wait(800);
            if (this.transitionId !== executionId) return;
        }

        const addBtn = document.querySelector('#goal-add');
        if (addBtn && this.isSimulating) {
            await this.moveCursorAndHighlight(addBtn, executionId);
            if (this.transitionId !== executionId) return;

            addBtn.classList.add('tour-pulse-element');
            await this.wait(1000);
            if (this.transitionId !== executionId) return;

            // VISUAL DUMMY ADD
            this.addDummyVisualItem('goal-list', `
                <li class="card p-4 border-l-4 border-green-800">
                  <div class="flex justify-between items-start">
                    <div>
                      <div class="font-bold text-slate-800">Run 5k marathon (Demo)</div>
                      <div class="text-xs text-green-700 font-bold uppercase mt-1">Health</div>
                    </div>
                    <div class="text-xs font-bold text-slate-400">0 / 20 hrs</div>
                  </div>
                </li>
            `);

            await this.wait(500);
            if (this.transitionId !== executionId) return;
            addBtn.classList.remove('tour-pulse-element');
        }
    }

    async simulateEvents(executionId) {
        const addEvBtn = await this.waitForElement('#add-event-btn');
        if (!addEvBtn || !this.isSimulating || this.transitionId !== executionId) return;

        await this.moveCursorAndHighlight(addEvBtn, executionId);
        if (this.transitionId !== executionId) return;

        addEvBtn.click();
        await this.wait(1500);
        if (this.transitionId !== executionId) return;

        const modal = document.querySelector('#event-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const title = document.querySelector('#event-title');
            if (title && this.isSimulating) {
                await this.moveCursorAndHighlight(title, executionId);
                if (this.transitionId !== executionId) return;

                title.focus();
                await this.typeText(title, "Product Launch", executionId);
                if (this.transitionId !== executionId) return;

                await this.wait(1500);
                if (this.transitionId !== executionId) return;

                const saveBtn = modal.querySelector('button[type="submit"]') || modal.querySelector('.bg-indigo-600');
                if (saveBtn && this.isSimulating) {
                    await this.moveCursorAndHighlight(saveBtn, executionId);
                    if (this.transitionId !== executionId) return;

                    saveBtn.classList.add('tour-pulse-element');
                    await this.wait(1000);
                    if (this.transitionId !== executionId) return;

                    saveBtn.classList.remove('tour-pulse-element');
                    this.closeAllModals();
                }
            }
        }
    }

    async typeText(element, text, executionId) {
        const originalValue = element.value;
        element.value = '';
        for (const char of text) {
            if (!this.isSimulating || this.transitionId !== executionId) break;
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await this.wait(120);
        }
        setTimeout(() => { if (element) element.value = originalValue; }, 2000);
    }

    async moveCursorAndHighlight(element, executionId) {
        if (!this.isSimulating || (executionId && this.transitionId !== executionId)) return;
        const rect = element.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
            this.cursor.style.display = 'block';
            this.cursor.style.left = `${rect.left + rect.width / 2}px`;
            this.cursor.style.top = `${rect.top + rect.height / 2}px`;
        }

        this.positionAndHighlight(element);
        await this.wait(1200);

        // Final check after wait
        if (executionId && this.transitionId !== executionId) return;
    }

    hideCursor() {
        this.cursor.style.display = 'none';
        document.querySelectorAll('.tour-pulse-element').forEach(el => el.classList.remove('tour-pulse-element'));
    }

    wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    async finish() {
        this.isSimulating = false;
        // RESTORE SCROLL
        document.body.style.overflow = '';

        if (this.overlay) this.overlay.style.display = 'none';
        if (this.tooltip) this.tooltip.style.display = 'none';
        if (this.skipBtn) this.skipBtn.style.display = 'none';
        if (this.cursor) this.cursor.style.display = 'none';
        document.querySelectorAll('.tour-dummy-item').forEach(el => el.remove());

        try {
            await fetch('/api/user/complete-onboarding', { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error("Failed to mark onboarding as completed:", e);
        }
    }
}

window.tourManager = new TourManager();
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('app.html')) {
        setTimeout(() => window.tourManager.init(), 100);
    }
});
