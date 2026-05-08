import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import "@mysten/dapp-kit/dist/index.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "aisui — AI explorer for Sui",
  description:
    "Ask anything about Sui. Tokens, portfolios, objects, PTBs, swaps — explained and executable in chat.",
  openGraph: {
    title: "aisui — AI explorer for Sui",
    description: "Chat with the Sui chain.",
    url: "https://aisui.app",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// Inline script that applies the persisted theme + accent BEFORE React hydrates,
// so the first paint matches the user's preference and we avoid a flash.
const themeBoot = `(function(){try{var t=localStorage.getItem("aisui-theme")||"light";var a=localStorage.getItem("aisui-accent")||"aqua";var d=document.documentElement;d.setAttribute("data-theme",t);d.setAttribute("data-accent",a);d.setAttribute("data-density","comfortable");}catch(e){document.documentElement.setAttribute("data-theme","light");document.documentElement.setAttribute("data-accent","aqua");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" data-accent="aqua" data-density="comfortable" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${inter.variable} ${jetbrains.variable} min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
