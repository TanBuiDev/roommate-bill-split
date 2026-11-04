import {vi} from "./dictionary.mjs";

const STORAGE_KEY = "oghep-language";
const existing = (() => {
  try {return localStorage.getItem(STORAGE_KEY);} catch {return null;}
})();
let language = existing === "en" ? "en" : "vi";
const listeners = new Set();
const staticText = [];
const staticAttributes = [];
let initialized = false;
let originalTitle = "";

export const getLanguage = () => language;
export const getLocale = () => language === "vi" ? "vi-VN" : "en-US";
export const t = (english, replacements = {}) => {
  if (typeof english !== "string") return String(english ?? "");
  const translated = language === "vi" ? (vi[english] ?? english) : english;
  return translated.replace(/\{([a-zA-Z]\w*)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : "{"+key+"}");
};

const shouldSkip = element => !!element?.closest?.("script,style,svg,noscript,template");

function rememberStaticDom() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (shouldSkip(node.parentElement)) continue;
    const original = node.textContent.trim();
    if (!original || !(original in vi)) continue;
    const full = node.textContent;
    staticText.push({
      node, original,
      prefix: full.slice(0, full.indexOf(original)),
      suffix: full.slice(full.indexOf(original) + original.length)
    });
  }
  for (const element of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
    if (shouldSkip(element)) continue;
    for (const name of ["placeholder","aria-label","title"]) {
      const original = element.getAttribute(name);
      if (original && Object.prototype.hasOwnProperty.call(vi, original)) {
        staticAttributes.push({element,name,original});
      }
    }
  }
  originalTitle = document.title;
}

function applyDocumentTranslation() {
  document.documentElement.lang = language;
  for (const entry of staticText) {
    if (!entry.node.isConnected) continue;
    entry.node.textContent = entry.prefix + t(entry.original) + entry.suffix;
  }
  for (const entry of staticAttributes) {
    if (!entry.element.isConnected) continue;
    entry.element.setAttribute(entry.name, t(entry.original));
  }
  document.title = t(originalTitle);
  for (const meta of document.querySelectorAll('meta[property="og:title"],meta[property="og:description"],meta[name="description"]')) {
    const initial = meta.dataset.i18nOriginal || meta.getAttribute("content");
    if (!meta.dataset.i18nOriginal) meta.dataset.i18nOriginal=initial;
    meta.setAttribute("content", t(initial));
  }
  const ogLocale=document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.content=language==="vi"?"vi_VN":"en_US";
  for (const code of ["vi","en"]) {
    const button=document.getElementById("lang-"+code);
    if (!button) continue;
    button.setAttribute("aria-pressed",String(language===code));
    button.setAttribute("aria-label",language===code ? (code==="vi"?"Tiếng Việt — đang chọn":"English — selected") : (code==="vi"?"Chuyển sang tiếng Việt":"Switch to English"));
  }
}

export function initI18n() {
  if (initialized) return;
  initialized=true;
  rememberStaticDom();
  applyDocumentTranslation();
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLanguage(next) {
  if (next!=="vi"&&next!=="en") return;
  if (!initialized) initI18n();
  if (next===language) return;
  language=next;
  try {localStorage.setItem(STORAGE_KEY, next);} catch {}
  applyDocumentTranslation();
  for (const listener of [...listeners]) listener(next);
}
