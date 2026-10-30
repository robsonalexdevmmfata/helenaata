import { createFileRoute } from "@tanstack/react-router";
import { SitePreviewView } from "@/components/dev/SitePreviewView";
import { getDB } from "@/lib/store";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/v/$slug")({
  ssr: false,
  head: ({ params }) => {
    const preview = getDB().sitePreviews?.find((p) => p.slug === params.slug);
    return pageHead(preview?.name ?? "Prévia", preview?.tagline ?? "Prévia de site Info Tech");
  },
  component: PublicPreviewPage,
});

function PublicPreviewPage() {
  const { slug } = Route.useParams();
  const preview = getDB().sitePreviews?.find((p) => p.slug === slug);
  if (!preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Prévia não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este link ainda não foi gerado neste aparelho, ou o slug está incorreto.</p>
        </div>
      </div>
    );
  }
  return <SitePreviewView preview={preview} />;
}
