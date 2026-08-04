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
  /**
   * Apify'nin Maps verisinden doğrudan döndürebildiği e-posta (enrichment kapalıyken genelde boş).
   * Adım 6'daki EmailDraft ile karışmaması için "mapsEmail" adlandırıldı.
   */
  mapsEmail?: string;
  rating: number;
  reviewsCount: number;
  mapsUrl: string;
  description: string;
}

// Adım 3/4: Jina.ai Reader ile kazınan web sitesi içeriği (artık HERKES için Adım 3'te toplanır)
export interface WebScrapeResult {
  url: string;
  title: string;
  markdown: string;
  emails: string[];
}

// Adım 3: Router sonrası ölçek etiketi
export type CompanyScale = "large" | "small";

export interface RoutedLead extends MapsLead {
  scale: CompanyScale;
  /**
   * Gemini'nin ürettiği 0-100 arası kurumsallık skoru. Web sitesi olmadığı için skorlama
   * yapılamayan (direkt "small" kabul edilen) lead'lerde undefined kalır.
   */
  corporateScore?: number;
  /** Adım 3'te toplanan zengin web sitesi bağlamı; Adım 4/5'e olduğu gibi taşınır. */
  webScrape?: WebScrapeResult;
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

// Adım 4 birleşik çıktı: "large" için linkedin dolu olur, webScrape zaten Adım 3'ten miras gelir
export interface EnrichedLead extends RoutedLead {
  linkedin?: LinkedInDecisionMaker;
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
