# Worms Zone: Sistem Mimarisi ve Geliştirme Planı

Bu belge, **[Worms.zone](https://worms.zone/game/web/)** benzeri, devasa çok oyunculu (MMO) ve gerçek zamanlı bir "Snake/Worm" (Yılan) oyununun sistem mimarisini ve bu projenin benim (Antigravity) yeteneklerimle nasıl sıfırdan inşa edileceğini detaylandırmaktadır.

---

## 1. Sistemin Genel Analizi (Worms Zone Nedir?)

Worms Zone, oyuncuların bir arenada yiyecek toplayarak büyüdüğü, diğer oyuncuları tuzağa düşürerek yok etmeye çalıştığı gerçek zamanlı bir tarayıcı (ve mobil) oyunudur. 
Temel teknik gereksinimleri şunlardır:
- **Düşük Gecikme (Low Latency):** Akıcı bir hareket ve çarpışma tespiti için hayati önem taşır.
- **Yüksek Performanslı Rendering:** Ekranda binlerce yiyecek ve çok sayıda uzun solucanın 60 FPS'te çizilmesi (WebGL).
- **Sunucu Otoriteli Mimari (Server-Authoritative):** Hileleri engellemek için tüm hareket, çarpışma ve büyüme mantığının sunucuda doğrulanması.
- **Optimizasyon:** Yüzlerce nesnenin çarpışma testlerini optimize etmek için Uzamsal Bölümleme (Spatial Hashing / QuadTree).

---

## 2. Teknoloji Yığını (Tech Stack)

Sistemin tam aynısını ve hatta daha modern bir versiyonunu yapmak için aşağıdaki modern teknoloji yığınını kullanacağız:

### Frontend (İstemci)
* **Oyun Motoru:** `PixiJS` (v8) veya `Phaser` - WebGL tabanlı çok hızlı 2D rendering sağlar. Binlerce nesneyi ekranda kasmadan çizebiliriz.
* **Arayüz (UI) & Yönlendirme:** `Next.js` (React) veya `Vite + React` - Ana menü, skor tablosu, mağaza, giriş ekranı ve skin (görünüm) seçimi için.
* **Ağ İletişimi:** `Colyseus.js` veya `Socket.io-client` - Sunucu ile WebSocket üzerinden gerçek zamanlı veri akışı için.
* **Stil:** `Tailwind CSS` veya Saf `CSS/SCSS` - Modern ve dinamik menü tasarımları için.

### Backend (Oyun Sunucusu)
* **Oyun Sunucusu Framework'ü:** `Colyseus` (Node.js/TypeScript) - MMO oyunlar için özel tasarlanmış, oda (room) tabanlı, delta-state (sadece değişen veriyi gönderme) senkronizasyonu sağlayan harika bir framework'tür.
* **Fizik ve Çarpışma:** Sunucu tarafında özel olarak yazılmış matematiksel vektör işlemleri ve *Spatial Hash Grid* (Uzamsal Bölümleme).
* **Dil:** `TypeScript` - Hem client hem sunucu tarafında tiplerin uyuşması ve hatasız kodlama için.

### Veritabanı ve Auth (Kalıcı Veri)
* **Backend as a Service:** `Supabase` (PostgreSQL) - Kullanıcı kayıtları, hesap bilgileri, en yüksek skorlar, satın alınan skinler ve jeton/altın verilerini güvenli tutmak için.

---

## 3. Antigravity ile Bu Sistemi Nasıl Yaparız? (Adım Adım Geliştirme Süreci)

Ben, bir Agentic AI olarak, bu projeyi baştan sona modüller halinde kodlayabilirim. Bu devasa sistemi parçalara ayırarak adım adım inşa edeceğiz:

### Faz 1: Proje Kurulumu ve Altyapı
1. **Monorepo Kurulumu:** Hem frontend hem de backend kodlarını barındıracak bir Turborepo veya NPM Workspace yapısı kurarım.
2. **Colyseus Sunucusunun Başlatılması:** Oyuncuların bağlanabileceği temel bir WebSocket oyun odası (ArenaRoom) oluştururum.
3. **Next.js + PixiJS Entegrasyonu:** React arayüzünün içine PixiJS Canvas'ını gömerek, menüden oyuna geçiş altyapısını hazırlarım.

### Faz 2: Çekirdek Oyun Döngüsü ve Hareket (Core Loop)
1. **İstemci (Client) Girdileri:** Mouse veya dokunmatik kontrollerin sunucuya anlık (Tick-rate bazlı) iletilmesi.
2. **Sunucu Otoriteli Hareket (Server Reconciliation):** Sunucuda solucanların hız ve açılarının hesaplanıp yeni pozisyonlarının belirlenmesi.
3. **İstemci Tahmini (Client-side Prediction):** Ağ gecikmesini hissettirmemek için solucanın oyuncu ekranında yumuşak (smooth) şekilde ilerlemesi (Interpolation).

### Faz 3: Fizik, Çarpışma ve Büyüme Sistemi
1. **Uzamsal Algoritma (Spatial Hashing):** Haritayı ızgaralara bölerek sadece yan yana olan solucanların ve yiyeceklerin çarpışmasını hesaplama (Performans için kritik).
2. **Yiyecek (Food) Mekaniği:** Haritada rastgele yiyeceklerin belirmesi, solucanın ağzı yiyeceğe değdiğinde sunucunun yiyeceği silip solucanı büyütmesi.
3. **Ölüm ve Loot Mekaniği:** Bir solucanın kafası başka bir solucanın gövdesine çarparsa oyun biter. Ölen solucanın vücut parçaları büyük boyutlu yiyeceklere dönüşür.
4. **Hızlanma (Boost):** Mouse'a tıklandığında solucanın hızlanması ancak karşılığında boyutundan küçülerek arkasında yiyecek bırakması.

### Faz 4: Yapay Zeka (Botlar)
* Gerçek oyuncuların olmadığı anlarda veya haritayı kalabalık tutmak için basit davranış ağaçlarına (Behavior Trees) sahip botların sunucu tarafında kodlanması. 
* *Hedef bulma, diğer yılanlardan kaçma, yiyeceklere yönelme.*

### Faz 5: UI/UX, Meta-Oyun ve Optimizasyon
1. **HUD:** Minimap (mini harita), anlık skor, liderlik tablosu (Leaderboard).
2. **Mağaza ve Özelleştirme:** Supabase entegrasyonu ile oyuncunun kazandığı altınlarla yeni yüzler, renkler ve desenler alması.
3. **Culling (Görüş Alanı Renderlama):** Kameranın görmediği alanlardaki çizimlerin PixiJS tarafında kapatılarak (culling) tarayıcı performansının artırılması.

---

## 4. Hemen Başlamak İçin İlk Adımlarımız

Eğer bu mimariyi onaylıyorsan, projeyi klasöründe oluşturmaya başlayabiliriz. İzleyeceğim ilk komut zinciri şu şekilde olacaktır:

1. **Backend (Colyseus) Kurulumu:** Ağ iletişimi için.
2. **Frontend (Vite/Next + PixiJS) Kurulumu:** Oyun ekranı için.
3. **İlk Bağlantı Testi:** Ekranda sadece hareket eden bir daire (solucan kafası) ve bunun sunucuyla eşzamanlı çalışması.

*Başlamak için bana **"Faz 1'i başlat"** veya **"Altyapıyı kurmaya başla"** demen yeterlidir.*
