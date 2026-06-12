"use client";

import { useState } from "react";
import CaseCard from "@/components/CaseCard";
import { getAllCases } from "@/lib/caseRotation";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { IconLabel } from "@/components/IconLabel";
import { Button } from "@agents/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@agents/ui";
import { Badge } from "@agents/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agents/ui";
import { ArrowLeft, BookOpen, Clock, ChevronRight } from "lucide-react";

export default function AllCasesPage() {
  const allCases = getAllCases();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [selectedCaseIndex, setSelectedCaseIndex] = useState<number | null>(
    null,
  );

  // Get unique categories
  const categories = [
    "all",
    ...Array.from(new Set(allCases.map((c) => c.category))),
  ];
  const difficulties = ["all", "beginner", "intermediate", "advanced"];

  // Filter cases
  const filteredCases = allCases.filter((caseData) => {
    const categoryMatch =
      selectedCategory === "all" || caseData.category === selectedCategory;
    const difficultyMatch =
      selectedDifficulty === "all" ||
      caseData.difficulty === selectedDifficulty;
    return categoryMatch && difficultyMatch;
  });

  const difficultyVariant = {
    beginner: "success",
    intermediate: "warning",
    advanced: "danger",
  } as const;

  return (
    <PageLayout
      footer={
        <p>
          Review cases across all categories to build comprehensive knowledge.
          Verify final management decisions with current ABPD/AAPD source
          documents.
        </p>
      }
    >
      <PageHeader
        title="All Study Cases"
        subtitle="Browse and study all available cases"
      />

      <Navigation />

      {selectedCaseIndex === null ? (
        <>
          {/* Filters */}
          <Card className="max-w-4xl mx-auto mb-6 sm:mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg sm:text-xl">Filter Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select
                    value={selectedCategory}
                    onValueChange={(value) => {
                      if (value) setSelectedCategory(value);
                    }}
                  >
                    <SelectTrigger>
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
                  <label className="text-sm font-medium">Difficulty</label>
                  <Select
                    value={selectedDifficulty}
                    onValueChange={(value) => {
                      if (value) setSelectedDifficulty(value);
                    }}
                  >
                    <SelectTrigger>
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
              <p className="mt-3 sm:mt-4 text-sm text-muted-foreground">
                Showing {filteredCases.length} of {allCases.length} cases
              </p>
            </CardContent>
          </Card>

          {/* Cases List */}
          <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
            {filteredCases.map((caseData) => {
              const originalIndex = allCases.indexOf(caseData);
              return (
                <Card
                  key={caseData.id}
                  className="hover:shadow-lg transition cursor-pointer active:bg-muted/50"
                  onClick={() => setSelectedCaseIndex(originalIndex)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                      <h3 className="text-lg sm:text-xl font-bold">
                        {caseData.title}
                      </h3>
                      <Badge
                        variant={difficultyVariant[caseData.difficulty]}
                        className="self-start"
                      >
                        {caseData.difficulty.charAt(0).toUpperCase() +
                          caseData.difficulty.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground mb-3">
                      <IconLabel icon={BookOpen} className="font-medium">
                        {caseData.category}
                      </IconLabel>
                      <span className="hidden sm:inline text-border">|</span>
                      <IconLabel icon={Clock}>
                        {caseData.estimatedTime} min
                      </IconLabel>
                    </div>
                    <p className="text-sm sm:text-base text-muted-foreground line-clamp-2">
                      {caseData.presentation}
                    </p>
                    <Button
                      variant="link"
                      className="mt-2 sm:mt-3 p-0 h-auto text-indigo-600 hover:text-indigo-800"
                    >
                      View Full Case <ChevronRight className="h-4 w-4 ml-1" />
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
          <div className="max-w-4xl mx-auto mb-4 sm:mb-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedCaseIndex(null)}
              className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
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
