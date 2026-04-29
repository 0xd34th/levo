# Jumper UI 大清理 — 剥离 LI.FI 运营层

**目标**：把 Jumper 改成只包 `@lifi/widget` 的极简 swap/bridge 壳，删掉 Portfolio / Missions / Earn / Pass / Leaderboard / Learn / Scan / Quests / Campaign / Zap / Newsletter / AnnouncementBanner，以及它们的所有死代码。

**保留**：核心 swap/bridge widget、`/`、`(main)/gas`（Refuel）、`bridge`、`swap`、`onboard`、`(infos)/privacy-policy`、`(infos)/terms-of-business`、`error-preview`、`meta`、WalletMenu 自定义、左侧 VerticalTabs、Strapi 基础设施（partner themes、mini app、wallet access control）。

**验收**：`pnpm typecheck` 通过、`pnpm lint` 无新错、`pnpm test:unit` 通过、`pnpm build` 通过、本地启动后导航无 404、widget 正常工作、WalletMenu 正常。

---

## Phase 1 — 删路由目录

- [ ] `apps/jumper/src/app/[lng]/portfolio/`
- [ ] `apps/jumper/src/app/[lng]/missions/`
- [ ] `apps/jumper/src/app/[lng]/earn/`
- [ ] `apps/jumper/src/app/[lng]/campaign/`
- [ ] `apps/jumper/src/app/[lng]/zap/`
- [ ] `apps/jumper/src/app/[lng]/quests/`
- [ ] `apps/jumper/src/app/[lng]/scan/`
- [ ] `apps/jumper/src/app/[lng]/(infos)/profile/`
- [ ] `apps/jumper/src/app/[lng]/(infos)/leaderboard/`
- [ ] `apps/jumper/src/app/[lng]/(infos)/learn/`
- [ ] `apps/jumper/src/app/[lng]/(infos)/newsletter/`

## Phase 2 — 删功能组件 / hook / store / type / lib

### AnnouncementBanner
- [ ] `apps/jumper/src/components/AnnouncementBanner/`
- [ ] `apps/jumper/src/app/ui/app/AnnouncementBannerWrapper.tsx`
- [ ] `apps/jumper/src/hooks/useAnnouncements.ts`
- [ ] `apps/jumper/src/app/lib/getAnnouncements.ts`
- [ ] `apps/jumper/src/app/lib/getAnnouncements.spec.ts`
- [ ] `apps/jumper/src/types/announcement.ts`
- [ ] `apps/jumper/src/stores/announcements/`

### Portfolio
- [ ] `apps/jumper/src/components/PortfolioFilterBar/`
- [ ] `apps/jumper/src/app/ui/portfolio/`
- [ ] `apps/jumper/src/hooks/portfolio/`
- [ ] `apps/jumper/src/hooks/usePortfolioWelcomeScreen.ts`
- [ ] `apps/jumper/src/types/portfolio.ts`
- [ ] `apps/jumper/src/providers/PortfolioProvider/`（验证 layout 解绑后再删）
- [ ] `apps/jumper/src/components/illustrations/PortfolioEmptyIllustration.tsx`
- [ ] `apps/jumper/src/components/illustrations/PortfolioBetaIllustration.tsx`
- [ ] `apps/jumper/src/components/core/empty-content/PortfolioEmptyList/`
- [ ] `apps/jumper/src/stores/portfolio/`
- [ ] `apps/jumper/src/utils/tracking/portfolio.ts`

