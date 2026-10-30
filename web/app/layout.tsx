import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { CornerMascot } from "@/components/corner-mascot";
import { MainContentShell } from "@/components/main-content-shell";
import { SiteHeader } from "@/components/site-header";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_COOKIE } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyImage · 图片浏览",
  description: "基于 Next.js、TanStack Query、MinIO 的图片浏览站点前端",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const theme = jar.get(THEME_COOKIE)?.value;
  const dark = theme === "dark";

  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${dark ? " dark" : ""}`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeSync />
        <Providers>
          <SiteHeader />
          <MainContentShell>{children}</MainContentShell>
          <CornerMascot />
        </Providers>
      </body>
    </html>
  );
}
