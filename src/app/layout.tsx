import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/ThemeProvider';


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
          taskUrls={{ 'reset-password': '/reset-password' }}
          appearance={{
            variables: {
              colorPrimary: '#7c3aed',
              colorBackground: '#0f0f12',
              colorInputBackground: '#131316',
              colorInputText: '#fafafa',
              colorText: '#fafafa',
              colorTextSecondary: '#a1a1aa',
              borderRadius: '0.5rem',
              fontFamily: 'var(--font-inter)',
            },
            elements: {
              rootBox: { width: '100%' },
              card: {
                boxShadow: 'none',
                border: 'none',
                background: 'transparent',
              },
              headerTitle: { fontWeight: '700', letterSpacing: '-0.02em', color: '#fafafa' },
              headerSubtitle: { color: '#a1a1aa' },
              formButtonPrimary: {
                background: '#7c3aed',
                boxShadow: 'none',
                borderRadius: '6px',
                color: '#ffffff',
              },
              formFieldLabel: { color: '#d4d4d8' },
              formFieldInput: {
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#fafafa',
              },
              formFieldInputShowPasswordButton: { color: '#a1a1aa' },
              formFieldAction: { color: '#a78bfa' },
              formFieldHintText: { color: '#71717a' },
              formFieldErrorText: { color: '#f87171' },
              formFieldWarningText: { color: '#fbbf24' },
              formFieldSuccessText: { color: '#4ade80' },
              socialButtonsBlockButton: {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#d4d4d8',
              },
              socialButtonsBlockButtonText: { color: '#d4d4d8' },
              dividerLine: { background: 'rgba(255,255,255,0.08)' },
              dividerText: { color: '#71717a' },
              footerAction: { color: '#a1a1aa' },
              footerActionLink: { color: '#a78bfa' },
              footerActionText: { color: '#71717a' },
              identityPreview: { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
              identityPreviewText: { color: '#d4d4d8' },
              identityPreviewEditButton: { color: '#a78bfa' },
              alternativeMethodsBlockButton: {
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#d4d4d8',
              },
              otpCodeFieldInput: {
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fafafa',
              },
              formResendCodeLink: { color: '#a78bfa' },
              alert: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' },
              alertText: { color: '#d4d4d8' },
              backLink: { color: '#a78bfa' },
            },
          }}
        >
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
