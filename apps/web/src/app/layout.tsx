import './global.css';

import { ApolloProvider } from '@/components/providers/apollo-provider';
import { Toaster } from '@/components/atoms/ui/sonner';

export const metadata = {
  title: 'Desafio',
  description: 'Authenticated blog with AI copilot',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ApolloProvider>{children}</ApolloProvider>
        <Toaster />
      </body>
    </html>
  );
}
