# ADO B2B tizimidan foydalanish bo‘yicha to‘liq qo‘llanma

**Versiya:** 2026-yil 18-iyul
**Kimlar uchun:** superadmin, admin, firma administratori, menejer, kassir va taklif orqali yangi kirayotgan foydalanuvchilar.

Bu hujjat ADO B2B tizimida kundalik ishlash uchun mo‘ljallangan. Unda har bir foydalanuvchi turi, menyular, tugmalar, asosiy biznes jarayonlari va moliyaviy amallar bosqichma-bosqich tushuntiriladi.

> Muhim: foydalanuvchi faqat o‘z roliga va biriktirilgan firmasiga ruxsat berilgan ma’lumotlarni ko‘radi. Qo‘llanmada aytilgan tugma ekranda ko‘rinmasa, odatda bu rol yoki firma doirasi cheklovi hisoblanadi.

## 1. Tizim nima uchun ishlatiladi?

ADO B2B quyidagi ishlarni bitta tizimda yuritadi:

- firmalar, aviakompaniyalar va ular o‘rtasidagi hamkorlik;
- reyslar va bilet zaxirasi;
- bilet ajratish, tasdiqlash, sotish va sotuvni bekor qilish;
- tur paketlari va olingan xizmatlar;
- to‘lovlar, qarzlar, kirim-chiqim va firma hisoblari;
- kassalar, kartalar va kunlik kassa yopilishi;
- hodimlar va saytga kirish akkauntlari;
- chat, support va Telegram bildirishnomalari;
- moliyaviy hisobot, monitoring va audit tarixi.

Ommaviy ro‘yxatdan o‘tish mavjud emas. Yangi foydalanuvchi superadmin yoki vakolatli foydalanuvchi yaratgan akkaunt/taklif orqali tizimga kiradi.

## 2. Foydalanuvchi turlari

Tizimda ikkita darajadagi rol mavjud: platforma roli va firma ichidagi rol.

### 2.1. Platforma rollari

| Rol | Vazifasi | Asosiy imkoniyatlari |
|---|---|---|
| `SUPERADMIN` | Butun platforma egasi va nazoratchisi | Barcha firmalar, adminlar, aviakompaniyalar, audit, monitoring, moliya, tuzatish va sozlamalar |
| `ADMIN` | Operatsion platforma xodimi | Faqat biriktirilgan firmalar doirasidagi amaliy ishlar, kassa, to‘lov, hodim, hisobot va support; bu rol `FIRM_ADMIN` emas |
| `FIRM` | Mijoz yoki hamkor firma foydalanuvchisi | O‘z firmasi va ruxsat berilgan hamkorlar doirasidagi reys, bilet, tur, xizmat, moliya va chat ishlari |

`SUPERADMIN` akkauntini `Faqat ko‘ruvchi superadmin` sifatida yaratish ham mumkin. Bunday foydalanuvchi superadmin ko‘radigan barcha ma’lumotni ko‘radi, lekin hech narsa qo‘sha, tahrirlay, o‘chira, parol almashtira yoki boshqa o‘zgartirish amalini bajara olmaydi.

### 2.2. Firma ichidagi rollar

`FIRM` foydalanuvchisiga quyidagi ichki rollardan biri beriladi:

| Ichki rol | Amaliy ma’nosi | Odatdagi kirish doirasi |
|---|---|---|
| `FIRM_ADMIN` | Firma administratori | Firma ichidagi eng keng huquq: hodimlar, moliya, reys/bilet, turlar, xizmatlar, kassa va sozlamalar |
| `MANAGER` | Sotuv va operatsiya menejeri | Reys/bilet, tur, xizmat, tranzaksiya, hisobot va chat; hodim yoki firma boshqaruvi cheklangan |
| `KASSIR` | Kassa operatori | Asosan Kassa, Chat va Sozlamalar; kassa ochish/yopish, to‘lov va kirim-chiqim |

### 2.3. Tashkilot turi rol emas

Firma kartasida quyidagi turlar uchraydi:

- `AGENCY` — agentlik yoki mijoz firma;
- `AIRLINE` — aviakompaniya profili;
- `CONTRACTOR` — pudratchi yoki xizmat ko‘rsatuvchi.

Bu foydalanuvchi roli emas. Masalan, aviakompaniya profilidagi foydalanuvchining platforma roli baribir `FIRM` bo‘lishi mumkin.

### 2.4. Hodim kartasi va login akkaunti farqi

- **Hodim kartasi** — ism, vazifa, maosh, valyuta va holatni hisobga olish uchun yozuv. U bilan saytga kirib bo‘lmaydi.
- **Login akkaunti** — email va parolga ega haqiqiy tizim foydalanuvchisi.

Hodimga tizimga kirish kerak bo‘lsa, hodim kartasidan tashqari alohida login yaratiladi.

### 2.5. Menyu va amallar bo‘yicha qisqa ruxsat jadvali

`✓` — foydalanadi, `Doirada` — faqat biriktirilgan/o‘z firmasi doirasida, `Ko‘rish` — asosan ko‘rish, `—` — menyu yo‘q yoki amal ruxsat etilmagan.

| Bo‘lim yoki amal | Superadmin | Admin | Firma admini | Menejer | Kassir |
|---|---:|---:|---:|---:|---:|
| Admin/firma dashboardi | ✓ | ✓ | Doirada | Doirada | — |
| Adminlarni boshqarish | ✓ | — | — | — | — |
| Audit log | ✓ | — | — | — | — |
| Monitoring | ✓ | — | — | — | — |
| Aviakompaniyalarni boshqarish | ✓ | — | — | — | — |
| Firmalar | ✓ | Doirada | Doirada | — | — |
| Reyslar va biletlar | ✓ | Doirada | Doirada | Doirada | — |
| Tur paketlari | Doirada | Doirada | ✓ | ✓ | — |
| Olingan xizmatlar | Ko‘rish/tuzatish | Ko‘rish | ✓ | Yaratish | — |
| Tranzaksiyalar | ✓ | Doirada | Doirada | Ko‘rish/doirada | — |
| Kassa | ✓ | Doirada | Doirada | Ruxsatga ko‘ra | ✓ |
| Hodim kartalari | ✓ | Doirada | ✓ | Ko‘rish | — |
| Hodim loginini yaratish | Ruxsatga ko‘ra | Ruxsatga ko‘ra | ✓ | — | — |
| Chat va support | ✓ | Doirada | ✓ | ✓ | ✓ |
| Hisobotlar | ✓ | Doirada | Doirada | Doirada | — |
| Sozlamalar/parol/Telegram | ✓ | ✓ | ✓ | ✓ | ✓ |
| Login sahifasi matnini tahrirlash | ✓ | — | — | — | — |

