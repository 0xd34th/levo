'use client';

import { MobileTopBar } from '@/components/mobile-top-bar';
import { SegmentedTabs } from '@/components/segmented-tabs';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <MobileTopBar />
      <main className="mx-auto w-full max-w-lg px-5 pb-24 pt-2 md:max-w-2xl lg:max-w-4xl">
        <div className="mb-5">
          <SegmentedTabs />
        </div>
        {children}
      </main>
    </div>
  );
}
