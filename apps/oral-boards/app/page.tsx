import CaseCard from "@/components/case-card";
import { getCaseOfDay } from "@/lib/case-rotation";
import { PageLayout } from "@/components/page-layout";
import { Navigation } from "@/components/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@agents/ui";
import { Calendar } from "lucide-react";

export default function Home() {
  const todaysCase = getCaseOfDay();

  return (
    <PageLayout
      footer={
        <>
          <p>
            A new case is presented daily. Review reference materials before revealing the model
            response.
          </p>
          <p className="mt-2">
            Exam preparation tool - not a substitute for comprehensive study and clinical
            experience.
          </p>
          <p className="mt-2">
            Exam-policy pages are aligned to ABPD source documentation; clinical guidance links map
            to AAPD and related guideline sources.
          </p>
        </>
      }
    >
      <PageHeader
        title="Pediatric Dentistry Oral Boards Study"
        subtitle="Daily case presentations to prepare for your board examination"
      />

      <Navigation />

      <div className="mb-4 text-center sm:mb-6">
        <Badge className="bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 sm:px-4 sm:py-2 sm:text-sm">
          <Calendar className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
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
