/**
 * auth-helper.js - Centralized Authentication Logic
 * Included in all pages to handle session persistence and redirection.
 */

(function () {
    const API_STATUS_URL = '/api/session';
    const LOGIN_PAGE = '/login-fixed.html';
    const COACH_LOGIN_PAGE = '/coach-login.html';
    const LANDING_PAGE = '/landing.html';
    const ADMIN_DASHBOARD = '/admin/admin-dashboard.html';
    const COACH_DASHBOARD = '/coach/business-coach-dashboard/index.html';
    const USER_APP = '/app.html';

    const NAME_KEY = 'planner.user';

    /**
     * Helper to clear all local session data
     */
    function clearLocalSession() {
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem('planner.theme');
        localStorage.removeItem('planner.themeId');
        // We keep rememberedEmail for UX
    }

    /**
     * Primary session check and redirect logic
     */
    async function checkAuth() {
        const path = window.location.pathname;

        // --- IMMEDIATE VISIBILITY GUARD ---
        // If we are on a protected page and have NO local session, hide the body immediately
        if (isProtectedPage(path) && !localStorage.getItem(NAME_KEY)) {
            document.documentElement.style.visibility = 'hidden';
        }

        try {
            const res = await fetch(API_STATUS_URL, { credentials: 'include' });
            if (!res.ok) throw new Error('Session check failed');

            const data = await res.json();
            const { isAuthenticated, user, coachId } = data;
            const userType = user?.user_type || (coachId ? 'coach' : 'user');

            // 1. SYNC LOCALSTORAGE
            if (!isAuthenticated) {
                if (localStorage.getItem(NAME_KEY)) {
                    console.log('Session expired on server. Clearing local data.');
                    clearLocalSession();
                    // If we were on a protected page, redirect to login
                    if (isProtectedPage(path)) {
                        window.location.replace(LOGIN_PAGE);
                        return;
                    }
                }
            } else {
                // Server says we ARE authed. Ensure localStorage reflects this.
                if (!localStorage.getItem(NAME_KEY)) {
                    localStorage.setItem(NAME_KEY, JSON.stringify(data));
                }
            }

            // 2. REDIRECTION LOGIC (Route Guarding)
            const isHomePath = path === LANDING_PAGE || path === '/' || path === '/index.html';
            const isLoginPage = path.includes('login') || path.includes('get-started.html');

            // --- ALREADY AUTHENTICATED REDIRECTS ---
            // If user is logged in but on a public/login page, send them to their dashboard
            if (isAuthenticated && (isLoginPage || isHomePath)) {
                // Admin -> Admin Dashboard
                if (userType === 'admin') {
                    if (path !== ADMIN_DASHBOARD) window.location.replace(ADMIN_DASHBOARD);
                    return;
                }

                // Coach -> Coach Dashboard (only if approved/active)
                if (userType === 'coach') {
                    const status = data.status || user?.status || '';
                    if (status === 'approved' || status === 'active') {
                        if (!path.includes(COACH_DASHBOARD)) window.location.replace(COACH_DASHBOARD);
                    } else {
                        // Pending coaches stay on landing/public pages, but if they try to hit login, go to landing
                        if (isLoginPage) window.location.replace(LANDING_PAGE);
                    }
                    return;
                }

                // Regular User -> App (User Dashboard)
                // BUT only redirect if they are explicitly on a login/signup page. 
                // We allow them to view the Landing Page (Home) even if logged in.
                if (isLoginPage) {
                    window.location.replace(USER_APP);
                    return;
                }
            }

            // --- PROTECTED ROUTE GUARDS ---
            // If on a protected page but NOT authenticated
            if (isProtectedPage(path) && !isAuthenticated) {
                // If trying to access coach dashboard, go to coach login
                if (path.includes('/coach/')) {
                    window.location.replace(COACH_LOGIN_PAGE);
                }
                // If trying to access admin, go to landing (hide admin login existence or redirect to main login)
                else if (path.includes('/admin/')) {
                    window.location.replace(LOGIN_PAGE);
                }
                // default user app -> login
                else {
                    window.location.replace(LOGIN_PAGE);
                }
                return;
            }

            // --- ROLE ENFORCEMENT (Prevent jumping fences) ---
            if (isAuthenticated) {
                // 1. Non-Admins trying to access Admin
                if (path.includes('/admin/') && userType !== 'admin') {
                    window.location.replace(LANDING_PAGE);
                    return;
                }

                // 2. Non-Coaches trying to access Coach Dashboard
                if (path.includes('/coach/') && userType !== 'coach') {
                    // Allow them to see public coach profile pages if any exist, but for now block dashboard
                    if (path.includes('business-coach-dashboard')) {
                        window.location.replace(USER_APP);
                        return;
                    }
                }

                // 3. Admins/Coaches trying to access User App
                if (path === USER_APP) {
                    if (userType === 'admin') { window.location.replace(ADMIN_DASHBOARD); return; }
                    if (userType === 'coach') { window.location.replace(COACH_DASHBOARD); return; }
                }
            }

            // --- REVEAL CONTENT ---
            document.documentElement.style.visibility = '';

        } catch (err) {
            console.error('Auth Check Error:', err);
            // On error, if protected, fail safe to login
            if (isProtectedPage(path)) {
                // window.location.replace(LOGIN_PAGE); // Risk of loop if API is down, maybe better to show error?
                // For now, reveal to allow manual navigation or retry
                document.documentElement.style.visibility = '';
            }
        }
    }

    function isProtectedPage(path) {
        if (path.includes('onboarding.html')) return false; // purely public

        // Explicitly protected paths
        if (path === USER_APP) return true;
        if (path === '/account.html') return true;
        if (path === '/customization.html') return true;
        if (path.includes('/admin/')) return true;
        if (path.includes('/coach/business-coach-dashboard/')) return true;

        return false;
    }

    // Initialize Check
    // Use pageshow to handle BFCache (back/forward navigation)
    window.addEventListener('pageshow', function (event) {
        // If persisted is true, the page was restored from bfcache
        // We generally want to re-run auth check regardless on every show
        checkAuth();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAuth);
    } else {
        // Only run if not already handled by pageshow (rare edge case, safeguards)
        checkAuth();
    }

    // Expose helpers globally if needed
    window.AuthHelper = {
        checkAuth,
        logout: async function () {
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            } catch (e) { }
            clearLocalSession();
            window.location.replace(LANDING_PAGE);
        }
    };
})();
