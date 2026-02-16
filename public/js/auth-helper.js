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
        // Clear hash to prevent carrying over protected routes to login/landing
        if (window.location.hash) {
            history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }
    }

    /**
     * Primary session check and redirect logic
     */
    let checkAuthPromise = null;

    /**
     * Primary session check and redirect logic
     */
    async function checkAuth() {
        if (checkAuthPromise) return checkAuthPromise;

        checkAuthPromise = (async () => {
            const path = window.location.pathname;

            // --- IMMEDIATE VISIBILITY GUARD ---
            if (isProtectedPage(path) && !localStorage.getItem(NAME_KEY)) {
                document.documentElement.style.visibility = 'hidden';
            }

            try {
                const res = await fetch(API_STATUS_URL, { credentials: 'include', cache: 'no-store' });
                if (!res.ok) throw new Error('Session check failed');

                const data = await res.json();
                const { isAuthenticated, user, coachId } = data;
                const userType = user?.user_type || (coachId ? 'coach' : 'user');
                const status = data.status || user?.status || '';

                // 1. SYNC LOCALSTORAGE
                if (!isAuthenticated) {
                    if (localStorage.getItem(NAME_KEY)) {
                        console.log('Session expired on server. Clearing local data.');
                        clearLocalSession();
                    }
                } else {
                    localStorage.setItem(NAME_KEY, JSON.stringify(data));
                }

                // 2. REDIRECTION LOGIC (Route Guarding)
                const isLoginPage = path.includes('login') || path.includes('get-started.html') || path === '/' || path === '/index.html' || path === '/landing.html';

                if (isLoginPage && isAuthenticated) {
                    let target = LANDING_PAGE;
                    if (userType === 'admin') target = ADMIN_DASHBOARD;
                    else if (userType === 'coach' && (status === 'approved' || status === 'active')) {
                        target = COACH_DASHBOARD;
                    }

                    if (path !== target && !(path === LANDING_PAGE && target === LANDING_PAGE)) {
                        window.location.replace(target);
                        return;
                    }
                }

                if (isProtectedPage(path) && !isAuthenticated) {
                    clearLocalSession();
                    // Use a clean URL (no hash) for the login redirect
                    const target = path.includes('/coach/') ? COACH_LOGIN_PAGE : LOGIN_PAGE;
                    window.location.replace(target);
                    return;
                }

                if (isAuthenticated) {
                    if (path.includes('/admin/') && userType !== 'admin') { window.location.replace(LANDING_PAGE); return; }
                    if (path.includes('/coach/') && userType !== 'coach') { window.location.replace(LANDING_PAGE); return; }
                }

                // 3. UI UPDATE (data-when items)
                updateRoleUI(isAuthenticated, userType, status, data);

                // 4. ONBOARDING TOUR REDIRECT
                if (isAuthenticated && userType === 'user' && !data.onboarding_completed) {
                    if (!path.includes('demo.html')) {
                        window.location.replace('/demo.html');
                        return;
                    }
                } else if (path.includes('demo.html')) {
                    if (userType !== 'user' || data.onboarding_completed) {
                        window.location.replace(isAuthenticated ? LANDING_PAGE : LOGIN_PAGE);
                        return;
                    }
                }

                // --- REVEAL CONTENT ---
                document.documentElement.style.visibility = '';
                document.body.classList.remove('opacity-0');

                return data;

            } catch (err) {
                console.error('Auth Check Error:', err);
                if (!isProtectedPage(path)) {
                    document.documentElement.style.visibility = '';
                }
            } finally {
                checkAuthPromise = null;
            }
        })();

        return checkAuthPromise;
    }

    function isProtectedPage(path) {
        if (path.toLowerCase().includes('demo.html')) return false;
        const protectedPaths = [USER_APP, '/account.html', '/customization.html'];
        return protectedPaths.includes(path) ||
            path.includes('/admin/') ||
            path.includes('/coach/business-coach-dashboard/');
    }

    /**
     * Toggles visibility of elements based on [data-when] attribute
     */
    function updateRoleUI(isAuthenticated, userType, status, data) {
        document.querySelectorAll('[data-when]').forEach(el => {
            const when = el.getAttribute('data-when');
            let visible = false;

            if (when === 'authed') visible = isAuthenticated;
            else if (when === 'guest') visible = !isAuthenticated;
            else if (when === 'admin') visible = isAuthenticated && userType === 'admin';
            else if (when === 'coach') visible = isAuthenticated && userType === 'coach';
            else if (when === 'coach-admin') visible = isAuthenticated && (userType === 'coach' || userType === 'admin');
            else if (when === 'can-message') visible = isAuthenticated && (userType === 'coach' || userType === 'admin' || (userType === 'user' && data.canMessage));

            if (visible) {
                el.classList.remove('hidden');
                if (el.style.display === 'none') el.style.display = '';
                if (el.hidden === true) el.hidden = false;

                // SPECIAL: if data-set-avatar is present, set initial
                if (el.hasAttribute('data-set-avatar') && isAuthenticated) {
                    const user = data.user || {};
                    const initial = (user.email?.[0]) || (user.username?.[0]) || (user.name?.[0]) || 'U';
                    el.textContent = String(initial).toUpperCase();
                }

                const dashLink = el.querySelector('#dashboard-link') || (el.tagName === 'A' && el.id === 'dashboard-link' ? el : null);
                if (dashLink && isAuthenticated) {
                    if (userType === 'admin') dashLink.href = ADMIN_DASHBOARD;
                    else if (userType === 'coach') dashLink.href = COACH_DASHBOARD;
                    else dashLink.href = USER_APP;

                    const span = dashLink.querySelector('span');
                    if (span) span.textContent = (userType === 'user') ? 'Visit Planner' : 'Visit Dashboard';
                }
            } else {
                el.classList.add('hidden');
                el.hidden = true;
            }
        });
    }

    // Consolidated Event Handling
    const init = () => {
        if (window.authInitialized) return;
        window.authInitialized = true;
        checkAuth();
    };

    window.addEventListener('pageshow', (e) => {
        // Always re-check on pageshow to handle BFCache navigation correctly
        checkAuth();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

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
