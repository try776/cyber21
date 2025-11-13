import { useState, useEffect } from 'react';
import './App.css'; // Importiert die separate CSS-Datei

function App() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  const [pageInfo, setPageInfo] = useState({ original: 0, added: 0 });
  
  // Neuer Status, um zu prüfen, ob pdf-lib geladen ist
  const [isPdfLibLoaded, setIsPdfLibLoaded] = useState(false);

  // Effekt zum dynamischen Laden der pdf-lib-Bibliothek von einem CDN
  useEffect(() => {
    const scriptId = 'pdf-lib-script';
    
    // Check if library is already available
    if (window.PDFLib) {
      setIsPdfLibLoaded(true);
      return;
    }

    // Check if script is *already* in the DOM
    let script = document.getElementById(scriptId);
    
    if (!script) {
      // If not, create and append it
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.async = true;
      document.body.appendChild(script);
    }

    // Define the load/error handlers
    const handleLoad = () => {
      setIsPdfLibLoaded(true);
    };
    const handleError = () => {
      setError('Fehler beim Laden der PDF-Bibliothek. Bitte versuche, die Seite neu zu laden.');
    };

    // Add event listeners to the script element
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    // Cleanup function to remove listeners when component unmounts
    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

  }, []); // Leeres Array, damit es nur einmal ausgeführt wird

  /**
   * Wird aufgerufen, wenn der Benutzer eine Datei auswählt.
   */
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    // Reset-Zustand
    setFile(null);
    setDownloadUrl(null);
    setError(null);
    setPageInfo({ original: 0, added: 0 });

    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else if (selectedFile) {
      setError('Bitte wähle eine gültige PDF-Datei aus.');
    }
  };

  /**
   * Verarbeitet das ausgewählte PDF.
   */
  const handleProcessPDF = async () => {
    // Prüfen, ob die Bibliothek geladen ist
    if (!file || !isPdfLibLoaded) return;

    setProcessing(true);
    setDownloadUrl(null);
    setError(null);
    setPageInfo({ original: 0, added: 0 });

    const { PDFDocument, PageSizes } = window.PDFLib;
    
    if (!PDFDocument || !PageSizes) {
        setError('PDF-Bibliothek konnte nicht geladen werden.');
        setProcessing(false);
        return;
    }

    try {
      // 1. Datei als ArrayBuffer laden
      const arrayBuffer = await file.arrayBuffer();

      // 2. Original-PDF mit pdf-lib laden
      // --- START KORREKTUR V4: Verschlüsselung ignorieren ---
      const pdfDoc = await PDFDocument.load(arrayBuffer, { 
        ignoreEncryption: true 
      });
      // --- ENDE KORREKTUR V4 ---

      // --- FORMULAR-SCHRITT (Bleibt wichtig) ---
      const form = pdfDoc.getForm();

      // 2a. Prüfen auf XFA (nicht unterstützt)
      if (form.hasXFA()) {
        setError('Fehler: Die PDF-Datei ist ein XFA-Formular (dynamisch) und wird nicht unterstützt. Bitte drucken Sie sie z.B. über den Browser "als PDF", um sie umzuwandeln.');
        setProcessing(false);
        return; 
      }

      // 2b. Versuchen, AcroForm-Felder flachzudrücken
      try {
        if (form.getFields().length > 0) {
            form.flatten();
        }
      } catch (flattenError) {
        console.error('Fehler beim Flachdrücken des Formulars:', flattenError);
        setError('Fehler: Das PDF-Formular konnte nicht verarbeitet werden. Es ist möglicherweise beschädigt oder enthält nicht unterstützte Feldtypen.');
        setProcessing(false);
        return;
      }
      // --- ENDE FORMULAR-SCHRITT ---

      const originalPages = pdfDoc.getPages();
      const originalPageCount = originalPages.length;

      // 3. Neues PDF-Dokument erstellen
      const newPdfDoc = await PDFDocument.create();

      // 4. Seitenzahl prüfen und benötigte Seiten berechnen
      const remainder = originalPageCount % 4;
      const pagesToAdd = remainder === 0 ? 0 : 4 - remainder;
      
      setPageInfo({ original: originalPageCount, added: pagesToAdd });

      // 5. Bestehende Seiten auf A5 skalieren
      const a5Width = PageSizes.A5[0];
      const a5Height = PageSizes.A5[1];

      // --- START KORREKTUR V3: try...catch pro Seite ---
      // Jede Seite einzeln durchgehen, einbetten und zeichnen
      for (let i = 0; i < originalPageCount; i++) {
        const originalPage = originalPages[i];
        
        // Erstelle *immer* eine neue A5-Seite, um die Reihenfolge beizubehalten
        const newPage = newPdfDoc.addPage(PageSizes.A5);

        try {
          // Versuche, die Seite einzubetten
          const embeddedPage = await newPdfDoc.embedPage(originalPage);

          // Skalierungslogik
          const { width, height } = originalPage.getSize();
          const scale = Math.min(a5Width / width, a5Height / height);
          const scaledWidth = width * scale;
          const scaledHeight = height * scale;
          const x = (a5Width - scaledWidth) / 2;
          const y = (a5Height - scaledHeight) / 2;
          
          // Zeichne die skalierte Originalseite auf die neue A5-Seite
          newPage.drawPage(embeddedPage, {
            x,
            y,
            width: scaledWidth,
            height: scaledHeight,
          });

        } catch (embedError) {
          // Fange den "missing Contents" Fehler (und andere) HIER ab
          console.warn(`Seite ${i + 1} konnte nicht eingebettet werden (wahrscheinlich leer):`, embedError.message);
          // Die 'newPage' bleibt in diesem Fall einfach leer, aber die Schleife läuft weiter.
        }
      }
      // --- ENDE KORREKTUR V3 ---

      // 6. Leere A5-Seiten hinzufügen (wie vorher)
      for (let i = 0; i < pagesToAdd; i++) {
        newPdfDoc.addPage(PageSizes.A5);
      }

      // 7. Neues PDF als Bytes speichern
      const pdfBytes = await newPdfDoc.save();

      // 8. Download-URL erstellen
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

    } catch (err) {
      console.error(err);
      // Dieser Block fängt jetzt nur noch fatale Ladefehler ab
      setError('Fehler bei der PDF-Verarbeitung. Die Datei ist möglicherweise beschädigt oder das Format wird nicht unterstützt.');
    } finally {
      setProcessing(false);
    }
  };


  /**
   * Erzeugt den Dateinamen für den Download.
   */
  const getDownloadName = () => {
    if (!file) return 'document_a5.pdf';
    const originalName = file.name.endsWith('.pdf') 
      ? file.name.slice(0, -4) 
      : file.name;
    return `${originalName}_A5_mod.pdf`;
  };

  return (
    <>
      <h1>PDF A5 Konverter (4er-Seiten)</h1>
      <p>
        Diese App wandelt dein PDF in A5 um und füllt es mit leeren Seiten auf,
        bis die Gesamtseitenzahl durch 4 teilbar ist.
      </p>

      <div className="card">
        {!isPdfLibLoaded && !error && (
            <p><strong>Lade PDF-Bibliothek...</strong></p>
        )}

        <label 
          htmlFor="file-upload" 
          className={`file-label ${!isPdfLibLoaded ? 'disabled-label' : ''}`}
        >
          {file ? `Datei: ${file.name}` : 'PDF-Datei auswählen'}
        </label>
        <input 
          id="file-upload"
          type="file" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          disabled={processing || !isPdfLibLoaded}
        />

        <button 
          onClick={handleProcessPDF} 
          disabled={!file || processing || !isPdfLibLoaded}
          style={{ marginTop: '1rem' }}
        >
          {processing ? 'Verarbeite...' : (isPdfLibLoaded ? 'PDF verarbeiten' : 'Lade...')}
        </button>

        {error && <p className="error-message">{error}</p>}

        {pageInfo.original > 0 && !processing && (
          <div className="info-box">
            <p>Originalseiten: {pageInfo.original}</p>
            <p>Hinzugefügte Seiten: {pageInfo.added}</p>
            <p><b>Gesamtseiten: {pageInfo.original + pageInfo.added}</b></p>
          </div>
        )}

        {downloadUrl && (
          <div className="download-section">
            <p><strong>Verarbeitung abgeschlossen!</strong></p>
            <a 
              href={downloadUrl} 
              download={getDownloadName()}
              className="download-button"
            >
              Bearbeitetes PDF herunterladen
            </a>
          </div>
        )}
      </div>
    </>
  );
}

export default App;