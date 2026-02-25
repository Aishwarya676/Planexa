/**
 * auth-helper.js - Centralized Authentication Logic
 * Included in all pages to handle session persistence and redirection.
 */

(function () {
    const API_STATUS_URL = '/api/session';
    const LOGIN_PAGE = '/login-fixed.html';
    const COACH_LOGIN_PAGE = '/coach-login.html';
    const GET_STARTED_PAGE = '/get-started.html';
    const LANDING_PAGE = '/landing.html';
    const ADMIN_DASHBOARD = '/admin/admin-dashboard.html';
    const COACH_DASHBOARD = '/coach/business-coach-dashboard/index.html';
    const USER_APP = '/app.html';

    const NAME_KEY = 'planner.user';
    const LOGOUT_FLAG_KEY = 'planner.justLoggedOutAt';

    /**
     * Helper to clear all local session data
     */
    function clearLocalSession() {
        localStorage.removeItem(NAME_KEY);
        localStorage.removeItem('planner.theme');
        localStorage.removeItem('planner.themeId');
    }

    function markJustLoggedOut() {
        try {
            // Set a flag in sessionStorage that persists across refreshes but not tabs
            sessionStorage.setItem(LOGOUT_FLAG_KEY, String(Date.now()));
            // Also store in localStorage briefly for cross-tab awareness if needed,
            // but sessionStorage is primary for the current flow.
        } catch (e) { }
    }

    function wasJustLoggedOut(ms = 10000) {
        try {
            const v = sessionStorage.getItem(LOGOUT_FLAG_KEY);
            if (!v) return false;
            const t = parseInt(v, 10);
            return Number.isFinite(t) && (Date.now() - t) < ms;
        } catch (e) {
            return false;
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

            // --- SITE ACCESS GUARD (TAB-SPECIFIC FOR SECONDARY) ---
            const cookies = document.cookie.split('; ').reduce((acc, c) => {
                const [k, v] = c.split('=');
                if (k && v) acc[k.trim()] = v.trim();
                return acc;
            }, {});

            if (cookies.siteAccessTier === 'secondary' && !sessionStorage.getItem('tab_site_access')) {
                console.log('[Auth] New tab detected for secondary site access. Redirecting to password wall.');
                window.location.replace('/site-access.html?next=' + encodeURIComponent(window.location.pathname + window.location.search));
                return;
            }

            // --- IMMEDIATE VISIBILITY GUARD ---
            if (isProtectedPage(path)) {
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
                    } else if (userType === 'user' && !data.onboarding_completed) {
                        target = USER_APP;
                    }

                    if (path !== target && !(path === LANDING_PAGE && target === LANDING_PAGE)) {
                        window.location.replace(target);
                        return;
                    }
                }

                if (isProtectedPage(path) && !isAuthenticated) {
                    clearLocalSession();

                    // Detect if user is navigating via back button
                    const isBackNavigation = (performance.navigation && performance.navigation.type === 2) ||
                        (performance.getEntriesByType &&
                            performance.getEntriesByType('navigation')[0]?.type === 'back_forward');

                    // If user just logged out and is trying to go "back" into a protected page,
                    // do not bounce them to the login page. Continue backing out of the site instead.
                    if (wasJustLoggedOut()) {
                        console.log('[Auth] Just logged out; preventing redirect to login page on protected route');
                        // Use replace to overwrite the protected page in history
                        window.location.replace(LANDING_PAGE);
                        return;
                    }

                    // If user pressed back to get here, continue going back instead of redirecting
                    if (isBackNavigation) {
                        console.log('[Auth] Back-navigation detected on protected page, continuing back');
                        // If they go back into a protected page after logout, 
                        // we want to skip over it entirely.
                        history.back();
                        return;
                    }

                    window.location.replace(path.includes('/coach/') ? COACH_LOGIN_PAGE : LOGIN_PAGE);
                    return;
                }

                if (isAuthenticated) {
                    if (path.includes('/admin/') && userType !== 'admin') { window.location.replace(LANDING_PAGE); return; }
                    if (path.includes('/coach/') && userType !== 'coach') { window.location.replace(LANDING_PAGE); return; }
                }

                // 3. UI UPDATE (data-when items)
                updateRoleUI(isAuthenticated, userType, status, data);

                // 4. ONBOARDING TOUR REDIRECT (Updated for Highlight Tour)
                if (isAuthenticated && userType === 'user' && !data.onboarding_completed) {
                    // Do not redirect to demo.html anymore. 
                    // Let the user load app.html where the tour-manager will start.
                    if (path.includes('demo.html')) {
                        window.location.replace(USER_APP);
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
        if (path.toLowerCase().includes('onboarding.html')) return false;
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
            let session = null;
            try {
                session = await checkAuth();
            } catch (e) { }
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
            } catch (e) { }
            clearLocalSession();
            markJustLoggedOut();
            const userType = session?.user?.user_type || (session?.coachId ? 'coach' : 'user');
            const redirectTo = LANDING_PAGE;
            window.location.replace(redirectTo);
        }
    };
})();
