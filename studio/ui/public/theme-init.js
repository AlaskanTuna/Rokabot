// Runs before first paint (the CSP forbids inline scripts) so the page never flashes the wrong theme.
;(() => {
  let choice = 'system'
  try {
    choice = localStorage.getItem('studio.theme') || 'system'
  } catch {}
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
