# Vema prezentér — proof of concept

Funkční ukázka aplikace pro obchodníky Vema: z jedné knihovny obsahu sestaví
prezentaci na míru zákazníkovi a z ní i **namluvené MP4 video**. Projekt vychází
z reálné prezentace **Seyfor Vema v1.4** a z dokumentu **Nabídka VZOR**.

> Data jsou veřejné informace Vema. Jediné, co se posílá mimo server, je text
> komentáře do Microsoft Edge TTS při generování videa.

## Co aplikace umí

1. **Výběr zákazníka** – organizace, segment (veřejná správa, zdravotnictví,
   školství, komerce), obchodník, datum, odkaz na Excel.
2. **Kolo oblastí** – 6 oblastí, kliknutím vyberete celou skupinu modulů.
   Konkrétní moduly jdou zapínat a vypínat v seznamu, hledat textem a filtrovat.
3. **Knihovna 30 modulů** – texty, odrážky a komentáře pro voice-over.
   Nový modul (např. připravovaný TRO) stačí přidat v administraci, kolo se
   přizpůsobí samo.
4. **Souhrnná obrazovka** – rozsah nabídky, odkaz na samostatnou cenovou nabídku
   (XLSX), volitelně ruční částka, poznámka.
5. **Pevné bloky Vema** – titul, o společnosti, reference, souhrn, kontakt.
6. **Reference** – originální slidy s logy zákazníků podle segmentu.
7. **Náhled prezentace** – všech slidů, včetně úpravy komentáře pro voice-over.
8. **Export PPTX** – plně editovatelný PowerPoint 16:9 (PptxGenJS). Komentáře
   jsou i v poznámkách slidů.
9. **Export MP4** – český namluvený komentář (Edge TTS), obrázky z reálného PPTX
   (LibreOffice → PDF → PNG) a spojení přes FFmpeg. Délka slidu se řídí délkou
   namluvení.
10. **Administrace** – moduly, texty, komentáře, pevné bloky, reference,
    obchodníci, záloha/import JSON, návrat k demo datům.

### Změny oproti původní prezentaci

- **Výběrová řízení byla odstraněna.**
- **Přidán ODZ** – Osobní dotazník zaměstnance.
- **Přidán JMHZ** – Jednotné měsíční hlášení zaměstnavatelů.
- **Ceny nejsou součástí modulů.** V originální nabídce je cena v samostatném
  XLSX; aplikace to respektuje a souhrnný slide standardně odkazuje na XLSX.
  Ruční částku lze zapnout jen pro speciální případ.
- Vzhled je modernizovaný, ale obsah a struktura vycházejí z originálu.

## Rychlý start

Potřebujete **Node.js 20+**. Pro export videa navíc **LibreOffice**, **FFmpeg**
a `pdftoppm` (Poppler).

```bash
npm install
npm run dev
# http://localhost:5173
```

Produkční režim:

```bash
npm run build
npm start
# http://localhost:8787
```

### Windows

```powershell
winget install OpenJS.NodeJS.LTS
winget install TheDocumentFoundation.LibreOffice
winget install Gyan.FFmpeg
```

`pdftoppm` je součástí Poppleru. Pokud není v PATH:

```powershell
$env:SOFFICE_PATH  = "C:\Program Files\LibreOffice\program\soffice.exe"
$env:FFMPEG_PATH   = "C:\ffmpeg\bin\ffmpeg.exe"
$env:FFPROBE_PATH  = "C:\ffmpeg\bin\ffprobe.exe"
$env:PDFTOPPM_PATH = "C:\poppler\bin\pdftoppm.exe"
```

## Hosting

### Netlify nestačí

Aplikace má Node.js backend a pro video potřebuje LibreOffice a FFmpeg.
Na Netlify by fungoval jen statický náhled – ne export videa, ne ukládání změn.
Stejně tak Vercel.

### Doporučený způsob: Docker

V projektu je `Dockerfile` (Node + LibreOffice + FFmpeg + Poppler) a `render.yaml`.

```bash
docker build -t vema-presenter .
docker run -p 8080:8080 \
  -e APP_PASSWORD=moje-heslo \
  -v vema-data:/data \
  vema-presenter
```

- `APP_PASSWORD` zapne Basic auth (jedno sdílené heslo pro demo).
- `DATA_DIR=/data` je místo, kde leží `content.json`. Na Renderu/Railway je
  potřeba připojit **persistent disk** na `/data`, jinak se změny po restartu
  ztratí.
- Všechny změny obsahu vidí **všichni uživatelé** stejné instance. Není to
  per-user kopie. Když jeden obchodník upraví text, změní se všem.
- Bez přihlášení a rolí je aplikace vhodná jen pro demo. Pro produkci je potřeba
  skutečné přihlašování, role (obchodník/administrátor) a audit exportů.

### Render

1. Nahrajte projekt na GitHub.
2. Render → **New → Blueprint** → vyberte repozitář s `render.yaml`.
3. Nastavte `APP_PASSWORD`.
4. U služby zapněte persistent disk `/data` (u placeného plánu).

Video rendering je náročnější na CPU/RAM; pro pohodlné demo doporučuji alespoň
1 GB RAM. Generování videa u 10 slidů trvá řádově desítky sekund až minuty.

### Railway / Fly.io / firemní server

Stejný Docker image. Připojte volume na `/data`, nastavte `APP_PASSWORD` a
`DATA_DIR=/data`.

## Jak to funguje