### Missions / Quests / Campaign / Zap
- [ ] `apps/jumper/src/components/Campaign/`
- [ ] `apps/jumper/src/components/Zap/`
- [ ] `apps/jumper/src/components/ZapWidget/`
- [ ] `apps/jumper/src/app/ui/missions/`
- [ ] `apps/jumper/src/app/ui/mission/`
- [ ] `apps/jumper/src/app/ui/zap/`
- [ ] `apps/jumper/src/app/ui/widget/ZapWidgetPage.tsx`
- [ ] `apps/jumper/src/hooks/useMissionsInfinite.ts`
- [ ] `apps/jumper/src/hooks/useMissionTimeStatus.ts`
- [ ] `apps/jumper/src/hooks/quests/`
- [ ] `apps/jumper/src/hooks/ongoingNumericQuests.ts`（确认是 quests）
- [ ] `apps/jumper/src/stores/mission/`
- [ ] `apps/jumper/src/types/zaps.ts`
- [ ] `apps/jumper/src/components/Cards/MissionHeroStatsCard/`
- [ ] `apps/jumper/src/components/headless/tracking/MissionPageTracking.tsx`
- [ ] `apps/jumper/src/components/Widgets/variants/mission/`
- [ ] `apps/jumper/src/components/Widgets/variants/widgetConfig/useMissionWidgetConfig.ts`
- [ ] `apps/jumper/src/components/Widgets/variants/widgetConfig/useZapWidgetConfig.tsx`
- [ ] `apps/jumper/src/components/Widgets/variants/base/ZapWidget/`
- [ ] `apps/jumper/src/app/lib/getCampaigns.ts`
- [ ] `apps/jumper/src/app/lib/getCampaignsBySlug.ts`
- [ ] `apps/jumper/src/app/lib/getQuestsBy.ts`
- [ ] `apps/jumper/src/app/lib/getQuestsWithNoCampaignAttached.ts`
- [ ] `apps/jumper/src/app/lib/getProfileBannerCampaigns.ts`

### Earn
- [ ] `apps/jumper/src/components/EarnFilterBar/`
- [ ] `apps/jumper/src/components/EarnDetails/`
- [ ] `apps/jumper/src/components/EarnRelatedMarkets/`
- [ ] `apps/jumper/src/components/Cards/EarnCard/`
- [ ] `apps/jumper/src/app/ui/earn/`
- [ ] `apps/jumper/src/hooks/earn/`
- [ ] `apps/jumper/src/types/earn.ts`
- [ ] `apps/jumper/src/components/illustrations/EarnBetaIllustration.tsx`
- [ ] `apps/jumper/src/components/headless/tracking/EarnPageTracking.tsx`
- [ ] `apps/jumper/src/app/lib/getMerklRewards.ts`（earn-only 验证后）

### Profile / Pass / Loyalty / Achievements / Perks / Leaderboard
- [ ] `apps/jumper/src/components/ProfilePage/`
- [ ] `apps/jumper/src/components/Leaderboard/`
- [ ] `apps/jumper/src/app/ui/leaderboard/`
- [ ] `apps/jumper/src/hooks/useLoyaltyPass.ts`
- [ ] `apps/jumper/src/hooks/perks/`
- [ ] `apps/jumper/src/hooks/achievements/`
- [ ] `apps/jumper/src/stores/loyaltyPass/`
- [ ] `apps/jumper/src/stores/perkClaimStatus/`
- [ ] `apps/jumper/src/providers/ProfileProvider.tsx`
- [ ] `apps/jumper/src/types/loyaltyPass.ts`
- [ ] `apps/jumper/src/components/Cards/PerksCard/`
- [ ] `apps/jumper/src/components/Cards/AchievementCard/`
- [ ] `apps/jumper/src/components/Navbar/components/Buttons/LevelButton.tsx`
- [ ] `apps/jumper/src/app/lib/getPerks.ts`

### Learn / Blog
- [ ] `apps/jumper/src/app/ui/learn/`
- [ ] `apps/jumper/src/hooks/blog/`
- [ ] `apps/jumper/src/app/lib/getArticles.ts`
- [ ] `apps/jumper/src/app/lib/getArticleBySlug.ts`
- [ ] `apps/jumper/src/app/lib/getArticlesByTag.ts`
- [ ] `apps/jumper/src/app/lib/getFeaturedArticle.ts`
- [ ] `apps/jumper/src/app/lib/searchArticles.ts`
- [ ] `apps/jumper/src/app/lib/getTags.ts`

### Scan
- [ ] `apps/jumper/src/app/ui/scan/`

### API routes 死路由
- [ ] `apps/jumper/src/app/api/profile/`（如果存在）

## Phase 3 — 修改 Navbar 相关文件

- [ ] `apps/jumper/src/components/Navbar/hooks.ts`：删 `useLevelDisplayData`、`useLoyaltyPass`/`isEarnFeatureEnabled`/`isPortfolioFeatureEnabled` import，简化 `useMainLinks` 只留 Main + Gas subLink
- [ ] `apps/jumper/src/components/Navbar/components/Buttons/WalletButtons.tsx`：删 `LevelButton` import + usage
- [ ] `apps/jumper/src/components/Navbar/components/Buttons/LevelButton.tsx`：整文件已在 Phase 2 删

## Phase 4 — 修改 App.tsx

