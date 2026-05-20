import { LevoWebShell } from '@/components/levo-web-shell';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <LevoWebShell>{children}</LevoWebShell>;
}
