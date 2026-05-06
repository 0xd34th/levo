import { expect, test } from '@playwright/test';
import {
  closeWelcomeScreen,
  itemInMenu,
} from './testData/landingPageFunctions';
import {
  openOrCloseMainMenu,
  Theme,
} from './testData/menuFunctions';
import { qase } from 'playwright-qase-reporter';

test.describe('Light-only theme mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.use({ colorScheme: 'dark' });
  test(
    qase(30, 'Should not expose dark or system theme modes'),
    async ({ page }) => {
      await closeWelcomeScreen(page);
      await openOrCloseMainMenu(page);
      await itemInMenu(page, 'Theme');

      await expect(page.getByRole('menuitem', { name: /^Dark$/ })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole('menuitem', { name: /^System$/ }),
      ).toHaveCount(0);

      await itemInMenu(page, Theme.Light);
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue('color-scheme'),
          ),
        )
        .toBe('light');
    },
  );

  test.use({ colorScheme: 'light' });
  test(
    qase(31, 'Should able to change the theme color to Light'),
    async ({ page }) => {
      await closeWelcomeScreen(page);
      await page.locator('#main-burger-menu-button').click();
      await itemInMenu(page, 'Theme');
      await itemInMenu(page, Theme.Light);
      await page.locator('#main-burger-menu-button').click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            getComputedStyle(document.body).getPropertyValue('color-scheme'),
          ),
        )
        .toBe('light');
    },
  );

  test(
    qase(
      49,
      'Partner theme should appear in theme menu and apply background color',
    ),
    async ({ page }) => {
      await closeWelcomeScreen(page);

      // Get initial background color
      const backgroundElement = page.locator('#background-root');
      const initialBgColor = await backgroundElement.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );

      // Open menu and navigate to Theme submenu
      await openOrCloseMainMenu(page);
      await itemInMenu(page, 'Theme');

      // Find partner theme (any menu item that's not Light)
      const menuItems = page.getByRole('menuitem');
      const allMenuItems = await menuItems.allTextContents();
      const partnerTheme = allMenuItems.find(
        (item) => !['Light'].includes(item) && item.trim() !== '',
      );

      // Skip if no partner theme is available
      if (!partnerTheme) {
        test.skip();
        return;
      }

      // Select the partner theme
      await itemInMenu(page, partnerTheme);

      // Verify background color changed or background image appeared
      const isThemeApplied = await backgroundElement.evaluate(
        (el, prevBgColor) => {
          const bgColorChanged =
            getComputedStyle(el).backgroundColor !== prevBgColor;
          const imgElement = el.querySelector('img');
          const hasBgImage = imgElement !== null && !!imgElement.src;
          return bgColorChanged || hasBgImage;
        },
        initialBgColor,
      );

      expect(isThemeApplied).toBe(true);
    },
  );
});
