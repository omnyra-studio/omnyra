import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import PWARegister from "./pwa-register";
import AnimatedBackground from "@/components/AnimatedBackground";
import GlobalNav from "@/components/GlobalNav";
import { PHProvider } from "@/components/PostHogProvider";
import { Suspense } from "react";
import PostHogPageView from "@/components/PostHogPageView";
import QueryProvider from "@/components/QueryProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata = {
  title: "Omnyra — Adaptive Creative Intelligence | Understand What Works",
  description: "Predict what performs. Track audience behavior. Learn from every post outcome. The only creative intelligence system that understands what you should make next and why.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Omnyra",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/api/pwa-icon/192",
    apple: "/api/pwa-icon/180",
  },
};

export const viewport = {
  themeColor: "#D4AF37",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col" style={{ backgroundColor: '#2D0A3E' }}>
        <script dangerouslySetInnerHTML={{__html: `if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){for(let s of r)s.unregister();});}`}} />
        <QueryProvider>
          <PHProvider>
            <Suspense>
              <PostHogPageView />
            </Suspense>
            <div style={{ position: 'fixed', inset: 0, zIndex: 0, width: '100vw', height: '100vh' }}>
              <AnimatedBackground />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <GlobalNav />
              {children}
            </div>
            <PWARegister />
          </PHProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
