/**
 * Ở Ghép reusable branded dialog.
 * Usage: await confirmAction({title, message, confirmText, tone:"danger"})
 * Usage: await showNotice({title, message})
 *
 * One native dialog supplies accessible modal semantics and focus trapping,
 * while the custom content replaces the browser's confirm/alert styling.
 */
let dialog = null;
let active = null;
let previouslyFocused = null;
const waiting = [];

const icons = {
  neutral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
  danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.4 2.1 18.6A1.6 1.6 0 0 0 3.5 21h17a1.6 1.6 0 0 0 1.4-2.4L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9v5m0 3h.01"/></svg>'
};

function ensureDialog() {
  if (dialog) return;
  dialog = document.createElement("dialog");
  dialog.className = "og-modal";
  dialog.setAttribute("aria-labelledby", "og-modal-title");
  dialog.setAttribute("aria-describedby", "og-modal-description");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = [
    '<div class="og-modal__content">',
    '<div class="og-modal__header">',
    '<span class="og-modal__symbol" data-modal-symbol aria-hidden="true"></span>',
    '<button class="og-modal__close" type="button" data-modal-close aria-label="Close dialog">',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    '</button></div>',
    '<h2 class="og-modal__title" id="og-modal-title"></h2>',
    '<p class="og-modal__description" id="og-modal-description"></p>',
    '<div class="og-modal__actions">',
    '<button type="button" class="og-modal__button og-modal__button--cancel" data-modal-cancel>Cancel</button>',
    '<button type="button" class="og-modal__button og-modal__button--confirm" data-modal-confirm>Confirm</button>',
    '</div></div>'
  ].join("");
  document.body.append(dialog);

  const close = accepted => {
    if (dialog.open) dialog.close(accepted ? "confirm" : "cancel");
  };
  dialog.querySelector("[data-modal-close]").addEventListener("click", () => close(false));
  dialog.querySelector("[data-modal-cancel]").addEventListener("click", () => close(false));
  dialog.querySelector("[data-modal-confirm]").addEventListener("click", () => close(true));

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close(false);
  });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) close(false);
  });
  dialog.addEventListener("close", () => {
    const current = active;
    active = null;
    current?.resolve(dialog.returnValue === "confirm");
    if (previouslyFocused?.isConnected) previouslyFocused.focus({preventScroll:true});
    previouslyFocused = null;
    showNext();
  });
}

function showNext() {
  if (active || !waiting.length) return;
  ensureDialog();
  active = waiting.shift();
  const {
    title = "Please confirm",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    tone = "neutral",
    kind = "confirm"
  } = active.options;
  const isDanger = tone === "danger";
  dialog.dataset.tone = isDanger ? "danger" : "neutral";
  dialog.dataset.kind = kind === "notice" ? "notice" : "confirm";
  dialog.querySelector("[data-modal-symbol]").innerHTML = icons[isDanger ? "danger" : "neutral"];
  dialog.querySelector("#og-modal-title").textContent = title;
  dialog.querySelector("#og-modal-description").textContent = message;
  const cancel = dialog.querySelector("[data-modal-cancel]");
  const confirm = dialog.querySelector("[data-modal-confirm]");
  cancel.textContent = cancelText;
  cancel.hidden = kind === "notice";
  confirm.textContent = confirmText;
  previouslyFocused = document.activeElement;
  dialog.showModal();
  (kind === "notice" ? confirm : cancel).focus();
}

export function confirmAction(options = {}) {
  return new Promise(resolve => {
    waiting.push({options:{...options,kind:"confirm"},resolve});
    showNext();
  });
}

export function showNotice(options = {}) {
  return new Promise(resolve => {
    waiting.push({
      options:{...options,kind:"notice",confirmText:options.confirmText || "Got it"},
      resolve
    });
    showNext();
  });
}
