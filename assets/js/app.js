(() => {
  const menuButton = document.getElementById('menu-toggle');
  const nav = document.getElementById('primary-nav');
  const panel = document.getElementById('demo-panel');
  const openButton = document.getElementById('open-demo');
  const closeButton = document.getElementById('close-demo');
  const form = document.getElementById('task-form');
  const input = document.getElementById('task-input');
  const list = document.getElementById('task-list');
  const year = document.getElementById('year');

  if (year) year.textContent = String(new Date().getFullYear());
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('is-open', open);
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  }));
  const showDemo = () => {
    if (!panel) return;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input?.focus({ preventScroll: true });
  };
  openButton?.addEventListener('click', showDemo);
  closeButton?.addEventListener('click', () => { if (panel) panel.hidden = true; openButton?.focus(); });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input?.value.trim();
    if (!value || !list) return;
    const item = document.createElement('li');
    const label = document.createElement('span');
    const badge = document.createElement('small');
    label.textContent = value;
    badge.textContent = 'LOCAL';
    item.append(label, badge);
    list.prepend(item);
    form.reset();
    input?.focus();
  });
})();