Bu jadval tezkor yo‘nalish beradi. Aniq amal backenddagi firma doirasi, reys egaligi, kassa biriktirilishi va yozuv yaratuvchisiga qarab qo‘shimcha tekshiriladi.

## 3. Tizimga kirish va umumiy boshqaruv

### 3.1. Kirish

1. Tizim manzilini oching.
2. `Email` va `Parol`ni kiriting.
3. `Kirish` tugmasini bosing.
4. Firma foydalanuvchisi firma paneliga, admin va superadmin admin paneliga o‘tadi.

Kira olmasangiz:

- emailda ortiqcha bo‘sh joy yo‘qligini tekshiring;
- parol katta-kichik harflarga sezgirligini unutmang;
- obuna muddati tugagan bo‘lsa, platforma ma’muriyatiga murojaat qiling;
- parol unutilgan bo‘lsa, superadmindan vaqtinchalik parol so‘rang.

### 3.2. Taklif orqali akkauntni faollashtirish

1. Sizga yuborilgan taklif havolasini oching.
2. Yangi xavfsiz parol kiriting.
3. Parolni takrorlang.
4. Tasdiqlash tugmasini bosing.
5. Taklif yaroqli bo‘lsa, akkaunt faollashadi va tizimga kirasiz.

Taklif bir martalik va muddati cheklangan. “Yaroqsiz yoki eskirgan link” xabari chiqsa, yangi taklif so‘rang.

### 3.3. Yuqori paneldagi umumiy amallar

- **Yangi operatsiya** — biznes holatini tanlab, kerakli formani tez ochadi.
- **Bildirishnomalar** — yangi hodisalarni ko‘rsatadi; bittasini yoki barchasini o‘qilgan deb belgilash mumkin.
- **Akkaunt almashtirish** — shu brauzerda saqlangan boshqa akkauntga tez o‘tadi.
- **Profil/Sozlamalar** — til, mavzu, Telegram va parolni boshqaradi.
- **Chiqish** — joriy sessiyani yakunlaydi.

### 3.4. “Yangi operatsiya” orqali tez ishlash

Rolingizga qarab quyidagi variantlar chiqadi:

- `Mijoz pul to‘ladi` — to‘lov formasini ochadi;
- `Tur sotildi` — tur sotish bo‘limiga olib boradi;
- `Kassaga pul kirdi` — kirim formasini ochadi;
- `Firmaga qarz yozildi` — firma moliyaviy amaliga olib boradi;
- `Bilet sotildi` — reys va ajratilgan biletni tanlashga olib boradi;
- `Bugungi hisobni yopaman` — kassa yopish bo‘limini ochadi.

## 4. Rol bo‘yicha tezkor yo‘riqnoma

### 4.1. Superadminning kundalik ishlari

Superadmin odatda quyidagi tartibda ishlaydi:

1. `Admin paneli`dan umumiy ko‘rsatkichlarni tekshiradi.
2. `Monitoring`da firmalar va kassalar holatini kuzatadi.
3. `Firmalar` va `Aviakompaniyalar`ni yaratadi yoki bog‘laydi.
4. `Adminlar`da operatsion adminlar va ularning firma ruxsatlarini boshqaradi.
5. `Hodimlar`da loginlar, vaqtinchalik parollar va firma ruxsatlarini tekshiradi.
6. `Audit log`da kim nimani yaratgani, o‘zgartirgani yoki o‘chirganini ko‘radi.
7. `Hisobotlar`da umumiy moliyaviy holatni nazorat qiladi.
8. Xato kassa kuni yoki sotuv bo‘lsa, faqat maxsus qayta ochish/bekor qilish amalidan foydalanadi.

### 4.2. Adminning kundalik ishlari

1. Faqat o‘ziga biriktirilgan firmalar bilan ishlaydi.
2. To‘lov, kassa, tranzaksiya va hodim amallarini bajaradi.
3. Firmalar, reyslar, turlar, xizmatlar va hisobotlarni ko‘radi.
4. Firmalardan kelgan support chatlariga javob beradi.
5. Firma doirasidan tashqaridagi ma’lumot ko‘rinmasa, superadmindan ruxsat so‘raydi.

### 4.3. Firma administratorining kundalik ishlari

1. Firma dashboardida qarz, to‘lov, bilet va savdo holatini ko‘radi.
2. Reys/bilet, tur va xizmat amallarini boshqaradi.
3. Kassa va firma hisoblarini yuritadi.
4. Hodim kartalari va kerak bo‘lsa menejer/kassir loginlarini yaratadi.
5. Hisobotlarni tekshiradi va eksport qiladi.
6. Support yoki firma chatidan foydalanadi.

### 4.4. Menejerning kundalik ishlari

1. Mavjud reys va biletlarni tekshiradi.
2. Bilet ajratadi/tasdiqlaydi/sotadi — ruxsat va reys egasiga qarab.
3. Tur paket yaratadi yoki sotadi.
4. Olingan xizmatlarni qayd etadi.
5. Tranzaksiyalar va hisobotlarni ko‘radi.
6. Firma va hodim boshqaruvi menyulari ko‘rinmasligi mumkin.

### 4.5. Kassirning kundalik ishlari

1. `Kassa`ni ochadi yoki o‘ziga biriktirilgan kassani tanlaydi.
2. Mijoz to‘lovini qayd etadi.
3. Naqd/karta kirim-chiqimini kiritadi.
4. Kun davomida kassa qoldig‘ini tekshiradi.
5. Kun oxirida jismoniy pulni sanab kassani yopadi.
6. Zarur bo‘lsa `Chat` orqali rahbar yoki supportga yozadi.

Kassir odatda boshqa modullarga kira olmaydi.

## 5. Dashboardlar

### 5.1. Admin paneli

Admin va superadmin uchun umumiy operatsion ko‘rsatkichlarni beradi. Kartalarni bosib tegishli reys, firma, tranzaksiya yoki hisobot sahifasiga o‘tish mumkin.

### 5.2. Firma dashboardi

Firma foydalanuvchisiga o‘z firmasining:

