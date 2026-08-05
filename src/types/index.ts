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

/**
 * 4 kademeli (4-Tier) kurumsallık skorlamasındaki ayrıntılı katman (bkz. step3-router.ts):
 * 1 = Kesin Büyük Ölçek (45-100), 2 = Potansiyel Büyük/Güçlü KOBİ (30-44, "large" için esnek
 * yedek havuz), 3 = Sağlıklı Küçük İşletme (15-29). Tier 4 (Çöp/Yetersiz Veri, 0-14) hiçbir zaman
 * RoutedLead'e ulaşmaz — routeSingleLead() o durumda null döner (pipeline'a hiç girmez).
 */
export type CompanyTier = 1 | 2 | 3;

export interface RoutedLead extends MapsLead {
  /** Tier 1-2 => "large" (Derin Tarama + LinkedIn hattı), Tier 3 => "small" (Hızlı Tarama hattı). */
  scale: CompanyScale;
  /** Bkz. CompanyTier. */
  tier: CompanyTier;
  /** 0-100 arası toplam kurumsallık skoru (bkz. step3-router.ts skorlama dağılımı). */
  corporateScore: number;
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
  /**
   * LinkedIn'den ya da web sitesinden bulunan iletişim e-postası. Çıktı türünden bağımsız olarak
   * ZORUNLU: e-postası bulunamayan lead Gemini analizine hiç girmeden "rejected" olarak elenir
   * (bkz. pipeline.worker.ts → processCandidate), bu yüzden FinalizedLead'e ulaşan her satırda dolu olur.
   */
  contactEmail: string;
  /** "draft" modunda Gmail'e taslak olarak gidenle aynı metin; "excel_full" modunda sadece Excel'e yazılır, Gmail'e hiç gitmez. */
  email?: EmailDraft;
  /** Sadece outputType="draft" olduğunda ve gerçekten bir Gmail taslağı oluşturulduğunda dolu olur. */
  gmailDraftId?: string;
}

// Adım 2b: dedup için Supabase "leads" tablosundaki kalıcı durum
export type LeadPersistStatus = "processed" | "rejected";

/**
 * Bir lead'in kalıcı olarak (gelecekteki taramalarda da geçerli şekilde) elendiği sebep.
 * NOT: scaleFilter uyuşmazlığı buraya dahil değil — o an seçilen filtreye özgüdür, kalıcı
 * bir kusur değildir; bu yüzden dedup mekanizması bu sebeple hiç kayıt yazmaz (bkz. step3-router.ts).
 */
export type RejectionReason = "no_contact_email" | "linkedin_verification_failed" | "enrichment_failed";

/**
 * Pipeline'ın üreteceği çıktı türü:
 * - "draft": bugünkü davranış — Gmail'de gerçek taslak oluşturulur, e-postası bulunamayan lead atlanır.
 * - "excel_info": sadece şirket analizi/önerisi üretilir (e-posta taslağı YAZILMAZ, Gmail'e hiç gidilmez); jet hızlı, az token.
 * - "excel_full": excel_info'ya ek olarak bir e-posta taslağı metni de üretilir ama Gmail'e hiç gönderilmez/kaydedilmez,
 *   sadece Excel'in 6. sütununa yazılır.
 */
export type OutputType = "draft" | "excel_info" | "excel_full";

// Pipeline job giriş verisi (kullanıcının girdiği proje açıklaması)
export interface PipelineJobInput {
  projectDescription: string;
  /**
   * Hedeflenen GEÇERLİ (e-postası doğrulanmış) lead sayısı — "haritadan çekilecek toplam firma
   * sayısı" DEĞİL. Pipeline bu sayıya ulaşana kadar Apify Maps'ten kademeli olarak daha geniş bir
   * aday havuzu çeker ve adayları teker teker işler (bkz. pipeline.worker.ts → OVERFETCH_MULTIPLIERS).
   */
  maxResultsPerLocation?: number;
  /** Kullanıcı arayüzden doğrudan hedef sektör belirtmek isterse Adım 1'in LLM analizine yön verir. */
  targetSectorHint?: string;
  /** Kullanıcı arayüzden doğrudan hedef lokasyon belirtmek isterse Adım 1'in LLM analizine yön verir. */
  targetLocationHint?: string;
  /** Sadece belirli ölçekteki lead'ler işlensin istenirse (varsayılan: ikisi de). */
  scaleFilter?: CompanyScale | "all";
  /** Varsayılan: "draft". */
  outputType?: OutputType;
}

export interface PipelineJobResult {
  /** Aday havuzu (kademeli olarak) genişletilirken Maps'ten taranan, mükerrer olmayan toplam işletme sayısı. */
  totalLeadsFound: number;
  /** Daha önce (herhangi bir geçmiş aramada) kalıcı olarak işlenmiş/elenmiş olduğu için Adım 3'e hiç sokulmayan lead sayısı. */
  totalLeadsAlreadyKnown: number;
  /** scaleFilter'a uyan (Şirket Ölçeği Ayrımı'ndan geçen) aday sayısı. */
  totalLeadsMatchingScale: number;
  /** Geçerli e-postası doğrulanıp analiz edilerek çıktıya eklenen (hedeflenen sayı ya da havuz tükendiyse daha azı) lead sayısı. */
  totalDraftsCreated: number;
  leads: FinalizedLead[];
}

// "Geçmiş Projelerim" listesi: her /pipeline çağrısında otomatik kaydedilen arama girdisi.
export interface SearchProject {
  id: string;
  projectDescription: string;
  targetSectorHint: string | null;
  targetLocationHint: string | null;
  scaleFilter: CompanyScale | "all";
  maxResultsPerLocation: number | null;
  outputType: OutputType;
  createdAt: string;
  updatedAt: string;
}
