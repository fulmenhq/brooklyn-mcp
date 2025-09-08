# PDF Document Processing - Brooklyn MCP

This guide explains how to use Brooklyn's PDF rendering and text extraction capabilities for document analysis workflows.

## Overview

Brooklyn MCP provides enterprise-grade PDF processing through PDF.js 4.x integration, enabling character-level text extraction and advanced document analysis. The system uses a local HTTP server to serve PDF files and assets, ensuring security and performance.

## Prerequisites

### 1. Asset Setup

Before processing PDFs, download required assets:

```bash
# Download PDF.js 4.8.69 and dependencies
bun run setup:assets

# Or download specific assets
bun scripts/download-assets.ts --asset=pdfjs
```

### 2. Verify Setup

Check that assets are properly installed:

```bash
# Assets should be in ~/.brooklyn/assets/pdfjs/
ls ~/.brooklyn/assets/pdfjs/
# Expected files:
# - pdf.min.mjs (PDF.js library)
# - pdf.worker.min.mjs (PDF.js web worker)
```

## Basic PDF Rendering

### Simple PDF Rendering

```typescript
// Render a PDF file for viewing and analysis
const result = await callTool("render_pdf", {
  pdfPath: "/path/to/document.pdf",
  browserId: "your-browser-id", // Optional: uses default browser if omitted
});

console.log(`PDF rendered at: ${result.viewerUrl}`);
console.log(`Pages: ${result.pageCount}`);
console.log(`Status: ${result.status}`);
```

### Working with Multi-Page Documents

```typescript
// Handle large documents (tested with 43+ page PDFs)
const pdfResult = await callTool("render_pdf", {
  pdfPath: "/Users/analyst/reports/quarterly-analysis-2024.pdf",
});

if (pdfResult.success) {
  console.log(`Successfully loaded ${pdfResult.pageCount} pages`);
  console.log(`Document available at: ${pdfResult.viewerUrl}`);
} else {
  console.error("PDF rendering failed:", pdfResult.error);
}
```

## Text Extraction

Brooklyn provides character-level text extraction using PDF.js 4.x TextLayer API.

### Character-Level Extraction

```typescript
// After PDF is rendered, extract text with precise positioning
const textContent = await callTool("execute_script", {
  script: `
    // Get all text elements with character-level positioning
    const textElements = window.brooklynPdfHelpers.getTextElements();
    const page1Elements = Array.from(textElements)
      .filter(el => el.getAttribute('data-page') === '1');
    
    // Extract character positioning data
    return page1Elements.map(el => ({
      text: el.textContent,
      position: {
        top: el.style.top,
        left: el.style.left
      },
      page: el.getAttribute('data-page')
    }));
  `,
  browserId: browserId,
});

console.log(`Extracted ${textContent.result.length} character elements from page 1`);
```

### Line-Based Text Extraction

```typescript
// Group characters into readable lines
const textLines = await callTool("execute_script", {
  script: `
    // Extract text organized by lines
    const textLines = window.brooklynPdfHelpers.getTextLines(1); // Page 1
    return textLines.map(line => line.textContent).filter(text => text.trim());
  `,
  browserId: browserId,
});

console.log("Document content by lines:");
textLines.result.forEach((line, index) => {
  console.log(`Line ${index + 1}: ${line}`);
});
```

### Full Document Text Extraction

```typescript
// Extract text from all pages
const fullDocument = await callTool("execute_script", {
  script: `
    const allText = [];
    const pageCount = window.pdfMetadata?.pageCount || 1;
    
    for (let page = 1; page <= pageCount; page++) {
      const pageElements = document.querySelectorAll(\`[data-page="\${page}"]\`);
      const pageText = Array.from(pageElements)
        .map(el => el.textContent)
        .join(' ')
        .replace(/\\s+/g, ' ')
        .trim();
      
      if (pageText) {
        allText.push({ page, content: pageText });
      }
    }
    
    return {
      pages: allText,
      totalPages: pageCount,
      wordCount: allText.reduce((count, page) => count + page.content.split(' ').length, 0)
    };
  `,
  browserId: browserId,
});