- eng yaqin uchadigan 5 ta reysi;
- bizdan qarzdor firmalar va biz qarz bo‘lgan airline/firmalarni qarzi kattadan kichikka;
- savdo, ikki yo‘nalishdagi to‘lov va joriy debitor/kreditor qoldiqlarini valyuta bo‘yicha;
- so‘nggi tranzaksiyalar;
- muhim amallar va bildirishnomalarini ko‘rsatadi.

Dashboarddagi raqam bilan batafsil sahifadagi raqam farq qilsa, sana, valyuta va firma filtrlarini tekshiring.

## 6. Adminlar

**Kim foydalanadi:** faqat superadmin.

### Admin yaratish

1. `Adminlar` sahifasini oching.
2. `Email`, to‘liq ism, telefon va boshlang‘ich parolni kiriting.
3. `ADMIN` yoki zarur bo‘lsa `SUPERADMIN` rolini tanlang.
4. Hisob faqat nazorat uchun bo‘lsa, `Faqat ko‘ruvchi superadmin`ni belgilang.
5. Admin ishlashi mumkin bo‘lgan firmalarni belgilang.
6. `Yaratish`ni bosing.

### Adminni tahrirlash

1. Admin qatorini toping yoki qidiruvdan foydalaning.
2. Email, ism, telefon, rol, parol yoki firma ruxsatlarini o‘zgartiring.
3. `Saqlash`ni bosing.

### Himoya qoidalari

- O‘zingizni o‘chira olmaysiz.
- O‘zingizdan superadmin rolini olib tashlay olmaysiz.
- Oxirgi o‘zgartirish huquqiga ega superadminni pasaytirish, o‘chirish yoki faqat ko‘ruvchi qilish mumkin emas.
- Faqat ko‘ruvchi superadmin barcha superadmin bo‘limlarini ochadi, ammo barcha yaratish, tahrirlash va o‘chirish amallari server tomonidan bloklanadi.
- Adminning firma accessi uning qaysi firmalar ma’lumotini ko‘rishini belgilaydi; bu firma ichidagi rol emas.

## 7. Aviakompaniyalar

**Kim foydalanadi:** boshqarish — superadmin; ro‘yxat boshqa ruxsatli jarayonlarda tanlov sifatida ko‘rinishi mumkin.

### Aviakompaniya yaratish

1. `Aviakompaniyalar` sahifasini oching.
2. Nomi, kodi va asosiy valyutasini kiriting.
3. `Yaratish`ni bosing.
4. Zarur firma profilini aviakompaniya bilan ulang.

Ulanmagan aviakompaniya firma reys yaratish tanlovida ko‘rinmasligi mumkin. Tashqi aviakompaniya kerak bo‘lsa, reys formasidagi tashqi aviakompaniya variantidan foydalaniladi.

## 8. Firmalar

### 8.1. Firma ro‘yxati

Ro‘yxatda firma nomi, mas’ul shaxs, telefon, turi, valyuta, obuna holati va moliyaviy ko‘rsatkichlar chiqadi.

Ko‘rish doirasi:

- superadmin — barcha firmalar;
- admin — biriktirilgan firmalar;
- firma foydalanuvchisi — o‘z firmasi va o‘zi yaratgan/ruxsatli hamkor firmalar.

### 8.2. Superadmin yangi firma va login yaratishi

1. `Firmalar` → `Yangi firma yaratish`ni oching.
2. Firma nomi, email, mas’ul shaxs, telefon va obuna muddatini kiriting.
3. Kamida 6 belgili boshlang‘ich parol kiriting.
4. Firma turi, valyutasi va boshqa kerakli maydonlarni tekshiring.
5. Saqlang.
6. Login ma’lumotini firma vakiliga xavfsiz kanalda yuboring.

Parolsiz taklif rejimi ishlatilsa, bir martalik havolani nusxalab yuboring.

### 8.3. Admin yoki firma hamkor firma kartasini qo‘shishi

1. `Firma qo‘shish`ni bosing.
2. Nomi, mas’ul shaxs, telefon va boshqa ma’lumotlarni kiriting.
3. Saqlang.

Bu amal faqat firma kartasini yaratadi; yangi foydalanuvchi yoki login avtomatik yaratilmaydi.

### 8.4. Firmaga qarz yozish

1. Kerakli firma qatorini oching.
2. `Qarz qo‘shish` yoki tegishli moliyaviy amalni tanlang.
3. Summa, valyuta, sana va izohni kiriting.
4. Tasdiqlashdan oldin qarzdor va qarz beruvchi tomonni tekshiring.
5. Saqlang va tranzaksiyalar ro‘yxatidan natijani tekshiring.

### 8.5. Firmaga aviakompaniya accessi berish

1. Superadmin firma qatoridagi aviakompaniya ulanish bo‘limini ochadi.
2. Ruxsat beriladigan aviakompaniyalarni belgilaydi.
3. Ulanishni saqlaydi.

### 8.6. Firmani tahrirlash yoki arxivlash

- Superadmin nom, kontakt, obuna, limit, valyuta, tur va holatni boshqaradi.
- Firma foydalanuvchisi faqat ruxsat berilgan o‘z firma maydonlarini o‘zgartiradi.
- `O‘chirish` muhim tarixni yo‘q qilmasdan firmaga `DELETED` holatini beradi; moliyaviy tarix saqlanadi.

## 9. Reyslar va biletlar

### 9.1. Reyslar ro‘yxati

Sahifada:

- qidiruv;
- aviakompaniya va holat filtrlari;
- ro‘yxat yoki kartalar ko‘rinishi;
- reys tafsilotlari;
- tegishli tranzaksiya va hisobotga tez o‘tish mavjud.

Bekor qilingan reyslar odatda `Faqat aktiv` filtrida yashiriladi. Ularni ko‘rish uchun `Barcha holatlar` yoki `Bekor qilingan`ni tanlang.

### 9.2. Reys yaratish

**Odatda:** kassirdan tashqari, reys yaratish vakolati berilgan firma foydalanuvchisi.

1. `Reyslar` → `Reys yaratish`ni bosing.
2. Reys raqami va yo‘nalishni kiriting.
3. Ulangan aviakompaniyani tanlang yoki tashqi aviakompaniya nom/kodini kiriting.
4. Jo‘nash va yetib kelish vaqtini kiriting.
5. `Bilet soni`, bitta bilet narxi va valyutani kiriting.
6. Jami boshlang‘ich summani tekshiring.
7. Tasdiqlang.

`Bilet soni` reysning boshlang‘ich bilet zaxirasini yaratadi. Masalan, 30 kiritilsa, 30 ta mavjud bilet hosil bo‘ladi.

