import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SitePreviewView } from "@/components/dev/SitePreviewView";
import { fetchPublishedPreview, publishSitePreviews, readPreviewHandoff } from "@/lib/dev/previewPublish";
import { getDB } from "@/lib/store";
import { pageHead } from "@/lib/head";
import type { SitePreview } from "@/lib/types";

export const Route = createFileRoute("/v/$slug")({
  ssr: false,
  head: ({ params }) => {
    const preview =
      getDB().sitePreviews?.find((p) => p.slug === params.slug)
      ?? readPreviewHandoff(params.slug);
    return pageHead(preview?.name ?? "Prévia", preview?.tagline ?? "Prévia de site Info Tech");
  },
  component: PublicPreviewPage,
});

function PublicPreviewPage() {
  const { slug } = Route.useParams();
  const [preview, setPreview] = useState<SitePreview | null>(() =>
    getDB().sitePreviews?.find((p) => p.slug === slug) ?? readPreviewHandoff(slug) ?? null,
  );
  const [loading, setLoading] = useState(!preview);

  useEffect(() => {
    let alive = true;
    const local = getDB().sitePreviews?.find((p) => p.slug === slug) ?? readPreviewHandoff(slug);
    if (local) {
      setPreview(local);
      setLoading(false);
      void publishSitePreviews([local]);
    } else {
      setLoading(true);
    }

    fetchPublishedPreview(slug).then((row) => {
      if (!alive) return;
      if (row) setPreview(row);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">Carregando prévia… Se for a primeira vez, o servidor pode levar alguns segundos para acordar.</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Prévia não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este link ainda não foi publicado. Em IA → Prévia de sites use “Publicar &amp; abrir” ou “Publicar todas no /v/”.
            Link do cliente: https://helenaata.vercel.app/v/{slug}
          </p>
        </div>
      </div>
    );
  }
  return <SitePreviewView preview={preview} />;
}
