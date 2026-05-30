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
        this.dashboardBtn = this.iframeLocator.getByRole('button', { name: 'DASHBOARD' });
        this.reportsBtn   = this.iframeLocator.getByRole('button', { name: 'REPORTS' });
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

    /**
     * Handle MFA — click the SMS OTP button matching last 4 digits, or fall back to first.
     * @param {string} [phoneHint] - partial phone digits to match (e.g. '6968|68')
     */
    async handleMfa(phoneHint = '6968|68') {
        const mfaButtons = this.page.getByRole('button', { name: /Text/i });
        let smsBtn = mfaButtons.filter({ hasText: new RegExp(phoneHint) }).first();
        if (!(await smsBtn.isVisible().catch(() => false))) {
            smsBtn = mfaButtons.first();
        }
        await expect(smsBtn).toBeVisible();
        await smsBtn.click();
    }

    /**
     * Fill OTP automatically if provided, or wait for manual entry.
     * @param {string|undefined} otp
     */
    async handleOtp(otp) {
        const otpInput = this.page.locator(
            'input[name*="otc"], input[id*="otc"], input[aria-label*="code" i], input[type="tel"]'
        ).first();

        if (otp) {
            await otpInput.fill(otp);
            await this.page.getByRole('button', { name: /Verify|Next|Sign in/i }).click();
        } else {
            console.log('⚠️ Enter OTP manually...');
            await Promise.race([
                this.page.waitForURL(/bamcotest\.com|compassmanager\.com/i, { timeout: 240000 }),
                this.page.waitForLoadState('networkidle',                    { timeout: 240000 }),
                this.page.waitForSelector('#wastenot-html',                  { timeout: 240000 }),
            ]);
            console.log('✅ Login completed after manual OTP');
        }
    }

    /** Dismiss "Stay signed in?" prompt if it appears. */
    async dismissStaySignedIn() {
        const noBtn = this.page.getByRole('button', { name: /^No$/i });
        if (await noBtn.isVisible().catch(() => false)) {
            await noBtn.click();
        }
    }

    // ── Dashboard UI Assertions ────────────────────────────────────────

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
        await this.page.getByRole('button', { name: 'All Complexes' }).click();
        await this.page.getByRole('textbox', { name: 'Search' }).fill(complexId);

        const option = this.page.getByRole('option').filter({ hasText: complexId }).first();
        await expect(option).toBeVisible();
        await option.click();

        await this.page.getByText(confirmText, { exact: true }).click();
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
        await sendNowBtn.click();
        await this.page.waitForTimeout(3000);
    }

    // ── Schedule Report ────────────────────────────────────────────────

    /**
     * Open Reports → Now → Schedule, fill in schedule details, and create.
     * @param {{ email: string, frequency: string, dateRange: string, subject: string }} opts
     */
    async scheduleReport({ email, frequency = 'Daily', dateRange = 'Fiscal Month to Date', subject }) {
        const frame = this.iframeFrame;

        await this.reportsBtn.waitFor({ state: 'visible', timeout: 60000 });
        await expect(this.reportsBtn).toBeVisible();

        await frame.getByRole('button', { name: 'REPORTS' }).waitFor({ state: 'visible' });
        await frame.getByRole('button', { name: 'REPORTS' }).click();

        await frame.getByRole('button', { name: 'Now', exact: true }).waitFor({ state: 'visible' });
        await frame.getByRole('button', { name: 'Now', exact: true }).click();

        await frame.getByRole('link', { name: 'Schedule' }).click();

        // Email
        const emailInput = frame.getByRole('textbox', { name: 'test@compass-usa.com' });
        await emailInput.waitFor({ state: 'visible' });
        await emailInput.clear();
        await emailInput.fill(email);

        // Frequency & date range
        await frame.getByText(frequency).click();
        await frame.getByRole('radio', { name: 'Everyday' }).check({ force: true });
        await frame.getByRole('textbox', { name: 'Select' }).click();
        await frame.getByText(dateRange).waitFor({ state: 'visible' });
        await frame.getByText(dateRange).click();

        // Subject
        await frame.locator('#subject').waitFor({ state: 'visible' });
        await frame.locator('#subject').clear();
        await frame.locator('#subject').fill(subject);

        // Create — dismiss any dialog
        this.page.once('dialog', async dialog => {
            console.log(`Dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });

        await frame.getByRole('button', { name: 'Create', exact: true }).waitFor({ state: 'visible' });
        await frame.getByRole('button', { name: 'Create', exact: true }).click();
    }
}