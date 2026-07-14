"use client";

import { useState } from "react";
import CaseCard from "@/components/case-card";
import { getAllCases } from "@/lib/case-rotation";
import { PageLayout } from "@/components/page-layout";
import { Navigation } from "@/components/navigation";
import { PageHeader } from "@/components/page-header";
import { IconLabel } from "@/components/icon-label";
import { Button } from "@agents/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@agents/ui";
import { Badge } from "@agents/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agents/ui";
import { ArrowLeft, BookOpen, Clock, ChevronRight } from "lucide-react";

export default function AllCasesPage() {
  const allCases = getAllCases();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedCaseIndex, setSelectedCaseIndex] = useState<number | null>(null);

  // Get unique categories
  const categories = ["all", ...Array.from(new Set(allCases.map((c) => c.category)))];
  const difficulties = ["all", "beginner", "intermediate", "advanced"];

  // Filter cases
  const filteredCases = allCases.filter((caseData) => {
    const categoryMatch = selectedCategory === "all" || caseData.category === selectedCategory;
    const difficultyMatch =
      selectedDifficulty === "all" || caseData.difficulty === selectedDifficulty;
    return categoryMatch && difficultyMatch;
  });

  const difficultyVariant = {
    beginner: "default",
    intermediate: "link",
    advanced: "destructive",
  } as const;

  return (
    <PageLayout
      footer={
        <p>
          Review cases across all categories to build comprehensive knowledge. Verify final
          management decisions with current ABPD/AAPD source documents.
        </p>
      }
    >
      <PageHeader title="All Study Cases" subtitle="Browse and study all available cases" />

      <Navigation />

      {selectedCaseIndex === null ? (
        <>
          {/* Filters */}
          <Card className="mx-auto mb-6 max-w-4xl sm:mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg sm:text-xl">Filter Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-medium">Category</span>
                  <Select
                    value={selectedCategory}
                    onValueChange={(value) => setSelectedCategory(value ?? "all")}
                  >
                    <SelectTrigger aria-label="Category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat === "all" ? "All Categories" : cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <span className="text-sm font-medium">Difficulty</span>
                  <Select
                    value={selectedDifficulty}
                    onValueChange={(value) => setSelectedDifficulty(value ?? "all")}
                  >
                    <SelectTrigger aria-label="Difficulty">
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      {difficulties.map((diff) => (
                        <SelectItem key={diff} value={diff}>
                          {diff === "all"
                            ? "All Difficulties"
                            : diff.charAt(0).toUpperCase() + diff.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-muted-foreground mt-3 text-sm sm:mt-4">
                Showing {filteredCases.length} of {allCases.length} cases
              </p>
            </CardContent>
          </Card>

          {/* Cases List */}
          <div className="mx-auto max-w-4xl space-y-3 sm:space-y-4">
            {filteredCases.map((caseData) => {
              const originalIndex = allCases.indexOf(caseData);
              return (
                <Card
                  key={caseData.id}
                  className="active:bg-muted/50 cursor-pointer transition hover:shadow-lg"
                  onClick={() => setSelectedCaseIndex(originalIndex)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="text-lg font-bold sm:text-xl">{caseData.title}</h3>
                      <Badge
                        variant={difficultyVariant[caseData.difficulty]}
                        className="self-start"
                      >
                        {caseData.difficulty.charAt(0).toUpperCase() + caseData.difficulty.slice(1)}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-2 text-xs sm:gap-4 sm:text-sm">
                      <IconLabel icon={BookOpen} className="font-medium">
                        {caseData.category}
                      </IconLabel>
                      <span className="text-border hidden sm:inline">|</span>
                      <IconLabel icon={Clock}>{caseData.estimatedTime} min</IconLabel>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm sm:text-base">
                      {caseData.presentation}
                    </p>
                    <Button
                      variant="link"
                      className="mt-2 h-auto p-0 text-indigo-600 hover:text-indigo-800 sm:mt-3"
                    >
                      View Full Case <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Back Button */}
          <div className="mx-auto mb-4 max-w-4xl sm:mb-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedCaseIndex(null)}
              className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-950"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to All Cases
            </Button>
          </div>

          {/* Selected Case */}
          <CaseCard case={allCases[selectedCaseIndex]} />
        </>
      )}
    </PageLayout>
  );
}
