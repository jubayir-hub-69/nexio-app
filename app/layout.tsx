import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("nexio_theme")||localStorage.getItem("trustbank_theme");var t=(s==="light"||s==="dark")?s:"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nexio.app"),
  title: "Nexio Protocol",
  description:
    "Enterprise Stablecoin Banking, Automated Yield Vaults & Permanent .nex Identity on Arc Mainnet.",
  openGraph: {
    title: "Nexio Protocol",
    description:
      "Enterprise Stablecoin Banking, Automated Yield Vaults & Permanent .nex Identity on Arc Mainnet.",
    images: [{ url: "/nexio-logo.jpg", width: 1024, height: 1024, alt: "Nexio Protocol" }],
  },
  twitter: {
    card: "summary",
    title: "Nexio Protocol",
    description:
      "Enterprise Stablecoin Banking, Automated Yield Vaults & Permanent .nex Identity on Arc Mainnet.",
    images: ["/nexio-logo.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans antialiased">
        <Script id="nexio-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
