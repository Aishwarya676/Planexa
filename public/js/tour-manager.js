/**
 * tour-manager.js - Highlight-based onboarding tour for Planexa
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
                title: "Prioritize Your Tasks",
                content: "Use these dropdowns to set Importance and Urgency. Our system automatically places your tasks in the Eisenhower Matrix below to help you focus.",
                target: "#todo-importance", // We'll highlight importance first, or maybe both if we can
                icon: "filter",
                action: () => this.goToTab('todo')
            },
            {
                title: "Ready to Start?",
                content: "Once you've entered your task name and priorities, click here to add it to your list and start being productive!",
                target: "#todo-add",
                icon: "plus-circle",
                action: () => this.goToTab('todo')
            },
            {
                title: "Shopping Essentials",
                content: "Keep track of everything you need to buy. The smooth notepad interface makes organization feel effortless.",
                target: "#tab-shopping .card",
                icon: "shopping-bag",
                action: () => this.goToTab('shopping')
            },
            {
                title: "Never Miss a Beat",
                content: "Set smart reminders for time-sensitive tasks. We'll make sure you stay on top of your schedule with timely alerts.",
                target: "#tab-reminders .card",
                icon: "bell",
                action: () => this.goToTab('reminders')
            },
            {
                title: "Goal Categories",
                content: "Organize your long-term visions by category. Whether it's Financial, Career, or Personal, we help you track progress systematically.",
                target: "#goal-category",
                icon: "tag",
                action: () => this.goToTab('goals')
            },
            {
                title: "Events & Calendar",
                content: "Stay ahead with our integrated calendar. Manage your social and professional schedule in one beautiful, unified view.",
                target: ".calendar-container",
                icon: "calendar",
                action: () => this.goToTab('calendar')
            },
            {
                title: "Meet Our Expert Coaches",
                content: "Unlock your full potential with world-class mentors. Our elite coaches provide personalized guidance, business strategies, and professional breakthroughs to skyrocket your growth.",
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
        this.onboardingCompleted = false;
    }

    async init() {
        // Check if user needs onboarding
        try {
            const data = await window.AuthHelper.checkAuth();
            if (data && data.isAuthenticated && data.userType === 'user' && !data.onboarding_completed) {
                this.createElements();
                this.showStep(0);
            }
        } catch (e) {
            console.error("Tour initialization error:", e);
        }
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
        this.tooltip.className = 'fixed z-[9999] bg-white text-slate-900 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-[22rem] transition-all duration-500 transform scale-90 opacity-0 border border-slate-100 overflow-hidden';
        this.tooltip.style.pointerEvents = 'auto';
        document.body.appendChild(this.tooltip);

        // Add CSS
        const style = document.createElement('style');
        style.textContent = `
            #tour-tooltip {
                font-family: 'Plus Jakarta Sans', sans-serif;
            }
            .tour-header {
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                padding: 1.5rem;
                color: white;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            .tour-content {
                padding: 1.5rem;
            }
            .tour-btn {
                padding: 10px 20px;
                border-radius: 12px;
                font-weight: 700;
                font-size: 14px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .tour-btn-next {
                background: #4f46e5;
                color: white;
                box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
            }
            .tour-btn-next:hover { 
                background: #4338ca; 
                transform: translateY(-2px);
                box-shadow: 0 6px 15px rgba(79, 70, 229, 0.4);
            }
            .tour-btn-skip {
                color: #64748b;
            }
            .tour-btn-skip:hover { 
                color: #1e293b;
                background: #f1f5f9;
            }
            #tour-hole {
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .tour-icon-box {
                width: 40px;
                height: 40px;
                background: rgba(255,255,255,0.2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        `;
        document.head.appendChild(style);
    }

    goToTab(tabId) {
        const tabLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (tabLink) tabLink.click();
    }

    showStep(index) {
        this.currentStep = index;
        const step = this.steps[index];

        if (step.action) step.action();

        // Update Tooltip Content
        const isLast = index === this.steps.length - 1;
        this.tooltip.innerHTML = `
            <div class="tour-header">
                <div class="tour-icon-box">
                    <i data-lucide="${step.icon || 'info'}" class="w-5 h-5"></i>
                </div>
                <h3 class="text-xl font-extrabold tracking-tight">${step.title}</h3>
            </div>
            <div class="tour-content">
                <p class="text-slate-600 mb-8 leading-relaxed text-[15px] font-medium">${step.content}</p>
                <div class="flex items-center justify-between">
                    <button onclick="window.tourManager.finish()" class="tour-btn tour-btn-skip">${isLast ? '' : 'Skip Tour'}</button>
                    <button onclick="window.tourManager.nextStep()" class="tour-btn tour-btn-next px-10">${isLast ? 'Get Started' : 'Next'}</button>
                </div>
            </div>
        `;

        // Refresh icons
        if (window.lucide) window.lucide.createIcons({
            attrs: {
                'stroke-width': 2.5
            }
        });

        // Wait for potential tab switch rendering
        setTimeout(() => {
            this.positionAndHighlight(step.target);
        }, 150);
    }

    positionAndHighlight(targetSelector) {
        const hole = document.getElementById('tour-hole');
        if (!hole) return;

        if (!targetSelector) {
            // Center screen
            hole.setAttribute('width', '0');
            hole.setAttribute('height', '0');

            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%) scale(100%)';
            this.tooltip.style.opacity = '1';
        } else {
            const target = document.querySelector(targetSelector);
            if (target) {
                const rect = target.getBoundingClientRect();
                const padding = 12;

                hole.setAttribute('x', rect.left - padding);
                hole.setAttribute('y', rect.top - padding);
                hole.setAttribute('width', rect.width + padding * 2);
                hole.setAttribute('height', rect.height + padding * 2);

                // Better Tooltip Positioning
                const tooltipHeight = 260; // Estimated height with header
                const tooltipWidth = 352; // 22rem

                let top;
                let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

                const NAVBAR_HEIGHT = 85;
                const margin = 24;

                // Space Check
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top - NAVBAR_HEIGHT;

                if (spaceBelow > tooltipHeight + margin || spaceBelow > spaceAbove) {
                    // Place below
                    top = rect.bottom + margin;
                } else {
                    // Place above
                    top = rect.top - tooltipHeight - margin;
                }

                // Navbar/Safety Bounds check
                if (top < NAVBAR_HEIGHT + margin) {
                    // If blocked by navbar, force it below unless no space
                    if (window.innerHeight - rect.bottom > tooltipHeight + 40) {
                        top = rect.bottom + margin;
                    } else {
                        top = NAVBAR_HEIGHT + margin;
                    }
                }

                if (top + tooltipHeight > window.innerHeight - 20) {
                    top = window.innerHeight - tooltipHeight - 20;
                }

                if (left < 20) left = 20;
                if (left + tooltipWidth > window.innerWidth - 20) left = window.innerWidth - tooltipWidth - 20;

                this.tooltip.style.top = `${top}px`;
                this.tooltip.style.left = `${left}px`;
                this.tooltip.style.transform = 'scale(100%)';
                this.tooltip.style.opacity = '1';

                // Smarter scroll
                const isTooTall = rect.height > (window.innerHeight - NAVBAR_HEIGHT) * 0.8;
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: isTooTall ? 'start' : 'center',
                    inline: 'nearest'
                });

                // Adjust for sticky header if needed
                if (isTooTall) {
                    setTimeout(() => window.scrollBy({ top: -NAVBAR_HEIGHT - 20, behavior: 'smooth' }), 300);
                }
            }
        }
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.finish();
        }
    }

    async finish() {
        // Cleanup UI
        if (this.overlay) this.overlay.remove();
        if (this.tooltip) this.tooltip.remove();

        // Mark as completed
        try {
            await fetch('/api/user/complete-onboarding', { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error("Failed to mark onboarding as completed:", e);
        }
    }
}

// Global instance
window.tourManager = new TourManager();
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on app.html
    if (window.location.pathname.includes('app.html')) {
        setTimeout(() => window.tourManager.init(), 100); // Minimal delay to ensure basic rendering
    }
});
