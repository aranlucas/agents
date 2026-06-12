import { ReactNode } from "react";

interface PageLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
}

export function PageLayout({ children, footer }: PageLayoutProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-6 sm:py-8">
        {children}
        {footer && (
          <footer className="mt-8 sm:mt-12 text-center text-muted-foreground text-xs sm:text-sm px-2">
            {footer}
          </footer>
        )}
      </div>
    </main>
  );
}
