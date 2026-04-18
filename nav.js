/**
 * nav.js - ZPKPay shared navigation
 * Injects the standard nav on every page.
 * Add <script src="/nav.js"></script> to any page head.
 */
(function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    const links = [
        { href: '/',              label: 'Home',           match: ['', 'index.html'] },
        { href: 'spec.html',      label: 'Protocol spec',  match: ['spec.html'] },
        { href: 'sdk.html',       label: 'SDK reference',  match: ['sdk.html'] },
        { href: 'use-cases.html', label: 'Use cases',      match: ['use-cases.html'] },
        { href: 'portal.html',    label: 'Launch portal',  match: ['portal.html'], cta: true },
    ];

    const navHTML = `
<nav class="zpk-nav" style="
    background: #fdf4f0;
    border-bottom: 3px solid #e8960c;
    padding: 0 40px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 1000;
    font-family: 'Inter', sans-serif;
">
    <a href="/" style="font-size:20px;font-weight:900;color:#1a1f36;text-decoration:none;">ZPK<span style="color:#e8960c;">Pay</span></a>
    <div style="display:flex;gap:28px;align-items:center;">
        ${links.map(l => {
            const isActive = l.match.includes(currentPage);
            const base = 'font-size:14px;font-weight:600;color:#1a1f36;text-decoration:none;opacity:' + (isActive ? '1' : '0.7') + ';';
            const cta = l.cta ? 'background:#e8960c;color:#fff;padding:8px 18px;border-radius:7px;opacity:1;' : '';
            return `<a href="${l.href}" style="${base}${cta}">${l.label}</a>`;
        }).join('')}
    </div>
</nav>`;

    // Insert before body content
    document.addEventListener('DOMContentLoaded', function() {
        // Remove any existing nav this script manages
        const existing = document.querySelector('nav.zpk-nav, .spec-topbar');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('afterbegin', navHTML);
    });

    // Inject immediately if DOM already ready
    if (document.readyState !== 'loading') {
        const existing = document.querySelector('nav.zpk-nav, .spec-topbar');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('afterbegin', navHTML);
    }
})();
