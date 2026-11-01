# 💬 Çat — 2 nəfərlik WhatsApp kimi mesajlaşma

Bir səhifəlik, login/parolsuz çat. Linkə basan adını yazır və dərhal yazışır.

- ✓ göndərildi, ✓✓ çatdırıldı, **mavi ✓✓ oxundu** (WhatsApp kimi)
- "onlayn", "yazır…", "son görülmə" statusu
- Uzun mesajlar (50 000 simvola qədər), çox uzun olanlar "Daha çox oxu" ilə açılır
- 40 smaylik paneli
- Mesajlar silinmir (verilənlər bazası qaydaları silməyə icazə vermir)
- Tez işləyir: son 60 mesaj yüklənir, yuxarı sürüşdürdükcə köhnələr gəlir; mesajlar telefonda keşlənir
- Linklər kliklənir, gecə rejimi avtomatik

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
