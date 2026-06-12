import { studyPlan } from "@/data/studyPlan";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { InfoBox } from "@/components/InfoBox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Target,
  Lightbulb,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { examTimeline } from "@/data/examFramework";

export default function StudyPlanPage() {
  const currentMonth = new Date().getMonth() + 1; // 1-12

  return (
    <PageLayout
      footer={
        <p>
          Remember: This is a suggested timeline. ABPD assigns each
          candidate&apos;s OCE date about six months before administration, so
          adjust pace accordingly.
        </p>
      }
    >
      <PageHeader
        title="Oral Boards Study Plan"
        subtitle="10-Month Preparation Schedule (January - October for the fall OCE cycle)"
      />

      <Navigation />

      {/* Introduction */}
      <Card className="max-w-4xl mx-auto mb-6 sm:mb-8">
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">
            How to Use This Study Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm sm:text-base text-muted-foreground">
          <p>
            This comprehensive 10-month study plan is designed to help you
            systematically prepare for the Pediatric Dentistry Oral Boards fall
            examination cycle.
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2 sm:ml-4">
            <li>
              Each month focuses on specific topics with clear goals and
              activities
            </li>
            <li>
              Use the daily case presentations on this site to reinforce monthly
              topics
            </li>
            <li>
              Adjust the pace based on your baseline knowledge and learning
              needs
            </li>
            <li>
              Join or form a study group for mock presentations and peer
              learning
            </li>
            <li>
              Review AAPD guidelines and policies regularly throughout your
              preparation
            </li>
            <li>
              Use textbooks, journals, role playing, and continuing education as
              your core prep methods
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="max-w-4xl mx-auto mb-6 sm:mb-8 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            ABPD OCE Milestones (2026 Guide)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {examTimeline.map((item) => (
            <div
              key={`${item.timeframe}-${item.milestone}`}
              className="rounded border p-3"
            >
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
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {studyPlan.map((month, index) => {
          const isCurrentMonth = month.monthNumber === currentMonth;
          const isPastMonth = month.monthNumber < currentMonth;

          return (
            <Card
              key={month.month}
              className={`overflow-hidden transition-all ${
                isCurrentMonth
                  ? "ring-2 sm:ring-4 ring-indigo-500 shadow-lg"
                  : isPastMonth
                    ? "opacity-75"
                    : ""
              }`}
            >
              {/* Month Header */}
              <div
                className={`px-4 sm:px-6 py-3 sm:py-4 ${
                  isCurrentMonth
                    ? "bg-indigo-600 text-white"
                    : isPastMonth
                      ? "bg-gray-400 text-white dark:bg-gray-600"
                      : "bg-indigo-500 text-white"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <h3 className="text-lg sm:text-2xl font-bold">
                      Month {index + 1}: {month.month}
                    </h3>
                    <p className="text-sm sm:text-lg mt-1 opacity-90">
                      {month.focus}
                    </p>
                  </div>
                  {isCurrentMonth && (
                    <Badge className="bg-white text-indigo-600 hover:bg-white self-start sm:self-auto">
                      CURRENT
                    </Badge>
                  )}
                </div>
              </div>

              {/* Month Content */}
              <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Topics */}
                <section>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                    Key Topics
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                    {month.topics.map((topic, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm sm:text-base text-muted-foreground"
                      >
                        <span className="text-indigo-600 mt-0.5 sm:mt-1">
                          •
                        </span>
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Goals */}
                <section>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    Learning Goals
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {month.goals.map((goal, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm sm:text-base text-muted-foreground"
                      >
                        <span className="text-green-600 font-bold mt-0.5 sm:mt-1">
                          ✓
                        </span>
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Activities */}
                <section>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    Study Activities
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {month.activities.map((activity, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm sm:text-base text-muted-foreground"
                      >
                        <span className="text-blue-600 mt-0.5 sm:mt-1">→</span>
                        <span>{activity}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Resources */}
                <InfoBox variant="blue" className="p-3 sm:p-4">
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    Recommended Resources
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {month.resources.map((resource, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm sm:text-base text-muted-foreground"
                      >
                        <span className="text-blue-600 mt-0.5 sm:mt-1 flex-shrink-0">
                          📚
                        </span>
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                          >
                            {resource.name}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
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
      <Card className="max-w-4xl mx-auto mt-6 sm:mt-8 border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-600" />
            Study Tips for Success
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 sm:space-y-2 text-sm sm:text-base text-muted-foreground">
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
              Seek feedback from mentors and experienced board-certified
              pediatric dentists
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-600">✓</span>
              Join professional organizations and attend conferences when
              possible
            </li>
          </ul>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