### 9.3. Reysni tahrirlash yoki bekor qilish

- Ruxsatli reys egasi ma’lumotlarni tahrirlaydi.
- Superadmin tuzatish kiritishi mumkin.
- Reysni bekor qilishni tasdiqlashdan oldin uning bilet va moliyaviy holatini tekshiring.
- Bekor qilingan reysga yangi bilet yoki operatsiya qo‘shilmaydi.

### 9.4. Bilet holatlari

| Holat | Ma’nosi |
|---|---|
| `AVAILABLE` | Bilet bo‘sh, hali firmaga ajratilmagan |
| `PENDING` | Firmaga ajratilgan, firma tasdig‘ini kutmoqda |
| `ASSIGNED` | Firma tasdiqlagan, bilet firma zimmasida |
| `SOLD` | Xaridorga sotilgan |
| `CANCELLED/REFUNDED/DELETED` | Bekor, qaytarilgan yoki tarixiy o‘chirilgan holat |

### 9.5. Biletlarni firmaga ajratish

1. Reys tafsilotini oching.
2. `Chiptalarni ajratish` bo‘limiga o‘ting.
3. Qabul qiluvchi firmani tanlang.
4. Bilet yoki miqdorni belgilang.
5. Kerak bo‘lsa ajratish narxini kiriting.
6. Tasdiqlang.

Natija `PENDING` bo‘ladi. Yetarli bo‘sh bilet bo‘lmasa, amal bajarilmaydi.

### 9.6. Ajratilgan biletni tasdiqlash

1. Qabul qiluvchi firma reys tafsilotini ochadi.
2. `Tasdiqlash` bo‘limidan kutayotgan biletlarni tanlaydi.
3. Miqdorni tekshiradi va tasdiqlaydi.

Natija:

- bilet `ASSIGNED` bo‘ladi;
- tasdiqlangan ajratmaning o‘zi agent qarzi va hisobot uchun moliyaviy hujjat bo‘ladi.

Shuning uchun noto‘g‘ri narx yoki miqdorni tasdiqlamasdan avval reys egasi bilan aniqlashtiring.

### 9.7. Bilet sotish

1. `ASSIGNED` holatdagi biletni tanlang.
2. `Sotildi deb belgilash`ni oching.
3. Sotuv narxi va valyutani kiriting.
4. Xaridorning F.I.Sh. va hujjat ma’lumotini kiriting.
5. Saqlang.

Natija `SOLD` bo‘ladi va `SALE` tranzaksiyasi yaratiladi.

### 9.8. Ajratishni bekor qilish

Admin/superadmin `PENDING` yoki ruxsatli `ASSIGNED` biletni qayta `AVAILABLE` holatiga qaytarishi mumkin. Ajratma qarzi ajratmaning yangi holati va summasidan qayta hisoblanadi. Sotilgan biletning ajratilishini bevosita bekor qilish mumkin emas.

### 9.9. Sotuvni bekor qilish

- Admin/superadmin sotuvni maxsus bekor qilish amali bilan qaytaradi.
- Firma foydalanuvchisi sabab yozib bekor qilish so‘rovi yuboradi.
- Admin/superadmin so‘rovni ko‘rib tasdiqlaydi.
- Tasdiqlanganda teskari `SALE` yozuvi yaratiladi va bilet `ASSIGNED`ga qaytadi.

Bilet yoki sotuv yozuvini bazadan qo‘lda o‘chirmang.

## 10. Tur paketlari

### Tur yaratish

**Kim:** firma administratori yoki menejer.

1. `Turlar` → `Yangi tur`ni bosing.
2. Firma egalik qiladigan ajratilgan reysni tanlang.
3. Tur nomi va manzilini kiriting.
4. Miqdor, bilet narxi, xizmat narxi va valyutani kiriting.
5. Izoh qo‘shing va saqlang.

Bir dona tur narxi bilet narxi va xizmat narxi yig‘indisiga mos bo‘lishi kerak.

### Tur sotish

1. Sotiladigan paketni toping.
2. Xaridor firmani tanlang.
3. Miqdor va narxni tekshiring.
4. Kerak bo‘lsa kurs va izoh kiriting.
5. `Sotish`ni bosing.

Natijada mavjud miqdor kamayadi va firmalararo `SALE` tranzaksiyasi yaratiladi. Sotuvchi va xaridor bitta firma bo‘la olmaydi.

### Sotilgan turni tahrirlash yoki o‘chirish

1. `Tur sotuvlari jurnali`dan kerakli sotuvni toping.
2. `Tahrirlash` orqali xaridor, soni yoki dona narxini tuzating va sababini yozing.
3. `O‘chirish`da sababni kiriting va tasdiqlang.

Tuzatishda bilet segmentlari, xizmat rezervlari, tur qoldig‘i va moliyaviy yozuv birgalikda yangilanadi. Bu amallar faqat sotuvchi firmaning administratori/menejeri yoki superadmin uchun ochiq.

### Eksport

Sahifadagi joriy ma’lumotlarni CSV yoki Excel ko‘rinishida yuklab olish mumkin. Eksportdan oldin kerakli filtrni tanlang.

## 11. Olingan xizmatlar

Bu bo‘lim firma boshqa ta’minotchidan olgan viza, transfer, mehmonxona yoki boshqa xizmatni qayd etadi.

### Xizmat qayd etish

**Kim:** firma administratori yoki menejer.

1. `Xizmatlar` sahifasini oching.
2. Xizmat nomini kiriting.
3. Tizimdagi ta’minotchi firmani tanlang yoki boshqa ta’minotchi nomini yozing.
4. Xizmat reysga bog‘liq bo‘lsa, reysni tanlang.
5. Miqdor, dona narxi va valyutani kiriting.
6. USD bo‘lsa, zarur firma kursini kiriting.
7. `Qarz` yoki `To‘langan` holatini tanlang.
8. Izoh yozing va `Xizmatni qayd etish`ni bosing.

### Tahrirlash va o‘chirish

- Superadmin va firma administratori ruxsatli yozuvni tahrirlaydi/o‘chiradi.
- Menejer yangi xizmat qayd etishi mumkin, lekin keyingi tuzatish huquqi cheklangan bo‘lishi mumkin.

## 12. Tranzaksiyalar va firma hisoblari

### 12.1. Tranzaksiyalar ro‘yxati

Sahifada quyidagilar bilan filtrlash mumkin:

- sana oralig‘i;
- firma;
- reys;
- tranzaksiya turi;
- valyuta;
- kassa/hisob;
- ro‘yxat yoki kartalar ko‘rinishi.

