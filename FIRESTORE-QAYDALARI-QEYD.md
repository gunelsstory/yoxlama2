# Firestore təhlükəsizlik qaydaları — vacib qeydlər

**Bu mətn mövcud Rules faylının əvəzi deyil.** Hazırkı Rules mətni göndərilmədiyi üçün aşağıdakı nümunəni birbaşa yerləşdirməyin: başqa `match` və `allow` şərtləri burada göstərilməyib. Rules-da icazələr **OR** şəklində birləşir; geniş `allow write: if true` yeni məhdudiyyətləri təsirsiz edə bilər.

## Müştəri və admin arasında tələb olunan icazələr

| Kolleksiya | İstifadəçi | Admin |
|---|---|---|
| `tfEvents` | Açıq tədbirləri oxuyur. Rezervasiya üçün `holds` dəyişməsi təhlükəsiz server tərəfində doğrulanmalıdır | Tədbir yaradır/redaktə edir, satış təsdiqində `sold` yeniləyir |
| `tfOrders` | Yalnız öz sifarişini oxuyur və yaradır; qəbz nömrəsi, ləğv kimi məhdud əməliyyatlar | Sifarişləri oxuyur; təsdiqləyir və rədd edir |
| `tfReceipts` | Yalnız öz sifarişinə qəbz yükləyir/oxuyur | Qəbzləri yoxlayır |
| `tfUsers` | Yalnız öz profilini və sevimlilərini oxuyur/redaktə edir | Tələb olduqda məhdud admin baxışı |
| `tickets` | **Yalnız `buyerUid == request.auth.uid`** olan öz biletini oxuyur; **yaza bilmir** | Bilet yaradır, giriş statusunu dəyişir |
| `ticketTemplates` | Giriş etmiş istifadəçi şablonu oxuyur | Yükləyir və yeniləyir |
| `tfCheckins` | Birbaşa dəyişə bilmir | Giriş təsdiqi üçün oxuyur/yazır |
| `tfSettings/payment` | Ödəniş kartı məlumatını oxuyur | Dəyişir |
| `tfImages` | Tədbirin poster/banner şəkillərini oxuyur | Şəkil yükləyir |

## Yeni bilet kolleksiyası üçün prinsiplər

`match /databases/{database}/documents` altında, **mövcud qaydalarla birlikdə audit edilərək** aşağıdakı konseptdən istifadə edilməlidir:

```js
function ticketAdmin() {
  return request.auth != null &&
    exists(/databases/$(database)/documents/tfAdmins/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/tfAdmins/$(request.auth.uid)).data.active == true;
}
match /tickets/{id} {
  allow read: if ticketAdmin() ||
    (request.auth != null && resource.data.buyerUid == request.auth.uid);
  allow create, update, delete: if ticketAdmin();
}
match /ticketTemplates/{id} {
  allow read: if request.auth != null;
  allow create, update, delete: if ticketAdmin();
}
match /tfCheckins/{id} {
  allow read, write: if ticketAdmin();
}
```

**Bu nümunə qalan kolleksiyalar üçün qayda vermir.** `tfOrders` üzərində adi müştəri `status`, `paymentStatus`, `approvedAt`, `approvedBy`, `tickets` dəyişə bilməməlidir. `tfEvents` üzərində müştəri `sold`, `capacity`, `price`, `status` dəyərlərini dəyişə bilməməlidir. Eyni zamanda rezervasiya (`holds`) üçün müştəri tərəfdən yazmağa ehtiyac var; bu əməliyyatın bütün sahələrini və məbləği etibarlı yoxlamaq üçün server tərəfli Firebase Callable Function / backend ən güvənli üsuldur. Qəbz yüklənməsi də istifadəçinin öz sifarişi, müddət və fayl həcmi üzrə qaydalarla qorunmalıdır.

**Mövcud tam Firestore Rules mətnini təqdim etdikdən sonra** bu layihənin real qaydalarına uyğun tamamlanmış, qarşılıqlı təhlükəsiz versiya hazırlamaq olar. İcazə problemi üzə çıxanda verilən səhv mesajını və aid olduğu əməliyyatı yoxlayın; `allow read, write: if true` ilə "düzəltməyin".
