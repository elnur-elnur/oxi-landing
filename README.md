# 💬 Çat — 2 nəfərlik WhatsApp kimi mesajlaşma

Bir səhifəlik, login/parolsuz, yalnız iki nəfərlik çat: **Elish** 🐺 və **Nurush** 🌹.
Link: **https://menim-icadim.web.app** (dəyişmir). Linki ilk açan cihaz avtomatik Elish olur, ikinci açan Nurush. Ad və profil şəkli sabitdir, dəyişdirilmir.
Heç nə soruşulmur: Elish tutulandan sonra linki açan hər yeni cihaz avtomatik Nurush olur.
Elish öz başqa cihazından girmək üçün linkin sonuna `#elish` yazır (bir dəfə; sonra yadda qalır).

**Hesabat:** yuxarıda qarşı tərəfin adına toxun — neçə dəfə girib, nə qədər qalıb, neçə mesaj oxuyub, hansı mesajlar oxunmayıb.
Terminaldan: `python3 tools/report.py` (gcloud application-default girişi lazımdır).

- ✓ göndərildi, ✓✓ çatdırıldı, **mavi ✓✓ oxundu** (WhatsApp kimi)
- "onlayn", "yazır…", "son görülmə" statusu
- Uzun mesajlar (100 000 simvola qədər); 1500 simvoldan uzunlar "Daha çox oxu ▼" ilə açılır, "Bağla ▲" ilə yığılır
- Nurush yeni IP-dən və ya yeni brauzerdən girəndə Elish-ə xəbərdarlıq çıxır (bloklanmır)
- 40 smaylik paneli
- 📎 **Şəkil göndərmək** (bir neçəsini birdən, şəkil altı yazı ilə; kompüterdə Ctrl+V ilə yapışdırmaq və sürükləyib atmaq da olur). Şəkillər avtomatik sıxılır, toxunanda tam ekranda açılır
- **Giriş / çıxış tarixçəsi:** yuxarıda qarşı tərəfin adına toxun — nə vaxt girib, nə vaxt çıxıb, neçə dəqiqə qalıb görünür
- Mesajlar silinmir (verilənlər bazası qaydaları silməyə icazə vermir)
- Tez işləyir: son 60 mesaj yüklənir, yuxarı sürüşdürdükcə köhnələr gəlir; mesajlar telefonda keşlənir
- Linklər kliklənir, gecə rejimi avtomatik

Şəkillər də Firestore-da saxlanılır (Firebase Storage pullu plan istədiyi üçün istifadə olunmur), ona görə əlavə heç nə qurmaq lazım deyil.

Hər şey **pulsuzdur**: verilənlər bazası Firebase Firestore (pulsuz Spark planı — 1 GB yer, gündə 50 000 oxuma / 20 000 yazma, 2 nəfər üçün kifayətdən çoxdur), hosting GitHub Pages və ya Firebase Hosting.

## Quraşdırma (10 dəqiqə)

### 1. Firebase layihəsi
1. <https://console.firebase.google.com> → **Add project** → ad ver (Google Analytics lazım deyil) → Create.
2. Sol menyu → **Build → Firestore Database** → **Create database** → yer: `eur3 (europe-west)` → **Start in production mode** → Enable.
3. Firestore-da **Rules** tabına keç, oradakını sil, bu repodakı [`firestore.rules`](firestore.rules) faylının içini yapışdır → **Publish**.
   > Vacib: "test mode" seçmə — o 30 gündən sonra bağlanır. Bizim qaydalar daimidir.
4. **Project settings** (⚙️) → **Your apps** → `</>` (Web) ilə app əlavə et → çıxan `firebaseConfig` məlumatlarını [`config.js`](config.js)-ə yapışdır.
5. `config.js`-də `room` adını qəribə bir şeyə dəyiş (məs. `elnur-x7k29q`) — linki bilməyən otağa düşə bilməsin.

### 2. Hosting (birini seç)

**A) GitHub Pages** — repo **public** olmalıdır (private üçün pullu plan lazımdır):
repo → **Settings → Pages → Source: GitHub Actions**. `main`-ə hər push-dan sonra sayt avtomatik yenilənir:
`https://<istifadəçi-adı>.github.io/<repo-adı>/`

**B) Firebase Hosting** — repo private qala bilər:
```bash
npm i -g firebase-tools
firebase login
firebase use --add        # layihəni seç
firebase deploy           # həm saytı, həm qaydaları yükləyir
```
Link: `https://<layihə-id>.web.app`

### 3. İstifadə
Linki aç, adını yaz, linki qarşı tərəfə göndər. Hər telefon/brauzer öz adını yadda saxlayır.
Adı dəyişmək üçün yuxarı sağdakı ⋮ düyməsi. Fərqli otaq üçün linkə `?r=otaq-adi` əlavə et.

Kompüterdə **Enter** göndərir, **Shift+Enter** yeni sətir. Telefonda Enter yeni sətirdir, göndərmək üçün yaşıl düymə.

## Fayllar
| Fayl | Nə üçün |
|---|---|
| `index.html`, `style.css`, `app.js` | Çatın özü |
| `config.js` | Firebase açarları və otaq adı |
| `firestore.rules` | Bazanın qaydaları (silmək qadağandır) |
| `firebase.json` | Firebase Hosting üçün |
| `.github/workflows/pages.yml` | GitHub Pages-ə avtomatik yükləmə |
