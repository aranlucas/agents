import { notFound } from "next/navigation";
import { getStore } from "@/lib/searchStore";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import DocBody from "./DocBody";

export default async function DocPage({
  params,
}: {
  params: Promise<{ docid: string }>;
}) {
  const { docid } = await params;
  const store = await getStore();

  const meta = await store.get(`#${docid}`);
  if ("error" in meta) notFound();

  const body = (await store.getDocumentBody(meta.filepath)) ?? "";

  const label =
    meta.collectionName === "abpd"
      ? "ABPD"
      : meta.collectionName === "aapd"
        ? "AAPD"
        : meta.collectionName === "cody"
          ? "Prep Course"
          : meta.collectionName;

  return (
    <PageLayout footer={<p>Source: {meta.filepath}</p>}>
      <Navigation />
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
            {label}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          {meta.title}
        </h1>
        <DocBody body={body} />
      </div>
    </PageLayout>
  );
}
