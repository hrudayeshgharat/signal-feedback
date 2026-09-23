import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Signal — Customer Feedback Intelligence',
  description: 'Explore customer reviews, sentiment, topics, and the evidence behind every finding.',
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
