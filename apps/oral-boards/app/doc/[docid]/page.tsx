import { notFound } from "next/navigation";
import { getStore } from "@/lib/search-store";
import { PageLayout } from "@/components/page-layout";
import { Navigation } from "@/components/navigation";
import DocBody from "./doc-body";

export default async function DocPage({ params }: { params: Promise<{ docid: string }> }) {
  const { docid } = await params;
  const store = getStore();

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
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {label}
          </span>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">{meta.title}</h1>
        <DocBody body={body} />
      </div>
    </PageLayout>
  );
}
