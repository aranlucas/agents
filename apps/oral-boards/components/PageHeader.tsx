import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-8 text-center">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-indigo-900 dark:text-indigo-100 mb-2">
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground text-base sm:text-lg">{subtitle}</p>
      )}
    </header>
  );
}
