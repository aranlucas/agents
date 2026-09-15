"use client";

import { useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { Navigation } from "@/components/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@agents/ui";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@agents/ui";
import { Badge } from "@agents/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@agents/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agents/ui";
import { resourceCategories, getAllPdfResources } from "@/data/resources";
import {
  BookOpen,
  FileText,
  ExternalLink,
  Download,
  GraduationCap,
  Globe,
  Video,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";

const typeIcons: Record<string, typeof BookOpen> = {
  guideline: FileCheck,
  article: FileText,
  textbook: BookOpen,
  video: Video,
  website: Globe,
};

const typeColors: Record<string, string> = {
  guideline: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  article: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  textbook: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  video: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  website: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export default function ResourcesPage() {
  const pdfResources = getAllPdfResources();
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [showLegend, setShowLegend] = useState(false);
  const [showAllPdfs, setShowAllPdfs] = useState(false);

  const toggleCategory = (categoryName: string) => {
    setOpenCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName],
    );
  };

  const expandAll = () => {
    setOpenCategories(resourceCategories.map((c) => c.name));
  };

  const collapseAll = () => {
    setOpenCategories([]);
  };

  // Filter resources based on type
  const filteredCategories = resourceCategories
    .map((category) => ({
      ...category,
      resources:
        filterType === "all"
          ? category.resources
          : category.resources.filter((r) => r.type === filterType),
    }))
    .filter((category) => category.resources.length > 0);

  const allTypes = ["all", "guideline", "article", "textbook", "video", "website"];

  return (
    <PageLayout
      footer={
        <>
          <p>
            Resources are regularly updated. Always verify with the latest official publications.
          </p>
          <p className="mt-2">
            Use these materials alongside clinical experience and mentorship for comprehensive
            preparation.
          </p>
          <p className="mt-2">
            Primary exam-policy source alignment is maintained against ABPD OCE documentation in
            this repository.
          </p>
        </>
      }
    >
      <PageHeader
        title="Reference Materials & Resources"
        subtitle="Comprehensive collection of guidelines, PDFs, textbooks, and resources for pediatric dentistry oral board preparation"
      />

      <Navigation />

      {/* Quick Stats */}
      <div className="mx-auto mb-6 grid max-w-4xl grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-4 sm:gap-4">
        <Card className="p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-indigo-600 sm:text-3xl">
            {resourceCategories.reduce((acc, cat) => acc + cat.resources.length, 0)}
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">Total Resources</p>
        </Card>
        <Card className="p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-blue-600 sm:text-3xl">{pdfResources.length}</p>
          <p className="text-xs text-muted-foreground sm:text-sm">PDF Documents</p>
        </Card>
        <Card className="p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-green-600 sm:text-3xl">
            {resourceCategories.length}
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">Categories</p>
        </Card>
        <Card className="p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-purple-600 sm:text-3xl">2026</p>
          <p className="text-xs text-muted-foreground sm:text-sm">Latest Updates</p>
        </Card>
      </div>

      {/* PDF Quick Access Section */}
      <Card className="mx-auto mb-6 max-w-4xl border-2 border-blue-200 bg-blue-50/50 sm:mb-8 dark:border-blue-800 dark:bg-blue-950/20">
        <Collapsible open={showAllPdfs} onOpenChange={setShowAllPdfs}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer transition-colors hover:bg-blue-100/50 hover:dark:bg-blue-900/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-start">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Download className="size-4 text-blue-600 sm:size-5" />
                      Quick Access: PDF Guidelines
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-xs text-blue-900 dark:bg-blue-900 dark:text-blue-100"
                    >
                      {pdfResources.length}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">
                    Direct links to essential PDF documents from ABPD, AAPD, EAPD, and IADT
                  </CardDescription>
                </div>
                {showAllPdfs ? (
                  <ChevronUp className="size-4 shrink-0 text-blue-600 sm:size-5" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-blue-600 sm:size-5" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid gap-1.5 sm:gap-2">
                {pdfResources.map((resource) => (
                  <a
                    key={resource.url}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-blue-100 sm:p-2.5 hover:dark:bg-blue-900/30"
                  >
                    <FileText className="size-3.5 shrink-0 text-blue-600 sm:size-4" />
                    <span className="line-clamp-2 flex-1 text-xs text-muted-foreground transition-colors group-hover:text-blue-600 sm:line-clamp-1 sm:text-sm">
                      {resource.title}
                    </span>
                    <ExternalLink className="size-3 shrink-0 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Filter Section */}
      <Card className="mx-auto mb-4 max-w-4xl sm:mb-6">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Filter className="size-4 text-indigo-600 sm:size-5" />
            Filter Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1">
              <span className="mb-1.5 block text-xs font-medium sm:mb-2 sm:text-sm">
                Resource Type
              </span>
              <Select value={filterType} onValueChange={(value) => setFilterType(value ?? "all")}>
                <SelectTrigger className="text-sm" aria-label="Resource type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {allTypes.map((type) => (
                    <SelectItem key={type} value={type} className="text-sm">
                      {type === "all" ? "All Types" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 sm:self-end">
              <Button
                onClick={expandAll}
                variant="outline"
                size="sm"
                className="flex-1 text-xs sm:flex-none sm:text-sm"
              >
                Expand All
              </Button>
              <Button
                onClick={collapseAll}
                variant="outline"
                size="sm"
                className="flex-1 text-xs sm:flex-none sm:text-sm"
              >
                Collapse All
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
            Showing {filteredCategories.reduce((acc, cat) => acc + cat.resources.length, 0)}{" "}
            resources
            {filterType !== "all" && ` (${filterType})`}
          </p>
        </CardContent>
      </Card>

      {/* Resource Categories */}
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:gap-4">
        {filteredCategories.map((category) => (
          <Card
            key={category.name}
            className="overflow-hidden border-indigo-200 dark:border-indigo-800"
          >
            <Collapsible
              open={openCategories.includes(category.name)}
              onOpenChange={() => toggleCategory(category.name)}
            >
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-indigo-50 sm:pb-4 hover:dark:bg-indigo-950/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 text-start">
                      <div className="mb-1 flex flex-wrap items-center gap-2 sm:mb-2">
                        <CardTitle className="flex items-center gap-2 text-base text-indigo-900 sm:text-lg dark:text-indigo-100">
                          <GraduationCap className="size-4 text-indigo-600 sm:size-5" />
                          {category.name}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className="bg-indigo-100 text-xs text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100"
                        >
                          {category.resources.length}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs sm:text-sm">
                        {category.description}
                      </CardDescription>
                    </div>
                    {openCategories.includes(category.name) ? (
                      <ChevronUp className="mt-1 size-4 shrink-0 text-indigo-600 sm:size-5" />
                    ) : (
                      <ChevronDown className="mt-1 size-4 shrink-0 text-indigo-600 sm:size-5" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="px-3 pt-0 pb-4 sm:px-6 sm:pb-6">
                  <div className="flex flex-col gap-2 sm:gap-3">
                    {category.resources.map((resource) => {
                      const IconComponent = typeIcons[resource.type] || FileText;
                      return (
                        <div
                          key={resource.url}
                          className="rounded-lg border p-2.5 transition-all hover:border-indigo-300 hover:bg-indigo-50/30 sm:p-3 hover:dark:border-indigo-700 hover:dark:bg-indigo-950/20"
                        >
                          <div className="flex flex-col gap-2 sm:gap-2.5">
                            <div className="flex items-start gap-2">
                              <IconComponent className="mt-0.5 size-4 shrink-0 text-indigo-600 sm:size-5" />
                              <div className="flex flex-wrap gap-1.5">
                                <Badge className={`${typeColors[resource.type]} text-xs`}>
                                  {resource.type}
                                </Badge>
                                {resource.isPdf && (
                                  <Badge
                                    variant="outline"
                                    className="border-red-300 text-xs text-red-600"
                                  >
                                    PDF
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-start gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 sm:text-base dark:text-indigo-400 hover:dark:text-indigo-200"
                              >
                                <span className="flex-1 wrap-break-word">{resource.title}</span>
                                <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-70 group-hover:opacity-100 sm:size-3.5" />
                              </a>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                                {resource.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <Card className="mx-auto mt-6 max-w-4xl border-indigo-200 sm:mt-8 dark:border-indigo-800">
        <Collapsible open={showLegend} onOpenChange={setShowLegend}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer pb-3 transition-colors hover:bg-indigo-50 sm:pb-4 hover:dark:bg-indigo-950/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-indigo-900 sm:text-lg dark:text-indigo-100">
                  Resource Type Legend
                </CardTitle>
                {showLegend ? (
                  <ChevronUp className="size-4 text-indigo-600 sm:size-5" />
                ) : (
                  <ChevronDown className="size-4 text-indigo-600 sm:size-5" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 sm:pb-6">
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {Object.entries(typeColors).map(([type, colorClass]) => {
                  const IconComponent = typeIcons[type] || FileText;
                  return (
                    <div key={type} className="flex items-center gap-1.5 sm:gap-2">
                      <IconComponent className="size-3.5 text-muted-foreground sm:size-4" />
                      <Badge className={`${colorClass} text-xs`}>{type}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Disclaimer */}
      <div className="mx-auto mt-4 max-w-4xl text-center sm:mt-6">
        <p className="px-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Note: All resources link to official organization websites. PDF documents are hosted by
          their respective organizations (AAPD, EAPD, IADT). Always verify you have the most current
          version of any guideline before clinical application.
        </p>
      </div>
    </PageLayout>
  );
}
