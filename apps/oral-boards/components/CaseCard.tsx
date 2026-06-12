"use client";

import { useState } from "react";
import { Case } from "@/types/case";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { InfoBox } from "@/components/InfoBox";
import { IconLabel } from "@/components/IconLabel";
import { ChevronDown, ChevronUp, BookOpen, Clock } from "lucide-react";

interface CaseCardProps {
  case: Case;
}

export default function CaseCard({ case: caseData }: CaseCardProps) {
  const [showModelResponse, setShowModelResponse] = useState(false);

  const difficultyVariant = {
    beginner: "success",
    intermediate: "warning",
    advanced: "danger",
  } as const;

  return (
    <Card className="max-w-4xl mx-auto shadow-lg">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl">
            {caseData.title}
          </CardTitle>
          <Badge
            variant={difficultyVariant[caseData.difficulty]}
            className="self-start"
          >
            {caseData.difficulty.charAt(0).toUpperCase() +
              caseData.difficulty.slice(1)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <IconLabel icon={BookOpen} className="font-medium">
            {caseData.category}
          </IconLabel>
          <span className="hidden sm:inline text-border">|</span>
          <IconLabel icon={Clock}>{caseData.estimatedTime} min</IconLabel>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 sm:space-y-6">
        {/* Case Presentation */}
        <section className="space-y-2 sm:space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold">
            Case Presentation
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {caseData.presentation}
          </p>
        </section>

        {/* Clinical Findings */}
        {caseData.clinicalFindings && caseData.clinicalFindings.length > 0 && (
          <section className="space-y-2 sm:space-y-3">
            <h3 className="text-base sm:text-lg font-semibold">
              Clinical Findings
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm sm:text-base text-muted-foreground">
              {caseData.clinicalFindings.map((finding, index) => (
                <li key={index}>{finding}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Radiographic Findings */}
        {caseData.radiographicFindings &&
          caseData.radiographicFindings.length > 0 && (
            <section className="space-y-2 sm:space-y-3">
              <h3 className="text-base sm:text-lg font-semibold">
                Radiographic Findings
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm sm:text-base text-muted-foreground">
                {caseData.radiographicFindings.map((finding, index) => (
                  <li key={index}>{finding}</li>
                ))}
              </ul>
            </section>
          )}

        {/* Questions */}
        <section className="space-y-2 sm:space-y-3">
          <h3 className="text-base sm:text-lg font-semibold">
            Questions to Consider
          </h3>
          <ol className="list-decimal list-inside space-y-1.5 sm:space-y-2 text-sm sm:text-base text-muted-foreground">
            {caseData.questions.map((question, index) => (
              <li key={index} className="font-medium">
                {question}
              </li>
            ))}
          </ol>
        </section>

        {/* Reference Materials */}
        <InfoBox variant="blue" className="space-y-2 sm:space-y-3">
          <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            Reference Materials
          </h3>
          <div className="space-y-2">
            {caseData.references.map((ref, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5 sm:mt-1 text-sm sm:text-base">
                  📚
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm sm:text-base text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 break-words"
                  >
                    {ref.title}
                  </a>
                  <Badge variant="outline" className="ml-1 sm:ml-2 text-xs">
                    {ref.type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </InfoBox>

        {/* Model Response Collapsible */}
        <Collapsible
          open={showModelResponse}
          onOpenChange={setShowModelResponse}
        >
          <CollapsibleTrigger asChild>
            <Button
              className="w-full h-12 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"
              size="lg"
            >
              {showModelResponse ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Hide Model Response
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Present Model Response
                </>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
            <Card className="border-2 border-indigo-200 dark:border-indigo-800 bg-muted/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl text-indigo-900 dark:text-indigo-100">
                  Model Response
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                {/* Diagnosis */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold">
                    Diagnosis
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground font-medium">
                    {caseData.modelResponse.diagnosis}
                  </p>
                </section>

                {/* Differential Diagnosis */}
                {caseData.modelResponse.differentialDiagnosis &&
                  caseData.modelResponse.differentialDiagnosis.length > 0 && (
                    <section className="space-y-1.5 sm:space-y-2">
                      <h3 className="text-base sm:text-lg font-semibold">
                        Differential Diagnosis
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-sm sm:text-base text-muted-foreground">
                        {caseData.modelResponse.differentialDiagnosis.map(
                          (diff, index) => (
                            <li key={index}>{diff}</li>
                          ),
                        )}
                      </ul>
                    </section>
                  )}

                {/* Treatment Plan */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold">
                    Treatment Plan
                  </h3>
                  <ol className="list-decimal list-inside space-y-1 text-sm sm:text-base text-muted-foreground">
                    {caseData.modelResponse.treatmentPlan.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </section>

                {/* Rationale */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold">
                    Rationale
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {caseData.modelResponse.rationale}
                  </p>
                </section>

                {/* Key Points */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base sm:text-lg font-semibold">
                    Key Points to Remember
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-sm sm:text-base text-muted-foreground">
                    {caseData.modelResponse.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </section>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
