// Escapes a string for safe interpolation into raw HTML (e.g. Mapbox GL
// Popup.setHTML(), which sets innerHTML directly — unescaped user-controlled
// fields there are a stored-XSS vector).
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string))
}
