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

            // If on Login/GetStarted pages but ALREADY authed -> Go Home
            const isLoginPage = path.includes('login') || path.includes('get-started.html') || path === '/';
            if (isLoginPage && isAuthenticated) {
                if (userType === 'admin') window.location.replace(ADMIN_DASHBOARD);
                else if (userType === 'coach') window.location.replace(COACH_DASHBOARD);
                else window.location.replace(LANDING_PAGE);
                return;
            }

            // If on Landing Page but already authed as Coach/Admin -> Redirect them to their dashboard
            // instead of showing User nav links on landing.html
            if ((path === LANDING_PAGE || path === '/') && isAuthenticated) {
                if (userType === 'admin') {
                    window.location.replace(ADMIN_DASHBOARD);
                    return;
                }
                if (userType === 'coach') {
                    window.location.replace(COACH_DASHBOARD);
                    return;
                }
            }

            // If on Protected pages but NOT authed -> Go Login
            if (isProtectedPage(path) && !isAuthenticated) {
                if (path.includes('/coach/')) {
                    window.location.replace(COACH_LOGIN_PAGE);
                } else {
                    window.location.replace(LOGIN_PAGE);
                }
                return;
            }

            // Role Separation Enforcement
            if (isAuthenticated) {
                if (path.includes('/admin/') && userType !== 'admin') {
                    window.location.replace(LANDING_PAGE);
                    return;
                }
                if (path.includes('/coach/') && userType !== 'coach') {
                    window.location.replace(LANDING_PAGE);
                    return;
                }
                if (path === USER_APP && userType === 'admin') {
                    window.location.replace(ADMIN_DASHBOARD);
                    return;
                }
                // Coach Guard for User App
                if (path === USER_APP && userType === 'coach') {
                    window.location.replace(COACH_DASHBOARD);
                    return;
                }
            }

        } catch (err) {
            console.error('Auth Check Error:', err);
        }
    }

    function isProtectedPage(path) {
        if (path.includes('onboarding.html')) return false;
        return path === USER_APP ||
            path.includes('/admin/') ||
            path.includes('/coach/business-coach-dashboard/') ||
            path === '/account.html' ||
            path === '/customization.html';
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
