import { PROJECTS_TABLE, supabase } from "./supabase.service.js";
import type { PipelineJobInput, SearchProject } from "../types/index.js";

interface SearchProjectRow {
  id: string;
  project_description: string;
  target_sector_hint: string | null;
  target_location_hint: string | null;
  scale_filter: string;
  max_results_per_location: number | null;
  created_at: string;
}

function fromRow(row: SearchProjectRow): SearchProject {
  return {
    id: row.id,
    projectDescription: row.project_description,
    targetSectorHint: row.target_sector_hint,
    targetLocationHint: row.target_location_hint,
    scaleFilter: row.scale_filter as SearchProject["scaleFilter"],
    maxResultsPerLocation: row.max_results_per_location,
    createdAt: row.created_at,
  };
}

/**
 * Her /pipeline çağrısında arama girdisini kaydeder; "Geçmiş Projelerim" dropdown'ını besler.
 * Supabase'e yazım başarısız olursa pipeline'ı engellemez, sadece loglar (bkz. step5-analysis.ts'teki
 * saveLeadAnalysis ile aynı dayanıklılık deseni).
 */
export async function saveSearchProject(input: PipelineJobInput): Promise<void> {
  const { error } = await supabase.from(PROJECTS_TABLE).insert({
    project_description: input.projectDescription,
    target_sector_hint: input.targetSectorHint ?? null,
    target_location_hint: input.targetLocationHint ?? null,
    scale_filter: input.scaleFilter ?? "all",
    max_results_per_location: input.maxResultsPerLocation ?? null,
  });

  if (error) {
    throw new Error(`Arama geçmişi kaydedilemedi: ${error.message}`);
  }
}

const RECENT_PROJECTS_LIMIT = 20;

/** "Geçmiş Projelerim" dropdown'ı için en son aramaları döner (en yeni önce). */
export async function listRecentSearchProjects(): Promise<SearchProject[]> {
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_PROJECTS_LIMIT);

  if (error) {
    throw new Error(`Arama geçmişi okunamadı: ${error.message}`);
  }

  return (data as SearchProjectRow[]).map(fromRow);
}
