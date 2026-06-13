"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@agents/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agents/ui";
import { Badge } from "@agents/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@agents/ui";
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  Calendar,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";
import {
  domains,
  examOverview,
  examPhases,
  examTimeline,
  needToKnowInfo,
  scoringCriteria,
  afterTestPolicies,
  preparationStrategies,
} from "@/data/examFramework";

export default function ExamFramework() {
  const [openDomains, setOpenDomains] = useState<string[]>([]);

  const toggleDomain = (domainId: string) => {
    setOpenDomains((prev) =>
      prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId],
    );
  };

  const expandAll = () => {
    setOpenDomains(domains.map((d) => d.id));
  };

  const collapseAll = () => {
    setOpenDomains([]);
  };

  return (
    <PageLayout
      footer={
        <>
          <p>
            This page is aligned to the ABPD 2026 Oral Clinical Examination Guide (updated February
            2026).
          </p>
          <p className="mt-2">
            Always verify details against the most recent ABPD candidate communications.
          </p>
        </>
      }
    >
      <PageHeader
        title="ABPD Oral Clinical Examination Framework"
        subtitle="2026 guide-aligned structure, blueprint, and candidate policies"
      />

      <Navigation />

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <BookOpen className="h-5 w-5" />
            Examination Overview
          </CardTitle>
          <CardDescription>{examOverview.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            <li>Format: {examOverview.structure.format}</li>
            <li>Sessions: {examOverview.structure.sessions}</li>
            <li>Candidate Time at Center: {examOverview.structure.timing}</li>
            <li>Language: {examOverview.structure.language}</li>
          </ul>
          <p className="text-muted-foreground text-xs font-medium">{examOverview.sourceNote}</p>
        </CardContent>
      </Card>

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <Calendar className="h-5 w-5" />
            ABPD OCE Timeline
          </CardTitle>
          <CardDescription>Milestones published in the 2026 OCE guide</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {examTimeline.map((item) => (
            <div key={item.timeframe + item.milestone} className="rounded-md border p-3">
              <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                {item.timeframe}
              </p>
              <p className="text-sm font-medium">{item.milestone}</p>
              <p className="text-muted-foreground text-sm">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-indigo-900 dark:text-indigo-100">OCE Lifecycle</CardTitle>
          <CardDescription>How ABPD frames the candidate journey</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {examPhases.map((phase) => (
            <div key={phase.phase} className="border-l-4 border-indigo-600 pl-4">
              <h3 className="mb-1 font-bold text-indigo-900 dark:text-indigo-100">
                {phase.phase}: {phase.title}
              </h3>
              <p className="text-muted-foreground mb-2 text-sm">{phase.description}</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                {phase.keyFocus.map((focus, idx) => (
                  <li key={idx}>{focus}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <ShieldAlert className="h-5 w-5" />
            Need to Know Information
          </CardTitle>
          <CardDescription>Operational and integrity requirements for candidates</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {needToKnowInfo.map((section) => (
            <div key={section.title} className="rounded-md border p-3">
              <h3 className="mb-2 font-semibold text-indigo-900 dark:text-indigo-100">
                {section.title}
              </h3>
              <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                {section.details.map((detail, idx) => (
                  <li key={idx}>{detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
            <ClipboardCheck className="h-5 w-5" />
            Scoring and Results
          </CardTitle>
          <CardDescription>Published ABPD OCE scoring scale and post-exam policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 dark:bg-indigo-950">
                <tr>
                  <th className="p-2 text-left font-semibold">Score</th>
                  <th className="p-2 text-left font-semibold">ABPD Descriptor</th>
                </tr>
              </thead>
              <tbody>
                {scoringCriteria.map((item) => (
                  <tr key={item.score} className="border-t">
                    <td className="p-2 font-semibold">{item.score}</td>
                    <td className="text-muted-foreground p-2">{item.descriptor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            {afterTestPolicies.map((policy, idx) => (
              <li key={idx}>{policy}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-indigo-900 dark:text-indigo-100">
            ABPD Test Preparation Strategies
          </CardTitle>
          <CardDescription>
            Guide-recommended approaches (no single required method)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            {preparationStrategies.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="mb-4 flex justify-center gap-2">
        <Button onClick={expandAll} variant="outline" size="sm">
          Expand All Domains
        </Button>
        <Button onClick={collapseAll} variant="outline" size="sm">
          Collapse All
        </Button>
      </div>

      <div className="mb-6 space-y-4">
        <h2 className="mb-4 text-center text-2xl font-bold text-indigo-900 dark:text-indigo-100">
          {domains.length} OCE Blueprint Domains
        </h2>

        {domains.map((domain) => (
          <Card key={domain.id} className="border-indigo-200 dark:border-indigo-800">
            <Collapsible
              open={openDomains.includes(domain.id)}
              onOpenChange={() => toggleDomain(domain.id)}
            >
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 text-left">
                      <div className="mb-2 flex items-center gap-2">
                        <CardTitle className="text-indigo-900 dark:text-indigo-100">
                          {domain.name}
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className="bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100"
                        >
                          {domain.weight}
                        </Badge>
                      </div>
                      <CardDescription>{domain.description}</CardDescription>
                    </div>
                    {openDomains.includes(domain.id) ? (
                      <ChevronUp className="ml-2 h-5 w-5 flex-shrink-0 text-indigo-600" />
                    ) : (
                      <ChevronDown className="ml-2 h-5 w-5 flex-shrink-0 text-indigo-600" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <div>
                    <h4 className="mb-2 font-semibold text-indigo-900 dark:text-indigo-100">
                      Key Components
                    </h4>
                    <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                      {domain.keyComponents.map((component, idx) => (
                        <li key={idx}>{component}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="mb-2 font-semibold text-indigo-900 dark:text-indigo-100">
                      Clinical Tasks
                    </h4>
                    <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                      {domain.clinicalTasks.map((task, idx) => (
                        <li key={idx}>{task}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="mb-2 font-semibold text-indigo-900 dark:text-indigo-100">
                      Proficiency Descriptors
                    </h4>
                    <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                      {domain.proficiencyDescriptors.map((descriptor, idx) => (
                        <li key={idx}>{descriptor}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </PageLayout>
  );
}
