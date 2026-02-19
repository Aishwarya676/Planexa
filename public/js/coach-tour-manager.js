/**
 * coach-tour-manager.js - Guided onboarding tour specifically for the Coach Dashboard.
 */

class CoachTourManager {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: "Welcome, Coach!",
                content: "Welcome to your Planexa dashboard. Let's take a quick tour of your coaching workspace.",
                target: null, // Center screen
                icon: "sparkles",
                action: () => this.goToTab('users')
            },
            {
                title: "Total Clients",
                content: "Keep track of your expanding impact. This shows the total number of students currently under your mentorship.",
                target: "#stat-total-clients",
                icon: "users",
                action: () => this.goToTab('users')
            },
            {
                title: "Total Revenue",
                content: "Monitor your professional growth. This reflects your total platform earnings from your coaching sessions.",
                target: "#stat-total-revenue",
                icon: "banknote",
                action: () => this.goToTab('users')
            },
            {
                title: "Performance Analytics",
                content: "Get real-time insights into how your students are doing. Filter by individual students to see detailed productivity metrics.",
                target: "#tab-analytics .glass-card:first-child",
                icon: "bar-chart-2",
                action: () => this.goToTab('analytics')
            },
            {
                title: "Approval Workflow",
                content: "Manage incoming requests from students who want to work with you. Approve or decline requests as they come in.",
                target: "#tab-approvals .glass-card:first-child",
                icon: "check-square",
                action: () => this.goToTab('approvals')
            },
            {
                title: "Student Messages",
                content: "Keep in touch with your clients through our integrated chat system. Your messages are organized by student.",
                target: "#tab-messages .glass-card:first-child",
                icon: "message-square",
                action: () => this.goToTab('messages')
            },
            {
                title: "Profile & Settings",
                content: "Update your portfolio, edit your bio, or replay this tour anytime from your profile menu.",
                target: "#coach-profile-btn",
                icon: "user-cog",
                action: null
            },
            {
                title: "You're Ready!",
                content: "You've seen the essentials. Start coaching and helping your students achieve more with Planexa!",
                target: null,
                icon: "party-popper",
                action: null
            }
        ];

        this.overlay = null;
        this.tooltip = null;
        this.skipBtn = null;
        this.isSimulating = false;
        this.transitionId = 0;
        this.highlightTimeout = null;
        this.holePadding = 12;
    }

    async init() {
        // ALWAYS attach replay listener immediately
        this.attachReplayListener();

        try {
            const data = await window.AuthHelper.checkAuth();
            if (!data || !data.isAuthenticated || data.userType !== 'coach') return;

            const coachId = data.coachId || (data.user && data.user.id);
            if (!coachId) return;

            // Check localStorage FOR THIS SPECIFIC COACH for immediate blocking
            const storageKey = `coach_tour_completed_${coachId}`;
            const hasCompleted = localStorage.getItem(storageKey);

            if (!hasCompleted && !data.onboarding_completed) {
                this.start(coachId);
            }
        } catch (e) {
            console.error("Coach Tour initialization error:", e);
        }
    }

    attachReplayListener() {
        const replayBtn = document.getElementById('coach-demo-tour-btn');
        if (replayBtn) {
            // Check if we already attached it
            if (replayBtn.dataset.tourListener) return;

            replayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.restartTour();
            });
            replayBtn.dataset.tourListener = 'true';
        } else {
            // If button not found, try again in a bit (might be dynamic)
            setTimeout(() => this.attachReplayListener(), 1000);
        }
    }

    async start(coachId) {
        if (coachId) {
            // Immediately mark as seen to avoid refresh loops
            localStorage.setItem(`coach_tour_completed_${coachId}`, 'true');
        }

        // Asynchronously update backend so it persists across devices
        fetch('/api/user/complete-onboarding', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error("Onboarding persistence error:", err));

        document.body.style.overflow = 'hidden';
        if (!this.overlay) this.createElements();

        if (this.overlay) {
            this.overlay.style.display = 'block';
            setTimeout(() => this.overlay.style.opacity = '1', 10);
        }
        if (this.tooltip) this.tooltip.style.display = 'block';
        if (this.skipBtn) this.skipBtn.style.display = 'flex';

        setTimeout(() => this.showStep(0), 100);
    }

    restartTour() {
        // Close profile dropdown using the dashboard's class system
        const dropdown = document.getElementById('coach-profile-dropdown');
        const chevron = document.getElementById('nav-profile-chevron');

        if (dropdown) {
            dropdown.classList.remove('show');
        }
        if (chevron) {
            chevron.classList.remove('rotate-180');
        }

        this.currentStep = 0;
        this.start();
    }

    createElements() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'tour-overlay-coach';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9998;
            opacity: 0;
            transition: opacity 0.5s ease;
        `;
        this.overlay.innerHTML = `
            <svg width="100%" height="100%" style="position:absolute; top:0; left:0;">
                <defs>
                    <mask id="tour-mask-coach">
                        <rect width="100%" height="100%" fill="white" />
                        <rect id="tour-hole-coach" x="0" y="0" width="0" height="0" rx="20" fill="black" 
                            style="transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);" />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.85)" mask="url(#tour-mask-coach)" style="pointer-events:auto;" />
            </svg>
        `;
        document.body.appendChild(this.overlay);

        this.tooltip = document.createElement('div');
        this.tooltip.id = 'tour-tooltip-coach';
        this.tooltip.style.cssText = `
            position: fixed;
            z-index: 9999;
            width: 340px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border-radius: 28px;
            padding: 28px;
            box-shadow: 0 30px 60px -12px rgba(15, 23, 42, 0.3);
            display: none;
            opacity: 0;
            transform: scale(0.9) translateY(10px);
            transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid rgba(255, 255, 255, 0.8);
        `;
        document.body.appendChild(this.tooltip);

        this.skipBtn = document.createElement('button');
        this.skipBtn.id = 'tour-skip-coach';
        this.skipBtn.innerHTML = '<i data-lucide="x" style="width:16px;height:16px;"></i>';
        this.skipBtn.style.cssText = `
            position: fixed;
            top: 30px;
            right: 30px;
            z-index: 9999;
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            color: white;
            border: 1px solid rgba(255,255,255,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        `;
        this.skipBtn.onclick = () => this.end();
        document.body.appendChild(this.skipBtn);
        if (window.lucide) lucide.createIcons();
    }

    async goToTab(tabName) {
        const btn = document.querySelector(`button[data-tab='${tabName}']`);
        if (btn) {
            btn.click();
            // Wait for tab content to render and animations to finish
            await new Promise(r => setTimeout(r, 600));
        }
    }

    async showStep(index) {
        this.currentStep = index;
        const step = this.steps[index];

        if (step.action) await step.action();

        const hole = document.getElementById('tour-hole-coach');
        let targetRect = { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 };

        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const r = el.getBoundingClientRect();
                targetRect = {
                    top: r.top - this.holePadding,
                    left: r.left - this.holePadding,
                    width: r.width + (this.holePadding * 2),
                    height: r.height + (this.holePadding * 2)
                };
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        if (hole) {
            hole.setAttribute('x', targetRect.left);
            hole.setAttribute('y', targetRect.top);
            hole.setAttribute('width', targetRect.width);
            hole.setAttribute('height', targetRect.height);
        }

        this.updateTooltip(step, targetRect);
    }

    updateTooltip(step, targetRect) {
        const isLast = this.currentStep === this.steps.length - 1;
        const isFirst = this.currentStep === 0;

        this.tooltip.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                <div style="width:32px; height:32px; background:#f0f7ff; color:#4f46e5; border-radius:10px; display:flex; align-items:center; justify-content:center;">
                    <i data-lucide="${step.icon || 'info'}" style="width:18px;height:18px;"></i>
                </div>
                <h4 style="font-weight:900; color:#1e293b; margin:0; font-size:16px; text-transform:uppercase; letter-spacing:0.5px;">${step.title}</h4>
            </div>
            <p style="color:#64748b; font-size:14px; line-height:1.6; margin-bottom:24px; font-weight:500;">${step.content}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:6px;">
                    ${this.steps.map((_, i) => `<div style="width:6px; height:6px; border-radius:3px; background:${i === this.currentStep ? '#4f46e5' : '#e2e8f0'}; transition:all 0.3s"></div>`).join('')}
                </div>
                <div style="display:flex; gap:10px;">
                    ${!isFirst ? `<button id="tour-prev-coach" style="padding:10px 16px; border-radius:12px; background:#f1f5f9; color:#475569; font-weight:700; font-size:12px; cursor:pointer; border:none; transition:all 0.2s">BACK</button>` : ''}
                    <button id="tour-next-coach" style="padding:10px 20px; border-radius:12px; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:white; font-weight:700; font-size:12px; cursor:pointer; border:none; box-shadow:0 4px 12px rgba(79,70,229,0.3); transition:all 0.2s">
                        ${isLast ? 'FINISH' : 'NEXT'}
                    </button>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();

        // Position tooltip
        const tooltipWidth = 340;
        const tooltipHeight = this.tooltip.offsetHeight || 200;
        let left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        let top = targetRect.top + targetRect.height + 20;

        // Keep on screen
        if (left < 20) left = 20;
        if (left + tooltipWidth > window.innerWidth - 20) left = window.innerWidth - tooltipWidth - 20;
        if (top + tooltipHeight > window.innerHeight - 20) {
            top = targetRect.top - tooltipHeight - 20;
        }
        // Center for No Target
        if (!step.target) {
            left = (window.innerWidth / 2) - (tooltipWidth / 2);
            top = (window.innerHeight / 2) - (tooltipHeight / 2);
        }

        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;

        // Emergency check to ensure it's always readable
        const finalTop = parseInt(this.tooltip.style.top);
        if (finalTop < 70) { // Keep below navbar if possible
            this.tooltip.style.top = '80px';
        }
        if (finalTop + tooltipHeight > window.innerHeight) {
            this.tooltip.style.top = `${window.innerHeight - tooltipHeight - 20}px`;
        }

        this.tooltip.style.display = 'block';
        // Add a small delay to ensure the browser has applied the new position before animating opacity/scale
        setTimeout(() => {
            this.tooltip.style.opacity = '1';
            this.tooltip.style.transform = 'scale(1) translateY(0)';
        }, 10);

        const nextBtn = document.getElementById('tour-next-coach');
        if (nextBtn) nextBtn.onclick = () => isLast ? this.end() : this.showStep(this.currentStep + 1);

        const prevBtn = document.getElementById('tour-prev-coach');
        if (prevBtn) prevBtn.onclick = () => this.showStep(this.currentStep - 1);
    }

    async end() {
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transform = 'scale(0.95)';
        this.overlay.style.opacity = '0';
        document.body.style.overflow = '';

        setTimeout(() => {
            if (this.overlay) this.overlay.style.display = 'none';
            if (this.tooltip) this.tooltip.style.display = 'none';
            if (this.skipBtn) this.skipBtn.style.display = 'none';
        }, 300);

        try {
            // Already marked in start() for speed, but let's ensure session is synced
            await window.AuthHelper.checkAuth();
        } catch (e) {
            console.error("Error refreshing session at tour end:", e);
        }
    }
}

// Global instance
window.CoachTour = new CoachTourManager();
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth helper and potentially other dashboard scripts
    setTimeout(() => window.CoachTour.init(), 500);
});