const doc = fullDocument.result;
console.log(`Document has ${doc.totalPages} pages with ${doc.wordCount} total words`);
```

## Advanced Document Analysis

### Document Structure Detection

```typescript
// Analyze document structure (headers, paragraphs, etc.)
const documentStructure = await callTool("execute_script", {
  script: `
    const textElements = window.brooklynPdfHelpers.getTextElements();
    const analysis = {
      headers: [],
      paragraphs: [],
      metadata: {}
    };
    
    // Group elements by vertical position to detect lines
    const lineGroups = {};
    textElements.forEach(el => {
      const top = el.style.top;
      if (!lineGroups[top]) lineGroups[top] = [];
      lineGroups[top].push({
        text: el.textContent,
        left: parseFloat(el.style.left)
      });
    });
    
    // Sort and combine into readable lines
    const lines = Object.keys(lineGroups)
      .sort((a, b) => parseFloat(a) - parseFloat(b))
      .map(top => {
        const chars = lineGroups[top].sort((a, b) => a.left - b.left);
        return chars.map(c => c.text).join('');
      })
      .filter(line => line.trim());
    
    // Basic structure detection
    analysis.paragraphs = lines.filter(line => line.length > 50); // Likely paragraphs
    analysis.headers = lines.filter(line => 
      line.length < 50 && 
      /^[A-Z][^.!?]*$/.test(line.trim()) // Capitalized, no sentence endings
    );
    
    analysis.metadata = {
      totalLines: lines.length,
      avgLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length
    };
    
    return analysis;
  `,
  browserId: browserId,
});

const structure = documentStructure.result;
console.log("Document Structure Analysis:");
console.log(`- Headers found: ${structure.headers.length}`);
console.log(`- Paragraphs found: ${structure.paragraphs.length}`);
console.log(`- Average line length: ${structure.metadata.avgLineLength.toFixed(1)} characters`);
```

### Table Detection and Extraction

```typescript
// Detect and extract table-like content using positioning
const tableData = await callTool("execute_script", {
  script: `
    const textElements = window.brooklynPdfHelpers.getTextElements();
    
    // Group elements by vertical position (rows)
    const rows = {};
    textElements.forEach(el => {
      const top = Math.round(parseFloat(el.style.top) * 10) / 10; // Round to 0.1%
      if (!rows[top]) rows[top] = [];
      rows[top].push({
        text: el.textContent.trim(),
        left: parseFloat(el.style.left)
      });
    });
    
    // Identify table-like structures (rows with similar column patterns)
    const tableRows = [];
    Object.keys(rows)
      .sort((a, b) => parseFloat(a) - parseFloat(b))
      .forEach(top => {
        const rowElements = rows[top]
          .sort((a, b) => a.left - b.left)
          .filter(el => el.text.length > 0);
        
        // Consider it a potential table row if it has multiple spaced elements
        if (rowElements.length >= 2) {
          const columns = [];
          let currentColumn = '';
          let lastLeft = -1;
          
          rowElements.forEach(el => {
            // If significant gap, start new column
            if (lastLeft >= 0 && (el.left - lastLeft) > 5) {
              if (currentColumn.trim()) columns.push(currentColumn.trim());
              currentColumn = el.text;
            } else {
              currentColumn += (currentColumn ? ' ' : '') + el.text;
            }
            lastLeft = el.left;
          });
          
          if (currentColumn.trim()) columns.push(currentColumn.trim());
          
          if (columns.length >= 2) {
            tableRows.push(columns);
          }
        }
      });
    
    return {
      detectedRows: tableRows,
      rowCount: tableRows.length,
      avgColumnsPerRow: tableRows.length > 0 ? 
        tableRows.reduce((sum, row) => sum + row.length, 0) / tableRows.length : 0
    };
  `,
  browserId: browserId,
});

const tables = tableData.result;
if (tables.rowCount > 0) {
  console.log(`Found ${tables.rowCount} table-like rows`);
  console.log(`Average ${tables.avgColumnsPerRow.toFixed(1)} columns per row`);

  // Display first few rows as example
  tables.detectedRows.slice(0, 3).forEach((row, index) => {
    console.log(`Row ${index + 1}: ${row.join(" | ")}`);
  });
}
```

## Error Handling and Troubleshooting

### Common Issues

#### 1. Assets Not Available

```typescript
// Check if PDF.js assets are available
try {
  const result = await callTool("render_pdf", {
    pdfPath: "/path/to/file.pdf",
  });
} catch (error) {
  if (error.message.includes("PDF.js assets not available")) {
    console.log("Run: bun run setup:assets");
    // Or: bun scripts/download-assets.ts --asset=pdfjs
  }
}
```

#### 2. File Not Found

```typescript
// Validate PDF file before rendering
import { existsSync } from "fs";

const pdfPath = "/path/to/document.pdf";
if (!existsSync(pdfPath)) {
  console.error(`PDF file not found: ${pdfPath}`);
  return;
}

const result = await callTool("render_pdf", { pdfPath });
```

#### 3. Memory Issues with Large Documents

```typescript
// For very large PDFs, process pages incrementally
const pageCount = pdfMetadata.pageCount;
const batchSize = 5; // Process 5 pages at a time

