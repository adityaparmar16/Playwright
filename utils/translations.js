import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════
//  TRANSLATION BASELINE HELPERS
//  1st run (or UPDATE_TRANSLATION_BASELINE=true): capture → save baseline.
//  Later runs: capture → compare with the baseline → report missing/added text.
// ═══════════════════════════════════════════════════════════════

export const BASELINE_ROOT = path.resolve('tests/WNG/Translations/baselines');

export function baselinePath(lang, env, role) {
  return path.join(BASELINE_ROOT, lang, `${env}-${role}.json`.toLowerCase());
}

// Month names change every month, so they are replaced by a placeholder.
// Only English + the tested language are used: other languages' month words clash
// with ordinary words (Polish "sie" = German "Sie", Turkish "ara" = "search").
const MONTHS_BY_LANG = {
  en: ['january','february','march','april','may','june','july','august','september','october','november','december',
       'jan','feb','mar','apr','jun','jul','aug','sep','sept','oct','nov','dec'],
  fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre',
       'janv','févr','avr','juil','déc'],
  de: ['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember',
       'jan','feb','mär','apr','jun','jul','aug','sep','okt','nov','dez'],
  pt: ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro',
       'jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],
  it: ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre',
       'gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'],
  tr: ['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık',
       'oca','şub','nis','haz','tem','ağu','eyl','eki','kas'],          // "ara" left out: it also means "search"
  pl: ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień',
       'stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia',
       'sty','lut','kwi','cze','lip','sie','wrz','paź','lis','gru'],
};
const monthReCache = {};
function monthRe(lang = 'en') {
  const key = String(lang).split('-')[0].toLowerCase();
  if (!monthReCache[key]) {
    const words = [...new Set([...MONTHS_BY_LANG.en, ...(MONTHS_BY_LANG[key] || [])])].sort((a, b) => b.length - a.length);
    monthReCache[key] = new RegExp(`(?<![\\p{L}])(${words.join('|')})\\.?(?![\\p{L}])`, 'giu');
  }
  return monthReCache[key];
}
const HIGHCHARTS_A11Y_RE = /^(chart|chart\. highcharts interactive chart\.|end of interactive chart\.|(bar|pie|line|column|area) chart with .*|the chart has .*)$/i;
const UNIT_RE = /\b(lbs?|kgs?|tons?|tonnes?|oz|g|%)\b/gi;

// Collects every visible text node + placeholder/title/aria-label/value under `root`.
export async function collectTexts(root) {
  return root.evaluate(el => {
    // Highcharts' screen-reader text ("Bar chart with 3 bars…") is library English, not app translations
    const SKIP = 'script, style, noscript, svg, [class*="highcharts"], [id*="highcharts"], .calendar-header';
    const out = [];
    const isVisible = node => {
      const e = node.nodeType === 1 ? node : node.parentElement;
      if (!e || e.closest(SKIP)) return false;
      const r = e.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;          // empty or screen-reader-only (1px clip)
      const s = getComputedStyle(e);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (t && isVisible(n)) out.push(t);
    }
    el.querySelectorAll('[placeholder],[title],[aria-label],input[type="button"],input[type="submit"]').forEach(e => {
      if (!isVisible(e)) return;
      for (const a of ['placeholder', 'title', 'aria-label']) {
        const v = e.getAttribute(a);
        if (v && v.trim()) out.push(v.trim());
      }
      if (e.tagName === 'INPUT' && (e.type === 'button' || e.type === 'submit') && e.value) out.push(e.value.trim());
    });
    return out;
  });
}

// Turns raw captured strings into stable, comparable entries.
export function normalizeTexts(raw, lang = 'en') {
  const MONTH_RE = monthRe(lang);
  const set = new Set();
  for (let t of raw) {
    t = t.replace(/\s+/g, ' ').trim();
    if (!t || t.includes('@')) continue;               // emails / user data
    if (HIGHCHARTS_A11Y_RE.test(t)) continue;           // chart library's own English a11y text
    t = t.replace(MONTH_RE, '<month>').replace(/\d+/g, '#');
    const letters = t.replace(/<month>/g, '').replace(UNIT_RE, '').replace(/[^\p{L}]/gu, '');
    if (!letters) continue;                              // numbers / units only
    set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Texts whose wording depends on the DATA, not on the translation: the waste-impact
// equivalents pick a comparison by magnitude ("= 3 seaux de cinq gallons" vs
// "= 1 piscines olympiques", "gallons" vs "millions litres"). Differences in these
// are reported as warnings, not failures.
const VOLUME_WORDS = 'gallons?|gallonen|galões|galloni|galon|galonów|litres?|liters?|litros|litri|litrów';
// million / billion in every supported language – the scale also changes with the data
const SCALE_WORDS = 'millions?|milliards?|billions?|millionen|milliarden|milhões|biliões|bilhões|milioni|miliardi|milyon|milyar|mln|mld|milionów|miliardów';
const VOLATILE_RE = [/^= /, new RegExp(`^((${SCALE_WORDS})( de| di)?( euro)? )?(${VOLUME_WORDS})$`, 'i')];
export const isVolatile = t => VOLATILE_RE.some(re => re.test(t));

export function diffTexts(expected = [], actual = []) {
  const e = new Set(expected), a = new Set(actual);
  return {
    missing: expected.filter(t => !a.has(t)), // in baseline, not on screen now
    added:   actual.filter(t => !e.has(t)),   // on screen now, not in baseline
  };
}

export function loadBaseline(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
