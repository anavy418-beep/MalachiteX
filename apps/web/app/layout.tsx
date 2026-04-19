import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Malachitex",
  description: "Malachitex - premium crypto wallet and P2P trading MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <div className="app-bg">
            <Navbar />
            <main className="main-shell">{children}</main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
