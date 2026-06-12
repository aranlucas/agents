"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@agents/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@agents/ui";
import { Badge } from "@agents/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@agents/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agents/ui";
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
  textbook:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
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

  const allTypes = [
    "all",
    "guideline",
    "article",
    "textbook",
    "video",
    "website",
  ];

  return (
    <PageLayout
      footer={
        <>
          <p>
            Resources are regularly updated. Always verify with the latest
            official publications.
          </p>
          <p className="mt-2">
            Use these materials alongside clinical experience and mentorship for
            comprehensive preparation.
          </p>
          <p className="mt-2">
            Primary exam-policy source alignment is maintained against ABPD OCE
            documentation in this repository.
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto mb-6 sm:mb-8">
        <Card className="text-center p-3 sm:p-4">
          <p className="text-2xl sm:text-3xl font-bold text-indigo-600">
            {resourceCategories.reduce(
              (acc, cat) => acc + cat.resources.length,
              0,
            )}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Total Resources
          </p>
        </Card>
        <Card className="text-center p-3 sm:p-4">
          <p className="text-2xl sm:text-3xl font-bold text-blue-600">
            {pdfResources.length}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            PDF Documents
          </p>
        </Card>
        <Card className="text-center p-3 sm:p-4">
          <p className="text-2xl sm:text-3xl font-bold text-green-600">
            {resourceCategories.length}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Categories</p>
        </Card>
        <Card className="text-center p-3 sm:p-4">
          <p className="text-2xl sm:text-3xl font-bold text-purple-600">2026</p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Latest Updates
          </p>
        </Card>
      </div>

      {/* PDF Quick Access Section */}
      <Card className="max-w-4xl mx-auto mb-6 sm:mb-8 border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <Collapsible open={showAllPdfs} onOpenChange={setShowAllPdfs}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Download className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                      Quick Access: PDF Guidelines
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className="bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100 text-xs"
                    >
                      {pdfResources.length}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm">
                    Direct links to essential PDF documents from ABPD, AAPD,
                    EAPD, and IADT
                  </CardDescription>
                </div>
                {showAllPdfs ? (
                  <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid gap-1.5 sm:gap-2">
                {pdfResources.map((resource, index) => (
                  <a
                    key={index}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 sm:p-2.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                  >
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-muted-foreground group-hover:text-blue-600 transition-colors flex-1 line-clamp-2 sm:line-clamp-1">
                      {resource.title}
                    </span>
                    <ExternalLink className="h-3 w-3 text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Filter Section */}
      <Card className="max-w-4xl mx-auto mb-4 sm:mb-6">
        <CardHeader className="pb-3 sm:pb-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            Filter Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
            <div className="flex-1">
              <label className="text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                Resource Type
              </label>
              <Select
                value={filterType}
                onValueChange={(value) => {
                  if (value) setFilterType(value);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {allTypes.map((type) => (
                    <SelectItem key={type} value={type} className="text-sm">
                      {type === "all"
                        ? "All Types"
                        : type.charAt(0).toUpperCase() + type.slice(1)}
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
                className="flex-1 sm:flex-none text-xs sm:text-sm"
              >
                Expand All
              </Button>
              <Button
                onClick={collapseAll}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none text-xs sm:text-sm"
              >
                Collapse All
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs sm:text-sm text-muted-foreground">
            Showing{" "}
            {filteredCategories.reduce(
              (acc, cat) => acc + cat.resources.length,
              0,
            )}{" "}
            resources
            {filterType !== "all" && ` (${filterType})`}
          </p>
        </CardContent>
      </Card>

      {/* Resource Categories */}
      <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
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
                <CardHeader className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors pb-3 sm:pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2 mb-1 sm:mb-2">
                        <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
                          <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                          {category.name}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className="bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100 text-xs"
                        >
                          {category.resources.length}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs sm:text-sm">
                        {category.description}
                      </CardDescription>
                    </div>
                    {openCategories.includes(category.name) ? (
                      <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 flex-shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 sm:pb-6 px-3 sm:px-6">
                  <div className="space-y-2 sm:space-y-3">
                    {category.resources.map((resource, resourceIndex) => {
                      const IconComponent =
                        typeIcons[resource.type] || FileText;
                      return (
                        <div
                          key={resourceIndex}
                          className="border rounded-lg p-2.5 sm:p-3 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all"
                        >
                          <div className="flex flex-col gap-2 sm:gap-2.5">
                            <div className="flex items-start gap-2">
                              <IconComponent className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                              <div className="flex flex-wrap gap-1.5">
                                <Badge
                                  className={`${typeColors[resource.type]} text-xs`}
                                >
                                  {resource.type}
                                </Badge>
                                {resource.isPdf && (
                                  <Badge
                                    variant="outline"
                                    className="text-red-600 border-red-300 text-xs"
                                  >
                                    PDF
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 inline-flex items-start gap-1 group text-sm sm:text-base"
                              >
                                <span className="break-words flex-1">
                                  {resource.title}
                                </span>
                                <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0 opacity-70 group-hover:opacity-100 mt-0.5" />
                              </a>
                              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
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
      <Card className="max-w-4xl mx-auto mt-6 sm:mt-8 border-indigo-200 dark:border-indigo-800">
        <Collapsible open={showLegend} onOpenChange={setShowLegend}>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors pb-3 sm:pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base sm:text-lg text-indigo-900 dark:text-indigo-100">
                  Resource Type Legend
                </CardTitle>
                {showLegend ? (
                  <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
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
                    <div
                      key={type}
                      className="flex items-center gap-1.5 sm:gap-2"
                    >
                      <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
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
      <div className="max-w-4xl mx-auto mt-4 sm:mt-6 text-center">
        <p className="text-xs sm:text-sm text-muted-foreground px-4 leading-relaxed">
          Note: All resources link to official organization websites. PDF
          documents are hosted by their respective organizations (AAPD, EAPD,
          IADT). Always verify you have the most current version of any
          guideline before clinical application.
        </p>
      </div>
    </PageLayout>
  );
}
