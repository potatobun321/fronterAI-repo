const storedTheme = localStorage.getItem('frontier-theme');
const initialTheme = storedTheme === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = initialTheme;

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('btn-theme-toggle');
  let activeTheme = initialTheme;
  let transitionTimer;

  function applyTheme(theme) {
    activeTheme = theme;
    document.documentElement.dataset.theme = theme;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
    themeToggle.title = `Switch to ${nextTheme} theme`;
  }

  applyTheme(activeTheme);
  themeToggle.addEventListener('click', () => {
    const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('frontier-theme', nextTheme);
    const root = document.documentElement;
    root.dataset.themeTransition = '';
    requestAnimationFrame(() => {
      applyTheme(nextTheme);
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => {
        delete root.dataset.themeTransition;
      }, 260);
    });
  });
}, { once: true });
