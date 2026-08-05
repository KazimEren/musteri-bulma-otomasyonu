import ExcelJS from "exceljs";
import type { FinalizedLead, PipelineJobResult } from "../types/index.js";

const TIER_LABELS: Record<FinalizedLead["tier"], string> = {
  1: "Tier 1 — Kesin Büyük Ölçek",
  2: "Tier 2 — Potansiyel Büyük/Güçlü KOBİ",
  3: "Tier 3 — Sağlıklı Küçük İşletme",
};

function formatEmailDraft(lead: FinalizedLead): string {
  if (!lead.email) return "";
  return `Konu: ${lead.email.subject}\n\n${lead.email.body}`;
}

/**
 * Adım 6 (Excel çıktısı): pipeline sonucunu istenen sütunlarla bir .xlsx çalışma kitabına dönüştürür.
 * 6. sütun (Özel E-Posta Taslağı) sadece en az bir lead'in e-posta taslağı varsa eklenir
 * ("excel_full" ya da "draft" çıktısı) — outputType yerine gerçek veriye bakılır, tutarsızlığa açık değildir.
 */
export function buildLeadsWorkbook(result: PipelineJobResult): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Müşteri Bulma Otomasyonu";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Lead Listesi", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const includeEmailDraft = result.leads.some((lead) => lead.email);

  worksheet.columns = [
    { header: "Şirket Ölçeği (Tier)", key: "scale", width: 30 },
    { header: "Şirket Adı", key: "companyName", width: 32 },
    { header: "Şirket Web Sitesi", key: "website", width: 32 },
    { header: "E-Posta Adresi", key: "email", width: 28 },
    { header: "Şirketin Yaptığı İş", key: "business", width: 48 },
    { header: "Şirkete Nasıl Bir İş Yapabiliriz?", key: "pitch", width: 48 },
    ...(includeEmailDraft ? [{ header: "Özel E-Posta Taslağı", key: "emailDraft", width: 60 }] : []),
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E5EC" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (const lead of result.leads) {
    const row = worksheet.addRow({
      scale: TIER_LABELS[lead.tier],
      companyName: lead.title,
      website: lead.website,
      email: lead.contactEmail,
      business: lead.analysis.profileSummary,
      pitch: lead.analysis.problemSolutionPitch,
      ...(includeEmailDraft ? { emailDraft: formatEmailDraft(lead) } : {}),
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  return workbook;
}
