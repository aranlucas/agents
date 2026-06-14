import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6 text-center sm:mb-8">
      <h1 className="mb-2 text-2xl font-bold text-indigo-900 sm:text-3xl md:text-4xl dark:text-indigo-100">
        {title}
      </h1>
      {subtitle && <p className="text-muted-foreground text-base sm:text-lg">{subtitle}</p>}
    </header>
  );
}
