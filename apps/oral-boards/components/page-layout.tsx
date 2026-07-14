import { ReactNode } from "react";

interface PageLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
}

export function PageLayout({ children, footer }: PageLayoutProps) {
  return (
    <main className="min-h-screen bg-linear-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-6 sm:py-8">
        {children}
        {footer && (
          <footer className="mt-8 px-2 text-center text-xs text-muted-foreground sm:mt-12 sm:text-sm">
            {footer}
          </footer>
        )}
      </div>
    </main>
  );
}
