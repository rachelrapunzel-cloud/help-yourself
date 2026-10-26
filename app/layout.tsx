import type { Metadata } from "next";
import "./globals.css";
import { SHOP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: SHOP_NAME,
  description: "Clothes we don't wear any more. Give what you like, including nothing.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
