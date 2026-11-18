import { expect } from '@playwright/test';

/**
 * Page Object Model — Compass (Waste Not)
 * Covers: MFA login, dashboard UI assertions, complex filter,
 *         iframe lbs assertions, Send Now report, and Schedule report.
 */
export class CompassPage {
    constructor(page) {
        this.page = page;

        // ── Iframe (two ways — content frame for actions, frameLocator for assertions) ──
        this.iframeLocator = page.frameLocator('iframe#wastenot-html');
        this.iframeFrame   = page.locator('#wastenot-html').contentFrame();

        // ── Iframe buttons (used frequently) ─────────────────────────
        this.dashboardBtn = this.iframeLocator.getByRole('button', { name: 'DASHBOARD', exact: true });
        this.reportsBtn   = this.iframeLocator.getByRole('button', { name: 'REPORTS', exact: true });
    }

    // ── Login ──────────────────────────────────────────────────────────

    /**
     * Navigate to the Compass URL and fill in the login ID.
     * @param {string} url
     * @param {string} loginId
     */
    async goto(url, loginId) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.getByRole('textbox', { name: /Login ID/i }).fill(loginId);
    }

    /**
     * Click Continue and wait for redirect to Microsoft login, then fill password.
     * @param {string} password
     */
    async submitLoginAndEnterPassword(password) {
        await Promise.all([
            this.page.waitForURL(/microsoftonline\.com/i),
            this.page.getByRole('button', { name: /Continue/i }).click(),
        ]);
        await this.page.getByRole('textbox', { name: /Enter the password/i }).fill(password);
        await this.page.getByRole('button', { name: /^Sign in$/i }).click();
    }

    async handleMfa(phoneHint = process.env.MFA_PHONE_HINT || '6968|68') {
        // Accounts differ: some get a list of methods ("Text +XX XXX68"), others go straight to
        // an Authenticator push ("Approve sign in request" with a number to match). Wait for whichever appears.
        const textButtons = this.page.getByRole('button', { name: /Text/i });
        const pushPrompt  = this.page.getByText(/Approve sign in request/i);
        await textButtons.first().or(pushPrompt).first().waitFor({ state: 'visible', timeout: 60000 });

        if (await pushPrompt.isVisible().catch(() => false)) {
            this.mfaMode = 'push';
            const numberEl = this.page.locator('#idRichContext_DisplaySign');
            const number = (await numberEl.innerText({ timeout: 5000 }).catch(() => '')).trim();
            console.log(`📱 Approve the sign-in in Microsoft Authenticator${number ? ` – enter number ${number}` : ''} (you have 4 minutes)...`);
            return;
        }

        this.mfaMode = 'sms';
        let smsBtn = textButtons.filter({ hasText: new RegExp(phoneHint) }).first();
        if (!(await smsBtn.isVisible().catch(() => false))) {
            smsBtn = textButtons.first();
        }
        await expect(smsBtn).toBeVisible();
        await smsBtn.click();
    }

    /**
     * Finish MFA. SMS: fill the OTP if provided, else wait for it to be typed manually.
     * Authenticator push: wait for the approval on the phone.
     * @param {string|undefined} otp
     */
    async handleOtp(otp) {
        if (this.mfaMode === 'push') {
            await this.page.bringToFront();
            await this.waitForMicrosoftLoginToFinish(240000);
            console.log('✅ Login completed after Authenticator approval');
            return;
        }

        const otpInput = this.page.locator(
            'input[name*="otc"], input[id*="otc"], input[aria-label*="code" i], input[type="tel"]'
        ).first();

        if (otp) {
            await otpInput.fill(otp);
            await this.page.getByRole('button', { name: /Verify|Next|Sign in/i }).click();
            await this.waitForMicrosoftLoginToFinish(90000);
        } else {
            console.log('⚠️ Enter OTP manually in the browser window (you have 4 minutes)...');
            await this.page.bringToFront();
            await otpInput.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
            await otpInput.focus().catch(() => {});
            await this.waitForMicrosoftLoginToFinish(240000);
            console.log('✅ Login completed after manual OTP');
        }
    }

    /**
     * Waits until the browser has left the Microsoft login pages.
     * Clicks "No" on the "Stay signed in?" prompt if it shows up meanwhile.
     */
    async waitForMicrosoftLoginToFinish(timeout = 240000) {
        const deadline = Date.now() + timeout;
        const noBtn = this.page.getByRole('button', { name: /^No$/i });
        while (Date.now() < deadline) {
            if (!/microsoftonline\.com|login\.live\.com/i.test(this.page.url())) {
                await this.page.waitForLoadState('domcontentloaded');
                return;
            }
            if (await noBtn.isVisible().catch(() => false)) {
                await noBtn.click().catch(() => {});
            }
            await this.page.waitForTimeout(1000);
        }
        throw new Error(`Still on Microsoft login after ${timeout / 1000}s – OTP not completed`);
    }

    /** Dismiss "Stay signed in?" prompt if it appears. */
    async dismissStaySignedIn() {
        const noBtn = this.page.getByRole('button', { name: /^No$/i });
        if (await noBtn.isVisible().catch(() => false)) {
            await noBtn.click();
        }
    }

    // ── Dashboard UI Assertions ────────────────────────────────────────

    /**
     * Scope-agnostic "logged in" check that works for every admin level:
     * header with Exit link, CLEAR ALL filter bar, iframe DASHBOARD/REPORTS, and optionally a text such as the
     * access breadcrumb ("CCC ADMIN") or the user's name.
     * @param {string} [expectText]
     */
    async assertLoggedIn(expectText = '') {
        await expect(this.page.getByText('Exit', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 90000 });
        // the page can hold more than one CLEAR ALL (e.g. after a reload) – any visible one will do
        await expect(this.page.getByText('CLEAR ALL').filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
        await this.dashboardBtn.waitFor({ state: 'visible', timeout: 120000 });
        await expect(this.reportsBtn).toBeVisible({ timeout: 30000 });
        if (expectText) {
            // visible copy only – the same text also sits hidden inside closed filter dropdowns
            await expect(this.page.getByText(expectText).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
        }
    }

    /** Assert the top-level Compass navigation and filter labels are visible. */
    async assertDashboardVisible() {
        await expect(this.page.locator('[id="row wastenot-nav"]')).toContainText('COMPASS', { timeout: 60000 });
        await expect(this.page.getByText('Sector',  { exact: true })).toBeVisible();
        await expect(this.page.getByText('Division', { exact: true }).nth(1)).toBeVisible();
        await expect(this.page.getByText('Complex',  { exact: true })).toBeVisible();
        await expect(this.page.getByRole('img').nth(1)).toBeVisible();
        await expect(this.page.getByRole('form')).toContainText('CLEAR ALL');
    }

    /** Assert the iframe DASHBOARD, REPORTS buttons and DATE RANGE section are visible. */
    async assertIframeElementsVisible() {
        await this.dashboardBtn.waitFor({ state: 'visible', timeout: 160000 });
        await expect(this.dashboardBtn).toBeVisible();

        await this.reportsBtn.waitFor({ state: 'visible', timeout: 60000 });
        await expect(this.reportsBtn).toBeVisible();

        const section = this.iframeFrame.locator('section');
        await section.waitFor({ state: 'visible', timeout: 60000 });
        await expect(section).toContainText('DATE RANGE:');
    }

    // ── Complex Filter ─────────────────────────────────────────────────

    /**
     * Open All Complexes dropdown, search by complex ID, select it, and confirm.
     * @param {string} complexId  - e.g. 'C-58001'
     * @param {string} confirmText - text of the confirm button (default: 'COMPASS')
     */
    async selectComplex(complexId, confirmText = 'COMPASS') {
        // Admins whose access is limited to one complex may not get the "All Complexes" filter at all –
        // their data is already scoped, so there is nothing to select.
        const allComplexesBtn = this.page.getByRole('button', { name: 'All Complexes' });
        const hasFilter = await allComplexesBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (!hasFilter) {
            console.warn(`"All Complexes" filter not shown for this admin – assuming access is already scoped to ${complexId}`);
            return;
        }
        await allComplexesBtn.click();
        await this.page.getByRole('textbox', { name: 'Search' }).fill(complexId);

        const option = this.page.getByRole('option').filter({ hasText: complexId }).first();
        await expect(option).toBeVisible();
        await option.click();

        await this.closeFilterDropdown();
    }

    /**
     * Closes an open filter dropdown by clicking outside it (that applies the selection).
     * Clicking the "COMPASS" text hung on pages where that text isn't visible (e.g. legacy.cafebonappetit.com).
     */
    async closeFilterDropdown() {
        const searchBox = this.page.getByRole('textbox', { name: 'Search' });
        const label = this.page.getByText('Sector', { exact: true }).first();
        if (await label.isVisible().catch(() => false)) {
            await label.click();
        } else {
            await this.page.mouse.click(5, 5);
        }
        if (await searchBox.isVisible().catch(() => false)) {
            await this.page.keyboard.press('Escape');
        }
        await expect(searchBox).toBeHidden({ timeout: 10000 });
    }

    // ── Filters, tracking calendar & cost center ───────────────────────

    /** The dropdown button under a filter label ("Complex", "Cost Center", "Kitchen", ...), whatever it currently shows. */
    filterButton(label) {
        return this.page.getByText(label, { exact: true }).filter({ visible: true }).first().locator('xpath=following::button[1]');
    }

    /** Current value shown on a filter, e.g. "All Kitchens" or "CBC MAIN KITCHEN". */
    async filterValue(label) {
        return (await this.filterButton(label).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }

    /** True when the admin has a Complex filter (complex-level admins don't – their complex is fixed). */
    async hasComplexFilter() {
        return this.page.getByText('Complex', { exact: true }).filter({ visible: true }).first().isVisible().catch(() => false);
    }

    /** Opens a filter, clicks the option with this text (selects it, or deselects it if already selected), closes it. */
    async toggleFilterOption(label, optionText) {
        await this.filterButton(label).click();
        const option = this.page.getByRole('option').filter({ hasText: optionText, visible: true }).first();
        await expect(option).toBeVisible({ timeout: 15000 });
        await option.click();
        await this.closeFilterDropdown();
    }

    /** Waits up to `timeout` for the "<Month> <Year> Tracking" calendar (checked on the page and inside the dashboard iframe). */
    async isTrackingCalendarVisible(timeout = 15000) {
        const title = /\b[A-Z][a-z]+ \d{4} Tracking\b/;
        const inPage  = this.page.getByText(title).filter({ visible: true }).first();
        const inFrame = this.iframeLocator.getByText(title).filter({ visible: true }).first();
        const deadline = Date.now() + timeout;
        do {
            if (await inPage.isVisible().catch(() => false) || await inFrame.isVisible().catch(() => false)) return true;
            await this.page.waitForTimeout(500);
        } while (Date.now() < deadline);
        return false;
    }

    async assertTrackingCalendarVisible(context, timeout = 30000) {
        if (!(await this.isTrackingCalendarVisible(timeout))) {
            throw new Error(`Tracking calendar not visible ${context}`);
        }
        console.log(`📅 Tracking calendar visible ${context}`);
    }

    /** Clicks CLEAR ALL and waits until the Kitchen filter is back to "All Kitchens". */
    async clearAllFilters() {
        await this.page.getByText('CLEAR ALL', { exact: true }).filter({ visible: true }).first().click();
        const deadline = Date.now() + 15000;
        do {
            if (/^All Kitchens$/i.test(await this.filterValue('Kitchen'))) return;
            await this.page.waitForTimeout(500);
        } while (Date.now() < deadline);
    }

    // ── Tracking calendar: previous-month navigation ───────────────────

    /** The visible tracking calendar header (month heading + ‹ › arrows). */
    trackingCalendar() {
        return this.page.locator('.calendar-wrapper').filter({ visible: true }).first();
    }

    /** Month shown on the tracking calendar, e.g. { month: 'November', year: 2026, label: 'November 2026' }. */
    async calendarMonth() {
        const text = await this.trackingCalendar().locator('.heading-text').innerText();
        const m = text.match(/([A-Z][a-z]+)\s+(\d{4})\s+Tracking/);
        if (!m) throw new Error(`Unexpected tracking calendar heading: "${text}"`);
        return { month: m[1], year: Number(m[2]), label: `${m[1]} ${m[2]}` };
    }

    /**
     * Users can view the current month and ONE previous month:
     *  1. calendar opens on the current month – ‹ enabled, › disabled
     *  2. ‹ shows the previous month – ‹ now disabled, › enabled
     *  3. ‹ again does not go further back
     *  4. › returns to the current month – › disabled again
     */
    async checkCalendarPreviousMonth() {
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'];
        const cal = this.trackingCalendar();
        const heading = cal.locator('.heading-text');
        const prev = cal.locator('.nav-arrow.prev-month');
        const next = cal.locator('.nav-arrow.next-month');

        await expect(cal).toBeVisible({ timeout: 30000 });

        // 1. current month (US Eastern or IST – both accepted around month boundaries)
        const current = await this.calendarMonth();
        const today = ['America/New_York', 'Asia/Kolkata'].map((timeZone) =>
            new Date().toLocaleString('en-US', { timeZone, month: 'long', year: 'numeric' }));
        expect(today, `Tracking calendar should open on the current month, shows ${current.label}`).toContain(current.label);
        await expect(next, '› should be disabled on the current month').toHaveClass(/\bdisabled\b/);
        await expect(prev, '‹ should be enabled on the current month').not.toHaveClass(/\bdisabled\b/);

        // 2. one month back
        const i = MONTHS.indexOf(current.month);
        const previous = i === 0 ? `December ${current.year - 1}` : `${MONTHS[i - 1]} ${current.year}`;
        await prev.click();
        await expect(heading).toContainText(`${previous} Tracking`, { timeout: 15000 });
        await expect(prev, '‹ should be disabled on the previous month').toHaveClass(/\bdisabled\b/);
        await expect(next, '› should be enabled on the previous month').not.toHaveClass(/\bdisabled\b/);
        console.log(`📅 ‹ → ${previous} Tracking shown`);

        // 3. cannot go further back
        await prev.click({ force: true });
        await this.page.waitForTimeout(1000);
        await expect(heading, 'calendar must not go back more than one month').toContainText(`${previous} Tracking`);

        // 4. back to the current month
        await next.click();
        await expect(heading).toContainText(`${current.label} Tracking`, { timeout: 15000 });
        await expect(next, '› should be disabled again on the current month').toHaveClass(/\bdisabled\b/);
        console.log(`📅 › → back to ${current.label} Tracking (only one previous month allowed ✓)`);
    }

    /**
     * Tries the cost centers in the Cost Center filter one by one until it finds one with the full
     * hierarchy set up: selecting it fills in the Kitchen filter and the tracking calendar is shown.
     * A cost center with no kitchen leaves Kitchen on "All Kitchens" and hides the calendar; the test then
     * clicks CLEAR ALL, calls `resetScope` (e.g. re-select the complex) and tries the next one.
     * @param {{ maxTries?: number, resetScope?: () => Promise<void> }} [opts]
     * @returns {Promise<{ costCenter: string, kitchen: string }>}
     */
    async selectCostCenterWithKitchen({ maxTries = 15, resetScope } = {}) {
        const ccButton = this.filterButton('Cost Center');
        await expect(ccButton).toBeVisible({ timeout: 30000 });

        // Read the cost centers on offer (already limited to the selected complex / the admin's access).
        // Options read like "36209CCC MGMT": the leading number is the cost center code. "All Cost Centers" (select-all) is skipped.
        await ccButton.click();
        const options = this.page.getByRole('option').filter({ visible: true }); // only the open dropdown's options
        await expect(options.first()).toBeVisible({ timeout: 15000 });
        const costCenters = [];
        for (const text of await options.allInnerTexts()) {
            const m = text.replace(/\s+/g, ' ').trim().match(/^(\d+)\s*(.*)$/);
            if (m && !costCenters.some((c) => c.code === m[1])) costCenters.push({ code: m[1], name: m[2] });
        }
        await this.closeFilterDropdown();
        console.log(`🏷️  ${costCenters.length} cost center(s): ${costCenters.map((c) => `${c.code} ${c.name}`).join(' | ')}`);
        if (!costCenters.length) throw new Error('Cost Center filter has no cost centers to choose from');

        const tried = [];
        for (const cc of costCenters.slice(0, maxTries)) {
            const label = `${cc.code} ${cc.name}`.trim();

            // Select it (matched by its code, which is unique)
            await ccButton.click();
            const option = this.page.getByRole('option').filter({ visible: true, hasText: new RegExp(`^\\s*${cc.code}`) }).first();
            await expect(option).toBeVisible({ timeout: 15000 });
            await option.click();
            await this.closeFilterDropdown();

            // A fully set-up cost center auto-fills its kitchen
            let kitchen = '';
            const deadline = Date.now() + 10000;
            do {
                kitchen = await this.filterValue('Kitchen');
                if (kitchen && !/^All Kitchens$/i.test(kitchen)) break;
                await this.page.waitForTimeout(500);
            } while (Date.now() < deadline);
            const hasKitchen = kitchen && !/^All Kitchens$/i.test(kitchen);

            if (hasKitchen && await this.isTrackingCalendarVisible(15000)) {
                console.log(`✅ Cost center "${label}" → kitchen "${kitchen}" – tracking calendar visible`);
                return { costCenter: label, kitchen };
            }

            const calendarShown = await this.isTrackingCalendarVisible(1000);
            console.log(`↷ Cost center "${label}": ${hasKitchen ? `kitchen "${kitchen}" but no tracking calendar` : 'no kitchen set up'}` +
                `${calendarShown ? '' : ' (calendar hidden)'} – trying the next one`);
            tried.push(label);

            // Back to a clean scope before the next try
            await this.clearAllFilters();
            if (resetScope) await resetScope();
        }

        throw new Error(`No cost center with a kitchen set up showed the tracking calendar. Tried: ${tried.join(', ') || 'none'}`);
    }

    // ── Post-filter Dashboard Assertions ──────────────────────────────

    /** Assert the Waste Trend section headings and key elements are visible after filter. */
    async assertWasteSectionVisible() {
        const frame = this.iframeLocator;
        await expect(frame.getByRole('heading', { name: 'Waste Trend' })).toBeVisible();
        await expect(frame.getByRole('heading', { name: 'Kind of Waste' })).toBeVisible();
        await expect(frame.getByRole('heading', { name: 'Where it Went' })).toBeVisible();
        await expect(frame.getByText('Average Food Waste per Day')).toBeVisible();
        await expect(frame.getByRole('button', { name: 'TRACK TRENDS' })).toBeVisible();
    }

    // ── Iframe lbs Assertions ──────────────────────────────────────────

    /**
     * Soft-assert a rounded lbs value is visible in the iframe.
     * @param {number|null} value
     * @param {string}      label
     * @param {boolean}    [exact=false]
     */
    async assertIframeLbsValue(value, label, exact = false) {
        if (!value) { console.warn(`No ${label} data found in DB — skipping`); return; }
        try {
            const locator = exact
                ? this.iframeLocator.getByText(`${value} lbs`, { exact: true })
                : this.iframeLocator.getByText(`${value} lbs`).first();
            await expect(locator).toBeVisible();
            console.log(`✓ ${label} verified in UI: ${value} lbs`);
        } catch {
            console.warn(`✗ ${label} (${value} lbs) not visible in UI`);
            // Diagnostic only – must never fail the test
            try {
                const shown = await this.iframeLocator.getByText(/\d[\d,.]*\s*lbs/).allInnerTexts();
                const values = [...new Set((shown || []).map((t) => String(t ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
                console.warn(`   lbs values visible in UI: ${values.join(' | ') || '(none)'}`);
            } catch { /* ignore */ }
        }
    }

    // ── Send Now Report ────────────────────────────────────────────────

    /**
     * Open the Reports panel, clear existing emails, add new ones, set subject, and send.
     * @param {string[]} emails
     * @param {string}   subject
     */
    async sendNowReport(emails, subject) {
        const subjectInput = this.iframeFrame.locator('#subject');
        const sendNowBtn   = this.iframeLocator.getByRole('button', { name: /Send Now/i });

        // Open reports and wait for subject field
        await Promise.all([
            subjectInput.waitFor({ state: 'visible', timeout: 30000 }),
            this.reportsBtn.click(),
        ]);

        const emailTextbox = this.iframeFrame.getByRole('textbox', { name: 'test@compass-usa.com' });

        // Clear existing emails reliably — triple-click selects all, then fill('') clears
        await emailTextbox.click({ clickCount: 3 });
        await emailTextbox.fill('');

        // Type each email followed by semicolon
        for (const email of emails) {
            await emailTextbox.type(email);
            await emailTextbox.press(';');
            await this.page.waitForTimeout(300);
        }

        await subjectInput.fill(subject);

        await expect(sendNowBtn).toBeVisible({ timeout: 30000 });
        await expect(sendNowBtn).toBeEnabled();

        // Even force:true requires the click coordinates to be inside the viewport.
        // For buttons inside an iframe that's scrolled off-screen, use evaluate() to
        // invoke the button's native DOM click() directly — this skips coordinate-based
        // clicking entirely and works regardless of viewport position.
        await sendNowBtn.evaluate(el => el.click());
        await this.page.waitForTimeout(3000);
    }

    // ── Schedule Report ────────────────────────────────────────────────

    /**
     * Open Reports → Now → Schedule, fill in schedule details, and create.
     * @param {{ email: string, frequency: string, dateRange: string, subject: string }} opts
     */
    // ── Private helper: scroll an element inside the iframe via JS evaluate ──────
    // scrollIntoViewIfNeeded() on frameLocator/contentFrame elements only scrolls
    // the *main page* — it does NOT scroll inside the iframe's own DOM.
    async _iframeScrollTo(iframeSelector, findEl) {
        await this.page.evaluate(
            ({ iframeSelector, findEl }) => {
                const iframe = document.querySelector(iframeSelector);
                if (!iframe?.contentDocument) return;
                const fn = new Function('doc', `return (${findEl})(doc)`);
                const el = fn(iframe.contentDocument);
                el?.scrollIntoView({ block: 'center', inline: 'center' });
            },
            { iframeSelector, findEl }
        );
        await this.page.waitForTimeout(300);
    }

    async scheduleReport({ email, frequency = 'Daily', dateRange = 'Fiscal Month to Date', subject }) {
        const frame = this.iframeFrame;
        const iframeSel = 'iframe#wastenot-html';

        await this.reportsBtn.waitFor({ state: 'visible', timeout: 60000 });
        await expect(this.reportsBtn).toBeVisible();

        // Each click: JS-scroll inside the iframe first, then click with force:true
        const reportsFrameBtn = frame.getByRole('button', { name: 'REPORTS', exact: true });
        await reportsFrameBtn.waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, 'doc => [...doc.querySelectorAll("button")].find(b => /^REPORTS$/i.test(b.textContent?.trim()))');
        await reportsFrameBtn.evaluate(el => el.click());

        const nowBtn = frame.getByRole('button', { name: 'Now', exact: true });
        await nowBtn.waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, 'doc => [...doc.querySelectorAll("button")].find(b => /^Now$/i.test(b.textContent?.trim()))');
        await nowBtn.evaluate(el => el.click());

        const scheduleLink = frame.getByRole('link', { name: 'Schedule' });
        await this._iframeScrollTo(iframeSel, 'doc => [...doc.querySelectorAll("a")].find(a => /schedule/i.test(a.textContent?.trim()))');
        await scheduleLink.evaluate(el => el.click());

        // Email
        const emailInput = frame.getByRole('textbox', { name: 'test@compass-usa.com' });
        await emailInput.waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, `doc => doc.querySelector('input[placeholder*="compass-usa"], input[type="email"]')`);
        await emailInput.clear();
        await emailInput.fill(email);

        // Frequency
        await this._iframeScrollTo(iframeSel, `doc => [...doc.querySelectorAll('*')].find(e => e.textContent?.trim() === '${frequency}' && e.children.length === 0)`);
        const freqEl = frame.getByText(frequency);
        await freqEl.evaluate(el => el.click());

        await frame.getByRole('radio', { name: 'Everyday' }).evaluate(el => { el.click(); });

        // Date range select
        await this._iframeScrollTo(iframeSel, `doc => doc.querySelector('input[placeholder="Select"]')`);
        const selectBox = frame.getByRole('textbox', { name: 'Select' });
        await selectBox.evaluate(el => el.click());
        await frame.getByText(dateRange).waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, `doc => [...doc.querySelectorAll('*')].find(e => e.textContent?.trim() === '${dateRange}' && e.children.length === 0)`);
        const dateRangeEl = frame.getByText(dateRange);
        await dateRangeEl.evaluate(el => el.click());

        // Subject
        const subjectField = frame.locator('#subject');
        await subjectField.waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, 'doc => doc.querySelector("#subject")');
        await subjectField.clear();
        await subjectField.fill(subject);

        // Create — dismiss any dialog
        this.page.once('dialog', async dialog => {
            console.log(`Dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });

        const createBtn = frame.getByRole('button', { name: 'Create', exact: true });
        await createBtn.waitFor({ state: 'visible' });
        await this._iframeScrollTo(iframeSel, 'doc => [...doc.querySelectorAll("button")].find(b => /^Create$/i.test(b.textContent?.trim()))');
        await createBtn.evaluate(el => el.click());
    }
}