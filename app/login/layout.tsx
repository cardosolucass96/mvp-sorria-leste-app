import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - Sorria Leste',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login não usa o layout padrão com sidebar
  return <>{children}</>;
}
