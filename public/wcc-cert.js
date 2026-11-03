/* The certificate page: the Print button (no inline handlers, the CSP forbids them). */
for (const b of document.querySelectorAll("[data-print]")) b.addEventListener("click", () => window.print());