for (let startPage = 1; startPage <= pageCount; startPage += batchSize) {
  const endPage = Math.min(startPage + batchSize - 1, pageCount);

  const batchText = await callTool("execute_script", {
    script: \`
      const batchContent = [];
      for (let page = \${startPage}; page <= \${endPage}; page++) {
        const pageElements = document.querySelectorAll(\`[data-page="\${page}"]\`);
        const pageText = Array.from(pageElements)
          .map(el => el.textContent).join(' ').trim();
        if (pageText) batchContent.push({ page, text: pageText });
      }
      return batchContent;
    \`,
    browserId: browserId
  });

  // Process batch results
  console.log(\`Processed pages \${startPage}-\${endPage}\`);
}
```

## Architecture Details

### Local HTTP Server

Brooklyn uses a local HTTP server to serve PDF files and PDF.js assets:

- **PDF Files**: Served at `/file/{fileId}` with unique file IDs
- **PDF.js Assets**: Served at `/assets/pdf.js/*` from local cache
- **PDF Viewer**: Available at `/viewer/pdf/{viewerId}` with embedded PDF.js integration

### Asset Management

PDF.js assets are managed through a schema-validated system:

```bash
# Assets are stored in:
~/.brooklyn/assets/pdfjs/
├── pdf.min.mjs          # PDF.js 4.8.69 library
└── pdf.worker.min.mjs   # PDF.js web worker

# Asset manifest location:
configs/brooklyn-assets-manifest.yaml

# Asset schema validation:
schemas/brooklyn-assets-v1.yaml
```

### Character-Level Precision

The PDF.js 4.x TextLayer API provides character-level positioning:

- Each character is wrapped in a `<div>` with precise CSS positioning
- Position data includes `top` and `left` percentages for layout analysis
- Characters can be grouped into words, lines, and paragraphs using positioning algorithms

## Performance Considerations

### Document Size Limits

- **Tested Range**: 1-43 pages (proven with complex business documents)
- **Text Elements**: Successfully processed 19,000+ character elements
- **Memory Usage**: ~50MB per PDF in browser memory
- **Loading Time**: 2-5 seconds for typical business documents

### Optimization Tips

1. **Use Local Assets**: Pre-download PDF.js assets for faster loading
2. **Browser Reuse**: Reuse browser instances for multiple PDFs
3. **Incremental Processing**: Process large documents in page batches
4. **Memory Cleanup**: Close browsers when done with document processing

### Concurrent Processing

```typescript
// Process multiple PDFs concurrently (resource-limited)
const pdfPaths = ["/path/to/doc1.pdf", "/path/to/doc2.pdf", "/path/to/doc3.pdf"];
const concurrencyLimit = 3; // Adjust based on available memory

const processPdf = async (pdfPath: string) => {
  const browser = await callTool("launch_browser", { headless: true });
  try {
    const result = await callTool("render_pdf", {
      pdfPath,
      browserId: browser.browserId,
    });
    // Process text extraction...
    return result;
  } finally {
    await callTool("close_browser", { browserId: browser.browserId });
  }
};

// Process with limited concurrency
const results = [];
for (let i = 0; i < pdfPaths.length; i += concurrencyLimit) {
  const batch = pdfPaths.slice(i, i + concurrencyLimit);
  const batchResults = await Promise.all(batch.map(processPdf));
  results.push(...batchResults);
}
```

## Code References

### Core Implementation Files

- **PDF Rendering**: `src/core/browser-pool-manager.ts:1866` - Main render_pdf implementation
- **HTTP Server**: `src/core/utilities/local-http-server.ts` - File serving and PDF viewer
- **Asset Management**: `scripts/download-assets.ts` - Asset download and validation
- **MCP Router**: `src/core/browser/mcp-browser-router.ts` - render_pdf MCP tool routing
- **Configuration**: `src/core/config.ts:298` - Assets path configuration

### Schemas and Configuration

- **Asset Schema**: `schemas/brooklyn-assets-v1.yaml` - Asset manifest validation
- **Asset Manifest**: `configs/brooklyn-assets-manifest.yaml` - PDF.js asset definitions
- **Brooklyn Config**: `schemas/brooklyn-config-v1.yaml` - Server configuration with assets path

### Testing

- **Unit Tests**: `src/core/asset-manager.test.ts`, `src/core/utilities/local-http-server.test.ts`
- **Fixtures**: `tests/fixtures/assets/` - Mock assets and test data
- **Integration**: Ready for real PDF fixtures in `tests/fixtures/pdfs/`

This comprehensive PDF processing system enables advanced document analysis workflows while maintaining enterprise-grade security and performance standards.