```
                    KNIHA OBSAHU (data/content.json)
                     30 modulů · texty · komentáře
                                  │
                    buildDeck(content, konfigurace)
                                  │
             ┌────────────────────┴────────────────────┐
             │                                         │
      NÁHLED V APLIKACI                        GENERÁTOR VÝSTUPŮ
      React + SVG kolo                         │
                                               ├─ PPTX (PptxGenJS + SVG kolo → PNG)
                                               └─ MP4
                                                   PPTX → LibreOffice → PDF → PNG
                                                   → TTS (Edge) → FFmpeg
```

**Jedno místo pravdy.** Náhled, PPTX i video se skládají ze stejného modelu
(`shared/model.js`) a stejného SVG kola (`shared/wheel.js`). Když se změní text
nebo komentář, projeví se ve všech výstupech.

### Proč takto

- **Obsah není AI.** Obchodní nabídka musí obsahovat schválené informace.
  AI používáme jen na převod hotového textu na hlas.
- **Kolo oblastí, ne 30 segmentů.** Při 30 modulech by bylo kolo nepřehledné.
  Kolo vybírá oblast, seznam upřesňuje moduly. Přidání nového modulu nic nerozbije.
- **Ceny mimo moduly.** Odpovídá to originální nabídce i tomu, jak cenu počítá
  Vema (počet uživatelů, varianta provozu, implementace).
- **PPTX přes PptxGenJS.** Prezentace je plně editovatelná v PowerPointu.
- **Video přes LibreOffice + FFmpeg.** Nejde o animovaný marketing, ale o
  namluvenou prezentaci. Remotion dává smysl až pro skutečně animovaná videa.
- **Edge TTS.** Kvalitní české hlasy bez API klíče. Pro produkci je vhodné
  domluvit firemní Azure Speech (a ověřit firemní AI pravidla).

## Ověřené technologie

| Věc | Výsledek |
|---|---|
| Generování PPTX | ✅ 36 slidů (všechny moduly), otevřeno v LibreOffice |
| Kolo jako SVG → PNG v PPTX | ✅ ostré, stejné jako v náhledu |
| Poznámky řečníka | ✅ komentáře jsou v `notesSlides` |
| České TTS | ✅ Vlasta i Antonín, bez API klíče |
| PPTX → PDF → PNG | ✅ 1920×1080 na slide |
| FFmpeg synchronizace | ✅ délka slidu = délka komentáře + pauza |
| Výsledné MP4 | ✅ 1920×1080, H.264 + AAC, ukázka ~192 s / 5,7 MB |
| Uložení obsahu | ✅ JSON, verze, záloha/import |
| Produkční build | ✅ `npm run build && npm start` |
| Basic auth + DATA_DIR | ✅ ověřeno |

Ukázkové výstupy v `samples/`:

- `VEMA-ukazka-nabidka.pptx`
- `VEMA-ukazka-video.mp4`

## Struktura projektu

```
data/
  content.json        knihovna obsahu (editovatelná v aplikaci)
  content.seed.json   výchozí data pro „Vrátit ukázková data“
shared/
  model.js            sestavení decku, ceny, šablony komentářů
  wheel.js            kolo oblastí (náhled = export)
  theme.js            barvy a rozměry
server/
  index.js            Express API, auth, statický frontend
  pptx.js             generátor PPTX
  video.js            pipeline PPTX → PNG → TTS → MP4
  tts.js              Edge TTS
  store.js            ukládání obsahu (DATA_DIR)
src/
  pages/Builder.tsx   4 kroky: zákazník → moduly → souhrn → export
  pages/Admin.tsx     knihovna obsahu
  pages/Help.tsx      vysvětlení, ceny, hosting
  components/         kolo, renderer slidu
public/
  brand/              oficiální logo Vema (bílé i barevné)
  references/         slidy s referencemi podle segmentu
samples/              ukázkové výstupy
Dockerfile            produkční image s LibreOffice a FFmpeg
render.yaml           konfigurace pro Render
```

## Co je zjednodušené

- Data jsou v JSON souboru, ne v databázi. Pro více obchodníků bude potřeba
  server/DB a přihlašování.
- Chybí role a oprávnění (kdo smí měnit obsah, kdo exportovat).
- Vzhled používá oficiální logo a barvy, ale finální fonty a detaily šablony
  je potřeba doladit s Vema.
- Video nemá animace, přechody ani hudbu. Je to čistá namluvená prezentace.
- Není řešené verzování obsahu ani historie exportů.
- TTS závisí na dostupnosti služby Microsoft Edge; pro produkci doporučuji
  firemní Azure Speech.
- Import existujícího PPTX (skládání originálních slidů) není implementovaný.

## Další kroky

1. Ověřit u Vema firemní pravidla pro TTS (Microsoft Edge / Azure).
2. Doplnit konkrétního obchodníka a skutečný XLSX.
3. Rozhodnout, zda obchodníci sdílejí jeden obsah, a doplnit přihlášení/role.
4. Doplnit modul TRO, až budou podklady.
5. Doladit finální fonty a grafické prvky.
6. Nasadit demo (Render/Railway/firemní server) a otestovat na Windows.

## Poznámka k podkladům

- `Seyfor Vema v1.4.pptx` – zdroj modulů, textů, čísel a referenčních slidů.
- `Nabídka VZOR prázdná.docx` – zdroj delších popisů modulů (včetně ODZ a JMHZ)
  a struktury nabídky. Ceny v DOCX jsou ukázkové sazby; aplikace je záměrně
  nebere jako ceny modulů.