Qatorni ochib to‘liq tafsilot, yaratuvchi, tomonlar, usul, izoh va bog‘langan reys/biletni ko‘ring.

### 12.2. Tranzaksiya turlari

| Tur | Ma’nosi |
|---|---|
| `PAYABLE` | Qarzdorlik yoki to‘lanishi kerak bo‘lgan summa |
| `PAYMENT` | Amalga oshirilgan to‘lov |
| `SALE` | Bilet, tur yoki boshqa sotuv |
| `REFUND` | Qaytarish |
| `ADJUSTMENT` | Qo‘lda kiritilgan tuzatish/kirim-chiqim |
| `ALLOCATION` | Ajratish bilan bog‘liq tarixiy yozuv |

### 12.3. Firma hisobi yaratish

Ruxsatli firma administratori yoki platforma operatori:

1. `Firma hisoblari` bo‘limini ochadi.
2. Hisob turi va nomini tanlaydi: kassa, umumiy karta, bank yoki ta’sischi hisobi.
3. Valyuta va boshlang‘ich qoldiqni kiritadi.
4. Saqlaydi.

Har bir hisobning qoldig‘i alohida yuritiladi.

### 12.4. Hisob tranzaksiyasini qayd etish

1. Hisobni tanlang.
2. Kirim yoki chiqim turini belgilang.
3. Summa, valyuta/kurs va izohni kiriting.
4. Saqlang va yangi qoldiqni tekshiring.

### 12.5. Airline yoki firmaga to‘lovni qayd etish

1. `To‘lovni qayd etish` bo‘limini oching.
2. `Kimga (to‘lov oluvchi)` maydonida pul oladigan airline yoki firmani tanlang. To‘lovchi — tanlangan kassa egasi bo‘lgan firma.
3. Summa va valyutani kiriting.
4. To‘lov usulini tanlang: `Naqd`, `Karta` yoki `Bank o‘tkazmasi`.
5. Naqd to‘lov uchun sana kiriting.
6. Karta bo‘lsa, mos valyutadagi aktiv kartani tanlang.
7. Reys va izohni kerak bo‘lsa kiriting.
8. Saqlang.

Bu to‘lov kassa yoki karta qoldig‘ini kamaytiradi. Mijozdan kelgan pulni `Kassa kirim / chiqim` bo‘limida `Kirim` sifatida kiriting.

Kassa yopiq bo‘lsa, naqd/karta amali rad etilishi mumkin. Avval tegishli kun va kassani oching.

### 12.6. Kassa kirim-chiqimi

1. `Kassa kirim / chiqim` bo‘limini oching.
2. Firma va kontragentni tanlang, zarur bo‘lsa `Reys (ixtiyoriy)` maydonida pul tegishli bo‘lgan reysni belgilang.
3. `Kirim` yoki `Chiqim`ni tanlang.
4. Summa, valyuta, sana va usulni kiriting.
5. Zarur bo‘lsa karta va izohni tanlang.
6. Saqlang.

### 12.7. Tahrirlash va o‘chirish qoidasi

- Kunlik qo‘lda kiritilgan kassa yozuvini odatda uni yaratgan foydalanuvchi tahrirlaydi/o‘chiradi.
- Firma administratori yoki superadmin uchun qo‘shimcha vakolat bo‘lishi mumkin.
- Tuzatish sababi talab qilinishi mumkin.
- Oddiy to‘lov va avtomatik bilet tranzaksiyasini bevosita o‘zgartirmang; reversal, bekor qilish yoki adjustment ishlating.

## 13. Kassa

### 13.1. Kassa tanlash va kunni ko‘rish

1. `Kassa` sahifasini oching.
2. Ruxsat bo‘lsa firma va kassani tanlang.
3. Ish sanasini tanlang.
4. Holatni tekshiring: `Ochilmagan`, `Ochiq` yoki `Yopiq`.

Sahifa boshlang‘ich qoldiq, kunlik naqd/karta harakati, kutilgan qoldiq, haqiqiy qoldiq, farq va tranzaksiyalarni ko‘rsatadi.

### 13.2. Yangi kassa yaratish

1. Firma va kassa nomini tanlang/kiriting.
2. Kassir loginini biriktiring.
3. Kassa kodi va holatini tekshiring.
4. Saqlang.

Bir kassirni to‘g‘ri kassaga biriktirish monitoring va javobgarlik uchun muhim.

### 13.3. Kassani ochish

1. Ish sanasini tanlang. Oldingi sanalarni ham tanlash mumkin.
2. Tizim shu sanadan oldingi, qoldig‘i mavjud eng yaqin kassa kunini topib UZS va USD qoldiqlarini alohida olib keladi. Qoldiqsiz yopilgan kunlar o‘tkazib yuboriladi; bu birinchi kun bo‘lsa `0` dan boshlanadi.
3. `Kassani ochish`ni bosing.

Bir sana uchun bir kassani ikki marta ochib bo‘lmaydi. Boshlang‘ich qoldiq manfiy bo‘lmasligi kerak.

### 13.4. Boshlang‘ich qoldiqni tuzatish

Admin, superadmin yoki ruxsatli firma rahbari ochiq kunning boshlang‘ich qoldig‘ini tuzatishi mumkin. Tuzatishdan keyin kutilgan qoldiqni qayta tekshiring.

### 13.5. Karta qo‘shish

1. `Karta ma’lumotlari` bo‘limini oching.
2. Karta egasi, raqam/nom, valyuta va firma ma’lumotini kiriting.
3. Saqlang.

Karta to‘lovida karta valyutasi to‘lov valyutasiga mos bo‘lishi kerak. Karta tahriri/o‘chirilishi rol va yaratuvchiga qarab cheklanadi.

### 13.6. To‘lov va kirim-chiqim

`To‘lov qo‘shish` hamda `Kassa kirim / chiqim` shakllari Tranzaksiyalar bo‘limidagi qoidalarga amal qiladi. Ma’lumot kiritilgach:

1. `To‘lov qo‘shish` airline/firma uchun chiqim, `Kassa kirim / chiqim` esa tanlangan turiga qarab kirim yoki chiqim ekanini tekshiring.
2. Naqd va karta summalarini alohida solishtiring.
3. Noto‘g‘ri yozuvni oddiy yangi yozuv bilan yashirmang; tegishli tuzatish amalidan foydalaning.

