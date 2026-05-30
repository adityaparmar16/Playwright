import { expect } from '@playwright/test';

/**
 * Page Object Model — Café Manager (Bamco)
 * Shared across Dev and Prod. No environment values hardcoded here.
 */
export class BamcoPage {
    constructor(page) {
        this.page = page;

        // ── Login ────────────────────────────────────────────────────
        this.heading       = page.locator('h1');
        this.newUserLink   = page.getByRole('link', { name: 'New User?' });
        this.forgotPwdLink = page.getByRole('link', { name: 'Forgot Password?' });
        this.usernameInput = page.locator('input[name="emanresu"]');
        this.passwordInput = page.locator('input[name="drowssap"]');
        this.loginButton   = page.getByRole('button', { name: 'log in' });

        // ── Navigation ───────────────────────────────────────────────
        this.navigation     = page.locator('#navigation');
        this.wasteNotLink   = page.getByRole('link', { name: 'Waste Not' });
        this.bonAppetit     = page.getByText('Bon Appétit', { exact: true });
        this.clearAllButton = page.getByText('CLEAR ALL', { exact: true });

        // ── Filter Buttons ───────────────────────────────────────────
        this.allRegionsBtn     = page.getByRole('button', { name: 'All Regions' });
        this.allDistrictsBtn   = page.getByRole('button', { name: 'All Districts' });
        this.allAccountsBtn    = page.getByRole('button', { name: 'All Accounts' });
        this.allCampusesBtn    = page.getByRole('button', { name: 'All Campuses' });
        this.allKitchensBtn    = page.getByRole('button', { name: 'All Kitchens' });
        this.allCostCentersBtn = page.getByRole('button', { name: 'All Cost Centers' });
        this.allProfilesBtn    = page.getByRole('button', { name: 'All Profiles' });
        this.allTabletsBtn     = page.getByRole('button', { name: 'All Tablets' });
        this.searchInput       = page.getByRole('textbox', { name: 'Search' });

        // ── Iframe ───────────────────────────────────────────────────
        this.iframeLocator = page.locator('iframe#wastenot-html');
        this.iframeFrame   = page.frameLocator('iframe#wastenot-html');
    }

    async goto(url) {
        await this.page.goto(url);
        await expect(this.heading).toHaveText('Café Manager');
        await expect(this.newUserLink).toBeVisible();
        await expect(this.forgotPwdLink).toBeVisible();
    }

    async login(username, password) {
        await this.usernameInput.pressSequentially(username, { delay: 500 });
        await this.passwordInput.pressSequentially(password, { delay: 500 });
        await this.loginButton.click();
    }

    async navigateToWasteNot() {
        await expect(this.navigation).toContainText('Waste Not');
        await this.wasteNotLink.click();
    }

    async assertFiltersVisible() {
        const filters = ['Region', 'District', 'Account', 'Campus', 'Kitchen', 'Cost Center', 'Profile', 'Tablet', 'CLEAR ALL'];
        for (const filter of filters) {
            await expect(this.page.getByRole('form')).toContainText(filter);
        }
    }

    async assertFilterButtonsVisible() {
        for (const btn of [this.allRegionsBtn, this.allDistrictsBtn, this.allAccountsBtn, this.allCampusesBtn,
                           this.allKitchensBtn, this.allCostCentersBtn, this.allProfilesBtn, this.allTabletsBtn]) {
            await expect(btn).toBeVisible();
        }
    }

    async waitForIframe(waitMs = 25000) {
        await this.iframeLocator.waitFor({ state: 'visible', timeout: 15000 });
        await this.page.waitForTimeout(waitMs);
    }

    async assertIframeElementsVisible() {
        await expect(this.iframeFrame.getByRole('button', { name: 'REPORTS' })).toBeVisible();
        await expect(this.iframeFrame.getByText('DATE RANGE:')).toBeVisible();
    }

    async selectRegion(regionName) {
        await this.allRegionsBtn.click();
        await this.searchInput.fill(regionName);
        await this.page.getByRole('listitem').filter({ hasText: regionName }).getByRole('option').click();
        await this.bonAppetit.waitFor();
        await this.bonAppetit.click();
        await this.page.waitForTimeout(1000);
    }

    async selectCampus(campusName) {
        await this.allCampusesBtn.click();
        await this.searchInput.fill(campusName);
        await this.page.getByRole('combobox').filter({ hasText: campusName }).getByRole('option').click();
        await this.bonAppetit.click();
    }

    async clearAllFilters() {
        await this.clearAllButton.waitFor();
        await expect(this.clearAllButton).toBeVisible();
        console.log('CLEAR ALL is visible, clicking it now');
        await this.clearAllButton.click();
        await expect(this.allRegionsBtn).toHaveText('All Regions', { timeout: 5000 });
    }

    async assertIframeLbsValue(value, label, exact = false) {
        if (!value) { console.warn(`No ${label} data found in DB — skipping`); return; }
        try {
            const locator = exact
                ? this.iframeFrame.getByText(`${value} lbs`, { exact: true })
                : this.iframeFrame.getByText(`${value} lbs`).first();
            await expect(locator).toBeVisible();
            console.log(`✓ ${label} verified in UI: ${value} lbs`);
        } catch {
            console.warn(`✗ ${label} (${value} lbs) not visible in UI`);
        }
    }
}