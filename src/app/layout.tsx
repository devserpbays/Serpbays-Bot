import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';


const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GetMention — Social Engagement Bot',
  icons: { icon: '/favicon.svg' },
  description: 'AI-powered social media engagement automation with human-in-the-loop approval',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: '#7c3aed',
              colorBackground: '#ffffff',
              colorInputBackground: '#f9fafb',
              colorInputText: '#1a1a2e',
              colorText: '#1a1a2e',
              colorTextSecondary: '#6b7280',
              borderRadius: '0.75rem',
              fontFamily: 'var(--font-inter)',
            },
            elements: {
              card: {
                boxShadow: 'none',
                border: 'none',
                background: 'transparent',
              },
              headerTitle: { fontWeight: '700', letterSpacing: '-0.03em', color: '#1a1a2e' },
              formButtonPrimary: {
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                boxShadow: '0 2px 16px rgba(124,58,237,0.3)',
              },
              socialButtonsBlockButton: {
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
              },
              footerActionLink: { color: '#7c3aed' },
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
