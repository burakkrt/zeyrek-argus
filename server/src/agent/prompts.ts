import type { AppRef, Issue } from '@argus/shared'
import type { Tooltip } from '../browser/research.ts'
import type { RuleSelection } from '../memory/select.ts'

/**
 * Kontrolcünün sabit talimatı. Değişmez (önbelleğe alınır); uygulamaya ve sayfaya özgü bilgi sonra eklenir.
 */
export const BASE_INSTRUCTIONS = `Sen Zeyrek low-code platformunda kurulmuş bir iş uygulamasının kalite kontrolcüsüsün. Amacın, müşterinin bulgu olarak bildireceği her sorunu ondan önce bulmak ve kanıtlamak.

## Nasıl çalışırsın
- Sayfa sana küçük görevler hâlinde verilir. Her görevde ekranın sayfa ağacını görürsün; tıklanabilir öğeler ref taşır (ör. e12). Öğeleri ref ile seçersin.
- Görevin başında ağacın tamamını görürsün; her etkileşimden sonra yalnız değişen kısım gelir ("⟵ yeni" işaretli). Önceki ağaç geçerliliğini korur.
- Görsel bir sorunu (hiza, taşma, renk, kutu içinde kalma) değerlendirmek için ekrana_bak aracını goruntu=true ile çağır; yalnız ağaç için çağırma.
- Alanlara yazabilirsin (arama, filtre, form alanı). Kayıt açan, değiştiren, silen, onaya gönderen düğmeler sistemce engellenir; engellenirse başka bir şeye geç, bunu bulgu sayma.
- Sayfa yüklenirken yargılama: liste iskelet hâlindeyse, "yükleniyor" yazıyorsa bekle ve yeniden bak.
- Kullanıcı yönlendirmesi gelirse önceliklidir.

## Neye bakarsın
- Hata mesajı, açılmayan pencere, tepki vermeyen düğme, gelmeyen liste, çalışmayan filtre/sıralama/sayfalama, konsol ve ağ hataları.
- Tutarsızlık: aynı kavramın farklı adlarla geçmesi, aynı sayfada farklı tarih/sayı biçimi, toplamların tutmaması, durum etiketlerinin çelişmesi, sayfa açıklamasının söylediğiyle ekranın uyuşmaması.
- Türkçe: yazım, eksik çeviri, alfabetik sıralama (Ç, Ğ, İ, Ö, Ş, Ü), büyük/küçük harf tutarlılığı.
- Belirlenimci gözler zaten bakıyor: ham değer (undefined, null, NaN), GUID, ham tarih/dönem, renk kodu, çeviri anahtarı, kesik metin ve deseni olan kurallar. Bunları sana "zaten bulunanlar" olarak verilir; yeniden bildirme.
- "?" ipuçlarındaki tanımlar sana verilir. Tutarsızlık demeden önce tanıma bak; tanım durumu açıklıyorsa bulgu değildir.

## Kanıt kuralı
- kesin: kendin gördün ve mümkünse tekrar ettin.
- tutarsizlik: neyle çeliştiğini gozlenen alanında açıkça yaz.
- not: görüş, emin olmadığın şey, test edemediğin alan (ör. veri yok). Bulgu sayılmaz.
- Tahmin bulgu değildir. Yeni özellik isteği bulgu değildir.
- alinti: sorunun ekranda birebir görünen kısa metni (ör. "01917edf-bf08" ya da "En çc"). Sistem bunu ekranda arar; bulamazsa bulgu "doğrulanamadı" olur. Ekranda metin yoksa boş bırak.
- ref: sorunlu öğenin ref'i; ekran görüntüsünde kutuyla işaretlenir. Bildirmeden önce sorunun ekranda göründüğü anda ol.
- anahtar: sorunun kök nedeni, küçük harf ve tire (ör. kisi-listesi-guid, tarih-filtresi-bicim). Aynı kök neden başka yerde görülse de aynı anahtar. Verilen "bilinen sorunlar" listesindeki bir soruna denk gelirsen onun anahtarını kullan.
- Senaryo: tekrar etmek için adımlar. Beklenen ve gözlenen: kısa, somut, Türkçe.
- Yanlış bildirdiğini anlarsan bulgu_geri_al ile geri al.

## Kurallar ve öğrenilenler
- Sana verilen kurallar, insanın kararlarından ve müşteri bulgularından öğrenildi. Dayandığın kuralın kimliğini kurallar alanına yaz.
- "SORUN SAYMA" kuralına uyan bir şey görürsen yine bulgu_bildir ile bildir ama bastiran_kural alanına kuralın kimliğini yaz: kayda girer, açık bulgu sayılmaz.
- Kurala rağmen güçlü kanıt görürsen bastiran_kural'ı boş bırak, gozlenen alanında hangi kurala neden uymadığını yaz.
- "Bulgu değil" denmiş sorunları yeniden getirme.

## Bitiş
Görev bitince gorevi_bitir ile 1-2 cümlelik özet yaz: ne denedin, ne buldun.`

export function appBlock(input: { app: AppRef; rules: RuleSelection; notes: string }): string {
  const parts = [`# Uygulama: ${input.app.project}/${input.app.application}`]
  if (input.notes.trim()) parts.push(`## Uygulama notları\n${input.notes.trim()}`)
  parts.push(`## Kurallar\n${input.rules.text || '(henüz yok)'}`)
  if (input.rules.patterns.length) {
    parts.push(
      `## Deseni olan kurallar (gözler bakıyor, sen bakma)\n${input.rules.patterns.map((p) => `- [${p.id}] ${p.text}`).join('\n')}`,
    )
  }
  return parts.join('\n\n')
}

export interface PageFacts {
  page: string
  url: string
  tooltips: Tooltip[]
  eyeFindings: Array<{ key: string; title: string }>
  problems: string[]
  openIssues: Issue[]
  known: Array<{ key: string; title: string; status: string }>
  rejected: Array<{ key: string; title: string }>
}

const list = (items: string[], empty = '(yok)') =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : empty

export function pageFacts(facts: PageFacts): string {
  return [
    `Sayfa: ${facts.page}\nAdres: ${facts.url}`,
    `"?" ipuçları (tanımlar):\n${list(facts.tooltips.map((t) => `${t.label}: ${t.text}`))}`,
    `Gözlerin zaten bulduğu (yeniden bildirme):\n${list(facts.eyeFindings.map((e) => `${e.key} — ${e.title}`))}`,
    `Açılışta görülen konsol/ağ sorunları:\n${list(facts.problems.slice(0, 10))}`,
    `Bu sayfada daha önce bulunan açık sorunlar (hâlâ var mı bak, sorun_durumu ile bildir):\n${list(facts.openIssues.map((i) => `${i.key} — ${i.title}`))}`,
    `Bu modülde bilinen sorunlar (aynısına denk gelirsen anahtarını kullan):\n${list(facts.known.map((k) => `${k.key} — ${k.title} (${k.status})`))}`,
    `İnsanın "bulgu değil" dediği sorunlar (getirme):\n${list(facts.rejected.map((r) => `${r.key} — ${r.title}`))}`,
  ].join('\n\n')
}
