# Changelog

All releases use [Semantic Versioning](https://semver.org/):

- `PATCH` (`1.0.1`): backward-compatible bug fix, permission correction, or regression guard.
- `MINOR` (`1.1.0`): backward-compatible feature or workflow expansion.
- `MAJOR` (`2.0.0`): breaking API, data, or workflow change.

Every update must have a version, a changelog entry, and a passing release audit before deployment.

## [1.10.0] - 2026-08-27

### Security

- Authenticator ilovasi va recovery code oqimi olib tashlandi. Noma'lum qurilmada paroldan keyin 10 daqiqalik, 5 urinish bilan cheklangan email tasdiqlash kodi talab qilinadi; ulangan Telegramga ham ayni kod yuboriladi.
- Tasdiqlangan qurilma 30 kunlik `HttpOnly`, `Secure`, `SameSite=Strict` cookie bilan eslab qolinadi. Token har muvaffaqiyatli kirishda almashtiriladi va parol, rol, firma ruxsati yoki xodim-login holati o'zgarganda bekor qilinadi.
- Login va invite accept APIlaridagi Bearer token javobi olib tashlandi; brauzer va auditlar faqat cookie sessiyasidan foydalanadi. Invite qabul qilingandan keyin yangi foydalanuvchi alohida sign-in va qurilma tasdiqlashidan o'tadi.
- Production deploy SMTP sozlamasisiz to'xtaydi; login kodlari bazada server secret bilan HMAC hash ko'rinishida saqlanadi va audit loglariga yozilmaydi.

### Fixed

- Himoyalangan sahifa sessiya tekshiruvidan oldin bir lahza ko'rinib qolmasligi uchun global, opaque auth hydration wall qo'shildi.
- Login sahifasi noma'lum qurilmada faqat email/Telegram kodi bosqichini ko'rsatadi; tanilgan qurilmada keyingi kirish faqat parol bilan davom etadi.

### Verification

- Kodning bir martalik sarflanishi, noto'g'ri urinish limiti, ticket purpose, trusted-device cookie atributlari va token rotatsiyasi unit/regression testlari bilan himoyalandi.
- Browser smoke himoyalangan dashboard markup'i redirectdan oldin ko'rinmasligini va tasdiqlangan qurilma keyingi loginda kodni o'tkazib yuborishini tekshiradi.

## [1.9.0] - 2026-08-26

### Added

- ADO-SYSTEM kengayishi uchun mavjud holat, yetishmayotgan qismlar va bosqichlar `ADO_SYSTEM_EXPANSION.md` gap matrixida qayd etildi.
- Productiondagi `Firm` modeli ma’lumotni xavfli ko‘chirmasdan ADO-SYSTEM organization tenant sifatida saqlanishi ADR bilan belgilandi.
- Login va canonical sessiya foydalanuvchining platform/firm rolidan serverda hisoblangan modul capability ro‘yxatini qaytaradi; dashboard menyusi shu ro‘yxat bo‘yicha ko‘rinadi.

### Compatibility and verification

- Eski backend bilan rolling deploy paytida frontend avvalgi aniq rol matrixiga qaytadi; yangi backenddan kelgan noma’lum capability qiymatlari qabul qilinmaydi.
- `SUPERADMIN`, `ADMIN`, `FIRM_ADMIN`, `MANAGER`, `KASSIR` va `OMBOR_MUDIRI` menyu contractlari unit test va server/client TypeScript tekshiruvi bilan himoyalandi.

## [1.8.2] - 2026-08-25

### Security

- Platform adminlar uchun MFA oqimi qo‘shildi: TOTP sozlash/tasdiqlash, login paytida MFA ticket, recovery code bilan kirish, audit yozuvlari va MFA sozlanmaguncha admin APIlarini bloklash.
- Noto‘g‘ri login urinishlari qisqa muddatli lockout bilan cheklanadi; backup skripti encrypted dump va kichik VPS uchun count-based retentionni qo‘llaydi.
- Eskiz VPS uchun yengil `ufw`, `fail2ban` va PM2 logrotate baseline skripti qo‘shildi; skript default holatda dry-run bo‘lib qoladi.
- Web sessiyasi JavaScript o‘qiy olmaydigan `HttpOnly`, `Secure`, `SameSite=Strict` cookie transportiga o‘tkazildi; eski `localStorage` tokenlari brauzer ishga tushganda o‘chiriladi.
- Cookie bilan bajariladigan barcha o‘zgartirish so‘rovlari maxsus CSRF headerini talab qiladi; ruxsat etilgan tashqi API va release auditlari uchun Bearer token transporti saqlab qolindi.
- Sahifa yangilanganda joriy foydalanuvchi serverdagi canonical sessiyadan tiklanadi, logout cookie’ni server javobida o‘chiradi va parol almashtirilganda joriy sessiya yangilanib, qolgan sessiyalar bekor qilinadi.

### Verification

- Cookie parsing/options, cookie-authenticated read, CSRF bloklash va ruxsat berilgan mutation uchun regressiya testlari qo‘shildi.
- Critical browser smoke login javobida token yo‘qligini, `localStorage` bo‘shligini va sessiya cookie’sining `HttpOnly`, `Secure`, `SameSite=Strict` atributlarini tekshiradi.

### Fixed

- Kassa ma’lumotlari parallel yangilanganda kech kelgan eski javob yangi karta yoki boshqa joriy holatni ekrandan yo‘qotib qo‘yishi to‘xtatildi.

## [1.8.1] - 2026-08-25

### Security

- Backend dev va production portlari faqat loopback interfeysida tinglaydi; login endpointi Nginx rate limit bilan himoyalandi va barcha statik/API javoblariga HSTS, CSP hamda boshqa xavfsizlik headerlari qo‘shildi.
- JWT faqat `HS256`, aniq issuer va audience bilan tekshiriladi; har bir so‘rovda foydalanuvchining joriy roli, firma scope’i, statusi va session versiyasi bazadan qayta olinadi.
- O‘chirilgan yoki to‘xtatilgan foydalanuvchi tokenlari rad etiladi, parol almashtirilganda oldingi sessiyalar darhol bekor qilinadi va sessiya muddati 8 soatga qisqartirildi.
- Xodimga yaratilgan login endi xodim yozuviga bevosita bog‘lanadi; xodimni to‘xtatish yoki o‘chirish loginni shu tranzaksiyada bekor qiladi.
- Yangi, reset va invite parollari uchun minimum uzunlik 12 belgiga oshirildi; transaction sahifalash limiti 500 bilan cheklandi.
- Production chat yozuvlari uchun encryption key majburiy qilindi va runtime dependency auditdagi qolgan advisory yangilandi.

### Verification

- Canonical account authorization, inactive/revoked sessions, employee-login lifecycle va parol siyosati uchun regressiya testlari qo‘shildi.
- Dev release fixture eski tokenning parol resetidan keyin `401` bo‘lishini va xodim-login bog‘lanishini live API orqali tekshiradi.

## [1.8.0] - 2026-08-06

### Added

- Xizmatlar sahifasiga mavjud firmalararo xizmatni sotish/ajratish amali qo‘shildi.

### Fixed

- Tur sotuvchisining pudratchi firmalari faqat shu firma bilan bog‘liq counterparty doirasida ko‘rsatiladi.
- Manfiy chegirma summasi narx ustamasi sifatida qabul qilinadi.
- Kassa yopish formasi kutilgan UZS va USD qoldiqlarini avtomatik to‘ldiradi.

## [1.7.2] - 2026-08-01

### Fixed

- Kassa chiqimida `ISH HAQI` kabi katta harf bilan qidirilgan xarajat kategoriyasi endi yashirinib qolmaydi; kategoriya tanlanib, to‘lovni qayd etish mumkin.

### Added

- Ombor → Sozlamalar sahifasida firma doirasidagi o‘lchov birligini qo‘shish, tahrirlash va ishlatilmayotgan birlikni nofaol qilish boshqaruvi qo‘shildi.
- O‘lchov birligi amallari backend ruxsati, tenant tekshiruvi va audit yozuvi bilan himoyalandi.

### Verification

- Playwright katta harfli kategoriya qidiruvini va firma admini nomidan o‘lchov birligi yaratilib ko‘rinishini, keyin test ma’lumoti tozalanishini tekshiradi.

## [1.7.1] - 2026-08-01

### Fixed

- Birinchi kassa hali yaratilmagan firmada “Asosiy kassa” va `K-01` endi placeholder emas, tayyor qiymat sifatida chiqadi; firma admini kassani darhol yaratib, tanlab ochishi mumkin.
- Loginli `KASSIR` xodim yaratilganda unga shu firma doirasida shaxsiy kassa atomar yaratiladi va login foydalanuvchisiga biriktiriladi; login ma’lumotsiz kassir yaratish backendda rad etiladi.
- Bo‘sh kassa holatida keyingi amallar aniq ko‘rsatildi, kassa va karta formalari browser-level tekshiruv uchun accessible nomlar bilan belgilandi.

### Verification

- Playwright firm admin nomidan kassa yaratish, uni ochish, karta qo‘shish, natijani jadvalda ko‘rish va test ma’lumotini tozalash oqimini tekshiradi.

## [1.7.0] - 2026-07-30

### Added

- Platform loginiga ega xodimlar uchun `OMBOR_MUDIRI` firm roli qo‘shildi.
- Ombor mudiri faqat Ombor sahifasi, qoldiq nazorati, hisobotlar va ombor operatsiyalariga kira oladi; boshqa modullar backendda `403` bilan bloklanadi.
- Hodim yaratish formasiga “Ombor mudiri” tanlovi va shu rol uchun majburiy login email/parol oqimi qo‘shildi.

### Verification

- Targeted RBAC testlari employee-to-login mapping, role normalization, ruxsat etilgan Ombor yo‘llari va taqiqlangan Employees/Kassa/Transactions yo‘llarini tekshiradi.

## [1.6.2] - 2026-07-29

### Changed

- Login sahifasidagi Telegram yordam havolasi `https://t.me/ADO_FINANCE` manziliga yangilandi.

## [1.6.1] - 2026-07-28

### Fixed

- Ombor kirim/chiqim qatorlarida “Mahsulot nomi”, “Soni”, “1 dona narxi” va hisoblangan “Jami summasi” aniq ko‘rsatildi; kategoriya tanlovi mahsulot ro‘yxatini filtrlaydi.
- Mahsulotlar va kategoriyalar uchun tahrirlash hamda tarixiy harakatlarni saqlaydigan nofaol qilish amallari qo‘shildi.
- Pudratchilar tenant-safe tarzda mavjud “Firmalar” katalogidan tanlanadi; mahalliy yetkazib beruvchilar bilan eski oqim ham saqlandi.
- “Omborchi hisoboti” davr bo‘yicha kirim/chiqim, operator, qoldiq qiymati va firmaga ta’sir qilgan Inventory, Revenue hamda COGS ledger yozuvlarini ko‘rsatadi.
- Qoldiq nazoratida minimal qoldiq, kam qolgan va tugagan holatlar alohida ko‘rinadi.

### Verification

- Dev release audit Omborchi hisobotidagi mahsulot harakati va muvozanatli INVENTORY/ACCOUNTS_PAYABLE ta’sirini tekshiradi.

## [1.6.0] - 2026-07-28

### Added

- Mavjud firmalarga alohida biznes turi yaratmasdan, mahsulotlar, omborlar, partiyalar, kirim, chiqim, sotuv, qoldiq, rezerv, yetkazib beruvchi va mijozlarni boshqaradigan `Ombor` moduli qo‘shildi.
- Xarid, sotuv, ichki foydalanish, write-off, transfer va qaytarishlar mavjud `Transaction`, `JournalEntry` va `LedgerEntry` registrlariga atomar bog‘landi; sotuv daromadi va COGS alohida yoziladi.
- Moving weighted average tannarx, FEFO/FIFO tanlash, yaroqlilik nazorati, valyuta kursi snapshoti va database darajasida manfiy qoldiq himoyasi qo‘shildi.
- Firma bosh sahifasiga inventory aktivi, oylik xarid/sotuv, COGS, yalpi foyda va muddati o‘tgan partiyalar KPIlari qo‘shildi.

### Security and verification

- Har bir Ombor query va mutation backendda autentifikatsiya qilingan firmaning tenant scope’i bilan tekshiriladi; frontend yuborgan boshqa firma obyektlari rad etiladi.
- Dev fixture 10 dona, 100 000 UZS tannarxli mahsulot qoldig‘i va muvozanatli INVENTORY/ACCOUNTS_PAYABLE ledger yozuvini idempotent yaratadi.
- Prisma schema, server/client TypeScript, inventory matematikasi, API contract, release fixture va dev live audit release gate orqali tekshiriladi.

## [1.5.2] - 2026-07-27

### Fixed

- Kassa xarajat kategoriyalari faqat tanlangan firmadan olinadi; firma tanlanmaganda boshqa firmalarning standart kategoriyalari aralashib, bir necha marta takrorlanmaydi.
- SUPERADMIN Kassa formasida firma tanlovi chiqim yo‘nalishi va kategoriyadan oldinga ko‘chirildi.
- Eski firmalar uchun 20 ta standart xarajat kategoriyasini idempotent yaratadigan backfill dev va production deploy oqimiga qo‘shildi.
- Sozlamalarda tanlangan firmaning “Hozirgi xarajat turlari” ro‘yxati forma tepasiga chiqarildi, jami soni ko‘rsatildi va jadvaldagi inglizcha texnik sarlavhalar o‘zbekchalashtirildi.

### Verification

- Live release audit har bir ko‘rinadigan firmada kamida 20 ta va kodlari takrorlanmagan kategoriya borligini tekshiradi.
- Regression guard Kassa firma scope’i, Sozlamalar ro‘yxati va har ikki deploy skriptidagi kategoriya backfill’ni himoya qiladi.

## [1.5.1] - 2026-07-26

### Fixed

- Kassa chiqimida “Ish haqi va xodim to‘lovlari” tanlanganda tanlangan firmaga tegishli faol xodimlar ko‘rsatiladi; xodim va ish haqi kategoriyasi majburiy, backend esa boshqa firma yoki nofaol xodimni rad etadi.
- Xarajat kategoriyasi uzun ro‘yxatiga qidiruv qo‘shildi va ish haqi yo‘nalishida `SALARY` kategoriyasi avtomatik tanlanadi.
- Reys moliyaviy kartalarida bilet soni uch marta takrorlanishi olib tashlandi: umumiy son bir marta, valyuta summalari alohida ko‘rsatiladi.
- Moliyaviy sozlamalardagi texnik qiymatlar o‘zbekcha biznes nomlariga almashtirildi; murakkab buxgalteriya mappinglari alohida “Qo‘shimcha sozlamalar” ichiga yig‘ildi va izohlar qo‘shildi.

### Verification

- Ish haqi chiqimi uchun kategoriya va xodim majburiyligi unit testi hamda firma doirasidagi faol QA xodimi live release fixture tekshiruvi qo‘shildi.

## [1.5.0] - 2026-07-26

### Added

- Mavjud kassa va tranzaksiya oqimlarini almashtirmasdan, tenantga bog‘langan xarajat kategoriyalari, subkategoriyalar, xarajat budjetlari va moliyaviy siyosat sozlamalari qo‘shildi.
- Bank hisoblari, valyutalararo o‘tkazma, bank komissiyasi, qarz to‘lovi, o‘zaro hisob-kitob va kompensatsiya uchun preview, posting va reversal APIlari qo‘shildi.
- Moliyaviy operatsiyalar uchun jurnal provodkalari va ledger yozuvlari atomar saqlanadi; qarz to‘lovi va ichki o‘tkazmalar foyda-zarar hisobotida xarajat sifatida takroran hisoblanmaydi.
- Kassadan chiqimda biznes yo‘nalishi, xarajat kategoriyasi, hujjat/sana/VAT rekvizitlari va budjet limiti nazorati qo‘shildi.
- Sozlamalarda xarajat kategoriyalari, budjetlar va hisob siyosati; hisobotlarda xarajatlar smetasi; bosh sahifada davr xarajati, budjet sarfi va tasdiq kutilayotgan operatsiyalar ko‘rsatkichlari qo‘shildi.

### Security and accounting

- Xarajat, budjet, bank hisoblari va qarz hujjatlari backendda firma bo‘yicha tekshiriladi; to‘liq bank hisob raqami saqlanmaydi, faqat maskalangan oxirgi to‘rt raqam qoladi.
- `APPLIED` moliyaviy operatsiya o‘chirilmaydi: noto‘g‘ri yozuv qarama-qarshi jurnal yozuvi yaratuvchi reversal orqali bekor qilinadi.
- Hisobotlar faqat `accountingTreatment=EXPENSE` bo‘lgan yozuvlarni P&L xarajatiga qo‘shadi; legacy tasniflanmagan kassa chiqimlari alohida ko‘rsatiladi.

### Verification

- Default kategoriya seed’i, double-entry ta’siri, valyutalararo hisob balansi, xarajat tasnifi, smeta matematikasi va API surface regressiya tekshiruvlari qo‘shildi.
- Prisma validate/generate, server va client typecheck, maqsadli Vitest testlari hamda lokal release audit orqali tekshiriladi.

## [1.4.0] - 2026-07-21

### Added

- SUPERADMIN kirish sahifasi editorida ikki tilli veb-sayt havolasi matni va xavfsiz `http/https` manzilini sozlay oladi; havola editor previewi va ommaviy login sahifasida ko‘rinadi.
- Chipta ajratmalari uchun nomlangan reys/firma, RT/OW, aralash narx, jami, faqat ajratmaga bog‘langan tasdiqlangan to‘lov, qarz, avans va to‘liq tarixli 9 ustunli moliyaviy jadval qo‘shildi.
- Ajratmani hard delete qilmasdan qisman yoki to‘liq biznes bekor qilish, sotilgan/turga band chipta himoyasi, portalga ega agent tasdig‘i, portalsiz avtomatik tasdiq, qarz qayta hisoblash, bildirishnoma va audit oqimi qo‘shildi.
- Tur sotuviga majburiy izoh, 0–100% chegirma, brutto/net/base snapshotlari, COGS va yalpi foyda hisoblari, 100% chegirma permission/tasdig‘i hamda kengaytirilgan sotuv jurnali qo‘shildi.
- Kassa kun tranzaksiyalari DTOsi va jadvaliga Kimdan/Kimga, maskalangan karta/bank, izoh va kiritgan xodim display maydonlari qo‘shildi.
- Kassa tranzaksiyasini kirim/chiqim, summa, valyuta/kurs, kassa, karta/bank, kontragent, reys, ajratma yoki tur paketi bo‘yicha atomar tahrirlash modali qo‘shildi.

### Fixed

- Firma reys yaratishda kiritgan tashqi aviakompaniya endi `AIRLINE` firma profiliga bog‘lanadi va kassa `Kimga` tanlovida ko‘rinadi; oldingi tashqi aviakompaniyalar ham reys egalariga xavfsiz bog‘lanadi.
- Bir xil tarixiy kassa importi qayta yuborilganda eski yozuvning `sourceMode` maydoni `HISTORICAL_IMPORT`ga idempotent tarzda tiklanadi.
- Reys bo‘yicha umumiy to‘lov endi ajratma qarziga tasodifan taqsimlanmaydi; faqat tasdiqlangan va aynan ajratmaga bog‘langan to‘lov qarzni kamaytiradi.
- Tranzaksiya tahriri va soft delete eski kassa/karta/bank hamda ajratma to‘lov ta’sirini takrorlamasdan qayta hisoblaydi; optimistic lock, tenant tekshiruvi, majburiy sabab va audit saqlanadi.
- Reys UUIDlari operator jadval va modallarida chiqarilmaydi, karta raqamlari transaction response’da faqat maskalangan ko‘rinishda qaytariladi.

### Verification

- Tashqi aviakompaniya uchun `AIRLINE` firma yaratish va barcha reys egasi firmalar bilan takrorsiz bog‘lash regressiya testi qo‘shildi.
- Ajratma moliyasi, mixed narx, partial cancel, sotilgan/turga band himoyasi, payment reassignment, tur chegirmasi/COGS/permission, karta masking va kassa balans correction regressiya testlari qo‘shildi.
- Prisma validate/generate, server test/build, frontend typecheck/build, dev release audit va production smoke release gate orqali tekshiriladi.

## [1.3.5] - 2026-07-21

### Fixed

- SUPERADMIN uchun to‘liq erkin chipta ajratmalarida `O‘chirish` amali ko‘rsatiladi va qarshi firma tasdig‘isiz auditli ravishda bajariladi.
- Eski RT migratsiyasida bir segment qabul qiluvchida, ikkinchi segment esa yuboruvchiga allaqachon qaytgan bo‘lsa, ajratma endi `0 ta erkin` deb noto‘g‘ri hisoblanmaydi.
- O‘chirilgan ajratma `CANCELLED` tarixiy holatda saqlanadi, ammo operatsion “Chipta ajratmalari” jadvalidan yo‘qoladi; sotilgan, turga band yoki boshqa ajratmaga o‘tgan segmentlar o‘chirilmaydi.

### Verification

- Unit regressiya testi xavfsiz legacy RT holatini o‘chirish mumkinligini va boshqa ajratmadagi segmentni o‘chirish bloklanishini tekshiradi.
- Dev release fixture SUPERADMIN capability, avtomatik tasdiq, jadvaldan yo‘qolish va ikkala segmentning yuboruvchiga qaytishini live API orqali tekshiradi.

## [1.3.4] - 2026-07-20

### Fixed

- Eski migratsiyadan qolgan aralash RT segment holatida ajratmani rad etish endi `Allocation segment state is inconsistent` xatosi bilan to‘xtamaydi.
- Rad etish faqat aynan shu ajratmada `PENDING_ALLOCATION` bo‘lib turgan segmentlarni yuboruvchi firmaga qaytaradi; boshqa firma egaligiga o‘tgan segmentlarni o‘zgartirmaydi.
- Ajratmaning eskirgan aktiv segment yozuvlari rad etilgan deb yopiladi va ota bilet holati amaldagi segmentlardan qayta hisoblanadi.

### Verification

- Unit regressiya testi aralash OUTBOUND/RETURN holatida faqat tegishli segment tiklanishini tekshiradi.
- Dev release fixture 2 ta RT biletli nomuvofiq ajratmani API orqali rad etib, OUTBOUND qaytganini va boshqa egadagi RETURN saqlanganini tekshiradi.

## [1.3.3] - 2026-07-18

### Fixed

- Platform adminlari xizmat inventarida faqat o‘ziga biriktirilgan firmalarning yozuvlarini ko‘radi; boshqa yoki faqat aloqador firmaning xizmatlari endi chiqmaydi.
- Adminlar ekranida `ADMIN` platforma roli ekani va firma administratori `FIRM_ADMIN` sifatida Firmalar bo‘limidan yaratilishi aniq ko‘rsatildi.

### Verification

- Release fixture biriktirilgan platforma admini uchun ruxsatli va ruxsatsiz firma xizmatlarini alohida tekshiradi.

## [1.3.2] - 2026-07-18

### Fixed

- Kassa `To‘lov qo‘shish` formasidagi airline/firma tanlovi `Kimga (to‘lov oluvchi)` sifatida yoziladi; kassa firmasi to‘lovchi bo‘lib, naqd yoki karta qoldig‘i kamayadi.
- `PAYMENT` kassa jami endi to‘lovchi va oluvchi firmaga qarab kirim/chiqimni ajratadi; mijozdan kelgan to‘lov kirim bo‘lib qoladi.
- Chiquvchi to‘lov operatsion kassa/karta hisobiga `sourceAccountId`, kiruvchi to‘lov esa `destinationAccountId` bilan bog‘lanadi.

### Verification

- Regression testi kassa firmasidan airline’ga to‘lovni `OUT`, mijozdan kassa firmasiga to‘lovni `IN` deb tasdiqlaydi.
- Dev release fixture airline uchun reysli `PAYMENT` yozuvini va USD kassa chiqim summasini live API orqali tekshiradi.

## [1.3.1] - 2026-07-18

### Fixed

- Kassa kirim/chiqim formasida backendda allaqachon qo‘llangan ixtiyoriy reys tanlovi ko‘rinadigan qilindi.
- Agent va Debitor/Kreditor hisobotlari `PAYMENT` bilan birga nomlangan `KASSA_IN/KASSA_OUT` to‘lovlarini ham qarzdan ayiradi va ikki yo‘nalishdagi to‘lov tafsilotlarini ko‘rsatadi.
- Firmaga tegishli reys inventari tannarxi airline oldidagi xarid qarzi sifatida, xizmat xaridi va assignmentlari esa tegishli kreditor/debitor sifatida hisoblanadi.
- Bosh sahifa transaction-only yig‘indilar o‘rniga bir xil agent ledger raqamlarini ishlatadi va eng yaqin 5 reys, eng katta debitorlar hamda kreditorlarni ko‘rsatadi.

### Verification

- Ledger regression testi reys va xizmat xaridi, kiruvchi kassa to‘lovi va chiquvchi kassa to‘lovining joriy qarzga ta’sirini tekshiradi.
- Dev release fixture airline xaridi va reysga bog‘langan `KASSA_OUT` to‘lovini API orqali tekshiradi.

## [1.3.0] - 2026-07-18

### Added

- Added a named `Kimdan (to‘lovchi)` firm selector to Kassa payments and persist the selected payer/receiver pair without expanding tenant access.
- Added an Agent ledger matching the operator spreadsheet: old balance, total tickets, total tours, sales, payments, real balance, and click-through flight/ticket/tour purchase details.
- Added named current receivable and payable tables so firms that owe us and firms we owe are shown separately with their current debt per currency.
- Added edit and delete controls for sold tours; corrections atomically update the linked sale, financial transaction, ticket legs, service reservations, package stock, and audit log.

### Verification

- Added unit coverage for agent balance math and complete RT-pair selection during sold-tour corrections.
- Added a versioned dev fixture with an accepted allocation, prior balance, and named agent payment for live report verification.
- Prisma validation/generation, 103 server tests, backend build, frontend typecheck, and production frontend build pass locally.

## [1.2.3] - 2026-07-17

### Fixed

- Kassa cash movements now accept a firm shown in the counterparty selector without granting access to that firm's private accounts, desks, employees, or transactions.
- Kept the operating-firm and kassa-desk checks tenant-scoped; only the selected counterparty reference uses the existing related-firm visibility rule.

### Verification

- Reproduced the previous `403 Counterparty is not accessible` response with a real related firm on dev.
- Extended the five-role kassa workflow audit to create a cash row with a related counterparty, verify the saved counterparty ID, soft-delete the row, and confirm it immediately disappears.
- Serialized the five-role browser smoke in CI and allowed slow post-audit authentication to settle without weakening its API 5xx or application-error assertions.

## [1.2.2] - 2026-07-17

### Fixed

- Removed the permanently open Tour sale form from every table row; the table now shows one clear `Sotish` button and opens a spacious sale dialog only for the selected package.
- `Bekor qilish`, the close button, and the dialog backdrop now discard the sale draft and return to the regular Tour table without writing data.
- Buyer, quantity, price, and USD exchange-rate controls use the responsive operation grid inside the dialog, so labels and fields cannot overlap in the table's right-hand columns.

### Verification

- Browser-verified at 1440px and 390px that table rows contain no sale inputs, the dialog opens, Confirm starts disabled, and Cancel/close remove the dialog.
- Separately verified that `Xizmat qo‘shish` opens its form and its own Cancel button restores the regular Tours screen.
- The release gate retries transient npm advisory transport failures while still failing persistent vulnerability results.

## [1.2.1] - 2026-07-17

### Fixed

- Rebuilt the add and edit forms in Transactions, Tours, and Services around a reusable 12-column operation layout: names, firms and flights receive wide fields, numeric controls stay compact, and notes/details use full-width multi-line areas.
- Corrected the mobile grid priority bug that compressed quantity, currency, status, previews, text areas, and action buttons into narrow slivers instead of full-width phone controls.
- Transaction account, payment, and cash work areas now use intentional collapsible sections; tour service selection and selling use labeled multi-row layouts instead of crowded one-line table controls.
- Enlarged service edit/delete controls and tour row actions to accessible action-button sizes without changing their permissions or business behavior.

### Verification

- Captured and inspected the actual create forms at 1440px and 390px, including Services, Tours, and Transactions payment entry.
- Added release guards for the shared operation-form primitive, the high-specificity mobile override, and full-width long-text fields in all three panels.

## [1.2.0] - 2026-07-17

### Changed

- Rebuilt the shared UI foundation as an aviation operations desk with flight-deck navy, runway blue, signal amber, stronger status colors, clearer surface hierarchy, and a restrained route-grid signature.
- Replaced the mixed display/body typography with operational headings, a highly readable interface face, and tabular mono-spaced financial values.
- Increased form controls to 44–48px, widened adaptive form columns, protected long select values, and made mobile fields and action footers fit without clipped text.
- Reworked the dashboard shell, navigation, cards, tables, Kassa panels, financial accounts, metrics, and action buttons around reusable semantic styles instead of page-specific glass treatments.

### Accessibility

- Added a keyboard skip link, visible shared focus treatment, reduced-motion behavior, touch-action handling, clearer field labels, semantic section elements, and stable image dimensions.
- Verified the redesigned Kassa, transactions, tours, flights, and dashboard surfaces in dark and light themes at desktop and 390px mobile widths.

### Verification

- Added recurring guards for the design tokens, responsive control grid, reduced-motion support, semantic shell, and section-card primitives.
- The changed frontend passes targeted ESLint and the full production Next.js build/typecheck.

## [1.1.3] - 2026-07-17

### Fixed

- Create, edit, import, payment, Kassa, ticket-allocation, ticket-sale, tour, service, chat, password, and access drafts now expose explicit Cancel and Confirm controls.
- Cancel clears or restores the current draft even when its required fields are incomplete; Confirm stays disabled until native field constraints and the relevant business rules both pass.
- Kassa and ticket operations now validate positive amounts, valid currencies and exchange rates, matching cards, required firms/desks/dates, inventory limits, and audit reasons before allowing confirmation.
- Ticket deallocation copy now reflects the allocation policy: inventory returns without creating an allocation transaction.

### Verification

- Added release guards requiring the shared validity-aware action controls on every main mutation surface and explicit validity guards for allocation, single-ticket sale, and batch sale confirmations.
- The changed UI passes targeted ESLint with zero errors and the full production Next.js build/typecheck.

## [1.1.2] - 2026-07-17

### Fixed

- Round-trip tour reservation and ticket allocation no longer use PostgreSQL's reserved `RETURNING` keyword as a raw-SQL alias.
- Agency-owned ticket inventory can be allocated firm-to-firm without an unrelated airline-connection error; the connection requirement remains enforced when the airline firm allocates its own origin inventory.

### Verification

- The release guard rejects the reserved SQL alias and requires the allocation controller to use the shared airline-owner connection policy.

## [1.1.1] - 2026-07-17

### Recovered

- Restored genuine manually entered Kassa and payment transactions from the verified pre-incident production backup while excluding every automatic ticket-allocation and service-inventory transaction.

### Safety

- Transaction and daily-cash deletion now only sets `status=DELETED` and `deletedAt`; transaction rows, ledger links, payment allocations, and business-document links are never physically deleted.
- Deleting a service also soft-deletes its historical transaction without destroying either record or their relationship.
- Financial reporting ignores payment allocations whose payment transaction is soft-deleted.
- The release gate now fails if runtime server code contains `transaction.delete()` or `transaction.deleteMany()`.

### Verification

- Added a focused soft-delete regression test and retained the live create-read-delete-read Kassa check, which requires a deleted row to disappear from all visible results.

## [1.1.0] - 2026-07-17

### Added

- Kassa operators can download a desk-bound Uzbek Excel template and upload up to 500 historical cash income/expense rows with their original business dates.
- The Kassa panel previews every row before writing and reports invalid dates, amounts, currencies, exchange rates, duplicate IDs, and closed or missing Kassa days.

### Safety

- Every imported row has a firm-and-desk-scoped idempotency key, so uploading the same completed template again does not create duplicate transactions.
- A batch with any invalid row writes nothing; imported rows are ordinary auditable Kassa adjustments and never create ticket-allocation, tour, or service transactions.
- The template is bound to the selected firm and Kassa desk, tenant scope is enforced again on the server, and read-only superadmins do not see the import control.

### Verification

- Added parser tests and a versioned dev fixture that validates preview, commit, preserved historical date/source, and idempotent re-upload through the live API.

## [1.0.8] - 2026-07-17

### Fixed

- A closed Kassa day no longer displays a delete action that the server must reject; the panel now tells the operator to reopen that exact day before changing its financial records.
- Successfully deleted Kassa income/expense rows disappear immediately from the day transaction list and its recalculated totals.

### Verification

- Added a live create-read-delete-read Kassa workflow check that requires the new row to appear before deletion and be absent immediately afterward.

## [1.0.7] - 2026-07-17

### Added

- Superadmins can create another superadmin as a strictly read-only account. It keeps the same cross-platform visibility but cannot create, update, delete, change passwords, or trigger any other mutation.
- The Admins panel shows and manages the read-only flag, while read-only operators see a persistent view-only banner and no global operation launcher.

### Safety

- Mutation authorization checks the account's current database flag on every non-read request, so an older login token cannot bypass a newly applied restriction.
- The platform refuses to demote, delete, or make read-only the final writable superadmin.
- Added a dev release fixture that verifies read access across admins, Kassa, transactions, and reports, plus enforced 403 responses for create, update, password-change, and delete attempts.

## [1.0.6] - 2026-07-17

### Fixed

- Kassa opening now carries each currency from the latest earlier business day that has a usable remainder, skipping closed days whose remainder is missing; a true first day starts at zero.
- Superadmin, assigned admin, firm admin, manager, and assigned kassir can open, close, and reopen past Kassa days without unexpected 403 responses.
- Kassirs are strictly limited to their assigned active desk across Kassa sessions, payments, transactions, cards, and history.
- Kassa history is now tenant- and desk-scoped, historical card balances exclude future payments, and daily cash corrections work on the selected open past day.
- Payment-card removal again supports the card creator while retaining superadmin and owning firm-admin access; deleted cards and transactions remain hidden.

### Verification

- Added a five-role live Kassa workflow audit covering panel access, past-day open/close/reopen, history isolation, carry-forward fallback, and the intentional wrong-desk denial.

## [1.0.5] - 2026-07-17

### Fixed

- Ticket allocations, allocation corrections, service inventory creation, and service-to-tour reservations no longer create financial transactions or inflate reports.
- Existing allocation/service setup rows are excluded from Transactions, Kassa, account balances, search, dashboards, and every report; deleted transactions are consistently excluded from all of those surfaces.
- Platform admins, firm admins, managers, and assigned kassirs now have matching client/server kassa operation rights instead of receiving unexpected 403 responses.
- A service added from the Tours page is immediately available and selected as a tour component, with the current flight preselected when possible.

### Safety

- Added a non-destructive migration that soft-deletes legacy inventory-only transaction rows while preserving their audit history.
- Replaced the old allocation-payable invariant with a deployment audit that requires zero active inventory-only financial rows.

## [1.0.4] - 2026-07-15

### Added

- Every dev deployment now runs an idempotent QA seed tied to the current release version.
- Added 1.0.4 fixtures for an allocated null-status flight, its single allocation payable, a no-login expired-firm kassa desk, a historical closed kassa day, and a partner-owned service isolation case.
- Added a live dev seed audit that verifies the fixture through source-firm, allocated-firm, and superadmin API views.
- Stabilized the 721-probe live endpoint audit for the small dev host by lowering default concurrency and retrying transport interruptions once without retrying HTTP failures.

### Safety

- The QA seed requires explicit dev-deploy opt-in and refuses any database URL other than the dedicated `airline_b2b_dev` database.
- The release audit fails when `VERSION` and the release fixture version differ, forcing each future update to include fitting dev test data.

## [1.0.3] - 2026-07-15

### Added

- Added a partial PostgreSQL unique index that enforces one active confirmed payable per ticket allocation for every firm.
- Added a post-deploy business-invariant audit that blocks a backend release when an accepted allocation has a missing, duplicate, or wrong-total payable.
- Added recurring release guards for shared flight lifecycle scope, kassa desk visibility, service owner isolation, tenant cache reset, and allocation transaction cardinality.
- Extended live tenant isolation auditing to purchased services.

### Changed

- All flight, report, service, tour, and ticket allocation consumers now reuse the shared active-flight predicate.
- Authentication identity changes clear the full React Query cache so data cannot carry between firms or roles.

## [1.0.2] - 2026-07-15

### Fixed

- Allowed authorized kassa users to open or reopen any business date independently, including past dates, without later sessions blocking the operation.
- Kept active kassa desks visible in superadmin monitoring even when the firm has no active login or its subscription has ended; desk labels now lead with the desk code and name.
- Unified the active-flight predicate so legacy flights with a null status remain available in flights, tour creation, and service validation when the firm owns allocated inventory.
- Scoped purchased service inventory to its owner firm and isolated actor-specific React Query caches for flights, firms, employees, and admins.
- Enforced one payable transaction per ticket allocation and added an audited, idempotent repair for legacy per-ticket transaction rows.

### Verification

- Added regression coverage for nullable flight status, firm service isolation, kassa desk visibility, historical kassa operation, and allocation-level payable creation.

## [1.0.1] - 2026-07-15

### Fixed

- Separated related-firm directory visibility from tenant-owned operational access. A confirmed business relationship may expose a counterparty name, but no longer grants access to that firm's accounts, transactions, notifications, employees, or kassa data.
- Aligned route middleware with controller policy for superadmin chat settings/interactions, firm-only service creation, service edit/delete, and firm updates.
- Made production schema deploy fail closed: verified PostgreSQL backup first, and no automatic `--accept-data-loss`.
- Cleared runtime high-severity dependency advisories by updating Axios resolution, Next.js to `16.2.10`, and server transitive packages; remaining client advisories are moderate transitive `postcss`/`uuid` findings whose automated fixes are breaking downgrades.

### Added

- Complete contract inventory for all 128 mounted API endpoints and five QA actors.
- Static client/server API-path drift audit covering 100 frontend API calls.
- Strict dev authentication, route-RBAC, safe controller, and read-endpoint probes.
- Live tenant-data isolation checks for firm admin, manager, kassir, and assigned admin scopes.
- Playwright smoke coverage for five-role login, navigation visibility, critical page loading, browser errors, and API `5xx` responses.
- Repeatable release audit, version consistency check, and expanded recurring-mistakes checklist.

## [1.0.0] - 2026-07-15

- Named baseline release for the existing ADO B2B flights, ticket inventory, allocations, tours, services, firms, kassa, transactions, reports, employees, chat, and notification workflows.
