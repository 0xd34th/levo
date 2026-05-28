import { expect, test } from '@playwright/test';

const routes = [
  { path: '/', text: /quiet wallet|Current balance|Sign in with X/i },
  { path: '/send', text: /Send|Recipient|Amount/i },
  { path: '/earn', text: /Earn|Claim|Withdraw|Stake/i },
  { path: '/agent/new', text: /Agent workspace|Explore Sui/i },
  { path: '/lookup', text: /Recipient lookup|Lookup/i },
  { path: '/tools', text: /Recipient lookup|Tools/i },
];

test.describe('unauthenticated smoke', () => {
  for (const route of routes) {
    test(`${route.path} renders without a page crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(route.path);

      await expect(page.locator('body')).toContainText(route.text);
      await expect(page.locator('text=/Application error|Unhandled Runtime Error|This page could not be found/i')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