Oldingi sanadagi yozuvni tuzatish kerak bo‘lsa, aynan o‘sha sana va kassani qayta oching, tuzatishni bajaring va kunni yana yoping.

### 13.7. Eski Kassa ma’lumotlarini Excel orqali yuklash

1. `Kassa` sahifasida kerakli firma va kassani tanlang.
2. `Eski Kassa ma’lumotlarini yuklash` bo‘limini oching.
3. `Excel shablonni yuklab olish`ni bosing. Shablon aynan tanlangan firma va kassaga bog‘lanadi.
4. `Kassa importi` varag‘ida har bir eski naqd kirim/chiqim uchun yagona `Import ID`, sana, `KIRIM` yoki `CHIQIM`, summa, `UZS` yoki `USD`, tarixiy UZS kursi va izohni kiriting.
5. Faylni saqlab, `To‘ldirilgan shablonni tanlash` orqali yuklang.
6. Tekshiruv natijasini ko‘ring. Xato bo‘lsa, birorta yozuv saqlanmaydi.
7. Barcha qator tayyor bo‘lsa, `Yuklashni tasdiqlash`ni bosing.

Muhim qoidalar:

- Har bir qatordagi sana uchun shu kassa kuni `Ochiq` bo‘lishi kerak; yopiq kunni avval qayta oching.
- `Import ID` qayta ishlatilsa, bir xil yozuv dublikat qilinmaydi. Boshqa ma’lumotga shu ID berilsa, tizim xato sifatida ko‘rsatadi.
- UZS kursi `1`; USD uchun operatsiya sanasidagi UZS kursini kiriting.
- Bir faylda ko‘pi bilan 500 qator. Import faqat naqd Kassa kirim/chiqimiga tegishli; bilet ajratmasi, tur va xizmat zaxirasi tranzaksiya yaratmaydi.

### 13.8. Kassani yopish

1. Kun oxirida jismoniy naqd pulni sanang.
2. `Kassani yopish` bo‘limini oching.
3. Haqiqiy yopilish qoldig‘ini kiriting.
4. Izohni yozing.
5. Tizim ko‘rsatgan kutilgan qoldiq va farqni tekshiring.
6. Tasdiqlang.

Farq nol bo‘lmasa, yopishdan avval sababini topish tavsiya etiladi.

### 13.9. Yopilgan kassani qayta ochish

**Kim:** superadmin, doiradagi admin, firma administratori, menejer yoki o‘ziga biriktirilgan kassadagi kassir.

1. Yopilgan sana va kassani tanlang.
2. `Kassani qayta ochish`ni bosing.
3. Majburiy sababni kiriting.
4. Tuzatishni bajaring va kunni qayta yoping.

Qayta ochish mavjud tranzaksiyalarni o‘chirmaydi va auditda saqlanadi.

### 13.10. Kunlik nazorat va eksport

- kutilgan qoldiqni haqiqiy qoldiq bilan solishtiring;
- kassani kim ochgan/yopganini tekshiring;
- CSV/Excel eksport yoki chop etishdan foydalaning;
- kassir va tekshiruvchi imzosi uchun chiqarilgan shaklni saqlang.

## 14. Hodimlar va loginlar

### 14.1. Hodim kartasi yaratish

**Boshqarish:** superadmin, admin va firma administratori. Menejer ko‘rishi mumkin, lekin o‘zgartirish huquqi cheklangan.

1. `Hodimlar` sahifasini oching.
2. Ism, rol, maosh va valyutani kiriting.
3. Admin/superadmin bo‘lsa, firmaga biriktiring; firma foydalanuvchisida joriy firma avtomatik olinadi.
4. `Qo‘shish`ni bosing.

Hodim roli `Menejer`, `Kassir`, `Monitor` yoki boshqa nomda bo‘lishi mumkin. `Monitor` hodim kartasidagi vazifa bo‘lib, alohida platforma login roli emas.

### 14.2. Hodimni yangilash

1. Qatordagi ism, rol, maosh, valyuta yoki holatni o‘zgartiring.
2. `Yangilash`ni bosing.
3. Firma foydalanuvchisi hodimni boshqa firmaga ko‘chira olmaydi.

### 14.3. Hodimni o‘chirish

`O‘chirish` hodimni tarixdan yo‘q qilmay, arxiv/`DELETED` holatiga o‘tkazadi. Auditda kim bajargani saqlanadi.

### 14.4. Hodim uchun login yaratish

**Kim:** firma administratori.

1. `Hodim login akkaunti` formasini oching.
2. `Menejer` yoki `Kassir` login rolini tanlang.
3. To‘liq ism, email, telefon va boshlang‘ich parolni kiriting.
4. `Login yaratish`ni bosing.
5. Ma’lumotni hodimga xavfsiz yuboring va birinchi kirishda parolni almashtirishni ayting.

### 14.5. Parolni tiklash va admin ruxsatlari

- Superadmin ro‘yxatdan o‘tgan akkauntlarni ko‘radi va vaqtinchalik parol o‘rnatishi mumkin.
- Superadmin admin foydalanuvchisiga firma ruxsatlarini belgilab, ekrandagi `Access saqlash` tugmasini bosadi.

## 15. Chat va support

### 15.1. Chat turlari

- shaxsiy chat;
- firma yoki bo‘lim guruhi;
- ADO kompaniya kanali;
- support chat;
- AI yordamchi.

### 15.2. Yangi suhbat yaratish

1. `Chat` sahifasini oching.
2. `Yangi chat`ni tanlang.
3. Suhbat turi va ishtirokchilarni belgilang.
4. Nomi/bo‘lim/firmani kiriting va yarating.

Firma foydalanuvchisi o‘z firmasidagi foydalanuvchilar bilan yozishadi. Boshqa firma bilan shaxsiy chat faqat superadmin firmalararo chat ruxsatini ochgan bo‘lsa ishlaydi.

### 15.3. Supportga yozish

1. `Support` suhbatini oching.
2. Muammoni aniq yozing: sahifa, amal, sana, firma va ko‘ringan xabar.
3. Maxfiy parol yoki token yubormang.
4. Zarur bo‘lsa fayl nomi yoki izohi qo‘shimcha ma’lumot sifatida qo‘shiladi.

Superadmin barcha support suhbatlarini, admin biriktirilgan firmalar supportini, firma esa o‘z support suhbatini ko‘radi.

### 15.4. Xabar amallari

- qidirish;
- javob berish;
- boshqa suhbatga yuborish;
- o‘z xabarini tahrirlash yoki o‘chirish;
- o‘qilgan holatni ko‘rish;
- `@` orqali eslatish.

