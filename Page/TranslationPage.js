import { expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════
//  TRANSLATION PAGE (WNG)
//  Locators here must NOT depend on English text, because the UI is
//  switched to another language during the test. Use classes,
//  positions or regexes that cover every supported language.
// ═══════════════════════════════════════════════════════════════

// Code -> exact text shown in the My Account "Language" dropdown
export const LANGUAGES = {
  'en':    'English',
  'fr-CA': 'Français (Canadien)',
  'de':    'Deutsch',
  'pt':    'Português',
  'it':    'Italiano',
  'tr':    'Türkçe',
  'pl':    'Polski',
};

const ALL_LANGUAGE_NAMES = Object.values(LANGUAGES);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LANGUAGE_NAME_RE = new RegExp(`^\\s*(${ALL_LANGUAGE_NAMES.map(escapeRe).join('|')})\\s*$`);

// "My Account" in every supported language (best guess for non-English; only used if the URL is unknown)
const MY_ACCOUNT_RE = /^\s*(a\s+)?(my account|mon compte|mein konto|minha conta|il mio account|(il\s+)?mio account|hesabım|moje konto|konto|account|conta|compte)\s*$/i;
// Save button on My Account
const SAVE_RE = /^\s*(save|update|enregistrer|sauvegarder|mettre à jour|speichern|änderungen speichern|aktualisieren|guardar|gravar|salvar|atualizar|actualizar|salva|salvare|aggiorna|kaydet|güncelle|zapisz|aktualizuj)\b/i;
// REPORTS button on the dashboard
// Labels seen so far: REPORTS, RAPPORTS (fr), RAPPORTI (it), RELATÓRIOS (pt)
const REPORTS_RE = /^\s*(reports?|rapports?|rapporti|rapporto|berichte|bericht|relatórios|relatorios|raporlar|rapor|raporty|raport)\s*$/i;

export class TranslationPage {
  constructor(page) {
    this.page = page;
    this.accountUrl = null;

    // The <img class="icon-hamsburger"> menu exists on the analytics dashboard only
    // (home pages use an icon-font menu that has no stable selector).
    this.hamburger = page.locator('img.icon-hamsburger').filter({ visible: true }).first();
    this.myAccountLink = page.getByText(MY_ACCOUNT_RE).filter({ visible: true }).first();

    // Language dropdown on My Account: the toggle whose text is one of the language names
    this.languageToggle = page.locator('.dropdown-component .dropdown-toggle')
      .filter({ hasText: LANGUAGE_NAME_RE }).filter({ visible: true }).first();
    this.openMenuItems = page.locator('.dropdown-menu.show .dropdown-item');

    // Save on My Account: by label in any supported language, else the form's submit button
    this.saveBtn = page.getByRole('button', { name: SAVE_RE })
      .or(page.locator('form button[type="submit"]'))
      .filter({ visible: true }).first();

    // Dashboard
    this.reportsBtn = page.getByRole('button', { name: REPORTS_RE }).filter({ visible: true }).first();

    // Reports modal
    this.modal = page.locator('.modal-content').filter({ visible: true }).first();
    this.whenToggle = this.modal.locator('.input-container .dropdown-container .dropdown-toggle').first();
    this.toInput = this.modal.locator('#email-input');
    this.subjectInput = this.modal.locator('textarea[name="subject"]');
    this.sendBtn = this.modal.locator('button.save-btn[type="submit"]');
    this.alert = page.getByRole('alert').filter({ visible: true }).first();
  }

  // ─── My Account / language ────────────────────────────────────

  async openMyAccount() {
    if (this.accountUrl) {
      await this.page.goto(this.accountUrl);
    } else {
      const onAnalytics = await this.hamburger.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (!onAnalytics) {
        // On a home page: the analytics tile is the last tile for every admin type,
        // so this works whatever language the account is in.
        const lastTile = this.page.locator('button').filter({ visible: true }).last();
        await expect(lastTile).toBeVisible({ timeout: 30000 });
        console.log(`Menu not on this page – opening analytics via last tile: "${(await lastTile.innerText()).replace(/\s+/g, ' ').trim()}"`);
        await lastTile.click();
      }
      await expect(this.hamburger).toBeVisible({ timeout: 30000 });
      await this.hamburger.click();
      await expect(this.myAccountLink).toBeVisible({ timeout: 10000 });
      await this.myAccountLink.click();
    }
    await expect(this.languageToggle).toBeVisible({ timeout: 30000 });
    // The profile GET can land after the form renders and reset the dropdown to the
    // saved value – wait for it so our selection is not overwritten before Save.
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    if (!this.accountUrl) console.log('My Account URL:', this.page.url());
    this.accountUrl = this.page.url();
  }

  async currentLanguage() {
    return (await this.languageToggle.innerText()).trim();
  }

  // Selects the language, saves, waits for the redirect, then re-opens My Account to
  // confirm the language really was saved (retries once if it was not).
  async setLanguage(code, { verify = true } = {}) {
    const name = LANGUAGES[code];
    if (!name) throw new Error(`Unknown language code "${code}". Known: ${Object.keys(LANGUAGES).join(', ')}`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.openMyAccount();
      const before = await this.currentLanguage();
      console.log(`Language before: ${before} → switching to: ${name}${attempt > 1 ? ' (retry)' : ''}`);

      await this.languageToggle.click();
      const item = this.openMenuItems.filter({ hasText: new RegExp(`^\\s*${escapeRe(name)}\\s*$`) }).first();
      await expect(item).toBeVisible({ timeout: 10000 });
      await item.click();
      await expect(this.languageToggle).toHaveText(new RegExp(escapeRe(name)));
      await this.page.waitForTimeout(300);
      await expect(this.languageToggle).toHaveText(new RegExp(escapeRe(name))); // still selected?

      const accountUrl = this.page.url();
      await expect(this.saveBtn).toBeEnabled({ timeout: 10000 });
      const saveResponse = this.page.waitForResponse(
        res => res.request().method() !== 'GET' && !/\.(js|css|png|svg)(\?|$)/.test(res.url()), { timeout: 20000 }
      ).catch(() => null);
      await this.saveBtn.click();
      const res = await saveResponse;
      console.log(res ? `Save request: ${res.request().method()} ${res.url()} → ${res.status()}` : 'Save request: none seen within 20s');

      await this.waitForDashboardAfterSave(accountUrl);
      if (!verify) return;

      await this.openMyAccount();
      const saved = await this.currentLanguage();
      if (saved === name) {
        console.log(`Language saved: ${saved}`);
        return;
      }
      console.warn(`⚠ Language after Save is "${saved}", expected "${name}"`);
    }
    throw new Error(`Language "${name}" was not saved after 2 attempts`);
  }

  // After Save the app redirects to the user's home dashboard (not the analytics page)
  async waitForDashboardAfterSave(accountUrl) {
    await this.page.waitForURL(url => url.toString() !== accountUrl, { timeout: 30000 })
      .catch(() => console.warn('URL did not change after Save – the app may not have redirected'));
    await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
    console.log('Landed after Save on:', this.page.url());
  }

  // Call on the home page while still in English, with the analytics entry button.
  // Remembers the home URL and the button's position so it can be clicked in any language.
  async rememberDashboardEntry(entryBtn) {
    await expect(entryBtn).toBeVisible({ timeout: 30000 });
    this.homeUrl = this.page.url();
    this.entryIndex = await entryBtn.evaluate(el => [...document.querySelectorAll('button')].indexOf(el));
    console.log(`Home: ${this.homeUrl} – analytics entry is button #${this.entryIndex}`);
  }

  // Opens the analytics dashboard the way a user does: home page → analytics tile.
  // Falls back to the analytics URL if the tile cannot be found.
  async openAnalytics(analyticsUrl) {
    try {
      if (this.page.url() !== this.homeUrl) await this.page.goto(this.homeUrl);
      const tile = this.page.locator('button').nth(this.entryIndex);
      await expect(tile).toBeVisible({ timeout: 30000 });
      console.log(`Opening analytics via tile: "${(await tile.innerText()).replace(/\s+/g, ' ').trim()}"`);
      await tile.click();
      await this.waitForDashboard();
    } catch (err) {
      console.warn(`Could not open analytics via the home tile (${err.message.split('\n')[0]}) – trying the URL`);
      await this.page.goto(analyticsUrl);
      await this.waitForDashboard();
    }
  }

  // Global admin dashboards load all program data and can be slow on Stag/Prod
  async waitForDashboard() {
    await expect(this.reportsBtn).toBeVisible({ timeout: this.dashboardTimeout || 45000 });
    await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // charts animate in; give them a moment so their labels are rendered
    await this.page.locator('.highcharts-container').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(1500);
  }

  // Verified: re-opens My Account after Save and retries once if English did not stick
  async resetToEnglish() {
    await this.setLanguage('en');
  }

  // ─── Reports modal ────────────────────────────────────────────

  async openReportsModal() {
    const timezonesLoaded = this.page.waitForResponse(
      res => res.url().includes('/timezones') && res.ok(), { timeout: 20000 }
    ).catch(() => console.warn('timezones response not seen within 20s, continuing'));
    await this.reportsBtn.click();
    await expect(this.modal).toBeVisible({ timeout: 15000 });
    await expect(this.whenToggle).toBeVisible();
    await timezonesLoaded;
    await this.page.waitForTimeout(500);
  }

  // index 0 = now, 1 = schedule (order of the "When" menu)
  async selectWhenByIndex(index) {
    await this.whenToggle.click();
    const items = this.page.locator('.dropdown-menu.show .dropdown-item');
    await expect(items.nth(index)).toBeVisible({ timeout: 10000 });
    await items.nth(index).click();
  }

  async selectSchedule() {
    await this.selectWhenByIndex(1);
    // schedule form is ready once its frequency radios render
    await expect(this.modal.locator('input[type="radio"]').first()).toBeAttached({ timeout: 15000 });
    await this.page.waitForTimeout(500);
  }

  async selectNow() {
    await this.selectWhenByIndex(0);
    await expect(this.sendBtn).toBeVisible({ timeout: 10000 });
  }

  async sendNow(email, subject) {
    await this.toInput.click();
    await this.toInput.fill(email);
    await expect(this.toInput).toHaveValue(email);
    await this.subjectInput.fill(subject);
    await expect(this.subjectInput).toHaveValue(subject);

    // Record every API call (and any non-GET call) made while sending, so delivery problems can be traced.
    // (Collected in the background – never blocks, so the short-lived toast is not missed.)
    const calls = [];
    const onResponse = res => {
      const req = res.request();
      if ((req.method() !== 'GET' || /\/api\//.test(res.url())) && !/\.(js|css|png|svg|woff2?)(\?|$)/.test(res.url())) {
        calls.push({ method: req.method(), url: res.url(), status: res.status(), body: req.postData() || '' });
      }
    };
    this.page.on('response', onResponse);
    await this.sendBtn.click();
    await expect(this.alert).toBeVisible({ timeout: 20000 });
    const msg = (await this.alert.innerText()).trim();
    await this.page.waitForTimeout(1000);
    this.page.off('response', onResponse);
    console.log('Send Now toast:', msg);
    if (!calls.length) console.warn('Send Now: no API call seen');
    for (const c of calls) {
      console.log(`Send Now call: ${c.method} ${c.url} → ${c.status}`);
      if (c.body) console.log(`Send Now payload: ${c.body.slice(0, 500)}`);
    }
    return msg;
  }
}
