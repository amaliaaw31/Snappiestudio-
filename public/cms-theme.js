(() => {
  const key = 'snappie-cms-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}

  function apply() {
    const dark = preference ? preference === 'dark' : system.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.getElementById('theme-toggle')?.setAttribute('aria-pressed', String(dark));
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = dark ? 'dark_mode' : 'light_mode';
    window.dispatchEvent(new window.Event('cms-theme-change'));
  }

  apply();
  system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('theme-toggle');
    apply();
    button.addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