Fayl/rasm/PDF/Excel/ovoz uchun hozir ayrim holatlarda faqat nom va izoh saqlanishi mumkin; haqiqiy fayl yuklanganini alohida tekshiring.

### 15.5. Firmalararo chat ruxsati

**Kim:** faqat superadmin.

1. `Chat` → `Sozlamalar`ni oching.
2. Ikki firmalarni tanlang.
3. Ular o‘rtasidagi chatni yoqing yoki o‘chiring.
4. Saqlang.

Access o‘chirilganda eski tarix saqlanadi, yangi yozishma yopiladi.

## 16. Hisobotlar

`Hisobotlar` sahifasi rol va firma doirasiga qarab ma’lumot ko‘rsatadi.

### Asosiy bo‘limlar

- **Moliyaviy holat** — tushum, qarz, to‘lov, qoldiq va umumiy sog‘lomlik;
- **Rentabellik** — foyda va xarajatlar tahlili;
- **Pul oqimi** — kirim va chiqim;
- **Qarzlar** — debitor va kreditor tarkibi;
- **Agentlar hisoboti** — agent nomi, eski qoldiq, jami bilet/tur, savdo, to‘lov va real qoldiq;
- **Reys rentabelligi** — reys kesimidagi natija.

### Hisobotdan foydalanish

1. Sana oralig‘ini tanlang.
2. Ruxsat bo‘lsa firma, reys, filial, tur, usul yoki valyuta filtrini tanlang.
3. `Yangilash`ni bosing.
4. Kartalar va jadvallarni bir xil valyuta/sana doirasida solishtiring.
5. Kerak bo‘lsa CSV/Excel eksport qiling.

`Debitor / Kreditor`da `Olinadigan qarz` ostida bizdan qarzi bor firmalar, `To‘lanadigan qarz` ostida esa biz qarz bo‘lgan airline/firmalar nomma-nom va joriy qoldig‘i bilan chiqadi. Qarz hisobida bilet ajratmasi, tur, reys inventari tannarxi, olingan/sotilgan xizmatlar, firma bizga qilgan `PAYMENT` yoki `KASSA_IN` to‘lovi va biz qilgan `KASSA_OUT` to‘lovi birga hisoblanadi.

`Agentlar hisoboti`dagi agent qatorini bossangiz, u bizdan olgan reys/bilet/tur, biz undan olgan reys va xizmatlar, `Bizga to‘lagan` hamda `Biz to‘lagan` kassa/tranzaksiya yozuvlari sana, reys va usuli bilan ochiladi.

Firma foydalanuvchisi faqat o‘z doirasidagi ma’lumotni ko‘radi. Superadmin platforma bo‘yicha umumiy va mahsulot monitoring ko‘rsatkichlarini ko‘ra oladi.

## 17. Monitoring

**Kim:** faqat superadmin.

Monitoring firmalar kesimida operatsion holatni, kassalar va foydalanuvchi faolligini kuzatish uchun ishlatiladi.

1. `Monitoring` sahifasini oching.
2. Firma yoki davr filtrini tanlang.
3. Kassa va biznes ko‘rsatkichlarini tekshiring.
4. Muammo ko‘ringanda tegishli firma, kassa, tranzaksiya yoki audit sahifasiga o‘ting.

Monitoringdagi ma’lumot nazorat uchun; tuzatish tegishli domen sahifasida bajariladi.

## 18. Audit log

**Kim:** faqat superadmin.

Audit log quyidagilarni ko‘rsatadi:

- kim amal bajargani;
- amal turi;
- qaysi obyekt o‘zgargani;
- oldingi va yangi holat;
- sana-vaqt va sabab.

### Auditdan foydalanish

1. `Audit log`ni oching.
2. Qidiruv, amal turi va obyekt filtridan foydalaning.
3. `Kechadan beri o‘zgarishlar` kabi tez filtrni tanlang.
4. Shubhali yozuv tafsilotini oching.
5. Tuzatish kerak bo‘lsa, auditning o‘zida emas, tegishli biznes sahifasida maxsus amalni bajaring.

Parol, token va sirlar auditda ochiq saqlanmasligi kerak.

## 19. Sozlamalar

### 19.1. Ma’lumot shablonlari

Eski naqd Kassa kirim-chiqimlarini saytga kiritish uchun `Kassa` sahifasidagi firma va kassaga bog‘langan Excel import shablonidan foydalaning. Sahifalardagi joriy ro‘yxatlarni CSV yoki Excel ko‘rinishida eksport qilish mumkin.

### 19.2. Ko‘rinish va til

1. `Ko‘rinish` bo‘limini oching.
2. Yorug‘ yoki qorong‘i mavzuni tanlang.
3. Til almashtirgichdan o‘zbek yoki ingliz tilini tanlang.

Tanlov brauzerda saqlanadi.

### 19.3. Hisob ma’lumotlari

Email, platforma roli, firma ichki roli va obuna muddatini tekshiring. Noto‘g‘ri bo‘lsa, superadminga murojaat qiling.

### 19.4. Telegram ulash

1. `Telegram` bo‘limini oching.
2. `Telegramga ulash`ni bosing.
3. Ochilgan kompaniya botida `Start`ni bosing yoki nusxalangan ulash buyrug‘ini botga yuboring.
4. Ulanish holatini tekshiring.
5. Istasangiz bildirishnomani vaqtincha o‘chiring yoki Telegram aloqasini uzing.

Faqat kompaniya ko‘rsatgan botdan foydalaning. Bot tokenini hech qachon foydalanuvchi qurilmasiga yoki chatga yubormang.

### 19.5. Firma asosiy valyutasi

- Superadmin kerakli firmani tanlaydi.
- Firma foydalanuvchisi faqat o‘z firmasini boshqaradi.
- 3 harfli valyuta kodini tanlab/yozib saqlaydi.

Asosiy valyuta yangi shakllarda avtomatik tanlanadi; eski tranzaksiyalarning valyutasini o‘zgartirmaydi.

### 19.6. Kunlik valyuta kursi

1. Sana va firmalarni tanlang.
2. USD → UZS kursini kiriting.
3. Saqlang.

Noto‘g‘ri eski kursni o‘chirib/tahrirlash o‘rniga yangi kurs yozuvi bilan almashtirish qoidasiga amal qiling.

### 19.7. Parolni almashtirish

