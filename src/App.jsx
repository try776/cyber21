import { useState } from 'react';
import { PDFDocument, PageSizes } from 'pdf-lib';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  const [pageInfo, setPageInfo] = useState({ original: 0, added: 0 });

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
    if (!file) return;

    setProcessing(true);
    setDownloadUrl(null);
    setError(null);
    setPageInfo({ original: 0, added: 0 });

    try {
      // 1. Datei als ArrayBuffer laden
      const arrayBuffer = await file.arrayBuffer();

      // 2. PDF mit pdf-lib laden
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      // 3. Seitenzahl prüfen und benötigte Seiten berechnen
      const originalPageCount = pdfDoc.getPageCount();
      const remainder = originalPageCount % 4;
      const pagesToAdd = remainder === 0 ? 0 : 4 - remainder;
      
      setPageInfo({ original: originalPageCount, added: pagesToAdd });

      // 4. Bestehende Seiten auf A5 Grösse setzen
      // A5-Dimensionen in "points" (1/72 Zoll)
      const a5Width = PageSizes.A5[0];
      const a5Height = PageSizes.A5[1];

      const pages = pdfDoc.getPages();
      pages.forEach(page => {
        // Setzt die "MediaBox" der Seite. 
        // Der Inhalt wird nicht skaliert, aber die Seite selbst hat A5-Masse.
        page.setSize(a5Width, a5Height);
      });

      // 5. Leere A5-Seiten hinzufügen, falls nötig
      for (let i = 0; i < pagesToAdd; i++) {
        pdfDoc.addPage(PageSizes.A5);
      }

      // 6. PDF als Bytes speichern
      const pdfBytes = await pdfDoc.save();

      // 7. Download-URL erstellen
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

    } catch (err) {
      console.error(err);
      setError('Fehler bei der PDF-Verarbeitung. Die Datei ist möglicherweise beschädigt.');
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
        <label htmlFor="file-upload" className="file-label">
          {file ? `Datei: ${file.name}` : 'PDF-Datei auswählen'}
        </label>
        <input 
          id="file-upload"
          type="file" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          disabled={processing}
        />

        <button 
          onClick={handleProcessPDF} 
          disabled={!file || processing}
          style={{ marginTop: '1rem' }}
        >
          {processing ? 'Verarbeite...' : 'PDF verarbeiten'}
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