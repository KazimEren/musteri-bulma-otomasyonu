// Adım 1: Dinamik Proje Analizi çıktısı
export interface ProjectAnalysis {
  sectors: string[];
  keywords: string[];
  locations: string[];
}

// Adım 2: Google Maps'ten (Apify) gelen ham/temizlenmiş lead
export interface MapsLead {
  placeId: string;
  title: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewsCount: number;
  mapsUrl: string;
  description: string;
}

// Adım 3: Router sonrası ölçek etiketi
export type CompanyScale = "large" | "small";

export interface RoutedLead extends MapsLead {
  scale: CompanyScale;
}

// Adım 4a: LinkedIn hattı çıktısı
export interface LinkedInDecisionMaker {
  fullName: string;
  firstName: string;
  title: string;
  profileUrl: string;
  email?: string;
  profileData: Record<string, unknown>;
  companyData: Record<string, unknown>;
}

// Adım 4b: Web scraper (Jina) hattı çıktısı
export interface WebScrapeResult {
  url: string;
  title: string;
  markdown: string;
  emails: string[];
}

// Adım 4 birleşik çıktı: hangi hat kullanıldıysa onun verisi dolu olur
export interface EnrichedLead extends RoutedLead {
  linkedin?: LinkedInDecisionMaker;
  webScrape?: WebScrapeResult;
}

// Adım 5: DIGITAL DETECTIVE analiz çıktısı
export interface LeadAnalysis {
  profileSummary: string;
  problemSolutionPitch: string; // 2-3 satırlık firmaya özel sorun-çözüm analizi
  confidence: "CONFIRMED" | "STRONGLY_SUSPECTED" | "PROBABLE" | "SPECULATIVE";
}

export interface AnalyzedLead extends EnrichedLead {
  analysis: LeadAnalysis;
}

// Adım 6: Gmail taslak çıktısı
export interface EmailDraft {
  subject: string;
  body: string;
}

export interface FinalizedLead extends AnalyzedLead {
  email: EmailDraft;
  gmailDraftId: string;
}

// Pipeline job giriş verisi (kullanıcının girdiği proje açıklaması)
export interface PipelineJobInput {
  projectDescription: string;
  maxResultsPerLocation?: number;
  /** Kullanıcı arayüzden doğrudan hedef sektör belirtmek isterse Adım 1'in LLM analizine yön verir. */
  targetSectorHint?: string;
  /** Kullanıcı arayüzden doğrudan hedef lokasyon belirtmek isterse Adım 1'in LLM analizine yön verir. */
  targetLocationHint?: string;
  /** Sadece belirli ölçekteki lead'ler işlensin istenirse (varsayılan: ikisi de). */
  scaleFilter?: CompanyScale | "all";
}

export interface PipelineJobResult {
  totalLeadsFound: number;
  totalLeadsMatchingScale: number;
  totalDraftsCreated: number;
  leads: FinalizedLead[];
}
