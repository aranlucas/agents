"use client";

import { useState } from "react";
import { Case } from "@/types/case";
import { Card, CardContent, CardHeader, CardTitle } from "@agents/ui";
import { Badge } from "@agents/ui";
import { buttonVariants } from "@agents/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@agents/ui";
import { InfoBox } from "@/components/info-box";
import { IconLabel } from "@/components/icon-label";
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
    <Card className="mx-auto max-w-4xl shadow-lg">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl">{caseData.title}</CardTitle>
          <Badge variant={difficultyVariant[caseData.difficulty]} className="self-start">
            {caseData.difficulty.charAt(0).toUpperCase() + caseData.difficulty.slice(1)}
          </Badge>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs sm:gap-4 sm:text-sm">
          <IconLabel icon={BookOpen} className="font-medium">
            {caseData.category}
          </IconLabel>
          <span className="text-border hidden sm:inline">|</span>
          <IconLabel icon={Clock}>{caseData.estimatedTime} min</IconLabel>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 sm:space-y-6">
        {/* Case Presentation */}
        <section className="space-y-2 sm:space-y-3">
          <h2 className="text-lg font-semibold sm:text-xl">Case Presentation</h2>
          <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
            {caseData.presentation}
          </p>
        </section>

        {/* Clinical Findings */}
        {caseData.clinicalFindings && caseData.clinicalFindings.length > 0 && (
          <section className="space-y-2 sm:space-y-3">
            <h3 className="text-base font-semibold sm:text-lg">Clinical Findings</h3>
            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm sm:text-base">
              {caseData.clinicalFindings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Radiographic Findings */}
        {caseData.radiographicFindings && caseData.radiographicFindings.length > 0 && (
          <section className="space-y-2 sm:space-y-3">
            <h3 className="text-base font-semibold sm:text-lg">Radiographic Findings</h3>
            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm sm:text-base">
              {caseData.radiographicFindings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Questions */}
        <section className="space-y-2 sm:space-y-3">
          <h3 className="text-base font-semibold sm:text-lg">Questions to Consider</h3>
          <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm sm:space-y-2 sm:text-base">
            {caseData.questions.map((question) => (
              <li key={question} className="font-medium">
                {question}
              </li>
            ))}
          </ol>
        </section>

        {/* Reference Materials */}
        <InfoBox variant="blue" className="space-y-2 sm:space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <BookOpen className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
            Reference Materials
          </h3>
          <div className="space-y-2">
            {caseData.references.map((ref) => (
              <div key={ref.url} className="flex items-start gap-2">
                <span className="mt-0.5 text-sm text-blue-600 sm:mt-1 sm:text-base">📚</span>
                <div className="min-w-0 flex-1">
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium break-words text-blue-600 underline underline-offset-2 hover:text-blue-800 sm:text-base"
                  >
                    {ref.title}
                  </a>
                  <Badge variant="outline" className="ml-1 text-xs sm:ml-2">
                    {ref.type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </InfoBox>

        {/* Model Response Collapsible */}
        <Collapsible open={showModelResponse} onOpenChange={setShowModelResponse}>
          <CollapsibleTrigger
            className={buttonVariants({
              size: "lg",
              className:
                "w-full h-12 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800",
            })}
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
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
            <Card className="bg-muted/30 border-2 border-indigo-200 dark:border-indigo-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl text-indigo-900 sm:text-2xl dark:text-indigo-100">
                  Model Response
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                {/* Diagnosis */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base font-semibold sm:text-lg">Diagnosis</h3>
                  <p className="text-muted-foreground text-sm font-medium sm:text-base">
                    {caseData.modelResponse.diagnosis}
                  </p>
                </section>

                {/* Differential Diagnosis */}
                {caseData.modelResponse.differentialDiagnosis &&
                  caseData.modelResponse.differentialDiagnosis.length > 0 && (
                    <section className="space-y-1.5 sm:space-y-2">
                      <h3 className="text-base font-semibold sm:text-lg">Differential Diagnosis</h3>
                      <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm sm:text-base">
                        {caseData.modelResponse.differentialDiagnosis.map((diff) => (
                          <li key={diff}>{diff}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                {/* Treatment Plan */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base font-semibold sm:text-lg">Treatment Plan</h3>
                  <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm sm:text-base">
                    {caseData.modelResponse.treatmentPlan.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>

                {/* Rationale */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base font-semibold sm:text-lg">Rationale</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
                    {caseData.modelResponse.rationale}
                  </p>
                </section>

                {/* Key Points */}
                <section className="space-y-1.5 sm:space-y-2">
                  <h3 className="text-base font-semibold sm:text-lg">Key Points to Remember</h3>
                  <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm sm:text-base">
                    {caseData.modelResponse.keyPoints.map((point) => (
                      <li key={point}>{point}</li>
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
