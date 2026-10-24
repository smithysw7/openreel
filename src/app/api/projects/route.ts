import { listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return Response.json({
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      logline: p.logline,
      aspect: p.aspect,
      updatedAt: p.updatedAt,
      hasActor: Boolean(p.actor),
      readyShots: p.shots.filter((s) => s.status === "ready").length,
      totalShots: p.shots.length,
      hasFilm: Boolean(p.filmPath),
    })),
  });
}
