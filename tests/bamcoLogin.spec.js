import {test} from '@playwright/test'

test.only('Bamco Login', async ({page}) => {
    await page.goto('https://cafemanager.dev.bamcotest.com/cafemanager/login');
    await page.waitForTimeout(12000);
    await page.getByRole('textbox', { name: 'PerNo (PerNo = your 8 - digit' }).click();
    await page.locator('input[name="emanresu"]').fill('99063285');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.locator('input[name="drowssap"]').fill('Adi16@bamco');
    await page.getByRole('button', { name: 'log in' }).click();
    await page.getByRole('link', { name: 'Waste Not' }).click();

    await page.locator('#wastenot-html').contentFrame().getByRole('heading', { name: 'Waste Trend' }).dblclick();

})