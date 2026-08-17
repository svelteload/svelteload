/**
 * Payload's own colour scale, so every preview surface matches the CMS a client
 * already knows. Values mirror @payloadcms/ui scss/colors.scss. Namespaced under
 * .sl-preview so nothing leaks into a project's own styles.
 */
export const PREVIEW_THEME_CSS = `.sl-preview {
  color-scheme: light dark;
  --sl-base-0: rgb(255, 255, 255);
  --sl-base-100: rgb(235, 235, 235);
  --sl-base-150: rgb(221, 221, 221);
  --sl-base-600: rgb(101, 101, 101);
  --sl-base-750: rgb(60, 60, 60);
  --sl-base-800: rgb(47, 47, 47);
  --sl-base-850: rgb(34, 34, 34);
  --sl-base-900: rgb(20, 20, 20);
  --sl-base-1000: rgb(0, 0, 0);

  --sl-bg: var(--sl-base-0);
  --sl-text: var(--sl-base-1000);
  --sl-muted: var(--sl-base-600);
  --sl-input-bg: var(--sl-base-0);
  --sl-border: var(--sl-base-150);
  --sl-button-bg: var(--sl-base-800);
  --sl-button-text: var(--sl-base-0);
  --sl-danger: rgb(180, 68, 58);
  --sl-required: rgb(218, 75, 72);
  --sl-error-bg: rgb(252, 229, 227);
  --sl-error-border: rgb(247, 208, 204);
  --sl-error-text: rgb(144, 44, 43);

  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  .sl-preview {
    --sl-bg: var(--sl-base-900);
    --sl-text: var(--sl-base-0);
    --sl-muted: rgb(154, 154, 154);
    --sl-input-bg: var(--sl-base-850);
    --sl-border: var(--sl-base-750);
    --sl-button-bg: var(--sl-base-100);
    --sl-button-text: var(--sl-base-900);
    --sl-error-bg: rgb(105, 39, 37);
    --sl-error-border: rgb(123, 41, 39);
    --sl-error-text: rgb(253, 177, 170);
  }
}`