- [ ] `apps/jumper/src/app/ui/app/App.tsx`：删 `AnnouncementBannerWrapper` 动态 import、`announcementBannersRef` / `announcementBannerHeight` state、ResizeObserver useEffect、`marginTop` prop、`<AnnouncementBannerWrapper>` 渲染

## Phase 5 — 修改 [lng]/layout.tsx

- [ ] `apps/jumper/src/app/[lng]/layout.tsx`：删 `PortfolioProvider` import + wrapper（如果 PortfolioProvider 仅给 portfolio 页用）

## Phase 6 — 修改 MainMenu / 二级菜单

- [ ] `apps/jumper/src/components/Menus/MainMenu/hooks.tsx`：删 `handleMissionsClick` / `handleEarnClick` / `handlePortfolioClick` / `handleProfileClick` / `handleLearnClick` / `handleScanClick` / `handleNewsletterClick`，删 `useFooterLinks` 里的 newsletter，删 `useMenuItems` 里 Portfolio/Missions/Earn/Learn/Scan 入口
- [ ] 检查并清理 `ThemeSubMenu/useThemeMenuContent.tsx`、`Menus/SubMenu/*` 里相关引用

## Phase 7 — urls.ts AppPaths 收口

- [ ] `apps/jumper/src/const/urls.ts`：删 `JUMPER_LEARN_PATH` / `JUMPER_PROFILE_PATH` / `JUMPER_MISSIONS_PATH` / `JUMPER_SCAN_PATH` / `JUMPER_ZAP_PATH` / `JUMPER_QUESTS_PATH` / `JUMPER_CAMPAIGN_PATH` / `JUMPER_LEADERBOARD_PATH` / `JUMPER_EARN_PATH` / `JUMPER_PORTFOLIO_PATH` / `JUMPER_NEWSLETTER_PATH` 常量与 enum 项；保留 Main / Gas / Bridge / Swap / Tx / Wallet / PrivacyPolicy / TermsOfBusiness

## Phase 8 — trackingKeys.ts

- [ ] `apps/jumper/src/const/trackingKeys.ts`：删所有 portfolio / missions / earn / profile / leaderboard / learn / scan / quests / campaign / zap / banner / perks / achievements / loyalty / level / newsletter 相关 `TrackingAction` / `TrackingCategory` 项

## Phase 9 — getFeatureFlag.ts / env-config

- [ ] `apps/jumper/src/app/lib/getFeatureFlag.ts`：删 `isEarnFeatureEnabled` / `isPortfolioFeatureEnabled` / `isNewsletterFeatureEnabled`
- [ ] `apps/jumper/src/config/env-config.ts`：评估并删 `NEXT_PUBLIC_WIDGET_INTEGRATOR_EARN`（earn-only），保留 STRAPI 相关因为还在用

## Phase 10 — typecheck 闭环

- [ ] `cd apps/jumper && pnpm typecheck`，按错误信息删 / 改剩余文件，迭代到 0 错
- [ ] 重点关注：composite cards (PositionCard / WalletBalanceCard / AssetOverviewCard) 是否还在用 — 如有 dangling import 一并删

## Phase 11 — i18n 17 语言文件清键

- [ ] 写一次性脚本批量删除以下 key（17 语言均执行）：
  - `navbar.links.portfolio` / `navbar.links.missions` / `navbar.links.earn`
  - `navbar.pass`
  - `navbar.navbarMenu.learn` / `navbar.navbarMenu.scan` / `navbar.navbarMenu.newsletter`
  - 顶层命名空间：`portfolio`、`missions`、`earn`、`profile_page`、`leaderboard`、`learn`、`questCard`、`campaign`、`perks`、`achievements`、`announcements` / `banner`（如存在）、`scan`、`zap`、`newsletter`
- [ ] 跑 `pnpm i18next-resources-for-ts` 重生类型

## Phase 12 — Lint + Build

- [ ] `pnpm lint`（apps/jumper）—— 修剩余警告 / 错误
- [ ] `pnpm build`（apps/jumper）—— 修构建错误（路由、动态引用等）

## Phase 13 — 测试 & 提交

- [ ] `pnpm test:unit`（apps/jumper）
- [ ] 本地 `pnpm dev` 启动，手动验证：首页 widget、`/bridge`、`/swap`、`/gas`、`/privacy-policy`、`/terms-of-business`、WalletMenu 各功能
- [ ] git diff 自查
- [ ] commit（在 `feat/jumper-privy-cex` 分支上）

## Review

（Phase 13 完成后回写）
