# TicketFlow — İstifadəçi paneli + admin QR bilet inteqrasiyası

Bu paket təqdim etdiyiniz istifadəçi HTML dizaynını **TicketFlow Admin QR v3** paketinin məlumat formatına uyğunlaşdırır. Firebase layihəsi `gunelsstory-6d3a9` olaraq saxlanılıb. Orijinal sarı-ağ bilet şablonu `assets/ticket.jpg` kimi saxlanıb.

## Fayllar

```
ticketflow-user/
├── index.html               Mobil və desktop istifadəçi paneli
├── tf-core.js               Sizin Firebase 10.14.1 konfiqurasiyanız (dəyişdirilməyib)
├── tf-user-cloud.js         Auth, profillər, tədbirlər, sifariş, qəbz, biletlər
├── tf-ticket-renderer.js    Admin v3 ilə EYNİ Canvas/QR bilet renderer-i
├── assets/
│   ├── ticket.jpg           Öz göndərdiyiniz sarı-ağ bilet şablonu
│   ├── halloween.svg        Əlavə afişa yoxdursa ehtiyat görüntü
│   ├── autumn.svg           Əlavə afişa yoxdursa ehtiyat görüntü
│   ├── treasure.svg         Əlavə afişa yoxdursa ehtiyat görüntü
│   └── school.svg           Əlavə afişa yoxdursa ehtiyat görüntü
├── FIRESTORE-QAYDALARI-QEYD.md
└── README-AZ.md
```

## İşləmə prinsipi

1. `tfEvents` kolleksiyasındakı tədbirlər və admin yüklədiyi şəkillər real vaxtda görünür.
2. İstifadəçi Firebase Authentication ilə qeydiyyatdan keçir/giriş edir; şəxsi məlumatlar `tfUsers/{uid}`-də saxlanılır. Sevimlilər də Firestore-da saxlanılır. `localStorage` istifadə olunmur.
3. İstifadəçi 1–10 bilet seçərək 30 dəqiqəlik rezervasiya yaradır: `tfOrders/{orderId}` və `tfEvents/{eventId}.holds` eyni tranzaksiyada yazılır.
4. Müştəri kartdan-karta ödəniş edir, 5 MB-a qədər qəbz şəklini əlavə edir: `tfReceipts/{orderId}`, `tfOrders/{orderId}.receiptId`.
5. **Admin v3** köçürməni bank hesabında yoxlayıb `Təsdiqlə` basır. Adminin tranzaksiyası `tickets/{ticketNumber}` bilet sənədlərini, `qrToken`, `buyerUid`, `orderId`, tədbir/qiymət məlumatlarını yaradır və `tfOrders` statusunu təsdiqləyir.
6. İstifadəçi `Biletlərim` bölməsində yalnız `tickets` kolleksiyasında `buyerUid == auth.uid` şərtinə uyğun real bilet sənədlərini görür. Biletin şəklini açır, PNG yükləyir və çap edir. **Saxta və ya təxmini QR bilet yaradılmır.**
7. QR məzmunu hər iki paneldə eynidir: `TF1|ticketNumber|qrToken`. Admin v3 oxudub `Girişi təsdiqlə` basır. `tickets.used` yeniləndikdə istifadəçi panelində də «Giriş edilib» görünür.
8. Bilet şablonu adminin `ticketTemplates/global` sənədindən gəlirsə eyni şablon istifadə olunur; yoxdursa `assets/ticket.jpg` götürülür.

**Bilet şəkli:** PNG şəkli avtomatik brauzerdə yaradılır və yüklənir. Bu paket PNG-ni Firebase Storage-a ayrıca yazmır; şablon + məlumat + token Firestore-da qalır. Bu, admin v3-dəki arxitektura ilə eynidir.

## Yerləşdirmə

- İstifadəçi repo-sunda əvvəlcə ehtiyat nüsxə çıxarın. ZIP içindəki `ticketflow-user/` qovluğunun **içindəkiləri** repo-nun kökünə köçürün.
- Admin repo-sunda əvvəlki **Admin QR v3** paketini saxlayın; bu istifadəçi paketi admin fayllarını əvəz etmir.
- Hər iki sayt HTTPS domenində işləməlidir. Firebase Authentication -> Authorized domains bölməsinə istifadəçi və admin domenlərini əlavə edin.
- `tf-core.js` hər iki tərəfdə eyni Firebase layihəsinə bağlanmalıdır.
- Firestore Rules-u diqqətlə yoxlayın: istifadəçi **yalnız öz** `tfOrders`, `tfUsers`, `tickets` qeydlərini oxumalıdır; `tickets` yazmaq/istifadə olunmuş kimi qeyd etmək **yalnız admin** üçün açıq olmalıdır. `tfOrders`-də ödəniş təsdiq statusunu istifadəçi dəyişə bilməz. Ətraflı `FIRESTORE-QAYDALARI-QEYD.md` faylındadır.
- Firestore Rules mövcud mətninə baxılmadan təhlükəsiz olduqları təsdiqlənə bilməz. Tədbir rezervasiyası `tfEvents.holds` sahəsinə klientdən tranzaksiya yazır; istehsal mühitində bu əməliyyatı etibarlı server funksiyasına keçirmək ən təhlükəsiz yoldur.
- `qrcodejs` kitabxanası CDN-dən yüklənir. İnternet olmadıqda biletə QR çəkilməsi mümkün olmayacaq.

## Test ssenarisi

1. Bir yeni istifadəçi hesabı ilə giriş edin.
2. Aktiv tədbir seçin, 1 və ya 2 bilet rezervasiya edin. Qəbz yükləyin. `tfOrders` və `tfReceipts` sənədlərini yoxlayın.
3. Admin panelində ödənişi təsdiqləyin. `tfOrders.status = Təsdiqlənib`, `tickets`-də `buyerUid` və `qrToken` olan qeydlər yaranmalıdır.
4. İstifadəçinin «Biletlərim» səhifəsini açın. Biletlərin ayrılıqda görünməsi, PNG/çap, şablon, tarix, qiymət və QR-ni yoxlayın.
5. Admin QR-ni oxutsun, girişi təsdiqləsin. Təkrar giriş rədd edilməli, istifadəçinin bilet statusu «Giriş edilib» olmalıdır.
6. Başqa istifadəçi ilə daxil olub əvvəlki istifadəçinin biletlərinin görünmədiyini yoxlayın.
7. Qəbzsiz, vaxtı bitmiş, yer limiti dolmuş sifarişləri test edin.

## Hansı sınaqlar aparılıb?

- İstifadəçi HTML JavaScript sintaksisi və modul sintaksisi yoxlanılıb.
- Lokal, imitasiya edilmiş Firestore testlərində rezervasiya, yer tutma limiti, qiymət hesablanması, qəbz yazılması, ləğvetmə sınağı keçib.
- Chromium vizual sınağında mobil/desktop bilet siyahısı, bilet şəkli önizləməsi və sifarişin içindən bilet açılması işləyib; mobil üfüqi daşma yoxdur.
- **Canlı Firebase, real bank ödənişi, Firestore Security Rules və real QR kamerası hələ sınaqdan keçirilməyib.** Testdəki QR görüntüsü vizual stub idi, skan edilə bilən real QR olmadığı üçün kamera testi hesab olunmur.
