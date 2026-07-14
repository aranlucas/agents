import { studyPlan } from "@/data/study-plan";
import { PageLayout } from "@/components/page-layout";
import { Navigation } from "@/components/navigation";
import { PageHeader } from "@/components/page-header";
import { InfoBox } from "@/components/info-box";
import { Card, CardContent, CardHeader, CardTitle } from "@agents/ui";
import { Badge } from "@agents/ui";
import {
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Target,
  Lightbulb,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { examTimeline } from "@/data/exam-framework";

export default function StudyPlanPage() {
  const currentMonth = new Date().getMonth() + 1; // 1-12

  return (
    <PageLayout
      footer={
        <p>
          Remember: This is a suggested timeline. ABPD assigns each candidate&apos;s OCE date about
          six months before administration, so adjust pace accordingly.
        </p>
      }
    >
      <PageHeader
        title="Oral Boards Study Plan"
        subtitle="10-Month Preparation Schedule (January - October for the fall OCE cycle)"
      />

      <Navigation />

      {/* Introduction */}
      <Card className="mx-auto mb-6 max-w-4xl sm:mb-8">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">How to Use This Study Plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:text-base">
          <p>
            This comprehensive 10-month study plan is designed to help you systematically prepare
            for the Pediatric Dentistry Oral Boards fall examination cycle.
          </p>
          <ul className="ms-2 flex list-inside list-disc flex-col gap-2 sm:ms-4">
            <li>Each month focuses on specific topics with clear goals and activities</li>
            <li>Use the daily case presentations on this site to reinforce monthly topics</li>
            <li>Adjust the pace based on your baseline knowledge and learning needs</li>
            <li>Join or form a study group for mock presentations and peer learning</li>
            <li>Review AAPD guidelines and policies regularly throughout your preparation</li>
            <li>
              Use textbooks, journals, role playing, and continuing education as your core prep
              methods
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="mx-auto mb-6 max-w-4xl border-indigo-200 sm:mb-8 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Calendar className="size-5 text-indigo-600" />
            ABPD OCE Milestones (2026 Guide)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {examTimeline.map((item) => (
            <div key={`${item.timeframe}-${item.milestone}`} className="rounded border p-3">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {item.timeframe}
              </p>
              <p className="text-sm font-medium">{item.milestone}</p>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Study Plan Timeline */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:gap-6">
        {studyPlan.map((month, index) => {
          const isCurrentMonth = month.monthNumber === currentMonth;
          const isPastMonth = month.monthNumber < currentMonth;

          return (
            <Card
              key={month.month}
              className={`overflow-hidden transition-all ${
                isCurrentMonth
                  ? "shadow-lg ring-2 ring-indigo-500 sm:ring-4"
                  : isPastMonth
                    ? "opacity-75"
                    : ""
              }`}
            >
              {/* Month Header */}
              <div
                className={`px-4 py-3 sm:px-6 sm:py-4 ${
                  isCurrentMonth
                    ? "bg-indigo-600 text-white"
                    : isPastMonth
                      ? "bg-gray-400 text-white dark:bg-gray-600"
                      : "bg-indigo-500 text-white"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold sm:text-2xl">
                      Month {index + 1}: {month.month}
                    </h3>
                    <p className="mt-1 text-sm opacity-90 sm:text-lg">{month.focus}</p>
                  </div>
                  {isCurrentMonth && (
                    <Badge className="self-start bg-white text-indigo-600 sm:self-auto">
                      CURRENT
                    </Badge>
                  )}
                </div>
              </div>

              {/* Month Content */}
              <CardContent className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
                {/* Topics */}
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-base font-semibold sm:mb-3 sm:text-lg">
                    <Target className="size-4 text-indigo-600 sm:size-5" />
                    Key Topics
                  </h4>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                    {month.topics.map((topic) => (
                      <li
                        key={topic}
                        className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base"
                      >
                        <span className="mt-0.5 text-indigo-600 sm:mt-1">•</span>
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Goals */}
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-base font-semibold sm:mb-3 sm:text-lg">
                    <CheckCircle2 className="size-4 text-green-600 sm:size-5" />
                    Learning Goals
                  </h4>
                  <ul className="flex flex-col gap-1.5 sm:gap-2">
                    {month.goals.map((goal) => (
                      <li
                        key={goal}
                        className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base"
                      >
                        <span className="mt-0.5 font-bold text-green-600 sm:mt-1">✓</span>
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Activities */}
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-base font-semibold sm:mb-3 sm:text-lg">
                    <ArrowRight className="size-4 text-blue-600 sm:size-5" />
                    Study Activities
                  </h4>
                  <ul className="flex flex-col gap-1.5 sm:gap-2">
                    {month.activities.map((activity) => (
                      <li
                        key={activity}
                        className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base"
                      >
                        <span className="mt-0.5 text-blue-600 sm:mt-1">→</span>
                        <span>{activity}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Resources */}
                <InfoBox variant="blue" className="p-3 sm:p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-base font-semibold sm:mb-3 sm:text-lg">
                    <BookOpen className="size-4 text-blue-600 sm:size-5" />
                    Recommended Resources
                  </h4>
                  <ul className="flex flex-col gap-1.5 sm:gap-2">
                    {month.resources.map((resource) => (
                      <li
                        key={resource.name}
                        className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base"
                      >
                        <span className="mt-0.5 shrink-0 text-blue-600 sm:mt-1">📚</span>
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 hover:dark:text-blue-300"
                          >
                            {resource.name}
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ) : (
                          <span>{resource.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </InfoBox>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer Tips */}
      <Card className="mx-auto mt-6 max-w-4xl border-2 border-yellow-300 bg-yellow-50/50 sm:mt-8 dark:border-yellow-700 dark:bg-yellow-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Lightbulb className="size-5 text-yellow-600" />
            Study Tips for Success
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:gap-2 sm:text-base">
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Consistency is key - study a little every day rather than cramming
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Practice case presentations out loud to build confidence
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Focus on understanding concepts, not just memorizing facts
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Use active recall and spaced repetition techniques
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Take care of your physical and mental health during preparation
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Seek feedback from mentors and experienced board-certified pediatric dentists
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Join professional organizations and attend conferences when possible
            </li>
          </ul>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
