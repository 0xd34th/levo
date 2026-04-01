'use client';

import { MobileTopBar } from '@/components/mobile-top-bar';
import { SegmentedTabs } from '@/components/segmented-tabs';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <MobileTopBar />
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-4 md:max-w-2xl lg:max-w-4xl">
        <SegmentedTabs />
        <div className="mt-4">{children}</div>
      </main>
    </div>
  );
}
