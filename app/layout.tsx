import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Binance Futures Pro Scanner & OrderFlow Terminal',
  description: 'High-frequency real-time Binance USD-M Futures orderflow scanner, CVD delta analyzer, liquidity heatmap, DOM ladder, and quantitative pattern engine.',
  openGraph: {
    title: 'Binance Futures Pro Scanner & OrderFlow Terminal',
    description: 'High-frequency real-time Binance USD-M Futures orderflow scanner, CVD delta analyzer, liquidity heatmap, DOM ladder, and quantitative pattern engine.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Binance Futures Pro Scanner & OrderFlow Terminal',
    description: 'High-frequency real-time Binance USD-M Futures orderflow scanner, CVD delta analyzer, liquidity heatmap, DOM ladder, and quantitative pattern engine.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