1. `Xavfsizlik` bo‘limini oching.
2. Joriy parolni kiriting.
3. Kamida 6 belgili yangi parol kiriting.
4. Yangi parolni takrorlang.
5. `Parolni yangilash`ni bosing.

### 19.8. Kirish sahifasi matnlari

**Kim:** faqat superadmin.

1. `Kirish sahifasi matnlari` bo‘limini oching.
2. Previewni tekshiring.
3. O‘zbekcha va inglizcha sarlavha, izoh, maydon va tugma matnlarini tahrirlang.
4. Saqlang.
5. Chiqib, ommaviy login sahifasini qayta tekshiring.

## 20. Eksport va ma’lumot bilan ishlash

- `CSV` — tezkor jadval almashish uchun;
- `Excel` — formatlangan ish kitobi uchun;
- `Chop etish` — kassa va nazorat hujjatlari uchun.

Eksportdan oldin:

1. firma va sana filtrini tekshiring;
2. ekrandagi qatorlar kerakli doirada ekanini tasdiqlang;
3. valyuta ustunini albatta saqlang;
4. faylni ishonchli joyda saqlang;
5. shaxsiy va moliyaviy ma’lumotni ruxsatsiz yubormang.

## 21. Moliyaviy xavfsizlik qoidalari

1. Har bir summada valyutani tekshiring: UZS va USDni aralashtirmang.
2. Karta valyutasi to‘lov valyutasiga mos bo‘lsin.
3. Naqd/karta amalidan oldin kerakli kassa kuni ochiq bo‘lsin.
4. Bilet tasdig‘i qarz yaratishini unutmang.
5. Bilet sotilishi savdo tranzaksiyasi yaratadi.
6. Bekor qilishda eski yozuvni o‘chirish emas, teskari tranzaksiya ishlatiladi.
7. Kassa yopilishidagi farqni izohsiz qoldirmang.
8. Moliyaviy yozuvni bazadan qo‘lda tahrirlamang.
9. Tuzatish sababini aniq yozing.
10. Amal tugagach, Tranzaksiyalar, Kassa va Hisobotdagi natijani solishtiring.

## 22. Holatlar va xatolar bo‘yicha yordam

### Tugma ko‘rinmayapti

- rolingizni `Sozlamalar → Hisob`dan tekshiring;
- admin bo‘lsangiz, firma ruxsatini tekshirtiring;
- kassir bo‘lsangiz, faqat Kassa/Chat/Sozlamalar ko‘rinishi normal;
- menejerda firma va hodim boshqaruvi yashirilishi mumkin.

### Firma yoki reys ro‘yxatda yo‘q

- firma accessi yoki hamkorlik ulanishini tekshiring;
- reys filtrini `Barcha holatlar`ga o‘zgartiring;
- bekor/o‘chirilgan obyekt normal ro‘yxatda yashiriladi;
- aviakompaniya superadmin tomonidan firmaga ulanmagan bo‘lishi mumkin.

### To‘lov yoki kirim saqlanmayapti

- kassa kuni ochiq ekanini tekshiring;
- sana va summani tekshiring;
- karta aktiv va valyutasi mos bo‘lsin;
- firma/kassa accessi mavjudligini tekshiring;
- server qaytargan xabarni supportga aynan yuboring.

### Hisobot summasi kutilganidan farq qiladi

- sana oralig‘i;
- firma/reys filtri;
- valyuta;
- bekor qiluvchi manfiy tranzaksiya;
- kassa va karta ajratilishi;
- ajratilgan bilet hali `PENDING` yoki allaqachon `ASSIGNED` ekanini tekshiring.

### Parol yoki obuna muammosi

- parol uchun superadmindan vaqtinchalik parol so‘rang;
- obuna tugagan bo‘lsa, muddat uzaytirilmaguncha tizimga kirish bloklanadi;
- umumiy chatga parol yubormang.

## 23. Tavsiya etilgan kunlik chek-listlar

### Kassir uchun

- [ ] To‘g‘ri firma, kassa va sana tanlandi.
- [ ] Kassa boshlang‘ich qoldiq bilan ochildi.
- [ ] Har bir to‘lovning usuli va valyutasi tekshirildi.
- [ ] Kun tranzaksiyalari jismoniy hujjatlar bilan solishtirildi.
- [ ] Haqiqiy qoldiq sanaldi.
- [ ] Farq tekshirildi va izoh yozildi.
- [ ] Kassa yopildi va hisobot saqlandi.

### Menejer uchun

- [ ] Kutayotgan biletlar tekshirildi.
- [ ] Bilet narxi va miqdori tasdiqlashdan avval tekshirildi.
- [ ] Sotuvda xaridor ma’lumoti to‘liq kiritildi.
- [ ] Tur va xizmat yozuvlarida firma/valyuta tekshirildi.
- [ ] Kunlik savdo hisobot bilan solishtirildi.

### Firma administratori uchun

- [ ] Dashboard va qarzdorlik tekshirildi.
- [ ] Kassa holati va kassir biriktirilishi tekshirildi.
- [ ] Hodim va login ruxsatlari dolzarbligi tekshirildi.
- [ ] Noto‘g‘ri yozuvlar maxsus tuzatish orqali qaytarildi.
- [ ] Hisobot va eksportlar saqlandi.

### Superadmin uchun

- [ ] Monitoringda muammoli firma/kassalar tekshirildi.
- [ ] Adminning firma ruxsatlari tekshirildi.
- [ ] Obuna muddati yaqin firmalar ko‘rib chiqildi.
- [ ] Audit logda o‘chirish va tuzatishlar tekshirildi.
- [ ] Kassa qayta ochish yoki boshqa favqulodda tuzatishlar sabab bilan bajarildi.
- [ ] Umumiy moliyaviy hisobot tekshirildi.

## 24. Kimga murojaat qilish kerak?

Supportga yozganda quyidagilarni yuboring:

- foydalanuvchi emaili va firma nomi;
- sahifa nomi;
- bajarilgan amal;
- sana-vaqt;
- ko‘ringan xato matni;
- moliyaviy holatda summa va valyuta;
- maxfiy ma’lumotsiz skrinshot.

Parol, Telegram bot tokeni, server kaliti yoki boshqa maxfiy ma’lumotni yubormang.

---

Ushbu qo‘llanma foydalanuvchi uchun amaliy hujjatdir. Texnik API, ma’lumot modeli va deploy tafsilotlari uchun `WORKFLOW_DOCUMENTATION.md`, `AI_QUICK_FIX_GUIDE.md` va `FINAL_RELEASE_PLAN.md`dan foydalaniladi.
