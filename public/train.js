/* The training funding calculator, instant: the form still works as a plain GET without this file. On a change it keeps the subject
 * list to the chosen country, asks the same page for the answer and swaps it in, and updates the address so it can be shared. */
(() => {
  for (const form of document.querySelectorAll('form[data-train]')) {
    const country = form.querySelector('[name=country]');
    const subject = form.querySelector('[name=subject]');
    const answer = form.parentElement.querySelector('[data-train-answer]');
    const go = form.querySelector('.train-go');
    if (go) go.hidden = true;
    const narrow = () => {
      for (const g of subject.querySelectorAll('optgroup')) {
        const show = !country.value || [...g.children].some((o) => o.dataset.country === country.value);
        g.hidden = !show; g.disabled = !show;
      }
      const sel = subject.selectedOptions[0];
      if (sel && sel.dataset.country && country.value && sel.dataset.country !== country.value) subject.value = '';
    };
    const update = async () => {
      const q = new URLSearchParams();
      if (country.value) q.set('country', country.value);
      if (subject.value) q.set('subject', subject.value);
      try {
        const r = await fetch(`/train?${q}`, { headers: { accept: 'text/html' } });
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const next = doc.querySelector('[data-train-answer]');
        if (next && answer) answer.replaceWith(Object.assign(answer, { innerHTML: next.innerHTML }));
        if (location.pathname === '/train') history.replaceState(null, '', `/train${q.toString() ? `?${q}` : ''}`);
      } catch { form.submit(); }
    };
    country.addEventListener('change', () => { narrow(); update(); });
    subject.addEventListener('change', () => {
      const sel = subject.selectedOptions[0];
      if (sel && sel.dataset.country && country.value !== sel.dataset.country) { country.value = sel.dataset.country; narrow(); }
      update();
    });
    narrow();
  }
})();
