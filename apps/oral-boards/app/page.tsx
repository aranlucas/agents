import CaseCard from "@/components/CaseCard";
import { getCaseOfDay } from "@/lib/caseRotation";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";

export default function Home() {
  const todaysCase = getCaseOfDay();

  return (
    <PageLayout
      footer={
        <>
          <p>
            A new case is presented daily. Review reference materials before
            revealing the model response.
          </p>
          <p className="mt-2">
            Exam preparation tool - not a substitute for comprehensive study and
            clinical experience.
          </p>
          <p className="mt-2">
            Exam-policy pages are aligned to ABPD source documentation; clinical
            guidance links map to AAPD and related guideline sources.
          </p>
        </>
      }
    >
      <PageHeader
        title="Pediatric Dentistry Oral Boards Study"
        subtitle="Daily case presentations to prepare for your board examination"
      />

      <Navigation />

      <div className="text-center mb-4 sm:mb-6">
        <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm">
          <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" />
          Case of the Day -{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Badge>
      </div>

      <CaseCard case={todaysCase} />
    </PageLayout>
  );
}
